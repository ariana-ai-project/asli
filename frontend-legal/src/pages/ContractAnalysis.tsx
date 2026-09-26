import { useState, useRef, useEffect } from 'react';
import {
  Send,
  FileText,
  Loader,
  Plus,
  Menu,
  Download,
  MessageCircle,
  Settings,
  Paperclip,
  Sparkles,
  Scale,
  BarChart3,
  ClipboardList,
  PenLine,
  Square,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiStream, readStream, reportUsage } from '../lib/api';
import { ACCEPT_DOCS } from '../lib/files';
import { useUploads } from '../lib/useUploads';
import FileChip, { FileErrors } from '../components/FileChip';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: Array<{ name: string; size: number }>;
  timestamp: string;
  docxUrl?: string;
  docxFilename?: string;
  isError?: boolean;
}

const PRESET_PROMPTS = [
  {
    label: 'تحلیل جامع سند',
    icon: Scale,
    text: 'لطفاً یک تحلیل جامع و کامل از این سند ارائه دهید.',
  },
  {
    label: 'تحلیل ریسک‌های حقوقی',
    icon: BarChart3,
    text: 'ریسک‌های حقوقی موجود در این سند را شناسایی، اولویت‌بندی و تحلیل کنید.',
  },
  {
    label: 'تهیه گزارش مدیریتی',
    icon: ClipboardList,
    text: 'یک گزارش مدیریتی از این سند برای مدیران ارشد شرکت تهیه کنید.',
  },
  {
    label: 'تحلیل سفارشی',
    icon: PenLine,
    text: null, // null = open custom text input
  },
];

const faNum = (n: number) => n.toLocaleString('fa-IR');
const clock = (s: number) => `${faNum(Math.floor(s / 60)).padStart(2, '۰')}:${faNum(s % 60).padStart(2, '۰')}`;

export default function ContractAnalysis() {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const uploads = useUploads('analyze');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'sending' | 'thinking' | 'writing'>('sending');
  const [written, setWritten] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; timestamp: string }>>([]);
  const [customMode, setCustomMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => Date.now().toString());

  const hasFiles = uploads.files.length > 0;
  const canSend = uploads.ready.length > 0 && !uploads.busy && !loading;
  const showPresets = canSend && !customMode && question === '';

  const handleLogoClick = () => {
    if (loading) return;
    if (messages.length > 0) {
      setShowExitConfirm(true);
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* شمارندهٔ زمان تحلیل — تا کاربر بداند کار ادامه دارد */
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  const startNewConversation = () => {
    if (loading) return;
    if (messages.length > 0) {
      const title =
        messages[0]?.files?.[0]?.name || messages[0]?.content?.slice(0, 30) || 'مکالمه جدید';
      setConversations((prev) => [
        { id: currentConversationId, title, timestamp: new Date().toLocaleString('fa-IR') },
        ...prev,
      ]);
    }
    setCurrentConversationId(Date.now().toString());
    setMessages([]);
    uploads.clear(true);
    setQuestion('');
    setCustomMode(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCustomMode(false);
    setQuestion('');
    uploads.add(files);
  };

  const removeFile = (key: string) => {
    uploads.remove(key);
    setCustomMode(false);
    setQuestion('');
  };

  const handlePresetSelect = (prompt: (typeof PRESET_PROMPTS)[0]) => {
    if (prompt.text === null) {
      setCustomMode(true);
      setQuestion('');
      setTimeout(() => textInputRef.current?.focus(), 50);
    } else {
      sendMessage(prompt.text);
    }
  };

  const handleSendMessage = () => {
    const text = question.trim();
    if (!text || !canSend) return;
    sendMessage(text);
  };

  const pushAssistant = (m: Omit<Message, 'role' | 'timestamp'>) =>
    setMessages((prev) => [...prev, { ...m, role: 'assistant', timestamp: new Date().toLocaleString('fa-IR') }]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || !canSend) return;

    const files = uploads.ready;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      files: files.map((f) => ({ name: f.name, size: f.size })),
      timestamp: new Date().toLocaleString('fa-IR'),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setCustomMode(false);
    setLoading(true);
    setPhase('sending');
    setWritten(0);

    const assistantMessageId = (Date.now() + 1).toString();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const response = await apiStream('/analyze', { question: text, files: uploads.ids }, ctrl.signal);
      const call = response.headers.get('x-call');
      const result = await readStream(response, { onPhase: setPhase, onText: (full) => setWritten(full.length) });
      reportUsage(call, result.usage);

      if (result.stop === 'refusal') throw new Error('مدل به این درخواست پاسخ نداد. لطفاً درخواست را به شکل دیگری مطرح کنید.');
      if (result.stop === 'max_tokens' || result.stop === 'model_context_window_exceeded') {
        throw new Error('گزارش از سقف طول خروجی مدل بلندتر شد. لطفاً درخواست را محدودتر کنید یا سند را در چند بخش تحلیل کنید.');
      }
      if (!result.complete) throw new Error('پاسخ مدل ناتمام ماند؛ لطفاً دوباره تلاش کنید.');

      const { parseReport, reportDocx, sanitizeFileName } = await import('../lib/reportDocx');
      const report = parseReport(result.text);
      const blob = await reportDocx(report);
      pushAssistant({
        id: assistantMessageId,
        content: '',
        docxUrl: URL.createObjectURL(blob),
        docxFilename: sanitizeFileName(report.reportTitle),
      });
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        pushAssistant({ id: assistantMessageId, content: 'تحلیل به درخواست شما متوقف شد.' });
      } else {
        console.error('Error:', error);
        pushAssistant({
          id: assistantMessageId,
          content: `متأسفانه در انجام تحلیل خطایی رخ داد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
          isError: true,
        });
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  };

  const progressText =
    phase === 'sending'
      ? 'در حال ارسال سند به دستیار حقوقی…'
      : phase === 'thinking'
      ? 'در حال مطالعه و تحلیل سند — این مرحله ممکن است چند دقیقه طول بکشد'
      : `در حال نوشتن گزارش — حدود ${faNum(Math.max(1, Math.round(written / 7)))} واژه`;

  return (
    <div className="chat-screen flex bg-white" dir="rtl">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-navy-950 text-white flex flex-col overflow-hidden flex-shrink-0`}
      >
        <div className="p-4 border-b border-white/10">
          <button
            onClick={startNewConversation}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            <Plus size={18} />
            مکالمه جدید
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-3 space-y-2">
            {conversations.length === 0 ? (
              <p className="text-blue-200/30 text-xs text-center py-6 px-2">سابقه مکالمه‌ای وجود ندارد</p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  className="w-full text-right px-3 py-2 text-sm text-blue-200/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <MessageCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="truncate">{conv.title}</p>
                      <p className="text-xs text-blue-200/30 mt-0.5">{conv.timestamp}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-white/10">
          <button className="w-full flex items-center gap-2 text-blue-300 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-sm">
            <Settings size={16} />
            تنظیمات
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <div className="border-b border-gray-100 bg-white px-4 md:px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Menu size={20} className="text-navy-700" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-navy-700 to-navy-500 flex items-center justify-center flex-shrink-0">
                <Scale size={16} className="text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-navy-900 leading-tight">تحلیلگر آریانا</h1>
                <p className="text-xs text-navy-400">دستیار حقوقی آریانا</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogoClick}
            disabled={loading}
            className="hover:opacity-80 transition-opacity disabled:pointer-events-none disabled:opacity-40"
            title="بازگشت به صفحه اول"
          >
            <img
              src={`${import.meta.env.BASE_URL}tunnelsaddariana_logo.jpg`}
              alt="لوگو"
              className="w-8 h-8 rounded-lg object-contain cursor-pointer"
            />
          </button>
        </div>

        {/* Messages Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-24 py-6 space-y-5 bg-gray-50"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center pt-8">
              <div className="w-20 h-20 bg-gradient-to-br from-navy-700 to-navy-500 rounded-3xl flex items-center justify-center mb-5 shadow-lg">
                <Scale size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-navy-900 mb-2">تحلیلگر آریانا</h2>
              <p className="text-navy-400 max-w-sm text-sm leading-relaxed">
                فایل سند حقوقی را آپلود کنید و نوع تحلیل مورد نظر را انتخاب کنید.
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs text-navy-300">
                <Paperclip size={14} />
                <span>پشتیبانی از PDF، Word، متن و تصویر سند</span>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[80%] md:max-w-lg">
                  <div className="bg-navy-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.files && msg.files.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/20 flex flex-wrap gap-2">
                        {msg.files.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-blue-100 bg-white/10 rounded-lg px-2 py-1">
                            <FileText size={11} />
                            <span className="truncate max-w-[160px]">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-navy-300 mt-1 text-left">{msg.timestamp}</p>
                </div>
              ) : msg.docxUrl ? (
                <div className="max-w-[80%] md:max-w-md">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden dr-fade-in">
                    <div className="bg-gradient-to-l from-navy-700 to-navy-600 px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <FileText size={18} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {msg.docxFilename}.docx
                        </p>
                        <p className="text-xs text-blue-200">گزارش حقوقی Word</p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-navy-500">
                        <Sparkles size={13} className="text-amber-500" />
                        <span>گزارش آماده دانلود است</span>
                      </div>
                      <a
                        href={msg.docxUrl}
                        download={`${msg.docxFilename}.docx`}
                        className="flex items-center gap-1.5 px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-semibold rounded-xl transition-colors flex-shrink-0 shadow-sm"
                      >
                        <Download size={13} />
                        دانلود
                      </a>
                    </div>
                  </div>
                  <p className="text-xs text-navy-300 mt-1">{msg.timestamp}</p>
                </div>
              ) : msg.content ? (
                <div className="max-w-[80%] md:max-w-md">
                  <div
                    className={`rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm ${
                      msg.isError
                        ? 'bg-red-50 border border-red-200 text-red-700'
                        : 'bg-white border border-gray-200 text-navy-800'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                  <p className="text-xs text-navy-300 mt-1">{msg.timestamp}</p>
                </div>
              ) : null}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm max-w-[90%] md:max-w-md dr-fade-in">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1 flex-shrink-0">
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-xs text-navy-500 leading-relaxed">{progressText}</p>
                </div>
                <div className="flex items-center justify-between gap-3 mt-2.5 pt-2.5 border-t border-gray-100">
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
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-100 bg-white px-4 md:px-12 lg:px-24 py-4 pb-10 flex-shrink-0">
          {showPresets && (
            <div className="mb-3">
              <p className="text-xs text-navy-400 mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-amber-500" />
                نوع تحلیل را انتخاب کنید:
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_PROMPTS.map((prompt) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={prompt.label}
                      onClick={() => handlePresetSelect(prompt)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 hover:border-navy-400 hover:bg-navy-50 text-navy-700 text-xs font-medium rounded-xl transition-all shadow-sm"
                    >
                      <Icon size={13} className="text-navy-500" />
                      {prompt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasFiles && (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2">
                {uploads.files.map((file) => (
                  <FileChip key={file.key} file={file} onRemove={() => removeFile(file.key)} disabled={loading} />
                ))}
              </div>
              <FileErrors files={uploads.files} />
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept={ACCEPT_DOCS}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              title="آپلود فایل"
            >
              <Paperclip size={18} className="text-navy-600" />
            </button>

            <div className="flex-1 relative">
              <textarea
                ref={textInputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  !hasFiles
                    ? 'ابتدا فایل سند خود را آپلود کنید...'
                    : uploads.busy
                    ? 'در حال آماده‌سازی و بارگذاری فایل...'
                    : customMode
                    ? 'درخواست تحلیل سفارشی خود را بنویسید...'
                    : 'فایل آپلود شد — نوع تحلیل را از گزینه‌های بالا انتخاب کنید'
                }
                disabled={loading || (hasFiles && !customMode)}
                rows={1}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 focus:border-transparent text-sm resize-none bg-white disabled:bg-gray-50 disabled:text-navy-300 disabled:cursor-default transition-colors"
                style={{ fontSize: '16px', minHeight: '42px', maxHeight: '120px' }}
              />
            </div>

            <button
              onClick={handleSendMessage}
              disabled={!canSend || !question.trim()}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-navy-700 hover:bg-navy-800 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              title="ارسال"
            >
              {loading ? (
                <Loader size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
        </div>
      </div>

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 mx-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-navy-900 mb-2 text-center">خروج از مکالمه</h3>
            <p className="text-sm text-navy-500 text-center mb-6 leading-relaxed">
              مکالمه جاری ذخیره نخواهد شد. آیا مطمئن هستید؟
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowExitConfirm(false); navigate('/'); }}
                className="flex-1 py-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                بله، خروج
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-navy-700 rounded-xl text-sm font-semibold transition-colors"
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
