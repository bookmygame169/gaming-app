using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>One length of play the café sells, and what it costs.</summary>
internal sealed record HourlyOption(
    [property: JsonPropertyName("durationMinutes")] int DurationMinutes,
    [property: JsonPropertyName("price")] decimal Price);

/// <summary>A membership or a day pass, as offered on the lock screen.</summary>
internal sealed record PlanOption(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("hours")] double? Hours,
    [property: JsonPropertyName("validityDays")] int? ValidityDays);

internal sealed record UpiPayee(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name);

internal sealed record PendingRequest(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("amount")] decimal Amount,
    [property: JsonPropertyName("requestType")] string RequestType,
    [property: JsonPropertyName("paymentMethod")] string PaymentMethod);

/// <summary>Everything a customer at this machine is allowed to buy.</summary>
internal sealed record PlayOptions(
    [property: JsonPropertyName("cafeName")] string CafeName,
    [property: JsonPropertyName("hourly")] List<HourlyOption> Hourly,
    [property: JsonPropertyName("memberships")] List<PlanOption> Memberships,
    [property: JsonPropertyName("dayPasses")] List<PlanOption> DayPasses,
    [property: JsonPropertyName("upi")] UpiPayee? Upi,
    [property: JsonPropertyName("pendingRequest")] PendingRequest? PendingRequest);

/// <summary>What came back from asking to play.</summary>
internal sealed record PlayRequestResult(
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("amount")] decimal Amount,
    [property: JsonPropertyName("label")] string Label,
    [property: JsonPropertyName("paymentMethod")] string PaymentMethod,
    [property: JsonPropertyName("upiLink")] string? UpiLink,
    [property: JsonPropertyName("alreadyWaiting")] bool AlreadyWaiting);

/// <summary>What ending a session gave back.</summary>
internal sealed record EndSessionResult(
    [property: JsonPropertyName("settled")] bool Settled,
    [property: JsonPropertyName("planName")] string? PlanName,
    [property: JsonPropertyName("hoursUsed")] double HoursUsed,
    [property: JsonPropertyName("hoursRemaining")] double HoursRemaining,
    [property: JsonPropertyName("isDayPass")] bool IsDayPass,
    [property: JsonPropertyName("isUnlimited")] bool IsUnlimited = false);

/// <summary>Where a request has got to.</summary>
internal sealed record PlayRequestStatus(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("declineReason")] string? DeclineReason);

/// <summary>
/// The lock screen's side of paying without leaving the machine.
/// </summary>
/// <remarks>
/// Everything here fails soft and says so in plain words. A café PC that cannot
/// reach the website still has to be a café PC: the customer walks to the
/// counter, which is what the lock screen tells them anyway, and which is how
/// the room ran before any of this existed.
/// <para>
/// No price is ever sent up. The server quotes them and the server charges
/// them; this only names which option was picked.
/// </para>
/// </remarks>
internal sealed class PlayRequestClient
{
    private readonly AgentConfig _config;
    private readonly HttpClient _http;

    public PlayRequestClient(AgentConfig config)
    {
        _config = config;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config.Heartbeat.Url)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.Token)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.CafeId);

    private string Origin => new Uri(_config.Heartbeat.Url!).GetLeftPart(UriPartial.Authority);

    private HttpRequestMessage Build(HttpMethod method, string path, object? body)
    {
        var request = new HttpRequestMessage(method, $"{Origin}{path}");
        request.Headers.Add("Authorization", $"Bearer {_config.Heartbeat.Token}");

        if (body is not null)
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(body),
                Encoding.UTF8,
                "application/json");
        }

        return request;
    }

    /// <summary>
    /// Reads the server's error message, so the screen can show what it said.
    /// </summary>
    /// <remarks>
    /// "That length is not available here" and "This PC is already unlocked" are
    /// answers a customer can act on. Replacing them all with "Something went
    /// wrong" would send every one of them to the counter to find out what.
    /// </remarks>
    private static string ProblemFrom(string body, string fallback)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var error))
            {
                var message = error.GetString();
                if (!string.IsNullOrWhiteSpace(message))
                {
                    return message;
                }
            }
        }
        catch (JsonException)
        {
            // Not JSON. Nothing to read.
        }

        return fallback;
    }

    public async Task<PlayOptions?> GetOptionsAsync()
    {
        if (!IsConfigured)
        {
            return null;
        }

        try
        {
            using var request = Build(HttpMethod.Post, "/api/stations/play-options", new
            {
                cafeId = _config.Heartbeat.CafeId,
                stationName = _config.StationId,
            });

            using var response = await _http.SendAsync(request).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                AgentLog.Warn($"Could not read play options: HTTP {(int)response.StatusCode}.");
                return null;
            }

            return JsonSerializer.Deserialize<PlayOptions>(body);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not read play options: {ex.Message}");
            return null;
        }
    }

    /// <summary>Sends the request. Returns the problem to show, or null on success.</summary>
    public async Task<(PlayRequestResult? Result, string? Problem)> SubmitAsync(
        string name,
        string phone,
        string type,
        int? durationMinutes,
        string? planId,
        string paymentMethod)
    {
        if (!IsConfigured)
        {
            return (null, "This PC cannot reach the counter system. Please ask at the counter.");
        }

        try
        {
            using var request = Build(HttpMethod.Post, "/api/stations/play-request", new
            {
                cafeId = _config.Heartbeat.CafeId,
                stationName = _config.StationId,
                name,
                phone,
                type,
                durationMinutes,
                planId,
                paymentMethod,
            });

            using var response = await _http.SendAsync(request).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var problem = ProblemFrom(body, "Could not send your request. Please ask at the counter.");
                AgentLog.Warn($"Play request refused: HTTP {(int)response.StatusCode} — {problem}");
                return (null, problem);
            }

            var result = JsonSerializer.Deserialize<PlayRequestResult>(body);
            if (result is null)
            {
                return (null, "Could not send your request. Please ask at the counter.");
            }

            AgentLog.Info($"Play request {result.RequestId} sent: {result.Label}, ₹{result.Amount} ({result.PaymentMethod}).");
            return (result, null);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Play request failed: {ex.Message}");
            return (null, "Could not reach the counter system. Please ask at the counter.");
        }
    }

    /// <summary>
    /// Sends the owner a list of what is installed on this PC.
    /// </summary>
    /// <remarks>
    /// Suggestions, not games. Nothing sent here reaches a lock screen until an
    /// owner has looked at it and added it to the café's list.
    /// </remarks>
    public async Task<int> ReportDiscoveredGamesAsync(IReadOnlyList<DiscoveredGame> games)
    {
        if (!IsConfigured || games.Count == 0)
        {
            return 0;
        }

        try
        {
            using var request = Build(HttpMethod.Post, "/api/stations/discovered-games", new
            {
                cafeId = _config.Heartbeat.CafeId,
                stationName = _config.StationId,
                games,
            });

            using var response = await _http.SendAsync(request).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                AgentLog.Warn($"Could not report installed games: HTTP {(int)response.StatusCode}.");
                return 0;
            }

            using var document = JsonDocument.Parse(body);
            return document.RootElement.TryGetProperty("accepted", out var accepted)
                ? accepted.GetInt32()
                : 0;
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not report installed games: {ex.Message}");
            return 0;
        }
    }

    /// <summary>
    /// Tells the server the customer has finished, and reads what they get back.
    /// </summary>
    /// <remarks>
    /// Returns null when there was nothing to settle or nothing could be
    /// reached. Both are the same to the caller, and the caller locks the
    /// machine either way: a café whose internet is down still has to be able
    /// to end a session, and holding the PC open until a web request succeeds
    /// would be the wrong way to fail.
    /// </remarks>
    public async Task<EndSessionResult?> EndSessionAsync()
    {
        if (!IsConfigured)
        {
            return null;
        }

        try
        {
            using var request = Build(HttpMethod.Post, "/api/stations/end-session", new
            {
                cafeId = _config.Heartbeat.CafeId,
                stationName = _config.StationId,
            });

            using var response = await _http.SendAsync(request).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                AgentLog.Warn($"Could not end the session cleanly: HTTP {(int)response.StatusCode}.");
                return null;
            }

            var result = JsonSerializer.Deserialize<EndSessionResult>(body);

            if (result is { Settled: true })
            {
                AgentLog.Info(
                    $"Session settled: {result.HoursUsed:0.00}h used, {result.HoursRemaining:0.00}h left "
                    + $"on '{result.PlanName ?? "plan"}'.");
            }

            return result;
        }
        catch (Exception ex)
        {
            // Logged, not surfaced. The machine locks regardless.
            AgentLog.Warn($"Could not end the session cleanly: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Asks whether the owner has answered yet.
    /// </summary>
    /// <remarks>
    /// The unlock does not arrive this way — it comes over MQTT like every
    /// other unlock. This exists only so the waiting screen can stop saying
    /// "waiting" when the answer was no, which nothing else would ever tell it.
    /// </remarks>
    public async Task<PlayRequestStatus?> GetStatusAsync(string requestId)
    {
        if (!IsConfigured || string.IsNullOrWhiteSpace(requestId))
        {
            return null;
        }

        try
        {
            var query =
                $"?cafeId={Uri.EscapeDataString(_config.Heartbeat.CafeId!)}"
                + $"&stationName={Uri.EscapeDataString(_config.StationId)}"
                + $"&requestId={Uri.EscapeDataString(requestId)}";

            using var request = Build(HttpMethod.Get, $"/api/stations/play-request{query}", null);
            using var response = await _http.SendAsync(request).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonSerializer.Deserialize<PlayRequestStatus>(body);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not check the play request: {ex.Message}");
            return null;
        }
    }
}
