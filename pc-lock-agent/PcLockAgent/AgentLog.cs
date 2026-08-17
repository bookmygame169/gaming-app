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

    /// <summary>
    /// Lines from the current scan, kept so they can be written out on their own.
    /// </summary>
    /// <remarks>
    /// agent.log holds everything and lives in the customer account's AppData,
    /// where nobody is going to find it. Six attempts at "why is this game
    /// missing" were made by reading a photograph of the menu and reasoning
    /// backwards, and all six were wrong — the agent knew the answer every
    /// time and had no way to say it.
    /// </remarks>
    private static List<string>? _capture;

    public static void Info(string message) => Write("INFO", message);

    public static void Warn(string message) => Write("WARN", message);

    public static void Error(string message) => Write("ERROR", message);

    /// <summary>Starts collecting lines for the game report.</summary>
    public static void StartCapture()
    {
        lock (Gate)
        {
            _capture = new List<string>();
        }
    }

    /// <summary>
    /// Writes what was captured somewhere a person will actually find it.
    /// </summary>
    /// <remarks>
    /// ProgramData first, because that is readable from the administrator
    /// account without going near the customer's profile. The per-user folder
    /// is the fallback for when this account cannot write there.
    /// </remarks>
    public static void SaveCapture(string header)
    {
        List<string> lines;

        lock (Gate)
        {
            if (_capture is null)
            {
                return;
            }

            lines = _capture;
            _capture = null;
        }

        var body = string.Join(
            Environment.NewLine,
            new[]
            {
                "BookMyGame - what the lock screen found on this PC",
                new string('=', 58),
                header,
                $"Written: {DateTime.Now:yyyy-MM-dd HH:mm:ss}",
                $"Windows account: {Environment.UserName}",
                string.Empty,
            }.Concat(lines));

        foreach (var path in new[]
                 {
                     Path.Combine(
                         Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                         "BookMyGame", "game-report.txt"),
                     Path.Combine(AgentPaths.DataFolder, "game-report.txt"),
                 })
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, body);
                Info($"Game report written to {path}");
                return;
            }
            catch
            {
                // Try the next location.
            }
        }
    }

    private static void Write(string level, string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {message}";
        Debug.WriteLine($"[PcLockAgent] {line}");

        lock (Gate)
        {
            _capture?.Add(message);
        }

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
