using System.Runtime.InteropServices;

namespace PcLockAgent;

/// <summary>
/// Pulls the biggest icon a program has out of it.
/// </summary>
/// <remarks>
/// <c>Icon.ExtractAssociatedIcon</c>, which this replaces, always returns 32×32
/// whatever the file actually contains. Blown up to fill a 96 pixel tile that is
/// a blurred smear, which is what "some icons are not visible" was — they were
/// there, at three times their real size.
/// <para>
/// Nearly every game ships a 256×256 icon; Windows has required one since Vista
/// for exactly this reason. <c>PrivateExtractIcons</c> asks for a specific size
/// and gives the closest the file holds, so asking for 256 gets the real thing
/// where it exists and the best available where it does not.
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
    /// and Windows scaling it badly looks the same as us scaling it badly. Taking
    /// the largest it genuinely has and letting the tile scale once is sharper.
    /// </remarks>
    private static readonly int[] PreferredSizes = { 256, 128, 64, 48, 32 };

    /// <summary>The largest icon in a file, or null if it has none.</summary>
    public static Image? Extract(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        foreach (var size in PreferredSizes)
        {
            var image = TryExtract(path, size);
            if (image is not null)
            {
                return image;
            }
        }

        // Last resort, and the only one that used to be here. Small, but a small
        // icon beats a blank square.
        try
        {
            using var icon = Icon.ExtractAssociatedIcon(path);
            return icon?.ToBitmap();
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"No icon at all in {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    private static Image? TryExtract(string path, int size)
    {
        var handles = new IntPtr[1];
        var ids = new int[1];

        try
        {
            var count = PrivateExtractIcons(path, 0, size, size, handles, ids, 1, 0);

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
}
