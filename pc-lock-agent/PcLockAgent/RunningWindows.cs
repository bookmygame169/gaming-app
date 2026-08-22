using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace PcLockAgent;

/// <summary>One open window, as the taskbar strip needs to show it.</summary>
internal sealed record RunningWindow(
    IntPtr Handle,
    int ProcessId,
    string ProcessName,
    string Title);

/// <summary>
/// The list of things the customer currently has open.
/// </summary>
/// <remarks>
/// Windows' own taskbar is hidden for the whole of a session, which is
/// deliberate — it is a way out to the desktop. The cost is that a customer has
/// no way to see that a game is loading behind the menu, no way to reach a
/// launcher that opened behind something else, and no way to close anything
/// without finding its own quit button.
/// <para>
/// This answers the same question the taskbar answers, without being a way out:
/// only windows are listed, never drives, folders or the desktop itself.
/// </para>
/// </remarks>
internal static class RunningWindows
{
    /// <summary>
    /// Windows belonging to the shell rather than to anything a customer opened.
    /// </summary>
    private static readonly HashSet<string> ShellClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Progman",          // the desktop
        "WorkerW",          // the layer the wallpaper lives on
        "Shell_TrayWnd",    // the taskbar
        "Shell_SecondaryTrayWnd",
        "Button",           // the old Start button
        "DV2ControlHost",   // the Start menu
        "MsgrIMEWindowClass",
        "SysShadow",
        "Windows.UI.Core.CoreWindow",
    };

    /// <summary>
    /// Icons already extracted, keyed by process name.
    /// </summary>
    /// <remarks>
    /// The strip re-reads the window list about once a second. Pulling an icon
    /// out of an executable every time would be wasted work on every tick, and
    /// this list barely changes between them.
    /// </remarks>
    private static readonly Dictionary<string, Image?> IconCache = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Every window a person would expect to find on a taskbar.
    /// </summary>
    /// <remarks>
    /// These are the shell's own rules, and they matter more than they look.
    /// Dropping any one of them fills the strip with things that are not
    /// applications: every invisible helper window, every tooltip host, and —
    /// through the cloaking check — one dead entry for every Store app that has
    /// ever run, because Windows keeps those windows alive and merely hides
    /// them.
    /// </remarks>
    public static IReadOnlyList<RunningWindow> List()
    {
        var found = new List<RunningWindow>();
        var self = Environment.ProcessId;

        try
        {
            NativeMethods.EnumWindows((hwnd, _) =>
            {
                try
                {
                    if (!IsTaskbarWorthy(hwnd, self, out var processId, out var title))
                    {
                        return true;
                    }

                    found.Add(new RunningWindow(hwnd, processId, ProcessNameOf(processId), title));
                }
                catch
                {
                    // One bad window must not stop the strip listing the rest.
                }

                return true;
            }, IntPtr.Zero);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not list open windows: {ex.Message}");
        }

        return found;
    }

    private static bool IsTaskbarWorthy(IntPtr hwnd, int selfProcessId, out int processId, out string title)
    {
        processId = 0;
        title = string.Empty;

        if (!NativeMethods.IsWindowVisible(hwnd))
        {
            return false;
        }

        NativeMethods.GetWindowThreadProcessId(hwnd, out uint pid);
        if (pid == 0 || (int)pid == selfProcessId)
        {
            return false;
        }

        processId = (int)pid;

        var exStyle = (long)NativeMethods.GetWindowLongPtr(hwnd, NativeMethods.GWL_EXSTYLE);

        // A tool window is a palette or a helper. It is never the thing someone
        // means when they say an app is open.
        if ((exStyle & NativeMethods.WS_EX_TOOLWINDOW) != 0)
        {
            return false;
        }

        // Owned windows are dialogs belonging to something already listed,
        // unless the app has explicitly asked for its own button.
        if (NativeMethods.GetWindow(hwnd, NativeMethods.GW_OWNER) != IntPtr.Zero
            && (exStyle & NativeMethods.WS_EX_APPWINDOW) == 0)
        {
            return false;
        }

        // Cloaked windows are visible as far as IsWindowVisible is concerned and
        // are not on screen at all. Store apps leave these behind by the dozen.
        if (IsCloaked(hwnd))
        {
            return false;
        }

        var className = new StringBuilder(256);
        if (NativeMethods.GetClassName(hwnd, className, className.Capacity) > 0
            && ShellClasses.Contains(className.ToString()))
        {
            return false;
        }

        var length = NativeMethods.GetWindowTextLength(hwnd);
        if (length <= 0)
        {
            return false;
        }

        var text = new StringBuilder(length + 1);
        NativeMethods.GetWindowText(hwnd, text, text.Capacity);

        title = text.ToString().Trim();
        return title.Length > 0;
    }

    private static bool IsCloaked(IntPtr hwnd)
    {
        try
        {
            var result = NativeMethods.DwmGetWindowAttribute(
                hwnd,
                NativeMethods.DWMWA_CLOAKED,
                out int cloaked,
                sizeof(int));

            return result == 0 && cloaked != 0;
        }
        catch (DllNotFoundException)
        {
            // No desktop composition. Nothing can be cloaked.
            return false;
        }
    }

    private static string ProcessNameOf(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            return process.ProcessName;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    /// <summary>Brings a window to the front, restoring it if it is minimised.</summary>
    public static bool Activate(RunningWindow window) => GameWindowFocus.TryBringToFront(window.Handle);

    /// <summary>
    /// Asks a window to close, and ends its process if it will not.
    /// </summary>
    /// <remarks>
    /// WM_CLOSE first, because that is the same thing as clicking the X: a game
    /// gets to save, and an app with unsaved work gets to ask. Posted rather
    /// than sent, so a game busy loading cannot block the menu that asked.
    /// <para>
    /// The forced kill exists because a customer clicking close on this strip
    /// has no other way to end something — the real taskbar and Task Manager are
    /// both gone. A window that ignores WM_CLOSE would otherwise be permanent
    /// for the rest of their session.
    /// </para>
    /// </remarks>
    public static void Close(RunningWindow window)
    {
        var handle = window.Handle;
        var processId = window.ProcessId;
        var label = string.IsNullOrWhiteSpace(window.Title) ? window.ProcessName : window.Title;

        AgentLog.Info($"Customer closed '{label}' from the taskbar.");
        NativeMethods.PostMessage(handle, NativeMethods.WM_CLOSE, IntPtr.Zero, IntPtr.Zero);

        _ = Task.Run(async () =>
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(6)).ConfigureAwait(false);

                using var process = Process.GetProcessById(processId);
                if (process.HasExited)
                {
                    return;
                }

                // Still there and still showing something. Anything that has put
                // its windows away is on its way out and is left alone.
                if (!NativeMethods.IsWindow(handle) || !NativeMethods.IsWindowVisible(handle))
                {
                    return;
                }

                AgentLog.Warn($"'{label}' ignored the close request; ending it.");
                process.Kill(entireProcessTree: true);
            }
            catch (ArgumentException)
            {
                // Process already gone, which is the outcome we wanted.
            }
            catch (Exception ex)
            {
                AgentLog.Warn($"Could not close '{label}': {ex.Message}");
            }
        });
    }

    /// <summary>
    /// The icon to show for a window.
    /// </summary>
    /// <remarks>
    /// Asked of the window first and its executable second. The window knows
    /// best — a Steam game launched through steam.exe would otherwise show the
    /// Steam logo — but plenty of games never set one, and a strip of identical
    /// blank squares is no use for picking out the one you want.
    /// </remarks>
    public static Image? IconFor(RunningWindow window)
    {
        var fromWindow = FromWindow(window.Handle);
        if (fromWindow is not null)
        {
            return fromWindow;
        }

        if (string.IsNullOrWhiteSpace(window.ProcessName))
        {
            return null;
        }

        // Copied on the way out, never handed over. The caller owns what it is
        // given and disposes it with its button; returning the cached instance
        // would leave the next window with a disposed image.
        if (IconCache.TryGetValue(window.ProcessName, out var cached))
        {
            return Copy(cached);
        }

        Image? icon = null;

        try
        {
            using var process = Process.GetProcessById(window.ProcessId);
            var path = process.MainModule?.FileName;
            if (!string.IsNullOrWhiteSpace(path))
            {
                icon = GameIcons.Extract(path);
            }
        }
        catch (Exception)
        {
            // A 64-bit agent cannot read every process's module list, and some
            // are protected outright. No icon is a fine answer.
        }

        IconCache[window.ProcessName] = icon;
        return Copy(icon);
    }

    private static Image? Copy(Image? image)
    {
        try
        {
            return image is null ? null : (Image)image.Clone();
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static Image? FromWindow(IntPtr hwnd)
    {
        // SendMessageTimeout, never SendMessage: a game that is loading does not
        // pump messages, and a plain send would hang the menu until it did.
        // Two kinds, not three, and a shorter wait. This runs against every
        // open window on the machine, and a game or an anti-cheat that is busy
        // starting up does not answer at all - so the timeout is paid in full,
        // per window, per attempt.
        foreach (var kind in new[] { NativeMethods.ICON_BIG, NativeMethods.ICON_SMALL2 })
        {
            var sent = NativeMethods.SendMessageTimeout(
                hwnd,
                NativeMethods.WM_GETICON,
                new IntPtr(kind),
                IntPtr.Zero,
                NativeMethods.SMTO_ABORTIFHUNG,
                60,
                out var handle);

            if (sent != IntPtr.Zero && handle != IntPtr.Zero)
            {
                var image = FromIconHandle(handle);
                if (image is not null)
                {
                    return image;
                }
            }
        }

        foreach (var index in new[] { NativeMethods.GCLP_HICON, NativeMethods.GCLP_HICONSM })
        {
            var handle = NativeMethods.GetClassLongPtr(hwnd, index);
            if (handle != IntPtr.Zero)
            {
                var image = FromIconHandle(handle);
                if (image is not null)
                {
                    return image;
                }
            }
        }

        return null;
    }

    private static Image? FromIconHandle(IntPtr handle)
    {
        try
        {
            // Cloned before the bitmap is taken. The handle belongs to the other
            // application, and it is free to destroy it the moment that window
            // closes — which would leave this strip drawing freed memory.
            using var icon = Icon.FromHandle(handle);
            using var owned = (Icon)icon.Clone();
            return owned.ToBitmap();
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static class NativeMethods
    {
        public const int GWL_EXSTYLE = -20;
        public const long WS_EX_TOOLWINDOW = 0x00000080;
        public const long WS_EX_APPWINDOW = 0x00040000;
        public const int GW_OWNER = 4;
        public const int DWMWA_CLOAKED = 14;
        public const uint WM_CLOSE = 0x0010;
        public const uint WM_GETICON = 0x007F;
        public const int ICON_SMALL = 0;
        public const int ICON_BIG = 1;
        public const int ICON_SMALL2 = 2;
        public const int GCLP_HICON = -14;
        public const int GCLP_HICONSM = -34;
        public const uint SMTO_ABORTIFHUNG = 0x0002;

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
        public static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll", EntryPoint = "GetClassLongPtrW")]
        public static extern IntPtr GetClassLongPtr(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, int uCmd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint msg,
            IntPtr wParam,
            IntPtr lParam,
            uint flags,
            uint timeoutMilliseconds,
            out IntPtr result);

        [DllImport("dwmapi.dll")]
        public static extern int DwmGetWindowAttribute(
            IntPtr hWnd,
            int attribute,
            out int value,
            int size);
    }
}
