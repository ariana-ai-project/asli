/* ============================================================
   سامانه هوشمند آریانا — منطق صفحه خانه (نسخهٔ بازطراحی‌شده)
   ۱) دسکتاپ: ویدیو در فریم صفر متوقف است؛ اولین اسکرول → پخش + قفل تعامل
      پایان ویدیو → نمایش اورلی (عنوان، خطوط، تصاویر) + آزادسازی قفل
   ۲) موبایل: ویدیو به‌محض لود صفحه به‌صورت خودکار پخش می‌شود (بدون قفل)
   ۳) ثبت سرویس‌ورکر برای PWA
   ============================================================ */

(function () {
  "use strict";

  const video = document.getElementById("logoMotion");
  const overlay = document.getElementById("heroOverlay");
  const body = document.body;
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  let started = false;
  let finished = false;

  /* در موبایل: پخش خودکار به‌محض ورود؛ در دسکتاپ: رفتار تعاملی قبلی */
  const isMobile = window.matchMedia("(max-width: 900px)").matches;

  /* ---------- حالت اولیه: فریم صفر ---------- */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  video.pause();
  video.currentTime = 0;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- قفل کامل تعامل ---------- */
  const blockEvent = (e) => {
    if (!finished) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const lockEvents = ["wheel", "touchmove", "keydown", "click", "mousedown", "contextmenu"];

  function lockInteraction() {
    body.classList.remove("is-pre-play");
    body.classList.add("is-locked");
    lockEvents.forEach((ev) =>
      window.addEventListener(ev, blockEvent, { passive: false, capture: true })
    );
  }

  function unlockInteraction() {
    finished = true;
    body.classList.remove("is-locked", "is-pre-play");
    lockEvents.forEach((ev) =>
      window.removeEventListener(ev, blockEvent, { capture: true })
    );
  }

  /* ---------- پایان لوگوموشن ---------- */
  function onVideoEnd() {
    if (finished) return;
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");
    unlockInteraction();
  }

  /* ---------- شروع پخش با اولین تعامل ---------- */
  function startMotion() {
    if (started) return;
    started = true;

    startEvents.forEach((ev) => window.removeEventListener(ev, startMotion));

    if (reduceMotion) {
      // برای کاربران حساس به حرکت: بدون پخش، مستقیم به حالت نهایی
      video.pause();
      onVideoEnd();
      return;
    }

    if (isMobile) {
      // موبایل: بدون قفل اسکرول — ویدیو بالای صفحه پخش می‌شود و کاربر آزاد است
      body.classList.remove("is-pre-play");
    } else {
      lockInteraction();
    }
    tryPlay();
  }

  function tryPlay() {
    const p = video.play();
    if (p !== undefined) {
      p.catch(() => {
        // اگر Blob هنوز در حال لود است، پس از اتمامش دوباره پخش می‌شود
        if (blobState === "failed" || blobState === "done") onVideoEnd();
        else if (blobState === "none") handleVideoError();
      });
    }
  }

  /* مدیریت کلیک روی منو: اگر ویدیو در حال پخش است یا هنوز شروع نشده، اول آن را به پایان برسانیم */
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
      if (!finished) {
        e.preventDefault();
        startMotion(); // شروع پخش ویدیو
        // صبر برای اتمام ویدیو و سپس اسکرول به هدف
        const targetId = link.getAttribute('href');
        const checkFinished = setInterval(() => {
          if (finished) {
            clearInterval(checkFinished);
            document.querySelector(targetId).scrollIntoView({ behavior: 'smooth' });
          }
        }, 500);
      }
    });
  });

  const startEvents = ["wheel", "touchmove", "scroll"];
  startEvents.forEach((ev) =>
    window.addEventListener(ev, startMotion, { passive: false })
  );

  video.addEventListener("ended", onVideoEnd);

  /* ---------- موبایل: پخش خودکار به‌محض لود صفحه ---------- */
  if (isMobile) {
    // ویژگی autoplay برای سازگاری با iOS Safari به‌صورت پویا اضافه می‌شود
    try { video.setAttribute("autoplay", ""); } catch (e) { /* بی‌اهمیت */ }
    video.muted = true;

    const mobilePlay = () => {
      if (!started) startMotion();
      else if (!finished) tryPlay();
    };
    video.addEventListener("canplay", mobilePlay, { once: true });
    // اجرای فوری + تلاش مجدد پس از لود کامل (حالت کم‌مصرف iOS)
    mobilePlay();
    window.addEventListener("load", mobilePlay, { once: true });
    // پشتیبان: اگر پخش خودکار توسط مرورگر مسدود شد، اولین لمس دوباره تلاش می‌کند
    const touchRetry = () => {
      if (!finished) mobilePlay();
      window.removeEventListener("touchstart", touchRetry);
      window.removeEventListener("pointerdown", touchRetry);
    };
    window.addEventListener("touchstart", touchRetry, { passive: true });
    window.addEventListener("pointerdown", touchRetry, { passive: true });

    // تضمین اجرای ویدیو حداکثر ۱ ثانیه پس از لود صفحه، صرف‌نظر از تأخیر رویدادهای canplay/load
    setTimeout(() => {
      if (!started) startMotion();
      else if (!finished) tryPlay();
    }, 1000);
  }

  /* اگر لود مستقیم شکست خورد (مثلاً پروتکل file://) → تلاش با Blob
     اولویت با نسخهٔ باکیفیت webm است تا کیفیت ویدیو افت نکند؛
     فقط در صورت شکست دوبارهٔ webm، به mp4 (کیفیت پایین‌تر) به‌عنوان آخرین گزینه سوییچ می‌کنیم. */
  let blobState = "none"; // none | loading | done | failed
  async function handleVideoError() {
    if (blobState === "loading") return;
    if (blobState === "done" || blobState === "failed") { onVideoEnd(); return; }
    blobState = "loading";
    try {
      const res = await fetch("assets/logo-motion.webm");
      if (!res.ok) throw new Error("webm fetch failed");
      const blob = await res.blob();
      video.src = URL.createObjectURL(blob);
      video.load();
      blobState = "done";
      if (started && !finished) video.play().catch(() => onVideoEnd());
    } catch (_) {
      // آخرین تلاش: نسخهٔ mp4 (کیفیت پایین‌تر، فقط برای سازگاری حداکثری)
      try {
        const res2 = await fetch("assets/logo-motion.mp4");
        const blob2 = await res2.blob();
        video.src = URL.createObjectURL(blob2);
        video.load();
        blobState = "done";
        if (started && !finished) video.play().catch(() => onVideoEnd());
      } catch (__) {
        blobState = "failed";
        onVideoEnd();
      }
    }
  }
  video.addEventListener("error", handleVideoError, true);
  const sourceEl = video.querySelector("source");
  if (sourceEl) sourceEl.addEventListener("error", handleVideoError);

  // بررسی نهایی: اگر منبع پشتیبانی نشد (networkState=3) → Blob
  function checkSource() {
    if (video.readyState === 0 && video.networkState === 3) handleVideoError();
  }
  if (document.readyState === "complete") setTimeout(checkSource, 300);
  else window.addEventListener("load", () => setTimeout(checkSource, 300));

  // محافظ: اگر متادیتا لود نشد یا ویدیو گیر کرد، حداکثر ۲۰ ثانیه قفل بماند
  setTimeout(() => {
    if (started && !finished) onVideoEnd();
  }, 20000);

  /* ---------- منوی موبایل ---------- */
  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  /* ============================================================
     کارت‌های بخش‌ها — ورود پلکانی + چرخش سه‌بعدی + درخشش نشانگر
     ============================================================ */
  const cards = Array.from(document.querySelectorAll(".card"));

  // تأخیر پلکانی ورود هر کارت
  cards.forEach((card, i) => {
    card.style.setProperty("--enter-d", `${(i % 5) * 0.09}s`);
  });

  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          cardObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  cards.forEach((card) => cardObserver.observe(card));

  /* چرخش سه‌بعدی ظریف + هالهٔ نور دنبال‌کنندهٔ نشانگر
     فقط با ماوس اجرا می‌شود؛ در لمس، pointermove هنگام اسکرول هم شلیک می‌کند
     و کارت‌ها را به‌صورت عرضی می‌لرزاند */
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  if (!reduceMotion && finePointer) {
    const MAX_TILT = 7; // درجه

    cards.forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;

        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;   // 0..1
        const py = (e.clientY - rect.top) / rect.height;   // 0..1

        const rotY = (px - 0.5) * MAX_TILT * 2 * -1;
        const rotX = (py - 0.5) * MAX_TILT * 2;

        card.style.transform = `translateY(-8px) scale(1.02) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
        card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      });

      card.addEventListener("pointerleave", () => {
        card.style.transform = "";
      });
    });
  }

  /* ============================================================
     ستاره‌های دنباله‌دار — بک‌گراند بخش کارت‌ها
     ============================================================ */
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let stars = [];
  let meteors = [];
  let rafId = null;

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._w = rect.width;
    canvas._h = rect.height;
    initStars();
  }

  function initStars() {
    const count = Math.floor((canvas._w * canvas._h) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas._w,
      y: Math.random() * canvas._h,
      r: Math.random() * 1.3 + 0.2,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.008 + Math.random() * 0.02,
    }));
  }

  /* ستارهٔ دنباله‌دار با جهت و اندازهٔ تصادفی */
  function spawnMeteor() {
    const side = Math.floor(Math.random() * 4); // 0=بالا 1=راست 2=چپ 3=بالا-گوشه
    const speed = 4 + Math.random() * 7;
    const size = Math.random() < 0.25 ? 2.4 : 1 + Math.random() * 1.2; // گاهی بزرگ
    let x, y, angle;

    if (side === 0) { x = Math.random() * canvas._w; y = -20; angle = Math.PI / 2 + (Math.random() - 0.5) * 0.9; }
    else if (side === 1) { x = canvas._w + 20; y = Math.random() * canvas._h * 0.6; angle = Math.PI - (Math.random() * 0.5 + 0.2); }
    else if (side === 2) { x = -20; y = Math.random() * canvas._h * 0.6; angle = Math.random() * 0.5 + 0.2; }
    else { x = Math.random() * canvas._w; y = -20; angle = Math.PI / 2 + (Math.random() - 0.5) * 1.2; }

    meteors.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      life: 0,
      maxLife: 60 + Math.random() * 70,
      trail: 60 + size * 40,
      hue: Math.random() < 0.3 ? 28 : 215, // گاهی نارنجی، بیشتر آبی
    });
  }

  let nextMeteorIn = 12;
  const MAX_METEORS = 45;

  function drawFrame() {
    ctx.clearRect(0, 0, canvas._w, canvas._h);

    // ستاره‌های چشمک‌زن
    for (const s of stars) {
      s.tw += s.twSpeed;
      const a = 0.25 + Math.abs(Math.sin(s.tw)) * 0.6;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210, 226, 255, ${a})`;
      ctx.fill();
    }

    // زمان‌بندی پرتراکم شهاب‌ها — دسته‌ای و مکرر برای جلوهٔ کهکشانی پرجنب‌وجوش‌تر
    if (--nextMeteorIn <= 0 && meteors.length < MAX_METEORS) {
      const burst = 1 + Math.floor(Math.random() * 3); // ۱ تا ۳ شهاب هم‌زمان
      for (let i = 0; i < burst; i++) spawnMeteor();
      nextMeteorIn = 10 + Math.random() * 30;
    }

    // شهاب‌ها
    meteors = meteors.filter((m) => {
      m.x += m.vx;
      m.y += m.vy;
      m.life++;

      const fade =
        m.life < 15 ? m.life / 15 :
        m.life > m.maxLife - 20 ? Math.max(0, (m.maxLife - m.life) / 20) : 1;

      const tx = m.x - (m.vx / Math.hypot(m.vx, m.vy)) * m.trail;
      const ty = m.y - (m.vy / Math.hypot(m.vx, m.vy)) * m.trail;

      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, `hsla(${m.hue}, 90%, 80%, ${0.9 * fade})`);
      grad.addColorStop(1, `hsla(${m.hue}, 90%, 70%, 0)`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = m.size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // سر درخشان
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.size * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${m.hue}, 100%, 92%, ${fade})`;
      ctx.fill();

      return m.life < m.maxLife &&
        m.x > -200 && m.x < canvas._w + 200 &&
        m.y > -200 && m.y < canvas._h + 200;
    });

    rafId = requestAnimationFrame(drawFrame);
  }

  /* فقط وقتی بخش کارت‌ها دیده می‌شود انیمیشن اجرا شود */
  const deptSection = document.getElementById("departments");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !reduceMotion) {
          if (!rafId) drawFrame();
        } else if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      });
    },
    { threshold: 0.05 }
  );

  resizeCanvas();
  observer.observe(deptSection);
  window.addEventListener("resize", resizeCanvas);

  /* ============================================================
     ثبت سرویس‌ورکر PWA — فقط روی http/https (نه file://)
     ============================================================ */
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* ثبت ناموفق — سایت بدون قابلیت آفلاین ادامه می‌دهد */
      });
    });
  }
})();
