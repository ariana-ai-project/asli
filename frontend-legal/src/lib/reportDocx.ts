/**
 * گزارش Word «تحلیلگر آریانا» — ساخته‌شده در مرورگر
 *
 * این کد پیش‌تر در تابع Supabase (analyze-contract) بود؛ مدل حالا فقط JSON گزارش را می‌دهد
 * (خروجی ساختاریافته، همیشه معتبر) و فایل Word همین‌جا با کتابخانهٔ docx ساخته می‌شود.
 * بدنهٔ گزارش HTML سادهٔ مدل است که با DOMParser خود مرورگر خوانده و به پاراگراف و جدول Word
 * تبدیل می‌شود. همین مبدل برای «دریافت Word» پاسخ‌های گفت‌وگو هم به کار می‌رود.
 *
 * فونت‌ها ارجاع داده می‌شوند نه جاسازی: B Titr و B Lotus باید روی سیستم خواننده نصب باشند؛
 * وگرنه Word با فونت جایگزین نشان می‌دهد و محتوا سالم می‌ماند.
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
  Header,
  Footer,
  PageNumber,
  BorderStyle,
  ShadingType,
  LevelFormat,
  SectionType,
  VerticalAlign,
  PageBreak,
  TableOfContents,
  NumberFormat,
  convertInchesToTwip,
} from 'docx';

export const COMPANY_NAME = 'شرکت تونل سد آریانا';
export const COMPANY_SUBTITLE = 'اداره حقوقی';

export const HEADING_FONT = 'B Titr';
export const BODY_FONT = 'B Lotus';
const BODY_SIZE = 24; // 12pt — واحد docx نصف‌پوینت است
const HEADING1_SIZE = 34;
const HEADING2_SIZE = 28;
const HEADING3_SIZE = 24;

/* پالت برند آریانا */
export const C_PRIMARY = '1E388C';
const C_PRIMARY_LT = 'EAF0FB';
export const C_PRIMARY_MD = '4F6FB2';
export const C_BG_ALT = 'F7FAFE';
export const C_BORDER = 'AFC4E6';
export const C_BORDER_LT = 'DCE7F5';
export const C_TEXT = '1F2937';
export const C_TEXT_LIGHT = '6B7280';
const C_CRITICAL = 'B91C1C';
const C_HIGH = 'DC2626';
const C_MEDIUM = 'D97706';
const C_LOW = '15803D';

export const DEFAULT_CONFIDENTIALITY =
  'این گزارش صرفاً جهت استفاده داخلی واحد حقوقی شرکت تونل سد آریانا تهیه شده است و افشا یا انتشار آن به اشخاص ثالث بدون مجوز کتبی ممنوع می‌باشد.';

export { DOCX_MIME, sanitizeFileName } from './util';

export interface ReportData {
  reportTitle: string;
  documentType: string;
  subject: string;
  legalRegime: string;
  legalField: string;
  confidentiality: string;
  html: string;
}

/** خروجی مدل را به گزارش تبدیل می‌کند؛ خروجی ساختاریافته همیشه JSON است، ولی پاسخ ناتمام نه */
export function parseReport(raw: string): ReportData {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    throw new Error('پاسخ مدل کامل نبود و گزارش ساخته نشد. لطفاً دوباره تلاش کنید.');
  }
  const html = String(parsed.html || '').trim();
  if (!html) throw new Error('خروجی مدل بدنهٔ گزارش نداشت. لطفاً دوباره تلاش کنید.');
  return {
    reportTitle: String(parsed.reportTitle || 'گزارش حقوقی'),
    documentType: String(parsed.documentType || 'نامشخص'),
    subject: String(parsed.subject || ''),
    legalRegime: String(parsed.legalRegime || ''),
    legalField: String(parsed.legalField || ''),
    confidentiality: String(parsed.confidentiality || DEFAULT_CONFIDENTIALITY),
    html,
  };
}

/* ------------------------------------------------------------------ */
/* HTML ← عناصر docx                                                    */
/* ------------------------------------------------------------------ */
function severityShadingFor(text: string): { fill: string; textColor: string } | undefined {
  switch (text.trim()) {
    case 'بحرانی': return { fill: C_CRITICAL, textColor: 'FFFFFF' };
    case 'زیاد': return { fill: C_HIGH, textColor: 'FFFFFF' };
    case 'متوسط': return { fill: C_MEDIUM, textColor: 'FFFFFF' };
    case 'کم': return { fill: C_LOW, textColor: 'FFFFFF' };
    default: return undefined;
  }
}

/* نویسهٔ نامرئی «راست‌به‌چپ» پیرامون پرانتز و گیومه و کروشه، تا Word آن‌ها را کنار عدد و واژهٔ
   لاتین آینه‌ای نشان ندهد. */
const RLM = '‏';
export function fixRtlPunctuation(text: string): string {
  if (!text) return text;
  return text
    .replace(/\(/g, `${RLM}(`)
    .replace(/\)/g, `)${RLM}`)
    .replace(/«/g, `${RLM}«`)
    .replace(/»/g, `»${RLM}`)
    .replace(/[[\]]/g, (m) => `${RLM}${m}${RLM}`);
}

const tagOf = (n: Node) => (n.nodeType === 1 ? (n as Element).tagName.toLowerCase() : '');

function textRunsFromInline(node: Node | { childNodes: Node[] }, bold = false, italics = false, color?: string): TextRun[] {
  const runs: TextRun[] = [];
  const children = Array.from((node as Node).childNodes || []);
  for (const child of children) {
    if (child.nodeType === 3) {
      const text = fixRtlPunctuation(String(child.textContent || '').replace(/[\r\n\t]+/g, ' '));
      if (text.length === 0) continue;
      runs.push(new TextRun({ text: text.trim().length === 0 ? ' ' : text, font: BODY_FONT, size: BODY_SIZE, bold, italics, rightToLeft: true, ...(color ? { color } : {}) }));
    } else if (child.nodeType === 1) {
      const tag = tagOf(child);
      if (tag === 'br') runs.push(new TextRun({ text: '', break: 1, rightToLeft: true }));
      else if (tag === 'strong' || tag === 'b') runs.push(...textRunsFromInline(child, true, italics, color));
      else if (tag === 'em' || tag === 'i') runs.push(...textRunsFromInline(child, bold, true, color));
      else runs.push(...textRunsFromInline(child, bold, italics, color));
    }
  }
  return runs;
}

function buildList(listEl: Element, ordered: boolean, level: number): Paragraph[] {
  const result: Paragraph[] = [];
  const items = Array.from(listEl.children).filter((c) => tagOf(c) === 'li');
  for (const li of items) {
    const nested: Element[] = [];
    const direct: Node[] = [];
    for (const child of Array.from(li.childNodes)) {
      const tag = tagOf(child);
      if (tag === 'ul' || tag === 'ol') nested.push(child as Element);
      else direct.push(child);
    }
    const runs: TextRun[] = [];
    for (const dc of direct) {
      if (dc.nodeType === 3) {
        const text = fixRtlPunctuation(String(dc.textContent || '').replace(/[\r\n\t]+/g, ' '));
        if (text.trim().length > 0) runs.push(new TextRun({ text, font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }));
      } else if (dc.nodeType === 1) {
        runs.push(...textRunsFromInline({ childNodes: [dc] }, false, false, C_TEXT));
      }
    }
    if (runs.length === 0) runs.push(new TextRun({ text: '', font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true }));
    result.push(new Paragraph({
      numbering: { reference: ordered ? 'ordered-list' : 'bullet-list', level: Math.min(level, 1) },
      alignment: AlignmentType.START,
      bidirectional: true,
      children: runs,
    }));
    for (const n of nested) result.push(...buildList(n, tagOf(n) === 'ol', level + 1));
  }
  return result;
}

const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
  bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY },
  left: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: C_BORDER_LT },
};

function buildTable(tableEl: Element): Table {
  const trs = Array.from(tableEl.querySelectorAll('tr'));
  const rows: TableRow[] = [];
  let dataRowIndex = 0;
  trs.forEach((tr, rowIndex) => {
    const cellEls = Array.from(tr.children).filter((c) => ['td', 'th'].includes(tagOf(c)));
    if (cellEls.length === 0) return;
    const isHeaderRow = rowIndex === 0 && cellEls.some((c) => tagOf(c) === 'th');
    const isEvenDataRow = !isHeaderRow && dataRowIndex % 2 === 1;
    if (!isHeaderRow) dataRowIndex++;
    const cells = cellEls.map((cellEl) => {
      const cellText = String(cellEl.textContent || '').trim();
      const severity = !isHeaderRow ? severityShadingFor(cellText) : undefined;
      let fill: string | undefined;
      let textColor: string | undefined;
      if (isHeaderRow) { fill = C_PRIMARY; textColor = 'FFFFFF'; }
      else if (severity) { fill = severity.fill; textColor = severity.textColor; }
      else if (isEvenDataRow) fill = C_BG_ALT;
      let runs = textRunsFromInline(cellEl, isHeaderRow, false, textColor);
      if (runs.length === 0) {
        runs = [new TextRun({ text: fixRtlPunctuation(cellText), font: BODY_FONT, size: BODY_SIZE, bold: isHeaderRow, rightToLeft: true, color: textColor || C_TEXT })];
      }
      return new TableCell({
        width: { size: Math.floor(100 / Math.max(cellEls.length, 1)), type: WidthType.PERCENTAGE },
        shading: fill ? { type: ShadingType.CLEAR, fill, color: 'auto' } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 110, bottom: 110, left: 150, right: 150 },
        children: [new Paragraph({ alignment: AlignmentType.START, bidirectional: true, spacing: { line: 300 }, children: runs })],
      });
    });
    rows.push(new TableRow({ children: cells, tableHeader: isHeaderRow }));
  });
  if (rows.length === 0) {
    rows.push(new TableRow({
      children: [new TableCell({
        children: [new Paragraph({
          alignment: AlignmentType.START,
          bidirectional: true,
          children: [new TextRun({ text: 'بدون داده', font: BODY_FONT, size: BODY_SIZE, color: C_TEXT_LIGHT })],
        })],
      })],
    }));
  }
  /* visuallyRightToLeft: نخستین ستون در سمت راست، مطابق نگارش فارسی */
  return new Table({ rows, visuallyRightToLeft: true, width: { size: 100, type: WidthType.PERCENTAGE }, borders: tableBorders });
}

function plainParagraph(text: string, after = 140): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.START,
    bidirectional: true,
    spacing: { line: 340, after },
    children: [new TextRun({ text: fixRtlPunctuation(text), font: BODY_FONT, size: BODY_SIZE, color: C_TEXT, rightToLeft: true })],
  });
}

function convertBlockNode(node: Node): (Paragraph | Table)[] {
  if (node.nodeType === 3) {
    const text = String(node.textContent || '').trim();
    return text ? [plainParagraph(text)] : [];
  }
  if (node.nodeType !== 1) return [];
  const el = node as Element;
  switch (tagOf(el)) {
    case 'h1':
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.START, bidirectional: true, children: textRunsFromInline(el, true, false, C_PRIMARY) })];
    case 'h2':
      return [new Paragraph({ heading: HeadingLevel.HEADING_2, alignment: AlignmentType.START, bidirectional: true, children: textRunsFromInline(el, true, false, C_PRIMARY_MD) })];
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return [new Paragraph({ heading: HeadingLevel.HEADING_3, alignment: AlignmentType.START, bidirectional: true, children: textRunsFromInline(el, true, false, C_PRIMARY_MD) })];
    case 'p': {
      const runs = textRunsFromInline(el, false, false, C_TEXT);
      if (runs.length === 0) return [];
      return [new Paragraph({ alignment: AlignmentType.START, bidirectional: true, spacing: { line: 340, after: 180 }, children: runs })];
    }
    case 'ul':
      return buildList(el, false, 0);
    case 'ol':
      return buildList(el, true, 0);
    case 'table':
      return [
        new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),
        buildTable(el),
        new Paragraph({ spacing: { before: 0, after: 200 }, children: [] }),
      ];
    case 'hr':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER } }, spacing: { before: 240, after: 240 }, children: [] })];
    case 'pre': {
      /* متن پیش‌قالب (مثلاً پیش‌نویس در بلوک کد): هر سطر یک پاراگراف */
      const lines = String(el.textContent || '').replace(/\r/g, '').split('\n');
      return lines.map((l) => plainParagraph(l, 40));
    }
    case 'div':
    case 'section':
    case 'article':
    case 'blockquote':
    case 'body':
    case 'span': {
      const out: (Paragraph | Table)[] = [];
      for (const child of Array.from(el.childNodes)) out.push(...convertBlockNode(child));
      return out;
    }
    default: {
      const runs = textRunsFromInline(el, false, false, C_TEXT);
      if (runs.length === 0) return [];
      return [new Paragraph({ alignment: AlignmentType.START, bidirectional: true, spacing: { line: 340, after: 140 }, children: runs })];
    }
  }
}

export function htmlToDocxElements(html: string): (Paragraph | Table)[] {
  const dom = new DOMParser().parseFromString(`<div id="tida-root">${html}</div>`, 'text/html');
  const root = dom.getElementById('tida-root');
  const elements: (Paragraph | Table)[] = [];
  if (root) for (const node of Array.from(root.childNodes)) elements.push(...convertBlockNode(node));
  if (elements.length === 0) elements.push(plainParagraph('محتوایی برای گزارش دریافت نشد.'));
  return elements;
}

/* ------------------------------------------------------------------ */
/* جلد، فهرست، سربرگ، پاورقی                                           */
/* ------------------------------------------------------------------ */
function buildCoverInfoTable(report: ReportData, dateStr: string): Table {
  const rows: [string, string][] = [
    ['نوع سند بررسی‌شده', report.documentType || '—'],
    ['موضوع', report.subject || '—'],
    ['نظام حقوقی حاکم', report.legalRegime || '—'],
    ['حوزه تخصصی حقوقی', report.legalField || '—'],
    ['تاریخ تهیه گزارش', dateStr],
  ];
  const cellMargins = { top: 120, bottom: 120, left: 180, right: 180 };
  return new Table({
    rows: rows.map(([label, value], idx) => new TableRow({
      children: [
        new TableCell({
          width: { size: 32, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: C_PRIMARY_LT, color: 'auto' },
          verticalAlign: VerticalAlign.CENTER,
          margins: cellMargins,
          children: [new Paragraph({ alignment: AlignmentType.START, bidirectional: true, children: [new TextRun({ text: fixRtlPunctuation(label), font: BODY_FONT, size: 22, bold: true, color: C_PRIMARY, rightToLeft: true })] })],
        }),
        new TableCell({
          width: { size: 68, type: WidthType.PERCENTAGE },
          shading: idx % 2 === 0 ? undefined : { type: ShadingType.CLEAR, fill: C_BG_ALT, color: 'auto' },
          verticalAlign: VerticalAlign.CENTER,
          margins: cellMargins,
          children: [new Paragraph({ alignment: AlignmentType.START, bidirectional: true, children: [new TextRun({ text: fixRtlPunctuation(value), font: BODY_FONT, size: 22, color: C_TEXT, rightToLeft: true })] })],
        }),
      ],
    })),
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: tableBorders,
  });
}

export const faDate = () => new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

function buildCoverPage(report: ReportData): (Paragraph | Table)[] {
  return [
    new Paragraph({ spacing: { before: 800 }, children: [] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, children: [new TextRun({ text: COMPANY_NAME, font: HEADING_FONT, size: 36, bold: true, color: C_PRIMARY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after: 160 }, children: [new TextRun({ text: COMPANY_SUBTITLE, font: BODY_FONT, size: 22, color: C_TEXT_LIGHT })] }),
    new Paragraph({ spacing: { after: 800 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C_PRIMARY_MD, space: 1 } }, children: [] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { before: 600, after: 240 }, children: [new TextRun({ text: 'گزارش حقوقی', font: HEADING_FONT, size: 60, bold: true, color: C_PRIMARY })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after: 1000 }, children: [new TextRun({ text: fixRtlPunctuation(report.reportTitle), font: HEADING_FONT, size: 28, bold: true, color: C_PRIMARY_MD, rightToLeft: true })] }),
    buildCoverInfoTable(report, faDate()),
    new Paragraph({ spacing: { before: 1600 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: C_BORDER, space: 1 } }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { before: 200 },
      children: [new TextRun({ text: fixRtlPunctuation(report.confidentiality || DEFAULT_CONFIDENTIALITY), font: BODY_FONT, size: 18, italics: true, color: C_TEXT_LIGHT })],
    }),
  ];
}

function buildTocIntro(): Array<Paragraph | TableOfContents> {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.START, bidirectional: true, children: [new TextRun({ text: 'فهرست مطالب', font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY })] }),
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 300 },
      children: [new TextRun({ text: 'برای مشاهده صحیح شماره صفحات، پس از باز کردن فایل، کلیدهای Ctrl+A و سپس F9 را فشار دهید تا فهرست به‌روزرسانی شود.', font: BODY_FONT, size: 18, italics: true, color: C_TEXT_LIGHT })],
    }),
    new TableOfContents('فهرست مطالب', { hyperlink: true, headingStyleRange: '1-3' }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function buildHeader(title: string): Header {
  const shortTitle = fixRtlPunctuation(title.length > 60 ? title.slice(0, 60) + '…' : title);
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_PRIMARY_MD, space: 4 } },
      children: [new TextRun({ text: `${COMPANY_NAME} — ${shortTitle}`, font: BODY_FONT, size: 16, color: C_TEXT_LIGHT, rightToLeft: true })],
    })],
  });
}

export function buildFooter(): Footer {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [new TextRun({ font: BODY_FONT, size: 16, color: C_TEXT_LIGHT, children: ['صفحه ', PageNumber.CURRENT, ' از ', PageNumber.TOTAL_PAGES] })],
    })],
  });
}

const numberingConfig = {
  config: [
    {
      reference: 'bullet-list',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.START, style: { paragraph: { bidirectional: true, indent: { right: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.START, style: { paragraph: { bidirectional: true, indent: { right: 1080, hanging: 360 } } } },
      ],
    },
    {
      reference: 'ordered-list',
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { bidirectional: true, indent: { right: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.START, style: { paragraph: { bidirectional: true, indent: { right: 1080, hanging: 360 } } } },
      ],
    },
  ],
};

const headingStyles = [
  {
    id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: HEADING_FONT, size: HEADING1_SIZE, bold: true, color: C_PRIMARY },
    paragraph: { alignment: AlignmentType.START, bidirectional: true, spacing: { before: 520, after: 260 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } } },
  },
  {
    id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: HEADING_FONT, size: HEADING2_SIZE, bold: true, color: C_PRIMARY_MD },
    paragraph: { alignment: AlignmentType.START, bidirectional: true, spacing: { before: 360, after: 180 }, outlineLevel: 1 },
  },
  {
    id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: HEADING_FONT, size: HEADING3_SIZE, bold: true, color: C_PRIMARY_MD },
    paragraph: { alignment: AlignmentType.START, bidirectional: true, spacing: { before: 280, after: 140 }, outlineLevel: 2 },
  },
];

const margin = () => ({ top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1), right: convertInchesToTwip(1) });

const docStyles = {
  default: {
    document: {
      run: { font: BODY_FONT, size: BODY_SIZE, color: C_TEXT },
      paragraph: { alignment: AlignmentType.START, bidirectional: true, spacing: { line: 360, after: 180 } },
    },
  },
  paragraphStyles: headingStyles,
};

/** گزارش کامل: جلد، فهرست مطالب واقعی Word، سربرگ و شمارهٔ صفحه */
export async function reportDocx(report: ReportData): Promise<Blob> {
  const doc = new Document({
    creator: COMPANY_NAME,
    title: report.reportTitle,
    description: report.subject,
    features: { updateFields: true },
    numbering: numberingConfig,
    styles: docStyles,
    sections: [
      { properties: { page: { margin: margin() } }, children: buildCoverPage(report) },
      {
        properties: { type: SectionType.NEXT_PAGE, page: { margin: margin(), pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
        headers: { default: buildHeader(report.reportTitle) },
        footers: { default: buildFooter() },
        children: [...buildTocIntro(), ...htmlToDocxElements(report.html)],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** یک پاسخ گفت‌وگو (HTML ساخته‌شده از Markdown) به‌صورت سند Word ساده با سربرگ شرکت */
export async function answerDocx(title: string, html: string): Promise<Blob> {
  const head: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.START, bidirectional: true, spacing: { after: 60 }, children: [new TextRun({ text: COMPANY_NAME, font: HEADING_FONT, size: 22, bold: true, color: C_PRIMARY })] }),
    new Paragraph({
      alignment: AlignmentType.START,
      bidirectional: true,
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_PRIMARY_MD, space: 4 } },
      children: [new TextRun({ text: `${COMPANY_SUBTITLE} — ${faDate()}`, font: BODY_FONT, size: 16, color: C_TEXT_LIGHT, rightToLeft: true })],
    }),
  ];
  const doc = new Document({
    creator: COMPANY_NAME,
    title,
    numbering: numberingConfig,
    styles: docStyles,
    sections: [{
      properties: { page: { margin: margin(), pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: buildHeader(title) },
      footers: { default: buildFooter() },
      children: [...head, ...htmlToDocxElements(html)],
    }],
  });
  return Packer.toBlob(doc);
}

