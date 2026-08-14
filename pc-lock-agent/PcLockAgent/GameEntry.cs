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

    /// <summary>
    /// The process to actually watch, without the <c>.exe</c>, when it differs
    /// from the one launched.
    /// </summary>
    /// <remarks>
    /// Needed for anything that goes through a launcher. Starting
    /// <c>VALORANT.exe</c> hands off to the Riot Client and exits within
    /// seconds; watching the launched process would look like the customer had
    /// closed the game and snap the menu back over it while it was still
    /// loading. Set this to the process the game really runs as — for Valorant,
    /// <c>VALORANT-Win64-Shipping</c>.
    /// <para>
    /// Leave it out for anything that stays as the process you started, which
    /// covers most standalone games.
    /// </para>
    /// <para>
    /// Find the right name in Task Manager: start the game, open the Details
    /// tab, and use the name of the entry that appears, minus <c>.exe</c>.
    /// </para>
    /// </remarks>
    [JsonPropertyName("processName")]
    public string? ProcessName { get; init; }

    /// <summary>Optional command-line arguments.</summary>
    [JsonPropertyName("arguments")]
    public string? Arguments { get; init; }

    /// <summary>
    /// Optional working directory. Defaults to the executable's own folder,
    /// which many games require in order to find their data files.
    /// </summary>
    [JsonPropertyName("workingDirectory")]
    public string? WorkingDirectory { get; init; }

    /// <summary>
    /// A copy of this entry pointing at where the game really is on this PC.
    /// </summary>
    /// <remarks>
    /// Used when the café's list and the machine disagree about the path,
    /// which happens whenever Steam put the library on a different drive.
    /// <para>
    /// The working directory is dropped if it no longer exists, because a
    /// stale one is worse than none: the default is the executable's own
    /// folder, which is what most games need anyway.
    /// </para>
    /// </remarks>
    public GameEntry WithResolvedExePath(string exePath) => new()
    {
        Name = Name,
        ExePath = exePath,
        IconPath = IconPath,
        ProcessName = ProcessName,
        Arguments = Arguments,
        WorkingDirectory = Directory.Exists(WorkingDirectory) ? WorkingDirectory : null,
    };
}
