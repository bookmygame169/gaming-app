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

            // With no reachable site, fall back to the last hash the dashboard
            // sent. A station that cannot get online is exactly when somebody is
            // standing at it needing the exit, so it has to keep working.
            if (!config.HasExitPassword)
            {
                var cached = GameCatalogSync.LoadCachedExitPasswordHash();
                if (!string.IsNullOrWhiteSpace(cached))
                {
                    config = config.WithExitPasswordHash(cached);
                    AgentLog.Info("Using the cached exit password; the site was not reachable.");
                }
            }

            // Ask SYSTEM to refresh the shared game list if the task exists.
            // Best-effort: the lock user may not be allowed to start it.
            TryRequestSharedGameScan();

            // Everything the scan says is collected and written out as one
            // readable file, because six rounds of "which game is missing and
            // why" were spent reasoning backwards from a photograph of the
            // menu while the agent already knew the answer.
            AgentLog.StartCapture();

            // The desktop decides what is on the menu. The café's catalogue no
            // longer does: its entries record how a game starts, and for every
            // Steam title that is steam.exe, so "does this file exist?" proved
            // Steam was installed and let two games nobody could play onto the
            // menu of every PC in the room.
            config = GameDiscovery.MenuFromDesktop(config);

            // The other half of this feature — clearing the profile between
            // customers — has been running all along, but nothing ever added
            // the tile, so browsing was switched on and unreachable.
            config = BrowserAccess.AddBrowserTile(config);

            config = GameDiscovery.KeepMenuItemsOnly(config);

            GameDiscovery.LogFinalMenu(config);
            AgentLog.SaveCapture(
                "Send this file if a game is missing. It lists every place that was " +
                "searched, everything found, and the rule that rejected anything dropped.");

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
