package com.bookmygame.ps5lock

import android.content.Context

/**
 * How much paid time is left.
 *
 * Written to disk on every change, for the same reason the Windows agent does
 * it: the TV can be unplugged, the app can be killed, Android can decide to
 * reclaim memory. A customer who paid for an hour and lost it to a power cut
 * would rightly want that hour back, and the café would have no record of what
 * they were owed.
 */
object SessionState {
    private const val FILE_NAME = "session.txt"

    @Volatile
    private var endsAtMillis: Long = 0

    @Volatile
    var sessionId: String? = null
        private set

    val isRunning: Boolean
        get() = endsAtMillis > System.currentTimeMillis()

    val remainingSeconds: Long
        get() = ((endsAtMillis - System.currentTimeMillis()) / 1000).coerceAtLeast(0)

    fun start(context: Context, durationSeconds: Int, id: String?) {
        endsAtMillis = System.currentTimeMillis() + durationSeconds * 1000L
        sessionId = id
        persist(context)
    }

    fun stop(context: Context) {
        endsAtMillis = 0
        sessionId = null
        persist(context)
    }

    /** Picks up a session that was running when the app last stopped. */
    fun restore(context: Context) {
        try {
            val file = java.io.File(context.filesDir, FILE_NAME)
            if (!file.exists()) return

            val parts = file.readText().trim().split("|")
            val savedEnd = parts.getOrNull(0)?.toLongOrNull() ?: return

            if (savedEnd > System.currentTimeMillis()) {
                endsAtMillis = savedEnd
                sessionId = parts.getOrNull(1)?.ifBlank { null }
                AgentLog.info("Resumed a session with ${remainingSeconds}s left.")
            } else {
                file.delete()
            }
        } catch (error: Exception) {
            AgentLog.warn("Could not restore the session: ${error.message}")
        }
    }

    private fun persist(context: Context) {
        try {
            val file = java.io.File(context.filesDir, FILE_NAME)
            if (endsAtMillis <= 0) {
                file.delete()
            } else {
                file.writeText("$endsAtMillis|${sessionId ?: ""}")
            }
        } catch (error: Exception) {
            // Never fatal. A lost file costs a customer their remaining time,
            // which is bad; refusing to run the session at all is worse.
            AgentLog.warn("Could not save the session: ${error.message}")
        }
    }
}
