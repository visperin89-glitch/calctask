import {
  FIXED_ASSET_GROUP_MAP,
  RESTRICTED_ASSET_KEYWORDS,
  RESTRICTED_ASSET_WARNING_TEXT,
} from '../constants/taxConstants';
import type { FixedAsset, FixedAssetGroupId, TaxTransaction } from '../types/tax';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

/**
 * Перевіряє текст (назву ОЗ, примітку або документ) на наявність ключових слів
 * активів подвійного призначення / обмежених активів (пп. 177.4.6 ПКУ).
 */
export function hasRestrictedAssetKeywords(...texts: (string | undefined)[]): boolean {
  const combined = texts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!combined) return false;

  return RESTRICTED_ASSET_KEYWORDS.some((keyword) => combined.includes(keyword.toLowerCase()));
}

/**
 * Валідація транзакції перед збереженням відповідно до Порядку Мінфіну № 261.
 */
export function validateTransaction(tx: Partial<TaxTransaction>): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  if (!tx.date || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
    errors.date = 'Вкажіть коректну дату операції (РРРР-ММ-ДД)';
  }

  if (!tx.type || !['INCOME', 'RETURN', 'EXPENSE'].includes(tx.type)) {
    errors.type = 'Оберіть тип операції';
  }

  if (typeof tx.amount !== 'number' || Number.isNaN(tx.amount) || tx.amount <= 0) {
    errors.amount = 'Сума операції має бути більшою за 0,00 грн';
  }

  if (tx.type === 'EXPENSE') {
    if (!tx.docName || !tx.docName.trim()) {
      errors.docName = 'Для витрат назва первинного документа є суворо обов’язковою (Графа 5 Порядку № 261)';
    }
    if (!tx.docNumber || !tx.docNumber.trim()) {
      errors.docNumber = 'Для витрат номер первинного документа є суворо обов’язковим (Графа 5 Порядку № 261)';
    }
    if (!tx.docDate || !/^\d{4}-\d{2}-\d{2}$/.test(tx.docDate)) {
      errors.docDate = 'Для витрат дата первинного документа є суворо обов’язковою (Графа 5 Порядку № 261)';
    }
    if (!tx.expenseCategory || !['col_6', 'col_7', 'col_8', 'col_9'].includes(tx.expenseCategory)) {
      errors.expenseCategory = 'Оберіть графу витрат (Графи 6–9 Порядку № 261)';
    }
  }

  if (hasRestrictedAssetKeywords(tx.note, tx.docName)) {
    warnings.push(RESTRICTED_ASSET_WARNING_TEXT);
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

/**
 * Валідація об'єкта Основних Засобів / Нематеріальних Активів (пп. 177.4.9 ПКУ).
 */
export function validateFixedAsset(asset: Partial<FixedAsset>): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  const groupId = asset.group as FixedAssetGroupId | undefined;
  const groupConfig = groupId ? FIXED_ASSET_GROUP_MAP[groupId] : undefined;

  if (!groupConfig) {
    errors.group = 'Оберіть групу ОЗ/НА відповідно до пп. 177.4.9 ПКУ';
  }

  if (!asset.name || !asset.name.trim()) {
    errors.name = 'Вкажіть назву об’єкта основного засобу або нематеріального активу';
  }

  if (!asset.purchaseDoc || !asset.purchaseDoc.trim()) {
    errors.purchaseDoc = 'Вкажіть реквізити документа про придбання / виготовлення (Графа 4 Додатка)';
  }

  if (!asset.commissioningDoc || !asset.commissioningDoc.trim()) {
    errors.commissioningDoc = 'Вкажіть реквізити документа про введення в експлуатацію (Графа 5 Додатка)';
  }

  if (!asset.commissioningDate || !/^\d{4}-\d{2}-\d{2}$/.test(asset.commissioningDate)) {
    errors.commissioningDate = 'Вкажіть дату введення в експлуатацію';
  }

  if (typeof asset.initialCost !== 'number' || Number.isNaN(asset.initialCost) || asset.initialCost <= 0) {
    errors.initialCost = 'Первісна вартість має бути більшою за 0,00 грн';
  }

  if (typeof asset.usefulLifeYears !== 'number' || Number.isNaN(asset.usefulLifeYears) || asset.usefulLifeYears <= 0) {
    errors.usefulLifeYears = 'Вкажіть строк корисного використання у роках';
  } else if (groupConfig && asset.usefulLifeYears < groupConfig.minYears) {
    errors.usefulLifeYears = `Мінімально допустимий строк для групи «${groupConfig.shortName}» становить ${groupConfig.minYears} р. (пп. 177.4.9 ПКУ). Збереження зі строком менше законодавчого заборонено.`;
  }

  if (hasRestrictedAssetKeywords(asset.name, asset.purchaseDoc)) {
    warnings.push(RESTRICTED_ASSET_WARNING_TEXT);
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}
