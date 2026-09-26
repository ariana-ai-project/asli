/**
 * ارتباط بخش حقوقی با سرور (Cloudflare Worker، مسیر /hoghooghi/api — worker/legal.js)
 *
 * هویت: بخش حقوقی ورود ندارد؛ این مرورگر یک «فضای کاری» تصادفی دارد که گفت‌وگوها و فایل‌ها
 * به آن تعلق دارند. همین کد را می‌شود روی دستگاه دیگری وارد کرد تا همان گفت‌وگوها دیده شوند.
 */
import type { PreparedFile } from './files';

export const API_BASE: string = (import.meta.env.VITE_LEGAL_API as string | undefined) || '/hoghooghi/api';

const WS_KEY = 'ariana-legal-ws';
const WS_RE = /^[a-f0-9]{32}$/;
let wsMem: string | null = null;

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function workspaceId(): string {
  if (wsMem) return wsMem;
  let v: string | null = null;
  try { v = localStorage.getItem(WS_KEY); } catch { /* ذخیره‌سازی مرورگر بسته است */ }
  if (!v || !WS_RE.test(v)) {
    v = randomHex(16);
    try { localStorage.setItem(WS_KEY, v); } catch { /* فقط برای همین نشست */ }
  }
  wsMem = v;
  return v;
}

/** کد فضای کاری دستگاه دیگر را جایگزین می‌کند؛ اگر کد معتبر نبود false */
export function setWorkspaceId(code: string): boolean {
  const v = code.trim().toLowerCase().replace(/[^a-f0-9]/g, '');
  if (!WS_RE.test(v)) return false;
  wsMem = v;
  try { localStorage.setItem(WS_KEY, v); } catch { /* فقط برای همین نشست */ }
  return true;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;
  constructor(message: string, status = 0, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function errorOf(r: Response): Promise<ApiError> {
  let d: Record<string, unknown> | null = null;
  try { d = await r.json(); } catch { /* پاسخ JSON نبود */ }
  const msg = (d && typeof d.error === 'string' && d.error)
    || (r.status === 404 ? 'سرویس بخش حقوقی در دسترس نیست.' : r.status >= 500 ? `خطای سرور (${r.status}). لطفاً دوباره تلاش کنید.` : `درخواست ناموفق بود (${r.status}).`);
  return new ApiError(String(msg), r.status, d && typeof d.code === 'string' ? d.code : undefined, d || undefined);
}

const netError = () => new ApiError('ارتباط با سرور برقرار نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.', 0, 'network');

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      ...init,
      headers: {
        'X-Legal-Ws': workspaceId(),
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw netError();
  }
  if (!r.ok) throw await errorOf(r);
  return r.json() as Promise<T>;
}

/** درخواستی که پاسخ جریانی (SSE) مدل را برمی‌گرداند */
export async function apiStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'X-Legal-Ws': workspaceId(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw netError();
  }
  if (!r.ok) throw await errorOf(r);
  if (!r.body) throw new ApiError('پاسخ جریانی از سرور نرسید.', 502);
  return r;
}

/* ------------------------------------------------------------------ */
/* خواندن جریان پاسخ مدل                                                */
/* ------------------------------------------------------------------ */
export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
}

export interface StreamResult {
  text: string;
  stop: string | null;
  usage: Usage | null;
  /** رویداد message_stop رسید — پاسخ کامل است */
  complete: boolean;
}

export interface StreamHandlers {
  onText?: (full: string) => void;
  onPhase?: (phase: 'thinking' | 'writing') => void;
}

const STREAM_ERRORS: Record<string, string> = {
  overloaded_error: 'سرویس مدل موقتاً شلوغ است؛ چند لحظهٔ دیگر دوباره تلاش کنید.',
  rate_limit_error: 'سقف درخواست به سرویس مدل پر شده است؛ یک دقیقهٔ دیگر دوباره تلاش کنید.',
  api_error: 'خطای موقت در سرویس مدل؛ دوباره تلاش کنید.',
};

/** رویدادهای SSE انتروپیک را می‌خواند؛ متن را تکه‌تکه به onText می‌دهد */
export async function readStream(r: Response, h: StreamHandlers = {}): Promise<StreamResult> {
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let stop: string | null = null;
  let usage: Usage | null = null;
  let complete = false;
  let failure: ApiError | null = null;

  type SseEvent = {
    type?: string;
    message?: { usage?: Usage };
    content_block?: { type?: string };
    delta?: { type?: string; text?: string; stop_reason?: string };
    usage?: Usage;
    error?: { type?: string; message?: string };
  };
  const handle = (data: string) => {
    let d: SseEvent;
    try { d = JSON.parse(data); } catch { return; }
    switch (d.type) {
      case 'message_start':
        usage = { ...(d.message?.usage || {}) };
        break;
      case 'content_block_start': {
        const t = d.content_block?.type;
        if (t === 'thinking' || t === 'redacted_thinking') h.onPhase?.('thinking');
        else if (t === 'text') h.onPhase?.('writing');
        break;
      }
      case 'content_block_delta':
        if (d.delta?.type === 'text_delta' && typeof d.delta.text === 'string') {
          text += d.delta.text;
          h.onText?.(text);
        }
        break;
      case 'message_delta':
        if (d.delta?.stop_reason) stop = d.delta.stop_reason;
        if (d.usage) usage = { ...(usage || {}), ...d.usage };
        break;
      case 'message_stop':
        complete = true;
        break;
      case 'error': {
        const type = String(d.error?.type || '');
        failure = new ApiError(STREAM_ERRORS[type] || `خطا از سرویس مدل: ${d.error?.message || type || 'نامشخص'}`, 502, type);
        break;
      }
    }
  };

  const event = (chunk: string) => {
    let data = '';
    for (const line of chunk.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trimStart();
    if (data) handle(data);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        event(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    }
    /* رویداد آخر ممکن است بی خط خالیِ پایانی برسد */
    buf += dec.decode();
    if (buf.trim()) event(buf.replace(/\r\n/g, '\n'));
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    if (!complete) throw new ApiError('ارتباط در میانهٔ دریافت پاسخ قطع شد؛ دوباره تلاش کنید.', 0, 'network');
  }
  if (failure) throw failure;
  return { text, stop, usage, complete };
}

/** توضیح پایان غیرعادی پاسخ برای کاربر؛ پایان عادی null */
export function stopNote(stop: string | null): string | null {
  switch (stop) {
    case 'end_turn':
    case 'stop_sequence':
    case null:
      return null;
    case 'max_tokens':
      return 'پاسخ به سقف طول خروجی مدل رسید و ممکن است ناتمام باشد؛ می‌توانید بخواهید ادامه دهد.';
    case 'model_context_window_exceeded':
      return 'ظرفیت متنی مدل پر شد و پاسخ ناتمام ماند؛ گفت‌وگوی تازه‌ای با خلاصهٔ موضوع شروع کنید یا فایل‌های کوچک‌تری بفرستید.';
    case 'refusal':
      return 'مدل به این درخواست پاسخ نداد. لطفاً درخواست را به شکل دیگری مطرح کنید.';
    case 'user_stop':
      return 'پاسخ به درخواست شما متوقف شد.';
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* بارگذاری فایل                                                        */
/* ------------------------------------------------------------------ */
export type Purpose = 'chat' | 'analyze' | 'draft';

export interface UploadedFile {
  id: string;
  name: string;
  mime: string;
  src: string | null;
  size: number;
  tok: number;
  kind?: 'document' | 'image';
}

/** با XMLHttpRequest تا پیشرفت بارگذاری فایل‌های بزرگ دیده شود */
export function uploadFile(p: PreparedFile, purpose: Purpose, onProgress?: (fraction: number) => void): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const q = new URLSearchParams({ purpose, src: p.src });
    xhr.open('POST', `${API_BASE}/files?${q}`);
    xhr.setRequestHeader('X-Legal-Ws', workspaceId());
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(p.name));
    xhr.setRequestHeader('Content-Type', p.mime);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let d: Record<string, unknown> | null = null;
      try { d = JSON.parse(xhr.responseText); } catch { /* پاسخ JSON نبود */ }
      if (xhr.status >= 200 && xhr.status < 300 && d && d.id) resolve(d as unknown as UploadedFile);
      else reject(new ApiError(String((d && d.error) || `بارگذاری «${p.name}» ناموفق بود (${xhr.status}).`), xhr.status, d && typeof d.code === 'string' ? d.code : undefined));
    };
    xhr.onerror = () => reject(new ApiError(`بارگذاری «${p.name}» به دلیل قطع ارتباط انجام نشد.`, 0, 'network'));
    xhr.send(p.blob);
  });
}

export const deleteFile = (id: string) => api<{ ok: boolean }>(`/files/${id}`, { method: 'DELETE' }).catch(() => null);

export const reportUsage = (call: string | null, usage: Usage | null) => {
  if (!call || !usage) return;
  api('/usage', { method: 'POST', body: JSON.stringify({ call: Number(call), usage }) }).catch(() => null);
};

/* ------------------------------------------------------------------ */
/* گفت‌وگو                                                              */
/* ------------------------------------------------------------------ */
export interface ChatSummary {
  id: string;
  title: string;
  turns: number;
  updated_at: number;
  created_at: number;
}

export interface Turn {
  seq: number;
  q: string;
  files: UploadedFile[];
  a: string;
  state: 'pending' | 'done' | 'failed';
  stop: string | null;
  q_at: number;
  a_at: number | null;
}

export interface ChatDetail {
  chat: { id: string; title: string; created_at: number; updated_at: number; memory_seq: number; memory_chars: number; last_seq: number; fold_seq: number };
  turns: Turn[];
}

export interface MemoryInfo {
  title: string;
  memory: string;
  memory_seq: number;
  last_seq: number;
  done_seq: number;
  done_turns: number;
  memory_at: number | null;
  compactions: number;
  fold_seq: number;
  ctx_tokens: number;
  cost_usd: number;
}

export interface CommitResult {
  ok: boolean;
  state: string;
  title?: string;
  memory_seq?: number;
  memory_chars?: number;
  compacted?: boolean;
}

export const listChats = () => api<{ chats: ChatSummary[] }>('/chats');
export const getChat = (id: string) => api<ChatDetail>(`/chats/${id}`);
export const renameChat = (id: string, title: string) => api<{ ok: boolean; title: string }>(`/chats/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
export const deleteChat = (id: string) => api<{ ok: boolean }>(`/chats/${id}`, { method: 'DELETE' });
export const getMemory = (id: string) => api<MemoryInfo>(`/chats/${id}/memory`);
export const refreshMemory = (id: string) => api<CommitResult>(`/chats/${id}/memory/refresh`, { method: 'POST', body: '{}' });
/** ذخیرهٔ پاسخ کامل یک نوبت (بی‌درنگ، بی‌انتظار برای حافظه) */
export const saveTurn = (id: string, body: { seq: number; text: string; stop: string | null; usage: Usage | null; call: string | null }) =>
  api<CommitResult>(`/chats/${id}/commit`, { method: 'POST', body: JSON.stringify({ ...body, call: body.call ? Number(body.call) : 0, memory: false }) });
