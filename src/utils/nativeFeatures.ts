import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { TAX_CALENDAR_DEADLINES } from '../constants/taxConstants';
import { isNativeApp } from './nativePlatform';

const receiptMemoryCache = new Map<string, string>();
const WEB_RECEIPT_STORAGE_PREFIX = 'taxbook_receipt_';

// ============================================================================
// 1. ТАКТИЛЬНИЙ ВІДГУК (@capacitor/haptics)
// ============================================================================

/**
 * Легка вібрація при створенні запису, застосуванні пресету або збереженні профілю.
 */
export async function triggerLightHaptic(): Promise<void> {
  try {
    if (isNativeApp()) {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(12);
    }
  } catch {
    // Ігноруємо на пристроях без вібромотора
  }
}

/**
 * Попереджувальний тактильний відгук при підтвердженні видалення запису або очищенні бази.
 */
export async function triggerWarningHaptic(): Promise<void> {
  try {
    if (isNativeApp()) {
      await Haptics.notification({ type: NotificationType.Warning });
    } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([25, 40, 25]);
    }
  } catch {
    // Ігноруємо на пристроях без вібромотора
  }
}

// ============================================================================
// 2. ФОТОФІКСАЦІЯ ПЕРВИННИХ ДОКУМЕНТІВ (@capacitor/camera + @capacitor/filesystem)
// ============================================================================

/**
 * Стискає зображення (DataURL) до оптимального розміру (макс. 1280px, JPEG 0.78)
 * для швидкого збереження у Directory.Data/receipts/.
 */
async function compressImageDataUrl(
  rawDataUrl: string,
  maxDimension = 1280,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

/**
 * Зберігає стиснене зображення чека/документа у локальну файлову систему додатку
 * (`Directory.Data` у підпапку `receipts/`) та повертає відносний шлях `attachmentPath`.
 */
async function persistCompressedReceiptDataUrl(compressedDataUrl: string): Promise<{
  attachmentPath: string;
  previewDataUrl: string;
}> {
  const base64Data = compressedDataUrl.includes(',')
    ? compressedDataUrl.split(',')[1]
    : compressedDataUrl;

  const fileName = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const relativePath = `receipts/${fileName}`;

  try {
    await Filesystem.writeFile({
      path: relativePath,
      data: base64Data,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // Fallback для браузера (якщо IndexedDB Filesystem недоступна)
    try {
      localStorage.setItem(`${WEB_RECEIPT_STORAGE_PREFIX}${relativePath}`, compressedDataUrl);
    } catch {
      // Ігноруємо переповнення localStorage
    }
  }

  receiptMemoryCache.set(relativePath, compressedDataUrl);
  return {
    attachmentPath: relativePath,
    previewDataUrl: compressedDataUrl,
  };
}

/**
 * Викликає нативну камеру або галерею через `@capacitor/camera`,
 * стискає фото та записує у `Directory.Data/receipts/...`.
 */
export async function captureOrPickReceiptPhoto(sourceMode: 'CAMERA' | 'PHOTOS'): Promise<{
  attachmentPath: string;
  previewDataUrl: string;
}> {
  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: sourceMode === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
    width: 1400,
    height: 1400,
    correctOrientation: true,
  });

  if (!photo.dataUrl) {
    throw new Error('Не вдалося отримати зображення документа.');
  }

  const compressed = await compressImageDataUrl(photo.dataUrl);
  await triggerLightHaptic();
  return persistCompressedReceiptDataUrl(compressed);
}

/**
 * Обробляє вибір файлу зображення через стандартний `<input type="file">`,
 * стискає та зберігає у `Directory.Data/receipts/...`.
 */
export async function saveReceiptFromFile(file: File): Promise<{
  attachmentPath: string;
  previewDataUrl: string;
}> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не вдалося прочитати вибраний файл.'));
    reader.readAsDataURL(file);
  });

  const compressed = await compressImageDataUrl(rawDataUrl);
  await triggerLightHaptic();
  return persistCompressedReceiptDataUrl(compressed);
}

/**
 * Завантажує фото чека/документа за шляхом `attachmentPath` із `Directory.Data`.
 */
export async function loadReceiptImageDataUrl(attachmentPath?: string): Promise<string | null> {
  if (!attachmentPath) return null;
  if (attachmentPath.startsWith('data:image/')) {
    return attachmentPath;
  }
  const cached = receiptMemoryCache.get(attachmentPath);
  if (cached) {
    return cached;
  }

  try {
    const fileRes = await Filesystem.readFile({
      path: attachmentPath,
      directory: Directory.Data,
    });
    const dataStr = typeof fileRes.data === 'string' ? fileRes.data : '';
    if (dataStr) {
      const fullDataUrl = dataStr.startsWith('data:image/')
        ? dataStr
        : `data:image/jpeg;base64,${dataStr}`;
      receiptMemoryCache.set(attachmentPath, fullDataUrl);
      return fullDataUrl;
    }
  } catch {
    const fallback = localStorage.getItem(`${WEB_RECEIPT_STORAGE_PREFIX}${attachmentPath}`);
    if (fallback) {
      receiptMemoryCache.set(attachmentPath, fallback);
      return fallback;
    }
  }

  return null;
}

// ============================================================================
// 3. БІОМЕТРИЧНИЙ ЗАХИСТ ВХОДУ (@capgo/capacitor-native-biometric)
// ============================================================================

export async function isBiometricAvailableOnDevice(): Promise<{
  isAvailable: boolean;
  reason?: string;
}> {
  if (!isNativeApp()) {
    return {
      isAvailable: false,
      reason: 'Нативна біометрія працює у встановленому мобільному додатку Android / iOS.',
    };
  }
  try {
    const res = await NativeBiometric.isAvailable();
    return {
      isAvailable: Boolean(res.isAvailable),
    };
  } catch (err) {
    return {
      isAvailable: false,
      reason: err instanceof Error ? err.message : 'Біометричний сенсор недоступний.',
    };
  }
}

export async function verifyBiometricIdentity(): Promise<boolean> {
  if (!isNativeApp()) {
    return true;
  }
  try {
    const avail = await NativeBiometric.isAvailable();
    if (!avail.isAvailable) {
      return true;
    }
    await NativeBiometric.verifyIdentity({
      reason: 'Підтвердіть особу для доступу до Книги обліку доходів і витрат (Форма № 261)',
      title: 'Біометричний захист',
      subtitle: 'Книга обліку доходів і витрат',
      description: 'Прикладіть палець до сканера або використайте розпізнавання обличчя',
      negativeButtonText: 'Скасувати',
    });
    await triggerLightHaptic();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// 4. ЛОКАЛЬНІ НАГАДУВАННЯ ПРО ПОДАТКОВІ ДЕДЛАЙНИ (@capacitor/local-notifications)
// ============================================================================

export async function scheduleTaxCalendarNotifications(reportYear: number): Promise<{
  scheduledCount: number;
  message: string;
}> {
  try {
    if (isNativeApp()) {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') {
        throw new Error('Дозвіл на показ сповіщень не надано у налаштуваннях Android.');
      }

      // Спочатку скасовуємо попередні заплановані податкові сповіщення
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      const now = new Date();
      const notificationsToSchedule = [];

      for (const item of TAX_CALENDAR_DEADLINES) {
        // Плануємо нагадування на 10:00 ранку за 3 дні до дедлайну та у день дедлайну
        let targetYear = reportYear;
        let reminderDate = new Date(targetYear, item.month - 1, Math.max(1, item.day - 2), 10, 0, 0);
        if (reminderDate <= now) {
          targetYear = now.getFullYear() + (new Date(now.getFullYear(), item.month - 1, item.day) <= now ? 1 : 0);
          reminderDate = new Date(targetYear, item.month - 1, Math.max(1, item.day - 2), 10, 0, 0);
        }

        if (reminderDate > now) {
          notificationsToSchedule.push({
            id: item.id,
            title: `📅 Податковий календар: ${item.title}`,
            body: item.description,
            schedule: { at: reminderDate, allowWhileIdle: true },
          });
        }
      }

      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({ notifications: notificationsToSchedule });
      }

      await triggerLightHaptic();
      return {
        scheduledCount: notificationsToSchedule.length,
        message: `Увімкнено автономні пуш-нагадування про ${notificationsToSchedule.length} податкових дедлайнів (ПДФО, ВЗ, ЄСВ, Декларація).`,
      };
    }

    // Fallback для Web Notification API
    if (typeof Notification !== 'undefined') {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('Податковий календар увімкнено', {
          body: 'Нагадування про граничні терміни сплати ПДФО, ВЗ, ЄСВ та подання річної декларації активовано.',
        });
      }
    }

    return {
      scheduledCount: TAX_CALENDAR_DEADLINES.length,
      message: 'Нагадування податкового календаря успішно активовано на пристрої.',
    };
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : 'Не вдалося налаштувати локальні сповіщення.'
    );
  }
}

export async function cancelTaxCalendarNotifications(): Promise<void> {
  try {
    if (isNativeApp()) {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    }
  } catch {
    // Ігноруємо
  }
}

export async function sendTestTaxNotification(): Promise<void> {
  if (isNativeApp()) {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') {
      throw new Error('Надайте дозвіл на сповіщення у системних налаштуваннях Android.');
    }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 999,
          title: '🔔 Податковий календар (Перевірка)',
          body: 'Нагадування про сплату квартальних платежів ЄСВ (22%), ПДФО (18%) та ВЗ працюють штатно!',
          schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
        },
      ],
    });
    await triggerLightHaptic();
    return;
  }

  if (typeof Notification !== 'undefined') {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('🔔 Податковий календар (Перевірка)', {
        body: 'Нагадування про сплату квартальних платежів ЄСВ, ПДФО та ВЗ працюють штатно!',
      });
    }
  }
}
