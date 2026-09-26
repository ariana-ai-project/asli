/**
 * گزارش Word بخش «پیش‌نویس» — مواد پیشنهادی جهت الحاق — ساخته‌شده در مرورگر
 * (پیش‌تر در تابع Supabase «draft-review» بود؛ ساختار و رنگ‌ها همان است).
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  NumberFormat,
  convertInchesToTwip,
} from 'docx';
import {
  COMPANY_NAME, COMPANY_SUBTITLE, HEADING_FONT, BODY_FONT,
  C_PRIMARY, C_PRIMARY_MD, C_BG_ALT, C_BORDER, C_BORDER_LT, C_TEXT, C_TEXT_LIGHT,
  fixRtlPunctuation, buildFooter,
} from './reportDocx';

const BODY_SIZE = 24;
const HEADING1_SIZE = 32;
const C_SUCCESS = '15803D';

export const NO_FINDINGS_MESSAGE = 'تمام مواد قراردادهای مرجع در قرارداد پیش‌نویس موجود است و هیچ مادهٔ مفقودی شناسایی نشد.';

export interface ArticleFinding {
  referenceIndex: number;
  articleNumber: string;
  articleText: string;
}

export interface DraftReport {
  hasFindings: boolean;
  noFindingsMessage: string;
  findings: ArticleFinding[];
}

/** خروجی ساختاریافتهٔ مدل؛ ردیف‌های بی‌متن یا با شمارهٔ مرجع نامعتبر کنار گذاشته می‌شوند */
export function parseDraftReport(raw: string, referenceCount: number): DraftReport {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error('پاسخ مدل کامل نبود و گزارش ساخته نشد. لطفاً دوباره تلاش کنید.');
  }
  const rawFindings = Array.isArray(parsed.findings) ? (parsed.findings as Record<string, unknown>[]) : [];
  const findings = rawFindings
    .map((f) => {
      const n = Number(f?.referenceIndex);
      return {
        referenceIndex: Number.isFinite(n) ? Math.round(n) : 0,
        articleNumber: String(f?.articleNumber || '').trim(),
        articleText: String(f?.articleText || '').trim(),
      };
    })
    .filter((f) => f.articleText.length > 0 && f.referenceIndex >= 1 && f.referenceIndex <= referenceCount);
  const said = parsed.hasFindings === true;
  if (said && findings.length === 0) {
    throw new Error('مدل اعلام کرد ماده‌ای پیدا شده اما فهرست مواد خالی یا نامعتبر بود. لطفاً دوباره تلاش کنید.');
  }
  return {
    hasFindings: findings.length > 0,
    noFindingsMessage: String(parsed.noFindingsMessage || '').trim() || NO_FINDINGS_MESSAGE,
    findings,
  };
}

const cleanFileName = (name: string) => (name || '').replace(/\.[^./\\]+$/, '').trim() || 'بدون‌نام';

function buildIntroParagraphs(referenceNames: string[], draftName: string): Paragraph[] {
  const refNames = referenceNames.map(cleanFileName).join('، ');
  return [
    new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, spacing: { after: 60 }, children: [new TextRun({ text: COMPANY_NAME, font: HEADING_FONT, size: 22, bold: true, color: C_PRIMARY })] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 220 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } },
      children: [new TextRun({ text: COMPANY_SUBTITLE, font: BODY_FONT, size: 16, color: C_TEXT_LIGHT })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 220 },
      children: [new TextRun({ text: 'مواد پیشنهادی جهت الحاق به پیش‌نویس قرارداد', font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: 'قراردادهای مرجع بررسی‌شده: ', font: BODY_FONT, size: BODY_SIZE, bold: true, color: C_TEXT, rightToLeft: true }),
        new TextRun({ text: fixRtlPunctuation(refNames), font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: 'قرارداد پیش‌نویس بررسی‌شده: ', font: BODY_FONT, size: BODY_SIZE, bold: true, color: C_TEXT, rightToLeft: true }),
        new TextRun({ text: fixRtlPunctuation(cleanFileName(draftName)), font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }),
      ],
    }),
  ];
}

function buildNoFindingsParagraph(message: string): Paragraph {
  const side = { style: BorderStyle.SINGLE, size: 6, color: C_SUCCESS };
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    spacing: { before: 200, after: 200 },
    shading: { type: ShadingType.CLEAR, fill: 'E8F5E9', color: 'auto' },
    border: { top: side, bottom: side, left: side, right: side },
    children: [new TextRun({ text: fixRtlPunctuation(message), font: BODY_FONT, size: BODY_SIZE, bold: true, color: C_SUCCESS, rightToLeft: true })],
  });
}

function buildFindingsTable(findings: ArticleFinding[], referenceNames: string[]): Table {
  const headerCell = (text: string) => new TableCell({
    width: { size: 100 / 3, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: C_PRIMARY, color: 'auto' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 120, bottom: 120, left: 150, right: 150 },
    children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, bold: true, color: 'FFFFFF', rightToLeft: true })] })],
  });
  const headerRow = new TableRow({ tableHeader: true, children: [headerCell('شماره قرارداد مرجع'), headerCell('شماره ماده'), headerCell('متن ماده')] });
  const dataRows = findings.map((finding, idx) => {
    const isEven = idx % 2 === 1;
    const refName = referenceNames[finding.referenceIndex - 1];
    const refLabel = refName ? `قرارداد مرجع ${finding.referenceIndex} (${cleanFileName(refName)})` : `قرارداد مرجع ${finding.referenceIndex}`;
    const bodyCell = (text: string, bold = false) => new TableCell({
      width: { size: 100 / 3, type: WidthType.PERCENTAGE },
      shading: isEven ? { type: ShadingType.CLEAR, fill: C_BG_ALT, color: 'auto' } : undefined,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 110, bottom: 110, left: 150, right: 150 },
      children: String(text || '—').split(/\n+/).map((line) => new Paragraph({
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { line: 300 },
        children: [new TextRun({ text: fixRtlPunctuation(line), font: BODY_FONT, size: BODY_SIZE, bold, color: C_TEXT, rightToLeft: true })],
      })),
    });
    return new TableRow({ children: [bodyCell(refLabel), bodyCell(finding.articleNumber || '—', true), bodyCell(finding.articleText || '—')] });
  });
  return new Table({
    rows: [headerRow, ...dataRows],
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
      left: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      right: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
    },
  });
}

export async function draftDocx(report: DraftReport, referenceNames: string[], draftName: string): Promise<Blob> {
  const margin = { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) };
  const doc = new Document({
    creator: COMPANY_NAME,
    title: 'مواد پیشنهادی جهت الحاق به پیش‌نویس قرارداد',
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: BODY_SIZE, color: C_TEXT },
          paragraph: { alignment: AlignmentType.RIGHT, spacing: { line: 340, after: 160 } },
        },
      },
      paragraphStyles: [{
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY },
        paragraph: { alignment: AlignmentType.RIGHT, spacing: { before: 200, after: 220 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } } },
      }],
    },
    sections: [{
      properties: { page: { margin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      footers: { default: buildFooter() },
      children: [
        ...buildIntroParagraphs(referenceNames, draftName),
        report.hasFindings ? buildFindingsTable(report.findings, referenceNames) : buildNoFindingsParagraph(report.noFindingsMessage),
      ],
    }],
  });
  return Packer.toBlob(doc);
}

export const draftFileName = (report: DraftReport) => (report.hasFindings ? 'مواد-پیشنهادی-الحاق-به-پیش‌نویس' : 'گزارش-تطابق-کامل-پیش‌نویس');
