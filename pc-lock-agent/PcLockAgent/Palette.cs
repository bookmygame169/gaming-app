namespace PcLockAgent;

/// <summary>
/// BookMyGame colours, matched to the customer-facing site so the kiosk screens
/// look like part of the same product.
/// </summary>
internal static class Palette
{
    public static readonly Color Background = Color.FromArgb(0x0B, 0x0B, 0x0C);

    /// <summary>
    /// The lift at the centre of the arena backdrop.
    /// </summary>
    /// <remarks>
    /// A single soft pool of light behind the content, rather than a gradient
    /// across the whole screen. On a 1920px panel a corner-to-corner gradient
    /// reads as a colour cast; a pool reads as a lit stage.
    /// </remarks>
    public static readonly Color BackdropCore = Color.FromArgb(0x2A, 0x33, 0x12);

    /// <summary>Fill for the angular panels the new screens are built from.</summary>
    public static readonly Color PanelFill = Color.FromArgb(0x14, 0x14, 0x16);

    /// <summary>
    /// The cold light in the backdrop, opposite <see cref="BackdropCore"/>.
    /// </summary>
    /// <remarks>
    /// Two lights rather than one, and deliberately different temperatures: a
    /// single glow reads as a spotlight on a stage, while a warm one and a cold
    /// one at opposite corners read as a room somebody is sitting in.
    /// </remarks>
    /// <summary>
    /// The ticket: cream paper laid on the dark screen.
    /// </summary>
    /// <remarks>
    /// The one light surface in the whole app, and it earns that by being the
    /// thing a customer is meant to read prices off. Anything drawn on it takes
    /// <see cref="Ink"/>, never a text colour picked for the dark side.
    /// </remarks>
    public static readonly Color Cream = Color.FromArgb(0xF2, 0xF0, 0xEA);

    /// <summary>
    /// Near-black, for text on <see cref="Cream"/> or on <see cref="Accent"/>.
    /// </summary>
    /// <remarks>
    /// The accent is a bright lime now. White on it is unreadable, so every
    /// filled button carries this instead - which is why it exists as a named
    /// colour rather than as Color.Black scattered about.
    /// </remarks>
    public static readonly Color Ink = Color.FromArgb(0x0B, 0x0B, 0x0C);

    public static readonly Color BackdropCold = Color.FromArgb(0x16, 0x16, 0x18);

    /// <summary>The dimmest text on screen - captions nobody has to read.</summary>
    public static readonly Color TextDim = Color.FromArgb(0x4F, 0x4E, 0x4A);

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
    public static readonly Color BackgroundTop = Color.FromArgb(0x14, 0x14, 0x16);

    public static readonly Color Surface = Color.FromArgb(0x16, 0x16, 0x18);
    public static readonly Color SurfaceHover = Color.FromArgb(0x1F, 0x1F, 0x22);

    /// <summary>
    /// Fill for the floating cards.
    /// </summary>
    /// <remarks>
    /// Nearly, but not fully, opaque: the stars and lights behind stay faintly
    /// visible through it, which is what makes a card read as floating above the
    /// sky rather than as a hole punched in it.
    /// </remarks>
    public static readonly Color CardFill = Color.FromArgb(0xE8, 0x14, 0x14, 0x16);

    /// <summary>
    /// The same colour with no transparency, for controls that hold children.
    /// </summary>
    /// <remarks>
    /// A WinForms control with a transparent background takes it from its
    /// nearest opaque ancestor, not from what is painted underneath — so a tile
    /// using <see cref="CardFill"/> would have its label showing the sky. Tiles
    /// use this and get the same colour, minus the depth.
    /// </remarks>
    public static readonly Color CardFillOpaque = Color.FromArgb(0x14, 0x14, 0x16);

    public static readonly Color CardBorder = Color.FromArgb(0x2A, 0x2A, 0x2D);

    /// <summary>
    /// The rules inside a card.
    /// </summary>
    /// <remarks>
    /// Lighter than <see cref="CardBorder"/> on purpose. A border has a shape
    /// change either side of it and reads at almost any contrast; a one-pixel
    /// line across a flat card has neither, and at the border's value it simply
    /// was not there.
    /// </remarks>
    public static readonly Color Divider = Color.FromArgb(0x4A, 0x4A, 0x4E);

    public static readonly Color Accent = Color.FromArgb(0xD8, 0xFF, 0x3C);

    /// <summary>The far end of the emblem's gradient.</summary>
    public static readonly Color AccentDeep = Color.FromArgb(0x9C, 0xBD, 0x1F);

    /// <summary>Lighter rose, for text that should carry the brand but stay readable.</summary>
    public static readonly Color AccentSoft = Color.FromArgb(0xE8, 0xFF, 0x8A);

    public static readonly Color TextPrimary = Color.FromArgb(0xF2, 0xF0, 0xEA);
    public static readonly Color TextMuted = Color.FromArgb(0x9A, 0x98, 0x92);
    public static readonly Color TextFaint = Color.FromArgb(0x6E, 0x6D, 0x68);
    public static readonly Color Border = Color.FromArgb(0x2A, 0x2A, 0x2D);
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

    public static readonly Color GlowAccent = Color.FromArgb(30, 0xD8, 0xFF, 0x3C);
}
