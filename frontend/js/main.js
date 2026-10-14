/* ============================================================
   سامانه هوشمند آریانا — منطق صفحهٔ اول: «داستان اسکرولی» به سبک صفحه‌های اپل
   صفحه خودش پایین نمی‌رود؛ اسکرول کاربر (چرخ موس، لمس‌پد، کشیدن انگشت، کلید، نوار
   اسکرول) این‌ها را جلو و عقب می‌برد:
     ۱) ۱۴۹ فریم لوگوموشن روی بوم (assets/frames)، فریم‌به‌فریم با اسکرول
     ۲) روی آخرین فریم (کرهٔ زمین): عنوان؛ در دسکتاپ خطوط و تصاویر پروژه‌ها هم می‌آیند
     ۳) با ادامهٔ اسکرول عنوان بالا می‌رود؛ در دسکتاپ هر تصویر به سمت نزدیک‌ترین لبهٔ
        صفحه بیرون می‌رود و خطوط محو می‌شوند
     ۴) کارت‌های شیشه‌ای بخش‌ها هر کدام از گوشه/لبهٔ خودش می‌آید و وسط صفحه می‌نشیند
   پس‌زمینه در همهٔ این پرده‌ها همان کرهٔ زمین می‌ماند؛ برگشتِ اسکرول همه را عقب می‌برد.
   موبایل (≤ ۹۰۰px، «فشرده»): همان داستان با فریم‌های عمودی ۹:۱۶، بدون شهاب، بدون تصاویر
   و خطوط پروژه‌ها، و کارت‌ها به شکل کاشی‌های مربعی شیشه‌ای در شبکهٔ ۳×۳.
   ============================================================ */

(function () {
  "use strict";

  const overlay = document.getElementById("heroOverlay");
  const body = document.body;
  const cards = Array.from(document.querySelectorAll(".card"));

  const mqCompact = window.matchMedia("(max-width: 900px)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  /* صفحه همیشه از ابتدای داستان شروع می‌شود */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  /* پیشرفتِ محلی یک عضو در پنجرهٔ [start, start+width] از پیشرفت کل */
  const win = (p, start, width) => clamp01((p - start) / width);

  /* ============================================================
     چرخش سه‌بعدی ظریف + هالهٔ نور دنبال‌کنندهٔ نشانگر
     فقط با ماوس اجرا می‌شود؛ در لمس، pointermove هنگام اسکرول هم شلیک می‌کند
     و کارت‌ها را به‌صورت عرضی می‌لرزاند
     ============================================================ */
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  /* GSAP (vendor/gsap-*.min.js، مهر ۱۴۰۵) بعد از اولین فریم و بی مسدود کردنِ چیزی بار می‌شود (loadMotion پایین)؛ از آن به بعد چرخش و
     بلند شدن با gsap.quickTo نرم و پیوسته دنبالِ نشانگر می‌روند و با رفتنِ نشانگر نرم به صفر برمی‌گردند (قبلاً هر pointermove مستقیم
     transform می‌نوشت و خروج یک‌باره می‌پرید). تا رسیدنش، یا اگر نرسید، همان رفتارِ قبلی. */
  let G = window.gsap || null;
  let storyUpgrade = null;

  if (!reduceMotion && finePointer) {
    const MAX_TILT = 7; // درجه
    const quick = (card) => {
      const q = { duration: 0.55, ease: "power3.out" };
      /* quickTo فقط یک ویژگیِ تک می‌گیرد؛ scale نامِ مستعارِ دو ویژگی است، پس scaleX و scaleY جدا */
      const sx = G.quickTo(card, "scaleX", q), sy = G.quickTo(card, "scaleY", q);
      return { rx: G.quickTo(card, "rotationX", q), ry: G.quickTo(card, "rotationY", q), y: G.quickTo(card, "y", q), s: (v) => { sx(v); sy(v); } };
    };

    cards.forEach((card) => {
      let to = null;

      card.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || mqCompact.matches) return;
        if (!to && G) to = quick(card);

        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;   // 0..1
        const py = (e.clientY - rect.top) / rect.height;   // 0..1

        const rotY = (px - 0.5) * MAX_TILT * 2 * -1;
        const rotX = (py - 0.5) * MAX_TILT * 2;

        if (to) {
          to.rx(rotX); to.ry(rotY); to.y(-8); to.s(1.02);
        } else {
          card.style.transform = `translateY(-8px) scale(1.02) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
        }
        card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      });

      /* برگشت با همان quickTo به صفر (همان «none»ِ CSS)؛ clearProps وسطِ این tweenها کشِ GSAP را می‌پراند و کارت نیمه‌راه می‌ماند */
      card.addEventListener("pointerleave", () => {
        if (!to) { card.style.transform = ""; return; }
        to.rx(0); to.ry(0); to.y(0); to.s(1);
      });
    });
  }

  /* ============================================================
     شهاب‌ها — فقط دسکتاپ و فقط در پردهٔ کارت‌ها، پشتِ شیشهٔ کارت‌ها؛ ستارهٔ ثابت
     نمی‌کشیم چون پس‌زمینه خودِ کرهٔ زمین است. موبایل شهاب ندارد.
     ============================================================ */
  const skyCanvas = document.getElementById("starfield");
  const sky = skyCanvas.getContext("2d");
  let meteors = [];
  let skyRaf = null;

  function resizeSky() {
    const rect = skyCanvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    skyCanvas.width = rect.width * dpr;
    skyCanvas.height = rect.height * dpr;
    sky.setTransform(dpr, 0, 0, dpr, 0, 0);
    skyCanvas._w = rect.width;
    skyCanvas._h = rect.height;
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
  const MAX_METEORS = 45;

  function drawSky() {
    sky.clearRect(0, 0, skyCanvas._w, skyCanvas._h);

    // زمان‌بندی پرتراکم شهاب‌ها — دسته‌ای و مکرر برای جلوهٔ کهکشانی پرجنب‌وجوش‌تر
    if (--nextMeteorIn <= 0 && meteors.length < MAX_METEORS) {
      const burst = 1 + Math.floor(Math.random() * 3); // ۱ تا ۳ شهاب هم‌زمان
      for (let i = 0; i < burst; i++) spawnMeteor();
      nextMeteorIn = 8 + Math.random() * 26;
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
  function stopSky() {
    if (skyRaf) { cancelAnimationFrame(skyRaf); skyRaf = null; }
    if (meteors.length) { meteors = []; sky.clearRect(0, 0, skyCanvas._w, skyCanvas._h); }
  }

  scrollStory();

  /* ============================================================
     داستان اسکرولی
     مسیر اسکرول (px) بر حسب ارتفاع پنجره تقسیم می‌شود:
       video → reveal → hold → exit → cards → tail
     پیشرفتِ هر پرده از جای اسکرول درمی‌آید و روی عنصرها نوشته می‌شود؛ هیچ چیز
     زمان‌محور نیست، پس عقب‌رفتن اسکرول همه‌چیز را دقیقاً برمی‌گرداند.
     ============================================================ */
  function scrollStory() {
    body.classList.remove("is-pre-play");
    overlay.classList.add("visible");
    overlay.setAttribute("aria-hidden", "false");

    const hero = document.getElementById("hero");
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

    let compact = mqCompact.matches;

    /* ---------- فریم‌های لوگوموشن ----------
       ۱۴۹ فریم WebP، هر کدام یک بار از ویدیوی باکیفیت نمونه‌برداری و یک بار فشرده شده:
         افقی (land) از نسخهٔ 4K ۱۶:۹ — دسکتاپ، تبلت و گوشیِ افقی
           1600/  (~۸۹KB، ۱۲٫۹MB) برای همه
           2560/  (~۱۴۹KB، ۲۱٫۷MB) صفحهٔ پرتراکم یا پهن‌تر از ۱۹۲۰، روی اتصال سریع
         عمودی (port) — گوشی و تبلتِ عمودی (مهر ۱۴۰۵): فریم‌های ۰ تا ۷۳ با «دوربینِ مجازی» روی فریم‌های افقی
         ساخته شده‌اند تا نشان و نامِ کاملِ «شرکت تونل سد آریانا» وسطِ صفحه دیده شود (ویدیوی عمودی نام را بریده بود)
         و بیرونِ قاب با ادامهٔ رنگِ سحابی و ستاره پر شده؛ دوربین تا فریم ۷۰ به همان قابِ ویدیوی عمودی می‌رسد و از ۷۴
         به بعد همان فریم‌های ۹:۱۶ قبلی است (ساخت: scripts/home-frames/render-mobile.mjs)
           p720/   برای همه
           p1080/  صفحهٔ با تراکم ۲ به بالا، اتصال سریع، حافظهٔ دستگاه ۴GB به بالا (یا نامعلوم)
       ترتیب بارگذاری درشت‌به‌ریز است (فریم ۰ و آخر، بعد هر ۸تا، هر ۴تا، هر ۲تا، بعد بقیه)
       تا از همان ثانیه‌های اول اسکرول جواب بدهد. مجموعهٔ تیزتر فقط بعد از رسیدن کل مجموعهٔ
       پایه بارگذاری می‌شود و هر فریمش که رسید جای نسخهٔ پایه می‌نشیند (و نسخهٔ پایه رها
       می‌شود تا حافظه دو برابر نشود). «صرفه‌جویی داده» یا 2g: نیمی از فریم‌ها، بدون مجموعهٔ تیز.
       بین دو فریم همسایه ترکیب نرم (crossfade) کشیده می‌شود تا اسکرول آهسته پله‌پله نباشد. */
    const FRAMES = 149;
    const dpr = window.devicePixelRatio || 1;
    const conn = navigator.connection;
    const slowNet = !!(conn && (conn.saveData || /2g$/.test(conn.effectiveType || "")));
    const fastNet = !conn || !conn.effectiveType || conn.effectiveType === "4g";
    const memOK = !navigator.deviceMemory || navigator.deviceMemory >= 4;
    const makeGroup = (dirs) => ({ dirs, imgs: dirs.map(() => new Array(FRAMES).fill(null)), setIdx: 0, cursor: 0 });
    const GROUPS = {
      land: makeGroup(["1600"].concat((dpr > 1.25 || window.innerWidth > 1920) && !slowNet && fastNet ? ["2560"] : [])),
      port: makeGroup(["p720"].concat(dpr >= 2 && !slowNet && fastNet && memOK ? ["p1080"] : [])),
    };
    /* نسخهٔ فریم‌های عمودی: با هر بازسازیِ p720/p1080 بالا برود (همین نشانی در index.html و پیش‌کشِ sw.js) —
       sw فریم‌ها را بی بازبینی از کش می‌دهد، پس نشانیِ تازه تنها راهِ رسیدنِ فریمِ تازه به گوشی‌ای است که قبلاً دیده */
    GROUPS.port.q = "?v=2";
    const pickGroup = () => GROUPS[compact && window.innerHeight > window.innerWidth ? "port" : "land"];
    let group = pickGroup();

    const order = [];
    {
      const seen = new Set();
      const push = (i) => { if (!seen.has(i)) { seen.add(i); order.push(i); } };
      push(0); push(FRAMES - 1);
      for (const step of [8, 4, 2, 1]) for (let i = 0; i < FRAMES; i += step) push(i);
    }
    let inflight = 0;

    function pump() {
      const g = group;
      while (inflight < 6) {
        if (g.cursor >= order.length) {
          if (g.setIdx + 1 < g.dirs.length) { g.setIdx++; g.cursor = 0; continue; }
          return;
        }
        const k = g.setIdx;
        const i = order[g.cursor++];
        if (slowNet && i % 2 === 1) continue;
        if (g.imgs[k][i]) continue;
        const im = new Image();
        im.decoding = "async";
        inflight++;
        im.onload = () => {
          inflight--;
          if (g.imgs[k]) {
            g.imgs[k][i] = im;
            for (let j = 0; j < k; j++) g.imgs[j][i] = null; // نسخهٔ پایهٔ همین فریم دیگر لازم نیست
          }
          if (g === group) schedule();
          pump();
        };
        im.onerror = () => { inflight--; pump(); };
        im.src = `assets/frames/${g.dirs[k]}/logo-${String(i).padStart(3, "0")}.webp${g.q || ""}`;
      }
    }

    /* چرخش گوشی/تبلت: مجموعهٔ جهت دیگر؛ تصویرهای جهت قبلی رها می‌شوند (از کش HTTP برمی‌گردند) */
    function switchGroup() {
      const g = pickGroup();
      if (g === group) return;
      group.imgs.forEach((a) => a.fill(null));
      group.setIdx = 0; group.cursor = 0;
      group = g;
      drawnKey = "";
      pump();
    }

    /* تیزترین نسخهٔ موجودِ یک فریم */
    function best(i) {
      const s = group.imgs;
      for (let k = s.length - 1; k >= 0; k--) if (s[k][i]) return s[k][i];
      return null;
    }

    function nearestLoaded(i) {
      if (best(i)) return i;
      for (let d = 1; d < FRAMES; d++) {
        if (i - d >= 0 && best(i - d)) return i - d;
        if (i + d < FRAMES && best(i + d)) return i + d;
      }
      return -1;
    }

    let cw = 0, ch = 0, drawnKey = "";

    /* اندازهٔ بوم از خودِ قاب قهرمان (در گوشی ۱۰۰lvh، یعنی قدِ پنجره با نوار آدرسِ جمع‌شده)،
       تا با جمع و باز شدن نوار آدرس بوم عوض نشود و نوار خالی نیفتد */
    function sizeCanvas() {
      const r = Math.min(dpr, 2);
      cw = hero.clientWidth || window.innerWidth;
      ch = hero.clientHeight || window.innerHeight;
      frameCanvas.width = Math.round(cw * r);
      frameCanvas.height = Math.round(ch * r);
      fctx.setTransform(r, 0, 0, r, 0, 0);
      drawnKey = "";
    }

    /* مثل object-fit: cover، تا نقاط جغرافیایی خطوط (کالیبره روی همان قاب) سر جایشان بمانند.
       فریم‌های عمودی ۹:۱۶ روی گوشیِ باریک‌تر (مثلاً ۴۳۰×۹۳۲) از دو طرف بریده می‌شوند — از وسط، چون نشان و نام در
       فریم‌های p720/p1080 وسطِ قاب‌اند و طوری اندازه شده‌اند که روی گوشیِ ۱۹٫۵:۹ هم با حاشیه جا شوند */
    function drawCover(im, alpha) {
      const s = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
      const w = im.naturalWidth * s, h = im.naturalHeight * s;
      const ax = 0.5;
      fctx.globalAlpha = alpha;
      fctx.drawImage(im, (cw - w) * ax, (ch - h) / 2, w, h);
      fctx.globalAlpha = 1;
    }

    /* فریم i و، اگر هر دو موجود باشند، فریم بعدی با شفافیت frac رویش — ترکیب نرم بین دو فریم.
       ترکیب یعنی دو بار کشیدن؛ اگر روی این دستگاه کشیدن کند باشد (میانگین متحرک بالای ۱۸ms)،
       ترکیب خاموش می‌شود و فقط نزدیک‌ترین فریم کشیده می‌شود تا اسکرول لَخت نشود. */
    let paintAvg = 0, blendOK = true, firstPaint = false;
    function paintFrames(i, frac) {
      const a = nearestLoaded(i);
      if (a < 0) return;
      const b = blendOK && a === i && frac > 0.04 && i + 1 < FRAMES && best(i + 1) ? i + 1 : -1;
      const ia = best(a), ib = b >= 0 ? best(b) : null;
      const key = `${a}:${ia.naturalWidth}:${b}:${ib ? ib.naturalWidth : 0}:${ib ? frac.toFixed(2) : ""}`;
      if (key === drawnKey) return;
      const t0 = performance.now();
      drawCover(ia, 1);
      if (ib) drawCover(ib, frac);
      drawnKey = key;
      if (!firstPaint) {
        firstPaint = true;
        /* صفحهٔ «در حال بارگذاری» گوشی کنار می‌رود (index.html، tools/build-boot-splash.mjs)؛ سرویس‌ورکر کمی بعد ثبت می‌شود */
        if (window.__bootDone) window.__bootDone();
        setTimeout(startSW, 3000);
        /* کتابخانه‌های حرکت حالا، نه پیش از اولین فریم (روی گوشیِ کند اولین تصویر را ثانیه‌ها عقب می‌انداختند) */
        loadMotion();
      }
      paintAvg = paintAvg * 0.8 + (performance.now() - t0) * 0.2;
      if (paintAvg > 18) blendOK = false;
      // فریم‌های همسایه را از قبل رمزگشایی کن تا اسکرول بعدی بی‌مکث باشد
      for (let d = 1; d <= 4; d++) {
        for (const j of [i + d, i - d]) {
          const m = best(j);
          if (m && m.decode) m.decode().catch(() => {});
        }
      }
    }

    /* ---------- مسیر اسکرول ---------- */
    let seg = null;

    function layout() {
      const H = window.innerHeight;
      /* گوشی پردهٔ تصاویر پروژه‌ها ندارد، پس ظهور و خروج کوتاه‌ترند */
      seg = compact
        ? { video: 2.4 * H, reveal: 0.35 * H, hold: 0.1 * H, exit: 0.45 * H, cards: 1.0 * H, tail: 0.15 * H }
        : { video: 2.8 * H, reveal: 0.55 * H, hold: 0.2 * H, exit: 0.75 * H, cards: 1.05 * H, tail: 0.15 * H };
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
        const t = Math.min(tx, ty) + (compact ? 40 : 80);
        return { x: dx * t, y: dy * t, dist: len };
      };
      cards.forEach((c) => { c.style.translate = "0px 0px"; c.classList.remove("settled"); });
      cardState.forEach((s) => { s.settled = false; });
      cardGeo = cards.map((c) => vec(c.getBoundingClientRect()));

      if (compact) { figGeo = []; return; }
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

      // ۱) لوگوموشن: فریم (و کسرِ بین دو فریم) از روی جای اسکرول
      const pv = clamp01(pos / seg.video);
      const f = pv * (FRAMES - 1);
      let fi = Math.floor(f), frac = f - fi;
      if (frac > 0.96 && fi + 1 < FRAMES) { fi++; frac = 0; }
      paintFrames(fi, frac);

      // پیشرفتِ پرده‌های بعدی
      const rv = clamp01((pos - seg.video) / seg.reveal);
      const ex = clamp01((pos - seg.video - seg.reveal - seg.hold) / seg.exit);
      const cd = clamp01((pos - seg.video - seg.reveal - seg.hold - seg.exit) / seg.cards);

      overlay.style.setProperty("--rv", rv.toFixed(3));

      // ۲) عنوان: با پرده می‌آید، در خروج به بالا می‌رود
      const tv = easeOut(rv), tx = easeInOut(ex);
      title.style.opacity = (tv * (1 - tx)).toFixed(3);
      title.style.transform = `translateY(${(24 * (1 - tv) - (compact ? 0.3 : 0.45) * H * tx).toFixed(1)}px)`;

      if (!compact) {
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
        figs.forEach((fig, i) => {
          const g = figGeo[i];
          if (!g) return;
          const r = easeOut(win(rv, g.inRank * 0.45, 0.55));
          const e = easeInOut(win(ex, g.outRank * 0.4, 0.6));
          const s = 0.85 + 0.15 * r + 0.12 * e;
          fig.style.transform = `translate(${(g.x * e).toFixed(1)}px, ${(g.y * e).toFixed(1)}px) scale(${s.toFixed(3)})`;
          fig.style.opacity = (r * (1 - clamp01((e - 0.7) / 0.3))).toFixed(3);
        });
      }

      // ۴) کارت‌ها: سرتیتر، لایهٔ تیره، شهاب‌ها (فقط دسکتاپ) و دکمهٔ گوشه با --hd؛ هر کارت از سمت خودش
      const hd = easeOut(clamp01(cd / 0.35));
      root.style.setProperty("--hd", hd.toFixed(3));
      admin.classList.toggle("ready", hd > 0.5);
      if (!compact && hd > 0.02) startSky(); else stopSky();

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
       پیوسته تبدیل می‌کند و در کمتر از نیم‌ثانیه به جای واقعی اسکرول می‌رسد. در لمس، خودِ
       اسکرولِ مرورگر نرم است؛ نرمیِ کمتر (۳۵٪) تا انگشت و تصویر از هم جدا نیفتند. */
    let target = 0, current = 0, raf = 0;
    const ease = coarse ? 0.35 : 0.22;
    /* موتورِ اسکرول (مهر ۱۴۰۵، DESIGN_STACK): GSAP ScrollTrigger — یک ماشهٔ scrub روی کلِ مسیر — و Lenis برای نرمیِ چرخ موس و
       لمس‌پد در دسکتاپ، به همان الگوی رسمیِ README لنیس (lenis.on("scroll", ScrollTrigger.update) و raf از تیکرِ GSAP).
       در لمس، اسکرولِ خودِ مرورگر می‌ماند (Lenis خاموش، syncTouch پیش‌فرض) و scrubِ کوتاه تا انگشت و تصویر از هم جدا نیفتند.
       render() و پرده‌ها دست‌نخورده‌اند؛ فقط این‌که «کجای مسیریم» از کجا می‌آید. صفحه با همان نرمیِ دستیِ قبلی شروع می‌کند و وقتی
       کتابخانه‌ها (بعد از اولین فریم، loadMotion) رسیدند، upgrade() بی پرش موتور را عوض می‌کند. نرسیدند یا «حرکت کمتر» ← همان قبلی. */
    let GS = false;
    let lenis = null;

    function tick() {
      const d = target - current;
      if (Math.abs(d) < 0.4) {
        current = target;
        render(current);
        raf = 0;
        return;
      }
      current += d * ease;
      render(current);
      raf = requestAnimationFrame(tick);
    }

    /* رسمِ دوباره در همان جای مسیر (فریمِ تازه رسید، اندازه عوض شد)؛ با GSAP جای مسیر را خودِ ماشه می‌دهد */
    function schedule() {
      if (GS) { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(current); }); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function onScroll() {
      target = reduceMotion ? seg.total : Math.min(Math.max(window.scrollY, 0), seg.total);
      schedule();
    }

    function startEngine() {
      const ST = window.ScrollTrigger;
      G.registerPlugin(ST);
      /* نوار آدرسِ گوشی که جمع و باز می‌شود مسیر را از نو نمی‌سازد (همان قاعدهٔ resize پایین) */
      ST.config({ ignoreMobileResize: true });
      if (!coarse && window.Lenis) {
        lenis = new window.Lenis({
          lerp: 0.12,
          smoothWheel: true,
          /* پنجرهٔ وضعیتِ بخش‌ها (js/support.js) اسکرولِ خودش را دارد؛ چرخِ موس روی آن نباید صفحه را ببرد */
          prevent: (n) => !!(n && n.classList && (n.classList.contains("sp-bg") || n.classList.contains("sp-box"))),
        });
        lenis.on("scroll", ST.update);
        G.ticker.add((t) => { lenis.raf(t * 1000); });
        G.ticker.lagSmoothing(0);
        smoothKeys();
      }
      const story = { p: 0 };
      G.to(story, {
        p: 1,
        ease: "none",
        /* بی رسمِ تنبل: پرشِ اسکرول (کلیدِ End، نوار اسکرول، پیش از اولین تیک) همان لحظه رسم شود، نه در تیکِ بعد */
        lazy: false,
        scrollTrigger: { start: 0, end: () => seg.total, scrub: lenis ? true : 0.12, invalidateOnRefresh: true },
        onUpdate: () => { current = story.p * seg.total; render(current); },
      });
      /* refresh (رویدادِ load، تغییرِ اندازه) پیشرفت را بی رویداد عوض می‌کند — onUpdate صدا نمی‌خورد؛ این‌جا همان را رسم می‌کنیم */
      ST.addEventListener("refresh", () => { current = story.p * seg.total; render(current); });
    }

    /* کلیدها (پیکان، Page Up/Down، فاصله، Home/End) با Lenis نرم می‌روند — مثل نرمیِ دستیِ قبلی که کلید را هم نرم می‌کرد */
    function smoothKeys() {
      const STEP = { ArrowDown: 80, ArrowUp: -80 };
      window.addEventListener("keydown", (e) => {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
        if (document.querySelector(".sp-bg")) return;
        const H = window.innerHeight, cur = lenis.targetScroll;
        let to = null;
        if (e.key in STEP) to = cur + STEP[e.key];
        else if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) to = cur + H * 0.9;
        else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) to = cur - H * 0.9;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = lenis.limit;
        if (to === null) return;
        e.preventDefault();
        lenis.scrollTo(Math.max(0, Math.min(to, lenis.limit)), { duration: 0.7 });
      });
    }

    /* ---------- راه‌اندازی ---------- */
    layout();
    sizeCanvas();
    resizeSky();
    measure();
    if (reduceMotion) current = target = seg.total;
    render(current);
    pump();

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* کتابخانه‌ها رسیدند: موتورِ دستی کنار می‌رود و ScrollTrigger (+ Lenis در دسکتاپ) از همان جای اسکرول ادامه می‌دهد */
    storyUpgrade = () => {
      if (GS || reduceMotion || !window.gsap || !window.ScrollTrigger) return;
      G = window.gsap;
      window.removeEventListener("scroll", onScroll);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      GS = true;
      startEngine();
    };
    if (window.gsap && window.ScrollTrigger) storyUpgrade();

    /* فونت که برسد، جای نهایی کارت‌ها و تصاویر کمی جابه‌جا می‌شود */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { measure(); render(current); });
    }

    /* تغییر اندازه: در گوشی، جمع و باز شدن نوار آدرس فقط ارتفاع را کمی عوض می‌کند؛ آن را
       نادیده می‌گیریم تا مسیر اسکرول زیر انگشت جابه‌جا نشود. چرخش گوشی (عرض عوض می‌شود)
       همه‌چیز را از نو می‌چیند و مجموعهٔ فریمِ همان جهت را می‌آورد. */
    let lastW = window.innerWidth, lastH = window.innerHeight, storyResize = null;
    window.addEventListener("resize", () => {
      clearTimeout(storyResize);
      storyResize = setTimeout(() => {
        const w = window.innerWidth, h = window.innerHeight;
        if (coarse && w === lastW && Math.abs(h - lastH) < 160) return;
        lastW = w; lastH = h;
        compact = mqCompact.matches;
        switchGroup();
        layout();
        sizeCanvas();
        resizeSky();
        measure();
        if (GS) window.ScrollTrigger.refresh(); else onScroll();
        render(current);
      }, 150);
    }, { passive: true });
  }

  /* ============================================================
     ثبت سرویس‌ورکر PWA — فقط روی http/https (نه file://)
     سه ثانیه پس از اولین فریم (یا load، هر کدام زودتر). load تا رسیدنِ همهٔ فریم‌ها (روی گوشی ۹ تا ۲۳ مگابایت)
     نمی‌آمد و روی اینترنتِ کند سرویس‌ورکر عملاً ثبت نمی‌شد؛ بی آن، هر بازدید همهٔ فریم‌ها را دوباره بازبینی می‌کرد.
     ============================================================ */
  function startSW() {
    if (startSW.done || !("serviceWorker" in navigator) || location.protocol.indexOf("http") !== 0) return;
    startSW.done = true;
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* ثبت ناموفق — سایت بدون قابلیت آفلاین ادامه می‌دهد */
    });
  }
  window.addEventListener("load", startSW);

  /* ============================================================
     کتابخانه‌های حرکت (vendor/، DESIGN_STACK): GSAP، ScrollTrigger و Lenis — بعد از اولین فریم (یا load)، بی مسدود کردنِ پارسر؛
     async=false یعنی به همان ترتیب اجرا می‌شوند (ScrollTrigger بعد از GSAP). «حرکت کمتر» ← اصلاً بار نمی‌شوند.
     ============================================================ */
  function loadMotion() {
    if (loadMotion.done || reduceMotion) return;
    loadMotion.done = true;
    const srcs = ["vendor/gsap-3.15.0.min.js", "vendor/ScrollTrigger-3.15.0.min.js", "vendor/lenis-1.3.26.min.js"];
    let left = srcs.length;
    const ready = () => {
      if (--left) return;
      G = window.gsap || null;
      if (storyUpgrade) storyUpgrade();
    };
    srcs.forEach((src) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = ready;
      s.onerror = ready;
      document.head.appendChild(s);
    });
  }
  window.addEventListener("load", loadMotion);
})();
