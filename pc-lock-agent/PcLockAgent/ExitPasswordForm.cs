namespace PcLockAgent;

/// <summary>
/// Asks for the password that closes the agent.
/// </summary>
/// <remarks>
/// Topmost and centred, because it appears over a fullscreen lock screen that
/// is itself topmost — a dialog behind that is a dialog nobody can answer.
/// </remarks>
internal sealed class ExitPasswordForm : Form
{
    /// <summary>
    /// How many tries before this gives up.
    /// </summary>
    /// <remarks>
    /// The password is slow to test by design, so this is not what stops a
    /// determined attempt. It is here so that a customer who finds the chord
    /// gets a dialog that closes itself rather than one they can sit and poke
    /// at while the machine is unattended.
    /// </remarks>
    private const int MaxAttempts = 3;

    private readonly string? _storedHash;
    private readonly TextBox _password;
    private readonly Label _message;

    private int _attempts;

    public ExitPasswordForm(string? storedHash)
    {
        _storedHash = storedHash;

        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(460, 240);
        BackColor = Palette.Surface;
        TopMost = true;
        ShowInTaskbar = false;
        KeyPreview = true;

        Theme.RoundCorners(this, Theme.CornerRadius);

        Paint += (_, e) => Theme.DrawBorder(
            e.Graphics, new Rectangle(0, 0, Width, Height), Palette.CardBorder, 1f, Theme.CornerRadius);

        var title = new Label
        {
            Text = "Administrator exit",
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = false,
            Size = new Size(400, 30),
            Location = new Point(30, 28),
            BackColor = Color.Transparent,
        };

        var hint = new Label
        {
            Text = "Enter the password to close the lock screen.",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Size = new Size(400, 22),
            Location = new Point(30, 60),
            BackColor = Color.Transparent,
        };

        _password = new TextBox
        {
            UseSystemPasswordChar = true,
            Font = new Font("Segoe UI", 12f, FontStyle.Regular),
            BorderStyle = BorderStyle.FixedSingle,
            BackColor = Palette.CardFillOpaque,
            ForeColor = Palette.TextPrimary,
            Size = new Size(400, 32),
            Location = new Point(30, 96),
        };

        _message = new Label
        {
            Text = string.Empty,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Palette.Accent,
            AutoSize = false,
            Size = new Size(400, 22),
            Location = new Point(30, 134),
            BackColor = Color.Transparent,
        };

        var unlock = new Button
        {
            Text = "CLOSE THE AGENT",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            FlatStyle = FlatStyle.Flat,
            BackColor = Palette.Accent,
            ForeColor = Palette.Ink,
            Size = new Size(200, 38),
            Location = new Point(30, 166),
            Cursor = Cursors.Hand,
        };
        unlock.FlatAppearance.BorderSize = 0;
        unlock.Click += (_, _) => Submit();

        var cancel = new Button
        {
            Text = "CANCEL",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            FlatStyle = FlatStyle.Flat,
            BackColor = Palette.CardFillOpaque,
            ForeColor = Palette.TextMuted,
            Size = new Size(120, 38),
            Location = new Point(240, 166),
            Cursor = Cursors.Hand,
        };
        cancel.FlatAppearance.BorderColor = Palette.CardBorder;
        cancel.Click += (_, _) => Close();

        Controls.AddRange(new Control[] { title, hint, _password, _message, unlock, cancel });

        KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter)
            {
                e.Handled = true;
                Submit();
            }
            else if (e.KeyCode == Keys.Escape)
            {
                e.Handled = true;
                Close();
            }
        };

        Shown += (_, _) =>
        {
            BringToFront();
            Activate();
            _password.Focus();
        };
    }

    /// <summary>Set once the password has been accepted.</summary>
    public bool Accepted { get; private set; }

    private void Submit()
    {
        if (ExitPassword.Verify(_password.Text, _storedHash))
        {
            AgentLog.Info("Exit password accepted. Closing the agent.");
            Accepted = true;
            Close();
            return;
        }

        _attempts++;
        _password.Clear();
        _password.Focus();

        AgentLog.Warn($"Exit password rejected (attempt {_attempts} of {MaxAttempts}).");

        if (_attempts >= MaxAttempts)
        {
            Close();
            return;
        }

        _message.Text = $"That is not the password. {MaxAttempts - _attempts} attempt(s) left.";
    }
}
