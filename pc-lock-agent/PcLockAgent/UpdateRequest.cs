namespace PcLockAgent;

/// <summary>
/// The note this agent leaves when it is restarting to be replaced.
/// </summary>
/// <remarks>
/// The updater's central rule is that it never replaces a running agent, which
/// is right: doing so takes the lock off a machine somebody may be sitting at.
/// <para>
/// On a café PC that rule is every time. These machines sign in automatically,
/// so the agent is back up within seconds of boot - long before the update task
/// gets to look - and a fix can sit published for weeks while four PCs run
/// versions from a month ago. Restarting the machine did not help, because the
/// race is the same on the way back up.
/// </para>
/// <para>
/// So the owner asking for an update leaves this behind, and a note written in
/// the last half hour is the updater's permission to stop the agent and get on
/// with it. It expires because permission to interrupt somebody should not
/// outlive the moment it was given: a note found days later would be an update
/// nobody asked for, on a machine that by then has a customer at it.
/// </para>
/// </remarks>
internal static class UpdateRequest
{
    private const string FileName = "update-now.flag";

    private static string Path => System.IO.Path.Combine(AgentPaths.DataFolder, FileName);

    /// <summary>
    /// Says that this machine is restarting in order to be updated.
    /// </summary>
    /// <remarks>
    /// Written into the agent's own data folder, which is the one place it can
    /// always write - the install folder is deliberately read-only for the
    /// account this runs as. The updater runs as SYSTEM and can read any
    /// profile, so it looks for this across all of them.
    /// </remarks>
    public static void Leave()
    {
        try
        {
            System.IO.File.WriteAllText(Path, DateTime.UtcNow.ToString("O"));
            AgentLog.Info("Left an update request for the updater to find at boot.");
        }
        catch (Exception ex)
        {
            // Not fatal, and deliberately not a reason to cancel the restart.
            // The machine still comes back, and the worst case is the update
            // waits for the next one - which is exactly where it was before.
            AgentLog.Warn($"Could not leave the update request: {ex.Message}");
        }
    }
}
