using System.Text.Json;
using System.Text.RegularExpressions;

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
/// the menu now rather than the whole of it, and anything installed that nobody
/// listed appears behind it.
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
            yield return new GameEntry { Name = "Steam", ExePath = steam, ProcessName = "steam" };
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

        List<GameEntry> found;
        try
        {
            found = new List<GameEntry>();
            found.AddRange(FromSteam());
            found.AddRange(FromEpic());
            found.AddRange(FromDesktopShortcuts());

            if (config.ShowLaunchers)
            {
                found.AddRange(Launchers());
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

        AgentLog.Info($"Adding {added.Count} installed game(s): {string.Join(", ", added.Select(g => g.Name))}");

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

                    entry = new GameEntry
                    {
                        Name = name,
                        ExePath = steamExe,
                        Arguments = $"-applaunch {appId}",
                        // Without this the agent would watch steam.exe, which
                        // never exits, and the menu would never come back when
                        // the customer closed the game.
                        ProcessName = GuessMainExe(folder),
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
    private static string? GuessMainExe(string folder)
    {
        try
        {
            var best = Directory
                .EnumerateFiles(folder, "*.exe", SearchOption.TopDirectoryOnly)
                .Concat(SafeSubdirectoryExes(folder))
                .Where(path =>
                {
                    var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                    return !NotTheGame.Any(bad => name.Contains(bad));
                })
                .OrderByDescending(path => new FileInfo(path).Length)
                .FirstOrDefault();

            return best is null ? null : Path.GetFileNameWithoutExtension(best);
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

    private static List<string> SteamLibraries()
    {
        var libraries = new List<string>();
        var root = InstalledGames.FindSteamRoot();
        if (root is null)
        {
            return libraries;
        }

        libraries.Add(root);

        var vdf = Path.Combine(root, "steamapps", "libraryfolders.vdf");
        if (!File.Exists(vdf))
        {
            return libraries;
        }

        try
        {
            foreach (Match match in Regex.Matches(File.ReadAllText(vdf), "\"path\"\\s*\"([^\"]+)\""))
            {
                var path = match.Groups[1].Value.Replace(@"\\", @"\");
                if (Directory.Exists(path))
                {
                    libraries.Add(path);
                }
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // The main library on its own is still worth having.
        }

        return libraries.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
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
    // The desktop
    // -----------------------------------------------------------------------

    /// <summary>
    /// Whatever the café put on the desktop.
    /// </summary>
    /// <remarks>
    /// The best signal available and the one nobody thinks of. A café's desktop
    /// is already a curated list of what customers are meant to play — somebody
    /// arranged those icons on purpose — and it catches everything the launchers
    /// do not: standalone installers, Riot titles, Roblox, a game copied from a
    /// USB stick.
    /// </remarks>
    private static IEnumerable<GameEntry> FromDesktopShortcuts()
    {
        var folders = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
        };

        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var folder in folders.Where(f => !string.IsNullOrWhiteSpace(f) && Directory.Exists(f)))
        {
            string[] shortcuts;
            try
            {
                shortcuts = Directory.GetFiles(folder, "*.lnk", SearchOption.TopDirectoryOnly);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var shortcut in shortcuts)
            {
                GameEntry? entry = null;

                try
                {
                    var target = ResolveShortcut(shortcut);

                    if (string.IsNullOrWhiteSpace(target) ||
                        !target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ||
                        !File.Exists(target) ||
                        target.StartsWith(windows, StringComparison.OrdinalIgnoreCase) ||
                        !seen.Add(target))
                    {
                        continue;
                    }

                    var fileName = Path.GetFileNameWithoutExtension(target).ToLowerInvariant();
                    if (NotTheGame.Any(bad => fileName.Contains(bad)))
                    {
                        continue;
                    }

                    entry = new GameEntry
                    {
                        Name = Path.GetFileNameWithoutExtension(shortcut),
                        ExePath = target,
                        ProcessName = Path.GetFileNameWithoutExtension(target),
                    };
                }
                catch (Exception ex)
                {
                    AgentLog.Warn($"Could not read {Path.GetFileName(shortcut)}: {ex.Message}");
                }

                if (entry is not null)
                {
                    yield return entry;
                }
            }
        }
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
    private static string? ResolveShortcut(string path)
    {
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null)
        {
            return null;
        }

        object? shell = null;
        try
        {
            shell = Activator.CreateInstance(shellType);
            if (shell is null)
            {
                return null;
            }

            var link = shellType.InvokeMember(
                "CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { path });

            var target = link?.GetType().InvokeMember(
                "TargetPath", System.Reflection.BindingFlags.GetProperty, null, link, null) as string;

            return target;
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
        new(value.Where(char.IsLetterOrDigit).ToArray());
}
