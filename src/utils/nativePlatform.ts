import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';

export interface SaveFileResult {
  isNative: boolean;
  fileName: string;
  uri?: string;
  shared?: boolean;
}

/**
 * Перевіряє, чи запущено додаток у нативному оточенні Capacitor (Android / iOS).
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Конвертує ArrayBuffer у Base64-рядок для запису бінарних файлів через @capacitor/filesystem.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Зберігає бінарний файл (напр. Excel .xlsx) у файлову систему пристрою (Android/iOS)
 * або завантажує через браузер (Web), із можливістю миттєвого поширення через системне меню Share.
 */
export async function saveOrShareBinaryFile(options: {
  fileName: string;
  buffer: ArrayBuffer;
  mimeType: string;
  shareTitle: string;
  shareText: string;
  autoShareOnNative?: boolean;
}): Promise<SaveFileResult> {
  const {
    fileName,
    buffer,
    mimeType,
    shareTitle,
    shareText,
    autoShareOnNative = true,
  } = options;

  if (isNativeApp()) {
    const base64Data = arrayBufferToBase64(buffer);
    let fileUri = '';

    try {
      // Спочатку пробуємо зберегти у публічну папку Documents
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
        recursive: true,
      });
      fileUri = result.uri;
    } catch {
      // Fallback у Cache для Android 10+ Scoped Storage, якщо доступ до Documents обмежений
      const fallbackResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });
      fileUri = fallbackResult.uri;
    }

    let shared = false;
    if (autoShareOnNative && fileUri) {
      try {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: shareTitle,
            text: shareText,
            url: fileUri,
            dialogTitle: shareTitle,
          });
          shared = true;
        }
      } catch {
        // Користувач закрив діалог поширення — файл все одно збережено
      }
    }

    return {
      isNative: true,
      fileName,
      uri: fileUri,
      shared,
    };
  }

  // Web-режим: стандартне завантаження через Blob
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    isNative: false,
    fileName,
  };
}

/**
 * Зберігає текстовий файл (напр. JSON-бекап бази даних TaxBookDB) у файлову систему Android/iOS
 * або завантажує через браузер (Web), із підтримкою системного діалогу Share.
 */
export async function saveOrShareTextFile(options: {
  fileName: string;
  content: string;
  mimeType?: string;
  shareTitle: string;
  shareText: string;
  autoShareOnNative?: boolean;
}): Promise<SaveFileResult> {
  const {
    fileName,
    content,
    mimeType = 'application/json;charset=utf-8',
    shareTitle,
    shareText,
    autoShareOnNative = true,
  } = options;

  if (isNativeApp()) {
    let fileUri = '';

    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      fileUri = result.uri;
    } catch {
      const fallbackResult = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      fileUri = fallbackResult.uri;
    }

    let shared = false;
    if (autoShareOnNative && fileUri) {
      try {
        const canShare = await Share.canShare();
        if (canShare.value) {
          await Share.share({
            title: shareTitle,
            text: shareText,
            url: fileUri,
            dialogTitle: shareTitle,
          });
          shared = true;
        }
      } catch {
        // Користувач закрив вікно Share — бекап уже збережено у файловій системі
      }
    }

    return {
      isNative: true,
      fileName,
      uri: fileUri,
      shared,
    };
  }

  // Web-режим
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    isNative: false,
    fileName,
  };
}

/**
 * Приховує нативний екран завантаження Capacitor SplashScreen після готовності інтерфейсу.
 */
export async function hideNativeSplashScreen(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide();
  } catch (err) {
    console.warn('SplashScreen hide warning:', err);
  }
}

/**
 * Підписується на системну кнопку «Назад» (Android Hardware Back Button).
 */
export function registerAndroidBackButton(
  onBack: (canGoBack: boolean) => boolean
): () => void {
  if (!isNativeApp()) {
    return () => {};
  }

  const listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
    const handled = onBack(canGoBack);
    if (!handled) {
      CapApp.exitApp();
    }
  });

  return () => {
    listenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
}
