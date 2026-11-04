import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  Printer,
  Share2,
  Square,
} from 'lucide-react';
import type {
  FixedAsset,
  PeriodSummaryTotals,
  TaxProfile,
  TaxTransaction,
} from '../types/tax';
import { formatCurrency, generateAnnualReport } from '../utils/calculations';
import { exportTaxBookToExcel } from '../utils/excelExport';
import { isNativeApp } from '../utils/nativePlatform';

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
  const [activeSheet, setActiveSheet] = useState<'MAIN' | 'AMORT' | 'BOTH'>('BOTH');
  const [isExporting, setIsExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const { annualReport, amortizationReport } = useMemo(
    () =>
      generateAnnualReport(
        transactions,
        fixedAssets,
        selectedYear,
        includeAutoAmortization
      ),
    [transactions, fixedAssets, selectedYear, includeAutoAmortization]
  );

  const handleExportExcel = async () => {
    setIsExporting(true);
    setExportNotice(null);
    try {
      const res = await exportTaxBookToExcel(profile, annualReport, amortizationReport, true);
      if (res.isNative) {
        setExportNotice(
          `Файл ${res.fileName} збережено у пам’яті пристрою (${res.uri || 'Documents'})${
            res.shared ? ' та відкрито меню поширення.' : '.'
          }`
        );
      } else {
        setExportNotice(`Файл ${res.fileName} успішно сформовано та завантажено.`);
      }
      setTimeout(() => setExportNotice(null), 6000);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
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

  return (
    <div className="space-y-5">
      {/* Панель керування звітом (приховується під час друку) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Річний звіт за Типовою формою № 261 ({selectedYear} рік)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600">
            Підсумковий реєстр щоденних записів за І–IV квартали та рік згідно з наказом Мінфіну від 13.05.2021 № 261
          </p>

          <button
            type="button"
            onClick={() => setIncludeAutoAmortization((prev) => !prev)}
            className="mt-2 inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-slate-700 hover:text-blue-700"
          >
            {includeAutoAmortization ? (
              <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
            ) : (
              <Square className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span>
              Автоматично переносити річну амортизацію з Додатка ({formatCurrency(amortizationReport.totalYearAmortization)} грн) у Графу 10 на 31.12.{selectedYear}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Перемикач режиму перегляду аркушів */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveSheet('MAIN')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeSheet === 'MAIN'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Типова форма
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet('AMORT')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeSheet === 'AMORT'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Додаток (Амортизація)
            </button>
            <button
              type="button"
              onClick={() => setActiveSheet('BOTH')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                activeSheet === 'BOTH'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Обидва аркуші
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={isExporting}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors"
          >
            {isNativeApp() ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>
              {isExporting
                ? 'Формування...'
                : isNativeApp()
                ? 'Зберегти / Поділитися Excel (.xlsx)'
                : 'Завантажити Excel (.xlsx)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-sm flex items-center gap-2 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Друк (A4 Landscape)</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-2xs print:hidden">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="break-all">{exportNotice}</span>
        </div>
      )}

      {/* АРКУШ 1: ТИПОВА ФОРМА № 261 */}
      {(activeSheet === 'MAIN' || activeSheet === 'BOTH') && (
        <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-300 shadow-xs print:shadow-none print:border-none print:p-0">
          {/* Гриф затвердження */}
          <div className="flex justify-end text-[11px] leading-snug text-slate-700 mb-3">
            <div className="text-right">
              <div className="font-semibold">ЗАТВЕРДЖЕНО</div>
              <div>Наказ Міністерства фінансів України</div>
              <div>13 травня 2021 року № 261</div>
            </div>
          </div>

          {/* Назва форми */}
          <div className="text-center max-w-3xl mx-auto mb-4">
            <h3 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-tight">
              ТИПОВА ФОРМА, за якою здійснюється облік доходів і витрат
            </h3>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність
            </p>
          </div>

          {/* Реквізити платника податків */}
          <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1 print:bg-transparent print:border-none print:p-0">
            <div>
              <span className="font-semibold text-slate-700">Платник податків (ПІБ):</span>{' '}
              <span className="font-bold text-slate-900">{fullNameDisplay}</span>{' '}
              <span className="text-slate-600">({activityDisplay})</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <div>
                <span className="font-semibold text-slate-700">
                  РНОКПП (або серія та номер паспорта):
                </span>{' '}
                <span className="font-bold text-slate-900">{taxIdDisplay}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700">Звітний період:</span>{' '}
                <span className="font-bold text-slate-900">{selectedYear} рік</span>
              </div>
              {profile.isVatPayer && (
                <div className="font-semibold text-blue-700">
                  Статус: Платник ПДВ (суми доходів і витрат без ПДВ)
                </div>
              )}
            </div>
          </div>

          {/* Регламентована таблиця з 11 граф */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse border border-slate-400 min-w-[1020px]">
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
                {/* Рядок нумерації граф 1–11 */}
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

                    {/* Підсумок за квартал */}
                    <tr className="bg-slate-100">
                      <td className="p-1.5 border border-slate-400 font-bold text-slate-900">
                        {qBlock.quarterLabel}
                      </td>
                      {renderTotalsCells(qBlock.quarterTotals, false)}
                    </tr>

                    {/* Наростаючий підсумок */}
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

          <div className="mt-5 text-xs font-semibold text-slate-800 flex items-center justify-between">
            <div>
              Платник податків: _____________________ / {fullNameDisplay} /
            </div>
            <div className="text-slate-500">
              Сформовано згідно з Порядком Мінфіну № 261 від 13.05.2021
            </div>
          </div>
        </div>
      )}

      {/* АРКУШ 2: ДОДАТОК ДО ТИПОВОЇ ФОРМИ (АМОРТИЗАЦІЯ) */}
      {(activeSheet === 'AMORT' || activeSheet === 'BOTH') && (
        <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-300 shadow-xs print:shadow-none print:border-none print:p-0 print:break-before-page">
          <div className="flex justify-end text-[11px] leading-snug text-slate-700 mb-3">
            <div className="text-right max-w-xs">
              <div className="font-semibold">Додаток</div>
              <div>
                до типової форми, за якою здійснюється облік доходів і витрат фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність
              </div>
              <div>(пункт 1 розділу ІІІ)</div>
            </div>
          </div>

          <div className="text-center max-w-3xl mx-auto mb-4">
            <h3 className="text-sm sm:text-base font-extrabold uppercase text-slate-900">
              ОБЛІК АМОРТИЗАЦІЙНИХ ВІДРАХУВАНЬ
            </h3>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              основних засобів та нематеріальних активів за {selectedYear} рік
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse border border-slate-400 min-w-[1020px]">
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
