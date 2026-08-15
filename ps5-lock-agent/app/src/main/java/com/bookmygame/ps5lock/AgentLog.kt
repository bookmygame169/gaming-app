package com.bookmygame.ps5lock

import android.util.Log

/**
 * Logging, to logcat and nowhere else.
 *
 * The Windows agent keeps its own file because a café PC has no other way to
 * be inspected. A TV always has adb, which is how it was set up in the first
 * place, so `adb logcat -s BookMyGamePS5` is both simpler and always available.
 */
object AgentLog {
    private const val TAG = "BookMyGamePS5"

    fun info(message: String) = Log.i(TAG, message).let { }
    fun warn(message: String) = Log.w(TAG, message).let { }
    fun error(message: String) = Log.e(TAG, message).let { }
}
