using System.Text.Json;
using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>
/// Per-machine settings loaded from <c>appsettings.json</c> beside the exe, so
/// the same binary can be deployed to every café PC and only the JSON changes.
/// </summary>
/// <remarks>
/// Note what is deliberately NOT here: <see cref="AgentSettings.AllowDevExit"/>.
/// The escape hatch stays a compile-time constant so it cannot be switched back
/// on by editing a text file on a café PC.
/// </remarks>
internal sealed class AgentConfig
{
    /// <summary>
    /// Identifies this machine. Must match the station name the website stores
    /// on bookings, which is always lower case (<c>pc-01</c>, <c>ps5-02</c>).
    /// </summary>
    /// <remarks>
    /// Case matters: MQTT topics are case-sensitive, so <c>PC-01</c> here would
    /// silently never receive commands published to <c>pc-01</c>.
    /// </remarks>
    [JsonPropertyName("stationId")]
    public string StationId { get; init; } = "pc-01";

    [JsonPropertyName("mqtt")]
    public MqttConfig Mqtt { get; init; } = new();

    [JsonPropertyName("heartbeat")]
    public HeartbeatConfig Heartbeat { get; init; } = new();

    /// <summary>
    /// Where a freshly installed agent redeems its setup code.
    /// </summary>
    /// <remarks>
    /// Lives in the committed <c>appsettings.json</c> because it is not secret —
    /// it is just the public website address, and it must be the same in every
    /// copy of the installer.
    /// </remarks>
    [JsonPropertyName("enrollUrl")]
    public string? EnrollUrl { get; init; }

    /// <summary>
    /// Whether this machine has been linked to a café yet.
    /// </summary>
    /// <remarks>
    /// Not read from JSON — set during <see cref="Load"/> based on whether
    /// <c>appsettings.Local.json</c> exists. A machine without one has never
    /// redeemed a setup code and cannot reach a broker.
    /// </remarks>
    [JsonIgnore]
    public bool IsEnrolled { get; private set; }

    /// <summary>
    /// Reporting this station's state to the website over plain HTTP.
    /// </summary>
    /// <remarks>
    /// The agent already publishes status over MQTT, but reading that needs a
    /// permanently open subscription and the site runs serverless. Posting the
    /// same state over HTTP means the dashboard can show which machines are
    /// alive without an always-on listener.
    /// <para>
    /// Optional — leave <see cref="Url"/> empty and the agent simply does not
    /// report in. Locking and unlocking are unaffected either way.
    /// </para>
    /// </remarks>
    internal sealed class HeartbeatConfig
    {
        /// <summary>e.g. https://bookmygame.co.in/api/stations/heartbeat</summary>
        [JsonPropertyName("url")]
        public string? Url { get; init; }

        /// <summary>Must match STATION_HEARTBEAT_TOKEN on the server.</summary>
        [JsonPropertyName("token")]
        public string? Token { get; init; }

        /// <summary>Which café this machine belongs to.</summary>
        [JsonPropertyName("cafeId")]
        public string? CafeId { get; init; }
    }

    /// <summary>Games offered on the menu once a session is unlocked.</summary>
    [JsonPropertyName("games")]
    public List<GameEntry> Games { get; init; } = [];

    /// <summary>
    /// Hide games this PC does not have installed. On by default.
    /// </summary>
    /// <remarks>
    /// The dashboard's list is café-wide, so a PC without a given game still
    /// received a tile for it, and clicking that tile produced an error rather
    /// than a game. See <see cref="InstalledGames"/>.
    /// <para>
    /// Set to false on a machine where detection gets it wrong; the full list
    /// comes back and a bad tile fails at launch, as it did before.
    /// </para>
    /// </remarks>
    [JsonPropertyName("showOnlyInstalledGames")]
    public bool ShowOnlyInstalledGames { get; init; } = true;

    /// <summary>
    /// Offer a browser on the game menu. On by default.
    /// </summary>
    /// <remarks>
    /// Customers who came in to browse rather than play would otherwise need a
    /// desktop, which is the thing the lock exists to prevent. See
    /// <see cref="BrowserAccess"/>.
    /// </remarks>
    [JsonPropertyName("allowBrowsing")]
    public bool AllowBrowsing { get; init; } = true;

    public AgentConfig WithGames(List<GameEntry> games) => new()
    {
        StationId = StationId,
        Games = games,
        ShowOnlyInstalledGames = ShowOnlyInstalledGames,
        AllowBrowsing = AllowBrowsing,
        EnrollUrl = EnrollUrl,
        IsEnrolled = IsEnrolled,
        Heartbeat = Heartbeat,
        Mqtt = Mqtt,
    };

    internal sealed class MqttConfig
    {
        [JsonPropertyName("host")]
        public string Host { get; init; } = "127.0.0.1";

        [JsonPropertyName("port")]
        public int Port { get; init; } = 1883;

        /// <summary>
        /// Encrypts the connection. Required by hosted brokers such as HiveMQ
        /// Cloud, which listen on 8883 and refuse plain connections.
        /// </summary>
        /// <remarks>
        /// Leave false for a Mosquitto running on the same machine during
        /// development. Set true for anything reaching over the internet —
        /// without it the broker password and every lock/unlock command travel
        /// in clear text.
        /// </remarks>
        [JsonPropertyName("useTls")]
        public bool UseTls { get; init; }

        [JsonPropertyName("username")]
        public string? Username { get; init; }

        [JsonPropertyName("password")]
        public string? Password { get; init; }
    }

    private const string FileName = "appsettings.json";
    private const string LocalFileName = "appsettings.Local.json";

    /// <summary>
    /// Optional per-machine overrides, layered on top of <c>appsettings.json</c>.
    /// </summary>
    /// <remarks>
    /// Every field is nullable: only what is present overrides the base file.
    /// This exists so broker credentials never have to be committed —
    /// <c>appsettings.Local.json</c> is git-ignored, while the shared file keeps
    /// the non-secret host and port.
    /// </remarks>
    private sealed class ConfigOverride
    {
        [JsonPropertyName("stationId")]
        public string? StationId { get; init; }

        [JsonPropertyName("mqtt")]
        public MqttOverride? Mqtt { get; init; }

        [JsonPropertyName("heartbeat")]
        public HeartbeatOverride? Heartbeat { get; init; }

        [JsonPropertyName("games")]
        public List<GameEntry>? Games { get; init; }

        internal sealed class HeartbeatOverride
        {
            [JsonPropertyName("url")]
            public string? Url { get; init; }

            [JsonPropertyName("token")]
            public string? Token { get; init; }

            [JsonPropertyName("cafeId")]
            public string? CafeId { get; init; }
        }

        internal sealed class MqttOverride
        {
            [JsonPropertyName("host")]
            public string? Host { get; init; }

            [JsonPropertyName("port")]
            public int? Port { get; init; }

            [JsonPropertyName("useTls")]
            public bool? UseTls { get; init; }

            [JsonPropertyName("username")]
            public string? Username { get; init; }

            [JsonPropertyName("password")]
            public string? Password { get; init; }
        }
    }

    /// <summary>
    /// Loads config from beside the executable, falling back to defaults if the
    /// file is missing or malformed.
    /// </summary>
    /// <remarks>
    /// Falls back rather than throwing on purpose: this agent runs unattended on
    /// a kiosk with no one to read an exception dialog. Starting with defaults
    /// leaves the PC locked and the failure written to the log, which is the
    /// safe outcome. Refusing to start would leave the PC sitting on an
    /// unprotected Windows desktop.
    /// </remarks>
    public static AgentConfig Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, FileName);

        try
        {
            if (!File.Exists(path))
            {
                AgentLog.Warn($"{FileName} not found at {path}. Using defaults.");
                return new AgentConfig();
            }

            var json = File.ReadAllText(path);
            var config = JsonSerializer.Deserialize<AgentConfig>(json);

            if (config is null)
            {
                AgentLog.Warn($"{FileName} deserialised to null. Using defaults.");
                return new AgentConfig();
            }

            config.IsEnrolled = File.Exists(Path.Combine(AppContext.BaseDirectory, LocalFileName));
            config = ApplyLocalOverrides(config);

            AgentLog.Info(
                $"Loaded config: station={config.StationId}, " +
                $"broker={config.Mqtt.Host}:{config.Mqtt.Port}, " +
                $"user={(string.IsNullOrWhiteSpace(config.Mqtt.Username) ? "(none)" : config.Mqtt.Username)}");
            return config;
        }
        catch (Exception ex)
        {
            AgentLog.Error($"Failed to read {FileName}: {ex.Message}. Using defaults.");
            return new AgentConfig();
        }
    }

    /// <summary>
    /// Writes the settings returned by a successful enrollment.
    /// </summary>
    /// <remarks>
    /// The server returns exactly the shape of <c>appsettings.Local.json</c>, so
    /// this validates it parses and stores it. Written beside the executable
    /// rather than in the user profile so the whole install stays in one folder.
    /// </remarks>
    public static bool SaveEnrollment(string responseJson, out string? error)
    {
        error = null;

        try
        {
            using var document = JsonDocument.Parse(responseJson);

            if (!document.RootElement.TryGetProperty("stationId", out var stationId)
                || string.IsNullOrWhiteSpace(stationId.GetString()))
            {
                error = "The website did not say which station this PC is.";
                return false;
            }

            var formatted = JsonSerializer.Serialize(
                document.RootElement,
                new JsonSerializerOptions { WriteIndented = true });

            File.WriteAllText(Path.Combine(AppContext.BaseDirectory, LocalFileName), formatted);
            return true;
        }
        catch (JsonException ex)
        {
            error = $"The website sent something unexpected: {ex.Message}";
            return false;
        }
        catch (Exception ex)
        {
            // Most likely the install folder is not writable, which on a café PC
            // usually means it was installed somewhere under Program Files
            // without admin rights.
            error = $"Could not save the settings: {ex.Message}";
            return false;
        }
    }

    /// <summary>
    /// Layers <c>appsettings.Local.json</c> over the loaded config, if present.
    /// </summary>
    private static AgentConfig ApplyLocalOverrides(AgentConfig config)
    {
        var path = Path.Combine(AppContext.BaseDirectory, LocalFileName);

        try
        {
            if (!File.Exists(path))
            {
                return config;
            }

            var overrides = JsonSerializer.Deserialize<ConfigOverride>(File.ReadAllText(path));
            if (overrides is null)
            {
                return config;
            }

            AgentLog.Info($"Applying overrides from {LocalFileName}.");

            return new AgentConfig
            {
                StationId = overrides.StationId ?? config.StationId,
                Games = overrides.Games ?? config.Games,
                // Carried explicitly. This initializer names every field, so a
                // setting left out here is not inherited — it silently reverts
                // to its default on exactly the machines that have a local
                // override file, which is every enrolled café PC.
                ShowOnlyInstalledGames = config.ShowOnlyInstalledGames,
                AllowBrowsing = config.AllowBrowsing,
                EnrollUrl = config.EnrollUrl,
                IsEnrolled = config.IsEnrolled,
                Heartbeat = new HeartbeatConfig
                {
                    Url = overrides.Heartbeat?.Url ?? config.Heartbeat.Url,
                    Token = overrides.Heartbeat?.Token ?? config.Heartbeat.Token,
                    CafeId = overrides.Heartbeat?.CafeId ?? config.Heartbeat.CafeId,
                },
                Mqtt = new MqttConfig
                {
                    Host = overrides.Mqtt?.Host ?? config.Mqtt.Host,
                    Port = overrides.Mqtt?.Port ?? config.Mqtt.Port,
                    UseTls = overrides.Mqtt?.UseTls ?? config.Mqtt.UseTls,
                    Username = overrides.Mqtt?.Username ?? config.Mqtt.Username,
                    Password = overrides.Mqtt?.Password ?? config.Mqtt.Password,
                },
            };
        }
        catch (Exception ex)
        {
            // Falling back to the base config would silently connect without
            // credentials, so this is worth shouting about rather than ignoring.
            AgentLog.Error($"Failed to read {LocalFileName}: {ex.Message}. Using {FileName} only.");
            return config;
        }
    }
}
