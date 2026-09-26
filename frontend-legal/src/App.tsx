import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';

/* صفحه‌های ابزار کتابخانه‌های سنگینی دارند (ساخت Word، خواندن Word/اکسل/پاورپوینت، Markdown)؛
   جدا بارگذاری می‌شوند تا صفحهٔ اول در موبایل سبک بماند */
const ContractAnalysis = lazy(() => import('./pages/ContractAnalysis'));
const DraftReview = lazy(() => import('./pages/DraftReview'));
const LegalChat = lazy(() => import('./pages/LegalChat'));

function PageLoading() {
  return (
    <div className="chat-screen flex items-center justify-center bg-white" dir="rtl">
      <div className="flex gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2.5 h-2.5 rounded-full bg-navy-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/fa-analysis" element={<ContractAnalysis />} />
          <Route path="/fa-analysis/:conversationId" element={<ContractAnalysis />} />
          <Route path="/drafting" element={<DraftReview />} />
          {/* یک مسیر با پارامتر اختیاری تا جابه‌جایی میان گفت‌وگوها صفحه را از نو نسازد */}
          <Route path="/chat/:chatId?" element={<LegalChat />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
