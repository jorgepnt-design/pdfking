plugins {
    id("com.android.application")
}

android {
    namespace = "com.jorgepnt.coroapdf"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.jorgepnt.coroapdf"
        minSdk = 29
        targetSdk = 36
        versionCode = 2
        versionName = "1.0.1"
    }

    signingConfigs {
        create("release") {
            val keystorePath = System.getenv("COROAPDF_KEYSTORE")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("COROAPDF_STORE_PASSWORD")
                keyAlias = System.getenv("COROAPDF_KEY_ALIAS") ?: "coroapdf-upload"
                keyPassword = System.getenv("COROAPDF_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
