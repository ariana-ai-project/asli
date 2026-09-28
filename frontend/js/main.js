/* ============================================================
   سامانه هوشمند آریانا — منطق صفحهٔ اول
   دسکتاپ و تبلت (≥ ۹۰۱px): «داستان اسکرولی» به سبک صفحه‌های اپل — صفحه خودش پایین
   نمی‌رود؛ اسکرول کاربر (چرخ موس، لمس‌پد، کلید، نوار اسکرول) این‌ها را جلو و عقب می‌برد:
     ۱) ۱۴۹ فریم لوگوموشن روی بوم (assets/frames)، فریم‌به‌فریم با اسکرول
     ۲) روی آخرین فریم (کرهٔ زمین): خطوط کشیده می‌شوند و تصاویر پروژه‌ها می‌آیند
     ۳) با ادامهٔ اسکرول هر تصویر به سمت نزدیک‌ترین لبهٔ صفحه بیرون می‌رود و خطوط محو می‌شوند
     ۴) کارت‌های شیشه‌ای بخش‌ها هر کدام از گوشه/لبهٔ خودش می‌آید و وسط صفحه می‌نشیند
   پس‌زمینه در همهٔ این پرده‌ها همان کرهٔ زمین می‌ماند؛ برگشتِ اسکرول همه را عقب می‌برد.
   موبایل (≤ ۹۰۰px): سازوکار قبلی، دست‌نخورده — ویدیو خودکار پخش می‌شود و صفحه عادی است.
   ============================================================ */

(function () {
  "use strict";

  const video = document.getElementById("logoMotion");
  const overlay = document.getElementById("heroOverlay");
  const body = document.body;
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  const cards = Array.from(document.querySelectorAll(".card"));

  const isMobile = window.matchMedia("(max-width: 900px)").matches;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* صفحه همیشه از ابتدای داستان شروع می‌شود */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /* پیشرفتِ محلی یک عضو در پنجرهٔ [start, start+width] از پیشرفت کل */
  const win = (p, start, width) => clamp01((p - start) / width);

  /* ---------- منوی موبایل ---------- */
  navToggle.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  /* ============================================================
     چرخش سه‌بعدی ظریف + هالهٔ نور دنبال‌کنندهٔ نشانگر (مشترک)
     فقط با ماوس اجرا می‌شود؛ در لمس، pointermove هنگام اسکرول هم شلیک می‌کند
     و کارت‌ها را به‌صورت عرضی می‌لرزاند
     ============================================================ */
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
     ستاره‌های دنباله‌دار — بومِ بخش کارت‌ها (مشترک)
     موبایل: ستاره‌های چشمک‌زن + شهاب، وقتی بخش دیده می‌شود.
     دسکتاپ: فقط شهاب‌ها و فقط در پردهٔ کارت‌ها — پشتِ شیشهٔ کارت‌ها رد می‌شوند؛
     ستارهٔ ثابت نمی‌کشیم چون پس‌زمینه خودِ کرهٔ زمین است.
     ============================================================ */
  const skyCanvas = document.getElementById("starfield");
  const sky = skyCanvas.getContext("2d");
  let stars = [];
  let meteors = [];
  let skyRaf = null;

  function resizeSky() {
    const rect = skyCanvas.parentElement.getBoundingClientRect();
    /* روی موبایل با dpr=3 بوم نُه برابر پیکسل دارد و هر فریم باید همان‌قدر
       پاک و دوباره رسم شود؛ ۱٫۵ برای خطوط نازک شهاب‌ها به‌اندازهٔ کافی صاف است */
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    skyCanvas.width = rect.width * dpr;
    skyCanvas.height = rect.height * dpr;
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    skyCanvas._w = rect.width;
    skyCanvas._h = rect.height;
    initStars();
  }

  function initStars() {
    const count = isMobile ? Math.floor((skyCanvas._w * skyCanvas._h) / 15000) : 0;
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * skyCanvas._w,
      y: Math.random() * skyCanvas._h,
      r: Math.random() * 1.3 + 0.2,
      tw: Math.random() * Math.PI * 2,
      twSpeed: 0.008 + Math.random() * 0.02,
    }));
  }

  /* ستارهٔ دنباله‌دار با جهت و اندازهٔ تصادفی */
  function spawnMeteor() {
    const side = Math.floor(Math.random() * 4); // 0=بالا 1=راست 2=چپ 3=بالا-گوشه
    const speed = 4 + Math.random() * 6;
    const size = Math.random() < 0.3 ? 2.6 + Math.random() * 0.8 : 1.2 + Math.random() * 1.2; // گاهی بزرگ
    let x, y, angle;

    if (side === 0) { x = Math.random() * skyCanvas._w; y = -20; angle = Math.PI / 2 + (Math.random() - 0.5) * 0.9; }
    else if (side === 1) { x = skyCanvas._w + 20; y = Math.random() * skyCanvas._h * 0.6; angle = Math.PI - (Math.random() * 0.5 + 0.2); }
    else if (side === 2) { x = -20; y = Math.random() * skyCanvas._h * 0.6; angle = Math.random() * 0.5 + 0.2; }
    else { x = Math.random() * skyCanvas._w; y = -20; angle = Math.PI / 2 + (Math.random() - 0.5) * 1.2; }

    meteors.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      life: 0,
      maxLife: 60 + Math.random() * 70,
      trail: 90 + size * 55,
      hue: Math.random() < 0.3 ? 28 : 215, // گاهی نارنجی، بیشتر آبی
    });
  }

  let nextMeteorIn = 12;
  /* هر شهاب در هر فریم یک گرادیان خطی می‌سازد؛ روی موبایل تعدادشان محدود می‌شود */
  const MAX_METEORS = isMobile ? 14 : 45;
  /* سقف نرخ فریم روی موبایل: ۳۰ فریم بر ثانیه، یعنی نصفِ کار برای چشمی که
     تفاوتش را روی این انیمیشن آرام تشخیص نمی‌دهد */
  const MIN_FRAME_MS = isMobile ? 1000 / 30 : 0;
  let lastSkyAt = 0;

  function drawSky(now) {
    if (MIN_FRAME_MS) {
      const t = now || performance.now();
      if (t - lastSkyAt < MIN_FRAME_MS) {
        skyRaf = requestAnimationFrame(drawSky);
        return;
      }
      lastSkyAt = t;
    }

    sky.clearRect(0, 0, skyCanvas._w, skyCanvas._h);

    // ستاره‌های چشمک‌زن
    for (const s of stars) {
      s.tw += s.twSpeed;
      const a = 0.3 + Math.abs(Math.sin(s.tw)) * 0.65;
      sky.beginPath();
      sky.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      sky.fillStyle = `rgba(220, 232, 255, ${a})`;
      sky.fill();
    }

    // زمان‌بندی پرتراکم شهاب‌ها — دسته‌ای و مکرر برای جلوهٔ کهکشانی پرجنب‌وجوش‌تر
    if (--nextMeteorIn <= 0 && meteors.length < MAX_METEORS) {
      const burst = isMobile ? 1 : 1 + Math.floor(Math.random() * 3); // ۱ تا ۳ شهاب هم‌زمان
      for (let i = 0; i < burst; i++) spawnMeteor();
      nextMeteorIn = (isMobile ? 12 : 8) + Math.random() * 26;
    }

    /* شهاب‌ها با ترکیب «lighter» نور را روی پس‌زمینه جمع می‌کنند نه اینکه رویش رنگ بکشند؛
       همین است که از پشت شیشهٔ کارت‌ها هم مثل رگهٔ نور دیده می‌شوند */
    sky.globalCompositeOperation = "lighter";
    meteors = meteors.filter((m) => {
      m.x += m.vx;
      m.y += m.vy;
      m.life++;

      const fade =
        m.life < 15 ? m.life / 15 :
        m.life > m.maxLife - 20 ? Math.max(0, (m.maxLife - m.life) / 20) : 1;

      const tx = m.x - (m.vx / Math.hypot(m.vx, m.vy)) * m.trail;
      const ty = m.y - (m.vy / Math.hypot(m.vx, m.vy)) * m.trail;

      const grad = sky.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, `hsla(${m.hue}, 95%, 84%, ${fade})`);
      grad.addColorStop(0.35, `hsla(${m.hue}, 90%, 72%, ${0.45 * fade})`);
      grad.addColorStop(1, `hsla(${m.hue}, 90%, 62%, 0)`);

      sky.strokeStyle = grad;
      sky.lineCap = "round";
      sky.beginPath();
      sky.moveTo(m.x, m.y);
      sky.lineTo(tx, ty);
      // هالهٔ پهن و کم‌رنگ دنباله، بعد هستهٔ روشن روی همان مسیر
      sky.globalAlpha = 0.22;
      sky.lineWidth = m.size * 4;
      sky.stroke();
      sky.globalAlpha = 1;
      sky.lineWidth = m.size;
      sky.stroke();

      // سر درخشان با هاله
      const headR = m.size * 6;
      const glow = sky.createRadialGradient(m.x, m.y, 0, m.x, m.y, headR);
      glow.addColorStop(0, `hsla(${m.hue}, 100%, 96%, ${0.95 * fade})`);
      glow.addColorStop(0.22, `hsla(${m.hue}, 100%, 80%, ${0.4 * fade})`);
      glow.addColorStop(1, `hsla(${m.hue}, 100%, 70%, 0)`);
      sky.beginPath();
      sky.arc(m.x, m.y, headR, 0, Math.PI * 2);
      sky.fillStyle = glow;
      sky.fill();

      return m.life < m.maxLife &&
        m.x > -200 && m.x < skyCanvas._w + 200 &&
        m.y > -200 && m.y < skyCanvas._h + 200;
    });
    sky.globalCompositeOperation = "source-over";

    skyRaf = requestAnimationFrame(drawSky);
  }

  function startSky() { if (!skyRaf && !reduceMotion) skyRaf = requestAnimationFrame(drawSky); }
  function stopSky() { if (skyRaf) { cancelAnimationFrame(skyRaf); skyRaf = null; } }

  resizeSky();

  /* در موبایل، پنهان/ظاهرشدن نوار آدرس هنگام اسکرول پشت‌سرهم resize می‌فرستد؛
     هر بار بوم از نو ساخته و ستاره‌ها بازتولید می‌شوند. تغییرِ فقط‌ارتفاع را
     نادیده می‌گیریم و بقیه را با تأخیر کوتاه جمع می‌بندیم. */
  let lastSkyWidth = window.innerWidth;
  let skyResizeTimer = null;

  window.addEventListener("resize", () => {
    if (isMobile && Math.abs(window.innerWidth - lastSkyWidth) < 2) return;
    clearTimeout(skyResizeTimer);
    skyResizeTimer = setTimeout(() => {
      resizeSky();
      lastSkyWidth = window.innerWidth;
    }, 200);
  }, { passive: true });

  if (isMobile) mobileMotion();
  else scrollStory();

  /* ============================================================
     موبایل — سازوکار قبلی: ویدیو به‌محض لود پخش می‌شود (بدون قفل)، پایانش اورلی را
     نشان می‌دهد، کارت‌ها با رسیدن به دید وارد می‌شوند، شهاب‌ها وقتی بخش دیده می‌شود.
     ============================================================ */
  function mobileMotion() {
    let started = false;
    let finished = false;

    /* ---------- حالت اولیه: فریم صفر ---------- */
    video.preload = "auto";
    video.pause();
    video.currentTime = 0;

    /* ---------- قفل کامل تعامل ---------- */
    const blockEvent = (e) => {
      if (!finished) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const lockEvents = ["wheel", "touchmove", "keydown", "click", "mousedown", "contextmenu"];

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

      // موبایل: بدون قفل اسکرول — ویدیو بالای صفحه پخش می‌شود و کاربر آزاد است
      body.classList.remove("is-pre-play");
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
    document.querySelectorAll(".nav-links a").forEach((link) => {
      link.addEventListener("click", (e) => {
        if (!finished) {
          e.preventDefault();
          startMotion(); // شروع پخش ویدیو
          // صبر برای اتمام ویدیو و سپس اسکرول به هدف
          const targetId = link.getAttribute("href");
          const checkFinished = setInterval(() => {
            if (finished) {
              clearInterval(checkFinished);
              document.querySelector(targetId).scrollIntoView({ behavior: "smooth" });
            }
          }, 500);
        }
      });
    });

    const startEvents = ["wheel", "touchmove", "scroll"];
    /* passive: شنوندهٔ غیرpassive روی touchmove مرورگر را وادار می‌کند پیش از
       هر اسکرول منتظر اجرای هندلر بماند — منبع مستقیم کندی اسکرول در موبایل.
       این هندلر هیچ‌وقت preventDefault نمی‌کند، پس passive درست است. */
    startEvents.forEach((ev) =>
      window.addEventListener(ev, startMotion, { passive: true })
    );

    video.addEventListener("ended", onVideoEnd);

    /* ---------- پخش خودکار به‌محض لود صفحه ---------- */
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

    /* ---------- کارت‌ها: ورود پلکانی با رسیدن به دید ---------- */
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

    /* فقط وقتی بخش کارت‌ها دیده می‌شود انیمیشن آسمان اجرا شود */
    const deptSection = document.getElementById("departments");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) startSky();
          else stopSky();
        });
      },
      { threshold: 0.05 }
    );
    observer.observe(deptSection);
  }

  /* ============================================================
     دسکتاپ و تبلت — داستان اسکرولی
     مسیر اسکرول (px) بر حسب ارتفاع پنجره تقسیم می‌شود:
       video → reveal → hold → exit → cards → tail
     پیشرفتِ هر پرده از جای اسکرول درمی‌آید و روی عنصرها نوشته می‌شود؛ هیچ چیز
     زمان‌محور نیست، پس عقب‌رفتن اسکرول همه‌چیز را دقیقاً برمی‌گرداند.
     ============================================================ */
  function scrollStory() {
    body.classList.remove("is-pre-play");
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");

    const frameCanvas = document.getElementById("frameCanvas");
    const fctx = frameCanvas.getContext("2d");
    const title = overlay.querySelector(".hero-title");
    const heroLines = overlay.querySelector(".hero-lines");
    const lines = Array.from(overlay.querySelectorAll(".line-paths .line"));
    const flows = overlay.querySelector(".line-flows");
    const particles = overlay.querySelector(".line-particles");
    const dots = overlay.querySelector(".geo-dots");
    const figs = Array.from(overlay.querySelectorAll(".proj"));
    const admin = document.querySelector(".site-admin");
    const root = document.documentElement;

    /* ---------- فریم‌های لوگوموشن ----------
       ۱۴۹ فریم WebP، ۱۶۰۰×۹۰۰، هر کدام ~۶۵KB (۹٫۴MB کل). ترتیب بارگذاری درشت‌به‌ریز است:
       اول فریم ۰ و آخر، بعد هر ۸تا، هر ۴تا، هر ۲تا، بعد بقیه — پس از همان ثانیه‌های اول
       اسکرول جواب می‌دهد و با رسیدن هر فریم، ریزتر می‌شود. روی اتصال کند یا «صرفه‌جویی داده»
       فقط نیمی از فریم‌ها (هر ۲تا) بارگذاری می‌شود. */
    const FRAMES = 149;
    const frameUrl = (i) => `assets/frames/logo-${String(i).padStart(3, "0")}.webp`;
    const imgs = new Array(FRAMES).fill(null);
    const order = [];
    {
      const seen = new Set();
      const push = (i) => { if (!seen.has(i)) { seen.add(i); order.push(i); } };
      push(0); push(FRAMES - 1);
      for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) push(i);
    }
    /* روی 3g هم همهٔ فریم‌ها می‌آیند (فریم‌های فرد آخرِ صف‌اند و هر وقت رسیدند به کار می‌روند)؛
       فقط با «صرفه‌جویی داده» یا 2g نیمی از فریم‌ها بارگذاری نمی‌شود */
    const conn = navigator.connection;
    const slowNet = !!(conn && (conn.saveData || /2g$/.test(conn.effectiveType || "")));
    let cursor = 0, inflight = 0;

    function pump() {
      while (inflight < 6 && cursor < order.length) {
        const i = order[cursor++];
        if (slowNet && i % 2 === 1) continue;
        const im = new Image();
        im.decoding = "async";
        inflight++;
        im.onload = () => { imgs[i] = im; inflight--; if (nearestLoaded(wantFrame) !== drawnFrame) schedule(); pump(); };
        im.onerror = () => { inflight--; pump(); };
        im.src = frameUrl(i);
      }
    }

    function nearestLoaded(i) {
      if (imgs[i]) return i;
      for (let d = 1; d < FRAMES; d++) {
        if (i - d >= 0 && imgs[i - d]) return i - d;
        if (i + d < FRAMES && imgs[i + d]) return i + d;
      }
      return -1;
    }

    let cw = 0, ch = 0, wantFrame = 0, drawnFrame = -1;

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = window.innerWidth;
      ch = window.innerHeight;
      frameCanvas.width = Math.round(cw * dpr);
      frameCanvas.height = Math.round(ch * dpr);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawnFrame = -1;
    }

    /* مثل object-fit: cover ویدیوی قبلی، تا نقاط جغرافیایی خطوط (کالیبره روی همان قاب) سر جایشان بمانند */
    function paintFrame(i) {
      const im = imgs[i];
      if (!im) return;
      const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      fctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
      drawnFrame = i;
      // فریم‌های همسایه را از قبل رمزگشایی کن تا اسکرول بعدی بی‌مکث باشد
      for (let d = 1; d <= 4; d++) {
        for (const j of [i + d, i - d]) {
          const m = imgs[j];
          if (m && m.decode) m.decode().catch(() => {});
        }
      }
    }

    /* ---------- مسیر اسکرول ---------- */
    let seg = null;

    function layout() {
      const H = window.innerHeight;
      seg = { video: 2.8 * H, reveal: 0.55 * H, hold: 0.2 * H, exit: 0.75 * H, cards: 1.05 * H, tail: 0.15 * H };
      seg.total = seg.video + seg.reveal + seg.hold + seg.exit + seg.cards + seg.tail;
      /* ارتفاع مسیر = کل داستان + یک پنجره، تا در تهِ اسکرول دقیقاً به پایان داستان برسیم */
      root.style.setProperty("--runway", reduceMotion ? "100vh" : `${Math.round(seg.total + H)}px`);
    }

    /* ---------- هندسه: هر تصویر و هر کارت به کدام سمت بیرون می‌رود / از کدام سمت می‌آید ----------
       جهت = از مرکز صفحه به مرکز عنصر؛ فاصله = آن‌قدر که عنصر کاملاً از قاب بیرون برود */
    let cardGeo = [], figGeo = [];

    function measure() {
      const vw = window.innerWidth, vh = window.innerHeight, cx = vw / 2, cy = vh / 2;
      const vec = (r) => {
        let dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        let len = Math.hypot(dx, dy);
        if (len < 1) { dx = 0; dy = 1; len = 1; }
        dx /= len; dy /= len;
        const tx = dx > 1e-6 ? (vw - r.left) / dx : dx < -1e-6 ? r.right / -dx : Infinity;
        const ty = dy > 1e-6 ? (vh - r.top) / dy : dy < -1e-6 ? r.bottom / -dy : Infinity;
        const t = Math.min(tx, ty) + 80;
        return { x: dx * t, y: dy * t, dist: len };
      };
      cards.forEach((c) => { c.style.translate = "0px 0px"; c.classList.remove("settled"); });
      cardGeo = cards.map((c) => vec(c.getBoundingClientRect()));

      figs.forEach((f) => { f.style.transform = "none"; });
      const fg = figs.map((f) => vec(f.getBoundingClientRect()));
      /* ورود: همان ترتیب قدیمیِ --d (نزدیک‌ترها زودتر)؛ خروج: دورترها از مرکز زودتر می‌روند */
      figs.forEach((f, i) => {
        const d = parseFloat(getComputedStyle(f).getPropertyValue("--d")) || 0;
        fg[i].inRank = clamp01((d - 0.15) / 0.35);
      });
      fg.map((g, i) => i).sort((a, b) => fg[b].dist - fg[a].dist)
        .forEach((idx, rank) => { fg[idx].outRank = rank / Math.max(1, figs.length - 1); });
      figGeo = fg;
    }

    /* ---------- رسم یک وضعیت از داستان (pos: پیکسلِ اسکرول در مسیر) ---------- */
    const cardState = cards.map(() => ({ on: false, settled: false }));

    function render(pos) {
      const H = window.innerHeight;

      // ۱) لوگوموشن: فریم از روی جای اسکرول
      const pv = clamp01(pos / seg.video);
      wantFrame = Math.round(pv * (FRAMES - 1));
      const nf = nearestLoaded(wantFrame);
      if (nf >= 0 && nf !== drawnFrame) paintFrame(nf);

      // پیشرفتِ پرده‌های بعدی
      const rv = clamp01((pos - seg.video) / seg.reveal);
      const ex = clamp01((pos - seg.video - seg.reveal - seg.hold) / seg.exit);
      const cd = clamp01((pos - seg.video - seg.reveal - seg.hold - seg.exit) / seg.cards);

      overlay.style.setProperty("--rv", rv.toFixed(3));

      // ۲) عنوان: با پرده می‌آید، در خروج به بالا می‌رود
      const tv = easeOut(rv), tx = easeInOut(ex);
      title.style.opacity = (tv * (1 - tx)).toFixed(3);
      title.style.transform = `translateY(${(24 * (1 - tv) - 0.45 * H * tx).toFixed(1)}px)`;

      // خطوط: کشیده‌شدن پلکانی؛ جریان نور، ذره‌ها و نقطه‌ها بعد از خط؛ همه در خروج محو
      heroLines.style.opacity = (1 - ex).toFixed(3);
      lines.forEach((ln, i) => {
        const l = easeInOut(win(rv, (i / (lines.length - 1)) * 0.4, 0.6));
        ln.style.strokeDashoffset = `${(520 * (1 - l)).toFixed(1)}px`;
      });
      const late = easeOut(win(rv, 0.55, 0.45));
      flows.style.opacity = (0.95 * late).toFixed(3);
      particles.style.opacity = late.toFixed(3);
      dots.style.opacity = late.toFixed(3);

      // ۳) تصاویر پروژه‌ها: ورود (بزرگ‌شدن از ۰٫۸۵) و خروج به سمت لبهٔ خودشان
      figs.forEach((f, i) => {
        const g = figGeo[i];
        if (!g) return;
        const r = easeOut(win(rv, g.inRank * 0.45, 0.55));
        const e = easeInOut(win(ex, g.outRank * 0.4, 0.6));
        const s = 0.85 + 0.15 * r + 0.12 * e;
        f.style.transform = `translate(${(g.x * e).toFixed(1)}px, ${(g.y * e).toFixed(1)}px) scale(${s.toFixed(3)})`;
        f.style.opacity = (r * (1 - clamp01((e - 0.7) / 0.3))).toFixed(3);
      });

      // ۴) کارت‌ها: سرتیتر، شهاب‌ها و دکمهٔ گوشه با --hd؛ هر کارت از سمت خودش
      const hd = easeOut(clamp01(cd / 0.35));
      root.style.setProperty("--hd", hd.toFixed(3));
      admin.classList.toggle("ready", hd > 0.5);
      if (hd > 0.02) startSky(); else stopSky();

      cards.forEach((c, i) => {
        const g = cardGeo[i];
        if (!g) return;
        const k = easeOut(win(cd, (i / (cards.length - 1)) * 0.5, 0.5));
        const st = cardState[i];
        const on = k > 0, settled = k >= 1;
        if (on !== st.on) { c.classList.toggle("on-stage", on); st.on = on; }
        if (settled !== st.settled) { c.classList.toggle("settled", settled); st.settled = settled; }
        c.style.translate = settled ? "0px 0px" : `${(g.x * (1 - k)).toFixed(1)}px ${(g.y * (1 - k)).toFixed(1)}px`;
        c.style.opacity = k.toFixed(3);
      });
    }

    /* ---------- اسکرول → داستان، با نرمی کوتاه ----------
       هر پلهٔ چرخ موس چند فریم جلو می‌رود؛ نرم‌کردنِ ۲۲٪ در هر فریم، پله را به حرکتی
       پیوسته تبدیل می‌کند و در کمتر از نیم‌ثانیه به جای واقعی اسکرول می‌رسد. */
    let target = 0, current = 0, raf = 0;

    function tick() {
      const d = target - current;
      if (Math.abs(d) < 0.4) {
        current = target;
        render(current);
        raf = 0;
        return;
      }
      current += d * 0.22;
      render(current);
      raf = requestAnimationFrame(tick);
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(tick); }

    function onScroll() {
      target = reduceMotion ? seg.total : Math.min(Math.max(window.scrollY, 0), seg.total);
      schedule();
    }

    /* ---------- راه‌اندازی ---------- */
    layout();
    sizeCanvas();
    measure();
    if (reduceMotion) current = target = seg.total;
    render(current);
    pump();

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* فونت که برسد، جای نهایی کارت‌ها و تصاویر کمی جابه‌جا می‌شود */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { measure(); render(current); });
    }

    let storyResize = null;
    window.addEventListener("resize", () => {
      clearTimeout(storyResize);
      storyResize = setTimeout(() => {
        layout();
        sizeCanvas();
        measure();
        onScroll();
        render(current);
      }, 150);
    }, { passive: true });
  }

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
