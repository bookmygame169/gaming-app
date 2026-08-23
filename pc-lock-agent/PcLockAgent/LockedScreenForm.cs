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
    private float _floorPhase;
    private float _breathPhase;
    private float _pulsePhase;

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
        _clockTimer.Tick += (_, _) => Invalidate(ClockArea());
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
    // Every number below is a position on a 1600 × 900 sheet, scaled by S() to
    // whatever this screen actually is. One sheet, one set of numbers.
    // -----------------------------------------------------------------------

    private const int Margin = 64;
    private const int BarHeight = 104;
    private const int ActionsHeight = 176;
    private const int FootHeight = 56;
    private const int ScanWidth = 520;

    private Rectangle ClockArea() => new(Width - S(430), S(20), S(410), S(64));

    private Rectangle RatesColumn() => new(Width - S(Margin) - S(620), S(146), S(620), S(340));

    private int ActionsTop() => Height - S(FootHeight) - S(ActionsHeight);

    private Rectangle PayButtonArea() => new(
        S(Margin),
        ActionsTop(),
        Math.Max(S(200), Width - S(Margin) * 2 - S(22) - S(ScanWidth)),
        S(ActionsHeight));

    /// <summary>
    /// The panel beside Pay now, which carries this machine's number.
    /// </summary>
    /// <remarks>
    /// It held the QR code until a café owner looked at the screen and said the
    /// two were the wrong way round. He was right: the number is how staff
    /// refer to a machine across a room, but the code is the thing a customer
    /// has to physically point a phone at, and that one wants the space.
    /// </remarks>
    private Rectangle StationPanel() => new(
        Width - S(Margin) - S(ScanWidth),
        ActionsTop(),
        S(ScanWidth),
        S(ActionsHeight));

    /// <summary>How big the code is, now that it has the column to itself.</summary>
    private Rectangle ScanArea() => new(S(Margin), S(178), S(300), S(300));

    /// <summary>The floor, which is the one thing always moving.</summary>
    private Rectangle FloorArea() => new(0, Height - (int)(Height * 0.32f), Width, (int)(Height * 0.32f));

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

        // Painted rather than labelled, because a Button cannot letter-space
        // its own text and the spacing is most of what makes this read as
        // equipment rather than as a form.
        _payButton.Paint += (_, e) =>
        {
            e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

            var font = Arena.Display(FS(38f), FontStyle.Bold);
            var width = Theme.MeasureTracked(e.Graphics, "PAY NOW", font, SF(11f));

            Theme.DrawTracked(
                e.Graphics,
                "PAY NOW",
                font,
                Color.FromArgb(0x16, 0x04, 0x0B),
                (_payButton.Width - width) / 2f,
                (_payButton.Height - font.Height) / 2f,
                SF(11f));
        };

        _payButton.Click += (_, _) => PayNowRequested?.Invoke(this, EventArgs.Empty);

        Controls.Add(_payButton);

        // Bottom right, small, and a long way from Pay now. These are for the
        // end of a visit or a machine that needs turning round, not for
        // anybody who came here to start playing.
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
        Font = Arena.Sans(SF(9f), FontStyle.Bold),
        ForeColor = Palette.TextDim,
        BackColor = Palette.Background,
        FlatStyle = FlatStyle.Flat,
        Width = S(126),
        Height = S(34),
        Cursor = Cursors.Hand,
        FlatAppearance = { BorderSize = 1, BorderColor = Color.FromArgb(30, 255, 255, 255) },
    };

    /// <summary>
    /// Puts the power buttons on the footer line.
    /// </summary>
    /// <remarks>
    /// Measured from this form's own width, which for a fullscreen form is the
    /// screen - unlike a control inside a docked panel, where that assumption
    /// once put End session seventeen hundred pixels off the side.
    /// </remarks>
    private void PlacePowerButtons()
    {
        if (_restartButton is null || _shutDownButton is null)
        {
            return;
        }

        var top = Height - S(FootHeight) + (S(FootHeight) - S(34)) / 2;

        _shutDownButton.Left = Width - S(Margin) - _shutDownButton.Width;
        _shutDownButton.Top = top;

        _restartButton.Left = _shutDownButton.Left - S(10) - _restartButton.Width;
        _restartButton.Top = top;
    }

    /// <summary>
    /// Moves the three animations on, and asks for only what changed.
    /// </summary>
    /// <remarks>
    /// The floor runs on a seven-second loop, the number breathes over five and
    /// a half, and the ring leaves Pay now every three and a half. None of them
    /// are in step with each other, deliberately: three things pulsing together
    /// reads as a fault light.
    /// </remarks>
    private void AdvanceMotion()
    {
        if (IsDisposed || !Visible)
        {
            return;
        }

        var seconds = (float)_motionClock.Elapsed.TotalSeconds;

        _floorPhase = seconds / 7f % 1f;
        _breathPhase = seconds / 5.5f % 1f;
        _pulsePhase = seconds / 3.4f % 1f;

        Invalidate(FloorArea());
        Invalidate(StationPanel());

        var button = PayButtonArea();
        var reach = S(20);

        Invalidate(new Rectangle(
            button.Left - reach,
            button.Top - reach,
            button.Width + reach * 2,
            button.Height + reach * 2));
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

        // Only what the invalid rectangle actually touches.
        //
        // Fifteen frames a second asks for three small rectangles, but a paint
        // is a paint: without this, every one of them would re-measure and
        // re-draw the café name a character at a time, the station number, the
        // whole price list and the QR panel, all to change some lines at the
        // bottom of the screen. GDI+ would throw the work away at the clip;
        // this never does it.
        bool Hits(Rectangle area) => e.ClipRectangle.IntersectsWith(area);

        // Behind everything, and the only part redrawn on every frame.
        if (Hits(FloorArea()))
        {
            Arena.PaintFloor(g, FloorArea(), _floorPhase);
        }

        if (Hits(new Rectangle(0, 0, Width, S(BarHeight))))
        {
            PaintTelemetry(g);
        }

        if (Hits(new Rectangle(0, S(130), S(780), S(620))))
        {
            PaintScanColumn(g);
        }

        if (Hits(RatesColumn()))
        {
            PaintRates(g);
        }

        if (Hits(StationPanel()))
        {
            PaintStationPanel(g);
        }

        PaintReadyRing(g);

        if (Hits(new Rectangle(0, Height - S(FootHeight), Width, S(FootHeight))))
        {
            PaintFootline(g);
        }
    }

    private void PaintTelemetry(Graphics g)
    {
        var barHeight = S(BarHeight);

        using (var rule = new Pen(Color.FromArgb(18, 255, 255, 255)))
        {
            g.DrawLine(rule, 0, barHeight, Width, barHeight);
        }

        var nameFont = Arena.Display(FS(34f), FontStyle.Bold);
        var kickerFont = Arena.Display(FS(16f), FontStyle.Bold);
        using var monoFont = Arena.Mono(FS(22f), FontStyle.Regular);

        // The café's name, not the platform's. A customer sitting in PlayTime
        // should see PlayTime; bookmygame is grey text in the corner.
        var cafe = (_config.CafeName ?? string.Empty).Trim().ToUpperInvariant();
        var left = (float)S(Margin);
        var middle = barHeight / 2f;

        if (cafe.Length > 0)
        {
            Theme.DrawTracked(g, cafe, nameFont, Palette.TextPrimary, left, middle - nameFont.Height / 2f, SF(5.8f));
            left += Theme.MeasureTracked(g, cafe, nameFont, SF(5.8f)) + S(26);

            using (var divider = new Pen(Color.FromArgb(40, 255, 255, 255)))
            {
                g.DrawLine(divider, left, middle - S(18), left, middle + S(18));
            }

            left += S(26);
            Theme.DrawTracked(g, "STANDBY", kickerFont, Palette.Accent, left, middle - kickerFont.Height / 2f, SF(5.8f));
        }

        var stateText = _passthrough ? "PASSTHROUGH" : _connected ? "ONLINE" : "OFFLINE";
        var stateColour = _passthrough ? Palette.Accent : _connected ? Palette.Online : Palette.Warning;

        var stateFont = Arena.Display(FS(16f), FontStyle.Bold);
        var stateWidth = Theme.MeasureTracked(g, stateText, stateFont, SF(4.8f));
        var stateLeft = Width - S(Margin) - stateWidth;

        Theme.DrawTracked(g, stateText, stateFont, stateColour, stateLeft, middle - stateFont.Height / 2f, SF(4.8f));

        using (var dot = new SolidBrush(stateColour))
        {
            g.FillRectangle(dot, stateLeft - S(20), middle - S(4), S(9), S(9));
        }

        var clock = DateTime.Now.ToString("HH:mm");
        var clockWidth = g.MeasureString(clock, monoFont).Width;

        using (var dim = new SolidBrush(Palette.TextMuted))
        {
            g.DrawString(clock, monoFont, dim, stateLeft - S(20) - S(26) - clockWidth, middle - monoFont.Height / 2f);
        }
    }

    /// <summary>
    /// The left column: the code, and the line telling somebody what to do.
    /// </summary>
    private void PaintScanColumn(Graphics g)
    {
        var left = (float)S(Margin);

        using (var tick = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(tick, left, S(154), S(34), S(3));
        }

        var labelFont = Arena.Display(FS(18f), FontStyle.Bold);
        Theme.DrawTracked(g, "SCAN TO UNLOCK", labelFont, Palette.TextMuted, left + S(52), S(146), SF(7.9f));

        var code = ScanArea();

        // White, and generous with the quiet zone around it. A code printed
        // tight to its own edge is one a phone camera argues with.
        using (var white = new SolidBrush(Color.White))
        {
            g.FillRectangle(white, code);
        }

        if (_scanCode is not null)
        {
            var inner = S(16);
            g.DrawImage(_scanCode, code.Left + inner, code.Top + inner, code.Width - inner * 2, code.Height - inner * 2);
        }
        else
        {
            // No code to show, which happens when this PC cannot reach the
            // site. Said on the code's own square rather than left blank, so
            // nobody stands there pointing a phone at nothing.
            using var apologyFont = Arena.Sans(FS(15f));
            using var dark = new SolidBrush(Color.FromArgb(0x33, 0x33, 0x33));

            var middle = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center,
            };

            g.DrawString(
                "This PC cannot reach\nthe website right now.\nPlease pay below.",
                apologyFont,
                dark,
                new RectangleF(code.Left + S(20), code.Top, code.Width - S(40), code.Height),
                middle);
        }

        // The line that tells somebody what to do, and the paragraph under it,
        // both measured and then stacked upwards from the action bar. Fixed
        // positions are what ran the paragraph underneath Pay now.
        var headFont = Arena.Display(FS(46f), FontStyle.Bold);
        using var bodyFont = Arena.Sans(FS(19f));

        const string blurb =
            "Tap Pay now, or scan the code with your phone. Your time starts when the counter approves it — not a second before.";

        var blurbWidth = S(470);
        var blurbSize = g.MeasureString(blurb, bodyFont, blurbWidth);

        var blurbTop = ActionsTop() - S(38) - blurbSize.Height;
        var headTop = blurbTop - S(10) - headFont.Height;

        // Never over the code, however little room the screen has left.
        var floor = code.Bottom + S(28);

        if (headTop < floor)
        {
            headTop = floor;
            blurbTop = headTop + headFont.Height + S(10);
        }

        using (var white = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString("Sit down and", headFont, white, left - S(4), headTop);
        }

        var headWidth = g.MeasureString("Sit down and ", headFont).Width;

        using (var coral = new SolidBrush(Palette.Accent))
        {
            g.DrawString("play.", headFont, coral, left - S(4) + headWidth, headTop);
        }

        using (var muted = new SolidBrush(Palette.TextMuted))
        {
            g.DrawString(blurb, bodyFont, muted, new RectangleF(left, blurbTop, blurbWidth, blurbSize.Height + S(4)));
        }
    }

    private void PaintRates(Graphics g)
    {
        var column = RatesColumn();

        var headFont = Arena.Display(FS(18f), FontStyle.Bold);
        Theme.DrawTracked(g, "RATES", headFont, Palette.TextMuted, column.Left, column.Top, SF(7.9f));

        var noteFont = Arena.Display(FS(15f), FontStyle.Bold);
        var note = "COUNTER OR UPI";
        var noteWidth = Theme.MeasureTracked(g, note, noteFont, SF(3f));
        Theme.DrawTracked(g, note, noteFont, Palette.TextFaint, column.Right - noteWidth, column.Top + S(3), SF(3f));

        if (_priceRows.Count == 0)
        {
            return;
        }

        var rowHeight = S(78);
        var gap = S(14);
        var top = column.Top + S(40);

        var durFont = Arena.Display(FS(32f), FontStyle.Bold);
        using var amtFont = Arena.Mono(FS(34f));

        for (var i = 0; i < _priceRows.Count; i++)
        {
            var row = new Rectangle(column.Left, top + i * (rowHeight + gap), column.Width, rowHeight);

            using (var fill = new SolidBrush(Color.FromArgb(11, 255, 255, 255)))
            {
                g.FillRectangle(fill, row);
            }

            using (var edge = new Pen(Color.FromArgb(20, 255, 255, 255)))
            {
                g.DrawRectangle(edge, row.Left, row.Top, row.Width - 1, row.Height - 1);
            }

            Theme.DrawTracked(
                g,
                _priceRows[i].Label,
                durFont,
                Palette.TextPrimary,
                row.Left + S(26),
                row.Top + (row.Height - durFont.Height) / 2f,
                SF(3.2f));

            var amount = _priceRows[i].Price;
            var amountWidth = g.MeasureString(amount, amtFont).Width;

            using var white = new SolidBrush(Palette.TextPrimary);
            g.DrawString(amount, amtFont, white, row.Right - S(26) - amountWidth, row.Top + (row.Height - amtFont.Height) / 2f);
        }
    }

    /// <summary>
    /// The panel beside Pay now: which machine this is.
    /// </summary>
    /// <remarks>
    /// Smaller than it was on the left, and that is the right trade. The number
    /// is read once - by staff, from across the room, or by a customer telling
    /// the counter where they are sitting - while the code has to be aimed at
    /// with a phone, and only one of those needs half a screen.
    /// </remarks>
    private void PaintStationPanel(Graphics g)
    {
        var panel = StationPanel();

        using (var fill = new SolidBrush(Color.FromArgb(8, 255, 255, 255)))
        {
            g.FillRectangle(fill, panel);
        }

        using (var edge = new Pen(Color.FromArgb(26, 255, 255, 255)))
        {
            g.DrawRectangle(edge, panel.Left, panel.Top, panel.Width - 1, panel.Height - 1);
        }

        using (var bar = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(bar, panel.Left, panel.Top, S(4), panel.Height);
        }

        var number = NumberOf(_config.StationId);

        using var numberFont = Arena.Mono(FS(130f));
        var numeral = g.MeasureString(number, numberFont);

        var numeralLeft = panel.Left + S(28);
        var numeralTop = panel.Top + (panel.Height - numeral.Height) / 2f;

        // The breath, kept with the number wherever it goes.
        var strength = (int)(34 + 24 * Math.Sin(_breathPhase * Math.PI * 2));

        using (var halo = new System.Drawing.Drawing2D.GraphicsPath())
        {
            var reach = new RectangleF(
                numeralLeft - numeral.Width * 0.30f,
                numeralTop - numeral.Height * 0.10f,
                numeral.Width * 1.60f,
                numeral.Height * 1.20f);

            halo.AddEllipse(reach);

            using var glow = new System.Drawing.Drawing2D.PathGradientBrush(halo)
            {
                CenterColor = Color.FromArgb(strength, Palette.Accent),
                SurroundColors = new[] { Color.FromArgb(0, Palette.Accent) },
            };

            g.FillPath(glow, halo);
        }

        using (var white = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString(number, numberFont, white, numeralLeft, numeralTop);
        }

        var textLeft = numeralLeft + numeral.Width + S(18);

        var labelFont = Arena.Display(FS(16f), FontStyle.Bold);
        Theme.DrawTracked(g, "STATION", labelFont, Palette.TextFaint, textLeft, panel.Top + S(56), SF(5.4f));

        var readyFont = Arena.Display(FS(18f), FontStyle.Bold);
        Theme.DrawTracked(
            g,
            _config.StationId.ToUpperInvariant() + "  ·  READY",
            readyFont,
            Palette.TextMuted,
            textLeft,
            panel.Top + S(86),
            SF(3.4f));
    }

    /// <summary>
    /// The ring that leaves Pay now, once every few seconds.
    /// </summary>
    /// <remarks>
    /// Drawn by the form, outside the button's own bounds, because a WinForms
    /// button cannot paint beyond itself. It is the only thing on this screen
    /// asking to be looked at, which is the point: everything else here is
    /// information, and this is the one thing to do.
    /// </remarks>
    private void PaintReadyRing(Graphics g)
    {
        var reach = S(18);
        var grow = (int)(reach * _pulsePhase);
        var alpha = (int)(120 * (1f - _pulsePhase));

        if (alpha <= 2)
        {
            return;
        }

        var button = PayButtonArea();
        var ring = new Rectangle(
            button.Left - grow,
            button.Top - grow,
            button.Width + grow * 2,
            button.Height + grow * 2);

        using var pen = new Pen(Color.FromArgb(alpha, Palette.Accent), Math.Max(1f, S(2)));
        g.DrawRectangle(pen, ring);
    }

    private void PaintFootline(Graphics g)
    {
        var y = Height - S(FootHeight);

        using (var rule = new Pen(Color.FromArgb(14, 255, 255, 255)))
        {
            g.DrawLine(rule, S(Margin), y, Width - S(Margin), y);
        }

        // The platform, where a platform belongs: small, grey, and last.
        var markFont = Arena.Display(FS(14f), FontStyle.Bold);
        Theme.DrawTracked(
            g,
            "BOOKMYGAME.CO.IN",
            markFont,
            Palette.TextDim,
            S(Margin),
            y + (S(FootHeight) - markFont.Height) / 2f,
            SF(4.2f));
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
