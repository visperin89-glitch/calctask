import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  Building2,
  Calendar,
  Download,
  FileSpreadsheet,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
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
import type { TaxTransaction } from './types/tax';
import {
  type ApkDownloadProgress,
  checkForAppUpdate,
  downloadAndInstallApkInApp,
  formatMegabytes,
  type UpdateCheckResult,
} from './utils/appUpdater';
import { seedDemoData } from './utils/backup';
import {
  hideNativeSplashScreen,
  registerAndroidBackButton,
} from './utils/nativePlatform';

type ActiveTab = 'JOURNAL' | 'ASSETS' | 'REPORT' | 'SETTINGS';

export const App: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [activeTab, setActiveTab] = useState<ActiveTab>('JOURNAL');
  const [isQuickModalOpen, setIsQuickModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<TaxTransaction | null>(null);
  const [presetAttorneyTemplate, setPresetAttorneyTemplate] =
    useState<AttorneyExpenseTemplate | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  const [isDownloadingModalApk, setIsDownloadingModalApk] = useState<boolean>(false);
  const [modalDownloadProgress, setModalDownloadProgress] = useState<ApkDownloadProgress | null>(
    null
  );
  const [modalDownloadError, setModalDownloadError] = useState<string | null>(null);

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
      if (isQuickModalOpen) {
        setIsQuickModalOpen(false);
        return true;
      }
      if (activeTab !== 'JOURNAL') {
        setActiveTab('JOURNAL');
        return true;
      }
      return false; // Вихід із додатку, якщо ми вже на головній вкладці
    });
  }, [isQuickModalOpen, activeTab]);

  const profile = useLiveQuery(() => db.profile.get('default'), [], DEFAULT_PROFILE) || DEFAULT_PROFILE;
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []) || [];
  const fixedAssets = useLiveQuery(() => db.fixedAssets.toArray(), [], []) || [];

  const availableYears = Array.from({ length: 8 }, (_, idx) => currentYear + 1 - idx).filter(
    (y) => y >= 2021
  );

  const handleOpenNewTransaction = () => {
    setEditingTransaction(null);
    setPresetAttorneyTemplate(null);
    setIsQuickModalOpen(true);
  };

  const handleEditTransaction = (tx: TaxTransaction) => {
    setEditingTransaction(tx);
    setPresetAttorneyTemplate(null);
    setIsQuickModalOpen(true);
  };

  const handleSelectAttorneyTemplate = (tpl: AttorneyExpenseTemplate) => {
    setEditingTransaction(null);
    setPresetAttorneyTemplate(tpl);
    setIsQuickModalOpen(true);
  };

  const handleQuickDemoLoad = async () => {
    await seedDemoData(selectedYear);
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-50 text-slate-900 safe-main-bottom md:pb-8 print:bg-white print:pb-0">
      {/* Головний навігаційний хедер (з підтримкою safe-area-inset-top для Android) */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md safe-top print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-3">
            {/* Логотип та назва */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center font-black text-[11px] sm:text-xs tracking-tighter text-white shadow-inner shrink-0">
                №261
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-xs sm:text-base font-extrabold tracking-tight truncate">
                    Книга обліку ФОП
                  </h1>
                  <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3 h-3" /> Офлайн
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                  {profile.fullName ? profile.fullName : 'Наказ Мінфіну № 261'}
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
                <span>Журнал операцій</span>
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
                <span>Реєстр ОЗ/НА</span>
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
                <span>Річний звіт № 261</span>
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
                <span>Налаштування</span>
              </button>
            </nav>

            {/* Вибір звітного року та кнопка швидкого запису */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                onClick={handleOpenNewTransaction}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Запис</span>
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
        {/* Повідомлення про наявність нової версії APK на GitHub */}
        {availableUpdate?.hasUpdate && (
          <div className="mb-3.5 p-3 rounded-2xl bg-emerald-600 text-white shadow-sm flex items-center justify-between gap-2 print:hidden">
            <div className="text-xs font-bold min-w-0 truncate">
              Доступне оновлення додатку ({availableUpdate.latestVersion})!
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isDownloadingModalApk}
                onClick={() => handleStartModalInstall(availableUpdate.downloadUrl)}
                className="px-3 py-1.5 rounded-xl bg-white text-emerald-900 text-xs font-extrabold flex items-center gap-1 shadow-2xs disabled:opacity-60"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloadingModalApk ? 'Завантаження...' : 'Оновити'}</span>
              </button>
              <button
                type="button"
                onClick={() => setAvailableUpdate(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white"
                aria-label="Закрити"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Банер швидкого старту для порожньої бази */}
        {transactions.length === 0 && fixedAssets.length === 0 && activeTab !== 'SETTINGS' && (
          <div className="mb-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50 to-slate-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
            <div className="space-y-0.5">
              <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Книга обліку доходів і витрат (Форма № 261)</span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-600">
                Додайте власну операцію кнопкою «+ Запис» або завантажте демо-приклад для перевірки звіту та експорту в Excel.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleQuickDemoLoad}
                className="w-full sm:w-auto justify-center px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Заповнити демо-даними</span>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'JOURNAL' && (
          <TransactionsJournal
            transactions={transactions}
            selectedYear={selectedYear}
            onAddClick={handleOpenNewTransaction}
            onEditTransaction={handleEditTransaction}
            onSelectAttorneyTemplate={handleSelectAttorneyTemplate}
          />
        )}

        {activeTab === 'ASSETS' && (
          <FixedAssetsRegistry
            fixedAssets={fixedAssets}
            selectedYear={selectedYear}
            profile={profile}
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
            onUpdateFound={(upd) => setAvailableUpdate(upd)}
          />
        )}
      </main>

      {/* Модальне вікно автоматичної пропозиції оновлення додатку */}
      {availableUpdate?.hasUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 print:hidden">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Доступне оновлення!
                  </h3>
                  <p className="text-xs text-slate-500">
                    Нова версія: <strong className="text-emerald-700">{availableUpdate.latestVersion}</strong> (поточна: {availableUpdate.currentVersion})
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
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 max-h-36 overflow-y-auto whitespace-pre-line">
                {availableUpdate.releaseNotes}
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed">
              Натисніть <strong>«Завантажити та встановити»</strong> — оновлення завантажиться прямо всередині додатку й автоматично відкриє системне вікно встановлення Android без переходу в браузер.
            </p>

            {isDownloadingModalApk && modalDownloadProgress && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                  <span>
                    Завантаження у додатку:{' '}
                    {modalDownloadProgress.percent >= 0 ? `${modalDownloadProgress.percent}%` : '...'}
                  </span>
                  {modalDownloadProgress.totalBytes > 0 && (
                    <span className="text-[11px] text-emerald-700">
                      {formatMegabytes(modalDownloadProgress.downloadedBytes)} /{' '}
                      {formatMegabytes(modalDownloadProgress.totalBytes)}
                    </span>
                  )}
                </div>
                <div className="w-full h-3 bg-emerald-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-150"
                    style={{
                      width: `${Math.max(5, Math.min(100, modalDownloadProgress.percent || 5))}%`,
                    }}
                  />
                </div>
                {modalDownloadProgress.percent === 100 && (
                  <p className="text-[11px] font-semibold text-emerald-800">
                    Завантаження завершено! Відкриваємо вікно встановлення Android...
                  </p>
                )}
              </div>
            )}

            {modalDownloadError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                {modalDownloadError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDownloadingModalApk}
                onClick={() => setAvailableUpdate(null)}
                className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 disabled:opacity-50"
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

      {/* Десктопна плаваюча кнопка швидкого введення */}
      <button
        type="button"
        onClick={handleOpenNewTransaction}
        className="hidden md:flex fixed right-6 bottom-6 z-40 w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 items-center justify-center transition-all print:hidden"
        aria-label="Швидкий запис операції"
        title="Швидкий запис операції"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Мобільна нижня панель навігації з центральною кнопкою «+ Запис» (чітко вписана в екран, без GPU-важкого backdrop-blur) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 px-1.5 pt-1.5 safe-bottom grid grid-cols-5 items-center gap-1 shadow-lg print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('JOURNAL')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'JOURNAL' ? 'text-blue-600 bg-blue-50/80' : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">Журнал</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ASSETS')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'ASSETS' ? 'text-blue-600 bg-blue-50/80' : 'text-slate-500'
          }`}
        >
          <Building2 className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">ОЗ / НА</span>
        </button>

        {/* Центральна кнопка швидкого запису (не перекриває контент на екрані) */}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={handleOpenNewTransaction}
            className="w-12 h-11 rounded-2xl bg-blue-600 active:scale-95 text-white shadow-md shadow-blue-600/30 flex flex-col items-center justify-center"
            aria-label="Додати запис"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('REPORT')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'REPORT' ? 'text-blue-600 bg-blue-50/80' : 'text-slate-500'
          }`}
        >
          <FileSpreadsheet className="w-5 h-5 mb-0.5" />
          <span className="truncate max-w-full">Форма 261</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SETTINGS')}
          className={`flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
            activeTab === 'SETTINGS' ? 'text-blue-600 bg-blue-50/80' : 'text-slate-500'
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
      />
    </div>
  );
};

export default App;
