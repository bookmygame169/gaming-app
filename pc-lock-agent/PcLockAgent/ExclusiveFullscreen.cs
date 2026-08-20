using System.Runtime.InteropServices;

namespace PcLockAgent;

/// <summary>
/// Whether a game currently owns the display outright.
/// </summary>
/// <remarks>
/// This is the question behind "the warning minimises my game", and it has an
/// answer that no amount of care with window styles will change.
/// <para>
/// A DirectX title in exclusive fullscreen does not share the screen with the
/// desktop compositor — it owns the output. Showing any other window forces
/// Windows back into composited mode, the game loses its exclusive swap chain,
/// and it minimises. That happens for a topmost window, a WS_EX_NOACTIVATE
/// window, a click-through window: all of them. It is not a bug in how the
/// banner is drawn, it is what exclusive fullscreen means.
/// </para>
/// <para>
/// The overlays that manage it — Steam, Discord, GeForce — do not show a
/// window. They inject a library into the game and draw inside its own render
/// pipeline. That is emphatically not an option here: Valorant runs a
/// kernel-level anti-cheat, and anything injecting into it would put the
/// customer's account at risk of a ban. A café must never do that to a
/// customer's account to show them a clock.
/// </para>
/// <para>
/// So the banner asks first, and when a game owns the screen it does not
/// appear at all — the warning is played as a sound instead. Nothing is drawn,
/// so nothing can minimise anything.
/// </para>
/// </remarks>
internal static class ExclusiveFullscreen
{
    /// <summary>
    /// True when a Direct3D application is running in exclusive fullscreen.
    /// </summary>
    /// <remarks>
    /// This is the same question Windows asks itself before deciding whether to
    /// pop a toast notification, and it is asked through the same API, so the
    /// answer matches what the rest of the system does.
    /// <para>
    /// Only the D3D state counts as a reason to stay quiet. The other "busy"
    /// states include any full-screen window at all — which this agent's own
    /// game menu is — and treating those as fullscreen games would silence the
    /// banner on the one screen it is guaranteed to be safe on.
    /// </para>
    /// </remarks>
    public static bool IsGameOwningTheScreen()
    {
        try
        {
            if (NativeMethods.SHQueryUserNotificationState(out var state) != 0)
            {
                // Could not tell. Say no: the cost of being wrong here is a
                // banner that does not appear, and the customer being warned is
                // the point of the thing.
                return false;
            }

            return state == NativeMethods.QUNS_RUNNING_D3D_FULL_SCREEN;
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not check for a fullscreen game: {ex.Message}");
            return false;
        }
    }

    private static class NativeMethods
    {
        public const int QUNS_RUNNING_D3D_FULL_SCREEN = 3;

        [DllImport("shell32.dll")]
        public static extern int SHQueryUserNotificationState(out int state);
    }
}
