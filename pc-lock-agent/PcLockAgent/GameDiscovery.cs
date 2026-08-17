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
/// the menu now rather than the whole of it. Steam, Epic, Xbox, desktops,
/// the SYSTEM-written machine list, filtered Start Menu entries, and
/// well-known install folders are scanned. Windows tools are stripped at
/// the end so Disk Cleanup cannot return.
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
    /// <summary>
    /// Substrings that always mean "not a game". Kept long on purpose —
    /// short words like "clock" or "network" used as Contains() matches
    /// hide real titles.
    /// </summary>
    private static readonly string[] NeverShow =
    {
        "bookmygame", "pclockagent", "onedrive", "onenote", "premieropinion",
        "nvidia app", "geforce experience", "nvidia control", "logitech", "g hub", "ghub",
        "realtek", "intel graphics", "amd software", "adrenalin", "armoury crate",
        "msi center", "dragon center", "razer synapse", "corsair", "icue",
        "this pc", "file explorer", "recycle bin",
        "antivirus", "windows defender",
        "microsoft store", "get help",
        "deskrest", "kreo", "overwolf", "roblox studio", "wallpaper engine",
        "steamworks", "redistributable", "epic games launcher", "epic online services",
        "media player", "movies & tv", "phone link",
        "notepad++", "winrar", "7-zip",
        "computer management", "dfrgui", "disk cleanup", "cleanmgr",
        "event viewer", "eventvwr", "iscsi initiator", "live captions",
        "memory diagnostics", "memory diagnostic", "narrator", "odbc data",
        "on-screen keyboard", "onebrowser", "control panel", "task manager",
        "resource monitor", "performance monitor", "registry editor",
        "command prompt", "windows powershell", "windows tools",
        "administrative tools", "snipping tool", "character map",
        "remote desktop connection", "windows security",
        "device manager", "disk management", "task scheduler",
        "system configuration", "msconfig", "windows terminal",
        "microsoft teams",
    };

    /// <summary>Exact names that are never games (short words unsafe as Contains).</summary>
    private static readonly string[] NeverShowExact =
    {
        "desktop", "network", "tips", "weather", "news", "photos", "paint",
        "notepad", "calculator", "clock", "camera", "mail", "people",
        "osk", "vlc", "discord", "spotify", "chrome", "edge", "firefox",
        "steam", "xbox", "settings", "magnify", "magnifier",
        "word", "excel", "powerpoint", "outlook", "teams",
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
        "steam", "epic games", "epic games launcher", "xbox", "riot client",
        "battle.net", "ubisoft connect", "ea app", "origin", "gog galaxy",
        "rockstar games launcher", "social club", "rockstar games social club",
        "google play games", "play games",
        "google chrome", "microsoft edge", "firefox", "opera",
        "discord", "spotify", "browse the internet",
    };

    /// <summary>Whether this tile belongs in the applications group.</summary>
    /// <remarks>
    /// Asks the name as well as the stored category, because the café's own
    /// dashboard entries arrive with no category at all — without the name
    /// check, a hand-typed "Steam" row lands among the games.
    /// </remarks>
    public static bool IsApp(GameEntry game) =>
        string.Equals(game.Category, "app", StringComparison.OrdinalIgnoreCase)
        || string.Equals(CategoryFor(game.Name ?? string.Empty), "app", StringComparison.Ordinal);

    /// <summary>Whether a name should never appear on the menu at all.</summary>
    private static bool IsJunk(string name)
    {
        var lower = name.ToLowerInvariant().Trim();

        // Launchers and the browser are apps, not junk. The deny lists below
        // still name them, because they were written when the menu was games
        // only and anything else had to go. Now that applications have their
        // own group, being one is a reason to keep the tile.
        if (string.Equals(CategoryFor(lower), "app", StringComparison.Ordinal))
        {
            return false;
        }

        if (lower.EndsWith(" - chrome") || lower.EndsWith(" - edge"))
        {
            AgentLog.Info($"Skipped '{name}': a web shortcut, not a program.");
            return true;
        }

        if (NeverShowExact.Any(bad => lower == bad))
        {
            AgentLog.Info($"Skipped '{name}': exact non-game name.");
            return true;
        }

        var matched = NeverShow.FirstOrDefault(bad => lower.Contains(bad));
        if (matched is not null)
        {
            AgentLog.Info($"Skipped '{name}': matched the rule \"{matched}\".");
            return true;
        }

        return false;
    }

    private static readonly string[] WindowsToolExes =
    {
        "mmc", "dfrgui", "cleanmgr", "eventvwr", "iscsicpl", "odbcad32",
        "osk", "narrator", "magnify", "msdt", "control", "compmgmtlauncher",
        "perfmon", "resmon", "taskschd", "regedit", "cmd", "powershell",
        "powershell_ise", "wt", "snippingtool", "sndvol", "write", "wordpad",
        "mspaint", "notepad", "calc", "charmap", "mstsc", "taskmgr",
        "devmgmt", "diskmgmt", "services", "msconfig", "wf", "firewall",
        "taskmgr",
    };

    private static readonly string[] JunkShortcutFolders =
    {
        "administrative tools", "windows tools", "windows administrative tools",
        "system tools", "accessibility", "ease of access", "accessories",
        "maintenance", "windows powershell", "system32", "syswow64",
    };

    /// <summary>Windows settings and MMC snap-ins, never a game tile.</summary>
    private static bool LooksLikeWindowsTool(string name, string? path)
    {
        var lowerName = name.ToLowerInvariant();
        if (WindowsToolExes.Any(tool => lowerName == tool || lowerName.Replace(" ", "") == tool))
        {
            return true;
        }

        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        var lowerPath = path.ToLowerInvariant();
        if (JunkShortcutFolders.Any(folder => lowerPath.Contains(folder)))
        {
            return true;
        }

        var exe = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
        return WindowsToolExes.Contains(exe);
    }

    private static string CategoryFor(string name)
    {
        var lower = name.ToLowerInvariant().Trim();
        if (IsAnApp.Any(app => lower == app))
        {
            return "app";
        }

        // Exact launcher names only — "Ubisoft" as a folder parent is fine,
        // but "Ubisoft Connect" is the store app.
        if (lower is "steam" or "xbox" or "epic games" or "epic games launcher"
            or "riot client" or "battle.net" or "ubisoft connect" or "ea app"
            or "origin" or "gog galaxy" or "discord" or "spotify"
            or "google chrome" or "chrome" or "microsoft edge" or "edge"
            or "firefox" or "opera" or "browse the internet")
        {
            return "app";
        }

        return "game";
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
            // Shared list first: SYSTEM copied shortcuts into ProgramData so the
            // lock user can open admin-desktop games. Without this, that account
            // only sees the handful of titles installed for everyone.
            Take("machine-wide list", FromSharedList());
            Take("Steam", FromSteam());
            Take("Steam folders", FromSteamCommonFolders());
            Take("Epic", FromEpic());
            // Before the folder scan, deliberately. When a Game Pass title is
            // found both ways the shell entry has to win: its executable is
            // licence-checked and refuses to start when run directly, so the
            // folder scan's version of the same game is a tile that does
            // nothing.
            Take("Store / Xbox apps", FromStoreApps());
            Take("Xbox", FromXboxGames());
            Take("Riot / EA / Ubisoft / other folders", FromWellKnownFolders());
            Take("Roblox", FromRoblox());
            Take("desktops", FromAllDesktops());
            Take("Start Menus", FromAllStartMenus());
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

            if (IsJunk(game.Name) || LooksLikeWindowsTool(game.Name, game.ExePath))
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

        AgentLog.Info($"Games: {string.Join(", ", added.Where(g => !IsApp(g)).Select(g => g.Name))}");
        AgentLog.Info($"Apps: {string.Join(", ", added.Where(IsApp).Select(g => g.Name))}");

        var games = new List<GameEntry>(config.Games);
        games.AddRange(added.OrderBy(game => game.Name, StringComparer.OrdinalIgnoreCase));

        return KeepMenuItemsOnly(config.WithGames(games));
    }

    /// <summary>
    /// Last pass: the menu is games and the handful of applications worth
    /// offering, and nothing else.
    /// </summary>
    /// <remarks>
    /// Discovery, the café catalog, a leftover installed-games.json, and the
    /// browser tile all feed the same list. A denylist on the way in is not
    /// enough — Computer Management still arrived via a Start Menu dump that
    /// never went through those checks. Everything that reaches the lock
    /// screen has to survive this gate.
    /// <para>
    /// This used to keep games alone, which is why Steam, Epic, Xbox and the
    /// browser tile were built and then silently thrown away. Launchers are
    /// how several of the games are started, so removing them removed the way
    /// in as well as the tile.
    /// </para>
    /// </remarks>
    public static AgentConfig KeepMenuItemsOnly(AgentConfig config)
    {
        var kept = config.Games.Where(IsMenuItem).ToList();
        var dropped = config.Games.Count - kept.Count;

        if (dropped > 0)
        {
            var games = kept.Count(g => !IsApp(g));
            AgentLog.Info(
                $"Removed {dropped} tile(s) that were neither. "
                + $"Menu has {games} game(s) and {kept.Count - games} app(s).");
        }

        return config.WithGames(kept);
    }

    /// <summary>Whether a tile belongs on the menu at all, game or app.</summary>
    public static bool IsMenuItem(GameEntry game) => IsPlayableGame(game) || IsUsableApp(game);

    /// <summary>Whether this is an application the customer may legitimately want.</summary>
    public static bool IsUsableApp(GameEntry game)
    {
        if (!IsApp(game) || string.IsNullOrWhiteSpace(game.Name) || string.IsNullOrWhiteSpace(game.ExePath))
        {
            return false;
        }

        if (LooksLikeWindowsTool(game.Name, game.ExePath) || IsCustomerWritablePath(game.ExePath))
        {
            return false;
        }

        return File.Exists(game.ExePath)
            || LooksLikeShortcut(game.ExePath)
            || IsProtocolLaunch(game.ExePath)
            || IsStoreGameLaunch(game.ExePath, game.Arguments ?? string.Empty);
    }

    /// <summary>Whether this tile is something a customer came in to play.</summary>
    public static bool IsPlayableGame(GameEntry game)
    {
        if (string.IsNullOrWhiteSpace(game.Name) || string.IsNullOrWhiteSpace(game.ExePath))
        {
            return false;
        }

        if (IsApp(game))
        {
            return false;
        }

        if (IsJunk(game.Name) || LooksLikeWindowsTool(game.Name, game.ExePath))
        {
            return false;
        }

        if (IsCustomerWritablePath(game.ExePath))
        {
            return false;
        }

        var path = game.ExePath;
        var args = game.Arguments ?? string.Empty;

        // Steam / Epic / Xbox Store launches are games even when the exe is a
        // shared launcher or explorer.exe.
        if (IsGameLauncherLaunch(path, args) || IsStoreGameLaunch(path, args))
        {
            return true;
        }

        // Desktop .lnk / .url that still exists — the café put it there on purpose.
        if (LooksLikeShortcut(path) && File.Exists(path))
        {
            return !LooksLikeWindowsTool(game.Name, path);
        }

        if (IsSystemPath(path))
        {
            return false;
        }

        return File.Exists(path) || LooksLikeShortcut(path) || IsProtocolLaunch(path);
    }

    /// <summary>
    /// Whether this starts through a protocol rather than by opening a file.
    /// </summary>
    /// <remarks>
    /// steam://, com.epicgames.launcher:// and the rest are how a launcher-owned
    /// game is started when the executable itself is out of reach — which, on
    /// the account customers actually use, is most of them.
    /// </remarks>
    private static bool IsProtocolLaunch(string path) =>
        path.Contains("://", StringComparison.Ordinal);

    private static bool LooksLikeShortcut(string path) =>
        path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
        || path.EndsWith(".url", StringComparison.OrdinalIgnoreCase);

    private static bool IsGameLauncherLaunch(string path, string args)
    {
        var exe = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(args))
        {
            return false;
        }

        return exe is "steam" or "epicgameslauncher" or "riotclientservices"
            or "battle.net" or "upc" or "ubisoftconnect" or "eadesktop" or "origin";
    }

    private static bool IsStoreGameLaunch(string path, string args) =>
        Path.GetFileName(path).Equals("explorer.exe", StringComparison.OrdinalIgnoreCase)
        && args.Contains("shell:AppsFolder", StringComparison.OrdinalIgnoreCase)
        && !args.Contains("Microsoft.Windows", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Folders the locked customer can drop a file into.
    /// </summary>
    /// <remarks>
    /// The menu is built partly from games-cache.json, which sits in the
    /// customer account's own AppData because that is where the agent can
    /// write. So the account being locked out can add a tile — and the only
    /// thing stopping that tile from being anything at all is where its
    /// executable lives.
    /// <para>
    /// Downloads and Temp are how a file gets onto a kiosk PC in the first
    /// place. No game installs to either, so refusing to launch from them
    /// costs nothing and closes the obvious route out.
    /// </para>
    /// </remarks>
    private static readonly string[] CustomerWritableFolders =
    {
        @"\downloads\", @"\appdata\local\temp\", @"\appdata\roaming\temp\",
        @"\windows\temp\", @"\$recycle.bin\", @"\browser-profile\",
    };

    /// <summary>Whether this is somewhere the customer could have put a file.</summary>
    private static bool IsCustomerWritablePath(string path)
    {
        var lower = path.Replace('/', '\\').ToLowerInvariant();
        var matched = CustomerWritableFolders.FirstOrDefault(folder => lower.Contains(folder));

        if (matched is null)
        {
            return false;
        }

        AgentLog.Warn(
            $"Refusing to launch from '{path}': anything under '{matched.Trim('\\')}' "
            + "can be written by the customer.");
        return true;
    }

    private static bool IsSystemPath(string path)
    {
        var lower = path.Replace('/', '\\').ToLowerInvariant();
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows).ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(windows) && lower.StartsWith(windows))
        {
            return true;
        }

        return JunkShortcutFolders.Any(folder => lower.Contains(folder))
            || lower.Contains(@"\windows nt\")
            || lower.Contains(@"\windows defender\")
            || lower.Contains(@"\windowsapps\microsoft.windows");
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
    /// Games sitting in steamapps\common without a readable manifest.
    /// </summary>
    private static IEnumerable<GameEntry> FromSteamCommonFolders()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var library in SteamLibraries())
        {
            var common = Path.Combine(library, "steamapps", "common");
            if (!Directory.Exists(common))
            {
                continue;
            }

            string[] folders;
            try
            {
                folders = Directory.GetDirectories(common);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var folder in folders)
            {
                var name = Path.GetFileName(folder);
                if (string.IsNullOrWhiteSpace(name) || IsJunk(name) || IsSteamTool(name))
                {
                    continue;
                }

                var mainExe = BestExeIn(folder);
                if (mainExe is null || !seen.Add(mainExe))
                {
                    continue;
                }

                yield return new GameEntry
                {
                    Name = name,
                    ExePath = mainExe,
                    ProcessName = Path.GetFileNameWithoutExtension(mainExe),
                    IconSourcePath = mainExe,
                };
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
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in XboxGameRoots())
        {
            string[] folders;
            try
            {
                if (!Directory.Exists(root))
                {
                    continue;
                }

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
                    var name = Path.GetFileName(folder);
                    if (string.IsNullOrWhiteSpace(name)
                        || name.Equals("GameSave", StringComparison.OrdinalIgnoreCase)
                        || IsJunk(name))
                    {
                        continue;
                    }

                    // Prefer Content\, but some titles keep the exe one level up.
                    var content = Path.Combine(folder, "Content");
                    var search = Directory.Exists(content) ? content : folder;
                    var exe = BestExeInDeep(search, maxDepth: 3);
                    if (exe is null || !seen.Add(exe))
                    {
                        continue;
                    }

                    entry = new GameEntry
                    {
                        Name = name,
                        ExePath = exe,
                        ProcessName = Path.GetFileNameWithoutExtension(exe),
                        IconSourcePath = exe,
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

    /// <summary>Every XboxGames folder, including drives that relocated it.</summary>
    /// <summary>
    /// Every packaged app Windows knows about, which is the only way to find
    /// an Xbox Game Pass title.
    /// </summary>
    /// <remarks>
    /// Scanning C:\XboxGames does not work, for two reasons that both bite.
    /// A Game Pass install is ACL-locked — the customer account cannot list
    /// what is inside Content\, so the walk finds no executable and moves on.
    /// And even when it does find one, running it directly fails: those builds
    /// are licence-checked and must be started through the Store.
    /// <para>
    /// Asking the shell avoids both. shell:AppsFolder is the same list the
    /// Start Menu shows, it needs no permissions, it does not care which drive
    /// the game is on, and the identifier it returns is exactly what launches
    /// the game. Forza appeared on one café's menu only because a folder scan
    /// happened to reach it; Call of Duty and Resident Evil Village, installed
    /// the same way, did not.
    /// </para>
    /// </remarks>
    private static IEnumerable<GameEntry> FromStoreApps()
    {
        var results = new List<GameEntry>();

        // The folder names alone. Windows locks what is inside a Game Pass
        // install, but listing the games' own folders needs no permission.
        var installedGameFolders = XboxGameFolderNames();
        if (installedGameFolders.Count == 0)
        {
            return results;
        }

        var shellType = Type.GetTypeFromProgID("Shell.Application");
        if (shellType is null)
        {
            return results;
        }

        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            if (shell is null)
            {
                return results;
            }

            const System.Reflection.BindingFlags Call = System.Reflection.BindingFlags.InvokeMethod;
            const System.Reflection.BindingFlags Get = System.Reflection.BindingFlags.GetProperty;

            var folder = shellType.InvokeMember(
                "NameSpace", Call, null, shell, new object[] { "shell:AppsFolder" });
            var items = folder?.GetType().InvokeMember("Items", Call, null, folder, null);
            if (items is null)
            {
                return results;
            }

            var count = items.GetType().InvokeMember("Count", Get, null, items, null) as int? ?? 0;

            for (var i = 0; i < count; i++)
            {
                try
                {
                    var item = items.GetType().InvokeMember("Item", Call, null, items, new object[] { i });
                    if (item is null)
                    {
                        continue;
                    }

                    var name = item.GetType().InvokeMember("Name", Get, null, item, null) as string;
                    var appId = item.GetType().InvokeMember("Path", Get, null, item, null) as string;

                    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(appId))
                    {
                        continue;
                    }

                    // A packaged app's id looks like Publisher.Name_hash!AppId.
                    // Anything without the bang is an ordinary program, already
                    // covered by every other source here.
                    if (!appId.Contains('!') || IsJunk(name))
                    {
                        continue;
                    }

                    // Positive test, not a deny list. Naming the Microsoft
                    // packages to exclude put Click to Do, Get Started, 365
                    // Copilot and Clipchamp on a café menu — Clipchamp is not
                    // even published by Microsoft, so no amount of matching on
                    // "microsoft." was ever going to hold.
                    //
                    // A game installed by the Xbox app has a folder of its own
                    // under a gaming root. That listing is readable even though
                    // what is inside it is not, so it says which of these
                    // packages is a game without guessing from a name.
                    if (!installedGameFolders.Contains(name.Trim()))
                    {
                        continue;
                    }

                    results.Add(new GameEntry
                    {
                        Name = name,
                        ExePath = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe"),
                        Arguments = $@"shell:AppsFolder\{appId}",

                        // Nothing to watch: explorer hands off and exits, and
                        // the game runs as a process named after itself.
                        ProcessName = null,
                        IconSourcePath = $@"shell:AppsFolder\{appId}",
                        Category = CategoryFor(name),
                    });
                }
                catch
                {
                    // One unreadable entry is not a reason to lose the rest.
                }
            }

            AgentLog.Info($"Store/Xbox apps found: {results.Count}");
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read the Store app list: {ex.Message}");
        }
        finally
        {
            if (shell is not null && System.Runtime.InteropServices.Marshal.IsComObject(shell))
            {
                System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
            }
        }

        return results;
    }

    /// <summary>Names of the game folders under every gaming root on this PC.</summary>
    private static HashSet<string> XboxGameFolderNames()
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in XboxGameRoots())
        {
            try
            {
                if (!Directory.Exists(root))
                {
                    continue;
                }

                foreach (var folder in Directory.GetDirectories(root))
                {
                    var name = Path.GetFileName(folder);
                    if (!string.IsNullOrWhiteSpace(name)
                        && !name.Equals("GameSave", StringComparison.OrdinalIgnoreCase))
                    {
                        names.Add(name);
                    }
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                // Nothing to be done about a root we cannot list.
            }
        }

        AgentLog.Info($"Game folders under the Xbox roots: {names.Count}");
        return names;
    }

    private static IEnumerable<string> XboxGameRoots()
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

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
            string driveRoot;
            try
            {
                if (drive.DriveType != DriveType.Fixed || !drive.IsReady)
                {
                    continue;
                }

                driveRoot = drive.RootDirectory.FullName;
            }
            catch
            {
                continue;
            }

            var defaultRoot = Path.Combine(driveRoot, "XboxGames");
            if (Directory.Exists(defaultRoot))
            {
                found.Add(defaultRoot);
            }

            // Xbox writes .GamingRoot when the library is not on C:\XboxGames.
            var marker = Path.Combine(driveRoot, ".GamingRoot");
            if (!File.Exists(marker))
            {
                continue;
            }

            try
            {
                var text = File.ReadAllText(marker);
                foreach (Match match in Regex.Matches(text, @"[A-Za-z]:\\[^<>:""|?*\r\n]+"))
                {
                    var path = match.Value.Trim();
                    if (Directory.Exists(path))
                    {
                        found.Add(path);
                    }
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                // Keep the default roots we already have.
            }
        }

        foreach (var root in found)
        {
            yield return root;
        }
    }

    /// <summary>Like BestExeIn, but walks a few folders deep for Xbox layouts.</summary>
    private static string? BestExeInDeep(string folder, int maxDepth)
    {
        try
        {
            return Directory
                .EnumerateFiles(folder, "*.exe", SearchOption.AllDirectories)
                .Where(path =>
                {
                    var depth = path.Substring(folder.Length).Count(c => c is '\\' or '/');
                    if (depth > maxDepth)
                    {
                        return false;
                    }

                    var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                    return !NotTheGame.Any(bad => name.Contains(bad));
                })
                .OrderByDescending(path => new FileInfo(path).Length)
                .FirstOrDefault();
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            return BestExeIn(folder);
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
                    string.IsNullOrWhiteSpace(executable) ||
                    IsJunk(name))
                {
                    continue;
                }

                var exe = Path.Combine(location, executable.Replace('/', '\\'));

                if (File.Exists(exe))
                {
                    entry = new GameEntry
                    {
                        Name = name,
                        ExePath = exe,
                        ProcessName = Path.GetFileNameWithoutExtension(exe),
                    };
                }
                else
                {
                    // The manifest says it is installed, so it is — this account
                    // just cannot read the folder. Dropping the game here is why
                    // a library full of titles showed as a handful: the customer
                    // account has no rights over games installed by the
                    // administrator, and every one of them failed this check.
                    //
                    // The launcher can start it without us reaching the file, and
                    // is how Epic's own shortcuts do it anyway.
                    var appName = root.TryGetProperty("AppName", out var a) ? a.GetString() : null;
                    if (string.IsNullOrWhiteSpace(appName))
                    {
                        AgentLog.Info($"Skipped Epic game '{name}': no AppName and {exe} is unreadable.");
                        continue;
                    }

                    AgentLog.Info($"Epic game '{name}' will start through the launcher ({exe} is unreadable).");

                    entry = new GameEntry
                    {
                        Name = name,
                        ExePath = $"com.epicgames.launcher://apps/{appName}?action=launch&silent=true",
                        ProcessName = Path.GetFileNameWithoutExtension(executable),
                    };
                }
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

        return FromShortcutFolders(folders, SearchOption.AllDirectories, launchShortcutFile: true)
            .Where(IsMenuItem);
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
                var lowerPath = shortcut.ToLowerInvariant();
                if (JunkShortcutFolders.Any(folder => lowerPath.Contains(folder)))
                {
                    continue;
                }

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
            "Battle.net", "Agent", "Support", "Uninstall", "Epic Online Services",
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

                foreach (var candidate in GameFoldersUnder(child, folderName))
                {
                    var exe = BestExeIn(candidate.Folder);
                    if (exe is null || !seen.Add(exe))
                    {
                        continue;
                    }

                    var entry = new GameEntry
                    {
                        Name = candidate.Name,
                        ExePath = exe,
                        ProcessName = Path.GetFileNameWithoutExtension(exe),
                        IconSourcePath = exe,
                        Category = CategoryFor(candidate.Name),
                    };

                    if (IsMenuItem(entry))
                    {
                        yield return entry;
                    }
                }
            }
        }
    }

    private static IEnumerable<(string Name, string Folder)> GameFoldersUnder(string folder, string name)
    {
        yield return (name, folder);

        // Battle.net / Garena often nest the real game one level down.
        string[] nested;
        try
        {
            nested = Directory.GetDirectories(folder);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            yield break;
        }

        foreach (var child in nested)
        {
            var nestedName = Path.GetFileName(child);
            if (skipFolderName(nestedName))
            {
                continue;
            }

            yield return ($"{name} — {nestedName}", child);
        }

        static bool skipFolderName(string nestedName) =>
            nestedName.Equals("Launcher", StringComparison.OrdinalIgnoreCase)
            || nestedName.Equals("Engine", StringComparison.OrdinalIgnoreCase)
            || nestedName.Equals("Support", StringComparison.OrdinalIgnoreCase)
            || nestedName.Equals("Redist", StringComparison.OrdinalIgnoreCase)
            || nestedName.Equals("DirectX", StringComparison.OrdinalIgnoreCase);
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
            "Garena Free Fire",
            "Ubisoft",
            "Ubisoft Game Launcher",
            "Epic Games",
            "Call of Duty",
            "Activision",
            "Battle.net",
            "Games",
            "PC Games",
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
            AgentLog.Warn(
                "No installed-games.json. This account cannot read the administrator's " +
                "desktop, so only games installed for everyone will appear. " +
                "Run install-startup.ps1 as administrator to register the scan.");
            yield break;
        }

        // Age matters more than it looks. This file is a snapshot, and if the
        // SYSTEM task that rewrites it was never registered it stays whatever
        // it was the day somebody last ran the script by hand — so every game
        // installed since then is simply absent from the menu, with nothing
        // anywhere saying why. That is the shape of "most of my games show and
        // the newest three do not".
        try
        {
            var age = DateTime.UtcNow - File.GetLastWriteTimeUtc(path);
            if (age > TimeSpan.FromDays(1))
            {
                AgentLog.Warn(
                    $"installed-games.json is {age.TotalDays:0} day(s) old. Any game installed " +
                    "since then will be missing from this menu. The SYSTEM refresh task is " +
                    "probably not registered - run install-startup.ps1 as administrator.");
            }
            else
            {
                AgentLog.Info($"installed-games.json was written {age.TotalHours:0.#} hour(s) ago.");
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not check the age of installed-games.json: {ex.Message}");
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

                if (IsJunk(name) || LooksLikeWindowsTool(name, exe))
                {
                    continue;
                }

                // The lock user cannot read C:\Users\Admin\... — that is why
                // refresh-games copies shortcuts into ProgramData. Still accept
                // a path that exists for this account.
                if (!File.Exists(exe))
                {
                    AgentLog.Info($"Shared list skipped '{name}': {exe} not reachable from this account.");
                    continue;
                }

                var args = string.IsNullOrWhiteSpace(arguments) ? null : arguments;
                var entry = new GameEntry
                {
                    Name = name,
                    ExePath = exe,
                    Arguments = args,
                    ProcessName = IsSharedLauncher(exe) || !string.IsNullOrWhiteSpace(args) || LooksLikeShortcut(exe)
                        ? null
                        : Path.GetFileNameWithoutExtension(exe),
                    IconSourcePath = exe,
                    Category = CategoryFor(name),
                };

                if (!IsMenuItem(entry))
                {
                    continue;
                }

                entries.Add(entry);
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

            if (LooksLikeWindowsTool(label, shortcut)
                || NotAGameShortcut.Any(bad => lowerLabel.Contains(bad))
                || IsJunk(label))
            {
                return null;
            }

            var (target, arguments) = shortcut.EndsWith(".url", StringComparison.OrdinalIgnoreCase)
                ? ResolveUrlShortcut(shortcut)
                : ResolveShortcut(shortcut);

            // "Counter-Strike 2 Tracker" and "Valorant Tracker" are Overwolf
            // overlays, not games, and their names carry nothing that says so —
            // the only honest signal is what they point at. Matched on the
            // target rather than the label so a real game with "tracker" in its
            // title is unaffected.
            if (!string.IsNullOrWhiteSpace(target)
                && target.Replace('/', '\\').ToLowerInvariant().Contains("\\overwolf\\"))
            {
                AgentLog.Info($"Skipped '{label}': an Overwolf overlay, not a game.");
                return null;
            }

            var isStoreGame =
                !string.IsNullOrWhiteSpace(target)
                && Path.GetFileNameWithoutExtension(target).Equals("explorer", StringComparison.OrdinalIgnoreCase)
                && !string.IsNullOrWhiteSpace(arguments)
                && arguments.Contains("AppsFolder", StringComparison.OrdinalIgnoreCase);

            var identity = launchShortcutFile
                ? shortcut
                : isStoreGame
                    ? $"{target}|{arguments}"
                    : string.IsNullOrWhiteSpace(target)
                        ? shortcut
                        : string.IsNullOrWhiteSpace(arguments)
                            ? target
                            : $"{target}|{arguments}";

            if (!seen.Add(identity))
            {
                return null;
            }

            // Microsoft Store / Xbox titles: keep explorer + AppsFolder args, or
            // the .lnk itself. Never drop them just because explorer lives under
            // Windows\ — that is how Forza and Resident Evil were disappearing.
            if (isStoreGame)
            {
                return new GameEntry
                {
                    Name = label,
                    ExePath = launchShortcutFile ? shortcut : target!,
                    Arguments = launchShortcutFile ? null : arguments,
                    ProcessName = null,
                    IconSourcePath = shortcut,
                    Category = CategoryFor(label),
                };
            }

            var targetOk = !string.IsNullOrWhiteSpace(target)
                && target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                && File.Exists(target)
                && !target.StartsWith(windows, StringComparison.OrdinalIgnoreCase);

            if (targetOk)
            {
                if (LooksLikeWindowsTool(label, target))
                {
                    return null;
                }

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
            if (!launchShortcutFile || LooksLikeWindowsTool(label, target) || LooksLikeWindowsTool(label, shortcut))
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
