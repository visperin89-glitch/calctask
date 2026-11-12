import Dexie, { type Table } from 'dexie';
import { DEFAULT_OPERATION_PRESETS } from '../constants/taxConstants';
import type { TaxProfile, TaxTransaction, FixedAsset } from '../types/tax';

/**
 * Допоміжна функція нормалізації полів операції для складених індексів Dexie v2
 * ([year+month], [year+type], category, docStatus).
 */
export function normalizeTransactionRecord<T extends Partial<TaxTransaction>>(record: T): T {
  const dateStr = record.date || '';
  const parts = dateStr.split('-');
  const parsedYear = Number(parts[0]) || new Date().getFullYear();
  const parsedMonth = Number(parts[1]) || 1;

  return {
    ...record,
    year: record.year || parsedYear,
    month: record.month || parsedMonth,
    category: record.category ?? record.expenseCategory ?? '',
    docStatus: record.docStatus || 'original',
  };
}

export class TaxBookDatabase extends Dexie {
  profile!: Table<TaxProfile, string>;
  transactions!: Table<TaxTransaction, number>;
  operations!: Table<TaxTransaction, number>;
  fixedAssets!: Table<FixedAsset, number>;

  constructor() {
    super('TaxBookDB');

    // Схема v1 (базова версія)
    this.version(1).stores({
      profile: 'id',
      transactions: '++id, date, type, expenseCategory, createdAt',
      fixedAssets: '++id, group, commissioningDate, isActive',
    });

    // Схема v2 (міграція без втрати наявних записів + складені індекси [year+month] та [year+type])
    this.version(2)
      .stores({
        profile: 'id',
        transactions:
          '++id, date, type, category, expenseCategory, docStatus, [year+month], [year+type], createdAt',
        operations: '++id, date, type, category, docStatus, [year+month], [year+type]',
        fixedAssets: '++id, group, commissioningDate, isActive',
      })
      .upgrade(async (tx) => {
        await tx
          .table('transactions')
          .toCollection()
          .modify((item: TaxTransaction) => {
            const normalized = normalizeTransactionRecord(item);
            item.year = normalized.year;
            item.month = normalized.month;
            item.category = normalized.category;
            item.docStatus = normalized.docStatus;
          });

        await tx
          .table('profile')
          .toCollection()
          .modify((prof: TaxProfile) => {
            if (typeof prof.militaryTaxRate !== 'number') prof.militaryTaxRate = 5;
            if (typeof prof.minWage !== 'number') prof.minWage = 8000;
            if (typeof prof.esvMaxBaseMultiplier !== 'number') prof.esvMaxBaseMultiplier = 15;
            if (typeof prof.confirmedExpensesOnlyInReport !== 'boolean') {
              prof.confirmedExpensesOnlyInReport = false;
            }
            if (!Array.isArray(prof.customPresets) || prof.customPresets.length === 0) {
              prof.customPresets = DEFAULT_OPERATION_PRESETS;
            }
          });
      });

    // Автоматичне заповнення year, month, category, docStatus при додаванні чи редагуванні записів
    this.transactions.hook('creating', (_primKey, obj) => {
      const normalized = normalizeTransactionRecord(obj);
      obj.year = normalized.year;
      obj.month = normalized.month;
      obj.category = normalized.category;
      obj.docStatus = normalized.docStatus;
    });

    this.transactions.hook('updating', (modifications, _primKey, obj) => {
      const merged = { ...obj, ...modifications } as TaxTransaction;
      const normalized = normalizeTransactionRecord(merged);
      return {
        ...modifications,
        year: normalized.year,
        month: normalized.month,
        category: normalized.category,
        docStatus: normalized.docStatus,
      };
    });
  }
}

export const db = new TaxBookDatabase();

export const DEFAULT_PROFILE: TaxProfile = {
  id: 'default',
  fullName: '',
  taxId: '',
  activityType: 'independent',
  isVatPayer: false,
  militaryTaxRate: 5,
  minWage: 8000,
  esvMaxBaseMultiplier: 15,
  confirmedExpensesOnlyInReport: false,
  biometricEnabled: false,
  taxRemindersEnabled: false,
  customPresets: DEFAULT_OPERATION_PRESETS,
};

export async function ensureDefaultProfile(): Promise<TaxProfile> {
  const existing = await db.profile.get('default');
  if (existing) {
    const patched: TaxProfile = {
      ...DEFAULT_PROFILE,
      ...existing,
      customPresets:
        Array.isArray(existing.customPresets) && existing.customPresets.length > 0
          ? existing.customPresets
          : DEFAULT_OPERATION_PRESETS,
    };
    return patched;
  }
  await db.profile.put(DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
}
