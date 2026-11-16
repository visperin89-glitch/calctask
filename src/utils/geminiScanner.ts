import { db, DEFAULT_PROFILE } from '../db/database';
import type {
  DocumentStatus,
  ExpenseCategory,
  ScannedDocumentResult,
  TaxProfile,
  TransactionType,
} from '../types/tax';

export const DEFAULT_GEMINI_API_KEY =
  (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)?.trim() || '';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

const GEMINI_API_KEY_STORAGE = 'taxbook_gemini_api_key';
const GEMINI_MODEL_STORAGE = 'taxbook_gemini_model';

export interface GeminiConfig {
  apiKey: string;
  model: string;
}

/**
 * Отримує актуальні налаштування Google Gemini API (з профілю, localStorage або значень за замовчуванням).
 */
export function getGeminiConfig(profile?: TaxProfile): GeminiConfig {
  let lsKey = '';
  let lsModel = '';
  if (typeof window !== 'undefined') {
    try {
      lsKey = window.localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() || '';
      lsModel = window.localStorage.getItem(GEMINI_MODEL_STORAGE)?.trim() || '';
    } catch {
      // Ігноруємо помилки доступу до localStorage
    }
  }

  const apiKey = profile?.geminiApiKey?.trim() || lsKey || DEFAULT_GEMINI_API_KEY;
  const model = profile?.geminiModel?.trim() || lsModel || DEFAULT_GEMINI_MODEL;

  return { apiKey, model };
}

/**
 * Зберігає API-ключ та модель Gemini локально (localStorage + таблиця профілю Dexie.js).
 */
export async function saveGeminiConfig(
  apiKey: string,
  model: string,
  currentProfile?: TaxProfile
): Promise<GeminiConfig> {
  const resolvedKey = apiKey.trim();
  const resolvedModel = model.trim() || DEFAULT_GEMINI_MODEL;

  if (typeof window !== 'undefined') {
    try {
      if (resolvedKey) {
        window.localStorage.setItem(GEMINI_API_KEY_STORAGE, resolvedKey);
      } else {
        window.localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      }
      window.localStorage.setItem(GEMINI_MODEL_STORAGE, resolvedModel);
    } catch {
      // Ігноруємо
    }
  }

  const existing = (await db.profile.get('default')) || currentProfile || DEFAULT_PROFILE;
  await db.profile.put({
    ...existing,
    id: 'default',
    geminiApiKey: resolvedKey,
    geminiModel: resolvedModel,
  });

  return { apiKey: resolvedKey, model: resolvedModel };
}

/**
 * Очищує Base64-рядок від префікса `data:image/...;base64,`, залишаючи лише чисті закодовані дані.
 */
export function stripBase64Prefix(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
}

function buildGeminiEndpoint(model?: string): string {
  const safeModel = (model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    safeModel
  )}:generateContent`;
}

/**
 * Виконує тестовий POST-запит до Google Gemini API для перевірки підключення та ключа.
 */
export async function testGeminiConnection(
  apiKey?: string,
  model?: string
): Promise<{
  ok: boolean;
  message: string;
  modelVersion?: string;
}> {
  const resolvedKey = apiKey?.trim() || getGeminiConfig().apiKey;
  const resolvedModel = model?.trim() || getGeminiConfig().model;

  if (!resolvedKey) {
    return {
      ok: false,
      message:
        'API-ключ Google Gemini не вказано. Введіть ваш ключ у поле вище та натисніть «Перевірити підключення».',
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      message: 'Відсутнє підключення до інтернету на пристрої.',
    };
  }

  try {
    const response = await fetch(buildGeminiEndpoint(resolvedModel), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': resolvedKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'Відповідай одним словом: OK' }],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 16,
        },
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const apiErrMsg =
        data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
      return {
        ok: false,
        message: `Помилка з’єднання з Gemini API: ${apiErrMsg}`,
      };
    }

    const modelVersion: string | undefined = data?.modelVersion;
    const textReply: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'OK';

    return {
      ok: true,
      modelVersion,
      message: `Підключення успішне! Модель «${
        modelVersion || resolvedModel
      }» відповіла: ${textReply}`,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Мережева помилка під час перевірки Gemini API: ${err.message}`
          : 'Не вдалося з’єднатися з сервером Google Gemini API.',
    };
  }
}

function normalizeIsoDate(raw?: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!raw || typeof raw !== 'string') return today;
  const cleaned = raw.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  // DD.MM.YYYY або DD/MM/YYYY або DD-MM-YYYY
  const dmyMatch = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  // YYYY.MM.DD або YYYY/MM/DD
  const ymdMatch = cleaned.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return today;
}

function parseJsonFromGeminiResponse(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(withoutFences) as Record<string, unknown>;
  } catch {
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(
        withoutFences.slice(firstBrace, lastBrace + 1)
      ) as Record<string, unknown>;
    }
    throw new Error('Не вдалося розібрати структуровану JSON-відповідь від Gemini API.');
  }
}

const GEMINI_DOCUMENT_PROMPT = `Ти — бухгалтер-експерт з українського податкового обліку ФОП та адвокатів (Типова форма № 261 Мінфіну України).
Проаналізуй зображення первинного документа (фіскальний чек, квитанція, платіжна інструкція, акт наданих послуг/виконаних робіт, рахунок-фактура, видаткова накладна) та поверни ТІЛЬКИ валідний JSON без жодного markdown чи пояснень.

Формат JSON:
{
  "type": "EXPENSE" | "INCOME" | "RETURN",
  "amount": number | null,
  "date": "YYYY-MM-DD" | null,
  "docName": string,
  "docNumber": string,
  "expenseCategory": "col_6" | "col_7" | "col_8" | "col_9",
  "docStatus": "original" | "electronic_kep" | "pending_counterparty",
  "counterparty": string,
  "note": string
}

Правила класифікації:
1. "amount": підсумкова сума до сплати з чека/квитанції/акта (число з крапкою, без валюти, напр. 1250.50).
2. "date": дата документа у форматі YYYY-MM-DD. Якщо рік або дата нечіткі — null.
3. "docName": коротка стандартизована українська назва документа, напр. "Фіскальний чек", "Квитанція", "Платіжна інструкція", "Акт наданих послуг", "Видаткова накладна", "Рахунок".
4. "docNumber": фіскальний номер ФН/РРО чека або номер документа/квитанції (лише номер без слова "№", напр. "40001258" або "145"). Якщо номер відсутній — "Б/Н".
5. "type": за замовчуванням "EXPENSE" для чеків покупки/квитанцій/рахунків на оплату. Якщо документ є підтвердженням повернення коштів — "RETURN".
6. "expenseCategory" (для EXPENSE):
   - "col_6": придбання ТМЦ, канцтоварів, паперу, витратних матеріалів, товарів для перепродажу чи виробничих потреб;
   - "col_7": виплата заробітної плати працівникам або за договорами ЦПХ;
   - "col_8": сплата податків, ЄСВ, держмита, судового збору, ліцензій, внесків адвоката до НААУ/ради адвокатів;
   - "col_9": інші витрати (оренда офісу/робочого місця, інтернет, мобільний зв'язок, РКО банку, комунальні, технічне обслуговування, програмне забезпечення, юридичні бази, нотаріальні чи поштові послуги).
7. "docStatus": якщо чек паперовий або сфотографований — "original"; якщо електронна квитанція/чек з QR/КЕП — "electronic_kep".
8. "counterparty": назва магазину, постачальника, банку, ФОП або ТОВ (напр. "ТОВ Епіцентр К", "АТ КБ ПриватБанк").
9. "note": стислий зміст господарської операції українською (до 120 символів, із зазначенням контрагента та суті покупки/послуги).`;

/**
 * Відправляє фото первинного документа у Google Gemini Vision API та повертає розпізнані поля
 * для автоматичного заповнення картки операції Книги № 261.
 */
export async function recognizeDocumentWithGemini(options: {
  base64Image: string;
  attachmentPath: string;
  previewDataUrl: string;
  apiKey?: string;
  model?: string;
}): Promise<ScannedDocumentResult> {
  const config = getGeminiConfig();
  const resolvedKey = options.apiKey?.trim() || config.apiKey;
  const resolvedModel = options.model?.trim() || config.model;
  const cleanBase64 = stripBase64Prefix(options.base64Image);

  if (!resolvedKey) {
    throw new Error(
      'API-ключ Google Gemini не вказано. Додайте ваш ключ у розділі «Профіль -> AI-розпізнавання документів (Gemini API)».'
    );
  }

  if (!cleanBase64) {
    throw new Error('Зображення порожнє або пошкоджене.');
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      'Відсутнє інтернет-з’єднання. Фото збережено на пристрої, заповніть суму та реквізити вручну.'
    );
  }

  const response = await fetch(buildGeminiEndpoint(resolvedModel), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-goog-api-key': resolvedKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: GEMINI_DOCUMENT_PROMPT },
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errMsg =
      data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(`Помилка Gemini Vision API: ${errMsg}`);
  }

  const candidateText: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText) {
    throw new Error('Gemini API повернув порожню відповідь без розпізнаного тексту.');
  }

  const parsed = parseJsonFromGeminiResponse(candidateText);

  const rawType = String(parsed.type || 'EXPENSE').toUpperCase();
  const type: TransactionType =
    rawType === 'INCOME' || rawType === 'RETURN' ? rawType : 'EXPENSE';

  const rawAmount = Number(String(parsed.amount ?? '').replace(',', '.'));
  const amount =
    Number.isFinite(rawAmount) && rawAmount > 0
      ? Math.round(rawAmount * 100) / 100
      : undefined;

  const isoDate = normalizeIsoDate(
    typeof parsed.date === 'string' ? parsed.date : undefined
  );

  const rawCategory = String(parsed.expenseCategory || 'col_9');
  const expenseCategory: ExpenseCategory =
    rawCategory === 'col_6' ||
    rawCategory === 'col_7' ||
    rawCategory === 'col_8' ||
    rawCategory === 'col_9'
      ? rawCategory
      : 'col_9';

  const rawDocStatus = String(parsed.docStatus || 'original');
  const docStatus: DocumentStatus =
    rawDocStatus === 'electronic_kep' || rawDocStatus === 'pending_counterparty'
      ? rawDocStatus
      : 'original';

  const docName =
    typeof parsed.docName === 'string' && parsed.docName.trim()
      ? parsed.docName.trim()
      : 'Фіскальний чек';

  const docNumber =
    typeof parsed.docNumber === 'string' && parsed.docNumber.trim()
      ? parsed.docNumber.trim()
      : '';

  const counterparty =
    typeof parsed.counterparty === 'string' ? parsed.counterparty.trim() : '';

  const rawNote = typeof parsed.note === 'string' ? parsed.note.trim() : '';
  const combinedNote =
    counterparty && rawNote && !rawNote.toLowerCase().includes(counterparty.toLowerCase())
      ? `${counterparty} — ${rawNote}`
      : rawNote || counterparty;

  return {
    type,
    amount,
    date: isoDate,
    docName,
    docNumber,
    docDate: isoDate,
    expenseCategory: type === 'EXPENSE' ? expenseCategory : undefined,
    docStatus,
    counterparty: counterparty || undefined,
    note: combinedNote || undefined,
    attachmentPath: options.attachmentPath,
    previewDataUrl: options.previewDataUrl,
  };
}
