import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calculator,
  CheckCircle2,
  Edit3,
  Info,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  FIXED_ASSET_GROUP_MAP,
  FIXED_ASSET_GROUPS,
  RESTRICTED_ASSET_WARNING_TEXT,
  VAT_PAYER_REMINDER_TEXT,
} from '../constants/taxConstants';
import { db } from '../db/database';
import type {
  FixedAsset,
  FixedAssetGroupId,
  TaxProfile,
} from '../types/tax';
import {
  calculateAmortizationAppendix,
  formatCurrency,
  formatDateUA,
  roundCurrency,
} from '../utils/calculations';
import { hasRestrictedAssetKeywords, validateFixedAsset } from '../utils/validation';

interface FixedAssetsRegistryProps {
  fixedAssets: FixedAsset[];
  selectedYear: number;
  profile: TaxProfile;
}

export const FixedAssetsRegistry: React.FC<FixedAssetsRegistryProps> = ({
  fixedAssets,
  selectedYear,
  profile,
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);

  const [group, setGroup] = useState<FixedAssetGroupId>('group_computers');
  const [name, setName] = useState('');
  const [purchaseDoc, setPurchaseDoc] = useState('');
  const [commissioningDoc, setCommissioningDoc] = useState('');
  const [commissioningDate, setCommissioningDate] = useState(
    `${selectedYear}-01-10`
  );
  const [usefulLifeYearsStr, setUsefulLifeYearsStr] = useState('2');
  const [initialCostStr, setInitialCostStr] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const amortizationReport = useMemo(
    () => calculateAmortizationAppendix(fixedAssets, selectedYear),
    [fixedAssets, selectedYear]
  );

  const openCreateModal = () => {
    setEditingAsset(null);
    setGroup('group_computers');
    setName('');
    setPurchaseDoc('');
    setCommissioningDoc('');
    setCommissioningDate(`${selectedYear}-01-10`);
    setUsefulLifeYearsStr(String(FIXED_ASSET_GROUP_MAP.group_computers.minYears));
    setInitialCostStr('');
    setIsActive(true);
    setErrors({});
    setIsFormOpen(true);
  };

  const openEditModal = (asset: FixedAsset) => {
    setEditingAsset(asset);
    const gId = (asset.group as FixedAssetGroupId) || 'group_computers';
    setGroup(gId);
    setName(asset.name);
    setPurchaseDoc(asset.purchaseDoc);
    setCommissioningDoc(asset.commissioningDoc);
    setCommissioningDate(asset.commissioningDate);
    setUsefulLifeYearsStr(String(asset.usefulLifeYears));
    setInitialCostStr(String(asset.initialCost));
    setIsActive(asset.isActive);
    setErrors({});
    setIsFormOpen(true);
  };

  const handleGroupChange = (newGroupId: FixedAssetGroupId) => {
    setGroup(newGroupId);
    const config = FIXED_ASSET_GROUP_MAP[newGroupId];
    if (config) {
      // Автоматично підставляємо мінімальний законодавчий строк при виборі групи
      setUsefulLifeYearsStr(String(config.minYears));
    }
    if (errors.group || errors.usefulLifeYears) {
      setErrors({ ...errors, group: '', usefulLifeYears: '' });
    }
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedYears = Number(usefulLifeYearsStr.replace(',', '.'));
    const parsedCost = Number(initialCostStr.replace(',', '.'));

    const candidate: Partial<FixedAsset> = {
      group,
      name: name.trim(),
      purchaseDoc: purchaseDoc.trim(),
      commissioningDoc: commissioningDoc.trim(),
      commissioningDate,
      usefulLifeYears: parsedYears,
      initialCost: parsedCost,
      isActive,
    };

    const validation = validateFixedAsset(candidate);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (editingAsset?.id) {
      await db.fixedAssets.update(editingAsset.id, candidate as FixedAsset);
    } else {
      await db.fixedAssets.add(candidate as FixedAsset);
    }
    setIsFormOpen(false);
  };

  const handleDeleteAsset = async (asset: FixedAsset) => {
    if (!asset.id) return;
    const confirmed = window.confirm(
      `Видалити об’єкт ОЗ/НА «${asset.name}» з реєстру?`
    );
    if (confirmed) {
      await db.fixedAssets.delete(asset.id);
    }
  };

  const handleToggleActive = async (asset: FixedAsset) => {
    if (!asset.id) return;
    await db.fixedAssets.update(asset.id, { isActive: !asset.isActive });
  };

  const selectedGroupConfig = FIXED_ASSET_GROUP_MAP[group];
  const showRestrictedWarning = hasRestrictedAssetKeywords(name, purchaseDoc);

  // Попередній розрахунок у модалці
  const previewCost = parseFloat(initialCostStr.replace(',', '.')) || 0;
  const previewYears = parseFloat(usefulLifeYearsStr.replace(',', '.')) || 1;
  const previewAnnual = previewYears > 0 ? roundCurrency(previewCost / previewYears) : 0;
  const previewMonthly = roundCurrency(previewAnnual / 12);

  return (
    <div className="space-y-6">
      {/* Верхня інформаційна панель */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Реєстр основних засобів та нематеріальних активів (пп. 177.4.9 ПКУ)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Амортизація розраховується прямолінійним методом. Підсумок Графи 11 Додатка за {selectedYear} рік ({' '}
            <span className="font-bold text-blue-700">
              {formatCurrency(amortizationReport.totalYearAmortization)} грн
            </span>{' '}
            ) переноситься до Графи 10 Типової форми № 261.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs flex items-center justify-center gap-2 shrink-0 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Додати об’єкт ОЗ / НА</span>
        </button>
      </div>

      {/* Картки об'єктів ОЗ/НА */}
      {fixedAssets.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 border border-slate-200 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Calculator className="w-6 h-6" />
          </div>
          <div className="text-base font-bold text-slate-800">
            Реєстр основних засобів та нематеріальних активів порожній
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
            Додайте обладнання, комп’ютерну техніку, інструменти або вантажний транспорт, які використовуються у господарській діяльності, для автоматичного розрахунку амортизації (Додаток до форми № 261).
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Додати перший об’єкт ОЗ/НА</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fixedAssets.map((asset) => {
            const grp = FIXED_ASSET_GROUP_MAP[asset.group as FixedAssetGroupId];
            const calcRow = amortizationReport.rows.find((r) => r.assetId === asset.id);
            const annualNorm = roundCurrency(asset.initialCost / Math.max(1, asset.usefulLifeYears));
            const monthlyNorm = roundCurrency(annualNorm / 12);
            const restricted = hasRestrictedAssetKeywords(asset.name, asset.purchaseDoc);

            return (
              <div
                key={asset.id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
                  asset.isActive
                    ? 'border-slate-200 shadow-xs'
                    : 'border-slate-200 bg-slate-50/70 opacity-75'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {grp ? grp.shortName : asset.group} (мін. {grp?.minYears || 2} р.)
                      </span>
                      <h3 className="mt-1.5 text-base font-bold text-slate-900">{asset.name}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(asset)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        asset.isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                      }`}
                    >
                      {asset.isActive ? 'В експлуатації' : 'Виведено'}
                    </button>
                  </div>

                  {restricted && (
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{RESTRICTED_ASSET_WARNING_TEXT}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">Первісна вартість (Гр. 7)</div>
                      <div className="font-extrabold text-slate-900 text-sm mt-0.5">
                        {formatCurrency(asset.initialCost)} грн
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Річна норма (Гр. 8)</div>
                      <div className="font-bold text-slate-800 text-sm mt-0.5">
                        {formatCurrency(annualNorm)} грн
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Місячна норма (Гр. 9)</div>
                      <div className="font-bold text-blue-700 text-sm mt-0.5">
                        {formatCurrency(monthlyNorm)} грн/міс
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      <span className="font-semibold text-slate-700">Введено в експлуатацію:</span>{' '}
                      {formatDateUA(asset.commissioningDate)} • Строк: {asset.usefulLifeYears} р.
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Док. придбання (Гр. 4):</span>{' '}
                      {asset.purchaseDoc}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700">Док. введення (Гр. 5):</span>{' '}
                      {asset.commissioningDoc}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    {calcRow ? (
                      <span className="text-slate-700">
                        За {selectedYear} рік ({calcRow.monthsInYear} міс.):{' '}
                        <strong className="text-blue-700">
                          {formatCurrency(calcRow.col11_yearAmortization)} грн
                        </strong>
                      </span>
                    ) : (
                      <span className="text-slate-400">Не нараховується у {selectedYear} р.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(asset)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Редагувати
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAsset(asset)}
                      className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                      title="Видалити"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Таблиця розрахунку за 12 графами (Додаток до типової форми № 261) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Додаток до типової форми № 261 — Розрахунок амортизації за {selectedYear} рік (12 граф)
            </h3>
            <p className="text-xs text-slate-500">
              Автоматичний розрахунок граф 1–12 відповідно до розд. ІІІ Порядку № 261
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase font-bold text-slate-500">
              До перенесення в Графу 10 Форми № 261
            </div>
            <div className="text-base font-extrabold text-blue-700">
              {formatCurrency(amortizationReport.totalYearAmortization)} грн
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold text-center border-b border-slate-300">
                <th className="p-2 border border-slate-300 w-10">Гр. 1</th>
                <th className="p-2 border border-slate-300">Гр. 2 (Група ОЗ/НА)</th>
                <th className="p-2 border border-slate-300">Гр. 3 (Назва об’єкта)</th>
                <th className="p-2 border border-slate-300">Гр. 4 (Док. придбання)</th>
                <th className="p-2 border border-slate-300">Гр. 5 (Док. введення)</th>
                <th className="p-2 border border-slate-300 w-16">Гр. 6 (Строк, р.)</th>
                <th className="p-2 border border-slate-300 text-right">Гр. 7 (Первісна вартість)</th>
                <th className="p-2 border border-slate-300 text-right">Гр. 8 (Річна = Гр.7/Гр.6)</th>
                <th className="p-2 border border-slate-300 text-right">Гр. 9 (Місячна = Гр.8/12)</th>
                <th className="p-2 border border-slate-300 text-right">Гр. 10 (На поч. періоду)</th>
                <th className="p-2 border border-slate-300 text-right bg-blue-50/60">
                  Гр. 11 (Аморт. за рік)
                </th>
                <th className="p-2 border border-slate-300 text-right">
                  Гр. 12 (На кін. = Гр.10−Гр.11)
                </th>
              </tr>
            </thead>
            <tbody>
              {amortizationReport.rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-slate-400 italic">
                    Немає активних об’єктів ОЗ/НА для розрахунку амортизації у {selectedYear} році
                  </td>
                </tr>
              ) : (
                amortizationReport.rows.map((r) => (
                  <tr key={r.index} className="hover:bg-slate-50">
                    <td className="p-2 border border-slate-200 text-center font-semibold">
                      {r.index}
                    </td>
                    <td className="p-2 border border-slate-200">{r.col2_groupName}</td>
                    <td className="p-2 border border-slate-200 font-semibold text-slate-900">
                      {r.col3_assetName}
                    </td>
                    <td className="p-2 border border-slate-200">{r.col4_purchaseDoc}</td>
                    <td className="p-2 border border-slate-200">{r.col5_commissioningDoc}</td>
                    <td className="p-2 border border-slate-200 text-center">
                      {r.col6_usefulLifeYears}
                    </td>
                    <td className="p-2 border border-slate-200 text-right whitespace-nowrap">
                      {formatCurrency(r.col7_initialCost)}
                    </td>
                    <td className="p-2 border border-slate-200 text-right whitespace-nowrap">
                      {formatCurrency(r.col8_annualAmount)}
                    </td>
                    <td className="p-2 border border-slate-200 text-right whitespace-nowrap">
                      {formatCurrency(r.col9_monthlyAmount)}
                    </td>
                    <td className="p-2 border border-slate-200 text-right whitespace-nowrap">
                      {formatCurrency(r.col10_startPeriodValue)}
                    </td>
                    <td className="p-2 border border-slate-200 text-right font-bold text-blue-700 bg-blue-50/40 whitespace-nowrap">
                      {formatCurrency(r.col11_yearAmortization)}
                    </td>
                    <td className="p-2 border border-slate-200 text-right whitespace-nowrap">
                      {formatCurrency(r.col12_endPeriodValue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {amortizationReport.rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900">
                  <td colSpan={6} className="p-2.5 border border-slate-300 text-right uppercase">
                    Усього за Додатком:
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalInitialCost)}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalAnnualAmount)}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalMonthlyAmount)}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalStartPeriodValue)}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right text-blue-700 bg-blue-100/70 whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalYearAmortization)}
                  </td>
                  <td className="p-2.5 border border-slate-300 text-right whitespace-nowrap">
                    {formatCurrency(amortizationReport.totalEndPeriodValue)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Модальне вікно створення / редагування об'єкта ОЗ/НА */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-semibold">
                  {editingAsset ? 'Редагування об’єкта ОЗ / НА' : 'Новий об’єкт ОЗ / НА (пп. 177.4.9 ПКУ)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAsset} className="p-4 sm:p-5 space-y-4 overflow-y-auto">
              {profile.isVatPayer && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-medium">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{VAT_PAYER_REMINDER_TEXT}: первісна вартість ОЗ зазначається без ПДВ.</span>
                </div>
              )}

              {showRestrictedWarning && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs sm:text-sm font-semibold">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{RESTRICTED_ASSET_WARNING_TEXT}</span>
                </div>
              )}

              {/* Вибір групи ОЗ/НА з довідника пп. 177.4.9 ПКУ */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Група ОЗ / НА (Графа 2 Додатка, пп. 177.4.9 ПКУ) *
                </label>
                <select
                  value={group}
                  onChange={(e) => handleGroupChange(e.target.value as FixedAssetGroupId)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {FIXED_ASSET_GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} (мін. строк: {g.minYears} р.)
                    </option>
                  ))}
                </select>
                {selectedGroupConfig && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selectedGroupConfig.description}
                  </p>
                )}
              </div>

              {/* Назва об'єкта (Графа 3) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Назва об’єкта ОЗ / НА (Графа 3) *
                </label>
                <input
                  type="text"
                  placeholder="Напр.: Ноутбук Apple MacBook Pro 16 або Верстат токарний..."
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors({ ...errors, name: '' });
                  }}
                  className={`w-full rounded-xl border px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                    errors.name ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-300 focus:ring-blue-600'
                  }`}
                />
                {errors.name && <p className="mt-1 text-xs text-rose-600 font-medium">{errors.name}</p>}
              </div>

              {/* Реквізити документів придбання (Гр. 4) та введення в експлуатацію (Гр. 5) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Документ придбання (Графа 4) *
                  </label>
                  <input
                    type="text"
                    placeholder="Напр.: ВН № 124 від 10.01.2026, ПІ № 45"
                    value={purchaseDoc}
                    onChange={(e) => {
                      setPurchaseDoc(e.target.value);
                      if (errors.purchaseDoc) setErrors({ ...errors, purchaseDoc: '' });
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      errors.purchaseDoc
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:ring-blue-600'
                    }`}
                  />
                  {errors.purchaseDoc && (
                    <p className="mt-1 text-xs text-rose-600 font-medium">{errors.purchaseDoc}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Документ введення в експл. (Графа 5) *
                  </label>
                  <input
                    type="text"
                    placeholder="Напр.: Наказ (акт) № 1-ОЗ від 12.01.2026"
                    value={commissioningDoc}
                    onChange={(e) => {
                      setCommissioningDoc(e.target.value);
                      if (errors.commissioningDoc) setErrors({ ...errors, commissioningDoc: '' });
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 ${
                      errors.commissioningDoc
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:ring-blue-600'
                    }`}
                  />
                  {errors.commissioningDoc && (
                    <p className="mt-1 text-xs text-rose-600 font-medium">
                      {errors.commissioningDoc}
                    </p>
                  )}
                </div>
              </div>

              {/* Дата введення, Строк (Гр. 6) та Первісна вартість (Гр. 7) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Дата введення *
                  </label>
                  <input
                    type="date"
                    value={commissioningDate}
                    onChange={(e) => setCommissioningDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Строк (років, Гр. 6) *
                  </label>
                  <input
                    type="number"
                    min={selectedGroupConfig?.minYears || 2}
                    step="1"
                    value={usefulLifeYearsStr}
                    onChange={(e) => {
                      setUsefulLifeYearsStr(e.target.value);
                      if (errors.usefulLifeYears) setErrors({ ...errors, usefulLifeYears: '' });
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                      errors.usefulLifeYears
                        ? 'border-rose-500 focus:ring-rose-500 bg-rose-50'
                        : 'border-slate-300 focus:ring-blue-600'
                    }`}
                  />
                  <span className="text-[11px] text-slate-500">
                    Законодавчий мінімум: {selectedGroupConfig?.minYears} р.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Первісна вартість (Гр. 7) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={initialCostStr}
                    onChange={(e) => {
                      setInitialCostStr(e.target.value);
                      if (errors.initialCost) setErrors({ ...errors, initialCost: '' });
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 ${
                      errors.initialCost
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 focus:ring-blue-600'
                    }`}
                  />
                </div>
              </div>

              {errors.usefulLifeYears && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {errors.usefulLifeYears}
                </div>
              )}
              {errors.initialCost && (
                <p className="text-xs text-rose-600 font-medium">{errors.initialCost}</p>
              )}

              {/* Попередній перегляд річної та місячної норми */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500">Річна сума (Гр. 8):</span>{' '}
                  <strong className="text-slate-900">{formatCurrency(previewAnnual)} грн/рік</strong>
                </div>
                <div>
                  <span className="text-slate-500">Місячна сума (Гр. 9):</span>{' '}
                  <strong className="text-blue-700">{formatCurrency(previewMonthly)} грн/міс</strong>
                </div>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-800">
                  Об’єкт перебуває в експлуатації (нараховувати амортизацію)
                </span>
              </label>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100"
                >
                  Скасувати
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingAsset ? 'Зберегти зміни' : 'Додати до Реєстру ОЗ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
