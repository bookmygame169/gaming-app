using Microsoft.Win32;

namespace PcLockAgent;

/// <summary>
/// Adds a "Browse the internet" tile to the game menu.
/// </summary>
/// <remarks>
/// Not every customer comes in to play something. Plenty want twenty minutes
/// of browsing, and without this they would have to be handed a desktop —
/// which is the one thing the lock exists to prevent.
/// <para>
/// The browser is offered as an ordinary <see cref="GameEntry"/> rather than a
/// special case in the menu. Everything already built for games then applies to
/// it unchanged: the tile, the return to the menu when it closes, and being
/// closed when the paid time runs out. A browser left running past the end of a
/// session would be exactly the kind of window a customer could keep using.
/// </para>
/// <para>
/// Privacy between customers comes from a profile folder of its own, emptied at
/// the start of every session — not from opening in private mode. Private mode
/// was tried and is the wrong tool: it makes the browser behave like a browser
/// in hiding, warns about it on every launch, and loses the customer's tabs and
/// sign-ins while they are still using it. Clearing between customers achieves
/// the same thing and leaves ordinary browsing in between.
/// </para>
/// <para>
/// This is privacy between customers, not a security boundary. A determined
/// customer can still download and run things — they are a standard Windows
/// user, which is what actually limits the damage. Locking the browser down
/// further is a job for Chrome policies, not command-line flags.
/// </para>
/// </remarks>
internal static class BrowserAccess
{
    private const string TileName = "Browse the internet";

    /// <summary>Where the café's browsing profile lives.</summary>
    public static string ProfileDirectory => Path.Combine(AgentPaths.DataFolder, "browser-profile");

    /// <summary>
    /// Empties the browsing profile, so a customer never starts on the last
    /// one's signed-in accounts.
    /// </summary>
    /// <remarks>
    /// Called when a session begins rather than when the agent starts. The
    /// agent runs for days; a customer's session is an hour, and it is between
    /// customers that a browser needs forgetting.
    /// </remarks>
    public static void ClearProfile()
    {
        try
        {
            if (Directory.Exists(ProfileDirectory))
            {
                Directory.Delete(ProfileDirectory, recursive: true);
                AgentLog.Info("Cleared the browsing profile for the next customer.");
            }
        }
        catch (Exception ex)
        {
            // Worth saying, because it means the next customer may open the
            // browser onto somebody else's accounts.
            AgentLog.Warn($"Could not clear the browsing profile: {ex.Message}");
        }
    }

    /// <summary>Adds the browser tile if browsing is allowed and one is installed.</summary>
    public static AgentConfig AddBrowserTile(AgentConfig config)
    {
        if (!config.AllowBrowsing)
        {
            return config;
        }

        var browser = FindBrowser();
        if (browser is null)
        {
            AgentLog.Warn("Browsing is switched on but no Chrome or Edge was found on this PC.");
            return config;
        }

        var profileDir = ProfileDirectory;

        var entry = new GameEntry
        {
            Name = TileName,
            ExePath = browser,
            // No processName: with its own profile folder the browser does not
            // hand off to an already-running copy, so the process started here
            // is the one that stays, and closing the last window ends it.
            Category = "app",
            Arguments = string.Join(' ',
                "--no-first-run",
                "--no-default-browser-check",
                "--start-maximized",
                $"--user-data-dir=\"{profileDir}\""),
        };

        AgentLog.Info($"Browsing enabled using {browser}.");

        // Last, so it sits after the games. Someone who came in to play should
        // not have to look past a browser to find what they came for.
        var games = new List<GameEntry>(config.Games) { entry };
        return config.WithGames(games);
    }

    /// <summary>Chrome if it is here, Edge if it is not.</summary>
    /// <remarks>
    /// Edge as the fallback because it is on every Windows install, so a PC
    /// without Chrome still offers browsing rather than silently dropping the
    /// tile.
    /// </remarks>
    private static string? FindBrowser()
    {
        foreach (var exe in new[] { "chrome.exe", "msedge.exe" })
        {
            var fromRegistry = FindViaAppPaths(exe);
            if (fromRegistry is not null)
            {
                return fromRegistry;
            }
        }

        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        var candidates = new[]
        {
            Path.Combine(programFiles, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(programFilesX86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(programFilesX86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(programFiles, @"Microsoft\Edge\Application\msedge.exe"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    /// <summary>
    /// Asks Windows where a program is, via the list installers register.
    /// </summary>
    /// <remarks>
    /// Better than guessing at folders: Chrome can be installed per-machine or
    /// per-user, and the per-user install lives under the customer's own
    /// AppData where no fixed path would find it.
    /// </remarks>
    private static string? FindViaAppPaths(string exeName)
    {
        var subKey = $@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exeName}";

        var roots = new (RegistryHive Hive, RegistryView View)[]
        {
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32),
            (RegistryHive.CurrentUser, RegistryView.Registry64),
        };

        foreach (var (hive, view) in roots)
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                using var key = baseKey.OpenSubKey(subKey);
                if (key?.GetValue(null) is string path)
                {
                    var trimmed = path.Trim('"');
                    if (File.Exists(trimmed))
                    {
                        return trimmed;
                    }
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                // Try the next view.
            }
        }

        return null;
    }
}
