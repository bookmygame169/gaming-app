namespace PcLockAgent;

/// <summary>
/// Tells the owner what this PC has installed, so they can choose.
/// </summary>
/// <remarks>
/// The scanners this uses were switched off, and it is worth being exact about
/// why: their output went straight onto the customer's screen, and alongside
/// the games it carried File Explorer, the NVIDIA control panel, Logitech's
/// software and adware called PremierOpinion. Six rounds of "not all the games
/// are showing" were spent trying to filter that by guesswork.
/// <para>
/// The scanning was never the problem. Publishing it unread was. So the
/// scanners run again here and report to the dashboard, where a person decides;
/// the menu is still built only from the café's own list. A game like Forza,
/// installed through Xbox with no shortcut anywhere on the machine, becomes
/// findable without anybody typing a path by hand - and adware cannot reach a
/// customer, because no scanner's opinion is enough to put anything on screen.
/// </para>
/// <para>
/// Everything here fails quietly. A café PC that cannot reach the website still
/// has to be a café PC.
/// </para>
/// </remarks>
internal sealed class DiscoveryReport
{
    /// <summary>
    /// How long between reports.
    /// </summary>
    /// <remarks>
    /// Games are installed on a café PC every few days at most, so this is
    /// about telling the owner within a shift rather than within a minute. It
    /// runs on a background thread either way; the scanners read the registry
    /// and walk Steam's library folders, which is not work for a UI thread.
    /// </remarks>
    private static readonly TimeSpan Interval = TimeSpan.FromHours(4);

    private readonly AgentConfig _config;
    private readonly PlayRequestClient _client;
    private DateTime _lastReportUtc = DateTime.MinValue;

    public DiscoveryReport(AgentConfig config, PlayRequestClient client)
    {
        _config = config;
        _client = client;
    }

    /// <summary>
    /// Scans and reports, if it is time.
    /// </summary>
    /// <remarks>
    /// Safe to call as often as the caller likes; it decides for itself whether
    /// enough time has passed.
    /// </remarks>
    public void ReportIfDue()
    {
        if (DateTime.UtcNow - _lastReportUtc < Interval)
        {
            return;
        }

        _lastReportUtc = DateTime.UtcNow;

        _ = Task.Run(async () =>
        {
            try
            {
                // Timed because "does this slow the PCs down" is a fair question
                // with no good answer from reading the code: it depends on how
                // many Steam libraries a café has and whether they are on a
                // mechanical drive. The log says what it actually cost on that
                // machine.
                var clock = System.Diagnostics.Stopwatch.StartNew();
                var found = GameDiscovery.ScanForReport();
                clock.Stop();

                AgentLog.Info(
                    $"Scanned for installed games in {clock.ElapsedMilliseconds} ms " +
                    $"(found {found.Count}). Machine was locked and idle.");

                if (found.Count == 0)
                {
                    return;
                }

                var accepted = await _client.ReportDiscoveredGamesAsync(found).ConfigureAwait(false);
                AgentLog.Info($"Reported {found.Count} installed game(s) to the dashboard ({accepted} accepted).");
            }
            catch (Exception ex)
            {
                AgentLog.Warn($"Could not report installed games: {ex.Message}");
            }
        });
    }
}
