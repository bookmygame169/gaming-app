using System.Text.Json;
using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>
/// Owns the clock for a paid session: counts down, warns as time runs low, and
/// signals expiry so the station re-locks without anyone having to intervene.
/// </summary>
/// <remarks>
/// This is the piece that actually enforces payment. Everything else in the
/// agent builds the cage; without this a session runs until someone remembers to
/// send a <c>lock</c>, which is precisely the discretion the project exists to
/// remove.
/// </remarks>
internal sealed class SessionManager : IDisposable
{
    /// <summary>Raised as a warning threshold is crossed, carrying seconds remaining.</summary>
    public event EventHandler<int>? WarningDue;

    /// <summary>Raised once when paid time runs out.</summary>
    public event EventHandler? SessionExpired;

    /// <summary>Raised every second while a session is running.</summary>
    public event EventHandler<TimeSpan>? Remaining;

    /// <summary>Seconds remaining at which to warn the customer.</summary>
    private static readonly int[] WarningThresholds = [300, 60];

    private const string StateFileName = "session.json";

    private readonly string _statePath = Path.Combine(AppContext.BaseDirectory, StateFileName);
    private readonly System.Windows.Forms.Timer _timer;
    private readonly HashSet<int> _firedWarnings = [];

    private DateTimeOffset? _endsAtUtc;

    public SessionManager()
    {
        // A WinForms timer ticks on the UI thread, so handlers can touch forms
        // directly. One second is plenty: nothing here needs sub-second accuracy.
        _timer = new System.Windows.Forms.Timer { Interval = 1000 };
        _timer.Tick += OnTick;
    }

    public bool IsActive => _endsAtUtc is not null;

    public string? SessionId { get; private set; }

    public TimeSpan TimeRemaining
    {
        get
        {
            if (_endsAtUtc is not { } endsAt)
            {
                return TimeSpan.Zero;
            }

            var left = endsAt - DateTimeOffset.UtcNow;
            return left > TimeSpan.Zero ? left : TimeSpan.Zero;
        }
    }

    /// <summary>
    /// Starts (or replaces) the countdown for a session.
    /// </summary>
    /// <remarks>
    /// The end time is stored as a wall-clock instant rather than a tick budget,
    /// so a suspended or sleeping machine cannot be used to bank extra time — on
    /// wake the deadline has simply passed.
    /// </remarks>
    public void Start(int durationSeconds, string? sessionId)
    {
        SessionId = sessionId;
        _firedWarnings.Clear();

        if (durationSeconds <= 0)
        {
            // Left open deliberately rather than guessing a limit: cutting a
            // customer off early because the backend omitted a field would be
            // worse than the session needing a manual lock. Logged loudly
            // because it means an unbounded session, which is the exact hole
            // this system exists to close.
            AgentLog.Error(
                $"Unlock for session '{sessionId ?? "(none)"}' had no duration_seconds. " +
                "No countdown started — this station will stay unlocked until an explicit lock command. " +
                "The backend must always send duration_seconds.");

            _endsAtUtc = null;
            _timer.Stop();
            ClearPersistedState();
            return;
        }

        _endsAtUtc = DateTimeOffset.UtcNow.AddSeconds(durationSeconds);
        _timer.Start();
        PersistState();

        AgentLog.Info($"Session '{sessionId ?? "(none)"}' started: {durationSeconds}s, ends {_endsAtUtc:O}.");
    }

    /// <summary>Ends the countdown without raising <see cref="SessionExpired"/>.</summary>
    public void Stop()
    {
        if (_endsAtUtc is not null)
        {
            AgentLog.Info($"Session '{SessionId ?? "(none)"}' stopped with {TimeRemaining.TotalSeconds:0}s remaining.");
        }

        _timer.Stop();
        _endsAtUtc = null;
        SessionId = null;
        _firedWarnings.Clear();
        ClearPersistedState();
    }

    /// <summary>
    /// Restores a session that was still running when the agent last stopped.
    /// </summary>
    /// <returns>True if a session was resumed and the station should be unlocked.</returns>
    /// <remarks>
    /// Without this, killing the agent would be a way to get free time: it would
    /// restart locked, and the customer could pay again — or worse, staff could
    /// restart it to hand out an untracked session. Resuming also means a
    /// genuine crash does not cost a paying customer the rest of their hour.
    /// </remarks>
    public bool TryResume()
    {
        try
        {
            if (!File.Exists(_statePath))
            {
                return false;
            }

            var persisted = JsonSerializer.Deserialize<PersistedSession>(File.ReadAllText(_statePath));
            if (persisted is null)
            {
                ClearPersistedState();
                return false;
            }

            var left = persisted.EndsAtUtc - DateTimeOffset.UtcNow;
            if (left <= TimeSpan.Zero)
            {
                AgentLog.Info($"Found expired session '{persisted.SessionId ?? "(none)"}' on startup. Staying locked.");
                ClearPersistedState();
                return false;
            }

            SessionId = persisted.SessionId;
            _endsAtUtc = persisted.EndsAtUtc;
            _firedWarnings.Clear();
            _timer.Start();

            AgentLog.Info($"Resumed session '{SessionId ?? "(none)"}' with {left.TotalSeconds:0}s remaining.");
            return true;
        }
        catch (Exception ex)
        {
            // A corrupt state file must not strand the station unlocked or crash
            // the agent — start clean and locked.
            AgentLog.Error($"Could not read {StateFileName}: {ex.Message}. Starting locked.");
            ClearPersistedState();
            return false;
        }
    }

    private void OnTick(object? sender, EventArgs e)
    {
        if (_endsAtUtc is null)
        {
            _timer.Stop();
            return;
        }

        var remaining = TimeRemaining;
        Remaining?.Invoke(this, remaining);

        if (remaining <= TimeSpan.Zero)
        {
            AgentLog.Info($"Session '{SessionId ?? "(none)"}' expired.");

            // Cleared before signalling so a handler that re-locks cannot see a
            // session that is somehow still active.
            _timer.Stop();
            _endsAtUtc = null;
            SessionId = null;
            _firedWarnings.Clear();
            ClearPersistedState();

            SessionExpired?.Invoke(this, EventArgs.Empty);
            return;
        }

        var secondsLeft = (int)Math.Ceiling(remaining.TotalSeconds);
        foreach (var threshold in WarningThresholds)
        {
            // Fires once per threshold, and still fires if a tick was missed
            // (a busy machine can skip past the exact second).
            if (secondsLeft <= threshold && _firedWarnings.Add(threshold))
            {
                AgentLog.Info($"Warning at {threshold}s remaining.");
                WarningDue?.Invoke(this, threshold);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Persistence
    // -----------------------------------------------------------------------

    private void PersistState()
    {
        if (_endsAtUtc is not { } endsAt)
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(new PersistedSession(SessionId, endsAt));
            File.WriteAllText(_statePath, json);
        }
        catch (Exception ex)
        {
            // Non-fatal: the session still runs, it just will not survive a
            // restart. Worth knowing about, since that quietly weakens the
            // guarantee that killing the agent cannot buy free time.
            AgentLog.Warn($"Could not persist session state: {ex.Message}");
        }
    }

    private void ClearPersistedState()
    {
        try
        {
            if (File.Exists(_statePath))
            {
                File.Delete(_statePath);
            }
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not clear session state: {ex.Message}");
        }
    }

    public void Dispose()
    {
        _timer.Tick -= OnTick;
        _timer.Dispose();
    }

    private sealed record PersistedSession(
        [property: JsonPropertyName("sessionId")] string? SessionId,
        [property: JsonPropertyName("endsAtUtc")] DateTimeOffset EndsAtUtc);
}
