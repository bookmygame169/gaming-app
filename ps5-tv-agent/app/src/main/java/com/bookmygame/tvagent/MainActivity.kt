package com.bookmygame.tvagent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.concurrent.Executors

/**
 * The locked screen - what the TV shows when nobody has paid.
 *
 * Station name, the café's name, and a QR the customer photographs to open the
 * pay page on their own phone. Once they pay, the site publishes an unlock over
 * MQTT, the service switches the TV to the PS5's HDMI input, and this screen is
 * simply behind it until the time runs out.
 *
 * Deliberately has nothing to press. A TV remote in a café is a way in, so the
 * only route forward is the phone in the customer's hand.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_REASON = "reason"

        /**
         * An unlock token is good for 120 seconds. Reminted well inside that:
         * a code sitting on a screen all evening would be long dead, and the
         * customer would only find out after walking over and scanning it.
         */
        private const val QR_REFRESH_MS = 90_000L
    }

    private lateinit var config: AgentConfig
    private lateinit var api: StationApi

    private val work = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private lateinit var stationLabel: TextView
    private lateinit var cafeLabel: TextView
    private lateinit var statusLabel: TextView
    private lateinit var qrView: ImageView
    private lateinit var hintLabel: TextView

    private var refresh: Runnable? = null

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            // Only ever used to put the screen back into its locked wording.
            // The switch to the PS5 is the service's job, not this screen's.
            if (intent?.getStringExtra(AgentService.EXTRA_STATE) == "locked") showLocked()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        config = AgentConfig(this)
        api = StationApi(config)

        keepScreenOn()
        setContentView(buildUi())

        if (!config.isEnrolled) {
            startActivity(Intent(this, EnrollActivity::class.java))
            finish()
            return
        }

        startService(Intent(this, AgentService::class.java))
        showLocked()
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(AgentService.ACTION_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stateReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(stateReceiver, filter)
        }
        scheduleQrRefresh(immediately = true)
    }

    override fun onPause() {
        super.onPause()
        try { unregisterReceiver(stateReceiver) } catch (_: Exception) {}
        // Stops asking the server for codes nobody can see while the PS5 is on
        // screen. Resumed the moment this comes back to the front.
        refresh?.let { main.removeCallbacks(it) }
    }

    /**
     * The TV must not sleep on the locked screen.
     *
     * A café PS5 sits untouched for long stretches between customers, and a TV
     * that has blanked looks broken - people assume the station is out of order
     * and walk to another one.
     */
    private fun keepScreenOn() {
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    // ------------------------------------------------------------------- ui

    private fun dp(value: Int): Int = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics
    ).toInt()

    private fun buildUi(): View {
        val mono = Typeface.create("monospace", Typeface.NORMAL)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0b0b0c"))
            // TVs overscan; a wide margin keeps the QR off the bezel on sets
            // that crop the edges of the picture.
            setPadding(dp(48), dp(32), dp(48), dp(32))
        }

        cafeLabel = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#8a8a8f"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            letterSpacing = 0.2f
            gravity = Gravity.CENTER
        }

        stationLabel = TextView(this).apply {
            typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
            setTextColor(Color.parseColor("#f2f0ea"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 48f)
            gravity = Gravity.CENTER
        }

        statusLabel = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#d8ff3c"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            letterSpacing = 0.14f
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(24))
        }

        qrView = ImageView(this).apply {
            layoutParams = LinearLayout.LayoutParams(dp(300), dp(300))
        }

        hintLabel = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#8a8a8f"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            setPadding(0, dp(24), 0, 0)
            text = "Scan with your phone camera to pay and play"
        }

        root.addView(cafeLabel)
        root.addView(stationLabel)
        root.addView(statusLabel)
        root.addView(qrView)
        root.addView(hintLabel)

        root.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        )
        return root
    }

    private fun showLocked() {
        cafeLabel.text = (config.cafeName ?: "BookMyGame").uppercase()
        stationLabel.text = (config.stationName ?: "STATION").uppercase()
        statusLabel.text = "LOCKED"
    }

    // ------------------------------------------------------------------- qr

    private fun scheduleQrRefresh(immediately: Boolean) {
        refresh?.let { main.removeCallbacks(it) }
        val task = object : Runnable {
            override fun run() {
                loadQr()
                main.postDelayed(this, QR_REFRESH_MS)
            }
        }
        refresh = task
        main.postDelayed(task, if (immediately) 0 else QR_REFRESH_MS)
    }

    private fun loadQr() {
        work.execute {
            val result = try {
                val token = api.unlockToken()
                Qr.render("${config.siteOrigin}/play/$token", 600)
            } catch (err: Exception) {
                null
            }

            main.post {
                if (result != null) {
                    qrView.setImageBitmap(result)
                    hintLabel.text = "Scan with your phone camera to pay and play"
                } else {
                    // Said plainly rather than left as a blank square. Staff
                    // need to know it is the network, not the console.
                    qrView.setImageDrawable(null)
                    hintLabel.text = "Cannot reach BookMyGame — check this TV's internet"
                }
            }
        }
    }
}
