namespace PcLockAgent;

/// <summary>
/// BookMyGame colours, matched to the customer-facing site so the kiosk screens
/// look like part of the same product.
/// </summary>
internal static class Palette
{
    public static readonly Color Background = Color.FromArgb(0x0A, 0x0E, 0x17);

    /// <summary>Top of the page gradient — a shade lighter than the bottom.</summary>
    public static readonly Color BackgroundTop = Color.FromArgb(0x12, 0x18, 0x28);

    /// <summary>
    /// The accent glow behind the heading. Alpha is most of the point: at full
    /// strength this brand pink would fight everything on the screen.
    /// </summary>
    public static readonly Color Glow = Color.FromArgb(38, 0xE1, 0x1D, 0x48);
    public static readonly Color Surface = Color.FromArgb(0x11, 0x18, 0x27);
    public static readonly Color SurfaceHover = Color.FromArgb(0x1B, 0x24, 0x37);
    public static readonly Color Accent = Color.FromArgb(0xE1, 0x1D, 0x48);
    public static readonly Color TextPrimary = Color.FromArgb(0xF1, 0xF5, 0xF9);
    public static readonly Color TextMuted = Color.FromArgb(0x94, 0xA3, 0xB8);
    public static readonly Color Border = Color.FromArgb(0x1E, 0x29, 0x3B);
    public static readonly Color Online = Color.FromArgb(0x22, 0xC5, 0x5E);
    public static readonly Color Warning = Color.FromArgb(0xF5, 0x9E, 0x0B);
}
