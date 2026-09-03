import { useEffect, useRef, useState } from 'react';
import './PageTransition.css';

interface Props {
  active: boolean;
  onDone: () => void;
  onNavigate: () => void;
}

export default function PageTransition({ active, onDone, onNavigate }: Props) {
  const [fadingOut, setFadingOut] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onDoneRef = useRef(onDone);
  const onNavigateRef = useRef(onNavigate);
  onDoneRef.current = onDone;
  onNavigateRef.current = onNavigate;

  useEffect(() => {
    if (!active) return;
    setFadingOut(false);
    setMounted(false);

    const mountTimer = requestAnimationFrame(() => setMounted(true));
    const navigateTimer = setTimeout(() => onNavigateRef.current(), 1500);
    const fadeTimer = setTimeout(() => setFadingOut(true), 1500);
    const doneTimer = setTimeout(() => {
      onDoneRef.current();
      setFadingOut(false);
      setMounted(false);
    }, 2000);

    return () => {
      cancelAnimationFrame(mountTimer);
      clearTimeout(navigateTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [active]);

  return (
    <div
      className={`page-transition-overlay ${mounted ? 'active' : ''} ${fadingOut ? 'pt-fade-out' : ''}`}
      dir="rtl"
    >
      <div className="pt-blueprint" />

      <div className="pt-motes pt-motes-1" />
      <div className="pt-motes pt-motes-2" />
      <div className="pt-motes pt-motes-3" />

      <div className="pt-grid" />

      <div className="pt-ring pt-ring-1" />
      <div className="pt-ring pt-ring-2" />
      <div className="pt-ring pt-ring-3" />
      <div className="pt-ring pt-ring-4" />

      <div className="pt-glow" />

      <div className="pt-shape pt-shape-1"><div className="w-2.5 h-2.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.9)]" /></div>
      <div className="pt-shape pt-shape-2"><div className="w-2 h-2 rotate-45 bg-blue-400 shadow-[0_0_10px_rgba(37,87,214,0.8)]" /></div>
      <div className="pt-shape pt-shape-3"><div className="w-2 h-2 rounded-sm border border-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.7)]" /></div>
      <div className="pt-shape pt-shape-4"><div className="w-1.5 h-1.5 rounded-full bg-blue-300 shadow-[0_0_8px_rgba(37,87,214,0.7)]" /></div>
      <div className="pt-shape pt-shape-5"><div className="w-2 h-2 rotate-12 border border-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.6)]" /></div>
      <div className="pt-shape pt-shape-6"><div className="w-1.5 h-1.5 rotate-45 bg-sky-200 shadow-[0_0_8px_rgba(56,189,248,0.6)]" /></div>

      <div className="pt-logo-wrap">
        <div className="w-24 h-24 md:w-28 md:h-28 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
          <img
            src="/tunnelsaddariana_logo.jpg"
            alt="لوگو"
            className="w-16 h-16 md:w-20 md:h-20 object-contain rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}
