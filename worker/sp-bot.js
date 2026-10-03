/**
 * بات مکاتبات تأمین‌کنندگان (TG_SP_BOT_TOKEN) — «بات خالص و منو» در کنار مینی‌اپ، برای مقایسه.
 *
 * دو نقش، هر گفت‌وگوی تلگرام یکی:
 *   کارشناس   — با لینک یک‌بارمصرف (/start e…) از «ارسال» در بات کارشناسان یا صفحهٔ مکاتبات وصل می‌شود.
 *               منوی ثابت: «لیست درخواست‌ها» ← تأمین‌کنندگانِ آن درخواست، و «لیست تأمین‌کنندگان» ← درخواست‌ها.
 *               انتخاب یک گفت‌وگو صفحه را پاک می‌کند و تاریخچهٔ کامل همان را می‌نویسد؛ هر متنی بعد از آن
 *               برای همان تأمین‌کننده می‌رود. پیامِ تأمین‌کنندهٔ دیگر هشدار و دکمهٔ «رفتن به این گفت‌وگو» دارد.
 *   تأمین‌کننده — با لینک پیامک (/start s…) و رمزِ همان پیامک. منو: استعلام‌ها، گفت‌وگو، پنل (مینی‌اپ)، خروج.
 *               پر کردن مقدار، واحد، قیمت واحد، لایهٔ تازه و پیوست، «آمادهٔ ارسال»، ارسال مشخصات و پیش‌فاکتور.
 *
 * وضعیت یکی است: همان توابع sp-core.js که پنل وب صدا می‌زند؛ هر تغییری این‌جا در پنل هم دیده می‌شود.
 * همیشه بی‌استثنا برمی‌گردد تا تلگرام آپدیت را دوباره نفرستد.
 */
import { telegram, esc, TgError } from "./telegram.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { runAiCheck, AI_COST_HINT } from "./sp-ai.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
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
export async function handleSpUpdate(env, u) {
  try {
    if (u.message) return await onMessage(env, u.message);
    if (u.callback_query) return await onCallback(env, u.callback_query);
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

async function onMessage(env, msg) {
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
  try {
    if (st) {
      if (row.role === "e" || row.role === "s") return await home(env, row, "سلام 👋");
      await P.send(env, row, WELCOME);
      return { ok: true };
    }
    if (/^\/cancel$|^انصراف$/.test(text)) { P.setFlow(row, null); await P.send(env, row, "باشد، کنار گذاشته شد."); return { ok: true }; }
    if (row.role === "p") return await pendingPass(env, row, text);
    if (row.role === "e") return await expertMessage(env, row, msg, text);
    if (row.role === "s") return await supplierMessage(env, row, msg, text);
    return { ok: true };
  } finally {
    if (row) await P.save(env, row).catch((e) => console.error("sp save", e && e.message));
  }
}

/* ------------------------------------------------------------------ */
/* اتصال                                                                 */
/* ------------------------------------------------------------------ */
async function upsertRow(env, chat, role, fields) {
  await env.DB.prepare(`INSERT INTO sp_tg (chat,role,expert_id,phone_id,focus,flow_json,ids_json,updated_at) VALUES (?,?,?,?,NULL,?,COALESCE((SELECT ids_json FROM sp_tg WHERE chat=?),'[]'),?)
    ON CONFLICT(chat) DO UPDATE SET role=excluded.role, expert_id=excluded.expert_id, phone_id=excluded.phone_id, focus=NULL, flow_json=excluded.flow_json, updated_at=excluded.updated_at`)
    .bind(String(chat), role, fields.expert_id || null, fields.phone_id || null, fields.flow ? JSON.stringify(fields.flow) : null, String(chat), now()).run();
  return P.tgRow(env, chat);
}

async function startSupplier(env, chat, row, k, startMid) {
  const ph = await env.DB.prepare("SELECT p.id, s.name FROM sp_phones p JOIN sp_suppliers s ON s.id=p.supplier_id WHERE p.k=?").bind(k).first();
  if (!ph) { await plain(env, chat, "این لینک معتبر نیست. لینک را از آخرین پیامک باز کنید."); return { ok: true }; }
  if (row && row.role === "s" && row.phone_id === ph.id) {
    P.track(row, startMid);
    try { return await home(env, row, "شما از قبل وارد شده‌اید."); } finally { await P.save(env, row); }
  }
  const was = row && row.role === "e" ? "\n<i>(این گفت‌وگو تا حالا به‌عنوان کارشناس وصل بود؛ با ورودِ تأمین‌کننده جایش را می‌گیرد.)</i>" : "";
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
    await P.send(env, row, `✅ خوش آمدید، <b>${esc(sup.name)}</b>.\nاز منوی پایین «📋 استعلام‌ها» را بزنید؛ یا همه‌چیز را در «🧩 پنل (مینی‌اپ)» ببینید.`, P.menuKb(env, "s"));
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
  await env.DB.prepare("UPDATE sp_links SET used_at=? WHERE token=?").bind(t, token).run();
  const r = await upsertRow(env, chat, "e", { expert_id: ex.id });
  P.track(r, startMid);
  await P.setMenuButton(env, chat, "e");
  await P.send(env, r, `✅ ${esc(ex.label || ex.name)}، این گفت‌وگو «بات مکاتبات» شما شد.\n\n`
    + "از منوی پایین «📋 لیست درخواست‌ها» یا «🏷 لیست تأمین‌کنندگان» را بزنید و یک گفت‌وگو را باز کنید؛ "
    + "از آن پس هر چه بنویسید برای همان تأمین‌کننده می‌رود. همه‌چیز در «🧩 مکاتبات (مینی‌اپ)» هم هست."
    + (row && row.role === "s" ? "\n<i>(این گفت‌وگو تا حالا به‌عنوان تأمین‌کننده وصل بود.)</i>" : ""), P.menuKb(env, "e"));
  await P.save(env, r);
  return { ok: true };
}

async function home(env, row, head) {
  if (row.role === "e") {
    const ex = await expertOf(env, row);
    if (!ex) return { ok: true };
    await P.send(env, row, `${head}\nاز منوی پایین یکی از فهرست‌ها را بزنید.`, P.menuKb(env, "e"));
    return listRequests(env, row, ex);
  }
  const sup = await C.phoneIdentity(env, row.phone_id);
  if (!sup) return { ok: true };
  await P.send(env, row, `${head}\n${esc(sup.name)}`, P.menuKb(env, "s"));
  return listSupplierThreads(env, row, sup);
}

async function expertOf(env, row) {
  const ex = await env.DB.prepare("SELECT id, name, label, active FROM experts WHERE id=?").bind(row.expert_id).first();
  if (ex && ex.active) return ex;
  await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
  row._dirty = false;
  await plain(env, row.chat, "این حساب کارشناسی دیگر فعال نیست؛ اتصال برداشته شد.");
  return null;
}

/* ------------------------------------------------------------------ */
/* کارشناس                                                               */
/* ------------------------------------------------------------------ */
async function listRequests(env, row, ex, mid) {
  const d = await C.expertThreads(env, ex);
  const withT = d.requests.filter((g) => g.threads.length);
  if (!withT.length) { await P.show(env, row, mid, "هنوز با هیچ تأمین‌کننده‌ای گفت‌وگو ندارید.\nاز بات کارشناسان، زیر نتیجهٔ جستجو و قالب پیام، «📨 ارسال» را بزنید.", []); return { ok: true }; }
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

async function decideAndShow(env, row, ex, bid, action, opts, mid) {
  try {
    const r = await C.decide(env, ex, bid, action, opts);
    await P.pushMsgs(env, r.thread, r.msgs);
    const th = await C.threadRow(env, r.thread.id);
    const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(bid).first();
    const L = (await env.DB.prepare("SELECT * FROM sp_lines WHERE bundle_id=? ORDER BY id").bind(bid).all()).results || [];
    const c = P.bundleCard(th, b, L);
    const extra = action === "final" ? (r.demo ? "\n\n<i>تأمین‌کنندهٔ فرضی است؛ خط استعلامی در داده‌های واقعی ساخته نشد.</i>"
      : `\n\n✅ ${fa(r.quote_ids.length)} خط استعلامِ موقت در تب استعلامات ساخته شد؛ آن‌جا کاملش کنید.`) : "";
    await P.show(env, row, mid, `${r.msgs[0] ? `<i>${esc(r.msgs[0].body)}</i>\n\n` : ""}${c.text}${extra}`, c.kb);
  } catch (e) {
    const p = e.extra && e.extra.problems;
    const onlyManual = action === "final" && p && p.length === 1 && /صراحتِ لایه‌ها/.test(p[0]);
    await P.send(env, row, `⚠️ ${esc(e.message)}`, onlyManual
      ? [[{ text: "🏁 تأیید نهایی — پیش‌فاکتور را خودم بررسی کردم", callback_data: `xd:${bid}:fm` }], [{ text: "🤖 بررسی هوشمند", callback_data: `xd:${bid}:ai` }]]
      : null);
  }
  return { ok: true };
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
  if (act === "fm") { await ack(); return decideAndShow(env, row, ex, bid, "final", { manual_ok: true }, null); }
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
    await P.send(env, row, `🤖 <b>بررسی هوشمند پیش‌فاکتور</b>\nمدل Claude Haiku 4.5 پیش‌فاکتور را می‌خواند و می‌سنجد که همهٔ لایه‌های قفل‌شده، مقدار و قیمت هر قلم صریح در آن آمده باشند؛ شرایط فاکتور را هم برای خط استعلام برمی‌دارد.\n\nهزینهٔ تقریبی: <b>${AI_COST_HINT}</b> برای هر بار. انجام شود؟`, P.aiConfirmKb(bid));
    return { ok: true };
  }
  if (act === "ai2") {
    await ack("در حال خواندن پیش‌فاکتور…");
    try {
      const tg = await C.aiTarget(env, ex, bid);
      const store = storage(env);
      if (!store || !store.signedUrl) throw new Error("انبار فایل وصل نیست.");
      const ai = await runAiCheck(env, { fileUrl: await store.signedUrl(tg.b.pf_key, 900), mime: tg.b.pf_mime, lines: tg.lines });
      await C.saveAi(env, tg, ai);
      const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(bid).first();
      const c = P.bundleCard(await C.threadRow(env, tg.th.id), b, tg.lines);
      await P.show(env, row, mid, `${c.text}\n\n<i>هزینهٔ همین اجرا: ${fa(ai.cost_usd)} دلار</i>`, c.kb);
    } catch (e) { await P.send(env, row, `⚠️ بررسی هوشمند نشد: ${esc(e.message)}`); }
    return { ok: true };
  }
  if (act === "card") {
    await ack();
    const b = await env.DB.prepare("SELECT * FROM sp_bundles WHERE id=?").bind(bid).first();
    if (!b) return { ok: true };
    const th = await C.threadFor(env, b.thread_id, { expert: ex });
    const L = (await env.DB.prepare("SELECT * FROM sp_lines WHERE bundle_id=? ORDER BY id").bind(bid).all()).results || [];
    const c = P.bundleCard(th, b, L);
    await P.show(env, row, mid, c.text, c.kb);
    return { ok: true };
  }
  await ack();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* تأمین‌کننده                                                            */
/* ------------------------------------------------------------------ */
async function supplierOf(env, row) {
  const sup = await C.phoneIdentity(env, row.phone_id);
  if (sup) return sup;
  await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
  row._dirty = false;
  await plain(env, row.chat, "این شماره دیگر در سامانه نیست؛ اتصال برداشته شد.");
  return null;
}

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
    await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(row.chat).run();
    row._dirty = false;
    await P.spApi(env).call("sendMessage", { chat_id: row.chat, text: "🚪 خارج شدید. برای ورود دوباره، «ارسال رمز به پیامک» را بزنید و لینک پیامک را باز کنید.", reply_markup: { remove_keyboard: true } }).catch(() => {});
    await plain(env, row.chat, "ورود دوباره:", [[{ text: "📱 ارسال رمز به پیامک", callback_data: `rs:${sup.k}` }]]);
    await P.spApi(env).call("setChatMenuButton", { chat_id: row.chat, menu_button: { type: "default" } }).catch(() => {});
    return { ok: true };
  }
  const f = P.flowOf(row);
  const file = fileOf(msg);
  if (f && f.step === "pf") {
    if (!file) { await P.send(env, row, "فایل پیش‌فاکتور را بفرستید (PDF یا عکس)، یا «انصراف»."); return { ok: true }; }
    try {
      const tg = await C.proformaTarget(env, sup, f.bundle);
      const key = await storeTgFile(env, tg.th.assignment_id, file);
      const r = await C.setProforma(env, tg, { skey: key, filename: file.name, mime: file.mime, size: file.size });
      if (r.old) await storage(env).remove(r.old).catch(() => {});
      P.setFlow(row, null);
      await P.pushMsgs(env, r.thread, r.msgs);
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
      return lineCardSend(env, row, sup, f.line, null, "✅ ذخیره شد.");
    } catch (e) { await P.send(env, row, `⚠️ ${esc(e.message)}`); return { ok: true }; }
  }
  if (file) { await P.send(env, row, "برای فرستادن فایل، از کارت قلم «📎 پیوست» را بزنید؛ برای پیش‌فاکتور دکمهٔ «📄 ارسال پیش‌فاکتور» را."); return { ok: true }; }
  if (!text) return { ok: true };
  if (!row.focus) return listSupplierThreads(env, row, sup);
  const th = await C.threadFor(env, row.focus, { supplier: sup }).catch(() => null);
  if (!th) { P.setFocus(row, null); return listSupplierThreads(env, row, sup); }
  const r = await C.postMsg(env, th, "s", text);
  await P.pushMsgs(env, th, r.msgs);
  return { ok: true };
}

async function lineCardSend(env, row, sup, lineId, mid, head) {
  const l = await env.DB.prepare("SELECT l.*, t.supplier_id FROM sp_lines l JOIN sp_threads t ON t.id=l.thread_id WHERE l.id=?").bind(lineId).first();
  if (!l || l.supplier_id !== sup.supplier_id) { await P.send(env, row, "این قلم پیدا نشد."); return { ok: true }; }
  const files = (await env.DB.prepare("SELECT label FROM sp_files WHERE line_id=? ORDER BY id").bind(l.id).all()).results || [];
  const c = P.lineCard(l, files);
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
const VAL_PROMPT = {
  q: "🔢 مقدار را بنویسید (فقط عدد):", u: "📏 واحد را بنویسید (مثلاً عدد، کیلوگرم، متر):", p: "💰 قیمت واحد را به <b>ریال</b> بنویسید:",
  n: "📝 توضیح را بنویسید (یا «-» برای پاک کردن):", l: "➕ لایهٔ تازه را این‌طور بنویسید: «نام لایه: مقدار» — مثلاً «برند: فولاد مبارکه»",
};

async function onCallback(env, cq) {
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
      if (r.expertChat && env.TG_BOT_TOKEN) await deliverSimSms(env, r);
      await ack("فرستاده شد");
      await plain(env, chat, `📱 رمز تازه به ${esc(r.masked)} پیامک شد.${r.expertChat ? "\n<i>(دمو: پیامک خاموش است؛ متنش در گفت‌وگوی کارشناس در بات کارشناسان آمد.)</i>" : ""}\nرمز را همین‌جا بفرستید.`);
      /* بعد از «خروج» ردیفی نمانده: همین گفت‌وگو منتظر رمز می‌شود. گفت‌وگوی وصل‌شده دست نمی‌خورد. */
      const row0 = await P.tgRow(env, chat);
      if (!row0) await upsertRow(env, chat, "p", { flow: { step: "pass", k: parts[1] } });
    } catch (e) { await ack(String(e.message).slice(0, 180), true); }
    return { ok: true };
  }

  const row = await P.tgRow(env, chat);
  if (!row || (row.role !== "e" && row.role !== "s")) { await ack("اول وارد شوید.", true); return { ok: true }; }
  try {
    if (a === "xc") { P.setFlow(row, null); await ack("انصراف"); return { ok: true }; }
    if (row.role === "e") {
      const ex = await expertOf(env, row);
      if (!ex) { await ack(); return { ok: true }; }
      if (a === "xl") { await ack(); return parts[1] === "s" ? listSuppliers(env, row, ex, mid) : listRequests(env, row, ex, mid); }
      if (a === "xr") { await ack(); return listSuppliersOfRequest(env, row, ex, n(1), mid); }
      if (a === "xs") { await ack(); return listRequestsOfSupplier(env, row, ex, n(1), mid); }
      if (a === "xt" || a === "go") {
        const th = await C.threadFor(env, n(1), { expert: ex }).catch(() => null);
        if (!th) { await ack("این گفت‌وگو در دسترس شما نیست.", true); return { ok: true }; }
        await ack();
        await P.showThread(env, row, th);
        return { ok: true };
      }
      if (a === "xd") return await bundleAction(env, row, ex, n(1), parts[2], mid, ack);
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
    if (a === "ic") { await ack(); return itemsCardSend(env, row, sup, n(1), mid); }
    if (a === "si") { await ack(); return lineCardSend(env, row, sup, n(1), mid); }
    if (a === "sv") {
      const f = parts[2];
      if (!VAL_PROMPT[f]) { await ack(); return { ok: true }; }
      await ack();
      P.setFlow(row, { step: "val", line: n(1), f });
      await P.send(env, row, VAL_PROMPT[f], [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
      return { ok: true };
    }
    if (a === "sl") {
      const l = await env.DB.prepare("SELECT extra_json FROM sp_lines WHERE id=?").bind(n(1)).first();
      const extra = JSON.parse((l && l.extra_json) || "[]");
      extra.splice(n(2), 1);
      await C.lineSave(env, sup, n(1), { extra });
      await ack("حذف شد");
      return lineCardSend(env, row, sup, n(1), mid);
    }
    if (a === "sa") {
      if (parts[2] === undefined) {
        await ack();
        const kb = C.FILE_LABELS.map((x, i) => [{ text: x, callback_data: `sa:${n(1)}:${i}` }]);
        kb.push([{ text: "✏️ برچسب دیگر…", callback_data: `sa:${n(1)}:o` }], [{ text: "↩️ بازگشت", callback_data: `si:${n(1)}` }]);
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
      try { await C.lineReady(env, sup, n(1), parts[2] === "1"); await ack(parts[2] === "1" ? "آمادهٔ ارسال شد" : "به پیش‌نویس برگشت"); }
      catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
      return lineCardSend(env, row, sup, n(1), mid);
    }
    if (a === "ss") {
      try {
        const r = await C.submitLines(env, sup, n(1));
        await ack("فرستاده شد");
        await P.pushMsgs(env, r.thread, r.msgs);
        return itemsCardSend(env, row, sup, n(1), mid, `✅ مشخصات برای کارشناس فرستاده شد (بستهٔ ${fa(r.bundle_id)}).`);
      } catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
    }
    if (a === "sp") {
      try { await C.proformaTarget(env, sup, n(1)); } catch (e) { await ack(String(e.message).slice(0, 180), true); return { ok: true }; }
      await ack();
      P.setFlow(row, { step: "pf", bundle: n(1) });
      await P.send(env, row, `📄 فایل پیش‌فاکتورِ بستهٔ ${fa(n(1))} را بفرستید (PDF یا عکس). لایه‌ها، مقدار و قیمت هر قلم باید صریح در آن آمده باشد.`, [[{ text: "✖️ انصراف", callback_data: "xc:0" }]]);
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

/** پیامک شبیه‌سازی‌شده (رمز تازه) در گفت‌وگوی کارشناسِ آخرین استعلامِ همین تأمین‌کننده، در بات کارشناسان */
export async function deliverSimSms(env, r) {
  await telegram(env).sendMessage(r.expertChat,
    `📱 <b>پیامک شبیه‌سازی‌شده</b> — به ${esc(r.to)}${r.label ? ` (${esc(r.label)})` : ""}، ${esc(r.supplier)}\n<i>پیامک فعلاً خاموش است؛ در حالت واقعی این متن فقط به گوشی تأمین‌کننده می‌رود.</i>\n\n<blockquote>${esc(r.text)}</blockquote>`)
    .catch((e) => console.error("sim sms", e && e.message));
}
