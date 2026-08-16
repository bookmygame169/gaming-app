using System.Reflection;

namespace PcLockAgent;

/// <summary>
/// What build this is.
/// </summary>
/// <remarks>
/// Read from the assembly rather than kept as a constant, so it can only ever
/// be the version the build actually stamped. A number maintained by hand here
/// would drift from the one the updater compares against, and the two
/// disagreeing is worse than neither existing.
/// </remarks>
internal static class AgentVersion
{
    public static string Current { get; } = Read();

    private static string Read()
    {
        try
        {
            var version = Assembly.GetExecutingAssembly().GetName().Version;
            return version is null
                ? "unknown"
                : $"{version.Major}.{version.Minor}.{version.Build}";
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read the agent version: {ex.Message}");
            return "unknown";
        }
    }
}
