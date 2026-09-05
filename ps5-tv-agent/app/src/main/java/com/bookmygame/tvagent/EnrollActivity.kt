package com.bookmygame.tvagent

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.util.concurrent.Executors

/**
 * First run: link this TV to a station.
 *
 * Two things have to be settled here, and neither can be guessed. The setup
 * code says which station this is - generated in the owner dashboard, typed in
 * once, single use, so the installer carries no credentials and one build
 * serves every café. The HDMI choice says which socket the PS5 is in, and the
 * ids differ by manufacturer, so the list is read off this TV rather than
 * assumed.
 */
class EnrollActivity : AppCompatActivity() {

    private val work = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    private lateinit var config: AgentConfig
    private lateinit var codeField: EditText
    private lateinit var inputPicker: Spinner
    private lateinit var message: TextView
    private lateinit var submit: Button

    private var inputs: List<TvInput.HdmiInput> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        config = AgentConfig(this)
        setContentView(buildUi())
        loadInputs()
        warnIfCannotReturn()
    }

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    private fun buildUi(): View {
        val mono = Typeface.create("monospace", Typeface.NORMAL)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0b0b0c"))
            setPadding(dp(64), dp(40), dp(64), dp(40))
        }

        val title = TextView(this).apply {
            typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
            setTextColor(Color.parseColor("#f2f0ea"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
            gravity = Gravity.CENTER
            text = "Set up this station"
        }

        val explain = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#8a8a8f"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(24))
            text = "Owner dashboard > Stations > Add a gaming PC.\nGenerate a code and type it below."
        }

        codeField = EditText(this).apply {
            hint = "Setup code"
            setTextColor(Color.parseColor("#f2f0ea"))
            setHintTextColor(Color.parseColor("#5a5a5f"))
            typeface = mono
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            gravity = Gravity.CENTER
        }

        val inputLabel = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#8a8a8f"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            setPadding(0, dp(24), 0, dp(8))
            text = "Which HDMI socket is the PS5 plugged into?"
        }

        inputPicker = Spinner(this)

        submit = Button(this).apply {
            text = "Link this station"
            setPadding(dp(24), dp(12), dp(24), dp(12))
            setOnClickListener { enroll() }
        }

        message = TextView(this).apply {
            typeface = mono
            setTextColor(Color.parseColor("#ff5c2b"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            gravity = Gravity.CENTER
            setPadding(0, dp(20), 0, 0)
        }

        listOf(title, explain, codeField, inputLabel, inputPicker, submit, message)
            .forEach { root.addView(it) }
        return root
    }

    private fun loadInputs() {
        inputs = TvInput.discoverInputs(this)
        if (inputs.isEmpty()) {
            // Nothing to choose means nothing can be switched. Better said now,
            // during setup, than discovered by the first customer who pays.
            message.text = "This TV reports no HDMI inputs this app can switch to.\n" +
                "The hardware (Pi + HDMI switch) route is needed on this set."
        }
        inputPicker.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            inputs.map { it.label }.ifEmpty { listOf("No HDMI inputs found") }
        )
    }

    /**
     * Says so if the app will not be able to end a session.
     *
     * Without permission to appear over other apps, the TV can be switched to
     * the PS5 but never switched back - the session would run for ever. Checked
     * here because it is fixable in thirty seconds while somebody is standing
     * at the TV, and invisible otherwise.
     */
    private fun warnIfCannotReturn() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(this)
        ) {
            message.text = "Allow \"appear over other apps\" for BookMyGame in " +
                "Settings > Apps, or sessions will not end on their own."
        }
    }

    private fun enroll() {
        val code = codeField.text.toString().trim()
        if (code.isEmpty()) {
            message.text = "Enter the code from the dashboard."
            return
        }
        if (inputs.isEmpty()) {
            message.text = "No HDMI input to switch to; this TV cannot be used this way."
            return
        }

        submit.isEnabled = false
        message.text = "Linking..."

        work.execute {
            try {
                val chosen = inputs[inputPicker.selectedItemPosition]
                val body = StationApi(config).enroll(code)

                config.stationName = body.getString("stationId")
                config.cafeName = body.optString("cafeName").takeIf { it.isNotBlank() }
                config.hdmiInputId = chosen.id

                body.optJSONObject("mqtt")?.let { mqtt ->
                    config.mqttHost = mqtt.optString("host")
                    config.mqttPort = mqtt.optInt("port", 8883)
                    config.mqttUseTls = mqtt.optBoolean("useTls", true)
                    config.mqttUsername = mqtt.optString("username").takeIf { it.isNotBlank() }
                    config.mqttPassword = mqtt.optString("password").takeIf { it.isNotBlank() }
                }

                val heartbeat = body.optJSONObject("heartbeat")
                if (heartbeat == null) {
                    throw IllegalStateException(
                        "The server sent no heartbeat token, so this station could not report in."
                    )
                }
                config.heartbeatUrl = heartbeat.optString("url")
                config.heartbeatToken = heartbeat.optString("token")
                config.cafeId = heartbeat.optString("cafeId")

                main.post {
                    startService(Intent(this, AgentService::class.java))
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                }
            } catch (err: Exception) {
                // The code is single use. If anything failed after it was spent,
                // the next attempt needs a fresh one, and saying so saves a lot
                // of retyping the same dead code.
                config.clear()
                main.post {
                    submit.isEnabled = true
                    message.text = (err.message ?: "Could not link this station") +
                        "\nGenerate a new code before trying again."
                }
            }
        }
    }
}
