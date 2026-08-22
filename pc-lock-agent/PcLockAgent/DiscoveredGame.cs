using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>
/// One installed thing this PC found, on its way to the owner's dashboard.
/// </summary>
/// <remarks>
/// Deliberately not a <see cref="GameEntry"/>. A GameEntry is something the
/// menu can launch; this is a suggestion nobody has agreed to yet, and keeping
/// the two types apart is what stops a scanner's output ever being handed to
/// the menu by accident.
/// </remarks>
internal sealed record DiscoveredGame(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("exePath")] string ExePath,
    [property: JsonPropertyName("arguments")] string? Arguments,
    [property: JsonPropertyName("processName")] string? ProcessName,
    [property: JsonPropertyName("source")] string Source);
