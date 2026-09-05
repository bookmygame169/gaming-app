plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bookmygame.tvagent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.bookmygame.tvagent"
        // Android TV boxes in the field run old builds; 22 covers everything
        // sold as a Google TV or Android TV since 2015.
        minSdk = 22
        targetSdk = 34

        // Reported on every heartbeat and shown on the locked screen, so a
        // station running an old build can be spotted from the dashboard.
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
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

    // Talks to the same HiveMQ broker the PC agents use.
    implementation("org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5")

    // The station QR on the locked screen.
    implementation("com.google.zxing:core:3.5.3")

    // Enrolment, unlock tokens and heartbeats.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
