namespace PcLockAgent;

/// <summary>
/// Developer-only keyboard shortcuts, all on Ctrl+Shift+Alt.
/// </summary>
/// <remarks>
/// None of these exist once <see cref="AgentSettings.AllowDevExit"/> is false.
/// </remarks>
internal enum DevChord
{
    /// <summary>Q — quit the agent.</summary>
    Exit,

    /// <summary>L — suspend or restore key blocking and always-on-top.</summary>
    TogglePassthrough,

    /// <summary>U — act as though an <c>unlock</c> command had arrived.</summary>
    SimulateUnlock,

    /// <summary>
    /// T — a deliberately short session, so the countdown can be watched.
    /// </summary>
    /// <remarks>
    /// A normal unlock is an hour, which would mean waiting 55 minutes to see
    /// the first warning fire.
    /// </remarks>
    SimulateShortSession,

    /// <summary>K — act as though a <c>lock</c> command had arrived.</summary>
    SimulateLock,
}

internal static class DevChords
{
    /// <summary>
    /// Matches a key press against the dev chords, or null if it is not one.
    /// </summary>
    /// <remarks>
    /// Used by the forms as a fallback. <see cref="SystemLockService"/> catches
    /// the same chords inside the keyboard hook, which works even when no window
    /// has focus; this path covers the case where the hook failed to install.
    /// </remarks>
    public static DevChord? Match(KeyEventArgs e)
    {
        if (!AgentSettings.AllowDevExit)
        {
            return null;
        }

        // Deliberately awkward — a customer will not hit these by accident.
        if (!e.Control || !e.Shift || !e.Alt)
        {
            return null;
        }

        return e.KeyCode switch
        {
            Keys.Q => DevChord.Exit,
            Keys.L => DevChord.TogglePassthrough,
            Keys.U => DevChord.SimulateUnlock,
            Keys.T => DevChord.SimulateShortSession,
            Keys.K => DevChord.SimulateLock,
            _ => null,
        };
    }
}
