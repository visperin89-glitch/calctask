import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { VAT_PAYER_REMINDER_TEXT } from '../constants/taxConstants';
import { db, DEFAULT_PROFILE } from '../db/database';
import type { ActivityType, TaxProfile } from '../types/tax';
import {
  type ApkDownloadProgress,
  checkForAppUpdate,
  CURRENT_APP_VERSION,
  downloadAndInstallApkInApp,
  formatMegabytes,
  type UpdateCheckResult,
} from '../utils/appUpdater';
import {
  exportDatabaseToJson,
  importDatabaseFromJson,
  seedDemoData,
} from '../utils/backup';
import type { AppTheme } from '../utils/theme';

interface SettingsViewProps {
  profile: TaxProfile;
  selectedYear: number;
  transactionsCount: number;
  fixedAssetsCount: number;
  theme: AppTheme;
  onChangeTheme: (theme: AppTheme) => void;
  onUpdateFound?: (update: UpdateCheckResult) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  selectedYear,
  transactionsCount,
  fixedAssetsCount,
  theme,
  onChangeTheme,
  onUpdateFound,
}) => {
  const [isProfileSubScreenOpen, setIsProfileSubScreenOpen] = useState(false);

  const [fullName, setFullName] = useState(profile.fullName);
  const [taxId, setTaxId] = useState(profile.taxId);
  const [activityType, setActivityType] = useState<ActivityType>(profile.activityType);
  const [isVatPayer, setIsVatPayer] = useState(profile.isVatPayer);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateInlineNotice, setUpdateInlineNotice] = useState<string | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [isDownloadingApk, setIsDownloadingApk] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<ApkDownloadProgress | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    showNotice('success', 'Реквізити платника успішно збережено на пристрої.');
    setIsProfileSubScreenOpen(false);
  };

  const handleExportJson = async () => {
    try {
      const res = await exportDatabaseToJson(true);
      if (res.isNative) {
        showNotice(
          'success',
          `Резервну копію ${res.fileName} збережено у файловій системі пристрою${
            res.shared ? ' та відкрито меню поширення.' : '.'
          }`
        );
      } else {
        showNotice('success', `Резервну копію (${res.fileName}) успішно збережено у файл.`);
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
        `Дані успішно відновлено! Імпортовано операцій: ${res.transactionsCount}, об’єктів ОЗ/НА: ${res.fixedAssetsCount}.`
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
      `Заповнити демонстраційними даними за ${selectedYear} рік? Поточні записи будуть замінені річним прикладом заповнення Книги № 261 та Додатка з амортизації.`
    );
    if (!confirmed) return;

    await seedDemoData(selectedYear);
    showNotice(
      'success',
      `Демонстраційні дані за ${selectedYear} рік успішно завантажено! Перейдіть у «Журнал» або «Звіт» для перегляду.`
    );
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'Ви дійсно бажаєте повністю очистити всі транзакції та реєстр основних засобів? Рекомендуємо попередньо зробити експорт резервної копії (JSON).'
    );
    if (!confirmed) return;

    await db.transaction('rw', db.profile, db.transactions, db.fixedAssets, async () => {
      await db.transactions.clear();
      await db.fixedAssets.clear();
      await db.profile.put(DEFAULT_PROFILE);
    });
    showNotice('success', 'Усі записи бази даних на пристрої очищено.');
  };

  const handleStartInAppInstall = async (url: string) => {
    setIsDownloadingApk(true);
    setDownloadProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
    try {
      await downloadAndInstallApkInApp(url, (prog) => {
        setDownloadProgress(prog);
      });
      setUpdateInlineNotice(
        'Завантаження завершено (100%)! Підтвердіть встановлення у системному вікні Android.'
      );
    } catch (err) {
      setUpdateInlineNotice(
        err instanceof Error ? err.message : 'Помилка під час завантаження APK-оновлення.'
      );
    } finally {
      setIsDownloadingApk(false);
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateInlineNotice(null);
    try {
      const res = await checkForAppUpdate();
      setUpdateInfo(res);
      if (res.hasUpdate) {
        setUpdateInlineNotice(
          `Доступне нове оновлення: версія ${res.latestVersion} (поточна: ${res.currentVersion}).`
        );
        onUpdateFound?.(res);
      } else if (res.checkedOk) {
        setUpdateInlineNotice(
          `У вас вже встановлено найновішу версію додатку (${res.currentVersion}).`
        );
      } else {
        setUpdateInlineNotice(
          `Поточна версія: ${res.currentVersion}. Новіших релізів на сервері немає або відсутній інтернет.`
        );
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  // Суб-екран «Реквізити платника»
  if (isProfileSubScreenOpen) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <button
          type="button"
          onClick={() => setIsProfileSubScreenOpen(false)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-sky-400" />
          <span>Назад до налаштувань</span>
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700/80 shadow-xs">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                Реквізити платника
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Дані для шапки Типової форми № 261 та експорту звіту в Excel
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Прізвище, ім’я, по батькові (ПІБ) платника
              </label>
              <input
                type="text"
                placeholder="Напр.: Коваленко Олександр Сергійович"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                РНОКПП (ІПН) або серія та номер паспорта
              </label>
              <input
                type="text"
                placeholder="Напр.: 3184509214 або КМ123456"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Категорія самозайнятої особи
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setActivityType('fop')}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 ${
                    activityType === 'fop'
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    ФОП на загальній системі
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Стаття 177 Податкового кодексу України
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActivityType('independent')}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 ${
                    activityType === 'independent'
                      ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/50 ring-1 ring-blue-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Незалежна професійна діяльність
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Адвокати, нотаріуси, приватні виконавці (ст. 178 ПКУ)
                  </div>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isVatPayer}
                  onChange={(e) => setIsVatPayer(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    Зареєстрований платником ПДВ (п. 2 розд. ІІ Порядку № 261)
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Відображати нагадування «{VAT_PAYER_REMINDER_TEXT}», оскільки суми ПДВ не включаються до витрат і доходів у Типовій формі.
                  </div>
                </div>
              </label>
            </div>

            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsProfileSubScreenOpen(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="flex-2 py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Зберегти профіль</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      {statusMsg && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-3 text-xs sm:text-sm font-semibold shadow-xs animate-fade-in ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 1. ВЕРХНЯ КАРТКА КОРИСТУВАЧА (Акаунт платника) */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Акаунт платника
        </div>
        <button
          type="button"
          onClick={() => setIsProfileSubScreenOpen(true)}
          className="w-full bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700/80 shadow-xs flex items-center justify-between gap-3 text-left hover:border-blue-500/50 transition-all duration-200 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <UserCheck className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                {profile.fullName ? profile.fullName : 'Введіть реквізити платника'}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 truncate">
                {profile.activityType === 'independent'
                  ? 'Незалежна професійна діяльність (ст. 178 ПКУ)'
                  : 'ФОП на загальній системі (ст. 177 ПКУ)'}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {profile.taxId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                    ІПН: {profile.taxId}
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                    profile.isVatPayer
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 border border-blue-200 dark:border-blue-800'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {profile.isVatPayer ? 'Платник ПДВ' : 'Без ПДВ'}
                </span>
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* 2. ГРУПА НАЛАШТУВАНЬ «Зовнішній вигляд» */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Зовнішній вигляд
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-indigo-950/70 text-amber-600 dark:text-indigo-400 shrink-0">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Тема оформлення
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {theme === 'dark' ? 'Темна (графітово-чорна палітра)' : 'Світла (класична палітра)'}
                </div>
              </div>
            </div>

            {/* Сегмент-контрол Світла / Темна */}
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span>Світла</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  theme === 'dark'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-sky-400" />
                <span>Темна</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ГРУПА НАЛАШТУВАНЬ «Дані та сховище» */}
      <div className="space-y-1.5">
        <div className="px-1 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Дані та сховище
          </span>
          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Операцій: {transactionsCount} • ОЗ: {fixedAssetsCount}</span>
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden divide-y divide-slate-200 dark:divide-slate-700/70">
          {/* Підзаголовок автономної локальної бази Android */}
          <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-snug">
              Автономна локальна база даних (Android) — 100% офлайн та конфіденційність на вашому пристрої
            </p>
          </div>

          {/* 3.1. Експорт резервної копії (JSON) */}
          <button
            type="button"
            onClick={handleExportJson}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Експорт резервної копії (JSON)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Зберегти повну копію профілю, операцій та об’єктів ОЗ у файл
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>

          {/* 3.2. Імпорт резервної копії (JSON) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Імпорт резервної копії (JSON)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Відновити базу даних із вибраного JSON-файлу
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFileChange}
            className="hidden"
          />

          {/* 3.3. Заповнити демо-даними */}
          <button
            type="button"
            onClick={handleLoadDemo}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Заповнити демо-даними
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Завантажити річний демонстраційний приклад за {selectedYear} рік для перевірки звітів
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>

          {/* 3.4. Очистити базу даних (дія червоного кольору) */}
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-rose-50/60 dark:hover:bg-rose-950/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
                  Очистити базу даних
                </div>
                <div className="text-xs text-rose-500/80 dark:text-rose-400/70 truncate">
                  Видалити всі внесені операції та об’єкти основних засобів
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-rose-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* 4. ГРУПА «Про додаток та оновлення» */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Про додаток та оновлення
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-3">
          {updateInlineNotice && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                updateInfo?.hasUpdate
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                  : 'bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600 dark:text-sky-400" />
              <span>{updateInlineNotice}</span>
            </div>
          )}

          {updateInfo?.hasUpdate && (
            <div className="p-3.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  Доступна версія <strong>{updateInfo.latestVersion}</strong>
                </span>
                <button
                  type="button"
                  disabled={isDownloadingApk}
                  onClick={() => handleStartInAppInstall(updateInfo.downloadUrl)}
                  className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-900 text-xs font-extrabold shadow-xs flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloadingApk ? 'Завантаження...' : 'Встановити'}</span>
                </button>
              </div>

              {isDownloadingApk && downloadProgress && (
                <div className="space-y-1.5 bg-emerald-800/50 p-2.5 rounded-xl border border-emerald-400/30">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-50">
                    <span>
                      Завантаження: {downloadProgress.percent >= 0 ? `${downloadProgress.percent}%` : '...'}
                    </span>
                    {downloadProgress.totalBytes > 0 && (
                      <span>
                        {formatMegabytes(downloadProgress.downloadedBytes)} /{' '}
                        {formatMegabytes(downloadProgress.totalBytes)}
                      </span>
                    )}
                  </div>
                  <div className="w-full h-2 bg-emerald-950/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-150"
                      style={{
                        width: `${Math.max(5, Math.min(100, downloadProgress.percent || 5))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate || isDownloadingApk}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>
              {isCheckingUpdate ? 'Перевірка наявності оновлень...' : '🔄 Перевірити наявність оновлень'}
            </span>
          </button>

          <div className="text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            Поточна версія: {CURRENT_APP_VERSION}
          </div>
        </div>
      </div>
    </div>
  );
};
