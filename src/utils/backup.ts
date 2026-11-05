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
    fullName: 'Коваленко Олександр Сергійович (Адвокат)',
    taxId: '3184509214',
    activityType: 'independent',
    isVatPayer: false,
  };

  const demoTransactions: TaxTransaction[] = [
    {
      date: `${year}-01-15`,
      type: 'INCOME',
      amount: 45000.0,
      docName: 'Банківська виписка (гонорар)',
      docNumber: '12',
      docDate: `${year}-01-15`,
      note: 'Гонорар за договором про надання правової допомоги № 04/26',
      createdAt: now - 900000,
    },
    {
      date: `${year}-01-15`,
      type: 'EXPENSE',
      amount: 3330.8,
      docName: 'Платіжна інструкція',
      docNumber: '18',
      docDate: `${year}-01-15`,
      expenseCategory: 'col_9',
      note: 'Сплата щорічних внесків адвокатів на забезпечення реалізації адвокатського самоврядування',
      createdAt: now - 890000,
    },
    {
      date: `${year}-01-15`,
      type: 'EXPENSE',
      amount: 1850.0,
      docName: 'Видаткова накладна',
      docNumber: 'ВН-104',
      docDate: `${year}-01-15`,
      expenseCategory: 'col_6',
      note: 'Виготовлення бланків (у тому числі ордерів) із зазначенням ПІБ адвоката, номера і дати видачі свідоцтва про право на заняття адвокатською діяльністю, та придбання канцелярського приладдя',
      createdAt: now - 880000,
    },
    {
      date: `${year}-02-18`,
      type: 'INCOME',
      amount: 58000.0,
      docName: 'Акт приймання-передачі правничої допомоги',
      docNumber: '24',
      docDate: `${year}-02-18`,
      note: 'Оплата за представництво інтересів у господарському суді',
      createdAt: now - 700000,
    },
    {
      date: `${year}-02-20`,
      type: 'RETURN',
      amount: 3000.0,
      docName: 'Платіжна інструкція на повернення гонорару/коштів',
      docNumber: '88',
      docDate: `${year}-02-20`,
      note: 'Повернення невикористаної частини авансу клієнту за договором',
      createdAt: now - 650000,
    },
    {
      date: `${year}-03-28`,
      type: 'EXPENSE',
      amount: 14500.0,
      docName: 'Відомість нарахування ЗП',
      docNumber: '3',
      docDate: `${year}-03-28`,
      expenseCategory: 'col_7',
      note: 'Оплата праці та обов’язкові нарахування на фонд оплати праці помічника адвоката (найманого працівника)',
      createdAt: now - 600000,
    },
    {
      date: `${year}-03-28`,
      type: 'EXPENSE',
      amount: 5280.0,
      docName: 'Квитанція про сплату податку/ЄСВ',
      docNumber: '312',
      docDate: `${year}-03-28`,
      expenseCategory: 'col_8',
      note: 'Сплата адвокатами внесків до Пенсійного фонду України (ЄСВ), у тому числі на користь найманих працівників, та фондів загальнообов’язкового державного соціального страхування',
      createdAt: now - 590000,
    },
    {
      date: `${year}-05-12`,
      type: 'INCOME',
      amount: 64000.0,
      docName: 'Банківська виписка (гонорар)',
      docNumber: '54',
      docDate: `${year}-05-12`,
      note: 'Гонорар за правовий супровід господарської діяльності за травень',
      createdAt: now - 400000,
    },
    {
      date: `${year}-05-12`,
      type: 'EXPENSE',
      amount: 12000.0,
      docName: 'Акт надання послуг',
      docNumber: 'О-05',
      docDate: `${year}-05-12`,
      expenseCategory: 'col_9',
      note: 'Орендна плата за користування приміщенням, яке є робочим місцем адвоката, та технічне забезпечення діяльності робочого місця (охоронна та пожежна сигналізація)',
      createdAt: now - 390000,
    },
    {
      date: `${year}-05-12`,
      type: 'EXPENSE',
      amount: 2400.0,
      docName: 'Акт надання послуг',
      docNumber: 'ЛЗ-509',
      docDate: `${year}-05-12`,
      expenseCategory: 'col_9',
      note: 'Витрати на користування електронною базою законодавства та мережею Інтернет',
      createdAt: now - 380000,
    },
    {
      date: `${year}-08-19`,
      type: 'INCOME',
      amount: 52000.0,
      docName: 'Банківська виписка (гонорар)',
      docNumber: '904',
      docDate: `${year}-08-19`,
      note: 'Гонорар за підготовку процесуальних документів та апеляційної скарги',
      createdAt: now - 250000,
    },
    {
      date: `${year}-08-19`,
      type: 'EXPENSE',
      amount: 6500.0,
      docName: 'Платіжна інструкція',
      docNumber: '811',
      docDate: `${year}-08-19`,
      expenseCategory: 'col_9',
      note: 'Витрати на збирання доказів, отримання висновків спеціалістів (експертів) відповідно до умов договору про надання правової допомоги, та поштові й кур’єрські послуги',
      createdAt: now - 240000,
    },
    {
      date: `${year}-10-25`,
      type: 'INCOME',
      amount: 76000.0,
      docName: 'Банківська виписка (гонорар)',
      docNumber: '142',
      docDate: `${year}-10-25`,
      note: 'Оплата гонорару за договором про надання правничої допомоги № 19/10',
      createdAt: now - 100000,
    },
    {
      date: `${year}-10-25`,
      type: 'EXPENSE',
      amount: 3200.0,
      docName: 'Платіжна інструкція',
      docNumber: '774',
      docDate: `${year}-10-25`,
      expenseCategory: 'col_9',
      note: 'Проходження підвищення кваліфікації адвокатом, придбання фахової юридичної літератури, послуги телекомунікаційного зв’язку та КЕП для подання звітності',
      createdAt: now - 90000,
    },
    {
      date: `${year}-10-25`,
      type: 'EXPENSE',
      amount: 250.0,
      docName: 'Банківська виписка (комісія РКО)',
      docNumber: '775',
      docDate: `${year}-10-25`,
      expenseCategory: 'col_9',
      note: 'Відкриття рахунків у банках та їх розрахунково-касове обслуговування',
      createdAt: now - 80000,
    },
  ];

  const demoFixedAssets: FixedAsset[] = [
    {
      group: 'group_computers',
      name: 'Комп’ютер (ноутбук) робочого місця адвоката, принтер та сканер БФП Canon',
      purchaseDoc: 'Видаткова накладна № РН-442 від 10.01.' + year + ', ПІ № 14 від 10.01.' + year,
      commissioningDoc: 'Наказ (розпорядження) адвоката № 1-ОЗ від 12.01.' + year,
      commissioningDate: `${year}-01-12`,
      usefulLifeYears: 2,
      initialCost: 60000.0,
      isActive: true,
    },
    {
      group: 'group_tools',
      name: 'Вогнестійкий сейф для зберігання адвокатського досьє та офісні меблі',
      purchaseDoc: 'Договір № 08/25, ВН № 19 від 03.03.' + (year - 1),
      commissioningDoc: 'Акт введення в експлуатацію № 2-ОЗ від 05.03.' + (year - 1),
      commissioningDate: `${year - 1}-03-05`,
      usefulLifeYears: 3,
      initialCost: 36000.0,
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
