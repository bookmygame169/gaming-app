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

        Application.Run(new LockedScreenForm());
    }
}
