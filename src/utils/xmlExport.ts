import type {
  AmortizationAppendixReport,
  AnnualReportData,
  TaxProfile,
} from '../types/tax';
import { calculateTaxLiabilities, roundCurrency } from './calculations';
import { saveOrShareTextFile, type SaveFileResult } from './nativePlatform';

function escapeXml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtXmlDecimal(num: number): string {
  return roundCurrency(num).toFixed(2);
}

/**
 * Експорт річного звіту за Типовою формою № 261 та даних Додатка Ф2 / ЄСВ 1
 * у валідний XML-файл для імпорту в Електронний кабінет платника податків ДПС.
 */
export async function exportTaxBookToXml(
  profile: TaxProfile,
  annualReport: AnnualReportData,
  amortizationReport: AmortizationAppendixReport,
  autoShareOnNative = true
): Promise<SaveFileResult> {
  const now = new Date();
  const dFill = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(
    2,
    '0'
  )}${now.getFullYear()}`;
  const tin = (profile.taxId || '0000000000').trim();
  const fullName = (profile.fullName || 'Платник податків').trim();
  const taxSummary = calculateTaxLiabilities(annualReport, profile);

  const dailyRowsXml = annualReport.dailyRows
    .map(
      (row, idx) => `      <ROW ROWNUM="${idx + 1}">
        <G1_DATE>${escapeXml(row.formattedDate)}</G1_DATE>
        <G2_INCOME>${fmtXmlDecimal(row.col2_income)}</G2_INCOME>
        <G3_RETURN>${fmtXmlDecimal(row.col3_return)}</G3_RETURN>
        <G4_NET_INCOME>${fmtXmlDecimal(row.col4_netIncome)}</G4_NET_INCOME>
        <G5_DOC_REF>${escapeXml(row.col5_docs)}</G5_DOC_REF>
        <G6_TMC>${fmtXmlDecimal(row.col6_tmc)}</G6_TMC>
        <G7_SALARY>${fmtXmlDecimal(row.col7_salary)}</G7_SALARY>
        <G8_TAXES_ESV>${fmtXmlDecimal(row.col8_taxes)}</G8_TAXES_ESV>
        <G9_OTHER_EXP>${fmtXmlDecimal(row.col9_other)}</G9_OTHER_EXP>
        <G10_AMORT>${fmtXmlDecimal(row.col10_amortization)}</G10_AMORT>
        <G11_PROFIT>${fmtXmlDecimal(row.col11_profit)}</G11_PROFIT>
      </ROW>`
    )
    .join('\n');

  const quartersXml = annualReport.quarters
    .map(
      (q) => `      <QUARTER NUM="${q.quarter}" LABEL="${escapeXml(q.quarterLabel)}">
        <G2_INCOME>${fmtXmlDecimal(q.quarterTotals.col2_income)}</G2_INCOME>
        <G3_RETURN>${fmtXmlDecimal(q.quarterTotals.col3_return)}</G3_RETURN>
        <G4_NET_INCOME>${fmtXmlDecimal(q.quarterTotals.col4_netIncome)}</G4_NET_INCOME>
        <G6_TMC>${fmtXmlDecimal(q.quarterTotals.col6_tmc)}</G6_TMC>
        <G7_SALARY>${fmtXmlDecimal(q.quarterTotals.col7_salary)}</G7_SALARY>
        <G8_TAXES_ESV>${fmtXmlDecimal(q.quarterTotals.col8_taxes)}</G8_TAXES_ESV>
        <G9_OTHER_EXP>${fmtXmlDecimal(q.quarterTotals.col9_other)}</G9_OTHER_EXP>
        <G10_AMORT>${fmtXmlDecimal(q.quarterTotals.col10_amortization)}</G10_AMORT>
        <G11_PROFIT>${fmtXmlDecimal(q.quarterTotals.col11_profit)}</G11_PROFIT>
      </QUARTER>`
    )
    .join('\n');

  const amortRowsXml = amortizationReport.rows
    .map(
      (r) => `      <ASSET_ROW ROWNUM="${r.index}">
        <G1_INDEX>${r.index}</G1_INDEX>
        <G2_GROUP>${escapeXml(r.col2_groupName)}</G2_GROUP>
        <G3_NAME>${escapeXml(r.col3_assetName)}</G3_NAME>
        <G4_PURCHASE_DOC>${escapeXml(r.col4_purchaseDoc)}</G4_PURCHASE_DOC>
        <G5_COMM_DOC>${escapeXml(r.col5_commissioningDoc)}</G5_COMM_DOC>
        <G6_USEFUL_LIFE_YEARS>${r.col6_usefulLifeYears}</G6_USEFUL_LIFE_YEARS>
        <G7_INITIAL_COST>${fmtXmlDecimal(r.col7_initialCost)}</G7_INITIAL_COST>
        <G8_ANNUAL_AMORT>${fmtXmlDecimal(r.col8_annualAmount)}</G8_ANNUAL_AMORT>
        <G9_MONTHLY_AMORT>${fmtXmlDecimal(r.col9_monthlyAmount)}</G9_MONTHLY_AMORT>
        <G10_START_VALUE>${fmtXmlDecimal(r.col10_startPeriodValue)}</G10_START_VALUE>
        <G11_YEAR_AMORT>${fmtXmlDecimal(r.col11_yearAmortization)}</G11_YEAR_AMORT>
        <G12_END_VALUE>${fmtXmlDecimal(r.col12_endPeriodValue)}</G12_END_VALUE>
      </ASSET_ROW>`
    )
    .join('\n');

  const esvMonthsXml = taxSummary.monthlyEsvRows
    .map(
      (m) => `      <MONTH NUM="${m.month}" NAME="${escapeXml(m.monthName)}">
        <NET_PROFIT>${fmtXmlDecimal(m.netProfit)}</NET_PROFIT>
        <ESV_BASE>${fmtXmlDecimal(m.esvBase)}</ESV_BASE>
        <ESV_RATE>${fmtXmlDecimal(m.esvRate)}</ESV_RATE>
        <ESV_AMOUNT>${fmtXmlDecimal(m.esvAmount)}</ESV_AMOUNT>
      </MONTH>`
    )
    .join('\n');

  const yt = annualReport.yearTotals;
  const totalExpenses = roundCurrency(
    yt.col6_tmc + yt.col7_salary + yt.col8_taxes + yt.col9_other + yt.col10_amortization
  );

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DECLARHEAD>
    <TIN>${escapeXml(tin)}</TIN>
    <C_DOC>F01</C_DOC>
    <C_DOC_SUB>261</C_DOC_SUB>
    <C_DOC_VER>2</C_DOC_VER>
    <C_DOC_TYPE>0</C_DOC_TYPE>
    <C_DOC_CNT>1</C_DOC_CNT>
    <PERIOD_MONTH>12</PERIOD_MONTH>
    <PERIOD_TYPE>5</PERIOD_TYPE>
    <PERIOD_YEAR>${annualReport.year}</PERIOD_YEAR>
    <D_FILL>${dFill}</D_FILL>
    <SOFTWARE>TaxBook_Minfin_261_v1.0.9</SOFTWARE>
  </DECLARHEAD>
  <DECLARBODY>
    <HBOS>${escapeXml(fullName)}</HBOS>
    <HTIN>${escapeXml(tin)}</HTIN>
    <HACTIVITY_TYPE>${escapeXml(profile.activityType)}</HACTIVITY_TYPE>
    <HVAT_PAYER>${profile.isVatPayer ? 1 : 0}</HVAT_PAYER>
    <HZ>1</HZ>
    <HZY>${annualReport.year}</HZY>

    <!-- ТИПОВА ФОРМА № 261 (Наказ Мінфіну від 13.05.2021 № 261) — Графи 1–11 -->
    <BOOK_261_DAILY_ROWS>
${dailyRowsXml}
    </BOOK_261_DAILY_ROWS>

    <!-- ПІДСУМКИ ЗА КВАРТАЛАМИ (І–IV квартали) -->
    <BOOK_261_QUARTERS>
${quartersXml}
    </BOOK_261_QUARTERS>

    <!-- РІЧНИЙ ПІДСУМОК ТИПОВОЇ ФОРМИ № 261 -->
    <BOOK_261_ANNUAL_TOTALS>
      <G2_INCOME_TOTAL>${fmtXmlDecimal(yt.col2_income)}</G2_INCOME_TOTAL>
      <G3_RETURN_TOTAL>${fmtXmlDecimal(yt.col3_return)}</G3_RETURN_TOTAL>
      <G4_NET_INCOME_TOTAL>${fmtXmlDecimal(yt.col4_netIncome)}</G4_NET_INCOME_TOTAL>
      <G6_TMC_TOTAL>${fmtXmlDecimal(yt.col6_tmc)}</G6_TMC_TOTAL>
      <G7_SALARY_TOTAL>${fmtXmlDecimal(yt.col7_salary)}</G7_SALARY_TOTAL>
      <G8_TAXES_ESV_TOTAL>${fmtXmlDecimal(yt.col8_taxes)}</G8_TAXES_ESV_TOTAL>
      <G9_OTHER_EXP_TOTAL>${fmtXmlDecimal(yt.col9_other)}</G9_OTHER_EXP_TOTAL>
      <G10_AMORT_TOTAL>${fmtXmlDecimal(yt.col10_amortization)}</G10_AMORT_TOTAL>
      <TOTAL_EXPENSES_G6_G10>${fmtXmlDecimal(totalExpenses)}</TOTAL_EXPENSES_G6_G10>
      <G11_NET_TAXABLE_PROFIT>${fmtXmlDecimal(yt.col11_profit)}</G11_NET_TAXABLE_PROFIT>
    </BOOK_261_ANNUAL_TOTALS>

    <!-- ДОДАТОК ДО ТИПОВОЇ ФОРМИ № 261 (Амортизація ОЗ та НА — Графи 1–12) -->
    <APPENDIX_AMORTIZATION>
${amortRowsXml}
      <AMORT_TOTALS>
        <G7_INITIAL_COST_SUM>${fmtXmlDecimal(amortizationReport.totalInitialCost)}</G7_INITIAL_COST_SUM>
        <G8_ANNUAL_AMORT_SUM>${fmtXmlDecimal(amortizationReport.totalAnnualAmount)}</G8_ANNUAL_AMORT_SUM>
        <G9_MONTHLY_AMORT_SUM>${fmtXmlDecimal(amortizationReport.totalMonthlyAmount)}</G9_MONTHLY_AMORT_SUM>
        <G10_START_VALUE_SUM>${fmtXmlDecimal(amortizationReport.totalStartPeriodValue)}</G10_START_VALUE_SUM>
        <G11_YEAR_AMORT_SUM>${fmtXmlDecimal(amortizationReport.totalYearAmortization)}</G11_YEAR_AMORT_SUM>
        <G12_END_VALUE_SUM>${fmtXmlDecimal(amortizationReport.totalEndPeriodValue)}</G12_END_VALUE_SUM>
      </AMORT_TOTALS>
    </APPENDIX_AMORTIZATION>

    <!-- ДАНІ ДЛЯ ПОДАТКОВОЇ ДЕКЛАРАЦІЇ (Додаток Ф2 та Додаток ЄСВ 1) -->
    <DECLARATION_F2_SUMMARY>
      <INCOME_DECLARED>${fmtXmlDecimal(yt.col4_netIncome)}</INCOME_DECLARED>
      <EXPENSES_TMC_G6>${fmtXmlDecimal(yt.col6_tmc)}</EXPENSES_TMC_G6>
      <EXPENSES_SALARY_G7>${fmtXmlDecimal(yt.col7_salary)}</EXPENSES_SALARY_G7>
      <EXPENSES_TAXES_G8>${fmtXmlDecimal(yt.col8_taxes)}</EXPENSES_TAXES_G8>
      <EXPENSES_OTHER_G9>${fmtXmlDecimal(yt.col9_other)}</EXPENSES_OTHER_G9>
      <EXPENSES_AMORT_G10>${fmtXmlDecimal(yt.col10_amortization)}</EXPENSES_AMORT_G10>
      <TAXABLE_PROFIT_G11>${fmtXmlDecimal(taxSummary.taxableProfit)}</TAXABLE_PROFIT_G11>
      <PDFO_RATE>${fmtXmlDecimal(taxSummary.pdfoRate)}</PDFO_RATE>
      <PDFO_PAYABLE>${fmtXmlDecimal(taxSummary.pdfoAmount)}</PDFO_PAYABLE>
      <MILITARY_TAX_RATE>${fmtXmlDecimal(taxSummary.militaryTaxRate)}</MILITARY_TAX_RATE>
      <MILITARY_TAX_PAYABLE>${fmtXmlDecimal(taxSummary.militaryTaxAmount)}</MILITARY_TAX_PAYABLE>
    </DECLARATION_F2_SUMMARY>

    <DECLARATION_ESV1_SUMMARY>
      <MIN_WAGE>${fmtXmlDecimal(taxSummary.minWage)}</MIN_WAGE>
      <ESV_RATE>${fmtXmlDecimal(taxSummary.esvRate)}</ESV_RATE>
      <ANNUAL_ESV_TOTAL>${fmtXmlDecimal(taxSummary.annualCalculatedEsv)}</ANNUAL_ESV_TOTAL>
${esvMonthsXml}
    </DECLARATION_ESV1_SUMMARY>
  </DECLARBODY>
</DECLAR>
`;

  const safeTaxId = profile.taxId ? `_${profile.taxId}` : '';
  const fileName = `Forma_261_${annualReport.year}${safeTaxId}_DPS.xml`;

  return saveOrShareTextFile({
    fileName,
    content: xmlContent,
    mimeType: 'application/xml;charset=utf-8',
    shareTitle: `Експорт XML (ДПС) — Форма № 261 (${annualReport.year} р.)`,
    shareText: `XML-файл даних Типової форми № 261 та показників Додатка Ф2 / ЄСВ 1 за ${annualReport.year} рік для Електронного кабінету ДПС.`,
    autoShareOnNative,
  });
}
