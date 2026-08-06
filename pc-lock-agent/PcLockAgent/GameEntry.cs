using System.Text.Json.Serialization;

namespace PcLockAgent;

/// <summary>
/// One game tile on the menu, as configured in <c>appsettings.json</c>.
/// </summary>
internal sealed class GameEntry
{
    [JsonPropertyName("name")]
    public string Name { get; init; } = "Game";

    /// <summary>Full path to the executable to launch.</summary>
    [JsonPropertyName("exePath")]
    public string ExePath { get; init; } = string.Empty;

    /// <summary>
    /// Optional image for the tile. When omitted or missing, the icon embedded
    /// in the executable is used instead.
    /// </summary>
    [JsonPropertyName("iconPath")]
    public string? IconPath { get; init; }

    /// <summary>Optional command-line arguments.</summary>
    [JsonPropertyName("arguments")]
    public string? Arguments { get; init; }

    /// <summary>
    /// Optional working directory. Defaults to the executable's own folder,
    /// which many games require in order to find their data files.
    /// </summary>
    [JsonPropertyName("workingDirectory")]
    public string? WorkingDirectory { get; init; }
}
