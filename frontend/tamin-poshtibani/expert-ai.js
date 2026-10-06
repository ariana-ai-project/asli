/* ============================================================
   داشبوردِ «🤖 کارشناس هوشمند» — از فاز ۲ در پنل پشتیبانی، برای هر کارشناس (پیش‌تر تبِ پنل کارشناسِ «test»).

   روشن/خاموشِ خودکار، تنظیمات، کارها (مرحله‌ها، نامزدها با شماره و تیکِ «پنل»، گفت‌وگوها، رخدادها)، فراخوانی‌های
   مدل با پرامپتِ دقیق و تخمین هزینه، پیامک‌ها (رفت یا نه و چرا) و دفترچهٔ شماره‌ها. کارشناس هوشمند فقط به شماره‌ای
   پیامک می‌دهد که این‌جا تیکِ «پنل» خورده باشد.
   میزبان (support-panel.js) TP_AI.configure({api, download, active, chat}) را صدا می‌زند تا مسیرها به
   /support/ai/<کارشناس>/… بروند؛ بعد view / wire / load. وضعیتِ این داشبورد همین‌جاست.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP, esc = TP.esc, M = TP.M;
  const A = { st: null, run: null, runId: null, sub: "runs", calls: null, sms: null, phones: null, q: "", err: "", timer: 0, render: null, loading: false };
  const KIND_ICON = { run: "▶️", step: "⚙️", invite: "📨", turn: "💬", proforma: "📄", close: "📊", error: "⚠️", ask: "🚨", handover: "⚠️" };
  const REVIEW_FA = { new: "📥 تحویل شد — منتظرِ بررسیِ پشتیبانی", ok: "✓ کمیسیون تأیید شد", rejected: "✗ پشتیبانی رد کرد" };
  const ST_CHIP = { prep: "info", search: "info", work: "warn", closing: "info", done: "ok", paused: "bad", ended: "bad" };
  const TH_FA = { invited: "دعوت شد", active: "در مذاکره", ask: "🚨 پرسش از کارشناس", final: "تأیید نهایی", declined: "تأمین نمی‌کند", closed: "بسته" };
  const VIA_FA = { textbee: "✅ پیامک رفت", sim: "🧪 شبیه‌سازی", hold: "⛔ نرفت" };
  const p2 = (n) => String(n).padStart(2, "0");
  const when = (ms) => { if (!ms) return "—"; const d = new Date(ms); return `${TP.fmtD(ms)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const usd = (x) => (x == null ? "—" : `$${Number(x).toFixed(Number(x) < 1 ? 4 : 2)}`);
  const tok = (c) => (c.in_tok == null ? "—" : `${M(c.in_tok)} / ${M(c.out_tok)}${c.cache_read ? ` · کش ${M(c.cache_read)}` : ""}`);
  /* پیکربندیِ میزبان: api(path, opt) با مسیرهای /ai/…، download(path, name)، active(S) و chat(run) (دکمهٔ مکاتبات) */
  const C = {
    api: (p, o) => TP.api(p, o),
    download: null,
    active: (S) => S.screen === "list" && S.tab === "ai",
    chat: () => `<a class="tp-btn sm" href="correspond.html">💬 صفحهٔ مکاتبات</a>`,
  };
  const api = (p, o) => C.api(p, o);

  /* ---------- بارگذاری ---------- */
  async function load() {
    /* بارگذاریِ هم‌زمان گم نمی‌شود: کلیکی که وسطِ بارگذاریِ دیگری رسید، بعدش دوباره می‌خواند */
    if (A.loading) { A.again = true; return; }
    A.loading = true;
    try {
      A.st = await api("/ai/state");
      if (A.runId) A.run = await api(`/ai/runs/${A.runId}`).catch((e) => { A.err = e.message; return null; });
      if (A.sub === "calls") A.calls = (await api(`/ai/calls${A.runId ? `?run=${A.runId}` : ""}`)).calls;
      if (A.sub === "sms") A.sms = await api("/ai/sms");
      if (A.sub === "phones") A.phones = (await api(`/ai/phones${A.q ? `?q=${encodeURIComponent(A.q)}` : ""}`)).suppliers;
      A.err = "";
    } catch (e) { A.err = e.message; }
    A.loading = false;
    if (A.again) { A.again = false; return load(); }
    if (A.render) A.render();
  }
  /* تازه‌سازیِ خودکار هر ۲۰ ثانیه، فقط وقتی همین تب باز است و کاربر وسطِ نوشتن نیست */
  function tick(S) {
    clearTimeout(A.timer);
    A.timer = setTimeout(async () => {
      if (!C.active(S)) return;
      const f = document.activeElement;
      if (!(f && /INPUT|TEXTAREA|SELECT/.test(f.tagName))) await load();
      tick(S);
    }, 20000);
  }

  /* ---------- نما ---------- */
  function vHead() {
    const g = A.st.agent;
    return `<div class="tp-card tp-pane"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <h2 style="margin:0">🤖 کارشناس هوشمند${A.st.expert ? ` — ${esc(A.st.expert.label || A.st.expert.name)}` : ""}</h2>
        <span class="chip ${g.on ? "ok" : ""}">${g.on ? "🤖 هوشمند" : "✋ دستی"}</span>
        <button class="tp-btn sm ${g.on ? "danger" : "primary"}" data-ai-mode="${g.on ? "off" : "on"}">${g.on ? "✋ دستی کن" : "🤖 هوشمند کن"}</button>
        <span style="margin-inline-start:auto" class="muted">مدلِ مذاکره: <b dir="ltr">${esc(A.st.model)}</b> (${esc(A.st.agent.cfg.effort || "medium")}) · پیامک: ${A.st.sms ? `<span class="chip ok">TextBee وصل است</span>` : `<span class="chip warn">TextBee وصل نیست — شبیه‌سازی</span>`}</span></div>
      <p class="lead" style="margin-top:10px"><b>🤖 هوشمند:</b> هر ارجاعی که از این لحظه به این کارشناس برسد خودکار پیش می‌رود — بررسی سوابق و جستجوی هوشمند، دعوت با قالب استاندارد،
        مذاکره و تصمیم (تأیید، برگشت، رد، تأیید نهایی)، و در پایان جدول کمیسیون و نامه — و همین کارها برای خودِ کارشناس قفل می‌شود؛ گفت‌وگوهای کارشناس هوشمند هم برایش بسته است
        مگر وقتی «🚨 پرسش از کارشناس» دارد. کارشناس فقط خطِ استعلامِ دستیِ خودش را می‌تواند بیفزاید. <b>پیامک فقط به شماره‌ای می‌رود که تیکِ «پنل» خورده باشد</b> — تیک را فقط انسان می‌زند.
        <b>✋ دستی:</b> همهٔ کارهای کارشناس هوشمند همان لحظه نگه داشته می‌شود و قفل‌ها برداشته می‌شوند.</p>
      <div class="kpi"><div class="k"><b>کارها</b><span>${M(A.st.runs.length)}</span></div><div class="k"><b>فراخوانیِ مدل</b><span>${M(A.st.totals.n)}</span></div>
        <div class="k"><b>تخمینِ کلِ هزینه</b><span dir="ltr">${usd(A.st.totals.cost)}</span></div>
        ${g.on_at ? `<div class="k"><b>روشن از</b><span style="font-size:.9rem">${when(g.on_at)}</span></div>` : ""}</div>
      ${A.err ? `<div class="tp-note warn">${esc(A.err)}</div>` : ""}</div>`;
  }
  function vSubTabs() {
    const T = [["runs", "کارها"], ["calls", "فراخوانی‌های مدل"], ["sms", "پیامک‌ها"], ["phones", "دفترچهٔ شماره‌ها"], ["settings", "تنظیمات"]];
    return `<div class="tp-tabs" style="padding:12px 0 0">${T.map(([k, l]) => `<button class="tp-tab ${A.sub === k ? "on" : ""}" data-ai-sub="${k}">${l}</button>`).join("")}</div>`;
  }
  function vRuns() {
    const st = A.st;
    const rows = st.runs.map((r) => `<tr data-ai-run="${r.id}" style="cursor:pointer;${A.runId === r.id ? "background:rgba(79,140,255,.12)" : ""}">
        <td class="num">${esc(r.request_id)}</td><td class="party">${esc(r.party || "")}</td><td><span class="chip ${ST_CHIP[r.state] || ""}">${esc(r.state_fa)}</span>${r.error ? ` <span class="chip bad" title="${esc(r.error)}">خطا</span>` : ""}</td>
        <td class="num">${M(r.items)}</td><td class="num">${M(r.invited)} / ${M(r.engaged)} / ${M(r.finals)}</td><td class="num" dir="ltr">${usd(r.cost)}</td><td class="num">${when(r.updated_at)}</td></tr>`).join("");
    const open = st.open.length ? `<div class="tp-sect"><h3>ارجاع‌های بی کار <span>پیش از روشن شدن رسیده‌اند؛ خودکار برداشته نمی‌شوند</span></h3>
        ${st.open.map((a) => `<div style="display:flex;gap:8px;align-items:center;margin:4px 0"><span class="num">${esc(a.request_id)}</span><span class="muted">${esc(a.party || "")} · ${M(a.items)} قلم</span>
          <button class="tp-btn xs primary" data-ai-start="${a.id}">▶️ شروع</button></div>`).join("")}</div>` : "";
    return `<div class="tp-card tp-pane"><div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th>درخواست</th><th class="rt">طرف مقابل</th><th>مرحله</th><th>اقلام</th>
        <th title="دعوت‌شده / پاسخ‌داده / تأیید نهایی">دعوت / پاسخ / نهایی</th><th>هزینه</th><th>به‌روز</th></tr></thead><tbody>
        ${rows || `<tr><td colspan="7"><div class="empty">هنوز کاری نیست. ارجاعی به این کارشناس بفرستید (یا «▶️ شروع» پایین).</div></td></tr>`}</tbody></table></div>${open}</div>
      ${A.run ? vRun() : ""}`;
  }
  function vRun() {
    const d = A.run, r = d.run;
    const acts = [
      r.state === "paused" ? `<button class="tp-btn sm primary" data-ai-act="resume">▶️ ادامه</button>` : !r.finished_at ? `<button class="tp-btn sm warn" data-ai-act="pause">⏸ توقف</button>` : "",
      r.state === "work" ? `<button class="tp-btn sm" data-ai-act="finish" title="اگر هر قلم دست‌کم یک پیشنهادِ تأییدنهایی‌شده دارد، جدول کمیسیون و نامه همین حالا آماده شود — اگر کمتر از حداقلِ استعلام باشد، کمبود در نامه گفته می‌شود">🏁 پایان مذاکره و تحویل</button>` : "",
      !r.finished_at ? `<button class="tp-btn sm" data-ai-act="retry">🔁 تلاش دوباره</button>` : "",
      r.md ? `<button class="tp-btn sm" data-ai-dl="/ai/runs/${r.id}/md" data-name="پرونده-مذاکره-${esc(r.request_id)}.md">📄 پروندهٔ مذاکره (md)</button>` : "",
      C.chat(r),
      r.closing && r.closing.commission_no ? `<button class="tp-btn sm" data-ai-dl="/assignments/${r.assignment_id}/sheet/commission" data-name="کمیسیون-${esc(r.request_id)}.xlsx">📊 جدول کمیسیون</button>` : "",
      r.closing && r.closing.letter && r.closing.letter.file ? `<button class="tp-btn sm" data-ai-dl="/assignments/${r.assignment_id}/letter/file" data-name="نامه-${esc(r.request_id)}.docx">✉️ نامه</button>` : "",
    ].filter(Boolean).join(" ");
    const items = d.items.map((i) => `<tr><td class="rt">${esc(i.title)}</td><td class="num">${M(i.qty)} ${esc(i.unit || "")}</td><td class="rt muted">${esc(i.struct || "—")}</td>
        <td>${i.hist ? (i.hist.ok ? `${M(i.hist.n)} تأمین‌کننده` : `<span class="muted" title="${esc(i.hist.msg || "")}">بی سابقه</span>`) : "…"}</td>
        <td>${i.smart ? (i.smart.err ? `<span class="chip bad" title="${esc(i.smart.err)}">نشد</span>` : `${M(i.smart.n || 0)}${i.smart.reused ? " <span class=\"muted\">(جستجوی اخیر)</span>" : ""}`) : "…"}</td>
        <td title="${esc(i.why || "")}">${i.covered >= (i.need || 1) ? `<span class="chip ok">✅ ${M(i.covered)} از ${M(i.need || 1)}</span>` : i.covered ? `<span class="chip warn">${M(i.covered)} از ${M(i.need || 1)}</span>` : `<span class="chip">۰ از ${M(i.need || 1)}</span>`}</td></tr>`).join("");
    const phoneCell = (c) => [
      ...c.phones.map((p) => `<label class="sp-check" style="display:inline-flex;gap:4px;margin-inline-end:10px" title="${p.panel ? "تیکِ پنل: کارشناس هوشمند به این شماره پیامک می‌دهد" : "بی تیک: پیامکی نمی‌رود"}">
          <input type="checkbox" data-ai-panel="${p.id}" ${p.panel ? "checked" : ""} ${p.mobile ? "" : "disabled"}> <span dir="ltr">${esc(p.phone)}</span> <span class="muted">${esc(p.label || "")}${p.mobile ? "" : " — ثابت، پیامک نمی‌گیرد"}</span></label>`),
      ...c.found.map((p) => `<span style="display:inline-flex;gap:4px;align-items:center;margin-inline-end:10px"><span dir="ltr" class="muted">${esc(p.phone)}</span>
          ${p.mobile ? `<button class="tp-btn xs" data-ai-addfound="${esc(p.phone)}" data-name="${esc(c.name)}" title="این شماره را برای این تأمین‌کننده ثبت و تیکِ پنل بزن">➕ ثبت با تیکِ پنل</button>` : `<span class="dim">(ثابت)</span>`}</span>`),
      `<button class="tp-btn xs" data-ai-addphone="${esc(c.name)}" ${c.sid ? `data-sid="${c.sid}"` : ""}>➕ شماره</button>`,
    ].join("");
    const cands = d.candidates.map((c) => `<tr><td class="rt"><b>${esc(c.name)}</b>${c.invited ? ` <span class="chip ok">دعوت شد</span>` : ""}</td><td>${esc(c.src_fa)}${c.src === "history" && c.rank < 999 ? ` (رتبهٔ ${M(c.rank)})` : ""}</td>
        <td class="rt" style="white-space:normal">${phoneCell(c)}</td></tr>`).join("");
    const ths = d.threads.map((t) => `<tr><td class="rt">${esc(t.supplier)}</td><td dir="ltr">${esc(t.phone || "—")}</td><td>${esc(t.source_fa)}</td><td>${esc(TH_FA[t.state] || t.state)}</td>
        <td class="num">${M(t.turns)}</td><td class="num">${M(t.replies)}</td><td>${esc((t.bundles || []).join("، ") || "—")}</td>
        <td class="rt muted" style="white-space:normal;max-width:340px">${t.state === "ask" && t.ask ? `<b style="color:#fcd34d">🚨 ${esc(t.ask.q || "")}</b><br>` : ""}${esc(t.memo || "")}${t.fails ? ` <span class="chip bad">${M(t.fails)} شکست</span>` : ""}</td></tr>`).join("");
    const log = d.log.map((l) => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--tp-line)"><span class="muted num" style="min-width:110px">${when(l.at)}</span>
        <span>${KIND_ICON[l.kind] || "•"}</span><span style="white-space:pre-wrap">${esc(l.body)}</span></div>`).join("");
    const rep = r.closing && r.closing.report;
    return `<div class="tp-card tp-pane" style="margin-top:14px">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">درخواست <span class="num">${esc(r.request_id)}</span></h2>
        <span class="chip ${ST_CHIP[r.state] || ""}">${esc(r.state_fa)}</span>${r.finish ? `<span class="chip info">«پایان» خواسته شده</span>` : ""}
        <span class="muted">${M(d.calls.n)} فراخوانی · <span dir="ltr">${usd(d.calls.cost)}</span></span>
        <button class="tp-btn xs" data-ai-sub="calls" data-ai-runcalls="1">فراخوانی‌های همین کار</button></div>
      ${r.error ? `<div class="tp-note warn">${esc(r.error)}</div>` : ""}
      ${r.handover ? `<div class="tp-note warn">⚠️ ${when(r.handover.at)}: مهلتِ ${M(r.handover.hours)} ساعتهٔ حداقلِ استعلام گذشت و کار به کارشناس واگذار شد (سوابق و جستجو برایش باز) — ${(r.handover.items || []).map((x) => `${esc(x.title)} ${M(x.have)} از ${M(x.need)}`).join("، ")}</div>` : ""}
      ${r.review ? `<div class="tp-note ${r.review.state === "rejected" ? "warn" : ""}">${REVIEW_FA[r.review.state] || ""}${r.review.reason ? `: ${esc(r.review.reason)}` : ""} — تبِ «📥 تحویل‌های هوشمند»</div>` : ""}
      ${r.closing && r.closing.short && r.closing.short.length ? `<div class="tp-note warn">⚠️ با کمتر از حداقلِ استعلام بسته شد: ${r.closing.short.map((x) => `${esc(x.title)} ${M(x.have)} از ${M(x.need)}`).join("، ")}</div>` : ""}
      <div style="margin:10px 0;display:flex;gap:6px;flex-wrap:wrap">${acts}</div>
      <div class="tp-sect"><h3>اقلام</h3><div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">قلم</th><th>مقدار</th><th class="rt">ساختار</th><th>سوابق</th><th>جستجو</th><th title="پیشنهادهای تأییدنهایی از تأمین‌کنندگانِ مختلف / حداقلِ استعلامِ قلم (قواعدِ پنل پشتیبانی)">پیشنهادِ نهایی / حداقل</th></tr></thead><tbody>${items}</tbody></table></div></div>
      <div class="tp-sect"><h3>تأمین‌کنندگانِ نامزد <span>دعوت فقط برای شماره‌ای که تیکِ «پنل» دارد؛ سقفِ دعوت: ${M(A.st.agent.cfg.maxInvites)}</span></h3>
        <div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">تأمین‌کننده</th><th>منبع</th><th class="rt">شماره‌ها (☑️ = پنل)</th></tr></thead>
          <tbody>${cands || `<tr><td colspan="3"><div class="empty">هنوز نامزدی نیست (بعد از سوابق و جستجو).</div></td></tr>`}</tbody></table></div>
        ${r.finished_at ? "" : `<div class="tp-fields3" style="margin-top:10px;align-items:end">
          <div class="tp-field"><b>تأمین‌کنندهٔ دیگر (مثلاً شمارهٔ آزمایشیِ خودتان)</b><input class="tp-input" id="ai-ms-name" placeholder="نام تأمین‌کننده"></div>
          <div class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" id="ai-ms-phone" dir="ltr" inputmode="tel" placeholder="09…"></div>
          <div class="tp-field"><b>برچسب شماره</b><input class="tp-input" id="ai-ms-label" placeholder="همراه، فروش، شمارهٔ من…"></div>
          <div style="padding-bottom:2px"><label class="sp-check"><input type="checkbox" id="ai-ms-panel" checked> تیکِ پنل</label> <button class="tp-btn sm primary" data-ai-manual>➕ افزودن به این درخواست</button></div></div>`}</div>
      <div class="tp-sect"><h3>گفت‌وگوها</h3><div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">تأمین‌کننده</th><th>شماره</th><th>منبع</th><th>وضعیت</th><th>دورها</th><th>پیامِ تأمین‌کننده</th><th>بسته‌ها</th><th class="rt">یادداشتِ مذاکره (درونی)</th></tr></thead>
        <tbody>${ths || `<tr><td colspan="8"><div class="empty">هنوز دعوتی نرفته است.</div></td></tr>`}</tbody></table></div></div>
      ${rep ? `<div class="tp-sect"><h3>شرحِ پایانی</h3><p style="white-space:pre-wrap">${esc(rep.narrative)}</p>
        ${rep.criteria.length ? `<b>معیارها</b><ul>${rep.criteria.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${rep.challenges.length ? `<b>چالش‌ها</b><ul>${rep.challenges.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>` : ""}
      <div class="tp-sect"><h3>رخدادها</h3><div style="max-height:360px;overflow:auto">${log || `<div class="empty">—</div>`}</div></div></div>`;
  }
  function vCalls() {
    const rows = (A.calls || []).map((c) => `<tr data-ai-call="${c.id}" style="cursor:pointer"><td class="num">${when(c.at)}</td><td>${esc(c.purpose_fa)}</td><td dir="ltr">${esc(c.model || "—")}</td>
        <td>${esc(c.effort || "—")}</td><td class="num" dir="ltr">${tok(c)}</td><td class="num" dir="ltr">${usd(c.cost_usd)}</td><td class="num">${c.ms ? `${M(Math.round(c.ms / 100) / 10)} ث` : "—"}</td>
        <td>${c.error ? `<span class="chip bad" title="${esc(c.error)}">خطا</span>` : esc(c.status || "")}</td></tr>`).join("");
    return `<div class="tp-card tp-pane"><p class="lead">هر بار که سامانه برای کارشناس هوشمند به مدل زبانی پیام داده، با پرامپتِ دقیق (سیستم و پیام)، پاسخ، توکن‌ها و تخمینِ هزینه (دلار، با قیمتِ رسمی هر مدل) این‌جاست.
        روی هر ردیف بزنید.${A.runId ? ` <b>فقط کارِ درخواست ${esc((A.run && A.run.run.request_id) || "")}</b> — <button class="tp-btn xs" data-ai-allcalls>همه</button>` : ""}</p>
      <div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th>زمان</th><th>کار</th><th>مدل</th><th>تلاش</th><th>ورودی / خروجی</th><th>هزینه</th><th>زمان پاسخ</th><th>وضعیت</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8"><div class="empty">هنوز فراخوانی‌ای نیست.</div></td></tr>`}</tbody></table></div></div>`;
  }
  function vSms() {
    const s = A.sms || { sms: [] };
    const rows = s.sms.map((m) => `<tr><td class="num">${when(m.at)}</td><td class="rt">${esc(m.supplier)}</td><td dir="ltr">${esc(m.phone)}</td><td>${m.panel ? "☑️" : "—"}</td>
        <td>${m.kind === "pass" ? "رمز تازه" : "استعلام"}</td><td>${esc(VIA_FA[m.via] || m.via || "قدیمی")}</td><td class="rt" style="white-space:normal;max-width:240px">${esc(m.error || "")}</td>
        <td class="rt" style="white-space:pre-wrap;max-width:420px;font-size:.82rem">${esc(m.body)}</td></tr>`).join("");
    return `<div class="tp-card tp-pane"><p class="lead">پیامک‌های گفت‌وگوهای همین کارشناس: رفت یا نه، از چه راهی و چرا. رمزِ ورود در متن پوشیده است. ${s.ready ? "" : "<b>درگاه TextBee وصل نیست؛ پیامک‌ها شبیه‌سازی می‌شوند.</b>"}</p>
      <div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th>زمان</th><th class="rt">تأمین‌کننده</th><th>شماره</th><th>پنل</th><th>نوع</th><th>نتیجه</th><th class="rt">دلیل</th><th class="rt">متن</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="8"><div class="empty">هنوز پیامکی نیست.</div></td></tr>`}</tbody></table></div></div>`;
  }
  function vPhones() {
    const list = (A.phones || []).map((s) => `<tr><td class="rt"><b>${esc(s.name)}</b></td><td class="rt" style="white-space:normal">${s.phones.map((p) => `<label class="sp-check" style="display:inline-flex;gap:4px;margin-inline-end:12px">
        <input type="checkbox" data-ai-panel="${p.id}" ${p.panel ? "checked" : ""} ${p.mobile ? "" : "disabled"}> <span dir="ltr">${esc(p.phone)}</span> <span class="muted">${esc(p.label || "")}</span></label>`).join("") || `<span class="muted">شماره‌ای نیست</span>`}
        <button class="tp-btn xs" data-ai-addphone="${esc(s.name)}" data-sid="${s.id}">➕ شماره</button></td></tr>`).join("");
    return `<div class="tp-card tp-pane"><p class="lead">هر شماره مالِ یک تأمین‌کننده است و یک تأمین‌کننده می‌تواند چند شماره داشته باشد. تیکِ <b>«پنل»</b> یعنی پنلِ این تأمین‌کننده به این شماره وابسته است
        و کارشناس هوشمند می‌تواند به آن پیامک بدهد؛ بی تیک، هیچ پیامکی به آن شماره نمی‌رود. شمارهٔ ثابت پیامک نمی‌گیرد.</p>
      <div style="display:flex;gap:8px;margin-bottom:10px"><input class="tp-input" id="ai-q" placeholder="جستجوی نام یا شماره" value="${esc(A.q)}" style="max-width:280px"><button class="tp-btn sm" data-ai-q>جستجو</button></div>
      <div class="tp-scroll"><table class="tp-table" style="width:100%"><thead><tr><th class="rt">تأمین‌کننده</th><th class="rt">شماره‌ها (☑️ = پنل)</th></tr></thead>
        <tbody>${list || `<tr><td colspan="2"><div class="empty">چیزی پیدا نشد.</div></td></tr>`}</tbody></table></div>
      <div class="tp-fields3" style="margin-top:12px;align-items:end">
        <div class="tp-field"><b>تأمین‌کننده</b><input class="tp-input" id="ai-np-name" placeholder="نام تأمین‌کننده"></div>
        <div class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" id="ai-np-phone" dir="ltr" inputmode="tel" placeholder="09…"></div>
        <div class="tp-field"><b>برچسب</b><input class="tp-input" id="ai-np-label" placeholder="همراه مدیر فروش…"></div>
        <div style="padding-bottom:2px"><label class="sp-check"><input type="checkbox" id="ai-np-panel" checked> تیکِ پنل</label> <button class="tp-btn sm primary" data-ai-newphone>➕ ثبت</button></div></div></div>`;
  }
  const modelOpts = (sel) => (A.st.models || []).map((m) => `<option value="${esc(m.id)}" ${sel === m.id ? "selected" : ""}>${esc(m.fa)} — ورودی $${m.price[0]} / خروجی $${m.price[1]} در هر میلیون توکن</option>`).join("");
  const effortOpts = (sel) => (A.st.efforts || ["low", "medium", "high"]).map((e) => `<option value="${e}" ${sel === e ? "selected" : ""}>${{ low: "کم (سریع و ارزان)", medium: "متوسط (پیش‌فرض)", high: "زیاد (دقیق‌تر، کندتر)" }[e] || e}</option>`).join("");
  function vSettings() {
    const c = A.st.agent.cfg, mk = A.st.markets;
    const f = (k, lab, hint) => `<div class="tp-field"><b>${lab}</b><input class="tp-input" data-ai-cfg="${k}" inputmode="numeric" value="${esc(c[k])}"><span class="dim" style="font-size:.78rem">${hint}</span></div>`;
    return `<div class="tp-card tp-pane">
      <div class="tp-sect" style="margin-top:0"><h3>مدلِ مذاکره و شرحِ پایانی <span>خوانشِ پیش‌فاکتور، تفکیکِ قلم، جستجو و نامه مدلِ خودشان را دارند</span></h3>
        <div class="tp-fields3"><div class="tp-field" style="min-width:min(520px,100%)"><b>مدل</b><select class="tp-select tp-input" data-ai-model>${modelOpts(c.model)}</select></div>
          <div class="tp-field"><b>عمقِ فکر (effort)</b><select class="tp-select tp-input" data-ai-effort>${effortOpts(c.effort)}</select></div></div>
        <p class="dim" style="font-size:.8rem;margin:6px 0 0">گامِ فوریِ بعد از پیامِ تأمین‌کننده فقط به پیام جواب می‌دهد، با عمقِ «کم» و زیرِ ۳۰ ثانیه. هر تصمیم روی بسته (تأیید، برگشت، رد، تأیید نهایی) در Cron و با همین انتخاب گرفته می‌شود، حداکثر حدود یک دقیقه بعد. Haiku «عمقِ فکر» را نمی‌پذیرد.
          برای سنجیدنِ تفاوتِ مدل‌ها روی گفت‌وگوهای خودتان: «فراخوانی‌های مدل» ← یک دورِ مذاکره ← «🔬 مقایسه با مدلِ دیگر».</p></div>
      <div class="tp-fields3">
        ${f("minInvites", "حداقلِ دعوت (هدف)", "بی شمارهٔ پنل دعوتی نمی‌رود؛ کمتر از این، چالش در نامه گفته می‌شود")}
        ${f("maxInvites", "سقفِ دعوت در هر درخواست", "")}
        ${f("quietMin", "پایانِ مذاکره بعد از سکوت (دقیقه)", "وقتی هر قلم پیشنهادِ نهایی دارد و این‌قدر پیامِ تازه‌ای نیامده")}
        ${f("maxTurns", "سقفِ دورِ مذاکره در هر گفت‌وگو", "")}
        ${f("maxItems", "سقفِ اقلامِ هر درخواست", "بیشتر از این، فقط همین تعداد اول")}
        ${f("reuseDays", "جستجوی هوشمندِ تازه‌تر از (روز) دوباره خرج نشود", "۰ = همیشه جستجوی تازه")}</div>
      <div class="tp-sect"><h3>بازارهای جستجوی هوشمند <span>حداکثر ${M(A.st.maxMarkets)}</span></h3>
        ${mk.map((m) => `<label class="sp-check" style="display:inline-flex;gap:4px;margin-inline-end:12px"><input type="checkbox" data-ai-mk="${m.key}" ${c.markets.includes(m.key) ? "checked" : ""}> ${esc(m.fa)}</label>`).join("")}</div>
      <div style="margin-top:12px"><button class="tp-btn primary" data-ai-savecfg>ذخیرهٔ تنظیمات</button> <span id="ai-cfg-msg" class="muted"></span></div></div>`;
  }

  function view(S) {
    if (!A.st) { if (!A.loading) load(); return `<div class="tp-wrap"><div class="tp-card tp-pane">در حال بارگذاری…${A.err ? `<div class="tp-note warn">${esc(A.err)}</div>` : ""}</div></div>`; }
    tick(S);
    const body = A.sub === "calls" ? vCalls() : A.sub === "sms" ? vSms() : A.sub === "phones" ? vPhones() : A.sub === "settings" ? vSettings() : vRuns();
    return `<div class="tp-wrap" style="padding-bottom:30px">${vHead()}${vSubTabs()}<div style="margin-top:10px">${body}</div></div>`;
  }

  /* ---------- کارها ---------- */
  const fail = (e) => TP.modal("نشد", esc(e.message), null, "باشد", "");
  async function act(fn) { try { await fn(); await load(); } catch (e) { fail(e); } }
  async function download(path, name) {
    if (C.download) return C.download(path, name).catch(fail);
    try {
      const res = await fetch((window.TAMIN_POSHTIBANI_CONFIG.apiBase || "/tamin-poshtibani/api") + path, { headers: TP.authHeaders() });
      if (!res.ok) { let m = `خطای ${res.status}`; try { m = (await res.json()).error || m; } catch (_) { /* متن */ } throw new Error(m); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a"); a.href = url; a.download = name || "file"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { fail(e); }
  }
  function phoneDialog(name, sid) {
    TP.modal(`➕ شماره برای «${esc(name)}»`, `<div class="tp-field"><b>شمارهٔ همراه</b><input class="tp-input" id="ai-pd-phone" dir="ltr" inputmode="tel" placeholder="09…"></div>
      <div class="tp-field" style="margin-top:8px"><b>برچسب</b><input class="tp-input" id="ai-pd-label" placeholder="همراه، فروش، دفتر…"></div>
      <label class="sp-check" style="margin-top:8px;display:block"><input type="checkbox" id="ai-pd-panel" checked> تیکِ «پنل» — کارشناس هوشمند می‌تواند به این شماره پیامک بدهد</label>`,
    () => act(() => api("/ai/phones", { body: { supplier_id: sid || undefined, supplier_name: name, phone: document.getElementById("ai-pd-phone").value,
      label: document.getElementById("ai-pd-label").value, panel: document.getElementById("ai-pd-panel").checked } })), "ثبت");
  }
  function callDialog(c) {
    let req = null, res = null;
    try { req = JSON.parse(c.request_json); } catch (_) { /* بریده */ }
    try { res = JSON.parse(c.response_json); } catch (_) { /* جریانی یا بریده */ }
    const sys = req ? (Array.isArray(req.system) ? req.system.map((x) => x.text).join("\n\n") : req.system || "") : "";
    const user = req ? (req.messages || []).map((mm) => (Array.isArray(mm.content) ? mm.content.map((x) => (x.type === "text" ? x.text : `[${x.type}${x.source && x.source.url ? " — پیوستِ سند" : ""}]`)).join("\n") : mm.content)).join("\n\n—\n\n") : (c.request_json || "");
    const out = res ? (res.content || []).map((x) => (x.type === "text" ? x.text : x.type === "tool_use" ? JSON.stringify(x.input, null, 2) : "")).filter(Boolean).join("\n\n") : (c.response_json || "");
    const pre = (t) => `<pre style="white-space:pre-wrap;max-height:42vh;overflow:auto;background:rgba(3,8,20,.5);border:1px solid var(--tp-line);border-radius:8px;padding:8px;font-size:.78rem;direction:auto">${esc(t)}</pre>`;
    /* مقایسه: همان درخواست با مدل یا عمقِ فکرِ دیگر — فقط دورهای مذاکره و شرحِ پایانی (خروجیِ ساختاریافته) */
    const canReplay = ["negotiate", "closing", "compare"].includes(c.purpose) && !!req;
    const d = TP.modal(`${esc(c.purpose_fa)} — ${when(c.at)}`, `<div class="muted" style="margin-bottom:6px" dir="ltr">${esc(c.model || "")} · effort ${esc(c.effort || "—")} · ${tok(c)} · ${usd(c.cost_usd)}${c.error ? ` · ${esc(c.error)}` : ""}</div>
      <b>پرامپتِ سیستم</b>${pre(sys || "—")}<b>پیامِ ارسالی</b>${pre(user || "—")}<b>پاسخِ مدل</b>${pre(out || "—")}
      ${req && req.tools ? `<b>ابزار</b>${pre(JSON.stringify(req.tools, null, 2).slice(0, 6000))}` : ""}${req && req.output_config ? `<b>output_config</b>${pre(JSON.stringify(req.output_config, null, 2).slice(0, 6000))}` : ""}
      ${canReplay ? `<div style="margin-top:12px;border-top:1px solid var(--tp-line);padding-top:10px"><b>🔬 مقایسه با مدلِ دیگر</b>
        <p class="dim" style="font-size:.8rem;margin:4px 0">همین پرامپتِ سیستم و همین پرونده، با مدلِ دیگر؛ فقط پاسخ نشان داده می‌شود و <b>هیچ تصمیمی اجرا نمی‌شود</b>. هزینه دارد و در همین فهرست ثبت می‌شود.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><select class="tp-select tp-input" id="ai-rp-model" style="max-width:520px">${modelOpts(c.model)}</select>
          <select class="tp-select tp-input" id="ai-rp-effort" style="max-width:220px">${effortOpts(c.effort || "medium")}</select><button class="tp-btn sm primary" id="ai-rp-go">اجرا</button></div>
        <div id="ai-rp-out" style="margin-top:8px"></div></div>` : ""}`, null, "بستن", "");
    const box = d.querySelector(".tp-modal"); if (box) { box.style.maxWidth = "min(1100px, 96vw)"; box.style.width = "96vw"; }
    const go = d.querySelector("#ai-rp-go");
    if (go) go.onclick = async () => {
      const o = d.querySelector("#ai-rp-out");
      go.disabled = true; o.innerHTML = `<span class="muted">در حال اجرا…</span>`;
      try {
        const r = await api(`/ai/calls/${c.id}/replay`, { body: { model: d.querySelector("#ai-rp-model").value, effort: d.querySelector("#ai-rp-effort").value } });
        const k = r.call || {};
        o.innerHTML = `<div class="muted" dir="ltr">${esc(r.model)} · effort ${esc(k.effort || "—")} · ${tok(k)} · ${usd(k.cost_usd)} · ${M(Math.round((r.ms || 0) / 100) / 10)} ث</div>`
          + `<div style="display:flex;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:280px"><b>پاسخِ اصلی (${esc(c.model || "")})</b>${pre(out || "—")}</div>`
          + `<div style="flex:1;min-width:280px"><b>پاسخِ ${esc(r.model)}</b>${pre(JSON.stringify(r.out, null, 2))}</div></div>`;
      } catch (e) { o.innerHTML = `<div class="tp-note warn">${esc(e.message)}</div>`; }
      go.disabled = false;
    };
  }

  function wire(root, S, render) {
    A.render = render;
    const Q = (s) => root.querySelectorAll(s), G = (s) => root.querySelector(s);
    Q("[data-ai-sub]").forEach((b) => b.onclick = async () => { A.sub = b.dataset.aiSub; if (!b.dataset.aiRuncalls && A.sub !== "runs" && A.sub !== "calls") { /* هر زیرتب داده‌اش را دارد */ } await load(); });
    Q("[data-ai-mode]").forEach((b) => b.onclick = () => {
      const on = b.dataset.aiMode === "on";
      TP.modal(on ? "🤖 هوشمند" : "✋ دستی", on
        ? "از این لحظه هر ارجاعی که به این کارشناس برسد خودکار پیش می‌رود (سوابق، جستجوی هوشمند، دعوت، مذاکره و تصمیم) و همین کارها برای خودِ کارشناس قفل می‌شود. پیامک فقط به شماره‌های تیک‌خوردهٔ «پنل» می‌رود. هوشمند شود؟"
        : "همهٔ کارهای کارشناس هوشمند همان لحظه نگه داشته می‌شوند و قفل‌های کارشناس برداشته می‌شوند؛ از این پس خودش دستی کار می‌کند. دستی شود؟",
      () => act(() => api("/ai/mode", { method: "PUT", body: { on } })), on ? "هوشمند شود" : "دستی شود");
    });
    Q("[data-ai-run]").forEach((x) => x.onclick = async () => { A.runId = +x.dataset.aiRun; A.run = null; await load(); });
    Q("[data-ai-start]").forEach((b) => b.onclick = () => TP.modal("شروعِ کارشناس هوشمند", "کار روی این ارجاع از سوابق و جستجوی هوشمند شروع می‌شود (جستجوی هوشمند هزینهٔ مدل دارد). شروع شود؟",
      () => act(async () => { const r = await api("/ai/runs", { body: { assignment_id: +b.dataset.aiStart } }); A.runId = r.run_id; A.sub = "runs"; }), "شروع"));
    Q("[data-ai-act]").forEach((b) => b.onclick = () => act(() => api(`/ai/runs/${A.runId}/act`, { body: { action: b.dataset.aiAct } })));
    Q("[data-ai-dl]").forEach((b) => b.onclick = () => download(b.dataset.aiDl, b.dataset.name));
    Q("[data-ai-panel]").forEach((c) => c.onchange = () => act(() => api(`/ai/phones/${c.dataset.aiPanel}`, { method: "PUT", body: { panel: c.checked } })));
    Q("[data-ai-addphone]").forEach((b) => b.onclick = () => phoneDialog(b.dataset.aiAddphone, b.dataset.sid ? +b.dataset.sid : null));
    Q("[data-ai-addfound]").forEach((b) => b.onclick = () => TP.modal("ثبت با تیکِ پنل", `شمارهٔ <b dir="ltr">${esc(b.dataset.aiAddfound)}</b> برای «${esc(b.dataset.name)}» ثبت شود و تیکِ «پنل» بخورد؟ بعدش کارشناس هوشمند می‌تواند به آن پیامکِ استعلام بدهد.
      <div class="tp-field" style="margin-top:8px"><b>برچسب</b><input class="tp-input" id="ai-af-label" value="جستجوی هوشمند"></div>`,
    () => act(() => api("/ai/phones", { body: { supplier_name: b.dataset.name, phone: b.dataset.aiAddfound, label: document.getElementById("ai-af-label").value || "جستجوی هوشمند", panel: true } })), "ثبت و تیک"));
    const man = G("[data-ai-manual]");
    if (man) man.onclick = () => act(() => api(`/ai/runs/${A.runId}/supplier`, { body: { supplier_name: G("#ai-ms-name").value, phone: G("#ai-ms-phone").value, label: G("#ai-ms-label").value, panel: G("#ai-ms-panel").checked } }));
    Q("[data-ai-call]").forEach((x) => x.onclick = async () => { try { callDialog((await api(`/ai/calls/${x.dataset.aiCall}`)).call); } catch (e) { fail(e); } });
    const all = G("[data-ai-allcalls]"); if (all) all.onclick = async () => { A.runId = null; A.run = null; await load(); };
    const qb = G("[data-ai-q]"); if (qb) { const go = async () => { A.q = G("#ai-q").value.trim(); await load(); }; qb.onclick = go; G("#ai-q").onkeydown = (e) => { if (e.key === "Enter") go(); }; }
    const np = G("[data-ai-newphone]");
    if (np) np.onclick = () => act(() => api("/ai/phones", { body: { supplier_name: G("#ai-np-name").value, phone: G("#ai-np-phone").value, label: G("#ai-np-label").value, panel: G("#ai-np-panel").checked } }));
    const sv = G("[data-ai-savecfg]");
    if (sv) sv.onclick = async () => {
      const body = {};
      Q("[data-ai-cfg]").forEach((i) => { body[i.dataset.aiCfg] = Number(TP.digits(i.value)); });
      body.markets = [...Q("[data-ai-mk]")].filter((x) => x.checked).map((x) => x.dataset.aiMk);
      const mdl = G("[data-ai-model]"), eff = G("[data-ai-effort]");
      if (mdl) body.model = mdl.value;
      if (eff) body.effort = eff.value;
      if (body.markets.length > A.st.maxMarkets) return fail(new Error(`حداکثر ${A.st.maxMarkets} بازار.`));
      try { await api("/ai/config", { method: "PUT", body }); await load(); const m = document.getElementById("ai-cfg-msg"); if (m) m.textContent = "ذخیره شد ✓"; } catch (e) { fail(e); }
    };
  }

  window.TP_AI = { view, wire, load, reset: () => { A.st = null; A.run = null; A.runId = null; A.calls = null; A.sms = null; A.phones = null; A.sub = "runs"; A.err = ""; }, configure: (o) => Object.assign(C, o) };
})();
