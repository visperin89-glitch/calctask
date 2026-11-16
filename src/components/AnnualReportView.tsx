import React, { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Code2,
  Copy,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Printer,
  Share2,
  Smartphone,
  Square,
  Table2,
} from 'lucide-react';
import { db } from '../db/database';
import type {
  FixedAsset,
  PeriodSummaryTotals,
  TaxProfile,
  TaxTransaction,
} from '../types/tax';
import {
  calculateTaxLiabilities,
  formatCurrency,
  generateAnnualReport,
  roundCurrency,
} from '../utils/calculations';
import { exportTaxBookToExcel } from '../utils/excelExport';
import { triggerLightHaptic } from '../utils/nativeFeatures';
import { isNativeApp } from '../utils/nativePlatform';
import { exportTaxBookToPdf } from '../utils/pdfExport';
import { exportTaxBookToXml } from '../utils/xmlExport';

interface AnnualReportViewProps {
  profile: TaxProfile;
  transactions: TaxTransaction[];
  fixedAssets: FixedAsset[];
  selectedYear: number;
}

export const AnnualReportView: React.FC<AnnualReportViewProps> = ({
  profile,
  transactions,
  fixedAssets,
  selectedYear,
}) => {
  const [includeAutoAmortization, setIncludeAutoAmortization] = useState(true);
  const [confirmedExpensesOnly, setConfirmedExpensesOnly] = useState<boolean>(
    Boolean(profile.confirmedExpensesOnlyInReport)
  );
  const [activeSheet, setActiveSheet] = useState<'MAIN' | 'AMORT' | 'BOTH'>('MAIN');
  const [mobileViewMode, setMobileViewMode] = useState<'FIT' | 'TABLE'>('FIT');

  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingXml, setIsExportingXml] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Стан блоку «Дані для податкової декларації» (Додаток Ф2 / Додаток ЄСВ 1)
  const [activeDeclarationTab, setActiveDeclarationTab] = useState<'F2' | 'ESV1'>('F2');
  const [isDeclarationExpanded, setIsDeclarationExpanded] = useState<boolean>(true);
  const [copiedFieldLabel, setCopiedFieldLabel] = useState<string | null>(null);

  useEffect(() => {
    setConfirmedExpensesOnly(Boolean(profile.confirmedExpensesOnlyInReport));
  }, [profile.confirmedExpensesOnlyInReport]);

  const handleToggleConfirmedExpenses = async () => {
    const next = !confirmedExpensesOnly;
    setConfirmedExpensesOnly(next);
    await db.profile.put({
      ...profile,
      confirmedExpensesOnlyInReport: next,
    });
    await triggerLightHaptic();
  };

  const { annualReport, amortizationReport } = useMemo(
    () =>
      generateAnnualReport(
        transactions,
        fixedAssets,
        selectedYear,
        includeAutoAmortization,
        confirmedExpensesOnly
      ),
    [
      transactions,
      fixedAssets,
      selectedYear,
      includeAutoAmortization,
      confirmedExpensesOnly,
    ]
  );

  // Блок 2.1: Автоматичний розрахунок податкових зобов'язань у реальному часі
  const taxSummary = useMemo(
    () => calculateTaxLiabilities(annualReport, profile),
    [annualReport, profile]
  );

  const showExportFeedback = (fileName: string, isNative: boolean, shared?: boolean) => {
    if (isNative) {
      setExportNotice(
        `Файл ${fileName} збережено на пристрої${
          shared ? ' та відкрито системне меню поширення (Share).' : '.'
        }`
      );
    } else {
      setExportNotice(`Файл ${fileName} успішно сформовано та завантажено.`);
    }
    setTimeout(() => setExportNotice(null), 6500);
  };

  const handleExportExcel = async () => {
    setIsExportingExcel(true);
    setExportNotice(null);
    try {
      const res = await exportTaxBookToExcel(
        profile,
        annualReport,
        amortizationReport,
        true
      );
      await triggerLightHaptic();
      showExportFeedback(res.fileName, res.isNative, res.shared);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Блок 1.3: Генерація друкованого PDF-бланка («Експорт у PDF (Книжкова форма)»)
  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setExportNotice(null);
    try {
      const res = await exportTaxBookToPdf(
        profile,
        annualReport,
        amortizationReport,
        true
      );
      await triggerLightHaptic();
      showExportFeedback(res.fileName, res.isNative, res.shared);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Блок 2.4: Експорт у формат XML для Електронного кабінету ДПС
  const handleExportXml = async () => {
    setIsExportingXml(true);
    setExportNotice(null);
    try {
      const res = await exportTaxBookToXml(
        profile,
        annualReport,
        amortizationReport,
        true
      );
      await triggerLightHaptic();
      showExportFeedback(res.fileName, res.isNative, res.shared);
    } finally {
      setIsExportingXml(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyValue = async (label: string, numericVal: number) => {
    const formatted = roundCurrency(numericVal).toFixed(2);
    try {
      await navigator.clipboard.writeText(formatted);
      setCopiedFieldLabel(label);
      await triggerLightHaptic();
      setTimeout(() => setCopiedFieldLabel(null), 2000);
    } catch {
      // Ігноруємо
    }
  };

  const fullNameDisplay =
    profile.fullName?.trim() || '__________________________________________________';
  const taxIdDisplay = profile.taxId?.trim() || '_________________________';
  const activityDisplay =
    profile.activityType === 'independent'
      ? 'Фізична особа, яка провадить незалежну професійну діяльність'
      : 'Фізична особа – підприємець (загальна система оподаткування)';

  const renderTotalsCells = (totals: PeriodSummaryTotals, isHighlight = false) => {
    const cellCls = `p-1.5 border border-slate-400 text-right font-bold whitespace-nowrap ${
      isHighlight ? 'text-blue-950' : 'text-slate-900'
    }`;
    return (
      <>
        <td className={cellCls}>{formatCurrency(totals.col2_income)}</td>
        <td className={cellCls}>{formatCurrency(totals.col3_return)}</td>
        <td className={cellCls}>{formatCurrency(totals.col4_netIncome)}</td>
        <td className="p-1.5 border border-slate-400 text-center text-slate-400">—</td>
        <td className={cellCls}>{formatCurrency(totals.col6_tmc)}</td>
        <td className={cellCls}>{formatCurrency(totals.col7_salary)}</td>
        <td className={cellCls}>{formatCurrency(totals.col8_taxes)}</td>
        <td className={cellCls}>{formatCurrency(totals.col9_other)}</td>
        <td className={cellCls}>{formatCurrency(totals.col10_amortization)}</td>
        <td className={cellCls}>{formatCurrency(totals.col11_profit)}</td>
      </>
    );
  };

  const totalExpensesYear =
    annualReport.yearTotals.col6_tmc +
    annualReport.yearTotals.col7_salary +
    annualReport.yearTotals.col8_taxes +
    annualReport.yearTotals.col9_other +
    annualReport.yearTotals.col10_amortization;

  return (
    <div className="space-y-4 w-full animate-fade-in">
      {/* Панель керування звітом та кнопки експорту (Excel / PDF / XML / Друк) */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-3.5 print:hidden transition-colors duration-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Річний звіт за Типовою формою № 261 ({selectedYear} рік)
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Підсумковий реєстр щоденних записів за І–IV квартали, податковий калькулятор та дані декларації
            </p>
          </div>

          {/* Кнопки експорту (Excel .xlsx, PDF Книжкова форма, XML для ДПС) */}
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
            {/* 1. Експорт у PDF (Книжкова форма) — Блок 1.3 */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="w-full sm:w-auto justify-center px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>
                {isExportingPdf
                  ? 'Формування PDF...'
                  : 'Експорт у PDF (Книжкова форма)'}
              </span>
            </button>

            {/* 2. Експорт XML (для ДПС) — Блок 2.4 */}
            <button
              type="button"
              onClick={handleExportXml}
              disabled={isExportingXml}
              className="w-full sm:w-auto justify-center px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <FileCode2 className="w-4 h-4 shrink-0" />
              <span>
                {isExportingXml ? 'Формування XML...' : 'Експорт XML (для ДПС)'}
              </span>
            </button>

            {/* 3. Експорт Excel (.xlsx) */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="w-full sm:w-auto justify-center px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-[0.98]"
            >
              {isNativeApp() ? (
                <Share2 className="w-4 h-4 shrink-0" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
              )}
              <span>
                {isExportingExcel ? 'Формування...' : 'Експорт Excel (.xlsx)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex px-3.5 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-xs items-center gap-1.5 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Друк</span>
            </button>
          </div>
        </div>

        {/* Налаштування розрахунку звіту (автоамортизація + підтверджені витрати Блок 2.3) */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-700/70 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={() => setIncludeAutoAmortization((prev) => !prev)}
                className="inline-flex items-start sm:items-center gap-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
              >
                {includeAutoAmortization ? (
                  <CheckSquare className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0 mt-0.5 sm:mt-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                )}
                <span>
                  Автоматично переносити амортизацію ({formatCurrency(amortizationReport.totalYearAmortization)} грн) у Гр. 10 на 31.12.{selectedYear}
                </span>
              </button>

              {/* Блок 2.3: Опція врахування лише підтверджених документами витрат */}
              <button
                type="button"
                onClick={handleToggleConfirmedExpenses}
                className="inline-flex items-start sm:items-center gap-2 text-left text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-emerald-600"
              >
                {confirmedExpensesOnly ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 sm:mt-0" />
                )}
                <span>
                  Враховувати у витратах (Графи 6–9) лише підтверджені документами операції
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="xl:hidden inline-flex w-full sm:w-auto rounded-xl bg-blue-50 dark:bg-slate-900 p-1 border border-blue-200 dark:border-slate-700 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setMobileViewMode('FIT')}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
                    mobileViewMode === 'FIT'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-800 dark:text-slate-300'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Під екран</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewMode('TABLE')}
                  className={`flex-1 px-2.5 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
                    mobileViewMode === 'TABLE'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'text-blue-800 dark:text-slate-300'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Таблиця 11 граф</span>
                </button>
              </div>

              <div className="inline-flex w-full sm:w-auto rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-700 text-[11px] sm:text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveSheet('MAIN')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg transition-colors ${
                    activeSheet === 'MAIN'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Форма № 261
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSheet('AMORT')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg transition-colors ${
                    activeSheet === 'AMORT'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Амортизація
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSheet('BOTH')}
                  className={`flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg transition-colors ${
                    activeSheet === 'BOTH'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Обидва
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-2xs print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="break-all">{exportNotice}</span>
        </div>
      )}

      {/* Компактне річне зведення */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 print:hidden">
        <div className="min-w-0 bg-white dark:bg-slate-800 rounded-xl p-2.5 sm:p-3.5 border border-slate-200 dark:border-slate-700/80">
          <div className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
            Дохід за рік (Гр. 4)
          </div>
          <div className="text-xs xs:text-sm sm:text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
            {formatCurrency(annualReport.yearTotals.col4_netIncome)} ₴
          </div>
        </div>
        <div className="min-w-0 bg-white dark:bg-slate-800 rounded-xl p-2.5 sm:p-3.5 border border-slate-200 dark:border-slate-700/80">
          <div className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
            Витрати (Гр. 6–10)
          </div>
          <div className="text-xs xs:text-sm sm:text-lg font-bold text-rose-700 dark:text-rose-400 mt-0.5 truncate">
            {formatCurrency(totalExpensesYear)} ₴
          </div>
        </div>
        <div className="min-w-0 bg-blue-50/90 dark:bg-blue-950/50 rounded-xl p-2.5 sm:p-3.5 border border-blue-200 dark:border-blue-800">
          <div className="text-[10px] sm:text-xs font-bold text-blue-800 dark:text-sky-300 truncate">
            Чистий дохід (Гр. 11)
          </div>
          <div className="text-xs xs:text-sm sm:text-lg font-bold text-blue-900 dark:text-white mt-0.5 truncate">
            {formatCurrency(annualReport.yearTotals.col11_profit)} ₴
          </div>
        </div>
      </div>

      {/* ========================================================================
          БЛОК 2.1: КАЛЬКУЛЯТОР ПОДАТКОВИХ ЗОБОВ'ЯЗАНЬ У РЕАЛЬНОМУ ЧАСІ + КВАРТАЛЬНИЙ ПРОГНОЗ
      ======================================================================== */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Калькулятор податкових зобов’язань у реальному часі ({selectedYear} р.)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Розрахунок від чистого оподатковуваного доходу (Гр. 11: {formatCurrency(taxSummary.taxableProfit)} грн) • МЗП: {formatCurrency(taxSummary.minWage)} грн
              </p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Ефективне навантаження: {taxSummary.effectiveTaxRatePercent}%
          </span>
        </div>

        {/* 4 картки податків */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {/* ПДФО (18%) */}
          <div className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
              ПДФО ({taxSummary.pdfoRate}%)
            </div>
            <div className="text-base xs:text-lg sm:text-xl font-bold text-slate-900 dark:text-white mt-1 truncate">
              {formatCurrency(taxSummary.pdfoAmount)} ₴
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              п. 167.1, ст. 177 / 178 ПКУ
            </div>
          </div>

          {/* Військовий збір */}
          <div className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
              Військовий збір ({taxSummary.militaryTaxRate}%)
            </div>
            <div className="text-base xs:text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-1 truncate">
              {formatCurrency(taxSummary.militaryTaxAmount)} ₴
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Ставка з налаштувань профілю
            </div>
          </div>

          {/* ЄСВ (22%) */}
          <div className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
              ЄСВ ({taxSummary.esvRate}%) за рік
            </div>
            <div className="text-base xs:text-lg sm:text-xl font-bold text-indigo-700 dark:text-indigo-400 mt-1 truncate">
              {formatCurrency(taxSummary.annualCalculatedEsv)} ₴
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              Мін. внесок: {formatCurrency(taxSummary.minMonthlyEsv)} ₴/міс (макс. база {taxSummary.esvMaxBaseMultiplier} МЗП)
            </div>
          </div>

          {/* Усього податків + Залишок */}
          <div className="min-w-0 p-3 sm:p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            <div className="text-[11px] font-bold uppercase text-emerald-800 dark:text-emerald-300 truncate">
              Залишок після податків
            </div>
            <div className="text-base xs:text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1 truncate">
              {formatCurrency(taxSummary.netDisposableIncome)} ₴
            </div>
            <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5 truncate">
              Усього податків: {formatCurrency(taxSummary.totalTaxBurden)} ₴
            </div>
          </div>
        </div>

        {/* Блок прогнозування авансових платежів за кварталами */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/70 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <CalendarClock className="w-4 h-4 text-blue-600 dark:text-sky-400 shrink-0" />
            <span>Прогнозування авансових платежів за кварталами ({selectedYear} р.)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {taxSummary.quarterlyForecasts.map((q) => (
              <div
                key={q.quarter}
                className="min-w-0 p-3 rounded-xl bg-slate-50/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-extrabold text-slate-900 dark:text-white">
                    {q.label}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-sky-300 font-bold text-[11px]">
                    Разом: {formatCurrency(q.totalQuarterPayment)} ₴
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Чистий дохід (Гр. 11):</span>
                    <strong className="text-slate-800 dark:text-slate-200">
                      {formatCurrency(q.netProfit)} ₴
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>ПДФО (18%):</span>
                    <strong>{formatCurrency(q.pdfoAdvance)} ₴</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Військовий збір ({taxSummary.militaryTaxRate}%):</span>
                    <strong>{formatCurrency(q.militaryAdvance)} ₴</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>ЄСВ за квартал (22%):</span>
                    <strong>{formatCurrency(q.esvQuarter)} ₴</strong>
                  </div>
                </div>
                <div className="pt-1 border-t border-slate-200/80 dark:border-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Термін: {q.deadlineText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================
          БЛОК 2.2: ДАНІ ДЛЯ ПОДАТКОВОЇ ДЕКЛАРАЦІЇ (Додаток Ф2 та Додаток ЄСВ 1)
      ======================================================================== */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden print:hidden">
        <div
          onClick={() => setIsDeclarationExpanded((prev) => !prev)}
          className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-700/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Дані для податкової декларації про майновий стан і доходи
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Згруповані підсумкові показники для швидкого перенесення у Додаток Ф2 та Додаток ЄСВ 1
              </p>
            </div>
          </div>
          <span className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300">
            {isDeclarationExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        </div>

        {isDeclarationExpanded && (
          <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-3.5 border-t border-slate-100 dark:border-slate-700/70 pt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-700 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveDeclarationTab('F2')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeDeclarationTab === 'F2'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Додаток Ф2 (ПДФО та ВЗ)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDeclarationTab('ESV1')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    activeDeclarationTab === 'ESV1'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Додаток ЄСВ 1 (12 місяців)
                </button>
              </div>

              {copiedFieldLabel && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  Скопійовано у буфер: {copiedFieldLabel}
                </span>
              )}
            </div>

            {activeDeclarationTab === 'F2' ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700">
                        Показник Додатка Ф2 до Декларації
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700">
                        Графа Книги № 261
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-right">
                        Сума (грн, коп.)
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-right w-16">
                        Копія
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/70">
                    {[
                      {
                        label: 'Сума одержаного доходу (підлягає декларуванню)',
                        col: 'Графа 4',
                        val: annualReport.yearTotals.col4_netIncome,
                        bold: true,
                      },
                      {
                        label: 'Вартість придбаних ТМЦ, що реалізовані або використані',
                        col: 'Графа 6',
                        val: annualReport.yearTotals.col6_tmc,
                      },
                      {
                        label: 'Витрати на оплату праці фізичних осіб (найманих працівників)',
                        col: 'Графа 7',
                        val: annualReport.yearTotals.col7_salary,
                      },
                      {
                        label: 'Витрати на сплату податків, зборів, ЄСВ, ліцензій',
                        col: 'Графа 8',
                        val: annualReport.yearTotals.col8_taxes,
                      },
                      {
                        label: 'Інші витрати (оренда, зв’язок, РКО, бази законодавства тощо)',
                        col: 'Графа 9',
                        val: annualReport.yearTotals.col9_other,
                      },
                      {
                        label: 'Амортизаційні відрахування основних засобів та НА',
                        col: 'Графа 10',
                        val: annualReport.yearTotals.col10_amortization,
                      },
                      {
                        label: 'Усього документально підтверджених витрат за рік',
                        col: 'Графи 6–10',
                        val: totalExpensesYear,
                        bold: true,
                      },
                      {
                        label: 'Сума чистого оподатковуваного доходу (прибутку)',
                        col: 'Графа 11',
                        val: taxSummary.taxableProfit,
                        bold: true,
                      },
                      {
                        label: `Податкове зобов’язання з ПДФО (${taxSummary.pdfoRate}% — Рядок 1.1 розд. ІІ Ф2)`,
                        col: 'Гр. 11 × 18%',
                        val: taxSummary.pdfoAmount,
                        bold: true,
                      },
                      {
                        label: `Податкове зобов’язання з військового збору (${taxSummary.militaryTaxRate}% — Рядок 2.1 розд. ІІ Ф2)`,
                        col: `Гр. 11 × ${taxSummary.militaryTaxRate}%`,
                        val: taxSummary.militaryTaxAmount,
                        bold: true,
                      },
                    ].map((item) => (
                      <tr
                        key={item.label}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        <td
                          className={`p-2.5 text-slate-800 dark:text-slate-200 ${
                            item.bold ? 'font-extrabold' : 'font-medium'
                          }`}
                        >
                          {item.label}
                        </td>
                        <td className="p-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.col}
                        </td>
                        <td
                          className={`p-2.5 text-right whitespace-nowrap ${
                            item.bold
                              ? 'font-extrabold text-slate-900 dark:text-white'
                              : 'font-semibold text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {formatCurrency(item.val)}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleCopyValue(item.label, item.val)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700"
                            title="Скопіювати суму"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-bold">
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700">
                        Місяць ({selectedYear} р.)
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-right">
                        Чистий дохід (гр. 3 ЄСВ 1)
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-right">
                        База нарахування ЄСВ (гр. 4)
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-center">
                        Ставка (гр. 5)
                      </th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 text-right">
                        Нараховано ЄСВ (гр. 6)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700/70">
                    {taxSummary.monthlyEsvRows.map((mRow) => (
                      <tr
                        key={mRow.month}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        <td className="p-2 font-semibold text-slate-800 dark:text-slate-200">
                          {mRow.month}. {mRow.monthName}
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          {formatCurrency(mRow.netProfit)}
                        </td>
                        <td className="p-2 text-right font-semibold text-slate-900 dark:text-white">
                          {formatCurrency(mRow.esvBase)}
                        </td>
                        <td className="p-2 text-center text-slate-500 dark:text-slate-400">
                          {mRow.esvRate}%
                        </td>
                        <td className="p-2 text-right font-extrabold text-indigo-700 dark:text-indigo-400">
                          {formatCurrency(mRow.esvAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50/80 dark:bg-indigo-950/60 font-extrabold text-slate-900 dark:text-white">
                      <td className="p-2.5 border-t border-slate-300 dark:border-slate-700">
                        УСЬОГО за {selectedYear} рік:
                      </td>
                      <td className="p-2.5 border-t border-slate-300 dark:border-slate-700 text-right">
                        {formatCurrency(
                          taxSummary.monthlyEsvRows.reduce((s, r) => s + r.netProfit, 0)
                        )}
                      </td>
                      <td className="p-2.5 border-t border-slate-300 dark:border-slate-700 text-right">
                        {formatCurrency(
                          taxSummary.monthlyEsvRows.reduce((s, r) => s + r.esvBase, 0)
                        )}
                      </td>
                      <td className="p-2.5 border-t border-slate-300 dark:border-slate-700 text-center">
                        22%
                      </td>
                      <td className="p-2.5 border-t border-slate-300 dark:border-slate-700 text-right text-indigo-700 dark:text-indigo-300">
                        {formatCurrency(taxSummary.annualCalculatedEsv)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* АРКУШ 1: ТИПОВА ФОРМА № 261 */}
      {(activeSheet === 'MAIN' || activeSheet === 'BOTH') && (
        <div className="bg-white rounded-2xl p-3.5 sm:p-6 border border-slate-300 shadow-xs print:shadow-none print:border-none print:p-0 text-slate-900">
          {/* Гриф затвердження */}
          <div className="flex justify-end text-[10px] sm:text-[11px] leading-snug text-slate-700 mb-2.5">
            <div className="text-right">
              <div className="font-semibold">ЗАТВЕРДЖЕНО</div>
              <div>Наказ Міністерства фінансів України</div>
              <div>13 травня 2021 року № 261</div>
            </div>
          </div>

          {/* Назва форми */}
          <div className="text-center max-w-3xl mx-auto mb-3.5">
            <h3 className="text-xs sm:text-base font-extrabold uppercase text-slate-900 tracking-tight">
              ТИПОВА ФОРМА, за якою здійснюється облік доходів і витрат
            </h3>
            <p className="text-[11px] sm:text-sm font-bold text-slate-800">
              фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність
            </p>
          </div>

          {/* Реквізити платника податків */}
          <div className="mb-3.5 p-2.5 sm:p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] sm:text-xs space-y-1 print:bg-transparent print:border-none print:p-0">
            <div className="break-words">
              <span className="font-semibold text-slate-700">Платник податків (ПІБ):</span>{' '}
              <span className="font-bold text-slate-900">{fullNameDisplay}</span>{' '}
              <span className="text-slate-600">({activityDisplay})</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <div>
                <span className="font-semibold text-slate-700">РНОКПП / паспорт:</span>{' '}
                <span className="font-bold text-slate-900">{taxIdDisplay}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Звітний період:</span>{' '}
                <span className="font-bold text-slate-900">{selectedYear} рік</span>
              </div>
            </div>
          </div>

          {/* МОБІЛЬНИЙ ТА ПЛАНШЕТНИЙ АДАПТИВНИЙ ВИГЛЯД */}
          {mobileViewMode === 'FIT' && (
            <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-4 items-start print:hidden">
              {annualReport.quarters.map((qBlock) => {
                const qTotalExp =
                  qBlock.quarterTotals.col6_tmc +
                  qBlock.quarterTotals.col7_salary +
                  qBlock.quarterTotals.col8_taxes +
                  qBlock.quarterTotals.col9_other +
                  qBlock.quarterTotals.col10_amortization;

                return (
                  <div
                    key={qBlock.quarter}
                    className="rounded-xl border border-slate-300 overflow-hidden bg-white"
                  >
                    <div className="bg-slate-800 text-white px-3 py-2 flex items-center justify-between text-xs font-bold">
                      <span>
                        І
                        {qBlock.quarter === 1
                          ? ''
                          : qBlock.quarter === 2
                          ? 'І'
                          : qBlock.quarter === 3
                          ? 'ІІ'
                          : 'V'}{' '}
                        квартал {selectedYear} р.
                      </span>
                      <span className="text-sky-300">
                        Чистий: {formatCurrency(qBlock.quarterTotals.col11_profit)} ₴
                      </span>
                    </div>

                    {qBlock.rows.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400 italic">
                        Операції у {qBlock.quarter} кварталі відсутні
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {qBlock.rows.map((dRow, idx) => (
                          <div
                            key={`${dRow.date}-${idx}`}
                            className={`p-3 space-y-2 text-xs ${
                              dRow.isAmortizationEntry ? 'bg-blue-50/60' : 'bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                                Гр. 1: {dRow.formattedDate}
                              </span>
                              <span
                                className={`font-extrabold ${
                                  dRow.col11_profit >= 0 ? 'text-blue-700' : 'text-rose-700'
                                }`}
                              >
                                Гр. 11: {formatCurrency(dRow.col11_profit)} ₴
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100">
                              {dRow.col2_income > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 2 (Дохід):</span>{' '}
                                  <strong className="text-emerald-700">
                                    {formatCurrency(dRow.col2_income)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col3_return > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 3 (Поверн.):</span>{' '}
                                  <strong className="text-amber-700">
                                    {formatCurrency(dRow.col3_return)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col4_netIncome > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 4 (Деклар.):</span>{' '}
                                  <strong className="text-slate-900">
                                    {formatCurrency(dRow.col4_netIncome)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col6_tmc > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 6 (ТМЦ):</span>{' '}
                                  <strong className="text-rose-700">
                                    {formatCurrency(dRow.col6_tmc)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col7_salary > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 7 (ЗП):</span>{' '}
                                  <strong className="text-rose-700">
                                    {formatCurrency(dRow.col7_salary)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col8_taxes > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 8 (ЄСВ/Под.):</span>{' '}
                                  <strong className="text-rose-700">
                                    {formatCurrency(dRow.col8_taxes)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col9_other > 0 && (
                                <div className="min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 9 (Інші):</span>{' '}
                                  <strong className="text-rose-700">
                                    {formatCurrency(dRow.col9_other)}
                                  </strong>
                                </div>
                              )}
                              {dRow.col10_amortization > 0 && (
                                <div className="col-span-2 min-w-0 break-words">
                                  <span className="text-slate-500">Гр. 10 (Амортизація):</span>{' '}
                                  <strong className="text-blue-700">
                                    {formatCurrency(dRow.col10_amortization)}
                                  </strong>
                                </div>
                              )}
                            </div>

                            {dRow.col5_docs && (
                              <div className="text-[11px] text-slate-600 break-words">
                                <span className="font-semibold text-slate-700">
                                  Гр. 5 (Документи):
                                </span>{' '}
                                {dRow.col5_docs}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="bg-slate-100 p-2.5 border-t border-slate-300 text-[11px] space-y-1">
                      <div className="font-bold text-slate-900 flex flex-wrap justify-between gap-1">
                        <span>{qBlock.quarterLabel}:</span>
                        <span className="break-words">
                          Дохід: {formatCurrency(qBlock.quarterTotals.col4_netIncome)} | Витрати:{' '}
                          {formatCurrency(qTotalExp)}
                        </span>
                      </div>
                      <div className="font-extrabold text-blue-900 flex flex-wrap justify-between gap-1 pt-1 border-t border-slate-200">
                        <span>{qBlock.cumulativeLabel}:</span>
                        <span>{formatCurrency(qBlock.cumulativeTotals.col11_profit)} ₴</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ПОВНА РЕГЛАМЕНТОВАНА ТАБЛИЦЯ З 11 ГРАФ */}
          <div
            className={`${
              mobileViewMode === 'FIT' ? 'hidden xl:block print:block' : 'block'
            } overflow-x-auto w-full`}
          >
            <table className="w-full text-[11px] border-collapse border border-slate-400 min-w-[980px]">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-20">
                    Дата запису (день, місяць, рік)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Сума доходу, отриманого від провадження господарської або незалежної професійної діяльності (грн, коп.)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Сума повернутих самозайнятою особою коштів за товари (роботи, послуги) та/або передплати (грн, коп.)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Загальна сума отриманого доходу, яка підлягає декларуванню (гр. 2 – гр. 3) (грн, коп.)
                  </th>
                  <th colSpan={6} className="p-1.5 border border-slate-400">
                    Витрати, пов’язані з господарською діяльністю або провадженням незалежної професійної діяльності
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-28">
                    Сума чистого оподатковуваного доходу (гр. 4 – (гр. 6 + гр. 7 + гр. 8 + гр. 9 + гр. 10)) (грн, коп.)
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                  <th className="p-1.5 border border-slate-400 w-56">
                    реквізити документа, що підтверджує понесені витрати
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    витрати на придбання ТМЦ, що реалізовані або використані у виробництві продукції (грн, коп.)
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    витрати на оплату праці фізичних осіб (у трудових відносинах / за договорами ЦПХ) (грн, коп.)
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    витрати на сплату податків, зборів, ЄСВ, платежів за одержання ліцензій та дозволів (грн, коп.)
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    інші витрати, які безпосередньо пов’язані з отриманням доходу (грн, коп.)
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    амортизаційні відрахування (грн, коп.)
                  </th>
                </tr>
                <tr className="bg-slate-200 text-slate-900 font-extrabold text-center">
                  {Array.from({ length: 11 }, (_, idx) => (
                    <th key={idx + 1} className="py-1 px-1.5 border border-slate-400">
                      {idx + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {annualReport.quarters.map((qBlock) => (
                  <React.Fragment key={qBlock.quarter}>
                    {qBlock.rows.length === 0 ? (
                      <tr className="text-slate-400 italic">
                        <td className="p-1.5 border border-slate-300 text-center">
                          — ({qBlock.quarter} кв.)
                        </td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300">
                          Операції у {qBlock.quarter} кварталі відсутні
                        </td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                        <td className="p-1.5 border border-slate-300 text-right">0,00</td>
                      </tr>
                    ) : (
                      qBlock.rows.map((dRow, idx) => (
                        <tr
                          key={`${dRow.date}-${idx}`}
                          className={
                            dRow.isAmortizationEntry
                              ? 'bg-blue-50/50 text-slate-900'
                              : 'hover:bg-slate-50 text-slate-900'
                          }
                        >
                          <td className="p-1.5 border border-slate-300 text-center font-semibold whitespace-nowrap">
                            {dRow.formattedDate}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col2_income)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col3_return)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right font-semibold whitespace-nowrap">
                            {formatCurrency(dRow.col4_netIncome)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-left">
                            {dRow.col5_docs || '—'}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col6_tmc)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col7_salary)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col8_taxes)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col9_other)}
                          </td>
                          <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                            {formatCurrency(dRow.col10_amortization)}
                          </td>
                          <td
                            className={`p-1.5 border border-slate-300 text-right font-bold whitespace-nowrap ${
                              dRow.col11_profit < 0 ? 'text-rose-700' : 'text-slate-900'
                            }`}
                          >
                            {formatCurrency(dRow.col11_profit)}
                          </td>
                        </tr>
                      ))
                    )}

                    <tr className="bg-slate-100">
                      <td className="p-1.5 border border-slate-400 font-bold text-slate-900">
                        {qBlock.quarterLabel}
                      </td>
                      {renderTotalsCells(qBlock.quarterTotals, false)}
                    </tr>

                    <tr
                      className={
                        qBlock.quarter === 4
                          ? 'bg-blue-100/90 text-blue-950'
                          : 'bg-slate-200/80 text-slate-900'
                      }
                    >
                      <td className="p-1.5 border border-slate-400 font-extrabold">
                        {qBlock.cumulativeLabel}
                      </td>
                      {renderTotalsCells(qBlock.cumulativeTotals, qBlock.quarter === 4)}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-[11px] sm:text-xs font-semibold text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="truncate">
              Платник податків: _____________________ / {fullNameDisplay} /
            </div>
            <div className="text-slate-500">
              Сформовано згідно з Порядком Мінфіну № 261
            </div>
          </div>
        </div>
      )}

      {/* АРКУШ 2: ДОДАТОК ДО ТИПОВОЇ ФОРМИ (АМОРТИЗАЦІЯ — 12 ГРАФ) */}
      {(activeSheet === 'AMORT' || activeSheet === 'BOTH') && (
        <div className="bg-white rounded-2xl p-3.5 sm:p-6 border border-slate-300 shadow-xs print:shadow-none print:border-none print:p-0 print:break-before-page text-slate-900">
          <div className="flex justify-end text-[10px] sm:text-[11px] leading-snug text-slate-700 mb-2.5">
            <div className="text-right max-w-xs">
              <div className="font-semibold">Додаток</div>
              <div>
                до типової форми обліку доходів і витрат (пункт 1 розділу ІІІ)
              </div>
            </div>
          </div>

          <div className="text-center max-w-3xl mx-auto mb-3.5">
            <h3 className="text-xs sm:text-base font-extrabold uppercase text-slate-900">
              ОБЛІК АМОРТИЗАЦІЙНИХ ВІДРАХУВАНЬ
            </h3>
            <p className="text-[11px] sm:text-sm font-bold text-slate-800">
              основних засобів та нематеріальних активів за {selectedYear} рік
            </p>
          </div>

          {mobileViewMode === 'FIT' && (
            <div className="xl:hidden space-y-3 print:hidden">
              {amortizationReport.rows.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 italic border border-slate-200 rounded-xl">
                  Об’єкти ОЗ / НА у {selectedYear} році відсутні
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  {amortizationReport.rows.map((row) => (
                    <div
                      key={row.index}
                      className="min-w-0 p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-slate-900 break-words min-w-0">
                          #{row.index}. {row.col3_assetName}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[11px] shrink-0">
                          Гр. 11: {formatCurrency(row.col11_yearAmortization)} ₴
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 break-words">{row.col2_groupName}</div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 7 (Первісна):</span>{' '}
                          <strong>{formatCurrency(row.col7_initialCost)}</strong>
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 6 (Строк):</span>{' '}
                          <strong>{row.col6_usefulLifeYears} р.</strong>
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 8 (Річна):</span>{' '}
                          <strong>{formatCurrency(row.col8_annualAmount)}</strong>
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 9 (Місячна):</span>{' '}
                          <strong>{formatCurrency(row.col9_monthlyAmount)}</strong>
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 10 (На поч.):</span>{' '}
                          <strong>{formatCurrency(row.col10_startPeriodValue)}</strong>
                        </div>
                        <div className="min-w-0 truncate">
                          <span className="text-slate-500">Гр. 12 (На кін.):</span>{' '}
                          <strong>{formatCurrency(row.col12_endPeriodValue)}</strong>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-xl bg-blue-100/80 border border-blue-300 text-xs font-extrabold text-blue-950 flex flex-wrap justify-between gap-1">
                <span>УСЬОГО амортизація за {selectedYear} рік (Гр. 11):</span>
                <span>{formatCurrency(amortizationReport.totalYearAmortization)} ₴</span>
              </div>
            </div>
          )}

          {/* Повна таблиця 12 граф Додатка */}
          <div
            className={`${
              mobileViewMode === 'FIT' ? 'hidden xl:block print:block' : 'block'
            } overflow-x-auto w-full`}
          >
            <table className="w-full text-[11px] border-collapse border border-slate-400 min-w-[980px]">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-10">
                    № з/п
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-44">
                    Група основних засобів та нематеріальних активів
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-44">
                    Назва об’єкта основних засобів / нематеріальних активів
                  </th>
                  <th colSpan={2} className="p-1.5 border border-slate-400">
                    Реквізити документа, що підтверджує
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-20">
                    Строк корисного використання (експлуатації) об’єкта (років)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Первісна вартість об’єкта ОЗ / НА (грн, коп.)
                  </th>
                  <th colSpan={2} className="p-1.5 border border-slate-400">
                    Розрахунок суми амортизаційних відрахувань
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Вартість об’єкта ОЗ / НА на початок звітного періоду (грн, коп.)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Сума амортизаційних відрахувань за звітний період (рік) (грн, коп.)
                  </th>
                  <th rowSpan={2} className="p-1.5 border border-slate-400 w-24">
                    Вартість об’єкта ОЗ / НА на кінець звітного періоду (гр. 10 – гр. 11) (грн, коп.)
                  </th>
                </tr>
                <tr className="bg-slate-100 text-slate-900 font-bold text-center">
                  <th className="p-1.5 border border-slate-400 w-36">
                    придбання (виготовлення) основних засобів / НА
                  </th>
                  <th className="p-1.5 border border-slate-400 w-36">
                    введення в експлуатацію основних засобів / НА
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    річна сума амортизації (гр. 7 / гр. 6) (грн, коп.)
                  </th>
                  <th className="p-1.5 border border-slate-400 w-24">
                    місячна сума амортизації (гр. 8 / 12) (грн, коп.)
                  </th>
                </tr>
                <tr className="bg-slate-200 text-slate-900 font-extrabold text-center">
                  {Array.from({ length: 12 }, (_, idx) => (
                    <th key={idx + 1} className="py-1 px-1.5 border border-slate-400">
                      {idx + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {amortizationReport.rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-4 text-center text-slate-400 italic">
                      Об’єкти основних засобів та нематеріальних активів у {selectedYear} році відсутні
                    </td>
                  </tr>
                ) : (
                  amortizationReport.rows.map((row) => (
                    <tr key={row.index} className="hover:bg-slate-50 text-slate-900">
                      <td className="p-1.5 border border-slate-300 text-center font-semibold">
                        {row.index}
                      </td>
                      <td className="p-1.5 border border-slate-300">{row.col2_groupName}</td>
                      <td className="p-1.5 border border-slate-300 font-semibold">
                        {row.col3_assetName}
                      </td>
                      <td className="p-1.5 border border-slate-300">{row.col4_purchaseDoc}</td>
                      <td className="p-1.5 border border-slate-300">{row.col5_commissioningDoc}</td>
                      <td className="p-1.5 border border-slate-300 text-center">
                        {row.col6_usefulLifeYears}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                        {formatCurrency(row.col7_initialCost)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                        {formatCurrency(row.col8_annualAmount)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                        {formatCurrency(row.col9_monthlyAmount)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                        {formatCurrency(row.col10_startPeriodValue)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right font-bold bg-blue-50/40 whitespace-nowrap">
                        {formatCurrency(row.col11_yearAmortization)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-right whitespace-nowrap">
                        {formatCurrency(row.col12_endPeriodValue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              <tfoot>
                <tr className="bg-blue-100/80 font-extrabold text-slate-900">
                  <td colSpan={6} className="p-1.5 border border-slate-400 text-right uppercase">
                    УСЬОГО за {selectedYear} рік:
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalInitialCost)}
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalAnnualAmount)}
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalMonthlyAmount)}
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalStartPeriodValue)}
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right text-blue-900 whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalYearAmortization)}
                  </td>
                  <td className="p-1.5 border border-slate-400 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalEndPeriodValue)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
