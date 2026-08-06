namespace PcLockAgent;

/// <summary>
/// Small banner across the top of the screen warning that time is running out.
/// </summary>
/// <remarks>
/// Unlike the PS5 side, which has to briefly cut the video feed to show a
/// warning, the PC agent can draw over whatever is running — so this never
/// interrupts play. It appears, sits for a few seconds, and disappears.
/// </remarks>
internal sealed class WarningOverlayForm : Form
{
    private const int VisibleSeconds = 7;

    private readonly System.Windows.Forms.Timer _hideTimer;
    private readonly Label _messageLabel;

    public WarningOverlayForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Surface;

        var screen = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        Width = 560;
        Height = 74;
        Location = new Point(screen.X + (screen.Width - Width) / 2, screen.Y + 40);

        _messageLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            BackColor = Color.Transparent,
        };

        Controls.Add(_messageLabel);

        Paint += (_, e) =>
        {
            using var pen = new Pen(Palette.Accent, 3f);
            e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
        };

        _hideTimer = new System.Windows.Forms.Timer { Interval = VisibleSeconds * 1000 };
        _hideTimer.Tick += (_, _) =>
        {
            _hideTimer.Stop();
            Hide();
        };
    }

    /// <summary>
    /// Stops the banner taking focus when it appears.
    /// </summary>
    /// <remarks>
    /// Without this, showing the banner would activate it and pull focus off the
    /// game — which for a fullscreen title usually means it minimises. A warning
    /// that throws the customer out of their match would be worse than no
    /// warning at all.
    /// </remarks>
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;

            // WS_EX_NOACTIVATE — never becomes the foreground window, even if
            // clicked. WS_EX_TOOLWINDOW — keeps it out of the Alt+Tab list.
            parameters.ExStyle |= NativeConstants.WS_EX_NOACTIVATE;
            parameters.ExStyle |= NativeConstants.WS_EX_TOOLWINDOW;
            return parameters;
        }
    }

    /// <summary>Shows the banner for a few seconds.</summary>
    public void ShowWarning(int secondsRemaining)
    {
        _messageLabel.Text = FormatMessage(secondsRemaining);
        _hideTimer.Stop();

        Show();
        TopMost = false;
        TopMost = true;

        _hideTimer.Start();
    }

    private static string FormatMessage(int secondsRemaining)
    {
        if (secondsRemaining <= 0)
        {
            return "Your time is up";
        }

        if (secondsRemaining < 60)
        {
            return $"{secondsRemaining} seconds remaining";
        }

        var minutes = (int)Math.Round(secondsRemaining / 60.0);
        return minutes == 1
            ? "1 minute remaining — please save your game"
            : $"{minutes} minutes remaining";
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _hideTimer.Dispose();
        }

        base.Dispose(disposing);
    }

    private static class NativeConstants
    {
        public const int WS_EX_NOACTIVATE = 0x08000000;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
    }
}
