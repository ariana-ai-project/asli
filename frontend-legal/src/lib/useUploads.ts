/**
 * فایل‌های انتخاب‌شدهٔ کاربر: آماده‌سازی در مرورگر ← بارگذاری جریانی به سرور ← آماده برای مدل.
 * هر فایل وضعیت و پیشرفت خودش را دارد؛ فرستادن تا وقتی فایلی در راه است ممکن نیست.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareFile, extOf } from './files';
import { uploadFile, deleteFile, type UploadedFile, type Purpose } from './api';

export interface LocalFile {
  key: string;
  name: string;
  size: number;
  ext: string;
  status: 'preparing' | 'uploading' | 'ready' | 'error';
  progress: number;
  remote?: UploadedFile;
  error?: string;
}

let seq = 0;
const newKey = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function useUploads(purpose: Purpose, opts: { single?: boolean } = {}) {
  const [files, setFiles] = useState<LocalFile[]>([]);
  const removed = useRef(new Set<string>());
  const live = useRef<LocalFile[]>([]);
  useEffect(() => { live.current = files; }, [files]);

  const patch = useCallback((key: string, p: Partial<LocalFile>) => {
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...p } : f)));
  }, []);

  const remove = useCallback((key: string) => {
    const f = live.current.find((x) => x.key === key);
    removed.current.add(key);
    if (f?.remote) deleteFile(f.remote.id);
    setFiles((prev) => prev.filter((x) => x.key !== key));
  }, []);

  const add = useCallback(async (list: File[]) => {
    if (!list.length) return;
    const picked = opts.single ? list.slice(0, 1) : list;
    const items: LocalFile[] = picked.map((file) => ({ key: newKey(), name: file.name, size: file.size, ext: extOf(file.name), status: 'preparing', progress: 0 }));
    if (opts.single) for (const old of live.current) remove(old.key);
    setFiles((prev) => (opts.single ? items : [...prev, ...items]));
    await Promise.all(items.map(async (it, i) => {
      try {
        const prepared = await prepareFile(picked[i]);
        if (removed.current.has(it.key)) return;
        patch(it.key, { status: 'uploading', progress: 0 });
        const remote = await uploadFile(prepared, purpose, (fr) => patch(it.key, { progress: fr }));
        /* در حین بارگذاری حذف شد: فایلِ رسیده به سرور هم پاک شود */
        if (removed.current.has(it.key)) { deleteFile(remote.id); return; }
        patch(it.key, { status: 'ready', progress: 1, remote });
      } catch (e) {
        patch(it.key, { status: 'error', error: e instanceof Error ? e.message : 'خطای ناشناخته در آماده‌سازی فایل' });
      }
    }));
  }, [purpose, opts.single, patch, remove]);

  /** پاک کردن فهرست؛ drop=true فایل‌های رسیده به سرور را هم پاک می‌کند */
  const clear = useCallback((drop = false) => {
    for (const f of live.current) {
      removed.current.add(f.key);
      if (drop && f.remote) deleteFile(f.remote.id);
    }
    setFiles([]);
  }, []);

  const busy = files.some((f) => f.status === 'preparing' || f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'ready' && f.remote);
  return { files, add, remove, clear, busy, ready, ids: ready.map((f) => f.remote!.id) };
}
