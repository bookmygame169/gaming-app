using QRCoder;

namespace PcLockAgent;

/// <summary>
/// Draws a QR code, black on white.
/// </summary>
/// <remarks>
/// Deliberately not themed. Phone cameras read a QR by contrast, and a
/// tastefully dark one on a dark screen is a support call per customer — the
/// white quiet zone around it is part of the specification, not a border that
/// can be trimmed for looks.
/// <para>
/// Shared by the two codes a locked screen can show: the one that sends a
/// customer's phone to the booking page, and the one that pays the café
/// directly. They have nothing in common but this.
/// </para>
/// </remarks>
internal static class QrImage
{
    /// <param name="content">The text the code carries.</param>
    /// <param name="pixelsPerModule">
    /// Size of one square of the pattern. Bigger is easier to scan and bigger
    /// on screen; the caller scales the result to fit its own layout.
    /// </param>
    public static Image? Render(string content, int pixelsPerModule = 10)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return null;
        }

        try
        {
            using var generator = new QRCodeGenerator();

            // Q corrects about a quarter of the symbol. Worth the extra density
            // here: these are read at an angle, off a glossy panel, in a room
            // lit for gaming rather than for scanning.
            using var data = generator.CreateQrCode(content, QRCodeGenerator.ECCLevel.Q);
            using var code = new PngByteQRCode(data);

            var png = code.GetGraphic(pixelsPerModule);
            using var stream = new MemoryStream(png);
            using var loaded = Image.FromStream(stream);

            return new Bitmap(loaded);
        }
        catch (Exception ex)
        {
            AgentLog.Warn($"Could not draw a QR code: {ex.Message}");
            return null;
        }
    }
}
