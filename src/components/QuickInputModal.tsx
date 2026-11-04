import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  Hash,
  Info,
  PlusCircle,
  Save,
  X,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  QUICK_DOC_NAMES,
  RESTRICTED_ASSET_WARNING_TEXT,
  TRANSACTION_TYPE_LABELS,
  VAT_PAYER_REMINDER_TEXT,
} from '../constants/taxConstants';
import { db } from '../db/database';
import type {
  ExpenseCategory,
  TaxProfile,
  TaxTransaction,
  TransactionType,
} from '../types/tax';
import { hasRestrictedAssetKeywords, validateTransaction } from '../utils/validation';

interface QuickInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TaxProfile;
  editingTransaction?: TaxTransaction | null;
  defaultDate?: string;
  onSaved?: () => void;
}

export const QuickInputModal: React.FC<QuickInputModalProps> = ({
  isOpen,
  onClose,
  profile,
  editingTransaction,
  defaultDate,
  onSaved,
}) => {
  const todayIso = defaultDate || new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<TransactionType>('INCOME');
  const [date, setDate] = useState<string>(todayIso);
  const [amountStr, setAmountStr] = useState<string>('');
  const [docName, setDocName] = useState<string>('Банківська виписка');
  const [docNumber, setDocNumber] = useState<string>('');
  const [docDate, setDocDate] = useState<string>(todayIso);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('col_6');
  const [note, setNote] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setDate(editingTransaction.date);
      setAmountStr(String(editingTransaction.amount));
      setDocName(editingTransaction.docName || '');
      setDocNumber(editingTransaction.docNumber || '');
      setDocDate(editingTransaction.docDate || editingTransaction.date);
      setExpenseCategory(editingTransaction.expenseCategory || 'col_6');
      setNote(editingTransaction.note || '');
      setErrors({});
    } else {
      const initDate = defaultDate || new Date().toISOString().slice(0, 10);
      setType('INCOME');
      setDate(initDate);
      setAmountStr('');
      setDocName('Банківська виписка');
      setDocNumber('');
      setDocDate(initDate);
      setExpenseCategory('col_6');
      setNote('');
      setErrors({});
    }
  }, [editingTransaction, defaultDate, isOpen]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setErrors({});
    if (!editingTransaction) {
      const defaultDocs = QUICK_DOC_NAMES[newType];
      if (defaultDocs && defaultDocs.length > 0) {
        setDocName(defaultDocs[0]);
      }
    }
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    // Синхронізуємо дату документа, якщо вони збігалися
    if (docDate === date || !docDate) {
      setDocDate(newDate);
    }
  };

  const showRestrictedWarning = hasRestrictedAssetKeywords(note, docName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedAmount = parseFloat(amountStr.replace(',', '.'));

    const candidate: Partial<TaxTransaction> = {
      date,
      type,
      amount: normalizedAmount,
      docName: docName.trim(),
      docNumber: docNumber.trim(),
      docDate: docDate || date,
      expenseCategory: type === 'EXPENSE' ? expenseCategory : undefined,
      note: note.trim() || undefined,
      createdAt: editingTransaction?.createdAt || Date.now(),
    };

    const validation = validateTransaction(candidate);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSaving(true);
    try {
      if (editingTransaction?.id) {
        await db.transactions.update(editingTransaction.id, candidate as TaxTransaction);
      } else {
        await db.transactions.add(candidate as TaxTransaction);
      }
      onSaved?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto print:hidden">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col">
        {/* Шапка модалки */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-semibold">
              {editingTransaction ? 'Редагування операції' : 'Швидкий запис операції'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Закрити"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тіло форми (mobile-first для однієї руки) */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Індикатор ПДВ (п. 2 розд. II Порядку № 261) */}
          {profile.isVatPayer && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm font-medium">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{VAT_PAYER_REMINDER_TEXT} (п. 2 розд. ІІ Порядку № 261)</span>
            </div>
          )}

          {/* Попередження про обмежені активи (пп. 177.4.6 ПКУ) */}
          {showRestrictedWarning && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs sm:text-sm font-semibold shadow-xs">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span>{RESTRICTED_ASSET_WARNING_TEXT}</span>
            </div>
          )}

          {/* Вибір типу операції (великі кнопки під великий палець) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Тип операції
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['INCOME', 'EXPENSE', 'RETURN'] as TransactionType[]).map((t) => {
                const active = type === t;
                const info = TRANSACTION_TYPE_LABELS[t];
                let activeStyle = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
                if (active && t === 'INCOME') {
                  activeStyle = 'bg-emerald-600 text-white border-emerald-600 shadow-sm';
                } else if (active && t === 'EXPENSE') {
                  activeStyle = 'bg-rose-600 text-white border-rose-600 shadow-sm';
                } else if (active && t === 'RETURN') {
                  activeStyle = 'bg-amber-600 text-white border-amber-600 shadow-sm';
                }
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`py-2.5 px-2 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${activeStyle}`}
                  >
                    <span className="text-sm font-bold">{info.shortLabel}</span>
                    <span className={`text-[11px] ${active ? 'text-white/85' : 'text-slate-500'}`}>
                      {info.colLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Сума та Дата операції */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Сума операції (грн, коп.) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => {
                    setAmountStr(e.target.value);
                    if (errors.amount) setErrors({ ...errors, amount: '' });
                  }}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                    errors.amount
                      ? 'border-rose-500 focus:ring-rose-500 bg-rose-50/40'
                      : 'border-slate-300 focus:ring-blue-600'
                  }`}
                  autoFocus
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  UAH
                </span>
              </div>
              {errors.amount && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.amount}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Дата запису (Графа 1) *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${
                    errors.date
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
              </div>
              {errors.date && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.date}</p>}
            </div>
          </div>

          {/* Вибір категорії витрат (Графи 6–9) — обов'язково для EXPENSE */}
          {type === 'EXPENSE' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Категорія витрат (Графи 6–9 Форми № 261) *
              </label>
              <div className="grid grid-cols-1 gap-2">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const isSelected = expenseCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setExpenseCategory(cat.id);
                        if (errors.expenseCategory) setErrors({ ...errors, expenseCategory: '' });
                      }}
                      className={`text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900">
                          {cat.shortTitle}
                        </div>
                        <div className="text-[11px] text-slate-600 leading-tight mt-0.5">
                          {cat.hint}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.expenseCategory && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.expenseCategory}</p>
              )}
            </div>
          )}

          {/* Блок реквізитів первинного документа (Графа 5 для витрат обов'язкова) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                Первинний документ {type === 'EXPENSE' ? '(Графа 5 — обов’язково *)' : '(опціонально)'}
              </span>
            </div>

            {/* Швидкі пресети назв документів для мобільного */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DOC_NAMES[type].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDocName(preset);
                    if (errors.docName) setErrors({ ...errors, docName: '' });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                    docName === preset
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Назва документа {type === 'EXPENSE' && '*'}
              </label>
              <input
                type="text"
                placeholder="Напр.: Видаткова накладна, Платіжна інструкція, Акт..."
                value={docName}
                onChange={(e) => {
                  setDocName(e.target.value);
                  if (errors.docName) setErrors({ ...errors, docName: '' });
                }}
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                  errors.docName
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-blue-600'
                }`}
              />
              {errors.docName && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Номер документа {type === 'EXPENSE' && '*'}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Напр. 145 або ВН-12"
                  value={docNumber}
                  onChange={(e) => {
                    setDocNumber(e.target.value);
                    if (errors.docNumber) setErrors({ ...errors, docNumber: '' });
                  }}
                  className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                    errors.docNumber
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                {errors.docNumber && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Дата документа {type === 'EXPENSE' && '*'}
                  </span>
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => {
                    setDocDate(e.target.value);
                    if (errors.docDate) setErrors({ ...errors, docDate: '' });
                  }}
                  className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                    errors.docDate
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                {errors.docDate && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docDate}</p>
                )}
              </div>
            </div>
          </div>

          {/* Деталі операції / Контрагент */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Примітка / Контрагент / Зміст операції
            </label>
            <input
              type="text"
              placeholder="Напр.: Оплата від ТОВ «Альфа» або Закупівля матеріалів..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Кнопки дій */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-2 py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{editingTransaction ? 'Зберегти зміни' : 'Записати в Книгу'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
