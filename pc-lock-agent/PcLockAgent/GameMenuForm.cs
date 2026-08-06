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

    private readonly AgentConfig _config;
    private Process? _runningProcess;
    private Label _statusLabel = null!;
    private Label _remainingLabel = null!;

    public GameMenuForm(AgentConfig config)
    {
        _config = config;
        InitializeWindowBehaviour();
        BuildLayout();
    }

    public bool IsGameRunning => _runningProcess is not null;

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

        header.Controls.Add(new Label
        {
            Text = "CHOOSE A GAME",
            Font = new Font("Segoe UI", 26f, FontStyle.Bold),
            ForeColor = Palette.TextPrimary,
            AutoSize = true,
            Location = new Point(48, 34),
        });

        header.Controls.Add(new Label
        {
            Text = $"Station {_config.StationId.ToUpperInvariant()}",
            Font = new Font("Segoe UI", 11f, FontStyle.Regular),
            ForeColor = Palette.TextMuted,
            AutoSize = true,
            Location = new Point(52, 76),
        });

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
                Text = "No games configured.\nAdd them to the \"games\" list in appsettings.json.",
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
            Width = 190,
            Height = 200,
            Margin = new Padding(10),
            BackColor = Palette.Surface,
            Cursor = Cursors.Hand,
        };

        tile.Paint += (_, e) =>
        {
            using var pen = new Pen(Palette.Border, 1f);
            e.Graphics.DrawRectangle(pen, 0, 0, tile.Width - 1, tile.Height - 1);
        };

        var picture = new PictureBox
        {
            Width = 96,
            Height = 96,
            Location = new Point((tile.Width - 96) / 2, 28),
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent,
            Image = LoadTileImage(game),
            Cursor = Cursors.Hand,
        };

        var label = new Label
        {
            Text = game.Name,
            Font = new Font("Segoe UI", 12f, FontStyle.Bold),
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
            target.MouseEnter += (_, _) => tile.BackColor = Palette.SurfaceHover;
            target.MouseLeave += (_, _) =>
            {
                // Only clear the highlight once the pointer has left the tile
                // entirely — moving from the tile onto its own label would
                // otherwise flicker it off.
                if (!tile.RectangleToScreen(tile.ClientRectangle).Contains(Cursor.Position))
                {
                    tile.BackColor = Palette.Surface;
                }
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
    private static Image? LoadTileImage(GameEntry game)
    {
        try
        {
            if (!string.IsNullOrWhiteSpace(game.IconPath) && File.Exists(game.IconPath))
            {
                return Image.FromFile(game.IconPath);
            }

            if (File.Exists(game.ExePath))
            {
                using var icon = Icon.ExtractAssociatedIcon(game.ExePath);
                return icon?.ToBitmap();
            }
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
        if (_runningProcess is not null)
        {
            return;
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

            // Required for Exited to fire at all.
            process.EnableRaisingEvents = true;
            process.Exited += OnGameProcessExited;
            _runningProcess = process;

            AgentLog.Info($"Launched '{game.Name}' (pid {process.Id}).");
            EnterBackgroundMode(game.Name);
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
    /// Fires on a thread-pool thread when the launched process ends.
    /// </summary>
    private void OnGameProcessExited(object? sender, EventArgs e)
    {
        if (IsDisposed || !IsHandleCreated)
        {
            return;
        }

        try
        {
            BeginInvoke(new Action(() =>
            {
                var process = Interlocked.Exchange(ref _runningProcess, null);

                if (process is not null)
                {
                    process.Exited -= OnGameProcessExited;
                    process.Dispose();
                }

                AgentLog.Info("Game exited. Returning to menu.");
                GameExited?.Invoke(this, EventArgs.Empty);
            }));
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
    private void EnterBackgroundMode(string gameName)
    {
        TopMost = false;

        _statusLabel.Text = $"{gameName} is running — close it to come back here.";
        _statusLabel.ForeColor = Palette.TextMuted;
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
