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

            // Ask SYSTEM to refresh the shared game list if the task exists.
            // Best-effort: the lock user may not be allowed to start it.
            TryRequestSharedGameScan();

            config = InstalledGames.FilterToInstalled(config);
            config = GameDiscovery.AddInstalledGames(config);

            // The other half of this feature — clearing the profile between
            // customers — has been running all along, but nothing ever added
            // the tile, so browsing was switched on and unreachable.
            config = BrowserAccess.AddBrowserTile(config);

            config = GameDiscovery.KeepMenuItemsOnly(config);

            Application.Run(new AgentShell(config));
        }
        finally
        {
            SingleInstance.Release();
        }

        AgentLog.Info("=== PcLockAgent stopped ===");
    }

    /// <summary>
    /// Kicks the SYSTEM "BookMyGame Game List" task so admin-desktop and Xbox
    /// titles land in ProgramData before we build the menu.
    /// </summary>
    private static void TryRequestSharedGameScan()
    {
        try
        {
            var start = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = "/Run /TN \"BookMyGame Game List\"",
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            using var process = System.Diagnostics.Process.Start(start);
            process?.WaitForExit(5000);

            // Give SYSTEM a moment to rewrite installed-games.json.
            System.Threading.Thread.Sleep(1500);
            AgentLog.Info("Requested a shared game-list refresh.");
        }
        catch (Exception ex)
        {
            AgentLog.Info($"Could not start the shared game-list task ({ex.Message}). Using whatever list is already on disk.");
        }
    }
}
