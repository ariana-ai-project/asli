import { useState, useRef, useEffect } from 'react';
import {
  Send,
  X,
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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import mammoth from 'mammoth';

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

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  encoding: 'base64' | 'text';
  media_type: string;
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

export default function ContractAnalysis() {
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; timestamp: string }>>([]);
  const [customMode, setCustomMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string>(() => Date.now().toString());

  const showPresets = uploadedFiles.length > 0 && !loading && !customMode && question === '';

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
  }, [messages]);

  const startNewConversation = () => {
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
    setUploadedFiles([]);
    setQuestion('');
    setCustomMode(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      let newFile: UploadedFile;
      if (ext === 'pdf') {
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        newFile = {
          id: Date.now().toString() + Math.random().toString(36),
          name: file.name,
          size: file.size,
          type: file.type,
          content: base64,
          encoding: 'base64',
          media_type: 'application/pdf',
        };
      } else if (ext === 'docx' || ext === 'doc') {
        const result = await mammoth.extractRawText({ arrayBuffer });
        newFile = {
          id: Date.now().toString() + Math.random().toString(36),
          name: file.name,
          size: file.size,
          type: file.type,
          content: result.value,
          encoding: 'text',
          media_type: 'text/plain',
        };
      } else {
        const textContent = await file.text();
        newFile = {
          id: Date.now().toString() + Math.random().toString(36),
          name: file.name,
          size: file.size,
          type: file.type,
          content: textContent,
          encoding: 'text',
          media_type: 'text/plain',
        };
      }
      setUploadedFiles((prev) => [...prev, newFile]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setCustomMode(false);
    setQuestion('');
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
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
    if (!text || uploadedFiles.length === 0 || loading) return;
    sendMessage(text);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || uploadedFiles.length === 0 || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      files: uploadedFiles.map((f) => ({ name: f.name, size: f.size })),
      timestamp: new Date().toLocaleString('fa-IR'),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setCustomMode(false);
    setLoading(true);

    const assistantMessageId = (Date.now() + 1).toString();

    try {
      const fileContents = uploadedFiles.map((f) => ({
        name: f.name,
        content: f.content,
        encoding: f.encoding,
        media_type: f.media_type,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-contract`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ question: text, fileContents }),
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `خطای سرور: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('استریم در دسترس نیست');

      const decoder = new TextDecoder();
      let buffer = '';
      let docxReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) throw new Error(parsed.error);

            if (parsed.docx) {
              docxReceived = true;
              const binaryString = atob(parsed.docx);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const blob = new Blob([bytes], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              });
              const url = URL.createObjectURL(blob);
              const filename = parsed.filename || 'گزارش-آریانا';

              setMessages((prev) => [
                ...prev,
                {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: '',
                  docxUrl: url,
                  docxFilename: filename,
                  timestamp: new Date().toLocaleString('fa-IR'),
                },
              ]);
            }
            // heartbeat events ({ text: "" }) are intentionally ignored
          } catch (e) {
            if (e instanceof Error && e.message !== data) throw e;
          }
        }
      }

      if (!docxReceived) {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: 'پاسخی دریافت نشد. لطفاً دوباره تلاش کنید.',
            timestamp: new Date().toLocaleString('fa-IR'),
            isError: true,
          },
        ]);
      }
    } catch (error) {
      console.error('Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: `متأسفانه در انجام تحلیل خطایی رخ داد: ${error instanceof Error ? error.message : 'خطای ناشناخته'}`,
          timestamp: new Date().toLocaleString('fa-IR'),
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

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
            className="w-full flex items-center justify-center gap-2 bg-navy-800 hover:bg-navy-700 text-white font-semibold px-4 py-3 rounded-xl transition-colors"
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
              src="/tunnelsaddariana_logo.jpg"
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
                <span>پشتیبانی از فرمت‌های PDF، DOCX و TXT</span>
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
                    <p className="text-sm leading-relaxed">{msg.content}</p>
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
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm overflow-hidden">
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
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <p className="text-xs text-navy-500">در حال تحلیل سند — این فرآیند ممکن است چند دقیقه طول بکشد</p>
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

          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-1.5 bg-navy-50 border border-navy-200 rounded-lg px-2.5 py-1.5 text-xs text-navy-700"
                >
                  <FileText size={12} className="text-navy-500 flex-shrink-0" />
                  <span className="truncate max-w-[140px] md:max-w-xs">{file.name}</span>
                  {!loading && (
                    <button
                      onClick={() => removeFile(file.id)}
                      className="p-0.5 hover:bg-navy-200 rounded transition-colors flex-shrink-0"
                      title="حذف فایل"
                    >
                      <X size={11} className="text-navy-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              multiple
              accept=".txt,.pdf,.doc,.docx"
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
                  uploadedFiles.length === 0
                    ? 'ابتدا فایل سند خود را آپلود کنید...'
                    : customMode
                    ? 'درخواست تحلیل سفارشی خود را بنویسید...'
                    : 'فایل آپلود شد — نوع تحلیل را از گزینه‌های بالا انتخاب کنید'
                }
                disabled={loading || (uploadedFiles.length > 0 && !customMode)}
                rows={1}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-400 focus:border-transparent text-sm resize-none bg-white disabled:bg-gray-50 disabled:text-navy-300 disabled:cursor-default transition-colors"
                style={{ fontSize: '16px', minHeight: '42px', maxHeight: '120px' }}
              />
            </div>

            <button
              onClick={handleSendMessage}
              disabled={loading || !question.trim() || uploadedFiles.length === 0}
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
