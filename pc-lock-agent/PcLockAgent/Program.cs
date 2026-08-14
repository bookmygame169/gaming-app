namespace PcLockAgent;

internal static class Program
{
    [STAThread]
    private static async Task Main()
    {
        ApplicationConfiguration.Initialize();

        AgentLog.Info("=== PcLockAgent starting ===");

        if (AgentSettings.AllowDevExit)
        {
            AgentLog.Warn(
                "AllowDevExit is TRUE. Anyone can quit this agent with Ctrl+Shift+Alt+Q " +
                "or suspend the lock with Ctrl+Shift+Alt+L. Set it to false in " +
                "AgentSettings.cs before using this on a cafe PC.");
        }

        var config = AgentConfig.Load();

        if (!config.IsEnrolled)
        {
            AgentLog.Info("This PC is not linked to a café yet. Asking for a setup code.");

            using var enrollment = new EnrollmentForm(config);
            if (enrollment.ShowDialog() != DialogResult.OK)
            {
                AgentLog.Info("Setup was cancelled. Nothing has been locked.");
                return;
            }

            config = AgentConfig.Load();
        }

        config = await GameCatalogSync.TryRefreshAsync(config);

        Application.Run(new AgentShell(config));

        AgentLog.Info("=== PcLockAgent stopped ===");
    }
}
