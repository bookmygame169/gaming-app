namespace PcLockAgent;

/// <summary>
/// Decides where the agent is allowed to write.
/// </summary>
/// <remarks>
/// The install folder is not that place, and this is easy to get wrong because
/// it works perfectly while you are testing.
/// <para>
/// The installer puts the agent in <c>C:\BookMyGame\PcLockAgent</c>. A folder
/// created at the root of the system drive inherits the permissions of that
/// drive, which give <c>Users</c> read and execute and nothing more. The person
/// installing is an administrator, so every write succeeds for them — and then
/// the customer account, which is a standard user on purpose, silently cannot
/// write a single byte. No log, no cached game list, and no way to tell whether
/// the agent is working on the one account where it actually matters.
/// </para>
/// <para>
/// Widening the install folder's permissions would fix the symptom and open a
/// hole: a customer able to write there could replace <c>PcLockAgent.exe</c> or
/// edit the settings that hold the broker credentials. So the install folder
/// stays read-only for customers, and everything the agent needs to write goes
/// to the per-user application data folder, which every account can always
/// write to without anyone changing a permission.
/// </para>
/// <para>
/// Settings are unaffected and still live beside the exe: they are read, not
/// written, and being shared by all accounts is the point — it is what lets the
/// administrator redeem the setup code once and have the customer account
/// already enrolled.
/// </para>
/// </remarks>
internal static class AgentPaths
{
    private static readonly Lazy<string> Folder = new(Resolve);

    /// <summary>Per-user folder the agent can always write to.</summary>
    public static string DataFolder => Folder.Value;

    public static string LogFile => Path.Combine(DataFolder, "agent.log");

    public static string GamesCacheFile => Path.Combine(DataFolder, "games-cache.json");

    /// <summary>
    /// How much paid time is left, so a restart does not lose it.
    /// </summary>
    /// <remarks>
    /// The one here with real money attached. A watchdog restart or a reboot
    /// part way through a session re-reads this file; if the write silently
    /// failed, the agent comes back locked and a customer who has paid is shut
    /// out of the time they bought. It failed silently on exactly the account
    /// customers use, which is why it was never seen in testing.
    /// </remarks>
    public static string SessionStateFile => Path.Combine(DataFolder, "session.json");

    private static string Resolve()
    {
        try
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            if (!string.IsNullOrWhiteSpace(localAppData))
            {
                var folder = Path.Combine(localAppData, "BookMyGame");
                Directory.CreateDirectory(folder);
                return folder;
            }
        }
        catch
        {
            // Deliberately silent, and deliberately not routed through AgentLog:
            // the log file's own path comes from here, so logging a failure to
            // work out where to log would run this again from inside itself.
            // Falling back to the install folder restores exactly the old
            // behaviour, which works for an administrator and fails quietly for
            // a customer — no worse than before this file existed.
        }

        return AppContext.BaseDirectory;
    }
}
