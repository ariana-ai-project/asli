import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Menu,
  Plus,
  X,
  MessagesSquare,
  MessageCircle,
  Send,
  Square,
  Paperclip,
  Brain,
  Download,
  Copy,
  Check,
  Trash2,
  Pencil,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  ChevronDown,
  Loader,
  Scale,
  FileSignature,
  CalendarClock,
  ShieldAlert,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';
import {
  listChats,
  getChat,
  renameChat,
  deleteChat,
  getMemory,
  refreshMemory,
  saveTurn,
  apiStream,
  readStream,
  stopNote,
  workspaceId,
  setWorkspaceId,
  ApiError,
  type ChatSummary,
  type Turn,
  type UploadedFile,
  type MemoryInfo,
  type Usage,
} from '../lib/api';
import { renderMarkdown, markdownToHtml } from '../lib/markdown';
import { sanitizeFileName, DOCX_MIME } from '../lib/util';
import { ACCEPT_ALL } from '../lib/files';
import { useUploads } from '../lib/useUploads';
import FileChip, { FileErrors } from '../components/FileChip';
import { fileIcon } from '../lib/fileKinds';

type Phase = 'sending' | 'thinking' | 'writing';
type MemState = 'idle' | 'saving' | 'saved' | 'error';
type ViewTurn = Turn & { lid: string; error?: string; note?: string | null };
interface Live { lid: string; text: string; phase: Phase }

const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
const faNum = (n: number) => n.toLocaleString('fa-IR');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const timeFa = (ms: number | null) => (ms ? new Date(ms).toLocaleString('fa-IR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long' }) : '');

const SUGGESTIONS = [
  {
    icon: ShieldAlert,
    title: 'بررسی ریسک یک بند',
    hint: 'متن بند را بفرستید تا ریسک‌ها و اصلاح پیشنهادی را بگیرید',
    text: 'این بند قرارداد را از نظر ریسک برای شرکت بررسی کن و متن اصلاح‌شدهٔ پیشنهادی را هم بنویس:\n\n',
  },
  {
    icon: FileSignature,
    title: 'تنظیم متن حقوقی',
    hint: 'الحاقیه، صورتجلسه، اظهارنامه، نامهٔ رسمی و…',
    text: 'یک الحاقیه برای قرارداد پیمانکاری با این مشخصات تنظیم کن:\n\n',
  },
  {
    icon: CalendarClock,
    title: 'مهلت‌ها و تشریفات',
    hint: 'مهلت اعتراض، تجدیدنظر، ابلاغ و اقدام‌های لازم',
    text: 'در این موضوع، مهلت‌های قانونی و اقدام‌هایی که شرکت باید انجام دهد چیست؟\n\n',
  },
  {
    icon: Scale,
    title: 'لایحه و پاسخ به ادعا',
    hint: 'پیش‌نویس دفاعیه یا پاسخ رسمی به طرف مقابل',
    text: 'برای پاسخ به این ادعای طرف مقابل یک لایحهٔ رسمی و مستدل بنویس:\n\n',
  },
];

function groupLabel(ts: number): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(ts))) / 86400000);
  if (diff <= 0) return 'امروز';
  if (diff === 1) return 'دیروز';
  if (diff < 7) return '۷ روز گذشته';
  if (diff < 30) return '۳۰ روز گذشته';
  return 'قدیمی‌تر';
}

const toView = (t: Turn): ViewTurn => ({
  ...t,
  lid: `s${t.seq}`,
  note: t.state === 'done' ? stopNote(t.stop) : null,
  error: t.state === 'failed' ? 'پاسخ این پیام کامل نشد.' : t.state === 'pending' ? 'پاسخ این پیام کامل دریافت نشد.' : undefined,
});

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ------------------------------------------------------------------ */
/* پیام‌ها                                                              */
/* ------------------------------------------------------------------ */
function UserBubble({ t }: { t: ViewTurn }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] md:max-w-xl">
        <div className="bg-navy-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
          {t.q && <p className="text-sm leading-7 whitespace-pre-wrap break-words">{t.q}</p>}
          {t.files.length > 0 && (
            <div className={`${t.q ? 'mt-2 pt-2 border-t border-white/20' : ''} flex flex-wrap gap-2`}>
              {t.files.map((f) => {
                const Icon = fileIcon(f.src || '');
                return (
                  <div key={f.id} className="flex items-center gap-1.5 text-xs text-blue-100 bg-white/10 rounded-lg px-2 py-1">
                    <Icon size={11} className="flex-shrink-0" />
                    <span className="truncate max-w-[180px]">{f.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-[11px] text-navy-300 mt-1 text-left">{timeFa(t.q_at)}</p>
      </div>
    </div>
  );
}

function Answer({ t, title, onToast }: { t: ViewTurn; title: string; onToast: (m: string) => void }) {
  const html = useMemo(() => renderMarkdown(t.a), [t.a]);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const doCopy = async () => {
    if (await copyText(t.a)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else onToast('رونوشت‌برداری انجام نشد.');
  };
  const doWord = async () => {
    setExporting(true);
    try {
      const { answerDocx } = await import('../lib/reportDocx');
      const blob = await answerDocx(title || 'پاسخ دستیار حقوقی', markdownToHtml(t.a));
      download(new Blob([blob], { type: DOCX_MIME }), `${sanitizeFileName(title || 'پاسخ-دستیار-حقوقی')}.docx`);
    } catch {
      onToast('ساخت فایل Word انجام نشد.');
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="flex justify-start">
      <div className="w-full md:max-w-3xl min-w-0">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 md:px-5 py-4 shadow-sm">
          <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        {t.note && (
          <p className="text-xs text-amber-700 mt-2 flex items-start gap-1.5 leading-5">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            {t.note}
          </p>
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <button onClick={doCopy} className="flex items-center gap-1 text-[11px] text-navy-400 hover:text-navy-700 hover:bg-white px-2 py-1 rounded-lg transition-colors" title="رونوشت متن پاسخ">
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? 'رونوشت شد' : 'رونوشت'}
          </button>
          <button onClick={doWord} disabled={exporting} className="flex items-center gap-1 text-[11px] text-navy-400 hover:text-navy-700 hover:bg-white px-2 py-1 rounded-lg transition-colors disabled:opacity-50" title="دریافت پاسخ به‌صورت فایل Word">
            {exporting ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
            Word
          </button>
          <span className="text-[11px] text-navy-300 mr-auto">{timeFa(t.a_at)}</span>
        </div>
      </div>
    </div>
  );
}

function LiveAnswer({ live }: { live: Live }) {
  const html = useMemo(() => renderMarkdown(live.text), [live.text]);
  if (!live.text) {
    return (
      <div className="flex justify-start">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm dr-fade-in">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <p className="text-xs text-navy-500">
              {live.phase === 'sending' ? 'در حال ارسال…' : 'در حال بررسی و اندیشیدن به پاسخ…'}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="w-full md:max-w-3xl min-w-0">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 md:px-5 py-4 shadow-sm">
          <div className="md stream-caret" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

function FailedAnswer({ t, onRetry }: { t: ViewTurn; onRetry?: () => void }) {
  const html = useMemo(() => (t.a ? renderMarkdown(t.a) : ''), [t.a]);
  return (
    <div className="flex justify-start">
      <div className="w-full md:max-w-3xl min-w-0 space-y-2">
        {html && (
          <div className="bg-white/70 border border-gray-200 rounded-2xl rounded-tl-sm px-4 md:px-5 py-4 opacity-75">
            <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
        <div className="inline-flex max-w-full rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm bg-red-50 border border-red-200 text-red-700 items-start gap-2.5">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm leading-relaxed">{t.error || 'پاسخ این پیام کامل نشد.'}</p>
            {onRetry && (
              <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:text-red-900 transition-colors">
                <RotateCcw size={12} />
                ارسال دوباره
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* پنجره‌ها                                                              */
/* ------------------------------------------------------------------ */
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-sm'} max-h-[88svh] flex flex-col dr-fade-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function MemoryModal({ chatId, onClose, onRefreshed }: { chatId: string; onClose: () => void; onRefreshed: (title?: string) => void }) {
  const [info, setInfo] = useState<MemoryInfo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    setErr(null);
    getMemory(chatId).then(setInfo).catch((e) => setErr(e instanceof Error ? e.message : 'خطا'));
  }, [chatId]);
  useEffect(load, [load]);
  const html = useMemo(() => (info?.memory ? renderMarkdown(info.memory) : ''), [info?.memory]);
  const lagging = !!info && info.memory_seq < info.done_seq;
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await refreshMemory(chatId);
      onRefreshed(r.title);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا');
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!info) return;
    const body = `# حافظهٔ گفت‌وگو: ${info.title}\n\n${info.memory}\n`;
    download(new Blob([body], { type: 'text/markdown;charset=utf-8' }), `${sanitizeFileName(`حافظه-${info.title}`, 'حافظه-گفت‌وگو')}.md`);
  };
  return (
    <Modal onClose={onClose} wide>
      <div className="px-5 py-4 border-b border-gray-100 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-navy-700 to-sky-600 flex items-center justify-center flex-shrink-0">
          <Brain size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-navy-900">حافظهٔ این گفت‌وگو</h3>
          <p className="text-xs text-navy-400 leading-5 mt-0.5">
            خلاصه‌ای که دستیار در هر پیام از گفت‌وگوهای پیشین، اسناد پیوست‌شده و نتیجه‌ها به یاد دارد. پس از هر پاسخ خودکار به‌روز و اگر بلند شد، خودکار فشرده می‌شود.
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="بستن">
          <X size={18} className="text-navy-500" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 bg-gray-50/60">
        {err ? (
          <p className="text-sm text-red-600 flex items-center gap-2"><AlertTriangle size={14} />{err}</p>
        ) : !info ? (
          <div className="flex items-center gap-2 text-sm text-navy-400"><Loader size={14} className="animate-spin" /> در حال خواندن حافظه…</div>
        ) : info.memory ? (
          <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-sm text-navy-400">هنوز حافظه‌ای ثبت نشده است؛ پس از نخستین پاسخ ساخته می‌شود.</p>
        )}
      </div>
      {info && (
        <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-[11px] text-navy-400 flex flex-wrap gap-x-3 gap-y-1 flex-1">
            <span>پوشش: {faNum(info.memory_seq ? info.done_turns - Math.max(0, info.done_seq - info.memory_seq) : 0)} از {faNum(info.done_turns)} پیام</span>
            <span>اندازه: {faNum(info.memory.length)} نویسه</span>
            {info.compactions > 0 && <span>فشرده‌سازی: {faNum(info.compactions)} بار</span>}
            {info.memory_at && <span>به‌روزرسانی: {timeFa(info.memory_at)}</span>}
          </div>
          <div className="flex items-center gap-2">
            {lagging && (
              <button onClick={refresh} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 transition-colors">
                {busy ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                به‌روزرسانی حافظه
              </button>
            )}
            <button onClick={save} disabled={!info.memory} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-navy-700 hover:bg-navy-800 text-white disabled:opacity-40 transition-colors">
              <Download size={12} />
              دریافت فایل حافظه
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function WorkspaceModal({ onClose, onSwitched }: { onClose: () => void; onSwitched: () => void }) {
  const code = workspaceId();
  const [other, setOther] = useState('');
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const pretty = code.match(/.{1,4}/g)!.join('-');
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-navy-50 flex items-center justify-center mb-3">
          <KeyRound size={22} className="text-navy-600" />
        </div>
        <h3 className="text-lg font-bold text-navy-900 mb-2 text-center">دسترسی از دستگاه دیگر</h3>
        <p className="text-xs text-navy-500 leading-6 text-center mb-4">
          گفت‌وگوهای شما به این مرورگر گره خورده‌اند. برای دیدن همین گفت‌وگوها روی دستگاه یا مرورگر دیگر، این کد را آن‌جا وارد کنید. کد را مانند رمز نگه دارید.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-5">
          <code dir="ltr" className="flex-1 text-[12px] text-navy-800 tracking-wide break-all select-all">{pretty}</code>
          <button
            onClick={async () => { if (await copyText(code)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
            className="p-1.5 hover:bg-white rounded-lg transition-colors flex-shrink-0"
            title="رونوشت کد"
          >
            {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} className="text-navy-500" />}
          </button>
        </div>
        <label className="block text-xs font-semibold text-navy-700 mb-1.5">کد دستگاه دیگر</label>
        <input
          dir="ltr"
          value={other}
          onChange={(e) => { setOther(e.target.value); setErr(''); }}
          placeholder="xxxx-xxxx-…"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 text-sm"
          style={{ fontSize: '16px' }}
        />
        {err && <p className="text-xs text-red-600 mt-1.5">{err}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={() => { if (setWorkspaceId(other)) onSwitched(); else setErr('کد وارد شده معتبر نیست.'); }}
            disabled={!other.trim()}
            className="flex-1 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
          >
            ورود با این کد
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-navy-700 rounded-xl text-sm font-semibold transition-colors">
            بستن
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Confirm({ title, text, ok, onOk, onClose }: { title: string; text: string; ok: string; onOk: () => void; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <h3 className="text-lg font-bold text-navy-900 mb-2 text-center">{title}</h3>
        <p className="text-sm text-navy-500 text-center mb-6 leading-relaxed">{text}</p>
        <div className="flex gap-3">
          <button onClick={onOk} className="flex-1 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl text-sm font-semibold transition-colors">{ok}</button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-navy-700 rounded-xl text-sm font-semibold transition-colors">انصراف</button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* صفحه                                                                 */
/* ------------------------------------------------------------------ */
export default function LegalChat() {
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId?: string }>();
  const activeId = chatId || null;

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [chatsError, setChatsError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ViewTurn[]>([]);
  const [title, setTitle] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  /* ورود به بخش: فهرست گفت‌وگوها باز است تا کاربر گفت‌وگوی قبلی یا تازه را انتخاب کند.
     در موبایل اگر مستقیم به یک گفت‌وگو آمده (مثلاً بارگذاری دوباره)، بسته می‌ماند. */
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile() || !chatId);
  const [input, setInput] = useState('');
  const [live, setLive] = useState<Live | null>(null);
  const [memState, setMemState] = useState<MemState>('idle');
  const [memOpen, setMemOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ChatSummary | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const uploads = useUploads('chat');
  const abortRef = useRef<AbortController | null>(null);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<string | null>(activeId);
  const skipLoadRef = useRef<string | null>(null);
  const dragDepth = useRef(0);

  const streaming = live !== null;

  const say = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 4500);
  }, []);

  /* ---------- فهرست گفت‌وگوها ---------- */
  const loadChats = useCallback(async () => {
    try {
      const d = await listChats();
      setChats(d.chats);
      setChatsError(null);
    } catch (e) {
      setChatsError(e instanceof Error ? e.message : 'خطا در خواندن گفت‌وگوها');
    } finally {
      setChatsLoaded(true);
    }
  }, []);
  useEffect(() => { loadChats(); }, [loadChats]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  /* ---------- حافظه: پشت‌سرهم، یکی پس از دیگری ---------- */
  const enqueueMemory = useCallback((id: string) => {
    if (activeRef.current === id) setMemState('saving');
    chainRef.current = chainRef.current.then(async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await refreshMemory(id);
          if (activeRef.current === id) setMemState('saved');
          if (r.title) {
            setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: r.title! } : c)));
            if (activeRef.current === id) setTitle(r.title);
          }
          return;
        } catch {
          if (i === 1) { if (activeRef.current === id) setMemState('error'); } else await sleep(3000);
        }
      }
    });
  }, []);

  /* ---------- بارگذاری گفت‌وگوی انتخاب‌شده ---------- */
  useEffect(() => {
    activeRef.current = activeId;
    setChatError(null);
    setMemState('idle');
    if (!activeId) {
      setTurns([]);
      setTitle('');
      return;
    }
    if (skipLoadRef.current === activeId) {
      skipLoadRef.current = null;
      return;
    }
    let cancelled = false;
    setChatLoading(true);
    setTurns([]);
    getChat(activeId)
      .then((d) => {
        if (cancelled) return;
        setTurns(d.turns.map(toView));
        setTitle(d.chat.title);
        const lastDone = [...d.turns].reverse().find((t) => t.state === 'done');
        if (lastDone && d.chat.memory_seq < lastDone.seq) enqueueMemory(activeId);
        requestAnimationFrame(() => scrollToBottom(false));
      })
      .catch((e) => { if (!cancelled) setChatError(e instanceof Error ? e.message : 'خطا'); })
      .finally(() => { if (!cancelled) setChatLoading(false); });
    return () => { cancelled = true; };
  }, [activeId, enqueueMemory, scrollToBottom]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /* پیمایش: اگر کاربر پایین صفحه است، با پاسخ جریانی پایین بماند */
  useEffect(() => {
    if (atBottom) scrollToBottom(false);
  }, [turns, live?.text, atBottom, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 140);
  };

  /* ---------- ذخیرهٔ پاسخ کامل ---------- */
  const persist = useCallback(async (id: string, seq: number, text: string, stop: string | null, usage: Usage | null, call: string | null) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await saveTurn(id, { seq, text, stop, usage, call });
        if (r.ok) enqueueMemory(id);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) break;
        await sleep(1500 * (i + 1));
      }
    }
    if (activeRef.current === id) setMemState('error');
    say('پاسخ در سرور ذخیره نشد؛ ممکن است در ادامهٔ گفت‌وگو در نظر گرفته نشود.');
  }, [enqueueMemory, say]);

  /* ---------- فرستادن پیام ---------- */
  const send = useCallback(async (textArg?: string, filesArg?: UploadedFile[], replaceLid?: string) => {
    if (live || uploads.busy) return;
    const text = textArg ?? input;
    const files = filesArg ?? uploads.ready.map((f) => f.remote!);
    if (!text.trim() && !files.length) return;

    const target = activeId || 'new';
    const lid = `l${Date.now()}`;
    const temp: ViewTurn = { lid, seq: 0, q: text.trim() ? text : '', files, a: '', state: 'pending', stop: null, q_at: Date.now(), a_at: null };
    setTurns((prev) => [...prev.filter((t) => t.lid !== replaceLid), temp]);
    if (textArg === undefined) {
      setInput('');
      if (inputRef.current) inputRef.current.style.height = '';
    }
    if (!filesArg) uploads.clear(false);
    setLive({ lid, text: '', phase: 'sending' });
    setAtBottom(true);
    if (isMobile()) setSidebarOpen(false);

    const patch = (p: Partial<ViewTurn>) => setTurns((prev) => prev.map((t) => (t.lid === lid ? { ...t, ...p } : t)));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let realId = target;
    let seq = 0;
    let call: string | null = null;
    let partial = '';
    let timer: number | null = null;
    const flushNow = () => {
      if (timer !== null) { window.clearTimeout(timer); timer = null; }
    };

    try {
      const r = await apiStream(`/chats/${target}/send`, { text, files: files.map((f) => f.id) }, ctrl.signal);
      realId = r.headers.get('x-chat-id') || target;
      seq = Number(r.headers.get('x-turn') || 0);
      call = r.headers.get('x-call');
      patch({ seq });
      const label = (text.trim() || files[0]?.name || 'گفت‌وگوی تازه').replace(/\s+/g, ' ').slice(0, 60);
      if (target === 'new') {
        skipLoadRef.current = realId;
        activeRef.current = realId;
        const now = Date.now();
        setChats((prev) => [{ id: realId, title: label, turns: 1, updated_at: now, created_at: now }, ...prev]);
        setTitle(label);
        navigate(`/chat/${realId}`, { replace: true });
      } else {
        setChats((prev) => {
          const c = prev.find((x) => x.id === realId);
          return c ? [{ ...c, updated_at: Date.now(), turns: c.turns + 1 }, ...prev.filter((x) => x.id !== realId)] : prev;
        });
      }

      const res = await readStream(r, {
        onPhase: (p) => setLive((l) => (l && l.lid === lid ? { ...l, phase: p } : l)),
        onText: (full) => {
          partial = full;
          if (timer === null) {
            timer = window.setTimeout(() => {
              timer = null;
              setLive((l) => (l && l.lid === lid ? { ...l, text: partial, phase: 'writing' } : l));
            }, 60);
          }
        },
      });
      flushNow();
      if (res.text.trim() && (res.complete || res.stop)) {
        patch({ a: res.text, state: 'done', stop: res.stop, note: stopNote(res.stop), a_at: Date.now() });
        await persist(realId, seq, res.text, res.stop, res.usage, call);
      } else {
        patch({ state: 'failed', a: res.text, error: res.stop === 'refusal' ? (stopNote('refusal') as string) : 'پاسخی از مدل نرسید؛ دوباره تلاش کنید.' });
      }
    } catch (e) {
      flushNow();
      if ((e as Error)?.name === 'AbortError') {
        if (partial.trim() && seq) {
          patch({ a: partial, state: 'done', stop: 'user_stop', note: 'پاسخ به درخواست شما متوقف شد.', a_at: Date.now() });
          await persist(realId, seq, partial, 'user_stop', null, call);
        } else {
          patch({ state: 'failed', error: 'ارسال متوقف شد.' });
        }
      } else {
        patch({ state: 'failed', a: partial, error: e instanceof Error ? e.message : 'خطای ناشناخته' });
        /* گفت‌وگوی تازه روی سرور ساخته شد ولی مدل پاسخ نداد: به همان گفت‌وگو برو تا پیام گم نشود */
        const d = e instanceof ApiError ? e.data : undefined;
        if (target === 'new' && d && typeof d.chat === 'string') {
          const cid = d.chat;
          skipLoadRef.current = cid;
          activeRef.current = cid;
          const now = Date.now();
          const label = (text.trim() || files[0]?.name || 'گفت‌وگوی تازه').slice(0, 60);
          setChats((prev) => (prev.some((c) => c.id === cid) ? prev : [{ id: cid, title: label, turns: 1, updated_at: now, created_at: now }, ...prev]));
          setTitle(label);
          patch({ seq: Number(d.seq || 0) });
          navigate(`/chat/${cid}`, { replace: true });
        }
      }
    } finally {
      abortRef.current = null;
      setLive(null);
    }
  }, [live, uploads, input, activeId, navigate, persist]);

  /* ---------- رویدادهای رابط ---------- */
  const canSend = !streaming && !uploads.busy && !chatLoading && (!!input.trim() || uploads.ready.length > 0);

  const newChat = () => {
    if (streaming) return;
    uploads.clear(true);
    setInput('');
    navigate('/chat');
    if (isMobile()) setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const openChat = (id: string) => {
    if (streaming) return;
    if (id !== activeId) {
      uploads.clear(true);
      navigate(`/chat/${id}`);
    }
    if (isMobile()) setSidebarOpen(false);
  };

  const doRename = async () => {
    if (!editing) return;
    const { id, title: t } = editing;
    setEditing(null);
    const clean = t.trim();
    const cur = chats.find((c) => c.id === id);
    if (!clean || !cur || clean === cur.title) return;
    try {
      const r = await renameChat(id, clean);
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: r.title } : c)));
      if (activeRef.current === id) setTitle(r.title);
    } catch (e) {
      say(e instanceof Error ? e.message : 'تغییر عنوان انجام نشد.');
    }
  };

  const doDelete = async (c: ChatSummary) => {
    setToDelete(null);
    try {
      await deleteChat(c.id);
      setChats((prev) => prev.filter((x) => x.id !== c.id));
      if (activeId === c.id) navigate('/chat');
    } catch (e) {
      say(e instanceof Error ? e.message : 'حذف گفت‌وگو انجام نشد.');
    }
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    uploads.add(files);
    inputRef.current?.focus();
  };

  const autoSize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  };

  const hasFilesDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const grouped = useMemo(() => {
    const out: Array<{ label: string; items: ChatSummary[] }> = [];
    for (const c of chats) {
      const label = groupLabel(c.updated_at);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(c);
      else out.push({ label, items: [c] });
    }
    return out;
  }, [chats]);

  const lastTurn = turns[turns.length - 1];
  const headerTitle = activeId ? title || 'گفت‌وگوی تازه' : 'گفت‌وگوی حقوقی';

  return (
    <div className="chat-screen flex bg-white relative overflow-hidden" dir="rtl">
      {/* پس‌زمینهٔ کشوی موبایل */}
      <div
        className={`md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed md:relative inset-y-0 right-0 z-40 md:z-auto w-[84vw] max-w-[320px] md:max-w-none bg-navy-950 text-white flex flex-col overflow-hidden flex-shrink-0 transform transition-all duration-300 md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0 md:w-72' : 'translate-x-full md:w-0'
        }`}
      >
        <div className="p-4 border-b border-white/10 flex items-center gap-2 min-w-[288px] md:min-w-[18rem]">
          <button
            onClick={newChat}
            disabled={streaming}
            className="flex-1 flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            <Plus size={18} />
            گفت‌وگوی تازه
          </button>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2.5 rounded-xl hover:bg-white/10 transition-colors" title="بستن فهرست">
            <X size={18} className="text-blue-200" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 min-w-[288px] md:min-w-[18rem]">
          {!chatsLoaded ? (
            <div className="px-3 space-y-2">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-lg bg-white/5 animate-pulse" />)}
            </div>
          ) : chatsError ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-red-300 leading-6 mb-3">{chatsError}</p>
              <button onClick={loadChats} className="text-xs text-sky-300 hover:text-white inline-flex items-center gap-1.5"><RefreshCw size={12} /> تلاش دوباره</button>
            </div>
          ) : chats.length === 0 ? (
            <p className="text-blue-200/30 text-xs text-center py-8 px-4 leading-6">هنوز گفت‌وگویی ندارید.<br />با «گفت‌وگوی تازه» شروع کنید.</p>
          ) : (
            grouped.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-5 pt-1 pb-1.5 text-[11px] font-semibold text-blue-200/40">{g.label}</p>
                <div className="px-3 space-y-0.5">
                  {g.items.map((c) => {
                    const active = c.id === activeId;
                    if (editing?.id === c.id) {
                      return (
                        <input
                          key={c.id}
                          autoFocus
                          value={editing.title}
                          onChange={(e) => setEditing({ id: c.id, title: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setEditing(null); }}
                          onBlur={doRename}
                          maxLength={120}
                          className="w-full bg-navy-900 text-white text-sm rounded-lg px-3 py-2 outline-none ring-1 ring-sky-400"
                          style={{ fontSize: '16px' }}
                        />
                      );
                    }
                    return (
                      <div key={c.id} className={`group relative rounded-lg transition-colors ${active ? 'bg-white/10 text-white' : 'text-blue-200/70 hover:text-white hover:bg-white/5'}`}>
                        <button
                          onClick={() => openChat(c.id)}
                          disabled={streaming && !active}
                          className="w-full text-right pr-3 pl-16 py-2.5 text-sm flex items-start gap-2 disabled:opacity-50"
                          title={c.title}
                        >
                          <MessageCircle size={14} className="flex-shrink-0 mt-1" />
                          <span className="truncate flex-1 leading-6">{c.title}</span>
                        </button>
                        <div className={`absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100'}`}>
                          <button onClick={() => setEditing({ id: c.id, title: c.title })} className="p-1.5 rounded-md hover:bg-white/10" title="تغییر عنوان">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => setToDelete(c)} disabled={streaming && active} className="p-1.5 rounded-md hover:bg-white/10 hover:text-red-300 disabled:opacity-40" title="حذف گفت‌وگو">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-white/10 min-w-[288px] md:min-w-[18rem]">
          <button onClick={() => setWsOpen(true)} className="w-full flex items-center gap-2 text-blue-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm">
            <KeyRound size={16} />
            دسترسی از دستگاه دیگر
          </button>
        </div>
      </aside>

      {/* Main */}
      <div
        className="flex-1 flex flex-col overflow-hidden min-w-0 relative"
        onDragEnter={(e) => { if (!hasFilesDrag(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); }}
        onDragOver={(e) => { if (hasFilesDrag(e)) e.preventDefault(); }}
        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
        onDrop={(e) => {
          if (!hasFilesDrag(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!streaming) uploads.add(Array.from(e.dataTransfer.files || []));
        }}
      >
        {/* Header */}
        <div className="border-b border-gray-100 bg-white px-3 md:px-6 py-3 flex items-center justify-between gap-2 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0" title="فهرست گفت‌وگوها">
              <Menu size={20} className="text-navy-700" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-navy-700 to-sky-600 flex items-center justify-center flex-shrink-0">
                <MessagesSquare size={16} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-bold text-navy-900 leading-tight truncate">{headerTitle}</h1>
                <p className="text-xs text-navy-400 truncate">دستیار حقوقی آریانا</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
            {activeId && (
              <button
                onClick={() => setMemOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl hover:bg-navy-50 text-navy-600 transition-colors"
                title="حافظهٔ این گفت‌وگو"
              >
                {memState === 'saving' ? <Loader size={17} className="animate-spin" /> : <Brain size={17} className={memState === 'error' ? 'text-amber-500' : ''} />}
                <span className="hidden sm:inline text-xs font-semibold">حافظه</span>
              </button>
            )}
            <button
              onClick={() => (streaming ? setExitConfirm(true) : navigate('/'))}
              className="hover:opacity-80 transition-opacity"
              title="بازگشت به صفحه اول"
            >
              <img src={`${import.meta.env.BASE_URL}tunnelsaddariana_logo.jpg`} alt="لوگو" className="w-8 h-8 rounded-lg object-contain cursor-pointer" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto bg-gray-50 px-3 md:px-10 lg:px-20 py-6">
          <div className="max-w-3xl mx-auto space-y-5">
            {chatLoading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-navy-400 py-20">
                <Loader size={16} className="animate-spin" /> در حال بارگذاری گفت‌وگو…
              </div>
            ) : chatError ? (
              <div className="text-center py-16 dr-fade-in">
                <AlertTriangle size={28} className="text-amber-500 mx-auto mb-3" />
                <p className="text-sm text-navy-600 mb-4">{chatError}</p>
                <button onClick={newChat} className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-sm font-semibold rounded-xl transition-colors">گفت‌وگوی تازه</button>
              </div>
            ) : turns.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center pt-4 md:pt-10 dr-fade-in">
                <div className="relative w-20 h-20 mb-5">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-navy-700 to-sky-600 blur-lg opacity-30" />
                  <div className="relative w-20 h-20 bg-gradient-to-br from-navy-700 to-sky-600 rounded-3xl flex items-center justify-center shadow-lg shadow-navy-900/20">
                    <MessagesSquare size={36} className="text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-navy-900 mb-2">گفت‌وگوی حقوقی</h2>
                <p className="text-navy-400 max-w-md text-sm leading-relaxed">
                  پرسش حقوقی خود را بنویسید یا سند پیوست کنید. هر گفت‌وگو حافظهٔ جداگانه‌ای دارد و هر وقت بخواهید، از همان‌جا ادامه می‌یابد.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 w-full max-w-xl">
                  {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.title}
                        onClick={() => {
                          setInput(s.text);
                          setTimeout(() => {
                            const el = inputRef.current;
                            if (el) { el.focus(); el.setSelectionRange(s.text.length, s.text.length); autoSize(el); }
                          }, 30);
                        }}
                        className="flex items-start gap-3 text-right bg-white border border-gray-200 hover:border-navy-300 hover:shadow-md rounded-2xl px-4 py-3 transition-all"
                      >
                        <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                          <Icon size={17} className="text-sky-700" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-navy-800">{s.title}</p>
                          <p className="text-xs text-navy-400 mt-0.5 leading-5">{s.hint}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 flex items-center gap-2 text-xs text-navy-300">
                  <Paperclip size={14} />
                  <span>PDF، Word، اکسل، پاورپوینت، متن و تصویر</span>
                </div>
              </div>
            ) : (
              turns.map((t) => (
                <div key={t.lid} className="space-y-3">
                  <UserBubble t={t} />
                  {live && live.lid === t.lid ? (
                    <LiveAnswer live={live} />
                  ) : t.state === 'done' ? (
                    <Answer t={t} title={title} onToast={say} />
                  ) : (
                    <FailedAnswer t={t} onRetry={!streaming && t === lastTurn ? () => send(t.q, t.files, t.lid) : undefined} />
                  )}
                </div>
              ))
            )}

            {!chatLoading && activeId && lastTurn && lastTurn.state === 'done' && !streaming && memState !== 'idle' && (
              <div className="flex justify-start">
                <p className="text-[11px] text-navy-400 flex items-center gap-1.5">
                  {memState === 'saving' ? (
                    <><Loader size={11} className="animate-spin" /> در حال به‌روزرسانی حافظهٔ گفت‌وگو…</>
                  ) : memState === 'saved' ? (
                    <><Brain size={11} className="text-emerald-500" /> حافظهٔ گفت‌وگو به‌روز شد</>
                  ) : (
                    <>
                      <AlertTriangle size={11} className="text-amber-500" /> حافظهٔ گفت‌وگو به‌روز نشد —
                      <button onClick={() => activeId && enqueueMemory(activeId)} className="underline hover:text-navy-700">تلاش دوباره</button>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {!atBottom && turns.length > 0 && (
          <button
            onClick={() => { setAtBottom(true); scrollToBottom(); }}
            className="absolute left-1/2 -translate-x-1/2 bottom-36 md:bottom-40 z-10 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
            title="رفتن به آخرین پیام"
          >
            <ChevronDown size={18} className="text-navy-600" />
          </button>
        )}

        {/* Composer */}
        <div className="border-t border-gray-100 bg-white px-3 md:px-10 lg:px-20 pt-3 pb-6 md:pb-8 flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            {uploads.files.length > 0 && (
              <div className="mb-2">
                <div className="flex flex-wrap gap-2">
                  {uploads.files.map((f) => (
                    <FileChip key={f.key} file={f} onRemove={() => uploads.remove(f.key)} disabled={streaming} />
                  ))}
                </div>
                <FileErrors files={uploads.files} />
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white px-2 py-2 shadow-sm focus-within:ring-2 focus-within:ring-navy-400 focus-within:border-transparent transition">
              <input type="file" ref={fileRef} onChange={onPickFiles} multiple accept={ACCEPT_ALL} className="hidden" />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={streaming}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="پیوست فایل"
              >
                <Paperclip size={18} className="text-navy-600" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); autoSize(e.target); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile()) {
                    e.preventDefault();
                    if (canSend) send();
                  }
                }}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData?.files || []);
                  if (files.length && !streaming) {
                    e.preventDefault();
                    uploads.add(files);
                  }
                }}
                rows={1}
                placeholder={uploads.busy ? 'در حال آماده‌سازی فایل…' : 'پرسش حقوقی خود را بنویسید…'}
                className="flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-7 focus:outline-none text-navy-900 placeholder:text-navy-300"
                style={{ fontSize: '16px', maxHeight: '208px' }}
              />
              {streaming ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-navy-900 hover:bg-navy-800 text-white rounded-xl transition-colors shadow-sm"
                  title="توقف پاسخ"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!canSend}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-navy-700 hover:bg-navy-800 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  title="ارسال"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
            <p className="text-[11px] text-navy-300 mt-2 text-center leading-5">
              دستیار ممکن است اشتباه کند؛ استنادهای مهم را با متن رسمی قوانین تطبیق دهید.
            </p>
          </div>
        </div>

        {dragging && (
          <div className="absolute inset-0 z-20 bg-navy-950/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-2 border-2 border-dashed border-navy-400">
              <UploadCloud size={30} className="text-navy-600" />
              <p className="text-sm font-semibold text-navy-800">فایل را این‌جا رها کنید</p>
            </div>
          </div>
        )}
      </div>

      {memOpen && activeId && (
        <MemoryModal
          chatId={activeId}
          onClose={() => setMemOpen(false)}
          onRefreshed={(t) => {
            setMemState('saved');
            if (t) {
              setTitle(t);
              setChats((prev) => prev.map((c) => (c.id === activeId ? { ...c, title: t } : c)));
            }
          }}
        />
      )}
      {wsOpen && (
        <WorkspaceModal
          onClose={() => setWsOpen(false)}
          onSwitched={() => {
            setWsOpen(false);
            setChats([]);
            setChatsLoaded(false);
            navigate('/chat');
            loadChats();
            say('گفت‌وگوهای کد واردشده بارگذاری شد.');
          }}
        />
      )}
      {toDelete && (
        <Confirm
          title="حذف گفت‌وگو"
          text={`گفت‌وگوی «${toDelete.title}» همراه با حافظه و فایل‌هایش برای همیشه حذف می‌شود. ادامه می‌دهید؟`}
          ok="بله، حذف شود"
          onOk={() => doDelete(toDelete)}
          onClose={() => setToDelete(null)}
        />
      )}
      {exitConfirm && (
        <Confirm
          title="خروج از گفت‌وگو"
          text="پاسخ در حال دریافت است و اگر خارج شوید ناتمام می‌ماند. خارج می‌شوید؟"
          ok="بله، خروج"
          onOk={() => { setExitConfirm(false); abortRef.current?.abort(); navigate('/'); }}
          onClose={() => setExitConfirm(false)}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-navy-950 text-white text-sm px-4 py-3 rounded-xl shadow-2xl max-w-[90vw] dr-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
