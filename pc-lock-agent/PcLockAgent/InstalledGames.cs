using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace PcLockAgent;

/// <summary>
/// Where Steam keeps its libraries on this machine.
/// </summary>
/// <remarks>
/// What is left of a larger class. It used to decide which of the café's games
/// were installed here, by asking whether the file each one starts from
/// existed - and every Steam game in a café catalogue starts from steam.exe, so
/// it proved Steam was installed and let games nobody could play onto the menu.
/// The menu is built from the account's own desktop now, which cannot be wrong
/// in that way, and all of that went with it.
/// <para>
/// These two survive because <see cref="GameArtwork"/> needs them for something
/// else entirely: Steam caches a picture for every game in its library, and
/// finding those means finding the libraries first.
/// </para>
/// <para>
/// Read-only, as it always was. Nothing here installs, moves or modifies
/// anything.
/// </para>
/// </remarks>
internal static class InstalledGames
{
    // Steam's files are VDF, a small key/value format. A real parser would be
    // overkill for the two values needed here, and regex survives Steam
    // reshuffling the surrounding structure — which it has done before.
    private static readonly Regex VdfPath =
        new("\"path\"\\s*\"([^\"]+)\"", RegexOptions.IgnoreCase | RegexOptions.Compiled);

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
