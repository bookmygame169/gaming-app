using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>
/// A command from the backend on <c>cafe/station/{station_id}/command</c>.
/// </summary>
/// <remarks>
/// Wire format, as defined in the project plan:
/// <code>
/// {"action": "unlock", "duration_seconds": 3600, "session_id": "..."}
/// {"action": "lock"}
/// {"action": "warn", "remaining_seconds": 300}
/// </code>
/// Every field is nullable because this arrives off the network from another
/// codebase — a missing or misspelled field must be a rejected command, not a
/// crash on a kiosk no one is watching.
/// </remarks>
internal sealed record StationCommand
{
    [JsonPropertyName("action")]
    public string? Action { get; init; }

    [JsonPropertyName("duration_seconds")]
    public int? DurationSeconds { get; init; }

    [JsonPropertyName("session_id")]
    public string? SessionId { get; init; }

    [JsonPropertyName("remaining_seconds")]
    public int? RemainingSeconds { get; init; }
}

/// <summary>
/// Status published back to <c>cafe/station/{station_id}/status</c>, used by the
/// backend both as a heartbeat and to confirm a lock/unlock actually happened.
/// </summary>
internal sealed record StationStatus
{
    [JsonPropertyName("station_id")]
    public required string StationId { get; init; }

    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("session_id")]
    public string? SessionId { get; init; }

    [JsonPropertyName("timestamp")]
    public required string Timestamp { get; init; }
}
