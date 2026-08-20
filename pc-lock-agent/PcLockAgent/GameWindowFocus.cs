using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PcLockAgent;

/// <summary>
/// Brings a running game's window back to the foreground without Alt+Tab or the taskbar.
/// </summary>
internal static class GameWindowFocus
{
    public static bool IsProcessForeground(string? processNameWithoutExtension)
    {
        if (string.IsNullOrWhiteSpace(processNameWithoutExtension))
        {
            return false;
        }

        var foreground = NativeMethods.GetForegroundWindow();
        if (foreground == IntPtr.Zero)
        {
            return false;
        }

        NativeMethods.GetWindowThreadProcessId(foreground, out uint processId);
        if (processId == 0)
        {
            return false;
        }

        try
        {
            using var process = Process.GetProcessById((int)processId);
            return string.Equals(
                process.ProcessName,
                processNameWithoutExtension,
                StringComparison.OrdinalIgnoreCase);
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    /// <summary>
    /// Whether the Windows desktop itself is what is in front.
    /// </summary>
    /// <remarks>
    /// This is the question the cover actually needs answered, and asking a
    /// different one is what put the menu on top of a customer's launcher.
    /// <para>
    /// The menu used to re-cover the screen whenever the watched game was not
    /// foreground. Starting Valorant runs the Riot Client, which is not the
    /// watched process, so the menu decided nothing useful was on screen and
    /// drew itself over the launcher the customer had to sign in to. Every
    /// launcher, updater, installer and crash dialog would have done the same.
    /// <para>
    /// So the rule is now what it should always have been: cover the screen
    /// only when the thing in front is the desktop. Anything else is something
    /// the customer is looking at, whether or not it is the game.
    /// </para>
    /// </para>
    /// </remarks>
    public static bool IsDesktopForeground()
    {
        try
        {
            var foreground = NativeMethods.GetForegroundWindow();

            // Nothing focused at all. Windows does this between a window
            // closing and the next one being raised, so the desktop is what a
            // person is looking at.
            if (foreground == IntPtr.Zero)
            {
                return true;
            }

            var className = new System.Text.StringBuilder(256);
            if (NativeMethods.GetClassName(foreground, className, className.Capacity) == 0)
            {
                // Cannot tell. Leave whatever is there alone rather than cover
                // something the customer may be using.
                return false;
            }

            var name = className.ToString();

            // Progman is the desktop; WorkerW is the layer wallpaper lives on
            // and is what holds focus after Show Desktop; Shell_TrayWnd is the
            // taskbar, which is covered but can still take focus.
            return name is "Progman" or "WorkerW" or "Shell_TrayWnd";
        }
        catch
        {
            return false;
        }
    }

    public static bool IsAnyProcessForeground(IEnumerable<string?> processNames)
    {
        foreach (var name in processNames)
        {
            if (IsProcessForeground(name))
            {
                return true;
            }
        }

        return false;
    }

  /// <summary>
  /// Finds the best visible top-level window owned by one of the named processes.
  /// </summary>
    public static IntPtr FindBestWindow(IEnumerable<string?> processNames)
    {
        foreach (var name in processNames)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var hwnd = FindBestWindowForProcessName(name);
            if (hwnd != IntPtr.Zero)
            {
                return hwnd;
            }
        }

        return IntPtr.Zero;
    }

    public static bool TryBringToFront(IEnumerable<string?> processNames)
    {
        var hwnd = FindBestWindow(processNames);
        if (hwnd == IntPtr.Zero)
        {
            return false;
        }

        return TrySetForeground(hwnd);
    }

    /// <summary>Brings one known window to the front, restoring it if minimised.</summary>
    public static bool TryBringToFront(IntPtr hwnd)
        => hwnd != IntPtr.Zero && TrySetForeground(hwnd);

    private static IntPtr FindBestWindowForProcessName(string processName)
    {
        var processes = Process.GetProcessesByName(processName);
        try
        {
            foreach (var process in processes)
            {
                try
                {
                    var main = process.MainWindowHandle;
                    if (main != IntPtr.Zero && NativeMethods.IsWindowVisible(main))
                    {
                        return main;
                    }
                }
                catch (InvalidOperationException)
                {
                    // Process exited while we were looking.
                }
            }

            foreach (var process in processes)
            {
                try
                {
                    var hwnd = FindVisibleTopLevelWindow((uint)process.Id);
                    if (hwnd != IntPtr.Zero)
                    {
                        return hwnd;
                    }
                }
                catch (InvalidOperationException)
                {
                    // Process exited while we were looking.
                }
            }
        }
        finally
        {
            foreach (var process in processes)
            {
                process.Dispose();
            }
        }

        return IntPtr.Zero;
    }

    private static IntPtr FindVisibleTopLevelWindow(uint processId)
    {
        IntPtr best = IntPtr.Zero;
        var bestArea = 0L;

        NativeMethods.EnumWindows((hwnd, _) =>
        {
            NativeMethods.GetWindowThreadProcessId(hwnd, out uint windowPid);
            if (windowPid != processId || !NativeMethods.IsWindowVisible(hwnd))
            {
                return true;
            }

            if (NativeMethods.GetWindow(hwnd, NativeMethods.GW_OWNER) != IntPtr.Zero)
            {
                return true;
            }

            if (!NativeMethods.GetWindowRect(hwnd, out var rect))
            {
                return true;
            }

            var area = (long)rect.Width * rect.Height;
            if (area > bestArea)
            {
                bestArea = area;
                best = hwnd;
            }

            return true;
        }, IntPtr.Zero);

        return best;
    }

    private static bool TrySetForeground(IntPtr hwnd)
    {
        if (NativeMethods.IsIconic(hwnd))
        {
            NativeMethods.ShowWindow(hwnd, NativeMethods.SW_RESTORE);
        }

        var foreground = NativeMethods.GetForegroundWindow();
        var foregroundThread = NativeMethods.GetWindowThreadProcessId(foreground, out _);
        var targetThread = NativeMethods.GetWindowThreadProcessId(hwnd, out _);
        var currentThread = NativeMethods.GetCurrentThreadId();

        NativeMethods.AttachThreadInput(currentThread, foregroundThread, true);
        NativeMethods.AttachThreadInput(currentThread, targetThread, true);

        try
        {
            NativeMethods.SetWindowPos(
                hwnd,
                NativeMethods.HWND_TOP,
                0,
                0,
                0,
                0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_SHOWWINDOW);

            NativeMethods.BringWindowToTop(hwnd);
            NativeMethods.SetForegroundWindow(hwnd);
        }
        finally
        {
            NativeMethods.AttachThreadInput(currentThread, foregroundThread, false);
            NativeMethods.AttachThreadInput(currentThread, targetThread, false);
        }

        return NativeMethods.GetForegroundWindow() == hwnd;
    }

    private static class NativeMethods
    {
        public const int SW_RESTORE = 9;
        public const int GW_OWNER = 4;
        public static readonly IntPtr HWND_TOP = new(0);

        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_SHOWWINDOW = 0x0040;

        public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern IntPtr GetWindow(IntPtr hWnd, int uCmd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int x,
            int y,
            int cx,
            int cy,
            uint uFlags);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [StructLayout(LayoutKind.Sequential)]
        public struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;

            public int Width => Right - Left;
            public int Height => Bottom - Top;
        }
    }
}
