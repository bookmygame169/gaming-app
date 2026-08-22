using System.Diagnostics;

namespace PcLockAgent;

/// <summary>
/// Turning the machine off, or turning it round.
/// </summary>
/// <remarks>
/// Through shutdown.exe rather than the ExitWindowsEx API, and that is a
/// deliberate choice rather than laziness. ExitWindowsEx needs the calling
/// process to hold SE_SHUTDOWN_NAME and to enable it by hand, which the
/// customer account this runs as may not have; shutdown.exe is a Windows
/// binary that does that work itself and reports a real exit code when it
/// cannot.
/// <para>
/// The two are not equally safe, which is why they are separated here and
/// gated differently by the screen that calls them. A restart heals itself:
/// the PC comes back, and the agent comes back with it through its startup
/// task. A shutdown does not - somebody has to walk over and press the power
/// button - so it is worth more than one tap by a bored customer.
/// </para>
/// </remarks>
internal static class PowerControl
{
    public static void Restart() => Run("/r /t 0", "restart");

    public static void ShutDown() => Run("/s /t 0", "shut down");

    private static void Run(string arguments, string what)
    {
        try
        {
            AgentLog.Info($"Customer asked to {what} this PC.");

            // /f is deliberately absent. Anything the customer left open gets
            // its chance to object, which on a café PC is usually a browser
            // asking about downloads - and being asked beats losing them.
            var process = Process.Start(new ProcessStartInfo
            {
                FileName = "shutdown.exe",
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
            });

            process?.Dispose();
        }
        catch (Exception ex)
        {
            // Logged and swallowed. A machine that will not turn off is a
            // problem for staff, not a reason to take the lock screen down.
            AgentLog.Error($"Could not {what} this PC: {ex.Message}");
        }
    }
}
