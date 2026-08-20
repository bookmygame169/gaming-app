namespace PcLockAgent;

/// <summary>
/// Asks whether the customer really means to finish, then tells them what they
/// got back.
/// </summary>
/// <remarks>
/// Two screens rather than one, because they answer different questions. Before:
/// is this what you meant — the machine is about to lock and the next thing they
/// see is the pay screen. After: how much time went back on your number, which
/// is the entire reason for ending a session rather than walking away from it,
/// and which nothing else will ever tell them.
/// <para>
/// A confirmation is not optional here. The button sits on the same screen as
/// the games, one mis-tap ends a paid session, and there is no undo.
/// </para>
/// </remarks>
internal sealed class EndSessionForm : Form
{
    /// <summary>Raised once the customer is finished with this window and the PC should lock.</summary>
    public event EventHandler? SessionEnded;

    /// <summary>Raised when they decide to carry on playing.</summary>
    public event EventHandler? KeptPlaying;

    private const int CardWidth = 620;
    private const int CardHeight = 340;

    private readonly PlayRequestClient _client;

    private readonly Panel _card;
    private readonly Label _title;
    private readonly Label _body;
    private readonly Button _cancelButton;
    private readonly Button _confirmButton;

    private bool _settling;

    public EndSessionForm(PlayRequestClient client)
    {
        _client = client;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        KeyPreview = true;
        DoubleBuffered = true;

        var screen = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        Bounds = screen;

        _card = new Panel
        {
            Width = CardWidth,
            Height = CardHeight,
            BackColor = Palette.Surface,
            Left = (screen.Width - CardWidth) / 2,
            Top = (screen.Height - CardHeight) / 2,
        };

        Theme.RoundCorners(_card, 16);
        _card.Paint += (_, e) => Theme.DrawBorder(
            e.Graphics,
            new Rectangle(0, 0, _card.Width - 1, _card.Height - 1),
            Palette.CardBorder,
            1f,
            16);

        _title = new Label
        {
            Font = new Font("Segoe UI", 19f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 40,
            Top = 40,
            Width = CardWidth - 80,
            Height = 34,
        };

        _body = new Label
        {
            Font = new Font("Segoe UI", 11f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 40,
            Top = 86,
            Width = CardWidth - 80,
            Height = 140,
        };

        _cancelButton = new Button
        {
            Text = "Keep playing",
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            BackColor = Palette.Border,
            FlatStyle = FlatStyle.Flat,
            Left = 40,
            Top = CardHeight - 84,
            Width = 200,
            Height = 46,
            Cursor = Cursors.Hand,
            FlatAppearance = { BorderSize = 0 },
        };

        _confirmButton = new Button
        {
            Text = "Yes, end my session",
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            ForeColor = Color.White,
            BackColor = Palette.Accent,
            FlatStyle = FlatStyle.Flat,
            Left = CardWidth - 40 - 250,
            Top = CardHeight - 84,
            Width = 250,
            Height = 46,
            Cursor = Cursors.Hand,
            FlatAppearance = { BorderSize = 0 },
        };

        Theme.RoundCorners(_cancelButton, 12);
        Theme.RoundCorners(_confirmButton, 12);

        _cancelButton.Click += (_, _) => Dismiss(ended: false);
        _confirmButton.Click += (_, _) => OnConfirm();

        _card.Controls.Add(_title);
        _card.Controls.Add(_body);
        _card.Controls.Add(_cancelButton);
        _card.Controls.Add(_confirmButton);
        Controls.Add(_card);

        KeyDown += (_, e) =>
        {
            // Escape is the safe answer, and it is the safe answer on both
            // screens: before confirming it means carry on, and after settling
            // the time has already gone back so there is nothing left to undo.
            if (e.KeyCode == Keys.Escape && !_settling)
            {
                Dismiss(ended: _confirmButton.Tag as string == "done");
            }
        };
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // Dimmed rather than the usual backdrop: the game menu is still behind
        // this and the customer has not left it yet.
        using var shade = new SolidBrush(Color.FromArgb(190, 0, 0, 0));
        e.Graphics.FillRectangle(shade, ClientRectangle);
    }

    /// <summary>Opens on the confirmation question.</summary>
    public void AskToEnd()
    {
        _settling = false;

        _title.Text = "Finished playing?";
        _body.Text =
            "Your PC will lock and you will be taken back to the pay screen.\r\n\r\n"
            + "If you are on a membership, the hours you have not used go back onto your "
            + "mobile number — you can use them next time.";

        _cancelButton.Visible = true;
        _cancelButton.Enabled = true;
        _confirmButton.Enabled = true;
        _confirmButton.Text = "Yes, end my session";
        _confirmButton.Tag = null;

        Show();
        BringToFront();
        Activate();
        _cancelButton.Focus();
    }

    private async void OnConfirm()
    {
        if (_settling)
        {
            return;
        }

        // Already settled — this is the "Done" press on the second screen.
        if (_confirmButton.Tag as string == "done")
        {
            Dismiss(ended: true);
            return;
        }

        _settling = true;
        _confirmButton.Enabled = false;
        _cancelButton.Enabled = false;
        _confirmButton.Text = "Ending…";

        var result = await _client.EndSessionAsync().ConfigureAwait(true);

        _settling = false;
        ShowOutcome(result);
    }

    /// <summary>
    /// The second screen: what actually happened.
    /// </summary>
    /// <remarks>
    /// Never an error, even when the settle failed. The machine is locking
    /// either way, and a customer standing up to leave can do nothing with
    /// "could not reach the server" except worry about hours they cannot check.
    /// A café whose internet was down settles at the counter, which is where
    /// that conversation belongs.
    /// </remarks>
    private void ShowOutcome(EndSessionResult? result)
    {
        _cancelButton.Visible = false;
        _confirmButton.Enabled = true;
        _confirmButton.Text = "Done";
        _confirmButton.Tag = "done";

        if (result is { Settled: true } && !result.IsDayPass)
        {
            _title.Text = "Thanks for playing";
            _body.Text =
                $"You played for {FormatHours(result.HoursUsed)}.\r\n\r\n"
                + $"{FormatHours(result.HoursRemaining)} left on your {result.PlanName ?? "membership"}. "
                + "Scan the code on the lock screen next time to use it.";
        }
        else if (result is { Settled: true })
        {
            _title.Text = "Thanks for playing";
            _body.Text =
                $"You played for {FormatHours(result.HoursUsed)} on your day pass.\r\n\r\n"
                + "Your day pass is finished for today.";
        }
        else
        {
            _title.Text = "Thanks for playing";
            _body.Text = "Your PC is locking now. Please see the counter if you need anything.";
        }

        _confirmButton.Focus();
    }

    private static string FormatHours(double hours)
    {
        var totalMinutes = Math.Max(0, (int)Math.Round(hours * 60));
        var wholeHours = totalMinutes / 60;
        var minutes = totalMinutes % 60;

        if (wholeHours == 0)
        {
            return $"{minutes} min";
        }

        return minutes == 0
            ? $"{wholeHours} hr"
            : $"{wholeHours} hr {minutes} min";
    }

    private void Dismiss(bool ended)
    {
        Hide();

        if (ended)
        {
            SessionEnded?.Invoke(this, EventArgs.Empty);
        }
        else
        {
            KeptPlaying?.Invoke(this, EventArgs.Empty);
        }
    }
}
