/* ============================================================
   پیشنهادهای کارشناس هوشمند در گفت‌وگوی «⏱ با مهلت / ⏸ بی‌مهلت» — منطقِ بی‌DOMِ صفحهٔ مکاتباتِ کارشناس (مهر ۱۴۰۵، W3)
   بازخوردِ آزمونِ مالک: «دکمهٔ تأییدِ اول را پیدا نکردیم؛ پیامی بیاید و زیرش دو گزینه: رد یا تأیید». پس هر پیشنهاد سرِ جای خودش
   در گفت‌وگو می‌نشیند — «🏁 تأیید نهایی» و «🧾 تصمیمِ بسته» درست زیرِ کارتِ همان بسته، «💬 پاسخ» درست بعد از پیامِ تأمین‌کننده‌ای
   که جوابش است — دکمه‌هایش به نوعِ پیشنهاد است و پیامِ کادرِ پایین هیچ‌وقت بی‌صدا پیشنهادی را رد نمی‌کند.
   correspond.js کارت را می‌سازد؛ این‌جا فقط جا، دکمه‌ها و بدنهٔ درخواست‌ها (همان قاعده‌های worker/ai-supervise.js:rejectBody)، تا در
   آزمون (node:vm، backend/tamin-poshtibani/tests/w3-props.test.mjs) هم سنجیده شوند. window.PH.props.
   ============================================================ */
(function () {
  "use strict";
  const PH = window.PH || (window.PH = {});

  /** بسته‌های یک پیشنهاد: «🏁 تأیید نهایی» همان یکی، «🧾 تصمیمِ بسته» بسته‌های همهٔ کارهایش */
  const bundlesOf = (p) => (p.kind === "final" ? [Number(p.bundle_id)] : (p.actions || []).map((a) => Number(a && a.bundle_id))).filter((x) => x > 0);
  /** پیامِ پاسخ‌دادنی: متن یا صوتِ یک طرف (یادداشت و رخداد پاسخ نیستند) */
  const talk = (m) => m.kind === "text" || m.kind === "voice";

  /** آخرین رخدادِ تأمین‌کننده برای یکی از این بسته‌ها (ارسالِ مشخصات و پیش‌فاکتورِ همان — kind «event» با meta.bundle) */
  function bundleEv(msgs, bids) {
    let m = null;
    for (const x of msgs || []) if (x && x.who === "s" && x.kind === "event" && x.meta && bids.includes(Number(x.meta.bundle))) m = x;
    return m;
  }

  /**
   * جای هر پیشنهادِ معطل در فهرستِ پیام‌ها. msgs: پیام‌های صفحه به ترتیب؛ pending: پیشنهادهای معطل (watch.pending).
   *  • final و act: زیرِ آخرین رخدادِ تأمین‌کننده برای همان بسته (bundleEv)؛
   *  • reply: درست بعد از آخرین پیامِ تأمین‌کننده تا لحظهٔ نوشتنِ پیشنهاد (seen) — همان پیامی که جوابش است؛ اگر بعد از آن پیامِ
   *    ما (متن یا صوت) آمده، آن پیام پیش‌تر جواب گرفته و کارت ته گفت‌وگو می‌نشیند؛
   *  • پیامِ لنگر در صفحه نیست (مثلاً «پاک کردن گفت‌وگو») ← ته گفت‌وگو.
   * خروجی: {at: {msgId: [p…]}, tail: [p…]} — هر گروه به ترتیبِ شناسهٔ پیشنهاد.
   */
  function anchors(msgs, pending) {
    const list = msgs || [];
    const at = {}, tail = [];
    for (const p of (pending || []).slice().sort((a, b) => a.id - b.id)) {
      let m = null;
      if (p.kind === "reply") {
        const seen = Number(p.seen) || 0;
        let i = -1;
        if (seen) list.forEach((x, k) => { if (x && x.who === "s" && x.id > 0 && x.id <= seen) i = k; });
        if (i >= 0 && !list.slice(i + 1).some((x) => x && x.who === "e" && talk(x))) m = list[i];
      } else {
        const B = bundlesOf(p);
        if (B.length) m = bundleEv(list, B);
      }
      if (m) (at[m.id] = at[m.id] || []).push(p); else tail.push(p);
    }
    return { at, tail };
  }

  /** پیشنهادی که پیامِ کادرِ پایین جایش می‌رود: آخرین «💬 پاسخ»ِ معطل، وگرنه آخرین «🧾 تصمیمِ بسته»ِ پیام‌دار — هرگز «🏁 تأیید نهایی» */
  function target(pending) {
    const L = (pending || []).slice().sort((a, b) => b.id - a.id);
    return L.find((p) => p.kind === "reply") || L.find((p) => p.kind === "act" && String(p.body || "").trim()) || null;
  }

  const fail = (msg, field) => { const e = new Error(msg); e.field = field; return e; };
  const T = (v) => String(v == null ? "" : v).trim();
  const BOX_MSG = "دست‌کم یک جعبهٔ نقد بزنید — کدام جزءِ کارِ کارشناس هوشمند درست نبود؟";
  const FATES = ["return", "reject", "keep"];

  /**
   * «↩️ برگشت با توضیح»، «❌ رد» و «⏸ بعداً خودم» روی «🏁 تأیید نهایی»: همان «رد»ِ پیشنهاد با سرنوشتِ بسته (POST /sp/x/prop/:id)؛
   * سرور بسته را با همان تصمیمِ صفحهٔ مکاتبات برمی‌گرداند یا رد می‌کند (sp-core.js:decide) و «⏸» آن را منتظرِ تصمیمِ خودِ کارشناس
   * نگه می‌دارد و ارسالِ خودکارش را برمی‌دارد. علت همیشه اجباری (به کارشناس هوشمند می‌رسد)، پیامِ برگشت برای «↩️»، جعبهٔ نقد وقتی
   * پشتیبانی روشنش کرده؛ «⏸» هیچ پیامی برای تأمین‌کننده نمی‌فرستد. خطا: Error با متنِ فارسی و field.
   */
  function finBody(fate, o = {}) {
    if (!FATES.includes(fate)) throw fail("سرنوشتِ بسته نامعتبر است.", "fate");
    const text = fate === "keep" ? "" : T(o.text), reason = T(o.reason);
    if (fate === "return" && !text) throw fail("بنویسید تأمین‌کننده چه چیزی را اصلاح کند — همین پیامِ برگشت برای او می‌رود.", "text");
    if (!reason) throw fail("بنویسید چرا پیشنهادِ «🏁 تأیید نهایی»ِ کارشناس هوشمند را نمی‌پذیرید — همین به او می‌رسد تا دفعهٔ بعد درست‌تر پیشنهاد کند.", "reason");
    if (o.needBoxes && !(o.boxes || []).length) throw fail(BOX_MSG, "boxes");
    return { action: "no", reason, text, bundle: fate, ...(o.needBoxes ? { boxes: o.boxes.slice() } : {}) };
  }

  /**
   * دامِ تایپ: پیامی که کارشناس در کادرِ پایین می‌نویسد فقط با تأییدِ صریح جای پیشنهادِ معطل می‌رود — همان «✏️ رد» با پیامِ تازهٔ
   * خودش؛ پیام و علت هر دو اجباری.
   */
  function replaceBody(o = {}) {
    const text = T(o.text), reason = T(o.reason);
    if (!text) throw fail("پیامِ خودتان خالی است — همین به‌جای پیشنهادِ کارشناس هوشمند برای تأمین‌کننده می‌رود.", "text");
    if (!reason) throw fail("بنویسید چرا پیشنهادِ کارشناس هوشمند را رد می‌کنید — همین به او می‌رسد تا دفعهٔ بعد درست‌تر بنویسد.", "reason");
    if (o.needBoxes && !(o.boxes || []).length) throw fail(BOX_MSG, "boxes");
    return { action: "no", reason, text, ...(o.needBoxes ? { boxes: o.boxes.slice() } : {}) };
  }

  /**
   * دکمه‌های زیرِ کارتِ پیشنهاد. «🏁 تأیید نهایی» چهار راه دارد: تأیید (همان ارسالِ پیشنهاد)، برگشت با توضیح، رد، و «⏸ بعداً خودم»؛
   * «💬 پاسخ» و «🧾 تصمیمِ بسته» همان «✅ ارسال» و «✏️ رد». o.size: اندازهٔ دکمه (پیش‌فرض sm)؛ o.short: برچسبِ کوتاه‌ترِ «رد».
   */
  function acts(p, o = {}) {
    const id = Number(p.id), sz = o.size == null ? "sm" : o.size;
    if (p.kind === "final") return `<div class="ph-prop-acts fin" role="group" aria-label="تصمیم دربارهٔ پیشنهادِ تأیید نهایی">`
      + `<button type="button" class="tp-btn primary ${sz}" data-prop-ok="${id}" title="همین حالا تأیید نهایی شود — پیشنهاد به تب استعلامات می‌رود و از تأمین‌کننده تشکر می‌شود">🏁 تأیید نهایی</button>`
      + `<button type="button" class="tp-btn warn ${sz}" data-prop-fin="${id}:return" title="بسته با پیامِ شما برای اصلاح برمی‌گردد">↩️ برگشت با توضیح</button>`
      + `<button type="button" class="tp-btn danger ${sz}" data-prop-fin="${id}:reject" title="بسته رد می‌شود">❌ رد</button>`
      + `<button type="button" class="tp-btn ${sz}" data-prop-fin="${id}:keep" title="خودکار نمی‌رود؛ بسته منتظرِ تصمیمِ خودِ شما می‌ماند">⏸ بعداً خودم</button></div>`;
    return `<div class="ph-prop-acts"><button type="button" class="tp-btn primary ${sz}" data-prop-ok="${id}">✅ ارسال همین حالا</button>`
      + `<button type="button" class="tp-btn danger ${sz}" data-prop-no="${id}">${o.short ? "✏️ رد و پیام خودم" : "✏️ رد و نوشتن پیام خودم"}</button></div>`;
  }

  PH.props = { bundlesOf, bundleEv, anchors, target, finBody, replaceBody, acts, FATES };
})();
