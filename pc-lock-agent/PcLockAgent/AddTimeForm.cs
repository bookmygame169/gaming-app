namespace PcLockAgent;

/// <summary>
/// Buying another hour without leaving the seat.
/// </summary>
/// <remarks>
/// The moment this exists for: ten minutes left, a match running, and the only
/// way to carry on was to stand up, find somebody at the counter, pay, and get
/// back before the screen locked. Plenty of customers did the first half of
/// that and never came back, which is an hour the café had already sold and
/// then handed back.
/// <para>
/// Deliberately shorter than <see cref="PayNowForm"/>. The person is already
/// playing, so there is no name to collect and no membership to weigh up -
/// how long, how they are paying, done. Nothing here changes the clock: the
/// owner approving in the dashboard is what does that, and the extra time
/// arrives the same way every other change to a session does.
/// </para>
/// </remarks>
internal sealed class AddTimeForm : Form
{
    private enum Step
    {
        Choosing,
        Paying,
        Waiting,
        Refused,
    }

    /// <summary>Raised when the customer closes this and goes back to their games.</summary>
    public event EventHandler? Dismissed;

    private const int CardWidth = 720;
    private const int CardHeight = 560;

    /// <summary>
    /// How often the waiting screen asks whether it was turned down.
    /// </summary>
    /// <remarks>
    /// An approval never arrives this way. It comes over MQTT like every other
    /// change to a session, and the shell closes this window when it lands.
    /// This poll only catches the answer nothing else reports.
    /// </remarks>
    private static readonly TimeSpan StatusPollInterval = TimeSpan.FromSeconds(6);

    private readonly PlayRequestClient _client;

    private readonly Panel _card;
    private readonly Panel _content;
    private readonly Label _title;
    private readonly Label _subtitle;
    private readonly Label _problem;
    private readonly Button _backButton;
    private readonly Button _nextButton;

    private System.Windows.Forms.Timer? _pollTimer;

    private PlayOptions? _options;
    private Step _step = Step.Choosing;

    private int? _durationMinutes;
    private decimal _choicePrice;
    private string _choiceLabel = string.Empty;

    private string _paymentMethod = "counter";
    private string? _requestId;
    private Image? _paymentQr;

    public AddTimeForm(PlayRequestClient client)
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
            Top = Math.Max(20, (screen.Height - CardHeight) / 2),
        };

        _title = new Label
        {
            Font = Arena.Sans(20f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 40,
            Top = 34,
            Width = CardWidth - 80,
            Height = 34,
        };

        _subtitle = new Label
        {
            Font = Arena.Sans(10f),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 40,
            Top = 70,
            Width = CardWidth - 80,
            Height = 40,
        };

        _content = new Panel
        {
            Left = 40,
            Top = 118,
            Width = CardWidth - 80,
            Height = CardHeight - 118 - 96,
            BackColor = Palette.Surface,
            AutoScroll = true,
        };

        _problem = new Label
        {
            Font = Arena.Sans(9.5f, FontStyle.Bold),
            ForeColor = Palette.Accent,
            AutoSize = false,
            Left = 40,
            Top = CardHeight - 90,
            Width = CardWidth - 80,
            Height = 30,
            Visible = false,
        };

        _backButton = SecondaryButton("Back", 40, CardHeight - 60);
        _backButton.Click += (_, _) => GoBack();

        _nextButton = PrimaryButton("Next", CardWidth - 40 - 200, CardHeight - 60, 200);
        _nextButton.Click += (_, _) => GoNext();

        _card.Controls.Add(_title);
        _card.Controls.Add(_subtitle);
        _card.Controls.Add(_content);
        _card.Controls.Add(_problem);
        _card.Controls.Add(_backButton);
        _card.Controls.Add(_nextButton);
        Controls.Add(_card);

        Arena.CutCorners(_card, 28);
        _card.Paint += (_, e) =>
        {
            Arena.DrawTopEdge(e.Graphics, new Rectangle(0, 0, _card.Width, 3), Palette.Cyan);
            Arena.DrawCutBorder(
                e.Graphics,
                new Rectangle(0, 0, _card.Width - 1, _card.Height - 1),
                Color.FromArgb(30, 255, 255, 255),
                1f,
                28);
        };

        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Escape)
            {
                CancelAndClose();
            }
        };
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        Arena.PaintArena(e.Graphics, ClientRectangle);

        // Dimmed rather than opaque: the customer's own menu is behind this and
        // seeing it there is what makes the card read as a question rather than
        // as their session having ended.
        using var shade = new SolidBrush(Color.FromArgb(150, 0, 0, 0));
        e.Graphics.FillRectangle(shade, ClientRectangle);
    }

    /// <summary>Opens the flow, reading the price list first.</summary>
    public async Task StartAsync()
    {
        _step = Step.Choosing;
        _durationMinutes = null;
        _requestId = null;
        ClearPaymentQr();

        Show();
        BringToFront();
        Activate();
        Render();

        _options = await _client.GetOptionsAsync().ConfigureAwait(true);

        if (_options is null)
        {
            ShowProblem("This PC cannot reach the counter system right now. Please ask at the counter.");
            return;
        }

        Render();
    }

    /// <summary>
    /// Takes this off the screen without treating it as a cancellation.
    /// </summary>
    /// <remarks>
    /// Two reasons, both from the shell. The extra time landed, which is the
    /// only signal that actually means yes - a card still saying "waiting" over
    /// a clock that has already grown would have the customer press something
    /// again. Or the session ended underneath it, and a question about buying
    /// more time must not be left floating over the lock screen.
    /// </remarks>
    public void CloseQuietly()
    {
        StopPolling();
        _requestId = null;
        ClearPaymentQr();
        Hide();
    }

    // ---------------------------------------------------------------- steps

    private void GoBack()
    {
        switch (_step)
        {
            case Step.Paying:
                _step = Step.Choosing;
                Render();
                break;

            default:
                CancelAndClose();
                break;
        }
    }

    private async void GoNext()
    {
        _problem.Visible = false;

        switch (_step)
        {
            case Step.Choosing:
                if (_durationMinutes is null)
                {
                    ShowProblem("Choose how much longer you want to play.");
                    return;
                }

                _step = Step.Paying;
                Render();
                return;

            case Step.Paying:
                await SubmitAsync().ConfigureAwait(true);
                return;

            default:
                CancelAndClose();
                return;
        }
    }

    private void CancelAndClose()
    {
        StopPolling();
        ClearPaymentQr();
        Hide();
        Dismissed?.Invoke(this, EventArgs.Empty);
    }

    private async Task SubmitAsync()
    {
        _nextButton.Enabled = false;

        try
        {
            // No name and no number. The server takes both off the booking this
            // machine is already in - the name on the second hour has to be the
            // name on the first, and it is not this screen's to change.
            var (result, problem) = await _client
                .SubmitAsync(string.Empty, string.Empty, "extend", _durationMinutes, null, _paymentMethod)
                .ConfigureAwait(true);

            if (result is null)
            {
                ShowProblem(problem ?? "Could not ask the counter. Please ask them directly.");
                return;
            }

            _requestId = result.RequestId;
            _choicePrice = result.Amount;
            _choiceLabel = result.Label;
            _paymentMethod = result.PaymentMethod;

            ClearPaymentQr();
            if (!string.IsNullOrWhiteSpace(result.UpiLink))
            {
                _paymentQr = QrImage.Render(result.UpiLink!, 8);
            }

            _step = Step.Waiting;
            StartPolling();
            Render();
        }
        finally
        {
            _nextButton.Enabled = true;
        }
    }

    // -------------------------------------------------------------- waiting

    private void StartPolling()
    {
        _pollTimer ??= new System.Windows.Forms.Timer
        {
            Interval = (int)StatusPollInterval.TotalMilliseconds,
        };

        _pollTimer.Tick -= OnPollTick;
        _pollTimer.Tick += OnPollTick;
        _pollTimer.Start();
    }

    private void StopPolling()
    {
        _pollTimer?.Stop();
    }

    private async void OnPollTick(object? sender, EventArgs e)
    {
        if (_requestId is null || _step != Step.Waiting)
        {
            StopPolling();
            return;
        }

        var status = await _client.GetStatusAsync(_requestId).ConfigureAwait(true);
        if (status is null || _step != Step.Waiting)
        {
            return;
        }

        // Approval is deliberately not handled here. It arrives as more time on
        // the countdown, and the shell closes this window when it does - the
        // same single path every other change to a session takes.
        if (status.Status is "rejected" or "cancelled" or "expired")
        {
            StopPolling();
            _step = Step.Refused;
            Render();
        }
    }

    // --------------------------------------------------------------- render

    private void Render()
    {
        _content.SuspendLayout();

        foreach (Control control in _content.Controls.Cast<Control>().ToArray())
        {
            control.Dispose();
        }

        _content.Controls.Clear();
        _content.AutoScrollPosition = new Point(0, 0);
        _backButton.Visible = true;

        switch (_step)
        {
            case Step.Choosing:
                RenderChoosing();
                break;

            case Step.Paying:
                RenderPaying();
                break;

            case Step.Waiting:
                RenderWaiting();
                break;

            case Step.Refused:
                RenderRefused();
                break;
        }

        _content.ResumeLayout();
        _card.Invalidate();
    }

    private void RenderChoosing()
    {
        _title.Text = "More time";
        _subtitle.Text = "Keep playing on this PC. Your game stays open.";
        _nextButton.Text = "Next";
        _nextButton.Visible = true;

        var hourly = _options?.Hourly ?? [];

        if (hourly.Count == 0)
        {
            _content.Controls.Add(new Label
            {
                Text = "No prices are set for this PC yet. Please ask at the counter.",
                Font = Arena.Sans(10f),
                ForeColor = Palette.TextMuted,
                AutoSize = false,
                Left = 2,
                Top = 8,
                Width = _content.Width - 26,
                Height = 60,
            });

            _nextButton.Visible = false;
            return;
        }

        var top = 0;

        foreach (var option in hourly)
        {
            var minutes = option.DurationMinutes;
            var label = minutes % 60 == 0
                ? $"{minutes / 60} more hour{(minutes == 60 ? "" : "s")}"
                : $"{minutes} more minutes";

            _content.Controls.Add(ChoiceTile(
                label,
                "Added to the time you have left",
                option.Price,
                top,
                _durationMinutes == minutes,
                () =>
                {
                    _durationMinutes = minutes;
                    _choicePrice = option.Price;
                    _choiceLabel = label;
                    Render();
                }));

            top += 74;
        }
    }

    private void RenderPaying()
    {
        _title.Text = "How are you paying?";
        _subtitle.Text = $"{_choiceLabel} · ₹{_choicePrice:0}";
        _nextButton.Text = "Ask the counter";
        _nextButton.Visible = true;

        var top = 0;

        _content.Controls.Add(ChoiceTile(
            "Pay at the counter",
            "Tell them your PC number when you pay",
            null,
            top,
            _paymentMethod == "counter",
            () =>
            {
                _paymentMethod = "counter";
                Render();
            }));

        top += 74;

        // Only where the café has a UPI id to pay into. Offering this with
        // nowhere to send the money would put a customer in front of a QR code
        // that goes nowhere.
        if (_options?.Upi is not null)
        {
            _content.Controls.Add(ChoiceTile(
                "Pay online",
                "Scan a UPI code on the next screen",
                null,
                top,
                _paymentMethod == "online",
                () =>
                {
                    _paymentMethod = "online";
                    Render();
                }));
        }
    }

    private void RenderWaiting()
    {
        _title.Text = "Asked the counter";
        _subtitle.Text = $"{_choiceLabel} · ₹{_choicePrice:0}";
        _backButton.Visible = false;
        _nextButton.Text = "Back to games";
        _nextButton.Visible = true;

        var message = _paymentMethod == "online"
            ? "Scan to pay, then carry on playing. Your time grows as soon as it is approved."
            : "Pay at the counter. Your time grows as soon as it is approved."; 

        _content.Controls.Add(new Label
        {
            Text = message,
            Font = Arena.Sans(11f),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 2,
            Top = 4,
            Width = _content.Width - 26,
            Height = 52,
        });

        if (_paymentQr is not null)
        {
            _content.Controls.Add(new PictureBox
            {
                Image = _paymentQr,
                SizeMode = PictureBoxSizeMode.Zoom,
                Left = 2,
                Top = 62,
                Width = 190,
                Height = 190,
                BackColor = Color.White,
            });
        }

        // Said plainly, because a customer who thinks the game has to be closed
        // for this to work will close it.
        _content.Controls.Add(new Label
        {
            Text = "You can keep playing while you wait.",
            Font = Arena.Sans(9.5f),
            ForeColor = Palette.TextDim,
            AutoSize = false,
            Left = 2,
            Top = _paymentQr is not null ? 262 : 66,
            Width = _content.Width - 26,
            Height = 40,
        });
    }

    private void RenderRefused()
    {
        _title.Text = "Not approved";
        _subtitle.Text = "Nothing has been charged, and your session is untouched.";
        _backButton.Visible = false;
        _nextButton.Text = "Back to games";
        _nextButton.Visible = true;

        _content.Controls.Add(new Label
        {
            Text = "Please ask at the counter if you would like to carry on playing.",
            Font = Arena.Sans(11f),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 2,
            Top = 4,
            Width = _content.Width - 26,
            Height = 60,
        });
    }

    // ---------------------------------------------------------------- parts

    private Panel ChoiceTile(
        string title,
        string hint,
        decimal? price,
        int top,
        bool isSelected,
        Action onPick)
    {
        var tile = new Panel
        {
            Left = 2,
            Top = top,
            Width = _content.Width - 26,
            Height = 64,
            BackColor = isSelected ? Palette.SurfaceHover : Palette.Background,
            Cursor = Cursors.Hand,
        };

        var titleLabel = new Label
        {
            Text = title,
            Font = Arena.Sans(12f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 16,
            Top = 10,
            Width = tile.Width - 150,
            Height = 24,
            BackColor = Color.Transparent,
        };

        var hintLabel = new Label
        {
            Text = hint,
            Font = Arena.Sans(8.5f),
            ForeColor = Palette.TextFaint,
            AutoSize = false,
            Left = 16,
            Top = 34,
            Width = tile.Width - 150,
            Height = 24,
            BackColor = Color.Transparent,
        };

        tile.Controls.Add(titleLabel);
        tile.Controls.Add(hintLabel);

        if (price.HasValue)
        {
            tile.Controls.Add(new Label
            {
                Text = $"₹{price.Value:0}",
                Font = Arena.Mono(15f),
                ForeColor = isSelected ? Palette.TextPrimary : Palette.Cyan,
                TextAlign = ContentAlignment.MiddleRight,
                AutoSize = false,
                Left = tile.Width - 136,
                Top = 18,
                Width = 120,
                Height = 28,
                BackColor = Color.Transparent,
            });
        }

        Arena.CutCorners(tile, 14);
        tile.Paint += (_, e) =>
        {
            Arena.DrawTopEdge(
                e.Graphics,
                new Rectangle(0, 0, tile.Width, 3),
                isSelected ? Palette.Cyan : Color.FromArgb(30, 255, 255, 255));

            if (isSelected)
            {
                Arena.DrawCutBorder(
                    e.Graphics,
                    new Rectangle(0, 0, tile.Width - 1, tile.Height - 1),
                    Palette.Cyan,
                    1f,
                    14);
            }
        };

        // The whole tile, not just its text: a customer aiming at the words and
        // hitting the gap beside them has pressed nothing at all.
        tile.Click += (_, _) => onPick();
        titleLabel.Click += (_, _) => onPick();
        hintLabel.Click += (_, _) => onPick();

        return tile;
    }

    private static Button PrimaryButton(string text, int left, int top, int width) => new()
    {
        Text = text,
        Font = Arena.Sans(11f, FontStyle.Bold),
        ForeColor = Palette.Background,
        BackColor = Palette.Cyan,
        FlatStyle = FlatStyle.Flat,
        Left = left,
        Top = top,
        Width = width,
        Height = 44,
        Cursor = Cursors.Hand,
        FlatAppearance = { BorderSize = 0 },
    };

    private static Button SecondaryButton(string text, int left, int top) => new()
    {
        Text = text,
        Font = Arena.Sans(10f),
        ForeColor = Palette.TextMuted,
        BackColor = Palette.Border,
        FlatStyle = FlatStyle.Flat,
        Left = left,
        Top = top,
        Width = 140,
        Height = 44,
        Cursor = Cursors.Hand,
        FlatAppearance = { BorderSize = 0 },
    };

    private void ShowProblem(string message)
    {
        _problem.Text = message;
        _problem.Visible = true;
    }

    private void ClearPaymentQr()
    {
        _paymentQr?.Dispose();
        _paymentQr = null;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer?.Stop();
            _pollTimer?.Dispose();
            ClearPaymentQr();
        }

        base.Dispose(disposing);
    }
}
