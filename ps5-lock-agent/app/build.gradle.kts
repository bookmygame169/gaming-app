plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bookmygame.ps5lock"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.bookmygame.ps5lock"

        // 21 covers every Android TV in the field. Nothing here needs anything
        // newer, and a café is exactly the place an older TV turns up.
        minSdk = 21
        targetSdk = 34

        versionCode = (System.getenv("VERSION_CODE") ?: "1").toInt()
        versionName = System.getenv("VERSION_NAME") ?: "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false

            // Signed with the debug key on purpose. This is sideloaded onto
            // café TVs with adb, never published to a store, and a release key
            // would be one more secret to keep out of a public repository for
            // no gain.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.lifecycle:lifecycle-service:2.8.4")

    // Pure Java MQTT, no Android service wrapper - Paho's Android bindings are
    // deprecated and the plain client works fine from our own service.
    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")

    // Draws the QR. Same job as QRCoder on the Windows side.
    implementation("com.google.zxing:core:3.5.3")
}
