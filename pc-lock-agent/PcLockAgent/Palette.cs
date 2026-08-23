namespace PcLockAgent;

/// <summary>
/// BookMyGame colours, matched to the customer-facing site so the kiosk screens
/// look like part of the same product.
/// </summary>
internal static class Palette
{
    public static readonly Color Background = Color.FromArgb(0x0A, 0x07, 0x11);

    /// <summary>
    /// The lift at the centre of the arena backdrop.
    /// </summary>
    /// <remarks>
    /// A single soft pool of light behind the content, rather than a gradient
    /// across the whole screen. On a 1920px panel a corner-to-corner gradient
    /// reads as a colour cast; a pool reads as a lit stage.
    /// </remarks>
    public static readonly Color BackdropCore = Color.FromArgb(0x7A, 0x1E, 0x52);

    /// <summary>Fill for the angular panels the new screens are built from.</summary>
    public static readonly Color PanelFill = Color.FromArgb(0x12, 0x0C, 0x1B);

    /// <summary>
    /// The cold light in the backdrop, opposite <see cref="BackdropCore"/>.
    /// </summary>
    /// <remarks>
    /// Two lights rather than one, and deliberately different temperatures: a
    /// single glow reads as a spotlight on a stage, while a warm one and a cold
    /// one at opposite corners read as a room somebody is sitting in.
    /// </remarks>
    public static readonly Color BackdropCold = Color.FromArgb(0x14, 0x40, 0x5E);

    /// <summary>The dimmest text on screen - captions nobody has to read.</summary>
    public static readonly Color TextDim = Color.FromArgb(0x4A, 0x3D, 0x5C);

    /// <summary>
    /// The one colour on these screens that is not the brand's.
    /// </summary>
    /// <remarks>
    /// Reserved for telling a member they are about to pay for something they
    /// already own. Everything else is rose, so a note in cyan is read as a
    /// different kind of message rather than more of the same one.
    /// </remarks>
    public static readonly Color Cyan = Color.FromArgb(0x35, 0xE6, 0xE0);

    /// <summary>Top of the page gradient — a shade lighter than the bottom.</summary>
    public static readonly Color BackgroundTop = Color.FromArgb(0x12, 0x0C, 0x1B);

    public static readonly Color Surface = Color.FromArgb(0x17, 0x0F, 0x23);
    public static readonly Color SurfaceHover = Color.FromArgb(0x22, 0x16, 0x31);

    /// <summary>
    /// Fill for the floating cards.
    /// </summary>
    /// <remarks>
    /// Nearly, but not fully, opaque: the stars and lights behind stay faintly
    /// visible through it, which is what makes a card read as floating above the
    /// sky rather than as a hole punched in it.
    /// </remarks>
    public static readonly Color CardFill = Color.FromArgb(0xE8, 0x12, 0x0C, 0x1B);

    /// <summary>
    /// The same colour with no transparency, for controls that hold children.
    /// </summary>
    /// <remarks>
    /// A WinForms control with a transparent background takes it from its
    /// nearest opaque ancestor, not from what is painted underneath — so a tile
    /// using <see cref="CardFill"/> would have its label showing the sky. Tiles
    /// use this and get the same colour, minus the depth.
    /// </remarks>
    public static readonly Color CardFillOpaque = Color.FromArgb(0x12, 0x0C, 0x1B);

    public static readonly Color CardBorder = Color.FromArgb(0x2A, 0x1E, 0x3A);

    /// <summary>
    /// The rules inside a card.
    /// </summary>
    /// <remarks>
    /// Lighter than <see cref="CardBorder"/> on purpose. A border has a shape
    /// change either side of it and reads at almost any contrast; a one-pixel
    /// line across a flat card has neither, and at the border's value it simply
    /// was not there.
    /// </remarks>
    public static readonly Color Divider = Color.FromArgb(0x50, 0x40, 0x66);

    public static readonly Color Accent = Color.FromArgb(0xFF, 0x2E, 0x63);

    /// <summary>The far end of the emblem's gradient.</summary>
    public static readonly Color AccentDeep = Color.FromArgb(0xB3, 0x12, 0x3F);

    /// <summary>Lighter rose, for text that should carry the brand but stay readable.</summary>
    public static readonly Color AccentSoft = Color.FromArgb(0xFF, 0x7A, 0x9C);

    public static readonly Color TextPrimary = Color.FromArgb(0xF7, 0xF3, 0xFB);
    public static readonly Color TextMuted = Color.FromArgb(0x9B, 0x8C, 0xAF);
    public static readonly Color TextFaint = Color.FromArgb(0x6A, 0x5C, 0x7D);
    public static readonly Color Border = Color.FromArgb(0x2A, 0x1E, 0x3A);
    public static readonly Color Online = Color.FromArgb(0x3D, 0xDC, 0x84);
    public static readonly Color Warning = Color.FromArgb(0xF5, 0x9E, 0x0B);

    /// <summary>
    /// The out-of-focus lights in the backdrop.
    /// </summary>
    /// <remarks>
    /// Alpha is most of the point. At full strength either of these would fight
    /// everything placed on top; at this weight they read as depth.
    /// </remarks>
    public static readonly Color GlowWarm = Color.FromArgb(30, 0xF5, 0x9E, 0x0B);

    public static readonly Color GlowAccent = Color.FromArgb(34, 0xFF, 0x2E, 0x63);
}
