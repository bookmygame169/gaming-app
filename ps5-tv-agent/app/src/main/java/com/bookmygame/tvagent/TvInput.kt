package com.bookmygame.tvagent

import android.content.Context
import android.content.Intent
import android.media.tv.TvContract
import android.media.tv.TvInputInfo
import android.media.tv.TvInputManager
import android.util.Log

/**
 * Puts the PS5 on the screen, or takes it off again.
 *
 * The TV has the PS5 on one of its HDMI sockets and this app on its home
 * screen. "Unlocking" is switching the TV to that HDMI input; "locking" is
 * bringing this app back to the front, which switches away from it.
 *
 * Android exposes an HDMI socket as a "passthrough input" - a TV input with a
 * fixed id like "com.sony.dtv.hdmi/.HdmiInputService/HW2". Opening one is a
 * plain ACTION_VIEW on a URI built from that id, which is the same thing the
 * TV's own Source menu does.
 *
 * NOT YET VERIFIED ON A REAL SET. Manufacturers vary in whether they let a
 * non-system app open a passthrough input, and some Google TV builds refuse
 * it. discoverInputs() is here so the first thing setup does on a new TV is
 * list what that TV actually reports, rather than guessing an id.
 */
object TvInput {

    private const val TAG = "TvInput"

    data class HdmiInput(
        val id: String,
        /** What the TV calls it - usually "HDMI 1", "HDMI 2". */
        val label: String,
    )

    /**
     * Every HDMI socket this TV reports, for the setup screen to offer.
     *
     * The ids are opaque and differ by manufacturer, so the station's is
     * chosen once during setup and stored, rather than worked out each time.
     */
    fun discoverInputs(context: Context): List<HdmiInput> {
        val manager = context.getSystemService(Context.TV_INPUT_SERVICE) as? TvInputManager
        if (manager == null) {
            Log.w(TAG, "This device has no TV input service; it is probably not a TV.")
            return emptyList()
        }

        return try {
            manager.tvInputList
                .filter { it.type == TvInputInfo.TYPE_HDMI && it.isPassthroughInput }
                .map { info ->
                    HdmiInput(
                        id = info.id,
                        label = info.loadLabel(context)?.toString() ?: info.id,
                    )
                }
        } catch (err: Exception) {
            // A TV that refuses to enumerate is a TV that will refuse to
            // switch, and the setup screen needs to say so rather than crash.
            Log.e(TAG, "Could not read the TV's input list", err)
            emptyList()
        }
    }

    /**
     * Shows the PS5, by opening the HDMI input it is plugged into.
     *
     * Returns false if the TV refused, which the caller must not treat as an
     * unlock: reporting "unlocked" for a station still showing the locked
     * screen is how a customer ends up paying for time they cannot use.
     */
    fun showPs5(context: Context, inputId: String): Boolean {
        return try {
            val uri = TvContract.buildChannelUriForPassthroughInput(inputId)
            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            Log.i(TAG, "Switched the TV to $inputId")
            true
        } catch (err: Exception) {
            Log.e(TAG, "The TV refused to switch to $inputId", err)
            false
        }
    }

    /**
     * Takes the PS5 off the screen by putting this app back in front of it.
     *
     * There is no "switch away from HDMI" call. Starting our own activity is
     * the switch: whatever is in front is what the TV shows. This is the part
     * that needs SYSTEM_ALERT_WINDOW, because by the time it runs the app has
     * been in the background for however long the session lasted.
     */
    fun showLockScreen(context: Context, reason: String) {
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            putExtra(MainActivity.EXTRA_REASON, reason)
        }
        try {
            context.startActivity(intent)
            Log.i(TAG, "Brought the locked screen back: $reason")
        } catch (err: Exception) {
            // Nothing else can rescue this: the PS5 stays on screen until
            // somebody presses Home. Logged loudly because it is the one
            // failure that costs the cafe money silently.
            Log.e(TAG, "Could not bring the locked screen back - the PS5 is still on screen", err)
        }
    }
}
