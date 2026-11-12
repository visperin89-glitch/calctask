import type {
  AmortizationAppendixReport,
  AnnualReportData,
  PeriodSummaryTotals,
  TaxProfile,
} from '../types/tax';
import { formatCurrency } from './calculations';
import { saveOrShareBinaryFile, type SaveFileResult } from './nativePlatform';

interface PdfPageImage {
  jpegBytes: Uint8Array;
  widthPx: number;
  heightPx: number;
  pageWidthPt: number;
  pageHeightPt: number;
}

/**
 * Конвертує data:image/jpeg;base64,... у масив байтів Uint8Array.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

/**
 * Формує бінарний багатосторінковий файл PDF 1.4 із масиву відрендерених сторінок (JPEG).
 */
function buildPdfFromJpegPages(pages: PdfPageImage[]): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let byteOffset = 0;

  const pushString = (str: string) => {
    const encoded = encoder.encode(str);
    chunks.push(encoded);
    byteOffset += encoded.byteLength;
  };

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteOffset += bytes.byteLength;
  };

  // Об'єкти PDF:
  // 1: Catalog
  // 2: Pages
  // Для кожної сторінки i (0..N-1):
  //   pageObjId = 3 + i * 3
  //   contentObjId = 4 + i * 3
  //   imageObjId = 5 + i * 3
  const totalObjects = 2 + pages.length * 3;
  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  pushString('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: Catalog
  offsets[1] = byteOffset;
  pushString('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: Pages
  const kidsRefs = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(' ');
  offsets[2] = byteOffset;
  pushString(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pages.length} >>\nendobj\n`);

  pages.forEach((p, idx) => {
    const pageObjId = 3 + idx * 3;
    const contentObjId = 4 + idx * 3;
    const imageObjId = 5 + idx * 3;
    const imgName = `/Im${idx + 1}`;

    // Page Object
    offsets[pageObjId] = byteOffset;
    pushString(
      `${pageObjId} 0 obj\n` +
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pageWidthPt} ${p.pageHeightPt}] ` +
        `/Resources << /XObject << ${imgName} ${imageObjId} 0 R >> >> ` +
        `/Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content Stream (малює зображення на всю сторінку)
    const contentStream = `q\n${p.pageWidthPt} 0 0 ${p.pageHeightPt} 0 0 cm\n${imgName} Do\nQ\n`;
    offsets[contentObjId] = byteOffset;
    pushString(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    );

    // Image XObject (DCTDecode JPEG)
    offsets[imageObjId] = byteOffset;
    pushString(
      `${imageObjId} 0 obj\n` +
        `<< /Type /XObject /Subtype /Image /Width ${p.widthPx} /Height ${p.heightPx} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.byteLength} >>\n` +
        `stream\n`
    );
    pushBytes(p.jpegBytes);
    pushString('\nendstream\nendobj\n');
  });

  const xrefOffset = byteOffset;
  pushString(`xref\n0 ${totalObjects + 1}\n`);
  pushString('0000000000 65535 f \n');
  for (let objId = 1; objId <= totalObjects; objId++) {
    const padded = String(offsets[objId]).padStart(10, '0');
    pushString(`${padded} 00000 n \n`);
  }

  pushString(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const output = new Uint8Array(byteOffset);
  let pos = 0;
  for (const chunk of chunks) {
    output.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return output.buffer;
}

/**
 * Розбиває довгий рядок на масив рядків за шириною колонки у Canvas.
 */
function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/**
 * Генерація друкованого PDF-бланка («Експорт у PDF (Книжкова форма)»)
 * з точним збереженням табличної структури граф 1–11 Типової форми № 261
 * та граф 1–12 Додатка з обліку амортизаційних відрахувань (Наказ Мінфіну № 261),
 * реквізитами платника в шапці та підсумками за період.
 */
export async function exportTaxBookToPdf(
  profile: TaxProfile,
  annualReport: AnnualReportData,
  amortizationReport: AmortizationAppendixReport,
  autoShareOnNative = true
): Promise<SaveFileResult> {
  // Книжкова форма A4 (Portrait: 595.28 x 841.89 pt, рендеримо у високій роздільності 1400 x 1980 px)
  const PAGE_W_PT = 595.28;
  const PAGE_H_PT = 841.89;
  const CANVAS_W = 1400;
  const CANVAS_H = 1980;
  const MARGIN_X = 48;
  const TABLE_W = CANVAS_W - MARGIN_X * 2; // 1304 px

  const fullNameText =
    profile.fullName?.trim() || '__________________________________________________';
  const taxIdText = profile.taxId?.trim() || '_________________________';
  const activityLabel =
    profile.activityType === 'independent'
      ? 'Фізична особа, яка провадить незалежну професійну діяльність (ст. 178 ПКУ)'
      : 'Фізична особа – підприємець на загальній системі оподаткування (ст. 177 ПКУ)';

  const pages: PdfPageImage[] = [];

  const createBlankCanvas = (): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } => {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Не вдалося ініціалізувати графічний контекст для формування PDF.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    return { canvas, ctx };
  };

  const commitCanvasPage = (canvas: HTMLCanvasElement, pageNumber: number) => {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#64748b';
    ctx.font = '16px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Сторінка ${pageNumber} • Наказ Мінфіну № 261 (${annualReport.year} р.)`,
      CANVAS_W - MARGIN_X,
      CANVAS_H - 28
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    pages.push({
      jpegBytes: dataUrlToUint8Array(dataUrl),
      widthPx: CANVAS_W,
      heightPx: CANVAS_H,
      pageWidthPt: PAGE_W_PT,
      pageHeightPt: PAGE_H_PT,
    });
  };

  // =========================================================================
  // РОЗДІЛ 1: ТИПОВА ФОРМА № 261 (Графи 1–11)
  // =========================================================================
  const colWidths11 = [
    94, // Гр. 1: Дата
    108, // Гр. 2: Дохід
    96, // Гр. 3: Повернення
    108, // Гр. 4: Загальна сума доходу
    244, // Гр. 5: Реквізити документа
    104, // Гр. 6: ТМЦ
    104, // Гр. 7: Оплата праці
    104, // Гр. 8: Податки, ЄСВ
    104, // Гр. 9: Інші витрати
    104, // Гр. 10: Амортизація
    130, // Гр. 11: Чистий дохід
  ];

  const colHeaders11 = [
    'Дата запису (день, місяць, рік)',
    'Сума доходу (грн, коп.)',
    'Сума повернутих коштів (грн, коп.)',
    'Дохід до декларування (гр.2−гр.3)',
    'Реквізити документа, що підтверджує витрати',
    'Витрати на ТМЦ (грн, коп.)',
    'Оплата праці (грн, коп.)',
    'Податки, збори, ЄСВ (грн, коп.)',
    'Інші витрати (грн, коп.)',
    'Амортизація ОЗ/НА (грн, коп.)',
    'Чистий оподатк. дохід (гр.4−гр.6..10)',
  ];

  const drawMainSheetHeader = (
    ctx: CanvasRenderingContext2D,
    isFirstPage: boolean
  ): number => {
    let y = 46;

    if (isFirstPage) {
      // Гриф затвердження праворуч
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('ЗАТВЕРДЖЕНО', CANVAS_W - MARGIN_X, y);
      y += 20;
      ctx.font = '15px Arial, sans-serif';
      ctx.fillText('Наказ Міністерства фінансів України', CANVAS_W - MARGIN_X, y);
      y += 20;
      ctx.fillText('13 травня 2021 року № 261', CANVAS_W - MARGIN_X, y);
      y += 30;

      // Назва форми по центру
      ctx.textAlign = 'center';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText(
        'ТИПОВА ФОРМА, за якою здійснюється облік доходів і витрат',
        CANVAS_W / 2,
        y
      );
      y += 26;
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(
        'фізичними особами – підприємцями і фізичними особами, які провадять незалежну професійну діяльність',
        CANVAS_W / 2,
        y
      );
      y += 32;

      // Блок реквізитів платника
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.fillRect(MARGIN_X, y, TABLE_W, 84);
      ctx.strokeRect(MARGIN_X, y, TABLE_W, 84);

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillText(`Платник податків (ПІБ): ${fullNameText}`, MARGIN_X + 16, y + 28);
      ctx.font = '16px Arial, sans-serif';
      ctx.fillText(`Категорія: ${activityLabel}`, MARGIN_X + 16, y + 52);
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(
        `РНОКПП / серія та номер паспорта: ${taxIdText}     |     Звітний період: ${annualReport.year} рік${
          profile.isVatPayer ? '     |     Платник ПДВ (суми без ПДВ)' : ''
        }`,
        MARGIN_X + 16,
        y + 74
      );
      y += 102;
    } else {
      ctx.fillStyle = '#334155';
      ctx.textAlign = 'left';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(
        `Типова форма № 261 (${annualReport.year} рік) — ${fullNameText} (продовження)`,
        MARGIN_X,
        y
      );
      y += 20;
    }

    // Шапка таблиці 11 граф
    const headerH = 92;
    const numRowH = 26;
    let curX = MARGIN_X;

    for (let c = 0; c < 11; c++) {
      const w = colWidths11[c];
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(curX, y, w, headerH);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(curX, y, w, headerH);

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 13px Arial, sans-serif';
      ctx.textAlign = 'center';
      const lines = wrapCanvasText(ctx, colHeaders11[c], w - 8);
      const startTextY = y + Math.max(18, (headerH - lines.length * 15) / 2 + 11);
      lines.forEach((line, lIdx) => {
        ctx.fillText(line, curX + w / 2, startTextY + lIdx * 15);
      });

      // Рядок з номером графи (1..11)
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(curX, y + headerH, w, numRowH);
      ctx.strokeRect(curX, y + headerH, w, numRowH);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText(String(c + 1), curX + w / 2, y + headerH + 18);

      curX += w;
    }

    return y + headerH + numRowH;
  };

  let currentCanvasObj = createBlankCanvas();
  let curY = drawMainSheetHeader(currentCanvasObj.ctx, true);

  const ensureSpaceMain = (neededH: number) => {
    if (curY + neededH > CANVAS_H - 90) {
      commitCanvasPage(currentCanvasObj.canvas, pages.length + 1);
      currentCanvasObj = createBlankCanvas();
      curY = drawMainSheetHeader(currentCanvasObj.ctx, false);
    }
  };

  const drawMainRow = (
    cells: string[],
    options: { isBold?: boolean; bgColor?: string } = {}
  ) => {
    const ctx = currentCanvasObj.ctx;
    ctx.font = `${options.isBold ? 'bold ' : ''}14px Arial, sans-serif`;

    // Визначаємо висоту рядка за кількістю рядків у Графі 1 та Графі 5
    const col1Lines = wrapCanvasText(ctx, cells[0], colWidths11[0] - 10);
    const col5Lines = wrapCanvasText(ctx, cells[4], colWidths11[4] - 12);
    const maxLines = Math.max(col1Lines.length, col5Lines.length, 1);
    const rowH = Math.max(30, maxLines * 17 + 12);

    ensureSpaceMain(rowH);

    let curX = MARGIN_X;
    for (let c = 0; c < 11; c++) {
      const w = colWidths11[c];
      if (options.bgColor) {
        ctx.fillStyle = options.bgColor;
        ctx.fillRect(curX, curY, w, rowH);
      }
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1;
      ctx.strokeRect(curX, curY, w, rowH);

      ctx.fillStyle = '#0f172a';
      ctx.font = `${options.isBold ? 'bold ' : ''}13.5px Arial, sans-serif`;

      if (c === 0) {
        ctx.textAlign = options.isBold ? 'left' : 'center';
        col1Lines.forEach((ln, idx) => {
          const tx = options.isBold ? curX + 6 : curX + w / 2;
          ctx.fillText(ln, tx, curY + 19 + idx * 16);
        });
      } else if (c === 4) {
        ctx.textAlign = 'left';
        col5Lines.forEach((ln, idx) => {
          ctx.fillText(ln, curX + 6, curY + 19 + idx * 16);
        });
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(cells[c], curX + w - 6, curY + 20);
      }

      curX += w;
    }

    curY += rowH;
  };

  const totalsToCells = (label: string, t: PeriodSummaryTotals): string[] => [
    label,
    formatCurrency(t.col2_income),
    formatCurrency(t.col3_return),
    formatCurrency(t.col4_netIncome),
    '—',
    formatCurrency(t.col6_tmc),
    formatCurrency(t.col7_salary),
    formatCurrency(t.col8_taxes),
    formatCurrency(t.col9_other),
    formatCurrency(t.col10_amortization),
    formatCurrency(t.col11_profit),
  ];

  for (const qBlock of annualReport.quarters) {
    if (qBlock.rows.length === 0) {
      drawMainRow(
        [
          `— (${qBlock.quarter} кв.)`,
          '0,00',
          '0,00',
          '0,00',
          `Операції у ${qBlock.quarter} кварталі відсутні`,
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
          '0,00',
        ],
        { isBold: false }
      );
    } else {
      for (const r of qBlock.rows) {
        drawMainRow(
          [
            r.formattedDate,
            formatCurrency(r.col2_income),
            formatCurrency(r.col3_return),
            formatCurrency(r.col4_netIncome),
            r.col5_docs || '—',
            formatCurrency(r.col6_tmc),
            formatCurrency(r.col7_salary),
            formatCurrency(r.col8_taxes),
            formatCurrency(r.col9_other),
            formatCurrency(r.col10_amortization),
            formatCurrency(r.col11_profit),
          ],
          {
            isBold: false,
            bgColor: r.isAmortizationEntry ? '#eff6ff' : undefined,
          }
        );
      }
    }

    drawMainRow(totalsToCells(qBlock.quarterLabel, qBlock.quarterTotals), {
      isBold: true,
      bgColor: '#f1f5f9',
    });

    drawMainRow(totalsToCells(qBlock.cumulativeLabel, qBlock.cumulativeTotals), {
      isBold: true,
      bgColor: qBlock.quarter === 4 ? '#dbeafe' : '#e2e8f0',
    });
  }

  // Підпис платника податків унизу Типової форми № 261
  ensureSpaceMain(65);
  curY += 34;
  currentCanvasObj.ctx.fillStyle = '#0f172a';
  currentCanvasObj.ctx.font = 'bold 16px Arial, sans-serif';
  currentCanvasObj.ctx.textAlign = 'left';
  currentCanvasObj.ctx.fillText(
    `Платник податків: _________________________ / ${fullNameText} /`,
    MARGIN_X,
    curY
  );

  commitCanvasPage(currentCanvasObj.canvas, pages.length + 1);

  // =========================================================================
  // РОЗДІЛ 2: ДОДАТОК ДО ТИПОВОЇ ФОРМИ № 261 (Амортизація — Графи 1–12)
  // =========================================================================
  const colWidths12 = [
    46, // Гр. 1: № з/п
    160, // Гр. 2: Група ОЗ/НА
    170, // Гр. 3: Назва об'єкта
    138, // Гр. 4: Документ придбання
    138, // Гр. 5: Документ введення
    68, // Гр. 6: Строк (років)
    98, // Гр. 7: Первісна вартість
    96, // Гр. 8: Річна аморт.
    96, // Гр. 9: Місячна аморт.
    98, // Гр. 10: Вартість на поч.
    98, // Гр. 11: Амортизація за рік
    98, // Гр. 12: Вартість на кін.
  ];

  const colHeaders12 = [
    '№ з/п',
    'Група основних засобів та НА',
    'Назва об’єкта ОЗ / НА',
    'Реквізити док. придбання',
    'Реквізити док. введення в експл.',
    'Строк (років)',
    'Первісна вартість (грн, коп.)',
    'Річна сума аморт. (гр.7/гр.6)',
    'Місячна сума аморт. (гр.8/12)',
    'Вартість на поч. періоду',
    'Сума аморт. за рік (грн, коп.)',
    'Вартість на кін. періоду (гр.10−11)',
  ];

  const amortCanvasObj = createBlankCanvas();
  const actx = amortCanvasObj.ctx;
  let ay = 46;

  actx.fillStyle = '#0f172a';
  actx.font = 'bold 16px Arial, sans-serif';
  actx.textAlign = 'right';
  actx.fillText('Додаток', CANVAS_W - MARGIN_X, ay);
  ay += 20;
  actx.font = '15px Arial, sans-serif';
  actx.fillText(
    'до типової форми обліку доходів і витрат (пункт 1 розділу ІІІ)',
    CANVAS_W - MARGIN_X,
    ay
  );
  ay += 32;

  actx.textAlign = 'center';
  actx.font = 'bold 21px Arial, sans-serif';
  actx.fillText(
    'ОБЛІК АМОРТИЗАЦІЙНИХ ВІДРАХУВАНЬ основних засобів та нематеріальних активів',
    CANVAS_W / 2,
    ay
  );
  ay += 26;
  actx.font = 'bold 16px Arial, sans-serif';
  actx.fillText(
    `Платник: ${fullNameText} (РНОКПП: ${taxIdText})   |   Звітний період: ${amortizationReport.year} рік`,
    CANVAS_W / 2,
    ay
  );
  ay += 28;

  // Шапка 12 граф Додатка
  const amortHeaderH = 88;
  const amortNumH = 26;
  let ax = MARGIN_X;
  for (let c = 0; c < 12; c++) {
    const w = colWidths12[c];
    actx.fillStyle = '#f1f5f9';
    actx.fillRect(ax, ay, w, amortHeaderH);
    actx.strokeStyle = '#334155';
    actx.lineWidth = 1.2;
    actx.strokeRect(ax, ay, w, amortHeaderH);

    actx.fillStyle = '#0f172a';
    actx.font = 'bold 12.5px Arial, sans-serif';
    actx.textAlign = 'center';
    const lines = wrapCanvasText(actx, colHeaders12[c], w - 8);
    const startY = ay + Math.max(18, (amortHeaderH - lines.length * 15) / 2 + 11);
    lines.forEach((ln, idx) => {
      actx.fillText(ln, ax + w / 2, startY + idx * 15);
    });

    actx.fillStyle = '#e2e8f0';
    actx.fillRect(ax, ay + amortHeaderH, w, amortNumH);
    actx.strokeRect(ax, ay + amortHeaderH, w, amortNumH);
    actx.fillStyle = '#0f172a';
    actx.font = 'bold 14px Arial, sans-serif';
    actx.fillText(String(c + 1), ax + w / 2, ay + amortHeaderH + 18);

    ax += w;
  }
  ay += amortHeaderH + amortNumH;

  const drawAmortRow = (
    cells: string[],
    isSummary = false
  ) => {
    actx.font = `${isSummary ? 'bold ' : ''}13px Arial, sans-serif`;
    const wrappedPerCol = cells.map((txt, idx) =>
      idx >= 1 && idx <= 4 ? wrapCanvasText(actx, txt, colWidths12[idx] - 10) : [txt]
    );
    const maxLines = Math.max(...wrappedPerCol.map((arr) => arr.length), 1);
    const rowH = Math.max(32, maxLines * 16 + 12);

    let rx = MARGIN_X;
    for (let c = 0; c < 12; c++) {
      const w = colWidths12[c];
      if (isSummary) {
        actx.fillStyle = '#dbeafe';
        actx.fillRect(rx, ay, w, rowH);
      }
      actx.strokeStyle = '#64748b';
      actx.lineWidth = 1;
      actx.strokeRect(rx, ay, w, rowH);

      actx.fillStyle = '#0f172a';
      actx.font = `${isSummary ? 'bold ' : ''}13px Arial, sans-serif`;

      if (c === 0 || c === 5) {
        actx.textAlign = 'center';
        actx.fillText(cells[c], rx + w / 2, ay + 20);
      } else if (c >= 1 && c <= 4) {
        actx.textAlign = 'left';
        wrappedPerCol[c].forEach((ln, idx) => {
          actx.fillText(ln, rx + 5, ay + 18 + idx * 15);
        });
      } else {
        actx.textAlign = 'right';
        actx.fillText(cells[c], rx + w - 5, ay + 20);
      }
      rx += w;
    }
    ay += rowH;
  };

  if (amortizationReport.rows.length === 0) {
    drawAmortRow([
      '1',
      '—',
      'Об’єкти ОЗ / НА відсутні',
      '—',
      '—',
      '—',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
    ]);
  } else {
    for (const r of amortizationReport.rows) {
      drawAmortRow([
        String(r.index),
        r.col2_groupName,
        r.col3_assetName,
        r.col4_purchaseDoc,
        r.col5_commissioningDoc,
        String(r.col6_usefulLifeYears),
        formatCurrency(r.col7_initialCost),
        formatCurrency(r.col8_annualAmount),
        formatCurrency(r.col9_monthlyAmount),
        formatCurrency(r.col10_startPeriodValue),
        formatCurrency(r.col11_yearAmortization),
        formatCurrency(r.col12_endPeriodValue),
      ]);
    }
  }

  drawAmortRow(
    [
      '',
      'УСЬОГО',
      '',
      '',
      '',
      '',
      formatCurrency(amortizationReport.totalInitialCost),
      formatCurrency(amortizationReport.totalAnnualAmount),
      formatCurrency(amortizationReport.totalMonthlyAmount),
      formatCurrency(amortizationReport.totalStartPeriodValue),
      formatCurrency(amortizationReport.totalYearAmortization),
      formatCurrency(amortizationReport.totalEndPeriodValue),
    ],
    true
  );

  ay += 34;
  actx.fillStyle = '#0f172a';
  actx.font = 'bold 16px Arial, sans-serif';
  actx.textAlign = 'left';
  actx.fillText(
    `Платник податків: _________________________ / ${fullNameText} /`,
    MARGIN_X,
    ay
  );

  commitCanvasPage(amortCanvasObj.canvas, pages.length + 1);

  const pdfBuffer = buildPdfFromJpegPages(pages);
  const safeTaxId = profile.taxId ? `_${profile.taxId}` : '';
  const fileName = `Forma_261_${annualReport.year}${safeTaxId}_Book.pdf`;

  return saveOrShareBinaryFile({
    fileName,
    buffer: pdfBuffer,
    mimeType: 'application/pdf',
    shareTitle: `Книга обліку № 261 (PDF) за ${annualReport.year} рік`,
    shareText: `Друкована книжкова форма звіту з обліку доходів і витрат (Наказ Мінфіну № 261) за ${annualReport.year} рік.`,
    autoShareOnNative,
  });
}
