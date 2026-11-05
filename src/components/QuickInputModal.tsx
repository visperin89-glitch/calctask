import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
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
  ATTORNEY_EXPENSE_TEMPLATES,
  type AttorneyExpenseTemplate,
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
  presetAttorneyTemplate?: AttorneyExpenseTemplate | null;
  defaultDate?: string;
  onSaved?: () => void;
}

export const QuickInputModal: React.FC<QuickInputModalProps> = ({
  isOpen,
  onClose,
  profile,
  editingTransaction,
  presetAttorneyTemplate,
  defaultDate,
  onSaved,
}) => {
  const todayIso = defaultDate || new Date().toISOString().slice(0, 10);

  const [type, setType] = useState<TransactionType>('INCOME');
  const [date, setDate] = useState<string>(todayIso);
  const [amountStr, setAmountStr] = useState<string>('');
  const [docName, setDocName] = useState<string>('Банківська виписка (гонорар)');
  const [docNumber, setDocNumber] = useState<string>('');
  const [docDate, setDocDate] = useState<string>(todayIso);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('col_9');
  const [selectedAttorneyTemplateId, setSelectedAttorneyTemplateId] = useState<string>('');
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
      setExpenseCategory(editingTransaction.expenseCategory || 'col_9');
      setSelectedAttorneyTemplateId('');
      setNote(editingTransaction.note || '');
      setErrors({});
    } else if (presetAttorneyTemplate) {
      const initDate = defaultDate || new Date().toISOString().slice(0, 10);
      setType('EXPENSE');
      setDate(initDate);
      setAmountStr('');
      setDocName(presetAttorneyTemplate.defaultDocName);
      setDocNumber('');
      setDocDate(initDate);
      setExpenseCategory(presetAttorneyTemplate.category);
      setSelectedAttorneyTemplateId(presetAttorneyTemplate.id);
      setNote(presetAttorneyTemplate.fullText);
      setErrors({});
    } else {
      const initDate = defaultDate || new Date().toISOString().slice(0, 10);
      setType('INCOME');
      setDate(initDate);
      setAmountStr('');
      setDocName(QUICK_DOC_NAMES.INCOME[0]);
      setDocNumber('');
      setDocDate(initDate);
      setExpenseCategory('col_9');
      setSelectedAttorneyTemplateId('');
      setNote('');
      setErrors({});
    }
  }, [editingTransaction, presetAttorneyTemplate, defaultDate, isOpen]);

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
    if (docDate === date || !docDate) {
      setDocDate(newDate);
    }
  };

  const handleApplyAttorneyTemplate = (templateId: string) => {
    setSelectedAttorneyTemplateId(templateId);
    const tpl = ATTORNEY_EXPENSE_TEMPLATES.find((item) => item.id === templateId);
    if (!tpl) return;

    setExpenseCategory(tpl.category);
    setDocName(tpl.defaultDocName);
    setNote(tpl.fullText);
    setErrors((prev) => ({
      ...prev,
      expenseCategory: '',
      docName: '',
    }));
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/70 p-0 sm:p-4 overflow-y-auto print:hidden">
      <div className="w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Шапка модалки */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <PlusCircle className="w-5 h-5 text-sky-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold truncate">
              {editingTransaction ? 'Редагування операції' : 'Швидкий запис операції'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Закрити"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тіло форми (mobile-first, прокручується всередині модалки) */}
        <form onSubmit={handleSubmit} className="flex-1 p-3.5 sm:p-5 space-y-3.5 overflow-y-auto">
          {/* Індикатор ПДВ (п. 2 розд. II Порядку № 261) */}
          {profile.isVatPayer && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{VAT_PAYER_REMINDER_TEXT} (п. 2 розд. ІІ Порядку № 261)</span>
            </div>
          )}

          {/* Попередження про обмежені активи (пп. 177.4.6 ПКУ) */}
          {showRestrictedWarning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs font-semibold shadow-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{RESTRICTED_ASSET_WARNING_TEXT}</span>
            </div>
          )}

          {/* Вибір типу операції */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
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
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${activeStyle}`}
                  >
                    <span className="text-xs sm:text-sm font-bold">{info.shortLabel}</span>
                    <span className={`text-[10px] ${active ? 'text-white/85' : 'text-slate-500'}`}>
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
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
                  className={`w-full rounded-xl border px-3.5 py-2 text-base sm:text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 ${
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Дата запису (Графа 1) *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${
                  errors.date
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-blue-600'
                }`}
              />
              {errors.date && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.date}</p>}
            </div>
          </div>

          {/* Довідник витрат адвоката (ст. 178 ПКУ) + Категорія витрат (Графи 6–9) */}
          {type === 'EXPENSE' && (
            <div className="space-y-3">
              {/* Швидкий вибір статті витрат адвоката за ст. 178 ПКУ */}
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Швидкий вибір: Витрати адвоката (ст. 178 ПКУ)</span>
                </label>
                <select
                  value={selectedAttorneyTemplateId}
                  onChange={(e) => handleApplyAttorneyTemplate(e.target.value)}
                  className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="">— Оберіть типову статтю витрат адвоката (автозаповнення) —</option>
                  {ATTORNEY_EXPENSE_TEMPLATES.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      [{tpl.category === 'col_6' ? 'Гр. 6' : tpl.category === 'col_7' ? 'Гр. 7' : tpl.category === 'col_8' ? 'Гр. 8' : 'Гр. 9'}] {tpl.shortLabel}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] sm:text-[11px] text-indigo-800 leading-tight">
                  Автоматично підставляє відповідну Графу (6–9), назву первинного документа та нормативне формулювання витрати адвоката.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Категорія витрат (Графи 6–9 Форми № 261) *
                </label>
                <div className="grid grid-cols-1 gap-1.5">
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
                        className={`text-left p-2.5 rounded-xl border transition-all flex items-start gap-2 ${
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
                          <div className="text-xs font-bold text-slate-900">
                            {cat.shortTitle}
                          </div>
                          <div className="text-[10px] sm:text-[11px] text-slate-600 leading-tight mt-0.5">
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
            </div>
          )}

          {/* Блок реквізитів первинного документа */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Первинний документ {type === 'EXPENSE' ? '(Графа 5 — обов’язково *)' : '(опціонально)'}</span>
              </span>
            </div>

            {/* Швидкі пресети назв документів */}
            <div className="flex flex-wrap gap-1">
              {QUICK_DOC_NAMES[type].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setDocName(preset);
                    if (errors.docName) setErrors({ ...errors, docName: '' });
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
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
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Назва документа {type === 'EXPENSE' && '*'}
              </label>
              <input
                type="text"
                placeholder="Напр.: Платіжна інструкція, Акт надання послуг, Фіскальний чек..."
                value={docName}
                onChange={(e) => {
                  setDocName(e.target.value);
                  if (errors.docName) setErrors({ ...errors, docName: '' });
                }}
                className={`w-full rounded-xl border bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                  errors.docName
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 focus:ring-blue-600'
                }`}
              />
              {errors.docName && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docName}</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="w-3 h-3" /> Номер {type === 'EXPENSE' && '*'}
                  </span>
                </label>
                <input
                  type="text"
                  placeholder="Напр. 145"
                  value={docNumber}
                  onChange={(e) => {
                    setDocNumber(e.target.value);
                    if (errors.docNumber) setErrors({ ...errors, docNumber: '' });
                  }}
                  className={`w-full rounded-xl border bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 ${
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
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Дата док. {type === 'EXPENSE' && '*'}
                  </span>
                </label>
                <input
                  type="date"
                  value={docDate}
                  onChange={(e) => {
                    setDocDate(e.target.value);
                    if (errors.docDate) setErrors({ ...errors, docDate: '' });
                  }}
                  className={`w-full rounded-xl border bg-white px-2.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 ${
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
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Примітка / Зміст операції / Контрагент
            </label>
            <textarea
              rows={2}
              placeholder="Напр.: Орендна плата за користування приміщенням, яке є робочим місцем адвоката..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          {/* Кнопки дій */}
          <div className="flex items-center gap-2 pt-1 safe-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold shadow-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{editingTransaction ? 'Зберегти зміни' : 'Записати в Книгу'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
