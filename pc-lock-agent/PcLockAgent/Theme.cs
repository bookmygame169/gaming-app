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
    public const int CardRadius = 18;

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
    public static void PaintCard(Graphics graphics, Rectangle rect, bool highlighted = false)
    {
        if (rect.Width <= 0 || rect.Height <= 0)
        {
            return;
        }

        graphics.SmoothingMode = SmoothingMode.AntiAlias;

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
