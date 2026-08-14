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

    public LockedScreenForm(AgentConfig config)
    {
        _config = config;
        InitializeWindowBehaviour();
        BuildLayout();
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

    private static Label BuildHeading() => new()
    {
        Text = "LOCKED",
        Font = new Font("Segoe UI", 46f, FontStyle.Bold),
        ForeColor = Palette.Accent,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0, 0, 0, 4),
    };

    private static Label BuildSubtitle() => new()
    {
        Text = "Scan the QR code to pay and start your session",
        Font = new Font("Segoe UI", 15f, FontStyle.Regular),
        ForeColor = Palette.TextPrimary,
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
            BackColor = Palette.Surface,
            Margin = new Padding(0, 0, 0, 24),
        };

        // Painting the border by hand (rather than BorderStyle.FixedSingle) lets
        // it use the palette colour instead of the Windows system grey.
        panel.Paint += (_, e) =>
        {
            using var borderPen = new Pen(Palette.Border, 2f);
            e.Graphics.DrawRectangle(borderPen, 1, 1, panel.Width - 3, panel.Height - 3);

            const string placeholder = "QR CODE";
            using var font = new Font("Segoe UI", 13f, FontStyle.Bold);
            using var brush = new SolidBrush(Palette.TextMuted);
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
        // Upper-cased for display only — the id itself stays lower case to match
        // the MQTT topic the website publishes to.
        Text = $"Station  {_config.StationId.ToUpperInvariant()}",
        Font = new Font("Segoe UI", 12f, FontStyle.Bold),
        ForeColor = Palette.TextPrimary,
        AutoSize = true,
        Anchor = AnchorStyles.None,
        Margin = new Padding(0, 0, 0, 6),
    };

    private static Label BuildFooterHint() => new()
    {
        Text = "Need help? Ask at the counter.",
        Font = new Font("Segoe UI", 10f, FontStyle.Regular),
        ForeColor = Palette.TextMuted,
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
