/* ترکیبِ فریمِ عمودی از فریمِ افقی با «دوربینِ مجازی» — در صفحهٔ مرورگر (canvas) اجرا می‌شود.
   L: تصویر افقی ۱۶:۹، P: تصویر عمودیِ همان لحظه (برای ترکیب در انتهای مسیر)، cam: {wf, cx, cy, mix}
   wf = پهنای پنجره به نسبتِ پهنای فریم افقی؛ پنجرهٔ ۹:۱۶. wf=0.3162 و cx=0.397 دقیقاً همان فریم عمودی است. */
window.composeFrame = function (out, L, P, cam, mode) {
  const OW = out.width, OH = out.height, ctx = out.getContext("2d");
  const LW = L.naturalWidth || L.width, LH = L.naturalHeight || L.height;
  const ww = cam.wf * LW, k = OW / ww;                         // مقیاسِ فریم افقی روی خروجی
  const fw = LW * k, fh = LH * k;                               // اندازهٔ فریم افقی روی خروجی
  const fx = OW / 2 - cam.cx * fw, fy = OH / 2 - cam.cy * fh;   // جای گوشهٔ بالا-چپ
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#04060f"; ctx.fillRect(0, 0, OW, OH);
  const gapTop = Math.max(0, fy), gapBot = Math.max(0, OH - (fy + fh));
  if (gapTop > 0.5 || gapBot > 0.5) {
    const blurPx = Math.round(OW * 0.035);
    if (mode === "mirror") {
      /* بازتابِ آینه‌ای بالا و پایین، تار و کمی تیره: رنگِ سحابی بیرون از قاب ادامه پیدا می‌کند */
      ctx.filter = `blur(${blurPx}px) saturate(1.1)`;
      ctx.save(); ctx.translate(0, fy); ctx.scale(1, -1); ctx.drawImage(L, fx, 0, fw, fh); ctx.restore();
      ctx.save(); ctx.translate(0, fy + fh * 2); ctx.scale(1, -1); ctx.drawImage(L, fx, 0, fw, fh); ctx.restore();
      ctx.filter = "none";
    } else if (mode === "echo") {
      /* ۱) پایه: ادامهٔ رنگِ لبه‌ها (بی‌درز) */
      const sh = Math.max(2, Math.round(LH * 0.03)), ov = Math.round(OW * 0.02);
      const tiny = window.__tiny || (window.__tiny = document.createElement("canvas")); tiny.width = 48; tiny.height = 2;
      const tx = tiny.getContext("2d"); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
      const stretch = (sy, dy, dh) => { tx.clearRect(0, 0, 48, 2); tx.drawImage(L, 0, sy, LW, sh, 0, 0, 48, 2);
        ctx.filter = `blur(${blurPx}px)`; ctx.drawImage(tiny, 0, 0, 48, 2, fx - fw * 0.04, dy, fw * 1.08, dh); ctx.filter = "none"; };
      if (gapTop > 0.5) stretch(0, -ov, fy + sh * k + ov);
      if (gapBot > 0.5) stretch(LH - sh, fy + fh - sh * k, OH - (fy + fh) + sh * k + ov);
      /* ۲) پژواک: همان فریم، بزرگ‌تر حولِ مرکزِ قاب تا کلِ ارتفاع را بپوشد، نرم و کمی تیره؛ امتدادِ قطریِ سحابی
            (نارنجیِ پایین-چپ، آبیِ بالا-راست) بیرونِ قاب ادامه پیدا می‌کند. فقط در فاصله‌های بالا و پایین */
      const se = Math.max(1, (OH * 1.02) / fh), ew = fw * se, eh = fh * se, ecx = fx + fw * 0.5, ecy = fy + fh * 0.5;
      ctx.save();
      ctx.beginPath(); if (gapTop > 0.5) ctx.rect(0, 0, OW, fy + fh * 0.25); if (gapBot > 0.5) ctx.rect(0, fy + fh * 0.75, OW, OH); ctx.clip();
      ctx.filter = `blur(${Math.round(OW * 0.022)}px) saturate(1.12) brightness(0.92)`;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(window.__plate || L, ecx - ew / 2, ecy - eh / 2, ew, eh);
      ctx.filter = "none"; ctx.globalAlpha = 1;
      ctx.restore();
      /* ۳) ستاره‌ها: بیشتر و چند تای درخشان با هاله، بسته به مختصاتِ فریم */
      const stars = window.__stars2 || (window.__stars2 = (() => { let z = 7654321; const r = () => ((z = (z * 16807) % 2147483647) / 2147483647);
        const a = []; for (let i = 0; i < 420; i++) { const top = r() < 0.5; a.push({ u: r() * 1.5 - 0.25, v: top ? -r() * 1.0 : 1 + r() * 1.0, s: 0.35 + r() * r() * 1.5, o: 0.3 + r() * 0.6, g: r() < 0.035 }); } return a; })());
      for (const st of stars) {
        const x = fx + st.u * fw, y = fy + st.v * fh;
        if (x < -10 || x > OW + 10 || y < -10 || y > OH + 10) continue;
        const fade = st.v < 0 ? Math.min(1, -st.v * 5) : Math.min(1, (st.v - 1) * 5);
        const rr = st.s * OW / 1080;
        if (st.g) {
          const gr = ctx.createRadialGradient(x, y, 0, x, y, rr * 9); gr.addColorStop(0, `rgba(190,215,255,${0.55 * fade})`); gr.addColorStop(1, "rgba(190,215,255,0)");
          ctx.fillStyle = gr; ctx.fillRect(x - rr * 9, y - rr * 9, rr * 18, rr * 18);
        }
        ctx.globalAlpha = st.o * fade; ctx.fillStyle = "#e6eeff";
        ctx.beginPath(); ctx.arc(x, y, rr * (st.g ? 1.6 : 1), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (mode === "stretch") {
      /* ادامهٔ رنگِ لبه‌ها: نوار باریکِ لبهٔ بالا/پایینِ همان فریم کشیده و تار می‌شود — مرز بی‌درز است، بی آینه */
      /* نوارِ لبه اول در بومی خیلی کوچک (۴۸×۲) خلاصه می‌شود و بعد با درون‌یابیِ نرم کشیده: رنگ‌ها پیوسته‌اند و رگهٔ عمودی نمی‌ماند */
      const sh = Math.max(2, Math.round(LH * 0.03)), ov = Math.round(OW * 0.02);
      const tiny = window.__tiny || (window.__tiny = document.createElement("canvas")); tiny.width = 48; tiny.height = 2;
      const tx = tiny.getContext("2d"); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
      const stretch = (sy, dy, dh) => { tx.clearRect(0, 0, 48, 2); tx.drawImage(L, 0, sy, LW, sh, 0, 0, 48, 2);
        ctx.filter = `blur(${blurPx}px)`; ctx.drawImage(tiny, 0, 0, 48, 2, fx - fw * 0.04, dy, fw * 1.08, dh); ctx.filter = "none"; };
      if (gapTop > 0.5) stretch(0, -ov, fy + sh * k + ov);
      if (gapBot > 0.5) stretch(LH - sh, fy + fh - sh * k, OH - (fy + fh) + sh * k + ov);
      /* ستاره‌ها در فضای بیرونِ قاب، به مختصاتِ فریم بسته‌اند (با دوربین جلو و عقب می‌روند) */
      const stars = window.__stars || (window.__stars = (() => { let z = 1234567; const r = () => ((z = (z * 16807) % 2147483647) / 2147483647);
        const a = []; for (let i = 0; i < 260; i++) { const top = r() < 0.5; a.push({ u: r() * 1.4 - 0.2, v: top ? -r() * 0.9 : 1 + r() * 0.9, s: 0.4 + r() * r() * 1.6, o: 0.35 + r() * 0.6 }); } return a; })());
      for (const st of stars) {
        const x = fx + st.u * fw, y = fy + st.v * fh;
        if (x < -4 || x > OW + 4 || y < -4 || y > OH + 4) continue;
        const fade = st.v < 0 ? Math.min(1, -st.v * 6) : Math.min(1, (st.v - 1) * 6);
        ctx.globalAlpha = st.o * fade; ctx.fillStyle = "#dfe8ff";
        ctx.beginPath(); ctx.arc(x, y, st.s * OW / 1080, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      /* زمینهٔ تارِ بزرگ: همان فریم با پوششِ کامل */
      const s2 = Math.max(OW / LW, OH / LH) * 1.05, w2 = LW * s2, h2 = LH * s2;
      ctx.filter = `blur(${blurPx * 1.6}px) saturate(1.15)`;
      ctx.drawImage(L, OW / 2 - cam.cx * w2, OH / 2 - cam.cy * h2, w2, h2);
      ctx.filter = "none";
    }
    /* تیرگیِ ملایم به سمت لبه‌های بالا و پایینِ صفحه */
    const edgeDark = mode === "echo" ? 0.42 : 0.62;
    const g1 = ctx.createLinearGradient(0, 0, 0, gapTop); g1.addColorStop(0, `rgba(3,5,14,${edgeDark})`); g1.addColorStop(1, "rgba(3,5,14,0.0)");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, OW, gapTop);
    const g2 = ctx.createLinearGradient(0, OH - gapBot, 0, OH); g2.addColorStop(0, "rgba(3,5,14,0.0)"); g2.addColorStop(1, `rgba(3,5,14,${edgeDark})`);
    ctx.fillStyle = g2; ctx.fillRect(0, OH - gapBot, OW, gapBot);
  }
  /* فریمِ تیز با لبه‌های نرم (بالا و پایین) */
  const feather = mode === "echo" ? fh * 0.2 : Math.min(fh * 0.16, OH * 0.06);
  /* پرِ لبه با کوچک شدنِ فاصله کوچک می‌شود تا وقتی دوربین به قابِ کامل رسید، لبه یک‌باره سفت نشود */
  const fTop = Math.min(feather, gapTop * 1.6), fBot = Math.min(feather, gapBot * 1.6);
  const tmp = window.__tmp || (window.__tmp = document.createElement("canvas"));
  tmp.width = OW; tmp.height = OH;
  const t = tmp.getContext("2d"); t.clearRect(0, 0, OW, OH);
  t.imageSmoothingEnabled = true; t.imageSmoothingQuality = "high";
  t.drawImage(L, fx, fy, fw, fh);
  if (gapTop > 0.5 || gapBot > 0.5) {
    t.globalCompositeOperation = "destination-in";
    const gm = t.createLinearGradient(0, fy, 0, fy + fh);
    const a = gapTop > 0.5 ? fTop / fh : 0, b = gapBot > 0.5 ? fBot / fh : 0;
    gm.addColorStop(0, gapTop > 0.5 ? "rgba(0,0,0,0)" : "#000"); gm.addColorStop(a, "#000"); gm.addColorStop(1 - b, "#000"); gm.addColorStop(1, gapBot > 0.5 ? "rgba(0,0,0,0)" : "#000");
    t.fillStyle = gm; t.fillRect(0, 0, OW, OH);
    t.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(tmp, 0, 0);
  /* انتهای مسیر: فریمِ عمودیِ اصلی (همان پنجره) رویش محو می‌شود */
  if (P && cam.mix > 0) { ctx.globalAlpha = cam.mix; ctx.drawImage(P, 0, 0, OW, OH); ctx.globalAlpha = 1; }
  ctx.restore();
};

/* پس‌زمینهٔ ثابتِ پژواک: فریمِ ۰ کوچک و نرم، با نشان و نام زیرِ لکه‌ای از رنگِ اطرافش — تا سیاره و «K» در پژواک
   شبح نیندازند و فقط رنگ و نورِ سحابی بیرونِ قاب ادامه پیدا کند */
window.makePlate = function (F0) {
  const W = 640, H = 360, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.drawImage(F0, 0, 0, W, H);
  /* ناحیهٔ نشان و نام: رنگِ نوارِ بالای آن (بدون نشان) کشیده و نرم روی آن، با لبهٔ بیضیِ محو */
  const bx = 0.22 * W, bw = 0.6 * W, by = 0.33 * H, bh = 0.34 * H;
  const t = document.createElement("canvas"); t.width = W; t.height = H; const tx = t.getContext("2d");
  tx.filter = "blur(14px)"; tx.drawImage(c, bx, by - 0.08 * H, bw, 0.07 * H, bx, by, bw, bh * 0.5);
  tx.drawImage(c, bx, by + bh + 0.01 * H, bw, 0.07 * H, bx, by + bh * 0.5, bw, bh * 0.5); tx.filter = "none";
  tx.globalCompositeOperation = "destination-in";
  const g = tx.createRadialGradient(bx + bw / 2, by + bh / 2, 0, bx + bw / 2, by + bh / 2, bw * 0.55);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.75, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
  tx.setTransform(1, 0, 0, bh / bw, 0, (by + bh / 2) * (1 - bh / bw)); tx.fillStyle = g; tx.fillRect(0, 0, W, H / (bh / bw));
  x.drawImage(t, 0, 0);
  const out = document.createElement("canvas"); out.width = W; out.height = H; const ox = out.getContext("2d");
  ox.filter = "blur(6px)"; ox.drawImage(c, 0, 0); ox.filter = "none";
  window.__plate = out; return out;
};
