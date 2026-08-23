using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace PcLockAgent;

/// <summary>
/// Shared drawing for the kiosk screens.
/// </summary>
/// <remarks>
/// These screens are the whole of what a customer sees for the length of their
/// session — there is no browser chrome or desktop around them to carry any of
/// the look. A flat fill and square boxes read as an error dialog rather than
/// something you paid to sit down in front of.
/// <para>
/// The arrangement follows the same idea as other café kiosks: a deep starfield
/// with soft out-of-focus lights, and one calm bordered card floating in the
/// middle of it holding everything that matters. The colour does not follow
/// them — theirs is cyan, and this is PlayTime's rose, because the point of the
/// screen a customer stares at for an hour is that it is recognisably yours.
/// </para>
/// <para>
/// The techniques are deliberately dull ones: gradients, ellipses, dots, clipped
/// corners. Nothing depends on a compositor, a transparency mode or a particular
/// Windows version, because a screen that fails to paint on one café PC is a
/// machine nobody can use that day.
/// </para>
/// </remarks>
internal static class Theme
{
    public const int CornerRadius = 14;
    public const int CardRadius = 20;

    /// <summary>
    /// Draws the small mark that anchors the top of a card.
    /// </summary>
    /// <remarks>
    /// Borrowed from how other café kiosks build this screen, and it earns its
    /// place: without something at the top the card begins with a word floating
    /// in space, and the eye has nowhere to start.
    /// </remarks>
    public static void DrawEmblem(Graphics graphics, Rectangle area, string initials)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using (var path = RoundedRect(area, area.Width / 3))
        using (var fill = new LinearGradientBrush(
                   area, Palette.Accent, Palette.AccentDeep, LinearGradientMode.ForwardDiagonal))
        {
            graphics.FillPath(fill, path);
        }

        using var font = new Font("Segoe UI", area.Height * 0.40f, FontStyle.Bold, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(Palette.TextPrimary);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
        };

        graphics.DrawString(initials, font, brush, area, format);
    }

    /// <summary>
    /// The whole backdrop, rendered once and kept.
    /// </summary>
    /// <remarks>
    /// Two reasons, and the second is the real one. It is drawn thousands of
    /// times — every repaint of every control that sits on it — and several
    /// hundred stars and a dozen soft gradients per repaint would be felt.
    /// <para>
    /// More importantly the stars are random, and random redrawn is random
    /// again: without a cache the sky would twinkle every time a label
    /// refreshed. Rendering once fixes the sky in place.
    /// </para>
    /// </remarks>
    private static Bitmap? _backdrop;
    private static Size _backdropSize;
    private static readonly object BackdropGate = new();

    public static void PaintBackdrop(Graphics graphics, Rectangle bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        Bitmap backdrop;
        lock (BackdropGate)
        {
            if (_backdrop is null || _backdropSize != bounds.Size)
            {
                _backdrop?.Dispose();
                _backdrop = RenderBackdrop(bounds.Size);
                _backdropSize = bounds.Size;
            }

            backdrop = _backdrop;
        }

        graphics.DrawImageUnscaled(backdrop, bounds.Location);
    }

    private static Bitmap RenderBackdrop(Size size)
    {
        var bitmap = new Bitmap(size.Width, size.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var bounds = new Rectangle(Point.Empty, size);

        using (var gradient = new LinearGradientBrush(
                   bounds, Palette.BackgroundTop, Palette.Background, LinearGradientMode.ForwardDiagonal))
        {
            graphics.FillRectangle(gradient, bounds);
        }

        // A fixed seed, so every café PC shows the same sky and a rebuild does
        // not reshuffle it. Random here is for the look, not for unpredictability.
        var random = new Random(20260814);

        DrawBokeh(graphics, bounds, random);
        DrawStars(graphics, bounds, random);

        return bitmap;
    }

    /// <summary>Soft out-of-focus lights, the thing that stops it looking flat.</summary>
    private static void DrawBokeh(Graphics graphics, Rectangle bounds, Random random)
    {
        var lights = Math.Max(10, bounds.Width / 110);

        for (var i = 0; i < lights; i++)
        {
            var radius = random.Next(bounds.Height / 14, bounds.Height / 5);
            var centre = new Point(random.Next(bounds.Width), random.Next(bounds.Height));
            var area = new Rectangle(centre.X - radius, centre.Y - radius, radius * 2, radius * 2);

            // Mostly the warm amber that reads as distant lights; every third one
            // the brand rose, so the accent is present without being a wash.
            var colour = i % 3 == 0 ? Palette.GlowAccent : Palette.GlowWarm;

            using var path = new GraphicsPath();
            path.AddEllipse(area);

            using var brush = new PathGradientBrush(path)
            {
                CenterColor = colour,
                SurroundColors = [Color.FromArgb(0, colour)],
            };

            graphics.FillPath(brush, path);
        }
    }

    private static void DrawStars(Graphics graphics, Rectangle bounds, Random random)
    {
        var count = Math.Max(120, bounds.Width * bounds.Height / 9000);

        for (var i = 0; i < count; i++)
        {
            var x = random.Next(bounds.Width);
            var y = random.Next(bounds.Height);

            // Varied brightness and size: a field of identical dots looks like a
            // texture, an uneven one looks like a sky.
            var alpha = random.Next(30, 190);
            var diameter = random.Next(10) == 0 ? 3 : random.Next(4) == 0 ? 2 : 1;

            using var brush = new SolidBrush(Color.FromArgb(alpha, Palette.TextPrimary));
            graphics.FillEllipse(brush, x, y, diameter, diameter);
        }
    }

    /// <summary>The floating panel everything important sits on.</summary>
    /// <param name="glow">
    /// Draws a soft halo outside the card. What makes it read as sitting above
    /// the starfield rather than as a hole cut into it — the same job a box
    /// shadow does on a web page, which GDI+ has no equivalent for, so it is
    /// built from a handful of rounded outlines fading outwards.
    /// </param>
    public static void PaintCard(Graphics graphics, Rectangle rect, bool highlighted = false, bool glow = false)
    {
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            return;
        }

        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (glow)
        {
            // Outwards, fading. Few enough rings to cost nothing on a repaint,
            // wide enough apart that the banding is invisible at this alpha.
            for (var ring = 10; ring >= 1; ring--)
            {
                var spread = ring * 4;
                var alpha = 10 - ring;
                if (alpha <= 0) continue;

                var area = Rectangle.Inflate(rect, spread, spread);
                if (area.Width <= 0 || area.Height <= 0) continue;

                using var halo = RoundedRect(area, CardRadius + spread);
                using var haloPen = new Pen(Color.FromArgb(alpha * 2, Palette.Accent), 4f);
                graphics.DrawPath(haloPen, halo);
            }
        }

        using var path = RoundedRect(rect, CardRadius);
        using (var fill = new SolidBrush(Palette.CardFill))
        {
            graphics.FillPath(fill, path);
        }

        using var pen = new Pen(highlighted ? Palette.Accent : Palette.CardBorder, highlighted ? 2f : 1f);
        graphics.DrawPath(pen, path);
    }

    // -----------------------------------------------------------------------
    // Letter-spaced text
    // -----------------------------------------------------------------------

    /// <summary>
    /// Draws text with space added between the letters.
    /// </summary>
    /// <remarks>
    /// Done a character at a time because neither WinForms labels nor GDI+ has
    /// letter spacing, and wide-tracked capitals are most of what makes a kiosk
    /// heading look designed rather than typed.
    /// <para>
    /// GenericTypographic, not the default format: the default adds an invisible
    /// margin either side of every string, which at one call per character
    /// accumulates into a visibly gappy, uneven word.
    /// </para>
    /// </remarks>
    public static void DrawTracked(
        Graphics graphics, string text, Font font, Color colour, float x, float y, float tracking)
    {
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

        using var brush = new SolidBrush(colour);
        var format = StringFormat.GenericTypographic;

        foreach (var character in text)
        {
            var single = character.ToString();
            graphics.DrawString(single, font, brush, x, y, format);
            x += graphics.MeasureString(single, font, PointF.Empty, format).Width + tracking;
        }
    }

    /// <summary>Width of what <see cref="DrawTracked"/> would draw.</summary>
    public static float MeasureTracked(Graphics graphics, string text, Font font, float tracking)
    {
        if (string.IsNullOrEmpty(text))
        {
            return 0f;
        }

        var format = StringFormat.GenericTypographic;
        var width = 0f;

        foreach (var character in text)
        {
            width += graphics.MeasureString(character.ToString(), font, PointF.Empty, format).Width + tracking;
        }

        // The last character contributes no gap after it, so centring does not
        // sit the word half a space to the left.
        return width - tracking;
    }

    /// <summary>Draws tracked text centred within a width.</summary>
    public static void DrawTrackedCentred(
        Graphics graphics, string text, Font font, Color colour, int containerWidth, float y, float tracking)
    {
        var width = MeasureTracked(graphics, text, font, tracking);
        DrawTracked(graphics, text, font, colour, (containerWidth - width) / 2f, y, tracking);
    }

    /// <summary>A thin rule, brightest in the middle and fading at both ends.</summary>
    public static void DrawDivider(Graphics graphics, int containerWidth, float y, int width, Color colour)
    {
        var left = (containerWidth - width) / 2f;
        var area = new RectangleF(left, y, width, 1f);

        using var brush = new LinearGradientBrush(
            new RectangleF(left, y - 1, width, 3f),
            Color.FromArgb(0, colour),
            Color.FromArgb(0, colour),
            LinearGradientMode.Horizontal)
        {
            InterpolationColors = new ColorBlend
            {
                Colors = [Color.FromArgb(0, colour), colour, Color.FromArgb(0, colour)],
                Positions = [0f, 0.5f, 1f],
            },
        };

        graphics.FillRectangle(brush, area);
    }

    // -----------------------------------------------------------------------
    // Shapes
    // -----------------------------------------------------------------------

    public static GraphicsPath RoundedRect(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();

        // A radius larger than half the shorter side produces a shape GDI+ draws
        // as a bow tie, so it is clamped rather than trusted.
        var diameter = Math.Min(radius * 2, Math.Min(rect.Width, rect.Height));
        if (diameter <= 0)
        {
            path.AddRectangle(rect);
            return path;
        }

        var arc = new Rectangle(rect.Location, new Size(diameter, diameter));

        path.AddArc(arc, 180, 90);
        arc.X = rect.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = rect.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = rect.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();

        return path;
    }

    /// <summary>
    /// Rounds a control's corners by clipping it.
    /// </summary>
    /// <remarks>
    /// Clipping rather than painting a rounded shape on a transparent
    /// background, because WinForms takes a transparent control's backdrop from
    /// its nearest opaque ancestor: a tile painting its own rounded fill would
    /// have its label and icon showing the page behind them instead of the tile.
    /// Clipping keeps the tile opaque, so its children behave, and only the
    /// corners are cut.
    /// <para>
    /// The cut edge is not anti-aliased. The border drawn over it is, and that is
    /// the edge the eye follows.
    /// </para>
    /// </remarks>
    public static void RoundCorners(Control control, int radius)
    {
        if (control.Width <= 0 || control.Height <= 0)
        {
            return;
        }

        using var path = RoundedRect(new Rectangle(0, 0, control.Width, control.Height), radius);
        control.Region?.Dispose();
        control.Region = new Region(path);
    }

    public static void DrawBorder(Graphics graphics, Rectangle bounds, Color colour, float width, int radius)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        // Inset by the pen width: GDI+ centres a stroke on the path, so a border
        // drawn on the exact edge loses its outer half to the clip.
        var inset = (int)Math.Ceiling(width / 2f);
        var rect = Rectangle.Inflate(bounds, -inset, -inset);
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            return;
        }

        using var path = RoundedRect(rect, radius);
        using var pen = new Pen(colour, width);
        graphics.DrawPath(pen, path);
    }
}

// ---------------------------------------------------------------------------
// The arena look.
//
// Everything below belongs to the redesign: hard cut corners instead of rounded
// ones, a diagonal accent, and two typefaces that are both already on every
// Windows machine. Kept apart from the older helpers above so the two can live
// side by side while screens are moved across one at a time.
// ---------------------------------------------------------------------------
internal static class Arena
{
    /// <summary>How much corner a panel loses, in pixels.</summary>
    public const int Cut = 22;

    /// <summary>
    /// Words.
    /// </summary>
    /// <remarks>
    /// Segoe UI, and only ever Regular or Bold: those are the two weights
    /// WinForms can render from it, so a design asking for anything heavier is
    /// a design this cannot build.
    /// </remarks>
    public static Font Sans(float size, FontStyle style = FontStyle.Regular)
        => new("Segoe UI", size, style);

    /// <summary>
    /// Numbers.
    /// </summary>
    /// <remarks>
    /// Consolas, for the station number, the countdown and every price. A
    /// monospaced face with lining figures is what makes a clock read as
    /// equipment rather than as a document - and, more practically, it stops
    /// the countdown shuffling sideways every time a digit changes width.
    /// <para>
    /// Ships with Windows, so this costs nothing to install. If it is ever
    /// missing GDI+ substitutes silently and the screen still works.
    /// </para>
    /// </remarks>
    public static Font Mono(float size, FontStyle style = FontStyle.Bold)
        => new("Consolas", size, style);

    /// <summary>
    /// A rectangle with its bottom-right corner cut away.
    /// </summary>
    /// <remarks>
    /// The shape the whole redesign is built from. Rounded corners read as
    /// software; a cut corner reads as hardware, which is what a screen sitting
    /// on a gaming PC should look like.
    /// </remarks>
    public static GraphicsPath CutRect(Rectangle rect, int cut = Cut)
    {
        var path = new GraphicsPath();

        // Never more than the box can give. A cut deeper than the shorter side
        // turns the shape inside out.
        var c = Math.Max(0, Math.Min(cut, Math.Min(rect.Width, rect.Height) / 2));

        if (c == 0)
        {
            path.AddRectangle(rect);
            return path;
        }

        path.AddLines(new[]
        {
            new Point(rect.Left, rect.Top),
            new Point(rect.Right, rect.Top),
            new Point(rect.Right, rect.Bottom - c),
            new Point(rect.Right - c, rect.Bottom),
            new Point(rect.Left, rect.Bottom),
        });

        path.CloseFigure();
        return path;
    }

    /// <summary>Clips a control to the cut-corner shape.</summary>
    public static void CutCorners(Control control, int cut = Cut)
    {
        if (control.Width <= 0 || control.Height <= 0)
        {
            return;
        }

        using var path = CutRect(new Rectangle(0, 0, control.Width, control.Height), cut);
        control.Region?.Dispose();
        control.Region = new Region(path);
    }

    /// <summary>Draws the edge of a cut-corner panel.</summary>
    public static void DrawCutBorder(Graphics graphics, Rectangle bounds, Color colour, float width = 1f, int cut = Cut)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var inset = (int)Math.Ceiling(width / 2f);
        var rect = Rectangle.Inflate(bounds, -inset, -inset);
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            return;
        }

        using var path = CutRect(rect, cut);
        using var pen = new Pen(colour, width);
        graphics.DrawPath(pen, path);
    }

    /// <summary>
    /// A bright top edge, which is how these panels are separated rather than
    /// by a border all the way round.
    /// </summary>
    public static void DrawTopEdge(Graphics graphics, Rectangle bounds, Color colour, int thickness = 3)
    {
        using var brush = new SolidBrush(colour);
        graphics.FillRectangle(brush, bounds.Left, bounds.Top, bounds.Width, thickness);
    }

    private static readonly object BackdropGate = new();
    private static Bitmap? _backdrop;
    private static Size _backdropSize;

    /// <summary>
    /// The screen behind everything: a pool of light, fine diagonal rules, and
    /// one accent slash.
    /// </summary>
    /// <remarks>
    /// Cached like the old backdrop, and for the same reason: it is redrawn on
    /// every paint of a fullscreen form, and regenerating a 1920x1080 gradient
    /// each time is visible as a stutter.
    /// </remarks>
    public static void PaintArena(Graphics graphics, Rectangle bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        Bitmap backdrop;
        lock (BackdropGate)
        {
            if (_backdrop is null || _backdropSize != bounds.Size)
            {
                _backdrop?.Dispose();
                _backdrop = RenderArena(bounds.Size);
                _backdropSize = bounds.Size;
            }

            backdrop = _backdrop;
        }

        graphics.DrawImageUnscaled(backdrop, bounds.Location);
    }

    private static Bitmap RenderArena(Size size)
    {
        var bitmap = new Bitmap(size.Width, size.Height);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using (var flat = new SolidBrush(Palette.Background))
        {
            graphics.FillRectangle(flat, 0, 0, size.Width, size.Height);
        }

        // Two lights of different temperatures at opposite corners. One glow on
        // its own reads as a spotlight on a stage; a warm one and a cold one
        // read as a room somebody is sitting in.
        Glow(graphics, size, Palette.BackdropCore, -0.11f, -0.29f, 0.56f);
        Glow(graphics, size, Palette.BackdropCold, 0.62f, 0.58f, 0.48f);

        // The vignette. It does more work than it looks: it pulls the eye to
        // the middle of a very wide screen, and it stops the two lights ending
        // in a visible edge at the corners.
        using (var path = new GraphicsPath())
        {
            var reach = new Rectangle(
                -(int)(size.Width * 0.18),
                -(int)(size.Height * 0.28),
                (int)(size.Width * 1.36),
                (int)(size.Height * 1.56));

            path.AddEllipse(reach);

            using var shade = new PathGradientBrush(path)
            {
                CenterColor = Color.FromArgb(0, 0, 0, 0),
                SurroundColors = new[] { Color.FromArgb(190, 0, 0, 0) },
                CenterPoint = new PointF(size.Width * 0.5f, size.Height * 0.42f),
            };

            graphics.FillPath(shade, path);
        }

        return bitmap;
    }

    /// <summary>One soft circle of light, sized as a fraction of the screen.</summary>
    private static void Glow(Graphics graphics, Size size, Color colour, float x, float y, float spread)
    {
        var diameter = (int)(size.Width * spread);

        var circle = new Rectangle(
            (int)(size.Width * x),
            (int)(size.Height * y),
            diameter,
            diameter);

        using var path = new GraphicsPath();
        path.AddEllipse(circle);

        // Alpha rather than a colour that fades to the background: the second
        // light is drawn over the first, and blending to an opaque colour would
        // punch a dark hole through whatever it lands on.
        using var brush = new PathGradientBrush(path)
        {
            CenterColor = Color.FromArgb(150, colour),
            SurroundColors = new[] { Color.FromArgb(0, colour) },
        };

        graphics.FillPath(brush, path);
    }

    /// <summary>
    /// The stage floor: a grid in perspective, creeping toward the screen.
    /// </summary>
    /// <remarks>
    /// Drawn live rather than cached, because it is the one thing that moves
    /// all the time. It is only lines, and only across the bottom of the
    /// screen, so a repaint costs a fraction of what re-blitting the whole
    /// backdrop would.
    /// <para>
    /// <paramref name="phase"/> runs 0 to 1 and drives one row's worth of
    /// travel, so the grid loops without a seam.
    /// </para>
    /// </remarks>
    public static void PaintFloor(Graphics graphics, Rectangle bounds, float phase)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        var horizon = bounds.Bottom - (int)(bounds.Height * 0.30f);
        var depth = bounds.Bottom - horizon;

        if (depth <= 0)
        {
            return;
        }

        var previous = graphics.SmoothingMode;
        graphics.SmoothingMode = SmoothingMode.AntiAlias;

        // Rows. Spacing grows with distance from the horizon, which is what
        // makes a flat set of lines read as a floor going away from you.
        for (var row = 0; row < 9; row++)
        {
            var t = (row + phase) / 9f;
            var y = horizon + (int)(depth * t * t);

            if (y <= horizon || y > bounds.Bottom)
            {
                continue;
            }

            // Fading in at the horizon, so a new row does not appear from
            // nothing every time one leaves the bottom of the screen.
            var strength = (int)(46 * Math.Min(1f, t * 2.4f));

            using var pen = new Pen(Color.FromArgb(strength, Palette.Accent));
            graphics.DrawLine(pen, bounds.Left, y, bounds.Right, y);
        }

        // Columns, converging on the vanishing point.
        var centre = bounds.Left + bounds.Width / 2f;

        for (var column = -7; column <= 7; column++)
        {
            var atFloor = centre + column * (bounds.Width / 7f);
            var atHorizon = centre + column * (bounds.Width / 46f);

            using var pen = new Pen(Color.FromArgb(30, Palette.Accent));
            graphics.DrawLine(pen, atHorizon, horizon, atFloor, bounds.Bottom);
        }

        graphics.SmoothingMode = previous;
    }

    /// <summary>
    /// Headings, labels and buttons.
    /// </summary>
    /// <remarks>
    /// Bahnschrift is Windows' own DIN — condensed, technical, and the reason
    /// this screen reads as equipment rather than as a web page. It ships with
    /// Windows 10 and 11, and on anything older GDI+ falls back silently to
    /// Segoe UI, which is a softer look but never a broken one.
    /// </remarks>
    public static Font Display(float size, FontStyle style = FontStyle.Bold)
    {
        try
        {
            var font = new Font("Bahnschrift", size, style);

            // GDI+ substitutes silently when a family is missing, so the only
            // way to know whether this machine really has it is to ask what
            // came back.
            if (font.Name.StartsWith("Bahnschrift", StringComparison.OrdinalIgnoreCase))
            {
                return font;
            }

            font.Dispose();
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not load Bahnschrift: {ex.Message}");
        }

        return new Font("Segoe UI", size, style);
    }
}
