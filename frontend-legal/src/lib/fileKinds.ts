import { FileText, Image as ImageIcon, FileSpreadsheet, Presentation } from 'lucide-react';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'image']);
const SHEET = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv']);

/** نماد هر نوع فایل (بر پایهٔ پسوند) */
export function fileIcon(ext: string) {
  if (IMAGE.has(ext)) return ImageIcon;
  if (SHEET.has(ext)) return FileSpreadsheet;
  if (ext === 'pptx') return Presentation;
  return FileText;
}

/** رنگ نشانِ هر نوع فایل — همان رنگ‌های بخش پیش‌نویس */
export function fileAccent(ext: string) {
  if (ext === 'pdf') return { text: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' };
  if (ext === 'docx' || ext === 'doc' || ext === 'odt') return { text: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200' };
  if (SHEET.has(ext)) return { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
  if (IMAGE.has(ext)) return { text: 'text-violet-500', bg: 'bg-violet-50', border: 'border-violet-200' };
  return { text: 'text-navy-500', bg: 'bg-navy-50', border: 'border-navy-200' };
}
