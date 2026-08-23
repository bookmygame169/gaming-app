namespace PcLockAgent;

/// <summary>
/// The note staff leave when they quit the lock on purpose.
/// </summary>
/// <remarks>
/// Quitting used to last about a minute. The watchdog task runs every sixty
/// seconds and starts the agent again if it is not there, which is exactly
/// right for a crash and exactly wrong for somebody who typed the exit
/// password because they need the machine to fix something. They would get the
/// desktop, start working, and have the lock come back over the top of it.
/// <para>
/// So a deliberate exit leaves this behind, and a start that came from the
/// watchdog reads it and stands down. A start that came from anywhere else -
/// the logon task, or the Lock this PC shortcut on the desktop - clears it and
/// locks the machine as usual.
/// </para>
/// <para>
/// That is what makes signing out and back in the way to undo it, which is
/// what was asked for: the logon task is not the watchdog, so it takes the
/// note away. No timer, nothing to remember, and no way to leave a café PC
/// unlocked overnight by forgetting - the next person to sign in gets a locked
/// machine whatever the last person did.
/// </para>
/// </remarks>
internal static class StaffExit
{
    private const string FileName = "staff-exit.flag";

    private static string Path => System.IO.Path.Combine(AgentPaths.DataFolder, FileName);

    /// <summary>Says the lock was quit on purpose and should stay quit.</summary>
    public static void Leave()
    {
        try
        {
            System.IO.File.WriteAllText(Path, SignInStamp());
            AgentLog.Info(
                "Staff quit the lock. It will stay off until this account signs out and in " +
                "again, or somebody runs Lock this PC.");
        }
        catch (Exception ex)
        {
            // Not fatal. The worst case is the old behaviour: the watchdog
            // brings the lock back inside a minute.
            AgentLog.Warn($"Could not record the staff exit: {ex.Message}");
        }
    }

    /// <summary>Whether staff have quit and not yet signed out.</summary>
    /// <remarks>
    /// A note from an earlier sign-in is deleted here rather than honoured. It
    /// has done its job, and leaving it lying about is how a machine ends up
    /// refusing to lock for a reason nobody remembers.
    /// </remarks>
    public static bool WasLeft()
    {
        try
        {
            if (!System.IO.File.Exists(Path))
            {
                return false;
            }

            var written = System.IO.File.ReadAllText(Path).Trim();

            if (string.Equals(written, SignInStamp(), StringComparison.Ordinal))
            {
                return true;
            }

            AgentLog.Info("A staff exit from an earlier sign-in. This PC locks again.");
            Clear();
            return false;
        }
        catch
        {
            // Unreadable is treated as absent, which errs towards locking the
            // machine rather than leaving it open.
            return false;
        }
    }

    /// <summary>
    /// Which sign-in this is, as a string that changes when somebody signs out.
    /// </summary>
    /// <remarks>
    /// Explorer starts at sign-in and dies at sign-out, so the moment it
    /// started names the session as well as anything can without asking Windows
    /// for a privilege this account does not have. Paired with the session id,
    /// which is what changes when two people are signed in at once.
    /// <para>
    /// Where there is no Explorer - a machine set up with the agent as its
    /// shell, or one where Explorer has crashed - the session id alone still
    /// changes across most sign-outs, and a wrong answer here only means the
    /// lock comes back sooner than staff wanted. That is the right way to be
    /// wrong.
    /// </para>
    /// </remarks>
    private static string SignInStamp()
    {
        var session = System.Diagnostics.Process.GetCurrentProcess().SessionId;

        try
        {
            var explorers = System.Diagnostics.Process.GetProcessesByName("explorer");

            try
            {
                var started = explorers
                    .Where(process => process.SessionId == session)
                    .Select(process => process.StartTime.Ticks)
                    .DefaultIfEmpty(0L)
                    .Min();

                if (started > 0)
                {
                    return session + ":" + started;
                }
            }
            finally
            {
                foreach (var explorer in explorers)
                {
                    explorer.Dispose();
                }
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read the sign-in time: {ex.Message}");
        }

        return session.ToString();
    }

    /// <summary>Forgets it, so the lock comes back.</summary>
    public static void Clear()
    {
        try
        {
            if (!System.IO.File.Exists(Path))
            {
                return;
            }

            System.IO.File.Delete(Path);
            AgentLog.Info("Cleared the staff exit; this PC locks again.");
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not clear the staff exit: {ex.Message}");
        }
    }
}
