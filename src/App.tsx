import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  Moon,
  Plus,
  PlusCircle,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { AnnualReportView } from './components/AnnualReportView';
import { FixedAssetsRegistry } from './components/FixedAssetsRegistry';
import { QuickInputModal } from './components/QuickInputModal';
import { SettingsView } from './components/SettingsView';
import { TransactionsJournal } from './components/TransactionsJournal';
import {
  type AttorneyExpenseTemplate,
  VAT_PAYER_REMINDER_TEXT,
} from './constants/taxConstants';
import { db, DEFAULT_PROFILE, ensureDefaultProfile } from './db/database';
import type { TaxTransaction, TransactionType } from './types/tax';
import {
  type ApkDownloadProgress,
  checkForAppUpdate,
  downloadAndInstallApkInApp,
  formatMegabytes,
  type UpdateCheckResult,
} from './utils/appUpdater';
import {
  hideNativeSplashScreen,
  registerAndroidBackButton,
} from './utils/nativePlatform';
import {
  type AppTheme,
  applyThemeToDocument,
  getInitialTheme,
} from './utils/theme';

type ActiveTab = 'JOURNAL' | 'ASSETS' | 'REPORT' | 'SETTINGS';

export const App: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [activeTab, setActiveTab] = useState<ActiveTab>('JOURNAL');
  const [theme, setTheme] = useState<AppTheme>(() => getInitialTheme());

  const [isActionSheetOpen, setIsActionSheetOpen] = useState<boolean>(false);
  const [isQuickModalOpen, setIsQuickModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<TaxTransaction | null>(null);
  const [presetAttorneyTemplate, setPresetAttorneyTemplate] =
    useState<AttorneyExpenseTemplate | null>(null);
  const [presetTransactionType, setPresetTransactionType] = useState<TransactionType | null>(null);
  const [openAssetModalKey, setOpenAssetModalKey] = useState<number>(0);

  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  const [isDownloadingModalApk, setIsDownloadingModalApk] = useState<boolean>(false);
  const [modalDownloadProgress, setModalDownloadProgress] = useState<ApkDownloadProgress | null>(
    null
  );
  const [modalDownloadError, setModalDownloadError] = useState<string | null>(null);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    ensureDefaultProfile()
      .then(() => hideNativeSplashScreen())
      .catch(console.error);

    checkForAppUpdate()
      .then((res) => {
        if (res.hasUpdate) {
          setAvailableUpdate(res);
        }
      })
      .catch(() => {});
  }, []);

  // Обробка апаратної кнопки «Назад» на Android (@capacitor/app)
  useEffect(() => {
    return registerAndroidBackButton(() => {
      if (isActionSheetOpen) {
        setIsActionSheetOpen(false);
        return true;
      }
      if (isQuickModalOpen) {
        setIsQuickModalOpen(false);
        return true;
      }
      if (activeTab !== 'JOURNAL') {
        setActiveTab('JOURNAL');
        return true;
      }
      return false;
    });
  }, [isActionSheetOpen, isQuickModalOpen, activeTab]);

  const profile =
    useLiveQuery(() => db.profile.get('default'), [], DEFAULT_PROFILE) || DEFAULT_PROFILE;
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []) || [];
  const fixedAssets = useLiveQuery(() => db.fixedAssets.toArray(), [], []) || [];

  const availableYears = Array.from({ length: 8 }, (_, idx) => currentYear + 1 - idx).filter(
    (y) => y >= 2021
  );

  const handleOpenNewTransaction = (initialType: TransactionType | null = null) => {
    setIsActionSheetOpen(false);
    setEditingTransaction(null);
    setPresetAttorneyTemplate(null);
    setPresetTransactionType(initialType);
    setIsQuickModalOpen(true);
  };

  const handleOpenNewFixedAsset = () => {
    setIsActionSheetOpen(false);
    setActiveTab('ASSETS');
    setOpenAssetModalKey((prev) => prev + 1);
  };

  const handleEditTransaction = (tx: TaxTransaction) => {
    setEditingTransaction(tx);
    setPresetAttorneyTemplate(null);
    setPresetTransactionType(null);
    setIsQuickModalOpen(true);
  };

  const handleStartModalInstall = async (url: string) => {
    setIsDownloadingModalApk(true);
    setModalDownloadError(null);
    setModalDownloadProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
    try {
      await downloadAndInstallApkInApp(url, (prog) => {
        setModalDownloadProgress(prog);
      });
    } catch (err) {
      setModalDownloadError(
        err instanceof Error ? err.message : 'Помилка завантаження оновлення.'
      );
    } finally {
      setIsDownloadingModalApk(false);
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 safe-main-bottom md:pb-8 transition-colors duration-200 print:bg-white print:pb-0">
      {/* Головний навігаційний хедер (з підтримкою safe-area-inset-top для Android) */}
      <header className="sticky top-0 z-30 bg-slate-900 dark:bg-slate-950 text-white shadow-md border-b border-slate-800/80 safe-top print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-3">
            {/* Векторний фінансовий логотип та назва «Книга обліку доходів і витрат» */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-400 via-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-600/20 shrink-0">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.2]" />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 flex items-center justify-center">
                  <ArrowUpRight className="w-2.5 h-2.5 text-white stroke-[3]" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xs sm:text-base font-extrabold tracking-tight truncate">
                    Книга обліку доходів і витрат
                  </h1>
                  <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" /> Офлайн
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate">
                  {profile.fullName
                    ? `${profile.fullName} • Наказ Мінфіну № 261`
                    : 'Наказ Мінфіну № 261'}
                </p>
              </div>
            </div>

            {/* Десктопні вкладки */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
              <button
                type="button"
                onClick={() => setActiveTab('JOURNAL')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'JOURNAL'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Журнал</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('ASSETS')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'ASSETS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>ОЗ / НА</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('REPORT')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'REPORT'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Звіт</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SETTINGS')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'SETTINGS'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <Settings className="w-4 h-4" />
                <span>Профіль</span>
              </button>
            </nav>

            {/* Перемикач теми (Сонце / Місяць), вибір звітного року та кнопка додавання */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Перемкнути тему"
                title={theme === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-sky-300" />
                )}
              </button>

              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-2 sm:px-2.5 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-400 mr-1 hidden sm:block" />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  aria-label="Звітний рік"
                  className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr} className="bg-slate-900 text-white">
                      {yr} р.
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setIsActionSheetOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Додати</span>
              </button>
            </div>
          </div>
        </div>

        {/* Індикатор ПДВ у шапці, якщо увімкнено */}
        {profile.isVatPayer && (
          <div className="bg-blue-950/90 border-t border-blue-800/70 px-3 py-1 text-center text-[10px] sm:text-[11px] font-semibold text-sky-200 truncate">
            {VAT_PAYER_REMINDER_TEXT} (п. 2 розд. ІІ Порядку № 261)
          </div>
        )}
      </header>

      {/* Основний контент */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-3.5 sm:py-5 print:max-w-none print:p-0">
        {activeTab === 'JOURNAL' && (
          <TransactionsJournal
            transactions={transactions}
            selectedYear={selectedYear}
            onAddReturnClick={() => handleOpenNewTransaction('RETURN')}
            onEditTransaction={handleEditTransaction}
          />
        )}

        {activeTab === 'ASSETS' && (
          <FixedAssetsRegistry
            fixedAssets={fixedAssets}
            selectedYear={selectedYear}
            profile={profile}
            openCreateRequestKey={openAssetModalKey}
          />
        )}

        {activeTab === 'REPORT' && (
          <AnnualReportView
            profile={profile}
            transactions={transactions}
            fixedAssets={fixedAssets}
            selectedYear={selectedYear}
          />
        )}

        {activeTab === 'SETTINGS' && (
          <SettingsView
            profile={profile}
            selectedYear={selectedYear}
            transactionsCount={transactions.length}
            fixedAssetsCount={fixedAssets.length}
            theme={theme}
            onChangeTheme={setTheme}
            onUpdateFound={(upd) => setAvailableUpdate(upd)}
          />
        )}
      </main>

      {/* ActionSheet меню центральної кнопки «+» (2 варіанти: Додати операцію / Додати об'єкт ОЗ / НА) */}
      {isActionSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-3 sm:p-4 print:hidden animate-fade-in"
          onClick={() => setIsActionSheetOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2.5 safe-bottom animate-slide-up sm:animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Оберіть дію
              </span>
              <button
                type="button"
                onClick={() => setIsActionSheetOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Додати операцію */}
            <button
              type="button"
              onClick={() => handleOpenNewTransaction(null)}
              className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 hover:bg-blue-50 dark:hover:bg-blue-950/50 border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 flex items-center gap-3.5 text-left transition-all duration-200 active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Додати операцію
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="truncate">Дохід, витрата або повернення</span>
                </div>
              </div>
            </button>

            {/* 2. Додати об'єкт ОЗ / НА */}
            <button
              type="button"
              onClick={handleOpenNewFixedAsset}
              className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 flex items-center gap-3.5 text-left transition-all duration-200 active:scale-[0.98]"
            >
              <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Додати об’єкт ОЗ / НА
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  Обладнання та техніка для розрахунку амортизації
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsActionSheetOpen(false)}
              className="w-full py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Модальне вікно автоматичної пропозиції оновлення додатку */}
      {availableUpdate?.hasUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 print:hidden animate-fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden p-5 space-y-4 animate-scale-in">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Доступне оновлення!
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Нова версія:{' '}
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {availableUpdate.latestVersion}
                    </strong>{' '}
                    (поточна: {availableUpdate.currentVersion})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAvailableUpdate(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {availableUpdate.releaseNotes && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 max-h-36 overflow-y-auto whitespace-pre-line">
                {availableUpdate.releaseNotes}
              </div>
            )}

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Натисніть <strong>«Завантажити та встановити»</strong> — оновлення завантажиться прямо всередині додатку й автоматично відкриє системне вікно встановлення Android.
            </p>

            {isDownloadingModalApk && modalDownloadProgress && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <span>
                    Завантаження у додатку:{' '}
                    {modalDownloadProgress.percent >= 0 ? `${modalDownloadProgress.percent}%` : '...'}
                  </span>
                  {modalDownloadProgress.totalBytes > 0 && (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      {formatMegabytes(modalDownloadProgress.downloadedBytes)} /{' '}
                      {formatMegabytes(modalDownloadProgress.totalBytes)}
                    </span>
                  )}
                </div>
                <div className="w-full h-3 bg-emerald-200/80 dark:bg-emerald-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-150"
                    style={{
                      width: `${Math.max(5, Math.min(100, modalDownloadProgress.percent || 5))}%`,
                    }}
                  />
                </div>
                {modalDownloadProgress.percent === 100 && (
                  <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                    Завантаження завершено! Відкриваємо вікно встановлення Android...
                  </p>
                )}
              </div>
            )}

            {modalDownloadError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200">
                {modalDownloadError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDownloadingModalApk}
                onClick={() => setAvailableUpdate(null)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                Пізніше
              </button>
              <button
                type="button"
                disabled={isDownloadingModalApk}
                onClick={() => handleStartModalInstall(availableUpdate.downloadUrl)}
                className="flex-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-extrabold shadow-md flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>
                  {isDownloadingModalApk ? 'Завантаження...' : 'Завантажити та встановити'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Десктопна плаваюча кнопка швидкого додавання */}
      <button
        type="button"
        onClick={() => setIsActionSheetOpen(true)}
        className="hidden md:flex fixed right-6 bottom-6 z-40 w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 items-center justify-center transition-all print:hidden"
        aria-label="Додати запис"
        title="Додати операцію або об’єкт ОЗ/НА"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Мобільна нижня панель навігації (BOTTOM BAR — Екран № 5) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-1.5 pt-1.5 safe-bottom grid grid-cols-5 items-center gap-1 shadow-lg transition-colors duration-200 print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('JOURNAL')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'JOURNAL'
              ? 'text-blue-600 dark:text-sky-400 bg-blue-50/80 dark:bg-blue-950/60'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">Журнал</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ASSETS')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'ASSETS'
              ? 'text-blue-600 dark:text-sky-400 bg-blue-50/80 dark:bg-blue-950/60'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">ОЗ / НА</span>
        </button>

        {/* Центральна синя кнопка «+» (відкриває ActionSheet) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={() => setIsActionSheetOpen((prev) => !prev)}
            className="w-12 h-11 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-md shadow-blue-600/30 flex flex-col items-center justify-center transition-transform"
            aria-label="Меню додавання"
          >
            <Plus
              className={`w-6 h-6 transition-transform duration-200 ${
                isActionSheetOpen ? 'rotate-45' : ''
              }`}
            />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('REPORT')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'REPORT'
              ? 'text-blue-600 dark:text-sky-400 bg-blue-50/80 dark:bg-blue-950/60'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">Звіт</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SETTINGS')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'SETTINGS'
              ? 'text-blue-600 dark:text-sky-400 bg-blue-50/80 dark:bg-blue-950/60'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Settings className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">Профіль</span>
        </button>
      </nav>

      {/* Модальне вікно швидкого введення операцій */}
      <QuickInputModal
        isOpen={isQuickModalOpen}
        onClose={() => setIsQuickModalOpen(false)}
        profile={profile}
        editingTransaction={editingTransaction}
        presetAttorneyTemplate={presetAttorneyTemplate}
        presetType={presetTransactionType}
      />
    </div>
  );
};

export default App;
