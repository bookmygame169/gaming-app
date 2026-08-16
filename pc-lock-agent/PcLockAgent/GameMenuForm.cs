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
    private string? _launchedExeName;
    private bool _waitingOnLauncher;

    public GameMenuForm(AgentConfig config)
    {
        _config = config;
        InitializeWindowBehaviour();
        BuildLayout();
    }

    public bool IsGameRunning => _runningProcess is not null || _watchedProcessName is not null;

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
            RowCount = 3,
            BackColor = Color.Transparent,
        };
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100f));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildTileArea(), 0, 1);
        root.Controls.Add(BuildFooter(), 0, 2);

        Controls.Add(root);
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
            MaximumSize = new Size(Bounds.Width - 120, 0),
            Location = new Point(48, 8),
            BackColor = Color.Transparent,
        };

        if (_config.Games.Count == 0)
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
            foreach (var game in _config.Games)
            {
                flow.Controls.Add(BuildTile(game));
            }
        }

        scrollHost.Controls.Add(flow);
        return scrollHost;
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

    private void LaunchGame(GameEntry game)
    {
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

        if (!File.Exists(game.ExePath))
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
                Arguments = game.Arguments ?? string.Empty,
                // Many games only find their data files when started from their
                // own folder, so default to that rather than the agent's.
                WorkingDirectory = game.WorkingDirectory
                                   ?? Path.GetDirectoryName(game.ExePath)
                                   ?? string.Empty,
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
                if (IsProcessRunning(_launchedExeName) && waited < MaxLaunchWait)
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
        Show();
        TopMost = false;
        TopMost = true;
        BringToFront();
        Activate();

        _statusLabel.Text = "Pick a game to start playing.";
        _statusLabel.ForeColor = Palette.TextMuted;
    }
}
