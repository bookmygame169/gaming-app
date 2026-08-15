package com.bookmygame.ps5lock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Starts the agent when the TV powers on.
 *
 * The app is the TV's home screen, so it appears on its own — but the service
 * behind it is what listens for unlock commands and counts a session down, and
 * that has to be running whether or not anybody has looked at the screen yet.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            AgentLog.info("TV booted. Starting the agent.")
            AgentService.start(context)
        }
    }
}
