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

    private readonly AgentConfig _config;
    private readonly PlayRequestClient _prices;

    private Image? _scanCode;
    private bool _connected;
    private bool _passthrough;
    private List<(string Label, string Price)> _priceRows = new();

    private Button _payButton = null!;
    private System.Windows.Forms.Timer? _clockTimer;

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

        // The clock is the one thing on here that has to keep moving. A minute
        // is enough: it shows hours and minutes.
        _clockTimer = new System.Windows.Forms.Timer { Interval = 20_000 };
        _clockTimer.Tick += (_, _) => Invalidate(ClockArea());
        _clockTimer.Start();
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

    private Rectangle ClockArea() => new(Width - S(360), S(18), S(320), S(40));

    private Rectangle PayPanel() => new(
        Width - S(46) - S(660),
        S(470),
        S(660),
        S(384));

    private void BuildControls()
    {
        var panel = PayPanel();

        _payButton = new Button
        {
            Text = "PAY AND PLAY",
            Font = Arena.Sans(SF(15f), FontStyle.Bold),
            ForeColor = Color.White,
            BackColor = Palette.Accent,
            FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand,
            Left = panel.Left + S(34),
            Top = panel.Bottom - S(34) - S(66),
            Width = panel.Width - S(68),
            Height = S(66),
            FlatAppearance = { BorderSize = 0 },
        };

        _payButton.Click += (_, _) => PayNowRequested?.Invoke(this, EventArgs.Empty);
        Arena.CutCorners(_payButton, S(18));

        Controls.Add(_payButton);
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

        PaintTopBar(g);
        PaintStation(g);
        PaintScanPanel(g);
        PaintPayPanel(g);
        PaintFooter(g);
    }

    private void PaintTopBar(Graphics g)
    {
        var barHeight = S(74);

        using (var rule = new Pen(Color.FromArgb(18, 255, 255, 255)))
        {
            g.DrawLine(rule, 0, barHeight, Width, barHeight);
        }

        using var nameFont = Arena.Sans(SF(17f), FontStyle.Bold);
        using var kickerFont = Arena.Sans(SF(8.5f), FontStyle.Bold);
        using var monoFont = Arena.Mono(SF(10.5f));

        // The café's name, not the platform's. A customer sitting in PlayTime
        // should see PlayTime; BookMyGame is a line of grey text at the bottom.
        var cafe = (_config.CafeName ?? string.Empty).Trim().ToUpperInvariant();
        var left = (float)S(46);

        if (cafe.Length > 0)
        {
            Theme.DrawTracked(g, cafe, nameFont, Palette.TextPrimary, left, S(26), SF(5f));
            left += Theme.MeasureTracked(g, cafe, nameFont, SF(5f)) + S(20);

            using var divider = new Pen(Color.FromArgb(36, 255, 255, 255));
            g.DrawLine(divider, left, S(26), left, S(48));
            left += S(20);

            Theme.DrawTracked(g, "GAMING CAFE", kickerFont, Palette.AccentSoft, left, S(32), SF(3.2f));
        }

        var clock = DateTime.Now.ToString("HH:mm");
        var clockWidth = g.MeasureString(clock, monoFont).Width;
        using (var dim = new SolidBrush(Palette.TextDim))
        {
            g.DrawString(clock, monoFont, dim, Width - S(180) - clockWidth, S(30));
        }

        var stateText = _passthrough ? "PASSTHROUGH" : _connected ? "ONLINE" : "OFFLINE";
        var stateColour = _passthrough ? Palette.Accent : _connected ? Palette.Online : Palette.Warning;

        using (var dot = new SolidBrush(stateColour))
        {
            g.FillRectangle(dot, Width - S(140), S(34), S(7), S(7));
        }

        using var stateFont = Arena.Sans(SF(8f), FontStyle.Bold);
        Theme.DrawTracked(g, stateText, stateFont, stateColour, Width - S(124), S(31), SF(2.2f));
    }

    private void PaintStation(Graphics g)
    {
        var left = (float)S(46);

        using (var tick = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(tick, left, S(174), S(30), S(2));
        }

        using var labelFont = Arena.Sans(SF(9f), FontStyle.Bold);
        Theme.DrawTracked(g, "STATION", labelFont, Palette.TextMuted, left + S(42), S(168), SF(4.4f));

        // The number alone, in Consolas. "PC-01" spelled out is a label; the
        // bare numeral at this size is an identity, and it is what somebody
        // reads from across the room.
        var number = NumberOf(_config.StationId);

        using var numberFont = Arena.Mono(SF(232f));
        using (var glow = new SolidBrush(Color.FromArgb(60, Palette.Accent)))
        {
            g.DrawString(number, numberFont, glow, left - S(10), S(186));
        }

        using (var white = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString(number, numberFont, white, left - S(14), S(182));
        }

        var chipTop = S(486);
        var chipHeight = S(40);

        using (var chip = new SolidBrush(Color.FromArgb(13, 255, 255, 255)))
        {
            g.FillRectangle(chip, left, chipTop, S(268), chipHeight);
        }

        using (var edge = new SolidBrush(Palette.Accent))
        {
            g.FillRectangle(edge, left, chipTop, S(3), chipHeight);
        }

        using var chipFont = Arena.Sans(SF(10.5f), FontStyle.Bold);
        Theme.DrawTracked(
            g,
            _config.StationId.ToUpperInvariant() + "  ·  READY",
            chipFont,
            Palette.TextMuted,
            left + S(20),
            chipTop + S(12),
            SF(1.4f));

        using var bodyFont = Arena.Sans(SF(11.5f));
        using var body = new SolidBrush(Palette.TextFaint);

        g.DrawString(
            "This machine is locked. Start a session with your\nphone, or pay right here at the screen.",
            bodyFont,
            body,
            new RectangleF(left, S(556), S(420), S(90)));
    }

    private void PaintScanPanel(Graphics g)
    {
        var panel = new Rectangle(Width - S(46) - S(660), S(128), S(660), S(312));

        using (var fill = new System.Drawing.Drawing2D.LinearGradientBrush(
                   panel,
                   Color.FromArgb(16, 255, 255, 255),
                   Color.FromArgb(4, 255, 255, 255),
                   System.Drawing.Drawing2D.LinearGradientMode.ForwardDiagonal))
        using (var path = Arena.CutRect(panel, S(26)))
        {
            g.FillPath(fill, path);
        }

        Arena.DrawTopEdge(g, panel, Color.FromArgb(28, 255, 255, 255), S(1));

        var codeSize = S(176);
        var codeLeft = panel.Left + S(34);
        var codeTop = panel.Top + S(66);

        using (var white = new SolidBrush(Color.White))
        {
            g.FillRectangle(white, codeLeft, codeTop, codeSize, codeSize);
        }

        if (_scanCode is not null)
        {
            var inner = S(11);
            g.DrawImage(_scanCode, codeLeft + inner, codeTop + inner, codeSize - inner * 2, codeSize - inner * 2);
        }

        var textLeft = codeLeft + codeSize + S(28);

        using var stepFont = Arena.Mono(SF(9.5f));
        Theme.DrawTracked(g, "01 / SCAN", stepFont, Palette.Accent, textLeft, panel.Top + S(66), SF(1.8f));

        using var titleFont = Arena.Sans(SF(19f), FontStyle.Bold);
        using (var white = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString("Use your phone", titleFont, white, textLeft, panel.Top + S(88));
        }

        using var bodyFont = Arena.Sans(SF(10.5f));
        using (var muted = new SolidBrush(Palette.TextMuted))
        {
            g.DrawString(
                _scanCode is not null
                    ? "Members play on hours already paid for.\nNothing comes off until you finish."
                    : "This PC cannot reach the website right now.\nPlease pay below, or ask at the counter.",
                bodyFont,
                muted,
                new RectangleF(textLeft, panel.Top + S(132), S(330), S(90)));
        }
    }

    private void PaintPayPanel(Graphics g)
    {
        var panel = PayPanel();

        using (var fill = new System.Drawing.Drawing2D.LinearGradientBrush(
                   panel,
                   Color.FromArgb(42, 225, 29, 72),
                   Color.FromArgb(8, 225, 29, 72),
                   System.Drawing.Drawing2D.LinearGradientMode.ForwardDiagonal))
        using (var path = Arena.CutRect(panel, S(26)))
        {
            g.FillPath(fill, path);
        }

        Arena.DrawTopEdge(g, panel, Color.FromArgb(108, 225, 29, 72), S(1));

        using var stepFont = Arena.Mono(SF(9.5f));
        Theme.DrawTracked(g, "02 / PAY HERE", stepFont, Palette.Accent, panel.Left + S(34), panel.Top + S(30), SF(1.8f));

        using var titleFont = Arena.Sans(SF(19f), FontStyle.Bold);
        using (var white = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString("No account needed", titleFont, white, panel.Left + S(34), panel.Top + S(52));
        }

        if (_priceRows.Count == 0)
        {
            return;
        }

        var gap = S(10);
        var boxTop = panel.Top + S(112);
        var boxHeight = S(78);
        var available = panel.Width - S(68) - gap * (_priceRows.Count - 1);
        var boxWidth = available / _priceRows.Count;

        using var labelFont = Arena.Sans(SF(8.5f), FontStyle.Bold);
        using var priceFont = Arena.Mono(SF(19f));

        for (var i = 0; i < _priceRows.Count; i++)
        {
            var box = new Rectangle(panel.Left + S(34) + i * (boxWidth + gap), boxTop, boxWidth, boxHeight);

            using (var fill = new SolidBrush(Color.FromArgb(82, 0, 0, 0)))
            {
                g.FillRectangle(fill, box);
            }

            Arena.DrawTopEdge(g, box, Color.FromArgb(26, 255, 255, 255), S(2));

            Theme.DrawTracked(g, _priceRows[i].Label, labelFont, Palette.TextMuted, box.Left + S(16), box.Top + S(14), SF(1.2f));

            using var white = new SolidBrush(Palette.TextPrimary);
            g.DrawString(_priceRows[i].Price, priceFont, white, box.Left + S(13), box.Top + S(34));
        }
    }

    private void PaintFooter(Graphics g)
    {
        var y = Height - S(56);

        using (var rule = new Pen(Color.FromArgb(14, 255, 255, 255)))
        {
            g.DrawLine(rule, S(46), y, Width - S(46), y);
        }

        using var bodyFont = Arena.Sans(SF(10f));
        using var monoFont = Arena.Mono(SF(10f));
        using var dim = new SolidBrush(Palette.TextDim);

        var lead = "Need help? Tell the counter you are on ";
        g.DrawString(lead, bodyFont, dim, S(46), y + S(16));

        var leadWidth = g.MeasureString(lead, bodyFont).Width;
        using (var muted = new SolidBrush(Palette.TextMuted))
        {
            g.DrawString(_config.StationId.ToUpperInvariant(), monoFont, muted, S(46) + leadWidth, y + S(16));
        }

        // The platform, where a platform belongs: small, grey, and last.
        using var markFont = Arena.Sans(SF(8.5f), FontStyle.Bold);
        var mark = "POWERED BY BOOKMYGAME";
        var markWidth = Theme.MeasureTracked(g, mark, markFont, SF(2f));
        Theme.DrawTracked(g, mark, markFont, Color.FromArgb(0x33, 0x41, 0x55), Width - S(46) - markWidth, y + S(18), SF(2f));
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
