import Dexie, { type Table } from 'dexie';
import type { TaxProfile, TaxTransaction, FixedAsset } from '../types/tax';

export class TaxBookDatabase extends Dexie {
  profile!: Table<TaxProfile, string>;
  transactions!: Table<TaxTransaction, number>;
  fixedAssets!: Table<FixedAsset, number>;

  constructor() {
    super('TaxBookDB');

    this.version(1).stores({
      profile: 'id',
      transactions: '++id, date, type, expenseCategory, createdAt',
      fixedAssets: '++id, group, commissioningDate, isActive',
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
};

export async function ensureDefaultProfile(): Promise<TaxProfile> {
  const existing = await db.profile.get('default');
  if (existing) {
    return existing;
  }
  await db.profile.put(DEFAULT_PROFILE);
  return DEFAULT_PROFILE;
}
