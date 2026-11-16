import React, { useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CheckSquare,
  FileSpreadsheet,
  Sparkles,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { EXPENSE_CATEGORIES } from '../constants/taxConstants';
import { db } from '../db/database';
import type { ExpenseCategory, TransactionType } from '../types/tax';
import {
  type BankStatementFormat,
  buildTransactionsFromStatementRows,
  convertPreviewRowsToTaxTransactions,
  type ParsedBankStatementRow,
  type ParsedStatementColumnMapping,
  parseRawBankStatementFile,
  type RawStatementSheet,
} from '../utils/bankStatementParser';
import { formatCurrency, formatDateUA, roundCurrency } from '../utils/calculations';
import { triggerLightHaptic } from '../utils/nativeFeatures';

interface BankStatementImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedYear: number;
  onImported?: (count: number) => void;
}

const FORMAT_LABELS: Record<BankStatementFormat, string> = {
  PRIVATBANK: 'ПриватБанк (Приват24 для бізнесу)',
  MONOBANK: 'Монобанк (ФОП виписка)',
  UNIVERSAL: 'Універсальний шаблон (вибір колонок)',
};

export const BankStatementImportModal: React.FC<BankStatementImportModalProps> = ({
  isOpen,
  onClose,
  selectedYear,
  onImported,
}) => {
  const [rawSheet, setRawSheet] = useState<RawStatementSheet | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<BankStatementFormat>('UNIVERSAL');
  const [mapping, setMapping] = useState<ParsedStatementColumnMapping>({
    dateCol: 0,
    amountCol: 1,
    descriptionCol: 2,
    counterpartyCol: 3,
    docNumberCol: 4,
  });
  const [previewRows, setPreviewRows] = useState<ParsedBankStatementRow[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const applySheetAndMapping = (
    sheet: RawStatementSheet,
    nextMapping: ParsedStatementColumnMapping
  ) => {
    setRawSheet(sheet);
    setMapping(nextMapping);
    const parsed = buildTransactionsFromStatementRows(sheet, nextMapping, selectedYear);
    setPreviewRows(parsed);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const sheet = await parseRawBankStatementFile(file);
      setSelectedFormat(sheet.detectedFormat);
      applySheetAndMapping(sheet, sheet.suggestedMapping);
      await triggerLightHaptic();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не вдалося розпізнати файл виписки.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadSampleStatement = async () => {
    setErrorMsg(null);
    const sampleSheet: RawStatementSheet = {
      headers: [
        'Дата операції',
        'Сума у валюті рахунку',
        'Призначення платежу',
        'Контрагент',
        'Номер документа',
      ],
      rows: [
        [
          `14.03.${selectedYear}`,
          '42500.00',
          'Оплата за правничу допомогу згідно з договором № 12/03',
          'ТОВ «Агро-Інвест Плюс»',
          'ПІ-401',
        ],
        [
          `15.03.${selectedYear}`,
          '-5280.00',
          'Сплата ЄСВ (22%) за І квартал на рахунок ГУ ДПС',
          'ГУ ДПС / Казначейство',
          'КВ-918',
        ],
        [
          `18.03.${selectedYear}`,
          '-11500.00',
          'Орендна плата за користування офісним приміщенням (робочим місцем)',
          'ФОП Бондаренко І.В.',
          'АКТ-33',
        ],
        [
          `21.03.${selectedYear}`,
          '-960.50',
          'Придбання офісного паперу А4, папок та канцелярського приладдя',
          'ТОВ «Офіс-Сервіс»',
          'ВН-782',
        ],
        [
          `22.03.${selectedYear}`,
          '-150.00',
          'Комісія за розрахунково-касове обслуговування рахунку (РКО)',
          'АТ КБ «ПриватБанк»',
          'РКО-03',
        ],
      ],
      detectedFormat: 'PRIVATBANK',
      suggestedMapping: {
        dateCol: 0,
        amountCol: 1,
        descriptionCol: 2,
        counterpartyCol: 3,
        docNumberCol: 4,
      },
    };
    setSelectedFormat('PRIVATBANK');
    applySheetAndMapping(sampleSheet, sampleSheet.suggestedMapping);
    await triggerLightHaptic();
  };

  const handleMappingChange = (field: keyof ParsedStatementColumnMapping, colIdx: number) => {
    if (!rawSheet) return;
    const next = { ...mapping, [field]: colIdx };
    applySheetAndMapping(rawSheet, next);
  };

  const toggleRowSelection = (rowIndex: number) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, selected: !r.selected } : r))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = previewRows.every((r) => r.selected);
    setPreviewRows((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const updateRowType = (rowIndex: number, newType: TransactionType) => {
    setPreviewRows((prev) =>
      prev.map((r) =>
        r.rowIndex === rowIndex
          ? {
              ...r,
              type: newType,
              expenseCategory:
                newType === 'EXPENSE' ? r.expenseCategory || 'col_9' : undefined,
            }
          : r
      )
    );
  };

  const updateRowCategory = (rowIndex: number, cat: ExpenseCategory) => {
    setPreviewRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, expenseCategory: cat } : r))
    );
  };

  const selectedRows = previewRows.filter((r) => r.selected);
  const totalIncome = roundCurrency(
    selectedRows.filter((r) => r.type === 'INCOME').reduce((s, r) => s + r.amount, 0)
  );
  const totalExpense = roundCurrency(
    selectedRows.filter((r) => r.type === 'EXPENSE').reduce((s, r) => s + r.amount, 0)
  );

  const handleConfirmImport = async () => {
    const txsToInsert = convertPreviewRowsToTaxTransactions(previewRows);
    if (txsToInsert.length === 0) return;

    setIsImporting(true);
    try {
      await db.transactions.bulkAdd(txsToInsert);
      await triggerLightHaptic();
      onImported?.(txsToInsert.length);
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4 safe-x overflow-y-auto print:hidden animate-fade-in">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[85dvh] flex flex-col animate-slide-up sm:animate-scale-in">
        {/* Шапка */}
        <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold truncate">
                Розумний парсер банківських виписок (CSV / XLSX)
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                ПриватБанк • Монобанк • Універсальний шаблон із автокласифікацією граф № 261
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Блок вибору файлу */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700">
            <div className="space-y-1">
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Оберіть файл банківської виписки (.csv або .xlsx)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Додатні суми автоматично класифікуються як «Дохід (Гр. 4)», від’ємні — як «Витрата (Гр. 6–9)»
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleLoadSampleStatement}
                className="px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold hover:bg-indigo-100 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Тестовий приклад</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Обрати CSV / XLSX</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-200">
              {errorMsg}
            </div>
          )}

          {rawSheet && (
            <>
              {/* Вибір шаблону та налаштування колонок */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Шаблон розпізнавання: {FORMAT_LABELS[selectedFormat]}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['PRIVATBANK', 'MONOBANK', 'UNIVERSAL'] as BankStatementFormat[]).map(
                      (fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setSelectedFormat(fmt)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                            selectedFormat === fmt
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {fmt === 'PRIVATBANK'
                            ? 'ПриватБанк'
                            : fmt === 'MONOBANK'
                            ? 'Монобанк'
                            : 'Універсальний'}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Налаштування відповідності колонок */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Колонка «Дата»
                    </label>
                    <select
                      value={mapping.dateCol}
                      onChange={(e) => handleMappingChange('dateCol', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      {rawSheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Колонка «Сума»
                    </label>
                    <select
                      value={mapping.amountCol}
                      onChange={(e) => handleMappingChange('amountCol', Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      {rawSheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Призначення платежу
                    </label>
                    <select
                      value={mapping.descriptionCol}
                      onChange={(e) =>
                        handleMappingChange('descriptionCol', Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      <option value={-1}>— Не обрано —</option>
                      {rawSheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      Контрагент
                    </label>
                    <select
                      value={mapping.counterpartyCol}
                      onChange={(e) =>
                        handleMappingChange('counterpartyCol', Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      <option value={-1}>— Не обрано —</option>
                      {rawSheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
                      № документа
                    </label>
                    <select
                      value={mapping.docNumberCol}
                      onChange={(e) =>
                        handleMappingChange('docNumberCol', Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                    >
                      <option value={-1}>— Авто —</option>
                      {rawSheet.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Зведення попереднього перегляду */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                <div className="min-w-0 p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 truncate">
                    Обрано записів
                  </div>
                  <div className="text-sm xs:text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                    {selectedRows.length} з {previewRows.length}
                  </div>
                </div>
                <div className="min-w-0 p-2.5 sm:p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70">
                  <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400 flex items-center gap-1 min-w-0">
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Доходи (Гр. 4)</span>
                  </div>
                  <div className="text-sm xs:text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 truncate">
                    +{formatCurrency(totalIncome)} ₴
                  </div>
                </div>
                <div className="min-w-0 p-2.5 sm:p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70">
                  <div className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400 flex items-center gap-1 min-w-0">
                    <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Витрати (Гр. 6–9)</span>
                  </div>
                  <div className="text-sm xs:text-base sm:text-lg font-bold text-rose-700 dark:text-rose-300 mt-0.5 truncate">
                    −{formatCurrency(totalExpense)} ₴
                  </div>
                </div>
              </div>

              {/* Список рядків попереднього перегляду */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-900 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="inline-flex items-center gap-1.5 hover:text-blue-600"
                  >
                    {previewRows.length > 0 && previewRows.every((r) => r.selected) ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Виділити / зняти всі операції</span>
                  </button>
                  <span>Перевірте класифікацію перед записом</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 p-2.5 max-h-[45dvh] overflow-y-auto bg-slate-50/40 dark:bg-slate-900/30">
                  {previewRows.map((row) => (
                    <div
                      key={row.rowIndex}
                      className={`p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row lg:flex-col sm:items-center lg:items-stretch justify-between gap-2.5 text-xs ${
                        row.selected
                          ? 'bg-white dark:bg-slate-800'
                          : 'bg-slate-50/60 dark:bg-slate-900/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleRowSelection(row.rowIndex)}
                          className="mt-0.5 text-blue-600 shrink-0"
                        >
                          {row.selected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded-md">
                              {formatDateUA(row.date)}
                            </span>
                            <span
                              className={`font-extrabold ${
                                row.type === 'INCOME'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : row.type === 'RETURN'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {row.type === 'INCOME' ? '+' : '−'}
                              {formatCurrency(row.amount)} ₴
                            </span>
                            {row.counterparty && (
                              <span className="text-slate-500 dark:text-slate-400 break-words">
                                • {row.counterparty}
                              </span>
                            )}
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 line-clamp-2 break-words">
                            {row.description}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <select
                          value={row.type}
                          onChange={(e) =>
                            updateRowType(row.rowIndex, e.target.value as TransactionType)
                          }
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-[11px] font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="INCOME">Дохід (Гр. 4)</option>
                          <option value="EXPENSE">Витрата (Гр. 6–9)</option>
                          <option value="RETURN">Повернення (Гр. 3)</option>
                        </select>

                        {row.type === 'EXPENSE' && (
                          <select
                            value={row.expenseCategory || 'col_9'}
                            onChange={(e) =>
                              updateRowCategory(
                                row.rowIndex,
                                e.target.value as ExpenseCategory
                              )
                            }
                            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-800 dark:text-slate-200 max-w-full sm:max-w-xs"
                          >
                            {EXPENSE_CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                Гр. {c.colNumber} ({c.shortTitle.split('—')[1]?.trim() || c.shortTitle})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Нижня панель дій */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 shrink-0 ime-safe-bottom">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Скасувати
          </button>

          <button
            type="button"
            disabled={selectedRows.length === 0 || isImporting}
            onClick={handleConfirmImport}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-2 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>
              {isImporting
                ? 'Імпортування...'
                : `Підтвердити та записати (${selectedRows.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
