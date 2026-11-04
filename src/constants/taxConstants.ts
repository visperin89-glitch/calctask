import type { ExpenseCategory, FixedAssetGroupConfig, FixedAssetGroupId, TransactionType } from '../types/tax';

export const FIXED_ASSET_GROUPS: FixedAssetGroupConfig[] = [
  {
    id: 'group_computers',
    code: 'Група 2 (ЕОМ)',
    name: 'ЕОМ, комп’ютери, засоби зв’язку, програми та їх складові',
    shortName: 'ЕОМ, комп’ютери, зв’язок',
    minYears: 2,
    description: 'Електронно-обчислювальні машини, інші машини для автоматичного оброблення інформації, пов’язані з ними засоби зчитування або друку інформації, комп’ютерні програми, телефони, мікрофони, рації (пп. 177.4.9 ПКУ)',
  },
  {
    id: 'group_tools',
    code: 'Група 2 (Інвентар)',
    name: 'Інструменти, прилади, інвентар (меблі)',
    shortName: 'Інструменти, прилади, меблі',
    minYears: 3,
    description: 'Інструменти, прилади, інвентар, меблі, лабораторне та офісне обладнання (пп. 177.4.9 ПКУ)',
  },
  {
    id: 'group_machinery',
    code: 'Група 2 (Обладнання)',
    name: 'Машини та технологічне обладнання',
    shortName: 'Машини та обладнання',
    minYears: 5,
    description: 'Машини, верстати, силові агрегати та робоче технологічне обладнання (пп. 177.4.9 ПКУ)',
  },
  {
    id: 'group_transport',
    code: 'Група 3 (Транспорт)',
    name: 'Транспортні засоби (вантажні, спецтранспорт)',
    shortName: 'Вантажний та спецтранспорт',
    minYears: 5,
    description: 'Вантажні автомобілі, причепи, напівпричепи та спеціалізований транспорт (крім легкових автомобілів — пп. 177.4.6 ПКУ)',
  },
  {
    id: 'group_other_fa',
    code: 'Група 1 / Інші ОЗ',
    name: 'Інші основні засоби',
    shortName: 'Інші основні засоби',
    minYears: 12,
    description: 'Інші основні засоби (нежитлова нерухомість, споруди, передавальні пристрої тощо, мінімальний строк — 12–20 років)',
  },
  {
    id: 'group_intangible',
    code: 'Група 4 (НА)',
    name: 'Нематеріальні активи (НА)',
    shortName: 'Нематеріальні активи (НА)',
    minYears: 2,
    description: 'Строк дії права користування відповідно до правовстановлюючого документа, але не менше 2 років (пп. 177.4.9 ПКУ)',
  },
];

export const FIXED_ASSET_GROUP_MAP: Record<FixedAssetGroupId, FixedAssetGroupConfig> = FIXED_ASSET_GROUPS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<FixedAssetGroupId, FixedAssetGroupConfig>
);

export interface ExpenseCategoryInfo {
  id: ExpenseCategory;
  colNumber: number;
  shortTitle: string;
  fullTitle: string;
  hint: string;
  badgeColor: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryInfo[] = [
  {
    id: 'col_6',
    colNumber: 6,
    shortTitle: 'Гр. 6 — Придбання ТМЦ',
    fullTitle: 'Витрати на придбання товарно-матеріальних цінностей, що реалізовані або використані у виробництві продукції (наданні послуг)',
    hint: 'Сировина, матеріали, товари для перепродажу, комплектуючі (п. 6 розд. II Порядку № 261)',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: 'col_7',
    colNumber: 7,
    shortTitle: 'Гр. 7 — Оплата праці / ЦПХ',
    fullTitle: 'Витрати на оплату праці фізичних осіб, що перебувають у трудових відносинах або за договорами цивільно-правового характеру',
    hint: 'Заробітна плата працівників (брутто) та винагороди за договорами ЦПХ',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    id: 'col_8',
    colNumber: 8,
    shortTitle: 'Гр. 8 — Податки, ЄСВ, ліцензії',
    fullTitle: 'Витрати на сплату податків, зборів, єдиного внеску на загальнообов’язкове державне соціальне страхування, платежів за одержання ліцензій та дозволів',
    hint: 'ЄСВ за себе та за працівників, плата за ліцензії, місцеві податки та збори',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    id: 'col_9',
    colNumber: 9,
    shortTitle: 'Гр. 9 — Інші витрати',
    fullTitle: 'Інші витрати, які безпосередньо пов’язані з отриманням доходу (оренда, зв’язок, РКО банку, комунальні послуги, ремонт тощо)',
    hint: 'Оренда офісу/складу, комісія банку, зв’язок, інтернет, реклама, відрядження',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
  },
];

export const EXPENSE_CATEGORY_MAP: Record<ExpenseCategory, ExpenseCategoryInfo> = EXPENSE_CATEGORIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ExpenseCategory, ExpenseCategoryInfo>
);

export const TRANSACTION_TYPE_LABELS: Record<
  TransactionType,
  { label: string; shortLabel: string; colLabel: string; colorClass: string; bgClass: string }
> = {
  INCOME: {
    label: 'Дохід (Надходження)',
    shortLabel: 'Дохід',
    colLabel: 'Графа 2',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  RETURN: {
    label: 'Повернення коштів покупцям',
    shortLabel: 'Повернення',
    colLabel: 'Графа 3',
    colorClass: 'text-orange-700',
    bgClass: 'bg-orange-50 border-orange-200 text-orange-800',
  },
  EXPENSE: {
    label: 'Витрата (Підтверджена документом)',
    shortLabel: 'Витрата',
    colLabel: 'Графи 5–9',
    colorClass: 'text-rose-700',
    bgClass: 'bg-rose-50 border-rose-200 text-rose-800',
  },
};

export const QUICK_DOC_NAMES: Record<TransactionType, string[]> = {
  INCOME: [
    'Банківська виписка',
    'Фіскальний чек РРО/ПРРО',
    'Платіжна інструкція',
    'Акт надання послуг',
    'Видаткова накладна',
    'Квитанція ПТКС',
  ],
  RETURN: [
    'Платіжна інструкція на повернення',
    'Фіскальний чек повернення',
    'Акт повернення коштів',
    'Заява покупця та виписка банку',
  ],
  EXPENSE: [
    'Платіжна інструкція',
    'Фіскальний чек',
    'Акт надання послуг',
    'Видаткова накладна',
    'Банківська виписка (комісія РКО)',
    'Відомість нарахування ЗП',
    'Товарний чек',
    'Квитанція про сплату податку/ЄСВ',
  ],
};

export const RESTRICTED_ASSET_KEYWORDS = [
  'легковий',
  'легкова',
  'легкове',
  'легкового',
  'легкові',
  'квартира',
  'квартири',
  'квартиру',
  'житловий',
  'житлова',
  'житлове',
  'житлового',
  'земельна ділянка',
  'земельної ділянки',
  'земельну ділянку',
];

export const RESTRICTED_ASSET_WARNING_TEXT =
  'Увага: згідно з пп. 177.4.6 ПКУ земельні ділянки, житлова нерухомість та легкові автомобілі НЕ підлягають амортизації та прямому включенню до витрат ФОП!';

export const VAT_PAYER_REMINDER_TEXT = 'Платник ПДВ: сума вноситься без ПДВ';

export const UKRAINIAN_MONTHS = [
  { value: 1, name: 'Січень' },
  { value: 2, name: 'Лютий' },
  { value: 3, name: 'Березень' },
  { value: 4, name: 'Квітень' },
  { value: 5, name: 'Травень' },
  { value: 6, name: 'Червень' },
  { value: 7, name: 'Липень' },
  { value: 8, name: 'Серпень' },
  { value: 9, name: 'Вересень' },
  { value: 10, name: 'Жовтень' },
  { value: 11, name: 'Листопад' },
  { value: 12, name: 'Грудень' },
];
