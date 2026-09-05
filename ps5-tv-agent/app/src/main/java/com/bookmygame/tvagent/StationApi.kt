package com.bookmygame.tvagent

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The three station routes the site already exposes.
 *
 * Nothing here is new server work: these are the same endpoints the Windows
 * agent has been using in production, called with the same payloads. A PS5
 * station is just another station as far as the site is concerned.
 */
class StationApi(private val config: AgentConfig) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        // Redirects are followed by default, and following one from the apex to
        // www drops the Authorization header - so the origin is pinned to www
        // and a redirect here means something is wrong rather than routine.
        .followRedirects(false)
        .build()

    private val json = "application/json; charset=utf-8".toMediaType()

    class ApiException(message: String, val status: Int) : Exception(message)

    private fun post(path: String, body: JSONObject, bearer: String? = null): JSONObject {
        val request = Request.Builder()
            .url(config.siteOrigin + path)
            .post(body.toString().toRequestBody(json))
            .apply { bearer?.let { header("Authorization", "Bearer $it") } }
            .build()

        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val parsed = try { JSONObject(text) } catch (_: Exception) { JSONObject() }

            if (!response.isSuccessful) {
                val message = parsed.optString("error").ifBlank { "Request failed (${response.code})" }
                throw ApiException(message, response.code)
            }
            return parsed
        }
    }

    /**
     * Trades a setup code generated in the owner dashboard for this station's
     * settings. The code is single use, so a failure here has to say why
     * clearly - the person is standing at the TV with a remote.
     */
    fun enroll(code: String): JSONObject =
        post("/api/stations/enroll", JSONObject().put("code", code))

    /**
     * A short-lived token for the QR on the locked screen.
     *
     * Re-issued well before it expires rather than once at startup: a station
     * sits locked for hours, and a stale code sends a paying customer to a
     * page that refuses them.
     */
    fun unlockToken(): String {
        val body = JSONObject()
            .put("cafeId", config.cafeId)
            .put("stationName", config.stationName)
        return post("/api/stations/unlock-token", body, config.heartbeatToken).getString("token")
    }

    /**
     * Says this station is alive, and what it is showing.
     *
     * The dashboard treats a station that has not reported in 90 seconds as
     * offline, and the QR flow refuses to take money for an offline machine -
     * so this failing is not cosmetic, it stops sales.
     */
    fun heartbeat(status: String, sessionId: String?, version: String) {
        val body = JSONObject()
            .put("cafeId", config.cafeId)
            .put("stationName", config.stationName)
            .put("status", status)
            .put("version", version)
        sessionId?.let { body.put("sessionId", it) }

        try {
            post("/api/stations/heartbeat", body, config.heartbeatToken)
        } catch (err: Exception) {
            // Logged, never thrown: a missed heartbeat must not take the lock
            // down with it. The next one is thirty seconds away.
            Log.w("StationApi", "Heartbeat failed: ${err.message}")
        }
    }
}
