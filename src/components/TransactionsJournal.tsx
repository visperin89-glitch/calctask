import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Copy,
  Edit3,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Filter,
  Image as ImageIcon,
  RotateCcw,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  DOCUMENT_STATUS_MAP,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_MAP,
  TRANSACTION_TYPE_LABELS,
  UKRAINIAN_MONTHS,
} from '../constants/taxConstants';
import { db } from '../db/database';
import type {
  ExpenseCategory,
  TaxTransaction,
  TransactionType,
} from '../types/tax';
import {
  formatCurrency,
  formatDateUA,
  formatExpenseDocumentRef,
  roundCurrency,
} from '../utils/calculations';
import {
  loadReceiptImageDataUrl,
  triggerLightHaptic,
  triggerWarningHaptic,
} from '../utils/nativeFeatures';
import { hasRestrictedAssetKeywords } from '../utils/validation';

interface TransactionsJournalProps {
  transactions: TaxTransaction[];
  selectedYear: number;
  onAddReturnClick?: () => void;
  onEditTransaction: (tx: TaxTransaction) => void;
  onOpenBankImport?: () => void;
}

export const TransactionsJournal: React.FC<TransactionsJournalProps> = ({
  transactions,
  selectedYear,
  onAddReturnClick,
  onEditTransaction,
  onOpenBankImport,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<TransactionType | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'ALL'>('ALL');
  const [onlyUnconfirmed, setOnlyUnconfirmed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Стан для свайп-дій (ID відкритої картки та напрямок: 'LEFT' = видалення, 'RIGHT' = дублювання/редагування)
  const [swipedState, setSwipedState] = useState<{
    id: number;
    dir: 'LEFT' | 'RIGHT';
  } | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; id: number } | null>(null);

  // Стан для перегляду прикріпленого фото чека у картці операції
  const [viewingReceipt, setViewingReceipt] = useState<{
    tx: TaxTransaction;
    dataUrl: string;
  } | null>(null);

  const unconfirmedCountInYear = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    return transactions.filter(
      (tx) =>
        tx.date?.startsWith(yearPrefix) &&
        (tx.docStatus === 'pending_counterparty' ||
          (tx.type === 'EXPENSE' && (!tx.docName || !tx.docNumber)))
    ).length;
  }, [transactions, selectedYear]);

  const filteredTransactions = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    const query = searchQuery.trim().toLowerCase();

    return transactions
      .filter((tx) => {
        if (!tx.date || !tx.date.startsWith(yearPrefix)) return false;

        if (selectedMonth !== 'ALL') {
          const monthNum = tx.month || Number(tx.date.split('-')[1]);
          if (monthNum !== selectedMonth) return false;
        }

        if (selectedType !== 'ALL' && tx.type !== selectedType) {
          return false;
        }

        if (selectedCategory !== 'ALL') {
          if (tx.type !== 'EXPENSE' || tx.expenseCategory !== selectedCategory) {
            return false;
          }
        }

        if (onlyUnconfirmed) {
          const isUnconfirmed =
            tx.docStatus === 'pending_counterparty' ||
            (tx.type === 'EXPENSE' && (!tx.docName || !tx.docNumber));
          if (!isUnconfirmed) return false;
        }

        if (query) {
          const haystack = [
            tx.docName,
            tx.docNumber,
            tx.note,
            tx.date,
            formatDateUA(tx.date),
            String(tx.amount),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [
    transactions,
    selectedYear,
    selectedMonth,
    selectedType,
    selectedCategory,
    onlyUnconfirmed,
    searchQuery,
  ]);

  const summary = useMemo(() => {
    let income = 0;
    let returns = 0;
    let expenses = 0;
    for (const tx of filteredTransactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === 'INCOME') income = roundCurrency(income + amt);
      else if (tx.type === 'RETURN') returns = roundCurrency(returns + amt);
      else if (tx.type === 'EXPENSE') expenses = roundCurrency(expenses + amt);
    }
    const netIncome = roundCurrency(income - returns);
    const netProfit = roundCurrency(netIncome - expenses);
    return { income, returns, netIncome, expenses, netProfit };
  }, [filteredTransactions]);

  // Блок 1.2: Віртуалізація списку транзакцій через @tanstack/react-virtual
  const parentScrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredTransactions.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 136,
    overscan: 8,
  });

  const handleDelete = async (tx: TaxTransaction) => {
    if (!tx.id) return;
    await triggerWarningHaptic();
    const confirmed = window.confirm(
      `Видалити операцію від ${formatDateUA(tx.date)} на суму ${formatCurrency(tx.amount)} грн?`
    );
    if (confirmed) {
      await db.transactions.delete(tx.id);
      setSwipedState(null);
    }
  };

  // Блок 4.2: Швидке дублювання операції з поточною датою (Свайп вправо)
  const handleDuplicateToday = async (tx: TaxTransaction) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [yrStr, moStr] = todayIso.split('-');
    const duplicateRecord: TaxTransaction = {
      ...tx,
      id: undefined,
      date: todayIso,
      docDate: todayIso,
      year: Number(yrStr) || selectedYear,
      month: Number(moStr) || 1,
      createdAt: Date.now(),
    };
    await db.transactions.add(duplicateRecord);
    await triggerLightHaptic();
    setSwipedState(null);
  };

  const handleViewReceipt = async (tx: TaxTransaction) => {
    if (!tx.attachmentPath) return;
    const dataUrl = await loadReceiptImageDataUrl(tx.attachmentPath);
    if (dataUrl) {
      setViewingReceipt({ tx, dataUrl });
    } else {
      alert('Локальний файл фото чека не знайдено на пристрої.');
    }
  };

  const handleTouchStart = (e: React.TouchEvent, id?: number) => {
    if (!id) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, id };
  };

  const handleTouchEnd = (e: React.TouchEvent, id?: number) => {
    if (!id || !touchStartRef.current || touchStartRef.current.id !== id) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);

    // Якщо горизонтальний свайп домінує над вертикальним скролом
    if (Math.abs(dx) > 55 && dy < 45) {
      if (dx < 0) {
        // Свайп вліво -> кнопка видалення
        setSwipedState({ id, dir: 'LEFT' });
        triggerLightHaptic();
      } else {
        // Свайп вправо -> швидке дублювання або редагування
        setSwipedState({ id, dir: 'RIGHT' });
        triggerLightHaptic();
      }
    }
    touchStartRef.current = null;
  };

  const resetFilters = () => {
    setSelectedMonth('ALL');
    setSelectedType('ALL');
    setSelectedCategory('ALL');
    setOnlyUnconfirmed(false);
    setSearchQuery('');
  };

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-3.5 sm:gap-5 w-full animate-fade-in">
      {/* Ліва панель: зведені картки аналітики та фільтри (фіксована ширина на lg+) */}
      <div className="w-full lg:w-[360px] xl:w-[400px] shrink-0 space-y-3.5 lg:sticky lg:top-20">
        {/* Зведені картки аналітики (4 картки: ДОХІД, ВИТРАТИ, ЧИСТИЙ ДОХІД, ПОВЕРНЕННЯ) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-2.5 sm:gap-3">
        {/* 1. ДОХІД (ГР. 4) */}
        <div className="min-w-0 bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700/80 shadow-xs transition-all duration-200 active:scale-[0.98]">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span className="truncate">ДОХІД (ГР. 4)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-base xs:text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
            {formatCurrency(summary.netIncome)}{' '}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
            До декларування (Гр. 2 − Гр. 3)
          </div>
        </div>

        {/* 2. ВИТРАТИ (ГР. 6–9) */}
        <div className="min-w-0 bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700/80 shadow-xs transition-all duration-200 active:scale-[0.98]">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span className="truncate">ВИТРАТИ (ГР. 6–9)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
              <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-base xs:text-lg sm:text-xl font-bold text-rose-700 dark:text-rose-400 truncate">
            {formatCurrency(summary.expenses)}{' '}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
            За первинними док.
          </div>
        </div>

        {/* 3. ЧИСТИЙ ДОХІД */}
        <div className="min-w-0 bg-white dark:bg-slate-800 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700/80 shadow-xs transition-all duration-200 active:scale-[0.98]">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span className="truncate">ЧИСТИЙ ДОХІД</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div
            className={`mt-1.5 sm:mt-2 text-base xs:text-lg sm:text-xl font-bold truncate ${
              summary.netProfit >= 0
                ? 'text-blue-700 dark:text-sky-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatCurrency(summary.netProfit)}{' '}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Записів: {filteredTransactions.length}
          </div>
        </div>

        {/* 4. ПОВЕРНЕННЯ (Графа 3 Типової форми № 261) */}
        <button
          type="button"
          onClick={() => {
            if (onAddReturnClick) {
              onAddReturnClick();
            } else {
              setSelectedType((prev) => (prev === 'RETURN' ? 'ALL' : 'RETURN'));
            }
          }}
          className="min-w-0 text-left bg-white dark:bg-slate-800 hover:border-amber-400 dark:hover:border-amber-500/60 rounded-2xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700/80 shadow-xs transition-all duration-200 active:scale-[0.98]"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span className="truncate">ПОВЕРНЕННЯ</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
              <Undo2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-base xs:text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 truncate">
            {formatCurrency(summary.returns)}{' '}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium truncate">
            Повернуті кошти (Гр. 3)
          </div>
        </button>
      </div>

      {/* Панель фільтрів, контролю первинки та імпорту банківської виписки */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-3 transition-colors duration-200">
        <div className="flex flex-col md:flex-row lg:flex-col gap-2.5 sm:gap-3">
          {/* Пошук за документом / приміткою */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук за назвою або № документа, контрагентом, сумою..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Фільтр за місяцем */}
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <select
              value={selectedMonth}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMonth(val === 'ALL' ? 'ALL' : Number(val));
              }}
              className="w-full md:w-auto lg:w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Усі місяці ({selectedYear})</option>
              {UKRAINIAN_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.name} {selectedYear}
                </option>
              ))}
            </select>
          </div>

          {/* Фільтр за типом операції */}
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <select
              value={selectedType}
              onChange={(e) => {
                const val = e.target.value as TransactionType | 'ALL';
                setSelectedType(val);
                if (val !== 'ALL' && val !== 'EXPENSE') {
                  setSelectedCategory('ALL');
                }
              }}
              className="w-full md:w-auto lg:w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Усі типи операцій</option>
              <option value="INCOME">Доходи (Графа 2)</option>
              <option value="EXPENSE">Витрати (Графи 6–9)</option>
              <option value="RETURN">Повернення (Графа 3)</option>
            </select>
          </div>

          {/* Фільтр за категорією витрат */}
          {(selectedType === 'ALL' || selectedType === 'EXPENSE') && (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ExpenseCategory | 'ALL')}
              className="w-full md:w-auto lg:w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Усі категорії витрат (Гр. 6–9)</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.shortTitle}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Другий ряд панелі фільтрів: «Без підтвердження» + «Імпорт виписки з банку» + Підказка свайпів */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex flex-wrap items-center gap-2">
            {/* Блок 2.3: Перемикач «Без підтвердження» */}
            <button
              type="button"
              onClick={() => setOnlyUnconfirmed((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all active:scale-[0.98] ${
                onlyUnconfirmed
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/80 hover:bg-amber-100'
              }`}
            >
              <FileWarning className="w-3.5 h-3.5 shrink-0" />
              <span>Без підтвердження</span>
              {unconfirmedCountInYear > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    onlyUnconfirmed
                      ? 'bg-white text-amber-800'
                      : 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  {unconfirmedCountInYear}
                </span>
              )}
            </button>

            {/* Блок 4.3: Кнопка «Імпорт виписки з банку» */}
            {onOpenBankImport && (
              <button
                type="button"
                onClick={onOpenBankImport}
                className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-[0.98]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Імпорт виписки з банку (CSV / XLSX)</span>
              </button>
            )}

            {(selectedMonth !== 'ALL' ||
              selectedType !== 'ALL' ||
              selectedCategory !== 'ALL' ||
              onlyUnconfirmed ||
              searchQuery !== '') && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Скинути</span>
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">
            Жести на картці: свайп вправо — дублювати, свайп вліво — видалити
          </span>
        </div>
      </div>
      </div>

      {/* Права панель: гнучкий віртуалізований список операцій Журналу (@tanstack/react-virtual) */}
      <div className="flex-1 min-w-0 w-full flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden transition-colors duration-200">
        {filteredTransactions.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-900 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-slate-800 dark:text-slate-100">
              Записів за обраними критеріями не знайдено
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Скористайтеся центральною кнопкою «+» на нижній панелі для внесення нової операції або імпортуйте виписку з банку.
            </p>
          </div>
        ) : (
          <div
            ref={parentScrollRef}
            className="flex-1 min-h-[180px] max-h-[calc(100dvh-10.5rem)] lg:max-h-[calc(100dvh-7.5rem)] overflow-y-auto overscroll-contain"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const tx = filteredTransactions[virtualRow.index];
                if (!tx) return null;

                const typeInfo = TRANSACTION_TYPE_LABELS[tx.type];
                const catInfo = tx.expenseCategory
                  ? EXPENSE_CATEGORY_MAP[tx.expenseCategory]
                  : null;
                const docFormatted = formatExpenseDocumentRef(tx);
                const restrictedWarn = hasRestrictedAssetKeywords(tx.note, tx.docName);
                const statusInfo =
                  DOCUMENT_STATUS_MAP[tx.docStatus || 'original'] ||
                  DOCUMENT_STATUS_MAP.original;

                const isSwipedLeft =
                  swipedState?.id === tx.id && swipedState?.dir === 'LEFT';
                const isSwipedRight =
                  swipedState?.id === tx.id && swipedState?.dir === 'RIGHT';

                return (
                  <div
                    key={tx.id ?? virtualRow.index}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="border-b border-slate-200 dark:border-slate-700/70 overflow-hidden"
                  >
                    <div
                      onTouchStart={(e) => handleTouchStart(e, tx.id)}
                      onTouchEnd={(e) => handleTouchEnd(e, tx.id)}
                      className="relative bg-white dark:bg-slate-800 p-3.5 sm:px-5 sm:py-3.5 transition-all hover:bg-slate-50/70 dark:hover:bg-slate-700/30"
                    >
                      {/* Оверлей свайп-дій (Свайп вліво -> Видалення, Свайп вправо -> Дублювання / Редагування) */}
                      {(isSwipedLeft || isSwipedRight) && (
                        <div
                          className={`mb-2.5 p-2 rounded-xl flex flex-wrap items-center justify-between gap-2 animate-fade-in ${
                            isSwipedLeft
                              ? 'bg-rose-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          <span className="text-xs font-bold px-1">
                            {isSwipedLeft
                              ? 'Підтвердити видалення запису?'
                              : 'Швидка дія з операцією:'}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isSwipedRight && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateToday(tx)}
                                  className="px-2.5 py-1 rounded-lg bg-white text-blue-900 text-xs font-extrabold flex items-center gap-1 shadow-2xs"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Дублювати сьогодні</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSwipedState(null);
                                    onEditTransaction(tx);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-800 text-white text-xs font-bold flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Редагувати</span>
                                </button>
                              </>
                            )}
                            {isSwipedLeft && (
                              <button
                                type="button"
                                onClick={() => handleDelete(tx)}
                                className="px-3 py-1 rounded-lg bg-white text-rose-700 text-xs font-extrabold flex items-center gap-1 shadow-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Видалити</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSwipedState(null)}
                              className="p-1 rounded-lg bg-black/20 text-white hover:bg-black/30"
                              aria-label="Закрити панель свайпу"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-900 px-2.5 py-0.5 rounded-md">
                            {formatDateUA(tx.date)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeInfo.bgClass}`}
                          >
                            {typeInfo.shortLabel} ({typeInfo.colLabel})
                          </span>
                          {catInfo && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-medium border break-words max-w-full ${catInfo.badgeColor}`}
                            >
                              {catInfo.shortTitle}
                            </span>
                          )}
                          {/* Індикатор статусу первинного документа (Блок 2.3) */}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${statusInfo.badgeClass}`}
                          >
                            {statusInfo.shortLabel}
                          </span>
                          {/* Кнопка перегляду фото чека (Блок 3.1) */}
                          {tx.attachmentPath && (
                            <button
                              type="button"
                              onClick={() => handleViewReceipt(tx)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100"
                            >
                              <ImageIcon className="w-3 h-3" />
                              <span>Фото чека</span>
                            </button>
                          )}
                        </div>

                        <div
                          className={`text-base sm:text-lg font-extrabold whitespace-nowrap ${
                            tx.type === 'INCOME'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : tx.type === 'RETURN'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {tx.type === 'INCOME' ? '+' : '−'}
                          {formatCurrency(tx.amount)} ₴
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          {docFormatted ? (
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-start gap-1.5 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="break-words min-w-0">{docFormatted}</span>
                            </div>
                          ) : (
                            <div className="text-xs italic text-amber-600 dark:text-amber-400">
                              Реквізити первинного документа не вказані
                            </div>
                          )}

                          {tx.note && (
                            <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 break-words">
                              {tx.note}
                            </div>
                          )}

                          {restrictedWarn && (
                            <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg font-medium break-words max-w-full">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Увага: обмеження пп. 177.4.6 ПКУ!</span>
                            </div>
                          )}
                        </div>

                        {/* Кнопки швидких дій (Дублювати / Редагувати / Видалити) */}
                        <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 sm:pt-0">
                          <button
                            type="button"
                            onClick={() => handleDuplicateToday(tx)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
                            title="Швидке дублювання з поточною датою"
                          >
                            <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                            <span className="hidden sm:inline">Дублювати</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditTransaction(tx)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Редагувати</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(tx)}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Видалити</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Модальне вікно перегляду прикріпленого фото чека */}
      {viewingReceipt && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setViewingReceipt(null)}
        >
          <div
            className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold truncate">
                  {formatExpenseDocumentRef(viewingReceipt.tx) || 'Фото первинного документа'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Сума: {formatCurrency(viewingReceipt.tx.amount)} грн •{' '}
                  {formatDateUA(viewingReceipt.tx.date)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="p-1 rounded-lg text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-100 dark:bg-slate-950 max-h-[75dvh] overflow-auto">
              <img
                src={viewingReceipt.dataUrl}
                alt="Фото чека"
                className="max-w-full max-h-[70dvh] rounded-xl object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
