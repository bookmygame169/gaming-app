namespace PcLockAgent;

using System.Runtime.InteropServices;

/// <summary>
/// A small card in the top-right corner saying how long is left.
/// </summary>
/// <remarks>
/// Everything about this window exists so it can appear over a running game
/// without disturbing it.
/// <para>
/// A previous version showed nothing at all when a Direct3D game was in
/// fullscreen, on the reasoning that any window over one would knock it out.
/// That was an over-correction. What actually minimised the game was the agent
/// calling SetForegroundWindow on it afterwards - a focus change arriving out
/// of nowhere - and that is fixed separately. A window that never takes focus,
/// never takes a click, and is composited rather than drawn into the game's
/// swap chain does not cause a mode switch on Windows 10 or 11, where
/// fullscreen optimisations present most "exclusive" fullscreen games as
/// borderless already.
/// </para>
/// <para>
/// So four styles, and each is load-bearing. NOACTIVATE means it can never
/// become the foreground window even if something clicks it. TRANSPARENT means
/// clicks pass straight through to the game underneath, so it cannot swallow a
/// shot. LAYERED means the desktop compositor draws it rather than the window
/// manager rearranging things to fit it in. TOOLWINDOW keeps it out of Alt+Tab.
/// </para>
/// <para>
/// The one case this cannot reach is a game that has genuinely taken exclusive
/// control of the display with fullscreen optimisations disabled. Drawing
/// inside that needs a library injected into the game, which against an
/// anti-cheat means risking the customer's account - so the sound carries the
/// warning there, and the card simply is not seen.
/// </para>
/// </remarks>
internal sealed class WarningOverlayForm : Form
{
    private const int VisibleSeconds = 8;

    /// <summary>How far in from the corner the card sits.</summary>
    private const int Inset = 28;

    private readonly System.Windows.Forms.Timer _hideTimer;

    private string _headline = string.Empty;
    private string _detail = string.Empty;
    private Color _accent = Palette.Accent;

    public WarningOverlayForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Palette.Background;
        DoubleBuffered = true;

        Width = 300;
        Height = 96;
        PlaceInCorner();

        _hideTimer = new System.Windows.Forms.Timer { Interval = VisibleSeconds * 1000 };
        _hideTimer.Tick += (_, _) =>
        {
            _hideTimer.Stop();
            Hide();
            Hidden?.Invoke(this, EventArgs.Empty);
        };
    }

    public event EventHandler? Hidden;

    /// <summary>Stops the card taking focus when it appears.</summary>
    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;

            parameters.ExStyle |= NativeConstants.WS_EX_NOACTIVATE;
            parameters.ExStyle |= NativeConstants.WS_EX_TOOLWINDOW;
            parameters.ExStyle |= NativeConstants.WS_EX_LAYERED;

            // Click-through. A card floating over a shooter that could eat a
            // click would be worse than no card.
            parameters.ExStyle |= NativeConstants.WS_EX_TRANSPARENT;

            return parameters;
        }
    }

    /// <summary>
    /// Makes the layered window visible, and cuts its corner.
    /// </summary>
    /// <remarks>
    /// WS_EX_LAYERED alone is why nothing appeared. A layered window draws
    /// NOTHING until something tells Windows how to composite it - either
    /// SetLayeredWindowAttributes or UpdateLayeredWindow - and the style was
    /// set without either. The card was created, shown and raised to topmost,
    /// perfectly invisible, which is a failure that logs nothing and looks
    /// exactly like the sound-only version it replaced.
    /// <para>
    /// Alpha 255: fully opaque, but composited. That is what lets it sit over a
    /// game without the window manager rearranging anything to fit it in.
    /// </para>
    /// <para>
    /// Left square deliberately. A clipping region would give it the cut corner
    /// the rest of the app uses, and setting one on a layered window is a
    /// second thing that can go quietly wrong on a machine nobody here can
    /// look at. This card has already been invisible once; the corner is not
    /// worth a second time. The accent bar down the left carries the identity.
    /// </para>
    /// </remarks>
    private void ApplyLayeredAppearance()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        try
        {
            NativeMethods.SetLayeredWindowAttributes(Handle, 0, 255, NativeMethods.LWA_ALPHA);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not set up the time warning window: {ex.Message}");
        }
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyLayeredAppearance();
    }

    private void PlaceInCorner()
    {
        var screen = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
        Location = new Point(screen.Right - Width - Inset, screen.Top + Inset);
    }

    /// <summary>Shows the card for a few seconds, above whatever is playing.</summary>
    /// <param name="secondsRemaining">Seconds left in the session.</param>
    public void ShowWarning(int secondsRemaining)
    {
        // Always audible, and always before anything is drawn. Sound is the
        // half that reaches a customer whose game this cannot be drawn over.
        AudioAlert.PlayTimeWarning(secondsRemaining);

        var (headline, detail, accent) = Describe(secondsRemaining);
        ShowCard(headline, detail, accent);
    }

    /// <summary>
    /// Shows the same card with something other than a countdown on it.
    /// </summary>
    /// <remarks>
    /// Silent, because the only thing this currently says is good news. The
    /// beep exists to reach somebody who is deep in a game and cannot be drawn
    /// over; being told you have more time can wait until you look up.
    /// </remarks>
    public void ShowMessage(string headline, string detail, Color accent)
    {
        ShowCard(headline, detail, accent);
    }

    private void ShowCard(string headline, string detail, Color accent)
    {
        (_headline, _detail, _accent) = (headline, detail, accent);

        _hideTimer.Stop();
        PlaceInCorner();

        if (!Visible)
        {
            Show();
        }

        ApplyLayeredAppearance();
        Invalidate();
        Update();

        // Raised without ever being activated. Setting TopMost alone is not
        // enough once something else has been topmost since.
        NativeMethods.SetWindowPos(
            Handle,
            NativeMethods.HWND_TOPMOST,
            Location.X,
            Location.Y,
            Width,
            Height,
            NativeMethods.SWP_NOACTIVATE | NativeMethods.SWP_SHOWWINDOW);

        _hideTimer.Start();

        AgentLog.Info($"Card shown: {_headline} (visible={Visible}, topmost={TopMost}).");
    }

    /// <summary>
    /// What the card says, and how loudly.
    /// </summary>
    /// <remarks>
    /// Ten minutes is information; two minutes is a prompt to do something.
    /// The colour escalates with it so the difference is visible before the
    /// words are read.
    /// </remarks>
    private static (string Headline, string Detail, Color Accent) Describe(int secondsRemaining)
    {
        if (secondsRemaining <= 0)
        {
            return ("TIME UP", "Your PC is locking now", Palette.Accent);
        }

        var minutes = (int)Math.Round(secondsRemaining / 60.0);

        if (minutes <= 2)
        {
            return ($"{minutes} MIN LEFT", "Save your game now", Palette.Accent);
        }

        if (minutes <= 5)
        {
            return ($"{minutes} MIN LEFT", "Finish up, or add time at the counter", Palette.Warning);
        }

        return ($"{minutes} MIN LEFT", "Add more time at the counter if you need it", Palette.Cyan);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

        var body = new Rectangle(0, 0, Width, Height);

        using (var fill = new SolidBrush(Color.FromArgb(10, 14, 24)))
        {
            g.FillRectangle(fill, body);
        }

        // The accent runs down the left edge rather than around the card: at
        // this size a full border is a box, and a bar is a signal.
        using (var edge = new SolidBrush(_accent))
        {
            g.FillRectangle(edge, 0, 0, 4, Height);
        }

        using (var border = new Pen(Color.FromArgb(46, 255, 255, 255)))
        {
            g.DrawRectangle(border, 0, 0, Width - 1, Height - 1);
        }

        using var headlineFont = Arena.Mono(19f);
        using var detailFont = Arena.Sans(9.5f);

        using (var headline = new SolidBrush(Palette.TextPrimary))
        {
            g.DrawString(_headline, headlineFont, headline, 22, 20);
        }

        using (var detail = new SolidBrush(Palette.TextMuted))
        {
            g.DrawString(_detail, detailFont, detail, new RectangleF(23, 52, Width - 40, 34));
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _hideTimer.Dispose();
        }

        base.Dispose(disposing);
    }

    private static class NativeConstants
    {
        public const int WS_EX_NOACTIVATE = 0x08000000;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_LAYERED = 0x00080000;
        public const int WS_EX_TRANSPARENT = 0x00000020;
    }

    private static class NativeMethods
    {
        public const uint LWA_ALPHA = 0x00000002;
        public const uint SWP_NOACTIVATE = 0x0010;
        public const uint SWP_SHOWWINDOW = 0x0040;
        public static readonly IntPtr HWND_TOPMOST = new(-1);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetLayeredWindowAttributes(
            IntPtr hwnd,
            uint crKey,
            byte bAlpha,
            uint dwFlags);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool SetWindowPos(
            IntPtr hWnd,
            IntPtr hWndInsertAfter,
            int x,
            int y,
            int cx,
            int cy,
            uint uFlags);
    }
}
