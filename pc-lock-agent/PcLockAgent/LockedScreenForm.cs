namespace PcLockAgent;

/// <summary>
/// The fullscreen "Locked — Scan to Pay" screen shown whenever this PC has no
/// paid session running. It is the only thing a customer should be able to see
/// or interact with until the backend confirms payment.
/// </summary>
/// <remarks>
/// A view only: it decides nothing about sessions. <see cref="AgentShell"/> owns
/// the services and tells this form when to appear.
/// <para>
/// The QR code is still a placeholder — the real one arrives with the backend
/// token endpoint.
/// </para>
/// </remarks>
internal sealed class LockedScreenForm : Form
{
    /// <summary>Fallback for the dev chords if the keyboard hook is not installed.</summary>
    public event EventHandler<DevChord>? DevChordPressed;

    private readonly AgentConfig _config;

    private Label _connectionLabel = null!;
    private Label? _devBadge;
    private Panel? _stationBadge;
    private Panel? _card;
    private Image? _scanCode;

    private const int PlateWidth = 300;
    private const int PlateHeight = 150;
    private const int PlateTop = 150;

    // The code gets its own size and position rather than the plate's inflated
    // by twenty. Borrowing them put its top edge exactly on the divider above,
    // and made the card bottom-heavy because everything below still measured
    // from where the plate would have ended.
    private const int CodeSize = 220;
    private const int CodeTop = 146;
    private const int CardWidth = 560;
    /// <summary>
    /// Card height for whichever of the two blocks is showing.
    /// </summary>
    /// <remarks>
    /// The code is taller than the plate it replaces, so one fixed height suits
    /// exactly one of them and leaves the other with a stretch of empty card
    /// underneath. Measured instead: the last line ends 138 below the block, and
    /// 46 of margin under it matches the 46 above the heading.
    /// </remarks>
    private static int CardHeightFor(bool withCode) =>
        withCode
            ? CodeTop + CodeSize + 138 + 46
            // Shorter without a code: the station number is not repeated below
            // the plate, so there are two fewer lines to leave room for.
            : PlateTop + PlateHeight + 100 + 46;

    public LockedScreenForm(AgentConfig config)
    {
        _config = config;
        InitializeWindowBehaviour();
        BuildLayout();
    }

    /// <summary>
    /// The code a customer scans to pay for a session, or null for none.
    /// </summary>
    /// <remarks>
    /// Null is a normal state, not a failure: a PC that cannot reach the website
    /// shows the station number and the line about asking at the counter, which
    /// is how the café worked before any of this existed.
    /// </remarks>
    public void SetScanCode(Image? code)
    {
        if (IsDisposed)
        {
            code?.Dispose();
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => SetScanCode(code)));
            return;
        }

        _scanCode?.Dispose();
        _scanCode = code;

        if (_card is not null)
        {
            // Resized as well as repainted. The card is centred by its layout
            // cell, so changing the height moves it back to the middle on its
            // own rather than growing downwards off the bottom.
            _card.Height = CardHeightFor(withCode: code is not null);
            _card.Invalidate();
        }
    }

    /// <summary>Shows the lock screen and brings it back to the front.</summary>
    /// <param name="reassertTopMost">
    /// False while dev passthrough is on, so a <c>lock</c> command does not
    /// snatch the screen back over the terminal being used to send it.
    /// </param>
    public void ShowLocked(bool reassertTopMost)
    {
        Show();

        if (!reassertTopMost)
        {
            return;
        }

        // Toggled rather than just set: another window may have taken the
        // foreground while this form was hidden.
        TopMost = false;
        TopMost = true;
        BringToFront();
        Activate();
    }

    public void SetConnectionState(bool connected)
    {
        _connectionLabel.Text = connected
            ? "●  Broker connected"
            : "●  Broker offline — station stays locked";
        _connectionLabel.ForeColor = connected ? Palette.Online : Palette.Warning;
    }

    public void SetPassthroughIndicator(bool suspended)
    {
        if (_devBadge is null)
        {
            return;
        }

        _devBadge.Text = suspended
            ? "DEV BUILD — lock SUSPENDED  (Ctrl+Shift+Alt + L restore)"
            : DevBadgeText;
        _devBadge.ForeColor = suspended ? Palette.Accent : Palette.Warning;
    }

    // -----------------------------------------------------------------------
    // UI
    // -----------------------------------------------------------------------

    private void InitializeWindowBehaviour()
    {
        // No title bar, so there is no close/minimise button to click.
        FormBorderStyle = FormBorderStyle.None;

        // Sizing to the screen's full pixel bounds is what actually covers the
        // Windows taskbar. WindowState.Maximized would NOT — a maximised window
        // politely stops at the taskbar's reserved edge, leaving it clickable.
        Bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);

        // Sit above other windows, including the taskbar.
        TopMost = true;

        // Keep the window out of the taskbar and the Alt+Tab list — belt and
        // braces alongside SystemLockService swallowing Alt+Tab outright.
        ShowInTaskbar = false;

        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Background;
        Text = "BookMyGame — Locked";
        Cursor = Cursors.Default;

        // Route key presses to the form's KeyDown before any child control sees
        // them, so the dev chords work regardless of what has focus.
        KeyPreview = true;
        KeyDown += OnKeyDown;
    }

    /// <summary>Paints the page background instead of the flat fill.</summary>
    protected override void OnPaintBackground(PaintEventArgs e)
    {
        Theme.PaintBackdrop(e.Graphics, ClientRectangle);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _scanCode?.Dispose();
            _scanCode = null;
        }

        base.Dispose(disposing);
    }

    private void BuildLayout()
    {
        // Three rows at 50% / auto / 50% vertically centres the middle row's
        // content no matter the screen resolution.
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            BackColor = Color.Transparent,
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 50f));

        // Anchor.None on a fixed-size panel is the WinForms idiom for "centre me
        // in my cell" - it stops the panel stretching to the cell's edges.
        root.Controls.Add(BuildCard(), 0, 1);
        Controls.Add(root);

        _stationBadge = BuildStationBadge();
        Controls.Add(_stationBadge);
        _stationBadge.BringToFront();

        _connectionLabel = BuildConnectionLabel();
        Controls.Add(_connectionLabel);
        _connectionLabel.BringToFront();

        if (AgentSettings.AllowDevExit)
        {
            _devBadge = BuildDevModeBadge();
            Controls.Add(_devBadge);
            _devBadge.BringToFront();
        }
    }

    /// <summary>
    /// The one card the whole screen is about.
    /// </summary>
    /// <remarks>
    /// Drawn in a single Paint handler rather than assembled from a dozen
    /// labels. Labels cannot letter-space their text, which is most of what
    /// makes a heading look designed, and a stack of auto-sized controls gives
    /// no straightforward way to place a divider or leave a measured gap.
    /// Painting it also means the layout cannot be pulled apart by a long
    /// station name.
    /// </remarks>
    private Panel BuildCard()
    {
        var card = new Panel
        {
            Width = CardWidth,
            Height = CardHeightFor(withCode: false),
            Anchor = AnchorStyles.None,
            BackColor = Color.Transparent,
            Margin = new Padding(0),
        };

        _card = card;

        card.Paint += (_, e) =>
        {
            var g = e.Graphics;
            Theme.PaintCard(g, new Rectangle(0, 0, card.Width - 1, card.Height - 1));

            using var brandFont = new Font("Segoe UI", 30f, FontStyle.Bold);
            using var kickerFont = new Font("Segoe UI", 9f, FontStyle.Regular);
            using var callFont = new Font("Segoe UI", 11f, FontStyle.Regular);
            using var stationFont = new Font("Segoe UI", 17f, FontStyle.Bold);
            using var noteFont = new Font("Segoe UI", 9f, FontStyle.Regular);

            Theme.DrawTrackedCentred(g, "PLAYTIME", brandFont, Palette.TextPrimary, card.Width, 46f, 10f);
            Theme.DrawTrackedCentred(g, "GAMING CAFE", kickerFont, Palette.AccentSoft, card.Width, 100f, 6f);

            Theme.DrawDivider(g, card.Width, 130f, 320, Palette.Divider);

            if (_scanCode is not null)
            {
                DrawScanCode(g, card.Width);
            }
            else
            {
                DrawStationPlate(g, card.Width);
            }

            // Whichever is on screen decides where the rest of the card sits,
            // so the code showing or not never leaves a gap or an overlap.
            var below = _scanCode is not null
                ? (float)(CodeTop + CodeSize)
                : (float)(PlateTop + PlateHeight);

            Theme.DrawTrackedCentred(
                g,
                _scanCode is not null ? "SCAN TO PAY FROM YOUR APP" : "ASK AT THE COUNTER TO START",
                callFont, Palette.TextMuted, card.Width, below + 30f, 2f);

            Theme.DrawDivider(g, card.Width, below + 66f, 320, Palette.Divider);

            // The counter is always offered, whether or not a code is showing.
            // A customer with no app, no balance or no phone must still have a
            // way to start playing, and the station number is what staff need.
            //
            // Repeated only when the code is showing. Without a code the plate
            // above already carries the number in the largest type on the
            // screen, and printing it again eight lines lower - which is what
            // the fallback did - reads as two different numbers to check rather
            // than one to say out loud.
            if (_scanCode is not null)
            {
                Theme.DrawTrackedCentred(g, _config.StationId.ToUpperInvariant(), stationFont,
                    Palette.Accent, card.Width, below + 78f, 5f);

                Theme.DrawTrackedCentred(g, "Or ask at the counter and tell them this number.",
                    noteFont, Palette.TextFaint, card.Width, below + 122f, 0.4f);
            }
            else
            {
                Theme.DrawTrackedCentred(g, "Tell them the number above.",
                    noteFont, Palette.TextFaint, card.Width, below + 84f, 0.4f);
            }
        };

        return card;
    }

    /// <summary>
    /// Draws the scannable code, on white.
    /// </summary>
    /// <remarks>
    /// White, and with a margin, on a screen that is otherwise deliberately
    /// dark. A QR is read by contrast and the pale border around it is part of
    /// the specification rather than decoration — a tastefully dark one that
    /// nobody's phone can read would be a support call per customer.
    /// </remarks>
    private void DrawScanCode(Graphics graphics, int containerWidth)
    {
        if (_scanCode is null)
        {
            return;
        }

        var left = (containerWidth - CodeSize) / 2;
        var area = new Rectangle(left, CodeTop, CodeSize, CodeSize);

        using (var backing = new SolidBrush(Color.White))
        using (var path = Theme.RoundedRect(area, 10))
        {
            graphics.FillPath(backing, path);
        }

        var inner = Rectangle.Inflate(area, -10, -10);
        graphics.DrawImage(_scanCode, inner);
    }

    /// <summary>
    /// The station's number, large, with the fact that it is locked.
    /// </summary>
    /// <remarks>
    /// This space used to hold a QR code placeholder under the words "SCAN TO
    /// PAY AND START PLAYING". There is no payment code anywhere in the agent,
    /// so the screen was asking a customer to scan a grey box - and reserving
    /// room for a feature with no timetable is how it came to say that in the
    /// first place.
    /// <para>
    /// Until paying from the screen exists, the useful thing to show is which
    /// PC this is: a customer walks to the counter and says the number, and
    /// staff unlock it from the dashboard. That is how a session actually
    /// starts today, so that is what the screen now describes.
    /// </para>
    /// </remarks>
    private void DrawStationPlate(Graphics graphics, int containerWidth)
    {
        var left = (containerWidth - PlateWidth) / 2;
        var area = new Rectangle(left, PlateTop, PlateWidth, PlateHeight);

        using (var fill = new SolidBrush(Palette.Surface))
        using (var path = Theme.RoundedRect(area, 12))
        {
            graphics.FillPath(fill, path);
        }

        Theme.DrawBorder(graphics, area, Palette.CardBorder, 1f, 12);

        using var labelFont = new Font("Segoe UI", 9f, FontStyle.Regular);
        using var idFont = new Font("Segoe UI", 34f, FontStyle.Bold);

        var labelWidth = Theme.MeasureTracked(graphics, "LOCKED", labelFont, 5f);
        Theme.DrawTracked(graphics, "LOCKED", labelFont, Palette.TextMuted,
            left + (PlateWidth - labelWidth) / 2f, PlateTop + 34f, 5f);

        // Upper-cased for display only - the id itself stays lower case to match
        // the MQTT topic the website publishes to.
        var id = _config.StationId.ToUpperInvariant();
        var idWidth = Theme.MeasureTracked(graphics, id, idFont, 4f);
        Theme.DrawTracked(graphics, id, idFont, Palette.Accent,
            left + (PlateWidth - idWidth) / 2f, PlateTop + 62f, 4f);
    }

    /// <summary>
    /// Which machine this is, in the corner, readable from across the room.
    /// </summary>
    /// <remarks>
    /// Staff read this one far more than customers do - it is how someone at the
    /// counter matches a booking to a seat without walking over and reading the
    /// middle of the screen.
    /// </remarks>
    private Panel BuildStationBadge()
    {
        var badge = new Panel
        {
            Width = 132,
            Height = 44,
            BackColor = Color.Transparent,
            Location = new Point(Bounds.Width - 156, 24),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
        };

        badge.Paint += (_, e) =>
        {
            var area = new Rectangle(0, 0, badge.Width - 1, badge.Height - 1);

            using (var fill = new SolidBrush(Palette.CardFill))
            using (var path = Theme.RoundedRect(area, 10))
            {
                e.Graphics.FillPath(fill, path);
            }

            Theme.DrawBorder(e.Graphics, area, Palette.CardBorder, 1f, 10);

            using var font = new Font("Segoe UI", 11f, FontStyle.Bold);
            Theme.DrawTrackedCentred(e.Graphics, _config.StationId.ToUpperInvariant(), font,
                Palette.TextPrimary, badge.Width, 12f, 3f);
        };

        return badge;
    }

    /// <summary>
    /// Broker connection state, bottom-left. Useful while testing, and lets
    /// staff see at a glance whether a station can be unlocked at all.
    /// </summary>
    private Label BuildConnectionLabel() => new()
    {
        Text = "●  Connecting to broker…",
        Font = new Font("Segoe UI", 9f, FontStyle.Regular),
        ForeColor = Palette.TextMuted,
        BackColor = Color.Transparent,
        AutoSize = true,
        Location = new Point(16, Bounds.Height - 34),
    };

    /// <summary>
    /// Corner badge making it obvious at a glance that this build still has the
    /// escape hatch compiled in, so it is hard to deploy one to a café PC by
    /// mistake.
    /// </summary>
    private const string DevBadgeText =
        "DEV BUILD — Ctrl+Shift+Alt +  U unlock · T 90s test · K lock · L suspend · Q quit";

    private static Label BuildDevModeBadge() => new()
    {
        Text = DevBadgeText,
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Palette.Warning,
        BackColor = Palette.Border,
        AutoSize = true,
        Padding = new Padding(8, 5, 8, 5),
        Location = new Point(16, 16),
    };

    /// <summary>
    /// Fallback path for the dev chords.
    /// </summary>
    /// <remarks>
    /// <see cref="SystemLockService"/> already catches these globally. This stays
    /// as a second route for the case where the hook failed to install — without
    /// it, a hook failure plus a shipped build with no Alt+F4 would leave no way
    /// out at all.
    /// </remarks>
    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (DevChords.Match(e) is not { } chord)
        {
            return;
        }

        e.Handled = true;
        DevChordPressed?.Invoke(this, chord);
    }
}
