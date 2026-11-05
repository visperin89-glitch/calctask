import type ExcelJS from 'exceljs';
import type {
  AmortizationAppendixReport,
  AnnualReportData,
  TaxProfile,
} from '../types/tax';
import { roundCurrency } from './calculations';
import { saveOrShareBinaryFile, type SaveFileResult } from './nativePlatform';

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

const CURRENCY_FORMAT = '#,##0.00';

const FONT_REGULAR: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 9,
  bold: false,
};

const FONT_BOLD: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 9,
  bold: true,
};

const FONT_TITLE: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
};

/**
 * Експорт Річного звіту та Додатка з амортизації у двосторінковий файл .xlsx
 * суворо за макетом наказу Міністерства фінансів України від 13.05.2021 № 261.
 */
export async function exportTaxBookToExcel(
  profile: TaxProfile,
  annualReport: AnnualReportData,
  amortizationReport: AmortizationAppendixReport,
  autoShareOnNative = true
): Promise<SaveFileResult> {
  const ExcelJSModule = await import('exceljs');
  const ExcelJSRuntime = ExcelJSModule.default || ExcelJSModule;
  const workbook = new ExcelJSRuntime.Workbook();
  workbook.creator = 'Книга обліку № 261 (PWA)';
  workbook.created = new Date();

  const activityLabel =
    profile.activityType === 'independent'
      ? 'Фізична особа, яка провадить незалежну професійну діяльність'
      : 'Фізична особа – підприємець (загальна система оподаткування)';

  const fullNameText = profile.fullName?.trim() || '__________________________________________________';
  const taxIdText = profile.taxId?.trim() || '_________________________';

  // ============================================================================
  // АРКУШ 1: «Типова форма»
  // ============================================================================
  const ws1 = workbook.addWorksheet('Типова форма', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
    },
  });

  // Ширина стовпчиків (A..K — 11 граф)
  ws1.columns = [
    { key: 'col1', width: 12 }, // A: Графа 1 (Дата)
    { key: 'col2', width: 14 }, // B: Графа 2 (Дохід)
    { key: 'col3', width: 13 }, // C: Графа 3 (Повернення)
    { key: 'col4', width: 14 }, // D: Графа 4 (Чистий дохід)
    { key: 'col5', width: 32 }, // E: Графа 5 (Реквізити документів)
    { key: 'col6', width: 14 }, // F: Графа 6 (ТМЦ)
    { key: 'col7', width: 14 }, // G: Графа 7 (Оплата праці)
    { key: 'col8', width: 14 }, // H: Графа 8 (Податки, ЄСВ)
    { key: 'col9', width: 14 }, // I: Графа 9 (Інші витрати)
    { key: 'col10', width: 14 }, // J: Графа 10 (Амортизація)
    { key: 'col11', width: 15 }, // K: Графа 11 (Чистий оподатковуваний дохід)
  ];

  // Рядки 1–3 (вирівнювання праворуч): Гриф затвердження
  const approvalLines = [
    'ЗАТВЕРДЖЕНО',
    'Наказ Міністерства фінансів України',
    '13 травня 2021 року № 261',
  ];
  approvalLines.forEach((text, idx) => {
    const rowNum = idx + 1;
    ws1.mergeCells(`I${rowNum}:K${rowNum}`);
    const cell = ws1.getCell(`I${rowNum}`);
    cell.value = text;
    cell.font = FONT_REGULAR;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Рядки 5–6 (по центру, 11pt, Bold): Повна назва форми
  ws1.mergeCells('A5:K5');
  const titleCell1 = ws1.getCell('A5');
  titleCell1.value = 'ТИПОВА ФОРМА, за якою здійснюється облік доходів і витрат';
  titleCell1.font = FONT_TITLE;
  titleCell1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws1.mergeCells('A6:K6');
  const titleCell2 = ws1.getCell('A6');
  titleCell2.value =
    'фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність';
  titleCell2.font = FONT_TITLE;
  titleCell2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Рядки 8–9: Реквізити платника (ПІБ та РНОКПП)
  ws1.mergeCells('A8:K8');
  const payerCell1 = ws1.getCell('A8');
  payerCell1.value = `Платник податків (ПІБ): ${fullNameText}   (${activityLabel})`;
  payerCell1.font = FONT_BOLD;
  payerCell1.alignment = { horizontal: 'left', vertical: 'middle' };

  ws1.mergeCells('A9:K9');
  const payerCell2 = ws1.getCell('A9');
  payerCell2.value = `Реєстраційний номер облікової картки платника податків (або серія та номер паспорта): ${taxIdText}   |   Звітний період: ${annualReport.year} рік${
    profile.isVatPayer ? '   |   Статус: Платник ПДВ (суми без ПДВ)' : ''
  }`;
  payerCell2.font = FONT_BOLD;
  payerCell2.alignment = { horizontal: 'left', vertical: 'middle' };

  // Рядки 11–13: Регламентована дворівнева шапка з об'єднанням комірок (11 граф)
  ws1.mergeCells('A11:A12');
  ws1.mergeCells('B11:B12');
  ws1.mergeCells('C11:C12');
  ws1.mergeCells('D11:D12');
  ws1.mergeCells('E11:J11');
  ws1.mergeCells('K11:K12');

  ws1.getCell('A11').value = 'Дата запису (день, місяць, рік)';
  ws1.getCell('B11').value =
    'Сума доходу, отриманого від провадження господарської або незалежної професійної діяльності (грн, коп.)';
  ws1.getCell('C11').value =
    'Сума повернутих самозайнятою особою коштів за товари (роботи, послуги) та/або передплати (грн, коп.)';
  ws1.getCell('D11').value =
    'Загальна сума отриманого доходу, яка підлягає декларуванню (графа 2 – графа 3) (грн, коп.)';
  ws1.getCell('E11').value =
    'Витрати, пов’язані з господарською діяльністю або провадженням незалежної професійної діяльності';
  ws1.getCell('K11').value =
    'Сума чистого оподатковуваного доходу (графа 4 – (графа 6 + графа 7 + графа 8 + графа 9 + графа 10)) (грн, коп.)';

  ws1.getCell('E12').value = 'реквізити документа, що підтверджує понесені витрати';
  ws1.getCell('F12').value =
    'витрати на придбання товарно-матеріальних цінностей, що реалізовані або використані у виробництві продукції (грн, коп.)';
  ws1.getCell('G12').value =
    'витрати на оплату праці фізичних осіб, що перебувають у трудових відносинах / за договорами ЦПХ (грн, коп.)';
  ws1.getCell('H12').value =
    'витрати на сплату податків, зборів, ЄСВ, платежів за одержання ліцензій та дозволів (грн, коп.)';
  ws1.getCell('I12').value =
    'інші витрати, які безпосередньо пов’язані з отриманням доходу (грн, коп.)';
  ws1.getCell('J12').value = 'амортизаційні відрахування (грн, коп.)';

  ws1.getRow(11).height = 26;
  ws1.getRow(12).height = 68;
  ws1.getRow(13).height = 18;

  // Рядок 13: Нумерація стовпчиків 1–11
  for (let colIdx = 1; colIdx <= 11; colIdx++) {
    const cell = ws1.getCell(13, colIdx);
    cell.value = colIdx;
  }

  // Форматування шапки (рядки 11–13)
  for (let r = 11; r <= 13; r++) {
    for (let c = 1; c <= 11; c++) {
      const cell = ws1.getCell(r, c);
      cell.font = FONT_BOLD;
      cell.border = THIN_BORDER;
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r === 13 ? 'FFE2E8F0' : 'FFF8FAFC' },
      };
    }
  }

  const numericColumns = [2, 3, 4, 6, 7, 8, 9, 10, 11]; // B, C, D, F, G, H, I, J, K
  const columnLetters: Record<number, string> = {
    2: 'B',
    3: 'C',
    4: 'D',
    6: 'F',
    7: 'G',
    8: 'H',
    9: 'I',
    10: 'J',
    11: 'K',
  };

  let currentRowIndex = 14;
  const quarterSummaryRowNumbers: number[] = [];

  for (const qBlock of annualReport.quarters) {
    const qStartRow = currentRowIndex;

    if (qBlock.rows.length === 0) {
      // Порожній рядок-індикатор за квартал без операцій, щоб формула SUM працювала коректно
      const row = ws1.getRow(currentRowIndex);
      row.getCell(1).value = `— (І${qBlock.quarter === 1 ? '' : qBlock.quarter === 2 ? 'І' : qBlock.quarter === 3 ? 'ІІ' : 'V'} кв.)`;
      row.getCell(2).value = 0;
      row.getCell(3).value = 0;
      row.getCell(4).value = { formula: `B${currentRowIndex}-C${currentRowIndex}`, result: 0 };
      row.getCell(5).value = 'Операції відсутні';
      row.getCell(6).value = 0;
      row.getCell(7).value = 0;
      row.getCell(8).value = 0;
      row.getCell(9).value = 0;
      row.getCell(10).value = 0;
      row.getCell(11).value = {
        formula: `D${currentRowIndex}-SUM(F${currentRowIndex}:J${currentRowIndex})`,
        result: 0,
      };

      styleMainSheetDataRow(row, numericColumns, false);
      currentRowIndex++;
    } else {
      for (const dRow of qBlock.rows) {
        const rIdx = currentRowIndex;
        const row = ws1.getRow(rIdx);

        row.getCell(1).value = dRow.formattedDate;
        row.getCell(2).value = roundCurrency(dRow.col2_income);
        row.getCell(3).value = roundCurrency(dRow.col3_return);
        row.getCell(4).value = {
          formula: `B${rIdx}-C${rIdx}`,
          result: roundCurrency(dRow.col4_netIncome),
        };
        row.getCell(5).value = dRow.col5_docs || '';
        row.getCell(6).value = roundCurrency(dRow.col6_tmc);
        row.getCell(7).value = roundCurrency(dRow.col7_salary);
        row.getCell(8).value = roundCurrency(dRow.col8_taxes);
        row.getCell(9).value = roundCurrency(dRow.col9_other);
        row.getCell(10).value = roundCurrency(dRow.col10_amortization);
        row.getCell(11).value = {
          formula: `D${rIdx}-SUM(F${rIdx}:J${rIdx})`,
          result: roundCurrency(dRow.col11_profit),
        };

        styleMainSheetDataRow(row, numericColumns, false);
        currentRowIndex++;
      }
    }

    const qEndRow = currentRowIndex - 1;

    // Проміжний підсумок за квартал: =SUM(...)
    const qTotalRowIdx = currentRowIndex;
    quarterSummaryRowNumbers.push(qTotalRowIdx);
    const qTotalRow = ws1.getRow(qTotalRowIdx);
    qTotalRow.getCell(1).value = qBlock.quarterLabel;
    qTotalRow.getCell(5).value = '';

    const qTotalsMap: Record<number, number> = {
      2: qBlock.quarterTotals.col2_income,
      3: qBlock.quarterTotals.col3_return,
      4: qBlock.quarterTotals.col4_netIncome,
      6: qBlock.quarterTotals.col6_tmc,
      7: qBlock.quarterTotals.col7_salary,
      8: qBlock.quarterTotals.col8_taxes,
      9: qBlock.quarterTotals.col9_other,
      10: qBlock.quarterTotals.col10_amortization,
      11: qBlock.quarterTotals.col11_profit,
    };

    for (const colNum of numericColumns) {
      const colLet = columnLetters[colNum];
      qTotalRow.getCell(colNum).value = {
        formula: `SUM(${colLet}${qStartRow}:${colLet}${qEndRow})`,
        result: roundCurrency(qTotalsMap[colNum]),
      };
    }

    styleMainSheetDataRow(qTotalRow, numericColumns, true, 'FFF1F5F9');
    currentRowIndex++;

    // Наростаючий підсумок (за I кв., І півріччя, 9 місяців, або РІК)
    const cumRowIdx = currentRowIndex;
    const cumRow = ws1.getRow(cumRowIdx);
    cumRow.getCell(1).value = qBlock.cumulativeLabel;
    cumRow.getCell(5).value = '';

    const cumTotalsMap: Record<number, number> = {
      2: qBlock.cumulativeTotals.col2_income,
      3: qBlock.cumulativeTotals.col3_return,
      4: qBlock.cumulativeTotals.col4_netIncome,
      6: qBlock.cumulativeTotals.col6_tmc,
      7: qBlock.cumulativeTotals.col7_salary,
      8: qBlock.cumulativeTotals.col8_taxes,
      9: qBlock.cumulativeTotals.col9_other,
      10: qBlock.cumulativeTotals.col10_amortization,
      11: qBlock.cumulativeTotals.col11_profit,
    };

    for (const colNum of numericColumns) {
      const colLet = columnLetters[colNum];
      const sumArgs = quarterSummaryRowNumbers.map((rNum) => `${colLet}${rNum}`).join(',');
      cumRow.getCell(colNum).value = {
        formula: `SUM(${sumArgs})`,
        result: roundCurrency(cumTotalsMap[colNum]),
      };
    }

    const isAnnualFinalRow = qBlock.quarter === 4;
    styleMainSheetDataRow(
      cumRow,
      numericColumns,
      true,
      isAnnualFinalRow ? 'FFDBEAFE' : 'FFE2E8F0'
    );
    currentRowIndex++;
  }

  // Підпис платника податків унизу Аркуша 1
  currentRowIndex += 2;
  ws1.mergeCells(`A${currentRowIndex}:K${currentRowIndex}`);
  const signCell = ws1.getCell(`A${currentRowIndex}`);
  signCell.value = `Платник податків: _____________________ / ${fullNameText} /`;
  signCell.font = FONT_BOLD;

  // ============================================================================
  // АРКУШ 2: «Амортизація» (Додаток до типової форми № 261)
  // ============================================================================
  const ws2 = workbook.addWorksheet('Амортизація', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
    },
  });

  // 12 граф Додатка (A..L)
  ws2.columns = [
    { key: 'c1', width: 6 }, // A: Графа 1 (№ з/п)
    { key: 'c2', width: 24 }, // B: Графа 2 (Група ОЗ/НА)
    { key: 'c3', width: 22 }, // C: Графа 3 (Назва об'єкта)
    { key: 'c4', width: 20 }, // D: Графа 4 (Документ придбання)
    { key: 'c5', width: 20 }, // E: Графа 5 (Документ введення в експлуатацію)
    { key: 'c6', width: 11 }, // F: Графа 6 (Строк корисного використання, років)
    { key: 'c7', width: 15 }, // G: Графа 7 (Первісна вартість)
    { key: 'c8', width: 14 }, // H: Графа 8 (Річна сума амортизації =G/F)
    { key: 'c9', width: 14 }, // I: Графа 9 (Місячна сума амортизації =H/12)
    { key: 'c10', width: 15 }, // J: Графа 10 (Вартість на початок періоду)
    { key: 'c11', width: 15 }, // K: Графа 11 (Сума амортизації за рік)
    { key: 'c12', width: 15 }, // L: Графа 12 (Вартість на кінець періоду =J-K)
  ];

  // Гриф Додатка (Рядки 1–3)
  const appLines = [
    'Додаток',
    'до типової форми, за якою здійснюється облік доходів і витрат',
    'фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність',
  ];
  appLines.forEach((text, idx) => {
    const r = idx + 1;
    ws2.mergeCells(`H${r}:L${r}`);
    const cell = ws2.getCell(`H${r}`);
    cell.value = text;
    cell.font = FONT_REGULAR;
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Заголовок Додатка (Рядки 5–6)
  ws2.mergeCells('A5:L5');
  const appTitle1 = ws2.getCell('A5');
  appTitle1.value =
    'ОБЛІК АМОРТИЗАЦІЙНИХ ВІДРАХУВАНЬ основних засобів та нематеріальних активів';
  appTitle1.font = FONT_TITLE;
  appTitle1.alignment = { horizontal: 'center', vertical: 'middle' };

  ws2.mergeCells('A6:L6');
  const appTitle2 = ws2.getCell('A6');
  appTitle2.value = `Платник податків: ${fullNameText} (РНОКПП: ${taxIdText})   |   Звітний період: ${amortizationReport.year} рік`;
  appTitle2.font = FONT_BOLD;
  appTitle2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Шапка Додатка (Рядки 8–10, 12 граф)
  ws2.mergeCells('A8:A9');
  ws2.mergeCells('B8:B9');
  ws2.mergeCells('C8:C9');
  ws2.mergeCells('D8:E8');
  ws2.mergeCells('F8:F9');
  ws2.mergeCells('G8:G9');
  ws2.mergeCells('H8:I8');
  ws2.mergeCells('J8:J9');
  ws2.mergeCells('K8:K9');
  ws2.mergeCells('L8:L9');

  ws2.getCell('A8').value = '№ з/п';
  ws2.getCell('B8').value = 'Група основних засобів та нематеріальних активів';
  ws2.getCell('C8').value = 'Назва об’єкта основних засобів / нематеріальних активів';
  ws2.getCell('D8').value = 'Реквізити документа, що підтверджує';
  ws2.getCell('D9').value = 'придбання (виготовлення) основних засобів / НА';
  ws2.getCell('E9').value = 'введення в експлуатацію основних засобів / НА';
  ws2.getCell('F8').value = 'Строк корисного використання (експлуатації) об’єкта (років)';
  ws2.getCell('G8').value =
    'Первісна вартість об’єкта основних засобів / нематеріальних активів (грн, коп.)';
  ws2.getCell('H8').value = 'Розрахунок суми амортизаційних відрахувань';
  ws2.getCell('H9').value = 'річна сума амортизації (гр. 7 / гр. 6) (грн, коп.)';
  ws2.getCell('I9').value = 'місячна сума амортизації (гр. 8 / 12) (грн, коп.)';
  ws2.getCell('J8').value =
    'Вартість об’єкта ОЗ / НА на початок звітного періоду (грн, коп.)';
  ws2.getCell('K8').value =
    'Сума амортизаційних відрахувань за звітний період (рік) (грн, коп.)';
  ws2.getCell('L8').value =
    'Вартість об’єкта ОЗ / НА на кінець звітного періоду (гр. 10 – гр. 11) (грн, коп.)';

  ws2.getRow(8).height = 24;
  ws2.getRow(9).height = 48;
  ws2.getRow(10).height = 18;

  for (let c = 1; c <= 12; c++) {
    ws2.getCell(10, c).value = c;
  }

  for (let r = 8; r <= 10; r++) {
    for (let c = 1; c <= 12; c++) {
      const cell = ws2.getCell(r, c);
      cell.font = FONT_BOLD;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r === 10 ? 'FFE2E8F0' : 'FFF8FAFC' },
      };
    }
  }

  const amortNumericCols = [7, 8, 9, 10, 11, 12]; // G, H, I, J, K, L
  let ws2RowIdx = 11;
  const ws2StartRow = ws2RowIdx;

  if (amortizationReport.rows.length === 0) {
    const row = ws2.getRow(ws2RowIdx);
    row.getCell(1).value = 1;
    row.getCell(2).value = '—';
    row.getCell(3).value = 'Об’єкти ОЗ/НА відсутні';
    row.getCell(4).value = '';
    row.getCell(5).value = '';
    row.getCell(6).value = 1;
    row.getCell(7).value = 0;
    row.getCell(8).value = { formula: `G${ws2RowIdx}/F${ws2RowIdx}`, result: 0 };
    row.getCell(9).value = { formula: `H${ws2RowIdx}/12`, result: 0 };
    row.getCell(10).value = 0;
    row.getCell(11).value = 0;
    row.getCell(12).value = { formula: `J${ws2RowIdx}-K${ws2RowIdx}`, result: 0 };
    styleAmortSheetRow(row, amortNumericCols, false);
    ws2RowIdx++;
  } else {
    for (const aRow of amortizationReport.rows) {
      const rIdx = ws2RowIdx;
      const row = ws2.getRow(rIdx);

      row.getCell(1).value = aRow.index;
      row.getCell(2).value = aRow.col2_groupName;
      row.getCell(3).value = aRow.col3_assetName;
      row.getCell(4).value = aRow.col4_purchaseDoc;
      row.getCell(5).value = aRow.col5_commissioningDoc;
      row.getCell(6).value = aRow.col6_usefulLifeYears;
      row.getCell(7).value = roundCurrency(aRow.col7_initialCost);
      // Формула кол. H: =G{i}/F{i}
      row.getCell(8).value = {
        formula: `G${rIdx}/F${rIdx}`,
        result: roundCurrency(aRow.col8_annualAmount),
      };
      // Формула кол. I: =H{i}/12
      row.getCell(9).value = {
        formula: `H${rIdx}/12`,
        result: roundCurrency(aRow.col9_monthlyAmount),
      };
      row.getCell(10).value = roundCurrency(aRow.col10_startPeriodValue);
      row.getCell(11).value = roundCurrency(aRow.col11_yearAmortization);
      // Формула кол. L: =J{i}-K{i}
      row.getCell(12).value = {
        formula: `J${rIdx}-K${rIdx}`,
        result: roundCurrency(aRow.col12_endPeriodValue),
      };

      styleAmortSheetRow(row, amortNumericCols, false);
      ws2RowIdx++;
    }
  }

  const ws2EndRow = ws2RowIdx - 1;

  // Підсумковий рядок Аркуша 2 («Усього»)
  const totalRow = ws2.getRow(ws2RowIdx);
  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = 'УСЬОГО';
  totalRow.getCell(3).value = '';
  totalRow.getCell(4).value = '';
  totalRow.getCell(5).value = '';
  totalRow.getCell(6).value = '';

  const amortColLetters: Record<number, { letter: string; result: number }> = {
    7: { letter: 'G', result: amortizationReport.totalInitialCost },
    8: { letter: 'H', result: amortizationReport.totalAnnualAmount },
    9: { letter: 'I', result: amortizationReport.totalMonthlyAmount },
    10: { letter: 'J', result: amortizationReport.totalStartPeriodValue },
    11: { letter: 'K', result: amortizationReport.totalYearAmortization },
    12: { letter: 'L', result: amortizationReport.totalEndPeriodValue },
  };

  for (const colNum of amortNumericCols) {
    const info = amortColLetters[colNum];
    totalRow.getCell(colNum).value = {
      formula: `SUM(${info.letter}${ws2StartRow}:${info.letter}${ws2EndRow})`,
      result: roundCurrency(info.result),
    };
  }

  styleAmortSheetRow(totalRow, amortNumericCols, true);

  // Запис у буфер та нативне збереження (Android Capacitor Filesystem + Share) або скачування у браузері
  const buffer = await workbook.xlsx.writeBuffer();
  const safeTaxId = profile.taxId ? `_${profile.taxId}` : '';
  const fileName = `Forma_261_${annualReport.year}${safeTaxId}.xlsx`;

  return saveOrShareBinaryFile({
    fileName,
    buffer: buffer as ArrayBuffer,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    shareTitle: `Типова форма № 261 за ${annualReport.year} рік`,
    shareText: `Річний звіт з обліку доходів і витрат (Форма № 261) та Додаток з амортизації за ${annualReport.year} рік.`,
    autoShareOnNative,
  });
}

function styleMainSheetDataRow(
  row: ExcelJS.Row,
  numericColumns: number[],
  isSummary: boolean,
  bgColorArgb?: string
) {
  for (let c = 1; c <= 11; c++) {
    const cell = row.getCell(c);
    cell.font = isSummary ? FONT_BOLD : FONT_REGULAR;
    cell.border = THIN_BORDER;

    if (numericColumns.includes(c)) {
      cell.numFmt = CURRENCY_FORMAT;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (c === 1) {
      cell.alignment = { horizontal: isSummary ? 'left' : 'center', vertical: 'middle', wrapText: true };
    } else {
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    }

    if (bgColorArgb) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColorArgb },
      };
    }
  }
}

function styleAmortSheetRow(
  row: ExcelJS.Row,
  numericColumns: number[],
  isSummary: boolean
) {
  for (let c = 1; c <= 12; c++) {
    const cell = row.getCell(c);
    cell.font = isSummary ? FONT_BOLD : FONT_REGULAR;
    cell.border = THIN_BORDER;

    if (numericColumns.includes(c)) {
      cell.numFmt = CURRENCY_FORMAT;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else if (c === 1 || c === 6) {
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    }

    if (isSummary) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFDBEAFE' },
      };
    }
  }
}
