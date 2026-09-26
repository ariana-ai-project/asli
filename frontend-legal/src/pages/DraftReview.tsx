import { useState, useRef, useEffect } from 'react';
import {
  Loader,
  Download,
  Sparkles,
  Paperclip,
  GitCompare,
  Layers,
  FileCheck2,
  Send,
  Trash2,
  CheckCircle2,
  UploadCloud,
  AlertTriangle,
  Clock,
  Square,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiStream, readStream, reportUsage } from '../lib/api';
import { ACCEPT_DOCS } from '../lib/files';
import { useUploads } from '../lib/useUploads';
import FileChip, { FileErrors } from '../components/FileChip';

interface ResultItem {
  id: string;
  status: 'loading' | 'done' | 'error';
  referenceNames: string[];
  draftName: string;
  timestamp: string;
  docxUrl?: string;
  docxFilename?: string;
  errorMessage?: string;
  findings?: number;
}

const faNum = (n: number) => n.toLocaleString('fa-IR');
const clock = (s: number) => `${faNum(Math.floor(s / 60)).padStart(2, '۰')}:${faNum(s % 60).padStart(2, '۰')}`;

export default function DraftReview() {
  const navigate = useNavigate();

  const refs = useUploads('draft');
  const draft = useUploads('draft', { single: true });
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'sending' | 'thinking' | 'writing'>('sending');
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isDraggingDraft, setIsDraggingDraft] = useState(false);

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const draftFile = draft.files[0] || null;
  const step1Done = refs.ready.length > 0;
  const step2Done = draft.ready.length > 0;
  const canSubmit = step1Done && step2Done && !refs.busy && !draft.busy && !loading;
  const progressPct = ((step1Done ? 1 : 0) + (step2Done ? 1 : 0)) * 50;

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  const handleLogoClick = () => {
    if (loading) return;
    if (results.length > 0 || refs.files.length > 0 || draftFile) {
      setShowExitConfirm(true);
    } else {
      navigate('/');
    }
  };

  const handleReferenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (referenceInputRef.current) referenceInputRef.current.value = '';
    refs.add(files);
  };

  const handleDraftUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (draftInputRef.current) draftInputRef.current.value = '';
    draft.add(files);
  };

  const handleReferenceDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingRef(false);
    if (loading) return;
    refs.add(Array.from(e.dataTransfer.files || []));
  };

  const handleDraftDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingDraft(false);
    if (loading) return;
    draft.add(Array.from(e.dataTransfer.files || []).slice(0, 1));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const resultId = Date.now().toString();
    const referenceNames = refs.ready.map((f) => f.name);
    const draftName = draft.ready[0].name;

    setResults((prev) => [
      {
        id: resultId,
        status: 'loading',
        referenceNames,
        draftName,
        timestamp: new Date().toLocaleString('fa-IR'),
      },
      ...prev,
    ]);
    setLoading(true);
    setPhase('sending');
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const update = (p: Partial<ResultItem>) => setResults((prev) => prev.map((r) => (r.id === resultId ? { ...r, ...p } : r)));

    try {
      const response = await apiStream('/draft', { question: instructions, references: refs.ids, draft: draft.ids[0] }, ctrl.signal);
      const call = response.headers.get('x-call');
      const result = await readStream(response, { onPhase: setPhase });
      reportUsage(call, result.usage);

      if (result.stop === 'refusal') throw new Error('مدل به این درخواست پاسخ نداد. لطفاً دوباره تلاش کنید.');
      if (result.stop === 'max_tokens' || result.stop === 'model_context_window_exceeded') {
        throw new Error('فهرست مواد از سقف طول خروجی مدل بلندتر شد. قراردادهای مرجع را در چند نوبت بررسی کنید.');
      }
      if (!result.complete) throw new Error('پاسخ مدل ناتمام ماند؛ لطفاً دوباره تلاش کنید.');

      const { parseDraftReport, draftDocx, draftFileName } = await import('../lib/draftDocx');
      const report = parseDraftReport(result.text, referenceNames.length);
      const blob = await draftDocx(report, referenceNames, draftName);
      update({ status: 'done', docxUrl: URL.createObjectURL(blob), docxFilename: draftFileName(report), findings: report.findings.length });
      /* فرم برای بررسی بعدی خالی می‌شود و فایل‌های این بررسی از سرور هم پاک می‌شوند */
      refs.clear(true);
      draft.clear(true);
      setInstructions('');
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        update({ status: 'error', errorMessage: 'بررسی به درخواست شما متوقف شد. فایل‌ها برای بررسی دوباره آماده‌اند.' });
      } else {
        console.error('Error:', error);
        update({
          status: 'error',
          errorMessage: `خطا در بررسی پیش‌نویس: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const phaseText = phase === 'writing' ? 'در حال نوشتن فهرست مواد پیشنهادی' : 'در حال تطبیق';

  return (
    <div className="chat-screen flex flex-col bg-white" dir="rtl">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white/90 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-600 to-navy-700 flex items-center justify-center flex-shrink-0 shadow-sm shadow-sky-900/10">
            <GitCompare size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-navy-900 leading-tight">پیش‌نویس</h1>
            <p className="text-xs text-navy-400">دستیار تدوین و تکمیل پیش‌نویس قرارداد</p>
          </div>
        </div>
        <button
          onClick={handleLogoClick}
          disabled={loading}
          className="hover:opacity-80 active:scale-95 transition-all disabled:pointer-events-none disabled:opacity-40"
          title="بازگشت به صفحه اول"
        >
          <img
            src={`${import.meta.env.BASE_URL}tunnelsaddariana_logo.jpg`}
            alt="لوگو"
            className="w-8 h-8 rounded-lg object-contain cursor-pointer ring-1 ring-black/5"
          />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50 px-4 md:px-12 lg:px-24 py-6">
        <div className="max-w-3xl mx-auto space-y-5">
          {results.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-6 dr-fade-in">
              <div className="relative w-20 h-20 mb-5">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-sky-600 to-navy-700 blur-lg opacity-30" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-sky-600 to-navy-700 rounded-3xl flex items-center justify-center shadow-lg shadow-navy-900/20">
                  <GitCompare size={36} className="text-white" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-navy-900 mb-2">پیش‌نویس</h2>
              <p className="text-navy-400 max-w-md text-sm leading-relaxed">
                چند قرارداد مرجع را که می‌خواهید بندهای مفیدشان بررسی شود بارگذاری کنید، سپس قرارداد
                پیش‌نویس در حال بررسی را اضافه کنید. سامانه بندهای مفید موجود در قراردادهای مرجع که در
                پیش‌نویس شما نیست را استخراج و در قالب یک گزارش Word ارائه می‌دهد.
              </p>
            </div>
          )}

          {/* Progress bar */}
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-sky-600 to-navy-700 transition-all duration-500 ease-out rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Step 1: Reference contracts */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
                  step1Done ? 'bg-emerald-500 text-white' : 'bg-navy-700 text-white'
                }`}
              >
                {step1Done ? <CheckCircle2 size={14} /> : '۱'}
              </div>
              <h3 className="text-sm font-bold text-navy-900">قراردادهای مرجع</h3>
              <span className="text-xs text-navy-400">(چند فایل مجاز است)</span>
            </div>

            <input
              type="file"
              ref={referenceInputRef}
              onChange={handleReferenceUpload}
              multiple
              accept={ACCEPT_DOCS}
              className="hidden"
            />

            <div
              onClick={() => !loading && referenceInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); if (!loading) setIsDraggingRef(true); }}
              onDragLeave={() => setIsDraggingRef(false)}
              onDrop={handleReferenceDrop}
              className={`w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl py-5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                loading
                  ? 'opacity-50 cursor-not-allowed border-gray-200 text-navy-400'
                  : isDraggingRef
                  ? 'border-navy-500 bg-navy-50 scale-[1.01] text-navy-700'
                  : 'border-gray-200 hover:border-navy-400 hover:bg-navy-50/60 text-navy-500'
              }`}
            >
              <UploadCloud size={20} className={isDraggingRef ? 'text-navy-600' : 'text-navy-400'} />
              <span className="flex items-center gap-1.5">
                <Paperclip size={13} />
                افزودن قرارداد(های) مرجع
              </span>
            </div>

            {refs.files.length > 0 && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {refs.files.map((file) => (
                    <FileChip key={file.key} file={file} onRemove={() => refs.remove(file.key)} disabled={loading} />
                  ))}
                </div>
                <FileErrors files={refs.files} />
              </div>
            )}
          </div>

          {/* Step 2: Draft contract */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${
                  step2Done ? 'bg-emerald-500 text-white' : 'bg-navy-700 text-white'
                }`}
              >
                {step2Done ? <CheckCircle2 size={14} /> : '۲'}
              </div>
              <h3 className="text-sm font-bold text-navy-900">قرارداد پیش‌نویس در حال بررسی</h3>
              <span className="text-xs text-navy-400">(یک فایل)</span>
            </div>

            <input
              type="file"
              ref={draftInputRef}
              onChange={handleDraftUpload}
              accept={ACCEPT_DOCS}
              className="hidden"
            />

            {!draftFile ? (
              <div
                onClick={() => !loading && draftInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (!loading) setIsDraggingDraft(true); }}
                onDragLeave={() => setIsDraggingDraft(false)}
                onDrop={handleDraftDrop}
                className={`w-full flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl py-5 text-sm font-medium transition-all duration-200 cursor-pointer ${
                  loading
                    ? 'opacity-50 cursor-not-allowed border-gray-200 text-navy-400'
                    : isDraggingDraft
                    ? 'border-sky-500 bg-sky-50 scale-[1.01] text-navy-700'
                    : 'border-gray-200 hover:border-sky-400 hover:bg-sky-50/60 text-navy-500'
                }`}
              >
                <UploadCloud size={20} className={isDraggingDraft ? 'text-sky-600' : 'text-sky-400'} />
                <span className="flex items-center gap-1.5">
                  <FileCheck2 size={14} />
                  بارگذاری قرارداد پیش‌نویس
                </span>
              </div>
            ) : draftFile.status === 'ready' ? (
              <div className="dr-chip-in flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2.5 text-xs text-navy-700">
                <FileCheck2 size={14} className="text-sky-600 flex-shrink-0" />
                <span className="truncate flex-1">{draftFile.name}</span>
                {!loading && (
                  <button
                    onClick={() => draft.remove(draftFile.key)}
                    className="p-1 hover:bg-sky-200 rounded-full transition-colors flex-shrink-0"
                    title="حذف فایل"
                  >
                    <Trash2 size={12} className="text-navy-500" />
                  </button>
                )}
              </div>
            ) : (
              <div>
                <FileChip file={draftFile} onRemove={() => draft.remove(draftFile.key)} disabled={loading} />
                <FileErrors files={draft.files} />
              </div>
            )}
          </div>

          {/* Step 3: Optional instructions + submit */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-navy-700 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                ۳
              </div>
              <h3 className="text-sm font-bold text-navy-900">توضیحات تکمیلی</h3>
              <span className="text-xs text-navy-400">(اختیاری)</span>
            </div>

            <textarea
              ref={textInputRef}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="در صورت نیاز، تمرکز خاصی برای بررسی مشخص کنید (مثلاً تمرکز بر بندهای مالی یا فسخ قرارداد)..."
              disabled={loading}
              rows={2}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 focus:border-transparent text-sm resize-none bg-white disabled:bg-gray-50 disabled:text-navy-300 transition-all"
              style={{ fontSize: '16px' }}
            />

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`mt-3 w-full flex items-center justify-center gap-2 text-white font-semibold px-4 py-3 rounded-xl transition-all shadow-sm ${
                canSubmit
                  ? 'bg-gradient-to-l from-sky-600 to-navy-700 hover:shadow-lg hover:shadow-navy-900/20 active:scale-[0.99]'
                  : 'bg-navy-700 opacity-40 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  در حال بررسی و تطبیق قراردادها...
                </>
              ) : refs.busy || draft.busy ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  در حال آماده‌سازی فایل‌ها...
                </>
              ) : (
                <>
                  <Send size={16} />
                  شروع بررسی و تهیه گزارش
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {results.map((r) => (
            <div key={r.id} className="flex justify-start dr-fade-in">
              {r.status === 'loading' ? (
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm w-full max-w-md overflow-hidden">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-navy-50 flex items-center justify-center flex-shrink-0 dr-glow">
                      <Loader size={15} className="text-navy-600 animate-spin" />
                    </div>
                    <p className="text-xs text-navy-500 leading-relaxed">
                      {phaseText} {faNum(r.referenceNames.length)} قرارداد مرجع با «{r.draftName}» — این
                      فرآیند ممکن است چند دقیقه طول بکشد
                    </p>
                  </div>
                  <div className="h-1.5 rounded-full dr-shimmer mt-3" />
                  <div className="flex items-center justify-between gap-3 mt-2.5">
                    <span className="text-[11px] text-navy-300 tabular-nums">زمان سپری‌شده: {clock(elapsed)}</span>
                    <button
                      onClick={() => abortRef.current?.abort()}
                      className="flex items-center gap-1 text-[11px] text-navy-400 hover:text-red-600 transition-colors"
                    >
                      <Square size={10} />
                      توقف
                    </button>
                  </div>
                </div>
              ) : r.status === 'done' && r.docxUrl ? (
                <div className="max-w-md w-full">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-l from-sky-600 to-navy-700 px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                        <Layers size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {r.docxFilename}.docx
                        </p>
                        <p className="text-xs text-blue-200">
                          {r.findings ? `${faNum(r.findings)} مادهٔ پیشنهادی — گزارش Word` : 'پیش‌نویس کامل است — گزارش Word'}
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-navy-500">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <Sparkles size={13} className="text-amber-500" />
                        <span>گزارش آماده دانلود است</span>
                      </div>
                      <a
                        href={r.docxUrl}
                        download={`${r.docxFilename}.docx`}
                        className="flex items-center gap-1.5 px-4 py-2 bg-navy-700 hover:bg-navy-800 active:scale-95 text-white text-xs font-semibold rounded-xl transition-all flex-shrink-0 shadow-sm"
                      >
                        <Download size={13} />
                        دانلود
                      </a>
                    </div>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-navy-300 mt-1.5">
                    <Clock size={11} />
                    {r.timestamp}
                  </p>
                </div>
              ) : (
                <div className="max-w-md w-full">
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm bg-red-50 border border-red-200 text-red-700 flex items-start gap-2.5">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <p className="text-sm leading-relaxed">{r.errorMessage}</p>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-navy-300 mt-1.5">
                    <Clock size={11} />
                    {r.timestamp}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full dr-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-navy-900 mb-2 text-center">خروج از بخش پیش‌نویس</h3>
            <p className="text-sm text-navy-500 text-center mb-6 leading-relaxed">
              اطلاعات وارد شده ذخیره نخواهد شد. آیا مطمئن هستید؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowExitConfirm(false); refs.clear(true); draft.clear(true); navigate('/'); }}
                className="flex-1 py-2.5 bg-navy-700 hover:bg-navy-800 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all"
              >
                بله، خروج
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 active:scale-95 text-navy-700 rounded-xl text-sm font-semibold transition-all"
              >
                ماندن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
