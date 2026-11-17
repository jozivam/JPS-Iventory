import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.jps.almoxarifado"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.jps.almoxarifado"
        minSdk = 24
        targetSdk = 34
        versionCode = (System.getenv("APP_VERSION_CODE")?.toIntOrNull()) ?: 1
        versionName = System.getenv("APP_VERSION_NAME") ?: "1.0.0"

        val appUrl = System.getenv("APP_URL") ?: "https://jps-iventory-lovat.vercel.app"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank() && File(keystorePath).exists()) {
                storeFile = File(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "jps2026"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "jpskey"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "jps2026"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            val releaseSigning = signingConfigs.getByName("release")
            if (releaseSigning.storeFile != null) {
                signingConfig = releaseSigning
            }
        }
        debug {
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.activity:activity-ktx:1.9.2")
}
