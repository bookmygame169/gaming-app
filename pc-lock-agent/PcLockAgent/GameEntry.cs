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
    /// Whether this tile is a game or an application.
    /// </summary>
    /// <remarks>
    /// Once the menu lists everything installed it stops being a short list and
    /// becomes a wall, and a customer hunting for Valorant should not be reading
    /// past Steam, Chrome and the Xbox app to find it. Two groups, games first.
    /// </remarks>
    [JsonPropertyName("category")]
    public string Category { get; init; } = "game";

    /// <summary>
    /// Where to take the icon from, when that is not what gets launched.
    /// </summary>
    /// <remarks>
    /// A Steam game is started by running steam.exe, so the file being launched
    /// carries Steam's icon and nothing about the game. This points at the
    /// game's own executable instead — the fallback for when Steam has no
    /// artwork cached, which is otherwise how four different games ended up
    /// wearing the same logo.
    /// </remarks>
    [JsonPropertyName("iconSourcePath")]
    public string? IconSourcePath { get; init; }

    /// <summary>
    /// Whether a person deliberately put this in front of customers.
    /// </summary>
    /// <remarks>
    /// True for anything found on a desktop, and for the machine-wide list,
    /// which is built by copying those desktops. Both mean an administrator
    /// chose this — that is a stronger signal about whether a café wants a tile
    /// than any rule here can work out from a name.
    /// <para>
    /// It exists because the guessing was losing real games. Every candidate
    /// used to run a gauntlet of overlapping deny lists at three separate
    /// stages, so a title could vanish for any of a dozen reasons and the only
    /// way to find out which was to read the log. Three games were missing from
    /// one café's menu at once while sitting in plain view on its desktop.
    /// A trusted entry now only has to exist and not be a Windows tool.
    /// </para>
    /// </remarks>
    [JsonIgnore]
    public bool Trusted { get; init; }

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
        Category = Category,
        IconSourcePath = IconSourcePath,
        WorkingDirectory = Directory.Exists(WorkingDirectory) ? WorkingDirectory : null,
    };
}
