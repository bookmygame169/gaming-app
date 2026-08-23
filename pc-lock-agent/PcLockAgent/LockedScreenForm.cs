namespace PcLockAgent;

/// <summary>
/// The screen a customer meets: which machine this is, and the two ways onto it.
/// </summary>
/// <remarks>
/// Built as one composition across the whole panel rather than a card in the
/// middle of it. A dialog box centred on a 1920px monitor reads as an error
/// message; this has to read as a machine waiting to be used.
/// <para>
/// The station number is the largest thing on it deliberately. It is what staff
/// shout across the room, what a customer says at the counter, and what every
/// support conversation starts with — so it is set at a size that can be read
/// from the door.
/// </para>
/// </remarks>
internal sealed class LockedScreenForm : Form
{
    /// <summary>Fallback for the dev chords if the keyboard hook is not installed.</summary>
    public event EventHandler<DevChord>? DevChordPressed;

    /// <summary>Raised when the customer wants to buy time from this screen.</summary>
    public event EventHandler? PayNowRequested;

    /// <summary>Raised when somebody asks to restart this PC.</summary>
    public event EventHandler? RestartRequested;

    /// <summary>Raised when somebody asks to shut this PC down.</summary>
    public event EventHandler? ShutDownRequested;

    private readonly AgentConfig _config;
    private readonly PlayRequestClient _prices;

    private Image? _scanCode;
    private bool _connected;
    private bool _passthrough;
    private List<(string Label, string Price)> _priceRows = new();

    private Button _payButton = null!;
    private Button _restartButton = null!;
    private Button _shutDownButton = null!;
    private System.Windows.Forms.Timer? _clockTimer;
    private System.Windows.Forms.Timer? _motionTimer;

    /// <summary>
    /// Where each of the three moving things has got to, 0 to 1.
    /// </summary>
    /// <remarks>
    /// Kept as phases rather than as pixel positions so the speeds are stated
    /// once, in seconds, and nothing has to be re-tuned for a different screen.
    /// </remarks>
    private float _tickerPhase;
    private float _blinkPhase;
    private float _nudgePhase;

    private readonly System.Diagnostics.Stopwatch _motionClock = System.Diagnostics.Stopwatch.StartNew();

    // ---- geometry -----------------------------------------------------------
    //
    // Laid out against a 1600x900 drawing and scaled to whatever the panel is,
    // so a 1366x768 café PC and a 2560x1440 one get the same composition rather
    // than the same pixel offsets.
    private const int DesignWidth = 1600;
    private const int DesignHeight = 900;

    private float _scale = 1f;
    private int S(int designPx) => (int)Math.Round(designPx * _scale);
    private float SF(float designPx) => designPx * _scale;

    /// <summary>
    /// A font size, from a size in design pixels.
    /// </summary>
    /// <remarks>
    /// WinForms measures fonts in points unless told otherwise, and a point is
    /// four thirds of a pixel. Every size on this screen was drawn on a sheet
    /// in pixels, so handing those numbers straight to a Font made all of it a
    /// third too large - which is how the station number came to sit on top of
    /// its own chip and the paragraph ran underneath Pay now.
    /// </remarks>
    private float FS(float designPx) => designPx * _scale * 0.75f;

    public LockedScreenForm(AgentConfig config)
    {
        _config = config;
        _prices = new PlayRequestClient(config);

        InitializeWindowBehaviour();
        BuildControls();
        _ = LoadPricesAsync();
    }

    /// <summary>
    /// The code a customer scans to pay for a session, or null for none.
    /// </summary>
    /// <remarks>
    /// Null is a normal state, not a failure: a PC that cannot reach the website
    /// shows the panel with its own explanation, which is how the café worked
    /// before any of this existed.
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
        Invalidate();
    }

    /// <summary>
    /// Whether this window is allowed to close. Only the agent's own shutdown
    /// sets it.
    /// </summary>
    public bool AllowClose { get; set; }

    /// <summary>
    /// Refuses every close this agent did not ask for.
    /// </summary>
    /// <remarks>
    /// This is the screen that enforces payment. Anything that can take it off
    /// the screen — Alt+F4, a close from the taskbar — hands the customer the
    /// desktop, so nothing is allowed to except the agent shutting down.
    /// </remarks>
    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!AllowClose && e.CloseReason is not CloseReason.WindowsShutDown)
        {
            e.Cancel = true;
            return;
        }

        base.OnFormClosing(e);
    }

    /// <summary>Shows the lock screen and brings it back to the front.</summary>
    /// <param name="reassertTopMost">
    /// False while dev passthrough is on, so a <c>lock</c> command does not
    /// snatch the screen back over the terminal being used to send it.
    /// </param>
    public void ShowLocked(bool reassertTopMost)
    {
        Show();

        // Re-read on every lock. Fetching once at construction meant a machine
        // left running for a week quoted last week's prices.
        _ = LoadPricesAsync();

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
        if (_connected == connected)
        {
            return;
        }

        _connected = connected;
        Invalidate();
    }

    public void SetPassthroughIndicator(bool suspended)
    {
        _passthrough = suspended;
        Invalidate();
    }

    // -----------------------------------------------------------------------
    // Window
    // -----------------------------------------------------------------------

    private void InitializeWindowBehaviour()
    {
        // No title bar, so there is no close/minimise button to click.
        FormBorderStyle = FormBorderStyle.None;

        // Sizing to the screen's full pixel bounds is what actually covers the
        // Windows taskbar. WindowState.Maximized would NOT — a maximised window
        // politely stops at the taskbar's reserved edge, leaving it clickable.
        Bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, DesignWidth, DesignHeight);

        TopMost = true;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Background;
        Text = "BookMyGame — Locked";
        Cursor = Cursors.Default;
        DoubleBuffered = true;

        // Route key presses to the form's KeyDown before any child control sees
        // them, so the dev chords work regardless of what has focus.
        KeyPreview = true;
        KeyDown += OnKeyDown;

        _scale = Math.Min(
            Bounds.Width / (float)DesignWidth,
            Bounds.Height / (float)DesignHeight);

        // The clock only shows hours and minutes, so twenty seconds is plenty.
        _clockTimer = new System.Windows.Forms.Timer { Interval = 20_000 };
        _clockTimer.Tick += (_, _) => Invalidate(FootArea());
        _clockTimer.Start();

        // Fifteen frames a second, and only over the parts that actually move.
        //
        // The whole screen at this rate would be tens of millions of pixels a
        // second on a machine whose graphics card is meant for the game, not
        // for this. Three small rectangles is a rounding error by comparison,
        // and it stops the moment the screen is hidden - a session must never
        // be paying for a lock screen nobody can see.
        _motionTimer = new System.Windows.Forms.Timer { Interval = 66 };
        _motionTimer.Tick += (_, _) => AdvanceMotion();

        VisibleChanged += (_, _) =>
        {
            if (Visible)
            {
                _motionTimer?.Start();
            }
            else
            {
                _motionTimer?.Stop();
            }
        };
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        Arena.PaintArena(e.Graphics, ClientRectangle);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _clockTimer?.Stop();
            _clockTimer?.Dispose();
            _motionTimer?.Stop();
            _motionTimer?.Dispose();
            _scanCode?.Dispose();
            _scanCode = null;
        }

        base.Dispose(disposing);
    }

    // -----------------------------------------------------------------------
    // Prices
    // -----------------------------------------------------------------------

    /// <summary>
    /// The café's shortest options, shown before anybody has to tap anything.
    /// </summary>
    /// <remarks>
    /// A customer deciding whether to sit down wants the price, and the old
    /// screen made them start a form to find it. Read from the server rather
    /// than held here so a café changing its rates does not need four machines
    /// reinstalled.
    /// <para>
    /// Fails to nothing. No prices means the panel simply does not list any,
    /// which is exactly how it looked before.
    /// </para>
    /// </remarks>
    private async Task LoadPricesAsync()
    {
        var options = await _prices.GetOptionsAsync().ConfigureAwait(true);
        if (options is null || IsDisposed)
        {
            return;
        }

        var rows = new List<(string, string)>();

        foreach (var hour in (options.Hourly ?? new List<HourlyOption>()).Take(2))
        {
            var label = hour.DurationMinutes < 60
                ? $"{hour.DurationMinutes} MIN"
                : $"{hour.DurationMinutes / 60} HOUR";

            rows.Add((label, $"₹{hour.Price:0}"));
        }

        var pass = (options.DayPasses ?? new List<PlanOption>()).FirstOrDefault();
        if (pass is not null)
        {
            rows.Add(("DAY PASS", $"₹{pass.Price:0}"));
        }

        _priceRows = rows;
        Invalidate();
    }

    // -----------------------------------------------------------------------
    // Layout
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // Geometry
    //
    // The design is drawn in vw/vh. On the 1600 x 900 sheet this form scales
    // from, 1vw is 16 and 1vh is 9, so every measurement below is the design's
    // own number converted once and then left alone.
    // -----------------------------------------------------------------------

    private const int RailWidth = 83;    // 5.2vw
    private const int BarHeight = 47;    // 5.2vh
    private const int FootHeight = 54;   // 6vh
    private const int PadX = 54;         // 3.4vw
    private const int PadTop = 40;       // 4.4vh
    private const int PadBottom = 27;    // 3vh
    private const int ColumnGap = 54;    // 3.4vw
    private const int TicketPadX = 35;   // 2.2vw
    private const int TicketPadY = 29;   // 3.2vh

    private Rectangle Rail() => new(0, 0, S(RailWidth), Height);

    private Rectangle TopBar() => new(S(RailWidth), 0, Width - S(RailWidth), S(BarHeight));

    private Rectangle MainArea() => new(
        S(RailWidth) + S(PadX),
        S(BarHeight) + S(PadTop),
        Width - S(RailWidth) - S(PadX) * 2,
        Height - S(BarHeight) - S(PadTop) - S(FootHeight) - S(PadBottom));

    /// <summary>The ticket, and what is left for the column beside it.</summary>
    private Rectangle Ticket()
    {
        var main = MainArea();
        var usable = main.Width - S(ColumnGap);
        var width = (int)(usable * 0.44f);   // .88fr of 2fr

        return new Rectangle(main.Right - width, main.Top, width, main.Height);
    }

    private Rectangle LeftColumn()
    {
        var main = MainArea();
        return new Rectangle(main.Left, main.Top, Ticket().Left - S(ColumnGap) - main.Left, main.Height);
    }

    private Rectangle PayButtonArea()
    {
        var column = LeftColumn();
        var height = S(100);   // 3.4vh padding either side of 2.4vw type

        return new Rectangle(column.Left, column.Bottom - height, column.Width, height);
    }

    private Rectangle FootArea() => new(S(RailWidth), Height - S(FootHeight), Width - S(RailWidth), S(FootHeight));

    private void BuildControls()
    {
        _payButton = new Button
        {
            Text = string.Empty,
            BackColor = Palette.Accent,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            Bounds = PayButtonArea(),
            FlatAppearance = { BorderSize = 0 },
        };

        // Painted rather than labelled: a Button cannot letter-space its own
        // text, and it cannot nudge an arrow either.
        _payButton.Paint += (_, e) => PaintPayButton(e.Graphics);
        _payButton.Click += (_, _) => PayNowRequested?.Invoke(this, EventArgs.Empty);

        Controls.Add(_payButton);

        _restartButton = PowerButton("RESTART");
        _restartButton.Click += (_, _) => RestartRequested?.Invoke(this, EventArgs.Empty);

        _shutDownButton = PowerButton("SHUT DOWN");
        _shutDownButton.Click += (_, _) => ShutDownRequested?.Invoke(this, EventArgs.Empty);

        Controls.Add(_restartButton);
        Controls.Add(_shutDownButton);

        PlacePowerButtons();
    }

    private Button PowerButton(string text) => new()
    {
        Text = text,
        Font = Arena.Mono(FS(12f), FontStyle.Regular),
        ForeColor = Palette.TextFaint,
        BackColor = Palette.Background,
        FlatStyle = FlatStyle.Flat,
        Width = S(text.Length > 8 ? 150 : 118),
        Height = S(32),
        Cursor = Cursors.Hand,
        FlatAppearance = { BorderSize = 1, BorderColor = Color.FromArgb(46, 242, 240, 234) },
    };

    private void PlacePowerButtons()
    {
        if (_restartButton is null || _shutDownButton is null)
        {
            return;
        }

        var foot = FootArea();
        var top = foot.Top + (foot.Height - _shutDownButton.Height) / 2;

        _shutDownButton.Left = Width - S(PadX) - _shutDownButton.Width;
        _shutDownButton.Top = top;

        _restartButton.Left = _shutDownButton.Left - S(11) - _restartButton.Width;
        _restartButton.Top = top;
    }

    /// <summary>
    /// Moves the three animations on, and asks for only what changed.
    /// </summary>
    /// <remarks>
    /// The ticker crosses in thirty-four seconds, the status dot blinks every
    /// one and a half, and the arrow nudges every one and a half but from a
    /// different start, so the two never look like one thing flashing.
    /// </remarks>
    private void AdvanceMotion()
    {
        if (IsDisposed || !Visible)
        {
            return;
        }

        var seconds = (float)_motionClock.Elapsed.TotalSeconds;

        _tickerPhase = seconds / 34f % 1f;
        _blinkPhase = seconds / 1.8f % 1f;
        _nudgePhase = seconds / 1.8f % 1f;

        Invalidate(TopBar());
        _payButton?.Invalidate();
    }

    // -----------------------------------------------------------------------
    // Paint
    // -----------------------------------------------------------------------

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        // Only what the invalid rectangle actually touches. The ticker runs at
        // fifteen frames a second, and without this every one of them would
        // redraw the ticket, the QR code and the station number as well.
        bool Hits(Rectangle area) => e.ClipRectangle.IntersectsWith(area);

        if (Hits(Rail()))
        {
            PaintRail(g);
        }

        if (Hits(TopBar()))
        {
            PaintTopBar(g);
        }

        if (Hits(LeftColumn()))
        {
            PaintLeftColumn(g);
        }

        if (Hits(Ticket()))
        {
            PaintTicket(g);
        }

        if (Hits(FootArea()))
        {
            PaintFoot(g);
        }
    }

    /// <summary>
    /// The lime rail down the left edge, carrying the café's name.
    /// </summary>
    /// <remarks>
    /// The café's own name, set the largest thing on it, turned on its side.
    /// bookmygame appears once, small, on the ticket - a customer is sitting in
    /// PlayTime, not in a platform.
    /// </remarks>
    private void PaintRail(Graphics g)
    {
        var rail = Rail();

        using (var lime = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(lime, rail);
        }

        var tagFont = Arena.Mono(FS(13f), FontStyle.Bold);
        var tag = _config.StationId.ToUpperInvariant();
        var tagWidth = Theme.MeasureTracked(g, tag, tagFont, SF(3.9f));

        Theme.DrawTracked(g, tag, tagFont, Palette.Ink, rail.Left + (rail.Width - tagWidth) / 2f, S(22), SF(3.9f));

        using (var dot = new SolidBrush(Palette.Ink))
        {
            g.FillEllipse(dot, rail.Left + (rail.Width - S(26)) / 2f, Height - S(48), S(26), S(26));
        }

        var cafe = (_config.CafeName ?? string.Empty).Trim().ToUpperInvariant();
        if (cafe.Length == 0)
        {
            return;
        }

        // Rotated a quarter turn and read bottom to top, which is the way a
        // spine is set and the way this reads from a chair.
        var nameFont = Arena.Heavy(FS(24f));
        var nameWidth = Theme.MeasureTracked(g, cafe, nameFont, SF(8.2f));

        var saved = g.Save();

        try
        {
            g.TranslateTransform(rail.Left + rail.Width / 2f, Height / 2f + nameWidth / 2f);
            g.RotateTransform(-90f);
            Theme.DrawTracked(g, cafe, nameFont, Palette.Ink, 0, -nameFont.Height / 2f, SF(8.2f));
        }
        finally
        {
            g.Restore(saved);
        }
    }

    private void PaintTopBar(Graphics g)
    {
        var bar = TopBar();

        using (var rule = new Pen(Color.FromArgb(31, 242, 240, 234)))
        {
            g.DrawLine(rule, bar.Left, bar.Bottom, bar.Right, bar.Bottom);
        }

        var statusFont = Arena.Mono(FS(13f), FontStyle.Bold);
        var status = _passthrough ? "PASSTHROUGH" : _connected ? "READY" : "OFFLINE";
        var statusWidth = Theme.MeasureTracked(g, status, statusFont, SF(3.6f));
        var chipWidth = S(22) + S(8) + S(10) + (int)statusWidth + S(22);

        var chip = new Rectangle(bar.Left, bar.Top, chipWidth, bar.Height);

        using (var lime = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(lime, chip);
        }

        // The blink, which is the whole reason this bar redraws at all: a
        // screen with one thing moving on it reads as a machine that is awake.
        var blink = _blinkPhase < 0.5f ? 255 : 70;

        using (var dot = new SolidBrush(Color.FromArgb(blink, Palette.Ink)))
        {
            g.FillEllipse(dot, chip.Left + S(22), chip.Top + (chip.Height - S(8)) / 2f, S(8), S(8));
        }

        Theme.DrawTracked(
            g,
            status,
            statusFont,
            Palette.Ink,
            chip.Left + S(22) + S(8) + S(10),
            chip.Top + (chip.Height - statusFont.Height) / 2f,
            SF(3.6f));

        // The ticker. Clipped to what is left of the bar so it cannot run over
        // the chip, and drawn twice end to end so the loop has no gap in it.
        var lane = new Rectangle(chip.Right + S(19), bar.Top, bar.Right - chip.Right - S(19), bar.Height);

        if (lane.Width <= 0)
        {
            return;
        }

        var tickerFont = Arena.Mono(FS(13f), FontStyle.Regular);
        var text = TickerText();
        var width = Theme.MeasureTracked(g, text, tickerFont, SF(3.3f));

        var saved = g.Save();

        try
        {
            g.SetClip(lane);

            var offset = lane.Left - width * _tickerPhase;
            var y = lane.Top + (lane.Height - tickerFont.Height) / 2f;

            Theme.DrawTracked(g, text, tickerFont, Color.FromArgb(102, 242, 240, 234), offset, y, SF(3.3f));
            Theme.DrawTracked(g, text, tickerFont, Color.FromArgb(102, 242, 240, 234), offset + width, y, SF(3.3f));
        }
        finally
        {
            g.Restore(saved);
        }
    }

    /// <summary>
    /// What runs across the top bar.
    /// </summary>
    /// <remarks>
    /// Built from what this PC actually has rather than from a fixed list. The
    /// games are the café's own, read from the same catalogue the menu is built
    /// from, so a café that adds Forza sees Forza go past on its lock screens
    /// without anybody editing a string.
    /// </remarks>
    private string TickerText()
    {
        var parts = new List<string> { "STATION FREE — SIT DOWN AND PLAY" };

        var games = (_config.Games ?? new List<GameEntry>())
            .Select(game => game.Name?.Trim().ToUpperInvariant())
            .Where(name => !string.IsNullOrWhiteSpace(name))
            .Take(6)
            .ToList();

        if (games.Count > 0)
        {
            parts.Add(string.Join(" · ", games) + " INSTALLED");
        }

        parts.Add("TIME STARTS AFTER COUNTER APPROVAL");

        return string.Join("   ///   ", parts) + "   ///   ";
    }

    private void PaintLeftColumn(Graphics g)
    {
        var column = LeftColumn();

        // The number, and the word that says what it is.
        var numberFont = Arena.Heavy(FS(176f));
        var number = NumberOf(_config.StationId);
        var numeral = g.MeasureString(number, numberFont);

        using (var cream = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString(number, numberFont, cream, column.Left - S(10), column.Top - S(14));
        }

        var labelFont = Arena.Mono(FS(12.5f), FontStyle.Bold);
        Theme.DrawTracked(
            g,
            "STATION",
            labelFont,
            Palette.Accent,
            column.Left + numeral.Width - S(4),
            column.Top + S(12),
            SF(4.5f));

        // The headline sits above the button, and the paragraph above that,
        // both measured so neither can land on top of anything.
        var payTop = PayButtonArea().Top;

        var headFont = Arena.Heavy(FS(74f));
        var bodyFont = Arena.Mono(FS(15f), FontStyle.Regular);

        const string blurb =
            "Pick a slot on the ticket. Pay at the counter or scan with your phone. The clock only starts once the counter approves it.";

        var blurbWidth = Math.Min(column.Width, S(544));
        var blurbSize = g.MeasureString(blurb, bodyFont, blurbWidth);

        var blurbTop = payTop - S(46) - blurbSize.Height;
        var headTop = blurbTop - S(20) - headFont.Height * 2f;

        using (var cream = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString("READY WHEN", headFont, cream, column.Left - S(6), headTop);
            g.DrawString("YOU", headFont, cream, column.Left - S(6), headTop + headFont.Height);
        }

        var youWidth = g.MeasureString("YOU ", headFont).Width;

        using (var lime = new SolidBrush(Palette.Accent))
        {
            g.DrawString("ARE.", headFont, lime, column.Left - S(6) + youWidth, headTop + headFont.Height);
        }

        using (var muted = new SolidBrush(Color.FromArgb(115, 242, 240, 234)))
        {
            g.DrawString(blurb, bodyFont, muted, new RectangleF(column.Left, blurbTop, blurbWidth, blurbSize.Height + S(6)));
        }
    }

    private void PaintPayButton(Graphics g)
    {
        if (_payButton is null)
        {
            return;
        }

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var font = Arena.Heavy(FS(38f));
        var middle = (_payButton.Height - font.Height) / 2f;

        Theme.DrawTracked(g, "PAY NOW & START", font, Palette.Ink, S(35), middle, SF(2.3f));

        // The arrow leans forward and back rather than blinking. It is the only
        // thing on the screen that suggests where to press.
        var lean = (float)Math.Sin(_nudgePhase * Math.PI * 2) * S(8);
        var arrowWidth = g.MeasureString("→", font).Width;

        using var ink = new SolidBrush(Palette.Ink);
        g.DrawString("→", font, ink, _payButton.Width - S(35) - arrowWidth + lean, middle);
    }

    /// <summary>
    /// The ticket: cream paper with the prices and the code on it.
    /// </summary>
    /// <remarks>
    /// The one light surface in the app, and the only one a customer has to
    /// read carefully. Notched at both edges like a torn stub, which is what
    /// makes a rectangle of cream read as a thing rather than as a panel.
    /// </remarks>
    private void PaintTicket(Graphics g)
    {
        var ticket = Ticket();

        using (var cream = new SolidBrush(Palette.Cream))
        {
            g.FillRectangle(cream, ticket);
        }

        // The notches, in the screen's own colour so they read as bites taken
        // out of the paper rather than as circles drawn on it.
        var notch = S(29);
        var notchTop = ticket.Top + (int)(ticket.Height * 0.38f);

        using (var ground = new SolidBrush(Palette.Background))
        {
            g.FillEllipse(ground, ticket.Left - notch / 2f, notchTop, notch, notch);
            g.FillEllipse(ground, ticket.Right - notch / 2f, notchTop, notch, notch);
        }

        var left = ticket.Left + S(TicketPadX);
        var right = ticket.Right - S(TicketPadX);
        var top = ticket.Top + S(TicketPadY);

        var headFont = Arena.Mono(FS(13f), FontStyle.Bold);
        Theme.DrawTracked(g, "SESSION TICKET", headFont, Palette.Ink, left, top, SF(4.4f));

        var noFont = Arena.Mono(FS(12f), FontStyle.Regular);
        var no = "NO. " + _config.StationId.ToUpperInvariant();
        var noWidth = Theme.MeasureTracked(g, no, noFont, SF(2.6f));
        Theme.DrawTracked(g, no, noFont, Color.FromArgb(115, 11, 11, 12), right - noWidth, top + S(2), SF(2.6f));

        // The rates, each a row with a dotted leader running out to the price.
        var rowTop = top + S(23) + S(20);
        var rowHeight = S(54);

        var labelFont = Arena.Heavy(FS(27f));
        var priceFont = Arena.Heavy(FS(30f));

        foreach (var (label, price) in _priceRows)
        {
            using (var rule = new Pen(Color.FromArgb(36, 11, 11, 12)))
            {
                g.DrawLine(rule, left, rowTop, right, rowTop);
            }

            var text = label.ToUpperInvariant();
            var labelWidth = g.MeasureString(text, labelFont).Width;
            var priceWidth = g.MeasureString(price, priceFont).Width;

            using (var ink = new SolidBrush(Palette.Ink))
            {
                g.DrawString(text, labelFont, ink, left, rowTop + (rowHeight - labelFont.Height) / 2f);
                g.DrawString(price, priceFont, ink, right - priceWidth, rowTop + (rowHeight - priceFont.Height) / 2f);
            }

            // The leader. Drawn as a dashed line rather than a row of dots,
            // which is the same picture for a fraction of the calls.
            using (var leader = new Pen(Color.FromArgb(82, 11, 11, 12), Math.Max(1f, S(1)))
            {
                DashStyle = System.Drawing.Drawing2D.DashStyle.Dot,
            })
            {
                var y = rowTop + rowHeight / 2f;
                g.DrawLine(leader, left + labelWidth + S(13), y, right - priceWidth - S(13), y);
            }

            rowTop += rowHeight;
        }

        // The code, below a torn line.
        var codeSize = Math.Min(S(192), ticket.Height / 3);
        var codeTop = ticket.Bottom - S(TicketPadY) - codeSize;
        var tearY = codeTop - S(27);

        using (var tear = new Pen(Color.FromArgb(72, 11, 11, 12), Math.Max(2f, S(2)))
        {
            DashStyle = System.Drawing.Drawing2D.DashStyle.Dash,
        })
        {
            g.DrawLine(tear, left, tearY, right, tearY);
        }

        var code = new Rectangle(left, (int)codeTop, codeSize, codeSize);

        using (var white = new SolidBrush(Color.White))
        {
            g.FillRectangle(white, code);
        }

        if (_scanCode is not null)
        {
            var inner = S(8);
            g.DrawImage(_scanCode, code.Left + inner, code.Top + inner, code.Width - inner * 2, code.Height - inner * 2);
        }
        else
        {
            var apologyFont = Arena.Mono(FS(12f), FontStyle.Regular);
            using var faded = new SolidBrush(Color.FromArgb(140, 11, 11, 12));

            var centred = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
            };

            g.DrawString("NO CODE\nRIGHT NOW\nPAY AT THE\nCOUNTER", apologyFont, faded, code, centred);
        }

        var textLeft = code.Right + S(22);
        var textWidth = right - textLeft;

        if (textWidth <= 0)
        {
            return;
        }

        var scanFont = Arena.Heavy(FS(18f));
        Theme.DrawTracked(g, "SCAN TO UNLOCK", scanFont, Palette.Ink, textLeft, code.Top + S(4), SF(1.5f));

        var bodyFont = Arena.Mono(FS(12f), FontStyle.Regular);
        using (var faded = new SolidBrush(Color.FromArgb(140, 11, 11, 12)))
        {
            g.DrawString(
                "Point your camera here to pay by UPI and unlock instantly.",
                bodyFont,
                faded,
                new RectangleF(textLeft, code.Top + S(34), textWidth, S(80)));
        }

        var markFont = Arena.Mono(FS(12f), FontStyle.Bold);
        Theme.DrawTracked(g, "BOOKMYGAME.CO.IN", markFont, Palette.Ink, textLeft, code.Bottom - S(20), SF(2.4f));
    }

    private void PaintFoot(Graphics g)
    {
        var foot = FootArea();

        using (var rule = new Pen(Color.FromArgb(31, 242, 240, 234)))
        {
            g.DrawLine(rule, foot.Left, foot.Top, foot.Right, foot.Top);
        }

        var left = (float)(S(RailWidth) + S(PadX));
        var middle = foot.Top + foot.Height / 2f;

        var clockFont = Arena.Mono(FS(16f), FontStyle.Regular);
        var clock = DateTime.Now.ToString("HH:mm");

        using (var cream = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString(clock, clockFont, cream, left, middle - clockFont.Height / 2f);
        }

        left += g.MeasureString(clock, clockFont).Width + S(29);

        var smallFont = Arena.Mono(FS(12.5f), FontStyle.Regular);
        var date = DateTime.Now.ToString("ddd dd MMM").ToUpperInvariant();

        Theme.DrawTracked(g, date, smallFont, Palette.TextFaint, left, middle - smallFont.Height / 2f, SF(3.2f));
        left += Theme.MeasureTracked(g, date, smallFont, SF(3.2f)) + S(29);

        var stateText = _passthrough ? "PASSTHROUGH" : _connected ? "ONLINE" : "OFFLINE";
        var stateColour = _passthrough ? Palette.Accent : _connected ? Palette.Accent : Palette.Warning;

        using (var dot = new SolidBrush(stateColour))
        {
            g.FillEllipse(dot, left, middle - S(3), S(7), S(7));
        }

        Theme.DrawTracked(g, stateText, smallFont, Palette.TextFaint, left + S(15), middle - smallFont.Height / 2f, SF(3.2f));
    }

    /// <summary>
    /// The digits out of a station id: pc-01 becomes 01.
    /// </summary>
    /// <remarks>
    /// Falls back to the whole id when there are no digits in it, so a station
    /// named something unexpected still shows something rather than a blank.
    /// </remarks>
    private static string NumberOf(string stationId)
    {
        var digits = new string(stationId.Where(char.IsDigit).ToArray());
        return digits.Length > 0 ? digits : stationId.ToUpperInvariant();
    }

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
