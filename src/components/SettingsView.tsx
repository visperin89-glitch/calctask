import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Info,
  RefreshCw,
  Save,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { VAT_PAYER_REMINDER_TEXT } from '../constants/taxConstants';
import { db, DEFAULT_PROFILE } from '../db/database';
import type { ActivityType, TaxProfile } from '../types/tax';
import {
  checkForAppUpdate,
  CURRENT_APP_VERSION,
  DIRECT_APK_DOWNLOAD_URL,
  triggerApkUpdateDownload,
  type UpdateCheckResult,
} from '../utils/appUpdater';
import {
  exportDatabaseToJson,
  importDatabaseFromJson,
  seedDemoData,
} from '../utils/backup';

interface SettingsViewProps {
  profile: TaxProfile;
  selectedYear: number;
  transactionsCount: number;
  fixedAssetsCount: number;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  selectedYear,
  transactionsCount,
  fixedAssetsCount,
}) => {
  const [fullName, setFullName] = useState(profile.fullName);
  const [taxId, setTaxId] = useState(profile.taxId);
  const [activityType, setActivityType] = useState<ActivityType>(profile.activityType);
  const [isVatPayer, setIsVatPayer] = useState(profile.isVatPayer);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const res = await checkForAppUpdate();
      setUpdateInfo(res);
      if (res.hasUpdate) {
        showNotice(
          'success',
          `Знайдено нову версію ${res.latestVersion}! Натисніть «Встановити оновлення (.apk)».`
        );
      } else {
        showNotice(
          'success',
          `У вас встановлено найновішу версію додатку (${res.currentVersion}).`
        );
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    setFullName(profile.fullName);
    setTaxId(profile.taxId);
    setActivityType(profile.activityType);
    setIsVatPayer(profile.isVatPayer);
  }, [profile]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => {
      setStatusMsg(null);
    }, 5000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: TaxProfile = {
      id: 'default',
      fullName: fullName.trim(),
      taxId: taxId.trim(),
      activityType,
      isVatPayer,
    };
    await db.profile.put(updated);
    showNotice('success', 'Профіль платника податків успішно збережено в локальній базі.');
  };

  const handleExportJson = async () => {
    try {
      const res = await exportDatabaseToJson(true);
      if (res.isNative) {
        showNotice(
          'success',
          `Резервну копію ${res.fileName} збережено у файловій системі пристрою (${res.uri || 'Documents'})${
            res.shared ? ' та відкрито меню поширення.' : '.'
          }`
        );
      } else {
        showNotice('success', `Резервну копію бази даних (${res.fileName}) успішно сформовано та завантажено.`);
      }
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error ? err.message : 'Помилка під час створення резервної копії.'
      );
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importDatabaseFromJson(text);
      showNotice(
        'success',
        `Базу даних успішно відновлено! Імпортовано операцій: ${res.transactionsCount}, об’єктів ОЗ/НА: ${res.fixedAssetsCount}.`
      );
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error ? err.message : 'Не вдалося імпортувати файл резервної копії.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadDemo = async () => {
    const confirmed = window.confirm(
      `Завантажити демонстраційні дані за ${selectedYear} рік? Поточні записи будуть замінені прикладом заповнення Книги № 261 та Додатка з амортизації.`
    );
    if (!confirmed) return;

    await seedDemoData(selectedYear);
    showNotice(
      'success',
      `Демонстраційні дані за ${selectedYear} рік успішно завантажено! Перейдіть у «Журнал» або «Річний звіт» для перегляду.`
    );
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Ви дійсно бажаєте повністю очистити всі транзакції та реєстр основних засобів? Рекомендуємо попередньо зберегти JSON-бекап.'
    );
    if (!confirmed) return;

    await db.transaction('rw', db.profile, db.transactions, db.fixedAssets, async () => {
      await db.transactions.clear();
      await db.fixedAssets.clear();
      await db.profile.put(DEFAULT_PROFILE);
    });
    showNotice('success', 'Усі записи локальної бази даних очищено.');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {statusMsg && (
        <div
          className={`p-4 rounded-2xl border flex items-center gap-3 text-sm font-semibold shadow-xs ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Картка профілю платника податків */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2.5 mb-4">
          <UserCheck className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Реквізити самозайнятої особи (Шапка Типової форми № 261)
            </h2>
            <p className="text-xs text-slate-500">
              Ці дані автоматично підставляються у друковану форму та Excel-файл звіту
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Прізвище, ім’я, по батькові (ПІБ) платника
              </label>
              <input
                type="text"
                placeholder="Напр.: Коваленко Олександр Сергійович"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                РНОКПП (ІПН) або серія та номер паспорта
              </label>
              <input
                type="text"
                placeholder="Напр.: 3184509214 або КМ123456"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Категорія самозайнятої особи
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActivityType('fop')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  activityType === 'fop'
                    ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-bold text-slate-900">
                  ФОП на загальній системі оподаткування
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Стаття 177 Податкового кодексу України
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActivityType('independent')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  activityType === 'independent'
                    ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-bold text-slate-900">
                  Незалежна професійна діяльність
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Адвокати, нотаріуси, арбітражні керуючі, приватні виконавці (ст. 178 ПКУ)
                </div>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isVatPayer}
                onChange={(e) => setIsVatPayer(e.target.checked)}
                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Зареєстрований платником ПДВ (п. 2 розд. ІІ Порядку № 261)
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Якщо увімкнено, у формах введення відображається нагадування «{VAT_PAYER_REMINDER_TEXT}», оскільки суми ПДВ не включаються до витрат і доходів у Типовій формі.
                </div>
              </div>
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>Зберегти профіль</span>
            </button>
          </div>
        </form>
      </div>

      {/* Резервне копіювання (Backup JSON) та Демо-дані */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Локальне сховище IndexedDB та Резервне копіювання (JSON)
              </h2>
              <p className="text-xs text-slate-500">
                Усі фінансові дані зберігаються виключно у вашому браузері (Dexie.js / IndexedDB) без передачі на сторонні сервери
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            100% Офлайн-конфіденційність
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500">База даних:</span>
            <div className="font-bold text-slate-900 mt-0.5">TaxBookDB (v1)</div>
          </div>
          <div>
            <span className="text-slate-500">Усього операцій у базі:</span>
            <div className="font-bold text-slate-900 mt-0.5">{transactionsCount} записів</div>
          </div>
          <div>
            <span className="text-slate-500">Об’єктів ОЗ/НА у реєстрі:</span>
            <div className="font-bold text-slate-900 mt-0.5">{fixedAssetsCount} од.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleExportJson}
            className="p-4 rounded-xl border border-slate-300 hover:border-blue-600 hover:bg-blue-50/40 text-left transition-all flex items-start gap-3"
          >
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                Експортувати базу в JSON-файл
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Завантажити повну копію профілю, транзакцій та ОЗ для надійного зберігання
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-4 rounded-xl border border-slate-300 hover:border-emerald-600 hover:bg-emerald-50/40 text-left transition-all flex items-start gap-3"
          >
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                Імпортувати базу з JSON-файлу
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Відновити всі записи з раніше збереженої резервної копії (.json)
              </div>
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFileChange}
            className="hidden"
          />
        </div>

        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleLoadDemo}
            className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Завантажити демо-приклад за {selectedYear} рік</span>
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Очистити базу даних</span>
          </button>
        </div>

        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            Порада: оскільки всі дані зберігаються локально в браузері (IndexedDB), рекомендуємо раз на місяць або перед очищенням кешу браузера натискати «Експортувати базу в JSON-файл».
          </span>
        </div>
      </div>

      {/* Картка автоматичного оновлення на телефоні (OTA APK Update з GitHub Releases) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Smartphone className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Оновлення додатку на телефоні (OTA APK)
              </h2>
              <p className="text-xs text-slate-500">
                Поточна встановлена версія: <strong className="text-slate-800">{CURRENT_APP_VERSION}</strong> • Усі збірки підписуються єдиним ключем і встановлюються поверх без втрати даних
              </p>
            </div>
          </div>
        </div>

        {updateInfo?.hasUpdate && (
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-300 text-xs sm:text-sm text-blue-950 font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span>
              Доступна нова версія на GitHub: <strong>{updateInfo.latestVersion}</strong>
            </span>
            <button
              type="button"
              onClick={() => triggerApkUpdateDownload(updateInfo.downloadUrl)}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Завантажити та оновити</span>
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-blue-600 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>{isCheckingUpdate ? 'Перевірка...' : 'Перевірити наявність оновлень'}</span>
          </button>

          <button
            type="button"
            onClick={() => triggerApkUpdateDownload( updateInfo?.downloadUrl || DIRECT_APK_DOWNLOAD_URL )}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-sky-400" />
            <span>Завантажити останній APK з GitHub</span>
          </button>
        </div>
      </div>
    </div>
  );
};
