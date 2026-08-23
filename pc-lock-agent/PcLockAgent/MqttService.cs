using System.Text;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace PcLockAgent;

/// <summary>
/// The agent's only link to the backend: subscribes to lock/unlock/warn commands
/// and publishes a heartbeat.
/// </summary>
/// <remarks>
/// All broker-specific code is confined to this class, so swapping provider or
/// library later touches nothing else.
/// <para>
/// <b>Fail closed.</b> Nothing in here can unlock the PC on its own — an unlock
/// happens only on an explicit, well-formed <c>unlock</c> command. A broker that
/// is unreachable, a malformed payload, or a dropped connection all leave the
/// station locked. That is the whole point of the system: the failure mode of a
/// revenue-protection lock must never be "open".
/// </para>
/// </remarks>
internal sealed class MqttService : IAsyncDisposable
{
    /// <summary>Raised on a valid <c>unlock</c> command, carrying the paid duration in seconds (0 if unspecified).</summary>
    public event EventHandler<UnlockEventArgs>? UnlockRequested;

    /// <summary>Raised on a <c>lock</c> command.</summary>
    public event EventHandler? LockRequested;

    /// <summary>Raised on a <c>warn</c> command, carrying seconds remaining.</summary>
    public event EventHandler<int>? WarnRequested;

    /// <summary>Raised when the dashboard asks this PC to restart.</summary>
    public event EventHandler? RestartRequested;

    /// <summary>Raised when the broker connection comes up or goes down.</summary>
    public event EventHandler<bool>? ConnectionChanged;

    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);

    private readonly AgentConfig _config;
    private readonly IMqttClient _client;
    private readonly MqttClientOptions _options;
    private readonly string _commandTopic;
    private readonly string? _scopedCommandTopic;
    private readonly string _statusTopic;

    /// <summary>
    /// Set in <see cref="Start"/> rather than the constructor: WinForms only
    /// installs its SynchronizationContext once a window handle exists, so
    /// capturing it too early would leave this null and fire every event on a
    /// background thread — a cross-thread exception the moment a handler touches
    /// a control.
    /// </summary>
    private SynchronizationContext? _uiContext;

    private CancellationTokenSource? _cts;
    private Task? _connectionLoop;
    private Task? _heartbeatLoop;

    /// <summary>Last state we reported, echoed in each heartbeat.</summary>
    private volatile string _reportedStatus = "locked";
    private volatile string? _currentSessionId;

    public MqttService(AgentConfig config)
    {
        _config = config;
        _commandTopic = $"cafe/station/{config.StationId}/command";
        _scopedCommandTopic = string.IsNullOrWhiteSpace(config.Heartbeat.CafeId)
            ? null
            : $"cafe/{config.Heartbeat.CafeId}/station/{config.StationId}/command";
        _statusTopic = $"cafe/station/{config.StationId}/status";

        _client = new MqttFactory().CreateMqttClient();
        _client.ApplicationMessageReceivedAsync += OnMessageReceivedAsync;
        _client.DisconnectedAsync += OnDisconnectedAsync;

        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(config.Mqtt.Host, config.Mqtt.Port)
            // Station id doubles as client id: unique per PC, and makes the
            // broker's connection list directly readable during debugging.
            .WithClientId($"pc-lock-agent-{config.Heartbeat.CafeId ?? "cafe"}-{config.StationId}")
            .WithCleanSession();

        if (!string.IsNullOrWhiteSpace(config.Mqtt.Username))
        {
            builder = builder.WithCredentials(config.Mqtt.Username, config.Mqtt.Password ?? string.Empty);
        }

        if (config.Mqtt.UseTls)
        {
            // Certificate validation is left at the default, so a hosted
            // broker's certificate is properly checked. Do not add a
            // "trust everything" callback to work around a connection
            // problem — that would leave the link open to interception, and
            // the payload here decides whether a PC unlocks.
            builder = builder.WithTlsOptions(tls => tls.UseTls());
        }

        _options = builder.Build();
    }

    public bool IsConnected => _client.IsConnected;

    /// <summary>
    /// Begins connecting. Must be called from the UI thread — see
    /// <see cref="_uiContext"/>.
    /// </summary>
    public void Start()
    {
        if (_cts is not null)
        {
            return;
        }

        _uiContext = SynchronizationContext.Current;
        _cts = new CancellationTokenSource();
        _connectionLoop = RunConnectionLoopAsync(_cts.Token);
        _heartbeatLoop = RunHeartbeatLoopAsync(_cts.Token);

        AgentLog.Info(
            $"MQTT starting. Broker {_config.Mqtt.Host}:{_config.Mqtt.Port} " +
            $"(TLS {(_config.Mqtt.UseTls ? "on" : "off")}), subscribing to {_commandTopic}");
    }

    /// <summary>
    /// Records the state reported in subsequent heartbeats, so the backend
    /// dashboard reflects what actually happened rather than what it asked for.
    /// </summary>
    public void ReportState(bool locked, string? sessionId)
    {
        _reportedStatus = locked ? "locked" : "unlocked";
        _currentSessionId = sessionId;

        // Publish immediately rather than waiting up to 30s for the next
        // heartbeat — this doubles as the confirmation the plan asks for.
        _ = PublishStatusAsync(CancellationToken.None);
    }

    // -----------------------------------------------------------------------
    // Connection handling
    // -----------------------------------------------------------------------

    /// <summary>
    /// Keeps trying to connect for as long as the agent runs.
    /// </summary>
    /// <remarks>
    /// A plain retry loop rather than MQTTnet's ManagedClient: one less package,
    /// and the reconnect behaviour of the component that gates revenue should be
    /// explicit and readable rather than delegated.
    /// </remarks>
    private async Task RunConnectionLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (!_client.IsConnected)
                {
                    await _client.ConnectAsync(_options, ct).ConfigureAwait(false);
                    await _client.SubscribeAsync(_commandTopic, MqttQualityOfServiceLevel.AtLeastOnce, ct)
                        .ConfigureAwait(false);
                    if (_scopedCommandTopic is not null)
                    {
                        await _client.SubscribeAsync(_scopedCommandTopic, MqttQualityOfServiceLevel.AtLeastOnce, ct)
                            .ConfigureAwait(false);
                    }

                    AgentLog.Info(
                        $"Connected to broker, subscribed to {_commandTopic}" +
                        (_scopedCommandTopic is null ? "" : $" and {_scopedCommandTopic}"));
                    RaiseOnUi(() => ConnectionChanged?.Invoke(this, true));

                    // Announce current state so the backend knows this station
                    // exists and whether it is locked, without waiting 30s.
                    await PublishStatusAsync(ct).ConfigureAwait(false);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                // Expected whenever the broker is down. Logged at INFO, not
                // ERROR — during a broker outage this would otherwise fill the
                // log with identical stack traces every five seconds.
                AgentLog.Info($"Broker connect failed ({ex.GetType().Name}: {ex.Message}). Retrying in {ReconnectDelay.TotalSeconds:0}s.");
            }

            try
            {
                await Task.Delay(ReconnectDelay, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs args)
    {
        AgentLog.Warn($"Disconnected from broker: {args.Reason}. Station stays locked until reconnect.");
        RaiseOnUi(() => ConnectionChanged?.Invoke(this, false));

        // Deliberately no reconnect here — RunConnectionLoopAsync owns that, so
        // there is exactly one place doing it.
        return Task.CompletedTask;
    }

    private async Task RunHeartbeatLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(HeartbeatInterval, ct).ConfigureAwait(false);
                await PublishStatusAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                AgentLog.Info($"Heartbeat publish failed: {ex.Message}");
            }
        }
    }

    private async Task PublishStatusAsync(CancellationToken ct)
    {
        if (!_client.IsConnected)
        {
            return;
        }

        try
        {
            var status = new StationStatus
            {
                StationId = _config.StationId,
                Status = _reportedStatus,
                SessionId = _currentSessionId,
                Timestamp = DateTimeOffset.UtcNow.ToString("o"),
            };

            var message = new MqttApplicationMessageBuilder()
                .WithTopic(_statusTopic)
                .WithPayload(JsonSerializer.Serialize(status))
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            await _client.PublishAsync(message, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            AgentLog.Info($"Status publish failed: {ex.Message}");
        }
    }

    // -----------------------------------------------------------------------
    // Command handling
    // -----------------------------------------------------------------------

    /// <summary>
    /// How old a command may be and still be acted on.
    /// </summary>
    /// <remarks>
    /// Generous enough to survive a slow broker and a couple of minutes of
    /// clock drift between a Vercel function and a café PC, short enough that
    /// an unlock captured off the broker is worthless by the time anyone could
    /// replay it deliberately.
    /// </remarks>
    private static readonly TimeSpan CommandLifetime = TimeSpan.FromMinutes(5);

    /// <summary>Ids already acted on, newest last.</summary>
    private readonly Queue<string> _handledIds = new();
    private readonly HashSet<string> _handledIdSet = new(StringComparer.Ordinal);

    /// <summary>
    /// Whether this command is a replay, or too old to act on.
    /// </summary>
    /// <remarks>
    /// Both checks are skipped when the backend did not send the field. That is
    /// deliberate: code ships to Vercel the moment it is pushed and this agent
    /// updates on its own schedule, so for a while the two disagree about what
    /// a command looks like. Refusing everything unsigned during that window
    /// would lock every café PC out of being unlocked at all.
    /// </remarks>
    private bool IsStaleOrRepeated(StationCommand command)
    {
        if (command.IssuedAt is { } issuedAt)
        {
            var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(issuedAt);

            // Negative age is a clock ahead of ours, not a problem in itself.
            if (age > CommandLifetime)
            {
                AgentLog.Warn(
                    $"Ignoring a command issued {age.TotalMinutes:0} minutes ago. " +
                    "Either it was replayed or this PC's clock is wrong.");
                return true;
            }
        }

        if (command.CommandId is not { } id || string.IsNullOrWhiteSpace(id))
        {
            return false;
        }

        if (!_handledIdSet.Add(id))
        {
            AgentLog.Warn($"Ignoring command '{id}': already acted on.");
            return true;
        }

        _handledIds.Enqueue(id);

        // Bounded so a station running for months does not grow this forever.
        // Far more than a café gets through in the five minutes above.
        while (_handledIds.Count > 200)
        {
            _handledIdSet.Remove(_handledIds.Dequeue());
        }

        return false;
    }

    private Task OnMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        try
        {
            var payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);
            AgentLog.Info($"Command received: {payload}");

            // A retained command is delivered fresh on every reconnect, so a
            // retained unlock would open this PC again every time the network
            // blinked, for as long as it sat on the topic. The backend never
            // publishes with retain — this refuses one that got there anyway.
            if (args.ApplicationMessage.Retain)
            {
                AgentLog.Warn(
                    "Ignoring a RETAINED command. Nothing should ever be retained on a station's " +
                    "command topic; clear it with clear-retained.bat or this station will be " +
                    "told the same thing on every reconnect.");
                return Task.CompletedTask;
            }

            StationCommand? command;
            try
            {
                command = JsonSerializer.Deserialize<StationCommand>(payload);
            }
            catch (JsonException ex)
            {
                AgentLog.Warn($"Ignoring unparseable command: {ex.Message}");
                return Task.CompletedTask;
            }

            if (command?.Action is null)
            {
                AgentLog.Warn("Ignoring command with no action.");
                return Task.CompletedTask;
            }

            if (IsStaleOrRepeated(command))
            {
                return Task.CompletedTask;
            }

            switch (command.Action.Trim().ToLowerInvariant())
            {
                case "unlock":
                    var duration = command.DurationSeconds ?? 0;
                    AgentLog.Info($"UNLOCK session={command.SessionId ?? "(none)"} duration={duration}s");
                    RaiseOnUi(() => UnlockRequested?.Invoke(this, new UnlockEventArgs(duration, command.SessionId)));
                    break;

                case "lock":
                    AgentLog.Info("LOCK");
                    RaiseOnUi(() => LockRequested?.Invoke(this, EventArgs.Empty));
                    break;

                case "warn":
                    var remaining = command.RemainingSeconds ?? 0;
                    AgentLog.Info($"WARN remaining={remaining}s");
                    RaiseOnUi(() => WarnRequested?.Invoke(this, remaining));
                    break;

                // Whether it is safe to obey is decided by the shell, which is
                // the only part that knows if somebody is playing.
                case "restart":
                    AgentLog.Info("RESTART requested by the dashboard.");
                    RaiseOnUi(() => RestartRequested?.Invoke(this, EventArgs.Empty));
                    break;

                default:
                    AgentLog.Warn($"Unknown action '{command.Action}' ignored.");
                    break;
            }
        }
        catch (Exception ex)
        {
            // A bad message must never kill the receive loop — that would leave
            // the agent connected but deaf, which looks fine from the outside.
            AgentLog.Error($"Error handling command: {ex}");
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Marshals an event onto the UI thread.
    /// </summary>
    /// <remarks>
    /// MQTTnet raises callbacks on background threads; touching a WinForms
    /// control from one throws. Post (not Send) so the MQTT receive loop is
    /// never blocked waiting on the UI.
    /// </remarks>
    private void RaiseOnUi(Action action)
    {
        if (_uiContext is not null)
        {
            _uiContext.Post(_ => action(), null);
        }
        else
        {
            action();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_cts is not null)
        {
            await _cts.CancelAsync().ConfigureAwait(false);
        }

        // Detach before disconnecting so the teardown does not trip the
        // "connection lost" path and log a misleading warning.
        _client.DisconnectedAsync -= OnDisconnectedAsync;
        _client.ApplicationMessageReceivedAsync -= OnMessageReceivedAsync;

        try
        {
            if (_connectionLoop is not null)
            {
                await _connectionLoop.ConfigureAwait(false);
            }

            if (_heartbeatLoop is not null)
            {
                await _heartbeatLoop.ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }

        try
        {
            if (_client.IsConnected)
            {
                await _client.DisconnectAsync().ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            AgentLog.Info($"Error during MQTT disconnect: {ex.Message}");
        }

        _client.Dispose();
        _cts?.Dispose();
        _cts = null;

        AgentLog.Info("MQTT stopped.");
    }
}

internal sealed class UnlockEventArgs(int durationSeconds, string? sessionId) : EventArgs
{
    public int DurationSeconds { get; } = durationSeconds;

    public string? SessionId { get; } = sessionId;
}
