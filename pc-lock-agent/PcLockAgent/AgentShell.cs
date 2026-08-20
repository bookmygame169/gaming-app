namespace PcLockAgent;

/// <summary>
/// Owns the agent's services and screens, and holds the one piece of state that
/// matters: whether this station is locked.
/// </summary>
/// <remarks>
/// An <see cref="ApplicationContext"/> rather than a main form, because the
/// agent outlives any single window — the lock screen is hidden for the whole of
/// a paid session, and with <c>Application.Run(form)</c> that would either end
/// the process or make one form responsible for owning the other. Keeping the
/// services here also stops <see cref="LockedScreenForm"/> from turning into a
/// god object as SessionManager arrives in step 5.
/// <para>
/// No <c>MainForm</c> is set on purpose: the process exits only when
/// <see cref="ExitThread"/> is called explicitly.
/// </para>
/// </remarks>
internal sealed class AgentShell : ApplicationContext
{
    private readonly AgentConfig _config;
    private readonly SystemLockService _lockService;
    private readonly MqttService _mqttService;
    private readonly SessionManager _session;
    private readonly HeartbeatReporter _heartbeat;
    private readonly LockedScreenForm _lockedScreen;
    private readonly GameMenuForm _gameMenu;
    private readonly WarningOverlayForm _warningOverlay;
    private readonly ReturnToGamePromptForm _returnToGamePrompt;
    private readonly ScreenBlanker _screenBlanker;
    private readonly UnlockQrProvider _unlockQr;
    private readonly System.Windows.Forms.Timer _foregroundWatchTimer;

    private bool _exiting;

    public AgentShell(AgentConfig config)
    {
        _config = config;
        _lockService = new SystemLockService(AgentSettings.AllowDevExit, config.HasExitPassword);
        _mqttService = new MqttService(config);
        _session = new SessionManager();
        _heartbeat = new HeartbeatReporter(config);
        _lockedScreen = new LockedScreenForm(config);
        _gameMenu = new GameMenuForm(config);
        _warningOverlay = new WarningOverlayForm();
        _returnToGamePrompt = new ReturnToGamePromptForm();
        _screenBlanker = new ScreenBlanker();

        _foregroundWatchTimer = new System.Windows.Forms.Timer { Interval = 1500 };
        _foregroundWatchTimer.Tick += (_, _) => CheckGameForeground();

        _session.SessionExpired += (_, _) => OnSessionExpired();
        _session.WarningDue += (_, secondsRemaining) => ShowSessionWarning(secondsRemaining);
        _session.Remaining += (_, remaining) => _gameMenu.UpdateRemaining(remaining);

        // Guarded for the same reason as the warning itself: the banner never
        // takes focus, so hiding it almost never costs the game anything, and
        // grabbing the foreground "just in case" is what minimised it.
        _warningOverlay.Hidden += (_, _) => RestoreGameOnlyIfItLostFocus();

        _returnToGamePrompt.ReturnClicked += (_, _) => OnReturnToGameClicked();

        _lockService.DevExitRequested += (_, _) => Shutdown();
        _lockService.PasswordExitRequested += (_, _) => AskForExitPassword();
        _lockService.DevPassthroughToggleRequested += (_, _) => ToggleDevPassthrough();
        _lockService.DevSimulateUnlockRequested += (_, _) => SimulateUnlock();
        _lockService.DevSimulateShortSessionRequested += (_, _) => SimulateShortSession();
        _lockService.DevSimulateLockRequested += (_, _) => SimulateLock();

        // Codes are fetched only while the station is locked. One left on
        // screen during somebody's paid session would sell time on a machine
        // already in use.
        _unlockQr = new UnlockQrProvider(config);
        _unlockQr.CodeChanged += (_, image) => _lockedScreen.SetScanCode(image);

        _lockedScreen.DevChordPressed += OnDevChordPressed;
        _gameMenu.DevChordPressed += OnDevChordPressed;

        _mqttService.UnlockRequested += OnUnlockRequested;
        _mqttService.LockRequested += (_, _) => ApplyLocked();
        _mqttService.WarnRequested += OnWarnRequested;
        _mqttService.ConnectionChanged += (_, connected) => _lockedScreen.SetConnectionState(connected);

        _gameMenu.GameStarted += (_, _) =>
        {
            _lockService.SetGameRunning(true);

            // Lets a game that spans both monitors draw over the covers. They
            // stay visible underneath, so the desktop is still hidden.
            _screenBlanker.SetTopMost(false);
            _foregroundWatchTimer.Start();
        };
        _gameMenu.GameExited += (_, _) => OnGameExited();

        // An app is not a game, but the customer still needs a way to close it.
        // Alt+F4 is blocked unless something they launched is in front, and
        // without this the browser could only be closed with the mouse.
        _gameMenu.AppLaunched += (_, _) => _lockService.SetGameRunning(true);

        // Services start only once a window handle exists: both the keyboard
        // hook and the MQTT client marshal their callbacks through the WinForms
        // SynchronizationContext, which is not installed until then.
        _lockedScreen.Shown += OnLockedScreenShown;

        // Application.Run displays MainForm itself, so the window appears inside
        // the message loop rather than before it starts.
        MainForm = _lockedScreen;
    }

    private void OnLockedScreenShown(object? sender, EventArgs e)
    {
        _lockedScreen.Shown -= OnLockedScreenShown;

        _lockService.Activate();
        _screenBlanker.Show();
        _mqttService.Start();
        _heartbeat.Start();

        // A session that was still running when the agent last stopped resumes
        // here, so a crash — or someone killing the agent hoping for a fresh
        // start — does not hand out free time.
        if (_session.TryResume())
        {
            AgentLog.Info($"Restoring in-progress session with {_session.TimeRemaining.TotalMinutes:0.#} minutes left.");
            EnterUnlockedState(_session.SessionId);
        }
        else
        {
            // Starting the codes here as well as in ApplyLocked, because this is
            // the other way a station ends up locked and it is by far the more
            // common one: every boot, every watchdog restart, every reinstall.
            //
            // ApplyLocked runs on a lock command or a session expiring, so an
            // agent that started clean and was simply never told anything sat
            // there heartbeating happily and never once asked for a code. The
            // lock screen showed its no-code fallback and looked like the
            // feature had been removed.
            _unlockQr.Start();

            ReportState(locked: true, sessionId: null);
        }
    }

    // -----------------------------------------------------------------------
    // Session state
    // -----------------------------------------------------------------------

    private void OnUnlockRequested(object? sender, UnlockEventArgs e)
    {
        // No duration means no countdown, and no countdown means nothing will
        // ever re-lock this station. SessionManager already refuses to guess a
        // limit — unlocking anyway turned that refusal into a PC that stays
        // open until a human notices, which is the exact discretion this agent
        // exists to remove. Staying locked is the safe failure: staff can see
        // the station is still locked and send another unlock.
        if (e.DurationSeconds <= 0)
        {
            AgentLog.Error(
                $"Refusing to unlock for session '{e.SessionId ?? "(none)"}': the command carried no " +
                "duration_seconds, so nothing would re-lock this station. Staying locked. " +
                "The backend must always send duration_seconds.");
            return;
        }

        AgentLog.Info($"Unlocking station (duration {e.DurationSeconds}s, session {e.SessionId ?? "(none)"}).");

        // A new customer, so the browser forgets the last one. Done here rather
        // than at agent start: the agent runs for days, and it is between
        // customers that a browser needs clearing.
        BrowserAccess.ClearProfile();

        _session.Start(e.DurationSeconds, e.SessionId);
        EnterUnlockedState(e.SessionId);
    }

    private void EnterUnlockedState(string? sessionId)
    {
        // Stops asking, and clears whatever was drawn. Both matter: a code left
        // on a machine somebody has just paid for is one another customer could
        // scan to buy time on a PC already in use.
        _unlockQr.Stop();

        // Menu up before the lock screen goes down. The other order leaves a
        // frame or two with neither on screen, which shows the desktop.
        _gameMenu.ShowMenu();
        _gameMenu.UpdateRemaining(_session.TimeRemaining);
        _lockedScreen.Hide();

        ReportState(locked: false, sessionId: sessionId);
    }

    private void OnSessionExpired()
    {
        ShowSessionWarning(0);
        ApplyLocked();
    }

    private void ApplyLocked()
    {
        // Ends whatever is running first: the plan is explicit that time expiry
        // returns to the locked screen regardless of what the customer was
        // doing. Termination is asynchronous, so the lock screen still appears
        // immediately.
        // Unconditional. Applications the customer opened are closed in here
        // too, and an app is deliberately not "a running game" — guarding this
        // on IsGameRunning left a browser running behind the lock screen for
        // anyone who never started a game.
        _foregroundWatchTimer.Stop();
        _returnToGamePrompt.HidePrompt();
        _gameMenu.TerminateRunningGame();

        // Between customers, and now that the browser is actually closed the
        // delete can succeed. Doing it here as well as at unlock means the
        // previous customer's logins are gone the moment their time ends
        // rather than whenever the next one arrives.
        //
        // Off the UI thread: it waits for the browser to let go of its files,
        // and the lock screen two lines below must not wait for that. By the
        // time anyone unlocks this station again it is long finished.
        _ = Task.Run(BrowserAccess.ClearProfile);

        _lockService.SetGameRunning(false);
        _screenBlanker.SetTopMost(!_lockService.Passthrough);

        // Safe to call whether or not a countdown is running — this path is also
        // reached by an explicit lock command part-way through a session.
        _session.Stop();

        // Lock screen up before the menu goes down, for the same reason.
        _lockedScreen.ShowLocked(reassertTopMost: !_lockService.Passthrough);
        _gameMenu.Hide();

        // The screen is the only place the code is ever shown, so it starts and
        // stops with the screen rather than on a schedule of its own.
        _unlockQr.Start();

        ReportState(locked: true, sessionId: null);
    }

    /// <summary>
    /// Announces the station's state on both channels.
    /// </summary>
    /// <remarks>
    /// MQTT reaches anything subscribed to the broker; the HTTP heartbeat is what
    /// the dashboard actually reads, since a serverless site cannot hold a
    /// subscription open. Both are best-effort — neither can stop a lock or
    /// unlock from happening.
    /// </remarks>
    private void ReportState(bool locked, string? sessionId)
    {
        _mqttService.ReportState(locked, sessionId);
        _heartbeat.ReportState(locked, sessionId);
    }

    private void OnGameExited()
    {
        _foregroundWatchTimer.Stop();
        _returnToGamePrompt.HidePrompt();

        _lockService.SetGameRunning(false);
        _screenBlanker.SetTopMost(!_lockService.Passthrough);

        // Back to the menu, never the desktop — unless the session ended while
        // the game was running, in which case the lock screen is already up and
        // must stay there.
        if (_lockedScreen.Visible)
        {
            return;
        }

        // The safety net for every version of this that got it wrong.
        //
        // ShowMenu takes the foreground. That is right when the customer is
        // looking at the desktop and needs the menu back, and wrong whenever
        // anything else is on screen — a launcher they are signing into, a
        // patcher, an installer, a crash dialog. Deciding a game "exited" while
        // its launcher is still up and then stealing focus is what put people
        // back at the game selection screen mid-launch.
        //
        // So the menu is made visible either way, and only takes focus when
        // there is nothing else to take it from.
        if (GameWindowFocus.IsDesktopForeground())
        {
            _gameMenu.ShowMenu();
            return;
        }

        AgentLog.Info(
            "Game reported as exited, but something else is on screen. Showing the menu " +
            "behind it rather than taking focus.");
        _gameMenu.EnsureDesktopCovered();
    }

    /// <summary>
    /// Shows a warning the backend asked for, independently of the local countdown.
    /// </summary>
    /// <remarks>
    /// The agent warns on its own schedule, so this is not required for normal
    /// operation — it exists so the backend can warn out-of-band (for example
    /// when staff need the customer to wrap up early).
    /// </remarks>
    private void OnWarnRequested(object? sender, int remainingSeconds)
    {
        AgentLog.Info($"Warn command received ({remainingSeconds}s remaining).");
        ShowSessionWarning(remainingSeconds);
    }

    /// <summary>
    /// Puts the "time remaining" banner on screen.
    /// </summary>
    /// <remarks>
    /// The restore below is guarded, and the guard is the whole fix for a game
    /// minimising itself every time the clock was shown.
    /// <para>
    /// Restoring the game used to run unconditionally. When the game was
    /// already in front — the normal case, because the banner cannot take focus
    /// — that meant calling AttachThreadInput, BringWindowToTop and
    /// SetForegroundWindow on a window that already had the foreground. To a
    /// fullscreen game that is a focus transition arriving out of nowhere, and
    /// the usual response is to minimise and restore. So the warning did not
    /// merely appear over the game: it threw the customer out of it, mid-match,
    /// once per warning and again seven seconds later when the banner hid.
    /// </para>
    /// <para>
    /// Nothing needs restoring when nothing was taken. The call stays for the
    /// case it was written for — the game genuinely having lost the foreground
    /// — and is now skipped in the case where it was doing the damage.
    /// </para>
    /// </remarks>
    private void ShowSessionWarning(int secondsRemaining)
    {
        _warningOverlay.ShowWarning(secondsRemaining);
        RestoreGameOnlyIfItLostFocus();
    }

    private void RestoreGameOnlyIfItLostFocus()
    {
        if (!_gameMenu.IsGameRunning || _gameMenu.IsGameForeground())
        {
            return;
        }

        _gameMenu.BeginInvoke(new Action(() =>
        {
            // Checked again inside the post: the game may have come back by
            // itself between the two, and this is the call that costs a match.
            if (_gameMenu.IsGameRunning && !_gameMenu.IsGameForeground())
            {
                _gameMenu.TryRestoreGameForeground();
            }
        }));
    }

    private void CheckGameForeground()
    {
        if (!_gameMenu.IsGameRunning || _warningOverlay.Visible)
        {
            _returnToGamePrompt.HidePrompt();
            return;
        }

        if (_gameMenu.IsGameForeground())
        {
            // Step back out of the way. Without this the menu could be made
            // opaque to hide the desktop and then stay opaque over the game.
            _gameMenu.StepAsideForGame();
            _returnToGamePrompt.HidePrompt();
            return;
        }

        // Something other than the game is in front. Cover the screen only if
        // that something is the desktop.
        //
        // This used to cover whenever the watched game was not foreground,
        // which is a different question and the wrong one: starting Valorant
        // runs the Riot Client, the Riot Client is not the watched process, and
        // the menu drew itself over the launcher the customer had to sign in
        // to. Every launcher, updater, installer and crash dialog would have
        // done the same.
        if (GameWindowFocus.IsDesktopForeground())
        {
            _gameMenu.EnsureDesktopCovered();
        }

        var gameName = _gameMenu.CurrentGameName ?? "your game";
        _returnToGamePrompt.ShowForGame(gameName);
    }

    private void OnReturnToGameClicked()
    {
        if (!_gameMenu.TryRestoreGameForeground())
        {
            var gameName = _gameMenu.CurrentGameName ?? "your game";
            _gameMenu.ShowReturnToGameMenu(gameName);
        }

        _returnToGamePrompt.HidePrompt();
    }

    // -----------------------------------------------------------------------
    // Dev affordances
    // -----------------------------------------------------------------------

    private void OnDevChordPressed(object? sender, DevChord chord)
    {
        switch (chord)
        {
            case DevChord.Exit:
                Shutdown();
                break;

            case DevChord.TogglePassthrough:
                ToggleDevPassthrough();
                break;

            case DevChord.SimulateUnlock:
                SimulateUnlock();
                break;

            case DevChord.SimulateShortSession:
                SimulateShortSession();
                break;

            case DevChord.SimulateLock:
                SimulateLock();
                break;
        }
    }

    /// <summary>
    /// Drives the same path an MQTT <c>unlock</c> would, without a broker.
    /// </summary>
    private void SimulateUnlock()
    {
        AgentLog.Info("Dev chord: simulating unlock.");
        OnUnlockRequested(this, new UnlockEventArgs(3600, "dev-simulated"));
    }

    /// <summary>
    /// A 90-second session, long enough to watch the 1-minute warning fire and
    /// the station re-lock on its own without waiting out a real hour.
    /// </summary>
    private void SimulateShortSession()
    {
        AgentLog.Info("Dev chord: simulating a 90-second session.");
        OnUnlockRequested(this, new UnlockEventArgs(90, "dev-short"));
    }

    private void SimulateLock()
    {
        AgentLog.Info("Dev chord: simulating lock.");
        ApplyLocked();
    }

    private void ToggleDevPassthrough()
    {
        var enabled = !_lockService.Passthrough;
        _lockService.SetPassthrough(enabled);

        // Dropping TopMost matters as much as unblocking keys: with it still
        // set, Alt+Tabbing to a terminal would just place it behind our window.
        _lockedScreen.TopMost = !enabled;
        _gameMenu.TopMost = !enabled;
        _screenBlanker.SetTopMost(!enabled);

        if (!enabled)
        {
            var front = _lockedScreen.Visible ? (Form)_lockedScreen : _gameMenu;
            front.BringToFront();
            front.Activate();
        }

        _lockedScreen.SetPassthroughIndicator(enabled);
    }

    /// <summary>
    /// Asks for the exit password, and closes the agent if it is right.
    /// </summary>
    /// <remarks>
    /// The session is deliberately not stopped on the way out. Somebody exiting
    /// to fix a machine mid-session should not cost the customer the rest of the
    /// hour they paid for — the saved state is left alone, so restarting the
    /// agent resumes it.
    /// </remarks>
    private void AskForExitPassword()
    {
        if (_exiting || !_config.HasExitPassword)
        {
            return;
        }

        // Dropped so the dialog is not covered by our own fullscreen windows.
        var wasTopMost = _lockedScreen.TopMost;
        _lockedScreen.TopMost = false;
        _gameMenu.TopMost = false;
        _screenBlanker.SetTopMost(false);

        try
        {
            using var prompt = new ExitPasswordForm(_config.ExitPasswordHash);
            prompt.ShowDialog();

            if (prompt.Accepted)
            {
                Shutdown();
                return;
            }
        }
        finally
        {
            if (!_exiting)
            {
                _lockedScreen.TopMost = wasTopMost;
                _gameMenu.TopMost = wasTopMost;
                _screenBlanker.SetTopMost(!_lockService.Passthrough);

                var front = _lockedScreen.Visible ? (Form)_lockedScreen : _gameMenu;
                front.BringToFront();
                front.Activate();
            }
        }
    }

    private void Shutdown()
    {
        if (_exiting)
        {
            return;
        }

        _exiting = true;
        AgentLog.Info("Dev exit chord pressed. Shutting down.");

        // Both forms refuse to close on their own; this is the only thing that
        // lifts that. Set before Close() or the shutdown below is cancelled.
        _gameMenu.AllowClose = true;
        _lockedScreen.AllowClose = true;

        _foregroundWatchTimer.Stop();
        _returnToGamePrompt.HidePrompt();
        _gameMenu.TerminateRunningGame();

        // Not Stop(): that clears the saved state, and a session interrupted by
        // a restart should resume rather than be forfeited.
        _session.Dispose();
        _heartbeat.Dispose();

        // Releases the keyboard hook, restores the Task Manager policy and the
        // taskbar.
        _lockService.Dispose();

        // Fire-and-forget: the process is ending and the broker will notice the
        // dropped TCP connection regardless.
        _ = _mqttService.DisposeAsync().AsTask();

        _unlockQr.Dispose();
        _foregroundWatchTimer.Dispose();
        _screenBlanker.Dispose();
        _warningOverlay.Close();
        _returnToGamePrompt.Close();
        _gameMenu.Close();
        _lockedScreen.Close();

        ExitThread();
    }
}
