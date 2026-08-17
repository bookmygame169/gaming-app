using System.Text.RegularExpressions;

namespace PcLockAgent;

/// <summary>
/// Finds real artwork for a game tile.
/// </summary>
/// <remarks>
/// Steam games are started by running <c>steam.exe -applaunch 730</c>, because
/// that is the only way to launch one and have Steam do its own setup first. The
/// tile then took its picture from the executable it was given — which is
/// Steam's, for every one of them. A menu offering Counter-Strike, PUBG and
/// Rocket League showed the same Steam logo three times, and a customer could
/// not tell the tiles apart at a glance.
/// <para>
/// Steam already keeps a picture of every installed game on the disk, for its
/// own library screen. Using that is better than anything this could fetch: it
/// is already there, it needs no network, no key and no permission, and it is
/// the same image the customer is used to seeing.
/// </para>
/// </remarks>
internal static class GameArtwork
{
    /// <summary>
    /// Both ways Steam identifies a game on a command line.
    /// </summary>
    /// <remarks>
    /// <c>-applaunch 730</c> is what this agent builds. <c>steam://rungameid/730</c>
    /// is what Steam itself writes into a desktop shortcut, and only the first
    /// was matched — so every Steam game found through a shortcut failed the
    /// artwork lookup and fell back to the icon of the file it pointed at, which
    /// is steam.exe. That is the Steam logo appearing on four different games.
    /// </remarks>
    private static readonly Regex AppLaunch =
        new(@"(?:-applaunch\s+|rungameid[/=])(\d+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>
    /// Steam's own artwork for this game, or null if there is none to be had.
    /// </summary>
    public static Image? TryLoadSteamArt(GameEntry game)
    {
        var appId = ReadAppId(game);
        if (appId is null)
        {
            return null;
        }

        var steamRoot = InstalledGames.FindSteamRoot();
        if (steamRoot is null)
        {
            return null;
        }

        var cache = Path.Combine(steamRoot, "appcache", "librarycache");
        if (!Directory.Exists(cache))
        {
            return null;
        }

        // Both layouts are tried because Steam changed where it puts these: it
        // used to be one flat folder of <appid>_header.jpg, and is now a folder
        // per game. A café PC may be on either, and which one is not worth
        // guessing from a version number.
        //
        // Wide art first. A tile is wider than it is tall, so the header fills
        // it; the tall capsule would sit in the middle with empty space either
        // side of it.
        var candidates = new[]
        {
            Path.Combine(cache, appId, "header.jpg"),
            Path.Combine(cache, $"{appId}_header.jpg"),
            Path.Combine(cache, appId, "library_hero.jpg"),
            Path.Combine(cache, $"{appId}_library_hero.jpg"),
            Path.Combine(cache, appId, "library_600x900.jpg"),
            Path.Combine(cache, $"{appId}_library_600x900.jpg"),
            Path.Combine(cache, appId, "logo.png"),
            Path.Combine(cache, $"{appId}_logo.png"),
        };

        foreach (var path in candidates)
        {
            var image = TryLoad(path);
            if (image is not null)
            {
                AgentLog.Info($"Using Steam artwork for '{game.Name}': {path}");
                return image;
            }
        }

        AgentLog.Info($"No Steam artwork cached for '{game.Name}' (app {appId}).");
        return null;
    }

    /// <summary>The Steam app id this entry launches, if it launches one.</summary>
    /// <summary>
    /// The Steam app id behind this tile, wherever it is written down.
    /// </summary>
    /// <remarks>
    /// Arguments only covers the shortcut form <c>steam.exe -applaunch 730</c>.
    /// Steam's own desktop shortcuts are .url files instead, holding
    /// <c>URL=steam://rungameid/730</c> — no arguments anywhere, so looking
    /// only there found nothing for exactly the games Steam itself created a
    /// shortcut for, which is most of a café's library.
    /// </remarks>
    private static string? ReadAppId(GameEntry game)
    {
        foreach (var candidate in new[] { game.Arguments, game.ExePath })
        {
            if (string.IsNullOrWhiteSpace(candidate))
            {
                continue;
            }

            var match = AppLaunch.Match(candidate);
            if (match.Success)
            {
                return match.Groups[1].Value;
            }
        }

        // The id is inside the file rather than in anything about it.
        var path = game.ExePath;
        if (string.IsNullOrWhiteSpace(path)
            || !path.EndsWith(".url", StringComparison.OrdinalIgnoreCase)
            || !File.Exists(path))
        {
            return null;
        }

        try
        {
            foreach (var line in File.ReadLines(path))
            {
                var match = AppLaunch.Match(line);
                if (match.Success)
                {
                    return match.Groups[1].Value;
                }
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read {Path.GetFileName(path)}: {ex.Message}");
        }

        return null;
    }

    /// <summary>
    /// Loads an image without keeping the file open.
    /// </summary>
    /// <remarks>
    /// <c>Image.FromFile</c> keeps a lock on the file for the lifetime of the
    /// image. These files belong to Steam, which rewrites them when it updates
    /// its library — holding them open would make that fail in ways that look
    /// like Steam being broken rather than the kiosk holding its artwork.
    /// </remarks>
    private static Image? TryLoad(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return null;
            }

            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var loaded = Image.FromStream(stream);
            return new Bitmap(loaded);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read artwork {path}: {ex.Message}");
            return null;
        }
    }
}
