namespace PcLockAgent;

internal static class Program
{
    /// <summary>
    /// Entry point for the BookMyGame PC lock agent.
    /// </summary>
    /// <remarks>
    /// [STAThread] is required by Windows Forms. It puts the thread into a
    /// "single-threaded apartment", which is the COM threading model the
    /// Windows shell expects for UI — clipboard, drag/drop and common dialogs
    /// misbehave or throw without it.
    /// </remarks>
    [STAThread]
    private static void Main()
    {
        // Reads the ApplicationHighDpiMode / VisualStyles settings out of the
        // .csproj and applies them. Must run before any Form is created.
        ApplicationConfiguration.Initialize();

        AgentLog.Info("=== PcLockAgent starting ===");

        if (AgentSettings.AllowDevExit)
        {
            // Written every start so an unsafe build is obvious in the log of a
            // machine that is already deployed, not just on the screen in front
            // of whoever built it.
            AgentLog.Warn(
                "AllowDevExit is TRUE. Anyone can quit this agent with Ctrl+Shift+Alt+Q " +
                "or suspend the lock with Ctrl+Shift+Alt+L. Set it to false in " +
                "AgentSettings.cs before using this on a cafe PC.");
        }

        var config = AgentConfig.Load();

        // A machine that has never redeemed a setup code has no broker details,
        // so there is nothing for it to obey. Ask before locking anything —
        // putting up an unexitable lock screen on a PC that cannot be unlocked
        // remotely would strand it.
        if (!config.IsEnrolled)
        {
            AgentLog.Info("This PC is not linked to a café yet. Asking for a setup code.");

            using var enrollment = new EnrollmentForm(config);
            if (enrollment.ShowDialog() != DialogResult.OK)
            {
                AgentLog.Info("Setup was cancelled. Nothing has been locked.");
                return;
            }

            // Re-read so the freshly written settings are the ones used.
            config = AgentConfig.Load();
        }

        // An ApplicationContext rather than a form: the agent has to outlive the
        // lock screen, which stays hidden for the whole of a paid session.
        Application.Run(new AgentShell(config));

        AgentLog.Info("=== PcLockAgent stopped ===");
    }
}
