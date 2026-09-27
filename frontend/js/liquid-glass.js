/* ============================================================
   شیشهٔ مایعِ کارت‌ها — مشترکِ صفحهٔ اول و صفحهٔ ورود پشتیبانی
   ۱) نور فشار: از نقطهٔ لمس یا کلیک پخش می‌شود (--mx / --my برای ::after کارت).
   ۲) عدسیِ لبه (فقط کرومیوم دسکتاپ): فیلترِ داخل backdrop-filter شکل کارت را نمی‌شناسد
      و فقط تصویرِ پشت را می‌گیرد؛ نویزِ یکنواخت وسط کارت را هم به اندازهٔ لبه می‌لرزاند و
      شبیه موج گرما می‌شود نه شیشه. پس نقشهٔ جابه‌جایی را از خودِ طرح کارت (مستطیل
      گوشه‌گرد) می‌سازیم: در نواری کنار لبه پشتِ شیشه مثل لبهٔ عدسی بزرگ‌نمایی می‌شود و
      وسط صاف می‌ماند. برای هر اندازهٔ کارت یک فیلتر ساخته و با --lg-lens به کارت داده
      می‌شود؛ CSS فقط روی کارت‌های فعال (href دارند) به کارش می‌برد — هزینه در styles.css.
      سافاری و فایرفاکس SVG را در backdrop-filter اجرا نمی‌کنند و همان شیشهٔ کم‌بلورِ
      بدون خمش را می‌بینند — که طرح پایه است، نه حالت خراب.
   ============================================================ */
(function () {
  "use strict";

  const cards = Array.from(document.querySelectorAll(".card"));
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("pointerdown", (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
    }, { passive: true });
  });

  const isChromium = !!(navigator.userAgentData && navigator.userAgentData.brands.some((b) => b.brand === "Chromium"));
  const lensOK = isChromium &&
    window.matchMedia("(min-width: 901px)").matches &&
    window.CSS && CSS.supports("backdrop-filter", "url(#a) blur(1px)") &&
    !window.matchMedia("(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)").matches;
  if (!lensOK) return;

  const LENS_BAND = 0.16;  // پهنای نوار عدسی نسبت به ضلع کوتاه کارت
  const LENS_POWER = 1.7;  // تمرکز خمش روی خودِ لبه (۱ = پروفیل دایره‌ای)
  const LENS_SCALE = 1.5;  // شدت خمش نسبت به پهنای نوار؛ بیشینهٔ جابه‌جایی نصفِ این است

  function lensMap(w, h, r) {
    const band = Math.max(10, Math.round(Math.min(w, h) * LENS_BAND));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const img = g.createImageData(w, h);
    const px = img.data;
    const a = w / 2, b = h / 2;
    r = Math.min(r, a, b);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x + 0.5 - a, dy = y + 0.5 - b;
        const u = Math.abs(dx), v = Math.abs(dy);
        const qx = u - (a - r), qy = v - (b - r);
        let d, nx, ny; // d: فاصله تا لبه از داخل؛ (nx, ny): بردار یکهٔ رو به داخل
        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1;
          d = r - len;
          nx = (-Math.sign(dx) * qx) / len;
          ny = (-Math.sign(dy) * qy) / len;
        } else if (a - u < b - v) {
          d = a - u; nx = -Math.sign(dx); ny = 0;
        } else {
          d = b - v; nx = 0; ny = -Math.sign(dy);
        }
        const m = d > 0 && d < band ? Math.pow(1 - d / band, LENS_POWER) : 0;
        const i = (y * w + x) * 4;
        px[i] = Math.round(128 + 127 * m * nx);
        px[i + 1] = Math.round(128 + 127 * m * ny);
        px[i + 2] = 128;
        px[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { url: c.toDataURL("image/png"), scale: Math.round(band * LENS_SCALE) };
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
  document.body.appendChild(svg);

  const filters = new Map(); // «عرض×ارتفاع×گردی» ← شناسهٔ فیلتر
  let nextId = 0;
  function filterFor(w, h, r) {
    const key = `${w}x${h}x${r}`;
    if (filters.has(key)) return filters.get(key);
    const id = `lg-lens-${nextId++}`;
    const map = lensMap(w, h, r);
    svg.insertAdjacentHTML("beforeend",
      `<filter id="${id}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feImage href="${map.url}" preserveAspectRatio="none" result="map"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="map" scale="${map.scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`);
    filters.set(key, id);
    return id;
  }

  function refresh() {
    const used = new Set();
    for (const card of cards) {
      const w = card.offsetWidth, h = card.offsetHeight; // اندازهٔ چیدمان، بدون چرخش هاور
      if (!w || !h) continue;
      const r = Math.round(parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0);
      const id = filterFor(w, h, r);
      used.add(id);
      card.style.setProperty("--lg-lens", `url(#${id})`);
    }
    // نقشهٔ اندازه‌های قبلی (بعد از تغییر اندازهٔ پنجره) در حافظه نماند
    for (const [key, id] of filters) {
      if (used.has(id)) continue;
      filters.delete(key);
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  }

  refresh();
  let frame = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(refresh);
  });
  cards.forEach((card) => ro.observe(card));
})();
