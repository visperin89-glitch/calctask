export type ActivityType = 'fop' | 'independent';

export type TransactionType = 'INCOME' | 'RETURN' | 'EXPENSE';

export type ExpenseCategory = 'col_6' | 'col_7' | 'col_8' | 'col_9';

export type FixedAssetGroupId =
  | 'group_computers'
  | 'group_tools'
  | 'group_machinery'
  | 'group_transport'
  | 'group_other_fa'
  | 'group_intangible';

export interface TaxProfile {
  id: 'default';
  fullName: string;
  taxId: string;
  activityType: ActivityType;
  isVatPayer: boolean;
}

export interface TaxTransaction {
  id?: number;
  date: string; // YYYY-MM-DD
  type: TransactionType;
  amount: number;
  docName: string;
  docNumber: string;
  docDate: string; // YYYY-MM-DD
  expenseCategory?: ExpenseCategory;
  note?: string;
  createdAt: number;
}

export interface FixedAsset {
  id?: number;
  group: FixedAssetGroupId | string;
  name: string;
  purchaseDoc: string;
  commissioningDoc: string;
  commissioningDate: string; // YYYY-MM-DD
  usefulLifeYears: number;
  initialCost: number;
  isActive: boolean;
}

export interface FixedAssetGroupConfig {
  id: FixedAssetGroupId;
  code: string;
  name: string;
  shortName: string;
  minYears: number;
  description: string;
}

export interface DailyJournalRow {
  date: string; // YYYY-MM-DD
  formattedDate: string; // DD.MM.YYYY
  quarter: 1 | 2 | 3 | 4;
  month: number; // 1..12
  col2_income: number;
  col3_return: number;
  col4_netIncome: number;
  col5_docs: string;
  col6_tmc: number;
  col7_salary: number;
  col8_taxes: number;
  col9_other: number;
  col10_amortization: number;
  col11_profit: number;
  isAmortizationEntry?: boolean;
  transactionCount: number;
}

export interface PeriodSummaryTotals {
  col2_income: number;
  col3_return: number;
  col4_netIncome: number;
  col6_tmc: number;
  col7_salary: number;
  col8_taxes: number;
  col9_other: number;
  col10_amortization: number;
  col11_profit: number;
}

export interface QuarterReportBlock {
  quarter: 1 | 2 | 3 | 4;
  quarterLabel: string;
  cumulativeLabel: string;
  rows: DailyJournalRow[];
  quarterTotals: PeriodSummaryTotals;
  cumulativeTotals: PeriodSummaryTotals;
}

export interface AnnualReportData {
  year: number;
  dailyRows: DailyJournalRow[];
  quarters: QuarterReportBlock[];
  yearTotals: PeriodSummaryTotals;
  includeAutoAmortizationOnDec31: boolean;
}

export interface AmortizationCalculationRow {
  index: number; // Графа 1
  assetId?: number;
  groupId: string;
  col2_groupName: string; // Графа 2
  col3_assetName: string; // Графа 3
  col4_purchaseDoc: string; // Графа 4
  col5_commissioningDoc: string; // Графа 5
  col6_usefulLifeYears: number; // Графа 6
  col7_initialCost: number; // Графа 7
  col8_annualAmount: number; // Графа 8 = Гр.7 / Гр.6
  col9_monthlyAmount: number; // Графа 9 = Гр.8 / 12
  col10_startPeriodValue: number; // Графа 10
  col11_yearAmortization: number; // Графа 11 = Гр.9 * monthsInReportYear (обмежено залишковою вартістю)
  col12_endPeriodValue: number; // Графа 12 = Гр.10 - Гр.11
  monthsInYear: number;
  commissioningDate: string;
  isActive: boolean;
}

export interface AmortizationAppendixReport {
  year: number;
  rows: AmortizationCalculationRow[];
  totalInitialCost: number;
  totalAnnualAmount: number;
  totalMonthlyAmount: number;
  totalStartPeriodValue: number;
  totalYearAmortization: number;
  totalEndPeriodValue: number;
}
