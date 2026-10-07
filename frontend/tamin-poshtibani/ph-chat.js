/* ============================================================
   گوشی و گفت‌وگوی مشترک — صفحهٔ مکاتباتِ کارشناس و پنل تأمین‌کننده (مهر ۱۴۰۵)
   به سبک پیام‌رسانِ iOS 26: حباب‌های شیشه‌ای (پیامِ «خودِ این صفحه» آبیِ لوگو و سمت راست، طرفِ مقابل طوسیِ کمرنگ
   و سمت چپ)، گروه‌بندی و دُم، سرِ گروهِ «امروز ۱۴:۰۵»، کارتِ رخدادِ بسته، پیامِ صوتی (پخش در همین صفحه؛ متنِ
   پیاده‌شده فقط اگر صفحه بخواهد — صفحهٔ کارشناس)، نوار بالا و کادرِ پیامِ شیشه‌ای، دکمهٔ ضبطِ صدا و صفحه‌کلیدِ منو
   (مثل منوی ثابتِ بات تلگرام). سبک‌ها: sp.css بخشِ «.ph-*».
   window.PH: screen · frame · feed · evCard · bindComposer · bindVoices · و ابزارهای قالب.
   ============================================================ */
(function () {
  "use strict";
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  const qty = (n) => (n == null ? "—" : fa(String(Math.round(Number(n) * 1000) / 1000)));
  const dtf = (o) => { try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", ...o }); } catch (_) { return null; } };
  const F_HM = dtf({ hour: "2-digit", minute: "2-digit", hour12: false }), F_DAY = dtf({ weekday: "long", day: "numeric", month: "long" }), F_KEY = dtf({ year: "numeric", month: "2-digit", day: "2-digit" });
  const hm = (ms) => (F_HM ? F_HM.format(new Date(ms)) : fa(new Date(ms).toLocaleTimeString()));
  const dayKey = (ms) => (F_KEY ? F_KEY.format(new Date(ms)) : new Date(ms).toDateString());
  /** سرِ گروهِ پیام‌ها: «امروز ۱۴:۰۵» */
  function stamp(ms) {
    const k = dayKey(ms), now = Date.now();
    const d = k === dayKey(now) ? "امروز" : k === dayKey(now - 864e5) ? "دیروز" : F_DAY ? F_DAY.format(new Date(ms)) : "";
    return `<b>${d}</b> ${hm(ms)}`;
  }
  const durTxt = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return fa(`${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`); };

  /* نمادهای خطی (رنگ از currentColor) */
  const I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 2.8l8 4.3v9.8l-8 4.3-8-4.3V7.1z"/><path d="M4 7.1l8 4.4 8-4.4M12 11.5v9.7"/><path d="M8 4.9l8 4.4" stroke-width="1.5"/></svg>',
    erase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 20H20"/><path d="M4.6 14.6l9.9-9.9a2 2 0 012.8 0l2.5 2.5a2 2 0 010 2.8L11 18.8a4 4 0 01-2.8 1.2H7.4a2 2 0 01-1.4-.6l-1.4-1.4a2 2 0 010-2.8z"/><path d="M9.2 10l4.8 4.8"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 001.5.86l10.4-6.4a1 1 0 000-1.72L9.5 4.74A1 1 0 008 5.6z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg>',
    bars: '<svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>',
    wifi: '<svg viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 008 .6 10.3 10.3 0 00.8 3.5L2 4.8a8.5 8.5 0 016-2.4z"/><path d="M8 5.9c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 008 4.1 7 7 0 003.2 6l1.2 1.3A5.2 5.2 0 018 5.9z"/><path d="M8 9.3c.5 0 1 .2 1.3.5L8 11.2 6.7 9.8c.3-.3.8-.5 1.3-.5z"/></svg>',
    batt: '<svg viewBox="0 0 27 13" fill="none"><rect x=".5" y=".5" width="23" height="12" rx="3.6" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2.2" fill="currentColor"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1S25.8 4.7 25 4.4z" fill="currentColor" opacity=".45"/></svg>',
  };

  /* --- کارتِ رخدادِ بسته و قلم (استعلام، ارسالِ مشخصات، …) — کلیکش به همان بسته یا قلم --- */
  const EV_HEAD = { rfq: "📦 استعلام", remind: "🔁 یادآوری استعلام", submit: "📤 مشخصات برای بررسی فرستاده شد", approve: "✅ مشخصات تأیید شد — پیش‌فاکتور خواسته شد",
    pf: "📄 پیش‌فاکتور رسید", return: "↩️ برای اصلاح برگشت خورد", reject: "❌ رد شد", final: "🏁 تأیید نهایی شد" };
  const evItems = (m) => { const meta = m.meta || {}; return EV_HEAD[meta.ev] && Array.isArray(meta.items) ? meta.items.filter((x) => x && typeof x === "object") : []; };
  /** o: { mine, termsLine(t), goLabel, actions(m) → html دکمه‌های زیرِ کارت } */
  function evCard(m, o) {
    const meta = m.meta || {};
    const items = evItems(m);
    if (!items.length) return null;
    const goto = meta.bundle ? `data-goto-b="${meta.bundle}"` : "";
    const head = meta.ev === "rfq" ? `📦 استعلام ${fa(items.length)} قلم` : meta.ev === "submit" ? `📤 مشخصات ${fa(items.length)} قلم برای بررسی` : EV_HEAD[meta.ev];
    const note = /💬 ([\s\S]+)$/.exec(m.body || "");
    const tl = (o.termsLine && meta.terms && o.termsLine(meta.terms)) || "";
    const blocks = items.map((x) => {
      const spec = [...(x.layers || []), ...(x.extra || [])].map((y) => `${esc(y.k)}: ${esc(y.v)}${y.u ? ` ${esc(y.u)}` : ""}`).join(" · ");
      const amount = x.price != null ? `${qty(x.qty)} ${esc(x.unit || "")} × ${money(x.price)} = <b>${money(Number(x.qty) * Number(x.price))}</b> ریال` : x.qty != null ? `${qty(x.qty)} ${esc(x.unit || "")}` : "";
      return `<div class="evi" ${!goto && x.no ? `data-goto-no="${x.no}" role="button" tabindex="0"` : ""}><div class="evt">${x.no ? `<span class="sp-code">کد ${fa(x.no)}</span>` : ""}<span>${esc(x.title)}</span></div>
        ${amount ? `<div class="evd">${amount}</div>` : ""}${spec ? `<div class="evs">${spec}</div>` : ""}</div>`;
    }).join("");
    /* gen (فاز ۴): پیش‌فاکتور را سامانه ساخته؛ پیش‌فاکتورِ خودِ تأمین‌کننده فقط پیوست است */
    const foot = [meta.pf && meta.ev === "submit" ? (meta.gen ? `📎 پیوست: پیش‌فاکتورِ خودِ تأمین‌کننده «${esc(meta.pf)}»` : `📄 همراه با پیش‌فاکتور «${esc(meta.pf)}»`) : "",
      meta.gen && meta.ev === "submit" ? "📄 پیش‌فاکتورِ سامانه همراهش است" : "", meta.sum != null && meta.ev === "submit" ? `جمع: <b>${money(meta.sum)}</b> ریال` : "",
      tl ? `🧾 ${esc(tl)}` : ""].filter(Boolean).join("<br>");
    const acts = o.actions ? o.actions(m) : "";
    return `<div class="ph-card ${o.mine ? "me" : "them"}" ${goto ? `${goto} role="button" tabindex="0"` : ""} title="${hm(m.at)}${goto ? ` — ${o.goLabel || "رفتن به همین بسته"}` : ""}">
      <div class="ph-card-h">${head}</div>${blocks}
      ${foot ? `<div class="ph-card-f">${foot}</div>` : ""}${note ? `<div class="ph-card-f">💬 ${esc(note[1])}</div>` : ""}
      ${goto && o.goLabel ? `<div class="ph-card-go">${esc(o.goLabel)} ‹</div>` : ""}${acts}</div>`;
  }

  /* --- پیامِ صوتی: موجِ ثابت از شناسهٔ پیام، پخش با کلیک (bindVoices) --- */
  function wave(seed) {
    let x = (Number(seed) || 7) * 9301 + 49297;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    return Array.from({ length: 26 }, (_, i) => `<i style="--h:${(0.28 + 0.72 * Math.abs(Math.sin(i * 0.7 + rnd() * 2))).toFixed(2)}"></i>`).join("");
  }
  function voiceHtml(m, side, tail, o) {
    const v = (m.meta && m.meta.voice) || {};
    const pend = !!m.pending;
    const bubble = `<div class="ph-b ${side} voice${tail ? " tail" : ""}${pend ? " sending" : ""}" ${pend ? "" : `data-voice="${m.id}"`} data-dur="${v.dur || 0}" title="${pend ? "در حال ارسال…" : hm(m.at)}">
      <button class="ph-play" type="button" aria-label="پخش پیام صوتی" ${pend ? "disabled" : ""}>${pend ? '<span class="ph-spin"></span>' : I.play}</button>
      <span class="ph-wave" aria-hidden="true">${wave(m.id || v.dur)}</span><span class="ph-dur">${durTxt(v.dur)}</span></div>`;
    if (!o.transcript || side === "me") return bubble;
    const st = (m.meta && m.meta.stt) || {};
    return bubble + `<div class="ph-tr"><b>🎤 متن پیام صوتی</b>${String(m.body || "").trim() ? esc(m.body) : `<i>متنش پیاده نشد${st.error ? ` — ${esc(st.error)}` : ""}</i>`}</div>`;
  }

  /* --- فهرستِ پیام‌ها: گروه‌بندیِ پشت‌سرهم‌های یک طرف، دُم و ساعت فقط آخرینِ گروه --- */
  const GAP = 60 * 60e3, GROUP = 3 * 60e3;
  /**
   * o: { mine(m), rich(m) → html|null، ai(m) → bool (برچسبِ «کارشناس هوشمند» — فقط صفحهٔ کارشناس)، transcript (متنِ صوتی‌ها)،
   *      after: {msgId: html} (کارت‌های گذرای بات بعد از همان پیام؛ 0 = پیش از همه)، tail: html (ته فهرست)، empty }
   */
  function feed(list, o) {
    const kindOf = (m) => (m.kind === "event" ? (o.rich && evItems(m).length ? "rich" : "sys") : m.kind === "note" ? "sys" : m.kind === "voice" ? "voice" : "text");
    const sideOf = (m) => (o.mine(m) ? "me" : "them");
    const isAi = (m) => !!(o.ai && o.ai(m));
    const same = (a, b) => !!a && !!b && kindOf(a) !== "sys" && kindOf(b) !== "sys" && sideOf(a) === sideOf(b) && isAi(a) === isAi(b)
      && b.at - a.at < GROUP && dayKey(a.at) === dayKey(b.at);
    const after = o.after || {};
    let h = after[0] || "";
    if (!list.length) return h + (o.tail || "") + (h || o.tail ? "" : o.empty || "");
    list.forEach((m, i) => {
      const prev = list[i - 1], next = list[i + 1];
      if (!prev || m.at - prev.at > GAP || dayKey(m.at) !== dayKey(prev.at)) h += `<div class="ph-stamp">${stamp(m.at)}</div>`;
      const k = kindOf(m);
      if (k === "sys") {
        const note = m.kind === "note";
        h += `<div class="ph-sys ${note ? "note" : ""}" ${m.meta && m.meta.bundle ? `data-goto-b="${m.meta.bundle}" role="button" tabindex="0"` : ""}>${note ? "🔒 " : ""}${esc(m.body)}${note ? ` <i>· فقط شما می‌بینید</i>` : ""} <span class="t">${hm(m.at)}</span></div>`;
      } else {
        const side = sideOf(m), ai = isAi(m);
        const first = !same(prev, m), last = !same(m, next);
        const cap = first && ai ? `<div class="ph-cap">🤖 <span>کارشناس هوشمند</span></div>` : "";
        const body = k === "rich" ? o.rich(m)
          : k === "voice" ? voiceHtml(m, side, last, o)
            : `<div class="ph-b ${side}${ai ? " ai" : ""}${last ? " tail" : ""}" title="${hm(m.at)}">${esc(m.body)}</div>`;
        h += `<div class="ph-row ${side}${first ? " first" : ""}">${cap}${body}${last ? `<div class="ph-meta">${hm(m.at)}</div>` : ""}</div>`;
      }
      if (after[m.id]) h += after[m.id];
    });
    return h + (o.tail || "");
  }

  /* --- صفحهٔ گوشی --- */
  const clock = () => hm(Date.now());
  /**
   * o: { framed, body (html فهرست یا null)، void (html وقتی گفت‌وگویی نیست)، label (aria)،
   *      nav: { start: html (راست: برگشت یا …)، title، initial، whoAttrs، whoTitle، acts: html (چپ) }،
   *      composer: { placeholder, draft, hint (اعلانِ گامِ بات بالای کادر)، keys: [{key,label}] (منو)، mic } }
   */
  function screen(o) {
    const chrome = o.framed ? `<div class="ph-status" aria-hidden="true"><span class="ph-clock">${clock()}</span><span></span><span class="ph-icons">${I.bars}${I.wifi}${I.batt}</span></div>
      <div class="ph-island" aria-hidden="true"><i></i></div><div class="ph-home" aria-hidden="true"></div>` : "";
    if (o.body == null) return `<div class="ph-screen ${o.framed ? "" : "full"}"><div class="ph-wall"></div>${chrome}<div class="ph-void center">${o.void || ""}</div></div>`;
    const n = o.nav || {}, c = o.composer || {};
    const keys = c.keys && c.keys.length ? `<div class="ph-kb" role="toolbar" aria-label="منو">${c.keys.map((k) => `<button class="ph-key ph-glass" type="button" data-key="${esc(k.key)}">${esc(k.label)}</button>`).join("")}</div>` : "";
    const hint = c.hint ? `<div class="ph-hint ph-glass"><span>${c.hint}</span><button type="button" data-flow-x aria-label="انصراف" title="انصراف">${I.x}</button></div>` : "";
    return `<div class="ph-screen ${o.framed ? "" : "full"}${keys ? " has-kb" : ""}${hint ? " has-hint" : ""}"><div class="ph-wall"></div>
      <div class="ph-scroll" id="chat" role="log" aria-live="polite" aria-label="${esc(o.label || "گفت‌وگو")}">${o.body}</div>
      <div class="ph-edge top" aria-hidden="true"></div><div class="ph-edge bot" aria-hidden="true"></div>${chrome}
      <header class="ph-nav"><div>${n.start || ""}</div>
        <button class="ph-who" ${n.whoAttrs || ""} title="${esc(n.whoTitle || n.title || "")}"><span class="ph-av${n.avatar ? " img" : ""}">${n.avatar || esc(n.initial || "؟")}</span>
          <span class="ph-name ph-glass"><span>${esc(n.title || "")}</span>${I.chev}</span></button>
        <div class="ph-acts">${n.acts || ""}</div></header>
      <div class="ph-compose">${keys}${hint}
        <div class="ph-field ph-glass"><textarea id="msgIn" data-draft="${esc(c.draft || "")}" rows="1" placeholder="${esc(c.placeholder || "پیام")}" aria-label="${esc(c.placeholder || "پیام")}"></textarea>
          ${c.mic ? `<button id="micBtn" class="ph-mic" type="button" aria-label="ضبط پیام صوتی" title="ضبط پیام صوتی">${I.mic}</button>` : ""}
          <button id="sendMsg" class="ph-send" type="button" aria-label="ارسال" title="ارسال (Enter)" disabled ${c.mic ? "hidden" : ""}>${I.up}</button></div>
        <div class="ph-rec ph-glass" hidden><button type="button" class="ph-rec-x" data-rec-x aria-label="لغو ضبط" title="لغو">${I.x}</button>
          <span class="ph-rec-dot" aria-hidden="true"></span><span class="ph-rec-t">۰:۰۰</span><span class="ph-rec-l">در حال ضبط…</span>
          <button type="button" class="ph-send" data-rec-send aria-label="ارسال پیام صوتی" title="ارسال">${I.up}</button></div></div></div>`;
  }
  const frame = (inner) => `<div class="ph"><img class="ph-frame" src="phone-frame.svg" alt="" draggable="false">${inner}</div>`;

  /** کادرِ پیام با متن بلند می‌شود (تا پنج خط)؛ با متن دکمهٔ ارسال، بی متن دکمهٔ میکروفون */
  function grow(inp) {
    inp.style.height = "auto";
    inp.style.height = `${Math.min(inp.scrollHeight, parseFloat(getComputedStyle(inp).lineHeight) * 5 + 8)}px`;
    const root = inp.closest(".ph-compose") || document;
    const has = !!inp.value.trim();
    const send = root.querySelector(".ph-field .ph-send"), mic = root.querySelector("#micBtn");
    if (send) { send.disabled = !has; if (mic) send.hidden = !has; }
    if (mic) mic.hidden = has;
  }

  /* --- ضبطِ صدا (MediaRecorder) --- */
  const REC_MAX = 180;
  function pickMime() {
    if (typeof MediaRecorder === "undefined") return null;
    for (const t of ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]) { try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (_) { /* بعدی */ } }
    return "";
  }
  /**
   * o: { onSend(text) → Promise، onVoice(blob, dur) → Promise، onKey(key)، onFlowCancel()، onError(msg) }
   * Enter ارسال؛ Shift+Enter خطِ تازه.
   */
  function bindComposer(root, o) {
    const inp = root.querySelector("#msgIn");
    if (!inp) return;
    const send = root.querySelector(".ph-field .ph-send");
    const go = async () => {
      const text = inp.value.trim(); if (!text || send.disabled && !text) return;
      send.disabled = true;
      try { await o.onSend(text); inp.value = ""; } catch (_) { /* پیام خطا را صفحه نشان می‌دهد */ }
      grow(inp); inp.focus();
    };
    send.onclick = go;
    inp.oninput = () => grow(inp);
    inp.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } };
    root.querySelectorAll("[data-key]").forEach((b) => { b.onclick = () => o.onKey && o.onKey(b.dataset.key); });
    const fx = root.querySelector("[data-flow-x]"); if (fx) fx.onclick = () => o.onFlowCancel && o.onFlowCancel();
    const mic = root.querySelector("#micBtn");
    if (!mic) return;
    const field = root.querySelector(".ph-field"), bar = root.querySelector(".ph-rec"), tEl = root.querySelector(".ph-rec-t");
    let rec = null, chunks = [], t0 = 0, tick = null, stream = null;
    const reset = () => {
      clearInterval(tick); tick = null;
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      stream = null; rec = null; chunks = [];
      bar.hidden = true; field.hidden = false;
    };
    const finish = (keep) => new Promise((res) => {
      if (!rec) return res(null);
      const r = rec, type = r.mimeType || "audio/webm", dur = Math.max(1, Math.round((Date.now() - t0) / 1000));
      r.onstop = () => { const blob = keep ? new Blob(chunks, { type }) : null; reset(); res(blob ? { blob, dur } : null); };
      try { r.stop(); } catch (_) { reset(); res(null); }
    });
    mic.onclick = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return o.onError && o.onError("ضبط صدا فقط روی نشانیِ امن (https) و مرورگرِ تازه ممکن است.");
      const mime = pickMime();
      if (mime === null) return o.onError && o.onError("این مرورگر ضبط صدا را پشتیبانی نمی‌کند.");
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
      catch (_) { return o.onError && o.onError("اجازهٔ میکروفون داده نشد. از تنظیمات مرورگر به این صفحه اجازهٔ میکروفون بدهید."); }
      chunks = [];
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.start(250); t0 = Date.now();
      field.hidden = true; bar.hidden = false; tEl.textContent = durTxt(0);
      tick = setInterval(async () => {
        const s = (Date.now() - t0) / 1000;
        tEl.textContent = durTxt(s);
        if (s >= REC_MAX) { const r = await finish(true); if (r) o.onVoice(r.blob, r.dur); }
      }, 250);
    };
    root.querySelector("[data-rec-x]").onclick = () => finish(false);
    root.querySelector("[data-rec-send]").onclick = async () => { const r = await finish(true); if (r) o.onVoice(r.blob, r.dur); };
  }

  /* --- پخشِ پیامِ صوتی: صدا با هدرِ ورود از Worker (load(id) → Blob)؛ یکی در هر لحظه --- */
  const cache = new Map();
  let playing = null;
  function bindVoices(root, load) {
    root.querySelectorAll("[data-voice]").forEach((b) => {
      const btn = b.querySelector(".ph-play"), dur = b.querySelector(".ph-dur");
      const id = b.dataset.voice, total = +b.dataset.dur || 0;
      btn.onclick = async () => {
        if (playing && playing.id === id) { if (playing.a.paused) playing.a.play(); else playing.a.pause(); return; }
        if (playing) { playing.a.pause(); playing.a.currentTime = 0; }
        btn.innerHTML = '<span class="ph-spin"></span>';
        try {
          let url = cache.get(id);
          if (!url) { url = URL.createObjectURL(await load(id)); cache.set(id, url); }
          const a = new Audio(url);
          playing = { id, a };
          const paint = () => {
            const el = document.querySelector(`[data-voice="${id}"]`); if (!el) return;
            const d = isFinite(a.duration) && a.duration > 0 ? a.duration : total || 1;
            const bars = el.querySelectorAll(".ph-wave i"), k = Math.round(Math.min(1, a.currentTime / d) * bars.length);
            bars.forEach((b, i) => b.classList.toggle("on", i < k));
            const t = el.querySelector(".ph-dur"); if (t) t.textContent = durTxt(a.paused && !a.currentTime ? total : a.currentTime);
            const p = el.querySelector(".ph-play"); if (p) p.innerHTML = a.paused ? I.play : I.pause;
          };
          a.ontimeupdate = paint; a.onplay = paint; a.onpause = paint;
          a.onended = () => { a.currentTime = 0; paint(); if (playing && playing.id === id) playing = null; };
          await a.play();
        } catch (e) { btn.innerHTML = I.play; if (dur) dur.textContent = "پخش نشد"; }
      };
    });
  }

  /* --- پیش‌فاکتورِ سامانه (فاز ۴ طرح «خرید هوشمند»؛ worker/pfdoc.js) در هر دو صفحه: چاپ در iframeِ جدا — «ذخیره به PDF» هم
     از همان پنجرهٔ چاپ مرورگر — و ذخیرهٔ فایل Word --- */
  function printDoc(title, css, html, onFail) {
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:0";
    document.body.appendChild(f);
    const w = f.contentWindow, doc = w.document;
    doc.open();
    doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title>`
      + `<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700&display=swap" rel="stylesheet">`
      + `<style>@page{size:A4;margin:12mm}body{margin:0;background:#fff}${css}</style></head><body>${html}</body></html>`);
    doc.close();
    /* فرصتِ بارِ قلم پیش از پنجرهٔ چاپ */
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) { if (onFail) onFail(e); } setTimeout(() => f.remove(), 60000); }, 700);
  }
  function saveBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  window.PH = { fa, esc, money, qty, hm, stamp, dayKey, durTxt, I, EV_HEAD, evItems, evCard, feed, screen, frame, grow, bindComposer, bindVoices, clock, printDoc, saveBlob };
})();
