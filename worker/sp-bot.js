/**
 * بات مکاتبات تأمین‌کنندگان (TG_SP_BOT_TOKEN) — «بات خالص و منو» در کنار مینی‌اپ، برای مقایسه.
 * همهٔ مکاتباتِ کارشناس با تأمین‌کننده این‌جاست (تصمیم مدیر، مهر ۱۴۰۵) — بات کارشناسان از آن چیزی نشان نمی‌دهد.
 *
 * دو نقش؛ یک گفت‌وگو می‌تواند هر دو هویت را داشته باشد (برای آزمودنِ هر دو سو با یک حساب) و با «🔁» عوضشان کند:
 *   کارشناس   — با لینک یک‌بارمصرف (/start e…) از «ارسال» در بات کارشناسان یا صفحهٔ مکاتبات وصل می‌شود.
 *               منوی ثابت: «لیست درخواست‌ها» ← تأمین‌کنندگانِ آن درخواست، و «لیست تأمین‌کنندگان» ← درخواست‌ها.
 *               انتخاب یک گفت‌وگو صفحه را پاک می‌کند و تاریخچهٔ کامل همان را می‌نویسد؛ هر متنی بعد از آن
 *               برای همان تأمین‌کننده می‌رود. پیامِ تأمین‌کنندهٔ دیگر هشدار و دکمهٔ «رفتن به این گفت‌وگو» دارد.
 *               جدول تطابقِ خوانش هوشمند، پذیرش مغایرت‌ها و تأیید نهایی هم همین‌جاست.
 *   تأمین‌کننده — با لینک پیامک (/start s…) و رمزِ همان پیامک. منو: استعلام‌ها، گفت‌وگو، پنل (مینی‌اپ)، خروج.
 *               پر کردن گام‌به‌گامِ مقدار و قیمت واحد، لایهٔ تازه و پیوست؛ «آمادهٔ ارسال» ← «ویرایش» یا «ارسال».
 *
 * وضعیت یکی است: همان توابع sp-core.js که پنل وب صدا می‌زند؛ هر تغییری این‌جا در پنل هم دیده می‌شود.
 * همیشه بی‌استثنا برمی‌گردد تا تلگرام آپدیت را دوباره نفرستد.
 */
import { esc, TgError } from "./telegram.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { deliverPass } from "./sp-sms.js";
import { aiKick } from "./ai-agent.js";
import { runAiCheck, aiUsable } from "./sp-ai.js";
import { ENUMS } from "./quote-rules.js";
import { ingestVoice, VOICE_MAX } from "./sp-voice.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const { fa, short } = P;

/* ------------------------------------------------------------------ */
/* وبهوک                                                                 */
/* ------------------------------------------------------------------ */
async function settingJson(env, key) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  try { return r ? JSON.parse(r.value) : null; } catch (_) { return null; }
}

/**
 * وبهوکِ این بات روی دامنهٔ سایت؛ نشانی و نام کاربریِ بات (getMe) در settings.spBot می‌ماند تا هر
 * درخواست دوباره به تلگرام نرود. `force` از /tg/setup مدیر.
 */
export async function ensureSpWebhook(env, origin, force) {
  if (!env.TG_SP_BOT_TOKEN || !env.TG_WEBHOOK_SECRET) return { ok: false, reason: "TG_SP_BOT_TOKEN یا TG_WEBHOOK_SECRET ست نشده است." };
  const want = `${C.siteOrigin(env, origin)}/tamin-poshtibani/api/tg/sp-webhook`;
  const cur = await settingJson(env, "spBot");
  if (!force && cur && cur.url === want && cur.username) return { ok: true, cached: true, ...cur };
  const api = P.spApi(env);
  await api.setWebhook(want, env.TG_WEBHOOK_SECRET);
  const me = await api.getMe();
  await api.call("setMyCommands", { commands: [{ command: "start", description: "منو" }, { command: "cancel", description: "انصراف از کار نیمه‌تمام" }] }).catch(() => {});
  const v = { url: want, username: me.username, id: me.id, at: now() };
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('spBot',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(JSON.stringify(v), now()).run();
  return { ok: true, ...v };
}

/* ------------------------------------------------------------------ */
/* ورودی                                                                 */
/* ------------------------------------------------------------------ */
/* ctx (اختیاری): کارِ تأمین‌کننده در گفت‌وگوی کارشناس هوشمند، گامِ مذاکره را بعد از پاسخ می‌زند (aiKick، waitUntil) */
export async function handleSpUpdate(env, u, ctx) {
  try {
    if (u.message) return await onMessage(env, u.message, ctx);
    if (u.callback_query) return await onCallback(env, u.callback_query, ctx);
    const m = u.my_chat_member;
    if (m && m.chat && ["left", "kicked"].includes(m.new_chat_member && m.new_chat_member.status)) {
      await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(String(m.chat.id)).run();
    }
  } catch (e) {
    console.error("sp bot update failed", e && e.message);
  }
  return { ok: true };
}

const WELCOME = "این بات برای مکاتبهٔ کارشناسان خرید شرکت و تأمین‌کنندگان است.\n\n"
  + "• <b>تأمین‌کننده:</b> لینکی را که در پیامک آمده باز کنید و رمز همان پیامک را بفرستید.\n"
  + "• <b>کارشناس:</b> از «ارسال» در بات کارشناسان یا صفحهٔ مکاتبات، دکمهٔ «بات مکاتبات» را بزنید.";

async function plain(env, chat, text, kb) {
  return P.spApi(env).sendMessage(chat, text, kb).catch(() => null);
}

async function onMessage(env, msg, ctx) {
  const chat = msg.chat && msg.chat.id;
  if (!chat || msg.chat.type !== "private") return { ok: true };
  const text = T(msg.text);
  const st = /^\/start(?:\s+(\S+))?$/.exec(text);
  const param = st ? st[1] || "" : "";
  /* اتصال ردیفِ تازه‌ای می‌سازد؛ ردیفِ قبلی نباید بعدش روی آن نوشته شود */
  if (/^s[0-9a-f]{12}$/.test(param)) return startSupplier(env, chat, await P.tgRow(env, chat), param.slice(1), msg.message_id);
  if (/^e[0-9a-f]{24}$/.test(param)) return startExpert(env, chat, await P.tgRow(env, chat), param, msg.message_id);
  const row = await P.tgRow(env, chat);
  if (!row) { await plain(env, chat, WELCOME); return { ok: true }; }
  P.track(row, msg.message_id);
  row._ctx = ctx;
  try {
    /* منتظرِ رمزِ تأمین‌کننده ولی هویتِ کارشناسی هم دارد: /start، انصراف یا دکمهٔ منوی کارشناس یعنی برگشت به
       نقش کارشناس — وگرنه هر متنی رمزِ اشتباه حساب می‌شد و گفت‌وگو در «منتظر رمز» گیر می‌کرد */
    const eMenu = Object.values(P.MENU.e).includes(text);
    if (row.role === "p" && row.expert_id && (st || eMenu || /^\/cancel$|^انصراف$/.test(text))) {
      row.role = "e"; P.setFlow(row, null);
      if (!eMenu) return await home(env, row, "باشد، ورودِ تأمین‌کننده کنار گذاشته شد.");
    }
    if (st) {
      if (row.role === "e" || row.role === "s") return await home(env, row, "سلام 👋");
      await P.send(env, row, WELCOME);
      return { ok: true };
    }
    if (/^\/cancel$|^انصراف$/.test(text)) { P.setFlow(row, null); await P.send(env, row, "باشد، کنار گذاشته شد."); return { ok: true }; }
    /* «🔁» — گفت‌وگویی که هر دو هویت را دارد، نقشش را عوض می‌کند */
    if ((text === P.MENU.e.swap || text === P.MENU.s.swap) && P.hasBoth(row)) return await switchRole(env, row, text === P.MENU.e.swap ? "s" : "e");
    if (row.role === "p") return await pendingPass(env, row, text);
    if (row.role === "e") return await expertMessage(env, row, msg, text);
    if (row.role === "s") return await supplierMessage(env, row, msg, text);
    return { ok: true };
  } finally {
    await P.save(env, row).catch((e) => console.error("sp save", e && e.message));
  }
}

/* ------------------------------------------------------------------ */
/* اتصال و نقش                                                           */
/* ------------------------------------------------------------------ */
/** نقش را می‌گذارد و هویتِ دیگرِ همین گفت‌وگو (اگر هست) را نگه می‌دارد */
async function upsertRow(env, chat, role, fields) {
  await env.DB.prepare(`INSERT INTO sp_tg (chat,role,expert_id,phone_id,focus,flow_json,ids_json,updated_at) VALUES (?,?,?,?,NULL,?,COALESCE((SELECT ids_json FROM sp_tg WHERE chat=?),'[]'),?)
    ON CONFLICT(chat) DO UPDATE SET role=excluded.role, expert_id=COALESCE(excluded.expert_id, sp_tg.expert_id), phone_id=COALESCE(excluded.phone_id, sp_tg.phone_id),
      focus=NULL, flow_json=excluded.flow_json, updated_at=excluded.updated_at`)
    .bind(String(chat), role, fields.expert_id || null, fields.phone_id || null, fields.flow ? JSON.stringify(fields.flow) : null, String(chat), now()).run();
  return P.tgRow(env, chat);
}

async function switchRole(env, row, role) {
  row.role = role; P.setFocus(row, null); P.setFlow(row, null);
  await P.setMenuButton(env, row.chat, role);
  return home(env, row, role === "e" ? "🔁 حالا در نقشِ <b>کارشناس</b> هستید." : "🔁 حالا در نقشِ <b>تأمین‌کننده</b> هستید.");
}

async function startSupplier(env, chat, row, k, startMid) {
  const ph = await env.DB.prepare("SELECT p.id, s.name FROM sp_phones p JOIN sp_suppliers s ON s.id=p.supplier_id WHERE p.k=?").bind(k).first();
  if (!ph) { await plain(env, chat, "این لینک معتبر نیست. لینک را از آخرین پیامک باز کنید."); return { ok: true }; }
  if (row && row.phone_id === ph.id && row.role !== "p") {
    P.track(row, startMid);
    try {
      if (row.role !== "s") return await switchRole(env, row, "s");
      return await home(env, row, "شما از قبل وارد شده‌اید.");
    } finally { await P.save(env, row); }
  }
  const was = row && row.expert_id ? "\n<i>(این گفت‌وگو نقش کارشناس هم دارد؛ بعد از ورود با «🔁» بین دو نقش جابه‌جا شوید.)</i>" : "";
  const r = await upsertRow(env, chat, "p", { flow: { step: "pass", k } });
  P.track(r, startMid);
  await P.send(env, r, `🔐 ورود <b>${esc(ph.name)}</b>\n\nرمز ۶ رقمیِ پیامک را بفرستید.${was}`,
    [[{ text: "📱 رمز ندارم — ارسال رمز به پیامک", callback_data: `rs:${k}` }]]);
  await P.save(env, r);
  return { ok: true };
}

async function pendingPass(env, row, text) {
  const f = P.flowOf(row) || {};
  if (!f.k) { await P.send(env, row, WELCOME); return { ok: true }; }
  try {
    const sup = await C.login(env, f.k, text);
    await env.DB.prepare("UPDATE sp_tg SET role='s', phone_id=?, flow_json=NULL, focus=NULL, updated_at=? WHERE chat=?").bind(sup.phone_id, now(), row.chat).run();
    Object.assign(row, { role: "s", phone_id: sup.phone_id, flow_json: null, focus: null });
    await P.setMenuButton(env, row.chat, "s");
    await P.send(env, row, `✅ خوش آمدید، <b>${esc(sup.name)}</b>.\nاز منوی پایین «📋 استعلام‌ها» را بزنید؛ یا همه‌چیز را در «🧩 پنل (مینی‌اپ)» ببینید.`, P.menuKb(env, "s", P.hasBoth(row)));
    return listSupplierThreads(env, row, sup);
  } catch (e) {
    await P.send(env, row, `⚠️ ${esc(e.message)}`, [[{ text: "📱 ارسال رمز به پیامک", callback_data: `rs:${f.k}` }]]);
    return { ok: true };
  }
}

async function startExpert(env, chat, row, token, startMid) {
  const t = now();
  const lk = await env.DB.prepare("SELECT * FROM sp_links WHERE token=?").bind(token).first();
  if (!lk || lk.used_at || lk.expires_at < t) { await plain(env, chat, "این لینک معتبر نیست یا منقضی شده است؛ از بات کارشناسان یا صفحهٔ مکاتبات لینک تازه بگیرید."); return { ok: true }; }
  const ex = await env.DB.prepare("SELECT id, name, label, active FROM experts WHERE id=?").bind(lk.expert_id).first();
  if (!ex || !ex.active) { await plain(env, chat, "این کارشناس فعال نیست."); return { ok: true }; }
  await env.DB.prepare("UPDATE sp_links SET used_at=?, payload=NULL WHERE token=?").bind(t, token).run();
  const r = await upsertRow(env, chat, "e", { expert_id: ex.id });
  P.track(r, startMid);
  await P.setMenuButton(env, chat, "e");
  await P.send(env, r, `✅ ${esc(ex.label || ex.name)}، این گفت‌وگو «بات مکاتبات» شما شد.\n\n`
    + "از منوی پایین «📋 لیست درخواست‌ها» یا «🏷 لیست تأمین‌کنندگان» را بزنید و یک گفت‌وگو را باز کنید؛ "
    + "از آن پس هر چه بنویسید برای همان تأمین‌کننده می‌رود. همه‌چیز در «🧩 مکاتبات (مینی‌اپ)» هم هست."
    + (P.hasBoth(r) ? "\n<i>(این گفت‌وگو نقش تأمین‌کننده هم دارد؛ با «🔁» بین دو نقش جابه‌جا شوید.)</i>" : ""), P.menuKb(env, "e", P.hasBoth(r)));
  /* پیامک‌های شبیه‌سازی‌شده‌ای که تا حالا جایی برای نشان دادن نداشتند */
  for (const sms of parse(lk.payload, [])) await P.deliverSms(env, ex.id, sms, [r]);
  await P.save(env, r);
  return { ok: true };
}

async function home(env, row, head) {
  if (row.role === "e") {
    const ex = await expertOf(env, row);
    if (!ex) return { ok: true };
    await P.send(env, row, `${head}\nاز منوی پایین یکی از فهرست‌ها را بزنید.`, P.menuKb(env, "e", P.hasBoth(row)));
    return listRequests(env, row, ex);
  }
  const sup = await supplierOf(env, row);
  if (!sup) return { ok: true };
  await P.send(env, row, `${head}\n${esc(sup.name)}`, P.menuKb(env, "s", P.hasBoth(row)));
  return listSupplierThreads(env, row, sup);
}

/** هویتی که دیگر معتبر نیست برداشته می‌شود؛ اگر هویتِ دیگری مانده، گفت‌وگو با همان می‌ماند */
async function dropIdentity(env, row, which, msg) {
  const other = which === "e" ? row.phone_id : row.expert_id;
  if (other) {
    await env.DB.prepare(`UPDATE sp_tg SET ${which === "e" ? "expert_id" : "phone_id"}=NULL, role=?, focus=NULL, flow_json=NULL WHERE chat=?`).bind(which === "e" ? "s" : "e", row.chat).run();
  } else await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
  row._dirty = false;
  await plain(env, row.chat, msg);
}
async function expertOf(env, row) {
  const ex = row.expert_id ? await env.DB.prepare("SELECT id, name, label, active FROM experts WHERE id=?").bind(row.expert_id).first() : null;
  if (ex && ex.active) return ex;
  await dropIdentity(env, row, "e", "این حساب کارشناسی دیگر فعال نیست؛ اتصالش برداشته شد.");
  return null;
}
async function supplierOf(env, row) {
  const sup = row.phone_id ? await C.phoneIdentity(env, row.phone_id) : null;
  if (sup) return sup;
  await dropIdentity(env, row, "s", "این شماره دیگر در سامانه نیست؛ اتصالش برداشته شد.");
  return null;
}

/* ------------------------------------------------------------------ */
/* کارشناس                                                               */
/* ------------------------------------------------------------------ */
async function listRequests(env, row, ex, mid) {
  const d = await C.expertThreads(env, ex);
  const withT = d.requests.filter((g) => g.threads.length);
  if (!withT.length) { await P.show(env, row, mid, "هنوز با هیچ تأمین‌کننده‌ای گفت‌وگو ندارید.\nدر بات کارشناسان: «📚 بررسی سوابق» ← کارتِ قلم ← «📨 ارسال به تأمین‌کننده».", []); return { ok: true }; }
  const kb = withT.slice(0, 30).map((g) => [{ text: `${g.unread ? `🔴${fa(g.unread)} ` : ""}${g.waiting ? "⏳ " : ""}${g.request_id} — ${short(g.party, 18)} (${fa(g.threads.length)})`, callback_data: `xr:${g.assignment_id}` }]);
  await P.show(env, row, mid, `📋 <b>درخواست‌هایی که گفت‌وگو دارند</b>${d.unread ? ` — ${fa(d.unread)} پیام نخوانده` : ""}\n<i>🔴 نخوانده · ⏳ بستهٔ منتظر تصمیم</i>`, kb);
  return { ok: true };
}

async function listSuppliersOfRequest(env, row, ex, aid, mid) {
  const d = await C.expertThreads(env, ex);
  const g = d.requests.find((x) => x.assignment_id === aid);
  if (!g || !g.threads.length) { await P.show(env, row, mid, "برای این درخواست گفت‌وگویی نیست.", [[{ text: "↩️ درخواست‌ها", callback_data: "xl:r" }]]); return { ok: true }; }
  const kb = g.threads.map((t) => [{ text: `${t.unread ? `🔴${fa(t.unread)} ` : ""}${t.waiting ? "⏳ " : ""}${short(t.supplier, 26)}${t.phone_label ? ` (${short(t.phone_label, 10)})` : ""}`, callback_data: `xt:${t.id}` }]);
  kb.push([{ text: "↩️ درخواست‌ها", callback_data: "xl:r" }]);
  await P.show(env, row, mid, `📄 درخواست <b>${esc(g.request_id)}</b> — ${esc(g.party || "")}\nتأمین‌کنندگان:`, kb);
  return { ok: true };
}

async function listSuppliers(env, row, ex, mid) {
  const d = await C.expertThreads(env, ex);
  const by = new Map();
  for (const g of d.requests) for (const t of g.threads) {
    const s = by.get(t.supplier_id) || { id: t.supplier_id, name: t.supplier, unread: 0, waiting: 0, n: 0, last: 0 };
    s.unread += t.unread; s.waiting += t.waiting; s.n++; s.last = Math.max(s.last, t.last_at);
    by.set(t.supplier_id, s);
  }
  const list = [...by.values()].sort((a, b) => b.last - a.last);
  if (!list.length) { await P.show(env, row, mid, "هنوز با هیچ تأمین‌کننده‌ای گفت‌وگو ندارید.", []); return { ok: true }; }
  const kb = list.slice(0, 30).map((s) => [{ text: `${s.unread ? `🔴${fa(s.unread)} ` : ""}${s.waiting ? "⏳ " : ""}${short(s.name, 28)} (${fa(s.n)})`, callback_data: `xs:${s.id}` }]);
  await P.show(env, row, mid, "🏷 <b>تأمین‌کنندگانی که با آن‌ها گفت‌وگو دارید</b>", kb);
  return { ok: true };
}

async function listRequestsOfSupplier(env, row, ex, sid, mid) {
  const d = await C.expertThreads(env, ex);
  const items = [];
  for (const g of d.requests) for (const t of g.threads) if (t.supplier_id === sid) items.push({ g, t });
  if (!items.length) { await P.show(env, row, mid, "گفت‌وگویی پیدا نشد.", [[{ text: "↩️ تأمین‌کنندگان", callback_data: "xl:s" }]]); return { ok: true }; }
  const kb = items.map(({ g, t }) => [{ text: `${t.unread ? `🔴${fa(t.unread)} ` : ""}${t.waiting ? "⏳ " : ""}${g.request_id} — ${short(g.party, 22)}`, callback_data: `xt:${t.id}` }]);
  kb.push([{ text: "↩️ تأمین‌کنندگان", callback_data: "xl:s" }]);
  await P.show(env, row, mid, `🏷 <b>${esc(items[0].t.supplier)}</b> — درخواست‌ها:`, kb);
  return { ok: true };
}

async function expertMessage(env, row, msg, text) {
  const ex = await expertOf(env, row);
  if (!ex) return { ok: true };
  if (text === P.MENU.e.reqs) return listRequests(env, row, ex);
  if (text === P.MENU.e.sups) return listSuppliers(env, row, ex);
  const f = P.flowOf(row);
  if (f && f.step === "comment" && text) {
    P.setFlow(row, null);
    return decideAndShow(env, row, ex, f.bundle, f.action, { comment: text === "-" ? "" : text });
  }
  if (msg.document || msg.photo || msg.voice || msg.video) {
    await P.send(env, row, "<i>در این دمو فرستادن فایل از سمت کارشناس نیست؛ متن بنویسید.</i>");
    return { ok: true };
  }
  if (!text) return { ok: true };
  if (!row.focus) { await P.send(env, row, "اول یک گفت‌وگو را از «📋 لیست درخواست‌ها» یا «🏷 لیست تأمین‌کنندگان» باز کنید."); return { ok: true }; }
  const th = await C.threadFor(env, row.focus, { expert: ex }).catch(() => null);
  if (!th) { P.setFocus(row, null); await P.send(env, row, "این گفت‌وگو دیگر در دسترس شما نیست."); return { ok: true }; }
  const r = await C.postMsg(env, th, "e", text);
  await P.pushMsgs(env, th, r.msgs);
  return { ok: true };
}

async function bundleCardSend(env, row, ex, bid, mid, head) {
  const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(bid).first();
  if (!b) return { ok: true };
  const th = await C.threadFor(env, b.thread_id, { expert: ex });
  const L = (await env.DB.prepare("SELECT * FROM sp_lines WHERE bundle_id=? ORDER BY id").bind(bid).all()).results || [];
  const c = P.bundleCard(th, b, L);
  await P.show(env, row, mid, `${head ? `${head}\n\n` : ""}${c.text}`, c.kb);
  return { ok: true };
}

async function decideAndShow(env, row, ex, bid, action, opts, mid) {
  try {
    const r = await C.decide(env, ex, bid, action, opts);
    await P.pushMsgs(env, r.thread, r.msgs);
    const extra = action === "final" ? `\n\n✅ ${fa(r.quote_ids.length)} قلم با مقدارهای پیش‌فاکتور به تب استعلامات رفت (ثبت موقت و تیک «تأیید نهایی»).` : "";
    return bundleCardSend(env, row, ex, bid, mid, `<i>${esc(r.msgs[0] ? r.msgs[0].body : "")}</i>${extra}`);
  } catch (e) {
    const kb = action === "final"
      ? [[{ text: "↩️ برگرداندن با توضیح", callback_data: `xd:${bid}:rt` }], [{ text: "📦 کارت بسته و جدول تطابق", callback_data: `xd:${bid}:card` }]]
      : null;
    await P.send(env, row, `⚠️ ${esc(e.message)}${action === "final" ? "\n\n<i>اگر چیزی در پیش‌فاکتور نیامده، بسته را با توضیح برگردانید تا تأمین‌کننده پیش‌فاکتور کامل بفرستد. مغایرت‌ها را می‌شود پذیرفت (پیش‌فاکتور ملاک).</i>" : ""}`, kb);
    return { ok: true };
  }
}

async function bundleAction(env, row, ex, bid, act, mid, ack) {
  if (act === "ok") { await ack(); return decideAndShow(env, row, ex, bid, "approve", {}, mid); }
  if (act === "rt" || act === "rj") {
    await ack();
    P.setFlow(row, { step: "comment", bundle: bid, action: act === "rt" ? "return" : "reject" });
    await P.send(env, row, act === "rt" ? "↩️ چه چیزی باید اصلاح شود؟ توضیح را بنویسید (برای تأمین‌کننده فرستاده می‌شود):"
      : "❌ دلیل رد را بنویسید، یا «-» برای بدون دلیل:", [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
    return { ok: true };
  }
  if (act === "fn") { await ack(); return decideAndShow(env, row, ex, bid, "final", {}, null); }
  if (act === "aa") {
    try { await C.acceptRows(env, ex, bid, { all: true }); await ack("همهٔ غیرسبزها تیک خورد — پیش‌فاکتور ملاک"); }
    catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
    return bundleCardSend(env, row, ex, bid, mid);
  }
  if (act === "pf") {
    const b = await C.proformaOfBundle(env, { expert: ex }, bid);
    const store = storage(env);
    if (!store || !store.signedUrl) { await ack("انبار فایل وصل نیست.", true); return { ok: true }; }
    await ack();
    await P.send(env, row, `📄 پیش‌فاکتور «${esc(b.pf_name || "")}» — لینک ۱۵ دقیقه معتبر است.`, [[{ text: "📄 باز کردن پیش‌فاکتور", url: await store.signedUrl(b.pf_key, 900) }]]);
    return { ok: true };
  }
  if (act === "ai") {
    await ack();
    await P.send(env, row, "🤖 <b>خوانش هوشمند پیش‌فاکتور</b>\nمدل پیش‌فاکتور را می‌خواند: هر سطرِ سند را از دریچهٔ نوع قلم و لایه‌های ویژگی می‌سنجد، مقدار، واحد و قیمت واحدِ هر قلم و شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده، اعتبار) را برمی‌دارد و هر کدام را با بستهٔ تأمین‌کننده مقایسه می‌کند (✅ ⚠️ ⚪ ❌).\n\nانجام شود؟", P.aiConfirmKb(bid));
    return { ok: true };
  }
  if (act === "ai2") {
    await ack("در حال خواندن پیش‌فاکتور…");
    try {
      const tg = await C.aiTarget(env, ex, bid);
      const store = storage(env);
      if (!store || !store.signedUrl) throw new Error("انبار فایل وصل نیست.");
      const ai = await runAiCheck(env, { fileUrl: await store.signedUrl(tg.b.pf_key, 900), mime: tg.b.pf_mime, lines: tg.lines, terms: tg.terms });
      await C.saveAi(env, tg, ai);
      return bundleCardSend(env, row, ex, bid, mid, "<i>خوانش هوشمند انجام شد. هر ردیفِ غیرسبز را می‌توانید تیک بزنید (پیش‌فاکتور ملاک).</i>");
    } catch (e) { await P.send(env, row, `⚠️ خوانش هوشمند نشد: ${esc(e.message)}`); }
    return { ok: true };
  }
  if (act === "card") { await ack(); return bundleCardSend(env, row, ex, bid, mid); }
  await ack();
  return { ok: true };
}

/** xa:<bundle>:<i> — تیک (یا برداشتنِ تیکِ) یک ردیفِ غیرسبزِ جدول تطابق: پیش‌فاکتور به‌جای درخواست ملاک */
async function toggleAccept(env, row, ex, bid, i, mid, ack) {
  const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(bid).first();
  const ai = b ? parse(b.ai_json, null) : null;
  const x = aiUsable(ai) ? P.acceptList(ai)[i] : null;
  if (!x) { await ack("این ردیف دیگر در جدول نیست.", true); return { ok: true }; }
  const on = !parse(b.accept_json, {})[x.key];
  try { await C.acceptRows(env, ex, bid, { keys: [x.key], on }); await ack(on ? "تیک خورد — پیش‌فاکتور ملاک" : "تیک برداشته شد"); }
  catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
  return bundleCardSend(env, row, ex, bid, mid);
}

/* ------------------------------------------------------------------ */
/* تأمین‌کننده                                                            */
/* ------------------------------------------------------------------ */
async function listSupplierThreads(env, row, sup, mid) {
  const list = await C.supplierThreads(env, sup);
  if (!list.length) { await P.show(env, row, mid, "فعلاً استعلامی برای شما نیست. وقتی کارشناس استعلامی بفرستد، همین‌جا خبرتان می‌کنیم.", []); return { ok: true }; }
  if (list.length === 1 && !mid) {
    const th = await C.threadFor(env, list[0].id, { supplier: sup });
    await P.showThread(env, row, th);
    return { ok: true };
  }
  const kb = list.map((t) => [{ text: `${t.unread ? `🔴${fa(t.unread)} ` : ""}${t.need_pf ? "📄 " : ""}استعلام ${t.request_id} — ${fa(t.lines)} قلم${t.todo ? ` (${fa(t.todo)} مانده)` : ""}`, callback_data: `st:${t.id}` }]);
  await P.show(env, row, mid, "📋 <b>استعلام‌های شما</b>\n<i>🔴 پیام نخوانده · 📄 منتظر پیش‌فاکتور</i>", kb);
  return { ok: true };
}

/** فایلِ پیام: سند یا عکس (بزرگ‌ترین اندازه) */
function fileOf(msg) {
  const day = new Date().toISOString().slice(0, 10);
  if (msg.document) return { id: msg.document.file_id, size: msg.document.file_size || 0, name: msg.document.file_name || `file-${day}`, mime: msg.document.mime_type || "application/octet-stream" };
  if (Array.isArray(msg.photo) && msg.photo.length) { const p = msg.photo[msg.photo.length - 1]; return { id: p.file_id, size: p.file_size || 0, name: `photo-${day}.jpg`, mime: "image/jpeg" }; }
  return null;
}
/** دانلود فوری و جریانی از تلگرام به انبار — لینک فایل تلگرام فقط حدود یک ساعت معتبر است */
async function storeTgFile(env, aid, file) {
  const store = storage(env);
  if (!store) throw new Error("انبار فایل هنوز وصل نیست.");
  if (file.size > MAX_BYTES) throw new Error(`حجم فایل بیشتر از ${fa(Math.round(MAX_BYTES / 1048576))} مگابایت است.`);
  const api = P.spApi(env);
  const f = await api.getFile(file.id);
  const src = await fetch(api.fileUrl(f.file_path));
  if (!src.ok || !src.body) throw new Error("دریافت فایل از تلگرام نشد.");
  const key = storageKey(aid, `sp-${file.name}`);
  await store.put(key, src.body, { contentType: file.mime, size: file.size || undefined });
  return key;
}

const VAL_PROMPT = {
  q: "🔢 مقدار را بنویسید (فقط عدد):", u: "📏 واحد را بنویسید (مثلاً عدد، کیلوگرم، متر):", p: "💰 قیمت واحد را به <b>ریال و بدون ارزش افزوده</b> بنویسید:",
  n: "📝 توضیح را بنویسید (یا «-» برای پاک کردن):", l: "➕ لایهٔ تازه را این‌طور بنویسید: «نام لایه: مقدار» — مثلاً «برند: فولاد مبارکه»",
};
/** پرسیدنِ یک مقدار؛ برای «مقدار» دکمهٔ «همان مقدارِ درخواست» هم هست */
async function askValue(env, row, l, f, head) {
  P.setFlow(row, { step: "val", line: l.id, f });
  const kb = [];
  if (f === "q" && l.req_qty != null) kb.push([{ text: `✔️ همان مقدار درخواست (${P.qty(l.req_qty)} ${l.req_unit || ""})`, callback_data: `sv:${l.id}:qd` }]);
  kb.push([{ text: "✖️ انصراف", callback_data: `si:${l.id}` }]);
  await P.send(env, row, `${head ? `${head}\n\n` : ""}<b>${esc(P.lineTag(l))}</b>\n${VAL_PROMPT[f]}`, kb);
  return { ok: true };
}
/* شرایطِ فاکتور (برای همهٔ اقلامِ استعلام): فهرستی‌ها با دکمه، زمان تحویل و اعتبار با نوشتن */
const TERM_PROMPT = {
  d: "🚚 <b>زمان تحویل</b> را بنویسید — تاریخ شمسی (مثل ۱۴۰۵/۰۸/۰۱) یا شمار روز (مثل ۱۰ یا ۱۰ روز کاری):",
  x: "📅 <b>اعتبار پیش‌فاکتور</b> را به روز بنویسید (مثلاً ۷):",
};
const TERM_OPTS = { p: ENUMS.pay, i: ENUMS.invoice, v: ENUMS.vat };
async function askTerm(env, row, l, k, head) {
  const f = P.TERM_KEY[k];
  const top = `${head ? `${head}\n\n` : ""}<b>${esc(P.lineTag(l))}</b>\n`;
  if (TERM_OPTS[k]) {
    P.setFlow(row, null);
    const kb = TERM_OPTS[k].map((v, i) => [{ text: v, callback_data: `tv:${l.id}:${k}:${i}` }]);
    kb.push([{ text: "✖️ انصراف", callback_data: `si:${l.id}` }]);
    await P.send(env, row, `${top}🧾 <b>${esc(C.TERM_FA[f])}</b> را انتخاب کنید <i>(برای همهٔ اقلامِ این استعلام)</i>:`, kb);
    return { ok: true };
  }
  P.setFlow(row, { step: "term", line: l.id, k });
  await P.send(env, row, `${top}${TERM_PROMPT[k]}\n<i>(برای همهٔ اقلامِ این استعلام)</i>`, [[{ text: "✖️ انصراف", callback_data: `si:${l.id}` }]]);
  return { ok: true };
}
/** بعد از ذخیرهٔ هر مقدار: اگر چیزِ ضروری‌ای مانده — مقدار، قیمت یا شرطِ فاکتور — همان را می‌پرسد (گام‌به‌گام)؛ وگرنه کارت قلم */
async function afterSave(env, row, sup, lineId, head) {
  const l = await env.DB.prepare("SELECT l.*, t.terms_json FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(lineId).first();
  const miss = C.lineMissing(l || {});
  const tm = C.termsOf(l);
  if (l && C.LINE_EDITABLE.includes(l.state) && l.state !== "ready") {
    if (miss.includes("مقدار")) return askValue(env, row, l, "q", head);
    if (miss.includes("قیمت واحد")) return askValue(env, row, l, "p", head);
    for (const k of ["d", "p", "i", "v"]) if (!String(tm[P.TERM_KEY[k]] ?? "").trim()) return askTerm(env, row, l, k, head);
  }
  const all = [...miss, ...C.termsMissing(tm)];
  return lineCardSend(env, row, sup, lineId, null, `${head}${all.length ? "" : " همه‌چیز پر است؛ «✅ آمادهٔ ارسال» را بزنید."}`);
}

async function supplierMessage(env, row, msg, text) {
  const sup = await supplierOf(env, row);
  if (!sup) return { ok: true };
  if (text === P.MENU.s.list) return listSupplierThreads(env, row, sup);
  if (text === P.MENU.s.chat) {
    if (!row.focus) return listSupplierThreads(env, row, sup);
    const th = await C.threadFor(env, row.focus, { supplier: sup }).catch(() => null);
    if (th) { await P.showThread(env, row, th); return { ok: true }; }
    return listSupplierThreads(env, row, sup);
  }
  if (text === P.MENU.s.out) {
    await C.logout(env, sup.phone_id, null);
    const keepExpert = !!row.expert_id;
    if (keepExpert) await env.DB.prepare("UPDATE sp_tg SET phone_id=NULL, role='e', focus=NULL, flow_json=NULL WHERE chat=?").bind(row.chat).run();
    else await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
    row._dirty = false;
    await P.spApi(env).call("sendMessage", { chat_id: row.chat, text: "🚪 از نقش تأمین‌کننده خارج شدید. برای ورود دوباره، «ارسال رمز به پیامک» را بزنید و لینک پیامک را باز کنید.",
      reply_markup: keepExpert ? P.menuKb(env, "e", false) : { remove_keyboard: true } }).catch(() => {});
    await plain(env, row.chat, "ورود دوباره:", [[{ text: "📱 ارسال رمز به پیامک", callback_data: `rs:${sup.k}` }]]);
    if (!keepExpert) await P.spApi(env).call("setChatMenuButton", { chat_id: row.chat, menu_button: { type: "default" } }).catch(() => {});
    else await P.setMenuButton(env, row.chat, "e");
    return { ok: true };
  }
  const f = P.flowOf(row);
  const file = fileOf(msg);
  /* پیامِ صوتی (ویس یا فایلِ صوتی) برای کارشناس — متنش پیاده می‌شود ولی این‌جا نشان داده نمی‌شود (sp-voice.js) */
  const voice = msg.voice || msg.audio || null;
  if (voice && !(f && ["subpf", "pf", "file"].includes(f.step))) {
    if (f && ["val", "term", "label"].includes(f.step)) { await P.send(env, row, "این‌جا لطفاً بنویسید؛ پیام صوتی برای گفت‌وگو با کارشناس است."); return { ok: true }; }
    return voiceToExpert(env, row, sup, voice);
  }
  /* «📤 ارسال» همراه با پیش‌فاکتور: فایل که رسید، مشخصاتِ اقلامِ آماده و پیش‌فاکتور یک‌جا می‌روند */
  if (f && f.step === "subpf") {
    if (!file) { await P.send(env, row, "فایل پیش‌فاکتور را بفرستید (PDF یا عکس)، یا «انصراف»."); return { ok: true }; }
    try {
      const th = await C.threadFor(env, f.th, { supplier: sup });
      const key = await storeTgFile(env, th.assignment_id, file);
      let r;
      try { r = await C.submitLines(env, sup, th.id, null, { skey: key, filename: file.name, mime: file.mime, size: file.size }); }
      catch (e) { await storage(env).remove(key).catch(() => {}); throw e; }
      P.setFlow(row, null);
      await P.pushMsgs(env, r.thread, r.msgs);
      aiKick(env, row._ctx, r.thread.id);
      return itemsCardSend(env, row, sup, th.id, null, `✅ مشخصات و پیش‌فاکتور با هم برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}). نتیجهٔ بررسی را همین‌جا خبر می‌دهیم.`);
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); return { ok: true }; }
  }
  if (f && f.step === "term" && text) {
    try {
      const l = await env.DB.prepare("SELECT thread_id FROM sp_lines WHERE id=?").bind(f.line).first();
      await C.termsSave(env, sup, l.thread_id, { [P.TERM_KEY[f.k]]: text });
      P.setFlow(row, null);
      return afterSave(env, row, sup, f.line, "✅ ذخیره شد.");
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); return { ok: true }; }
  }
  if (f && f.step === "pf") {
    if (!file) { await P.send(env, row, "فایل پیش‌فاکتور را بفرستید (PDF یا عکس)، یا «انصراف»."); return { ok: true }; }
    try {
      const tg = await C.proformaTarget(env, sup, f.bundle);
      const key = await storeTgFile(env, tg.th.assignment_id, file);
      const r = await C.setProforma(env, tg, { skey: key, filename: file.name, mime: file.mime, size: file.size });
      if (r.old) await storage(env).remove(r.old).catch(() => {});
      P.setFlow(row, null);
      await P.pushMsgs(env, r.thread, r.msgs);
      aiKick(env, row._ctx, r.thread.id);
      await P.send(env, row, "✅ پیش‌فاکتور رسید و برای کارشناس فرستاده شد. نتیجهٔ بررسی را همین‌جا خبر می‌دهیم.");
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); }
    return { ok: true };
  }
  if (f && f.step === "file") {
    if (!file) { await P.send(env, row, `فایلِ «${esc(f.label)}» را بفرستید (توضیح اختیاری را در کپشن بنویسید)، یا «انصراف».`); return { ok: true }; }
    try {
      const tg = await C.fileTarget(env, sup, f.line, f.label);
      const th = await C.threadFor(env, tg.line.thread_id, { supplier: sup });
      const key = await storeTgFile(env, th.assignment_id, file);
      const r = await C.addFile(env, sup, tg, { skey: key, filename: file.name, mime: file.mime, size: file.size, note: msg.caption });
      P.setFlow(row, null);
      await P.pushMsgs(env, th, r.msgs);
      aiKick(env, row._ctx, th.id);
      return lineCardSend(env, row, sup, f.line, null, "✅ پیوست ثبت شد.");
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); return { ok: true }; }
  }
  if (f && f.step === "label" && text) {
    P.setFlow(row, { step: "file", line: f.line, label: text.slice(0, 40) });
    await P.send(env, row, `حالا فایلِ «${esc(text.slice(0, 40))}» را بفرستید (توضیح اختیاری در کپشن).`, [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
    return { ok: true };
  }
  if (f && f.step === "val" && text) {
    try {
      const body = f.f === "q" ? { qty: text } : f.f === "p" ? { price: text } : f.f === "u" ? { unit: text } : f.f === "n" ? { note: text === "-" ? "" : text } : null;
      if (f.f === "l") {
        const m = /^(.{1,40}?)\s*[:：=]\s*(.+)$/.exec(text);
        if (!m) { await P.send(env, row, "به این شکل بنویسید: «نام لایه: مقدار» — مثلاً «برند: فولاد مبارکه»"); return { ok: true }; }
        const l = await env.DB.prepare("SELECT extra_json FROM sp_lines WHERE id=?").bind(f.line).first();
        const extra = JSON.parse((l && l.extra_json) || "[]").filter((x) => x.k !== m[1].trim());
        await C.lineSave(env, sup, f.line, { extra: [...extra, { k: m[1], v: m[2] }] });
      } else if (body) await C.lineSave(env, sup, f.line, body);
      P.setFlow(row, null);
      return afterSave(env, row, sup, f.line, "✅ ذخیره شد.");
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); return { ok: true }; }
  }
  if (file) { await P.send(env, row, "برای فرستادن فایل، از کارت قلم «📎 پیوست» را بزنید؛ برای پیش‌فاکتور دکمهٔ «📄 ارسال پیش‌فاکتور» را."); return { ok: true }; }
  if (!text) return { ok: true };
  if (!row.focus) return listSupplierThreads(env, row, sup);
  const th = await C.threadFor(env, row.focus, { supplier: sup }).catch(() => null);
  if (!th) { P.setFocus(row, null); return listSupplierThreads(env, row, sup); }
  const r = await C.postMsg(env, th, "s", text);
  await P.pushMsgs(env, th, r.msgs);
  aiKick(env, row._ctx, th.id);
  return { ok: true };
}

/** ویسِ تأمین‌کننده در بات: از تلگرام گرفته و مثل پنل وب ثبت می‌شود؛ خودِ ویس در گفت‌وگوی او هست، پاسخی لازم نیست */
async function voiceToExpert(env, row, sup, v) {
  if (!row.focus) return listSupplierThreads(env, row, sup);
  const th = await C.threadFor(env, row.focus, { supplier: sup }).catch(() => null);
  if (!th) { P.setFocus(row, null); return listSupplierThreads(env, row, sup); }
  try {
    if ((v.file_size || 0) > VOICE_MAX) throw new Error("پیام صوتی بیش از حد بلند است.");
    const api = P.spApi(env);
    const f = await api.getFile(v.file_id);
    const src = await fetch(api.fileUrl(f.file_path));
    if (!src.ok) throw new Error("دریافت صدا از تلگرام نشد.");
    await ingestVoice(env, row._ctx, th, { bytes: await src.arrayBuffer(), mime: v.mime_type || "audio/ogg", dur: v.duration || null, tg: msgVoiceId(v) }, (fn) => fn());
  } catch (e) { await P.send(env, row, `⚠️ پیام صوتی نرسید: ${esc(e.message)}`); }
  return { ok: true };
}
/* فقط ویسِ واقعی دوباره با sendVoice برای کارشناس می‌رود؛ فایلِ صوتیِ معمولی نه */
const msgVoiceId = (v) => (v && v.file_id && /ogg|opus/i.test(v.mime_type || "audio/ogg") ? v.file_id : null);

async function lineCardSend(env, row, sup, lineId, mid, head) {
  const l = await env.DB.prepare("SELECT l.*, t.supplier_id, t.terms_json FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(lineId).first();
  if (!l || l.supplier_id !== sup.supplier_id) { await P.send(env, row, "این قلم پیدا نشد."); return { ok: true }; }
  const [files, rest] = await Promise.all([
    env.DB.prepare("SELECT label FROM sp_files WHERE line_id=? ORDER BY id").bind(l.id).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM sp_lines WHERE thread_id=? AND id!=? AND state IN ('new','draft','returned')").bind(l.thread_id, l.id).first(),
  ]);
  const c = P.lineCard(l, files.results || [], rest ? rest.n : 0, C.termsOf(l));
  await P.show(env, row, mid, `${head ? `${head}\n\n` : ""}${c.text}`, c.kb);
  return { ok: true };
}

async function itemsCardSend(env, row, sup, thId, mid, head) {
  const th = await C.threadFor(env, thId, { supplier: sup });
  if (row.focus !== th.id) { await P.showThread(env, row, th); return { ok: true }; }
  const [L, B] = await Promise.all([
    env.DB.prepare("SELECT * FROM sp_lines WHERE thread_id=? ORDER BY id").bind(th.id).all(),
    env.DB.prepare("SELECT * FROM sp_bundles WHERE thread_id=? ORDER BY id").bind(th.id).all(),
  ]);
  const c = P.itemsCard(env, th, L.results || [], B.results || []);
  await P.show(env, row, mid, `${head ? `${head}\n\n` : ""}${c.text}`, c.kb);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* دکمه‌ها                                                               */
/* ------------------------------------------------------------------ */
async function onCallback(env, cq, ctx) {
  const api = P.spApi(env);
  const ack = (text, alert) => api.answerCallback(cq.id, text, alert).catch(() => {});
  const chat = cq.message && cq.message.chat && cq.message.chat.id;
  const mid = cq.message && cq.message.message_id;
  const parts = T(cq.data).split(":");
  const [a] = parts;
  const n = (i) => parseInt(parts[i], 10) || 0;
  if (!chat) { await ack(); return { ok: true }; }

  /* «ارسال رمز به پیامک» — پیش از ورود هم کار می‌کند */
  if (a === "rs") {
    try {
      const r = await C.resendPassword(env, parts[1]);
      const d = await deliverPass(env, r).catch((e) => ({ sent: false, error: e.message, where: "" }));
      await ack(d.sent ? "فرستاده شد" : "پیامک نرفت");
      await plain(env, chat, d.sent ? `📱 رمز تازه به ${esc(r.masked)} پیامک شد.\nرمز را همین‌جا بفرستید.`
        : `📱 رمز تازه ساخته شد ولی پیامکِ واقعی ${d.error ? "نرفت" : "فعلاً خاموش است"}.${d.where ? `\n<i>متنش در ${d.where} آمد؛ کارشناس خرید آن را به شما می‌رساند.</i>` : "\n<i>با کارشناس خرید تماس بگیرید.</i>"}\nرمز را همین‌جا بفرستید.`);
      /* بعد از «خروج» ردیفی نمانده (یا فقط هویتِ کارشناس مانده): همین گفت‌وگو منتظر رمز می‌شود */
      const row0 = await P.tgRow(env, chat);
      if (!row0 || (row0.role === "e" && !row0.phone_id)) await upsertRow(env, chat, "p", { flow: { step: "pass", k: parts[1] } });
    } catch (e) { await ack(String(e.message).slice(0, 180), true); }
    return { ok: true };
  }

  const row = await P.tgRow(env, chat);
  if (!row || (row.role !== "e" && row.role !== "s")) { await ack("اول وارد شوید.", true); return { ok: true }; }
  row._ctx = ctx;
  try {
    if (a === "xc") { P.setFlow(row, null); await ack("انصراف"); return { ok: true }; }
    /* go:<thread>[:e|s] — اگر نقشِ خواسته‌شده نقشِ فعلی نیست و این گفت‌وگو آن هویت را دارد، اول عوض می‌شود */
    if (a === "go" && (parts[2] === "e" || parts[2] === "s") && parts[2] !== row.role) {
      if ((parts[2] === "e" && !row.expert_id) || (parts[2] === "s" && !row.phone_id)) { await ack("این گفت‌وگو آن نقش را ندارد.", true); return { ok: true }; }
      row.role = parts[2]; P.setFlow(row, null); row._dirty = true;
      await P.setMenuButton(env, row.chat, row.role);
    }
    /* «🧹 پاک کردن گفت‌وگو» — هر دو نقش؛ فقط از صفحهٔ همین طرف (پیام‌ها در دیتابیس می‌مانند) */
    if (a === "cc") {
      const who = row.role === "e" ? { expert: await expertOf(env, row) } : { supplier: await supplierOf(env, row) };
      if (!who.expert && !who.supplier) { await ack(); return { ok: true }; }
      const th = await C.threadFor(env, n(1), who).catch(() => null);
      if (!th) { await ack("این گفت‌وگو در دسترس نیست.", true); return { ok: true }; }
      if (parts[2] !== "y") {
        await ack();
        await P.send(env, row, "🧹 <b>پاک کردن گفت‌وگو</b>\nپیام‌های تا این لحظه از صفحهٔ شما پاک می‌شوند؛ در سامانه می‌مانند و طرف دیگر هنوز آن‌ها را می‌بیند. پاک شود؟",
          [[{ text: "🧹 بله، پاک شود", callback_data: `cc:${th.id}:y` }], [{ text: "✖️ نه", callback_data: "xc:0" }]]);
        return { ok: true };
      }
      await C.clearMsgs(env, th, row.role);
      await ack("پاک شد");
      await P.showThread(env, row, await C.threadFor(env, th.id, who));
      return { ok: true };
    }
    if (row.role === "e") {
      const ex = await expertOf(env, row);
      if (!ex) { await ack(); return { ok: true }; }
      if (a === "xl") { await ack(); return await (parts[1] === "s" ? listSuppliers(env, row, ex, mid) : listRequests(env, row, ex, mid)); }
      if (a === "xr") { await ack(); return await listSuppliersOfRequest(env, row, ex, n(1), mid); }
      if (a === "xs") { await ack(); return await listRequestsOfSupplier(env, row, ex, n(1), mid); }
      if (a === "xt" || a === "go") {
        const th = await C.threadFor(env, n(1), { expert: ex }).catch(() => null);
        if (!th) { await ack("این گفت‌وگو در دسترس شما نیست.", true); return { ok: true }; }
        await ack();
        await P.showThread(env, row, th);
        return { ok: true };
      }
      if (a === "xd") return await bundleAction(env, row, ex, n(1), parts[2], mid, ack);
      if (a === "xa") return await toggleAccept(env, row, ex, n(1), n(2), mid, ack);
      await ack();
      return { ok: true };
    }
    /* تأمین‌کننده */
    const sup = await supplierOf(env, row);
    if (!sup) { await ack(); return { ok: true }; }
    if (a === "st" || a === "go") {
      const th = await C.threadFor(env, n(1), { supplier: sup }).catch(() => null);
      if (!th) { await ack("این استعلام پیدا نشد.", true); return { ok: true }; }
      await ack();
      await P.showThread(env, row, th);
      return { ok: true };
    }
    if (a === "ic") { await ack(); return await itemsCardSend(env, row, sup, n(1), mid); }
    if (a === "si") { P.setFlow(row, null); await ack(); return await lineCardSend(env, row, sup, n(1), mid); }
    if (a === "sv") {
      const f = parts[2];
      const l = await env.DB.prepare("SELECT l.*, t.supplier_id FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(n(1)).first();
      if (!l || l.supplier_id !== sup.supplier_id) { await ack("این قلم پیدا نشد.", true); return { ok: true }; }
      if (f === "qd") {
        try { await C.lineSave(env, sup, l.id, { qty: l.req_qty, unit: l.req_unit }); await ack("همان مقدار درخواست"); }
        catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
        P.setFlow(row, null);
        return await afterSave(env, row, sup, l.id, "✅ مقدار ثبت شد.");
      }
      if (!VAL_PROMPT[f]) { await ack(); return { ok: true }; }
      await ack();
      return await askValue(env, row, l, f);
    }
    if (a === "tk") {
      const l = await env.DB.prepare("SELECT l.*, t.supplier_id FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(n(1)).first();
      if (!l || l.supplier_id !== sup.supplier_id || !P.TERM_KEY[parts[2]]) { await ack("این قلم پیدا نشد.", true); return { ok: true }; }
      await ack();
      return await askTerm(env, row, l, parts[2]);
    }
    if (a === "tv") {
      const k = parts[2], v = TERM_OPTS[k] && TERM_OPTS[k][n(3)];
      const l = await env.DB.prepare("SELECT l.thread_id, t.supplier_id FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(n(1)).first();
      if (!l || l.supplier_id !== sup.supplier_id || !v) { await ack("این گزینه پیدا نشد.", true); return { ok: true }; }
      try { await C.termsSave(env, sup, l.thread_id, { [P.TERM_KEY[k]]: v }); await ack(v); }
      catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
      return await afterSave(env, row, sup, n(1), `✅ ${C.TERM_FA[P.TERM_KEY[k]]}: ${v}`);
    }
    if (a === "sl") {
      const l = await env.DB.prepare("SELECT extra_json FROM sp_lines WHERE id=?").bind(n(1)).first();
      const extra = JSON.parse((l && l.extra_json) || "[]");
      extra.splice(n(2), 1);
      await C.lineSave(env, sup, n(1), { extra });
      await ack("حذف شد");
      return await lineCardSend(env, row, sup, n(1), mid);
    }
    if (a === "sa") {
      if (parts[2] === undefined) {
        await ack();
        const kb = C.FILE_LABELS.map((x, i) => [{ text: x, callback_data: `sa:${n(1)}:${i}` }]);
        kb.push([{ text: "✏️ برچسب دیگر…", callback_data: `sa:${n(1)}:o` }], [{ text: "↩️ کارت قلم", callback_data: `si:${n(1)}` }]);
        await P.show(env, row, mid, "📎 برچسب این پیوست چیست؟", kb);
        return { ok: true };
      }
      await ack();
      if (parts[2] === "o") { P.setFlow(row, { step: "label", line: n(1) }); await P.send(env, row, "برچسب پیوست را بنویسید (مثلاً «گواهی استاندارد»):", [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]); return { ok: true }; }
      const label = C.FILE_LABELS[n(2)];
      if (!label) return { ok: true };
      P.setFlow(row, { step: "file", line: n(1), label });
      await P.send(env, row, `فایلِ «${esc(label)}» را بفرستید — PDF یا عکس. توضیح اختیاری را در کپشن بنویسید.`, [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
      return { ok: true };
    }
    if (a === "sr") {
      const on = parts[2] === "1";
      try { await C.lineReady(env, sup, n(1), on); await ack(on ? "آمادهٔ ارسال شد" : "برای ویرایش باز شد"); }
      catch (e) {
        await ack(String(e.message).slice(0, 180), true);
        /* چیزی مانده: همان را می‌پرسیم تا تأمین‌کننده سرگردان نماند */
        if (on) return await afterSave(env, row, sup, n(1), "⚠️ هنوز کامل نیست.");
        return { ok: true };
      }
      return await lineCardSend(env, row, sup, n(1), mid, on ? null : "✏️ حالا می‌توانید ویرایش کنید؛ بعد دوباره «✅ آمادهٔ ارسال».");
    }
    /* «📤 ارسال»: اول می‌پرسد پیش‌فاکتور هم همراهش هست یا نه (sq:<th>:pf | sq:<th>:go) */
    if (a === "ss") {
      const th = await C.threadFor(env, n(1), { supplier: sup }).catch(() => null);
      if (!th) { await ack("این استعلام پیدا نشد.", true); return { ok: true }; }
      const cnt = (await env.DB.prepare("SELECT COUNT(*) AS c FROM sp_lines WHERE thread_id=? AND state='ready'").bind(th.id).first() || {}).c || 0;
      if (!cnt) { await ack("هیچ قلمِ «آمادهٔ ارسال»ی نیست.", true); return { ok: true }; }
      await ack();
      await P.send(env, row, `📤 <b>ارسالِ ${fa(cnt)} قلمِ آماده برای کارشناس</b>\nپیش‌فاکتورِ همین اقلام را هم دارید؟ اگر همراهش بفرستید، مرحلهٔ «تأیید مشخصات و درخواست پیش‌فاکتور» لازم نیست.`,
        [[{ text: "📄 بله، همراه با پیش‌فاکتور", callback_data: `sq:${th.id}:pf` }], [{ text: "📤 نه، فقط مشخصات", callback_data: `sq:${th.id}:go` }], [{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
      return { ok: true };
    }
    if (a === "sq") {
      if (parts[2] === "pf") {
        const th = await C.threadFor(env, n(1), { supplier: sup }).catch(() => null);
        if (!th) { await ack("این استعلام پیدا نشد.", true); return { ok: true }; }
        await ack();
        P.setFlow(row, { step: "subpf", th: th.id });
        await P.send(env, row, "📄 فایل پیش‌فاکتور را بفرستید (PDF یا عکس). لایه‌ها، مقدار، واحد، قیمت واحد و شرایط فاکتور (زمان تحویل، تسویه، نوع فاکتور، ارزش افزوده) باید صریح در آن آمده باشد.",
          [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
        return { ok: true };
      }
      try {
        const r = await C.submitLines(env, sup, n(1));
        await ack("فرستاده شد");
        await P.pushMsgs(env, r.thread, r.msgs);
        aiKick(env, row._ctx, r.thread.id);
        return await itemsCardSend(env, row, sup, n(1), mid, `✅ برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}). نتیجهٔ بررسی را همین‌جا خبر می‌دهیم.`);
      } catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
    }
    if (a === "sp") {
      try { await C.proformaTarget(env, sup, n(1)); } catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
      await ack();
      P.setFlow(row, { step: "pf", bundle: n(1) });
      await P.send(env, row, `📄 فایل پیش‌فاکتورِ بستهٔ ${fa(n(1))} را بفرستید (PDF یا عکس). لایه‌ها، مقدار، قیمت واحد و شرایط فاکتور (تحویل، تسویه، ارزش افزوده) باید صریح در آن آمده باشد.`, [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
      return { ok: true };
    }
    await ack();
    return { ok: true };
  } catch (e) {
    if (!(e instanceof TgError)) console.error("sp callback", e && e.message);
    await ack(String((e && e.message) || "نشد").slice(0, 180), true);
    return { ok: true };
  } finally {
    await P.save(env, row).catch(() => {});
  }
}

/* «ارسال رمز» — پیامکِ واقعی (TextBee) یا شبیه‌سازی در بات مکاتباتِ کارشناس: worker/sp-sms.js:deliverPass */
