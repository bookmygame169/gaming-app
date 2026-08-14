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
        var path = Path.Combine(AppContext.BaseDirectory, GamesCacheFileName);

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

    private static void SaveGamesCache(List<GameEntry> games)
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, GamesCacheFileName);
            var json = JsonSerializer.Serialize(games, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not save {GamesCacheFileName}: {ex.Message}");
        }
    }
}
