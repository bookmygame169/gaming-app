using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace PcLockAgent;

/// <summary>
/// Finds what is actually installed and puts it on the menu.
/// </summary>
/// <remarks>
/// The café's list was the only source of tiles, so a PC with seventeen games
/// on its desktop showed three — the ones somebody had remembered to type into
/// the dashboard. Everything else may as well not have been installed.
/// <para>
/// The list is still worth having: it carries the names, the ordering and the
/// process names that a launcher-based game needs. But it is a curated front of
/// the menu now rather than the whole of it. Steam, Epic, Xbox, Start Menu,
/// other user profiles, and well-known install folders are all scanned, so a
/// game still appears when nobody put a shortcut on this desktop.
/// </para>
/// <para>
/// The rule for what counts is deliberately narrow. Steam and Epic keep records
/// of what they installed, which are exact; desktop shortcuts are what the café
/// itself chose to put in front of customers. Everything else on a Windows
/// machine claiming to be an application is drivers, runtimes and updaters, and
/// a menu of those is worse than a short menu.
/// </para>
/// </remarks>
internal static class GameDiscovery
{
    private static readonly Regex AppIdFromManifest =
        new(@"appmanifest_(\d+)\.acf$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AcfName =
        new("\"name\"\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AcfInstallDir =
        new("\"installdir\"\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// Executables that live in a game folder without being the game.
    /// </summary>
    /// <remarks>
    /// Picking the biggest exe in a folder is right surprisingly often and
    /// wrong in exactly these cases — a crash reporter or a redistributable
    /// installer sitting next to the thing the customer wanted.
    /// </remarks>
    private static readonly string[] NotTheGame =
    {
        "unins", "uninstall", "crashhandler", "crashreport", "vc_redist", "vcredist",
        "dxsetup", "directx", "dotnetfx", "setup", "installer", "updater", "launcher_helper",
        "unitycrashhandler", "ueprereqsetup", "epicwebhelper", "touchup",
    };

    /// <summary>
    /// Shortcut names that are never a game.
    /// </summary>
    /// <remarks>
    /// The Start Menu is not a games list. Alongside each game sits its manual,
    /// its website, its config tool and its uninstaller, and a café menu built
    /// without this reads like a folder listing rather than something to choose
    /// from.
    /// </remarks>
    /// <summary>
    /// Things that are never worth a tile, whatever they are called.
    /// </summary>
    /// <remarks>
    /// Everything here was on a real café PC's menu at once: our own lock app,
    /// the file sync client, a graphics driver panel, a mouse configurator, a
    /// piece of adware, and a shortcut literally called Desktop. Detection that
    /// finds everything is only useful with a rule for what to throw away.
    /// </remarks>
    private static readonly string[] NeverShow =
    {
        "bookmygame", "pclockagent", "onedrive", "onenote", "premieropinion",
        "nvidia app", "geforce", "nvidia control", "logitech", "g hub", "ghub",
        "realtek", "intel graphics", "amd software", "adrenalin", "armoury",
        "msi center", "dragon center", "razer", "corsair", "icue",
        "desktop", "this pc", "file explorer", "recycle", "network",
        "tracker", "overlay", "cleaner", "antivirus", "defender",
        "microsoft store", "get help", "tips", "weather", "news",
        // Seen on the café's own menu, none of them a game: a sleep-prevention
        // utility, a peripheral suite, a game overlay, and Roblox's authoring
        // tool sitting next to Roblox itself.
        "deskrest", "kreo", "overwolf", "roblox studio", "wallpaper engine",
        "steamworks", "redistributable", "epic games launcher",
        "media player", "movies & tv", "photos", "paint", "notepad",
        "calculator", "clock", "camera", "mail", "people", "phone link",
        "office", "word", "excel", "powerpoint", "teams", "outlook",
        "adobe", "winrar", "7-zip", "vlc", "notepad++",
    };

    /// <summary>
    /// Tiles that belong in the applications group rather than with the games.
    /// </summary>
    /// <remarks>
    /// Not junk — a customer may well want Steam or a browser. They simply are
    /// not what somebody scanning the menu for something to play is looking
    /// for, and putting them among the games is what turned it into a list to
    /// read rather than a set of choices.
    /// </remarks>
    private static readonly string[] IsAnApp =
    {
        "steam", "epic games", "xbox", "riot client", "battle.net", "ubisoft",
        "ea app", "origin", "gog galaxy", "rockstar", "play games",
        "chrome", "edge", "firefox", "opera", "browser", "discord", "spotify",
    };

    /// <summary>Whether a name should never appear on the menu at all.</summary>
    private static bool IsJunk(string name)
    {
        var lower = name.ToLowerInvariant();

        // A web shortcut Chrome made, not a game. Their names read "Fortnite -
        // Chrome", which looks like a game right up until it opens a browser.
        if (lower.EndsWith(" - chrome") || lower.EndsWith(" - edge"))
        {
            AgentLog.Info($"Skipped '{name}': a web shortcut, not a program.");
            return true;
        }

        var matched = NeverShow.FirstOrDefault(bad => lower.Contains(bad));
        if (matched is not null)
        {
            // Named, because the risk of a rule like this is a real game whose
            // title happens to contain one of these words. If that happens, the
            // log says which word did it.
            AgentLog.Info($"Skipped '{name}': matched the rule \"{matched}\".");
            return true;
        }

        return false;
    }

    private static string CategoryFor(string name)
    {
        var lower = name.ToLowerInvariant().Trim();
        if (lower is "steam" or "xbox" or "epic games" or "epic games launcher"
            or "riot client" or "battle.net" or "ubisoft connect" or "ea app"
            or "origin" or "gog galaxy" or "discord" or "spotify"
            or "google chrome" or "chrome" or "microsoft edge" or "edge"
            or "firefox" or "opera")
        {
            return "app";
        }

        return IsAnApp.Any(app => lower == app || lower.StartsWith(app + " ")) ? "app" : "game";
    }

    private static readonly string[] NotAGameShortcut =
    {
        "uninstall", "readme", "read me", "manual", "help", "support", "website",
        "web site", "homepage", "documentation", "docs", "release notes", "changelog",
        "config", "settings", "setup", "repair", "troubleshoot", "benchmark",
        "server", "dedicated", "editor", "sdk", "redistributable", "runtime",
        "visual c++", "directx", ".net", "driver", "control panel", "license",
        "eula", "report a bug", "feedback", "forum", "wiki", "discord", "activate",
    };

    /// <summary>
    /// The stores themselves, so a customer can get at anything not on the menu.
    /// </summary>
    /// <remarks>
    /// Detection cannot be complete. A game installed an hour ago, one Steam has
    /// not written a manifest for yet, something bought mid-session — a customer
    /// who can see the store can reach all of it, and without these the menu is
    /// a closed list and the answer to "where is my game" is the counter.
    /// <para>
    /// Xbox is launched through explorer rather than an exe. It is a Store app
    /// with no path to point at, and the AppsFolder shell address is the way to
    /// start one from outside.
    /// </para>
    /// </remarks>
    private static IEnumerable<GameEntry> Launchers()
    {
        var steam = SteamExe();
        if (steam is not null)
        {
            yield return new GameEntry { Name = "Steam", ExePath = steam, ProcessName = "steam", Category = "app" };
        }

        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        var epic = Path.Combine(
            programFilesX86, @"Epic Games\Launcher\Portal\Binaries\Win32\EpicGamesLauncher.exe");

        if (File.Exists(epic))
        {
            yield return new GameEntry
            {
                Name = "Epic Games",
                ExePath = epic,
                ProcessName = "EpicGamesLauncher",
                Category = "app",
            };
        }

        var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
        if (File.Exists(explorer) && XboxAppInstalled())
        {
            yield return new GameEntry
            {
                Name = "Xbox",
                ExePath = explorer,
                Arguments = @"shell:AppsFolder\Microsoft.GamingApp_8wekyb3d8bbwe!Microsoft.Xbox.App",
                // Explorer hands off and returns immediately, so the process to
                // watch is the Xbox app rather than the one that was started.
                ProcessName = "XboxPcApp",
                Category = "app",
            };
        }
    }

    /// <summary>
    /// Whether the Xbox app is on this machine.
    /// </summary>
    /// <remarks>
    /// Checked by its install folder rather than by asking Windows about
    /// packages, which needs a WinRT dependency for one yes-or-no question.
    /// </remarks>
    private static bool XboxAppInstalled()
    {
        try
        {
            var windowsApps = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WindowsApps");

            return Directory.Exists(windowsApps) &&
                   Directory.EnumerateDirectories(windowsApps, "Microsoft.GamingApp_*").Any();
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // WindowsApps is locked down. Offering the tile anyway is better
            // than hiding it: at worst it does nothing, at best it works.
            return true;
        }
    }

    /// <summary>Adds everything installed to whatever the café already listed.</summary>
    public static AgentConfig AddInstalledGames(AgentConfig config)
    {
        if (!config.ShowInstalledGames)
        {
            return config;
        }

        var found = new List<GameEntry>();

        try
        {
            // Counted per source and written to the log. Three rounds of this
            // were spent comparing a photograph of the menu against a
            // photograph of the desktop and guessing which source had missed
            // what; a line in the log answers that in one reading.
            void Take(string source, IEnumerable<GameEntry> from)
            {
                var before = found.Count;
                found.AddRange(from);
                AgentLog.Info($"  {source}: {found.Count - before}");
            }

            AgentLog.Info("Looking for installed games.");
            Take("Steam", FromSteam());
            Take("Epic", FromEpic());
            Take("Xbox", FromXboxGames());
            Take("Riot / EA / Ubisoft / other folders", FromWellKnownFolders());
            Take("Roblox", FromRoblox());
            Take("machine-wide list", FromSharedList());
            Take("desktops", FromAllDesktops());
            Take("Start Menus", FromAllStartMenus());
            Take("installed programs", FromRegistry());

            if (config.ShowLaunchers)
            {
                Take("launchers", Launchers());
            }
        }
        catch (Exception ex)
        {
            // Never a reason to show nothing. The café's own list still works.
            AgentLog.Warn($"Could not scan for installed games ({ex.Message}). Showing the café list only.");
            return config;
        }

        // The café's entries win on a name clash: they were typed by someone who
        // knows this machine, and they carry the process name that tells the
        // agent when a launcher-based game has actually finished starting.
        var known = new HashSet<string>(
            config.Games.Select(game => Normalise(game.Name)),
            StringComparer.Ordinal);

        var added = new List<GameEntry>();

        foreach (var game in found)
        {
            var key = Normalise(game.Name);
            if (key.Length < 2 || !known.Add(key))
            {
                continue;
            }

            added.Add(game);
        }

        if (added.Count == 0)
        {
            AgentLog.Info("Nothing installed that was not already on the menu.");
            return config;
        }

        AgentLog.Info($"Games: {string.Join(", ", added.Where(g => g.Category != "app").Select(g => g.Name))}");
        AgentLog.Info($"Apps: {string.Join(", ", added.Where(g => g.Category == "app").Select(g => g.Name))}");

        var games = new List<GameEntry>(config.Games);
        games.AddRange(added.OrderBy(game => game.Name, StringComparer.OrdinalIgnoreCase));

        return config.WithGames(games);
    }

    // -----------------------------------------------------------------------
    // Steam
    // -----------------------------------------------------------------------

    /// <summary>
    /// Every Steam game in every library on this machine.
    /// </summary>
    /// <remarks>
    /// Started through Steam rather than by running the game's own exe, because
    /// that is the only way that works: most of them check in with Steam on
    /// startup and refuse to run without it.
    /// </remarks>
    private static IEnumerable<GameEntry> FromSteam()
    {
        foreach (var library in SteamLibraries())
        {
            var steamapps = Path.Combine(library, "steamapps");
            if (!Directory.Exists(steamapps))
            {
                continue;
            }

            IEnumerable<string> manifests;
            try
            {
                manifests = Directory.EnumerateFiles(steamapps, "appmanifest_*.acf");
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var manifest in manifests)
            {
                GameEntry? entry = null;

                try
                {
                    var appId = AppIdFromManifest.Match(manifest).Groups[1].Value;
                    var text = File.ReadAllText(manifest);
                    var name = AcfName.Match(text).Groups[1].Value;
                    var installDir = AcfInstallDir.Match(text).Groups[1].Value;

                    if (string.IsNullOrWhiteSpace(appId) || string.IsNullOrWhiteSpace(name))
                    {
                        continue;
                    }

                    // Steam keeps manifests for its own tooling alongside the
                    // games - "Steamworks Common Redistributables" is an entry
                    // like any other, and appeared on the menu as one.
                    if (IsSteamTool(name))
                    {
                        continue;
                    }

                    // Steam keeps manifests for games it has queued or partly
                    // removed, so the folder is checked rather than trusted.
                    var folder = Path.Combine(steamapps, "common", installDir);
                    if (!Directory.Exists(folder))
                    {
                        continue;
                    }

                    var steamExe = SteamExe();
                    if (steamExe is null)
                    {
                        continue;
                    }

                    var mainExe = BestExeIn(folder);

                    entry = new GameEntry
                    {
                        Name = name,
                        ExePath = steamExe,
                        Arguments = $"-applaunch {appId}",
                        // Without this the agent would watch steam.exe, which
                        // never exits, and the menu would never come back when
                        // the customer closed the game.
                        ProcessName = mainExe is null ? null : Path.GetFileNameWithoutExtension(mainExe),
                        // And the icon comes from the game, not from Steam. This
                        // is the fallback when Steam has no artwork cached, which
                        // is otherwise how a tile ends up wearing the Steam logo.
                        IconSourcePath = mainExe,
                    };
                }
                catch (Exception ex)
                {
                    AgentLog.Warn($"Could not read {Path.GetFileName(manifest)}: {ex.Message}");
                }

                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }
    }

    /// <summary>
    /// Whether a Steam entry is one of Steam's own components.
    /// </summary>
    /// <remarks>
    /// Steam installs runtimes, redistributables and dedicated servers into the
    /// same library as the games, with manifests indistinguishable from theirs
    /// apart from the name.
    /// </remarks>
    private static bool IsSteamTool(string name)
    {
        var lower = name.ToLowerInvariant();

        return lower.Contains("redistributable")
            || lower.Contains("steamworks")
            || lower.Contains("runtime")
            || lower.Contains("dedicated server")
            || lower.Contains("sdk")
            || lower.Contains("soundtrack")
            || lower.Contains("proton")
            || lower.Contains("steam linux");
    }

    /// <summary>
    /// The executable a game folder is most likely to actually run as.
    /// </summary>
    /// <remarks>
    /// Needed because Steam is asked to launch the game, so the process that
    /// appears is the game's own and has nothing to do with steam.exe. There is
    /// no record of its name anywhere Steam exposes, so it is inferred: the
    /// largest executable that is not obviously a helper. Wrong occasionally,
    /// and when it is wrong the cost is the menu waiting out its timeout rather
    /// than anything the customer notices.
    /// </remarks>
    private static string? GuessMainExe(string folder) => BestExeIn(folder);

    /// <summary>
    /// The largest executable in a folder that is not obviously a helper.
    /// </summary>
    /// <remarks>
    /// Returns the path rather than the name, because it is wanted for two
    /// things: the process to watch, and — for a Steam game, where the file
    /// being launched is steam.exe — the file to take the icon from.
    /// </remarks>
    private static string? BestExeIn(string folder)
    {
        try
        {
            return Directory
                .EnumerateFiles(folder, "*.exe", SearchOption.TopDirectoryOnly)
                .Concat(SafeSubdirectoryExes(folder))
                .Where(path =>
                {
                    var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                    return !NotTheGame.Any(bad => name.Contains(bad));
                })
                .OrderByDescending(path => new FileInfo(path).Length)
                .FirstOrDefault();
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            return null;
        }
    }

    /// <summary>
    /// One level down as well as the root.
    /// </summary>
    /// <remarks>
    /// Plenty of games keep a stub in the root and the real executable in bin
    /// or Binaries. Bounded to one level rather than recursing, because a full
    /// walk of every Steam library at startup would hold the lock screen back
    /// on a machine with a large collection — which is exactly the machine this
    /// matters on.
    /// </remarks>
    private static IEnumerable<string> SafeSubdirectoryExes(string folder)
    {
        IEnumerable<string> children;
        try
        {
            children = Directory.EnumerateDirectories(folder);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            yield break;
        }

        foreach (var child in children)
        {
            string[] files;
            try
            {
                files = Directory.GetFiles(child, "*.exe", SearchOption.TopDirectoryOnly);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var file in files)
            {
                yield return file;
            }
        }
    }

    private static string? SteamExe()
    {
        var root = InstalledGames.FindSteamRoot();
        if (root is null)
        {
            return null;
        }

        var exe = Path.Combine(root, "steam.exe");
        return File.Exists(exe) ? exe : null;
    }

    private static List<string> SteamLibraries() => InstalledGames.FindSteamLibraries();

    // -----------------------------------------------------------------------
    // The uninstall registry
    // -----------------------------------------------------------------------

    /// <summary>
    /// Publishers whose entries are never a game.
    /// </summary>
    /// <remarks>
    /// The uninstall list is mostly not games: drivers, runtimes, browsers and
    /// the machinery of Windows itself. Filtering on the publisher removes most
    /// of it in one rule, and does it without guessing at product names.
    /// </remarks>
    private static readonly string[] NotAGamePublisher =
    {
        "microsoft", "nvidia", "intel", "advanced micro devices", "amd",
        "realtek", "logitech", "razer", "corsair", "adobe",
        "mozilla", "oracle", "python", "git", "docker", "vmware",
        "dell", "hp inc", "lenovo", "asus", "gigabyte",
    };

    /// <summary>
    /// Everything Windows knows is installed.
    /// </summary>
    /// <remarks>
    /// The catch-all, and the answer to the games no store accounts for: a
    /// title from Battle.net, one from Garena's own installer, one bought on
    /// Epic, one installed from a disc. All of them record a name and a folder
    /// here, because that is how Windows offers to uninstall them.
    /// <para>
    /// Read from HKLM as well as HKCU, and in both registry views — a 32-bit
    /// installer writes somewhere a 64-bit process does not look by default,
    /// and plenty of game installers are still 32-bit.
    /// </para>
    /// <para>
    /// This is the noisiest source by a distance, so it is also the most
    /// filtered: an entry needs a folder that exists, a plausible executable
    /// inside it, a publisher that is not a hardware vendor, and a name that
    /// survives the same rules as everything else.
    /// </para>
    /// </remarks>
    private static IEnumerable<GameEntry> FromRegistry()
    {
        const string uninstall = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

        var roots = new (RegistryHive Hive, RegistryView View)[]
        {
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32),
            (RegistryHive.CurrentUser, RegistryView.Registry64),
        };

        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (hive, view) in roots)
        {
            string[] subKeyNames;
            RegistryKey? baseKey = null;
            RegistryKey? root = null;

            try
            {
                baseKey = RegistryKey.OpenBaseKey(hive, view);
                root = baseKey.OpenSubKey(uninstall);
                if (root is null)
                {
                    continue;
                }

                subKeyNames = root.GetSubKeyNames();
            }
            catch (Exception ex)
            {
                AgentLog.Warn($"Could not read the uninstall list: {ex.Message}");
                continue;
            }
            finally
            {
                // Reopened per entry below; holding one key open across the
                // whole loop is what makes a yield-return iterator leak it.
                root?.Dispose();
                baseKey?.Dispose();
            }

            foreach (var subKeyName in subKeyNames)
            {
                var entry = ReadUninstallEntry(hive, view, uninstall, subKeyName, windows, seen);
                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }
    }

    private static GameEntry? ReadUninstallEntry(
        RegistryHive hive,
        RegistryView view,
        string uninstallPath,
        string subKeyName,
        string windows,
        HashSet<string> seen)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, view);
            using var key = baseKey.OpenSubKey($@"{uninstallPath}\{subKeyName}");
            if (key is null)
            {
                return null;
            }

            var name = key.GetValue("DisplayName") as string;
            var location = key.GetValue("InstallLocation") as string;
            var publisher = key.GetValue("Publisher") as string ?? "";

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(location))
            {
                return null;
            }

            // Components and patches. Windows hides these from Add/Remove
            // Programs for the same reason they do not belong on a menu.
            if (key.GetValue("SystemComponent") is int component && component == 1)
            {
                return null;
            }

            if (key.GetValue("ParentKeyName") is not null || key.GetValue("ParentDisplayName") is not null)
            {
                return null;
            }

            if (NotAGamePublisher.Any(bad => publisher.ToLowerInvariant().Contains(bad)))
            {
                return null;
            }

            if (IsJunk(name))
            {
                return null;
            }

            if (!Directory.Exists(location) ||
                location.StartsWith(windows, StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            var exe = BestExeIn(location);
            if (exe is null || !seen.Add(exe))
            {
                return null;
            }

            return new GameEntry
            {
                Name = name.Trim(),
                ExePath = exe,
                ProcessName = Path.GetFileNameWithoutExtension(exe),
                Category = CategoryFor(name),
            };
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read uninstall entry {subKeyName}: {ex.Message}");
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Xbox / Game Pass
    // -----------------------------------------------------------------------

    /// <summary>
    /// Games installed through the Xbox app.
    /// </summary>
    /// <remarks>
    /// Game Pass puts these in a plain folder at the root of a drive —
    /// C:\XboxGames\Forza Horizon 5\Content — rather than in WindowsApps with
    /// the Store apps, which is locked down and unreadable. Nothing was looking
    /// there, so a game downloaded from the Xbox app could never appear however
    /// many other sources were added.
    /// <para>
    /// Every fixed drive, because Game Pass installs where the space is and a
    /// café PC keeps its games on the big disk.
    /// </para>
    /// </remarks>
    private static IEnumerable<GameEntry> FromXboxGames()
    {
        DriveInfo[] drives;
        try
        {
            drives = DriveInfo.GetDrives();
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not list drives for Xbox games: {ex.Message}");
            yield break;
        }

        foreach (var drive in drives)
        {
            string root;
            try
            {
                if (drive.DriveType != DriveType.Fixed || !drive.IsReady)
                {
                    continue;
                }

                root = Path.Combine(drive.RootDirectory.FullName, "XboxGames");
                if (!Directory.Exists(root))
                {
                    continue;
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            string[] folders;
            try
            {
                folders = Directory.GetDirectories(root);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var folder in folders)
            {
                GameEntry? entry = null;

                try
                {
                    // The launchable exe lives under Content. Everything beside
                    // it is the package's own scaffolding.
                    var content = Path.Combine(folder, "Content");
                    if (!Directory.Exists(content))
                    {
                        continue;
                    }

                    var exe = BestExeIn(content);
                    if (exe is null)
                    {
                        continue;
                    }

                    entry = new GameEntry
                    {
                        Name = Path.GetFileName(folder),
                        ExePath = exe,
                        ProcessName = Path.GetFileNameWithoutExtension(exe),
                    };
                }
                catch (Exception ex)
                {
                    AgentLog.Warn($"Could not read {folder}: {ex.Message}");
                }

                if (entry is not null)
                {
                    AgentLog.Info($"Xbox game: {entry.Name}");
                    yield return entry;
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    // Epic
    // -----------------------------------------------------------------------

    private static IEnumerable<GameEntry> FromEpic()
    {
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var manifestDir = Path.Combine(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests");

        if (!Directory.Exists(manifestDir))
        {
            yield break;
        }

        IEnumerable<string> files;
        try
        {
            files = Directory.EnumerateFiles(manifestDir, "*.item");
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            yield break;
        }

        foreach (var file in files)
        {
            GameEntry? entry = null;

            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                var root = document.RootElement;

                var name = root.TryGetProperty("DisplayName", out var n) ? n.GetString() : null;
                var location = root.TryGetProperty("InstallLocation", out var l) ? l.GetString() : null;
                var executable = root.TryGetProperty("LaunchExecutable", out var e) ? e.GetString() : null;

                if (string.IsNullOrWhiteSpace(name) ||
                    string.IsNullOrWhiteSpace(location) ||
                    string.IsNullOrWhiteSpace(executable))
                {
                    continue;
                }

                var exe = Path.Combine(location, executable.Replace('/', '\\'));
                if (!File.Exists(exe))
                {
                    continue;
                }

                entry = new GameEntry
                {
                    Name = name,
                    ExePath = exe,
                    ProcessName = Path.GetFileNameWithoutExtension(exe),
                };
            }
            catch (Exception ex) when (ex is JsonException or UnauthorizedAccessException or IOException)
            {
                // A half-written manifest is Epic's business.
            }

            if (entry is not null)
            {
                yield return entry;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Desktops, Start Menus, and well-known install folders
    // -----------------------------------------------------------------------

    private static IEnumerable<GameEntry> FromAllDesktops() =>
        FromShortcutFolders(ProfilePaths("Desktop", includePublicDesktop: true), SearchOption.TopDirectoryOnly, launchShortcutFile: true);

    private static IEnumerable<GameEntry> FromAllStartMenus()
    {
        var folders = ProfilePaths(Path.Combine("AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs"), includePublicDesktop: false)
            .Append(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms));

        return FromShortcutFolders(folders, SearchOption.AllDirectories, launchShortcutFile: true);
    }

    /// <summary>
    /// Every user profile this account can read — not only the logged-in one.
    /// </summary>
    /// <remarks>
    /// Games are often installed while signed in as the administrator, so the
    /// shortcuts live on that desktop. The lock agent runs as the customer
    /// account and used to look only at its own profile, which is empty on a
    /// café PC that never puts icons on the public desktop.
    /// </remarks>
    private static IEnumerable<string> ProfilePaths(string relative, bool includePublicDesktop)
    {
        if (includePublicDesktop)
        {
            yield return Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
        }

        var users = Path.Combine(Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\", "Users");
        if (!Directory.Exists(users))
        {
            yield break;
        }

        string[] profiles;
        try
        {
            profiles = Directory.GetDirectories(users);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            yield break;
        }

        foreach (var profile in profiles)
        {
            var name = Path.GetFileName(profile);
            if (name is "Default" or "Default User" or "All Users" or "Public")
            {
                continue;
            }

            yield return Path.Combine(profile, relative);
        }
    }

    private static IEnumerable<GameEntry> FromShortcutFolders(
        IEnumerable<string> folders,
        SearchOption search,
        bool launchShortcutFile)
    {
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var folder in folders.Where(f => !string.IsNullOrWhiteSpace(f) && Directory.Exists(f)))
        {
            IEnumerable<string> shortcuts;
            try
            {
                shortcuts = Directory.GetFiles(folder, "*.lnk", search)
                    .Concat(Directory.GetFiles(folder, "*.url", search));
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var shortcut in shortcuts)
            {
                var entry = EntryFromShortcut(shortcut, windows, seen, launchShortcutFile);
                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }
    }

    /// <summary>
    /// Install folders cafés actually use, even when nobody made a shortcut.
    /// </summary>
    private static IEnumerable<GameEntry> FromWellKnownFolders()
    {
        var skip = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Launcher", "Engine", "DirectX", "DirectXRedist", "Redist", "EasyAntiCheat",
            "Battle.net", "Agent", "Support", "Uninstall",
        };

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in WellKnownGameRoots())
        {
            if (!Directory.Exists(root))
            {
                continue;
            }

            string[] children;
            try
            {
                children = Directory.GetDirectories(root);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var child in children)
            {
                var folderName = Path.GetFileName(child);
                if (skip.Contains(folderName) || IsJunk(folderName))
                {
                    continue;
                }

                var exe = BestExeIn(child);
                if (exe is null || !seen.Add(exe))
                {
                    continue;
                }

                yield return new GameEntry
                {
                    Name = folderName,
                    ExePath = exe,
                    ProcessName = Path.GetFileNameWithoutExtension(exe),
                    IconSourcePath = exe,
                    Category = CategoryFor(folderName),
                };
            }
        }
    }

    private static IEnumerable<string> WellKnownGameRoots()
    {
        var names = new[]
        {
            "Riot Games",
            "EA Games",
            "Electronic Arts",
            "Rockstar Games",
            "Garena",
            "Ubisoft",
            "Epic Games",
            "Call of Duty",
            "Activision",
            "Battle.net",
        };

        DriveInfo[] drives;
        try
        {
            drives = DriveInfo.GetDrives();
        }
        catch
        {
            yield break;
        }

        foreach (var drive in drives)
        {
            string root;
            try
            {
                if (drive.DriveType != DriveType.Fixed || !drive.IsReady)
                {
                    continue;
                }

                root = drive.RootDirectory.FullName;
            }
            catch
            {
                continue;
            }

            foreach (var name in names)
            {
                yield return Path.Combine(root, name);
                yield return Path.Combine(root, "Program Files", name);
                yield return Path.Combine(root, "Program Files (x86)", name);
                yield return Path.Combine(root, "Games", name);
            }
        }
    }

    private static IEnumerable<GameEntry> FromRoblox()
    {
        var versions = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Roblox",
            "Versions");

        if (!Directory.Exists(versions))
        {
            yield break;
        }

        string? newest = null;
        DateTime newestTime = DateTime.MinValue;

        try
        {
            foreach (var folder in Directory.GetDirectories(versions))
            {
                var exe = Path.Combine(folder, "RobloxPlayerBeta.exe");
                if (!File.Exists(exe))
                {
                    continue;
                }

                var written = Directory.GetLastWriteTimeUtc(folder);
                if (written >= newestTime)
                {
                    newestTime = written;
                    newest = exe;
                }
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            yield break;
        }

        if (newest is not null)
        {
            yield return new GameEntry
            {
                Name = "Roblox Player",
                ExePath = newest,
                ProcessName = "RobloxPlayerBeta",
            };
        }
    }

    /// <summary>
    /// The list SYSTEM wrote of what is installed for every account.
    /// </summary>
    private static IEnumerable<GameEntry> FromSharedList()
    {
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "BookMyGame",
            "installed-games.json");

        if (!File.Exists(path))
        {
            AgentLog.Info(
                "No installed-games.json yet. Only games this account can see itself " +
                "will be listed - re-run install-startup.ps1 to set up the scan.");
            yield break;
        }

        List<GameEntry> entries;

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            entries = new List<GameEntry>();

            foreach (var element in document.RootElement.EnumerateArray())
            {
                var name = element.TryGetProperty("name", out var n) ? n.GetString() : null;
                var exe = element.TryGetProperty("exePath", out var e) ? e.GetString() : null;
                var arguments = element.TryGetProperty("arguments", out var a) ? a.GetString() : null;

                if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(exe))
                {
                    continue;
                }

                if (!File.Exists(exe) || IsJunk(name))
                {
                    continue;
                }

                entries.Add(new GameEntry
                {
                    Name = name,
                    ExePath = exe,
                    Arguments = string.IsNullOrWhiteSpace(arguments) ? null : arguments,
                    ProcessName = Path.GetFileNameWithoutExtension(exe),
                    Category = CategoryFor(name),
                });
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read installed-games.json: {ex.Message}");
            yield break;
        }

        AgentLog.Info($"Read {entries.Count} game(s) from the machine-wide list.");

        foreach (var entry in entries)
        {
            yield return entry;
        }
    }

    /// <summary>
    /// Turns one shortcut into a menu tile, or decides it is not one.
    /// </summary>
    /// <remarks>
    /// Shared by the desktop and the Start Menu because the judgement is the
    /// same in both places, and the Start Menu is where getting it wrong shows:
    /// it holds an order of magnitude more shortcuts, most of which are not
    /// games.
    /// </remarks>
    private static readonly string[] SharedLaunchers =
    {
        "steam", "epicgameslauncher", "riotclientservices", "riotclient",
        "battle.net", "agent", "upc", "ubisoftconnect", "eadesktop", "origin",
        "galaxyclient", "playgames", "explorer",
    };

    private static bool IsSharedLauncher(string target)
    {
        var name = Path.GetFileNameWithoutExtension(target).ToLowerInvariant();
        return SharedLaunchers.Contains(name);
    }

    private static GameEntry? EntryFromShortcut(
        string shortcut,
        string windows,
        HashSet<string> seen,
        bool launchShortcutFile)
    {
        try
        {
            var label = Path.GetFileNameWithoutExtension(shortcut);
            var lowerLabel = label.ToLowerInvariant();

            if (NotAGameShortcut.Any(bad => lowerLabel.Contains(bad)))
            {
                return null;
            }

            if (IsJunk(label))
            {
                return null;
            }

            var (target, arguments) = shortcut.EndsWith(".url", StringComparison.OrdinalIgnoreCase)
                ? ResolveUrlShortcut(shortcut)
                : ResolveShortcut(shortcut);

            var identity = launchShortcutFile
                ? shortcut
                : string.IsNullOrWhiteSpace(target)
                    ? shortcut
                    : string.IsNullOrWhiteSpace(arguments)
                        ? target
                        : $"{target}|{arguments}";

            if (!seen.Add(identity))
            {
                return null;
            }

            var targetOk = !string.IsNullOrWhiteSpace(target)
                && target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                && File.Exists(target)
                && !target.StartsWith(windows, StringComparison.OrdinalIgnoreCase);

            if (targetOk)
            {
                var fileName = Path.GetFileNameWithoutExtension(target).ToLowerInvariant();
                if (NotTheGame.Any(bad => fileName.Contains(bad)))
                {
                    return null;
                }

                var launchesSteamGame =
                    Path.GetFileNameWithoutExtension(target).Equals("steam", StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(arguments);

                return new GameEntry
                {
                    Name = label,
                    ExePath = target!,
                    Arguments = arguments,
                    ProcessName = launchesSteamGame || IsSharedLauncher(target!)
                        ? null
                        : Path.GetFileNameWithoutExtension(target),
                    IconSourcePath = target,
                    Category = CategoryFor(label),
                };
            }

            // Store games, Epic protocol links, and anything whose real exe is
            // unreadable (WindowsApps) still have a working desktop icon.
            if (!launchShortcutFile)
            {
                return null;
            }

            return new GameEntry
            {
                Name = label,
                ExePath = shortcut,
                IconSourcePath = shortcut,
                Category = CategoryFor(label),
            };
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read {Path.GetFileName(shortcut)}: {ex.Message}");
            return null;
        }
    }

    /// <summary>Reads a .url internet shortcut (Steam and Epic write these).</summary>
    private static (string? Target, string? Arguments) ResolveUrlShortcut(string path)
    {
        try
        {
            foreach (var line in File.ReadLines(path))
            {
                if (line.StartsWith("URL=", StringComparison.OrdinalIgnoreCase))
                {
                    return (line[4..].Trim(), null);
                }
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            AgentLog.Warn($"Could not read {Path.GetFileName(path)}: {ex.Message}");
        }

        return (null, null);
    }

    /// <summary>
    /// Reads where a .lnk points.
    /// </summary>
    /// <remarks>
    /// Through the scripting host's COM object rather than a shell interop
    /// declaration: it is three lines, it has been on every Windows since the
    /// nineties, and the alternative is hand-writing IShellLink for the sake of
    /// avoiding one late-bound call.
    /// </remarks>
    private static (string? Target, string? Arguments) ResolveShortcut(string path)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null)
        {
            return (null, null);
        }

        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            if (shell is null)
            {
                return (null, null);
            }

            var link = shellType.InvokeMember(
                "CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { path });

            var target = link?.GetType().InvokeMember(
                "TargetPath", System.Reflection.BindingFlags.GetProperty, null, link, null) as string;

            // The arguments matter as much as the target, and dropping them was
            // a real bug. Steam writes its desktop shortcuts as steam.exe with
            // the game in the arguments - so without these, every Steam game
            // found this way became a tile that opened Steam and nothing else,
            // wearing the Steam logo because that is the executable it pointed
            // at.
            var arguments = link?.GetType().InvokeMember(
                "Arguments", System.Reflection.BindingFlags.GetProperty, null, link, null) as string;

            return (target, string.IsNullOrWhiteSpace(arguments) ? null : arguments);
        }
        finally
        {
            if (shell is not null && System.Runtime.InteropServices.Marshal.IsComObject(shell))
            {
                System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
            }
        }
    }

    private static string Normalise(string value) =>
        new string(value.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();
}
