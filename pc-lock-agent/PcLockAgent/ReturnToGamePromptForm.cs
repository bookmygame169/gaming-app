namespace PcLockAgent;

/// <summary>
/// Clickable banner shown when a game is running but no longer in the foreground.
/// </summary>
/// <remarks>
/// Alt+Tab and the taskbar are blocked on café PCs, so without this the customer
/// can end up staring at the game menu with their match hidden behind it.
/// </remarks>
internal sealed class ReturnToGamePromptForm : Form
{
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOPMOST = 0x00000008;

    private readonly Label _messageLabel;

    /// <summary>
    /// Never takes focus when it appears.
    /// </summary>
    /// <remarks>
    /// This is shown from a timer that runs every 1.5 seconds for as long as
    /// the game is not in front — which includes the whole time a launcher is
    /// on screen. A Form.Show() activates by default, so it was pulling
    /// foreground off the Riot Client twice a second while the customer was
    /// trying to sign in, and the game could never come forward.
    /// </remarks>
    protected override bool ShowWithoutActivation => true;

    /// <summary>
    /// Visible above the game, but not something Windows will ever focus.
    /// </summary>
    /// <remarks>
    /// ShowWithoutActivation covers the first appearance; WS_EX_NOACTIVATE is
    /// what stops a later click or z-order change handing it focus too.
    /// </remarks>
    protected override CreateParams CreateParams
    {
        get
        {
            var createParams = base.CreateParams;
            createParams.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOPMOST;
            return createParams;
        }
    }

    public ReturnToGamePromptForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Surface;
        Cursor = Cursors.Hand;

        var screen = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        Width = 640;
        Height = 82;
        Location = new Point(screen.X + (screen.Width - Width) / 2, screen.Y + screen.Height - Height - 48);

        _messageLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = Arena.Sans(15f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            BackColor = Color.Transparent,
            Cursor = Cursors.Hand,
        };

        Controls.Add(_messageLabel);

        Paint += (_, e) =>
        {
            using var pen = new Pen(Palette.Accent, 3f);
            e.Graphics.DrawRectangle(pen, 1, 1, Width - 3, Height - 3);
        };

        Click += (_, _) => ReturnClicked?.Invoke(this, EventArgs.Empty);
        _messageLabel.Click += (_, _) => ReturnClicked?.Invoke(this, EventArgs.Empty);
    }

    public event EventHandler? ReturnClicked;

    public void ShowForGame(string gameName)
    {
        _messageLabel.Text = $"Return to {gameName}  —  click here";
        if (!Visible)
        {
            Show();
        }

        // Raised without being activated. The old TopMost flip plus
        // BringToFront ran on every tick and took foreground with it, which is
        // what kept dragging the customer off their launcher and back here.
        NativeMethods.SetWindowPos(
            Handle,
            NativeMethods.HWND_TOPMOST,
            0, 0, 0, 0,
            NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE
                | NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);
    }

    private static class NativeMethods
    {
        public static readonly IntPtr HWND_TOPMOST = new(-1);

        public const uint SWP_NOSIZE = 0x0001;
        public const uint SWP_NOMOVE = 0x0002;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;

        [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true)]
        [return: System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.Bool)]
        public static extern bool SetWindowPos(
            IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    }

    public void HidePrompt()
    {
        if (Visible)
        {
            Hide();
        }
    }
}
