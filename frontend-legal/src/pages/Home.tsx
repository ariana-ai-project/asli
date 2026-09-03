import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  X,
  FileText,
  PenTool,
  ChevronLeft,
  Shield,
  Zap,
  Brain,
  Award,
  Users,
  ArrowLeft,
  Scale,
  CheckCircle,
  Target,
  Clock,
  Compass,
  Ruler,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'خانه', href: '#home' },
  { label: 'امکانات', href: '#features' },
  { label: 'درباره ما', href: '#about' },
  { label: 'تماس', href: '#contact' },
];

const FEATURES = [
  {
    id: 'fa-analysis',
    icon: FileText,
    title: 'تحلیلگر آریانا',
    description:
      'بارگذاری فایل و دریافت تحلیل حقوقی کامل شامل استخراج اطلاعات، بررسی ریسک‌ها و پیشنهاد اصلاحیه بر اساس قوانین حاکم.',
    tags: ['تحلیل ریسک', 'بررسی بندها', 'توصیه حقوقی'],
    href: '/fa-analysis',
    code: 'NQ-01',
  },
  {
    id: 'drafting',
    icon: PenTool,
    title: 'پیش‌نویس',
    description:
      'بارگذاری قراردادهای مرجع و پیش‌نویس مورد بررسی؛ استخراج بندهای مفید به نفع آریانا و ارائه گزارش Word.',
    tags: ['تطبیق قراردادها', 'استخراج بندهای مفید', 'گزارش Word'],
    href: '/drafting',
    code: 'NQ-02',
  },
];

const STATS = [
  { value: '+۵۰۰', label: 'قرارداد تحلیل شده', icon: FileText },
  { value: '۹۸٪', label: 'دقت در تحلیل', icon: Target },
  { value: '+۱۰', label: 'سال تجربه حقوقی', icon: Award },
  { value: '۲۴/۷', label: 'در دسترس', icon: Clock },
];

const CAPABILITIES = [
  { icon: Brain, title: 'هوش مصنوعی پیشرفته', desc: 'مبتنی بر جدیدترین مدل‌های زبانی' },
  { icon: Shield, title: 'اطلاعات محرمانه', desc: 'حفاظت کامل از اسناد و مکالمات' },
  { icon: Zap, title: 'پردازش سریع', desc: 'تحلیل قرارداد در کمترین زمان' },
  { icon: Award, title: 'دقت بالا', desc: 'استناد به قوانین و مقررات جاری' },
];

const CHECKLIST = [
  'تحلیل سریع متن قراردادهای فارسی در کمتر از چند دقیقه',
  'شناسایی خودکار بندهای ریسک‌دار و مبهم',
  'پیشنهاد اصلاحیه بر اساس قوانین و رویه جاری ایران',
  'پشتیبانی از قراردادهای پیمانکاری، حمل‌ونقل و سایر انواع',
  'نگهداری سابقه مکالمات و تحلیل‌های پیشین',
];

/* ------------------------------------------------------------------ */
/* Fonts — injected once, modern Persian variable type                */
/* ------------------------------------------------------------------ */

function FontLoader() {
  useEffect(() => {
    if (document.getElementById('nq-fonts')) return;
    const preconnect1 = document.createElement('link');
    preconnect1.rel = 'preconnect';
    preconnect1.href = 'https://fonts.googleapis.com';
    const preconnect2 = document.createElement('link');
    preconnect2.rel = 'preconnect';
    preconnect2.href = 'https://fonts.gstatic.com';
    preconnect2.crossOrigin = 'anonymous';
    const sheet = document.createElement('link');
    sheet.id = 'nq-fonts';
    sheet.rel = 'stylesheet';
    sheet.href =
      'https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    document.head.appendChild(sheet);
  }, []);
  return null;
}

const FONT_BODY = "'Vazirmatn', 'Segoe UI', Tahoma, sans-serif";
const FONT_TECH = "'IBM Plex Mono', 'Vazirmatn', monospace";

/* ------------------------------------------------------------------ */
/* Scroll progress — cheap, imperative, no re-render thrash            */
/* ------------------------------------------------------------------ */

function useScrollProgress() {
  const progressRef = useRef(0);
  const [, force] = useState(0);
  const listenersRef = useRef<Array<(p: number) => void>>([]);

  useEffect(() => {
    let ticking = false;
    const compute = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const p = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      progressRef.current = p;
      listenersRef.current.forEach((fn) => fn(p));
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(compute);
      }
    };
    compute();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const subscribe = useCallback((fn: (p: number) => void) => {
    listenersRef.current.push(fn);
    fn(progressRef.current);
    return () => {
      listenersRef.current = listenersRef.current.filter((f) => f !== fn);
    };
  }, []);

  return { subscribe, force };
}

/* ------------------------------------------------------------------ */
/* Reveal-on-scroll wrapper                                            */
/* ------------------------------------------------------------------ */

function useIntersectionObserver(ref: React.RefObject<Element>, threshold = 0.1) {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return isVisible;
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useIntersectionObserver(ref, 0.12);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Global stylesheet — grid, glass, path-draw helpers                  */
/* ------------------------------------------------------------------ */

function MotifStyles() {
  return (
    <style>{`
      html { scroll-behavior: smooth; }

      .nq-body { font-family: ${FONT_BODY}; }
      .nq-tech { font-family: ${FONT_TECH}; letter-spacing: 0.02em; }

      .bp-grid {
        background-image:
          linear-gradient(var(--bp-line, rgba(125,211,252,0.10)) 1px, transparent 1px),
          linear-gradient(90deg, var(--bp-line, rgba(125,211,252,0.10)) 1px, transparent 1px);
        background-size: 44px 44px;
      }
      .bp-grid-major {
        background-image:
          linear-gradient(var(--bp-line-major, rgba(125,211,252,0.18)) 1px, transparent 1px),
          linear-gradient(90deg, var(--bp-line-major, rgba(125,211,252,0.18)) 1px, transparent 1px);
        background-size: 220px 220px;
      }

      .glass-panel {
        background: rgba(8, 20, 41, 0.52);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(148, 214, 255, 0.14);
      }
      .glass-panel-light {
        background: rgba(255, 255, 255, 0.86);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(15, 36, 71, 0.08);
      }

      .corner-frame { position: relative; }
      .corner-frame::before,
      .corner-frame::after,
      .corner-frame .cf-br,
      .corner-frame .cf-bl {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-color: var(--cf-color, rgba(94, 211, 255, 0.6));
        pointer-events: none;
      }
      .corner-frame::before { top: -1px; right: -1px; border-top: 2px solid; border-right: 2px solid; }
      .corner-frame::after  { top: -1px; left: -1px;  border-top: 2px solid; border-left: 2px solid; }
      .corner-frame .cf-br  { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }
      .corner-frame .cf-bl  { bottom: -1px; left: -1px;  border-bottom: 2px solid; border-left: 2px solid; }

      .nq-btn {
        background: linear-gradient(95deg, #0d3a6b 0%, #0f5fa8 55%, #14a4d9 100%);
        box-shadow: 0 10px 30px -8px rgba(20, 164, 217, 0.55);
        transition: transform 0.35s cubic-bezier(0.2,0.8,0.2,1), box-shadow 0.35s ease, filter 0.35s ease;
      }
      .nq-btn:hover { transform: translateY(-3px); filter: brightness(1.08); box-shadow: 0 16px 38px -8px rgba(20, 164, 217, 0.7); }
      .nq-btn:active { transform: translateY(-1px) scale(0.98); }

      .chip {
        border: 1px solid rgba(94, 211, 255, 0.28);
      }

      .typed-caret {
        animation: caretBlink 1s step-end infinite;
      }
      @keyframes caretBlink { 50% { opacity: 0; } }

      .float-slow { animation: floatSlow 7s ease-in-out infinite; }
      @keyframes floatSlow {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }

      .spin-slow { animation: spinSlow 26s linear infinite; }
      @keyframes spinSlow { to { transform: rotate(360deg); } }

      .dash-pulse {
        stroke-dasharray: 4 7;
        animation: dashPulse 5s linear infinite;
      }
      @keyframes dashPulse { to { stroke-dashoffset: -110; } }

      @media (prefers-reduced-motion: reduce) {
        .float-slow, .spin-slow, .dash-pulse, .typed-caret { animation: none !important; }
        html { scroll-behavior: auto; }
      }
    `}</style>
  );
}

/* ------------------------------------------------------------------ */
/* BlueprintCanvas — the site's persistent, fixed background.          */
/*                                                                      */
/* One drafting sheet stays pinned behind the whole page. As the       */
/* reader scrolls, four structures from the company's own portfolio —  */
/* a suspension bridge, a gravity dam, a bored tunnel, a mountain       */
/* road alignment — take turns being "drafted" on that sheet: their    */
/* linework draws itself on with stroke-dashoffset tied directly to    */
/* scroll position, exactly like a hand slowly finishing a technical   */
/* drawing. Nothing here is decorative motion; every animated value is  */
/* a function of how far down the page the reader actually is. A       */
/* second, independent layer — the grid and a handful of dimension     */
/* ticks — answers the mouse instead, drifting a few pixels against    */
/* cursor position to give the sheet real parallax depth.              */
/* ------------------------------------------------------------------ */

type StructureKey = 'bridge' | 'dam' | 'tunnel' | 'road';

const STRUCTURE_WINDOWS: Record<StructureKey, [number, number]> = {
  bridge: [0.0, 0.3],
  dam: [0.22, 0.55],
  tunnel: [0.48, 0.78],
  road: [0.72, 1.0],
};

const STRUCTURE_LABELS: Record<StructureKey, { title: string; code: string }> = {
  bridge: { title: 'نقشه سازه پل معلق', code: 'DWG—BRG—01' },
  dam: { title: 'مقطع سد وزنی', code: 'DWG—DAM—02' },
  tunnel: { title: 'مقطع عرضی تونل', code: 'DWG—TUN—03' },
  road: { title: 'پلان مسیر جاده', code: 'DWG—ROD—04' },
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function layerProgress(global: number, key: StructureKey) {
  const [s, e] = STRUCTURE_WINDOWS[key];
  return clamp01((global - s) / (e - s));
}

/** opacity envelope: fades in over the first 12%, holds, fades out over the last 12% of its window */
function layerOpacity(p: number) {
  if (p <= 0) return 0;
  if (p >= 1) return 0;
  if (p < 0.12) return p / 0.12;
  if (p > 0.88) return (1 - p) / 0.12;
  return 1;
}

function BlueprintCanvas({ subscribe }: { subscribe: (fn: (p: number) => void) => () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<{ el: SVGPathElement; key: StructureKey }[]>([]);
  const groupRefs = useRef<Partial<Record<StructureKey, SVGGElement | null>>>({});
  const labelRefs = useRef<Partial<Record<StructureKey, HTMLDivElement | null>>>({});

  const registerPath = (key: StructureKey) => (el: SVGPathElement | null) => {
    if (!el) return;
    pathRefs.current.push({ el, key });
  };

  useEffect(() => {
    // precompute path lengths once
    pathRefs.current.forEach(({ el }) => {
      const len = el.getTotalLength();
      el.style.strokeDasharray = `${len}`;
      el.style.strokeDashoffset = `${len}`;
    });

    const unsub = subscribe((global) => {
      (Object.keys(STRUCTURE_WINDOWS) as StructureKey[]).forEach((key) => {
        const p = layerProgress(global, key);
        const op = layerOpacity(p);
        const group = groupRefs.current[key];
        if (group) group.style.opacity = `${op}`;
        const label = labelRefs.current[key];
        if (label) label.style.opacity = `${op}`;
      });
      pathRefs.current.forEach(({ el, key }) => {
        const p = layerProgress(global, key);
        const draw = clamp01(p / 0.75); // finishes drawing within the first 3/4 of its window
        const len = parseFloat(el.style.strokeDasharray || '0');
        el.style.strokeDashoffset = `${len * (1 - draw)}`;
      });
    });
    return unsub;
  }, [subscribe]);

  // mouse parallax — independent of scroll, moves the grid + faint ticks
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      el.style.setProperty('--px', `${x * 10}px`);
      el.style.setProperty('--py', `${y * 8}px`);
      el.style.setProperty('--px-slow', `${x * 4}px`);
      el.style.setProperty('--py-slow', `${y * 3}px`);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div ref={rootRef} className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* base drafting-sheet gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(140% 110% at 18% 10%, #123058 0%, #0c2447 34%, #081a38 62%, #050f26 84%, #030a1a 100%)',
        }}
      />

      {/* grid — parallaxes gently with the mouse */}
      <div
        className="absolute inset-0 bp-grid"
        style={{ transform: 'translate(var(--px, 0), var(--py, 0))' }}
      />
      <div
        className="absolute inset-0 bp-grid-major"
        style={{ transform: 'translate(var(--px-slow, 0), var(--py-slow, 0))' }}
      />

      {/* vignette so foreground content stays legible */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(80% 60% at 50% 40%, transparent 0%, rgba(3,10,26,0.35) 100%)' }}
      />

      {/* the drafting sheet itself */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ transform: 'translate(calc(var(--px, 0) * 0.4), calc(var(--py, 0) * 0.4))' }}
      >
        <defs>
          <pattern id="hatch" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(125,211,252,0.35)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* ============================= BRIDGE ============================= */}
        <g ref={(el) => (groupRefs.current.bridge = el)} style={{ opacity: 0 }}>
          {/* deck */}
          <path ref={registerPath('bridge')} d="M180,560 L1420,560" stroke="#7dd3fc" strokeWidth="2.5" fill="none" />
          {/* deck ticks */}
          {Array.from({ length: 25 }).map((_, i) => (
            <path
              key={`deck-tick-${i}`}
              ref={registerPath('bridge')}
              d={`M${220 + i * 50},560 L${220 + i * 50},572`}
              stroke="#7dd3fc"
              strokeWidth="1.2"
              fill="none"
            />
          ))}
          {/* towers */}
          <path ref={registerPath('bridge')} d="M420,560 L420,190 L470,190 L470,560" stroke="#bae6fd" strokeWidth="2" fill="none" />
          <path ref={registerPath('bridge')} d="M420,300 L470,340 M420,340 L470,300 M420,230 L470,270 M420,270 L470,230" stroke="rgba(186,230,253,0.6)" strokeWidth="1.2" fill="none" />
          <path ref={registerPath('bridge')} d="M1130,560 L1130,190 L1180,190 L1180,560" stroke="#bae6fd" strokeWidth="2" fill="none" />
          <path ref={registerPath('bridge')} d="M1130,300 L1180,340 M1130,340 L1180,300 M1130,230 L1180,270 M1130,270 L1180,230" stroke="rgba(186,230,253,0.6)" strokeWidth="1.2" fill="none" />
          {/* main cable */}
          <path ref={registerPath('bridge')} d="M180,600 Q 445,205 800,560 Q 1155,205 1420,600" stroke="#5ed3ff" strokeWidth="2.5" fill="none" />
          {/* suspenders */}
          {Array.from({ length: 22 }).map((_, i) => {
            const x = 220 + i * 55;
            const t = (x - 180) / (1420 - 180);
            const towerSpan = t < 0.5 ? (x - 180) / (800 - 180) : (x - 800) / (1420 - 800);
            const midY = 205 + Math.pow(1 - Math.sin(towerSpan * Math.PI), 1) * 355;
            return (
              <path
                key={`susp-${i}`}
                ref={registerPath('bridge')}
                d={`M${x},${Math.min(560, midY + 40)} L${x},560`}
                stroke="rgba(94,211,255,0.55)"
                strokeWidth="1"
                fill="none"
              />
            );
          })}
          {/* ground + water hatching under bridge */}
          <path ref={registerPath('bridge')} d="M180,600 L1420,600" stroke="rgba(125,211,252,0.4)" strokeWidth="1" strokeDasharray="2 6" fill="none" />
          <rect x="180" y="600" width="1240" height="34" fill="url(#hatch)" opacity="0.5" />
          {/* dimension line */}
          <path ref={registerPath('bridge')} d="M180,660 L1420,660 M180,650 L180,670 M1420,650 L1420,670" stroke="#5ed3ff" strokeWidth="1" fill="none" />
        </g>

        {/* ============================== DAM ================================ */}
        <g ref={(el) => (groupRefs.current.dam = el)} style={{ opacity: 0 }}>
          {/* dam body: sloped upstream, stepped downstream (gravity dam profile) */}
          <path
            ref={registerPath('dam')}
            d="M620,200 L900,200 L1080,640 L1040,640 L1040,600 L1000,600 L1000,560 L960,560 L960,520 L920,520 L920,640 L620,640 Z"
            stroke="#7dd3fc"
            strokeWidth="2"
            fill="none"
          />
          {/* reservoir water line + hatch */}
          <path ref={registerPath('dam')} d="M300,300 L620,300" stroke="#5ed3ff" strokeWidth="2" fill="none" />
          <rect x="300" y="300" width="320" height="340" fill="url(#hatch)" opacity="0.4" />
          {/* reservoir contour arcs */}
          {Array.from({ length: 4 }).map((_, i) => (
            <path
              key={`contour-${i}`}
              ref={registerPath('dam')}
              d={`M${260 - i * 30},260 Q ${380},${230 - i * 22} ${640 + i * 10},${260 - i * 4}`}
              stroke="rgba(125,211,252,0.35)"
              strokeWidth="1"
              fill="none"
            />
          ))}
          {/* monitoring points */}
          {[
            [700, 320],
            [820, 380],
            [960, 460],
          ].map(([cx, cy], i) => (
            <circle key={`mon-${i}`} cx={cx} cy={cy} r="4" fill="none" stroke="#bae6fd" strokeWidth="1.4" />
          ))}
          {/* ground line */}
          <path ref={registerPath('dam')} d="M300,640 L1080,640" stroke="rgba(125,211,252,0.4)" strokeWidth="1" strokeDasharray="2 6" fill="none" />
          {/* height dimension */}
          <path ref={registerPath('dam')} d="M580,200 L580,640 M568,200 L592,200 M568,640 L592,640" stroke="#5ed3ff" strokeWidth="1" fill="none" />
        </g>

        {/* ============================= TUNNEL =============================== */}
        <g ref={(el) => (groupRefs.current.tunnel = el)} style={{ opacity: 0 }}>
          {/* concentric arch rings receding */}
          {[0, 1, 2, 3].map((i) => {
            const inset = i * 60;
            const left = 480 + inset;
            const right = 1120 - inset;
            const floorY = 660 - inset * 0.5;
            const springY = 420 - inset * 0.35;
            const rx = (right - left) / 2;
            const ry = springY - 200 + inset * 0.2;
            const d = `M${left},${floorY} L${left},${springY} A${rx},${ry} 0 0 1 ${right},${springY} L${right},${floorY}`;
            return (
              <path
                key={`ring-${i}`}
                ref={registerPath('tunnel')}
                d={d}
                stroke={i === 0 ? '#5ed3ff' : 'rgba(125,211,252,0.5)'}
                strokeWidth={i === 0 ? 2.5 : 1.2}
                fill="none"
              />
            );
          })}
          {/* centerline + chainage ticks */}
          <path ref={registerPath('tunnel')} d="M420,660 L1180,660" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="10 6" fill="none" />
          {Array.from({ length: 10 }).map((_, i) => (
            <path
              key={`ch-${i}`}
              ref={registerPath('tunnel')}
              d={`M${460 + i * 70},656 L${460 + i * 70},664`}
              stroke="#7dd3fc"
              strokeWidth="1"
              fill="none"
            />
          ))}
          {/* ventilation duct */}
          <path ref={registerPath('tunnel')} d="M560,300 L1040,300 L1040,340 L560,340 Z" stroke="rgba(186,230,253,0.6)" strokeWidth="1.2" fill="none" />
          {/* portal frame */}
          <path ref={registerPath('tunnel')} d="M400,660 L400,420 M1200,660 L1200,420" stroke="rgba(125,211,252,0.4)" strokeWidth="1" fill="none" />
        </g>

        {/* ============================== ROAD ================================= */}
        <g ref={(el) => (groupRefs.current.road = el)} style={{ opacity: 0 }}>
          {/* winding alignment */}
          <path
            ref={registerPath('road')}
            d="M160,760 C 420,760 380,480 640,480 C 900,480 860,260 1120,260 C 1300,260 1360,180 1460,150"
            stroke="#5ed3ff"
            strokeWidth="2.5"
            fill="none"
          />
          {/* road edge lines */}
          <path
            ref={registerPath('road')}
            d="M160,790 C 420,790 380,510 640,510 C 900,510 860,290 1120,290 C 1300,290 1360,210 1460,180"
            stroke="rgba(125,211,252,0.4)"
            strokeWidth="1"
            fill="none"
          />
          <path
            ref={registerPath('road')}
            d="M160,730 C 420,730 380,450 640,450 C 900,450 860,230 1120,230 C 1300,230 1360,150 1460,120"
            stroke="rgba(125,211,252,0.4)"
            strokeWidth="1"
            fill="none"
          />
          {/* terrain contour lines */}
          {Array.from({ length: 5 }).map((_, i) => (
            <path
              key={`terrain-${i}`}
              ref={registerPath('road')}
              d={`M120,${840 - i * 60} C 420,${820 - i * 60} 700,${780 - i * 55} 1480,${700 - i * 70}`}
              stroke="rgba(125,211,252,0.22)"
              strokeWidth="1"
              fill="none"
            />
          ))}
          {/* station markers */}
          {Array.from({ length: 6 }).map((_, i) => {
            const t = i / 5;
            const x = 200 + t * 1200;
            const y = 760 - t * 610 + Math.sin(t * Math.PI) * 40;
            return (
              <g key={`sta-${i}`}>
                <circle cx={x} cy={y} r="4" fill="none" stroke="#bae6fd" strokeWidth="1.4" />
              </g>
            );
          })}
          {/* north arrow */}
          <path ref={registerPath('road')} d="M1480,120 L1480,60 M1480,60 L1470,78 M1480,60 L1490,78" stroke="#bae6fd" strokeWidth="1.4" fill="none" />
          {/* scale bar */}
          <path ref={registerPath('road')} d="M160,840 L320,840 M160,832 L160,848 M320,832 L320,848" stroke="#7dd3fc" strokeWidth="1" fill="none" />
        </g>
      </svg>

      {/* drawing-sheet label — bottom-left title block, swaps per active structure */}
      {(Object.keys(STRUCTURE_LABELS) as StructureKey[]).map((key) => (
        <div
          key={key}
          ref={(el) => (labelRefs.current[key] = el)}
          className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 nq-tech text-[10px] sm:text-xs text-sky-200/70 border border-sky-300/20 rounded-lg px-3 py-2 bg-navy-950/30"
          style={{ opacity: 0, transition: 'opacity 0.4s ease' }}
        >
          <div className="flex items-center gap-2">
            <Compass size={12} className="text-sky-300/70" />
            <span>{STRUCTURE_LABELS[key].title}</span>
          </div>
          <div className="text-sky-400/50 mt-1">{STRUCTURE_LABELS[key].code}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Home() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const pendingNavRef = useRef<string | null>(null);
  const fullText = 'دستیار هوش مصنوعی حقوقی';
  const { subscribe } = useScrollProgress();

  const navigateWithTransition = useCallback((path: string) => {
    pendingNavRef.current = path;
    setTransitioning(true);
  }, []);

  const handleTransitionDone = useCallback(() => {
    setTransitioning(false);
    pendingNavRef.current = null;
  }, []);

  const handleTransitionNavigate = useCallback(() => {
    const path = pendingNavRef.current;
    if (path) navigate(path);
  }, [navigate]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen nq-body" dir="rtl" style={{ fontFamily: FONT_BODY }}>
      <FontLoader />
      <MotifStyles />
      <BlueprintCanvas subscribe={subscribe} />

      {/* Navbar */}
      <nav
        className={`fixed top-0 right-0 left-0 z-50 transition-all duration-400 ${
          scrolled ? 'glass-panel shadow-lg shadow-black/20' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            <a href="#home" className="flex items-center gap-3 group">
              <div className="relative">
                <img
                  src="/tunnelsaddariana_logo.jpg"
                  alt="تونل سد آریانا"
                  className="h-9 w-9 rounded-lg object-contain shadow-md"
                />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold leading-tight text-white">دستیار حقوقی آریانا</p>
                <p className="text-xs text-sky-200/60 nq-tech">تونل سد آریانا</p>
              </div>
            </a>

            <div className="hidden md:flex items-center gap-8">
              {NAV_ITEMS.map((item) => (
                <a key={item.label} href={item.href} className="text-sm font-medium text-white/85 hover:text-sky-300 transition-colors">
                  {item.label}
                </a>
              ))}
              <a href="#features" className="nq-btn text-white text-sm font-semibold px-5 py-2 rounded-xl flex items-center gap-2">
                <Zap size={15} />
                ورود به تحلیلگر
              </a>
            </div>

            <button
              className="md:hidden p-2 rounded-xl text-white hover:bg-white/10 transition-all"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="منو"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${menuOpen ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="glass-panel border-t border-white/10 px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 text-white hover:text-sky-300 hover:bg-white/10 px-4 py-3 rounded-xl text-sm font-medium transition-all"
              >
                <ChevronLeft size={14} className="text-sky-400" />
                {item.label}
              </a>
            ))}
            <div className="pt-2 pb-1">
              <a
                href="#features"
                onClick={() => setMenuOpen(false)}
                className="nq-btn text-white text-sm font-semibold px-5 py-3 rounded-xl flex items-center justify-center gap-2 w-full"
              >
                <Zap size={15} />
                ورود به تحلیلگر
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section id="home" className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="relative z-10 text-center max-w-4xl mx-auto pt-24 pb-16">
          <div className="flex justify-center mb-8">
            <div className="relative inline-flex items-center justify-center float-slow">
              <span className="absolute w-64 h-64 md:w-80 md:h-80 rounded-full bg-sky-300/10 blur-3xl" aria-hidden="true" />
              <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-full bg-white/10 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-2xl">
                <img
                  src="/tunnelsaddariana_logo.jpg"
                  alt="لوگو تونل سد آریانا"
                  className="w-20 h-20 md:w-28 md:h-28 object-contain rounded-full"
                />
              </div>
            </div>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-4">
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-sky-300 to-blue-300">دستیار حقوقی آریانا</span>
          </h1>

          <div className="mb-6">
            <div className="inline-flex items-center gap-2 glass-panel rounded-full px-5 py-2.5">
              <Brain size={16} className="text-sky-300 flex-shrink-0" />
              <span className="text-sky-200 text-sm font-medium nq-tech">
                {typedText}
                <span className="typed-caret text-sky-300">|</span>
              </span>
            </div>
          </div>

          <p className="text-blue-100/75 text-base md:text-lg leading-loose max-w-2xl mx-auto mb-10">
            سامانه اختصاصی دپارتمان حقوقی شرکت تونل سد آریانا برای تحلیل، تحریر و بررسی اسناد با استفاده از هوش مصنوعی
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigateWithTransition('/fa-analysis')}
              className="nq-btn text-white font-semibold px-8 py-4 rounded-2xl flex items-center gap-3 text-base w-full sm:w-auto justify-center"
            >
              <Zap size={20} />
              ورود به تحلیلگر
              <ArrowLeft size={18} />
            </button>
            <a
              href="#features"
              className="glass-panel text-white font-medium px-8 py-4 rounded-2xl flex items-center gap-3 text-base hover:bg-white/15 transition-all w-full sm:w-auto justify-center"
            >
              <Scale size={18} />
              امکانات سامانه
            </a>
          </div>
        </div>

        <div className="relative z-10 w-full px-4 sm:px-6 pb-10">
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {STATS.map(({ value, label, icon: Icon }) => (
              <div key={label} className="glass-panel rounded-2xl px-4 py-4 text-center flex flex-col items-center gap-1.5">
                <Icon size={16} className="text-sky-300" />
                <span className="text-white font-bold text-xl md:text-2xl nq-tech">{value}</span>
                <span className="text-blue-200/70 text-[11px] md:text-xs">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-6">
            <div className="flex flex-col items-center gap-1 text-sky-200/50">
              <span className="text-[10px] nq-tech">اسکرول کنید</span>
              <div className="w-5 h-8 rounded-full border border-sky-300/30 flex items-start justify-center p-1">
                <div className="w-1 h-1.5 rounded-full bg-sky-300/70 animate-bounce" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 chip glass-panel text-sky-200 rounded-full px-4 py-2 text-sm font-medium mb-5">
              <Ruler size={14} />
              ابزارهای سامانه
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 leading-tight">
              دو ابزار کاربردی
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-sky-300 to-blue-300"> برای دپارتمان حقوقی</span>
            </h2>
            <p className="text-blue-100/70 text-base md:text-lg max-w-2xl mx-auto leading-loose">
              هر بخش برای یک نیاز مشخص طراحی شده است. برای شروع، بخش موردنظر را انتخاب کنید.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {FEATURES.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Reveal key={feature.id} delay={idx * 120}>
                  <div className="corner-frame" style={{ ['--cf-color' as any]: 'rgba(94,211,255,0.4)' }}>
                    <button
                      onClick={() => navigateWithTransition(feature.href)}
                      className="group relative block w-full text-right rounded-3xl overflow-hidden glass-panel-light shadow-xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
                    >
                      <div className="h-1.5 bg-gradient-to-l from-sky-500 to-blue-700" />
                      <div className="p-7 flex flex-col">
                        <div className="flex items-start justify-between mb-6">
                          <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                            <Icon size={30} className="text-sky-700" />
                          </div>
                          <span className="nq-tech text-[10px] text-navy-400/60 mt-1">{feature.code}</span>
                        </div>

                        <h3 className="text-xl font-bold text-navy-900 mb-3 group-hover:text-sky-700 transition-colors">
                          {feature.title}
                        </h3>
                        <p className="text-navy-500 text-sm leading-7 mb-5">{feature.description}</p>

                        <div className="flex flex-wrap gap-2 mb-6">
                          {feature.tags.map((tag) => (
                            <span key={tag} className="bg-sky-50 text-sky-700 text-xs font-medium px-3 py-1.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 text-sm font-semibold text-sky-700 group-hover:gap-3 transition-all mt-auto pt-4">
                          <span>ورود به بخش</span>
                          <ArrowLeft size={16} className="group-hover:translate-x-[-4px] transition-transform" />
                        </div>
                      </div>
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="relative py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <Reveal className="order-2 lg:order-1">
              <div className="relative">
                <div className="w-full aspect-square max-w-md mx-auto">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 rounded-full glass-panel flex items-center justify-center shadow-2xl">
                      <img src="/tunnelsaddariana_logo.jpg" alt="آریانا" className="w-28 h-28 object-contain rounded-xl" />
                    </div>
                  </div>
                  <div className="absolute inset-8 rounded-full border border-sky-400/25 spin-slow" />
                  <div className="absolute inset-4 rounded-full border border-sky-400/10" style={{ animation: 'spinSlow 18s linear infinite reverse' }} />
                  {[FileText, PenTool, Shield].map((Icon, i) => {
                    const angle = (i * 120 * Math.PI) / 180;
                    const radius = 42;
                    const top = 50 - radius * Math.cos(angle);
                    const right = 50 - radius * Math.sin(angle);
                    return (
                      <div
                        key={i}
                        className="absolute w-14 h-14 glass-panel rounded-2xl flex items-center justify-center shadow-lg float-slow"
                        style={{ top: `${top}%`, right: `${right}%`, transform: 'translate(50%, -50%)', animationDelay: `${i * 0.8}s` }}
                      >
                        <Icon size={24} className="text-sky-300" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>

            <Reveal className="order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 chip glass-panel text-sky-200 rounded-full px-4 py-2 text-sm font-medium mb-6">
                <Brain size={14} />
                درباره سامانه
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                ابزار اختصاصی
                <span className="text-sky-300"> دپارتمان حقوقی</span>
              </h2>
              <p className="text-blue-100/70 text-base leading-loose mb-8">
                این سامانه به طور اختصاصی برای پشتیبانی از فعالیت‌های روزمره دپارتمان حقوقی شرکت تونل سد آریانا طراحی شده است و امکان بررسی سریع و دقیق قراردادها را فراهم می‌کند.
              </p>

              {CHECKLIST.map((item, i) => (
                <div key={i} className="flex items-start gap-3 mb-4">
                  <div className="w-6 h-6 rounded-full bg-sky-400/20 border border-sky-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle size={14} className="text-sky-400" />
                  </div>
                  <p className="text-blue-100/80 text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* Capabilities band */}
      <section className="relative py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="glass-panel rounded-3xl grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x md:divide-x-reverse md:divide-white/10 px-6 py-8">
              {CAPABILITIES.map(({ icon: Icon, title, desc }, i) => (
                <div key={i} className="flex flex-col items-center text-center px-5 py-2 group">
                  <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon size={24} className="text-sky-300" />
                  </div>
                  <h4 className="text-white font-bold text-sm mb-1">{title}</h4>
                  <p className="text-blue-200/60 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="relative py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Reveal>
            <div className="corner-frame" style={{ ['--cf-color' as any]: 'rgba(125,211,252,0.5)' }}>
              <div className="glass-panel rounded-3xl p-10 md:p-14 shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                  <div className="w-16 h-16 mx-auto bg-white/10 rounded-2xl flex items-center justify-center mb-6 border border-white/20">
                    <Scale size={30} className="text-sky-300" />
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">شروع به کار</h2>
                  <p className="text-blue-100/70 text-base leading-loose mb-8 max-w-lg mx-auto">
                    برای تحلیل قرارداد، فایل متنی یا تصویری قرارداد را بارگذاری کنید و سؤال حقوقی خود را مطرح نمایید.
                  </p>
                  <button
                    onClick={() => navigateWithTransition('/fa-analysis')}
                    className="nq-btn text-white font-bold px-10 py-4 rounded-2xl inline-flex items-center gap-3 text-base"
                  >
                    <Zap size={20} />
                    ورود به سامانه
                    <ArrowLeft size={18} />
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Footer — the foundation the whole page rests on */}
      <footer className="relative bg-navy-950 text-white pt-14 pb-8 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-10 border-b border-white/10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/tunnelsaddariana_logo.jpg" alt="تونل سد آریانا" className="w-10 h-10 rounded-xl object-contain" />
                <div>
                  <p className="font-bold text-base text-white">دستیار حقوقی آریانا</p>
                  <p className="text-blue-300/60 text-xs nq-tech">Ariana Legal Assistant</p>
                </div>
              </div>
              <p className="text-blue-200/50 text-sm leading-loose">
                سامانه اختصاصی دپارتمان حقوقی شرکت تونل سد آریانا برای بررسی و تحلیل قراردادها.
              </p>
            </div>

            <div>
              <h4 className="font-bold text-white mb-5 text-sm">دسترسی سریع</h4>
              <ul className="space-y-3">
                {[
                  { label: 'تحلیلگر آریانا  ', href: '/fa-analysis' },
                  { label: 'پیش نویس ', href: '/drafting' },
                ].map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => navigateWithTransition(link.href)}
                      className="text-blue-200/60 hover:text-sky-300 text-sm transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft size={12} className="text-sky-500/50" />
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-white mb-5 text-sm">شرکت تونل سد آریانا</h4>
              <p className="text-blue-200/50 text-sm leading-loose mb-4">
                این سامانه صرفاً برای استفاده داخلی دپارتمان حقوقی شرکت تونل سد آریانا طراحی شده است.
              </p>
              <div className="flex items-center gap-2 text-blue-200/40 text-xs">
                <Users size={12} />
                <span>دپارتمان حقوقی شرکت تونل سد آریانا</span>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-blue-200/40 text-xs">
              <Scale size={13} />
              <span>تمامی حقوق برای شرکت تونل سد آریانا محفوظ است — 1405</span>
            </div>
            <div className="flex items-center gap-2 text-blue-200/35 text-xs">
              <Brain size={13} className="text-sky-500/50" />
              <span>
                طراحی و توسعه توسط <span className="text-sky-400/70 font-semibold">دپارتمان حقوقی شرکت تونل سد آریانا</span>
              </span>
            </div>
          </div>
        </div>
      </footer>

      <PageTransition active={transitioning} onDone={handleTransitionDone} onNavigate={handleTransitionNavigate} />
    </div>
  );
}
