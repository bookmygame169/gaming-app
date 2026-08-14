using System.Diagnostics;

namespace PcLockAgent;

/// <summary>
/// Append-only log file in the per-user data folder.
/// </summary>
/// <remarks>
/// This is a WinExe with no console, running unattended on a kiosk — when
/// something misbehaves on a café PC at 9pm, this file is the only evidence
/// available. Kept deliberately dumb: no rotation, no async, no dependencies.
/// <para>
/// Never call this from <see cref="SystemLockService"/>'s hook callback. File
/// I/O there risks blowing the 300ms low-level-hook timeout, after which
/// Windows silently uninstalls the hook.
/// </para>
/// </remarks>
internal static class AgentLog
{
    private static readonly object Gate = new();
    private static readonly string LogPath = AgentPaths.LogFile;

    public static void Info(string message) => Write("INFO", message);

    public static void Warn(string message) => Write("WARN", message);

    public static void Error(string message) => Write("ERROR", message);

    private static void Write(string level, string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
        Debug.WriteLine($"[PcLockAgent] {line}");

        lock (Gate)
        {
            try
            {
                File.AppendAllText(LogPath, line + Environment.NewLine);
            }
            catch
            {
                // A failure to log must never take the agent down — if the disk
                // is full or the file is locked, the PC staying locked matters
                // more than the log line.
            }
        }
    }
}
