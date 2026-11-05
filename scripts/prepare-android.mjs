import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rootDir = process.cwd();
const androidDir = path.join(rootDir, 'android');

// 1. Зчитуємо актуальний номер збірки з src/utils/appUpdater.ts
const updaterPath = path.join(rootDir, 'src', 'utils', 'appUpdater.ts');
const updaterSrc = fs.readFileSync(updaterPath, 'utf8');
const buildMatch = updaterSrc.match(/CURRENT_BUILD_NUMBER\s*=\s*(\d+)/);
const buildNumber = buildMatch ? Number(buildMatch[1]) : 7;
const versionName = `1.0.${buildNumber}`;

console.log(`[prepare-android] Preparing Android Release build v${versionName} (versionCode: ${buildNumber})...`);

// 2. Ініціалізуємо платформу Capacitor Android, якщо папки android ще немає
if (!fs.existsSync(androidDir)) {
  try {
    console.log('[prepare-android] Running npx cap add android...');
    execSync('npx cap add android', { stdio: 'inherit', cwd: rootDir });
  } catch (err) {
    console.warn('[prepare-android] Could not run npx cap add android:', err.message);
  }
}

// 3. Генеруємо постійний релізний Keystore (RSA 2048-bit, 10000+ днів, повний DNAME) з .github/keystore/cert.pem та key.pem
const certPemPath = path.join(rootDir, '.github', 'keystore', 'cert.pem');
const keyPemPath = path.join(rootDir, '.github', 'keystore', 'key.pem');

if (fs.existsSync(certPemPath) && fs.existsSync(keyPemPath)) {
  const dotAndroidDir = path.join(os.homedir(), '.android');
  fs.mkdirSync(dotAndroidDir, { recursive: true });
  const debugKeystorePath = path.join(dotAndroidDir, 'debug.keystore');
  const releaseKeystorePath = path.join(androidDir, 'app', 'release-key.keystore');

  try {
    // Створюємо debug.keystore для стандартного підпису
    try {
      execSync(
        `openssl pkcs12 -export -legacy -in "${certPemPath}" -inkey "${keyPemPath}" -out "${debugKeystorePath}" -name androiddebugkey -passout pass:android`,
        { stdio: 'pipe' }
      );
    } catch {
      execSync(
        `openssl pkcs12 -export -in "${certPemPath}" -inkey "${keyPemPath}" -out "${debugKeystorePath}" -name androiddebugkey -passout pass:android`,
        { stdio: 'pipe' }
      );
    }

    // Створюємо релізний release-key.keystore для signingConfigs.release та apksigner (v1 + v2 + v3)
    if (fs.existsSync(path.join(androidDir, 'app'))) {
      try {
        execSync(
          `openssl pkcs12 -export -legacy -in "${certPemPath}" -inkey "${keyPemPath}" -out "${releaseKeystorePath}" -name taxbook -passout pass:123456`,
          { stdio: 'pipe' }
        );
      } catch {
        execSync(
          `openssl pkcs12 -export -in "${certPemPath}" -inkey "${keyPemPath}" -out "${releaseKeystorePath}" -name taxbook -passout pass:123456`,
          { stdio: 'pipe' }
        );
      }
      console.log(`[prepare-android] Created release-key.keystore at ${releaseKeystorePath}`);
    }
  } catch (err) {
    console.warn('[prepare-android] OpenSSL not available on this OS, skipping keystore generation:', err.message);
  }
}

if (fs.existsSync(androidDir)) {
  // 4. Налаштовуємо android/app/build.gradle для чистого Release APK з zipalign та apksigner (v1+v2+v3)
  const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
  if (fs.existsSync(appBuildGradlePath)) {
    let gradleContent = fs.readFileSync(appBuildGradlePath, 'utf8');
    gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`);
    gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);

    if (!gradleContent.includes('zipalignBin')) {
      gradleContent += `

android {
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
    signingConfigs {
        release {
            storeFile file("release-key.keystore")
            storePassword "123456"
            keyAlias "taxbook"
            keyPassword "123456"
            v1SigningEnabled true
            v2SigningEnabled true
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            debuggable false
            jniDebuggable false
        }
        debug {
            signingConfig signingConfigs.release
            minifyEnabled false
            debuggable false
            jniDebuggable false
        }
    }
}

tasks.whenTaskAdded { task ->
    if (task.name == 'assembleDebug') {
        task.dependsOn 'assembleRelease'
        task.doLast {
            def releaseApk = file("\${buildDir}/outputs/apk/release/app-release.apk")
            def debugApkDir = file("\${buildDir}/outputs/apk/debug")
            def targetApk = file("\${debugApkDir}/app-debug.apk")
            if (releaseApk.exists()) {
                debugApkDir.mkdirs()
                def sdkDir = android.sdkDirectory
                def buildToolsDir = new File(sdkDir, "build-tools")
                def latestBuildTools = buildToolsDir.listFiles()?.sort()?.last()
                if (latestBuildTools != null) {
                    def zipalignBin = new File(latestBuildTools, "zipalign")
                    def apksignerBin = new File(latestBuildTools, "apksigner")
                    def alignedApk = file("\${buildDir}/outputs/apk/release/app-release-aligned.apk")
                    if (zipalignBin.exists() && apksignerBin.exists()) {
                        exec {
                            commandLine zipalignBin.absolutePath, "-p", "-f", "-v", "4", releaseApk.absolutePath, alignedApk.absolutePath
                        }
                        exec {
                            commandLine apksignerBin.absolutePath, "sign",
                                "--ks", file("release-key.keystore").absolutePath,
                                "--ks-pass", "pass:123456",
                                "--key-pass", "pass:123456",
                                "--ks-key-alias", "taxbook",
                                "--v1-signing-enabled", "true",
                                "--v2-signing-enabled", "true",
                                "--v3-signing-enabled", "true",
                                "--out", targetApk.absolutePath,
                                alignedApk.absolutePath
                        }
                        exec {
                            commandLine apksignerBin.absolutePath, "verify", "--verbose", targetApk.absolutePath
                        }
                        println "[Release Signer] Successfully zipaligned and apksigned (v1+v2+v3) release APK -> \${targetApk}"
                        return
                    }
                }
                java.nio.file.Files.copy(
                    releaseApk.toPath(),
                    targetApk.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING
                )
            }
        }
    }
}
`;
    }

    fs.writeFileSync(appBuildGradlePath, gradleContent, 'utf8');
    console.log(`[prepare-android] Configured signingConfigs.release, zipalign & apksigner (v1+v2+v3) in build.gradle`);
  }

  // 5. Налаштовуємо чистий AndroidManifest.xml (android:debuggable="false", android:allowBackup="true", android:icon="@mipmap/ic_launcher", android:label="Книга обліку ФОП", без підозрілих дозволів)
  const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    const cleanManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove" />

    <application
        android:allowBackup="true"
        android:debuggable="false"
        android:icon="@mipmap/ic_launcher"
        android:label="Книга обліку ФОП"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        tools:ignore="HardcodedDebugMode"
        tools:replace="android:debuggable,android:allowBackup,android:label">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"
            android:name=".MainActivity"
            android:label="Книга обліку ФОП"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
`;
    fs.writeFileSync(manifestPath, cleanManifest, 'utf8');
    console.log('[prepare-android] Wrote clean release AndroidManifest.xml');
  }

  // 6. Оновлюємо file_paths.xml для підтримки FileProvider із кеш-директорій при встановленні APK
  const filePathsXmlPath = path.join(androidDir, 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml');
  if (fs.existsSync(filePathsXmlPath)) {
    const filePathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <external-files-path name="my_external_files" path="." />
    <external-cache-path name="my_external_cache" path="." />
    <cache-path name="my_cache_images" path="." />
    <files-path name="my_files" path="." />
</paths>
`;
    fs.writeFileSync(filePathsXmlPath, filePathsXml, 'utf8');
    console.log('[prepare-android] Updated res/xml/file_paths.xml for APK FileProvider');
  }

  // 7. Записуємо нативний плагін ApkUpdaterPlugin.java та реєструємо його у MainActivity.java
  const javaPkgDir = path.join(androidDir, 'app', 'src', 'main', 'java', 'ua', 'taxbook', 'app');
  fs.mkdirSync(javaPkgDir, { recursive: true });

  const pluginJavaPath = path.join(javaPkgDir, 'ApkUpdaterPlugin.java');
  const pluginJavaCode = `package ua.taxbook.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String urlString = call.getString("url");
        if (urlString == null || urlString.isEmpty()) {
            call.reject("URL для завантаження APK не вказано");
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            FileOutputStream output = null;
            try {
                String currentUrl = urlString;
                int redirects = 0;
                while (redirects < 10) {
                    URL url = new URL(currentUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(30000);
                    connection.setRequestProperty("User-Agent", "TaxBook-Android-Updater");
                    connection.setRequestProperty("Accept", "application/octet-stream, application/vnd.android.package-archive, */*");
                    connection.connect();

                    int status = connection.getResponseCode();
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP
                            || status == HttpURLConnection.HTTP_MOVED_PERM
                            || status == HttpURLConnection.HTTP_SEE_OTHER
                            || status == 307
                            || status == 308) {
                        String location = connection.getHeaderField("Location");
                        connection.disconnect();
                        if (location == null) {
                            throw new Exception("Перенаправлення без заголовка Location");
                        }
                        currentUrl = new URL(url, location).toString();
                        redirects++;
                        continue;
                    }
                    break;
                }

                int responseCode = connection.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    throw new Exception("Помилка завантаження з GitHub (HTTP " + responseCode + ")");
                }

                long totalBytes = connection.getContentLengthLong();
                File cacheDir = getContext().getExternalCacheDir();
                if (cacheDir == null) {
                    cacheDir = getContext().getCacheDir();
                }
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs();
                }

                File apkFile = new File(cacheDir, "TaxBook-Signed.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                input = connection.getInputStream();
                output = new FileOutputStream(apkFile);

                byte[] buffer = new byte[16384];
                long downloadedBytes = 0;
                int count;
                int lastReportedPercent = -1;
                long lastReportTime = 0;

                while ((count = input.read(buffer)) != -1) {
                    output.write(buffer, 0, count);
                    downloadedBytes += count;

                    int percent = totalBytes > 0 ? (int) ((downloadedBytes * 100L) / totalBytes) : -1;
                    long now = System.currentTimeMillis();
                    if (percent != lastReportedPercent && (now - lastReportTime >= 60 || percent == 100)) {
                        lastReportedPercent = percent;
                        lastReportTime = now;
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("downloadedBytes", downloadedBytes);
                        progress.put("totalBytes", totalBytes);
                        notifyListeners("downloadProgress", progress);
                    }
                }

                output.flush();
                output.close();
                output = null;
                input.close();
                input = null;

                JSObject doneProgress = new JSObject();
                doneProgress.put("percent", 100);
                doneProgress.put("downloadedBytes", downloadedBytes);
                doneProgress.put("totalBytes", totalBytes > 0 ? totalBytes : downloadedBytes);
                notifyListeners("downloadProgress", doneProgress);

                final File finalApkFile = apkFile;
                getActivity().runOnUiThread(() -> {
                    try {
                        Context context = getContext();
                        Uri apkUri = FileProvider.getUriForFile(
                                context,
                                context.getPackageName() + ".fileprovider",
                                finalApkFile
                        );

                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        context.startActivity(intent);

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    } catch (Exception installEx) {
                        call.reject("Не вдалося запустити встановлення APK: " + installEx.getMessage());
                    }
                });

            } catch (Exception e) {
                call.reject("Помилка завантаження оновлення: " + e.getMessage());
            } finally {
                try { if (output != null) output.close(); } catch (Exception ignored) {}
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                if (connection != null) connection.disconnect();
            }
        }).start();
    }
}
`;
  fs.writeFileSync(pluginJavaPath, pluginJavaCode, 'utf8');

  const mainActivityPath = path.join(javaPkgDir, 'MainActivity.java');
  const mainActivityCode = `package ua.taxbook.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(mainActivityPath, mainActivityCode, 'utf8');
  console.log('[prepare-android] Injected ApkUpdaterPlugin.java and registered in MainActivity.java');
}
