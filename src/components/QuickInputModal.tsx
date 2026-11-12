import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Camera as CameraIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  Plus,
  PlusCircle,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ATTORNEY_EXPENSE_TEMPLATES,
  type AttorneyExpenseTemplate,
  DEFAULT_OPERATION_PRESETS,
  DOCUMENT_STATUS_OPTIONS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_MAP,
  QUICK_DOC_NAMES,
  RESTRICTED_ASSET_WARNING_TEXT,
  TRANSACTION_TYPE_LABELS,
  VAT_PAYER_REMINDER_TEXT,
} from '../constants/taxConstants';
import { db } from '../db/database';
import type {
  DocumentStatus,
  ExpenseCategory,
  QuickOperationPreset,
  TaxProfile,
  TaxTransaction,
  TransactionType,
} from '../types/tax';
import {
  captureOrPickReceiptPhoto,
  loadReceiptImageDataUrl,
  saveReceiptFromFile,
  triggerLightHaptic,
} from '../utils/nativeFeatures';
import { isNativeApp } from '../utils/nativePlatform';
import { hasRestrictedAssetKeywords, validateTransaction } from '../utils/validation';

interface QuickInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: TaxProfile;
  editingTransaction?: TaxTransaction | null;
  presetAttorneyTemplate?: AttorneyExpenseTemplate | null;
  presetType?: TransactionType | null;
  defaultDate?: string;
  onSaved?: () => void;
}

export const QuickInputModal: React.FC<QuickInputModalProps> = ({
  isOpen,
  onClose,
  profile,
  editingTransaction,
  presetAttorneyTemplate,
  presetType,
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
  const [docStatus, setDocStatus] = useState<DocumentStatus>('original');
  const [attachmentPath, setAttachmentPath] = useState<string | undefined>(undefined);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [isReceiptViewerOpen, setIsReceiptViewerOpen] = useState<boolean>(false);

  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('col_9');
  const [selectedAttorneyTemplateId, setSelectedAttorneyTemplateId] = useState<string>('');
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [isAttorneyDirectoryOpen, setIsAttorneyDirectoryOpen] = useState<boolean>(false);
  const [note, setNote] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const filePhotoInputRef = useRef<HTMLInputElement | null>(null);

  const quickPresets: QuickOperationPreset[] =
    Array.isArray(profile.customPresets) && profile.customPresets.length > 0
      ? profile.customPresets
      : DEFAULT_OPERATION_PRESETS;

  useEffect(() => {
    if (editingTransaction) {
      setType(editingTransaction.type);
      setDate(editingTransaction.date);
      setAmountStr(String(editingTransaction.amount));
      setDocName(editingTransaction.docName || '');
      setDocNumber(editingTransaction.docNumber || '');
      setDocDate(editingTransaction.docDate || editingTransaction.date);
      setDocStatus(editingTransaction.docStatus || 'original');
      setAttachmentPath(editingTransaction.attachmentPath);
      setExpenseCategory(editingTransaction.expenseCategory || 'col_9');
      setSelectedAttorneyTemplateId('');
      setActivePresetId('');
      setIsAttorneyDirectoryOpen(false);
      setNote(editingTransaction.note || '');
      setErrors({});

      if (editingTransaction.attachmentPath) {
        loadReceiptImageDataUrl(editingTransaction.attachmentPath)
          .then((url) => setAttachmentPreviewUrl(url))
          .catch(() => setAttachmentPreviewUrl(null));
      } else {
        setAttachmentPreviewUrl(null);
      }
    } else if (presetAttorneyTemplate) {
      const initDate = defaultDate || new Date().toISOString().slice(0, 10);
      setType('EXPENSE');
      setDate(initDate);
      setAmountStr('');
      setDocName(presetAttorneyTemplate.defaultDocName);
      setDocNumber('');
      setDocDate(initDate);
      setDocStatus('original');
      setAttachmentPath(undefined);
      setAttachmentPreviewUrl(null);
      setExpenseCategory(presetAttorneyTemplate.category);
      setSelectedAttorneyTemplateId(presetAttorneyTemplate.id);
      setActivePresetId('');
      setIsAttorneyDirectoryOpen(false);
      setNote(presetAttorneyTemplate.fullText);
      setErrors({});
    } else {
      const initDate = defaultDate || new Date().toISOString().slice(0, 10);
      const initType: TransactionType = presetType || 'INCOME';
      setType(initType);
      setDate(initDate);
      setAmountStr('');
      setDocName(QUICK_DOC_NAMES[initType][0]);
      setDocNumber('');
      setDocDate(initDate);
      setDocStatus('original');
      setAttachmentPath(undefined);
      setAttachmentPreviewUrl(null);
      setExpenseCategory('col_9');
      setSelectedAttorneyTemplateId('');
      setActivePresetId('');
      setIsAttorneyDirectoryOpen(false);
      setNote('');
      setErrors({});
    }
  }, [editingTransaction, presetAttorneyTemplate, presetType, defaultDate, isOpen]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setActivePresetId('');
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

  // Блок 4.1: Застосування швидкого пресету повторюваної операції
  const handleApplyQuickPreset = async (preset: QuickOperationPreset) => {
    setActivePresetId(preset.id);
    setType(preset.type || 'EXPENSE');
    setExpenseCategory(preset.category);
    setDocName(preset.defaultDocName);
    setNote(preset.defaultNote);
    setErrors((prev) => ({
      ...prev,
      expenseCategory: '',
      docName: '',
    }));
    await triggerLightHaptic();
  };

  const handleApplyAttorneyTemplate = async (tpl: AttorneyExpenseTemplate) => {
    setSelectedAttorneyTemplateId(tpl.id);
    setExpenseCategory(tpl.category);
    setDocName(tpl.defaultDocName);
    setNote(tpl.fullText);
    setIsAttorneyDirectoryOpen(false);
    setErrors((prev) => ({
      ...prev,
      expenseCategory: '',
      docName: '',
    }));
    await triggerLightHaptic();
  };

  // Блок 3.1: Фотофіксація чека / первинного документа
  const handleCaptureReceipt = async (sourceMode: 'CAMERA' | 'PHOTOS') => {
    if (!isNativeApp() && sourceMode === 'PHOTOS') {
      filePhotoInputRef.current?.click();
      return;
    }
    try {
      const res = await captureOrPickReceiptPhoto(sourceMode);
      setAttachmentPath(res.attachmentPath);
      setAttachmentPreviewUrl(res.previewDataUrl);
    } catch {
      // Fallback до системного вибору файлу/камери у WebView
      filePhotoInputRef.current?.click();
    }
  };

  const handleFilePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await saveReceiptFromFile(file);
      setAttachmentPath(res.attachmentPath);
      setAttachmentPreviewUrl(res.previewDataUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не вдалося прикріпити зображення.');
    } finally {
      if (filePhotoInputRef.current) {
        filePhotoInputRef.current.value = '';
      }
    }
  };

  const showRestrictedWarning = hasRestrictedAssetKeywords(note, docName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedAmount = parseFloat(amountStr.replace(',', '.'));
    const [yearPart, monthPart] = (date || '').split('-');

    const candidate: Partial<TaxTransaction> = {
      date,
      year: Number(yearPart) || new Date().getFullYear(),
      month: Number(monthPart) || 1,
      type,
      amount: normalizedAmount,
      docName: docName.trim(),
      docNumber: docNumber.trim(),
      docDate: docDate || date,
      docStatus,
      attachmentPath,
      expenseCategory: type === 'EXPENSE' ? expenseCategory : undefined,
      category: type === 'EXPENSE' ? expenseCategory : '',
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
      await triggerLightHaptic();
      onSaved?.();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4 overflow-y-auto print:hidden animate-fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[92dvh] flex flex-col animate-slide-up sm:animate-scale-in">
        {/* Шапка модалки */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <PlusCircle className="w-5 h-5 text-sky-400 shrink-0" />
            <h2 className="text-sm sm:text-base font-bold truncate">
              {editingTransaction ? 'Редагування операції' : 'Швидкий запис операцій'}
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

        {/* Тіло форми */}
        <form onSubmit={handleSubmit} className="flex-1 p-3.5 sm:p-5 space-y-3.5 overflow-y-auto">
          {/* БЛОК 4.1: Горизонтальна стрічка швидких пресетів повторюваних операцій */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Швидкі шаблони операцій (пресети)</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
              {quickPresets.map((preset) => {
                const isSelected = activePresetId === preset.id;
                const catInfo = EXPENSE_CATEGORY_MAP[preset.category];
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyQuickPreset(preset)}
                    className={`shrink-0 px-3 py-1.5 rounded-xl border text-left transition-all duration-150 active:scale-[0.97] flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900/90 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span className="text-xs font-bold whitespace-nowrap">{preset.title}</span>
                    {catInfo && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Гр.{catInfo.colNumber}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Індикатор ПДВ (п. 2 розд. II Порядку № 261) */}
          {profile.isVatPayer && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-medium">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{VAT_PAYER_REMINDER_TEXT} (п. 2 розд. ІІ Порядку № 261)</span>
            </div>
          )}

          {/* Попередження про обмежені активи (пп. 177.4.6 ПКУ) */}
          {showRestrictedWarning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 text-xs font-semibold shadow-xs">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{RESTRICTED_ASSET_WARNING_TEXT}</span>
            </div>
          )}

          {/* Вибір типу операції */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Тип операції
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['INCOME', 'EXPENSE', 'RETURN'] as TransactionType[]).map((t) => {
                const active = type === t;
                const info = TRANSACTION_TYPE_LABELS[t];
                let activeStyle =
                  'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700';
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
                    className={`py-2 px-1.5 rounded-xl border text-center transition-all duration-200 active:scale-[0.98] flex flex-col items-center justify-center ${activeStyle}`}
                  >
                    <span className="text-xs sm:text-sm font-bold">{info.shortLabel}</span>
                    <span
                      className={`text-[10px] ${
                        active ? 'text-white/85' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
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
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
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
                  className={`w-full rounded-xl border px-3.5 py-2 text-base sm:text-lg font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 ${
                    errors.amount
                      ? 'border-rose-500 focus:ring-rose-500 bg-rose-50/40'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                  autoFocus
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                  UAH
                </span>
              </div>
              {errors.amount && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.amount}</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                Дата запису (Графа 1) *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => handleDateChange(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2 text-sm font-medium text-slate-900 dark:text-white bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 ${
                  errors.date
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                }`}
              />
              {errors.date && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.date}</p>}
            </div>
          </div>

          {/* Довідник дозволених витрат адвоката (ст. 178 ПКУ) + Категорія витрат (Графи 6–9) */}
          {type === 'EXPENSE' && (
            <div className="space-y-3 animate-fade-in">
              {/* Розгортаємий акордеон: Довідник дозволених витрат адвоката */}
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/30 overflow-hidden transition-all duration-200">
                <button
                  type="button"
                  onClick={() => setIsAttorneyDirectoryOpen((prev) => !prev)}
                  className="w-full px-3.5 py-3 flex items-center justify-between gap-2.5 text-left hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-xl bg-indigo-600 text-white shrink-0 mt-0.5">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-extrabold text-indigo-950 dark:text-indigo-200 leading-snug">
                        Довідник дозволених витрат адвоката
                      </div>
                      <div className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-0.5 leading-snug">
                        Стаття 178 ПКУ (17 нормативних статей витрат із автозаповненням)
                      </div>
                    </div>
                  </div>
                  <span className="p-1.5 rounded-xl bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shrink-0">
                    {isAttorneyDirectoryOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {isAttorneyDirectoryOpen && (
                  <div className="p-3 bg-white dark:bg-slate-900 border-t border-indigo-200 dark:border-indigo-800/70 divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto animate-fade-in">
                    {ATTORNEY_EXPENSE_TEMPLATES.map((item, idx) => {
                      const catInfo = EXPENSE_CATEGORY_MAP[item.category];
                      const isSelected = selectedAttorneyTemplateId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`py-2.5 first:pt-0 last:pb-0 flex flex-col gap-2 ${
                            isSelected
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/40 -mx-2 px-2 rounded-xl'
                              : ''
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                {idx + 1}. {item.shortLabel}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catInfo.badgeColor}`}
                              >
                                Графа {catInfo.colNumber}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                              {item.fullText}
                            </p>
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleApplyAttorneyTemplate(item)}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Обрати статтю</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
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
                        className={`text-left p-2.5 rounded-xl border transition-all duration-200 flex items-start gap-2 ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50 ring-1 ring-blue-600'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : 'border-slate-400'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {cat.shortTitle}
                          </div>
                          <div className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-400 leading-tight mt-0.5">
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

          {/* Блок реквізитів первинного документа + Статус первинки (Блок 2.3) + Фотофіксація (Блок 3.1) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  Первинний документ {type === 'EXPENSE' ? '(Графа 5 — обов’язково *)' : '(опціонально)'}
                </span>
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
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
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
                className={`w-full rounded-xl border bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                  errors.docName
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                }`}
              />
              {errors.docName && (
                <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docName}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
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
                  className={`w-full rounded-xl border bg-white dark:bg-slate-800 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    errors.docNumber
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                />
                {errors.docNumber && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
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
                  className={`w-full rounded-xl border bg-white dark:bg-slate-800 px-2.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 ${
                    errors.docDate
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-blue-600'
                  }`}
                />
                {errors.docDate && (
                  <p className="mt-1 text-xs text-rose-600 font-medium">{errors.docDate}</p>
                )}
              </div>
            </div>

            {/* БЛОК 2.3: Контроль наявності первинних документів */}
            <div className="pt-1 border-t border-slate-200/80 dark:border-slate-700/70">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Статус первинного документа</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {DOCUMENT_STATUS_OPTIONS.map((opt) => {
                  const selected = docStatus === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDocStatus(opt.id)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                        selected
                          ? `${opt.badgeClass} ring-2 ring-blue-500/60`
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* БЛОК 3.1: Фотофіксація первинних документів (Камера / Галерея) */}
            <div className="pt-1 border-t border-slate-200/80 dark:border-slate-700/70 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  <CameraIcon className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                  <span>Прикріпити фото чека / документа</span>
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCaptureReceipt('CAMERA')}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs"
                  >
                    <CameraIcon className="w-3.5 h-3.5" />
                    <span>Зробити фото</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureReceipt('PHOTOS')}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-500" />
                    <span>З галереї</span>
                  </button>
                  <input
                    ref={filePhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFilePhotoSelected}
                    className="hidden"
                  />
                </div>
              </div>

              {attachmentPath && (
                <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800/80">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {attachmentPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => setIsReceiptViewerOpen(true)}
                        className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0"
                      >
                        <img
                          src={attachmentPreviewUrl}
                          alt="Фото документа"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 truncate">
                        Фото чека / документа прикріплено
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        Локальне сховище: {attachmentPath}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {attachmentPreviewUrl && (
                      <button
                        type="button"
                        onClick={() => setIsReceiptViewerOpen(true)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        Переглянути
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentPath(undefined);
                        setAttachmentPreviewUrl(null);
                      }}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50"
                      title="Видалити фото"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Деталі операції / Контрагент */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
              Примітка / Зміст операції / Контрагент
            </label>
            <textarea
              rows={2}
              placeholder="Напр.: Орендна плата за користування приміщенням, яке є робочим місцем адвоката..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            />
          </div>

          {/* Кнопки дій */}
          <div className="flex items-center gap-2 pt-1 safe-bottom">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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

      {/* Повноекранний перегляд фото чека */}
      {isReceiptViewerOpen && attachmentPreviewUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsReceiptViewerOpen(false)}
        >
          <div
            className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 text-white">
              <span className="text-xs font-bold">Фото первинного документа ({docName})</span>
              <button
                type="button"
                onClick={() => setIsReceiptViewerOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 flex items-center justify-center max-h-[80dvh] overflow-auto">
              <img
                src={attachmentPreviewUrl}
                alt="Первинний документ"
                className="max-w-full max-h-[75dvh] rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
