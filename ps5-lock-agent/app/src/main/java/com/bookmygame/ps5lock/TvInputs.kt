package com.bookmygame.ps5lock

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.tv.TvContract
import android.media.tv.TvInputInfo
import android.media.tv.TvInputManager
import android.net.Uri
import android.os.Build

/**
 * Puts the PS5 on screen, and takes it off again.
 *
 * Switching a TV to one of its own HDMI inputs is an ordinary Android intent —
 * the same one this is fired from adb:
 *
 *   am start -a android.intent.action.VIEW \
 *     -d "content://com.tcl.tvpassthrough/.TvPassThroughService/HW1413744384" \
 *     -n com.tcl.tv/.TVActivity -f 0x10000000
 *
 * That was proven by hand on the café's own TVs before any of this was written,
 * which is why the design leans on it. Anything adb can start, an app can start.
 */
object TvInputs {

    /**
     * Switches the TV to the PS5.
     *
     * @return false when nothing could be found to switch to, so the caller can
     *   leave the lock screen up rather than report a session that never began.
     */
    fun showPs5(context: Context, config: AgentConfig): Boolean {
        val uri = config.hdmiUri ?: discoverPassthroughUri(context)

        if (uri.isNullOrBlank()) {
            AgentLog.error("No HDMI input to switch to. Set hdmiUri in station.json.")
            return false
        }

        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

                // Naming the TV's own activity, when it is known, is what makes
                // this land on the input rather than on a chooser or on
                // whatever else claims the scheme.
                config.hdmiComponent?.let { component ->
                    val parts = component.split("/")
                    if (parts.size == 2) {
                        val pkg = parts[0]
                        val cls = if (parts[1].startsWith(".")) pkg + parts[1] else parts[1]
                        setComponent(ComponentName(pkg, cls))
                    }
                }
            }

            context.startActivity(intent)
            AgentLog.info("Switched to $uri")
            true
        } catch (error: Exception) {
            AgentLog.error("Could not switch to the PS5: ${error.message}")
            false
        }
    }

    /**
     * Brings the lock screen back over whatever is on screen.
     *
     * The half that decides whether this is a lock at all. Firing an intent at
     * an HDMI input is easy; coming back when the paid time runs out means a
     * backgrounded app putting itself in front of the customer, which Android
     * only allows with SYSTEM_ALERT_WINDOW — granted once over adb when the
     * station is set up.
     */
    fun showLockScreen(context: Context) {
        try {
            val intent = Intent(context, LockActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                )
            }
            context.startActivity(intent)
        } catch (error: Exception) {
            AgentLog.error("Could not bring the lock screen back: ${error.message}")
        }
    }

    /**
     * Asks the TV what HDMI inputs it has.
     *
     * Preferred over the hardware id from the adb command, which is specific to
     * one input on one set. Enumerating means a replacement TV, or the PS5 moved
     * to a different socket, does not need a rebuild — and the override in
     * station.json is there for the day this disagrees with what actually works.
     */
    private fun discoverPassthroughUri(context: Context): String? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null

        val manager = context.getSystemService(Context.TV_INPUT_SERVICE) as? TvInputManager
            ?: return null

        val inputs = try {
            manager.tvInputList
        } catch (error: Exception) {
            AgentLog.warn("Could not list TV inputs: ${error.message}")
            return null
        }

        val hdmi = inputs.firstOrNull { it.type == TvInputInfo.TYPE_HDMI && it.isPassthroughInput }
            ?: inputs.firstOrNull { it.isPassthroughInput }

        if (hdmi == null) {
            AgentLog.warn("This TV reports no HDMI passthrough inputs.")
            return null
        }

        AgentLog.info("Using discovered input ${hdmi.id}")
        return TvContract.buildChannelUriForPassthroughInput(hdmi.id).toString()
    }
}
