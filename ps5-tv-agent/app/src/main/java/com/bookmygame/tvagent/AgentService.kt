package com.bookmygame.tvagent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import org.eclipse.paho.client.mqttv3.MqttClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * The part that stays awake.
 *
 * Holds the broker connection, answers unlock and lock, runs the session clock
 * and reports in every thirty seconds. It runs as a foreground service because
 * for most of a session this app is behind the PS5's HDMI feed - and a
 * backgrounded app on Android TV loses its sockets, which would mean the lock
 * command at the end of a paid hour never arrives.
 */
class AgentService : Service() {

    companion object {
        const val ACTION_STATE_CHANGED = "com.bookmygame.tvagent.STATE"
        const val EXTRA_STATE = "state"
        const val EXTRA_REMAINING = "remaining"

        private const val TAG = "AgentService"
        private const val CHANNEL = "agent"
        private const val NOTIFICATION_ID = 1
        private const val HEARTBEAT_SECONDS = 30L

        /** Kept in step with versionName in build.gradle.kts. */
        const val VERSION = "1.0.0"

        @Volatile var isUnlocked: Boolean = false
            private set

        @Volatile var sessionEndsAtMs: Long = 0L
            private set
    }

    private lateinit var config: AgentConfig
    private lateinit var api: StationApi

    private var mqtt: MqttClient? = null
    private var sessionId: String? = null

    private val work = Executors.newSingleThreadScheduledExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var endSessionTask: Runnable? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        config = AgentConfig(this)
        api = StationApi(config)

        startForeground(NOTIFICATION_ID, buildNotification())

        if (!config.isEnrolled) {
            Log.w(TAG, "Not enrolled yet; the service will idle until setup finishes.")
            return
        }

        work.execute { connect() }
        work.scheduleAtFixedRate(
            { sendHeartbeat() },
            0, HEARTBEAT_SECONDS, TimeUnit.SECONDS
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Restarted by the system if it is ever killed: a station whose agent
        // is not running cannot be locked, and looks offline to the dashboard.
        return START_STICKY
    }

    // ------------------------------------------------------------------ mqtt

    private fun connect() {
        val host = config.mqttHost ?: return
        val scheme = if (config.mqttUseTls) "ssl" else "tcp"
        val url = "$scheme://$host:${config.mqttPort}"

        try {
            val client = MqttClient(url, "tv-${config.stationName}-${System.currentTimeMillis()}", MemoryPersistence())
            val options = MqttConnectOptions().apply {
                isAutomaticReconnect = true
                isCleanSession = true
                connectionTimeout = 15
                keepAliveInterval = 30
                config.mqttUsername?.let { userName = it }
                config.mqttPassword?.let { password = it.toCharArray() }
            }

            client.setCallback(object : org.eclipse.paho.client.mqttv3.MqttCallbackExtended {
                override fun connectComplete(reconnect: Boolean, serverURI: String?) {
                    subscribe(client)
                }

                override fun connectionLost(cause: Throwable?) {
                    Log.w(TAG, "Broker connection lost", cause)
                }

                override fun messageArrived(topic: String?, message: MqttMessage?) {
                    message?.let { handle(String(it.payload)) }
                }

                override fun deliveryComplete(token: org.eclipse.paho.client.mqttv3.IMqttDeliveryToken?) = Unit
            })

            client.connect(options)
            mqtt = client
            Log.i(TAG, "Connected to $url")
        } catch (err: Exception) {
            Log.e(TAG, "Could not reach the broker; retrying in 15s", err)
            work.schedule({ connect() }, 15, TimeUnit.SECONDS)
        }
    }

    /**
     * Both topic shapes, because the site publishes to both.
     *
     * The bare `cafe/station/{name}/command` form predates multi-cafe support
     * and is still published for older agents; the cafe-scoped one is what new
     * installs should match on. Subscribing to both means this works whichever
     * the server sends, and station names are lower case because MQTT topics
     * are case sensitive and the bookings store them lower case.
     */
    private fun subscribe(client: MqttClient) {
        val station = config.stationName?.lowercase() ?: return
        val cafeId = config.cafeId
        val topics = buildList {
            add("cafe/station/$station/command")
            if (!cafeId.isNullOrBlank()) add("cafe/$cafeId/station/$station/command")
        }
        topics.forEach { topic ->
            try {
                client.subscribe(topic, 1)
                Log.i(TAG, "Listening on $topic")
            } catch (err: Exception) {
                Log.e(TAG, "Could not subscribe to $topic", err)
            }
        }
    }

    // -------------------------------------------------------------- commands

    private fun handle(payload: String) {
        val message = try { JSONObject(payload) } catch (err: Exception) {
            Log.w(TAG, "Ignoring a command that was not JSON: $payload")
            return
        }

        when (message.optString("action")) {
            "unlock" -> unlock(
                seconds = message.optLong("duration_seconds", 0L),
                session = message.optString("session_id").takeIf { it.isNotBlank() },
                openEnded = message.optBoolean("open_ended", false),
            )
            "lock" -> lock("the dashboard locked this station")
            "warn" -> Log.i(TAG, "Warning: ${message.optLong("remaining_seconds")}s left")
            // Meant for the Windows updater, which replaces a running agent at
            // boot. Nothing here needs it: the Play Store or a sideload handles
            // updates, and rebooting a TV mid-session would end that session.
            "restart" -> Log.i(TAG, "Ignoring restart; it does not apply to a TV.")
            else -> Log.w(TAG, "Unknown command: $payload")
        }
    }

    private fun unlock(seconds: Long, session: String?, openEnded: Boolean) {
        val inputId = config.hdmiInputId
        if (inputId.isNullOrBlank()) {
            Log.e(TAG, "No HDMI input chosen for this station; run setup again.")
            return
        }

        val switched = TvInput.showPs5(this, inputId)
        if (!switched) {
            // Reported as still locked on purpose. Saying "unlocked" for a
            // screen that never switched bills a customer for time they cannot
            // use, and hides the fault from the dashboard.
            Log.e(TAG, "Refusing to report unlocked: the TV would not switch.")
            sendHeartbeat()
            return
        }

        sessionId = session
        isUnlocked = true
        cancelEndTask()

        if (!openEnded && seconds > 0) {
            sessionEndsAtMs = System.currentTimeMillis() + seconds * 1000
            val task = Runnable { lock("the paid time ran out") }
            endSessionTask = task
            main.postDelayed(task, seconds * 1000)
            Log.i(TAG, "Unlocked for ${seconds}s (session $session)")
        } else {
            // An unlimited membership: the seconds are a backstop the server
            // still sends, but there is no countdown to show or run.
            sessionEndsAtMs = 0L
            Log.i(TAG, "Unlocked open-ended (session $session)")
        }

        broadcastState()
        sendHeartbeat()
    }

    private fun lock(reason: String) {
        cancelEndTask()
        isUnlocked = false
        sessionEndsAtMs = 0L
        sessionId = null

        TvInput.showLockScreen(this, reason)
        broadcastState()
        sendHeartbeat()
        Log.i(TAG, "Locked: $reason")
    }

    private fun cancelEndTask() {
        endSessionTask?.let { main.removeCallbacks(it) }
        endSessionTask = null
    }

    // ------------------------------------------------------------ reporting

    private fun sendHeartbeat() {
        if (!config.isEnrolled) return
        work.execute {
            api.heartbeat(
                status = if (isUnlocked) "unlocked" else "locked",
                sessionId = sessionId,
                version = VERSION,
            )
        }
    }

    private fun broadcastState() {
        sendBroadcast(Intent(ACTION_STATE_CHANGED).apply {
            setPackage(packageName)
            putExtra(EXTRA_STATE, if (isUnlocked) "unlocked" else "locked")
            putExtra(EXTRA_REMAINING, sessionEndsAtMs)
        })
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL, "Station agent", NotificationManager.IMPORTANCE_LOW)
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("BookMyGame station")
            .setContentText(AgentConfig(this).stationName ?: "Not set up")
            .setSmallIcon(android.R.drawable.presence_online)
            .build()
    }

    override fun onDestroy() {
        cancelEndTask()
        work.shutdownNow()
        try { mqtt?.disconnectForcibly() } catch (_: Exception) {}
        super.onDestroy()
    }
}
