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
    private Process? _runningProcess;
    private TaskbarStrip _taskbar = null!;
    private Label _statusLabel = null!;
    private Label _remainingLabel = null!;

    // Name-based watching, used when a game runs as a different process than the
    // one launched. See GameEntry.ProcessName.
    private System.Windows.Forms.Timer? _watchTimer;
    private string? _watchedProcessName;
    private DateTime _watchStartedUtc;
    private bool _watchedProcessSeen;

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
        Theme.PaintBackdrop(e.Graphics, ClientRectangle);
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

    private Control BuildHeader()
    {
        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 110,
            BackColor = Color.Transparent,
        };

        // Painted, not labelled: a Label cannot letter-space its text, and the
        // wide capitals are what tie this screen to the lock screen in front of
        // it. Both are drawn from the same left edge as the tiles below.
        header.Paint += (_, e) =>
        {
            using var titleFont = new Font("Segoe UI", 24f, FontStyle.Bold);
            using var kickerFont = new Font("Segoe UI", 9f, FontStyle.Regular);

            Theme.DrawTracked(e.Graphics, "CHOOSE A GAME", titleFont, Palette.TextPrimary, 48f, 30f, 7f);
            Theme.DrawTracked(e.Graphics, $"PLAYTIME  ·  STATION {_config.StationId.ToUpperInvariant()}",
                kickerFont, Palette.AccentSoft, 50f, 76f, 4f);

            using var rule = new SolidBrush(Palette.Accent);
            e.Graphics.FillRectangle(rule, 50, 98, 54, 2);
        };

        // Right-aligned countdown. Anchored so it stays pinned to the right edge
        // rather than drifting when the header is laid out.
        _remainingLabel = new Label
        {
            Text = string.Empty,
            Font = new Font("Segoe UI", 22f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            TextAlign = ContentAlignment.MiddleRight,
            AutoSize = false,
            Width = 320,
            Height = 46,
            Location = new Point(Bounds.Width - 368, 40),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
        };

        header.Controls.Add(_remainingLabel);
        return header;
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
        if (_remainingLabel is null)
        {
            return;
        }

        if (remaining <= TimeSpan.Zero)
        {
            // Blank rather than "00:00" — an unbounded session (backend sent no
            // duration) has nothing meaningful to show here.
            _remainingLabel.Text = string.Empty;
            return;
        }

        _remainingLabel.Text = remaining.TotalHours >= 1
            ? $"{(int)remaining.TotalHours}:{remaining.Minutes:00}:{remaining.Seconds:00} left"
            : $"{remaining.Minutes:00}:{remaining.Seconds:00} left";

        // Turns red for the last five minutes, matching when the warning banner
        // starts appearing.
        _remainingLabel.ForeColor = remaining.TotalMinutes <= 5 ? Palette.Accent : Palette.TextPrimary;
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
            Height = 54,
            // The first heading sits just under the screen title, so it needs
            // far less air above it than one following a row of tiles.
            Margin = new Padding(12, isFirst ? 4 : 30, 12, 10),
            BackColor = Color.Transparent,
        };

        heading.Paint += (_, e) =>
        {
            using var titleFont = new Font("Segoe UI", 12f, FontStyle.Bold);
            using var subtitleFont = new Font("Segoe UI", 9f, FontStyle.Regular);

            Theme.DrawTracked(e.Graphics, title, titleFont, Palette.TextPrimary, 0f, 4f, 4f);

            var width = Theme.MeasureTracked(e.Graphics, title, titleFont, 4f);

            // A short accent rule under the word, then a hairline carrying on to
            // the far edge — the eye reads that as one band, so the tiles below
            // group under it instead of floating.
            using var accent = new SolidBrush(Palette.Accent);
            e.Graphics.FillRectangle(accent, 0f, 27f, Math.Max(width, 28f), 2f);

            using var divider = new Pen(Palette.Border, 1f);
            var lineStart = Math.Max(width, 28f) + 14f;
            if (heading.Width > lineStart)
            {
                e.Graphics.DrawLine(divider, lineStart, 28f, heading.Width, 28f);
            }

            Theme.DrawTracked(e.Graphics, subtitle, subtitleFont, Palette.TextFaint, 0f, 36f, 1.5f);
        };

        // Repaint on resize or the rule keeps the width it was first drawn at.
        heading.Resize += (_, _) => heading.Invalidate();

        return heading;
    }

    private Control BuildTile(GameEntry game)
    {
        var tile = new Panel
        {
            Width = 210,
            Height = 232,
            Margin = new Padding(12),
            BackColor = Palette.CardFillOpaque,
            Cursor = Cursors.Hand,
        };

        Theme.RoundCorners(tile, Theme.CornerRadius);

        // Tracked on the tile rather than read back from BackColor, so the
        // border and the fill can never disagree about whether it is hovered.
        var hovered = false;

        tile.Paint += (_, e) =>
        {
            Theme.DrawBorder(
                e.Graphics,
                new Rectangle(0, 0, tile.Width, tile.Height),
                hovered ? Palette.Accent : Palette.CardBorder,
                hovered ? 2f : 1f,
                Theme.CornerRadius);
        };

        var image = LoadTileImage(game);

        if (image is null)
        {
            // Some programs genuinely carry no icon, and a game found on this
            // PC is worth offering whether or not Windows can draw it. An empty
            // square reads as a broken tile; initials read as a tile.
            image = InitialsTile(game.Name, 96);
        }

        // Real cover art is wide; an extracted program icon is square. They want
        // different room, so the tile asks the picture which it got rather than
        // forcing both into one box - a header squeezed into a 96px square is
        // unreadable, and an icon stretched across the tile is a blur.
        var isArtwork = image is not null && image.Width > image.Height * 1.4;

        var picture = new PictureBox
        {
            Width = isArtwork ? tile.Width - 28 : 96,
            Height = isArtwork ? 104 : 96,
            Location = isArtwork
                ? new Point(14, 22)
                : new Point((tile.Width - 96) / 2, 34),
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent,
            Image = image,
            Cursor = Cursors.Hand,
        };

        var label = new Label
        {
            Text = game.Name.ToUpperInvariant(),
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            TextAlign = ContentAlignment.MiddleCenter,
            Dock = DockStyle.Bottom,
            Height = 52,
            BackColor = Color.Transparent,
            Cursor = Cursors.Hand,
        };

        tile.Controls.Add(picture);
        tile.Controls.Add(label);

        // Child controls swallow mouse events, so every one of them needs the
        // same handlers or the tile only responds around its edges.
        foreach (Control target in new Control[] { tile, picture, label })
        {
            target.Click += (_, _) => LaunchGame(game);
            target.MouseEnter += (_, _) =>
            {
                hovered = true;
                tile.BackColor = Palette.SurfaceHover;
                tile.Invalidate();
            };
            target.MouseLeave += (_, _) =>
            {
                // Only clear the highlight once the pointer has left the tile
                // entirely — moving from the tile onto its own label would
                // otherwise flicker it off.
                if (tile.RectangleToScreen(tile.ClientRectangle).Contains(Cursor.Position))
                {
                    return;
                }

                hovered = false;
                tile.BackColor = Palette.CardFillOpaque;
                tile.Invalidate();
            };
        }

        return tile;
    }

    private Control BuildFooter()
    {
        var footer = new Panel
        {
            Dock = DockStyle.Bottom,
            Height = 54,
            BackColor = Color.Transparent,
        };

        _statusLabel = new Label
        {
            Text = "Pick a game to start playing.",
            Font = new Font("Segoe UI", 10f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = true,
            Location = new Point(52, 18),
        };

        footer.Controls.Add(_statusLabel);

        // Quiet on purpose. A customer looking for it will find it, and one
        // reaching for a game tile will not hit it by accident — which matters,
        // because the confirmation behind it is the only thing between a
        // mis-tap and somebody's paid session ending.
        var endSession = new Button
        {
            Text = "End session",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Palette.TextMuted,
            BackColor = Palette.Border,
            FlatStyle = FlatStyle.Flat,
            Width = 150,
            Height = 34,
            Cursor = Cursors.Hand,
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            Location = new Point(Bounds.Width - 202, 10),
            FlatAppearance = { BorderSize = 0 },
        };

        endSession.Click += (_, _) => EndSessionRequested?.Invoke(this, EventArgs.Empty);
        Theme.RoundCorners(endSession, 10);

        footer.Controls.Add(endSession);

        if (AgentSettings.AllowDevExit)
        {
            // Repeated here because the lock screen's badge is hidden for the
            // whole of a session — without this there is no on-screen reminder
            // of how to get out once a game menu is up.
            footer.Controls.Add(new Label
            {
                Text = "DEV BUILD — Ctrl+Shift+Alt +  K lock · L suspend · Q quit",
                Font = new Font("Segoe UI", 9f, FontStyle.Bold),
                ForeColor = Palette.Warning,
                BackColor = Palette.Border,
                AutoSize = true,
                Padding = new Padding(8, 5, 8, 5),
                Location = new Point(Bounds.Width - 460, 14),
            });
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

    private void StopWatching()
    {
        RestoreVisibleOverlay();

        _watchTimer?.Stop();
        _watchTimer?.Dispose();
        _watchTimer = null;
        _watchedProcessName = null;
        _watchedProcessSeen = false;
        _waitingOnLauncher = false;
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
