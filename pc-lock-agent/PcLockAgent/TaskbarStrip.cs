namespace PcLockAgent;

/// <summary>
/// A row of buttons for everything the customer currently has open.
/// </summary>
/// <remarks>
/// Windows' own taskbar is hidden for the whole of a session because it is a
/// way back to the desktop. Removing it also removed the only place a customer
/// could see what was running, switch to it, or close it — and that gap is what
/// turned a game opening behind the menu into a stuck session, because there
/// was nothing on screen to click.
/// <para>
/// This is the missing half, and only that half: it lists windows and does two
/// things to them. There is no Start menu, no file browser and no way to reach
/// anything that is not already open.
/// </para>
/// </remarks>
internal sealed class TaskbarStrip : Panel
{
    /// <summary>Raised when the customer picks a window to bring forward.</summary>
    public event EventHandler<RunningWindow>? WindowActivated;

    /// <summary>Raised after the customer closes a window from the strip.</summary>
    public event EventHandler<RunningWindow>? WindowClosed;

    /// <summary>How tall the strip needs to be, for whoever lays it out.</summary>
    public const int PreferredHeight = 76;

    private readonly System.Windows.Forms.Timer _refreshTimer;
    private readonly FlowLayoutPanel _buttons;
    private readonly Label _emptyHint;
    private IReadOnlyList<RunningWindow> _shown = Array.Empty<RunningWindow>();
    private bool _rebuildWanted;

    public TaskbarStrip()
    {
        Height = PreferredHeight;
        BackColor = Color.Transparent;
        Padding = new Padding(50, 8, 50, 10);
        DoubleBuffered = true;

        _buttons = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.Transparent,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            AutoScroll = false,
            Margin = Padding.Empty,
        };

        _emptyHint = new Label
        {
            Text = "Nothing open yet — pick a game above.",
            Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
            ForeColor = Palette.TextFaint,
            AutoSize = true,
            Margin = new Padding(2, 16, 0, 0),
        };

        _buttons.Controls.Add(_emptyHint);
        Controls.Add(_buttons);

        // A second is slow enough to cost nothing and fast enough that a game
        // finishing its load shows up before a customer gives up on it.
        _refreshTimer = new System.Windows.Forms.Timer { Interval = 1000 };
        _refreshTimer.Tick += (_, _) => RebuildIfChanged(RunningWindows.List());
    }

    /// <summary>
    /// Starts or stops polling.
    /// </summary>
    /// <remarks>
    /// Stopped while a game is in front, when the menu is invisible and
    /// click-through: nobody can see this strip then, and enumerating every
    /// window on the machine once a second during play is exactly the sort of
    /// background work that shows up as a stutter.
    /// </remarks>
    public void SetActive(bool active)
    {
        if (active)
        {
            RebuildIfChanged(RunningWindows.List());
            _refreshTimer.Start();
            return;
        }

        _refreshTimer.Stop();
    }

    /// <summary>The strip's own left-hand caption and top rule.</summary>
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        using var rule = new Pen(Palette.Border);
        e.Graphics.DrawLine(rule, 50, 0, Width - 50, 0);
    }

    private void RebuildIfChanged(IReadOnlyList<RunningWindow> windows)
    {
        if (IsDisposed || !IsHandleCreated)
        {
            return;
        }

        // Rebuilding unconditionally would restart the hover state under the
        // customer's pointer once a second and make the strip flicker, so the
        // list is only rebuilt when it has actually changed.
        if (!_rebuildWanted && SameAsShown(windows))
        {
            return;
        }

        _rebuildWanted = false;
        _shown = windows;

        _buttons.SuspendLayout();

        // Snapshot before disposing: disposing a control takes it out of its
        // parent's Controls collection, so doing it inside a foreach over that
        // collection throws.
        var previous = _buttons.Controls.OfType<TaskbarButton>().ToArray();
        _buttons.Controls.Clear();

        foreach (var control in previous)
        {
            control.Dispose();
        }

        if (windows.Count == 0)
        {
            _buttons.Controls.Add(_emptyHint);
        }
        else
        {
            foreach (var window in windows)
            {
                _buttons.Controls.Add(BuildButton(window));
            }
        }

        _buttons.ResumeLayout();
    }

    private TaskbarButton BuildButton(RunningWindow window)
    {
        var button = new TaskbarButton(window, RunningWindows.IconFor(window));

        button.ActivateRequested += (_, target) => WindowActivated?.Invoke(this, target);

        button.CloseRequested += (_, target) =>
        {
            RunningWindows.Close(target);

            // Taken off the strip straight away rather than at the next tick.
            // Closing can take a few seconds, and a button that stays put after
            // being clicked reads as a click that did not register — which is
            // how a customer ends up killing a game they only meant to close.
            button.Enabled = false;
            button.ShowAsClosing();

            // A flag, not an emptied _shown. Emptying it forces a rebuild only
            // while something else is still open — close the last window and
            // the real list is empty too, the two match, and this greyed-out
            // button stays on screen for the rest of the session.
            _rebuildWanted = true;

            WindowClosed?.Invoke(this, target);
        };

        return button;
    }

    private bool SameAsShown(IReadOnlyList<RunningWindow> windows)
    {
        if (windows.Count != _shown.Count)
        {
            return false;
        }

        for (var i = 0; i < windows.Count; i++)
        {
            if (windows[i].Handle != _shown[i].Handle
                || !string.Equals(windows[i].Title, _shown[i].Title, StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _refreshTimer.Stop();
            _refreshTimer.Dispose();
        }

        base.Dispose(disposing);
    }
}

/// <summary>One window's button: click the body to switch to it, the X to close it.</summary>
internal sealed class TaskbarButton : Control
{
    public event EventHandler<RunningWindow>? ActivateRequested;
    public event EventHandler<RunningWindow>? CloseRequested;

    private const int ButtonWidth = 232;
    private const int ButtonHeight = 46;
    private const int IconSize = 24;
    private const int CloseBoxSize = 26;

    private readonly RunningWindow _window;
    private readonly Image? _icon;
    private bool _hovered;
    private bool _overClose;
    private bool _closing;

    public TaskbarButton(RunningWindow window, Image? icon)
    {
        _window = window;
        _icon = icon;

        Size = new Size(ButtonWidth, ButtonHeight);
        Margin = new Padding(0, 6, 10, 0);
        Cursor = Cursors.Hand;

        // Opaque, not transparent, for the reason set out on Palette.CardFillOpaque:
        // a transparent WinForms control takes its background from the nearest
        // opaque ancestor rather than from what is painted underneath, so a
        // user-painted one shows the wrong pixels in the corners outside its
        // rounded edge. This is the colour the backdrop has reached by the
        // bottom of the screen, so those corners disappear into it.
        BackColor = Palette.Background;

        SetStyle(
            ControlStyles.AllPaintingInWmPaint
            | ControlStyles.OptimizedDoubleBuffer
            | ControlStyles.UserPaint
            | ControlStyles.ResizeRedraw,
            true);
    }

    /// <summary>Greys the button out while the window it names is shutting down.</summary>
    public void ShowAsClosing()
    {
        _closing = true;
        Cursor = Cursors.Default;
        Invalidate();
    }

    private Rectangle CloseBox => new(
        Width - CloseBoxSize - 8,
        (Height - CloseBoxSize) / 2,
        CloseBoxSize,
        CloseBoxSize);

    protected override void OnPaint(PaintEventArgs e)
    {
        var graphics = e.Graphics;
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        var body = new Rectangle(0, 0, Width - 1, Height - 1);

        using (var path = Theme.RoundedRect(body, 10))
        using (var fill = new SolidBrush(_hovered && !_closing ? Palette.SurfaceHover : Palette.Surface))
        using (var border = new Pen(_hovered && !_closing ? Palette.Divider : Palette.CardBorder))
        {
            graphics.FillPath(fill, path);
            graphics.DrawPath(border, path);
        }

        if (_icon is not null)
        {
            graphics.DrawImage(_icon, new Rectangle(11, (Height - IconSize) / 2, IconSize, IconSize));
        }
        else
        {
            using var placeholder = new SolidBrush(Palette.Border);
            graphics.FillEllipse(placeholder, 11, (Height - IconSize) / 2, IconSize, IconSize);
        }

        var textArea = new Rectangle(
            11 + IconSize + 10,
            0,
            CloseBox.Left - (11 + IconSize + 10) - 6,
            Height);

        using var font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

        TextRenderer.DrawText(
            graphics,
            _closing ? "Closing…" : _window.Title,
            font,
            textArea,
            _closing ? Palette.TextFaint : Palette.TextPrimary,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.EndEllipsis
                | TextFormatFlags.NoPrefix);

        if (_closing)
        {
            return;
        }

        DrawCloseCross(graphics);
    }

    private void DrawCloseCross(Graphics graphics)
    {
        var box = CloseBox;

        if (_overClose)
        {
            using var hot = new SolidBrush(Palette.Accent);
            using var path = Theme.RoundedRect(box, 7);
            graphics.FillPath(hot, path);
        }

        var colour = _overClose ? Palette.TextPrimary : Palette.TextFaint;
        using var pen = new Pen(colour, 1.6f);

        var inset = 9;
        graphics.DrawLine(pen, box.Left + inset, box.Top + inset, box.Right - inset, box.Bottom - inset);
        graphics.DrawLine(pen, box.Right - inset, box.Top + inset, box.Left + inset, box.Bottom - inset);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);

        var overClose = CloseBox.Contains(e.Location);
        if (overClose == _overClose && _hovered)
        {
            return;
        }

        _hovered = true;
        _overClose = overClose;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);

        _hovered = false;
        _overClose = false;
        Invalidate();
    }

    protected override void OnMouseClick(MouseEventArgs e)
    {
        base.OnMouseClick(e);

        if (_closing || e.Button != MouseButtons.Left)
        {
            return;
        }

        if (CloseBox.Contains(e.Location))
        {
            CloseRequested?.Invoke(this, _window);
            return;
        }

        ActivateRequested?.Invoke(this, _window);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _icon?.Dispose();
        }

        base.Dispose(disposing);
    }
}
