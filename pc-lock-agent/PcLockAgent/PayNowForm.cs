namespace PcLockAgent;

/// <summary>
/// Buying time without leaving the machine.
/// </summary>
/// <remarks>
/// The third way into a session, after the counter and the QR on a phone. It
/// exists for the customer who sits down at a locked PC with cash in their
/// pocket and no account: their only option used to be to get up and find
/// somebody.
/// <para>
/// Nothing on this screen unlocks anything. It collects a name, a number and a
/// choice, sends them, and waits — the owner approving in the dashboard is what
/// opens the machine, and the clock starts then rather than here.
/// </para>
/// </remarks>
internal sealed class PayNowForm : Form
{
    private enum Step
    {
        Who,
        What,
        How,
        Confirm,
        Waiting,
        Refused,
    }

    /// <summary>Raised when the customer closes this and goes back to the lock screen.</summary>
    public event EventHandler? Dismissed;

    private const int CardWidth = 780;
    private const int CardHeight = 660;

    /// <summary>
    /// How often the waiting screen asks whether it was turned down.
    /// </summary>
    /// <remarks>
    /// An approval never arrives this way — it comes over MQTT like every other
    /// unlock, and lands within a second. This poll only catches the answer
    /// nothing else reports, so it can afford to be slow.
    /// </remarks>
    private static readonly TimeSpan StatusPollInterval = TimeSpan.FromSeconds(6);

    private readonly AgentConfig _config;
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
    private Step _step = Step.Who;

    private string _name = string.Empty;
    private string _phone = string.Empty;

    private string _type = "hourly";
    private int? _durationMinutes;
    private string? _planId;
    private string _choiceLabel = string.Empty;
    private decimal _choicePrice;

    private string _paymentMethod = "counter";
    private string? _requestId;
    private Image? _paymentQr;

    public PayNowForm(AgentConfig config, PlayRequestClient client)
    {
        _config = config;
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
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 44,
            Top = 36,
            Width = CardWidth - 88,
            Height = 34,
        };

        _subtitle = new Label
        {
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 44,
            Top = 72,
            Width = CardWidth - 88,
            Height = 40,
        };

        _content = new Panel
        {
            Left = 44,
            Top = 122,
            Width = CardWidth - 88,
            Height = CardHeight - 122 - 96,
            BackColor = Palette.Surface,
            AutoScroll = true,
        };

        _problem = new Label
        {
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Palette.Accent,
            AutoSize = false,
            Left = 44,
            Top = CardHeight - 90,
            Width = CardWidth - 88,
            Height = 30,
            Visible = false,
        };

        _backButton = SecondaryButton("Back", 44, CardHeight - 60);
        _backButton.Click += (_, _) => GoBack();

        _nextButton = PrimaryButton("Next", CardWidth - 44 - 200, CardHeight - 60, 200);
        _nextButton.Click += (_, _) => GoNext();

        _card.Controls.Add(_title);
        _card.Controls.Add(_subtitle);
        _card.Controls.Add(_content);
        _card.Controls.Add(_problem);
        _card.Controls.Add(_backButton);
        _card.Controls.Add(_nextButton);
        Controls.Add(_card);

        Theme.RoundCorners(_card, 16);
        _card.Paint += (_, e) => Theme.DrawBorder(
            e.Graphics,
            new Rectangle(0, 0, _card.Width - 1, _card.Height - 1),
            Palette.CardBorder,
            1f,
            16);

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
        Theme.PaintBackdrop(e.Graphics, ClientRectangle);
    }

    /// <summary>Opens the flow, reading the price list first.</summary>
    public async Task StartAsync()
    {
        _step = Step.Who;
        _name = string.Empty;
        _phone = string.Empty;
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

        // An agent that restarted while a request was waiting finds it again
        // rather than offering to make a second one the owner would have to
        // refuse.
        if (_options.PendingRequest is not null)
        {
            _requestId = _options.PendingRequest.Id;
            _choicePrice = _options.PendingRequest.Amount;
            _paymentMethod = _options.PendingRequest.PaymentMethod;
            _step = Step.Waiting;
            StartPolling();
        }

        Render();
    }

    // ------------------------------------------------------------------ steps

    private void GoBack()
    {
        HideProblem();

        switch (_step)
        {
            case Step.Who:
                CancelAndClose();
                return;
            case Step.What:
                _step = Step.Who;
                break;
            case Step.How:
                _step = Step.What;
                break;
            case Step.Confirm:
                _step = Step.How;
                break;
            case Step.Waiting:
            case Step.Refused:
                CancelAndClose();
                return;
        }

        Render();
    }

    private void GoNext()
    {
        HideProblem();

        switch (_step)
        {
            case Step.Who:
                if (!ReadWho())
                {
                    return;
                }

                _step = Step.What;
                break;

            case Step.What:
                // Nothing selected. The tiles set the choice themselves, so
                // getting here without one means none was tapped.
                if (string.IsNullOrEmpty(_choiceLabel))
                {
                    ShowProblem("Please choose what you would like.");
                    return;
                }

                _step = Step.How;
                break;

            case Step.How:
                _step = Step.Confirm;
                break;

            case Step.Confirm:
                _ = SubmitAsync();
                return;

            case Step.Waiting:
                CancelAndClose();
                return;

            case Step.Refused:
                _step = Step.What;
                break;
        }

        Render();
    }

    private bool ReadWho()
    {
        var nameBox = _content.Controls.Find("name", false).FirstOrDefault() as TextBox;
        var phoneBox = _content.Controls.Find("phone", false).FirstOrDefault() as TextBox;

        _name = nameBox?.Text.Trim() ?? string.Empty;
        _phone = new string((phoneBox?.Text ?? string.Empty).Where(char.IsDigit).ToArray());

        if (_name.Length < 2)
        {
            ShowProblem("Please type your name.");
            return false;
        }

        // Ten digits, which is every Indian mobile number. Checked here as well
        // as on the server so the customer is told before they pick a plan
        // rather than after.
        if (_phone.Length != 10)
        {
            ShowProblem("Please type your 10-digit mobile number.");
            return false;
        }

        return true;
    }

    private async Task SubmitAsync()
    {
        _nextButton.Enabled = false;
        _nextButton.Text = "Sending…";

        var (result, problem) = await _client
            .SubmitAsync(_name, _phone, _type, _durationMinutes, _planId, _paymentMethod)
            .ConfigureAwait(true);

        _nextButton.Enabled = true;

        if (result is null)
        {
            _nextButton.Text = "Send request";
            ShowProblem(problem ?? "Could not send your request.");
            return;
        }

        _requestId = result.RequestId;
        _choicePrice = result.Amount;
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

    // ---------------------------------------------------------------- waiting

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

        // Approval is not handled here on purpose. The unlock arrives over MQTT
        // and the shell closes this window when it does, which is the same path
        // every other unlock takes — duplicating it here would give one
        // customer two ways to start a session and two chances to disagree.
        if (status.Status is "rejected" or "cancelled" or "expired")
        {
            StopPolling();
            _step = Step.Refused;
            Render();
        }
    }

    // ----------------------------------------------------------------- render

    private void Render()
    {
        _content.SuspendLayout();
        _backButton.Visible = true;

        foreach (Control control in _content.Controls.Cast<Control>().ToArray())
        {
            control.Dispose();
        }

        _content.Controls.Clear();
        _content.AutoScrollPosition = new Point(0, 0);

        switch (_step)
        {
            case Step.Who:
                RenderWho();
                break;
            case Step.What:
                RenderWhat();
                break;
            case Step.How:
                RenderHow();
                break;
            case Step.Confirm:
                RenderConfirm();
                break;
            case Step.Waiting:
                RenderWaiting();
                break;
            case Step.Refused:
                RenderRefused();
                break;
        }

        _content.ResumeLayout();
    }

    private void RenderWho()
    {
        _title.Text = "Pay and play";
        _subtitle.Text = $"Station {_config.StationId.ToUpperInvariant()} — tell us who you are, and we will send your request to the counter.";
        _backButton.Text = "Cancel";
        _nextButton.Text = "Next";
        _nextButton.Enabled = true;

        _content.Controls.Add(FieldLabel("YOUR NAME", 0));
        var nameBox = Field("name", _name, 26);
        _content.Controls.Add(nameBox);

        _content.Controls.Add(FieldLabel("MOBILE NUMBER", 96));
        var phoneBox = Field("phone", _phone, 122);
        phoneBox.MaxLength = 10;
        _content.Controls.Add(phoneBox);

        _content.Controls.Add(new Label
        {
            Text = "We use your number to keep track of any membership hours you have left.",
            Font = new Font("Segoe UI", 9f, FontStyle.Regular),
            ForeColor = Palette.TextFaint,
            AutoSize = false,
            Left = 2,
            Top = 176,
            Width = _content.Width - 24,
            Height = 22,
        });

        nameBox.Focus();
    }

    private void RenderWhat()
    {
        _title.Text = "What would you like?";
        _subtitle.Text = "Tap one. Nothing is charged until the counter approves it.";
        _backButton.Text = "Back";
        _nextButton.Text = "Next";
        _nextButton.Enabled = true;

        var top = 0;

        if (_options is null)
        {
            _content.Controls.Add(new Label
            {
                Text = "Could not load the price list. Please ask at the counter.",
                Font = new Font("Segoe UI", 11f, FontStyle.Regular),
                ForeColor = Palette.TextMuted,
                AutoSize = false,
                Left = 2,
                Top = 8,
                Width = _content.Width - 24,
                Height = 40,
            });
            return;
        }

        if (_options.Hourly is { Count: > 0 })
        {
            _content.Controls.Add(SectionHeading("BY THE HOUR", top));
            top += 30;

            foreach (var option in _options.Hourly)
            {
                var minutes = option.DurationMinutes;
                var label = minutes % 60 == 0
                    ? $"{minutes / 60} hour{(minutes == 60 ? "" : "s")}"
                    : $"{minutes} minutes";

                _content.Controls.Add(ChoiceTile(
                    label,
                    "Play for this long, then the PC locks again.",
                    option.Price,
                    top,
                    isSelected: _type == "hourly" && _durationMinutes == minutes,
                    onPick: () =>
                    {
                        _type = "hourly";
                        _durationMinutes = minutes;
                        _planId = null;
                        _choiceLabel = label;
                        _choicePrice = option.Price;
                        Render();
                    }));

                top += 68;
            }

            top += 10;
        }

        // Memberships are not sold here. The server no longer offers any, and
        // this says why rather than leaving a member to pay twice for hours
        // they already own.
        AddPlanSection("MEMBERSHIPS", _options.Memberships, "membership", ref top);
        AddPlanSection("DAY PASS", _options.DayPasses, "day_pass", ref top);

        _content.Controls.Add(MemberHint(top));
    }

    /// <summary>
    /// Points a member at the code on the lock screen.
    /// </summary>
    /// <remarks>
    /// Without this, taking memberships off this screen quietly charges members
    /// twice: they sit down, see only hours and a day pass, and buy time they
    /// already have. The scanned code is the one route that knows who they are,
    /// so it is the one that can spend their hours instead of their money.
    /// </remarks>
    private Panel MemberHint(int top)
    {
        var hint = new Panel
        {
            Left = 2,
            Top = top + 4,
            Width = _content.Width - 26,
            Height = 66,
            BackColor = Palette.Background,
        };

        hint.Controls.Add(new Label
        {
            Text = "Already have a membership?",
            Font = new Font("Segoe UI", 10.5f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 16,
            Top = 12,
            Width = hint.Width - 32,
            Height = 20,
            BackColor = Color.Transparent,
        });

        hint.Controls.Add(new Label
        {
            Text = "Go back and scan the code on the lock screen to use your hours.",
            Font = new Font("Segoe UI", 9f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 16,
            Top = 34,
            Width = hint.Width - 32,
            Height = 20,
            BackColor = Color.Transparent,
        });

        Theme.RoundCorners(hint, 10);
        hint.Paint += (_, e) => Theme.DrawBorder(
            e.Graphics,
            new Rectangle(0, 0, hint.Width - 1, hint.Height - 1),
            Palette.CardBorder,
            1f,
            10);

        return hint;
    }

    private void AddPlanSection(string heading, List<PlanOption>? plans, string type, ref int top)
    {
        if (plans is null || plans.Count == 0)
        {
            return;
        }

        _content.Controls.Add(SectionHeading(heading, top));
        top += 30;

        foreach (var plan in plans)
        {
            var hint = type == "membership"
                ? $"{plan.Hours:0.#} hours to use over {plan.ValidityDays} days. Play now, and whatever you do not use stays on your number."
                : "Play all day. End your session whenever you like and come back.";

            var planId = plan.Id;
            var planName = plan.Name;
            var price = plan.Price;

            _content.Controls.Add(ChoiceTile(
                planName,
                hint,
                price,
                top,
                isSelected: _planId == planId,
                onPick: () =>
                {
                    _type = type;
                    _planId = planId;
                    _durationMinutes = null;
                    _choiceLabel = planName;
                    _choicePrice = price;
                    Render();
                }));

            top += 78;
        }

        top += 10;
    }

    private void RenderHow()
    {
        _title.Text = "How would you like to pay?";
        _subtitle.Text = $"{_choiceLabel} — ₹{_choicePrice:0}";
        _backButton.Text = "Back";
        _nextButton.Text = "Next";
        _nextButton.Enabled = true;

        var canPayOnline = _options?.Upi is not null;
        var top = 0;

        if (canPayOnline)
        {
            _content.Controls.Add(ChoiceTile(
                "Pay online",
                "Scan a QR with any UPI app. The amount is already filled in.",
                null,
                top,
                isSelected: _paymentMethod == "online",
                onPick: () =>
                {
                    _paymentMethod = "online";
                    Render();
                }));

            top += 78;
        }

        _content.Controls.Add(ChoiceTile(
            "Pay at the counter",
            "Walk over and pay with cash or card. Your PC unlocks once the counter approves.",
            null,
            top,
            isSelected: _paymentMethod == "counter" || !canPayOnline,
            onPick: () =>
            {
                _paymentMethod = "counter";
                Render();
            }));

        if (!canPayOnline)
        {
            _paymentMethod = "counter";
        }
    }

    private void RenderConfirm()
    {
        _title.Text = "Check this is right";
        _subtitle.Text = "Send it and the counter will approve you in a moment.";
        _backButton.Text = "Back";
        _nextButton.Text = "Send request";
        _nextButton.Enabled = true;

        var rows = new (string Label, string Value)[]
        {
            ("Name", _name),
            ("Mobile", _phone),
            ("Station", _config.StationId.ToUpperInvariant()),
            ("You chose", _choiceLabel),
            ("Paying", _paymentMethod == "online" ? "Online, by UPI" : "At the counter"),
            ("Amount", $"₹{_choicePrice:0}"),
        };

        var top = 0;
        foreach (var (label, value) in rows)
        {
            _content.Controls.Add(SummaryRow(label, value, top));
            top += 46;
        }
    }

    private void RenderWaiting()
    {
        _title.Text = "Waiting for the counter";
        _subtitle.Text = _paymentMethod == "online"
            ? "Scan to pay, then wait here. Your PC unlocks as soon as it is approved."
            : "Please pay at the counter. Your PC unlocks as soon as it is approved.";

        _backButton.Visible = false;
        _nextButton.Text = "Close";
        _nextButton.Enabled = true;

        var top = 0;

        if (_paymentQr is not null)
        {
            var box = new PictureBox
            {
                Image = _paymentQr,
                SizeMode = PictureBoxSizeMode.Zoom,
                Width = 220,
                Height = 220,
                Left = (_content.Width - 240) / 2,
                Top = top,
                BackColor = Color.White,
                Padding = new Padding(10),
            };

            _content.Controls.Add(box);
            top += 232;

            _content.Controls.Add(new Label
            {
                Text = $"₹{_choicePrice:0} to {_options?.Upi?.Name ?? "the café"}",
                Font = new Font("Segoe UI", 12f, FontStyle.Bold),
                ForeColor = Palette.TextPrimary,
                TextAlign = ContentAlignment.MiddleCenter,
                AutoSize = false,
                Left = 0,
                Top = top,
                Width = _content.Width - 24,
                Height = 26,
            });

            top += 34;
        }

        _content.Controls.Add(new Label
        {
            Text = _paymentMethod == "online"
                ? $"Tell the counter you have paid if nothing happens after a minute — station {_config.StationId.ToUpperInvariant()}."
                : $"Tell them this is station {_config.StationId.ToUpperInvariant()}, {_name}, ₹{_choicePrice:0}.",
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            TextAlign = ContentAlignment.MiddleCenter,
            AutoSize = false,
            Left = 0,
            Top = top,
            Width = _content.Width - 24,
            Height = 46,
        });
    }

    private void RenderRefused()
    {
        _title.Text = "Not approved";
        _subtitle.Text = "The counter did not approve this request.";
        _backButton.Text = "Close";
        _nextButton.Text = "Try again";
        _nextButton.Enabled = true;

        _content.Controls.Add(new Label
        {
            Text = "Please speak to the counter — they can start your session from there.",
            Font = new Font("Segoe UI", 11f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 2,
            Top = 8,
            Width = _content.Width - 24,
            Height = 60,
        });
    }

    // ------------------------------------------------------------- small parts

    private Label SectionHeading(string text, int top) => new()
    {
        Text = text,
        Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
        ForeColor = Palette.AccentSoft,
        AutoSize = false,
        Left = 2,
        Top = top,
        Width = _content.Width - 24,
        Height = 22,
    };

    private Label FieldLabel(string text, int top) => new()
    {
        Text = text,
        Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
        ForeColor = Palette.TextMuted,
        AutoSize = false,
        Left = 2,
        Top = top,
        Width = _content.Width - 24,
        Height = 20,
    };

    private TextBox Field(string name, string value, int top) => new()
    {
        Name = name,
        Text = value,
        Font = new Font("Segoe UI", 15f, FontStyle.Regular),
        ForeColor = Palette.TextPrimary,
        BackColor = Palette.Background,
        BorderStyle = BorderStyle.FixedSingle,
        Left = 2,
        Top = top,
        Width = _content.Width - 26,
        Height = 46,
    };

    private Panel SummaryRow(string label, string value, int top)
    {
        var row = new Panel
        {
            Left = 2,
            Top = top,
            Width = _content.Width - 26,
            Height = 40,
            BackColor = Palette.Surface,
        };

        row.Controls.Add(new Label
        {
            Text = label,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Left = 0,
            Top = 10,
            Width = 200,
            Height = 22,
        });

        row.Controls.Add(new Label
        {
            Text = value,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Left = 200,
            Top = 8,
            Width = row.Width - 200,
            Height = 24,
        });

        row.Paint += (_, e) =>
        {
            using var pen = new Pen(Palette.Border);
            e.Graphics.DrawLine(pen, 0, row.Height - 1, row.Width, row.Height - 1);
        };

        return row;
    }

    /// <summary>One tappable option. The whole tile is the target, not a radio button.</summary>
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
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
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
            Font = new Font("Segoe UI", 8.5f, FontStyle.Regular),
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
                Font = new Font("Segoe UI", 15f, FontStyle.Bold),
                ForeColor = isSelected ? Palette.TextPrimary : Palette.AccentSoft,
                TextAlign = ContentAlignment.MiddleRight,
                AutoSize = false,
                Left = tile.Width - 136,
                Top = 18,
                Width = 120,
                Height = 28,
                BackColor = Color.Transparent,
            });
        }

        Theme.RoundCorners(tile, 10);
        tile.Paint += (_, e) => Theme.DrawBorder(
            e.Graphics,
            new Rectangle(0, 0, tile.Width - 1, tile.Height - 1),
            isSelected ? Palette.Accent : Palette.CardBorder,
            isSelected ? 2f : 1f,
            10);

        // Every child as well as the tile: a click landing on the label is the
        // same click as far as the customer is concerned.
        void Pick(object? sender, EventArgs args) => onPick();

        tile.Click += Pick;
        foreach (Control child in tile.Controls)
        {
            child.Click += Pick;
            child.Cursor = Cursors.Hand;
        }

        return tile;
    }

    private static Button PrimaryButton(string text, int left, int top, int width) => new()
    {
        Text = text,
        Font = new Font("Segoe UI", 11f, FontStyle.Bold),
        ForeColor = Color.White,
        BackColor = Palette.Accent,
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
        Font = new Font("Segoe UI", 10f, FontStyle.Regular),
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

    private void HideProblem() => _problem.Visible = false;

    private void ClearPaymentQr()
    {
        _paymentQr?.Dispose();
        _paymentQr = null;
    }

    /// <summary>
    /// Closes without cancelling anything on the server.
    /// </summary>
    /// <remarks>
    /// A request already sent stays sent. The customer closing this window is
    /// not the same as withdrawing it — they may simply want to see the lock
    /// screen's station number while they walk to the counter, and the owner
    /// is about to approve something that would then have nowhere to land.
    /// </remarks>
    private void CancelAndClose()
    {
        StopPolling();
        Hide();
        Dismissed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Called by the shell when the station unlocks.</summary>
    public void CloseAfterUnlock()
    {
        StopPolling();
        _requestId = null;
        ClearPaymentQr();
        Hide();
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
