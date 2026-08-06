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
    private readonly LockedScreenForm _lockedScreen;
    private readonly GameMenuForm _gameMenu;

    private bool _exiting;

    public AgentShell(AgentConfig config)
    {
        _config = config;
        _lockService = new SystemLockService(AgentSettings.AllowDevExit);
        _mqttService = new MqttService(config);
        _lockedScreen = new LockedScreenForm(config);
        _gameMenu = new GameMenuForm(config);

        _lockService.DevExitRequested += (_, _) => Shutdown();
        _lockService.DevPassthroughToggleRequested += (_, _) => ToggleDevPassthrough();
        _lockService.DevSimulateUnlockRequested += (_, _) => SimulateUnlock();
        _lockService.DevSimulateLockRequested += (_, _) => SimulateLock();

        _lockedScreen.DevChordPressed += OnDevChordPressed;
        _gameMenu.DevChordPressed += OnDevChordPressed;

        _mqttService.UnlockRequested += OnUnlockRequested;
        _mqttService.LockRequested += (_, _) => ApplyLocked();
        _mqttService.WarnRequested += OnWarnRequested;
        _mqttService.ConnectionChanged += (_, connected) => _lockedScreen.SetConnectionState(connected);

        _gameMenu.GameStarted += (_, _) => _lockService.SetGameRunning(true);
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
        _mqttService.Start();
        _mqttService.ReportState(locked: true, sessionId: null);
    }

    // -----------------------------------------------------------------------
    // Session state
    // -----------------------------------------------------------------------

    private void OnUnlockRequested(object? sender, UnlockEventArgs e)
    {
        // NOTE: e.DurationSeconds is recorded but not yet enforced — the
        // countdown and auto-relock are SessionManager (step 5). Until then a
        // session stays open until an explicit `lock` command arrives.
        AgentLog.Info($"Unlocking station (duration {e.DurationSeconds}s, session {e.SessionId ?? "(none)"}). " +
                      "Auto-relock not implemented until step 5.");

        // Menu up before the lock screen goes down. The other order leaves a
        // frame or two with neither on screen, which shows the desktop.
        _gameMenu.ShowMenu();
        _lockedScreen.Hide();

        _mqttService.ReportState(locked: false, sessionId: e.SessionId);
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

        // Lock screen up before the menu goes down, for the same reason.
        _lockedScreen.ShowLocked(reassertTopMost: !_lockService.Passthrough);
        _gameMenu.Hide();

        _mqttService.ReportState(locked: true, sessionId: null);
    }

    private void OnGameExited()
    {
        _lockService.SetGameRunning(false);

        // Back to the menu, never the desktop — unless the session ended while
        // the game was running, in which case the lock screen is already up and
        // must stay there.
        if (_lockedScreen.Visible)
        {
            return;
        }

        _gameMenu.ShowMenu();
    }

    private static void OnWarnRequested(object? sender, int remainingSeconds)
    {
        // Parsed and logged only. The on-screen warning belongs to
        // SessionManager (step 5), which owns the countdown that decides when a
        // warning is actually due.
        AgentLog.Info($"Warn received ({remainingSeconds}s remaining). No UI until step 5.");
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

        // Releases the keyboard hook and restores the Task Manager policy.
        _lockService.Dispose();

        // Fire-and-forget: the process is ending and the broker will notice the
        // dropped TCP connection regardless.
        _ = _mqttService.DisposeAsync().AsTask();

        _gameMenu.Close();
        _lockedScreen.Close();

        ExitThread();
    }
}
