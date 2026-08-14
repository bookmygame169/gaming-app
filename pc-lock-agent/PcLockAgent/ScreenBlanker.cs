using Microsoft.Win32;

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
/// Nothing is created on a single-monitor machine, which is most of them —
/// but the covers are rebuilt whenever the displays change, because "most of
/// them" is not "all of them" and a monitor plugged in mid-session used to go
/// straight to an uncovered desktop.
/// </para>
/// </remarks>
internal sealed class ScreenBlanker : IDisposable
{
    private readonly List<Form> _blankers = [];

    /// <summary>
    /// The UI thread, captured so display changes can be handled on it.
    /// </summary>
    /// <remarks>
    /// <see cref="SystemEvents.DisplaySettingsChanged"/> is raised on a thread
    /// of its own, and creating a Form from there would either throw or produce
    /// a window on a message loop nothing is pumping. Captured at construction,
    /// which happens on the UI thread.
    /// </remarks>
    private readonly SynchronizationContext? _uiThread = SynchronizationContext.Current;

    private bool _watchingDisplays;
    private bool _shown;
    private bool _topMost = true;

    /// <summary>Creates and shows one cover per non-primary screen.</summary>
    public void Show()
    {
        _shown = true;

        // Subscribed even when this machine has one monitor, because the whole
        // point is to notice a second one arriving later.
        if (!_watchingDisplays)
        {
            SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;
            _watchingDisplays = true;
        }

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
            blanker.TopMost = _topMost;
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
        // Remembered as well as applied, so covers built later - after a monitor
        // is plugged in - come up matching the others instead of jumping in
        // front of a running game.
        _topMost = topMost;

        foreach (var blanker in _blankers)
        {
            if (!blanker.IsDisposed)
            {
                blanker.TopMost = topMost;
            }
        }
    }

    /// <summary>
    /// Rebuilds the covers when monitors are added, removed or rearranged.
    /// </summary>
    /// <remarks>
    /// Plugging a second monitor into a locked PC used to hand the customer an
    /// uncovered Windows desktop, taskbar and all - the covers were worked out
    /// once at startup and never revisited. Resolution changes matter too: a
    /// cover sized to the old bounds leaves a strip of desktop down the edge.
    /// <para>
    /// Everything is torn down and rebuilt rather than diffed. It runs on a
    /// person plugging in a cable, so it is rare, and correct is worth more
    /// here than clever.
    /// </para>
    /// </remarks>
    private void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (_uiThread is null)
        {
            return;
        }

        _uiThread.Post(_ =>
        {
            if (!_shown)
            {
                return;
            }

            AgentLog.Info($"Displays changed - now {Screen.AllScreens.Length} screen(s). Rebuilding covers.");

            CloseBlankers();
            Show();
        }, null);
    }

    private void CloseBlankers()
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
        if (_watchingDisplays)
        {
            // SystemEvents holds a static, process-wide list. Left subscribed,
            // this object stays alive for the life of the process.
            SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;
            _watchingDisplays = false;
        }

        _shown = false;
        CloseBlankers();
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
