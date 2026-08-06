namespace PcLockAgent;

/// <summary>
/// The fullscreen "Locked — Scan to Pay" screen shown whenever this PC has no
/// paid session running. It is the only thing a customer should be able to see
/// or interact with until the backend confirms payment.
/// </summary>
/// <remarks>
/// Steps 1-3 of the build order: layout, key blocking via
/// <see cref="SystemLockService"/>, and lock/unlock driven by
/// <see cref="MqttService"/>.
/// <para>
/// Deliberately NOT here yet (each is its own step):
/// <list type="bullet">
///   <item>A real QR code — arrives with the backend token endpoint</item>
///   <item>Game menu instead of the desktop on unlock — GameMenuForm (step 4)</item>
///   <item>Countdown, warning UI and auto-relock — SessionManager (step 5)</item>
/// </list>
/// </para>
/// </remarks>
internal sealed class LockedScreenForm : Form
{
    private readonly AgentConfig _config;

    /// <summary>Swallows the escape shortcuts. Stays active during a session too.</summary>
    private readonly SystemLockService _lockService;

    /// <summary>The only thing that can unlock this station.</summary>
    private readonly MqttService _mqttService;

    /// <summary>
    /// Guards against re-entering the close path — the dev chord can arrive from
    /// both the global hook and this form's own KeyDown handler.
    /// </summary>
    private bool _exiting;

    private Label _connectionLabel = null!;
    private Label? _devBadge;

    // BookMyGame palette, matched to the customer-facing site.
    private static readonly Color ColorBackground = Color.FromArgb(0x0A, 0x0E, 0x17);
    private static readonly Color ColorAccent = Color.FromArgb(0xE1, 0x1D, 0x48);
    private static readonly Color ColorTextPrimary = Color.FromArgb(0xF1, 0xF5, 0xF9);
    private static readonly Color ColorTextMuted = Color.FromArgb(0x94, 0xA3, 0xB8);
    private static readonly Color ColorPanelBorder = Color.FromArgb(0x1E, 0x29, 0x3B);
    private static readonly Color ColorOnline = Color.FromArgb(0x22, 0xC5, 0x5E);
    private static readonly Color ColorOffline = Color.FromArgb(0xF5, 0x9E, 0x0B);

    public LockedScreenForm(AgentConfig config)
    {
        _config = config;
        _lockService = new SystemLockService(AgentSettings.AllowDevExit);
        _mqttService = new MqttService(config);

        InitializeWindowBehaviour();
        BuildLayout();

        _lockService.DevExitRequested += (_, _) => RequestExit();
        _lockService.DevPassthroughToggleRequested += (_, _) => ToggleDevPassthrough();
        _mqttService.UnlockRequested += OnUnlockRequested;
        _mqttService.LockRequested += (_, _) => ApplyLocked();
        _mqttService.WarnRequested += OnWarnRequested;
        _mqttService.ConnectionChanged += OnConnectionChanged;
    }

    /// <summary>
    /// Starts the key hook and MQTT only once the window is on screen.
    /// </summary>
    /// <remarks>
    /// Ordering matters both ways: a failure while building the UI must not
    /// leave the keyboard locked down with nothing visible to explain why, and
    /// MQTT must not start before WinForms has installed the
    /// SynchronizationContext its callbacks marshal through.
    /// </remarks>
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);

        _lockService.Activate();
        _mqttService.Start();
        _mqttService.ReportState(locked: true, sessionId: null);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        // Releases the hook and puts the Task Manager policy back.
        _lockService.Dispose();

        // Fire-and-forget: OnFormClosed cannot be async, and the process is
        // ending anyway. The broker will notice the dropped TCP connection.
        _ = _mqttService.DisposeAsync().AsTask();

        base.OnFormClosed(e);
    }

    // -----------------------------------------------------------------------
    // Lock / unlock
    // -----------------------------------------------------------------------

    private void OnUnlockRequested(object? sender, UnlockEventArgs e)
    {
        // NOTE: e.DurationSeconds is recorded but not yet enforced — the
        // countdown and auto-relock are SessionManager (step 5). Until then a
        // session stays open until an explicit `lock` command arrives.
        AgentLog.Info($"Unlocking station (duration {e.DurationSeconds}s, session {e.SessionId ?? "(none)"}). " +
                      "Auto-relock not implemented until step 5.");

        ApplyUnlocked(e.SessionId);
    }

    private void ApplyUnlocked(string? sessionId)
    {
        // Hiding this form reveals the Windows desktop, which is NOT the
        // intended end state — step 4 replaces it with a fullscreen game menu so
        // the customer never sees the desktop at all. The keyboard hook stays
        // active meanwhile, so Alt+Tab, the Windows key and Task Manager remain
        // blocked even during a paid session.
        Hide();
        _mqttService.ReportState(locked: false, sessionId: sessionId);
    }

    private void ApplyLocked()
    {
        Show();

        // Re-assert topmost after being hidden: another window may have taken
        // the foreground while this form was not visible. Skipped while dev
        // passthrough is on, or a `lock` command would snatch the screen back
        // over the terminal being used to send these commands.
        if (!_lockService.Passthrough)
        {
            TopMost = false;
            TopMost = true;
            BringToFront();
            Activate();
        }

        _mqttService.ReportState(locked: true, sessionId: null);
    }

    private void OnWarnRequested(object? sender, int remainingSeconds)
    {
        // Parsed and logged only. The on-screen warning banner belongs to
        // SessionManager (step 5), which owns the countdown that decides when a
        // warning is actually due.
        AgentLog.Info($"Warn received ({remainingSeconds}s remaining). No UI until step 5.");
    }

    private void OnConnectionChanged(object? sender, bool connected)
    {
        _connectionLabel.Text = connected ? "●  Broker connected" : "●  Broker offline — station stays locked";
        _connectionLabel.ForeColor = connected ? ColorOnline : ColorOffline;
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
        BackColor = ColorBackground;
        Text = "BookMyGame — Locked";
        Cursor = Cursors.Default;

        // Route key presses to the form's KeyDown before any child control sees
        // them, so the dev escape hatch works regardless of what has focus.
        KeyPreview = true;
        KeyDown += OnKeyDown;
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

        // Anchor.None on an auto-sized panel is the WinForms idiom for "centre
        // me in my cell" — it stops the panel stretching to the cell's edges.
        var content = new TableLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            ColumnCount = 1,
            RowCount = 5,
            Anchor = AnchorStyles.None,
            BackColor = Color.Transparent,
        };

        content.Controls.Add(BuildHeading(), 0, 0);
        content.Controls.Add(BuildSubtitle(), 0, 1);
        content.Controls.Add(BuildQrPlaceholder(), 0, 2);
        content.Controls.Add(BuildStationLabel(), 0, 3);
        content.Controls.Add(BuildFooterHint(), 0, 4);

        root.Controls.Add(content, 0, 1);
        Controls.Add(root);

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
    /// Suspends the lock so a developer can reach a terminal, and puts it back.
    /// </summary>
    /// <remarks>
    /// Dropping <see cref="Form.TopMost"/> matters as much as unblocking the
    /// keys: with it still set, Alt+Tabbing to another window would just place
    /// that window behind this one.
    /// </remarks>
    private void ToggleDevPassthrough()
    {
        var enabled = !_lockService.Passthrough;
        _lockService.SetPassthrough(enabled);

        TopMost = !enabled;
        if (!enabled)
        {
            BringToFront();
            Activate();
        }

        if (_devBadge is not null)
        {
            _devBadge.Text = enabled
                ? "DEV BUILD — lock SUSPENDED (Ctrl+Shift+Alt+L to restore)"
                : "DEV BUILD — Ctrl+Shift+Alt+Q exit · Ctrl+Shift+Alt+L suspend";
            _devBadge.ForeColor = enabled ? ColorAccent : ColorOffline;
        }
    }

    private static Label BuildHeading() => new()
    {
        Text = "LOCKED",
        Font = new Font("Segoe UI", 46f, FontStyle.Bold),
        ForeColor = ColorAccent,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0, 0, 0, 4),
    };

    private static Label BuildSubtitle() => new()
    {
        Text = "Scan the QR code to pay and start your session",
        Font = new Font("Segoe UI", 15f, FontStyle.Regular),
        ForeColor = ColorTextPrimary,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0, 0, 0, 28),
    };

    /// <summary>
    /// Stand-in for the real QR code, sized to what the live one will occupy so
    /// the layout does not shift when it is dropped in.
    /// </summary>
    private static Panel BuildQrPlaceholder()
    {
        var panel = new Panel
        {
            Width = 260,
            Height = 260,
            Anchor = AnchorStyles.None,
            BackColor = Color.FromArgb(0x11, 0x18, 0x27),
            Margin = new Padding(0, 0, 0, 24),
        };

        // Painting the border by hand (rather than BorderStyle.FixedSingle) lets
        // it use the palette colour instead of the Windows system grey.
        panel.Paint += (_, e) =>
        {
            using var borderPen = new Pen(ColorPanelBorder, 2f);
            e.Graphics.DrawRectangle(borderPen, 1, 1, panel.Width - 3, panel.Height - 3);

            const string placeholder = "QR CODE";
            using var font = new Font("Segoe UI", 13f, FontStyle.Bold);
            using var brush = new SolidBrush(ColorTextMuted);
            var size = e.Graphics.MeasureString(placeholder, font);
            e.Graphics.DrawString(
                placeholder,
                font,
                brush,
                (panel.Width - size.Width) / 2f,
                (panel.Height - size.Height) / 2f);
        };

        return panel;
    }

    private Label BuildStationLabel() => new()
    {
        Text = $"Station  {_config.StationId}",
        Font = new Font("Segoe UI", 12f, FontStyle.Bold),
        ForeColor = ColorTextPrimary,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0, 0, 0, 6),
    };

    private static Label BuildFooterHint() => new()
    {
        Text = "Need help? Ask at the counter.",
        Font = new Font("Segoe UI", 10f, FontStyle.Regular),
        ForeColor = ColorTextMuted,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0),
    };

    /// <summary>
    /// Broker connection state, bottom-left. Useful while testing, and lets
    /// staff see at a glance whether a station can be unlocked at all.
    /// </summary>
    private Label BuildConnectionLabel() => new()
    {
        Text = "●  Connecting to broker…",
        Font = new Font("Segoe UI", 9f, FontStyle.Regular),
        ForeColor = ColorTextMuted,
        BackColor = Color.Transparent,
        AutoSize = true,
        Location = new Point(16, Bounds.Height - 34),
    };

    /// <summary>
    /// Corner badge making it obvious at a glance that this build still has the
    /// escape hatch compiled in, so it is hard to deploy one to a café PC by
    /// mistake.
    /// </summary>
    private static Label BuildDevModeBadge() => new()
    {
        Text = "DEV BUILD — Ctrl+Shift+Alt+Q exit · Ctrl+Shift+Alt+L suspend",
        Font = new Font("Segoe UI", 9f, FontStyle.Bold),
        ForeColor = Color.FromArgb(0xF5, 0x9E, 0x0B),
        BackColor = Color.FromArgb(0x1E, 0x29, 0x3B),
        AutoSize = true,
        Padding = new Padding(8, 5, 8, 5),
        Location = new Point(16, 16),
    };

    /// <summary>
    /// Fallback path for the dev chord.
    /// </summary>
    /// <remarks>
    /// <see cref="SystemLockService"/> already catches this globally. This stays
    /// as a second route for the case where the hook failed to install — without
    /// it, a hook failure plus a shipped build with no Alt+F4 would leave no way
    /// out at all.
    /// </remarks>
    private void OnKeyDown(object? sender, KeyEventArgs e)
    {
        if (!AgentSettings.AllowDevExit)
        {
            return;
        }

        // Deliberately awkward chord — a customer will not hit this by accident.
        if (e.Control && e.Shift && e.Alt && e.KeyCode == Keys.Q)
        {
            e.Handled = true;
            RequestExit();
        }
    }

    private void RequestExit()
    {
        if (_exiting)
        {
            return;
        }

        _exiting = true;
        AgentLog.Info("Dev exit chord pressed. Shutting down.");

        Close();

        // Redundant today (closing the main form ends Application.Run even when
        // it is hidden), but keeps the chord working once step 4 adds a second
        // form that could still be open when this one is hidden.
        Application.Exit();
    }
}
