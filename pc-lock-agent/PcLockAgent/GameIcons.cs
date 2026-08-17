using System.Runtime.InteropServices;

namespace PcLockAgent;

/// <summary>
/// Gets the icon Windows itself would draw for a program.
/// </summary>
/// <remarks>
/// Most tiles on the menu are shortcuts — the machine-wide list is built by
/// copying <c>.lnk</c> files into ProgramData so the locked account can reach
/// games installed under the administrator's profile. That matters here because
/// a <c>.lnk</c> holds no icon of its own.
/// <para>
/// <c>PrivateExtractIcons</c> reads a file looking for icon resources. Handed a
/// shortcut it does not follow it; it reads the shortcut's own bytes, finds
/// nothing, and the fallback then returns the generic document-with-an-arrow
/// that Windows uses for "some file". That is why a desktop full of correct
/// icons became a menu full of identical grey pages: the shortcuts were never
/// resolved.
/// </para>
/// <para>
/// So resolution comes first, and there are three places an icon can be. A
/// shortcut may name one explicitly (Steam and Epic both do, pointing at an
/// icon they downloaded); otherwise the target executable has one; and a
/// Microsoft Store or Xbox game has neither, because its icon lives in an app
/// manifest that only the shell can read. The last of those is why the shell is
/// asked as well, rather than only as a fallback for failure.
/// </para>
/// </remarks>
internal static class GameIcons
{
    /// <summary>
    /// Sizes to ask for, largest first.
    /// </summary>
    /// <remarks>
    /// Stepping down rather than asking once for 256, because a file holding
    /// only a 48 pixel icon answers a request for 256 by scaling it up itself —
    /// and Windows scaling it badly looks the same as us scaling it badly.
    /// Taking the largest it genuinely has and letting the tile scale once is
    /// sharper.
    /// </remarks>
    private static readonly int[] PreferredSizes = { 256, 128, 64, 48, 32 };

    /// <summary>The best icon available for this path, or null if there is none.</summary>
    public static Image? Extract(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        // A Store or Xbox game is not a file at all — it is an entry in the
        // shell's app list — so nothing that opens a path can draw it.
        if (path.StartsWith("shell:AppsFolder", StringComparison.OrdinalIgnoreCase))
        {
            return FromShellItem(path);
        }

        // A shortcut is a pointer, not a picture. Follow it before looking for
        // pixels, or every shortcut on the menu wears the same grey page.
        if (IsShortcut(path))
        {
            return FromShortcut(path);
        }

        return FromFile(path) ?? FromShell(path);
    }

    private static bool IsShortcut(string path) =>
        path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
        || path.EndsWith(".url", StringComparison.OrdinalIgnoreCase);

    /// <summary>Follows a shortcut to wherever its icon actually is.</summary>
    private static Image? FromShortcut(string shortcut)
    {
        if (!File.Exists(shortcut))
        {
            return null;
        }

        var (iconFile, iconIndex, target) = ReadShortcut(shortcut);

        // 1. The icon the shortcut names. Steam and Epic both set this, and it
        //    is the game's real artwork rather than the launcher's logo.
        if (!string.IsNullOrWhiteSpace(iconFile) && File.Exists(iconFile))
        {
            var named = FromFile(iconFile, iconIndex);
            if (named is not null)
            {
                return named;
            }
        }

        // 2. The program it points at.
        if (!string.IsNullOrWhiteSpace(target) && File.Exists(target))
        {
            var fromTarget = FromFile(target);
            if (fromTarget is not null)
            {
                return fromTarget;
            }
        }

        // 3. Ask the shell about the shortcut itself. This is the only thing
        //    that answers for a Store or Xbox game, whose icon is in an app
        //    manifest under WindowsApps that nothing else here can read.
        return FromShell(shortcut);
    }

    /// <summary>
    /// The shortcut's icon location, its index, and its target.
    /// </summary>
    private static (string? IconFile, int IconIndex, string? Target) ReadShortcut(string path) =>
        path.EndsWith(".url", StringComparison.OrdinalIgnoreCase)
            ? ReadUrlShortcut(path)
            : ReadLinkShortcut(path);

    /// <summary>
    /// Reads a .url shortcut as the text file it is.
    /// </summary>
    /// <remarks>
    /// This is how Steam writes every desktop shortcut it creates, and it is
    /// why most of a café's menu was grey pages while its desktop looked fine.
    /// <para>
    /// A .url is an INI file naming the icon outright:
    /// </para>
    /// <code>
    /// [InternetShortcut]
    /// URL=steam://rungameid/730
    /// IconFile=C:\Program Files (x86)\Steam\steam\games\abc123.ico
    /// IconIndex=0
    /// </code>
    /// <para>
    /// WScript.Shell was being used for these too, and for a .url it hands back
    /// a different object — one with no IconLocation at all. Asking for it threw,
    /// the catch discarded the target that had already been read successfully,
    /// and every Steam game came back with nothing to draw. The answer was
    /// sitting in the file in plain text the whole time.
    /// </para>
    /// </remarks>
    private static (string? IconFile, int IconIndex, string? Target) ReadUrlShortcut(string path)
    {
        string? iconFile = null;
        string? target = null;
        var iconIndex = 0;

        try
        {
            foreach (var line in File.ReadLines(path))
            {
                if (line.StartsWith("IconFile=", StringComparison.OrdinalIgnoreCase))
                {
                    iconFile = line[9..].Trim();
                }
                else if (line.StartsWith("IconIndex=", StringComparison.OrdinalIgnoreCase))
                {
                    _ = int.TryParse(line[10..].Trim(), out iconIndex);
                }
                else if (line.StartsWith("URL=", StringComparison.OrdinalIgnoreCase))
                {
                    target = line[4..].Trim();
                }
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read {Path.GetFileName(path)}: {ex.Message}");
        }

        return (string.IsNullOrWhiteSpace(iconFile) ? null : iconFile, iconIndex, target);
    }

    /// <summary>
    /// Reads a .lnk shortcut through the shell.
    /// </summary>
    /// <remarks>
    /// Each property is read on its own. Reading them together meant one
    /// unsupported property threw and took the others with it, discarding
    /// answers that had already been found.
    /// <para>
    /// IconLocation comes back as "path,index" — the index matters because a
    /// shortcut into a multi-icon DLL that ignored it would show whichever icon
    /// happened to be first.
    /// </para>
    /// </remarks>
    private static (string? IconFile, int IconIndex, string? Target) ReadLinkShortcut(string path)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null)
        {
            return (null, 0, null);
        }

        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            if (shell is null)
            {
                return (null, 0, null);
            }

            var link = shellType.InvokeMember(
                "CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { path });

            if (link is null)
            {
                return (null, 0, null);
            }

            // Independently, so one property this shortcut type does not carry
            // cannot discard the ones that were read successfully.
            string? Read(string property)
            {
                try
                {
                    return link.GetType().InvokeMember(
                        property, System.Reflection.BindingFlags.GetProperty, null, link, null) as string;
                }
                catch
                {
                    return null;
                }
            }

            var target = Read("TargetPath");
            var location = Read("IconLocation");

            var iconFile = location;
            var iconIndex = 0;

            if (!string.IsNullOrWhiteSpace(location))
            {
                var comma = location.LastIndexOf(',');
                if (comma > 0)
                {
                    iconFile = location[..comma];
                    _ = int.TryParse(location[(comma + 1)..], out iconIndex);
                }
            }

            // ",0" with nothing before it means "no icon set", not a file.
            if (string.IsNullOrWhiteSpace(iconFile))
            {
                iconFile = null;
            }

            return (iconFile, iconIndex, target);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read the shortcut {Path.GetFileName(path)}: {ex.Message}");
            return (null, 0, null);
        }
        finally
        {
            if (shell is not null && Marshal.IsComObject(shell))
            {
                Marshal.ReleaseComObject(shell);
            }
        }
    }

    /// <summary>The largest icon held inside a file.</summary>
    private static Image? FromFile(string path, int index = 0)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        foreach (var size in PreferredSizes)
        {
            var image = TryExtract(path, index, size);
            if (image is not null)
            {
                return image;
            }
        }

        return null;
    }

    private static Image? TryExtract(string path, int index, int size)
    {
        var handles = new IntPtr[1];
        var ids = new int[1];

        try
        {
            var count = PrivateExtractIcons(path, index, size, size, handles, ids, 1, 0);

            if (count <= 0 || handles[0] == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                using var icon = Icon.FromHandle(handles[0]);

                // Copied into a bitmap before the handle goes. Icon.FromHandle
                // does not own what it wraps, so anything drawn from it after
                // DestroyIcon is a use-after-free that shows up as a blank tile
                // or a crash, depending on the day.
                return new Bitmap(icon.ToBitmap());
            }
            finally
            {
                DestroyIcon(handles[0]);
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read a {size}px icon from {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // The shell
    // -----------------------------------------------------------------------

    /// <summary>
    /// The icon Explorer would draw, at the largest size it keeps.
    /// </summary>
    /// <remarks>
    /// The system image list holds a 256 pixel copy of every icon it has drawn,
    /// which is where Explorer gets the large icons in its own views. Asking it
    /// is the only way to get artwork for a Store or Xbox game, and it resolves
    /// shortcuts on the way.
    /// <para>
    /// Falls back to the plain 32 pixel large icon if the image list cannot be
    /// reached, since a small correct icon still beats a grey page.
    /// </para>
    /// </remarks>
    private static Image? FromShell(string path)
    {
        var info = new SHFILEINFO();

        try
        {
            // SysIconIndex rather than Icon: this asks where the icon is in the
            // system list rather than for a copy at Windows' default size.
            var result = SHGetFileInfo(
                path, 0, ref info, (uint)Marshal.SizeOf<SHFILEINFO>(), SHGFI_SYSICONINDEX);

            if (result != IntPtr.Zero)
            {
                var jumbo = FromImageList(info.iIcon, SHIL_JUMBO)
                            ?? FromImageList(info.iIcon, SHIL_EXTRALARGE);

                if (jumbo is not null)
                {
                    return jumbo;
                }
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not reach the system icon list for {Path.GetFileName(path)}: {ex.Message}");
        }

        // Plain shell icon. Small, but resolved correctly.
        var small = new SHFILEINFO();
        try
        {
            if (SHGetFileInfo(path, 0, ref small, (uint)Marshal.SizeOf<SHFILEINFO>(), SHGFI_ICON | SHGFI_LARGEICON)
                == IntPtr.Zero || small.hIcon == IntPtr.Zero)
            {
                return null;
            }

            try
            {
                using var icon = Icon.FromHandle(small.hIcon);
                return new Bitmap(icon.ToBitmap());
            }
            finally
            {
                DestroyIcon(small.hIcon);
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"No icon at all for {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// The tile artwork Windows holds for a packaged app.
    /// </summary>
    /// <remarks>
    /// This is the Start Menu's own artwork, taken at 256 pixels — a Game Pass
    /// title's logo lives inside its package under WindowsApps, which the
    /// customer account is not allowed to read, so asking the shell for a
    /// picture is the only way to get it.
    /// </remarks>
    private static Image? FromShellItem(string parsingName)
    {
        var factoryId = typeof(IShellItemImageFactory).GUID;
        var bitmap = IntPtr.Zero;

        try
        {
            if (SHCreateItemFromParsingName(parsingName, IntPtr.Zero, ref factoryId, out var factory) != 0
                || factory is null)
            {
                return null;
            }

            try
            {
                var size = new SIZE { cx = 256, cy = 256 };

                // ResizeToFit rather than IconOnly: a Game Pass title has real
                // cover art, and asking for the icon gets a shrunken copy of it
                // with a Store badge in the corner.
                if (factory.GetImage(size, SIIGBF_RESIZETOFIT, out bitmap) != 0 || bitmap == IntPtr.Zero)
                {
                    return null;
                }

                // Copied, because the handle is freed below and the Bitmap this
                // returns does not own the pixels behind it.
                using var fromHandle = Image.FromHbitmap(bitmap);
                return new Bitmap(fromHandle);
            }
            finally
            {
                if (bitmap != IntPtr.Zero)
                {
                    DeleteObject(bitmap);
                }

                Marshal.ReleaseComObject(factory);
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"No artwork for {parsingName}: {ex.Message}");
            return null;
        }
    }

    private static Image? FromImageList(int index, int listSize)
    {
        var handle = IntPtr.Zero;

        try
        {
            if (SHGetImageList(listSize, IID_IImageList, out var list) != 0 || list is null)
            {
                return null;
            }

            try
            {
                if (list.GetIcon(index, ILD_TRANSPARENT, ref handle) != 0 || handle == IntPtr.Zero)
                {
                    return null;
                }

                using var icon = Icon.FromHandle(handle);
                return new Bitmap(icon.ToBitmap());
            }
            finally
            {
                if (handle != IntPtr.Zero)
                {
                    DestroyIcon(handle);
                }

                Marshal.ReleaseComObject(list);
            }
        }
        catch
        {
            // Undocumented territory. A failure here is not worth a log line
            // per tile — the caller has a working fallback.
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Interop
    // -----------------------------------------------------------------------

    private const uint SHGFI_ICON = 0x000000100;
    private const uint SHGFI_LARGEICON = 0x000000000;
    private const uint SHGFI_SYSICONINDEX = 0x000004000;

    private const int SHIL_EXTRALARGE = 0x2;
    private const int SHIL_JUMBO = 0x4;
    private const int ILD_TRANSPARENT = 0x1;

    private static readonly Guid IID_IImageList = new("46EB5926-582E-4017-9FDF-E8998DAA0950");

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    /// <summary>
    /// The shell's own icon lookup. Resolves shortcuts and Store apps.
    /// </summary>
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr SHGetFileInfo(
        string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("shell32.dll", EntryPoint = "#727")]
    private static extern int SHGetImageList(
        int iImageList, in Guid riid, [MarshalAs(UnmanagedType.Interface)] out IImageList? ppv);

    /// <summary>
    /// Enough of IImageList to reach GetIcon.
    /// </summary>
    /// <remarks>
    /// Every method before the one being called has to be declared, and in
    /// order, because a COM interface is a table of function pointers and the
    /// position is the whole address. The ones that are never called take
    /// IntPtr where the real signature takes a struct — the slot is what
    /// matters, not the shape of an argument nothing passes.
    /// </remarks>
    [ComImport]
    [Guid("46EB5926-582E-4017-9FDF-E8998DAA0950")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IImageList
    {
        [PreserveSig] int Add(IntPtr hbmImage, IntPtr hbmMask, ref int pi);
        [PreserveSig] int ReplaceIcon(int i, IntPtr hicon, ref int pi);
        [PreserveSig] int SetOverlayImage(int iImage, int iOverlay);
        [PreserveSig] int Replace(int i, IntPtr hbmImage, IntPtr hbmMask);
        [PreserveSig] int AddMasked(IntPtr hbmImage, int crMask, ref int pi);
        [PreserveSig] int Draw(IntPtr pimldp);
        [PreserveSig] int Remove(int i);
        [PreserveSig] int GetIcon(int i, int flags, ref IntPtr picon);
    }

    /// <summary>
    /// Asks for icons at a size of our choosing.
    /// </summary>
    /// <remarks>
    /// Undocumented in the sense that Microsoft never promised it, and entirely
    /// stable in the sense that File Explorer has drawn every icon on Windows
    /// with it for twenty years. The documented alternatives either fix the size
    /// at 32 or require driving IImageList through COM for the same answer.
    /// </remarks>
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int PrivateExtractIcons(
        string lpszFile,
        int nIconIndex,
        int cxIcon,
        int cyIcon,
        IntPtr[] phicon,
        int[] piconid,
        int nIcons,
        int flags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("gdi32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DeleteObject(IntPtr hObject);

    /// <summary>Scale the image to fit the size asked for.</summary>
    private const int SIIGBF_RESIZETOFIT = 0x00000000;

    [StructLayout(LayoutKind.Sequential)]
    private struct SIZE
    {
        public int cx;
        public int cy;
    }

    /// <summary>
    /// Asks the shell for a picture of anything it can name, including a
    /// packaged app that has no path on disk.
    /// </summary>
    [ComImport]
    [Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItemImageFactory
    {
        [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr phbm);
    }

    // PreserveSig so the HRESULT comes back as a value to check rather than as
    // an exception — a Store app that has been uninstalled between the scan and
    // the draw is an ordinary miss, not something worth throwing over.
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHCreateItemFromParsingName(
        string pszPath,
        IntPtr pbc,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory? ppv);
}
