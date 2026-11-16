import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Calculator,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Database,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Info,
  KeyRound,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  Wifi,
} from 'lucide-react';
import {
  DEFAULT_OPERATION_PRESETS,
  EXPENSE_CATEGORIES,
  TAX_CALENDAR_DEADLINES,
  VAT_PAYER_REMINDER_TEXT,
} from '../constants/taxConstants';
import { db, DEFAULT_PROFILE } from '../db/database';
import type {
  ActivityType,
  ExpenseCategory,
  QuickOperationPreset,
  TaxProfile,
} from '../types/tax';
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
import {
  DEFAULT_GEMINI_API_KEY,
  DEFAULT_GEMINI_MODEL,
  GEMINI_QUICK_MODELS,
  getGeminiConfig,
  saveGeminiConfig,
  testGeminiConnection,
} from '../utils/geminiScanner';
import {
  cancelTaxCalendarNotifications,
  scheduleTaxCalendarNotifications,
  sendTestTaxNotification,
  triggerLightHaptic,
  triggerWarningHaptic,
  verifyBiometricIdentity,
} from '../utils/nativeFeatures';
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
  const [activeSubScreen, setActiveSubScreen] = useState<
    'NONE' | 'PROFILE' | 'PRESETS' | 'AI_SCANNER'
  >('NONE');

  // Налаштування AI-розпізнавання документів (Google Gemini Vision API)
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => getGeminiConfig(profile).apiKey);
  const [geminiModel, setGeminiModel] = useState<string>(() => getGeminiConfig(profile).model);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Реквізити платника та податкові параметри
  const [fullName, setFullName] = useState(profile.fullName);
  const [taxId, setTaxId] = useState(profile.taxId);
  const [activityType, setActivityType] = useState<ActivityType>(profile.activityType);
  const [isVatPayer, setIsVatPayer] = useState(profile.isVatPayer);
  const [militaryTaxRate, setMilitaryTaxRate] = useState<string>(
    String(profile.militaryTaxRate ?? 5)
  );
  const [minWage, setMinWage] = useState<string>(String(profile.minWage ?? 8000));
  const [esvMaxBaseMultiplier, setEsvMaxBaseMultiplier] = useState<string>(
    String(profile.esvMaxBaseMultiplier ?? 15)
  );
  const [confirmedExpensesOnlyInReport, setConfirmedExpensesOnlyInReport] = useState<boolean>(
    Boolean(profile.confirmedExpensesOnlyInReport)
  );

  // Шаблони повторюваних операцій (Пресети)
  const [presets, setPresets] = useState<QuickOperationPreset[]>(
    Array.isArray(profile.customPresets) && profile.customPresets.length > 0
      ? profile.customPresets
      : DEFAULT_OPERATION_PRESETS
  );
  const [newPresetTitle, setNewPresetTitle] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState<ExpenseCategory>('col_9');
  const [newPresetDocName, setNewPresetDocName] = useState('Платіжна інструкція');
  const [newPresetNote, setNewPresetNote] = useState('');

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
    setMilitaryTaxRate(String(profile.militaryTaxRate ?? 5));
    setMinWage(String(profile.minWage ?? 8000));
    setEsvMaxBaseMultiplier(String(profile.esvMaxBaseMultiplier ?? 15));
    setConfirmedExpensesOnlyInReport(Boolean(profile.confirmedExpensesOnlyInReport));
    setPresets(
      Array.isArray(profile.customPresets) && profile.customPresets.length > 0
        ? profile.customPresets
        : DEFAULT_OPERATION_PRESETS
    );
    const geminiCfg = getGeminiConfig(profile);
    setGeminiApiKey(geminiCfg.apiKey);
    setGeminiModel(geminiCfg.model);
  }, [profile]);

  const showNotice = (type: 'success' | 'error', text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => {
      setStatusMsg(null);
    }, 5500);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedVz = parseFloat(militaryTaxRate.replace(',', '.'));
    const parsedMinWage = parseFloat(minWage.replace(',', '.'));
    const parsedMultiplier = parseFloat(esvMaxBaseMultiplier.replace(',', '.'));

    const updated: TaxProfile = {
      ...profile,
      id: 'default',
      fullName: fullName.trim(),
      taxId: taxId.trim(),
      activityType,
      isVatPayer,
      militaryTaxRate: !Number.isNaN(parsedVz) && parsedVz >= 0 ? parsedVz : 5,
      minWage: !Number.isNaN(parsedMinWage) && parsedMinWage > 0 ? parsedMinWage : 8000,
      esvMaxBaseMultiplier:
        !Number.isNaN(parsedMultiplier) && parsedMultiplier > 0 ? parsedMultiplier : 15,
      confirmedExpensesOnlyInReport,
    };
    await db.profile.put(updated);
    await triggerLightHaptic();
    showNotice('success', 'Реквізити платника та податкові параметри успішно збережено.');
    setActiveSubScreen('NONE');
  };

  const handleSaveGeminiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await saveGeminiConfig(geminiApiKey, geminiModel, profile);
    setGeminiApiKey(saved.apiKey);
    setGeminiModel(saved.model);
    await triggerLightHaptic();
    showNotice('success', 'Налаштування AI-розпізнавання (Google Gemini API) збережено.');
    setActiveSubScreen('NONE');
  };

  const handleTestGeminiConnection = async () => {
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await testGeminiConnection(geminiApiKey, geminiModel);
      setGeminiTestResult({ ok: res.ok, message: res.message });
      if (res.ok) {
        await triggerLightHaptic();
      }
    } finally {
      setIsTestingGemini(false);
    }
  };

  // Блок 3.2: Біометричний захист входу
  const handleToggleBiometric = async () => {
    const nextState = !profile.biometricEnabled;
    if (nextState) {
      const verified = await verifyBiometricIdentity();
      if (!verified) {
        showNotice(
          'error',
          'Біометричну перевірку скасовано або сенсор відбитка пальця не налаштовано.'
        );
        return;
      }
    }
    await db.profile.put({
      ...profile,
      biometricEnabled: nextState,
    });
    await triggerLightHaptic();
    showNotice(
      'success',
      nextState
        ? 'Біометричний захист входу (відбиток пальця / Face ID) увімкнено.'
        : 'Біометричний захист входу вимкнено.'
    );
  };

  // Блок 3.4: Локальні нагадування про податкові дедлайни
  const handleToggleTaxReminders = async () => {
    const nextState = !profile.taxRemindersEnabled;
    try {
      if (nextState) {
        const res = await scheduleTaxCalendarNotifications(selectedYear);
        await db.profile.put({
          ...profile,
          taxRemindersEnabled: true,
        });
        showNotice('success', res.message);
      } else {
        await cancelTaxCalendarNotifications();
        await db.profile.put({
          ...profile,
          taxRemindersEnabled: false,
        });
        await triggerLightHaptic();
        showNotice('success', 'Локальні пуш-нагадування податкового календаря вимкнено.');
      }
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error ? err.message : 'Помилка налаштування локальних сповіщень.'
      );
    }
  };

  const handleTestNotification = async () => {
    try {
      await sendTestTaxNotification();
      showNotice(
        'success',
        'Тестове сповіщення заплановано (з’явиться на екрані через 1–2 секунди).'
      );
    } catch (err) {
      showNotice(
        'error',
        err instanceof Error ? err.message : 'Не вдалося надіслати тестове сповіщення.'
      );
    }
  };

  // Блок 4.1: Керування пресетами повторюваних операцій
  const handleAddCustomPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetTitle.trim()) return;

    const created: QuickOperationPreset = {
      id: `custom_${Date.now()}`,
      title: newPresetTitle.trim(),
      type: 'EXPENSE',
      category: newPresetCategory,
      defaultDocName: newPresetDocName.trim() || 'Платіжна інструкція',
      defaultNote: newPresetNote.trim() || newPresetTitle.trim(),
    };

    const nextPresets = [...presets, created];
    setPresets(nextPresets);
    await db.profile.put({
      ...profile,
      customPresets: nextPresets,
    });
    setNewPresetTitle('');
    setNewPresetNote('');
    await triggerLightHaptic();
    showNotice('success', `Шаблон «${created.title}» додано до швидких пресетів.`);
  };

  const handleDeletePreset = async (presetId: string) => {
    await triggerWarningHaptic();
    const nextPresets = presets.filter((p) => p.id !== presetId);
    setPresets(nextPresets);
    await db.profile.put({
      ...profile,
      customPresets: nextPresets,
    });
  };

  const handleResetDefaultPresets = async () => {
    setPresets(DEFAULT_OPERATION_PRESETS);
    await db.profile.put({
      ...profile,
      customPresets: DEFAULT_OPERATION_PRESETS,
    });
    await triggerLightHaptic();
    showNotice('success', 'Стандартні шаблони операцій відновлено.');
  };

  const handleExportJson = async () => {
    try {
      const res = await exportDatabaseToJson(true);
      await triggerLightHaptic();
      if (res.isNative) {
        showNotice(
          'success',
          `Резервну копію ${res.fileName} збережено у файловій системі пристрою${
            res.shared ? ' та відкрито меню поширення (Share).' : '.'
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
      await triggerLightHaptic();
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
    await triggerLightHaptic();
    showNotice(
      'success',
      `Демонстраційні дані за ${selectedYear} рік успішно завантажено! Перейдіть у «Журнал» або «Звіт» для перегляду.`
    );
  };

  const handleClearAll = async () => {
    await triggerWarningHaptic();
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

  // =========================================================================
  // СУБ-ЕКРАН 1: «Реквізити платника та податкові параметри»
  // =========================================================================
  if (activeSubScreen === 'PROFILE') {
    return (
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4 animate-fade-in">
        <button
          type="button"
          onClick={() => setActiveSubScreen('NONE')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-sky-400" />
          <span>Назад до налаштувань</span>
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700/80 shadow-xs">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                Реквізити платника та податкові ставки
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Дані для шапки Типової форми № 261, калькулятора ПДФО/ВЗ/ЄСВ та експорту звітів
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

            {/* Податкові параметри для калькулятора (Блок 2.1) */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                <Calculator className="w-4 h-4 text-blue-600 dark:text-sky-400" />
                <span>Параметри податкового калькулятора ({selectedYear} р.)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Військовий збір (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={militaryTaxRate}
                    onChange={(e) => setMilitaryTaxRate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    МЗП (грн на 1 січня)
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="1000"
                    value={minWage}
                    onChange={(e) => setMinWage(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Макс. база ЄСВ (МЗП)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={esvMaxBaseMultiplier}
                    onChange={(e) => setEsvMaxBaseMultiplier(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmedExpensesOnlyInReport}
                  onChange={(e) => setConfirmedExpensesOnlyInReport(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs text-slate-700 dark:text-slate-300">
                  <strong className="text-slate-900 dark:text-white">
                    Враховувати у витратах (Графи 6–9) лише підтверджені документами операції
                  </strong>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Записи зі статусом «Очікується від контрагента» не включатимуться до витрат у звіті до моменту отримання первинки.
                  </div>
                </div>
              </label>
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

            <div className="pt-2 pb-4 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveSubScreen('NONE')}
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

  // =========================================================================
  // СУБ-ЕКРАН 2: «Шаблони повторюваних операцій (Пресети)» (Блок 4.1)
  // =========================================================================
  if (activeSubScreen === 'PRESETS') {
    return (
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4 animate-fade-in">
        <button
          type="button"
          onClick={() => setActiveSubScreen('NONE')}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-sky-400" />
          <span>Назад до налаштувань</span>
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                Шаблони повторюваних операцій (Пресети)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Кнопки швидкого заповнення у вікні «Швидкий запис операцій»
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultPresets}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Стандартні</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {presets.map((p) => (
              <div
                key={p.id}
                className="p-3 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white break-words">
                    {p.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 break-words">
                    {p.defaultDocName} • {p.defaultNote}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePreset(p.id)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 shrink-0"
                  title="Видалити пресет"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddCustomPreset}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Додати власний пресет витрати
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                placeholder="Назва кнопки (напр. Оплата LIGA360)"
                value={newPresetTitle}
                onChange={(e) => setNewPresetTitle(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
              />
              <select
                value={newPresetCategory}
                onChange={(e) => setNewPresetCategory(e.target.value as ExpenseCategory)}
                className="w-full min-w-0 max-w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                placeholder="Документ (напр. Акт надання послуг)"
                value={newPresetDocName}
                onChange={(e) => setNewPresetDocName(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
              />
              <input
                type="text"
                placeholder="Зміст операції для Примітки"
                value={newPresetNote}
                onChange={(e) => setNewPresetNote(e.target.value)}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Додати пресет</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // СУБ-ЕКРАН 3: «AI-розпізнавання документів (Gemini API)»
  // =========================================================================
  if (activeSubScreen === 'AI_SCANNER') {
    return (
      <div className="max-w-2xl lg:max-w-4xl mx-auto space-y-4 animate-fade-in">
        <button
          type="button"
          onClick={() => {
            setGeminiTestResult(null);
            setActiveSubScreen('NONE');
          }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-sky-400" />
          <span>Назад до налаштувань</span>
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white break-words">
                AI-розпізнавання документів (Gemini API)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
                Автоматичне зчитування чеків, квитанцій, актів і рахунків з фото через Google Gemini Vision
              </p>
            </div>
          </div>

          {/* Повідомлення про конфіденційність (Privacy Notice) */}
          <div className="p-3.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 flex items-start gap-2.5 text-xs text-blue-950 dark:text-blue-100 leading-relaxed">
            <Info className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="min-w-0 break-words">
              <strong className="block mb-0.5">Повідомлення про конфіденційність (Privacy Notice)</strong>
              Під час сканування фото первинного документа передається зашифрованим HTTPS-з’єднанням у хмарний API Google для розпізнавання тексту, тоді як усі інші фінансові записи, база транзакцій, ОЗ/НА та звіти залишаються 100% офлайн на вашому смартфоні.
            </div>
          </div>

          <form onSubmit={handleSaveGeminiSettings} className="space-y-4">
            {/* Поле API-ключ Google Gemini */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  <span>API-ключ Google Gemini</span>
                </label>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const clipText = await navigator.clipboard.readText();
                        if (clipText && clipText.trim()) {
                          setGeminiApiKey(clipText.trim());
                          setGeminiTestResult(null);
                          await triggerLightHaptic();
                        }
                      } catch {
                        // Ігноруємо обмеження буфера обміну
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Вставити з буфера</span>
                  </button>
                  {(geminiApiKey || DEFAULT_GEMINI_API_KEY) && (
                    <button
                      type="button"
                      onClick={() => {
                        setGeminiApiKey(DEFAULT_GEMINI_API_KEY);
                        setGeminiTestResult(null);
                      }}
                      className="text-[11px] font-bold text-blue-600 dark:text-sky-400 hover:underline"
                    >
                      {DEFAULT_GEMINI_API_KEY ? 'Ключ за замовчуванням' : 'Очистити'}
                    </button>
                  )}
                </div>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  placeholder="Введіть API-ключ Google Gemini..."
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    setGeminiTestResult(null);
                  }}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-3.5 pr-11 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-600"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((prev) => !prev)}
                  aria-label={showGeminiKey ? 'Приховати API-ключ' : 'Показати API-ключ'}
                  className="absolute right-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 break-words">
                Зберігається локально на вашому пристрої та може бути змінений у будь-який момент без оновлення APK.
              </p>
            </div>

            {/* Поле Модель Gemini */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Модель Gemini
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setGeminiModel(DEFAULT_GEMINI_MODEL);
                    setGeminiTestResult(null);
                  }}
                  className="text-[11px] font-bold text-blue-600 dark:text-sky-400 hover:underline"
                >
                  За замовчуванням ({DEFAULT_GEMINI_MODEL})
                </button>
              </div>
              <input
                type="text"
                placeholder={DEFAULT_GEMINI_MODEL}
                value={geminiModel}
                onChange={(e) => {
                  setGeminiModel(e.target.value);
                  setGeminiTestResult(null);
                }}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-mono font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-600"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {GEMINI_QUICK_MODELS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setGeminiModel(m);
                      setGeminiTestResult(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold transition-colors ${
                      geminiModel === m
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Перевірка підключення */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={isTestingGemini}
                onClick={handleTestGeminiConnection}
                className="w-full py-2.5 px-4 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50/80 dark:bg-violet-950/50 text-violet-800 dark:text-violet-200 text-xs sm:text-sm font-bold hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
              >
                {isTestingGemini ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Wifi className="w-4 h-4" />
                )}
                <span>
                  {isTestingGemini ? 'Перевірка підключення...' : 'Перевірити підключення'}
                </span>
              </button>

              {geminiTestResult && (
                <div
                  className={`p-3 rounded-xl border text-xs font-semibold break-words ${
                    geminiTestResult.ok
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {geminiTestResult.message}
                </div>
              )}
            </div>

            <div className="pt-2 pb-4 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setGeminiTestResult(null);
                  setActiveSubScreen('NONE');
                }}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Скасувати
              </button>
              <button
                type="submit"
                className="flex-2 py-2.5 px-5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Зберегти налаштування AI</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl lg:max-w-5xl mx-auto space-y-5 animate-fade-in">
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

      <div className="space-y-5 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 items-start">
      {/* 1. ВЕРХНЯ КАРТКА КОРИСТУВАЧА (Акаунт платника та податкові параметри) */}
      <div className="space-y-1.5 lg:col-span-2">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Акаунт платника та податкові параметри
        </div>
        <button
          type="button"
          onClick={() => setActiveSubScreen('PROFILE')}
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
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {profile.taxId && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                    ІПН: {profile.taxId}
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-sky-300 text-[11px] font-semibold">
                  ВЗ: {profile.militaryTaxRate ?? 5}% • МЗП: {profile.minWage ?? 8000} ₴
                </span>
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

      {/* 2. ГРУПА «Безпека, шаблони та зовнішній вигляд» */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Безпека, шаблони та зовнішній вигляд
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden divide-y divide-slate-200 dark:divide-slate-700/70">
          {/* 2.1. Тема оформлення */}
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-indigo-950/70 text-amber-600 dark:text-indigo-400 shrink-0">
                {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Тема оформлення
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 break-words">
                  {theme === 'dark'
                    ? 'Темна (графітово-чорна палітра)'
                    : 'Світла (класична палітра)'}
                </div>
              </div>
            </div>

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

          {/* 2.2. Вхід за відбитком пальця / Face ID (Блок 3.2) */}
          <div className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Вхід за відбитком пальця / Face ID
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Блокування додатку при запуску та поверненні з фонового режиму
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(profile.biometricEnabled)}
              onClick={handleToggleBiometric}
              className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                profile.biometricEnabled
                  ? 'bg-emerald-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  profile.biometricEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2.3. Налаштування швидких пресетів операцій (Блок 4.1) */}
          <button
            type="button"
            onClick={() => setActiveSubScreen('PRESETS')}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-sky-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Шаблони повторюваних операцій (Пресети)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Активних шаблонів: {presets.length} (ЄСВ, Оренда, Інтернет, РКО, Канцтовари...)
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>

          {/* 2.4. AI-розпізнавання документів (Google Gemini Vision API) */}
          <button
            type="button"
            onClick={() => {
              setGeminiTestResult(null);
              setActiveSubScreen('AI_SCANNER');
            }}
            className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 shrink-0">
                <ScanLine className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white break-words">
                  AI-розпізнавання документів (Gemini API)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Модель: {geminiModel || DEFAULT_GEMINI_MODEL} •{' '}
                  {geminiApiKey.trim() ? 'Ключ налаштовано' : 'Введіть API-ключ'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* 3. ГРУПА «Податковий календар та сповіщення» (Блок 3.4) */}
      <div className="space-y-1.5">
        <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Податковий календар та сповіщення
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                {profile.taxRemindersEnabled ? (
                  <BellRing className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  Локальні нагадування про податкові дедлайни
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Автономні пуш-повідомлення про сплату авансів ПДФО/ВЗ, ЄСВ та подання річної декларації
                </div>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(profile.taxRemindersEnabled)}
              onClick={handleToggleTaxReminders}
              className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                profile.taxRemindersEnabled
                  ? 'bg-indigo-600'
                  : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  profile.taxRemindersEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {TAX_CALENDAR_DEADLINES.map((dl) => (
              <div
                key={dl.id}
                className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/70 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-slate-900 dark:text-white truncate">
                    {dl.title}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold shrink-0">
                    {dl.badge}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {dl.description}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleTestNotification}
            className="w-full py-2 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 transition-colors"
          >
            🔔 Надіслати тестове нагадування зараз
          </button>
        </div>
      </div>

      {/* 4. ГРУПА НАЛАШТУВАНЬ «Дані та сховище» */}
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
          <div className="px-4 py-3 bg-slate-50/70 dark:bg-slate-900/50 flex items-center gap-2.5">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-snug">
              Автономна локальна база даних (Android) — 100% офлайн та конфіденційність на вашому пристрої
            </p>
          </div>

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
                  Зберегти та поширити повну копію бази даних через системне меню Share
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
          </button>

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

      {/* 5. ГРУПА «Про додаток та оновлення» */}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                      Завантаження:{' '}
                      {downloadProgress.percent >= 0 ? `${downloadProgress.percent}%` : '...'}
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
              {isCheckingUpdate
                ? 'Перевірка наявності оновлень...'
                : '🔄 Перевірити наявність оновлень'}
            </span>
          </button>

          <div className="text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
            Поточна версія: {CURRENT_APP_VERSION}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
