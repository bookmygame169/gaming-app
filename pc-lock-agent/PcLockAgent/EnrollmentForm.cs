using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace PcLockAgent;

/// <summary>
/// Shown the first time the agent runs on a machine that has not been linked to
/// a café yet. Takes the setup code from the dashboard and fetches this
/// station's settings.
/// </summary>
/// <remarks>
/// This is what lets the installer be a plain public download. Without it, the
/// broker password would have to be baked into every copy — which means it
/// cannot be hosted openly, cannot be shared between cafés, and has to be
/// rebuilt and reinstalled everywhere whenever the password changes.
/// </remarks>
internal sealed class EnrollmentForm : Form
{
    private readonly AgentConfig _config;
    private readonly HttpClient _http;

    private TextBox _codeBox = null!;
    private Button _connectButton = null!;
    private Label _statusLabel = null!;

    public EnrollmentForm(AgentConfig config)
    {
        _config = config;

        // Redirects are not followed, for the same reason as the heartbeat: a
        // host-changing redirect drops headers and produces failures that look
        // like something else entirely.
        _http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        {
            Timeout = TimeSpan.FromSeconds(20),
        };

        BuildLayout();
    }

    private void BuildLayout()
    {
        Text = "BookMyGame — Set up this PC";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(520, 330);
        BackColor = Palette.Background;

        var heading = new Label
        {
            Text = "Set up this PC",
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = true,
            Location = new Point(32, 28),
        };

        var explanation = new Label
        {
            Text =
                "In your BookMyGame owner dashboard, open the Stations tab and\n" +
                "choose \"Add a PC\". Type the setup code it gives you below.",
            Font = new Font("Segoe UI", 10f),
            ForeColor = Palette.TextMuted,
            AutoSize = true,
            Location = new Point(34, 70),
        };

        var codeLabel = new Label
        {
            Text = "Setup code",
            Font = new Font("Segoe UI", 9f, FontStyle.Bold),
            ForeColor = Palette.TextMuted,
            AutoSize = true,
            Location = new Point(34, 128),
        };

        _codeBox = new TextBox
        {
            Font = new Font("Consolas", 18f, FontStyle.Bold),
            CharacterCasing = CharacterCasing.Upper,
            TextAlign = HorizontalAlignment.Center,
            BackColor = Palette.Surface,
            ForeColor = Palette.TextPrimary,
            BorderStyle = BorderStyle.FixedSingle,
            Location = new Point(34, 150),
            Width = 452,
            MaxLength = 20,
        };

        _connectButton = new Button
        {
            Text = "Connect this PC",
            Font = new Font("Segoe UI", 11f, FontStyle.Bold),
            BackColor = Palette.Accent,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Location = new Point(34, 208),
            Size = new Size(452, 44),
        };
        _connectButton.FlatAppearance.BorderSize = 0;
        _connectButton.Click += async (_, _) => await EnrollAsync();

        _statusLabel = new Label
        {
            Text = string.Empty,
            Font = new Font("Segoe UI", 9f),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Location = new Point(34, 262),
            Size = new Size(452, 50),
        };

        Controls.AddRange([heading, explanation, codeLabel, _codeBox, _connectButton, _statusLabel]);

        AcceptButton = _connectButton;
    }

    private async Task EnrollAsync()
    {
        var code = _codeBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(code))
        {
            SetStatus("Enter the setup code from your dashboard.", isError: true);
            return;
        }

        if (string.IsNullOrWhiteSpace(_config.EnrollUrl))
        {
            SetStatus("No setup address is configured. Check enrollUrl in appsettings.json.", isError: true);
            return;
        }

        _connectButton.Enabled = false;
        SetStatus("Connecting…", isError: false);

        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                code,
                machineName = Environment.MachineName,
            });

            using var response = await _http.PostAsync(
                _config.EnrollUrl,
                new StringContent(payload, Encoding.UTF8, "application/json"));

            var body = await response.Content.ReadAsStringAsync();

            if ((int)response.StatusCode is >= 300 and < 400)
            {
                var target = response.Headers.Location?.ToString() ?? "(not given)";
                SetStatus($"The setup address redirects to {target}. Use that address in appsettings.json.", isError: true);
                return;
            }

            if (!response.IsSuccessStatusCode)
            {
                SetStatus(ExtractError(body) ?? $"Setup failed (HTTP {(int)response.StatusCode}).", isError: true);
                return;
            }

            if (!AgentConfig.SaveEnrollment(body, out var saveError))
            {
                SetStatus(saveError ?? "Could not save the settings.", isError: true);
                return;
            }

            AgentLog.Info("Enrollment succeeded. Settings saved.");
            DialogResult = DialogResult.OK;
            Close();
        }
        catch (Exception ex)
        {
            AgentLog.Error($"Enrollment failed: {ex}");
            SetStatus($"Could not reach the website. Check this PC's internet connection.\n{ex.Message}", isError: true);
        }
        finally
        {
            _connectButton.Enabled = true;
        }
    }

    /// <summary>Pulls the server's own message out, which is friendlier than a status code.</summary>
    private static string? ExtractError(string body)
    {
        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.TryGetProperty("error", out var error))
            {
                return error.GetString();
            }
        }
        catch
        {
            // Not JSON; fall back to the caller's generic message.
        }

        return null;
    }

    private void SetStatus(string message, bool isError)
    {
        _statusLabel.Text = message;
        _statusLabel.ForeColor = isError ? Palette.Accent : Palette.TextMuted;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _http.Dispose();
        }

        base.Dispose(disposing);
    }
}
