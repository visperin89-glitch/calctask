import { FIXED_ASSET_GROUP_MAP } from '../constants/taxConstants';
import type {
  AmortizationAppendixReport,
  AmortizationCalculationRow,
  AnnualReportData,
  DailyJournalRow,
  FixedAsset,
  FixedAssetGroupId,
  PeriodSummaryTotals,
  QuarterReportBlock,
  TaxTransaction,
} from '../types/tax';

/**
 * Округлення фінансових значень до 2 знаків після коми (копійок).
 */
export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Форматування суми у національному форматі (12 345,67)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundCurrency(value));
}

/**
 * Конвертація дати YYYY-MM-DD -> DD.MM.YYYY
 */
export function formatDateUA(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Визначення кварталу (1..4) за номером місяця (1..12)
 */
export function getQuarterFromMonth(month: number): 1 | 2 | 3 | 4 {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

/**
 * Створення порожнього об'єкта підсумків за графами 2–11
 */
export function createEmptyTotals(): PeriodSummaryTotals {
  return {
    col2_income: 0,
    col3_return: 0,
    col4_netIncome: 0,
    col6_tmc: 0,
    col7_salary: 0,
    col8_taxes: 0,
    col9_other: 0,
    col10_amortization: 0,
    col11_profit: 0,
  };
}

/**
 * Додавання рядка або іншого підсумку до акумулятора
 */
export function accumulateTotals(
  target: PeriodSummaryTotals,
  source: Pick<
    PeriodSummaryTotals,
    | 'col2_income'
    | 'col3_return'
    | 'col4_netIncome'
    | 'col6_tmc'
    | 'col7_salary'
    | 'col8_taxes'
    | 'col9_other'
    | 'col10_amortization'
    | 'col11_profit'
  >
): PeriodSummaryTotals {
  return {
    col2_income: roundCurrency(target.col2_income + source.col2_income),
    col3_return: roundCurrency(target.col3_return + source.col3_return),
    col4_netIncome: roundCurrency(target.col4_netIncome + source.col4_netIncome),
    col6_tmc: roundCurrency(target.col6_tmc + source.col6_tmc),
    col7_salary: roundCurrency(target.col7_salary + source.col7_salary),
    col8_taxes: roundCurrency(target.col8_taxes + source.col8_taxes),
    col9_other: roundCurrency(target.col9_other + source.col9_other),
    col10_amortization: roundCurrency(target.col10_amortization + source.col10_amortization),
    col11_profit: roundCurrency(target.col11_profit + source.col11_profit),
  };
}

/**
 * Розрахунок кількості місяців експлуатації ОЗ/НА у вказаному звітному році
 * та кількості місяців експлуатації до початку звітного року.
 */
export function calculateAssetMonthsForYear(
  commissioningDate: string,
  usefulLifeYears: number,
  reportYear: number
): { monthsBeforeYear: number; monthsInYear: number } {
  const [commYearStr, commMonthStr] = (commissioningDate || '').split('-');
  const commYear = Number(commYearStr);
  const commMonth = Number(commMonthStr);

  if (!commYear || !commMonth || commYear > reportYear || usefulLifeYears <= 0) {
    return { monthsBeforeYear: 0, monthsInYear: 0 };
  }

  const totalUsefulMonths = Math.round(usefulLifeYears * 12);

  // Кількість місяців у році введення в експлуатацію (включно з місяцем введення)
  const monthsInCommissionYear = 12 - commMonth + 1;

  let monthsBeforeYear = 0;
  if (reportYear > commYear) {
    const fullYearsBetween = reportYear - commYear - 1;
    monthsBeforeYear = Math.min(
      totalUsefulMonths,
      monthsInCommissionYear + fullYearsBetween * 12
    );
  }

  const remainingUsefulMonthsAtStart = Math.max(0, totalUsefulMonths - monthsBeforeYear);
  if (remainingUsefulMonthsAtStart === 0) {
    return { monthsBeforeYear, monthsInYear: 0 };
  }

  const maxMonthsInReportYear = reportYear === commYear ? monthsInCommissionYear : 12;
  const monthsInYear = Math.min(remainingUsefulMonthsAtStart, maxMonthsInReportYear);

  return { monthsBeforeYear, monthsInYear };
}

/**
 * Формування розрахунку амортизації (Додаток до типової форми № 261) за 12 графами.
 */
export function calculateAmortizationAppendix(
  assets: FixedAsset[],
  reportYear: number
): AmortizationAppendixReport {
  const activeAssets = assets
    .filter((a) => a.isActive)
    .sort((a, b) => a.commissioningDate.localeCompare(b.commissioningDate));

  const rows: AmortizationCalculationRow[] = [];

  let totalInitialCost = 0;
  let totalAnnualAmount = 0;
  let totalMonthlyAmount = 0;
  let totalStartPeriodValue = 0;
  let totalYearAmortization = 0;
  let totalEndPeriodValue = 0;

  activeAssets.forEach((asset) => {
    const groupConfig = FIXED_ASSET_GROUP_MAP[asset.group as FixedAssetGroupId];
    const groupName = groupConfig ? groupConfig.name : asset.group;

    const initialCost = roundCurrency(asset.initialCost);
    const usefulLifeYears = Math.max(1, asset.usefulLifeYears);

    // Графа 8: Річна сума = Графа 7 / Графа 6
    const col8_annualAmount = roundCurrency(initialCost / usefulLifeYears);
    // Графа 9: Місячна сума = Графа 8 / 12
    const col9_monthlyAmount = roundCurrency(col8_annualAmount / 12);

    const { monthsBeforeYear, monthsInYear } = calculateAssetMonthsForYear(
      asset.commissioningDate,
      usefulLifeYears,
      reportYear
    );

    // Якщо об'єкт введено в експлуатацію пізніше звітного року — пропускаємо у звіті за цей рік
    const commYear = Number((asset.commissioningDate || '').split('-')[0]);
    if (commYear > reportYear) {
      return;
    }

    // Графа 10: Вартість на початок звітного періоду (залишкова вартість або первісна для нових)
    const priorDepreciation = roundCurrency(col9_monthlyAmount * monthsBeforeYear);
    const col10_startPeriodValue =
      commYear === reportYear
        ? initialCost
        : Math.max(0, roundCurrency(initialCost - priorDepreciation));

    // Графа 11: Сума амортизації за рік = Графа 9 * кількість місяців експлуатації у звітному році
    const rawYearAmortization = roundCurrency(col9_monthlyAmount * monthsInYear);
    const col11_yearAmortization = Math.min(col10_startPeriodValue, rawYearAmortization);

    // Графа 12: Вартість на кінець звітного періоду = Графа 10 - Графа 11
    const col12_endPeriodValue = Math.max(
      0,
      roundCurrency(col10_startPeriodValue - col11_yearAmortization)
    );

    const rowIndex = rows.length + 1;
    rows.push({
      index: rowIndex,
      assetId: asset.id,
      groupId: asset.group,
      col2_groupName: groupName,
      col3_assetName: asset.name,
      col4_purchaseDoc: asset.purchaseDoc,
      col5_commissioningDoc: asset.commissioningDoc,
      col6_usefulLifeYears: usefulLifeYears,
      col7_initialCost: initialCost,
      col8_annualAmount,
      col9_monthlyAmount,
      col10_startPeriodValue,
      col11_yearAmortization,
      col12_endPeriodValue,
      monthsInYear,
      commissioningDate: asset.commissioningDate,
      isActive: asset.isActive,
    });

    totalInitialCost = roundCurrency(totalInitialCost + initialCost);
    totalAnnualAmount = roundCurrency(totalAnnualAmount + col8_annualAmount);
    totalMonthlyAmount = roundCurrency(totalMonthlyAmount + col9_monthlyAmount);
    totalStartPeriodValue = roundCurrency(totalStartPeriodValue + col10_startPeriodValue);
    totalYearAmortization = roundCurrency(totalYearAmortization + col11_yearAmortization);
    totalEndPeriodValue = roundCurrency(totalEndPeriodValue + col12_endPeriodValue);
  });

  return {
    year: reportYear,
    rows,
    totalInitialCost,
    totalAnnualAmount,
    totalMonthlyAmount,
    totalStartPeriodValue,
    totalYearAmortization,
    totalEndPeriodValue,
  };
}

/**
 * Форматування реквізитів первинного документа для Графи 5 (напр. «Акт № 45 від 12.03.2026»)
 */
export function formatExpenseDocumentRef(tx: TaxTransaction): string {
  const name = (tx.docName || '').trim();
  const number = (tx.docNumber || '').trim();
  const dateStr = tx.docDate ? formatDateUA(tx.docDate) : '';

  const parts: string[] = [];
  if (name) parts.push(name);
  if (number) {
    parts.push(number.startsWith('№') ? number : `№ ${number}`);
  }
  if (dateStr) {
    parts.push(`від ${dateStr}`);
  }
  return parts.join(' ');
}

/**
 * Алгоритм формування річного журналу за Типовою формою № 261
 * (п. 1 розд. I Порядку № 261 — за підсумками робочого дня).
 */
export function generateAnnualReport(
  transactions: TaxTransaction[],
  fixedAssets: FixedAsset[],
  reportYear: number,
  includeAutoAmortizationOnDec31 = true
): {
  annualReport: AnnualReportData;
  amortizationReport: AmortizationAppendixReport;
} {
  const yearPrefix = `${reportYear}-`;
  const yearTransactions = transactions.filter((tx) => tx.date && tx.date.startsWith(yearPrefix));

  // Розрахунок Додатка з амортизації за звітний рік
  const amortizationReport = calculateAmortizationAppendix(fixedAssets, reportYear);

  // Групування транзакцій за календарною датою (YYYY-MM-DD)
  const groupedByDate = new Map<string, TaxTransaction[]>();
  for (const tx of yearTransactions) {
    const existing = groupedByDate.get(tx.date);
    if (existing) {
      existing.push(tx);
    } else {
      groupedByDate.set(tx.date, [tx]);
    }
  }

  // Сортування дат у хронологічному порядку
  const sortedDates = Array.from(groupedByDate.keys()).sort((a, b) => a.localeCompare(b));

  const dailyRows: DailyJournalRow[] = sortedDates.map((dateStr) => {
    const dayTxs = groupedByDate.get(dateStr) || [];
    const month = Number(dateStr.split('-')[1]) || 1;
    const quarter = getQuarterFromMonth(month);

    let col2_income = 0;
    let col3_return = 0;
    let col6_tmc = 0;
    let col7_salary = 0;
    let col8_taxes = 0;
    let col9_other = 0;
    const docRefs: string[] = [];

    for (const tx of dayTxs) {
      const amount = roundCurrency(Number(tx.amount) || 0);
      if (tx.type === 'INCOME') {
        col2_income = roundCurrency(col2_income + amount);
      } else if (tx.type === 'RETURN') {
        col3_return = roundCurrency(col3_return + amount);
      } else if (tx.type === 'EXPENSE') {
        const docRef = formatExpenseDocumentRef(tx);
        if (docRef && !docRefs.includes(docRef)) {
          docRefs.push(docRef);
        }
        switch (tx.expenseCategory) {
          case 'col_6':
            col6_tmc = roundCurrency(col6_tmc + amount);
            break;
          case 'col_7':
            col7_salary = roundCurrency(col7_salary + amount);
            break;
          case 'col_8':
            col8_taxes = roundCurrency(col8_taxes + amount);
            break;
          case 'col_9':
          default:
            col9_other = roundCurrency(col9_other + amount);
            break;
        }
      }
    }

    const col4_netIncome = roundCurrency(col2_income - col3_return);
    const col10_amortization = 0;
    const totalDayExpenses = roundCurrency(
      col6_tmc + col7_salary + col8_taxes + col9_other + col10_amortization
    );
    const col11_profit = roundCurrency(col4_netIncome - totalDayExpenses);

    return {
      date: dateStr,
      formattedDate: formatDateUA(dateStr),
      quarter,
      month,
      col2_income,
      col3_return,
      col4_netIncome,
      col5_docs: docRefs.join(', '),
      col6_tmc,
      col7_salary,
      col8_taxes,
      col9_other,
      col10_amortization,
      col11_profit,
      transactionCount: dayTxs.length,
    };
  });

  // Графа 10: Амортизація ОЗ (підсумкове значення з Додатка).
  // Нараховується окремим фінальним записом року (на 31 грудня).
  if (includeAutoAmortizationOnDec31 && amortizationReport.totalYearAmortization > 0) {
    const dec31Date = `${reportYear}-12-31`;
    const amortAmount = roundCurrency(amortizationReport.totalYearAmortization);
    dailyRows.push({
      date: dec31Date,
      formattedDate: `31.12.${reportYear}`,
      quarter: 4,
      month: 12,
      col2_income: 0,
      col3_return: 0,
      col4_netIncome: 0,
      col5_docs: `Додаток до типової форми (розрахунок амортизації ОЗ та НА за ${reportYear} рік)`,
      col6_tmc: 0,
      col7_salary: 0,
      col8_taxes: 0,
      col9_other: 0,
      col10_amortization: amortAmount,
      col11_profit: roundCurrency(-amortAmount),
      isAmortizationEntry: true,
      transactionCount: 0,
    });
  }

  // Побудова квартальних блоків та наростаючого підсумку за I, II, III, IV квартали та рік
  const quarterDefinitions: Array<{
    quarter: 1 | 2 | 3 | 4;
    quarterLabel: string;
    cumulativeLabel: string;
  }> = [
    {
      quarter: 1,
      quarterLabel: 'Разом за І квартал',
      cumulativeLabel: 'Усього за І квартал (наростаючим підсумком)',
    },
    {
      quarter: 2,
      quarterLabel: 'Разом за ІІ квартал',
      cumulativeLabel: 'Усього за І півріччя (І–ІІ квартали наростаючим підсумком)',
    },
    {
      quarter: 3,
      quarterLabel: 'Разом за ІІІ квартал',
      cumulativeLabel: 'Усього за 9 місяців (І–ІІІ квартали наростаючим підсумком)',
    },
    {
      quarter: 4,
      quarterLabel: 'Разом за ІV квартал',
      cumulativeLabel: `УСЬОГО ЗА ${reportYear} РІК (наростаючим підсумком)`,
    },
  ];

  let runningCumulative = createEmptyTotals();
  const quarters: QuarterReportBlock[] = quarterDefinitions.map((qDef) => {
    const qRows = dailyRows.filter((r) => r.quarter === qDef.quarter);
    const quarterTotals = qRows.reduce(
      (acc, row) => accumulateTotals(acc, row),
      createEmptyTotals()
    );
    runningCumulative = accumulateTotals(runningCumulative, quarterTotals);

    return {
      quarter: qDef.quarter,
      quarterLabel: qDef.quarterLabel,
      cumulativeLabel: qDef.cumulativeLabel,
      rows: qRows,
      quarterTotals,
      cumulativeTotals: runningCumulative,
    };
  });

  return {
    annualReport: {
      year: reportYear,
      dailyRows,
      quarters,
      yearTotals: runningCumulative,
      includeAutoAmortizationOnDec31,
    },
    amortizationReport,
  };
}
