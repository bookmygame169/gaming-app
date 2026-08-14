using System.Drawing.Drawing2D;

namespace PcLockAgent;

/// <summary>
/// Shared drawing for the kiosk screens.
/// </summary>
/// <remarks>
/// These screens are the whole of what a customer sees for the length of their
/// session — there is no browser chrome or desktop around them to carry any of
/// the look. A flat fill and square boxes read as an error dialog rather than
/// something you paid to sit in front of.
/// <para>
/// The techniques here are deliberately dull ones: a gradient, a soft glow,
/// clipped corners. Nothing depends on a compositor, a transparency mode, or a
/// particular Windows version, because a screen that fails to paint on one café
/// PC is a machine nobody can use.
/// </para>
/// </remarks>
internal static class Theme
{
    /// <summary>Corner radius shared by tiles and panels.</summary>
    public const int CornerRadius = 14;

    /// <summary>
    /// Paints the page background: a vertical gradient with a soft accent glow
    /// behind the top-left, where the heading sits.
    /// </summary>
    public static void PaintBackdrop(Graphics graphics, Rectangle bounds)
    {
        if (bounds.Width <= 0 || bounds.Height <= 0)
        {
            return;
        }

        using (var gradient = new LinearGradientBrush(
                   bounds, Palette.BackgroundTop, Palette.Background, LinearGradientMode.Vertical))
        {
            graphics.FillRectangle(gradient, bounds);
        }

        // Sized to the screen rather than a fixed pixel count so it lands in the
        // same place on a 1080p café PC and a larger monitor.
        var glowSize = Math.Max(bounds.Width, bounds.Height) * 3 / 4;
        var glowArea = new Rectangle(
            bounds.Left - glowSize / 3,
            bounds.Top - glowSize / 2,
            glowSize,
            glowSize);

        using var glowPath = new GraphicsPath();
        glowPath.AddEllipse(glowArea);

        using var glow = new PathGradientBrush(glowPath)
        {
            CenterColor = Palette.Glow,
            SurroundColors = [Color.FromArgb(0, Palette.Glow)],
        };

        var clip = graphics.Clip;
        graphics.SetClip(bounds);
        graphics.FillPath(glow, glowPath);
        graphics.Clip = clip;
    }

    /// <summary>A rounded rectangle, for clipping a control or drawing a border.</summary>
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
    /// background, because WinForms transparency is inherited from the nearest
    /// opaque ancestor: a label inside a tile that painted its own rounded fill
    /// would show the page behind it instead of the tile. Clipping keeps the
    /// control opaque, so its children behave, and only the corners are cut.
    /// <para>
    /// The cut edge is not anti-aliased. The border drawn over it is, which is
    /// what the eye follows.
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

    /// <summary>Draws a rounded border just inside a control's edge.</summary>
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
