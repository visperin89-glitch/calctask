export const GITHUB_REPO_OWNER = 'visperin89-glitch';
export const GITHUB_REPO_NAME = 'calctask';
export const RELEASE_TAG = 'latest-apk';

export const CURRENT_BUILD_NUMBER = Number(
  import.meta.env.VITE_APP_BUILD_NUMBER || '1'
);

export const CURRENT_APP_VERSION = `1.0.${CURRENT_BUILD_NUMBER}`;

export const DIRECT_APK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/download/${RELEASE_TAG}/TaxBook-Signed.apk`;

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  latestBuildNumber: number;
  downloadUrl: string;
  publishedAt?: string;
  releaseNotes?: string;
}

/**
 * Перевіряє наявність нової версії APK у GitHub Releases репозиторію користувача.
 * Працює повністю безпечно: якщо смартфон офлайн, тихо повертає hasUpdate: false.
 */
export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const defaultResult: UpdateCheckResult = {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
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
      hasUpdate: remoteBuildNumber > CURRENT_BUILD_NUMBER,
      currentVersion: CURRENT_APP_VERSION,
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
 * Відкриває пряме посилання на завантаження підписаного TaxBook-Signed.apk
 * для миттєвого встановлення поверх поточної версії на Android.
 */
export function triggerApkUpdateDownload(downloadUrl = DIRECT_APK_DOWNLOAD_URL): void {
  window.open(downloadUrl, '_system');
}
