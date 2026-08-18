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
    private readonly Label _messageLabel;

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
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
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

        TopMost = false;
        TopMost = true;
        BringToFront();
    }

    public void HidePrompt()
    {
        if (Visible)
        {
            Hide();
        }
    }
}
