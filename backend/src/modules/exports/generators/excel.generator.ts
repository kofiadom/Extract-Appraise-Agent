import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PaperEvidence } from '../interfaces/result.interface';

const HEADERS = [
  'Article Reference',
  'Country',
  'Study Type',
  'Population',
  'Setting',
  'Peer Reviewed',
  'Intervention',
  'Primary Results',
  'Additional Findings',
];

const COL_WIDTHS = [45, 18, 22, 40, 35, 15, 15, 60, 50];

@Injectable()
export class ExcelGenerator {
  async generate(papers: PaperEvidence[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'REST Evidence Extractor';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Evidence Summary', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    // Column widths
    sheet.columns = HEADERS.map((header, i) => ({
      header,
      key: header,
      width: COL_WIDTHS[i],
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    headerRow.height = 30;

    // Data rows
    papers.forEach((paper, idx) => {
      const row = sheet.addRow([
        paper.article_reference ?? '',
        paper.country ?? '',
        paper.study_type ?? '',
        paper.population ?? '',
        paper.setting ?? '',
        paper.peer_reviewed ?? '',
        paper.intervention ?? '',
        paper.primary_results ?? '',
        paper.additional_findings ?? '',
      ]);

      const bgColor = idx % 2 === 0 ? 'FFEEF3FB' : 'FFFFFFFF';
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.border = {
          top: { style: 'hair' },
          left: { style: 'thin' },
          bottom: { style: 'hair' },
          right: { style: 'thin' },
        };
      });
      row.height = 60;
    });

    // Freeze header row
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const raw = await workbook.xlsx.writeBuffer();
    return Buffer.from(raw as ArrayBuffer);
  }
}
