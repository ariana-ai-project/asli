/* ============================================================
   «🏆 نتیجهٔ کمیسیون» — پنل پشتیبانی (مهر ۱۴۰۵، درخواست مالک)
   برای هر قلمِ بازِ یک ارجاع، برنده از میانِ استعلام‌های ثبت‌شده انتخاب می‌شود و علتش (قیمت، تحویل، …).
   ثبت = تیکِ «تأیید کمیسیون» همان اقلام + پیامِ تشکر با علت به تأمین‌کنندگانی که برنده نشدند (در گفت‌وگو و تلگرامشان،
   و اگر خواسته شد پیامکِ کوتاه). worker/commission-result.js
   TP_CMRES.open({ api, aid, onDone(result) })
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP, esc = TP.esc;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));

  function open({ api, aid, onDone }) {
    const ov = document.createElement("div");
    ov.className = "cmr-ov";
    ov.innerHTML = `<div class="cmr" role="dialog" aria-modal="true" aria-label="نتیجهٔ کمیسیون"><div class="cmr-load"><span class="tp-spin"></span> در حال خواندنِ استعلام‌ها…</div></div>`;
    document.body.appendChild(ov);
    const close = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 220); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });

    let D = null;
    const pick = {};   /* item_id → {quote_id, reason, text} */
    const opt = { notify: true, sms: true };

    const quoteCard = (it, q, best) => {
      const on = pick[it.id] && pick[it.id].quote_id === q.id;
      const st = !q.thread_id ? `<span class="chip">بی گفت‌وگو — پیامی نمی‌رود</span>` : q.sent ? `<span class="chip ok">پیامِ تشکر را گرفته</span>`
        : on ? `<span class="chip ok">🏆 برنده</span>` : `<span class="chip info">پیامِ تشکر می‌گیرد</span>`;
      const meta = [q.dtime ? `تحویل ${esc(fa(q.dtime))}` : "", q.pay ? esc(q.pay) : "", q.invoice ? `فاکتور ${esc(q.invoice)}` : ""].filter(Boolean).join(" · ");
      return `<label class="cmr-q ${on ? "on" : ""}">
        <input type="radio" name="w${it.id}" value="${q.id}" data-w="${it.id}" ${on ? "checked" : ""}>
        <span class="cmr-qh"><b>${esc(q.supplier)}</b>${q.id === best ? `<span class="cmr-best" title="کمترین قیمتِ واحد">کمترین</span>` : ""}${q.final ? "" : `<span class="chip warn">تأیید نهایی ندارد</span>`}</span>
        <span class="cmr-pr"><b>${money(q.price)}</b> <small>ریال</small>${q.total != null ? `<em>جمع ${money(q.total)}</em>` : ""}</span>
        ${meta ? `<span class="cmr-meta">${meta}</span>` : ""}
        <span class="cmr-st">${st}${q.phone ? ` <span class="dim num" dir="ltr">${esc(q.phone)}</span>` : ""}</span></label>`;
    };
    const itemCard = (it) => {
      if (!it.quotes.length) return `<section class="cmr-item off"><div class="cmr-it"><b>${esc(it.title)}</b><span class="dim">${fa(it.qty ?? "")} ${esc(it.unit || "")}</span></div>
        <div class="cmr-none">استعلامِ ثبت‌شده‌ای ندارد — از این نتیجه بیرون می‌ماند.</div></section>`;
      const best = it.quotes.filter((q) => q.price != null).sort((a, b) => a.price - b.price)[0];
      const p = pick[it.id] || {};
      return `<section class="cmr-item"><div class="cmr-it"><b>${esc(it.title)}</b><span class="dim">${fa(it.qty ?? "")} ${esc(it.unit || "")}</span>
          ${it.result ? `<span class="chip ok" title="ثبتِ دوباره جای قبلی را می‌گیرد">ثبت‌شده: ${esc(it.result.winner)}</span>` : ""}${it.commission_ok ? `<span class="chip ok">✓ کمیسیون</span>` : ""}</div>
        <div class="cmr-opts" role="radiogroup" aria-label="برندهٔ ${esc(it.title)}">${it.quotes.map((q) => quoteCard(it, q, best && best.id)).join("")}</div>
        <div class="cmr-why"><span class="lab">علتِ انتخاب</span><div class="cmr-chips" role="radiogroup">${D.reasons.map((r) => `<button type="button" class="cmr-chip ${p.reason === r.key ? "on" : ""}" data-why="${it.id}" data-r="${r.key}" aria-pressed="${p.reason === r.key}">${esc(r.fa)}</button>`).join("")}</div>
          ${p.reason === "other" ? `<input class="tp-input cmr-other" data-wt="${it.id}" maxlength="300" value="${esc(p.text || "")}" placeholder="علت را بنویسید (در پیامِ تشکر هم می‌آید)">` : ""}</div></section>`;
    };
    const losers = () => {
      const seen = new Set();
      for (const it of D.items) {
        const p = pick[it.id]; if (!p) continue;
        const w = it.quotes.find((q) => q.id === p.quote_id);
        for (const q of it.quotes) if (q.thread_id && !q.sent && q.id !== p.quote_id && (!w || q.supplier !== w.supplier)) seen.add(q.thread_id);
      }
      return seen.size;
    };
    const paint = () => {
      const ready = D.items.filter((it) => it.quotes.length);
      const n = losers();
      ov.querySelector(".cmr").innerHTML = `<header class="cmr-hd"><span class="cmr-ic" aria-hidden="true">🏆</span><div class="t"><h3>نتیجهٔ کمیسیون</h3>
          <span>درخواست <b class="num" dir="ltr">${esc(D.assignment.request_id)}</b>${D.assignment.party ? ` · ${esc(D.assignment.party)}` : ""}</span></div>
          <button class="tp-icon-btn" type="button" data-x aria-label="بستن">✕</button></header>
        <div class="cmr-body">${D.items.map(itemCard).join("") || `<div class="cmr-none">قلمِ بازی نمانده است.</div>`}</div>
        <footer class="cmr-ft"><div class="cmr-sw">
            ${TP.ui.switchEl({ attrs: 'data-opt="notify"', on: opt.notify, label: "پیامِ تشکر به بقیه", sub: n ? `${fa(n)} تأمین‌کننده` : "کسی نمی‌ماند" })}
            ${D.sms ? TP.ui.switchEl({ attrs: 'data-opt="sms"', on: opt.sms && opt.notify, label: "پیامک هم برود", sub: "فقط شماره‌های پنل" }) : ""}</div>
          <span class="spacer"></span><button class="tp-btn" type="button" data-x>انصراف</button>
          <button class="tp-btn primary" type="button" data-save ${ready.length ? "" : "disabled"}>✓ ثبتِ نتیجه و تأیید کمیسیون</button></footer>`;
    };
    const load = async () => {
      try {
        D = await api(`/commission/result?aid=${aid}`);
        for (const it of D.items) {
          if (!it.quotes.length) continue;
          const r = it.result, best = it.quotes.filter((q) => q.price != null).sort((a, b) => a.price - b.price)[0] || it.quotes[0];
          pick[it.id] = r && it.quotes.some((q) => q.id === r.quote_id) ? { quote_id: r.quote_id, reason: r.reason, text: r.reason_text || "" } : { quote_id: best.id, reason: "price", text: "" };
        }
        paint();
      } catch (e) {
        ov.querySelector(".cmr").innerHTML = `<header class="cmr-hd"><span class="cmr-ic">⚠️</span><div class="t"><h3>نشد</h3><span>${esc(e.message)}</span></div><button class="tp-icon-btn" data-x aria-label="بستن">✕</button></header>`;
      }
    };
    ov.addEventListener("change", (e) => {
      const w = e.target.closest("[data-w]");
      if (w) { const id = +w.dataset.w; pick[id] = { ...(pick[id] || { reason: "price" }), quote_id: +w.value }; paint(); }
    });
    ov.addEventListener("input", (e) => { const t = e.target.closest("[data-wt]"); if (t) pick[+t.dataset.wt].text = t.value; });
    ov.addEventListener("tp-change", (e) => {
      const s = e.target.closest("[data-opt]"); if (!s) return;
      opt[s.dataset.opt] = !!(e.detail && e.detail.value);
      if (s.dataset.opt === "notify" && !opt.notify) opt.sms = false;
      paint();
    });
    ov.addEventListener("click", async (e) => {
      if (e.target.closest("[data-x]")) return close();
      const c = e.target.closest("[data-why]");
      if (c) { const id = +c.dataset.why; pick[id] = { ...pick[id], reason: c.dataset.r }; paint(); if (c.dataset.r === "other") { const i = ov.querySelector(`[data-wt="${id}"]`); if (i) i.focus(); } return; }
      const sv = e.target.closest("[data-save]");
      if (!sv) return;
      const items = D.items.filter((it) => pick[it.id]).map((it) => ({ item_id: it.id, ...pick[it.id], reason_text: pick[it.id].text || "" }));
      const miss = items.find((x) => x.reason === "other" && !String(x.reason_text).trim());
      if (miss) { const i = ov.querySelector(`[data-wt="${miss.item_id}"]`); if (i) { i.classList.add("err"); i.focus(); } return; }
      sv.disabled = true; sv.innerHTML = '<span class="tp-spin"></span> در حال ثبت…';
      try {
        const r = await api("/commission/result", { body: { assignment_id: aid, items, notify: opt.notify, sms: opt.sms && opt.notify } });
        close();
        TP.ui.success(r.messages ? `نتیجه ثبت شد · ${fa(r.messages)} پیامِ تشکر` : "نتیجه ثبت شد");
        if (onDone) onDone(r);
      } catch (err) {
        sv.disabled = false; sv.textContent = "✓ ثبتِ نتیجه و تأیید کمیسیون";
        TP.modal("نشد", esc(err.message), null, "باشد", "");
      }
    });
    load();
    return { close };
  }
  window.TP_CMRES = { open };
})();
