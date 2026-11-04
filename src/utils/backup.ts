import { db, DEFAULT_PROFILE } from '../db/database';
import type { FixedAsset, TaxProfile, TaxTransaction } from '../types/tax';
import { saveOrShareTextFile, type SaveFileResult } from './nativePlatform';

export interface TaxBookBackupPayload {
  appName: 'TaxBookDB_Minfin261';
  schemaVersion: 1;
  exportedAt: string;
  profile: TaxProfile;
  transactions: TaxTransaction[];
  fixedAssets: FixedAsset[];
}

/**
 * Експорт усієї бази даних IndexedDB (TaxBookDB) у єдиний JSON-файл
 * (через Capacitor Filesystem + Share на Android/iOS або через браузер у Web).
 */
export async function exportDatabaseToJson(autoShareOnNative = true): Promise<SaveFileResult> {
  const profile = (await db.profile.get('default')) || DEFAULT_PROFILE;
  const transactions = await db.transactions.toArray();
  const fixedAssets = await db.fixedAssets.toArray();

  const payload: TaxBookBackupPayload = {
    appName: 'TaxBookDB_Minfin261',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile,
    transactions,
    fixedAssets,
  };

  const jsonString = JSON.stringify(payload, null, 2);
  const datePart = new Date().toISOString().slice(0, 10);
  const fileName = `TaxBook_261_Backup_${datePart}.json`;

  return saveOrShareTextFile({
    fileName,
    content: jsonString,
    mimeType: 'application/json;charset=utf-8',
    shareTitle: `Резервна копія Книги № 261 (${datePart})`,
    shareText: `JSON-бекап локальної бази даних TaxBookDB від ${datePart}`,
    autoShareOnNative,
  });
}

/**
 * Імпорт бази даних із JSON-файлу резервної копії з повною заміною поточних даних.
 */
export async function importDatabaseFromJson(jsonText: string): Promise<{
  transactionsCount: number;
  fixedAssetsCount: number;
}> {
  let parsed: Partial<TaxBookBackupPayload>;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Файл пошкоджено або він не є коректним JSON-документом.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Невірна структура резервної копії.');
  }

  if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.fixedAssets)) {
    throw new Error(
      'У файлі відсутні обов’язкові таблиці transactions або fixedAssets.'
    );
  }

  const profileToSave: TaxProfile = {
    id: 'default',
    fullName: parsed.profile?.fullName || '',
    taxId: parsed.profile?.taxId || '',
    activityType: parsed.profile?.activityType === 'independent' ? 'independent' : 'fop',
    isVatPayer: Boolean(parsed.profile?.isVatPayer),
  };

  await db.transaction('rw', db.profile, db.transactions, db.fixedAssets, async () => {
    await db.profile.clear();
    await db.transactions.clear();
    await db.fixedAssets.clear();

    await db.profile.put(profileToSave);
    if (parsed.transactions && parsed.transactions.length > 0) {
      await db.transactions.bulkPut(parsed.transactions);
    }
    if (parsed.fixedAssets && parsed.fixedAssets.length > 0) {
      await db.fixedAssets.bulkPut(parsed.fixedAssets);
    }
  });

  return {
    transactionsCount: parsed.transactions.length,
    fixedAssetsCount: parsed.fixedAssets.length,
  };
}

/**
 * Завантаження демонстраційних даних для швидкої перевірки функціоналу Форми № 261 та Додатка.
 */
export async function seedDemoData(year: number): Promise<void> {
  const now = Date.now();

  const demoProfile: TaxProfile = {
    id: 'default',
    fullName: 'Коваленко Олександр Сергійович',
    taxId: '3184509214',
    activityType: 'fop',
    isVatPayer: false,
  };

  const demoTransactions: TaxTransaction[] = [
    {
      date: `${year}-01-15`,
      type: 'INCOME',
      amount: 48500.0,
      docName: 'Банківська виписка',
      docNumber: '12',
      docDate: `${year}-01-15`,
      note: 'Оплата за партію комплектуючих від ТОВ «ТехноПром»',
      createdAt: now - 900000,
    },
    {
      date: `${year}-01-15`,
      type: 'EXPENSE',
      amount: 24200.0,
      docName: 'Видаткова накладна',
      docNumber: 'ВН-104',
      docDate: `${year}-01-15`,
      expenseCategory: 'col_6',
      note: 'Закупівля сировини та комплектуючих (ТМЦ)',
      createdAt: now - 890000,
    },
    {
      date: `${year}-01-15`,
      type: 'EXPENSE',
      amount: 150.0,
      docName: 'Банківська виписка (комісія РКО)',
      docNumber: '12/К',
      docDate: `${year}-01-15`,
      expenseCategory: 'col_9',
      note: 'Розрахунково-касове обслуговування банку',
      createdAt: now - 880000,
    },
    {
      date: `${year}-02-18`,
      type: 'INCOME',
      amount: 62000.0,
      docName: 'Акт надання послуг',
      docNumber: '24',
      docDate: `${year}-02-18`,
      note: 'Інженерне проєктування та монтаж обладнання',
      createdAt: now - 700000,
    },
    {
      date: `${year}-02-20`,
      type: 'RETURN',
      amount: 3500.0,
      docName: 'Платіжна інструкція на повернення',
      docNumber: '88',
      docDate: `${year}-02-20`,
      note: 'Часткове повернення невикористаної передплати замовнику',
      createdAt: now - 650000,
    },
    {
      date: `${year}-03-28`,
      type: 'EXPENSE',
      amount: 16000.0,
      docName: 'Відомість нарахування ЗП',
      docNumber: '3',
      docDate: `${year}-03-28`,
      expenseCategory: 'col_7',
      note: 'Заробітна плата найманого працівника за березень',
      createdAt: now - 600000,
    },
    {
      date: `${year}-03-28`,
      type: 'EXPENSE',
      amount: 5280.0,
      docName: 'Платіжна інструкція',
      docNumber: '312',
      docDate: `${year}-03-28`,
      expenseCategory: 'col_8',
      note: 'Сплата ЄСВ за І квартал та нарахування ЄСВ на ЗП',
      createdAt: now - 590000,
    },
    {
      date: `${year}-05-12`,
      type: 'INCOME',
      amount: 84000.0,
      docName: 'Банківська виписка',
      docNumber: '54',
      docDate: `${year}-05-12`,
      note: 'Оплата за договором підряду № 18/05',
      createdAt: now - 400000,
    },
    {
      date: `${year}-05-12`,
      type: 'EXPENSE',
      amount: 31500.0,
      docName: 'Видаткова накладна',
      docNumber: '509',
      docDate: `${year}-05-12`,
      expenseCategory: 'col_6',
      note: 'Матеріали використані у виконанні замовлення № 18/05',
      createdAt: now - 390000,
    },
    {
      date: `${year}-05-12`,
      type: 'EXPENSE',
      amount: 8500.0,
      docName: 'Акт надання послуг',
      docNumber: 'О-05',
      docDate: `${year}-05-12`,
      expenseCategory: 'col_9',
      note: 'Оренда виробничого приміщення за травень',
      createdAt: now - 380000,
    },
    {
      date: `${year}-08-19`,
      type: 'INCOME',
      amount: 73400.0,
      docName: 'Фіскальний чек РРО/ПРРО',
      docNumber: '9042',
      docDate: `${year}-08-19`,
      note: 'Реалізація готової продукції за день',
      createdAt: now - 250000,
    },
    {
      date: `${year}-08-19`,
      type: 'EXPENSE',
      amount: 29800.0,
      docName: 'Видаткова накладна',
      docNumber: '811',
      docDate: `${year}-08-19`,
      expenseCategory: 'col_6',
      note: 'Собівартість реалізованих товарів',
      createdAt: now - 240000,
    },
    {
      date: `${year}-10-25`,
      type: 'INCOME',
      amount: 95000.0,
      docName: 'Банківська виписка',
      docNumber: '142',
      docDate: `${year}-10-25`,
      note: 'Надходження за контрактом сервісного обслуговування',
      createdAt: now - 100000,
    },
    {
      date: `${year}-10-25`,
      type: 'EXPENSE',
      amount: 18500.0,
      docName: 'Відомість нарахування ЗП',
      docNumber: '10',
      docDate: `${year}-10-25`,
      expenseCategory: 'col_7',
      note: 'Оплата праці техніка за жовтень',
      createdAt: now - 90000,
    },
    {
      date: `${year}-10-25`,
      type: 'EXPENSE',
      amount: 4070.0,
      docName: 'Квитанція про сплату податку/ЄСВ',
      docNumber: '774',
      docDate: `${year}-10-25`,
      expenseCategory: 'col_8',
      note: 'ЄСВ на ФОП за місяць',
      createdAt: now - 80000,
    },
  ];

  const demoFixedAssets: FixedAsset[] = [
    {
      group: 'group_computers',
      name: 'Робоча станція Dell Precision 5680 та БФП Canon',
      purchaseDoc: 'Видаткова накладна № РН-442 від 10.01.' + year + ', ПІ № 14 від 10.01.' + year,
      commissioningDoc: 'Наказ (розпорядження) № 1-ОЗ від 12.01.' + year,
      commissioningDate: `${year}-01-12`,
      usefulLifeYears: 2,
      initialCost: 72000.0,
      isActive: true,
    },
    {
      group: 'group_machinery',
      name: 'Верстат лазерного різання з ЧПК LC-6090',
      purchaseDoc: 'Договір № 08/25, ВН № 19 від 03.03.' + (year - 1),
      commissioningDoc: 'Акт введення в експлуатацію № 2-ОЗ від 05.03.' + (year - 1),
      commissioningDate: `${year - 1}-03-05`,
      usefulLifeYears: 5,
      initialCost: 180000.0,
      isActive: true,
    },
  ];

  await db.transaction('rw', db.profile, db.transactions, db.fixedAssets, async () => {
    await db.profile.put(demoProfile);
    await db.transactions.clear();
    await db.fixedAssets.clear();
    await db.transactions.bulkAdd(demoTransactions);
    await db.fixedAssets.bulkAdd(demoFixedAssets);
  });
}
