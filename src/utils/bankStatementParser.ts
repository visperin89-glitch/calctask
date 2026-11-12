import type {
  DocumentStatus,
  ExpenseCategory,
  TaxTransaction,
  TransactionType,
} from '../types/tax';
import { roundCurrency } from './calculations';

export type BankStatementFormat = 'PRIVATBANK' | 'MONOBANK' | 'UNIVERSAL';

export interface ParsedStatementColumnMapping {
  dateCol: number;
  amountCol: number;
  descriptionCol: number;
  counterpartyCol: number;
  docNumberCol: number;
}

export interface ParsedBankStatementRow {
  rowIndex: number;
  selected: boolean;
  date: string; // YYYY-MM-DD
  rawAmount: number; // + або -
  amount: number; // додатне значення
  type: TransactionType; // INCOME для > 0, EXPENSE для < 0
  expenseCategory?: ExpenseCategory;
  docName: string;
  docNumber: string;
  counterparty: string;
  description: string;
  docStatus: DocumentStatus;
}

export interface RawStatementSheet {
  headers: string[];
  rows: string[][];
  detectedFormat: BankStatementFormat;
  suggestedMapping: ParsedStatementColumnMapping;
}

/**
 * Автоматична класифікація категорії витрат (Графи 6–9) за ключовими словами у призначенні платежу.
 */
export function guessExpenseCategoryByDescription(
  description: string,
  counterparty: string
): ExpenseCategory {
  const text = `${description} ${counterparty}`.toLowerCase();

  if (
    text.includes('єсв') ||
    text.includes('єдиний внесок') ||
    text.includes('пфу') ||
    text.includes('пенсійний') ||
    text.includes('податок') ||
    text.includes('військовий збір') ||
    text.includes('казначейств') ||
    text.includes('ліцензі')
  ) {
    return 'col_8';
  }

  if (
    text.includes('заробітн') ||
    text.includes('зарплат') ||
    text.includes('аванс працівник') ||
    text.includes('оплата праці') ||
    text.includes('помічник') ||
    text.includes('секретар')
  ) {
    return 'col_7';
  }

  if (
    text.includes('канцтовар') ||
    text.includes('канцеляр') ||
    text.includes('папір') ||
    text.includes('бланк') ||
    text.includes('ордер') ||
    text.includes('печатк') ||
    text.includes('штамп') ||
    text.includes('картридж') ||
    text.includes('тмц') ||
    text.includes('матеріал')
  ) {
    return 'col_6';
  }

  return 'col_9';
}

/**
 * Нормалізує дату з різних банківських форматів (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, DD.MM.YY HH:mm:ss)
 * у стандартний формат YYYY-MM-DD.
 */
export function parseStatementDateToIso(raw: string, fallbackYear: number): string {
  const clean = (raw || '').trim().split(/\s+/)[0];
  if (!clean) {
    return `${fallbackYear}-01-01`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // DD.MM.YYYY або DD/MM/YYYY або DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let yr = dmyMatch[3];
    if (yr.length === 2) {
      yr = `20${yr}`;
    }
    return `${yr}-${month}-${day}`;
  }

  // Excel serial number (напр. 46050)
  const asNum = Number(clean);
  if (!Number.isNaN(asNum) && asNum > 40000 && asNum < 60000) {
    const utcDays = Math.floor(asNum - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  return `${fallbackYear}-01-01`;
}

/**
 * Парсинг грошової суми з рядка банківської виписки (підтримує пробіли, коми, мінус, дужки).
 */
export function parseStatementAmount(raw: string): number {
  if (!raw) return 0;
  let cleaned = String(raw)
    .replace(/\u00A0/g, '')
    .replace(/\s+/g, '')
    .replace(/UAH|грн|₴/gi, '')
    .trim();

  if (!cleaned) return 0;

  let isNegative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    isNegative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith('-') || cleaned.startsWith('−') || cleaned.startsWith('–')) {
    isNegative = true;
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Якщо є і кома, і крапка (напр. 12,345.67 або 12.345,67)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = parseFloat(cleaned);
  if (Number.isNaN(parsed)) return 0;
  return isNegative ? -Math.abs(parsed) : parsed;
}

/**
 * Розбирає CSV-рядок з урахуванням лапок та роздільника.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Автовизначення формату виписки (ПриватБанк / Монобанк / Універсальний) та індексів колонок за заголовками.
 */
export function detectColumnsFromHeaders(headers: string[]): {
  detectedFormat: BankStatementFormat;
  suggestedMapping: ParsedStatementColumnMapping;
} {
  const normalized = headers.map((h) => (h || '').toLowerCase().trim());

  let dateCol = -1;
  let amountCol = -1;
  let descriptionCol = -1;
  let counterpartyCol = -1;
  let docNumberCol = -1;

  normalized.forEach((h, idx) => {
    if (
      dateCol === -1 &&
      (h.includes('дата') || h.includes('date') || h.includes('час операції'))
    ) {
      dateCol = idx;
    }
    if (
      amountCol === -1 &&
      (h.includes('сума в валюті картки') ||
        h.includes('сума у валюті рахунку') ||
        h.includes('сума') ||
        h.includes('amount') ||
        h.includes('оборот'))
    ) {
      amountCol = idx;
    }
    if (
      descriptionCol === -1 &&
      (h.includes('призначення') ||
        h.includes('деталі операції') ||
        h.includes('опис') ||
        h.includes('description') ||
        h.includes('коментар'))
    ) {
      descriptionCol = idx;
    }
    if (
      counterpartyCol === -1 &&
      (h.includes('контрагент') ||
        h.includes('кореспондент') ||
        h.includes('отримувач') ||
        h.includes('платник') ||
        h.includes('counterparty'))
    ) {
      counterpartyCol = idx;
    }
    if (
      docNumberCol === -1 &&
      (h.includes('номер документа') ||
        h.includes('№ документа') ||
        h.includes('референс') ||
        h.includes('документ') ||
        h.includes('id'))
    ) {
      docNumberCol = idx;
    }
  });

  const joined = normalized.join(' | ');
  let detectedFormat: BankStatementFormat = 'UNIVERSAL';
  if (
    joined.includes('сума в валюті картки') ||
    joined.includes('mcc') ||
    joined.includes('кешбек') ||
    joined.includes('деталі операції')
  ) {
    detectedFormat = 'MONOBANK';
  } else if (
    joined.includes('єдрпоу') ||
    joined.includes('мфо') ||
    joined.includes('призначення платежу') ||
    joined.includes('референс')
  ) {
    detectedFormat = 'PRIVATBANK';
  }

  return {
    detectedFormat,
    suggestedMapping: {
      dateCol: dateCol >= 0 ? dateCol : 0,
      amountCol: amountCol >= 0 ? amountCol : Math.min(1, Math.max(0, headers.length - 1)),
      descriptionCol:
        descriptionCol >= 0 ? descriptionCol : Math.min(2, Math.max(0, headers.length - 1)),
      counterpartyCol: counterpartyCol >= 0 ? counterpartyCol : -1,
      docNumberCol: docNumberCol >= 0 ? docNumberCol : -1,
    },
  };
}

/**
 * Зчитує файл CSV або XLSX та повертає матрицю заголовків і рядків разом із автовизначеним форматом.
 */
export async function parseRawBankStatementFile(file: File): Promise<RawStatementSheet> {
  const fileName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (fileName.endsWith('.xlsx')) {
    const ExcelJSModule = await import('exceljs');
    const ExcelJSRuntime = ExcelJSModule.default || ExcelJSModule;
    const wb = new ExcelJSRuntime.Workbook();
    await wb.xlsx.load(buffer);

    const ws = wb.worksheets[0];
    if (!ws) {
      throw new Error('У файлі Excel не знайдено жодного аркуша.');
    }

    const allRows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
      const stringCells = vals.map((v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
        if (typeof v === 'object' && 'text' in v) return String(v.text ?? '');
        return String(v).trim();
      });
      if (stringCells.some((c) => c !== '')) {
        allRows.push(stringCells);
      }
    });

    if (allRows.length < 2) {
      throw new Error('У виписці Excel недостатньо рядків для імпорту.');
    }

    // Шукаємо рядок заголовка (де є «Дата» або «Сума»)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, allRows.length); i++) {
      const joined = allRows[i].join(' ').toLowerCase();
      if (joined.includes('дата') || joined.includes('сума') || joined.includes('date')) {
        headerIdx = i;
        break;
      }
    }

    const headers = allRows[headerIdx].map((h, i) => h || `Колонка ${i + 1}`);
    const dataRows = allRows.slice(headerIdx + 1);
    const { detectedFormat, suggestedMapping } = detectColumnsFromHeaders(headers);

    return {
      headers,
      rows: dataRows,
      detectedFormat,
      suggestedMapping,
    };
  }

  // CSV парсинг з автовизначенням кодування UTF-8 або Windows-1251 (стандарт Приват24 для бізнесу)
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.includes('\uFFFD')) {
    try {
      text = new TextDecoder('windows-1251').decode(buffer);
    } catch {
      // залишаємо UTF-8
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV-файл порожній або містить менше 2 рядків.');
  }

  // Визначаємо роздільник (; або , або \t)
  const sampleLine = lines[0];
  const semicolons = (sampleLine.match(/;/g) || []).length;
  const tabs = (sampleLine.match(/\t/g) || []).length;
  const commas = (sampleLine.match(/,/g) || []).length;

  let delimiter = ';';
  if (tabs > semicolons && tabs > commas) delimiter = '\t';
  else if (commas > semicolons) delimiter = ',';

  const allRows = lines.map((line) => splitCsvLine(line, delimiter));

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const joined = allRows[i].join(' ').toLowerCase();
    if (joined.includes('дата') || joined.includes('сума') || joined.includes('date')) {
      headerIdx = i;
      break;
    }
  }

  const headers = allRows[headerIdx].map((h, i) => h || `Колонка ${i + 1}`);
  const dataRows = allRows.slice(headerIdx + 1);
  const { detectedFormat, suggestedMapping } = detectColumnsFromHeaders(headers);

  return {
    headers,
    rows: dataRows,
    detectedFormat,
    suggestedMapping,
  };
}

/**
 * Конвертує сирі рядки виписки у структуровані транзакції відповідно до вибраного мапінгу колонок.
 * Додатні суми (> 0) автоматично класифікуються як «Дохід (Гр. 4)», від'ємні (< 0) — як «Витрата».
 */
export function buildTransactionsFromStatementRows(
  rawSheet: RawStatementSheet,
  mapping: ParsedStatementColumnMapping,
  fallbackYear: number
): ParsedBankStatementRow[] {
  const result: ParsedBankStatementRow[] = [];

  rawSheet.rows.forEach((cells, idx) => {
    const rawDate = mapping.dateCol >= 0 ? cells[mapping.dateCol] || '' : '';
    const rawAmtStr = mapping.amountCol >= 0 ? cells[mapping.amountCol] || '' : '';
    const rawDesc = mapping.descriptionCol >= 0 ? cells[mapping.descriptionCol] || '' : '';
    const rawCounterparty =
      mapping.counterpartyCol >= 0 ? cells[mapping.counterpartyCol] || '' : '';
    const rawDocNum = mapping.docNumberCol >= 0 ? cells[mapping.docNumberCol] || '' : '';

    const signedAmount = parseStatementAmount(rawAmtStr);
    if (signedAmount === 0) return;

    const dateIso = parseStatementDateToIso(rawDate, fallbackYear);
    const isIncome = signedAmount > 0;
    const absAmount = roundCurrency(Math.abs(signedAmount));

    const type: TransactionType = isIncome ? 'INCOME' : 'EXPENSE';
    const expenseCategory: ExpenseCategory | undefined = isIncome
      ? undefined
      : guessExpenseCategoryByDescription(rawDesc, rawCounterparty);

    const docName = isIncome ? 'Банківська виписка (гонорар)' : 'Платіжна інструкція';
    const docNumber = rawDocNum || `${idx + 1}`;

    result.push({
      rowIndex: idx + 1,
      selected: true,
      date: dateIso,
      rawAmount: signedAmount,
      amount: absAmount,
      type,
      expenseCategory,
      docName,
      docNumber,
      counterparty: rawCounterparty,
      description: rawDesc || (isIncome ? 'Надходження коштів за випискою' : 'Оплата за випискою'),
      docStatus: 'electronic_kep',
    });
  });

  return result;
}

/**
 * Формує готові об'єкти `TaxTransaction` із відмічених рядків попереднього перегляду.
 */
export function convertPreviewRowsToTaxTransactions(
  rows: ParsedBankStatementRow[]
): TaxTransaction[] {
  const now = Date.now();
  return rows
    .filter((r) => r.selected && r.amount > 0)
    .map((r, idx) => {
      const [yStr, mStr] = r.date.split('-');
      const noteParts = [r.description, r.counterparty ? `Контрагент: ${r.counterparty}` : '']
        .filter(Boolean)
        .join(' • ');

      return {
        date: r.date,
        year: Number(yStr) || new Date().getFullYear(),
        month: Number(mStr) || 1,
        type: r.type,
        amount: roundCurrency(r.amount),
        docName: r.docName,
        docNumber: r.docNumber || String(idx + 1),
        docDate: r.date,
        expenseCategory: r.type === 'EXPENSE' ? r.expenseCategory || 'col_9' : undefined,
        category: r.type === 'EXPENSE' ? r.expenseCategory || 'col_9' : '',
        docStatus: r.docStatus,
        note: noteParts,
        createdAt: now + idx,
      };
    });
}
