using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace PcLockAgent;

/// <summary>
/// Reports this station's state to the website over HTTP, so the dashboard can
/// show which machines are alive.
/// </summary>
/// <remarks>
/// Separate from <see cref="MqttService"/> on purpose. MQTT carries commands and
/// needs a live connection; this is one-way reporting that a serverless site can
/// receive without holding a subscription open.
/// <para>
/// Entirely optional. With no URL configured the agent runs exactly as before —
/// a station that cannot report in must still lock and unlock normally, since
/// the whole point is that the machine stays controlled.
/// </para>
/// </remarks>
internal sealed class HeartbeatReporter : IDisposable
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    private readonly AgentConfig _config;
    private readonly HttpClient _http;

    private CancellationTokenSource? _cts;
    private Task? _loop;

    private volatile string _status = "locked";
    private volatile string? _sessionId;

    /// <summary>Stops the log filling with the same failure every 30 seconds.</summary>
    private bool _lastAttemptFailed;

    public HeartbeatReporter(AgentConfig config)
    {
        _config = config;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    private bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config.Heartbeat.Url)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.Token)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.CafeId);

    public void Start()
    {
        if (!IsConfigured)
        {
            AgentLog.Info("Heartbeat reporting is not configured; skipping. Lock and unlock are unaffected.");
            return;
        }

        if (_cts is not null)
        {
            return;
        }

        _cts = new CancellationTokenSource();
        _loop = RunAsync(_cts.Token);

        AgentLog.Info($"Heartbeat reporting to {_config.Heartbeat.Url} every {Interval.TotalSeconds:0}s.");
    }

    /// <summary>
    /// Records the current state and reports it immediately.
    /// </summary>
    /// <remarks>
    /// Sent straight away rather than waiting for the next tick, so the dashboard
    /// reflects a lock or unlock within a second rather than up to thirty.
    /// </remarks>
    public void ReportState(bool locked, string? sessionId)
    {
        _status = locked ? "locked" : "unlocked";
        _sessionId = sessionId;

        if (IsConfigured)
        {
            _ = SendAsync(CancellationToken.None);
        }
    }

    private async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(Interval, ct).ConfigureAwait(false);
                await SendAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                AgentLog.Info($"Heartbeat loop error: {ex.Message}");
            }
        }
    }

    private async Task SendAsync(CancellationToken ct)
    {
        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                cafeId = _config.Heartbeat.CafeId,
                stationName = _config.StationId,
                status = _status,
                sessionId = _sessionId,
            });

            using var request = new HttpRequestMessage(HttpMethod.Post, _config.Heartbeat.Url)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Heartbeat.Token);

            using var response = await _http.SendAsync(request, ct).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                if (!_lastAttemptFailed)
                {
                    // The body usually carries the server's own explanation,
                    // which is more specific than anything guessable from the
                    // status code alone.
                    var body = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);

                    AgentLog.Warn($"Heartbeat rejected: HTTP {(int)response.StatusCode}. {ExplainFailure(response.StatusCode)}");

                    if (!string.IsNullOrWhiteSpace(body))
                    {
                        AgentLog.Warn($"Server said: {body.Trim()}");
                    }

                    _lastAttemptFailed = true;
                }
                return;
            }

            if (_lastAttemptFailed)
            {
                AgentLog.Info("Heartbeat reporting recovered.");
                _lastAttemptFailed = false;
            }
        }
        catch (OperationCanceledException)
        {
            // Shutting down.
        }
        catch (Exception ex)
        {
            // Expected whenever the site or the connection is down. Logged once
            // per outage rather than every 30 seconds.
            if (!_lastAttemptFailed)
            {
                AgentLog.Info($"Heartbeat failed ({ex.GetType().Name}: {ex.Message}). Will keep trying quietly.");
                _lastAttemptFailed = true;
            }
        }
    }

    /// <summary>
    /// Turns a status code into the thing to actually go and fix.
    /// </summary>
    /// <remarks>
    /// These land in a log read by whoever is setting a café PC up, often after
    /// several config steps, so "check the token" on a code that has nothing to
    /// do with the token sends them looking in the wrong place.
    /// </remarks>
    private static string ExplainFailure(System.Net.HttpStatusCode statusCode) => statusCode switch
    {
        System.Net.HttpStatusCode.ServiceUnavailable =>
            "The website has no STATION_HEARTBEAT_TOKEN set. Add it to the server environment and redeploy — nothing to fix on this PC.",
        System.Net.HttpStatusCode.Unauthorized =>
            "The token here does not match the one on the website. Check heartbeat.token in appsettings.Local.json.",
        System.Net.HttpStatusCode.BadRequest =>
            "The website rejected the details. Check heartbeat.cafeId and stationId in appsettings.Local.json.",
        System.Net.HttpStatusCode.NotFound =>
            "No such endpoint. Check heartbeat.url in appsettings.Local.json.",
        System.Net.HttpStatusCode.InternalServerError =>
            "The website hit an error saving this — most likely the station_status table does not exist yet.",
        _ => "Locking and unlocking are unaffected.",
    };

    public void Dispose()
    {
        _cts?.Cancel();

        try
        {
            _loop?.Wait(TimeSpan.FromSeconds(2));
        }
        catch
        {
            // Shutting down; nothing useful to do with a failure here.
        }

        _cts?.Dispose();
        _http.Dispose();
    }
}
