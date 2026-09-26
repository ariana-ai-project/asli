import { X, Loader, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LocalFile } from '../lib/useUploads';
import { fileIcon, fileAccent } from '../lib/fileKinds';

/** نشانِ یک فایل انتخاب‌شده با وضعیت آماده‌سازی و بارگذاری */
export default function FileChip({ file, onRemove, disabled }: { file: LocalFile; onRemove?: () => void; disabled?: boolean }) {
  const Icon = fileIcon(file.ext);
  const accent = file.status === 'error' ? { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' } : fileAccent(file.ext);
  const pct = Math.round(file.progress * 100);
  return (
    <div
      className={`dr-chip-in relative overflow-hidden flex items-center gap-1.5 ${accent.bg} border ${accent.border} rounded-lg px-2.5 py-1.5 text-xs text-navy-700 max-w-full`}
      title={file.status === 'error' ? file.error : file.name}
    >
      {file.status === 'uploading' && (
        <span className="absolute inset-y-0 right-0 bg-navy-200/40 transition-all duration-200" style={{ width: `${pct}%` }} />
      )}
      <span className="relative flex items-center gap-1.5 min-w-0">
        {file.status === 'preparing' || file.status === 'uploading' ? (
          <Loader size={12} className="animate-spin text-navy-400 flex-shrink-0" />
        ) : file.status === 'error' ? (
          <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
        ) : (
          <Icon size={12} className={`${accent.text} flex-shrink-0`} />
        )}
        <span className="truncate max-w-[140px] md:max-w-[220px]">{file.name}</span>
        {file.status === 'preparing' && <span className="text-navy-400 flex-shrink-0">آماده‌سازی…</span>}
        {file.status === 'uploading' && <span className="text-navy-400 flex-shrink-0 tabular-nums">{pct}٪</span>}
        {file.status === 'ready' && <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />}
        {file.status === 'error' && <span className="text-red-500 flex-shrink-0">ناموفق</span>}
      </span>
      {onRemove && !disabled && (
        <button onClick={onRemove} className="relative p-0.5 hover:bg-black/10 rounded-full transition-colors flex-shrink-0" title="حذف فایل" type="button">
          <X size={11} className="text-navy-500" />
        </button>
      )}
    </div>
  );
}

/** پیام خطای فایل‌های ناموفق زیر فهرست */
export function FileErrors({ files }: { files: LocalFile[] }) {
  const bad = files.filter((f) => f.status === 'error' && f.error);
  if (!bad.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {bad.map((f) => (
        <p key={f.key} className="text-xs text-red-600 leading-relaxed flex items-start gap-1.5">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{f.error}</span>
        </p>
      ))}
    </div>
  );
}
