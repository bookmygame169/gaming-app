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
    private readonly ScreenBlanker _screenBlanker;
    private readonly UnlockQrProvider _unlockQr;

    private bool _exiting;

    public AgentShell(AgentConfig config)
    {
        _config = config;
        _lockService = new SystemLockService(AgentSettings.AllowDevExit);
        _mqttService = new MqttService(config);
        _session = new SessionManager();
        _heartbeat = new HeartbeatReporter(config);
        _lockedScreen = new LockedScreenForm(config);
        _gameMenu = new GameMenuForm(config);
        _warningOverlay = new WarningOverlayForm();
        _screenBlanker = new ScreenBlanker();

        _session.SessionExpired += (_, _) => OnSessionExpired();
        _session.WarningDue += (_, secondsRemaining) => _warningOverlay.ShowWarning(secondsRemaining);
        _session.Remaining += (_, remaining) => _gameMenu.UpdateRemaining(remaining);

        _lockService.DevExitRequested += (_, _) => Shutdown();
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
        };
        _gameMenu.GameExited += (_, _) => OnGameExited();

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
        _warningOverlay.ShowWarning(0);
        ApplyLocked();
    }

    private void ApplyLocked()
    {
        // Ends whatever is running first: the plan is explicit that time expiry
        // returns to the locked screen regardless of what the customer was
        // doing. Termination is asynchronous, so the lock screen still appears
        // immediately.
        if (_gameMenu.IsGameRunning)
        {
            _gameMenu.TerminateRunningGame();
        }

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
        _lockService.SetGameRunning(false);
        _screenBlanker.SetTopMost(!_lockService.Passthrough);

        // Back to the menu, never the desktop — unless the session ended while
        // the game was running, in which case the lock screen is already up and
        // must stay there.
        if (_lockedScreen.Visible)
        {
            return;
        }

        _gameMenu.ShowMenu();
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
        _warningOverlay.ShowWarning(remainingSeconds);
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

    private void Shutdown()
    {
        if (_exiting)
        {
            return;
        }

        _exiting = true;
        AgentLog.Info("Dev exit chord pressed. Shutting down.");

        if (_gameMenu.IsGameRunning)
        {
            _gameMenu.TerminateRunningGame();
        }

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
        _screenBlanker.Dispose();
        _warningOverlay.Close();
        _gameMenu.Close();
        _lockedScreen.Close();

        ExitThread();
    }
}
