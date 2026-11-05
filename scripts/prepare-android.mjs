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
const buildNumber = buildMatch ? Number(buildMatch[1]) : 6;
const versionName = `1.0.${buildNumber}`;

console.log(`[prepare-android] Preparing Android build v${versionName} (versionCode: ${buildNumber})...`);

// 2. Встановлюємо постійний ключ підпису ~/.android/debug.keystore із .github/keystore/cert.pem та key.pem
const certPemPath = path.join(rootDir, '.github', 'keystore', 'cert.pem');
const keyPemPath = path.join(rootDir, '.github', 'keystore', 'key.pem');

if (fs.existsSync(certPemPath) && fs.existsSync(keyPemPath)) {
  const dotAndroidDir = path.join(os.homedir(), '.android');
  fs.mkdirSync(dotAndroidDir, { recursive: true });
  const debugKeystorePath = path.join(dotAndroidDir, 'debug.keystore');

  try {
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
    console.log(`[prepare-android] Installed permanent debug.keystore at ${debugKeystorePath}`);
  } catch (err) {
    console.warn('[prepare-android] OpenSSL not available on this OS, skipping keystore generation:', err.message);
  }
}

// 3. Ініціалізуємо платформу Capacitor Android, якщо папки android ще немає
if (!fs.existsSync(androidDir)) {
  try {
    console.log('[prepare-android] Running npx cap add android...');
    execSync('npx cap add android', { stdio: 'inherit', cwd: rootDir });
  } catch (err) {
    console.warn('[prepare-android] Could not run npx cap add android:', err.message);
  }
}

if (fs.existsSync(androidDir)) {
  // 4. Оновлюємо versionCode та versionName в android/app/build.gradle
  const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');
  if (fs.existsSync(appBuildGradlePath)) {
    let gradleContent = fs.readFileSync(appBuildGradlePath, 'utf8');
    gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`);
    gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
    fs.writeFileSync(appBuildGradlePath, gradleContent, 'utf8');
    console.log(`[prepare-android] Patched build.gradle -> versionCode ${buildNumber}, versionName "${versionName}"`);
  }

  // 5. Додаємо дозвіл REQUEST_INSTALL_PACKAGES в AndroidManifest.xml
  const manifestPath = path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
      manifest = manifest.replace(
        '</manifest>',
        '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>'
      );
      fs.writeFileSync(manifestPath, manifest, 'utf8');
      console.log('[prepare-android] Added REQUEST_INSTALL_PACKAGES to AndroidManifest.xml');
    }
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
