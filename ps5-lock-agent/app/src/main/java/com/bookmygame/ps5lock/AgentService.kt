package com.bookmygame.ps5lock

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.MqttCallback
import org.eclipse.paho.client.mqttv3.MqttClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Everything that has to keep running while the customer is playing.
 *
 * A foreground service rather than work tied to the activity, because the
 * activity is not on screen for most of a session — the TV is showing the PS5.
 * Something has to be counting down and listening for a lock command while that
 * is true, and on Android nothing in the background is guaranteed to live long
 * unless it says why it needs to.
 */
class AgentService : Service() {

    private lateinit var config: AgentConfig
    private var mqtt: MqttClient? = null

    private val work = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var ticking = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()

        config = AgentConfig.load(this)
        SessionState.restore(this)

        startForeground(NOTIFICATION_ID, buildNotification())

        AgentLog.info("Agent starting for station ${config.stationId}.")

        connectMqtt()
        startHeartbeat()
        startCountdown()

        // A session that survived a restart puts the PS5 straight back on
        // screen, so a power cut mid-session does not cost the customer the
        // rest of their time.
        if (SessionState.isRunning) {
            main.post { TvInputs.showPs5(this, config) }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Restarted by the system if it is ever killed: the whole point is that
        // this outlives everything else on the TV.
        return START_STICKY
    }

    override fun onDestroy() {
        ticking = false
        try {
            mqtt?.disconnectForcibly(500, 500)
        } catch (error: Exception) {
            // Shutting down; nothing useful left to do about it.
        }
        work.shutdownNow()
        super.onDestroy()
    }

    // -----------------------------------------------------------------------
    // The broker
    // -----------------------------------------------------------------------

    private fun connectMqtt() {
        work.execute {
            while (!Thread.currentThread().isInterrupted) {
                try {
                    val scheme = if (config.mqttUseTls) "ssl" else "tcp"
                    val url = "$scheme://${config.mqttHost}:${config.mqttPort}"

                    val client = MqttClient(url, "ps5-lock-${config.stationId}", MemoryPersistence())

                    val options = MqttConnectOptions().apply {
                        isCleanSession = true
                        isAutomaticReconnect = true
                        connectionTimeout = 10
                        keepAliveInterval = 30
                        config.mqttUsername?.let { userName = it }
                        config.mqttPassword?.let { password = it.toCharArray() }
                    }

                    client.setCallback(object : MqttCallback {
                        override fun connectionLost(cause: Throwable?) {
                            AgentLog.warn("Broker lost: ${cause?.message}. Station stays locked until it is back.")
                        }

                        override fun messageArrived(topic: String?, message: MqttMessage?) {
                            handleCommand(message?.toString())
                        }

                        override fun deliveryComplete(token: IMqttDeliveryToken?) = Unit
                    })

                    client.connect(options)
                    client.subscribe("cafe/station/${config.stationId}/command", 1)

                    mqtt = client
                    AgentLog.info("Connected to $url")
                    publishStatus()
                    return@execute
                } catch (error: Exception) {
                    AgentLog.warn("Broker connect failed (${error.message}). Retrying in 5s.")
                    try {
                        Thread.sleep(5000)
                    } catch (interrupted: InterruptedException) {
                        return@execute
                    }
                }
            }
        }
    }

    /**
     * Acts on a command from the backend.
     *
     * Every field is treated as missing until proved otherwise: this arrives off
     * the network from another codebase, and a malformed message must leave the
     * station locked rather than crash a TV nobody is watching.
     */
    private fun handleCommand(payload: String?) {
        if (payload.isNullOrBlank()) return

        try {
            val json = JSONObject(payload)

            when (json.optString("action").lowercase()) {
                "unlock" -> {
                    val seconds = json.optInt("duration_seconds", 0)
                    if (seconds <= 0) {
                        AgentLog.warn("Unlock with no duration ignored.")
                        return
                    }

                    val sessionId = json.optString("session_id").ifBlank { null }
                    AgentLog.info("Unlocking for ${seconds}s (session ${sessionId ?: "none"}).")

                    SessionState.start(this, seconds, sessionId)
                    main.post { TvInputs.showPs5(this, config) }
                    publishStatus()
                }

                "lock" -> {
                    AgentLog.info("Locking.")
                    SessionState.stop(this)
                    main.post { TvInputs.showLockScreen(this) }
                    publishStatus()
                }

                "warn" -> Unit

                else -> AgentLog.warn("Unknown action in: $payload")
            }
        } catch (error: Exception) {
            AgentLog.warn("Could not read a command: ${error.message}")
        }
    }

    private fun publishStatus() {
        val client = mqtt ?: return

        work.execute {
            try {
                val body = JSONObject().apply {
                    put("station_id", config.stationId)
                    put("status", if (SessionState.isRunning) "unlocked" else "locked")
                    put("session_id", SessionState.sessionId ?: JSONObject.NULL)
                    put("timestamp", java.text.SimpleDateFormat(
                        "yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US
                    ).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(java.util.Date()))
                }

                // Never retained. A retained status would be replayed to the
                // next subscriber as though it were current, which for a lock
                // means telling the dashboard a machine is unlocked long after
                // it stopped being.
                client.publish("cafe/station/${config.stationId}/status", body.toString().toByteArray(), 1, false)
            } catch (error: Exception) {
                AgentLog.warn("Could not publish status: ${error.message}")
            }
        }
    }

    // -----------------------------------------------------------------------
    // The website
    // -----------------------------------------------------------------------

    private fun startHeartbeat() {
        work.execute {
            while (!Thread.currentThread().isInterrupted) {
                sendHeartbeat()
                try {
                    Thread.sleep(30_000)
                } catch (interrupted: InterruptedException) {
                    return@execute
                }
            }
        }
    }

    private fun sendHeartbeat() {
        val url = config.heartbeatUrl ?: return
        val token = config.heartbeatToken ?: return
        val cafeId = config.cafeId ?: return

        try {
            val body = JSONObject().apply {
                put("cafeId", cafeId)
                put("stationName", config.stationId)
                put("status", if (SessionState.isRunning) "unlocked" else "locked")
                put("sessionId", SessionState.sessionId ?: JSONObject.NULL)
            }.toString()

            val connection = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
            }

            connection.outputStream.use { it.write(body.toByteArray()) }

            if (connection.responseCode !in 200..299) {
                AgentLog.warn("Heartbeat returned HTTP ${connection.responseCode}.")
            }

            connection.disconnect()
        } catch (error: Exception) {
            // The station keeps working without the website knowing about it.
            AgentLog.warn("Heartbeat failed: ${error.message}")
        }
    }

    // -----------------------------------------------------------------------
    // The clock
    // -----------------------------------------------------------------------

    /**
     * Ends the session when the paid time runs out.
     *
     * This is the half that makes it a lock. Anything can put a PS5 on screen;
     * only something still running while the customer plays can take it away
     * again.
     */
    private fun startCountdown() {
        ticking = true

        val tick = object : Runnable {
            override fun run() {
                if (!ticking) return

                if (SessionState.sessionId != null && !SessionState.isRunning) {
                    AgentLog.info("Time is up. Locking.")
                    SessionState.stop(this@AgentService)
                    TvInputs.showLockScreen(this@AgentService)
                    publishStatus()
                }

                main.postDelayed(this, 1000)
            }
        }

        main.post(tick)
    }

    // -----------------------------------------------------------------------

    private fun buildNotification(): android.app.Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Station",
                    // Low: this is a permanent notice that the lock is running,
                    // not something anybody needs to be told about.
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("BookMyGame")
            .setContentText("Station ${config.stationId.uppercase()}")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "station"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            val intent = Intent(context, AgentService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
