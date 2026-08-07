namespace PcLockAgent;

/// <summary>
/// Covers every monitor other than the primary one.
/// </summary>
/// <remarks>
/// The lock screen and game menu size themselves to the primary display, so on a
/// two-monitor machine the second screen still showed the Windows desktop —
/// taskbar, icons and all — which defeats the lock entirely. These plain panels
/// close that.
/// <para>
/// Nothing is created on a single-monitor machine, which is most of them.
/// </para>
/// </remarks>
internal sealed class ScreenBlanker : IDisposable
{
    private readonly List<Form> _blankers = [];

    /// <summary>Creates and shows one cover per non-primary screen.</summary>
    public void Show()
    {
        if (_blankers.Count > 0)
        {
            return;
        }

        var primary = Screen.PrimaryScreen;

        foreach (var screen in Screen.AllScreens)
        {
            if (primary is not null && screen.Equals(primary))
            {
                continue;
            }

            var blanker = CreateBlanker(screen);
            _blankers.Add(blanker);
            blanker.Show();
        }

        if (_blankers.Count > 0)
        {
            AgentLog.Info($"Covered {_blankers.Count} secondary screen(s).");
        }
    }

    /// <summary>
    /// Matches the covers to whatever the main screens are doing.
    /// </summary>
    /// <remarks>
    /// Dropped out of always-on-top while a game runs, for the same reason the
    /// game menu is: a game that spans both monitors must be able to draw over
    /// them. The desktop stays hidden either way, since the covers remain
    /// visible underneath.
    /// </remarks>
    public void SetTopMost(bool topMost)
    {
        foreach (var blanker in _blankers)
        {
            if (!blanker.IsDisposed)
            {
                blanker.TopMost = topMost;
            }
        }
    }

    private static Form CreateBlanker(Screen screen)
    {
        var form = new BlankerForm
        {
            FormBorderStyle = FormBorderStyle.None,
            StartPosition = FormStartPosition.Manual,
            Bounds = screen.Bounds,
            TopMost = true,
            ShowInTaskbar = false,
            BackColor = Palette.Background,
            Text = "BookMyGame",
        };

        var label = new Label
        {
            Text = "This screen is not in use",
            Font = new Font("Segoe UI", 13f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = false,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            BackColor = Color.Transparent,
        };

        form.Controls.Add(label);
        return form;
    }

    public void Dispose()
    {
        foreach (var blanker in _blankers)
        {
            if (!blanker.IsDisposed)
            {
                blanker.Close();
                blanker.Dispose();
            }
        }

        _blankers.Clear();
    }

    /// <summary>
    /// A cover that never takes focus.
    /// </summary>
    /// <remarks>
    /// Without this, showing a cover would pull focus off the lock screen — or
    /// worse, off a running game, which for a fullscreen title usually means it
    /// minimises.
    /// </remarks>
    private sealed class BlankerForm : Form
    {
        protected override bool ShowWithoutActivation => true;

        protected override CreateParams CreateParams
        {
            get
            {
                var parameters = base.CreateParams;
                parameters.ExStyle |= 0x08000000; // WS_EX_NOACTIVATE
                parameters.ExStyle |= 0x00000080; // WS_EX_TOOLWINDOW — keeps it out of Alt+Tab
                return parameters;
            }
        }
    }
}
