import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Briefcase,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  Filter,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  ATTORNEY_EXPENSE_TEMPLATES,
  type AttorneyExpenseTemplate,
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
import { hasRestrictedAssetKeywords } from '../utils/validation';

interface TransactionsJournalProps {
  transactions: TaxTransaction[];
  selectedYear: number;
  onAddClick: () => void;
  onEditTransaction: (tx: TaxTransaction) => void;
  onSelectAttorneyTemplate?: (template: AttorneyExpenseTemplate) => void;
}

const PAGE_STEP = 25;

export const TransactionsJournal: React.FC<TransactionsJournalProps> = ({
  transactions,
  selectedYear,
  onAddClick,
  onEditTransaction,
  onSelectAttorneyTemplate,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<TransactionType | 'ALL'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_STEP);
  const [showAttorneyGuide, setShowAttorneyGuide] = useState<boolean>(false);

  const filteredTransactions = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    const query = searchQuery.trim().toLowerCase();

    return transactions
      .filter((tx) => {
        if (!tx.date || !tx.date.startsWith(yearPrefix)) return false;

        if (selectedMonth !== 'ALL') {
          const monthNum = Number(tx.date.split('-')[1]);
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
  }, [transactions, selectedYear, selectedMonth, selectedType, selectedCategory, searchQuery]);

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

  const visibleTransactions = filteredTransactions.slice(0, visibleCount);

  const handleDelete = async (tx: TaxTransaction) => {
    if (!tx.id) return;
    const confirmed = window.confirm(
      `Видалити операцію від ${formatDateUA(tx.date)} на суму ${formatCurrency(tx.amount)} грн?`
    );
    if (confirmed) {
      await db.transactions.delete(tx.id);
    }
  };

  const resetFilters = () => {
    setSelectedMonth('ALL');
    setSelectedType('ALL');
    setSelectedCategory('ALL');
    setSearchQuery('');
    setVisibleCount(PAGE_STEP);
  };

  return (
    <div className="space-y-3.5 sm:space-y-5 w-full">
      {/* KPI Картки за обраним фільтром (чітко вписані в екран смартфона) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs min-w-0">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span className="truncate">Дохід (Гр. 4)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-sm sm:text-2xl font-extrabold text-slate-900 truncate">
            {formatCurrency(summary.netIncome)} <span className="text-[11px] font-semibold text-slate-500">₴</span>
          </div>
          {summary.returns > 0 && (
            <div className="mt-0.5 text-[10px] sm:text-[11px] text-amber-700 font-medium truncate">
              Поверн. (Гр. 3): −{formatCurrency(summary.returns)} ₴
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs min-w-0">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span className="truncate">Витрати (Гр. 6–9)</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-rose-50 text-rose-600 shrink-0">
              <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 text-sm sm:text-2xl font-extrabold text-rose-700 truncate">
            {formatCurrency(summary.expenses)} <span className="text-[11px] font-semibold text-slate-500">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 truncate">
            За первинними док.
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs min-w-0">
          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span className="truncate">Чистий дохід</span>
            <span className="p-1 sm:p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
          </div>
          <div
            className={`mt-1.5 sm:mt-2 text-sm sm:text-2xl font-extrabold truncate ${
              summary.netProfit >= 0 ? 'text-blue-700' : 'text-rose-700'
            }`}
          >
            {formatCurrency(summary.netProfit)} <span className="text-[11px] font-semibold text-slate-500">₴</span>
          </div>
          <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 truncate">
            Записів: {filteredTransactions.length}
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-3 sm:p-4 text-white shadow-sm flex flex-col justify-between min-w-0">
          <div className="text-[10px] sm:text-xs font-medium text-slate-300 truncate">
            Облік ({selectedYear} рік)
          </div>
          <button
            type="button"
            onClick={onAddClick}
            className="mt-1.5 w-full py-2 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="truncate">Додати запис</span>
          </button>
        </div>
      </div>

      {/* Інтерактивний довідник витрат адвоката (ст. 178 ПКУ) з миттєвим додаванням у Журнал */}
      <div className="bg-white rounded-2xl border border-indigo-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAttorneyGuide((prev) => !prev)}
          className="w-full px-3.5 py-3 bg-indigo-50/70 hover:bg-indigo-50 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-bold text-indigo-950 truncate">
                Довідник дозволених витрат адвоката (ст. 178 ПКУ — 17 статей)
              </div>
              <div className="text-[10px] sm:text-xs text-indigo-700 truncate">
                Натисніть, щоб переглянути перелік і додати витрату в 1 дотик
              </div>
            </div>
          </div>
          <span className="p-1 rounded-lg bg-white text-indigo-700 border border-indigo-200 shrink-0">
            {showAttorneyGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {showAttorneyGuide && (
          <div className="p-3 sm:p-4 divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {ATTORNEY_EXPENSE_TEMPLATES.map((item, idx) => {
              const catInfo = EXPENSE_CATEGORY_MAP[item.category];
              return (
                <div
                  key={item.id}
                  className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-extrabold text-slate-900">
                        {idx + 1}. {item.shortLabel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${catInfo.badgeColor}`}
                      >
                        Графа {catInfo.colNumber}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">{item.fullText}</p>
                  </div>
                  {onSelectAttorneyTemplate && (
                    <button
                      type="button"
                      onClick={() => onSelectAttorneyTemplate(item)}
                      className="self-end sm:self-center shrink-0 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Внести</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Панель фільтрів та пошуку */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Пошук за документом / приміткою */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_STEP);
              }}
              placeholder="Пошук за назвою або № документа, контрагентом, сумою..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Фільтр за місяцем */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <select
              value={selectedMonth}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedMonth(val === 'ALL' ? 'ALL' : Number(val));
                setVisibleCount(PAGE_STEP);
              }}
              className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
            <select
              value={selectedType}
              onChange={(e) => {
                const val = e.target.value as TransactionType | 'ALL';
                setSelectedType(val);
                if (val !== 'ALL' && val !== 'EXPENSE') {
                  setSelectedCategory('ALL');
                }
                setVisibleCount(PAGE_STEP);
              }}
              className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
              onChange={(e) => {
                setSelectedCategory(e.target.value as ExpenseCategory | 'ALL');
                setVisibleCount(PAGE_STEP);
              }}
              className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">Усі категорії витрат (Гр. 6–9)</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.shortTitle}
                </option>
              ))}
            </select>
          )}

          {(selectedMonth !== 'ALL' ||
            selectedType !== 'ALL' ||
            selectedCategory !== 'ALL' ||
            searchQuery !== '') && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Скинути</span>
            </button>
          )}
        </div>
      </div>

      {/* Таблиця журналу операцій */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredTransactions.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div className="text-base font-bold text-slate-800">
              Записів за обраними критеріями не знайдено
            </div>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Додайте першу операцію доходу або витрати за допомогою кнопки «Додати операцію» або завантажте демонстраційний приклад у розділі «Налаштування».
            </p>
            <button
              type="button"
              onClick={onAddClick}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Додати операцію</span>
            </button>
          </div>
        ) : (
          <>
            {/* Десктопна таблиця */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Дата (Гр. 1)</th>
                    <th className="py-3 px-4">Тип / Графа</th>
                    <th className="py-3 px-4">Первинний документ (Гр. 5)</th>
                    <th className="py-3 px-4">Примітка / Контрагент</th>
                    <th className="py-3 px-4 text-right">Сума (грн)</th>
                    <th className="py-3 px-4 text-right">Дії</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {visibleTransactions.map((tx) => {
                    const typeInfo = TRANSACTION_TYPE_LABELS[tx.type];
                    const catInfo = tx.expenseCategory
                      ? EXPENSE_CATEGORY_MAP[tx.expenseCategory]
                      : null;
                    const docFormatted = formatExpenseDocumentRef(tx);
                    const restrictedWarn = hasRestrictedAssetKeywords(tx.note, tx.docName);

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                          {formatDateUA(tx.date)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${typeInfo.bgClass}`}
                            >
                              {typeInfo.shortLabel} ({typeInfo.colLabel})
                            </span>
                            {catInfo && (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${catInfo.badgeColor}`}
                              >
                                {catInfo.shortTitle}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          {docFormatted ? (
                            <span className="font-medium">{docFormatted}</span>
                          ) : (
                            <span className="text-slate-400 text-xs italic">Не вказано</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">
                          <div className="truncate" title={tx.note}>
                            {tx.note || '—'}
                          </div>
                          {restrictedWarn && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md font-medium">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Обмеження пп. 177.4.6 ПКУ</span>
                            </div>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-extrabold whitespace-nowrap ${
                            tx.type === 'INCOME'
                              ? 'text-emerald-700'
                              : tx.type === 'RETURN'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {tx.type === 'INCOME' ? '+' : '−'}
                          {formatCurrency(tx.amount)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onEditTransaction(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Редагувати"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Видалити"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Мобільний список карток */}
            <div className="md:hidden divide-y divide-slate-200">
              {visibleTransactions.map((tx) => {
                const typeInfo = TRANSACTION_TYPE_LABELS[tx.type];
                const catInfo = tx.expenseCategory
                  ? EXPENSE_CATEGORY_MAP[tx.expenseCategory]
                  : null;
                const docFormatted = formatExpenseDocumentRef(tx);
                const restrictedWarn = hasRestrictedAssetKeywords(tx.note, tx.docName);

                return (
                  <div key={tx.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                          {formatDateUA(tx.date)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${typeInfo.bgClass}`}
                        >
                          {typeInfo.shortLabel}
                        </span>
                        {catInfo && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${catInfo.badgeColor}`}
                          >
                            {catInfo.shortTitle}
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-base font-extrabold whitespace-nowrap ${
                          tx.type === 'INCOME'
                            ? 'text-emerald-700'
                            : tx.type === 'RETURN'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {tx.type === 'INCOME' ? '+' : '−'}
                        {formatCurrency(tx.amount)} ₴
                      </div>
                    </div>

                    {docFormatted && (
                      <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{docFormatted}</span>
                      </div>
                    )}

                    {tx.note && <div className="text-xs text-slate-600">{tx.note}</div>}

                    {restrictedWarn && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-100 p-2 rounded-lg font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span>Увага: обмеження пп. 177.4.6 ПКУ!</span>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onEditTransaction(tx)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Редагувати
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(tx)}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Видалити
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Пагінація / Підвантаження */}
            {visibleCount < filteredTransactions.length && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_STEP)}
                  className="px-5 py-2 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors"
                >
                  Показати ще ({filteredTransactions.length - visibleCount} залишилось)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
