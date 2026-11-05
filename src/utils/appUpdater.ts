import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export const GITHUB_REPO_OWNER = 'visperin89-glitch';
export const GITHUB_REPO_NAME = 'calctask';
export const RELEASE_TAG = 'latest-apk';

export const CURRENT_BUILD_NUMBER = 6;
export const CURRENT_APP_VERSION = `1.0.${CURRENT_BUILD_NUMBER}`;

export const DIRECT_APK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download/${RELEASE_TAG}/TaxBook-Signed.apk`;

export interface ApkDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

interface ApkUpdaterPlugin {
  downloadAndInstall(options: { url: string }): Promise<{ success: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: ApkDownloadProgress) => void
  ): Promise<PluginListenerHandle>;
}

const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

export interface UpdateCheckResult {
  checkedOk: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  currentBuildNumber: number;
  latestVersion: string;
  latestBuildNumber: number;
  downloadUrl: string;
  publishedAt?: string;
  releaseNotes?: string;
}

/**
 * Перевіряє наявність нової версії APK у GitHub Releases репозиторію користувача.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const defaultResult: UpdateCheckResult = {
    checkedOk: false,
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    currentBuildNumber: CURRENT_BUILD_NUMBER,
    latestVersion: CURRENT_APP_VERSION,
    latestBuildNumber: CURRENT_BUILD_NUMBER,
    downloadUrl: DIRECT_APK_DOWNLOAD_URL,
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return defaultResult;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/tags/${RELEASE_TAG}`;
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return defaultResult;
    }

    const data = await response.json();
    const titleOrBody = `${data.name || ''} ${data.body || ''}`;
    const match = titleOrBody.match(/1\.0\.(\d+)/);
    const remoteBuildNumber = match ? Number(match[1]) : CURRENT_BUILD_NUMBER;
    const latestVersion = `1.0.${remoteBuildNumber}`;

    const apkAsset = Array.isArray(data.assets)
      ? data.assets.find((a: { name?: string; browser_download_url?: string }) =>
          a.name?.endsWith('.apk')
        )
      : null;

    const downloadUrl = apkAsset?.browser_download_url || DIRECT_APK_DOWNLOAD_URL;

    return {
      checkedOk: true,
      hasUpdate: remoteBuildNumber > CURRENT_BUILD_NUMBER,
      currentVersion: CURRENT_APP_VERSION,
      currentBuildNumber: CURRENT_BUILD_NUMBER,
      latestVersion,
      latestBuildNumber: remoteBuildNumber,
      downloadUrl,
      publishedAt: data.published_at,
      releaseNotes: data.body,
    };
  } catch {
    return defaultResult;
  }
}

/**
 * Завантажує оновлений APK безпосередньо всередині додатку з індикатором прогресу (0-100%)
 * та автоматично відкриває системне вікно встановлення Android без переходу в браузер.
 */
export async function downloadAndInstallApkInApp(
  downloadUrl = DIRECT_APK_DOWNLOAD_URL,
  onProgress?: (progress: ApkDownloadProgress) => void
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    let listener: PluginListenerHandle | null = null;
    try {
      if (onProgress) {
        onProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
        listener = await ApkUpdater.addListener('downloadProgress', (prog) => {
          onProgress(prog);
        });
      }
      await ApkUpdater.downloadAndInstall({ url: downloadUrl });
    } finally {
      if (listener) {
        await listener.remove();
      }
    }
    return;
  }

  // Fallback для веб-версії на ПК
  if (onProgress) {
    onProgress({ percent: 100, downloadedBytes: 0, totalBytes: 0 });
  }
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', 'TaxBook-Signed.apk');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function formatMegabytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0.0 МБ';
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
