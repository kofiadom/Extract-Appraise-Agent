import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PaperEvidence } from '../interfaces/result.interface';

// ── Default field metadata (for the standard 9-field REST template) ──────────

const DEFAULT_KEY_ORDER = [
  'article_reference', 'country', 'study_type', 'population',
  'setting', 'peer_reviewed', 'intervention', 'primary_results', 'additional_findings',
];

const DEFAULT_DISPLAY_NAMES: Record<string, string> = {
  article_reference: 'Article Reference',
  country: 'Country',
  study_type: 'Study Type',
  population: 'Population',
  setting: 'Setting',
  peer_reviewed: 'Peer Reviewed',
  intervention: 'Intervention',
  primary_results: 'Primary Results',
  additional_findings: 'Additional Findings',
};

const DEFAULT_COL_WIDTHS: Record<string, number> = {
  article_reference: 45,
  country: 18,
  study_type: 22,
  population: 40,
  setting: 35,
  peer_reviewed: 15,
  intervention: 15,
  primary_results: 60,
  additional_findings: 50,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function snakeToTitle(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ColDef { key: string; header: string; width: number }

/** Derive column definitions from the actual paper objects.
 *  Known default keys appear first in their canonical order;
 *  any custom keys from a BYOT template follow in discovery order. */
function getColumns(papers: PaperEvidence[]): ColDef[] {
  if (!papers.length) return [];

  // Collect all keys across all papers (preserves insertion order via Set)
  const keySet = new Set<string>();
  for (const p of papers) {
    for (const k of Object.keys(p)) keySet.add(k);
  }

  const known = DEFAULT_KEY_ORDER.filter((k) => keySet.has(k));
  const extra = [...keySet].filter((k) => !DEFAULT_KEY_ORDER.includes(k));

  return [...known, ...extra].map((key) => ({
    key,
    header: DEFAULT_DISPLAY_NAMES[key] ?? snakeToTitle(key),
    width: DEFAULT_COL_WIDTHS[key] ?? 40,
  }));
}

// ── Generator ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExcelGenerator {
  async generateBulk(docs: { docName: string; papers: PaperEvidence[] }[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'REST Evidence Extractor';
    workbook.created = new Date();

    // Derive columns from all papers across all docs
    const allPapers = docs.flatMap((d) => d.papers);
    const cols = getColumns(allPapers);

    // ── Summary sheet ──────────────────────────────────────────────────────────
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Document', key: 'doc', width: 55 },
      { header: 'Papers extracted', key: 'count', width: 18 },
    ];
    const summaryHeader = summary.getRow(1);
    summaryHeader.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    summaryHeader.height = 28;

    docs.forEach((doc, idx) => {
      const summaryRow = summary.addRow([doc.docName, doc.papers.length]);
      const sumBg = idx % 2 === 0 ? 'FFEEF3FB' : 'FFFFFFFF';
      summaryRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sumBg } };
        cell.border = { top: { style: 'hair' }, left: { style: 'thin' }, bottom: { style: 'hair' }, right: { style: 'thin' } };
      });
      summaryRow.height = 22;
    });

    // ── Evidence sheet ─────────────────────────────────────────────────────────
    const sheet = workbook.addWorksheet('Evidence', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });
    sheet.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const colHeaderRow = sheet.getRow(1);
    colHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    colHeaderRow.height = 30;

    docs.forEach((doc, docIdx) => {
      // Document section header spanning all columns
      const sectionRow = sheet.addRow([doc.docName]);
      sectionRow.height = 24;
      const sectionCell = sectionRow.getCell(1);
      sectionCell.value = doc.docName;
      sectionCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
      sectionCell.alignment = { vertical: 'middle' };
      sheet.mergeCells(sectionRow.number, 1, sectionRow.number, cols.length);

      doc.papers.forEach((paper, pIdx) => {
        const values = cols.map((c) => String(paper[c.key] ?? ''));
        const row = sheet.addRow(values);
        const bgColor = pIdx % 2 === 0 ? 'FFEEF3FB' : 'FFFFFFFF';
        row.eachCell((cell) => {
          cell.alignment = { vertical: 'top', wrapText: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.border = { top: { style: 'hair' }, left: { style: 'thin' }, bottom: { style: 'hair' }, right: { style: 'thin' } };
        });
        row.height = 60;
      });

      if (docIdx < docs.length - 1) {
        sheet.addRow([]);
        sheet.addRow([]);
      }
    });

    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.from(raw as ArrayBuffer);
  }

  async generate(papers: PaperEvidence[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'REST Evidence Extractor';
    workbook.created = new Date();

    const cols = getColumns(papers);

    const sheet = workbook.addWorksheet('Evidence Summary', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });
    sheet.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    headerRow.height = 30;

    papers.forEach((paper, idx) => {
      const values = cols.map((c) => String(paper[c.key] ?? ''));
      const row = sheet.addRow(values);
      const bgColor = idx % 2 === 0 ? 'FFEEF3FB' : 'FFFFFFFF';
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = { top: { style: 'hair' }, left: { style: 'thin' }, bottom: { style: 'hair' }, right: { style: 'thin' } };
      });
      row.height = 60;
    });

    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.from(raw as ArrayBuffer);
  }
}
