namespace PcLockAgent;

/// <summary>
/// BookMyGame colours, matched to the customer-facing site so the kiosk screens
/// look like part of the same product.
/// </summary>
internal static class Palette
{
    public static readonly Color Background = Color.FromArgb(0x05, 0x07, 0x0C);

    /// <summary>
    /// The lift at the centre of the arena backdrop.
    /// </summary>
    /// <remarks>
    /// A single soft pool of light behind the content, rather than a gradient
    /// across the whole screen. On a 1920px panel a corner-to-corner gradient
    /// reads as a colour cast; a pool reads as a lit stage.
    /// </remarks>
    public static readonly Color BackdropCore = Color.FromArgb(0x14, 0x19, 0x2B);

    /// <summary>Fill for the angular panels the new screens are built from.</summary>
    public static readonly Color PanelFill = Color.FromArgb(0x0A, 0x0E, 0x18);

    /// <summary>The dimmest text on screen - captions nobody has to read.</summary>
    public static readonly Color TextDim = Color.FromArgb(0x47, 0x55, 0x69);

    /// <summary>Top of the page gradient — a shade lighter than the bottom.</summary>
    public static readonly Color BackgroundTop = Color.FromArgb(0x0E, 0x14, 0x23);

    public static readonly Color Surface = Color.FromArgb(0x11, 0x18, 0x27);
    public static readonly Color SurfaceHover = Color.FromArgb(0x1B, 0x24, 0x37);

    /// <summary>
    /// Fill for the floating cards.
    /// </summary>
    /// <remarks>
    /// Nearly, but not fully, opaque: the stars and lights behind stay faintly
    /// visible through it, which is what makes a card read as floating above the
    /// sky rather than as a hole punched in it.
    /// </remarks>
    public static readonly Color CardFill = Color.FromArgb(0xE8, 0x0B, 0x11, 0x1E);

    /// <summary>
    /// The same colour with no transparency, for controls that hold children.
    /// </summary>
    /// <remarks>
    /// A WinForms control with a transparent background takes it from its
    /// nearest opaque ancestor, not from what is painted underneath — so a tile
    /// using <see cref="CardFill"/> would have its label showing the sky. Tiles
    /// use this and get the same colour, minus the depth.
    /// </remarks>
    public static readonly Color CardFillOpaque = Color.FromArgb(0x0B, 0x11, 0x1E);

    public static readonly Color CardBorder = Color.FromArgb(0x24, 0x1C, 0x2E);

    /// <summary>
    /// The rules inside a card.
    /// </summary>
    /// <remarks>
    /// Lighter than <see cref="CardBorder"/> on purpose. A border has a shape
    /// change either side of it and reads at almost any contrast; a one-pixel
    /// line across a flat card has neither, and at the border's value it simply
    /// was not there.
    /// </remarks>
    public static readonly Color Divider = Color.FromArgb(0x5A, 0x4A, 0x68);

    public static readonly Color Accent = Color.FromArgb(0xE1, 0x1D, 0x48);

    /// <summary>The far end of the emblem's gradient.</summary>
    public static readonly Color AccentDeep = Color.FromArgb(0x7F, 0x10, 0x30);

    /// <summary>Lighter rose, for text that should carry the brand but stay readable.</summary>
    public static readonly Color AccentSoft = Color.FromArgb(0xFB, 0x71, 0x85);

    public static readonly Color TextPrimary = Color.FromArgb(0xF1, 0xF5, 0xF9);
    public static readonly Color TextMuted = Color.FromArgb(0x94, 0xA3, 0xB8);
    public static readonly Color TextFaint = Color.FromArgb(0x64, 0x74, 0x8B);
    public static readonly Color Border = Color.FromArgb(0x1E, 0x29, 0x3B);
    public static readonly Color Online = Color.FromArgb(0x22, 0xC5, 0x5E);
    public static readonly Color Warning = Color.FromArgb(0xF5, 0x9E, 0x0B);

    /// <summary>
    /// The out-of-focus lights in the backdrop.
    /// </summary>
    /// <remarks>
    /// Alpha is most of the point. At full strength either of these would fight
    /// everything placed on top; at this weight they read as depth.
    /// </remarks>
    public static readonly Color GlowWarm = Color.FromArgb(30, 0xF5, 0x9E, 0x0B);

    public static readonly Color GlowAccent = Color.FromArgb(34, 0xE1, 0x1D, 0x48);
}
