export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * نام فایل امن برای دانلود. نویسه‌های ممنوع ویندوز به «-» تبدیل می‌شوند نه حذف — وگرنه
 * «قرارداد ۷۷/۱۴۰۴» می‌شد «۷۷۱۴۰۴» — و نام بلند سر مرز واژه کوتاه می‌شود نه وسط عدد.
 */
export function sanitizeFileName(name: string, fallback = 'گزارش-حقوقی'): string {
  let s = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  if (s.length > 100) {
    const cut = s.lastIndexOf(' ', 100);
    s = s.slice(0, cut > 60 ? cut : 100).trim();
  }
  return s || fallback;
}
