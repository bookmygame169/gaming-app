namespace PcLockAgent;

internal static class Program
{
    [STAThread]
    private static async Task Main()
    {
        ApplicationConfiguration.Initialize();

        AgentLog.Info("=== PcLockAgent starting ===");

        // Before anything else, and before the broker connection above all. Two
        // agents on one PC share a client id and knock each other offline every
        // few seconds, which is what the lock screen was showing.
        if (!SingleInstance.TryClaim())
        {
            return;
        }

        // Every way out of here releases the claim, including the one where
        // setup is cancelled. Windows would drop it at process exit anyway, but
        // relying on that leaves the next start racing the dying process - and
        // the watchdog starts one within a minute of any exit.
        try
        {
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

            // After the sync, never before: the café's full list is what gets
            // cached to disk, so a PC that is offline at boot still has everything
            // to filter against instead of yesterday's filtered subset.
            config = InstalledGames.FilterToInstalled(config);

            // After the filter, or the browser tile would be judged against the
            // cafe's game list and dropped for not being one of them.
            config = BrowserAccess.AddBrowserTile(config);

            Application.Run(new AgentShell(config));
        }
        finally
        {
            SingleInstance.Release();
        }

        AgentLog.Info("=== PcLockAgent stopped ===");
    }
}
