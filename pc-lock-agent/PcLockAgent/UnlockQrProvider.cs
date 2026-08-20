using System.Text;
using System.Text.Json;

namespace PcLockAgent;

/// <summary>
/// Keeps a fresh scannable code on the lock screen.
/// </summary>
/// <remarks>
/// The code is issued by the website, not made up here. It is deliberately
/// meaningless on its own and lasts about two minutes, so a photograph of one
/// café PC's screen is worth nothing a few minutes later and nothing at all
/// from another seat. The agent's job is only to ask for one and draw it.
/// <para>
/// Only while the station is locked. A code sitting on screen during somebody
/// else's paid session is an invitation to buy time on a machine already in
/// use, and refreshing one nobody can see is a request per minute per PC for
/// no reason.
/// </para>
/// <para>
/// Everything here fails quietly. No code means the lock screen shows the
/// station number and the line about asking at the counter, which is how the
/// café ran before this existed — a PC that cannot reach the website should
/// still be usable by walking over to staff.
/// </para>
/// </remarks>
internal sealed class UnlockQrProvider : IDisposable
{
    /// <summary>
    /// How often a new code is fetched.
    /// </summary>
    /// <remarks>
    /// Shorter than the two minutes the server allows, so the one on screen is
    /// always well inside its life. A customer who starts scanning just as it
    /// changes still has the old one working for another minute.
    /// </remarks>
    private static readonly TimeSpan RefreshInterval = TimeSpan.FromSeconds(60);

    private readonly AgentConfig _config;
    private readonly HttpClient _http;
    private System.Windows.Forms.Timer? _timer;
    private bool _running;

    /// <summary>Raised with a new code image, or null when there is none to show.</summary>
    public event EventHandler<Image?>? CodeChanged;

    public UnlockQrProvider(AgentConfig config)
    {
        _config = config;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    }

    private bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_config.Heartbeat.Url)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.Token)
        && !string.IsNullOrWhiteSpace(_config.Heartbeat.CafeId);

    /// <summary>Starts asking for codes. Call when the station becomes locked.</summary>
    public void Start()
    {
        if (_running || !IsConfigured)
        {
            return;
        }

        _running = true;

        _timer ??= new System.Windows.Forms.Timer { Interval = (int)RefreshInterval.TotalMilliseconds };
        _timer.Tick -= OnTick;
        _timer.Tick += OnTick;
        _timer.Start();

        _ = RefreshAsync();
    }

    /// <summary>
    /// Stops, and clears the code from the screen.
    /// </summary>
    /// <remarks>
    /// The clear matters as much as the stop. Leaving the last code drawn while
    /// a session runs would let somebody scan a machine that is already in use.
    /// </remarks>
    public void Stop()
    {
        _running = false;
        _timer?.Stop();
        CodeChanged?.Invoke(this, null);
    }

    private void OnTick(object? sender, EventArgs e) => _ = RefreshAsync();

    private async Task RefreshAsync()
    {
        if (!_running || !IsConfigured)
        {
            return;
        }

        try
        {
            var origin = new Uri(_config.Heartbeat.Url!).GetLeftPart(UriPartial.Authority);

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{origin}/api/stations/unlock-token");
            request.Headers.Add("Authorization", $"Bearer {_config.Heartbeat.Token}");
            request.Content = new StringContent(
                JsonSerializer.Serialize(new
                {
                    cafeId = _config.Heartbeat.CafeId,
                    stationName = _config.StationId,
                }),
                Encoding.UTF8,
                "application/json");

            using var response = await _http.SendAsync(request).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                AgentLog.Warn($"Could not get a scan code: HTTP {(int)response.StatusCode}.");
                return;
            }

            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            using var document = JsonDocument.Parse(body);

            if (!document.RootElement.TryGetProperty("url", out var urlElement))
            {
                AgentLog.Warn("Scan code response had no url.");
                return;
            }

            var url = urlElement.GetString();
            if (string.IsNullOrWhiteSpace(url))
            {
                return;
            }

            var image = QrImage.Render(url);

            // The timer runs on the UI thread but the await above did not, so
            // this continuation may not be there either. The subscriber marshals
            // it; raising from here is safe because the handler does.
            if (_running)
            {
                CodeChanged?.Invoke(this, image);
            }
            else
            {
                image?.Dispose();
            }
        }
        catch (Exception ex)
        {
            // A café PC with no internet still has to lock. Losing the code just
            // means the customer walks to the counter, which is what the screen
            // tells them anyway.
            AgentLog.Warn($"Scan code refresh failed: {ex.Message}");
        }
    }

    public void Dispose()
    {
        _running = false;

        if (_timer is not null)
        {
            _timer.Tick -= OnTick;
            _timer.Stop();
            _timer.Dispose();
            _timer = null;
        }

        _http.Dispose();
    }
}
