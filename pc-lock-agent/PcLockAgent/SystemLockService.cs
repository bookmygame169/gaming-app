using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PcLockAgent;

/// <summary>
/// Blocks the keyboard shortcuts a customer would use to escape the lock screen,
/// and disables Task Manager while the lock is active.
/// </summary>
/// <remarks>
/// <para><b>What cannot be blocked:</b> Ctrl+Alt+Del. Windows reserves it at the
/// kernel level as the Secure Attention Sequence, specifically so that no
/// application can trap it or fake the screen behind it — that is what makes it
/// trustworthy for logon. No user-mode hook sees it. What we can do is set the
/// <c>DisableTaskMgr</c> policy so the Task Manager entry on that screen refuses
/// to launch, which gets the practical outcome even though the keypress itself
/// still works.</para>
///
/// <para><b>Integrity levels:</b> a hook installed by a normal-privilege process
/// cannot intercept keys destined for an elevated (admin) process. That is fine
/// here as long as café PCs auto-login to a standard, non-admin account — such a
/// user cannot get anything elevated without admin credentials at the UAC
/// prompt.</para>
/// </remarks>
internal sealed class SystemLockService : IDisposable
{
    /// <summary>
    /// Raised when the developer escape chord is pressed. Marshalled back onto
    /// the thread that called <see cref="Activate"/>, so handlers can touch the
    /// UI directly.
    /// </summary>
    public event EventHandler? DevExitRequested;

    /// <summary>
    /// Raised when the developer passthrough chord is pressed. See
    /// <see cref="Passthrough"/>.
    /// </summary>
    public event EventHandler? DevPassthroughToggleRequested;

    private readonly bool _allowDevExit;

    /// <summary>
    /// When true the hook stays installed but stops swallowing keys.
    /// </summary>
    /// <remarks>
    /// Development affordance only. A fullscreen topmost window that eats
    /// Alt+Tab and the Windows key leaves no way to reach a terminal, which
    /// makes the agent impossible to test against a broker on a single-monitor
    /// machine. Gated behind the same flag as the exit chord.
    /// <para>
    /// The hook is deliberately left installed rather than uninstalled, so the
    /// chord that toggles this back off is still seen globally even when our
    /// window has lost focus.
    /// </para>
    /// </remarks>
    private volatile bool _passthrough;

    /// <summary>
    /// Relaxes the Alt+F4 block only, while a game is in the foreground.
    /// </summary>
    /// <remarks>
    /// Alt+F4 is blocked to stop a customer closing the lock screen or the game
    /// menu. But it is also the standard way to quit a game, and with it blocked
    /// a customer who launches something with no in-game exit is stranded until
    /// their time runs out. The Windows key and Alt+Tab stay blocked throughout —
    /// closing a game returns them to the menu, which is fine; reaching the
    /// desktop is not.
    /// </remarks>
    private volatile bool _gameRunning;

    /// <summary>
    /// Held in a field on purpose. <see cref="NativeMethods.SetWindowsHookEx"/>
    /// stores a raw function pointer, which the GC does not count as a
    /// reference — if the only reference to this delegate were the local
    /// variable passed into the call, it would be collected and the next
    /// keystroke would call into freed memory. This is the single most common
    /// way low-level hooks are written wrong.
    /// </summary>
    private NativeMethods.LowLevelKeyboardProc? _hookProc;

    private IntPtr _hookHandle = IntPtr.Zero;
    private SynchronizationContext? _uiContext;

    private bool _taskMgrPolicyApplied;
    private object? _previousTaskMgrValue;
    private EventHandler? _processExitHandler;

    public SystemLockService(bool allowDevExit)
    {
        _allowDevExit = allowDevExit;
    }

    public bool IsActive => _hookHandle != IntPtr.Zero;

    /// <summary>
    /// Whether key blocking is currently suspended for development.
    /// </summary>
    public bool Passthrough => _passthrough;

    /// <summary>
    /// Tells the hook a game is in the foreground, which relaxes Alt+F4 only.
    /// See <see cref="_gameRunning"/>.
    /// </summary>
    public void SetGameRunning(bool running)
    {
        if (_gameRunning == running)
        {
            return;
        }

        _gameRunning = running;
        AgentLog.Info($"Alt+F4 {(running ? "allowed (game running)" : "blocked")}.");
    }

    /// <summary>
    /// Suspends or resumes key blocking, and restores or re-applies the Task
    /// Manager policy to match.
    /// </summary>
    public void SetPassthrough(bool enabled)
    {
        if (!_allowDevExit || _passthrough == enabled)
        {
            return;
        }

        _passthrough = enabled;

        if (enabled)
        {
            RestoreTaskManager();
        }
        else
        {
            DisableTaskManager();
        }

        AgentLog.Info($"Dev passthrough {(enabled ? "ON — keys unblocked" : "OFF — keys blocked")}.");
    }

    /// <summary>
    /// Installs the keyboard hook and disables Task Manager.
    /// </summary>
    /// <remarks>
    /// Must be called from the UI thread. A low-level keyboard hook delivers its
    /// callbacks on the thread that installed it, and that thread needs a
    /// running message pump — which the WinForms UI thread has and a worker
    /// thread does not.
    /// </remarks>
    public void Activate()
    {
        if (IsActive)
        {
            return;
        }

        _uiContext = SynchronizationContext.Current;

        InstallKeyboardHook();
        DisableTaskManager();

        // Best-effort cleanup if the process ends without Deactivate() running.
        // Does not fire on a hard kill (Task Manager "End task", power loss), so
        // the policy can survive a crash — see the recovery note in README.
        _processExitHandler = (_, _) => RestoreTaskManager();
        AppDomain.CurrentDomain.ProcessExit += _processExitHandler;
    }

    public void Deactivate()
    {
        if (_hookHandle != IntPtr.Zero)
        {
            NativeMethods.UnhookWindowsHookEx(_hookHandle);
            _hookHandle = IntPtr.Zero;
        }

        _hookProc = null;

        RestoreTaskManager();

        if (_processExitHandler is not null)
        {
            AppDomain.CurrentDomain.ProcessExit -= _processExitHandler;
            _processExitHandler = null;
        }
    }

    public void Dispose() => Deactivate();

    // -----------------------------------------------------------------------
    // Keyboard hook
    // -----------------------------------------------------------------------

    private void InstallKeyboardHook()
    {
        _hookProc = HookCallback;

        // WH_KEYBOARD_LL is a *global* hook — it sees keystrokes headed for any
        // window, not just ours. That is the point: a customer pressing the
        // Windows key is trying to leave our window, so intercepting only our
        // own window's input would be useless.
        using var process = Process.GetCurrentProcess();
        using var module = process.MainModule!;
        var moduleHandle = NativeMethods.GetModuleHandle(module.ModuleName);

        _hookHandle = NativeMethods.SetWindowsHookEx(
            NativeMethods.WH_KEYBOARD_LL,
            _hookProc,
            moduleHandle,
            0);

        if (_hookHandle == IntPtr.Zero)
        {
            var error = Marshal.GetLastWin32Error();
            Debug.WriteLine($"[SystemLockService] Failed to install keyboard hook. Win32 error {error}.");
            _hookProc = null;
        }
    }

    /// <summary>
    /// Called by Windows for every keystroke while the hook is installed.
    /// </summary>
    /// <remarks>
    /// Keep this fast and allocation-light. Windows gives a low-level hook only
    /// <c>LowLevelHooksTimeout</c> milliseconds (300 by default) to return; miss
    /// it and the hook is silently uninstalled, with no error and no callback —
    /// the lock would just quietly stop working. No file I/O or network calls in
    /// here, ever.
    /// </remarks>
    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        // Negative nCode means "not for you, pass it along" per the Win32 contract.
        if (nCode < 0)
        {
            return NativeMethods.CallNextHookEx(_hookHandle, nCode, wParam, lParam);
        }

        var message = (int)wParam;

        // Alt+<key> combinations arrive as WM_SYSKEYDOWN rather than WM_KEYDOWN.
        // Checking only WM_KEYDOWN is why naive implementations fail to block
        // Alt+Tab and Alt+F4.
        if (message is NativeMethods.WM_KEYDOWN or NativeMethods.WM_SYSKEYDOWN)
        {
            var info = Marshal.PtrToStructure<NativeMethods.KBDLLHOOKSTRUCT>(lParam);
            var key = (Keys)info.vkCode;

            // LLKHF_ALTDOWN alone is not enough. It carries the message's
            // "context code", which Windows only sets on WM_SYSKEYDOWN — and a
            // Ctrl+Alt+<key> combination arrives as plain WM_KEYDOWN, where the
            // context code is always 0. Relying on the flag by itself makes
            // every Ctrl+Alt chord invisible to this hook. Reading the live key
            // state covers that case; the flag is kept as the primary source
            // since it describes the keystroke being delivered rather than the
            // keyboard's state at the moment we happen to ask.
            var altDown = (info.flags & NativeMethods.LLKHF_ALTDOWN) != 0
                          || NativeMethods.IsKeyDown(NativeMethods.VK_MENU);
            var ctrlDown = NativeMethods.IsKeyDown(NativeMethods.VK_CONTROL);
            var shiftDown = NativeMethods.IsKeyDown(NativeMethods.VK_SHIFT);

            // Dev chords are checked before the block list, and regardless of
            // passthrough, so they keep working globally even when our window
            // has lost focus.
            if (_allowDevExit && ctrlDown && shiftDown && altDown)
            {
                switch (key)
                {
                    case Keys.Q:
                        RaiseDevExitRequested();
                        return NativeMethods.Suppress;

                    case Keys.L:
                        RaiseOnUi(() => DevPassthroughToggleRequested?.Invoke(this, EventArgs.Empty));
                        return NativeMethods.Suppress;
                }
            }

            if (!_passthrough && ShouldBlock(key, altDown, ctrlDown, _gameRunning))
            {
                return NativeMethods.Suppress;
            }
        }

        return NativeMethods.CallNextHookEx(_hookHandle, nCode, wParam, lParam);
    }

    private static bool ShouldBlock(Keys key, bool altDown, bool ctrlDown, bool gameRunning)
    {
        // Windows key — opens the Start menu, and Win+D / Win+E / Win+R would
        // each reach the desktop, Explorer or the Run box.
        if (key is Keys.LWin or Keys.RWin)
        {
            return true;
        }

        // Alt+F4 quits the focused window. Allowed only while a game is running,
        // so a customer can close it and come back to the menu.
        if (altDown && key == Keys.F4)
        {
            return !gameRunning;
        }

        // Alt+Tab (switch window) and Alt+Esc (cycle windows) stay blocked even
        // during a game — both are routes to the desktop.
        if (altDown && key is Keys.Tab or Keys.Escape)
        {
            return true;
        }

        // Ctrl+Esc opens the Start menu without the Windows key.
        // Ctrl+Shift+Esc opens Task Manager directly.
        if (ctrlDown && key == Keys.Escape)
        {
            return true;
        }

        // The context-menu key, which can reach shell menus.
        if (key == Keys.Apps)
        {
            return true;
        }

        return false;
    }

    private void RaiseDevExitRequested() =>
        RaiseOnUi(() => DevExitRequested?.Invoke(this, EventArgs.Empty));

    /// <summary>
    /// Marshals an event onto the thread that called <see cref="Activate"/>.
    /// </summary>
    /// <remarks>
    /// Post (not Send) so the hook returns immediately rather than blocking on
    /// the UI thread — see the timeout note on <see cref="HookCallback"/>.
    /// </remarks>
    private void RaiseOnUi(Action action)
    {
        if (_uiContext is not null)
        {
            _uiContext.Post(_ => action(), null);
        }
        else
        {
            action();
        }
    }

    // -----------------------------------------------------------------------
    // Task Manager policy
    // -----------------------------------------------------------------------

    /// <summary>
    /// Sets the per-user <c>DisableTaskMgr</c> policy.
    /// </summary>
    /// <remarks>
    /// Under HKEY_CURRENT_USER, so it needs no administrator rights — the agent
    /// can run as the same standard account the customer is logged into.
    /// </remarks>
    private void DisableTaskManager()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(NativeMethods.PoliciesSystemKey, writable: true);
            if (key is null)
            {
                return;
            }

            // Remember whatever was there so Deactivate can put it back exactly,
            // rather than assuming the value did not exist before.
            _previousTaskMgrValue = key.GetValue(NativeMethods.DisableTaskMgrValue);
            key.SetValue(NativeMethods.DisableTaskMgrValue, 1, RegistryValueKind.DWord);
            _taskMgrPolicyApplied = true;
        }
        catch (Exception ex)
        {
            // A failure here weakens the lock but must not stop the agent from
            // starting — the keyboard hook is the primary defence.
            Debug.WriteLine($"[SystemLockService] Could not disable Task Manager: {ex.Message}");
        }
    }

    private void RestoreTaskManager()
    {
        if (!_taskMgrPolicyApplied)
        {
            return;
        }

        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(NativeMethods.PoliciesSystemKey, writable: true);
            if (key is null)
            {
                return;
            }

            if (_previousTaskMgrValue is null)
            {
                key.DeleteValue(NativeMethods.DisableTaskMgrValue, throwOnMissingValue: false);
            }
            else
            {
                key.SetValue(NativeMethods.DisableTaskMgrValue, _previousTaskMgrValue, RegistryValueKind.DWord);
            }
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"[SystemLockService] Could not restore Task Manager: {ex.Message}");
        }
        finally
        {
            _taskMgrPolicyApplied = false;
            _previousTaskMgrValue = null;
        }
    }

    // -----------------------------------------------------------------------
    // Win32 interop
    // -----------------------------------------------------------------------

    private static class NativeMethods
    {
        public const int WH_KEYBOARD_LL = 13;
        public const int WM_KEYDOWN = 0x0100;
        public const int WM_SYSKEYDOWN = 0x0104;
        public const uint LLKHF_ALTDOWN = 0x20;

        public const int VK_SHIFT = 0x10;
        public const int VK_CONTROL = 0x11;
        public const int VK_MENU = 0x12; // Alt

        public const string PoliciesSystemKey = @"Software\Microsoft\Windows\CurrentVersion\Policies\System";
        public const string DisableTaskMgrValue = "DisableTaskMgr";

        /// <summary>Non-zero return from a hook proc means "swallow this key".</summary>
        public static readonly IntPtr Suppress = new(1);

        public delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        /// <summary>
        /// The payload Windows hands to a low-level keyboard hook. Field order
        /// and types must match the Win32 struct exactly or the marshaller reads
        /// garbage.
        /// </summary>
        [StructLayout(LayoutKind.Sequential)]
        public struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr SetWindowsHookEx(
            int idHook,
            LowLevelKeyboardProc lpfn,
            IntPtr hMod,
            uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        public static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        /// <summary>
        /// True if the key is currently held. The high-order bit of
        /// GetAsyncKeyState's return value is the "currently down" flag; the low
        /// bit means "was pressed since last call", which is not what we want.
        /// </summary>
        public static bool IsKeyDown(int virtualKey) => (GetAsyncKeyState(virtualKey) & 0x8000) != 0;
    }
}
