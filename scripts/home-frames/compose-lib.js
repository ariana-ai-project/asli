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
    const g1 = ctx.createLinearGradient(0, 0, 0, gapTop); g1.addColorStop(0, "rgba(3,5,14,0.62)"); g1.addColorStop(1, "rgba(3,5,14,0.05)");
    ctx.fillStyle = g1; ctx.fillRect(0, 0, OW, gapTop);
    const g2 = ctx.createLinearGradient(0, OH - gapBot, 0, OH); g2.addColorStop(0, "rgba(3,5,14,0.05)"); g2.addColorStop(1, "rgba(3,5,14,0.62)");
    ctx.fillStyle = g2; ctx.fillRect(0, OH - gapBot, OW, gapBot);
  }
  /* فریمِ تیز با لبه‌های نرم (بالا و پایین) */
  const feather = Math.min(fh * 0.16, OH * 0.06);
  const tmp = window.__tmp || (window.__tmp = document.createElement("canvas"));
  tmp.width = OW; tmp.height = OH;
  const t = tmp.getContext("2d"); t.clearRect(0, 0, OW, OH);
  t.imageSmoothingEnabled = true; t.imageSmoothingQuality = "high";
  t.drawImage(L, fx, fy, fw, fh);
  if (gapTop > 0.5 || gapBot > 0.5) {
    t.globalCompositeOperation = "destination-in";
    const gm = t.createLinearGradient(0, fy, 0, fy + fh);
    const a = gapTop > 0.5 ? feather / fh : 0, b = gapBot > 0.5 ? feather / fh : 0;
    gm.addColorStop(0, gapTop > 0.5 ? "rgba(0,0,0,0)" : "#000"); gm.addColorStop(a, "#000"); gm.addColorStop(1 - b, "#000"); gm.addColorStop(1, gapBot > 0.5 ? "rgba(0,0,0,0)" : "#000");
    t.fillStyle = gm; t.fillRect(0, 0, OW, OH);
    t.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(tmp, 0, 0);
  /* انتهای مسیر: فریمِ عمودیِ اصلی (همان پنجره) رویش محو می‌شود */
  if (P && cam.mix > 0) { ctx.globalAlpha = cam.mix; ctx.drawImage(P, 0, 0, OW, OH); ctx.globalAlpha = 1; }
  ctx.restore();
};
