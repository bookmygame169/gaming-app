using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace PcLockAgent;

/// <summary>
/// Works out which of the café's games are actually on THIS machine, so the
/// menu only offers what a customer can really play.
/// </summary>
/// <remarks>
/// The dashboard's game list is café-wide: one list, every PC. That is the
/// right thing to configure — nobody wants to maintain a list per machine —
/// but it means a PC that never had Valorant installed still showed a Valorant
/// tile, and clicking it produced an error instead of a game.
/// <para>
/// Two separate problems get solved here, and it is worth keeping them apart:
/// </para>
/// <list type="number">
///   <item><b>Not installed at all.</b> The tile should not be there.</item>
///   <item><b>Installed somewhere else.</b> The café's list stores one path,
///   but Steam libraries land on whatever drive had room — <c>C:</c> on one
///   machine, <c>D:</c> on the next. The game IS installed; only the path is
///   wrong. Hiding it would be just as wrong as showing a broken tile, so
///   these are found and the path corrected rather than dropped.</item>
/// </list>
/// <para>
/// Detection is read-only: registry reads and a handful of text files that
/// Steam and Epic already maintain. Nothing is installed, moved or modified.
/// </para>
/// </remarks>
internal static class InstalledGames
{
    /// <summary>One thing found installed on this PC.</summary>
    private sealed record InstalledApp(string Name, string InstallDir, string Source);

    // Steam's files are VDF, a small key/value format. A real parser would be
    // overkill for the two values needed here, and regex survives Steam
    // reshuffling the surrounding structure — which it has done before.
    private static readonly Regex VdfPath =
        new("\"path\"\\s*\"([^\"]+)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AcfName =
        new("\"name\"\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex AcfInstallDir =
        new("\"installdir\"\\s*\"([^\"]*)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private const string SteamCommon = @"steamapps\common\";

    /// <summary>
    /// Returns <paramref name="config"/> with the games this PC cannot run
    /// removed, and the paths of the ones it can run corrected if needed.
    /// </summary>
    public static AgentConfig FilterToInstalled(AgentConfig config)
    {
        if (!config.ShowOnlyInstalledGames || config.Games.Count == 0)
        {
            return config;
        }

        List<InstalledApp> apps;
        List<string> steamLibraries;
        try
        {
            steamLibraries = FindSteamLibraries();
            apps = DetectInstalledApps(steamLibraries);
            AgentLog.Info($"Found {apps.Count} installed programs across {steamLibraries.Count} Steam libraries.");
        }
        catch (Exception ex)
        {
            // Detection is a convenience, never a gate. If it throws, the
            // customer still gets the full menu rather than an empty screen.
            AgentLog.Warn($"Could not scan for installed games ({ex.Message}). Showing the full menu.");
            return config;
        }

        var kept = new List<GameEntry>();
        var hidden = new List<string>();

        foreach (var game in config.Games)
        {
            var resolved = ResolveExePath(game, apps, steamLibraries);
            if (resolved is null)
            {
                hidden.Add(game.Name);
                continue;
            }

            if (string.Equals(resolved, game.ExePath, StringComparison.OrdinalIgnoreCase))
            {
                kept.Add(game);
                continue;
            }

            AgentLog.Info($"'{game.Name}' is installed at {resolved} (menu said {game.ExePath}).");
            kept.Add(game.WithResolvedExePath(resolved));
        }

        if (hidden.Count > 0)
        {
            AgentLog.Info($"Hidden, not installed on this PC: {string.Join(", ", hidden)}.");
        }

        // The safety net. If every game looks missing, the likely explanation is
        // that detection is wrong on this machine — not that the café owns no
        // games. A menu of tiles that might work beats a blank screen and a
        // customer with nothing to click, so fall back to showing everything.
        if (kept.Count == 0)
        {
            AgentLog.Warn("No game matched anything installed. Showing the full menu instead of an empty one.");
            return config;
        }

        return config.WithGames(kept);
    }

    // -----------------------------------------------------------------------
    // Matching one menu entry to this machine
    // -----------------------------------------------------------------------

    private static string? ResolveExePath(
        GameEntry game,
        IReadOnlyList<InstalledApp> apps,
        IReadOnlyList<string> steamLibraries)
    {
        var configured = game.ExePath;
        if (string.IsNullOrWhiteSpace(configured))
        {
            return null;
        }

        // 1. The ordinary case: the café's path is right for this PC too.
        if (File.Exists(configured))
        {
            return configured;
        }

        var exeName = Path.GetFileName(configured);
        if (string.IsNullOrWhiteSpace(exeName))
        {
            return null;
        }

        // 2. Same game, different drive. Steam keeps an identical folder layout
        //    inside every library, so the part of the path after
        //    steamapps\common transfers verbatim. This catches the common case
        //    without touching the disk more than a few File.Exists calls.
        var common = configured.IndexOf(SteamCommon, StringComparison.OrdinalIgnoreCase);
        if (common >= 0)
        {
            var tail = configured[(common + SteamCommon.Length)..];
            foreach (var library in steamLibraries)
            {
                var candidate = Path.Combine(library, "steamapps", "common", tail);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        // 3. Anything else: find an install whose name looks like this game,
        //    then look for the executable inside it. Bounded, so a game sitting
        //    on a slow drive cannot stall startup.
        foreach (var app in apps)
        {
            if (!NamesMatch(app.Name, game.Name))
            {
                continue;
            }

            var found = FindExecutable(app.InstallDir, exeName);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    /// <summary>
    /// Compares an installer's display name to the café's label for the game.
    /// </summary>
    /// <remarks>
    /// These rarely match character for character — a café types "CS2" or
    /// "Counter Strike 2" where Steam records "Counter-Strike 2". Punctuation
    /// and case are dropped, then either name containing the other counts, with
    /// a minimum length so that a two-letter label cannot match half the disk.
    /// </remarks>
    private static bool NamesMatch(string installed, string configured)
    {
        var a = Normalise(installed);
        var b = Normalise(configured);

        if (a.Length < 3 || b.Length < 3)
        {
            return false;
        }

        return a == b || a.Contains(b, StringComparison.Ordinal) || b.Contains(a, StringComparison.Ordinal);
    }

    private static string Normalise(string value)
    {
        var chars = value.Where(char.IsLetterOrDigit).ToArray();
        return new string(chars).ToLowerInvariant();
    }

    /// <summary>
    /// Breadth-first hunt for <paramref name="exeName"/> under
    /// <paramref name="root"/>, capped so it stays quick.
    /// </summary>
    /// <remarks>
    /// Breadth-first rather than a plain recursive search because game
    /// executables sit near the top of their folder, while the deep folders are
    /// artwork and audio. The caps matter more than they look: this runs at
    /// startup, and an uncapped walk of a large library on a mechanical drive
    /// would hold the lock screen back by minutes.
    /// </remarks>
    private static string? FindExecutable(string root, string exeName, int maxDepth = 6, int maxFolders = 3000)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root))
        {
            return null;
        }

        var queue = new Queue<(string Path, int Depth)>();
        queue.Enqueue((root, 0));
        var visited = 0;

        while (queue.Count > 0 && visited < maxFolders)
        {
            var (folder, depth) = queue.Dequeue();
            visited++;

            try
            {
                var candidate = Path.Combine(folder, exeName);
                if (File.Exists(candidate))
                {
                    return candidate;
                }

                if (depth >= maxDepth)
                {
                    continue;
                }

                foreach (var child in Directory.EnumerateDirectories(folder))
                {
                    queue.Enqueue((child, depth + 1));
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                // A folder this account cannot read is not a reason to stop.
            }
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Finding what is installed
    // -----------------------------------------------------------------------

    private static List<InstalledApp> DetectInstalledApps(IReadOnlyList<string> steamLibraries)
    {
        var apps = new List<InstalledApp>();
        apps.AddRange(DetectSteamApps(steamLibraries));
        apps.AddRange(DetectEpicApps());
        apps.AddRange(DetectRegistryApps());
        return apps;
    }

    private static IEnumerable<InstalledApp> DetectSteamApps(IReadOnlyList<string> libraries)
    {
        foreach (var library in libraries)
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
                string text;
                try
                {
                    text = File.ReadAllText(manifest);
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                {
                    continue;
                }

                var name = AcfName.Match(text);
                var installDir = AcfInstallDir.Match(text);
                if (!name.Success || !installDir.Success)
                {
                    continue;
                }

                // An .acf can outlive the files it describes — Steam leaves one
                // behind for a queued or partly removed game — so the folder is
                // checked rather than trusted.
                var folder = Path.Combine(steamapps, "common", installDir.Groups[1].Value);
                if (Directory.Exists(folder))
                {
                    yield return new InstalledApp(name.Groups[1].Value, folder, "Steam");
                }
            }
        }
    }

    private static IEnumerable<InstalledApp> DetectEpicApps()
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
            InstalledApp? app = null;
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(file));
                var root = document.RootElement;

                if (root.TryGetProperty("DisplayName", out var name) &&
                    root.TryGetProperty("InstallLocation", out var location))
                {
                    var folder = location.GetString();
                    if (!string.IsNullOrWhiteSpace(folder) && Directory.Exists(folder))
                    {
                        app = new InstalledApp(name.GetString() ?? "", folder, "Epic");
                    }
                }
            }
            catch (Exception ex) when (ex is JsonException or UnauthorizedAccessException or IOException)
            {
                // A half-written manifest is Epic's business, not ours.
            }

            if (app is not null)
            {
                yield return app;
            }
        }
    }

    /// <summary>
    /// Everything else, via the list Windows keeps for Add/Remove Programs.
    /// </summary>
    /// <remarks>
    /// This is what covers Riot, EA, Ubisoft, Battle.net and GOG without a
    /// separate reader for each launcher's private format. It is coarser than
    /// the Steam and Epic readers — plenty of entries have no install folder at
    /// all — so it runs last, after the two that give exact answers.
    /// <para>
    /// Both registry views are read. A 64-bit agent looking only at the default
    /// view silently misses every 32-bit installer's entry.
    /// </para>
    /// </remarks>
    private static IEnumerable<InstalledApp> DetectRegistryApps()
    {
        const string uninstallPath = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

        var roots = new (RegistryHive Hive, RegistryView View)[]
        {
            (RegistryHive.LocalMachine, RegistryView.Registry64),
            (RegistryHive.LocalMachine, RegistryView.Registry32),
            (RegistryHive.CurrentUser, RegistryView.Registry64),
        };

        foreach (var (hive, view) in roots)
        {
            RegistryKey? uninstall = null;
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                uninstall = baseKey.OpenSubKey(uninstallPath);
                if (uninstall is null)
                {
                    continue;
                }

                foreach (var subKeyName in uninstall.GetSubKeyNames())
                {
                    InstalledApp? app = null;
                    try
                    {
                        using var entry = uninstall.OpenSubKey(subKeyName);
                        var name = entry?.GetValue("DisplayName") as string;
                        var location = entry?.GetValue("InstallLocation") as string;

                        if (!string.IsNullOrWhiteSpace(name) &&
                            !string.IsNullOrWhiteSpace(location) &&
                            Directory.Exists(location))
                        {
                            app = new InstalledApp(name, location, "Windows");
                        }
                    }
                    catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                    {
                        // Skip the one key, keep the rest.
                    }

                    if (app is not null)
                    {
                        yield return app;
                    }
                }
            }
            finally
            {
                uninstall?.Dispose();
            }
        }
    }

    /// <summary>
    /// Every Steam library folder on this machine, main install included.
    /// </summary>
    public static List<string> FindSteamLibraries()
    {
        var libraries = new List<string>();

        var steamRoot = FindSteamRoot();
        if (steamRoot is not null)
        {
            libraries.Add(steamRoot);

            var vdf = Path.Combine(steamRoot, "steamapps", "libraryfolders.vdf");
            if (File.Exists(vdf))
            {
                try
                {
                    foreach (Match match in VdfPath.Matches(File.ReadAllText(vdf)))
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
                    // The main install on its own is still useful.
                }
            }
        }

        // Libraries that never made it into libraryfolders.vdf — a café often
        // copies a Steam folder onto D: and the current Windows account has
        // never opened Steam, so HKCU does not know it exists.
        foreach (var extra in SteamLibrariesOnDisk())
        {
            libraries.Add(extra);
        }

        return libraries
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IEnumerable<string> SteamLibrariesOnDisk()
    {
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

            foreach (var candidate in SteamLibraryCandidates(root))
            {
                yield return candidate;
            }
        }
    }

    private static IEnumerable<string> SteamLibraryCandidates(string driveRoot)
    {
        var guesses = new[]
        {
            Path.Combine(driveRoot, "Steam"),
            Path.Combine(driveRoot, "SteamLibrary"),
            Path.Combine(driveRoot, "Games", "Steam"),
            Path.Combine(driveRoot, "Program Files (x86)", "Steam"),
            Path.Combine(driveRoot, "Program Files", "Steam"),
        };

        foreach (var guess in guesses)
        {
            if (Directory.Exists(Path.Combine(guess, "steamapps")))
            {
                yield return guess;
            }
        }

        string[] children;
        try
        {
            children = Directory.GetDirectories(driveRoot);
        }
        catch
        {
            yield break;
        }

        foreach (var child in children)
        {
            if (Directory.Exists(Path.Combine(child, "steamapps")))
            {
                yield return child;
            }
        }
    }

    /// <summary>Where Steam is installed, or null if it is not.</summary>
    /// <remarks>
    /// Shared with <see cref="GameArtwork"/>, which needs the same folder to
    /// find the pictures Steam caches for its own library screen.
    /// </remarks>
    public static string? FindSteamRoot()
    {
        // Steam records where it put itself. Far more reliable than guessing,
        // because a café that installed Steam on a games drive has nothing in
        // Program Files at all.
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, view);
                using var key = baseKey.OpenSubKey(@"Software\Valve\Steam");
                if (key?.GetValue("SteamPath") is string path && Directory.Exists(path))
                {
                    return path;
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                // Fall through to the well-known locations.
            }
        }

        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var key = baseKey.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam")
                                ?? baseKey.OpenSubKey(@"SOFTWARE\Valve\Steam");
                if (key?.GetValue("InstallPath") is string machinePath && Directory.Exists(machinePath))
                {
                    return machinePath;
                }
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
            }
        }

        var guesses = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Steam"),
        };

        var known = guesses.FirstOrDefault(Directory.Exists);
        if (known is not null)
        {
            return known;
        }

        foreach (var library in SteamLibrariesOnDisk())
        {
            if (File.Exists(Path.Combine(library, "steam.exe")))
            {
                return library;
            }
        }

        return null;
    }
}
