/* ============================================================
   مکاتبات کارشناس با تأمین‌کنندگان (دموی مهر ۱۴۰۵) — مرورگر و مینی‌اپ تلگرام
   چیدمان: دو ستونِ چسبیده به هم و به لبهٔ راست — درخواست‌ها و تأمین‌کنندگانِ درخواستِ انتخاب‌شده (با شمار
   نخوانده) — و بقیهٔ صفحه گفت‌وگو. هر گفت‌وگو = یک درخواست × یک تأمین‌کننده. تب «اقلام و تصمیم‌ها»:
   بسته‌هایی که تأمین‌کننده فرستاده و تصمیم روی آن‌ها؛ خوانش هوشمند پیش‌فاکتور با جدول تطابق (✅/⚠️/❌)، پذیرش
   مغایرت‌ها (پیش‌فاکتور ملاک) و تأیید نهایی ← تب استعلامات. ورود: کد کارشناس یا initData مینی‌اپ.
   ============================================================ */
(function () {
  "use strict";
  const TP = window.TP;
  const app = document.getElementById("app");
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = TP.esc;
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]);
  const money = (n) => (n == null || !isFinite(n) ? "—" : fa(Math.round(Number(n)).toLocaleString("en-US")).replace(/,/g, "٬"));
  const qty = (n) => (n == null ? "—" : fa(String(Math.round(Number(n) * 1000) / 1000)));
  const code = (l) => (l && l.no ? `<span class="sp-code">کد ${fa(l.no)}</span> ` : "");
  function when(ms) {
    try { return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms)); }
    catch (_) { return fa(new Date(ms).toLocaleTimeString()); }
  }

  /* ---------- مینی‌اپ تلگرام ---------- */
  const hp = new URLSearchParams(location.hash.slice(1));
  const ss = { get(k) { try { return sessionStorage.getItem(k) || ""; } catch (_) { return ""; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) { /* حالت خصوصی */ } } };
  let tgData = hp.get("tgWebAppData") || "";
  if (tgData) ss.set("sp.tg.e", tgData); else tgData = ss.get("sp.tg.e");
  /* spApp: مینی‌اپِ بات مکاتبات همین صفحه را مستقیم باز کرده است. از پنل کارشناسِ مینی‌اپِ بات کارشناسان هم
     می‌شود به این‌جا آمد (TP.tg در shared.js) — آن‌وقت راهِ برگشت به پنل کارشناس می‌ماند. */
  const spApp = !!tgData;
  if (!tgData) tgData = TP.tg || "";
  const inTg = !!tgData;
  if (spApp) {
    try {
      const tp = JSON.parse(hp.get("tgWebAppThemeParams") || "null");
      if (tp && tp.bg_color && !localStorage.getItem("tp.theme")) {
        const v = parseInt(tp.bg_color.slice(1), 16), lum = ((v >> 16) & 255) * 0.299 + ((v >> 8) & 255) * 0.587 + (v & 255) * 0.114;
        TP.theme.apply(lum < 128 ? "dark" : "light");
      }
    } catch (_) { /* بی‌اهمیت */ }
    if (!TP.tg) {
      const s = document.createElement("script"); s.src = "https://telegram.org/js/telegram-web-app.js"; s.async = true;
      s.onload = () => { try { window.Telegram.WebApp.ready(); window.Telegram.WebApp.expand(); } catch (_) { /* بی‌اهمیت */ } };
      document.head.appendChild(s);
    }
  }
  const api = (path, opt) => TP.api(path, { ...(opt || {}), headers: { ...((opt && opt.headers) || {}), ...(inTg ? { "X-TG-Init": tgData } : {}) } });

  const S = { me: null, reqs: [], unread: 0, waiting: 0, aid: +ss.get("sp.aid") || null, th: +ss.get("sp.th.e") || null, d: null, tab: "chat", view: "req",
    lastMsg: 0, rev: -1, bot: null, via: "web", aiCost: "", demoName: "", busy: false };

  /* ---------- پنجره با دکمه‌های دلخواه؛ fn(close) — اگر false برگرداند پنجره می‌ماند ---------- */
  function dlg(title, body, buttons) {
    const d = document.createElement("div"); d.className = "tp-modal-bg";
    d.innerHTML = `<div class="tp-modal" role="dialog" aria-modal="true"><h3>${title}</h3><div class="tp-body">${body}</div><div class="tp-acts"></div></div>`;
    const acts = d.querySelector(".tp-acts");
    const close = () => d.remove();
    for (const b of buttons || [{ label: "باشد", cls: "primary" }]) {
      const el = document.createElement("button"); el.className = `tp-btn ${b.cls || ""}`; el.textContent = b.label;
      el.onclick = async () => { if (!b.fn) return close(); el.disabled = true; try { const r = await b.fn(d); if (r !== false) close(); } catch (e) { const er = d.querySelector("[data-err]"); if (er) er.textContent = e.message; else alert(e.message); } el.disabled = false; };
      acts.appendChild(el);
    }
    d.onclick = (e) => { if (e.target === d) close(); };
    document.body.appendChild(d);
    return d;
  }
  const say = (msg, title) => dlg(title || "توجه", `<p style="white-space:pre-line">${esc(msg)}</p>`);

  /* ---------- ورود ---------- */
  function top() {
    return `<header class="tp-top"><div class="brand"><img src="../assets/logo-new.jpg" alt=""><div><h1>مکاتبات با تأمین‌کنندگان</h1>
      <div class="sub">${S.me ? `${esc(S.me.label || S.me.name)} · ` : ""}دموی پنل تأمین‌کننده</div></div></div><span class="spacer"></span>
      ${S.me && S.via !== "telegram" ? `<button class="tp-btn sm" data-tg>💬 بات مکاتبات</button>` : ""}
      ${TP.themeBtn()}${S.me && !spApp ? `<a class="tp-back" href="expert.html">پنل کارشناس</a>` : ""}</header>`;
  }
  function renderLogin(msg) {
    app.classList.remove("sp-app");
    app.innerHTML =`${top()}<div class="sp-center"><div class="sp-box"><h2>ورود کارشناس</h2><p class="lead">همان کد ورود پنل کارشناس.</p>
      <input class="tp-input" id="code" inputmode="numeric" placeholder="کد ورود" style="width:100%"><div class="sp-row" style="margin-top:12px"><button class="tp-btn primary sp-grow" id="go">ورود</button></div>
      <div class="sp-err" id="msg">${esc(msg || "")}</div></div></div>`;
    const go = async () => {
      try { const r = await TP.api("/login", { body: { code: TP.digits ? TP.digits($("#code").value).trim() : $("#code").value.trim() } }); TP.session.set(r.expert); boot(); }
      catch (e) { $("#msg").textContent = e.message; }
    };
    $("#go").onclick = go; $("#code").onkeydown = (e) => { if (e.key === "Enter") go(); }; $("#code").focus();
  }

  /* ---------- بارگذاری ---------- */
  async function loadList() {
    const d = await api("/sp/x/threads");
    S.reqs = d.requests || []; S.unread = d.unread; S.waiting = d.waiting; S.me = d.me; S.bot = d.bot; S.via = d.via; S.aiCost = d.ai_cost; S.demoName = d.demo;
  }
  async function boot() {
    const ses = TP.session.get();
    if (!inTg && !(ses && ses.code)) return renderLogin();
    try {
      await loadList();
      if (S.th && !findThread(S.th)) S.th = null;
      if (S.aid && !S.reqs.some((g) => g.assignment_id === S.aid)) S.aid = null;
      if (!S.aid) { const g = S.reqs.find((x) => x.threads.length); if (g) S.aid = g.assignment_id; }
      if (S.th) { S.view = "chat"; await loadThread(); } else { S.view = S.aid ? "sup" : "req"; render(); }
      startPoll();
    } catch (e) {
      if (e.status === 401 && !inTg) { TP.session.clear(); return renderLogin(e.message); }
      app.innerHTML = `${top()}<div class="sp-center"><div class="sp-box"><h2>نشد</h2><p class="sp-err">${esc(e.message)}</p></div></div>`;
    }
  }
  function findThread(id) { for (const g of S.reqs) for (const t of g.threads) if (t.id === id) return { g, t }; return null; }
  async function loadThread() {
    const d = await api(`/sp/thread/${S.th}`);
    S.d = d; S.rev = d.thread.rev; S.lastMsg = d.msgs.length ? d.msgs[d.msgs.length - 1].id : 0;
    const f = findThread(S.th); if (f) { S.unread -= f.t.unread; f.g.unread -= f.t.unread; f.t.unread = 0; S.aid = f.g.assignment_id; }
    ss.set("sp.th.e", String(S.th)); ss.set("sp.aid", String(S.aid || ""));
    render();
  }

  /* ---------- رسم ---------- */
  const badge = (n, cls) => (n ? `<span class="sp-badge ${cls || ""}">${fa(n)}</span>` : "");
  function reqList() {
    const withT = S.reqs.filter((g) => g.threads.length), rest = S.reqs.filter((g) => !g.threads.length);
    const item = (g) => `<button class="sp-item ${S.aid === g.assignment_id ? "on" : ""}" data-aid="${g.assignment_id}">
      <div class="t"><span>${esc(g.request_id)}</span>${badge(g.unread)}${badge(g.waiting, "wait")}</div>
      <div class="m">${esc(g.party || "")}${g.threads.length ? ` · ${fa(g.threads.length)} تأمین‌کننده` : ` · ${fa(g.open_items)} قلم باز`}</div></button>`;
    return (withT.map(item).join("") || `<div class="sp-empty">هنوز گفت‌وگویی نیست.</div>`)
      + (rest.length ? `<div class="sp-muted" style="padding:8px 12px">درخواست‌های باز بدون گفت‌وگو</div>${rest.map(item).join("")}` : "");
  }
  function supList() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    if (!g) return `<div class="sp-empty">یک درخواست را انتخاب کنید.</div>`;
    if (!g.threads.length) return `<div class="sp-empty">برای این درخواست هنوز به تأمین‌کننده‌ای استعلام نرفته است.</div>`;
    return g.threads.map((t) => `<button class="sp-item ${S.th === t.id ? "on" : ""}" data-th="${t.id}">
      <div class="t"><span>${esc(t.supplier)}</span>${t.demo ? `<span class="sp-tag">فرضی</span>` : ""}${badge(t.unread)}${badge(t.waiting, "wait")}</div>
      <div class="m">📞 ${esc(t.phone || "")}${t.phone_label ? ` (${esc(t.phone_label)})` : ""} · ${fa(t.lines)} قلم</div></button>`).join("");
  }
  function render() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    app.classList.add("sp-app");
    app.innerHTML = `${top()}<div class="sp-full"><div class="sp-cols" data-view="${S.view}">
      <aside class="sp-col reqs"><h4>درخواست‌ها ${badge(S.unread)}${badge(S.waiting, "wait")}</h4><div class="scroll" data-reqs>${reqList()}</div></aside>
      <aside class="sp-col sups"><h4><button class="tp-btn xs sp-back" data-back="req">→</button>${g ? `تأمین‌کنندگانِ ${esc(g.request_id)}` : "تأمین‌کنندگان"}</h4>
        <div class="scroll" data-sups>${supList()}</div>${g && g.open_items ? `<div class="sp-colfoot"><button class="tp-btn primary sm" data-send>➕ ارسال استعلام</button></div>` : ""}</aside>
      <section class="sp-main">${S.th && S.d ? convo() : `<div class="sp-empty" style="margin-top:12vh">یک تأمین‌کننده را انتخاب کنید.<br><span class="sp-muted">پیام‌ها، اقلام و تصمیم‌ها این‌جا می‌آیند.</span></div>`}</section>
    </div></div>`;
    bind();
    const c = $("#chat"); if (c) c.scrollTop = c.scrollHeight;
    if (S.tab === "items" && S.mainScroll) { const m = $(".sp-main"); if (m) m.scrollTop = S.mainScroll; }
  }
  function convo() {
    const th = S.d.thread;
    const waiting = S.d.bundles.filter((b) => ["pending", "proforma"].includes(b.state)).length;
    return `<div class="sp-head"><button class="tp-btn xs sp-back" data-back="sup">→</button><h3>${esc(th.supplier)}</h3>${th.demo ? `<span class="sp-tag">تأمین‌کنندهٔ فرضی</span>` : ""}
      <span class="sp-muted">📞 ${esc(th.phone || "")}${th.phone_label ? ` (${esc(th.phone_label)})` : ""} · درخواست ${esc(th.request_id)}</span></div>
      <nav class="sp-tabs"><button class="sp-tab ${S.tab === "chat" ? "on" : ""}" data-tab="chat">گفت‌وگو</button>
        <button class="sp-tab ${S.tab === "items" ? "on" : ""}" data-tab="items">اقلام و تصمیم‌ها${badge(waiting, "wait")}</button></nav>
      <div id="pane" class="${S.tab === "chat" ? "sp-chatpane" : ""}">${S.tab === "chat" ? chatPane() : itemsPane()}</div>`;
  }
  function msgHtml(m) {
    if (m.kind === "event" || m.kind === "note") return `<div class="sp-msg ev ${m.kind === "note" ? "note" : ""}">${esc(m.body)}${m.kind === "note" ? " <i>(فقط شما می‌بینید)</i>" : ""}<time>${when(m.at)}</time></div>`;
    const me = m.who === "e";
    return `<div class="sp-msg ${me ? "me" : ""}"><span class="who">${me ? "شما" : esc(S.d.thread.supplier)}</span>${esc(m.body)}<time>${when(m.at)}</time></div>`;
  }
  function chatPane() {
    return `<div class="sp-chat" id="chat">${S.d.msgs.length ? S.d.msgs.map(msgHtml).join("") : `<div class="sp-empty">هنوز پیامی نیست.</div>`}</div>
      <div class="sp-composer"><textarea class="tp-input" id="msgIn" rows="2" placeholder="پیام به ${esc(S.d.thread.supplier)}…"></textarea><button class="tp-btn primary" id="sendMsg">ارسال</button></div>`;
  }

  /* --- جدول تطابق --- */
  const ICON = { ok: "✅", warn: "⚠️", bad: "❌" };
  const acceptable = (row) => row.status !== "ok" && row.got != null && row.got !== "" && !row.noaccept;
  const val = (v, row) => (v == null || v === "" ? "—" : row.key === "price" ? money(v) : typeof v === "number" ? qty(v) : esc(v));
  function matchTable(b) {
    const ai = b.ai, acc = b.accept || {};
    const tr = (row, k) => {
      const on = !!acc[k] && acceptable(row);
      return `<tr class="${row.gate ? "" : "info"}"><td class="t">${esc(row.label)}${row.gate ? "" : ` <span class="sp-muted">(اطلاعاتی)</span>`}</td>
        <td>${row.kind === "terms" ? `<span class="sp-muted">—</span>` : val(row.want, row)}</td>
        <td>${val(row.got, row)}${row.def ? ` <span class="sp-muted">(پیش‌فرض شرکت)</span>` : ""}${row.note ? `<div class="sp-muted">${esc(row.note)}</div>` : ""}</td>
        <td class="sp-mst">${on ? "✔️" : ICON[row.status]}</td>
        <td>${acceptable(row) && b.state === "proforma" ? `<label class="sp-acc"><input type="checkbox" data-acc="${esc(k)}" ${on ? "checked" : ""}> پیش‌فاکتور ملاک</label>` : ""}</td></tr>`;
    };
    let h = `<div class="sp-match"><div class="sp-row"><b>🤖 جدول تطابق با پیش‌فاکتور</b><span class="sp-muted">✅ همان · ⚠️ نیامده یا نامطمئن · ❌ فرق دارد · ✔️ پذیرفته (پیش‌فاکتور ملاک)</span></div>`;
    for (const ln of ai.lines || []) {
      const l = S.d.lines.find((x) => x.id === ln.line_id) || ln;
      h += `<h5>${code(l)}${esc(ln.title)}${ln.found ? "" : ` <span class="sp-err">— در پیش‌فاکتور پیدا نشد</span>`}</h5>
        <div class="sp-scroll"><table class="sp-table sp-mt"><thead><tr><th class="t">لایه / فیلد</th><th>بستهٔ تأمین‌کننده</th><th>پیش‌فاکتور</th><th>وضعیت</th><th>پذیرش</th></tr></thead>
        <tbody>${(ln.rows || []).map((row) => tr(row, `${ln.line_id}|${row.key}`)).join("")}</tbody></table></div>`;
    }
    h += `<h5>شرایط فاکتور</h5><div class="sp-scroll"><table class="sp-table sp-mt"><thead><tr><th class="t">فیلد</th><th></th><th>پیش‌فاکتور</th><th>وضعیت</th><th>پذیرش</th></tr></thead>
      <tbody>${(ai.header || []).map((row) => tr(row, `h|${row.key}`)).join("")}</tbody></table></div>`;
    h += b.ready ? `<div class="sp-ok">✅ همه‌چیز برای تأیید نهایی آماده است — مقدارهای پیش‌فاکتور به تب استعلامات می‌روند.</div>`
      : `<div class="sp-err">⛔ مانده:\n${(b.problems || []).map((p) => `• ${esc(p)}`).join("\n")}</div>`;
    if (ai.cost_usd != null) h += `<div class="sp-muted">هزینهٔ این خوانش: ${fa(ai.cost_usd)} دلار</div>`;
    return h + `</div>`;
  }

  /* --- اقلام و تصمیم‌ها --- */
  const fileLinks = (lineId) => S.d.files.filter((f) => f.line_id === lineId)
    .map((f) => `<button class="tp-btn xs" data-file="${f.id}" title="${esc(f.note || "")}">📎 ${esc(f.label)}</button>`).join(" ");
  function bundleCard(b, byId) {
    const ls = b.line_ids.map((id) => byId.get(id)).filter(Boolean);
    const sum = ls.reduce((s, l) => s + (l.total || 0), 0);
    let h = `<div class="sp-bundle" data-b="${b.id}"><header><b>بستهٔ ${fa(b.id)}</b><span class="sp-st ${b.state}">${esc(b.state_fa)}</span><span class="sp-muted">${when(b.created_at)}</span></header>
      <div class="sp-scroll"><table class="sp-table"><thead><tr><th class="t">قلم</th><th>مقدار</th><th>قیمت واحد (ریال)</th><th>قیمت کل (ریال)</th></tr></thead><tbody>
      ${ls.map((l) => `<tr><td class="t">${code(l)}${esc(l.title)}${l.extra.length ? `<div class="sp-muted">➕ ${l.extra.map((x) => `${esc(x.k)}: ${esc(x.v)}`).join("، ")}</div>` : ""}${fileLinks(l.id) ? `<div>${fileLinks(l.id)}</div>` : ""}</td>
        <td>${qty(l.qty)} ${esc(l.unit || "")}</td><td>${money(l.price)}</td><td>${money(l.total)}</td></tr>`).join("")}
      </tbody><tfoot><tr><td class="t">جمع</td><td></td><td></td><td>${money(sum)}</td></tr></tfoot></table></div>`;
    if (b.comment) h += `<div class="sp-comment">${esc(b.comment)}</div>`;
    if (b.pf) h += `<div class="sp-row" style="margin-top:6px">📄 پیش‌فاکتور: <b>${esc(b.pf.name || "")}</b><button class="tp-btn xs" data-pf="${b.id}">👁 دیدن</button></div>`;
    if (b.ai && b.state === "proforma") h += matchTable(b);
    if (b.state === "pending") {
      h += `<div class="sp-actions"><button class="tp-btn primary" data-act="approve">✅ تأیید و درخواست پیش‌فاکتور</button><button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>`;
    } else if (b.state === "approved") {
      h += `<div class="sp-muted" style="margin-top:6px">منتظر پیش‌فاکتورِ تأمین‌کننده.</div><div class="sp-actions"><button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>`;
    } else if (b.state === "proforma") {
      const open = b.ai ? countOpen(b) : 0;
      h += `<div class="sp-actions"><button class="tp-btn ${b.ai ? "" : "primary"}" data-act="ai">🤖 ${b.ai ? "خوانش دوباره" : "خوانش هوشمند پیش‌فاکتور"}</button>
        ${open > 1 ? `<button class="tp-btn" data-act="acceptall">✔️ پذیرش همهٔ مغایرت‌ها (${fa(open)})</button>` : ""}
        <button class="tp-btn ${b.ready ? "primary" : ""}" data-act="final" ${b.ai ? "" : "title=\"اول خوانش هوشمند\""}>🏁 تأیید نهایی</button>
        <button class="tp-btn warn" data-act="return">↩️ برگرداندن با توضیح</button><button class="tp-btn danger" data-act="reject">❌ رد</button></div>
        ${b.ai ? "" : `<div class="sp-muted">برای پر شدنِ همهٔ فیلدهای اجباری از پیش‌فاکتور و جدول تطابق، «خوانش هوشمند» را بزنید — تأیید نهایی بدون آن ممکن نیست.</div>`}`;
    }
    return h + `</div>`;
  }
  function countOpen(b) {
    let n = 0;
    for (const ln of b.ai.lines || []) for (const row of ln.rows || []) if (acceptable(row) && !(b.accept || {})[`${ln.line_id}|${row.key}`]) n++;
    for (const row of b.ai.header || []) if (acceptable(row) && !(b.accept || {})[`h|${row.key}`]) n++;
    return n;
  }
  function itemsPane() {
    const d = S.d, byId = new Map(d.lines.map((l) => [l.id, l]));
    const open = d.bundles.filter((b) => ["pending", "approved", "proforma"].includes(b.state)).reverse();
    const done = d.bundles.filter((b) => !["pending", "approved", "proforma"].includes(b.state)).reverse();
    let h = open.length ? `<h3 class="sp-h3">منتظر تصمیم شما</h3>${open.map((b) => bundleCard(b, byId)).join("")}` : `<div class="tp-note">بسته‌ای منتظر تصمیم نیست.</div>`;
    h += `<h3 class="sp-h3">همهٔ اقلام این گفت‌وگو</h3>`;
    h += d.lines.map((l) => `<div class="sp-card"><header><h3>${code(l)}${esc(l.title)}</h3><span class="sp-st ${l.state}">${esc(l.state_fa)}</span></header>
      <div class="sp-chips">${l.head ? `<span class="sp-chip lock"><i>نوع قلم:</i> ${esc(l.head)}</span>` : ""}${l.layers.map((x) => `<span class="sp-chip lock">🔒 <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("")}${l.extra.map((x) => `<span class="sp-chip add">➕ <i>${esc(x.k)}:</i> ${esc(x.v)}</span>`).join("")}</div>
      <div class="sp-row" style="margin-top:8px">${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} ریال = <b>${money(l.total)}</b> ریال <span class="sp-muted">(خواسته: ${qty(l.req_qty)} ${esc(l.req_unit || "")})</span></div>
      ${l.note ? `<div class="sp-muted">توضیح تأمین‌کننده: ${esc(l.note)}</div>` : ""}${fileLinks(l.id) ? `<div style="margin-top:6px">${fileLinks(l.id)}</div>` : ""}
      ${l.quote_id ? `<div class="sp-ok">✓ با مقدارهای پیش‌فاکتور در تب استعلامات است.</div>` : ""}</div>`).join("");
    if (done.length) h += `<h3 class="sp-h3">تصمیم‌های قبلی</h3>${done.map((b) => bundleCard(b, byId)).join("")}`;
    return h;
  }

  /* ---------- رفتار ---------- */
  function bind() {
    $$("[data-aid]").forEach((b) => { b.onclick = () => { S.aid = +b.dataset.aid; S.view = "sup"; ss.set("sp.aid", String(S.aid)); render(); }; });
    $$("[data-th]").forEach((b) => { b.onclick = () => { S.th = +b.dataset.th; S.view = "chat"; S.tab = "chat"; S.mainScroll = 0; loadThread().catch((e) => say(e.message)); }; });
    $$("[data-back]").forEach((b) => { b.onclick = () => { S.view = b.dataset.back; render(); }; });
    $$("[data-tab]").forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; S.mainScroll = 0; render(); }; });
    const tg = $("[data-tg]"); if (tg) tg.onclick = connectTg;
    const snd = $("[data-send]"); if (snd) snd.onclick = () => sendDialog().catch((e) => say(e.message));
    $$("[data-file]").forEach((b) => { b.onclick = () => openUrl(`/sp/file/${b.dataset.file}/url`); });
    $$("[data-pf]").forEach((b) => { b.onclick = () => openUrl(`/sp/bundle/${b.dataset.pf}/pf-url`); });
    $$("[data-act]").forEach((b) => { b.onclick = () => act(+b.closest("[data-b]").dataset.b, b.dataset.act); });
    $$("[data-acc]").forEach((c) => {
      c.onchange = async () => {
        const bid = +c.closest("[data-b]").dataset.b;
        const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0;
        try { await api(`/sp/x/bundle/${bid}/accept`, { body: { keys: [c.dataset.acc], on: c.checked } }); await loadThread(); }
        catch (e) { c.checked = !c.checked; say(e.message); }
      };
    });
    const send = $("#sendMsg");
    if (send) {
      const inp = $("#msgIn");
      const go = async () => {
        const text = inp.value.trim(); if (!text) return;
        send.disabled = true;
        try { const r = await api(`/sp/thread/${S.th}/msg`, { body: { text } }); inp.value = ""; addMsgs(r.msgs); } catch (e) { say(e.message); }
        send.disabled = false; inp.focus();
      };
      send.onclick = go;
      inp.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } };
    }
  }

  async function act(bid, action) {
    const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0;
    if (action === "approve") {
      return dlg("تأیید مشخصات", `<p>مشخصات این بسته تأیید و از تأمین‌کننده پیش‌فاکتور خواسته شود؟</p><textarea class="tp-input tp-textarea" data-c placeholder="توضیح برای تأمین‌کننده (اختیاری)" style="min-height:70px"></textarea><div class="sp-err" data-err></div>`,
        [{ label: "تأیید و درخواست پیش‌فاکتور", cls: "primary", fn: (d) => decide(bid, "approve", { comment: $("[data-c]", d).value }) }, { label: "انصراف" }]);
    }
    if (action === "return" || action === "reject") {
      const ret = action === "return";
      return dlg(ret ? "برگرداندن با توضیح" : "رد", `<p>${ret ? "چه چیزی باید اصلاح شود؟ همین متن برای تأمین‌کننده فرستاده می‌شود و اقلام دوباره قابل ویرایش می‌شوند." : "این بسته رد شود؟ دلیل (اختیاری) برای تأمین‌کننده فرستاده می‌شود."}</p>
        <textarea class="tp-input tp-textarea" data-c style="min-height:90px"></textarea><div class="sp-err" data-err></div>`,
      [{ label: ret ? "برگرداندن" : "رد", cls: ret ? "warn" : "danger", fn: (d) => decide(bid, action, { comment: $("[data-c]", d).value }) }, { label: "انصراف" }]);
    }
    if (action === "ai") {
      return dlg("🤖 خوانش هوشمند پیش‌فاکتور", `<p>مدل <b>Claude Haiku 4.5</b> پیش‌فاکتور را می‌خواند: مقدار، واحد و قیمت واحدِ هر قلم و شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده) را برمی‌دارد و هر لایهٔ ویژگی و هر فیلد اجباری را با بستهٔ تأمین‌کننده می‌سنجد (✅ / ⚠️ / ❌).</p>
        <p>هزینهٔ تقریبی هر بار: <b>${esc(S.aiCost)}</b>. انجام شود؟</p><div class="sp-err" data-err></div>`,
      [{ label: "بله، بخوان", cls: "primary", fn: async (d) => {
        $(".tp-body", d).insertAdjacentHTML("beforeend", `<p class="sp-muted">در حال خواندن پیش‌فاکتور… (چند ثانیه)</p>`);
        await api(`/sp/x/bundle/${bid}/ai`, { body: { confirm: true } });
        S.tab = "items"; await loadThread();
      } }, { label: "انصراف" }]);
    }
    if (action === "acceptall") {
      return dlg("پذیرش همهٔ مغایرت‌ها", "<p>برای همهٔ ردیف‌های ❌ و ⚠️ای که پیش‌فاکتور برایشان مقدار دارد، <b>پیش‌فاکتور ملاک</b> شود؟ آنچه در پیش‌فاکتور نیامده پذیرفتنی نیست.</p><div class=\"sp-err\" data-err></div>",
        [{ label: "بله، پیش‌فاکتور ملاک", cls: "primary", fn: async () => { await api(`/sp/x/bundle/${bid}/accept`, { body: { all: true } }); await loadThread(); } }, { label: "انصراف" }]);
    }
    if (action === "final") {
      try {
        const r = await api(`/sp/x/bundle/${bid}/decide`, { body: { action: "final" } });
        await afterDecide();
        say(`تأیید نهایی شد و ${fa(r.quote_ids.length)} قلم با مقدارهای پیش‌فاکتور به تب استعلامات همین درخواست رفت (ثبت موقت و تیک «تأیید نهایی»).`, "🏁 تأیید نهایی");
      } catch (e) { say(`${e.message}\n\nاگر چیزی در پیش‌فاکتور نیامده، بسته را با توضیح برگردانید تا تأمین‌کننده پیش‌فاکتور کامل بفرستد.`, "هنوز نه"); }
    }
  }
  async function decide(bid, action, opts) {
    await api(`/sp/x/bundle/${bid}/decide`, { body: { action, ...opts } });
    await afterDecide();
  }
  async function afterDecide() { await loadList(); await loadThread(); }

  async function openUrl(path) {
    const w = inTg ? null : window.open("", "_blank");
    try {
      const d = await api(path);
      if (inTg && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) window.Telegram.WebApp.openLink(d.url);
      else if (w) w.location = d.url; else location.href = d.url;
    } catch (e) { if (w) w.close(); say(e.message); }
  }

  async function connectTg() {
    if (!S.bot) return say("بات مکاتبات هنوز روی سامانه فعال نشده است.");
    const w = window.open("", "_blank");
    try { const r = await api("/sp/x/tglink", { body: {} }); if (w) w.location = r.url; else location.href = r.url; }
    catch (e) { if (w) w.close(); say(e.message); }
  }

  /* --- «ارسال استعلام» از همین صفحه --- */
  async function sendDialog() {
    const g = S.reqs.find((x) => x.assignment_id === S.aid);
    const items = (await api(`/sp/x/items?aid=${S.aid}`)).items || [];
    if (!items.length) return say("در این درخواست قلم بازی نمانده است.");
    const body = `<p class="sp-muted">درخواست ${esc(g.request_id)} — ${esc(g.party || "")}</p>
      <b>اقلام</b><div class="sp-modal-list">${items.map((i, n) => `<label><input type="checkbox" data-it="${i.id}" ${n === 0 ? "checked" : ""}> ${esc(i.title)} — ${qty(i.qty)} ${esc(i.unit || "")}</label>`).join("")}</div>
      <b style="display:block;margin-top:10px">تأمین‌کننده</b>
      <label class="sp-check"><input type="radio" name="who" value="demo" checked> 🧪 ${esc(S.demoName)} — پیامکش (شبیه‌سازی) همین‌جا نشان داده می‌شود</label>
      <label class="sp-check"><input type="radio" name="who" value="real"> تأمین‌کنندهٔ دیگر:</label>
      <div class="sp-upl" data-real style="opacity:.5"><input class="tp-input" data-n placeholder="نام تأمین‌کننده"><input class="tp-input" data-p placeholder="شماره (09…)" inputmode="tel">
        <input class="tp-input full" data-l placeholder="برچسب شماره (همراه، دفتر، فروش…)"></div>
      <b style="display:block;margin-top:10px">متن پیام (اولِ پیامک و اولین پیامِ گفت‌وگو)</b>
      <textarea class="tp-input tp-textarea" data-t style="min-height:90px">سلام، از شرکت تونل سد آریانا.\nبرای اقلامی که در پنل می‌بینید استعلام قیمت داریم؛ لطفاً مشخصات، قیمت و پیش‌فاکتور را از لینک زیر ثبت کنید.\n${esc((S.me && (S.me.label || S.me.name)) || "")}</textarea>
      <div class="sp-err" data-err></div>`;
    const d = dlg("📨 ارسال استعلام", body, [{ label: "ارسال", cls: "primary", fn: async (dd) => {
      const ids = $$("[data-it]", dd).filter((x) => x.checked).map((x) => +x.dataset.it);
      if (!ids.length) throw new Error("دست‌کم یک قلم را تیک بزنید.");
      const demo = $('input[name="who"]:checked', dd).value === "demo";
      const b = { assignment_id: S.aid, item_ids: ids, text: $("[data-t]", dd).value, demo };
      if (!demo) Object.assign(b, { supplier_name: $("[data-n]", dd).value, phone: $("[data-p]", dd).value, label: $("[data-l]", dd).value });
      const r = await api("/sp/x/send", { body: b });
      S.th = r.thread_id; S.view = "chat"; S.tab = "chat";
      await loadList(); await loadThread();
      smsDialog(r);
    } }, { label: "انصراف" }]);
    $$('input[name="who"]', d).forEach((x) => { x.onchange = () => { $("[data-real]", d).style.opacity = $('input[name="who"]:checked', d).value === "real" ? 1 : 0.5; }; });
    $("[data-n]", d).onchange = async () => {
      const name = $("[data-n]", d).value.trim(); if (!name) return;
      try {
        const r = await api(`/sp/x/phones?name=${encodeURIComponent(name)}`);
        if (r.phones.length && !$("[data-p]", d).value) { $("[data-p]", d).value = r.phones[0].phone; $("[data-l]", d).value = r.phones[0].label || ""; }
      } catch (_) { /* پیشنهاد است، نه شرط */ }
    };
  }
  function smsDialog(r) {
    dlg("📱 پیامک شبیه‌سازی‌شده", `<p class="sp-muted">پیامک فعلاً خاموش است؛ همین متن به‌جای پیامک برای ${esc(r.sms.to)} (${esc(r.sms.label || "—")}) است. لینک‌ها واقعی‌اند — برای دیدن سمت تأمین‌کننده بازشان کنید.</p>
      <div class="sp-sms">${esc(r.sms.text)}</div>
      <div class="sp-row" style="margin-top:10px"><a class="tp-btn sm" href="${esc(r.links.panel)}" target="_blank" rel="noopener">🌐 پنل تأمین‌کننده</a>${r.links.bot ? `<a class="tp-btn sm" href="${esc(r.links.bot)}" target="_blank" rel="noopener">🤖 بات تأمین‌کننده</a>` : ""}</div>`);
  }

  /* ---------- تازه‌سازی ---------- */
  function addMsgs(list) {
    const fresh = (list || []).filter((m) => m.id > S.lastMsg);
    if (!fresh.length) return;
    S.d.msgs.push(...fresh); S.lastMsg = fresh[fresh.length - 1].id;
    const c = $("#chat");
    if (c) { const e = $(".sp-empty", c); if (e) e.remove(); c.insertAdjacentHTML("beforeend", fresh.map(msgHtml).join("")); c.scrollTop = c.scrollHeight; }
  }
  let timer = null, tick = 0;
  function startPoll() { if (timer) clearInterval(timer); timer = setInterval(poll, 5000); }
  async function poll() {
    if (document.hidden || S.busy || document.querySelector(".tp-modal-bg")) return;
    S.busy = true;
    try {
      if (S.th && S.d) {
        const r = await api(`/sp/poll?t=${S.th}&since=${S.lastMsg}`);
        addMsgs(r.msgs);
        const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
        if (r.rev !== S.rev && !typing) { const m = $(".sp-main"); S.mainScroll = m ? m.scrollTop : 0; await loadThread(); }
      }
      if (++tick % 4 === 0) {
        await loadList();
        const a = $("[data-reqs]"), b = $("[data-sups]");
        if (a) a.innerHTML = reqList();
        if (b) b.innerHTML = supList();
        bind();
      }
    } catch (e) { if (e.status === 401 && !inTg) { clearInterval(timer); TP.session.clear(); renderLogin("نشست تمام شد؛ دوباره وارد شوید."); } }
    S.busy = false;
  }

  boot();
})();
