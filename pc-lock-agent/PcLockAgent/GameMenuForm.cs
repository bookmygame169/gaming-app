using System.Diagnostics;

namespace PcLockAgent;

/// <summary>
/// Fullscreen game launcher shown during a paid session, in place of the Windows
/// desktop.
/// </summary>
/// <remarks>
/// The customer never sees Explorer: they go straight from the lock screen to
/// this menu, and closing a game returns them here rather than to a desktop.
/// </remarks>
internal sealed class GameMenuForm : Form
{
    /// <summary>Raised when a game process has started.</summary>
    public event EventHandler? GameStarted;

    /// <summary>Raised when the running game has exited on its own.</summary>
    public event EventHandler? GameExited;

    /// <summary>Raised when the customer opens an application from the menu.</summary>
    public event EventHandler? AppLaunched;

    /// <summary>Raised when the customer says they have finished playing.</summary>
    public event EventHandler? EndSessionRequested;

    /// <summary>Raised when the customer wants to buy more time.</summary>
    public event EventHandler? AddTimeRequested;

    /// <summary>
    /// Whether this window is allowed to close.
    /// </summary>
    /// <remarks>
    /// False for the whole of a session. Alt+F4 is permitted while something
    /// the customer launched is in front, and once they close that, the next
    /// Alt+F4 lands on this menu — closing it would leave the desktop with
    /// nothing over it. Only the agent's own shutdown sets this.
    /// </remarks>
    public bool AllowClose { get; set; }

    /// <summary>Fallback for the dev chords if the keyboard hook is not installed.</summary>
    public event EventHandler<DevChord>? DevChordPressed;

    /// <summary>
    /// How long to wait for a launcher-started game to actually appear before
    /// concluding it failed to start.
    /// </summary>
    /// <remarks>
    /// Generous on purpose: a launcher may need to update itself, and returning
    /// the customer to the menu while their game is still loading is worse than
    /// waiting a little longer.
    /// </remarks>
    private static readonly TimeSpan LaunchGracePeriod = TimeSpan.FromMinutes(2);

    /// <summary>
    /// Two-second checks a game may go without answering before the customer is
    /// offered a way out of it. Forty-five seconds: long enough that a slow
    /// level load passes unremarked, short enough that nobody sits staring at a
    /// frozen picture wondering whether to fetch staff.
    /// </summary>
    private const int StuckGameTicks = 22;

    /// <summary>
    /// The longest a game gets to appear while its launcher is still running.
    /// </summary>
    /// <remarks>
    /// Two minutes is the wait when nothing is running at all, which means the
    /// launch simply failed. It is far too short to be the whole answer for a
    /// launcher-based game: signing in to Riot, clearing two-factor and letting
    /// it check for a patch takes longer than that on any first visit, and the
    /// customer is sitting there doing it.
    /// <para>
    /// Bounded rather than infinite because some launchers never exit. Steam
    /// runs all day, so "wait while the launcher is alive" alone would mean a
    /// game that failed to start is waited on until the session ends.
    /// </para>
    /// </remarks>
    private static readonly TimeSpan MaxLaunchWait = TimeSpan.FromMinutes(12);

    private readonly AgentConfig _config;

    // The header and hero are painted rather than assembled from labels, so
    // what they show lives here instead of on a control.
    private TimeSpan _remaining;
    private double _remainingFraction = 1;

    /// <summary>
    /// An unlimited membership, where there is no time to show.
    /// </summary>
    /// <remarks>
    /// The session still has a deadline - a member who walks out must not leave
    /// a PC open all night - but it is a backstop, not time the customer is
    /// spending. Showing it would be the machine calling the café a liar about
    /// the plan it just sold.
    /// </remarks>
    private bool _openEnded;

    /// <summary>Says this session has no clock worth showing.</summary>
    public void SetOpenEnded(bool openEnded)
    {
        if (_openEnded == openEnded)
        {
            return;
        }

        _openEnded = openEnded;
        Invalidate();
    }
    private TimeSpan _sessionLength = TimeSpan.Zero;
    private Panel _hero = null!;

    private Process? _runningProcess;
    private TaskbarStrip _taskbar = null!;
    private Label _statusLabel = null!;

    // Name-based watching, used when a game runs as a different process than the
    // one launched. See GameEntry.ProcessName.
    private System.Windows.Forms.Timer? _watchTimer;
    private string? _watchedProcessName;
    private DateTime _watchStartedUtc;
    private bool _watchedProcessSeen;

    /// <summary>
    /// Consecutive two-second checks in which the game has not answered
    /// Windows, and whether the customer has been shown a way out because of it.
    /// </summary>
    private int _notRespondingTicks;
    private bool _showingStuckGameRescue;

    // What was last started, for the "is it really running?" check and so the
    // customer is told which game is in the way rather than just "a game".
    private string? _currentGameName;

    /// <summary>
    /// Exe names of applications the customer opened from the menu.
    /// </summary>
    /// <remarks>
    /// Not tracked to wait on — an app is never "the running game". Kept only
    /// so that time running out closes Steam and the browser too; otherwise a
    /// paid session could end with a usable browser still on screen.
    /// </remarks>
    private readonly List<string> _openedApps = new();
    private string? _launchedExeName;
    private bool _waitingOnLauncher;
    private bool _playingHiddenOverlay;

    public GameMenuForm(AgentConfig config)
    {
        _config = config;
        InitializeWindowBehaviour();
        BuildLayout();
    }

    public bool IsGameRunning => _runningProcess is not null || _watchedProcessName is not null;

    /// <summary>Process names that belong to the game currently in play.</summary>
    public IReadOnlyList<string> GetActiveProcessNames()
    {
        var names = new List<string>();

        if (!string.IsNullOrWhiteSpace(_watchedProcessName))
        {
            names.Add(_watchedProcessName);
        }

        if (!string.IsNullOrWhiteSpace(_launchedExeName))
        {
            names.Add(_launchedExeName);
        }

        var process = _runningProcess;
        if (process is not null)
        {
            try
            {
                if (!process.HasExited)
                {
                    names.Add(process.ProcessName);
                }
            }
            catch (InvalidOperationException)
            {
                // Process already gone.
            }
        }

        return names;
    }

    /// <summary>Display name of the game the customer is playing, if any.</summary>
    public string? CurrentGameName => _currentGameName;

    /// <summary>
    /// Brings the running game back to the foreground after a popup stole focus.
    /// </summary>
    public bool TryRestoreGameForeground()
    {
        if (!IsGameRunning)
        {
            return false;
        }

        var restored = GameWindowFocus.TryBringToFront(GetActiveProcessNames());
        if (restored)
        {
            ApplyPlayingHiddenOverlay();
        }

        return restored;
    }

    /// <summary>
    /// Whether the game process owns the foreground window right now.
    /// </summary>
    /// <summary>
    /// Whether the customer is currently being offered a way out of a frozen
    /// game, so nothing else offers to send them back into it.
    /// </summary>
    public bool IsOfferingStuckGameExit => _showingStuckGameRescue;

    public bool IsGameForeground()
    {
        return GameWindowFocus.IsAnyProcessForeground(GetActiveProcessNames());
    }

    private void InitializeWindowBehaviour()
    {
        FormBorderStyle = FormBorderStyle.None;
        Bounds = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        TopMost = true;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Background;
        Text = "BookMyGame — Choose a game";

        // Same fallback as the lock screen: if the keyboard hook failed to
        // install, the dev chords must still work from here or a session with a
        // game menu on screen would be unexitable.
        KeyPreview = true;
        KeyDown += (_, e) =>
        {
            if (DevChords.Match(e) is not { } chord)
            {
                return;
            }

            e.Handled = true;
            DevChordPressed?.Invoke(this, chord);
        };
    }

    /// <summary>
    /// Paints the page background instead of the flat fill.
    /// </summary>
    /// <remarks>
    /// In OnPaintBackground rather than OnPaint so that child controls with a
    /// transparent background composite against it — WinForms builds their
    /// backdrop from the parent's background pass, not its foreground one.
    /// </remarks>
    protected override void OnPaintBackground(PaintEventArgs e)
    {
        Arena.PaintArena(e.Graphics, ClientRectangle);
    }

    private void BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 4,
            BackColor = Color.Transparent,
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, TaskbarStrip.PreferredHeight));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildTileArea(), 0, 1);
        root.Controls.Add(BuildTaskbar(), 0, 2);
        root.Controls.Add(BuildFooter(), 0, 3);

        Controls.Add(root);
    }

    /// <summary>
    /// The strip of open windows along the bottom of the menu.
    /// </summary>
    /// <remarks>
    /// Put here, on the menu itself, rather than floating over everything.
    /// A bar that stayed on top during play would be a strip of this agent's
    /// pixels across a fullscreen game, and it is only needed at the moment the
    /// customer is looking at this screen wondering where their game went.
    /// </remarks>
    private Control BuildTaskbar()
    {
        _taskbar = new TaskbarStrip { Dock = DockStyle.Fill };

        _taskbar.WindowActivated += (_, window) => SwitchToWindow(window);
        _taskbar.WindowClosed += (_, window) =>
        {
            _statusLabel.Text = $"Closing {window.Title}…";
            _statusLabel.ForeColor = Palette.TextMuted;
        };

        return _taskbar;
    }

    /// <summary>
    /// Brings a window the customer picked from the strip to the front.
    /// </summary>
    /// <remarks>
    /// This is the manual way out of the problem the foreground watch is meant
    /// to handle automatically: a game that started but never came forward. The
    /// watch has to guess which window matters and when, and has been wrong
    /// about it more than once. A customer pointing at the thing they want
    /// cannot be wrong about it.
    /// </remarks>
    private void SwitchToWindow(RunningWindow window)
    {
        // This menu is deliberately above everything else on the screen.
        // Nothing the customer picks can come forward while it stays that way.
        TopMost = false;

        if (!RunningWindows.Activate(window))
        {
            AgentLog.Warn($"Could not bring '{window.Title}' to the front.");
            _statusLabel.Text = $"{window.Title} did not come forward. Tap it again.";
            _statusLabel.ForeColor = Palette.Accent;
            return;
        }

        AgentLog.Info($"Customer switched to '{window.Title}' from the taskbar.");
        _statusLabel.Text = $"Switched to {window.Title}.";
        _statusLabel.ForeColor = Palette.TextMuted;

        // Only the game gets the menu hidden out from under it. Everything else
        // — a launcher, a browser — sits in front of a menu that stays opaque,
        // which is what keeps the desktop covered while they use it.
        if (BelongsToRunningGame(window))
        {
            StepAsideForGame();
        }
    }

    private bool BelongsToRunningGame(RunningWindow window)
    {
        if (!IsGameRunning || string.IsNullOrWhiteSpace(window.ProcessName))
        {
            return false;
        }

        foreach (var name in GetActiveProcessNames())
        {
            if (string.Equals(name, window.ProcessName, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Polls for open windows only while this menu can actually be seen.
    /// </summary>
    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        _taskbar?.SetActive(Visible && !_playingHiddenOverlay);
    }

    /// <summary>
    /// Café, station, and how long is left.
    /// </summary>
    /// <remarks>
    /// The countdown is the second-largest thing on this screen on purpose: it
    /// is what a customer keeps glancing at, and it used to be a line of text
    /// in the corner. Set in Consolas so the digits hold their column and the
    /// number does not shuffle sideways every second.
    /// </remarks>
    private Control BuildHeader()
    {
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 112,
            BackColor = Color.Transparent,
        };

        header.Paint += (_, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            using var rule = new Pen(Color.FromArgb(18, 255, 255, 255));
            g.DrawLine(rule, 0, header.Height - 1, header.Width, header.Height - 1);

            var clockFont = Arena.Mono(34f);
            var labelFont = Arena.Display(11f, FontStyle.Bold);
            var nameFont = Arena.Display(15f, FontStyle.Bold);
            var stationFont = Arena.Display(11f, FontStyle.Bold);

            var middle = header.Height / 2f;
            var left = 46f;

            // The countdown leads, because it is the thing a customer looks up
            // to check. Everything else on this bar is a label for it.
            var text = _openEnded ? "UNLIMITED" : FormatRemaining();
            var urgent = !_openEnded && _remaining > TimeSpan.Zero && _remaining.TotalMinutes <= 5;

            if (_openEnded)
            {
                // Set in the display face rather than the clock face: it is a
                // word, and Consolas at clock size makes a word look like a
                // reading from an instrument.
                var wordFont = Arena.Heavy(26f);

                using (var lime = new SolidBrush(Palette.Accent))
                {
                    g.DrawString(text, wordFont, lime, left, middle - wordFont.Height / 2f);
                }

                left += g.MeasureString(text, wordFont).Width + 12f;

                Theme.DrawTracked(g, "MEMBERSHIP", labelFont, Palette.TextMuted, left, middle - labelFont.Height / 2f + 4f, 4.4f);
                left += Theme.MeasureTracked(g, "MEMBERSHIP", labelFont, 4.4f) + 30f;
            }
            else if (text.Length > 0)
            {
                using (var brush = new SolidBrush(urgent ? Palette.Accent : Palette.TextPrimary))
                {
                    g.DrawString(text, clockFont, brush, left, middle - clockFont.Height / 2f);
                }

                left += g.MeasureString(text, clockFont).Width + 10f;

                Theme.DrawTracked(g, "LEFT", labelFont, Palette.TextMuted, left, middle - labelFont.Height / 2f + 4f, 4.4f);
                left += Theme.MeasureTracked(g, "LEFT", labelFont, 4.4f) + 30f;
            }

            // The café and this machine, on the right where they are available
            // without being in the way.
            var right = header.Width - 46f;

            var station = _config.StationId.ToUpperInvariant();
            var stationWidth = Theme.MeasureTracked(g, station, stationFont, 3f);
            Theme.DrawTracked(g, station, stationFont, Palette.TextFaint, right - stationWidth, middle + 2f, 3f);

            var cafe = (_config.CafeName ?? string.Empty).Trim().ToUpperInvariant();
            if (cafe.Length > 0)
            {
                var cafeWidth = Theme.MeasureTracked(g, cafe, nameFont, 4.4f);
                Theme.DrawTracked(g, cafe, nameFont, Palette.TextPrimary, right - cafeWidth, middle - nameFont.Height, 4.4f);
                right -= Math.Max(cafeWidth, stationWidth) + 34f;
            }
            else
            {
                right -= stationWidth + 34f;
            }

            // The rail between them, draining left to right. A bar is easier to
            // read at a glance than digits are: nobody has to work out what
            // fraction of two hours is left.
            if (text.Length == 0 || right <= left)
            {
                return;
            }

            var railWidth = right - left;
            var railTop = middle - 2.5f;

            using (var track = new SolidBrush(Color.FromArgb(22, 255, 255, 255)))
            {
                g.FillRectangle(track, left, railTop, railWidth, 5f);
            }

            var filled = _openEnded
                ? railWidth
                : (float)Math.Max(0, Math.Min(1, _remainingFraction)) * railWidth;

            if (filled <= 0)
            {
                return;
            }

            using (var fill = new System.Drawing.Drawing2D.LinearGradientBrush(
                       new RectangleF(left, railTop, filled, 5f),
                       Palette.AccentDeep,
                       Palette.Accent,
                       System.Drawing.Drawing2D.LinearGradientMode.Horizontal))
            {
                g.FillRectangle(fill, left, railTop, filled, 5f);
            }

            // The head of the bar, so the eye finds where it has got to.
            using (var head = new SolidBrush(Palette.TextPrimary))
            {
                g.FillRectangle(head, left + filled - 2f, railTop - 4f, 4f, 13f);
            }
        };

        return header;
    }

    private string FormatRemaining()
    {
        if (_remaining <= TimeSpan.Zero)
        {
            // An unbounded session has nothing meaningful to count down.
            return string.Empty;
        }

        return _remaining.TotalHours >= 1
            ? $"{(int)_remaining.TotalHours}:{_remaining.Minutes:00}:{_remaining.Seconds:00}"
            : $"{_remaining.Minutes:00}:{_remaining.Seconds:00}";
    }

    /// <summary>
    /// Refuses every close this agent did not ask for.
    /// </summary>
    /// <remarks>
    /// Alt+F4, the taskbar and Windows shutting applications down all arrive
    /// here. None of them should be able to take the menu off the screen while
    /// a session is running, because there is nothing behind it but the
    /// desktop this agent exists to hide.
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

    /// <summary>Updates the countdown shown in the header.</summary>
    public void UpdateRemaining(TimeSpan remaining)
    {
        _remaining = remaining;

        // The longest the session has been seen to have left, which is what the
        // bar drains against. Taken from the first tick rather than from the
        // unlock, because a resumed session starts part-way through and a bar
        // measured from its full length would begin half empty.
        if (remaining > _sessionLength)
        {
            _sessionLength = remaining;
        }

        _remainingFraction = _sessionLength > TimeSpan.Zero
            ? remaining.TotalSeconds / _sessionLength.TotalSeconds
            : 0;

        // Only the header, not the whole screen: this fires every second, and
        // repainting a wall of cover art once a second is a stutter the
        // customer sees while they are choosing.
        if (Controls.Count > 0)
        {
            Invalidate(new Rectangle(0, 0, Width, 92));
        }
    }

    private Control BuildTileArea()
    {
        // AutoScroll so a long game list stays reachable rather than being
        // clipped off the bottom of the screen with no way to see it.
        var scrollHost = new Panel
        {
            Dock = DockStyle.Fill,
            AutoScroll = true,
            BackColor = Color.Transparent,
        };

        var flow = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Location = new Point(48, 8),
            BackColor = Color.Transparent,
        };

        // Section headings are full-width, so the flow wraps them onto their own
        // row; the flow break after each one starts its tiles on a fresh line.
        var headings = new List<Control>();

        void SizeFlow()
        {
            var width = Math.Max(scrollHost.ClientSize.Width - 72, 400);
            flow.MaximumSize = new Size(width, 0);
            flow.Width = width;

            foreach (var heading in headings)
            {
                heading.Width = width - 24;
            }
        }

        var onMenu = _config.Games.Where(GameDiscovery.IsMenuItem).ToList();
        var games = onMenu.Where(game => !GameDiscovery.IsApp(game)).ToList();
        var apps = onMenu.Where(GameDiscovery.IsApp).ToList();

        void AddSection(string title, string subtitle, List<GameEntry> items, bool isFirst)
        {
            // A heading over nothing reads as a section that failed to load.
            if (items.Count == 0)
            {
                return;
            }

            // Only worth labelling when there is something to tell apart. One
            // group on its own already has the screen's own title above it.
            if (games.Count > 0 && apps.Count > 0)
            {
                var heading = BuildSectionHeading(title, subtitle, isFirst);
                headings.Add(heading);
                flow.Controls.Add(heading);
                flow.SetFlowBreak(heading, true);
            }

            foreach (var item in items)
            {
                flow.Controls.Add(BuildTile(item));
            }
        }

        if (onMenu.Count == 0)
        {
            flow.Controls.Add(new Label
            {
                Text = "No games available on this PC.\n"
                     + "Add them in the dashboard, then check they are installed here.",
                Font = new Font("Segoe UI", 13f, FontStyle.Regular),
                ForeColor = Palette.TextMuted,
                AutoSize = true,
                Margin = new Padding(4, 20, 4, 4),
            });
        }
        else
        {
            AddSection("GAMES", "Pick one to start playing", games, isFirst: true);
            AddSection("APPS", "Launchers and the browser", apps, isFirst: games.Count == 0);
        }

        scrollHost.Controls.Add(flow);
        scrollHost.Resize += (_, _) => SizeFlow();
        SizeFlow();
        return scrollHost;
    }

    /// <summary>
    /// A "GAMES" / "APPS" heading spanning the width of the tile area.
    /// </summary>
    /// <remarks>
    /// Full width on purpose: the flow panel wraps anything that will not fit
    /// beside a tile, which is what puts the heading on a row of its own.
    /// </remarks>
    private static Control BuildSectionHeading(string title, string subtitle, bool isFirst)
    {
        var heading = new Panel
        {
            Height = 46,
            // The first heading sits just under the screen title, so it needs
            // far less air above it than one following a row of tiles.
            Margin = new Padding(12, isFirst ? 4 : 26, 12, 8),
            BackColor = Color.Transparent,
        };

        heading.Paint += (_, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

            // Heavy, uppercase, and set on the same baseline as a hairline that
            // runs out to the caption on the right. The three read as one band,
            // so the tiles below group under it rather than floating.
            var titleFont = Arena.Heavy(20f);
            var text = title.ToUpperInvariant();
            var baseline = 10f;

            using (var cream = new SolidBrush(Palette.TextPrimary))
            {
                g.DrawString(text, titleFont, cream, 0f, baseline);
            }

            var titleWidth = g.MeasureString(text, titleFont).Width;

            var captionFont = Arena.Mono(9f, FontStyle.Regular);
            var caption = subtitle.ToUpperInvariant();
            var captionWidth = Theme.MeasureTracked(g, caption, captionFont, 2.6f);

            var ruleLeft = titleWidth + 22f;
            var ruleRight = heading.Width - captionWidth - 22f;
            var middle = baseline + titleFont.Height / 2f;

            if (ruleRight > ruleLeft)
            {
                using var rule = new Pen(Color.FromArgb(31, 242, 240, 234));
                g.DrawLine(rule, ruleLeft, middle, ruleRight, middle);
            }

            Theme.DrawTracked(
                g,
                caption,
                captionFont,
                Color.FromArgb(89, 242, 240, 234),
                heading.Width - captionWidth,
                middle - captionFont.Height / 2f,
                2.6f);
        };

        // Repaint on resize or the rule keeps the width it was first drawn at.
        heading.Resize += (_, _) => heading.Invalidate();

        return heading;
    }

    /// <summary>
    /// Which launcher a game came from, as a colour.
    /// </summary>
    /// <remarks>
    /// A wall of dark tiles all look alike, and the icon is often the only
    /// thing that differs - which is why "the icons are not clear" kept coming
    /// back. A coloured top edge per launcher lets somebody pick out the Steam
    /// ones without reading a word.
    /// </remarks>
    private static Color EdgeFor(GameEntry game)
    {
        var source = (game.ExePath ?? string.Empty).ToLowerInvariant();

        if (source.Contains("steam")) return Color.FromArgb(0x38, 0xBD, 0xF8);
        if (source.Contains("epic") || source.Contains("fortnite")) return Color.FromArgb(0xA8, 0x55, 0xF7);
        if (source.Contains("riot") || source.Contains("valorant")) return Palette.Accent;
        if (source.Contains("xbox") || source.Contains("gamingservices")) return Color.FromArgb(0x22, 0xC5, 0x5E);
        if (source.Contains("rockstar")) return Color.FromArgb(0xF9, 0x73, 0x16);
        if (source.Contains("battle.net") || source.Contains("blizzard")) return Color.FromArgb(0x60, 0xA5, 0xFA);
        if (source.Contains("ubisoft") || source.Contains("upc")) return Color.FromArgb(0x22, 0xD3, 0xEE);

        return Color.FromArgb(0x47, 0x55, 0x69);
    }

    /// <summary>
    /// One game, as a tall cover rather than an icon in an empty square.
    /// </summary>
    /// <remarks>
    /// The old tile was 210x232 with a 96px icon floating in the middle of it,
    /// so most of the tile was nothing and every game looked like every other
    /// game. Here the picture fills the block and the name sits on solid ground
    /// at the bottom, which is how a console dashboard does it and why one is
    /// scannable at a glance.
    /// <para>
    /// Designed to work with no picture at all: where Windows gives up no art,
    /// the block keeps its launcher colour and its name, which is still more
    /// than the old empty square managed.
    /// </para>
    /// </remarks>
    private Control BuildTile(GameEntry game)
    {
        const int width = 202;
        const int height = 196;
        const int artTop = 38;
        const int artBottom = 142;

        var edge = EdgeFor(game);

        var tile = new Panel
        {
            Width = width,
            Height = height,
            Margin = new Padding(9, 8, 9, 10),
            BackColor = Color.Transparent,
            Cursor = Cursors.Hand,
        };

        var image = LoadTileImage(game);
        var hovered = false;
        var tag = TagFor(game);

        tile.Paint += (_, e) =>
        {
            var g = e.Graphics;
            g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
            g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;

            var card = new Rectangle(0, 0, width - 1, height - 1);

            using (var shape = Theme.RoundedRect(card, 12))
            {
                // Tinted from the launcher's own colour, so a wall of tiles has
                // some variety in it even where every picture is a grey icon.
                using (var fill = new System.Drawing.Drawing2D.LinearGradientBrush(
                           new Rectangle(0, 0, width, height),
                           Color.FromArgb(hovered ? 64 : 40, edge),
                           Color.FromArgb(hovered ? 20 : 12, 242, 240, 234),
                           System.Drawing.Drawing2D.LinearGradientMode.ForwardDiagonal))
                {
                    g.FillPath(fill, shape);
                }

                using var border = new Pen(hovered ? Palette.Accent : Color.FromArgb(28, 242, 240, 234));
                g.DrawPath(border, shape);
            }

            if (image is not null)
            {
                var art = FitArt(image, new Rectangle(16, artTop, width - 32, artBottom - artTop));
                g.DrawImage(image, art);
            }

            // The name, under the picture rather than over it. Overlaid on the
            // art it needed a scrim, and a scrim over a small icon on a tinted
            // card is three greys stacked on each other.
            var nameFont = Arena.Sans(10.5f, FontStyle.Bold);
            using var name = new SolidBrush(Palette.TextPrimary);

            using var centred = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Near,
                Trimming = StringTrimming.EllipsisCharacter,
                FormatFlags = StringFormatFlags.LineLimit,
            };

            g.DrawString(game.Name, nameFont, name, new RectangleF(10, artBottom + 8, width - 20, 40), centred);

            if (tag.Length == 0)
            {
                return;
            }

            // The chip: where this one starts from. The design this came from
            // used genres, which nothing here knows - the launcher is the true
            // version of the same idea, and it tells somebody which password
            // they are about to be asked for.
            var chipFont = Arena.Mono(7.5f, FontStyle.Bold);
            var chipWidth = Theme.MeasureTracked(g, tag, chipFont, 1.6f);
            var chip = new Rectangle(12, 12, (int)chipWidth + 18, 20);

            using (var shape = Theme.RoundedRect(chip, 5))
            using (var fill = new SolidBrush(Color.FromArgb(hovered ? 235 : 190, edge)))
            {
                g.FillPath(fill, shape);
            }

            Theme.DrawTracked(g, tag, chipFont, Palette.Ink, chip.Left + 9, chip.Top + 4, 1.6f);
        };

        tile.Click += (_, _) => LaunchGame(game);
        tile.MouseEnter += (_, _) => { hovered = true; tile.Invalidate(); };
        tile.MouseLeave += (_, _) =>
        {
            if (tile.RectangleToScreen(tile.ClientRectangle).Contains(Cursor.Position))
            {
                return;
            }

            hovered = false;
            tile.Invalidate();
        };

        tile.Disposed += (_, _) => image?.Dispose();

        return tile;
    }

    /// <summary>
    /// Where a picture goes inside a tile, at a size that flatters it.
    /// </summary>
    /// <remarks>
    /// The whole of the last version's trouble. It cropped every picture to
    /// fill the block, which is right for a piece of key art and ruinous for an
    /// icon: a 48-pixel Chrome circle blown up to fill a card is a wall of
    /// blurred colour with a bit of logo in the middle, and most of what this
    /// menu can find is icons.
    /// <para>
    /// So a picture that is small or square is treated as an icon and drawn at
    /// its own scale, centred; anything large and clearly shaped - Steam's
    /// library art, which is 600 by 900 - is fitted whole into the space. Never
    /// enlarged past life size either way, because there is no such thing as a
    /// sharper icon than the one Windows handed over.
    /// </remarks>
    private static Rectangle FitArt(Image image, Rectangle box)
    {
        var isIcon =
            Math.Max(image.Width, image.Height) <= 320
            || Math.Abs(image.Width - image.Height) < image.Width * 0.15f;

        var limit = isIcon
            ? Math.Min(96, Math.Min(box.Width, box.Height))
            : Math.Min(box.Width, box.Height);

        var scale = Math.Min(limit / (float)image.Width, limit / (float)image.Height);

        if (!isIcon)
        {
            scale = Math.Min(box.Width / (float)image.Width, box.Height / (float)image.Height);
        }

        // Never past life size: an upscaled icon is a blurred icon.
        scale = Math.Min(scale, 1f);

        var w = Math.Max(1, (int)(image.Width * scale));
        var h = Math.Max(1, (int)(image.Height * scale));

        return new Rectangle(
            box.Left + (box.Width - w) / 2,
            box.Top + (box.Height - h) / 2,
            w,
            h);
    }

    /// <summary>
    /// The line under a tile: where the game came from, and what kind it is.
    /// </summary>
    /// <remarks>
    /// Both read off what is already known - the launcher out of the path the
    /// game starts from, the kind out of the category the catalogue carries -
    /// so nothing here has to be typed per game in the dashboard.
    /// </remarks>
    private static string TagFor(GameEntry game)
    {
        var path = (game.ExePath ?? string.Empty).ToLowerInvariant();

        var launcher =
            path.Contains("steam") ? "STEAM"
            : path.Contains("epic") || path.Contains("fortnite") ? "EPIC"
            : path.Contains("riot") || path.Contains("valorant") ? "RIOT"
            : path.Contains("xbox") || path.Contains("gamingservices") || path.Contains("windowsapps") ? "XBOX"
            : path.Contains("rockstar") ? "ROCKSTAR"
            : path.Contains("battle.net") || path.Contains("blizzard") ? "BATTLE.NET"
            : path.Contains("ubisoft") || path.Contains("upc") ? "UBISOFT"
            : path.Contains("minecraft") ? "MINECRAFT"
            : string.Empty;

        var kind = (game.Category ?? string.Empty).Trim().ToUpperInvariant();

        // "GAME" is the catalogue's default rather than anything anybody chose,
        // so it says nothing worth taking a line for.
        if (kind == "GAME")
        {
            kind = string.Empty;
        }

        if (launcher.Length > 0 && kind.Length > 0)
        {
            return launcher + " · " + kind;
        }

        return launcher.Length > 0 ? launcher : kind;
    }

    /// <summary>
    /// The strip along the bottom: what is happening, and the way out.
    /// </summary>
    /// <remarks>
    /// Everything on the right is placed from the footer's own width in a
    /// Resize handler, not from the form's, and that is the whole reason this
    /// works.
    /// <para>
    /// The first version anchored to the right and set an absolute Location
    /// from Bounds.Width. The form is screen-sized by then, but the footer is
    /// not: it is a couple of hundred pixels wide until the layout runs, so
    /// WinForms recorded the button as sitting far beyond its parent's right
    /// edge and faithfully kept it there when the parent grew. End session has
    /// been rendering about seventeen hundred pixels off the side of the screen
    /// ever since it was added, which is why nobody could find it.
    /// </para>
    /// </remarks>
    private Control BuildFooter()
    {
        var footer = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 78,
            BackColor = Color.Transparent,
        };

        footer.Paint += (_, e) =>
        {
            var g = e.Graphics;

            using (var ground = new SolidBrush(Color.FromArgb(8, 242, 240, 234)))
            {
                g.FillRectangle(ground, 0, 0, footer.Width, footer.Height);
            }

            using (var rule = new Pen(Color.FromArgb(31, 242, 240, 234)))
            {
                g.DrawLine(rule, 0, 0, footer.Width, 0);
            }

            // The lime tick against the status line, which is what stops the
            // two grey lines beside it reading as a disabled control.
            using (var tick = new SolidBrush(Palette.Accent))
            {
                g.FillRectangle(tick, 46, 22, 4, 34);
            }
        };

        _statusLabel = new Label
        {
            Text = "Pick a game to start playing",
            Font = Arena.Heavy(11f),
            ForeColor = Palette.TextPrimary,
            AutoSize = true,
            Location = new Point(64, 22),
        };

        footer.Controls.Add(_statusLabel);

        // Says what the button does before it is pressed. Somebody who does not
        // know their unused time comes back has no reason to press it at all,
        // and every minute they leave on the clock is a minute the café cannot
        // sell to the next person.
        var hint = new Label
        {
            Text = "FINISHED EARLY? UNUSED TIME GOES BACK TO YOUR ACCOUNT",
            Font = Arena.Mono(8f, FontStyle.Regular),
            ForeColor = Palette.TextFaint,
            AutoSize = true,
            Location = new Point(64, 46),
        };

        var endSession = new Button
        {
            Text = "END SESSION",
            Font = Arena.Display(11f, FontStyle.Bold),
            ForeColor = Palette.TextMuted,
            BackColor = Palette.Background,
            FlatStyle = FlatStyle.Flat,
            Width = 176,
            Height = 46,
            Cursor = Cursors.Hand,
            FlatAppearance = { BorderSize = 1, BorderColor = Color.FromArgb(36, 255, 255, 255) },
        };

        endSession.Click += (_, _) => EndSessionRequested?.Invoke(this, EventArgs.Empty);

        // The one that earns money, so it is the one that looks pressable. A
        // customer with ten minutes left and a match running is deciding
        // between another hour and going home, and until now the only way to
        // say "another hour" was to leave the seat and walk to the counter -
        // which plenty of them do not come back from.
        var addTime = new Button
        {
            Text = "ADD TIME",
            Font = Arena.Display(11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(0x04, 0x20, 0x1F),
            BackColor = Palette.Cyan,
            FlatStyle = FlatStyle.Flat,
            Width = 156,
            Height = 46,
            Cursor = Cursors.Hand,
            FlatAppearance = { BorderSize = 0 },
        };

        addTime.Click += (_, _) => AddTimeRequested?.Invoke(this, EventArgs.Empty);

        footer.Controls.Add(hint);
        footer.Controls.Add(endSession);
        footer.Controls.Add(addTime);

        void PlaceRightHandSide()
        {
            if (footer.Width <= 0)
            {
                return;
            }

            addTime.Left = footer.Width - 46 - addTime.Width;
            addTime.Top = (footer.Height - addTime.Height) / 2;

            endSession.Left = addTime.Left - 12 - endSession.Width;
            endSession.Top = (footer.Height - endSession.Height) / 2;

            hint.Left = 64;
            hint.Top = 46;

            // Hidden only when the buttons would sit on top of it: they are
            // the part that has to be reachable.
            hint.Visible = endSession.Left > hint.Right + 24;
        }

        footer.Resize += (_, _) => PlaceRightHandSide();
        PlaceRightHandSide();

        if (AgentSettings.AllowDevExit)
        {
            // Repeated here because the lock screen's badge is hidden for the
            // whole of a session — without this there is no on-screen reminder
            // of how to get out once a game menu is up.
            var dev = new Label
            {
                Text = "DEV BUILD — Ctrl+Shift+Alt +  K lock · L suspend · Q quit",
                Font = Arena.Sans(9f, FontStyle.Bold),
                ForeColor = Palette.Warning,
                BackColor = Palette.Border,
                AutoSize = true,
                Padding = new Padding(8, 5, 8, 5),
                Location = new Point(46, 2),
            };

            footer.Controls.Add(dev);
            dev.BringToFront();
        }

        return footer;
    }

    /// <summary>
    /// Loads the tile image, falling back to the icon embedded in the executable
    /// so a station works without anyone having to supply artwork.
    /// </summary>
    /// <summary>
    /// A stand-in picture built from the game's own name.
    /// </summary>
    /// <remarks>
    /// Better than a blank square, which a customer reads as a tile that failed
    /// rather than one whose program shipped no icon — and they will click it to
    /// find out, which is a support question either way.
    /// </remarks>
    private static Image InitialsTile(string name, int size)
    {
        var words = name.Split(new[] { ' ', '-', '_', ':' }, StringSplitOptions.RemoveEmptyEntries);

        var initials = words.Length >= 2
            ? $"{char.ToUpperInvariant(words[0][0])}{char.ToUpperInvariant(words[1][0])}"
            : name.Trim().PadRight(2).Substring(0, 2).ToUpperInvariant();

        var bitmap = new Bitmap(size, size);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

        using (var path = Theme.RoundedRect(new Rectangle(0, 0, size, size), 18))
        using (var fill = new SolidBrush(Palette.SurfaceHover))
        {
            graphics.FillPath(fill, path);
        }

        using var font = new Font("Segoe UI", size * 0.30f, FontStyle.Bold, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(Palette.AccentSoft);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
        };

        graphics.DrawString(initials, font, brush, new RectangleF(0, 0, size, size), format);

        return bitmap;
    }

    private static Image? LoadTileImage(GameEntry game)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(game.IconPath) && File.Exists(game.IconPath))
            {
                return Image.FromFile(game.IconPath);
            }

            // Before the executable's own icon, because for a Steam game that
            // executable is steam.exe - so every Steam title on the menu came
            // out wearing the same Steam logo.
            var steamArt = GameArtwork.TryLoadSteamArt(game);
            if (steamArt is not null)
            {
                return steamArt;
            }

            // The game's own executable before the one that launches it. For a
            // Steam game those differ, and the launcher's icon says nothing
            // about the game.
            if (!string.IsNullOrWhiteSpace(game.IconSourcePath))
            {
                var own = GameIcons.Extract(game.IconSourcePath);
                if (own is not null)
                {
                    return own;
                }
            }

            return GameIcons.Extract(game.ExePath);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not load icon for '{game.Name}': {ex.Message}");
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Launching
    // -----------------------------------------------------------------------

    /// <summary>
    /// Opens an application without claiming the machine the way a game does.
    /// </summary>
    /// <remarks>
    /// Apps are deliberately not exclusive. Steam is how a good half of these
    /// games start, so treating it like a game — "Steam is still open, close it
    /// first" — would block the customer from the exact thing they opened it
    /// for. The menu stands aside and stays usable.
    /// </remarks>
    private void LaunchApp(GameEntry app)
    {
        if (!LooksLikeShortcut(app.ExePath) && !IsProtocolLaunch(app.ExePath) && !File.Exists(app.ExePath))
        {
            AgentLog.Error($"Cannot open '{app.Name}': {app.ExePath} does not exist.");
            _statusLabel.Text = $"{app.Name} is not installed on this PC.";
            _statusLabel.ForeColor = Palette.Accent;
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = app.ExePath,
                Arguments = LooksLikeShortcut(app.ExePath) || IsProtocolLaunch(app.ExePath)
                    ? string.Empty
                    : app.Arguments ?? string.Empty,
                WorkingDirectory = app.WorkingDirectory
                                   ?? (LooksLikeShortcut(app.ExePath) || IsProtocolLaunch(app.ExePath)
                                       ? string.Empty
                                       : Path.GetDirectoryName(app.ExePath) ?? string.Empty),
                UseShellExecute = true,
            };

            var process = Process.Start(startInfo);
            if (process is null)
            {
                AgentLog.Error($"Process.Start returned null for '{app.Name}'.");
                _statusLabel.Text = $"Could not open {app.Name}.";
                _statusLabel.ForeColor = Palette.Accent;
                return;
            }

            // Remembered only so time running out can close it. It is not the
            // running game, and nothing here waits on it.
            var exeName = Path.GetFileNameWithoutExtension(app.ExePath);
            if (!string.IsNullOrWhiteSpace(exeName) && !_openedApps.Contains(exeName))
            {
                _openedApps.Add(exeName);
            }

            process.Dispose();
            AgentLog.Info($"Opened '{app.Name}'. The menu stays available.");

            TopMost = false;
            _statusLabel.Text = $"{app.Name} is open. Come back here to start a game.";
            _statusLabel.ForeColor = Palette.TextMuted;

            AppLaunched?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            AgentLog.Error($"Failed to open '{app.Name}': {ex.Message}");
            _statusLabel.Text = $"Could not open {app.Name}.";
            _statusLabel.ForeColor = Palette.Accent;
        }
    }

    private void LaunchGame(GameEntry game)
    {
        if (GameDiscovery.IsApp(game))
        {
            LaunchApp(game);
            return;
        }

        // Check, rather than trust, that a game really is still running.
        //
        // "A game is running" used to be believed on the strength of a flag,
        // and a click was dropped on the floor when it was set — no message, no
        // log line, nothing on screen changing. Every way of getting that flag
        // stuck therefore turned into the same report: the menu says a game is
        // running, the game is plainly not on screen, and nothing happens when
        // you click anything.
        //
        // The one that bites is a launcher-based game the customer backs out
        // of. Starting Valorant runs VALORANT.exe, which hands off to the Riot
        // Client and exits; the real process only appears once the game itself
        // loads. Close the launcher before then and it never appears, so the
        // watcher waits out its full two-minute grace period — and for those
        // two minutes every tile on the menu is dead, not just that one.
        //
        // Asking the operating system what is actually running costs a few
        // milliseconds on a click and makes the stuck state unreachable
        // regardless of which path put it there.
        if (IsGameRunning)
        {
            if (AnyGameProcessAlive())
            {
                // Clicking the game that is already running means "I cannot see
                // it" far more often than it means "start it twice". Getting out
                // of the way is what they wanted, and it is the way back if this
                // menu ever ends up in front of a game that is genuinely there.
                if (string.Equals(_currentGameName, game.Name, StringComparison.OrdinalIgnoreCase))
                {
                    AgentLog.Info($"'{game.Name}' is already running. Standing aside rather than starting it again.");
                    EnterBackgroundMode(game.Name, confirmedRunning: _watchedProcessSeen);
                    return;
                }

                var stillRunning = _currentGameName ?? "A game";
                AgentLog.Info($"'{game.Name}' not started: {stillRunning} is still running.");
                _statusLabel.Text = $"{stillRunning} is still open. Close it first, then pick a game.";
                _statusLabel.ForeColor = Palette.Accent;
                return;
            }

            AgentLog.Warn(
                $"Menu still thought '{_currentGameName ?? "a game"}' was running, but no process " +
                "of its is alive. Clearing that and starting the game the customer asked for.");
            ClearRunningState();
        }

        if (!LooksLikeShortcut(game.ExePath) && !IsProtocolLaunch(game.ExePath) && !File.Exists(game.ExePath))
        {
            AgentLog.Error($"Cannot launch '{game.Name}': {game.ExePath} does not exist.");
            _statusLabel.Text = $"{game.Name} is not installed at the configured path.";
            _statusLabel.ForeColor = Palette.Accent;
            return;
        }

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = game.ExePath,
                Arguments = LooksLikeShortcut(game.ExePath) || IsProtocolLaunch(game.ExePath)
                    ? string.Empty
                    : game.Arguments ?? string.Empty,
                WorkingDirectory = game.WorkingDirectory
                                   ?? (LooksLikeShortcut(game.ExePath) || IsProtocolLaunch(game.ExePath)
                                       ? string.Empty
                                       : Path.GetDirectoryName(game.ExePath) ?? string.Empty),
                UseShellExecute = true,
            };

            var process = Process.Start(startInfo);
            if (process is null)
            {
                AgentLog.Error($"Process.Start returned null for '{game.Name}'.");
                return;
            }

            _currentGameName = game.Name;
            // The exe we started, which for a launcher-based game is not the
            // process the game ends up running as - both are worth checking
            // before declaring nothing alive.
            _launchedExeName = Path.GetFileNameWithoutExtension(game.ExePath);

            if (string.IsNullOrWhiteSpace(game.ProcessName))
            {
                // The launched process is the game. Required for Exited to fire.
                process.EnableRaisingEvents = true;
                process.Exited += OnGameProcessExited;
                _runningProcess = process;

                AgentLog.Info($"Launched '{game.Name}' (pid {process.Id}).");
            }
            else
            {
                // The launched process hands off and exits, so watch by name
                // instead. The starter process is let go immediately — its exit
                // means nothing here.
                process.Dispose();
                StartWatchingByName(game.Name, game.ProcessName.Trim());
            }

            // A launcher-based game is not running yet, whatever the flag says,
            // so it does not claim to be. Telling a customer their game is
            // running while the screen shows them the menu is how "it says
            // Valorant is running but it is not there" starts.
            EnterBackgroundMode(game.Name, confirmedRunning: string.IsNullOrWhiteSpace(game.ProcessName));
            GameStarted?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            AgentLog.Error($"Failed to launch '{game.Name}': {ex.Message}");
            _statusLabel.Text = $"Could not start {game.Name}.";
            _statusLabel.ForeColor = Palette.Accent;
        }
    }

    /// <summary>
    /// Polls for a game that runs under a different process than the one
    /// launched.
    /// </summary>
    /// <remarks>
    /// Polling rather than an Exited event because there is no process to
    /// subscribe to yet — the game has not started when the launcher is still
    /// working. Two seconds is frequent enough that the menu returns promptly
    /// and cheap enough to be irrelevant next to a running game.
    /// </remarks>
    private void StartWatchingByName(string gameName, string processName)
    {
        _watchedProcessName = processName;
        _watchedProcessSeen = false;
        _waitingOnLauncher = false;
        _watchStartedUtc = DateTime.UtcNow;

        AgentLog.Info($"Launched '{gameName}'; watching for process '{processName}'.");

        _watchTimer?.Dispose();
        _watchTimer = new System.Windows.Forms.Timer { Interval = 2000 };
        _watchTimer.Tick += (_, _) => CheckWatchedProcess(gameName);
        _watchTimer.Start();
    }

    private void CheckWatchedProcess(string gameName)
    {
        if (_watchedProcessName is null)
        {
            StopWatching();
            return;
        }

        var running = Process.GetProcessesByName(_watchedProcessName);
        try
        {
            if (running.Length > 0)
            {
                if (!_watchedProcessSeen)
                {
                    _watchedProcessSeen = true;
                    AgentLog.Info($"'{gameName}' is now running.");
                    _statusLabel.Text = $"{gameName} is running — close it to come back here.";
                    _statusLabel.ForeColor = Palette.TextMuted;
                    ApplyPlayingHiddenOverlay();
                }

                CheckForStuckGame(gameName);
                return;
            }

            // Not running. Before the game has ever appeared this just means the
            // launcher is still working, so wait — unless it has taken so long
            // that it is not coming.
            if (!_watchedProcessSeen)
            {
                var waited = DateTime.UtcNow - _watchStartedUtc;

                if (waited < LaunchGracePeriod)
                {
                    return;
                }

                // The check the comment above always described and the code
                // never did. Starting Valorant opens the Riot client, and the
                // customer then signs in, clears two-factor and waits for a
                // patch check - none of which this could see, so after two
                // minutes it decided the launch had failed and put the menu
                // back on top. They pressed Play into a window that was no
                // longer in front, and the game started behind the kiosk.
                //
                // While the launcher is up, the customer is still starting
                // their game.
                if ((IsProcessRunning(_launchedExeName) || IsAnyLauncherRunning()) && waited < MaxLaunchWait)
                {
                    if (!_waitingOnLauncher)
                    {
                        _waitingOnLauncher = true;
                        AgentLog.Info(
                            $"'{gameName}' has not appeared yet, but its launcher is still " +
                            "running. Waiting.");
                        _statusLabel.Text = $"Sign in to start {gameName}…";
                        _statusLabel.ForeColor = Palette.TextMuted;
                    }

                    return;
                }

                AgentLog.Warn(
                    $"'{gameName}' never started a process called '{_watchedProcessName}' " +
                    $"after {waited.TotalMinutes:0} minutes, and its launcher is not running " +
                    "either. Check the processName setting for this game. Returning to the menu.");
            }
            else
            {
                AgentLog.Info($"'{gameName}' closed. Returning to menu.");
            }

            StopWatching();
            GameExited?.Invoke(this, EventArgs.Empty);
        }
        finally
        {
            foreach (var process in running)
            {
                process.Dispose();
            }
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            // Not parented to the form's component container, so it needs
            // disposing by hand or the poll would outlive the window.
            _watchTimer?.Dispose();
            _watchTimer = null;
        }

        base.Dispose(disposing);
    }

    /// <summary>
    /// Gives the customer a way out of a game that has frozen.
    /// </summary>
    /// <remarks>
    /// A frozen game is the one situation with no exit. The menu hides itself
    /// while a game is in front, and rightly so; Alt+Tab and the Windows key
    /// are blocked, and Alt+F4 - which is deliberately allowed during a game -
    /// asks a window to close politely, which is precisely what a window that
    /// has stopped listening will not do. So the customer sits in front of a
    /// still picture until their paid time runs out.
    /// <para>
    /// The menu comes back instead, with the game's own close button on the
    /// strip, which asks politely and then ends the process if it is ignored.
    /// Nothing is closed automatically: a game can stop answering for a while
    /// during a heavy load and come back perfectly well, and killing somebody's
    /// game because their PC was slow would be a far worse bug than the one
    /// this fixes. It waits <see cref="StuckGameTicks"/> checks - three
    /// quarters of a minute - and then only offers.
    /// </para>
    /// <para>
    /// Focus is deliberately left alone. Taking it would minimise a full-screen
    /// game, and this runs on the strength of a guess that is sometimes wrong.
    /// </para>
    /// </remarks>
    private void CheckForStuckGame(string gameName)
    {
        if (!GameWindowFocus.IsNotResponding(GetActiveProcessNames()))
        {
            if (_showingStuckGameRescue)
            {
                AgentLog.Info($"'{gameName}' is answering again.");
                _statusLabel.Text = $"{gameName} is running — close it to come back here.";
                _statusLabel.ForeColor = Palette.TextMuted;
                ApplyPlayingHiddenOverlay();
            }

            _notRespondingTicks = 0;
            return;
        }

        if (_showingStuckGameRescue || ++_notRespondingTicks < StuckGameTicks)
        {
            return;
        }

        _showingStuckGameRescue = true;
        AgentLog.Warn($"'{gameName}' has not answered for {StuckGameTicks * 2} seconds. Offering a way out.");

        RestoreVisibleOverlay();
        Show();
        TopMost = true;

        _statusLabel.Text = $"{gameName} has stopped responding — close it below, or wait for it.";
        _statusLabel.ForeColor = Palette.Accent;
    }

    private void StopWatching()
    {
        RestoreVisibleOverlay();

        _watchTimer?.Stop();
        _watchTimer?.Dispose();
        _watchTimer = null;
        _watchedProcessName = null;
        _watchedProcessSeen = false;
        _waitingOnLauncher = false;
        _notRespondingTicks = 0;
        _showingStuckGameRescue = false;
        _currentGameName = null;
        _launchedExeName = null;
    }

    /// <summary>
    /// Forgets whatever was last launched, without touching the game itself.
    /// </summary>
    /// <remarks>
    /// Only for the case where the processes are already gone and the menu is
    /// the last thing that has not noticed.
    /// </remarks>
    private void ClearRunningState()
    {
        RestoreVisibleOverlay();

        var process = Interlocked.Exchange(ref _runningProcess, null);
        if (process is not null)
        {
            process.Exited -= OnGameProcessExited;
            process.Dispose();
        }

        StopWatching();
    }

    /// <summary>
    /// Whether any process belonging to the last launched game is still alive.
    /// </summary>
    /// <remarks>
    /// Both names are checked because a launcher-based game has two, and which
    /// one is alive changes over the life of a session: the started exe while
    /// it is loading, the real process once it is playing. Treating either as
    /// "still running" avoids yanking a customer back to the menu mid-load.
    /// </remarks>
    private bool AnyGameProcessAlive()
    {
        var process = _runningProcess;
        if (process is not null)
        {
            try
            {
                if (!process.HasExited)
                {
                    return true;
                }
            }
            catch (InvalidOperationException)
            {
                // No process associated any more - treat as gone.
            }
        }

        return IsProcessRunning(_watchedProcessName) || IsProcessRunning(_launchedExeName);
    }

    /// <summary>
    /// Launcher processes that mean a customer is still starting their game.
    /// </summary>
    /// <remarks>
    /// Watching only the exe we started is not enough, and Valorant is the
    /// example. It is launched as RiotClientServices.exe, which bootstraps
    /// RiotClientUx.exe and does not necessarily stay — so two minutes in, with
    /// the customer still signing in, nothing we were watching was running and
    /// the launch was declared failed.
    /// <para>
    /// A family rather than one name, because the same shape applies to every
    /// launcher: the process that puts a window on screen is often not the one
    /// that was started.
    /// </para>
    /// </remarks>
    private static readonly string[] LauncherProcesses =
    {
        "RiotClientServices", "RiotClientUx", "RiotClientUxRender",
        "steam", "steamwebhelper",
        "EpicGamesLauncher",
        "Battle.net", "Agent",
        "EADesktop", "EABackgroundService", "Origin",
        "UbisoftConnect", "upc",
        "GalaxyClient",
        "MinecraftLauncher",
        "XboxPcApp", "GamingServices",
    };

    /// <summary>Whether any known launcher is on screen.</summary>
    private static bool IsAnyLauncherRunning()
    {
        foreach (var name in LauncherProcesses)
        {
            if (IsProcessRunning(name))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsProcessRunning(string? processName)
    {
        if (string.IsNullOrWhiteSpace(processName))
        {
            return false;
        }

        var found = Process.GetProcessesByName(processName);
        try
        {
            return found.Length > 0;
        }
        finally
        {
            foreach (var p in found)
            {
                p.Dispose();
            }
        }
    }

    /// <summary>Whether this starts through a protocol rather than a file.</summary>
    /// <remarks>
    /// steam:// and com.epicgames.launcher:// are how a game owned by a
    /// launcher is started when its own files are out of reach — which is the
    /// normal case on the account customers use.
    /// </remarks>
    private static bool IsProtocolLaunch(string path) =>
        path.Contains("://", StringComparison.Ordinal);

    private static bool LooksLikeShortcut(string path) =>
        path.EndsWith(".lnk", StringComparison.OrdinalIgnoreCase)
        || path.EndsWith(".url", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Fires on a thread-pool thread when the launched process ends.
    /// </summary>
    private void OnGameProcessExited(object? sender, EventArgs e)
    {
        // Cleared here and not inside BeginInvoke on purpose. This used to
        // return early when the form had no window handle, leaving the process
        // reference in place - and since that reference is what "a game is
        // running" means, the menu stayed blocked for the rest of the session
        // with no way back short of restarting the agent.
        var process = Interlocked.Exchange(ref _runningProcess, null);
        if (process is not null)
        {
            process.Exited -= OnGameProcessExited;
            process.Dispose();
        }

        _currentGameName = null;
        _launchedExeName = null;

        AgentLog.Info("Game exited. Returning to menu.");

        if (IsDisposed || !IsHandleCreated)
        {
            return;
        }

        try
        {
            BeginInvoke(new Action(() => GameExited?.Invoke(this, EventArgs.Empty)));
        }
        catch (ObjectDisposedException)
        {
            // Form went away while the game was closing; nothing to return to.
        }
    }

    /// <summary>
    /// Ends the running game, used when a session expires mid-play.
    /// </summary>
    /// <remarks>
    /// Asks politely first via CloseMainWindow so the game gets a chance to save,
    /// then forces it. Deliberately non-blocking: the caller is on its way to
    /// showing the lock screen, and waiting here would freeze the UI so the lock
    /// screen could not paint.
    /// </remarks>
    public void TerminateRunningGame()
    {
        // Apps first, and before either return below: the session is over, so
        // anything the customer opened from the menu closes with it.
        foreach (var app in _openedApps.ToArray())
        {
            TerminateByName(app);
        }

        _openedApps.Clear();

        // A game being watched by name has no Process object here, so it is
        // ended by looking its processes up first.
        var watchedName = _watchedProcessName;
        if (watchedName is not null)
        {
            StopWatching();
            TerminateByName(watchedName);
            return;
        }

        var process = Interlocked.Exchange(ref _runningProcess, null);
        if (process is null)
        {
            return;
        }

        // Detached first so the forced exit does not bounce the customer back to
        // the game menu when the session is over.
        process.Exited -= OnGameProcessExited;

        _ = Task.Run(async () =>
        {
            try
            {
                if (process.HasExited)
                {
                    return;
                }

                AgentLog.Info($"Session ended — closing game (pid {process.Id}).");
                process.CloseMainWindow();

                await Task.Delay(TimeSpan.FromSeconds(3)).ConfigureAwait(false);

                if (!process.HasExited)
                {
                    AgentLog.Warn("Game ignored the close request; killing it.");
                    process.Kill(entireProcessTree: true);
                }
            }
            catch (Exception ex)
            {
                AgentLog.Warn($"Error terminating game: {ex.Message}");
            }
            finally
            {
                process.Dispose();
            }
        });
    }

    /// <summary>
    /// Steps back so the game can come to the front, without ever revealing the
    /// desktop.
    /// </summary>
    /// <remarks>
    /// This form deliberately stays visible and fullscreen — hiding it would
    /// expose the Windows desktop behind any game that is windowed, minimised or
    /// still loading. Only <see cref="Form.TopMost"/> is dropped, so the game
    /// can sit above this while this covers everything below it.
    /// </remarks>
    private void EnterBackgroundMode(string gameName, bool confirmedRunning)
    {
        TopMost = false;

        _statusLabel.Text = confirmedRunning
            ? $"{gameName} is running — close it to come back here."
            : $"Starting {gameName}… this can take a minute.";
        _statusLabel.ForeColor = Palette.TextMuted;

        if (confirmedRunning)
        {
            ApplyPlayingHiddenOverlay();
        }
        else
        {
            RestoreVisibleOverlay();
        }
    }

    /// <summary>
    /// Makes the menu invisible and click-through while a game is in front.
    /// </summary>
    /// <remarks>
    /// Opacity 0, so the form still occupies the screen but draws nothing. That
    /// is only safe while the game is in front of it: on the primary monitor
    /// this form is the sole thing over the desktop, so an invisible one covers
    /// nothing at all. EnsureDesktopCovered above undoes this as soon as the
    /// game stops being foreground.
    /// </remarks>
    private void ApplyPlayingHiddenOverlay()
    {
        // Whatever put the menu away - the customer choosing to go back to the
        // game, a fresh launch, the game answering again - the offer to close a
        // frozen game is no longer on screen, so the wait starts over. Without
        // this, a customer who returned to a game that was still frozen would
        // never be offered the way out a second time.
        _showingStuckGameRescue = false;
        _notRespondingTicks = 0;

        if (_playingHiddenOverlay)
        {
            return;
        }

        _playingHiddenOverlay = true;
        Opacity = 0;
        WindowClickThrough.SetEnabled(this, true);
        _taskbar?.SetActive(false);
    }

    /// <summary>
    /// Puts something over the desktop again when the game is no longer in front.
    /// </summary>
    /// <remarks>
    /// While a game plays, this form is held at Opacity 0 and click-through so
    /// the customer sees only their game. On the primary screen it is the only
    /// thing between them and the desktop — ScreenBlanker deliberately skips
    /// that monitor — so "invisible" and "not covering anything" are the same
    /// state as far as a person looking at it is concerned.
    /// <para>
    /// That is fine while the game is actually in front of it, and a hole
    /// straight to the desktop the moment the game minimises, crashes, or drops
    /// out of fullscreen. Which is what a customer reported: mid-session, the
    /// screen went to the desktop instead of the game.
    /// </para>
    /// <para>
    /// Called from the foreground watch, so the gap is at most one tick.
    /// </para>
    /// </remarks>
    /// <summary>
    /// Goes transparent again so whatever the customer is using stays visible.
    /// </summary>
    /// <remarks>
    /// The other half of EnsureDesktopCovered. Without it the menu could be
    /// made opaque to hide the desktop and then never step back, leaving it
    /// over the game once the game finally came forward.
    /// </remarks>
    public void StepAsideForGame()
    {
        if (IsDisposed || !IsGameRunning)
        {
            return;
        }

        // A frozen game is still the window in front, so this would put the
        // menu away again a second and a half after it was offered as the way
        // out of that exact game.
        if (_showingStuckGameRescue)
        {
            return;
        }

        ApplyPlayingHiddenOverlay();
    }

    public void EnsureDesktopCovered()
    {
        if (IsDisposed)
        {
            return;
        }

        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        if (!Visible)
        {
            Show();
        }

        RestoreVisibleOverlay();
    }

    /// <summary>
    /// Covers the desktop without taking the screen off whatever is in front.
    /// </summary>
    /// <remarks>
    /// For the state nothing handled: a game has started, so this form went
    /// invisible to get out of its way - and then the launcher came forward
    /// instead of the game. The launcher is a window, not a screen, and the
    /// desktop was on show all around it: icons, wallpaper, Chrome, Steam, one
    /// click from a customer who has paid for a PC that is supposed to be
    /// locked to games.
    /// <para>
    /// So the menu goes opaque again and slots in immediately below the window
    /// being used. It cannot cover the launcher, because it is behind it; it
    /// cannot leak the desktop, because it is in front of that. The same holds
    /// for a browser, a crash box, or a game whose process this never
    /// recognised.
    /// </para>
    /// </remarks>
    public void CoverDesktopBehind(IntPtr foreground)
    {
        if (IsDisposed)
        {
            return;
        }

        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        if (!Visible)
        {
            Show();
        }

        RestoreVisibleOverlay();

        // Dropped before restacking, or Windows keeps this above the launcher
        // however politely it is asked to move.
        TopMost = false;

        GameWindowFocus.PlaceBehind(Handle, foreground);
    }

    private void RestoreVisibleOverlay()
    {
        // Before the early return, not after: the menu is also made visible by
        // paths that never hid it, and the strip would be a row of stale
        // buttons on every one of them.
        _taskbar?.SetActive(true);

        if (!_playingHiddenOverlay)
        {
            return;
        }

        _playingHiddenOverlay = false;
        Opacity = 1;
        WindowClickThrough.SetEnabled(this, false);
    }

    /// <summary>
    /// Shows the menu again when the game is hidden behind it.
    /// </summary>
    public void ShowReturnToGameMenu(string gameName)
    {
        RestoreVisibleOverlay();
        Show();
        TopMost = true;
        BringToFront();
        Activate();

        _statusLabel.Text = $"{gameName} is still running in the background.";
        _statusLabel.ForeColor = Palette.Accent;
    }

    /// <summary>
    /// Ends every process with the given name, politely then forcibly.
    /// </summary>
    /// <remarks>
    /// Plural because a launcher-based game often runs several: the game itself
    /// plus the launcher that started it. Leaving the launcher behind would put
    /// a window on screen that the customer could use after their time is up.
    /// </remarks>
    private static void TerminateByName(string processName)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                var processes = Process.GetProcessesByName(processName);
                if (processes.Length == 0)
                {
                    return;
                }

                AgentLog.Info($"Session ended — closing {processes.Length} '{processName}' process(es).");

                foreach (var process in processes)
                {
                    try
                    {
                        if (!process.HasExited)
                        {
                            process.CloseMainWindow();
                        }
                    }
                    catch (Exception ex)
                    {
                        AgentLog.Warn($"Could not ask '{processName}' to close: {ex.Message}");
                    }
                }

                await Task.Delay(TimeSpan.FromSeconds(3)).ConfigureAwait(false);

                foreach (var process in processes)
                {
                    try
                    {
                        if (!process.HasExited)
                        {
                            AgentLog.Warn($"'{processName}' ignored the close request; killing it.");
                            process.Kill(entireProcessTree: true);
                        }
                    }
                    catch (Exception ex)
                    {
                        AgentLog.Warn($"Could not kill '{processName}': {ex.Message}");
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }
            }
            catch (Exception ex)
            {
                AgentLog.Warn($"Error terminating '{processName}': {ex.Message}");
            }
        });
    }

    /// <summary>Re-shows the menu and puts it back on top.</summary>
    public void ShowMenu()
    {
        RestoreVisibleOverlay();
        Show();
        TopMost = false;
        TopMost = true;
        BringToFront();
        Activate();

        _statusLabel.Text = "Pick a game to start playing.";
        _statusLabel.ForeColor = Palette.TextMuted;
    }
}
