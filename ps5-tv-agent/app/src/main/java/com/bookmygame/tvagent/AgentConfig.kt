package com.bookmygame.tvagent

import android.content.Context

/**
 * What this particular TV knows about itself.
 *
 * Written once by the setup screen when a code is redeemed, and read on every
 * start after that. Deliberately the same shape the PC agent stores, because
 * it comes from the same /api/stations/enroll response.
 *
 * Kept in private SharedPreferences rather than a file on shared storage: the
 * broker password and the heartbeat token are in here.
 */
class AgentConfig(context: Context) {

    private val prefs = context.getSharedPreferences("agent", Context.MODE_PRIVATE)

    var stationName: String?
        get() = prefs.getString("stationName", null)
        set(value) = prefs.edit().putString("stationName", value).apply()

    var cafeId: String?
        get() = prefs.getString("cafeId", null)
        set(value) = prefs.edit().putString("cafeId", value).apply()

    var cafeName: String?
        get() = prefs.getString("cafeName", null)
        set(value) = prefs.edit().putString("cafeName", value).apply()

    var heartbeatUrl: String?
        get() = prefs.getString("heartbeatUrl", null)
        set(value) = prefs.edit().putString("heartbeatUrl", value).apply()

    var heartbeatToken: String?
        get() = prefs.getString("heartbeatToken", null)
        set(value) = prefs.edit().putString("heartbeatToken", value).apply()

    var mqttHost: String?
        get() = prefs.getString("mqttHost", null)
        set(value) = prefs.edit().putString("mqttHost", value).apply()

    var mqttPort: Int
        get() = prefs.getInt("mqttPort", 8883)
        set(value) = prefs.edit().putInt("mqttPort", value).apply()

    var mqttUseTls: Boolean
        get() = prefs.getBoolean("mqttUseTls", true)
        set(value) = prefs.edit().putBoolean("mqttUseTls", value).apply()

    var mqttUsername: String?
        get() = prefs.getString("mqttUsername", null)
        set(value) = prefs.edit().putString("mqttUsername", value).apply()

    var mqttPassword: String?
        get() = prefs.getString("mqttPassword", null)
        set(value) = prefs.edit().putString("mqttPassword", value).apply()

    /** Which HDMI socket the PS5 is plugged into, chosen during setup. */
    var hdmiInputId: String?
        get() = prefs.getString("hdmiInputId", null)
        set(value) = prefs.edit().putString("hdmiInputId", value).apply()

    /** Where the site lives. Must be the www host - see the README. */
    var siteOrigin: String
        get() = prefs.getString("siteOrigin", DEFAULT_ORIGIN) ?: DEFAULT_ORIGIN
        set(value) = prefs.edit().putString("siteOrigin", value).apply()

    val isEnrolled: Boolean
        get() = !stationName.isNullOrBlank() && !cafeId.isNullOrBlank()

    fun clear() = prefs.edit().clear().apply()

    companion object {
        /**
         * The apex redirects to www, and an HTTP client drops the
         * Authorization header across a host-changing redirect - which makes a
         * correct token look like a wrong one. Always the final host.
         */
        const val DEFAULT_ORIGIN = "https://www.bookmygame.co.in"
    }
}
