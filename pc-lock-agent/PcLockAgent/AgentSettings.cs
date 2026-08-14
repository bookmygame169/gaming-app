namespace PcLockAgent;

/// <summary>
/// Compile-time settings, as opposed to the per-machine ones in
/// <see cref="AgentConfig"/> (loaded from <c>appsettings.json</c>).
/// </summary>
/// <remarks>
/// Anything security-relevant belongs here rather than in the JSON file, so it
/// cannot be changed on a café PC without rebuilding and redeploying.
/// </remarks>
internal static class AgentSettings
{
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
    /// <para>
    /// <b>How to get out of a locked machine now that this is false.</b>
    /// Ctrl+Alt+Del still works — Windows reserves it at the kernel level and no
    /// application can trap it — and only the Task Manager entry on that screen
    /// is disabled. Sign out from there and you are back at the logon screen,
    /// from which your own administrator account is reachable as normal. The
    /// startup task runs only for the customer account, so an administrator
    /// signing in gets an ordinary Windows with no lock at all.
    /// <para>
    /// Set it back to true only on a machine you are developing on, and never
    /// ship that build.
    /// </para>
    /// <para>
    /// <c>static readonly</c> rather than <c>const</c> on purpose: a const would
    /// be folded at compile time, making one side of every <c>if</c> that tests
    /// it unreachable and producing CS0162 warnings — which would flip to the
    /// other branch the moment this is set to false.
    /// </para>
    /// </remarks>
    public static readonly bool AllowDevExit = false;
}
