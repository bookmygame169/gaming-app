package com.bookmygame.ps5lock

import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * What is on the TV when nobody has paid.
 *
 * The same screen as the café's PCs, for the same reason a shop's signs match:
 * a customer moving from a PC to a PS5 should not feel they have moved between
 * two different businesses.
 */
class LockActivity : Activity() {

    private lateinit var config: AgentConfig
    private val work = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private lateinit var qrView: ImageView
    private lateinit var qrCaption: TextView
    private lateinit var stationView: TextView

    private var refreshing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        config = AgentConfig.load(this)

        // The TV must not sleep while it is showing this. A café PC that blanks
        // is a screensaver; a locked station that blanks looks broken and
        // sends the customer to the counter to say the machine is dead.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_lock)

        qrView = findViewById(R.id.qr)
        qrCaption = findViewById(R.id.qrCaption)
        stationView = findViewById(R.id.station)

        findViewById<TextView>(R.id.stationBadge).text = config.stationId.uppercase()
        stationView.text = config.stationId.uppercase()

        AgentService.start(this)
    }

    override fun onResume() {
        super.onResume()
        refreshing = true
        refreshCode()
    }

    override fun onPause() {
        refreshing = false
        super.onPause()
    }

    /**
     * Swallows the remote.
     *
     * Back and Home would otherwise leave this screen, and on a TV whose home
     * screen this is, leaving it means the customer is looking at the last
     * thing that ran. It is not much of a lock, but it is the difference
     * between a customer wandering off it by accident and having to try.
     *
     * The TV's own input button is beyond reach of any app — which is why the
     * remote lives at the counter.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_HOME -> true
            else -> super.onKeyDown(keyCode, event)
        }
    }

    /**
     * Fetches a fresh code and draws it, then does it again a minute later.
     *
     * Only while this screen is on show: a code sitting on a TV during somebody
     * else's paid session is an invitation to buy time on a console already in
     * use, and refreshing one nobody can see is a request a minute for nothing.
     */
    private fun refreshCode() {
        if (!refreshing) return

        val url = config.heartbeatUrl
        val token = config.heartbeatToken
        val cafeId = config.cafeId

        if (url.isNullOrBlank() || token.isNullOrBlank() || cafeId.isNullOrBlank()) {
            showNoCode()
            return
        }

        work.execute {
            val payUrl = fetchPayUrl(url, token, cafeId)

            main.post {
                if (!refreshing) return@post

                if (payUrl == null) {
                    showNoCode()
                } else {
                    val bitmap = QrCodes.render(payUrl, 480)
                    if (bitmap == null) showNoCode() else showCode(bitmap)
                }

                main.postDelayed({ refreshCode() }, 60_000)
            }
        }
    }

    private fun fetchPayUrl(heartbeatUrl: String, token: String, cafeId: String): String? {
        return try {
            val origin = URL(heartbeatUrl).let { "${it.protocol}://${it.authority}" }
            val connection = (URL("$origin/api/stations/unlock-token").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
            }

            val body = JSONObject().apply {
                put("cafeId", cafeId)
                put("stationName", config.stationId)
            }.toString()

            OutputStreamWriter(connection.outputStream).use { it.write(body) }

            if (connection.responseCode !in 200..299) {
                AgentLog.warn("Could not get a scan code: HTTP ${connection.responseCode}")
                return null
            }

            val text = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()

            JSONObject(text).optString("url").ifBlank { null }
        } catch (error: Exception) {
            AgentLog.warn("Scan code refresh failed: ${error.message}")
            null
        }
    }

    private fun showCode(bitmap: Bitmap) {
        qrView.setImageBitmap(bitmap)
        qrView.visibility = View.VISIBLE
        qrCaption.text = getString(R.string.scan_to_pay)
        stationView.visibility = View.VISIBLE
    }

    /**
     * No code to show, which is a normal state rather than a failure.
     *
     * A TV that cannot reach the website falls back to what the café did before
     * any of this existed: the station number, and a person at the counter.
     */
    private fun showNoCode() {
        qrView.visibility = View.GONE
        qrCaption.text = getString(R.string.ask_at_counter)
        stationView.visibility = View.VISIBLE
    }

    override fun onDestroy() {
        refreshing = false
        work.shutdownNow()
        super.onDestroy()
    }
}
