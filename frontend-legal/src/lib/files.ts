/**
 * آماده‌سازی فایل پیش از بارگذاری — در مرورگر
 *
 * مدل مستقیماً PDF، متن ساده و تصویر (PNG/JPEG/GIF/WebP) را می‌خواند. بقیه این‌جا به متن
 * تبدیل می‌شوند تا کار سنگین روی سرور (با سقف ۱۰ میلی‌ثانیه CPU) نیفتد:
 *   Word (docx)      mammoth → HTML → متن با عنوان‌ها، فهرست‌ها و جدول‌ها
 *   اکسل (xlsx/xls/ods/csv)  SheetJS همان پنل تأمین و پشتیبانی → CSV هر برگه
 *   پاورپوینت (pptx)  JSZip → متن هر اسلاید و یادداشت‌هایش
 *   OpenDocument (odt), HTML, Markdown, JSON, XML, RTF و متن‌های دیگر
 * تصویر بزرگ‌تر از ۲۵۷۶ پیکسل (سقف دید مدل) یا ۵ مگابایت کوچک می‌شود.
 */
import type JSZip from 'jszip';

export interface PreparedFile {
  name: string;
  mime: string;
  blob: Blob;
  /** نوع اصلی فایل (پسوند)، برای نمایش */
  src: string;
}

export class FileError extends Error {}

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMG_MAX_EDGE = 2576;
/* حدود یک میلیون توکن؛ بیش از این در یک درخواست مدل جا نمی‌شود */
const MAX_TEXT_CHARS = 2_000_000;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const SHEET_EXT = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods']);
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'rtf', 'log', 'ini', 'yaml', 'yml', 'sql']);
const DIRECT_IMAGE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const ACCEPT_ALL = '.pdf,.docx,.doc,.txt,.md,.rtf,.csv,.tsv,.json,.xml,.html,.htm,.xlsx,.xls,.xlsm,.ods,.pptx,.odt,.png,.jpg,.jpeg,.gif,.webp,.bmp';
/* تحلیل و پیش‌نویس: اسناد (و تصویر اسکن) */
export const ACCEPT_DOCS = '.pdf,.docx,.doc,.txt,.md,.rtf,.odt,.html,.htm,.png,.jpg,.jpeg,.webp';

export const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] || '').toLowerCase();

export async function prepareFile(file: File): Promise<PreparedFile> {
  const ext = extOf(file.name);
  const name = file.name;
  if (file.size === 0) throw new FileError(`فایل «${name}» خالی است.`);

  if (ext === 'pdf' || file.type === 'application/pdf') {
    if (file.size > MAX_BYTES) throw new FileError(`حجم «${name}» بیش از ۳۲ مگابایت است؛ فایل را کوچک‌تر یا چند بخش کنید.`);
    return { name, mime: 'application/pdf', blob: file, src: 'pdf' };
  }
  if (IMAGE_EXT.has(ext) || file.type.startsWith('image/')) return prepareImage(file, ext);
  if (ext === 'doc') throw new FileError(`فایل Word قدیمی (doc.) در مرورگر خوانده نمی‌شود؛ «${name}» را در Word با قالب docx یا PDF ذخیره و دوباره بارگذاری کنید.`);
  if (ext === 'docx') return asText(name, await docxToText(file), 'docx');
  if (SHEET_EXT.has(ext)) return asText(name, await sheetToText(file), ext);
  if (ext === 'pptx') return asText(name, await pptxToText(file), 'pptx');
  if (ext === 'odt') return asText(name, await odtToText(file), 'odt');
  if (ext === 'html' || ext === 'htm') return asText(name, htmlToText(await file.text()), 'html');
  if (TEXT_EXT.has(ext) || file.type.startsWith('text/') || file.type === 'application/json') {
    if (file.size > MAX_TEXT_CHARS * 4) throw new FileError(`فایل «${name}» برای یک درخواست مدل بیش از حد بزرگ است.`);
    return asText(name, await file.text(), ext || 'txt');
  }
  throw new FileError(`نوع فایل «${name}» پشتیبانی نمی‌شود. PDF، Word، اکسل، پاورپوینت، متن یا تصویر بفرستید.`);
}

function asText(name: string, text: string, src: string): PreparedFile {
  const t = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (!t) throw new FileError(`متنی در «${name}» پیدا نشد. اگر سند اسکن‌شده است، PDF یا تصویر آن را بفرستید.`);
  if (t.length > MAX_TEXT_CHARS) throw new FileError(`متن «${name}» برای یک درخواست مدل بیش از حد بلند است؛ آن را چند بخش کنید.`);
  return { name, mime: 'text/plain', blob: new Blob([t], { type: 'text/plain;charset=utf-8' }), src };
}

/* ------------------------------------------------------------------ */
/* HTML → متن ساختاریافته (عنوان، فهرست، جدول)                          */
/* ------------------------------------------------------------------ */
const clean = (s: string) => s.replace(/[ \t\u00a0]+/g, ' ').trim();

function blockText(node: Node, out: string[], depth = 0): void {
  if (node.nodeType === 3) {
    const t = clean(node.textContent || '');
    if (t) out.push(t);
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'head') return;
  if (/^h[1-6]$/.test(tag)) {
    out.push(`${'#'.repeat(Number(tag[1]))} ${clean(el.textContent || '')}`);
    return;
  }
  if (tag === 'p' || tag === 'pre') {
    const t = tag === 'pre' ? (el.textContent || '').trim() : clean(el.textContent || '');
    if (t) out.push(t);
    return;
  }
  if (tag === 'ul' || tag === 'ol') {
    let n = 0;
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      n++;
      const own: string[] = [];
      const nested: Element[] = [];
      for (const c of Array.from(li.childNodes)) {
        const ct = c.nodeType === 1 ? (c as Element).tagName.toLowerCase() : '';
        if (ct === 'ul' || ct === 'ol') nested.push(c as Element);
        else own.push(c.textContent || '');
      }
      out.push(`${'  '.repeat(depth)}${tag === 'ol' ? `${n}.` : '-'} ${clean(own.join(' '))}`);
      for (const ns of nested) blockText(ns, out, depth + 1);
    }
    return;
  }
  if (tag === 'table') {
    const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children).filter((c) => /^t[dh]$/i.test(c.tagName)).map((c) => clean(c.textContent || '').replace(/\|/g, '/')),
    ).filter((r) => r.some(Boolean));
    if (rows.length) {
      out.push(rows.map((r, i) => `| ${r.join(' | ')} |${i === 0 && rows.length > 1 ? `\n|${r.map(() => ' --- |').join('')}` : ''}`).join('\n'));
    }
    return;
  }
  if (tag === 'br') { out.push(''); return; }
  for (const c of Array.from(el.childNodes)) blockText(c, out, depth);
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  blockText(doc.body, out);
  return out.join('\n\n');
}

async function docxToText(file: File): Promise<string> {
  try {
    const { default: mammoth } = await import('mammoth');
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return htmlToText(value);
  } catch {
    throw new FileError(`فایل Word «${file.name}» خوانده نشد؛ شاید خراب یا رمزدار است. PDF آن را بفرستید.`);
  }
}

/* ------------------------------------------------------------------ */
/* اکسل — همان SheetJS که پنل تأمین و پشتیبانی روی همین سایت دارد      */
/* ------------------------------------------------------------------ */
type XlsxLib = {
  read: (data: ArrayBuffer, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_csv: (ws: unknown, opts?: Record<string, unknown>) => string };
};
let xlsxLoad: Promise<XlsxLib> | null = null;
function loadXlsx(): Promise<XlsxLib> {
  const w = window as unknown as { XLSX?: XlsxLib };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (!xlsxLoad) {
    xlsxLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/tamin-poshtibani/vendor/xlsx.full.min.js';
      s.async = true;
      s.onload = () => (w.XLSX ? resolve(w.XLSX) : reject(new FileError('کتابخانهٔ خواندن اکسل بارگذاری نشد.')));
      s.onerror = () => { xlsxLoad = null; reject(new FileError('کتابخانهٔ خواندن اکسل بارگذاری نشد؛ اتصال را بررسی کنید.')); };
      document.head.appendChild(s);
    });
  }
  return xlsxLoad;
}

async function sheetToText(file: File): Promise<string> {
  const XLSX = await loadXlsx();
  let wb;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  } catch {
    throw new FileError(`فایل اکسل «${file.name}» خوانده نشد؛ شاید خراب یا رمزدار است.`);
  }
  const parts: string[] = [];
  for (const sheet of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheet], { blankrows: false }).replace(/,+$/gm, '').trim();
    if (csv) parts.push(`## برگه: ${sheet}\n${csv}`);
  }
  return parts.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* پاورپوینت و OpenDocument                                            */
/* ------------------------------------------------------------------ */
const xmlDoc = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
const slideNo = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] || 0);

function drawingText(xml: string): string {
  const d = xmlDoc(xml);
  return Array.from(d.getElementsByTagName('a:p'))
    .map((p) => Array.from(p.getElementsByTagName('a:t')).map((t) => t.textContent || '').join(''))
    .map(clean).filter(Boolean).join('\n');
}

async function pptxToText(file: File): Promise<string> {
  const { default: Zip } = await import('jszip');
  let zip: JSZip;
  try { zip = await Zip.loadAsync(await file.arrayBuffer()); } catch { throw new FileError(`فایل پاورپوینت «${file.name}» خوانده نشد.`); }
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => slideNo(a) - slideNo(b));
  const parts: string[] = [];
  for (const p of slides) {
    const body = drawingText(await zip.file(p)!.async('string'));
    const notesPath = `ppt/notesSlides/notesSlide${slideNo(p)}.xml`;
    const notes = zip.file(notesPath) ? drawingText(await zip.file(notesPath)!.async('string')) : '';
    const text = [body, notes ? `یادداشت ارائه‌دهنده: ${notes}` : ''].filter(Boolean).join('\n');
    if (text) parts.push(`## اسلاید ${slideNo(p)}\n${text}`);
  }
  return parts.join('\n\n');
}

async function odtToText(file: File): Promise<string> {
  const { default: Zip } = await import('jszip');
  let zip: JSZip;
  try { zip = await Zip.loadAsync(await file.arrayBuffer()); } catch { throw new FileError(`فایل «${file.name}» خوانده نشد.`); }
  const content = zip.file('content.xml');
  if (!content) throw new FileError(`فایل «${file.name}» سند OpenDocument معتبری نیست.`);
  const d = xmlDoc(await content.async('string'));
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.tagName === 'text:h') out.push(`## ${clean(c.textContent || '')}`);
      else if (c.tagName === 'text:p') { const t = clean(c.textContent || ''); if (t) out.push(t); }
      else if (c.tagName === 'table:table-row') out.push(`| ${Array.from(c.children).map((x) => clean(x.textContent || '')).join(' | ')} |`);
      else walk(c);
    }
  };
  walk(d.documentElement);
  return out.join('\n\n');
}

/* ------------------------------------------------------------------ */
/* تصویر                                                                */
/* ------------------------------------------------------------------ */
async function prepareImage(file: File, ext: string): Promise<PreparedFile> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch {
    throw new FileError(`تصویر «${file.name}» خوانده نشد (قالب‌هایی مثل HEIC پشتیبانی نمی‌شوند؛ JPG یا PNG بفرستید).`);
  }
  const long = Math.max(bmp.width, bmp.height);
  if (DIRECT_IMAGE.has(file.type) && long <= IMG_MAX_EDGE && file.size <= MAX_IMAGE_BYTES) {
    bmp.close();
    return { name: file.name, mime: file.type, blob: file, src: ext || 'image' };
  }
  let scale = Math.min(1, IMG_MAX_EDGE / long);
  let quality = 0.88;
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_IMAGE_BYTES) {
      bmp.close();
      return { name: file.name, mime: 'image/jpeg', blob, src: ext || 'image' };
    }
    scale *= 0.75;
    quality = 0.8;
  }
  bmp.close();
  throw new FileError(`تصویر «${file.name}» حتی پس از کوچک‌کردن بیش از ۵ مگابایت است.`);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
}
