package com.bookmygame.ps5lock

import android.content.Context
import org.json.JSONObject

/**
 * Per-TV settings.
 *
 * Deliberately a file rather than a build constant, so one APK serves every
 * station and a café adding a fourth PS5 does not need a new build. It is
 * written when the station is set up:
 *
 *   adb push station.json /sdcard/Android/data/com.bookmygame.ps5lock/files/
 *
 * or by redeeming a setup code from the dashboard, the same way the Windows
 * agent enrols itself.
 */
data class AgentConfig(
    val stationId: String,
    val mqttHost: String,
    val mqttPort: Int,
    val mqttUseTls: Boolean,
    val mqttUsername: String?,
    val mqttPassword: String?,
    val heartbeatUrl: String?,
    val heartbeatToken: String?,
    val cafeId: String?,
    /**
     * The HDMI input to switch to, as the passthrough URI the TV understands.
     *
     * Null means "work it out", which is what should normally happen — see
     * [TvInputs]. It is here because a hardware id proven to work by hand is
     * worth more than anything this app can deduce, and on the day enumeration
     * disagrees with reality somebody needs a way to say so without a rebuild.
     */
    val hdmiUri: String?,
    val hdmiComponent: String?
) {
    val isEnrolled: Boolean
        get() = !heartbeatToken.isNullOrBlank() && !cafeId.isNullOrBlank()

    companion object {
        private const val FILE_NAME = "station.json"

        fun load(context: Context): AgentConfig {
            val file = java.io.File(context.getExternalFilesDir(null), FILE_NAME)

            val json = try {
                if (file.exists()) JSONObject(file.readText()) else JSONObject()
            } catch (error: Exception) {
                AgentLog.warn("Could not read $FILE_NAME: ${error.message}")
                JSONObject()
            }

            val mqtt = json.optJSONObject("mqtt") ?: JSONObject()
            val heartbeat = json.optJSONObject("heartbeat") ?: JSONObject()

            return AgentConfig(
                // Lower case to match the MQTT topic the website publishes to.
                // PS5-01 here would silently never receive a command.
                stationId = json.optString("stationId", "ps5-01").lowercase(),
                mqttHost = mqtt.optString("host", "127.0.0.1"),
                mqttPort = mqtt.optInt("port", 1883),
                mqttUseTls = mqtt.optBoolean("useTls", false),
                mqttUsername = mqtt.optStringOrNull("username"),
                mqttPassword = mqtt.optStringOrNull("password"),
                heartbeatUrl = heartbeat.optStringOrNull("url"),
                heartbeatToken = heartbeat.optStringOrNull("token"),
                cafeId = heartbeat.optStringOrNull("cafeId"),
                hdmiUri = json.optStringOrNull("hdmiUri"),
                hdmiComponent = json.optStringOrNull("hdmiComponent")
            )
        }

        private fun JSONObject.optStringOrNull(key: String): String? {
            if (!has(key) || isNull(key)) return null
            val value = optString(key)
            return value.ifBlank { null }
        }
    }
}
