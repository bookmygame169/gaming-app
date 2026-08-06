namespace PcLockAgent;

/// <summary>
/// Machine-specific settings for this agent.
/// </summary>
/// <remarks>
/// Constants for now. These move into <c>appsettings.json</c> when MqttService
/// lands, because every café PC needs its own station id and the broker address
/// cannot be baked into the binary.
/// </remarks>
internal static class AgentSettings
{
    /// <summary>Identifies this PC to the backend. Must be unique per machine.</summary>
    public const string StationId = "PC-01";

    /// <summary>
    /// Developer escape hatch: Ctrl+Shift+Alt+Q closes the agent.
    /// </summary>
    /// <remarks>
    /// With <see cref="SystemLockService"/> active, Alt+F4, Alt+Tab and the
    /// Windows key are all swallowed. Without this chord a fullscreen topmost
    /// window becomes unexitable — you would be locked out of your own dev
    /// machine, recoverable only by a remote session or a hard power cycle.
    /// <para>
    /// MUST be false in the build that goes onto café PCs. A customer who finds
    /// this chord in a shipped build walks straight to the desktop.
    /// </para>
    /// </remarks>
    /// <remarks>
    /// <c>static readonly</c> rather than <c>const</c> on purpose: a const would
    /// be folded at compile time, making one side of every <c>if</c> that tests
    /// it unreachable and producing CS0162 warnings — which flip to the other
    /// branch the moment this is set to false.
    /// </remarks>
    public static readonly bool AllowDevExit = true;
}
