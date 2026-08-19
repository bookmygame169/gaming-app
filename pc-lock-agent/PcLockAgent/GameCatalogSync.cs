using System.Net.Http.Headers;
using System.Text.Json;

namespace PcLockAgent;

/// <summary>
/// Pulls the game menu from the website so Valorant/GTA etc. come from the
/// dashboard instead of placeholder Notepad entries in appsettings.json.
/// </summary>
internal static class GameCatalogSync
{
    private const string GamesCacheFileName = "games-cache.json";

    public static async Task<AgentConfig> TryRefreshAsync(AgentConfig config)
    {
        if (!config.IsEnrolled)
        {
            return config;
        }

        var cafeId = config.Heartbeat.CafeId;
        var token = config.Heartbeat.Token;
        var heartbeatUrl = config.Heartbeat.Url;

        if (string.IsNullOrWhiteSpace(cafeId) || string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(heartbeatUrl))
        {
            AgentLog.Info("Game catalog sync skipped: heartbeat is not fully configured.");
            return config.WithGames(LoadCachedGames(config.Games));
        }

        try
        {
            var gamesUrl = BuildGamesUrl(heartbeatUrl, cafeId);
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };

            using var request = new HttpRequestMessage(HttpMethod.Get, gamesUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            using var response = await http.SendAsync(request).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                AgentLog.Warn($"Game catalog fetch failed: HTTP {(int)response.StatusCode}. Using cached games.");
                return config.WithGames(LoadCachedGames(config.Games));
            }

            using var document = JsonDocument.Parse(body);

            // The café's exit password, set once by the owner in the dashboard
            // instead of typed at each machine. Absent means this café has not
            // set one, or is running a build that predates it — either way the
            // local appsettings value stands.
            var exitPasswordHash =
                document.RootElement.TryGetProperty("exitPasswordHash", out var hashElement)
                && hashElement.ValueKind == JsonValueKind.String
                    ? hashElement.GetString()
                    : null;

            if (!string.IsNullOrWhiteSpace(exitPasswordHash))
            {
                config = config.WithExitPasswordHash(exitPasswordHash);
                SaveExitPasswordCache(exitPasswordHash);
                AgentLog.Info("Exit password came from the café's dashboard settings.");
            }

            if (!document.RootElement.TryGetProperty("games", out var gamesElement))
            {
                AgentLog.Warn("Game catalog response had no games array. Using cached games.");
                return config.WithGames(LoadCachedGames(config.Games));
            }

            var games = JsonSerializer.Deserialize<List<GameEntry>>(gamesElement.GetRawText()) ?? [];

            if (games.Count == 0)
            {
                AgentLog.Warn("Game catalog returned zero games. Using cached games.");
                return config.WithGames(LoadCachedGames(config.Games));
            }

            SaveGamesCache(games);
            AgentLog.Info($"Loaded {games.Count} games from the website.");
            return config.WithGames(games);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Game catalog sync error: {ex.Message}. Using cached games.");
            return config.WithGames(LoadCachedGames(config.Games));
        }
    }

    private static string BuildGamesUrl(string heartbeatUrl, string cafeId)
    {
        var uri = new Uri(heartbeatUrl);
        var origin = uri.GetLeftPart(UriPartial.Authority);
        return $"{origin}/api/stations/games?cafeId={Uri.EscapeDataString(cafeId)}";
    }

    private static List<GameEntry> LoadCachedGames(List<GameEntry> fallback)
    {
        var path = AgentPaths.GamesCacheFile;

        try
        {
            if (!File.Exists(path))
            {
                return fallback;
            }

            var cached = JsonSerializer.Deserialize<List<GameEntry>>(File.ReadAllText(path));
            if (cached is null || cached.Count == 0)
            {
                return fallback;
            }

            AgentLog.Info($"Using {cached.Count} games from {GamesCacheFileName}.");
            return cached;
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read {GamesCacheFileName}: {ex.Message}");
            return fallback;
        }
    }

    /// <summary>
    /// Remembers the password hash so the chord still works with no internet.
    /// </summary>
    /// <remarks>
    /// A station that cannot reach the site is exactly when somebody is likely
    /// to be standing at it trying to fix something, so the exit has to keep
    /// working. The hash is no more sensitive on disk than it is in the
    /// settings file it replaces.
    /// </remarks>
    private static void SaveExitPasswordCache(string hash)
    {
        try
        {
            File.WriteAllText(Path.Combine(AgentPaths.DataFolder, "exit-password.cache"), hash);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not cache the exit password: {ex.Message}");
        }
    }

    /// <summary>The last hash the dashboard sent, or null.</summary>
    public static string? LoadCachedExitPasswordHash()
    {
        try
        {
            var path = Path.Combine(AgentPaths.DataFolder, "exit-password.cache");
            if (!File.Exists(path)) return null;

            var hash = File.ReadAllText(path).Trim();
            return string.IsNullOrWhiteSpace(hash) ? null : hash;
        }
        catch
        {
            return null;
        }
    }

    private static void SaveGamesCache(List<GameEntry> games)
    {
        try
        {
            var path = AgentPaths.GamesCacheFile;
            var json = JsonSerializer.Serialize(games, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not save {GamesCacheFileName}: {ex.Message}");
        }
    }
}
