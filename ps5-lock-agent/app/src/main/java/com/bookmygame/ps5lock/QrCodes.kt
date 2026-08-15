package com.bookmygame.ps5lock

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * Draws the code a customer scans.
 *
 * Black on white, never themed to match the screen around it. A QR is read by
 * contrast, and a tasteful dark one on a dark background is a support call per
 * customer — doubly so here, where it is being photographed across a room off a
 * large glossy panel rather than held at arm's length.
 */
object QrCodes {

    fun render(text: String, sizePx: Int): Bitmap? {
        return try {
            val hints = mapOf(
                // Q corrects about a quarter of the symbol, which buys back what
                // a TV's glare and a phone's angle take away.
                EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.Q,
                EncodeHintType.MARGIN to 2
            )

            val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
            val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)

            for (x in 0 until sizePx) {
                for (y in 0 until sizePx) {
                    bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }

            bitmap
        } catch (error: Exception) {
            AgentLog.warn("Could not draw the code: ${error.message}")
            null
        }
    }
}
