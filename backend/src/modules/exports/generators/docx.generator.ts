import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  AlignmentType,
  ShadingType,
  BorderStyle,
  PageBreak,
} from 'docx';
import { PaperAppraisal } from '../interfaces/result.interface';

const RATING_COLORS: Record<string, string> = {
  Yes: 'C6EFCE',
  Partial: 'FFEB9C',
  No: 'FFC7CE',
  'N/A': 'D9D9D9',
};

@Injectable()
export class DocxGenerator {
  async generate(appraisals: PaperAppraisal[]): Promise<Buffer> {
    const children: (Paragraph | Table)[] = [];

    // Cover title
    children.push(
      new Paragraph({
        text: 'Quality Appraisal Report',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `REST Evidence Extractor  ·  Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
            italics: true,
            color: '666666',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 },
      }),
    );

    appraisals.forEach((paper, idx) => {
      // Page break between papers (not before the first)
      if (idx > 0) {
        children.push(new Paragraph({ children: [new PageBreak()] }));
      }

      // Paper heading
      children.push(
        new Paragraph({
          text: paper.article_reference,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 120 },
        }),
        // Study type + score line
        new Paragraph({
          children: [
            new TextRun({ text: 'Study type: ', bold: true }),
            new TextRun({ text: paper.study_type ?? 'N/A' }),
            new TextRun({ text: '    Quality score: ', bold: true }),
            new TextRun({
              text: paper.quality_score ?? 'N/A',
              bold: true,
              color: '2F5496',
              size: 26,
            }),
          ],
          spacing: { after: 160 },
        }),
        // Strengths
        new Paragraph({ text: 'Strengths', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }),
        new Paragraph({ text: paper.strengths ?? '', spacing: { after: 160 } }),
        // Limitations
        new Paragraph({ text: 'Limitations', heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }),
        new Paragraph({ text: paper.limitations ?? '', spacing: { after: 200 } }),
        // Criteria heading
        new Paragraph({ text: 'Appraisal Criteria', heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }),
      );

      // Criteria table
      children.push(this.buildCriteriaTable(paper));
    });

    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            run: { font: 'Calibri', size: 22 },
          },
        ],
      },
      sections: [{ children }],
    });

    return Packer.toBuffer(doc);
  }

  private buildCriteriaTable(paper: PaperAppraisal): Table {
    const headerRow = new TableRow({
      tableHeader: true,
      children: ['#', 'Criterion', 'Rating', 'Justification'].map(
        (text) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
              }),
            ],
            shading: { type: ShadingType.SOLID, color: '2F5496' },
            width: text === '#' ? { size: 5, type: WidthType.PERCENTAGE }
              : text === 'Rating' ? { size: 12, type: WidthType.PERCENTAGE }
              : text === 'Criterion' ? { size: 38, type: WidthType.PERCENTAGE }
              : { size: 45, type: WidthType.PERCENTAGE },
          }),
      ),
    });

    const dataRows = (paper.criteria ?? []).map((c, rowIdx) => {
      const bgColor = rowIdx % 2 === 0 ? 'EEF3FB' : 'FFFFFF';
      const ratingBg = RATING_COLORS[c.rating] ?? 'FFFFFF';

      return new TableRow({
        children: [
          this.cell(String(c.criterion_id), bgColor, 5),
          this.cell(c.question ?? '', bgColor, 38),
          this.cell(c.rating ?? '', ratingBg, 12, true),
          this.cell(c.justification ?? '', bgColor, 45),
        ],
      });
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 4 },
        left: { style: BorderStyle.SINGLE, size: 4 },
        right: { style: BorderStyle.SINGLE, size: 4 },
      },
    });
  }

  private cell(text: string, bg: string, widthPct: number, centered = false): TableCell {
    return new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, size: 20 })],
          alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
        }),
      ],
      shading: { type: ShadingType.SOLID, color: bg },
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });
  }
}
