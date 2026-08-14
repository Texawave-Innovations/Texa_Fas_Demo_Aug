import jsPDF from 'jspdf';

export interface WOForPDF {
  workOrderNo: string;
  customerName: string;
  customerId: string;
  fgItem: string;
  fgDescription: string;
  poNo: string;
  soNo: string;
  poQty: string | number;
  requiredQty: string | number;
  dueDate: string;
  createDate: string;
  workOrderType: string;
  detail?: {
    rmGrade?: string;
    materialCode?: string;
    rmCode?: string;
    sizeL?: string;
    sizeW?: string;
    sizeH?: string;
    totalWeight?: string;
    warehouse?: string;
  };
  routeSequence?: {
    header?: { routeId?: string; routeName?: string; routeType?: string };
    rows?: Record<string, SeqRow> | SeqRow[];
  };
}

interface SeqRow {
  processType: string;
  processName: string;
  productionMethod: string;
  location: string;
  processDueDate: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function normaliseRows(raw: Record<string, SeqRow> | SeqRow[] | undefined): SeqRow[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : Object.values(raw);
}

function v(s?: string | number) { return s != null ? String(s) : ''; }

export function generateWorkOrderPDF(wo: WOForPDF) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const PW = 297, PH = 210;
  const ML = 5, MT = 5;
  const CW = PW - ML * 2;           // 287 mm usable width
  const BOTTOM = PH - 5;            // bottom boundary

  const seqRows = normaliseRows(wo.routeSequence?.rows);
  const routeHeader = wo.routeSequence?.header || {};

  // ── draw helpers ────────────────────────────────────────────────────────────

  const bold = (size = 7) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(size); };
  const norm = (size = 6) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); };

  /** Draw a cell with a small top-left label and a value in the lower portion */
  function lCell(x: number, y: number, w: number, h: number, label: string, value: string) {
    doc.rect(x, y, w, h);
    norm(5);
    doc.text(label, x + 0.8, y + 3);
    bold(7);
    doc.text(value.substring(0, Math.floor(w / 1.8)), x + 0.8, y + h - 1.5);
  }

  /** Section header bar */
  function secBar(x: number, y: number, w: number, text: string): number {
    doc.setFillColor(210, 210, 210);
    doc.rect(x, y, w, 5.5, 'FD');
    bold(6.5);
    doc.text(text, x + 1.5, y + 4);
    return y + 5.5;
  }

  /** Draw a table header row and return new y */
  function tableHeader(x: number, y: number, cols: { w: number; label: string }[], h = 6): number {
    let cx = x;
    for (const col of cols) {
      doc.rect(cx, y, col.w, h);
      norm(5);
      const lines = doc.splitTextToSize(col.label, col.w - 1);
      doc.text(lines, cx + col.w / 2, y + 3.5, { align: 'center' });
      cx += col.w;
    }
    return y + h;
  }

  /** Draw blank data rows */
  function blankRows(x: number, y: number, cols: { w: number }[], count: number, h = 6): number {
    for (let r = 0; r < count; r++) {
      let cx = x;
      for (const col of cols) {
        doc.rect(cx, y, col.w, h);
        cx += col.w;
      }
      y += h;
    }
    return y;
  }

  /** Draw filled data rows from an array */
  function dataRows(
    x: number, y: number,
    cols: { w: number }[],
    rows: string[][],
    h = 6
  ): number {
    for (const row of rows) {
      let cx = x;
      for (let c = 0; c < cols.length; c++) {
        doc.rect(cx, y, cols[c].w, h);
        norm(6);
        doc.text(v(row[c]).substring(0, Math.floor(cols[c].w / 1.6)), cx + 0.8, y + 4);
        cx += cols[c].w;
      }
      y += h;
    }
    return y;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Header + Moulding + Sintering
  // ════════════════════════════════════════════════════════════════════════════

  let y = MT;

  // ── Top header ──────────────────────────────────────────────────────────────
  const hH = 10;
  const compW = 82, procW = 55, noW = 75, docW = CW - compW - procW - noW;

  // Company
  doc.rect(ML, y, compW, hH);
  bold(8); doc.text('FCS FLUORO CARBON SEALS (P.) LTD.', ML + compW / 2, y + 6.5, { align: 'center' });

  // PROCESS CARD
  doc.rect(ML + compW, y, procW, hH);
  bold(10); doc.text('PROCESS CARD', ML + compW + procW / 2, y + 6.5, { align: 'center' });

  // WO No
  lCell(ML + compW + procW, y, noW, hH, 'NO', wo.workOrderNo);

  // Doc No
  lCell(ML + compW + procW + noW, y, docW, hH, 'Doc No / Rev Date', 'PD-64C/01/97  1st 2024');
  y += hH;

  // ── Row 2 — Customer / Part info ─────────────────────────────────────────
  const r2h = 8;
  const c1 = 32, c2 = 55, c3 = 35, c4 = 25, c5 = 22, c6 = 22, c7 = 22;
  const c8 = CW - c1 - c2 - c3 - c4 - c5 - c6 - c7;

  lCell(ML, y, c1, r2h, 'CUSTOMER CODE', wo.customerId || wo.customerName.slice(0, 10));
  lCell(ML + c1, y, c2, r2h, 'PART NAME', wo.fgDescription.slice(0, 28));
  lCell(ML + c1 + c2, y, c3, r2h, 'FINISH SIZE (L × W × H)',
    wo.detail?.sizeL ? `${wo.detail.sizeL} × ${wo.detail.sizeW} × ${wo.detail.sizeH}` : '');
  lCell(ML + c1 + c2 + c3, y, c4, r2h, 'PLAN NO', '');
  lCell(ML + c1 + c2 + c3 + c4, y, c5, r2h, 'REQ QTY', v(wo.requiredQty));
  lCell(ML + c1 + c2 + c3 + c4 + c5, y, c6, r2h, 'PO QTY', v(wo.poQty));
  lCell(ML + c1 + c2 + c3 + c4 + c5 + c6, y, c7, r2h, 'DUE DATE', wo.dueDate);
  lCell(ML + c1 + c2 + c3 + c4 + c5 + c6 + c7, y, c8, r2h, 'SO NO', wo.soNo);
  y += r2h;

  // ── Row 3 — Part details ─────────────────────────────────────────────────
  const r3h = 8;
  const d1 = 35, d2 = 35, d3 = 25, d4 = 28, d5 = 38, d6 = 25, d7 = 22, d8 = 22;
  const d9 = CW - d1 - d2 - d3 - d4 - d5 - d6 - d7 - d8;

  lCell(ML, y, d1, r3h, 'PART NO', wo.fgItem);
  lCell(ML + d1, y, d2, r3h, 'DW NO / REV NO', '');
  lCell(ML + d1 + d2, y, d3, r3h, 'PART TYPE', '');
  lCell(ML + d1 + d2 + d3, y, d4, r3h, 'PART WEIGHT', v(wo.detail?.totalWeight));
  lCell(ML + d1 + d2 + d3 + d4, y, d5, r3h, 'MATERIAL GRADE', v(wo.detail?.rmGrade));
  lCell(ML + d1 + d2 + d3 + d4 + d5, y, d6, r3h, 'ISSUED TO', '');
  lCell(ML + d1 + d2 + d3 + d4 + d5 + d6, y, d7, r3h, 'ROUTE', v(routeHeader.routeId));
  lCell(ML + d1 + d2 + d3 + d4 + d5 + d6 + d7, y, d8, r3h, 'ROUTE TYPE', v(routeHeader.routeType));
  lCell(ML + d1 + d2 + d3 + d4 + d5 + d6 + d7 + d8, y, d9, r3h, 'IDENTIFICATION', '');
  y += r3h;

  // ── MOULDING DETAILS ─────────────────────────────────────────────────────
  y = secBar(ML, y, CW, 'MOULDING DETAILS (Refer SOP / BI) :                    NO OF CAVITY :             MOULD SIZE :');

  const mouldCols = [
    { w: 7, label: 'S.No' }, { w: 9, label: 'SEM\nPRIORITY' },
    { w: 48, label: 'PARAMETERS' }, { w: 22, label: 'DIE NO' },
    { w: 10, label: 'FIRSTOFF' }, { w: 10, label: '1' }, { w: 10, label: '2' },
    { w: 10, label: '3' }, { w: 10, label: '4' }, { w: 10, label: '5' },
    { w: 20, label: 'PROD.QTY' }, { w: 18, label: 'ACC.QTY' },
    { w: 18, label: 'REJ.QTY' }, { w: 25, label: 'NAME' },
    { w: CW - 7 - 9 - 48 - 22 - 10 - 10 - 10 - 10 - 10 - 10 - 20 - 18 - 18 - 25, label: 'REMARKS' },
  ];
  y = tableHeader(ML, y, mouldCols, 7);
  y = blankRows(ML, y, mouldCols, 4, 7);

  // FIRST/LAST PIECE INSP COMMENTS row
  doc.rect(ML, y, CW * 0.45, 6);
  norm(5.5); doc.text('FIRST / LAST PIECE INSP. COMMENTS :', ML + 1, y + 4);
  doc.rect(ML + CW * 0.45, y, CW * 0.12, 6);
  doc.text('OK', ML + CW * 0.45 + CW * 0.06, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.57, y, CW * 0.13, 6);
  doc.text('NOT OK', ML + CW * 0.57 + CW * 0.065, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.70, y, CW * 0.30, 6);
  norm(5); doc.text('INSPECTED BY :', ML + CW * 0.70 + 1, y + 4);
  y += 6;

  // ── SINTERING DETAILS ────────────────────────────────────────────────────
  y = secBar(ML, y, CW, 'SINTERING DETAILS (Below SOP / BI) :                   REPORT NO :              DATE :');

  const sintCols = [
    { w: 7, label: 'S.No' }, { w: 20, label: 'DATE' }, { w: 20, label: 'START\nDATE' },
    { w: 20, label: 'START\nTIME' }, { w: 20, label: 'END\nDATE' }, { w: 20, label: 'END\nTIME' },
    { w: 16, label: 'OVEN\nNO' }, { w: 16, label: 'HEAT\nNO' }, { w: 18, label: 'PROG\nNO' },
    { w: 12, label: 'OK' }, { w: 14, label: 'NOT OK' }, { w: 22, label: 'TESTED BY' },
    { w: 25, label: 'NAME' },
    { w: CW - 7 - 20 - 20 - 20 - 20 - 20 - 16 - 16 - 18 - 12 - 14 - 22 - 25, label: 'REMARKS' },
  ];
  y = tableHeader(ML, y, sintCols, 7);
  y = blankRows(ML, y, sintCols, Math.min(5, Math.floor((BOTTOM - y - 10) / 6)), 6);

  // POST CURE DETAILS NO = header
  y = secBar(ML, y, CW, 'POST CURE DETAILS :                                     NO :');
  const pcCols = [
    { w: 7, label: 'S.No' }, { w: 20, label: 'DATE' }, { w: 20, label: 'START\nDATE' },
    { w: 20, label: 'START\nTIME' }, { w: 20, label: 'END\nDATE' }, { w: 20, label: 'END\nTIME' },
    { w: 20, label: 'HEAT\nTEMP' }, { w: 20, label: 'CORE\nSIZE' }, { w: 20, label: 'ROUGH\nSIZE' },
    { w: 18, label: 'PROD.QTY' }, { w: 16, label: 'ACC.QTY' }, { w: 16, label: 'REJ.QTY' },
    { w: 22, label: 'NAME' },
    { w: CW - 7 - 20 - 20 - 20 - 20 - 20 - 20 - 20 - 20 - 18 - 16 - 16 - 22, label: 'REMARKS' },
  ];
  y = tableHeader(ML, y, pcCols, 7);
  blankRows(ML, y, pcCols, Math.max(2, Math.floor((BOTTOM - y) / 6)), 6);

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Pre-Machining Inspection / Testing + Machining Process
  // ════════════════════════════════════════════════════════════════════════════

  doc.addPage();
  y = MT;

  // ── PRE-MACHINING INSPECTION / TESTING ──────────────────────────────────
  y = secBar(ML, y, CW, 'PRE MACHINING - INSPECTION / TESTING :                  REPORT NO :              DATE :');

  const preMachCols = [
    { w: 7, label: 'S.No' }, { w: 20, label: 'DATE' },
    { w: 48, label: 'PARAMETER (AS PER DRAWING)' },
    { w: 20, label: 'SPEC MM\n/ INCH' }, { w: 12, label: 'TOL' },
    { w: 22, label: 'CHECKING\nAID / ID NO' },
    { w: 14, label: 'FIRSTOFF' }, { w: 10, label: '1' }, { w: 10, label: '2' },
    { w: 10, label: '3' }, { w: 10, label: '4' }, { w: 10, label: '5' },
    { w: 18, label: 'PROD.QTY' }, { w: 16, label: 'ACC.QTY' }, { w: 16, label: 'REJ.QTY' },
    { w: 22, label: 'NAME' },
    { w: CW - 7 - 20 - 48 - 20 - 12 - 22 - 14 - 10 - 10 - 10 - 10 - 10 - 18 - 16 - 16 - 22, label: 'REMARKS' },
  ];
  y = tableHeader(ML, y, preMachCols, 7);
  y = blankRows(ML, y, preMachCols, 5, 6);

  // FIRST/LAST row
  doc.rect(ML, y, CW * 0.45, 6);
  norm(5.5); doc.text('FIRST / LAST PIECE INSP. COMMENTS :', ML + 1, y + 4);
  doc.rect(ML + CW * 0.45, y, CW * 0.12, 6);
  doc.text('OK', ML + CW * 0.45 + CW * 0.06, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.57, y, CW * 0.13, 6);
  doc.text('NOT OK', ML + CW * 0.57 + CW * 0.065, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.70, y, CW * 0.30, 6);
  norm(5); doc.text('INSPECTED BY :', ML + CW * 0.70 + 1, y + 4);
  y += 6;

  // ── MACHINING PROCESS : CNC / VMC ───────────────────────────────────────
  y = secBar(ML, y, CW, 'MACHINING PROCESS : CNC / VMC  (Refer SOP / WI)');

  // M/C NO | PRG NO | CYCLE TIME | NO. OF TOOLS
  const mcRow1H = 7;
  const mc1 = 50, mc2 = 50, mc3 = 50, mc4 = CW - mc1 - mc2 - mc3;
  lCell(ML, y, mc1, mcRow1H, 'M/C NO', '');
  lCell(ML + mc1, y, mc2, mcRow1H, 'PRG NO', '');
  lCell(ML + mc1 + mc2, y, mc3, mcRow1H, 'CYCLE TIME', '');
  lCell(ML + mc1 + mc2 + mc3, y, mc4, mcRow1H, 'NO. OF TOOLS', '');
  y += mcRow1H;

  const machCols = [
    { w: 7, label: 'S.No' }, { w: 20, label: 'DATE' },
    { w: 48, label: 'PARAMETER (AS PER DRAWING)' },
    { w: 20, label: 'SPEC MM\n/ INCH' }, { w: 12, label: 'TOL' },
    { w: 22, label: 'CHECKING\nAID / ID NO' },
    { w: 14, label: 'FIRSTOFF' }, { w: 10, label: '1' }, { w: 10, label: '2' },
    { w: 10, label: '3' }, { w: 10, label: '4' }, { w: 10, label: '5' },
    { w: 18, label: 'PROD.QTY' }, { w: 16, label: 'ACC.QTY' }, { w: 16, label: 'REJ.QTY' },
    { w: 22, label: 'NAME' },
    { w: CW - 7 - 20 - 48 - 20 - 12 - 22 - 14 - 10 - 10 - 10 - 10 - 10 - 18 - 16 - 16 - 22, label: 'REMARKS' },
  ];
  y = tableHeader(ML, y, machCols, 7);
  y = blankRows(ML, y, machCols, 8, 6);

  // FIRST/LAST row
  doc.rect(ML, y, CW * 0.45, 6);
  norm(5.5); doc.text('FIRST / LAST PIECE INSP. COMMENTS :', ML + 1, y + 4);
  doc.rect(ML + CW * 0.45, y, CW * 0.12, 6);
  doc.text('OK', ML + CW * 0.45 + CW * 0.06, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.57, y, CW * 0.13, 6);
  doc.text('NOT OK', ML + CW * 0.57 + CW * 0.065, y + 4, { align: 'center' });
  doc.rect(ML + CW * 0.70, y, CW * 0.30, 6);
  norm(5); doc.text('INSPECTED BY :', ML + CW * 0.70 + 1, y + 4);
  y += 6;

  // ── SPECIAL PROCESS (IF ANY) ────────────────────────────────────────────
  y = secBar(ML, y, CW, 'SPECIAL PROCESS ( IF ANY ) :');

  y = tableHeader(ML, y, machCols, 7);
  blankRows(ML, y, machCols, Math.max(2, Math.floor((BOTTOM - y - 25) / 6)), 6);

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Route Sequence + Inspection + Dispatch + Signature
  // ════════════════════════════════════════════════════════════════════════════

  doc.addPage();
  y = MT;

  // ── ROUTE SEQUENCE ───────────────────────────────────────────────────────
  y = secBar(ML, y, CW, `ROUTE SEQUENCE :   Route ID: ${v(routeHeader.routeId)}   |   Route Name: ${v(routeHeader.routeName)}   |   Route Type: ${v(routeHeader.routeType)}`);

  const rsCols = [
    { w: 10, label: 'S.No' }, { w: 45, label: 'PROCESS TYPE' },
    { w: 60, label: 'PROCESS NAME' }, { w: 55, label: 'PRODUCTION METHOD' },
    { w: 45, label: 'LOCATION' },
    { w: CW - 10 - 45 - 60 - 55 - 45, label: 'PROCESS DUE DATE' },
  ];
  y = tableHeader(ML, y, rsCols, 7);

  if (seqRows.length > 0) {
    y = dataRows(ML, y, rsCols,
      seqRows.map((r, i) => [
        String(i + 1), r.processType, r.processName,
        r.productionMethod, r.location, r.processDueDate,
      ]),
      7
    );
  } else {
    y = blankRows(ML, y, rsCols, 6, 7);
  }
  y += 2;

  // ── INSPECTION DETAILS + DISPATCH DETAILS + SIGNATURE ──────────────────
  const inspW = CW * 0.38, dispW = CW * 0.38, sigW = CW - inspW - dispW;
  const blockH = 55;

  // Outer boxes
  doc.rect(ML, y, inspW, blockH);
  doc.rect(ML + inspW, y, dispW, blockH);
  doc.rect(ML + inspW + dispW, y, sigW, blockH);

  // Section labels
  bold(7);
  doc.text('INSPECTION DETAILS', ML + inspW / 2, y + 4.5, { align: 'center' });
  doc.text('DISPATCH DETAILS', ML + inspW + dispW / 2, y + 4.5, { align: 'center' });
  doc.text('SIGNATURE', ML + inspW + dispW + sigW / 2, y + 4.5, { align: 'center' });
  doc.line(ML, y + 5.5, ML + inspW + dispW, y + 5.5);

  // Inspection fields
  const inspFields = [
    ['INSPECTION REPORT NO :', ''],
    ['ACCP. QTY :', 'REWORK QTY :'],
    ['Q/C INCHARGE :', ''],
    ['NC COMMENTS :', ''],
  ];
  let fy = y + 8;
  for (const [a, b] of inspFields) {
    norm(5.5);
    doc.text(a, ML + 1.5, fy);
    if (b) doc.text(b, ML + inspW / 2 + 1, fy);
    doc.line(ML, fy + 1.5, ML + inspW, fy + 1.5);
    fy += 8;
  }

  // Dispatch fields
  const dispFields = [
    'INV. NO. & DATE :',
    'QTY DESPATCHED :',
    'BALANCE QTY IN STOCK :',
    'STORE INCHARGE :',
  ];
  let dy = y + 8;
  for (const f of dispFields) {
    norm(5.5);
    doc.text(f, ML + inspW + 1.5, dy);
    doc.line(ML + inspW, dy + 1.5, ML + inspW + dispW, dy + 1.5);
    dy += 8;
  }

  // REJ.QTY in inspection
  fy = y + 16;
  norm(5.5);
  doc.text('REJ. QTY :', ML + inspW * 0.6, fy);

  doc.save(`ProcessCard_${wo.workOrderNo}.pdf`);
}
