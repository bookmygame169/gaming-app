using System.Security.AccessControl;
using System.Security.Principal;

namespace PcLockAgent;

/// <summary>
/// Makes sure only one agent runs on this PC.
/// </summary>
/// <remarks>
/// Five different things start the agent: the scheduled task at logon, that
/// task's every-minute watchdog trigger, a separate watchdog task when
/// registration falls back to schtasks, a Startup folder shortcut, and the
/// installer's "enter the setup code now" tick box. Task Scheduler's
/// MultipleInstances setting only governs one task, so it stops none of the
/// others.
/// <para>
/// Two agents on one PC is not merely wasteful. They connect to the broker with
/// the same client id, which MQTT requires to be unique — so the broker drops
/// whichever connected first, that one reconnects and drops the other, and the
/// station flickers between connected and offline every few seconds for as long
/// as both are running. Commands land on whichever copy happens to hold the
/// connection at that instant. They also both draw a fullscreen topmost window,
/// and both hook the keyboard.
/// </para>
/// <para>
/// Machine-wide rather than per-session, because the two copies are often in
/// different sessions: an administrator signed in to set the PC up, and the
/// customer account it was set up for. A per-session guard would see nothing
/// wrong with that pair, and that pair is exactly what fights over the broker.
/// </para>
/// </remarks>
internal static class SingleInstance
{
    // Global\ makes it machine-wide. The name is fixed rather than per-station:
    // one PC runs one station, and two agents disagreeing about which station
    // they are is a worse version of the same problem.
    private const string MutexName = @"Global\BookMyGame.PcLockAgent";

    private static Mutex? _held;

    /// <summary>
    /// Claims the right to be the agent on this PC.
    /// </summary>
    /// <returns>False when another copy already holds it, and this one should quit.</returns>
    public static bool TryClaim()
    {
        try
        {
            // Everyone gets rights on purpose. The customer account and an
            // administrator account must be able to see each other's claim, and
            // by default a mutex created by one user cannot even be opened by
            // another - which would look exactly like "no other instance" and
            // let the pair through.
            var security = new MutexSecurity();
            security.AddAccessRule(new MutexAccessRule(
                new SecurityIdentifier(WellKnownSidType.WorldSid, null),
                MutexRights.FullControl,
                AccessControlType.Allow));

            _held = MutexAcl.Create(
                initiallyOwned: true,
                name: MutexName,
                createdNew: out var createdNew,
                mutexSecurity: security);

            if (!createdNew)
            {
                AgentLog.Warn(
                    "Another copy of the agent is already running on this PC. Closing this one. " +
                    "Two agents share one broker client id and would knock each other offline " +
                    "every few seconds.");

                _held.Dispose();
                _held = null;
                return false;
            }

            return true;
        }
        catch (UnauthorizedAccessException)
        {
            // The mutex exists and this account cannot open it. That is still an
            // answer: something else is holding it.
            AgentLog.Warn("Another copy of the agent is already running under a different account. Closing this one.");
            return false;
        }
        catch (Exception ex)
        {
            // Never let this stop the lock coming up. An unlocked café PC is a
            // worse outcome than two agents arguing over a broker connection.
            AgentLog.Warn($"Could not check for another running agent ({ex.Message}). Carrying on.");
            return true;
        }
    }

    /// <summary>Gives up the claim, so the next start is not refused.</summary>
    public static void Release()
    {
        if (_held is null)
        {
            return;
        }

        try
        {
            _held.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // Not the owning thread, or already released. Disposing is enough.
        }
        finally
        {
            _held.Dispose();
            _held = null;
        }
    }
}
