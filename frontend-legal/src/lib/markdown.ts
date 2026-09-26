/**
 * نمایش پاسخ مدل (Markdown) — marked برای تبدیل و DOMPurify برای پاک‌سازی.
 * متن پاسخ از مدل می‌آید و ممکن است متن سند کاربر را بازتاب دهد، پس هرگز بی‌پاک‌سازی در صفحه نمی‌نشیند.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

const DIR_AUTO = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH', 'BLOCKQUOTE']);
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element;
  if (el.tagName === 'A') {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  }
  /* متن انگلیسیِ لابه‌لای پاسخ فارسی در جهت خودش نمایش داده شود */
  if (DIR_AUTO.has(el.tagName)) el.setAttribute('dir', 'auto');
});

export function renderMarkdown(src: string): string {
  const html = marked.parse(src || '', { async: false }) as string;
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'img'] });
  /* جدول پهن در موبایل افقی پیمایش شود نه صفحه */
  return safe.replace(/<table>/g, '<div class="md-table"><table>').replace(/<\/table>/g, '</table></div>');
}

/** HTML ساده برای خروجی Word (بی‌پوشش جدول) */
export function markdownToHtml(src: string): string {
  const html = marked.parse(src || '', { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}
