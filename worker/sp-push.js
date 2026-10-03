/**
 * بات مکاتبات تأمین‌کنندگان — لایهٔ تلگرامِ مشترک: ارسال و ثبتِ پیام‌ها برای پاک‌کردنِ بعدی، منوی ثابت،
 * کارت‌ها، و پخشِ پیام‌های تازهٔ هر گفت‌وگو به طرف دیگر (هر جا که کار انجام شده باشد: پنل وب، مینی‌اپ،
 * بات مکاتبات یا «ارسال» در بات کارشناسان).
 *
 * پاک‌کردن گفت‌وگو: تلگرام فقط پیام‌های زیر ۴۸ ساعت را پاک می‌کند (deleteMessages، ۱۰۰ تا در هر
 * فراخوانی). پس شناسهٔ هر پیامی که بات می‌فرستد و هر پیامی که کاربر می‌نویسد در sp_tg.ids_json می‌ماند؛
 * با عوض شدنِ گفت‌وگو، تازه‌ها پاک و تاریخچهٔ گفت‌وگوی تازه یکجا نوشته می‌شود. پیام‌های کهنه‌تر از
 * ۴۸ ساعت می‌مانند — محدودیت خودِ تلگرام است.
 */
import { telegram, esc, TgError } from "./telegram.js";
import { tehranParts } from "./time.js";
import {
  siteOrigin, PANEL_PATH, CORR_PATH, BUNDLE_FA, LINE_FA, COMPANY, fmtMoney, msgOut, markSeen, threadRow, corrLink, lineMissing,
} from "./sp-core.js";
import { AI_COST_HINT } from "./sp-ai.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const DEL_WINDOW = 47 * 3600000;
const KEEP_IDS = 300;
const MSG_MAX = 3800;

const FA = "۰۱۲۳۴۵۶۷۸۹";
/** رقم و جداکنندهٔ فارسی — فقط برای عددهایی که خودمان قالب می‌زنیم (نه شماره تلفن و لینک) */
export const fa = (s) => String(s == null ? "" : s).replace(/\d/g, (d) => FA[+d]).replace(/,/g, "٬").replace(/\./g, "٫");
export const money = (n) => fa(fmtMoney(n));
export const qty = (n) => (n == null ? "—" : fa(String(Math.round(Number(n) * 1000) / 1000)));
const p2 = (n) => String(n).padStart(2, "0");
export function when(ms) {
  const p = tehranParts(ms), q = tehranParts(now());
  const hm = `${p2(p.hour)}:${p2(p.minute)}`;
  return fa(p.jy === q.jy && p.jm === q.jm && p.jd === q.jd ? hm : `${p2(p.jm)}/${p2(p.jd)} ${hm}`);
}
export const short = (s, n = 28) => { const x = T(s); return x.length > n ? x.slice(0, n - 1) + "…" : x; };

export const spReady = (env) => !!env.TG_SP_BOT_TOKEN;
export const spApi = (env) => telegram(env, "sp");

/* ------------------------------------------------------------------ */
/* ردیفِ گفت‌وگوی تلگرام و پیام‌های ثبت‌شده                              */
/* ------------------------------------------------------------------ */
export const tgRow = (env, chat) => env.DB.prepare("SELECT * FROM sp_tg WHERE chat=?").bind(String(chat)).first();
const idsOf = (row) => { if (!row._ids) row._ids = parse(row.ids_json, []); return row._ids; };
export function track(row, mid) { if (mid) { idsOf(row).push([mid, now()]); row._dirty = true; } }
export const flowOf = (row) => parse(row.flow_json, null);
export function setFlow(row, flow) { row.flow_json = flow ? JSON.stringify(flow) : null; row._dirty = true; }
export function setFocus(row, id) { row.focus = id || null; row._dirty = true; }

export async function send(env, row, text, kb, extra) {
  const r = await spApi(env).call("sendMessage", {
    chat_id: row.chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
    ...(kb ? { reply_markup: Array.isArray(kb) ? { inline_keyboard: kb } : kb } : {}), ...(extra || {}),
  });
  track(row, r && r.message_id);
  return r;
}
/** ویرایش کارتِ همان پیام؛ اگر نشد (کهنه یا پاک‌شده) کارت تازه */
export async function show(env, row, mid, text, kb) {
  if (mid) { const r = await spApi(env).editMessageText(row.chat, mid, text, kb || []).catch(() => null); if (r) return r; }
  return send(env, row, text, kb);
}
export async function save(env, row) {
  if (!row || !row._dirty) return;
  await env.DB.prepare("UPDATE sp_tg SET focus=?, flow_json=?, ids_json=?, updated_at=? WHERE chat=?")
    .bind(row.focus == null ? null : row.focus, row.flow_json == null ? null : row.flow_json, JSON.stringify(idsOf(row).slice(-KEEP_IDS)), now(), row.chat).run();
  row._dirty = false;
}
export async function clearChat(env, row) {
  const t = now();
  const ids = idsOf(row).filter(([, at]) => t - at < DEL_WINDOW).map(([id]) => id);
  for (let i = 0; i < ids.length; i += 100) await spApi(env).call("deleteMessages", { chat_id: row.chat, message_ids: ids.slice(i, i + 100) }).catch(() => {});
  row._ids = []; row._dirty = true;
}

/* ------------------------------------------------------------------ */
/* منوی ثابتِ پایین و دکمهٔ مینی‌اپ                                      */
/* ------------------------------------------------------------------ */
export const MENU = {
  e: { reqs: "📋 لیست درخواست‌ها", sups: "🏷 لیست تأمین‌کنندگان", app: "🧩 مکاتبات (مینی‌اپ)" },
  s: { list: "📋 استعلام‌ها", chat: "💬 گفت‌وگو", app: "🧩 پنل (مینی‌اپ)", out: "🚪 خروج" },
};
export const appUrl = (env, role) => `${siteOrigin(env)}${role === "e" ? CORR_PATH : PANEL_PATH}?tg=1`;
export function menuKb(env, role) {
  const m = MENU[role];
  const keyboard = role === "e"
    ? [[{ text: m.reqs }, { text: m.sups }], [{ text: m.app, web_app: { url: appUrl(env, "e") } }]]
    : [[{ text: m.list }, { text: m.chat }], [{ text: m.app, web_app: { url: appUrl(env, "s") } }, { text: m.out }]];
  return { keyboard, is_persistent: true, resize_keyboard: true };
}
export async function setMenuButton(env, chat, role) {
  await spApi(env).call("setChatMenuButton", {
    chat_id: chat, menu_button: { type: "web_app", text: role === "e" ? "مکاتبات" : "پنل", web_app: { url: appUrl(env, role) } },
  }).catch((e) => console.error("sp menu button", e && e.message));
}

/* ------------------------------------------------------------------ */
/* متن‌ها و کارت‌ها                                                       */
/* ------------------------------------------------------------------ */
const sideName = (th, who, side) => (who === "e"
  ? (side === "e" ? "شما" : `کارشناس — ${th.expert_label || th.expert_name}`)
  : (side === "s" ? "شما" : th.supplier_name));

export function msgLine(th, m, side) {
  if (m.kind === "event" || m.kind === "note") return `<i>${esc(m.body)}</i>\n<code>${when(m.at)}</code>`;
  return `${m.who === side ? "🔹" : "🔸"} <b>${esc(sideName(th, m.who, side))}</b> · ${when(m.at)}\n${esc(m.body)}`;
}

export function headerText(env, th, side) {
  if (side === "e") {
    return `💬 <b>${esc(th.supplier_name)}</b>${th.demo ? " <i>(فرضی)</i>" : ""}\n`
      + `📄 درخواست <b>${esc(th.request_id)}</b>${th.party ? ` — ${esc(th.party)}` : ""}\n`
      + `📞 ${esc(th.phone || "—")}${th.phone_label ? ` (${esc(th.phone_label)})` : ""}\n`
      + "<i>هر پیامی این‌جا بنویسید برای همین تأمین‌کننده فرستاده می‌شود.</i>";
  }
  return `💬 <b>استعلام ${esc(th.request_id)}</b> — شرکت ${esc(COMPANY(env))}\n👤 کارشناس: ${esc(th.expert_label || th.expert_name)}\n`
    + "<i>هر پیامی این‌جا بنویسید برای کارشناس فرستاده می‌شود.</i>";
}

const lineSum = (l) => `${qty(l.qty)} ${esc(l.unit || "")} × ${money(l.price)} = ${money(l.qty != null && l.price != null ? l.qty * l.price : null)} ریال`;

/** کارت یک بسته برای کارشناس، با دکمه‌های تصمیمِ همان وضعیت */
export function bundleCard(th, b, lines) {
  const ai = parse(b.ai_json, null);
  let text = `📦 <b>بستهٔ ${fa(b.id)}</b> — ${esc(BUNDLE_FA[b.state] || b.state)}\n`
    + lines.map((l, i) => `${fa(i + 1)}. <b>${esc(l.title)}</b>\n   ${lineSum(l)}`
      + (parse(l.extra_json, []).length ? `\n   ➕ ${parse(l.extra_json, []).map((x) => `${esc(x.k)}: ${esc(x.v)}`).join("، ")}` : "")).join("\n")
    + `\n<b>جمع: ${money(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0))} ریال</b>`;
  if (b.comment && ["returned", "rejected"].includes(b.state)) text += `\n💬 ${esc(b.comment)}`;
  if (b.pf_key) text += `\n📄 پیش‌فاکتور: ${esc(b.pf_name || "")}`;
  if (ai) {
    text += `\n🤖 بررسی هوشمند: ${ai.ok ? "✅ همه صریح" : "⚠️ کامل نیست"}`;
    for (const x of ai.lines || []) {
      const bad = (x.layers || []).filter((y) => y.status !== "explicit");
      const warn = [!x.found ? "در سند پیدا نشد" : null, ...bad.map((y) => `${y.k}: ${y.status === "different" ? `متفاوت (${y.seen || "؟"})` : "نیامده"}`),
        x.qty_match === false ? `مقدار سند ${qty(x.qty)}` : null, x.price_match === false ? `قیمت سند ${money(x.unit_price)}` : null].filter(Boolean);
      if (warn.length) text += `\n   • ${esc(short(x.title, 30))}: ${esc(warn.join("؛ "))}`;
    }
  }
  const kb = [];
  if (b.state === "pending") {
    kb.push([{ text: "✅ تأیید و درخواست پیش‌فاکتور", callback_data: `xd:${b.id}:ok` }]);
    kb.push([{ text: "↩️ بازگشت با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  } else if (b.state === "approved") {
    text += "\n<i>منتظر پیش‌فاکتورِ تأمین‌کننده.</i>";
    kb.push([{ text: "↩️ بازگشت با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  } else if (b.state === "proforma") {
    kb.push([{ text: "📄 دیدن پیش‌فاکتور", callback_data: `xd:${b.id}:pf` }, { text: "🤖 بررسی هوشمند", callback_data: `xd:${b.id}:ai` }]);
    kb.push([{ text: "🏁 تأیید نهایی", callback_data: `xd:${b.id}:fn` }]);
    kb.push([{ text: "↩️ بازگشت با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  }
  return { text, kb };
}
export const aiConfirmKb = (bid) => [[{ text: `🤖 بله، بررسی کن (${AI_COST_HINT})`, callback_data: `xd:${bid}:ai2` }], [{ text: "✖️ نه", callback_data: `xd:${bid}:card` }]];

/** کارت اقلام برای تأمین‌کننده */
export function itemsCard(env, th, lines, bundles) {
  const ready = lines.filter((l) => l.state === "ready");
  let text = `📦 <b>اقلام استعلام ${esc(th.request_id)}</b>\n`
    + lines.map((l, i) => `${fa(i + 1)}. <b>${esc(l.title)}</b> — <i>${esc(LINE_FA[l.state] || l.state)}</i>\n   ${lineSum(l)}`).join("\n");
  const waitPf = bundles.filter((b) => b.state === "approved");
  if (waitPf.length) text += `\n\n📄 ${fa(waitPf.length)} بسته منتظر پیش‌فاکتور شماست.`;
  text += "\n\n<i>روی هر قلم بزنید تا مقدار، واحد، قیمت واحد، لایهٔ تازه و پیوست را ثبت کنید.</i>";
  const kb = lines.slice(0, 30).map((l, i) => [{ text: `${["new", "draft", "returned"].includes(l.state) ? "✏️" : l.state === "ready" ? "☑️" : "📌"} ${fa(i + 1)}. ${short(l.title, 30)}`, callback_data: `si:${l.id}` }]);
  if (ready.length) kb.push([{ text: `📤 ارسال مشخصات (${fa(ready.length)} قلمِ آماده)`, callback_data: `ss:${th.id}` }]);
  for (const b of waitPf) kb.push([{ text: `📄 ارسال پیش‌فاکتور (بستهٔ ${fa(b.id)})`, callback_data: `sp:${b.id}` }]);
  kb.push([{ text: "🧩 باز کردن در پنل", web_app: { url: appUrl(env, "s") } }]);
  return { text, kb };
}

/** کارت یک قلم برای تأمین‌کننده */
export function lineCard(l, files) {
  const locked = parse(l.layers_json, []), extra = parse(l.extra_json, []);
  const editable = ["new", "draft", "returned", "ready"].includes(l.state);
  let text = `✏️ <b>${esc(l.title)}</b>\nوضعیت: <i>${esc(LINE_FA[l.state] || l.state)}</i>\n`;
  if (l.head) text += `نوع قلم: ${esc(l.head)}\n`;
  text += `\n🔒 <b>مشخصات کارشناس</b> (قفل؛ برای مذاکره در گفت‌وگو بنویسید):\n${locked.length ? locked.map((x) => `• ${esc(x.k)}: ${esc(x.v)}`).join("\n") : "—"}\n`;
  text += `\n➕ <b>لایه‌های افزودهٔ شما:</b>\n${extra.length ? extra.map((x) => `• ${esc(x.k)}: ${esc(x.v)}`).join("\n") : "—"}\n`;
  text += `\nمقدار: <b>${qty(l.qty)} ${esc(l.unit || "")}</b> (درخواست: ${qty(l.req_qty)} ${esc(l.req_unit || "")})`
    + `\nقیمت واحد: <b>${money(l.price)}</b> ریال\nقیمت کل: <b>${money(l.qty != null && l.price != null ? l.qty * l.price : null)}</b> ریال`;
  if (l.note) text += `\nتوضیح: ${esc(l.note)}`;
  text += `\n📎 پیوست‌ها: ${files.length ? files.map((f) => esc(f.label)).join("، ") : "—"}`;
  const miss = lineMissing(l);
  if (editable && miss.length) text += `\n\n<i>برای «آمادهٔ ارسال»: ${esc(miss.join("، "))}</i>`;
  const kb = [];
  if (editable) {
    kb.push([{ text: "🔢 مقدار", callback_data: `sv:${l.id}:q` }, { text: "📏 واحد", callback_data: `sv:${l.id}:u` }, { text: "💰 قیمت واحد", callback_data: `sv:${l.id}:p` }]);
    kb.push([{ text: "➕ لایهٔ تازه", callback_data: `sv:${l.id}:l` }, { text: "📝 توضیح", callback_data: `sv:${l.id}:n` }, { text: "📎 پیوست", callback_data: `sa:${l.id}` }]);
    extra.slice(0, 8).forEach((x, i) => { if (i % 2 === 0) kb.push([]); kb[kb.length - 1].push({ text: `🗑 ${short(x.k, 14)}`, callback_data: `sl:${l.id}:${i}` }); });
    kb.push([l.state === "ready" ? { text: "↩️ برگشت به پیش‌نویس", callback_data: `sr:${l.id}:0` } : { text: "✅ آمادهٔ ارسال", callback_data: `sr:${l.id}:1` }]);
  }
  kb.push([{ text: "↩️ فهرست اقلام", callback_data: `ic:${l.thread_id}` }]);
  return { text, kb };
}

/* ------------------------------------------------------------------ */
/* نمایش یک گفت‌وگو: پاک کردن، سرآیند با منو، تاریخچه و کارت کارها        */
/* ------------------------------------------------------------------ */
export async function showThread(env, row, th) {
  const side = row.role;
  await clearChat(env, row);
  setFocus(row, th.id); setFlow(row, null);
  await send(env, row, headerText(env, th, side), menuKb(env, side));
  const msgs = (await env.DB.prepare(`SELECT * FROM (SELECT * FROM sp_msgs WHERE thread_id=?${side === "s" ? " AND kind!='note'" : ""} ORDER BY id DESC LIMIT 40) ORDER BY id`).bind(th.id).all()).results || [];
  const chunks = [];
  let cur = "";
  for (const m of msgs) {
    const s = msgLine(th, msgOut(m), side).slice(0, MSG_MAX);
    if (cur && cur.length + s.length + 2 > MSG_MAX) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + s;
  }
  if (cur) chunks.push(cur);
  for (const c of chunks.length ? chunks : ["<i>هنوز پیامی نیست.</i>"]) await send(env, row, c);
  await markSeen(env, th.id, side);
  await sendWork(env, row, th);
}

/** کارهای باز همان گفت‌وگو: برای کارشناس بسته‌های منتظر تصمیم، برای تأمین‌کننده کارت اقلام */
export async function sendWork(env, row, th) {
  const [lines, bundles] = await Promise.all([
    env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY id").bind(th.id).all(),
    env.DB.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id").bind(th.id).all(),
  ]);
  const L = lines.results || [], B = bundles.results || [];
  if (row.role === "s") { const c = itemsCard(env, th, L, B); await send(env, row, c.text, c.kb); return; }
  const open = B.filter((b) => ["pending", "approved", "proforma"].includes(b.state));
  for (const b of open.slice(-5)) { const c = bundleCard(th, b, L.filter((l) => l.bundle_id === b.id)); await send(env, row, c.text, c.kb); }
  if (!open.length) {
    const todo = L.filter((l) => ["new", "draft", "ready", "returned"].includes(l.state)).length;
    await send(env, row, `<i>${fa(L.length)} قلم در این گفت‌وگو؛ ${todo ? `${fa(todo)} قلم هنوز دست تأمین‌کننده است.` : "بستهٔ منتظر تصمیمی نیست."}</i>`);
  }
}

/* ------------------------------------------------------------------ */
/* پخش پیام‌های تازه به طرف دیگر                                         */
/* ------------------------------------------------------------------ */
async function actionKb(env, th, m, side) {
  const ev = m.meta && m.meta.ev;
  if (side === "e" && (ev === "submit" || ev === "pf") && m.meta.bundle) {
    const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(m.meta.bundle).first();
    if (b && ["pending", "proforma", "approved"].includes(b.state)) {
      const L = (await env.DB.prepare("SELECT * FROM sp_lines WHERE bundle_id=? ORDER BY id").bind(b.id).all()).results || [];
      return bundleCard(th, b, L);
    }
  }
  if (side === "s") {
    if (ev === "approve" && m.meta.bundle) return { kb: [[{ text: "📄 ارسال پیش‌فاکتور", callback_data: `sp:${m.meta.bundle}` }]] };
    if (["rfq", "remind", "return"].includes(ev)) return { kb: [[{ text: "📝 دیدن و پر کردن اقلام", callback_data: `ic:${th.id}` }]] };
  }
  return null;
}

/**
 * پیام‌های تازهٔ یک گفت‌وگو به گفت‌وگوهای تلگرامیِ طرف دیگر: اگر همان گفت‌وگو جلوی چشم اوست، خودِ پیام
 * (و برای رخدادها کارت و دکمه‌هایش)، وگرنه هشدار با دکمهٔ «رفتن به این گفت‌وگو». کارشناسی که هنوز به بات
 * مکاتبات وصل نیست، خبرِ پیامِ تأمین‌کننده را در بات کارشناسان می‌گیرد. شکستِ تلگرام کار اصلی را نمی‌خواباند.
 */
export async function pushMsgs(env, thIn, msgs) {
  if (!msgs || !msgs.length) return { sent: 0 };
  const th = thIn && thIn.supplier_name !== undefined && thIn.expert_id !== undefined ? thIn : await threadRow(env, thIn.id || thIn.thread_id || thIn);
  if (!th) return { sent: 0 };
  let sent = 0;
  for (const side of ["e", "s"]) {
    const mine = msgs.filter((m) => m.who !== side && m.kind !== "note");
    if (!mine.length) continue;
    const rows = spReady(env) ? ((side === "e"
      ? await env.DB.prepare("SELECT * FROM sp_tg WHERE role='e' AND expert_id=?").bind(th.expert_id).all()
      : await env.DB.prepare("SELECT * FROM sp_tg WHERE role='s' AND phone_id IN (SELECT id FROM sp_phones WHERE supplier_id=?)").bind(th.supplier_id).all()).results || []) : [];
    if (side === "e" && !rows.length) { sent += await mainBotNotice(env, th, mine); continue; }
    for (const row of rows) {
      try {
        if (row.focus === th.id) {
          for (const m of mine) {
            const a = await actionKb(env, th, m, side);
            if (a && a.text) { await send(env, row, msgLine(th, m, side)); await send(env, row, a.text, a.kb); }
            else await send(env, row, msgLine(th, m, side), a && a.kb);
            sent++;
          }
          await markSeen(env, th.id, side);
        } else {
          const last = mine[mine.length - 1];
          const who = last.who === "s" ? th.supplier_name : `کارشناس — ${th.expert_label || th.expert_name}`;
          await send(env, row, `🔔 <b>${esc(who)}</b> — ${side === "e" ? "درخواست" : "استعلام"} ${esc(th.request_id)}${mine.length > 1 ? ` (${fa(mine.length)} پیام)` : ""}\n${esc(short(last.body.replace(/\s+/g, " "), 160))}`,
            [[{ text: "🔀 رفتن به این گفت‌وگو", callback_data: `go:${th.id}` }]]);
          sent++;
        }
        await save(env, row);
      } catch (e) {
        if (e instanceof TgError && (e.code === 403 || /chat not found/i.test(e.description))) await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
        else console.error("sp push", e && e.message);
      }
    }
  }
  return { sent };
}

/** کارشناسِ وصل‌نشده به بات مکاتبات: خبر کوتاه در بات کارشناسان (همان باتِ جریان کار) */
async function mainBotNotice(env, th, mine) {
  if (!th.expert_chat || !env.TG_BOT_TOKEN) return 0;
  const last = mine[mine.length - 1];
  await telegram(env).sendMessage(th.expert_chat,
    `💬 <b>${esc(th.supplier_name)}</b> — درخواست ${esc(th.request_id)}${mine.length > 1 ? ` (${fa(mine.length)} پیام)` : ""}\n${esc(short(last.body.replace(/\s+/g, " "), 200))}\n\n`
    + "<i>گفت‌وگو و تصمیم در صفحهٔ مکاتبات یا بات مکاتبات است.</i>",
    [[{ text: "🌐 صفحهٔ مکاتبات", url: corrLink(env) }]]).catch((e) => console.error("sp main notice", e && e.message));
  return 1;
}
