/**
 * بات مکاتبات تأمین‌کنندگان — لایهٔ تلگرامِ مشترک: ارسال و ثبتِ پیام‌ها برای پاک‌کردنِ بعدی، منوی ثابت،
 * کارت‌ها، و پخشِ پیام‌های تازهٔ هر گفت‌وگو به طرف دیگر (هر جا که کار انجام شده باشد: پنل وب، مینی‌اپ،
 * بات مکاتبات یا «ارسال» در بات کارشناسان). همهٔ مکاتباتِ کارشناس این‌جاست؛ بات کارشناسان از گفت‌وگو با
 * تأمین‌کننده چیزی نشان نمی‌دهد (تصمیم مدیر، مهر ۱۴۰۵).
 *
 * یک گفت‌وگوی تلگرام می‌تواند هر دو هویت را داشته باشد (کارشناس و تأمین‌کننده — برای آزمودن هر دو سو با یک
 * حساب)؛ نقشِ فعلی با «🔁» عوض می‌شود و پیامِ نقشِ دیگر به‌شکل هشدار با دکمهٔ رفتن می‌رسد.
 *
 * پاک‌کردن صفحه: تلگرام فقط پیام‌های زیر ۴۸ ساعت را پاک می‌کند (deleteMessages، ۱۰۰ تا در هر فراخوانی). پس
 * شناسهٔ هر پیامی که بات می‌فرستد و هر پیامی که کاربر می‌نویسد در sp_tg.ids_json می‌ماند؛ با عوض شدنِ گفت‌وگو،
 * تازه‌ها پاک و تاریخچهٔ گفت‌وگوی تازه یکجا نوشته می‌شود. «🧹 پاک کردن گفت‌وگو» هم همین را می‌کند و تاریخچهٔ
 * همان طرف را از این به بعد نشان نمی‌دهد (پیام‌ها در دیتابیس می‌مانند — sp-core.js:clearMsgs).
 */
import { telegram, esc, TgError } from "./telegram.js";
import { tehranParts } from "./time.js";
import { siteOrigin, PANEL_PATH, CORR_PATH, BUNDLE_FA, LINE_FA, COMPANY, fmtMoney, msgOut, markSeen, threadRow, lineMissing,
  termsOf, termsMissing, TERM_FIELDS, TERM_FA, clearedUpTo, locksOfLine, lineTitle, lineLayers, layerTxt, bundleOut, proformaInput } from "./sp-core.js";
import { aiUsable, resolve, acceptable, lineKey, headKey } from "./sp-ai.js";
import { storage } from "./storage.js";
import { aiThread } from "./ai-lock.js";
import { pfReadOn } from "./switches.js";
import { limitsTxt } from "./terms-locks.js";
import { proformaData, termRows } from "./pfdoc.js";

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
/** «کد ۷ · عنوان» — کدِ افزایشیِ قلم در پنلِ همان تأمین‌کننده */
export const lineTag = (l, n = 60) => `${l.no ? `کد ${fa(l.no)} · ` : ""}${short(l.title, n)}`;
/** شرایطِ فاکتور در یک خط: «زمان تحویل: ۱۰ روز · شرایط تسویه: نقدی · …» */
export const termsLine = (t) => TERM_FIELDS.filter((f) => T(t && t[f])).map((f) => `${TERM_FA[f].replace(" (روز)", "")}: ${fa(t[f])}${f === "valid_days" ? " روز" : ""}`).join(" · ");

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
/** این گفت‌وگو هم کارشناس است هم تأمین‌کننده */
export const hasBoth = (row) => !!(row && row.expert_id && row.phone_id);

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
  await env.DB.prepare("UPDATE sp_tg SET role=?, focus=?, flow_json=?, ids_json=?, updated_at=? WHERE chat=?")
    .bind(row.role, row.focus == null ? null : row.focus, row.flow_json == null ? null : row.flow_json, JSON.stringify(idsOf(row).slice(-KEEP_IDS)), now(), row.chat).run();
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
  e: { reqs: "📋 لیست درخواست‌ها", sups: "🏷 لیست تأمین‌کنندگان", app: "🧩 مکاتبات (مینی‌اپ)", swap: "🔁 نقش تأمین‌کننده" },
  s: { list: "📋 استعلام‌ها", chat: "💬 گفت‌وگو", app: "🧩 پنل (مینی‌اپ)", out: "🚪 خروج", swap: "🔁 نقش کارشناس" },
};
export const appUrl = (env, role) => `${siteOrigin(env)}${role === "e" ? CORR_PATH : PANEL_PATH}?tg=1`;
export function menuKb(env, role, both) {
  const m = MENU[role];
  const keyboard = role === "e"
    ? [[{ text: m.reqs }, { text: m.sups }], [{ text: m.app, web_app: { url: appUrl(env, "e") } }]]
    : [[{ text: m.list }, { text: m.chat }], [{ text: m.app, web_app: { url: appUrl(env, "s") } }, { text: m.out }]];
  if (both) keyboard.push([{ text: m.swap }]);
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
/* پیامِ کارشناس هوشمند (meta.ai) فقط سمتِ کارشناس با «🤖» پیداست؛ تأمین‌کننده همان پیامِ عادیِ کارشناس را می‌بیند
   (درخواست کاربر، مهر ۱۴۰۵ — دعوت می‌گوید پیام‌ها را دستیارِ هوشمند جواب می‌دهد) */
const isAi = (m) => !!(m && m.meta && m.meta.ai);
const sideName = (th, who, side, m) => (who === "e"
  ? (side === "e" ? (isAi(m) ? "🤖 کارشناس هوشمند" : "شما") : `کارشناس — ${th.expert_label || th.expert_name}`)
  : (side === "s" ? "شما" : th.supplier_name));

const durTxt = (s) => (s ? ` ${fa(`${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`)}` : "");
export function msgLine(th, m, side) {
  if (m.kind === "event" || m.kind === "note") return `<i>${side === "e" && isAi(m) ? "🤖 " : ""}${esc(m.body)}</i>\n<code>${when(m.at)}</code>`;
  /* پیامِ صوتی: کارشناس متنِ پیاده‌شده را هم می‌بیند؛ تأمین‌کننده فقط «پیام صوتی» (sp-core.js:msgFor) */
  if (m.kind === "voice") {
    const v = (m.meta && m.meta.voice) || {}, st = (m.meta && m.meta.stt) || {};
    const head = `${m.who === side ? "🔹" : "🔸"} <b>${esc(sideName(th, m.who, side, m))}</b> · ${when(m.at)}\n🎤 <i>پیام صوتی${durTxt(v.dur)}</i>`;
    if (side !== "e") return head;
    return `${head}\n${T(m.body) ? `«${esc(m.body)}»` : `<i>متنش پیاده نشد${st.error ? ` — ${esc(st.error)}` : ""}</i>`}`;
  }
  return `${m.who === side ? "🔹" : "🔸"} <b>${esc(sideName(th, m.who, side, m))}</b> · ${when(m.at)}\n${esc(m.body)}`;
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

/* قیمت واحد و جمع درشت (فاز ۴: «درشت و پررنگ، هم در پنل و هم در بات») */
const lineSum = (l) => `${qty(l.qty)} ${esc(l.unit || "")} × <b>${money(l.price)}</b> = <b>${money(l.qty != null && l.price != null ? l.qty * l.price : null)}</b> ریال`;
/** پیشنهادِ تأمین‌کننده روی 🔓ها و توضیحِ زیرِ قلم، برای کارتِ بستهٔ کارشناس */
function lineChanges(l) {
  const out = [];
  if (lineTitle(l) !== l.title) out.push(`🔓 عنوانِ پیشنهادی: ${esc(lineTitle(l))}`);
  for (const x of lineLayers(l)) if (x.req != null) out.push(`🔓 ${esc(x.k)}: <b>${esc(x.v)}</b> <i>(درخواست: ${esc(x.req)})</i>`);
  if (T(l.note)) out.push(`📝 ${esc(short(l.note, 200))}`);
  return out.length ? `\n   ${out.join("\n   ")}` : "";
}
/* ✅ همان · ⚠️ مطمئن نیست · ⚪ مطمئن است که نیامده · ❌ مطمئن است که فرق دارد — و ☑️ کنارِ ردیفی که کارشناس تیک زده */
export const ICON = { ok: "✅", warn: "⚠️", none: "⚪", bad: "❌" };
export const LEGEND = "✅ همان · ⚠️ مطمئن نیست · ⚪ مطمئن است که نیامده · ❌ مطمئن است که فرق دارد · ☑️ تیک‌خورده (پیش‌فاکتور ملاک)";
/* شرط‌ها (تاریخ، روز) با رقم فارسی — اعلامی و سند یک‌شکل دیده شوند */
const cell = (v, row) => (v == null || v === "" ? "—" : row && row.key === "price" ? money(v) : typeof v === "number" ? qty(v) : row && row.kind === "terms" ? esc(String(v).replace(/\d/g, (d) => FA[+d])) : esc(v));

/** همهٔ ردیف‌های غیرسبزِ جدول تطابق به ترتیبِ ثابت — دکمه‌های تیک با شمارهٔ همین فهرست */
export function acceptList(ai) {
  const out = [];
  for (const ln of (ai && ai.lines) || []) for (const row of ln.rows || []) if (acceptable(row)) out.push({ key: lineKey(ln.line_id, row), row, line: ln });
  for (const row of (ai && ai.header) || []) if (acceptable(row)) out.push({ key: headKey(row), row, line: null });
  return out;
}

/** جدول تطابق به متن: هر لایه، هر فیلد اجباری و هر شرط با نشانه‌اش، مقدارِ بسته و مقدارِ سند، و تیک‌خورده‌ها */
function matchText(ai, accept) {
  const acc = accept || {};
  const rowTxt = (row, k) => {
    const on = acc[k] && acceptable(row);
    const want = row.want != null && row.want !== "" ? cell(row.want, row) : null;
    const got = cell(row.got, row);
    const def = row.def ? " <i>(پیش‌فرضِ شرکت)</i>" : "";
    const tail = row.status === "ok" ? `: ${row.kind === "terms" ? got : want || got}${def}` : `: ${want != null ? `${want} ← ` : ""}سند: ${got}${def}`;
    return `  ${ICON[row.status] || "⚠️"}${on ? "☑️" : ""} ${esc(row.label)}${tail}${row.gate ? "" : " <i>(اطلاعاتی)</i>"}`;
  };
  let s = `\n\n🤖 <b>جدول تطابق با پیش‌فاکتور</b>\n<i>${LEGEND}</i>`;
  for (const ln of ai.lines || []) {
    s += `\n▪️ <b>${esc(lineTag(ln, 40))}</b>${ln.found === false ? " — <i>در سند پیدا نشد</i>" : ln.doc_title ? ` — <i>در سند: «${esc(short(ln.doc_title, 40))}»</i>` : ""}`;
    for (const row of ln.rows || []) s += `\n${rowTxt(row, lineKey(ln.line_id, row))}`;
  }
  s += "\n▪️ <b>شرایط فاکتور</b>";
  for (const row of ai.header || []) s += `\n${rowTxt(row, headKey(row))}`;
  return s;
}

/**
 * کارت یک بسته برای کارشناس، با جدول تطابق، تیکِ هر ردیفِ غیرسبز و دکمه‌های تصمیمِ همان وضعیت.
 * opt.pfRead === false (فاز ۴): جدول تطابقی نیست — «🏁 تأیید نهایی» (با مقدارهای تأمین‌کننده)، برگشت یا رد، و Word پیش‌فاکتورِ تولیدی.
 */
export function bundleCard(th, b, lines, opt = {}) {
  const ai0 = parse(b.ai_json, null);
  const ai = aiUsable(ai0) ? ai0 : null;
  const acc = parse(b.accept_json, {});
  const tm = termsOf(b);
  const gen = opt.pfRead === false;
  let text = `📦 <b>بستهٔ ${fa(b.id)}</b> — ${esc(BUNDLE_FA[b.state] || b.state)}\n`
    + lines.map((l) => `• <b>${esc(lineTag(l))}</b>\n   ${lineSum(l)}`
      + (parse(l.extra_json, []).length ? `\n   ➕ ${parse(l.extra_json, []).map((x) => esc(layerTxt(x))).join("، ")}` : "") + lineChanges(l)).join("\n")
    + `\n<b>جمع: ${money(lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0))} ریال</b>`;
  if (termsLine(tm)) text += `\n🧾 شرایط اعلامی: ${esc(termsLine(tm))}`;
  if (b.comment && ["returned", "rejected"].includes(b.state)) text += `\n💬 ${esc(b.comment)}`;
  if (b.pf_key) text += gen ? `\n📎 پیوست — پیش‌فاکتورِ خودِ تأمین‌کننده: ${esc(b.pf_name || "")}` : `\n📄 پیش‌فاکتور: ${esc(b.pf_name || "")}`;
  const kb = [];
  if (gen && ["pending", "approved", "proforma"].includes(b.state)) {
    const r = bundleOut(b, "e", { pfRead: false, lines });
    text += r.ready ? "\n\n✅ <b>همه‌چیز برای تأیید نهایی آماده است</b> — مقدارهای خودِ تأمین‌کننده به تب استعلامات می‌روند."
      : `\n\n⛔ <b>هنوز کامل نیست:</b>\n${r.problems.slice(0, 4).map((p) => `• ${esc(p)}`).join("\n")}`;
    kb.push([{ text: "🏁 تأیید نهایی", callback_data: `xd:${b.id}:fn` }, { text: "📄 پیش‌فاکتور (Word)", callback_data: `xd:${b.id}:pg` }]);
    if (b.pf_key) kb.push([{ text: "📎 پیوستِ تأمین‌کننده", callback_data: `xd:${b.id}:pf` }]);
    kb.push([{ text: "↩️ برگرداندن با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
    return { text: text.length > 4000 ? text.slice(0, 3990) + "…" : text, kb };
  }
  if (b.state === "pending") {
    kb.push([{ text: "✅ تأیید و درخواست پیش‌فاکتور", callback_data: `xd:${b.id}:ok` }]);
    kb.push([{ text: "↩️ برگرداندن با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  } else if (b.state === "approved") {
    text += "\n<i>منتظر پیش‌فاکتورِ تأمین‌کننده.</i>";
    kb.push([{ text: "↩️ برگرداندن با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  } else if (b.state === "proforma") {
    kb.push([{ text: "📄 دیدن پیش‌فاکتور", callback_data: `xd:${b.id}:pf` }, { text: ai ? "🤖 خوانش دوباره" : "🤖 خوانش هوشمند", callback_data: `xd:${b.id}:ai` }]);
    if (ai) {
      text += matchText(ai, acc);
      const r = resolve(ai, acc);
      text += r.ready
        ? `\n\n✅ <b>همه‌چیز برای تأیید نهایی آماده است.</b>${r.gaps.length ? `\n<i>خالی می‌ماند و خط استعلام «ثبت موقت» نمی‌شود: ${esc(r.gaps.slice(0, 6).join("، "))}</i>` : ""}`
        : `\n\n⛔ <b>مانده — تیک بزنید (پیش‌فاکتور ملاک) یا برگردانید:</b>\n${r.problems.slice(0, 4).map((p) => `• ${esc(p)}`).join("\n")}${r.problems.length > 4 ? `\n• … و ${fa(r.problems.length - 4)} مورد دیگر` : ""}`;
      const list = acceptList(ai);
      const open = list.filter((x) => !acc[x.key]);
      if (open.length > 1) kb.push([{ text: `☑️ تیکِ همهٔ غیرسبزها (${fa(open.length)}) — پیش‌فاکتور ملاک`, callback_data: `xd:${b.id}:aa` }]);
      list.slice(0, 24).forEach((x, i) => {
        if (i % 2 === 0) kb.push([]);
        kb[kb.length - 1].push({ text: `${acc[x.key] ? "☑️" : "⬜"} ${ICON[x.row.status] || ""} ${short(x.row.label, 12)}${x.line && x.line.no ? ` (کد ${fa(x.line.no)})` : ""}`, callback_data: `xa:${b.id}:${i}` });
      });
    } else text += "\n\n<i>برای جدول تطابق و پر شدنِ فیلدها از پیش‌فاکتور، «🤖 خوانش هوشمند» را بزنید.</i>";
    kb.push([{ text: "🏁 تأیید نهایی", callback_data: `xd:${b.id}:fn` }]);
    kb.push([{ text: "↩️ برگرداندن با توضیح", callback_data: `xd:${b.id}:rt` }, { text: "❌ رد", callback_data: `xd:${b.id}:rj` }]);
  }
  return { text: text.length > 4000 ? text.slice(0, 3990) + "…" : text, kb };
}
export const aiConfirmKb = (bid) => [[{ text: "🤖 بله، بخوان", callback_data: `xd:${bid}:ai2` }], [{ text: "✖️ نه", callback_data: `xd:${bid}:card` }]];

/**
 * «👁 پیش‌نمایش پیش‌فاکتور» در بات (فاز ۴): همان عددهای pfdoc.js — هر قلم با قیمت واحد و جمعِ درشت، جمع، ارزش افزوده و جمعِ کل،
 * و شرایط. missing: خانه‌های لازمِ خالی (sp-core.js:proformaMissing).
 */
export function previewText(env, th, lines, terms, missing = []) {
  const d = proformaData(proformaInput(env, th, lines, terms));
  let text = `👁 <b>پیش‌نمایش پیش‌فاکتور</b> — استعلام ${esc(th.request_id)}\n<i>همین را سامانه از فیلدهای شما می‌سازد و با «📤 ارسال» برای کارشناس می‌رود.</i>\n`;
  text += d.lines.map((l) => `\n▫️ <b>${esc(l.title)}</b>${l.no ? ` <i>(کد ${fa(l.no)})</i>` : ""}\n   ${qty(l.qty)} ${esc(l.unit || "")} × <b>${money(l.price)}</b> = <b>${money(l.total)}</b> ریال`
    + (l.desc ? `\n   ${esc(l.desc)}` : "") + (T(l.note) ? `\n   📝 ${esc(short(l.note, 200))}` : "")).join("");
  text += `\n\nجمع (بی ارزش افزوده): <b>${money(d.sum)}</b> ریال${d.vat ? `\nارزش افزوده: ${money(d.vat)} ریال` : ""}\n<b>جمع کل: ${money(d.grand)} ریال</b>`;
  const tr = termRows(d.terms);
  if (tr.length) text += `\n\n🧾 ${tr.map(([k, v]) => `${esc(k)}: ${esc(fa(v))}`).join(" · ")}`;
  const miss = missing.map((m) => (/^(qty|price):/.test(m) ? null : TERM_FA[m])).filter(Boolean);
  if (missing.length) text += `\n\n⛔ <b>هنوز کامل نیست:</b> ${esc([...(missing.some((m) => /^(qty|price):/.test(m)) ? ["مقدار یا قیمتِ بعضی اقلام"] : []), ...miss].join("، "))}`;
  return text.length > 4000 ? text.slice(0, 3990) + "…" : text;
}

/** شرایطِ فاکتور: کلیدِ کوتاهِ دکمه‌ها (d زمان تحویل · p تسویه · i نوع فاکتور · v ارزش افزوده · x اعتبار) */
export const TERM_KEY = { d: "dtime", p: "pay", i: "invoice", v: "vat", x: "valid_days" };
export const TERM_BTN = { d: "🚚 زمان تحویل", p: "💳 تسویه", i: "🧾 نوع فاکتور", v: "➕ ارزش افزوده", x: "📅 اعتبار" };
const termsBlock = (tm) => TERM_FIELDS.map((f) => `${TERM_FA[f]}: <b>${T(tm[f]) ? esc(fa(tm[f])) : "—"}</b>`).join("\n");

/** کارت اقلام برای تأمین‌کننده — تازه‌ترها بالا */
export function itemsCard(env, th, lines, bundles) {
  const L = lines.slice().sort((a, b) => b.id - a.id);
  const ready = L.filter((l) => l.state === "ready");
  const tm = termsOf(th), tmiss = termsMissing(tm);
  let text = `📦 <b>اقلام استعلام ${esc(th.request_id)}</b> <i>(تازه‌ترها بالا)</i>\n`
    + L.map((l) => `• <b>${esc(lineTag(l))}</b> — <i>${esc(LINE_FA[l.state] || l.state)}</i>\n   ${lineSum(l)}`).join("\n");
  text += `\n\n🧾 <b>شرایط فاکتور</b> (برای همهٔ اقلام): ${termsLine(tm) ? esc(termsLine(tm)) : "—"}${tmiss.length ? `\n<i>مانده: ${esc(tmiss.join("، "))}</i>` : ""}`;
  const waitPf = bundles.filter((b) => b.state === "approved");
  if (waitPf.length) text += `\n\n📄 ${fa(waitPf.length)} بسته منتظر پیش‌فاکتور شماست.`;
  text += "\n\n<i>روی هر قلم بزنید تا قیمت واحد و شرایط را ثبت کنید؛ بعد «آمادهٔ ارسال». لایه‌های 🔒 ثابت‌اند؛ اگر توضیحی دارید زیر همان قلم بنویسید و ارسال کنید.</i>";
  const kb = L.slice(0, 30).map((l) => [{ text: `${["new", "draft", "returned"].includes(l.state) ? "✏️" : l.state === "ready" ? "☑️" : "📌"} ${lineTag(l, 30)}`, callback_data: `si:${l.id}` }]);
  if (ready.length) kb.push([{ text: `📤 ارسال برای کارشناس (${fa(ready.length)} قلمِ آماده)`, callback_data: `ss:${th.id}` }]);
  for (const b of waitPf) kb.push([{ text: `📄 ارسال پیش‌فاکتور (بستهٔ ${fa(b.id)})`, callback_data: `sp:${b.id}` }]);
  kb.push([{ text: "🧩 باز کردن در پنل", web_app: { url: appUrl(env, "s") } }]);
  return { text, kb };
}

/**
 * کارت یک قلم برای تأمین‌کننده، در سه بخش: مقدار و واحد و قیمت · شرایط فاکتور (برای همهٔ اقلام همین استعلام) ·
 * نوع قلم و لایه‌های ویژگیِ قفل (و لایه‌های افزوده). «آمادهٔ ارسال» که خورد، فقط دو راه می‌ماند: «✏️ ویرایش»
 * (برگشت به پیش‌نویس) یا «📤 ارسال» — تا تأمین‌کننده سرگردان نماند که حالا چه کند (و «اقلام دیگر» اگر مانده).
 */
/** opt (فاز ۴ب گام ۳): limits — «📋 شرایط خرید»ِ شرکت برای همین قلم؛ revise — پیشنهادِ تأییدنهایی‌شده اصلاح‌پذیر است */
export function lineCard(l, files, others, terms, opt = {}) {
  const extra = parse(l.extra_json, []);
  const editable = ["new", "draft", "returned"].includes(l.state);
  const tm = terms || {};
  /* فاز ۴: 🔒 فقط‌خواندنی، 🔓 قابل تغییر — مقدارِ 🔒 یعنی کلِ مقدار و 🔓 یعنی کمتر هم می‌شود؛ واحد همان واحدِ درخواست */
  const lk = locksOfLine(l);
  const layers = lineLayers(l);
  let text = `✏️ <b>${esc(lineTag(l, 80))}</b>\nوضعیت: <i>${esc(LINE_FA[l.state] || l.state)}</i>\n`;
  if (!lk.legacy) text += `${lk.title ? "🔒 عنوان ثابت است" : `🔓 عنوان: <b>${esc(lineTitle(l))}</b>${lineTitle(l) !== l.title ? " <i>(پیشنهادِ شما)</i>" : ""}`}\n`;
  const qtyLock = lk.legacy ? "" : lk.qty ? " 🔒 <i>(کلِ مقدارِ درخواست)</i>" : ` 🔓 <i>(کمتر هم می‌شود؛ حداکثر ${qty(l.req_qty)})</i>`;
  text += `\n📦 <b>مقدار، واحد و قیمت</b>\nمقدار: <b>${qty(l.qty)} ${esc(l.unit || "")}</b>${qtyLock}${lk.legacy ? ` <i>(درخواست: ${qty(l.req_qty)} ${esc(l.req_unit || "")})</i>` : ""}`
    + `\nقیمت واحد (ریال، بدون ارزش افزوده): <b>${money(l.price)}</b>\nقیمت کل: <b>${money(l.qty != null && l.price != null ? l.qty * l.price : null)}</b> ریال\n`;
  text += `\n🧾 <b>شرایط فاکتور</b> <i>(برای همهٔ اقلامِ این استعلام)</i>\n${termsBlock(tm)}\n`;
  if (opt.limits) text += `<i>📋 شرطِ شرکت: ${esc(limitsTxt(opt.limits))} — 🔒 را پنل بیرونش نمی‌پذیرد.</i>\n`;
  text += `\n🔒 <b>نوع قلم و لایه‌های ویژگی</b>${lk.legacy ? "" : " <i>(🔒 ثابت · 🔓 قابل تغییر)</i>"}\n${l.head ? `نوع قلم: ${esc(l.head)}\n` : ""}`
    + `${layers.length ? layers.map((x) => `${lk.layers[x.k] === false ? "🔓" : "•"} ${esc(x.k)}: ${esc(x.v)}${x.req != null ? ` <i>(درخواست: ${esc(x.req)})</i>` : ""}`).join("\n") : "—"}`
    + `\n➕ لایه‌های افزودهٔ شما: ${extra.length ? extra.map((x) => esc(layerTxt(x))).join("، ") : "—"}\n`;
  if (l.note) text += `\n📝 توضیح: ${esc(l.note)}`;
  text += `\n📎 پیوست‌ها: ${files.length ? files.map((f) => esc(f.label)).join("، ") : "—"}`;
  const kb = [];
  if (l.state === "ready") {
    text += "\n\n✅ <b>این قلم آمادهٔ ارسال است.</b> برای تغییر «✏️ ویرایش»، برای فرستادن برای کارشناس «📤 ارسال».";
    kb.push([{ text: "✏️ ویرایش", callback_data: `sr:${l.id}:0` }, { text: "📤 ارسال", callback_data: `ss:${l.thread_id}` }]);
    if (others) kb.push([{ text: `📦 اقلام دیگر (${fa(others)} قلمِ مانده)`, callback_data: `ic:${l.thread_id}` }]);
    return { text, kb };
  }
  const miss = [...lineMissing(l), ...termsMissing(tm)];
  if (editable && miss.length) text += `\n\n<i>مانده برای «آمادهٔ ارسال»: ${esc(miss.join("، "))}</i>`;
  if (editable) {
    /* یک دکمهٔ اصلی: «📝 پر کردن اطلاعات» — پرسش‌های نوبتی، همان ترتیبِ پنل وب (sp-bot.js:wizardNext؛ مهر ۱۴۰۵) */
    kb.push([{ text: "📝 پر کردن اطلاعات", callback_data: `wz:${l.id}` }]);
    /* مقدارِ 🔒 و واحدِ ثابت دکمه ندارند */
    kb.push([...(lk.legacy || !lk.qty ? [{ text: "🔢 مقدار", callback_data: `sv:${l.id}:q` }] : []), ...(lk.legacy || !lk.unit ? [{ text: "📏 واحد", callback_data: `sv:${l.id}:u` }] : []),
      { text: "💰 قیمت واحد", callback_data: `sv:${l.id}:p` }]);
    kb.push(["d", "p", "i"].map((k) => ({ text: TERM_BTN[k], callback_data: `tk:${l.id}:${k}` })));
    kb.push(["v", "x"].map((k) => ({ text: TERM_BTN[k], callback_data: `tk:${l.id}:${k}` })));
    /* 🔓ها: عنوان و هر لایهٔ باز (sy:<خط>:<شمارهٔ لایه>) */
    const open = [...(!lk.legacy && !lk.title ? [{ text: "🔓 عنوان", callback_data: `sv:${l.id}:t` }] : []),
      ...layers.map((x, i) => (lk.layers[x.k] === false ? { text: `🔓 ${short(x.k, 14)}`, callback_data: `sy:${l.id}:${i}` } : null)).filter(Boolean)];
    for (let i = 0; i < open.length && i < 8; i += 2) kb.push(open.slice(i, i + 2));
    kb.push([{ text: "➕ لایهٔ تازه", callback_data: `sv:${l.id}:l` }, { text: "📝 توضیح", callback_data: `sv:${l.id}:n` }, { text: "📎 پیوست", callback_data: `sa:${l.id}` }]);
    extra.slice(0, 8).forEach((x, i) => { if (i % 2 === 0) kb.push([]); kb[kb.length - 1].push({ text: `🗑 ${short(x.k, 14)}`, callback_data: `sl:${l.id}:${i}` }); });
    kb.push([{ text: miss.length ? "✅ آمادهٔ ارسال (اول مانده‌ها را پر کنید)" : "✅ آمادهٔ ارسال", callback_data: `sr:${l.id}:1` }]);
  }
  if (l.state === "final" && opt.revise) {
    text += "\n\n🏁 <b>تأیید نهایی شد.</b> اگر قیمت یا شرایطِ بهتری دارید، «✏️ اصلاحِ پیشنهاد» را بزنید و دوباره بفرستید؛ پیشنهادِ تازه جای قبلی را می‌گیرد.";
    kb.push([{ text: "✏️ اصلاحِ پیشنهاد", callback_data: `rv:${l.id}` }]);
  }
  kb.push([{ text: "📦 فهرست اقلام", callback_data: `ic:${l.thread_id}` }]);
  return { text, kb };
}

/* ------------------------------------------------------------------ */
/* نمایش یک گفت‌وگو: پاک کردن، سرآیند با منو، تاریخچه و کارت کارها        */
/* ------------------------------------------------------------------ */
export async function showThread(env, row, th) {
  const side = row.role;
  await clearChat(env, row);
  setFocus(row, th.id); setFlow(row, null);
  await send(env, row, headerText(env, th, side), menuKb(env, side, hasBoth(row)));
  const msgs = (await env.DB.prepare(`SELECT * FROM (SELECT * FROM sp_msgs WHERE thread_id=? AND id>?${side === "s" ? " AND kind!='note'" : ""} ORDER BY id DESC LIMIT 40) ORDER BY id`)
    .bind(th.id, clearedUpTo(th, side)).all()).results || [];
  const chunks = [];
  let cur = "";
  for (const m of msgs) {
    const s = msgLine(th, msgOut(m), side).slice(0, MSG_MAX);
    if (cur && cur.length + s.length + 2 > MSG_MAX) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + s;
  }
  if (cur) chunks.push(cur);
  if (!chunks.length) await send(env, row, "<i>هنوز پیامی نیست.</i>");
  /* «🧹 پاک کردن گفت‌وگو» زیرِ آخرین تکهٔ تاریخچه — فقط از صفحهٔ همین طرف */
  for (let i = 0; i < chunks.length; i++) await send(env, row, chunks[i], i === chunks.length - 1 ? [[{ text: "🧹 پاک کردن گفت‌وگو از صفحهٔ من", callback_data: `cc:${th.id}` }]] : null);
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
  const pfRead = open.length ? await pfReadOn(env) : true;
  for (const b of open.slice(-5)) { const c = bundleCard(th, b, L.filter((l) => l.bundle_id === b.id), { pfRead }); await send(env, row, c.text, c.kb); }
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
      return bundleCard(th, b, L, { pfRead: await pfReadOn(env) });
    }
  }
  if (side === "s") {
    if (ev === "approve" && m.meta.bundle) return { kb: [[{ text: "📄 ارسال پیش‌فاکتور", callback_data: `sp:${m.meta.bundle}` }]] };
    if (["rfq", "remind", "return"].includes(ev)) return { kb: [[{ text: "📝 دیدن و پر کردن اقلام", callback_data: `ic:${th.id}` }]] };
  }
  return null;
}

/** گفت‌وگوهای تلگرامیِ یک طرف — بر اساس هویت، نه نقشِ فعلی (هر دو هویت در یک گفت‌وگو ممکن است) */
const rowsFor = async (env, th, side) => ((side === "e"
  ? await env.DB.prepare("SELECT * FROM sp_tg WHERE expert_id=?").bind(th.expert_id).all()
  : await env.DB.prepare("SELECT * FROM sp_tg WHERE phone_id IN (SELECT id FROM sp_phones WHERE supplier_id=?)").bind(th.supplier_id).all()).results || []);

/**
 * پیام‌های تازهٔ یک گفت‌وگو به گفت‌وگوهای تلگرامیِ طرف دیگر: اگر همان گفت‌وگو و همان نقش جلوی چشم اوست،
 * خودِ پیام (و برای رخدادها کارت و دکمه‌هایش)، وگرنه هشدار با دکمهٔ «رفتن به این گفت‌وگو». شکستِ تلگرام
 * کار اصلی را نمی‌خواباند. بات کارشناسان هیچ‌کدام را نمی‌گیرد — مکاتبات فقط در بات مکاتبات است.
 */
export async function pushMsgs(env, thIn, msgs) {
  if (!msgs || !msgs.length || !spReady(env)) return { sent: 0 };
  const th = thIn && thIn.supplier_name !== undefined && thIn.expert_id !== undefined ? thIn : await threadRow(env, thIn.id || thIn.thread_id || thIn);
  if (!th) return { sent: 0 };
  let sent = 0;
  /* گفت‌وگوی بستهٔ کارشناس هوشمند به تلگرامِ کارشناس نمی‌رود — فقط وقتی «پرسش از کارشناس» بازش کرده (ai-lock.js) */
  const shutE = (await aiThread(env, th.id, th.expert_id)).locked;
  for (const side of ["e", "s"]) {
    if (side === "e" && shutE) continue;
    const mine = msgs.filter((m) => m.who !== side && m.kind !== "note");
    if (!mine.length) continue;
    for (const row of await rowsFor(env, th, side)) {
      try {
        if (row.role === side && row.focus === th.id) {
          for (const m of mine) {
            const a = await actionKb(env, th, m, side);
            if (a && a.text) { await send(env, row, msgLine(th, m, side)); await send(env, row, a.text, a.kb); }
            else await send(env, row, msgLine(th, m, side), a && a.kb);
            if (m.kind === "voice" && side === "e") await voiceTo(env, row, m);
            sent++;
          }
          await markSeen(env, th.id, side);
        } else {
          const last = mine[mine.length - 1];
          const who = last.who === "s" ? th.supplier_name : `کارشناس — ${th.expert_label || th.expert_name}`;
          const role = row.role !== side ? (side === "e" ? " <i>(نقش کارشناس)</i>" : " <i>(نقش تأمین‌کننده)</i>") : "";
          const lastTxt = last.kind === "voice" ? (side === "e" ? `🎤 ${last.body || "پیام صوتی"}` : "🎤 پیام صوتی") : last.body;
          await send(env, row, `🔔 <b>${esc(who)}</b> — ${side === "e" ? "درخواست" : "استعلام"} ${esc(th.request_id)}${mine.length > 1 ? ` (${fa(mine.length)} پیام)` : ""}${role}\n${esc(short(lastTxt.replace(/\s+/g, " "), 200))}`,
            [[{ text: "🔀 رفتن به این گفت‌وگو", callback_data: `go:${th.id}:${side}` }]]);
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

/** خودِ صدا برای کارشناس در تلگرام: ویسِ تلگرامی با همان file_id؛ صدای پنل وب با لینکِ امضاشدهٔ هفت‌روزه (اگر انبار بدهد) */
async function voiceTo(env, row, m) {
  const v = (m.meta && m.meta.voice) || {};
  try {
    if (v.tg) { const r = await spApi(env).call("sendVoice", { chat_id: row.chat, voice: v.tg }); track(row, r && r.message_id); return; }
    const store = storage(env);
    if (v.key && store && store.signedUrl) await send(env, row, "🎧 صدای همین پیام:", [[{ text: "▶️ شنیدن پیام صوتی", url: await store.signedUrl(v.key, 7 * 86400) }]]);
  } catch (e) { console.error("sp voice push", e && e.message); }
}

/**
 * پیامکِ شبیه‌سازی‌شده در بات مکاتباتِ کارشناس — با لینک پنل، لینک بات و رمز، تا سمتِ تأمین‌کننده را ببیند: وقتی
 * درگاه پیامک وصل نیست، پیامکِ واقعی نرفت (sms.error) یا تأمین‌کنندهٔ فرضی است (worker/sp-sms.js).
 * خروجی: به چند گفت‌وگو رسید (۰ یعنی کارشناس هنوز بات مکاتبات را وصل نکرده).
 */
export async function deliverSms(env, expertId, sms, rowsIn) {
  if (!spReady(env) || !sms) return 0;
  const rows = rowsIn || ((await env.DB.prepare("SELECT * FROM sp_tg WHERE expert_id=?").bind(expertId).all()).results || []);
  let n = 0;
  for (const row of rows) {
    try {
      const kb = [];
      if (sms.panel) kb.push([{ text: "🌐 پنل تأمین‌کننده (لینک پیامک)", url: sms.panel }]);
      if (sms.bot) kb.push([{ text: "🤖 بات تأمین‌کننده (لینک پیامک)", url: sms.bot }]);
      if (sms.thread_id) kb.push([{ text: "🔀 رفتن به این گفت‌وگو", callback_data: `go:${sms.thread_id}:e` }]);
      await send(env, row, `📱 <b>پیامک شبیه‌سازی‌شده</b> — به ${esc(sms.to || "")}${sms.label ? ` (${esc(sms.label)})` : ""}${sms.supplier ? ` · ${esc(sms.supplier)}` : ""}${row.role !== "e" ? " <i>(نقش کارشناس)</i>" : ""}\n`
        + (sms.error ? `⚠️ <i>پیامکِ واقعی نرفت: ${esc(sms.error)} — متن را خودتان به تأمین‌کننده برسانید.</i>\n`
          : "<i>پیامک فعلاً خاموش است؛ در حالت واقعی همین متن فقط به گوشی تأمین‌کننده می‌رود. رمزِ هر پیامک تا هفت روز (یا تا «خروج») معتبر است.</i>\n")
        + `<blockquote>${esc(sms.text || "")}</blockquote>`, kb);
      await save(env, row);
      n++;
    } catch (e) { console.error("sp sms", e && e.message); }
  }
  return n;
}
