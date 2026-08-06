namespace PcLockAgent;

/// <summary>
/// The fullscreen "Locked — Scan to Pay" screen shown whenever this PC has no
/// paid session running. It is the only thing a customer should be able to see
/// or interact with until the backend confirms payment.
/// </summary>
/// <remarks>
/// Steps 1-2 of the build order: layout, window behaviour, and key blocking via
/// <see cref="SystemLockService"/>.
/// <para>
/// Deliberately NOT here yet (each is its own step):
/// <list type="bullet">
///   <item>A real QR code — arrives with the backend token endpoint</item>
///   <item>Unlock on payment — MqttService</item>
///   <item>Countdown and auto-relock — SessionManager</item>
/// </list>
/// </para>
/// </remarks>
public sealed class LockedScreenForm : Form
{
    /// <summary>Swallows the escape shortcuts while this screen is up.</summary>
    private readonly SystemLockService _lockService = new(AgentSettings.AllowDevExit);

    /// <summary>
    /// Guards against re-entering the close path — the dev chord can arrive from
    /// both the global hook and this form's own KeyDown handler.
    /// </summary>
    private bool _exiting;

    // BookMyGame palette, matched to the customer-facing site.
    private static readonly Color ColorBackground = Color.FromArgb(0x0A, 0x0E, 0x17);
    private static readonly Color ColorAccent = Color.FromArgb(0xE1, 0x1D, 0x48);
    private static readonly Color ColorTextPrimary = Color.FromArgb(0xF1, 0xF5, 0xF9);
    private static readonly Color ColorTextMuted = Color.FromArgb(0x94, 0xA3, 0xB8);
    private static readonly Color ColorPanelBorder = Color.FromArgb(0x1E, 0x29, 0x3B);

    public LockedScreenForm()
    {
        InitializeWindowBehaviour();
        BuildLayout();

        _lockService.DevExitRequested += (_, _) => RequestExit();
    }

    /// <summary>
    /// Starts blocking keys only once the window is actually on screen, so a
    /// failure while building the UI cannot leave the keyboard locked down with
    /// nothing visible to explain why.
    /// </summary>
    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        _lockService.Activate();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        // Releases the hook and puts the Task Manager policy back.
        _lockService.Dispose();
        base.OnFormClosed(e);
    }

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

        if (AgentSettings.AllowDevExit)
        {
            var badge = BuildDevModeBadge();
            Controls.Add(badge);
            badge.BringToFront();
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

    private static Label BuildStationLabel() => new()
    {
        Text = $"Station  {AgentSettings.StationId}",
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
    /// Corner badge making it obvious at a glance that this build still has the
    /// escape hatch compiled in, so it is hard to deploy one to a café PC by
    /// mistake.
    /// </summary>
    private static Label BuildDevModeBadge() => new()
    {
        Text = "DEV BUILD — Ctrl+Shift+Alt+Q to exit",
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
        Close();
    }
}
