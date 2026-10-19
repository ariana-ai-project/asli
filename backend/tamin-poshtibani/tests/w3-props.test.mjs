/* ============================================================
   W3 — پیشنهادهای کارشناس هوشمند در «⏱ با مهلت» آشکار شوند (بازخوردِ صوتیِ مالک، مهر ۱۴۰۵: «دکمهٔ تأییدِ اول را پیدا نکردیم؛
   پیامی بیاید و زیرش دو گزینه: رد یا تأیید»)

   • صفحه (frontend/tamin-poshtibani/ph-props.js در node:vm): «🏁 تأیید نهایی» و «🧾 تصمیمِ بسته» زیرِ کارتِ همان بسته، «💬 پاسخ» درست
     بعد از پیامِ تأمین‌کننده‌ای که جوابش است (وگرنه ته گفت‌وگو)؛ دکمه‌های «🏁» چهار راه دارند؛ پیامِ کادرِ پایین فقط جای پیشنهادِ پیام
     می‌نشیند (هرگز «🏁») و علت می‌خواهد — همان قاعده‌های سرور (ai-supervise.js:rejectBody)
   • سرور (SQLite واقعی، تلگرام و مدلِ بدلی): کارتِ بات همان لحظهٔ پیشنهاد می‌رود (نه با چرخهٔ پنج‌دقیقه‌ایِ صف)؛ شمارِ پیشنهادهای
     معطل در فهرستِ مکاتبات؛ دامِ تایپ: پیامِ خودِ کارشناس بی علت نه و با علت ثبت؛ «🏁 تأیید نهایی»، «↩️ برگشت با توضیح»، «⏸ بعداً
     خودم» (و تصمیمِ بعدیِ خودِ کارشناس با همان مسیرِ بسته) و «❌ رد» هر کدام به نتیجهٔ درست
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick, propsDue, propCardsNow } from "../../../worker/ai-agent.js";
import * as SP from "../../../worker/sp-core.js";
import { rejectBody } from "../../../worker/ai-supervise.js";

const FRONT = join(dirname(fileURLToPath(import.meta.url)), "../../../frontend/tamin-poshtibani");
/* ph-chat.js و ph-props.js واقعی در یک window ساختگی — همان دو فایلی که correspond.html بار می‌کند */
function loadPH() {
  const sb = { console, Date, Math, JSON, Intl, setTimeout, clearTimeout };
  sb.window = sb; sb.self = sb; sb.globalThis = sb; sb.addEventListener = () => {};
  vm.createContext(sb);
  for (const f of ["ph-chat.js", "ph-props.js"]) vm.runInContext(readFileSync(join(FRONT, f), "utf8"), sb, { filename: f });
  return sb.PH;
}
/* آرایه و شیءِ ساخته‌شده در vm از realmِ دیگری است؛ deepEqual فقط محتوا را بسنجد */
const J = (x) => JSON.parse(JSON.stringify(x));
const PH = loadPH();

/* ---------- ۱. منطقِ صفحه (بی پایگاه داده) ---------- */
const M = [
  { id: 1, who: "e", kind: "event", body: "📦 استعلام", meta: { ev: "rfq" }, at: 1 },
  { id: 2, who: "s", kind: "text", body: "سلام، قیمت چند روز دیگر", at: 2 },
  { id: 3, who: "e", kind: "text", body: "ممنون، منتظریم", meta: { ai: true }, at: 3 },
  { id: 4, who: "s", kind: "event", body: "B7", meta: { ev: "submit", bundle: 7 }, at: 4 },
  { id: 5, who: "s", kind: "text", body: "قیمت با حمل است", at: 5 },
  { id: 6, who: "e", kind: "note", body: "🤖 یادداشت", meta: { ai: true, ev: "ai-note" }, at: 6 },
  { id: 7, who: "s", kind: "event", body: "B9", meta: { ev: "submit", bundle: 9 }, at: 7 },
];

test("جای کارت‌ها: «🏁» و «🧾» زیرِ کارتِ همان بسته، «💬 پاسخ» بعد از پیامِ تأمین‌کننده؛ بی لنگر یا جواب‌گرفته ← ته گفت‌وگو", () => {
  const pend = [
    { id: 30, kind: "reply", seen: 6 },                                                           /* جوابِ پیامِ ۵ (یادداشتِ بعدش پاسخ نیست) */
    { id: 20, kind: "final", bundle_id: 7 },                                                      /* زیرِ ارسالِ بستهٔ ۷ */
    { id: 31, kind: "act", actions: [{ type: "return", bundle_id: 7 }, { type: "approve", bundle_id: 9 }] }, /* آخرین رخدادِ بسته‌هایش */
    { id: 32, kind: "final", bundle_id: 99 },                                                     /* بسته در صفحه نیست */
    { id: 33, kind: "reply", seen: 3 },                                                           /* پیامِ ۲ پیش‌تر جواب گرفته (۳) */
    { id: 34, kind: "reply", seen: 0 },
  ];
  const A = J(PH.props.anchors(M, pend));
  assert.deepEqual(Object.fromEntries(Object.entries(A.at).map(([k, L]) => [k, L.map((p) => p.id)])), { 4: [20], 5: [30], 7: [31] });
  assert.deepEqual(A.tail.map((p) => p.id), [32, 33, 34]);
  /* هم‌لنگرها به ترتیبِ شناسه */
  const B = J(PH.props.anchors(M, [{ id: 41, kind: "final", bundle_id: 9 }, { id: 40, kind: "act", actions: [{ type: "reject", bundle_id: 9 }] }]));
  assert.deepEqual(B.at[7].map((p) => p.id), [40, 41]);
  /* PH.feed کارت را درست زیرِ همان پیام می‌نشاند */
  const h = PH.feed(M, { mine: (m) => m.who === "e", after: { 4: '<i data-card="20"></i>' } });
  assert.ok(h.indexOf(">B7") < h.indexOf('data-card="20"') && h.indexOf('data-card="20"') < h.indexOf("قیمت با حمل است"), "زیرِ کارتِ بسته، پیش از پیامِ بعدی");
});

test("پیامِ کادرِ پایین فقط جای «💬 پاسخ» یا «🧾 تصمیمِ بسته»ِ پیام‌دار — هرگز «🏁 تأیید نهایی»", () => {
  const t = (L) => { const p = PH.props.target(L); return p ? p.id : null; };
  assert.equal(t([{ id: 20, kind: "final", bundle_id: 7 }, { id: 30, kind: "reply", body: "الف" }, { id: 35, kind: "reply", body: "ب" }, { id: 31, kind: "act", body: "ج" }]), 35, "آخرین پاسخ");
  assert.equal(t([{ id: 20, kind: "final", bundle_id: 7 }, { id: 31, kind: "act", body: "پیام" }]), 31);
  assert.equal(t([{ id: 20, kind: "final", bundle_id: 7 }, { id: 31, kind: "act", body: "  " }]), null, "تصمیمِ بیِ پیام جای پیام نیست");
  assert.equal(t([{ id: 20, kind: "final", bundle_id: 7 }]), null, "«🏁» هرگز با پیامِ کادر رد نمی‌شود");
  assert.equal(t([]), null);
});

test("بدنهٔ «↩️ / ❌ / ⏸» و دامِ تایپ: علت همیشه، پیامِ برگشت برای «↩️»، جعبه با کلیدش — همان قاعده‌های سرور", () => {
  const err = (fn, field) => assert.throws(fn, (e) => e.field === field && /[آ-ی]/.test(e.message), field);
  err(() => PH.props.finBody("return", { reason: "گران است", text: " " }), "text");
  err(() => PH.props.finBody("return", { reason: "", text: "قیمت را اصلاح کنید" }), "reason");
  err(() => PH.props.finBody("reject", { reason: "برند", needBoxes: true, boxes: [] }), "boxes");
  err(() => PH.props.finBody("approve", { reason: "x" }), "fate");
  const ret = J(PH.props.finBody("return", { reason: " گران است ", text: "قیمت را اصلاح کنید" }));
  assert.deepEqual(ret, { action: "no", reason: "گران است", text: "قیمت را اصلاح کنید", bundle: "return" });
  const keep = J(PH.props.finBody("keep", { reason: "اول مقایسه", text: "این نباید برود" }));
  assert.deepEqual(keep, { action: "no", reason: "اول مقایسه", text: "", bundle: "keep" }, "«⏸ بعداً خودم» پیامی برای تأمین‌کننده نمی‌فرستد");
  const rej = J(PH.props.finBody("reject", { reason: "برند نامعتبر", needBoxes: true, boxes: ["tone"] }));
  assert.deepEqual(rej, { action: "no", reason: "برند نامعتبر", text: "", bundle: "reject", boxes: ["tone"] });
  /* سرور همان بدنه‌ها را همان‌طور می‌فهمد */
  for (const [b, fate] of [[ret, "return"], [keep, "keep"], [rej, "reject"]]) assert.equal(rejectBody({ kind: "final" }, b).bundle, fate);
  err(() => PH.props.replaceBody({ text: "", reason: "لحن" }), "text");
  err(() => PH.props.replaceBody({ text: "حمل با ما", reason: " " }), "reason");
  const rp = J(PH.props.replaceBody({ text: " حمل با ما ", reason: "لحن تند بود" }));
  assert.deepEqual(rp, { action: "no", reason: "لحن تند بود", text: "حمل با ما" });
  assert.deepEqual(rejectBody({ kind: "reply", body: "پیشنهادِ مدل" }, rp), { reason: "لحن تند بود", text: "حمل با ما", bundle: null });
});

test("دکمه‌ها به نوعِ پیشنهاد: «🏁 تأیید نهایی» چهار راه، پاسخ «✅ ارسال» و «✏️ رد»", () => {
  const fin = PH.props.acts({ id: 20, kind: "final", bundle_id: 7 });
  const btn = (attr, label) => new RegExp(`${attr}[^>]*>${label}<`);
  assert.match(fin, btn('data-prop-ok="20"', "🏁 تأیید نهایی"));
  assert.match(fin, btn('data-prop-fin="20:return"', "↩️ برگشت با توضیح"));
  assert.match(fin, btn('data-prop-fin="20:reject"', "❌ رد"));
  assert.match(fin, btn('data-prop-fin="20:keep"', "⏸ بعداً خودم"));
  assert.ok(!/data-prop-no/.test(fin));
  const rep = PH.props.acts({ id: 30, kind: "reply", body: "سلام" });
  assert.match(rep, btn('data-prop-ok="30"', "✅ ارسال همین حالا"));
  assert.match(rep, btn('data-prop-no="30"', "✏️ رد و نوشتن پیام خودم"));
  assert.ok(!/data-prop-fin/.test(rep));
  /* سیم‌کشیِ صفحه: ph-props.js پیش از correspond.js؛ ارسالِ کادر در «⏱» فقط از راهِ پنجرهٔ صریح؛ «🚨» در نوارِ وضعیت */
  const html = readFileSync(join(FRONT, "correspond.html"), "utf8"), js = readFileSync(join(FRONT, "correspond.js"), "utf8");
  assert.ok(html.indexOf('src="ph-props.js"') > html.indexOf('src="ph-chat.js"') && html.indexOf('src="ph-props.js"') < html.indexOf('src="correspond.js"'));
  assert.match(js, /if \(watchOf\(\)\) \{ send\.disabled = false; return composeWatch\(text\); \}/);
  assert.ok(!/propNo\(p\.id, text\)/.test(js), "پیامِ کادر دیگر بی‌صدا پیشنهاد را رد نمی‌کند");
  assert.match(js, /class="ph-sos-mini" data-takeover/);
  assert.match(js, /\$\$\("\[data-takeover\]"\)\.forEach/);
});

/* ---------- ۲. سرور ---------- */
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1",
};
const EX = { "X-Expert-Code": "7001" };
const EXPERT_CHAT = "701";
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?,?)").run(EXPERT_CHAT, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-W3','1405/07/27','پروژهٔ پیچ')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-W3',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (31,'R-W3','a',1,'پیچ M10',400,'عدد','open',1,?)").run(norm("پیچ"));
}

const calls = [];
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
let tgFail = false;
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method, body: init.body ? JSON.parse(init.body) : null });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "AriaSupplierBot" } });
    if (tgFail && method === "sendMessage") return R({ ok: false, error_code: 502, description: "Bad Gateway" }, 502);
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) { const b = JSON.parse(init.body); calls.push({ bot: "ai", body: b }); return R(model(b)); }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
test.after(() => { globalThis.fetch = realFetch; });
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
const usage = { input_tokens: 1000, output_tokens: 100 };
const reply = (text) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify({ reply: text, actions: [], thread_status: "active", memo: "یادداشت.", note: "", ask_expert: "" }) }] });
const props = (th) => DB.raw.prepare("SELECT * FROM ai_props WHERE thread_id=? ORDER BY id").all(th);
const pendingOf = (th, kind) => props(th).filter((p) => p.state === "pending" && p.kind === kind).pop();
const prop = (id) => DB.raw.prepare("SELECT state, reason, own, meta_json FROM ai_props WHERE id=?").get(id);
const bundle = (id) => DB.raw.prepare("SELECT state, comment FROM sp_bundles WHERE id=?").get(id).state;
const ob = (id) => DB.raw.prepare("SELECT status, attempts, last_error FROM outbox WHERE idem=?").get(`prop:${id}`);
const sentCard = (id, n0) => calls.slice(n0).find((c) => c.method === "sendMessage" && String(c.body.chat_id) === EXPERT_CHAT
  && JSON.stringify(c.body.reply_markup || {}).includes(`"prop:${id}:ok"`));
const msgCount = (th) => DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_msgs WHERE thread_id=?").get(th).n;
const S = {};

/** تأمین‌کننده قلم را «آمادهٔ ارسال» می‌کند و می‌فرستد ← بستهٔ تازه و «🏁 تأیید نهایی»ِ پیشنهادی (و پاسخِ مدل) */
async function submit(text = "پیشنهادتون رسید؛ بررسی می‌کنیم.") {
  const { th, H, line } = S;
  DB.raw.prepare("UPDATE ai_threads SET turns=0 WHERE thread_id=?").run(th);   /* سقفِ ۵ دور آزمونِ خودش را دارد */
  assert.equal((await call(`/sp/line/${line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply(text);
  const n0 = calls.length;
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending", "تأیید نهایی پیشنهاد شد، نه اجرا");
  const f = pendingOf(th, "final");
  assert.equal(f.bundle_id, sub.data.bundle_id);
  return { bid: sub.data.bundle_id, f, n0 };
}

test("کارتِ بات همان لحظهٔ پیشنهاد می‌رود — بی Cron و بی چرخهٔ صف؛ شمارِ پیشنهادها در فهرست؛ داده‌ها برای جای کارت‌ها", { skip: SKIP }, async () => {
  assert.equal((await call("/items/31/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/31/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000901", label: "فروش", panel: true } })).status, 200);
  assert.equal((await call("/items/31/ai-start", { headers: EX, body: {} })).status, 200);
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = S.th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000901'").get();
  const H = S.H = { "X-SP-Session": await SP.newSession(env, p.id, "web") };
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 10 } })).status, 200);
  S.line = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  assert.equal((await call(`/sp/line/${S.line}`, { method: "PUT", headers: H, body: { qty: 400, price: 4200 } })).status, 200);

  const { bid, f, n0 } = await submit();
  S.b1 = bid; S.f1 = f.id;
  const r = S.r1 = pendingOf(th, "reply");
  assert.ok(r, "پاسخِ مدل هم پیشنهاد شد");
  /* هر دو کارت همان لحظه رفتند (ردیفِ صف «فرستاده») — نه منتظرِ drainOutboxِ دقیقه‌های مضربِ ۵ */
  for (const x of [f, r]) {
    assert.equal(ob(x.id).status, "sent", `کارتِ ${x.kind}`);
    const c = sentCard(x.id, n0);
    assert.ok(c, `sendMessage با دکمه‌های prop:${x.id}`);
    assert.match(c.body.text, /کارشناس هوشمند می‌خواهد این را بفرستد/);
  }
  assert.match(sentCard(f.id, n0).body.text, /🏁 تأیید نهاییِ بستهٔ/);
  assert.equal(calls.slice(n0).filter((c) => c.method === "sendMessage" && JSON.stringify(c.body.reply_markup || {}).includes(`"prop:${f.id}:ok"`)).length, 1, "یک بار");

  /* فهرستِ مکاتبات: شمارِ پیشنهادهای معطل در ردیفِ گفت‌وگو، درخواست و سرِ ستون — از همان یک کوئریِ فهرست */
  const ls = (await call("/sp/x/threads", { headers: EX })).data;
  const g = ls.requests.find((x) => x.assignment_id === 1), t = g.threads.find((x) => x.id === th);
  assert.deepEqual([t.ai, t.props, g.props, ls.props], ["watch", 2, 2, 2]);

  /* گفت‌وگو برای صفحه: seen برای جای کارتِ پاسخ، دورهای کارشناس هوشمند («دورِ n از ۵») و جای واقعیِ کارت‌ها با ph-props.js */
  const v = (await call(`/sp/thread/${th}`, { headers: EX })).data;
  assert.deepEqual(v.watch.pending.map((x) => x.kind), ["final", "reply"]);
  const ev = v.msgs.filter((m) => m.who === "s" && m.kind === "event" && m.meta && m.meta.ev === "submit" && m.meta.bundle === bid).pop();
  assert.ok(ev, "رخدادِ ارسالِ همین بسته");
  assert.ok(v.watch.pending[1].seen >= ev.id, "seen در خروجیِ پیشنهاد");
  assert.ok(v.thread.ai.turns && v.thread.ai.turns.max === 5 && v.thread.ai.turns.used >= 1, JSON.stringify(v.thread.ai));
  const A = J(PH.props.anchors(v.msgs, v.watch.pending));
  assert.deepEqual(A.at[ev.id].map((x) => x.id), [f.id, r.id], "«🏁» زیرِ کارتِ همان بسته و پاسخ درست بعد از آن (آخرین پیامِ تأمین‌کننده)");
  assert.deepEqual(A.tail, []);
});

test("propCardsNow: تلگرام نشد ← ردیف به صف برمی‌گردد؛ بارِ دوم یک بار؛ بی توکن هیچ", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO outbox (idem,channel,target,payload_json,status,next_at,created_at) VALUES ('prop:424242','telegram',?,?,'pending',?,?)")
    .run(EXPERT_CHAT, JSON.stringify({ text: "کارتِ آزمون", keyboard: [[{ text: "✅", callback_data: "prop:424242:ok" }]] }), t, t);
  tgFail = true;
  assert.equal(await propCardsNow(env, [424242]), 0);
  const a = ob(424242);
  assert.equal(a.status, "pending", "Cron دوباره می‌فرستد");
  assert.match(a.last_error, /502/);
  tgFail = false;
  assert.equal(await propCardsNow(env, ["424242", 424242]), 1, "یک بار، حتی با شناسهٔ تکراری");
  assert.equal(ob(424242).status, "sent");
  assert.equal(await propCardsNow(env, [424242]), 0, "فرستاده‌شده دوباره نمی‌رود");
  assert.equal(await propCardsNow({ ...env, TG_BOT_TOKEN: "" }, [424242]), 0);
  assert.equal(await propCardsNow(env, []), 0);
});

test("دامِ تایپ (سرور): پیامِ خودِ کارشناس بی پیشنهاد نمی‌رود؛ با «رد»ِ پاسخ، علت اجباری و ثبت؛ «🏁» دست نمی‌خورد", { skip: SKIP }, async () => {
  const { th, r1, f1 } = S;
  const direct = await call(`/sp/thread/${th}/msg`, { headers: EX, body: { text: "سلام، حمل با خودمان" } });
  assert.equal(direct.status, 423);
  assert.equal(direct.data.ai_watch, true);
  assert.equal(prop(r1.id).state, "pending", "پیامِ مستقیم پیشنهاد را بی‌صدا رد نکرد");
  const noWhy = await call(`/sp/x/prop/${r1.id}`, { headers: EX, body: { action: "no", text: "سلام، حمل با خودمان" } });
  assert.equal(noWhy.status, 422);
  assert.equal(noWhy.data.need_reason, true);
  assert.equal(prop(r1.id).state, "pending");
  const ok = await call(`/sp/x/prop/${r1.id}`, { headers: EX, body: PH.props.replaceBody({ text: "سلام، حمل با خودمان", reason: "حمل را باید روشن می‌کرد" }) });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual({ ...prop(r1.id), meta_json: undefined }, { state: "no", reason: "حمل را باید روشن می‌کرد", own: "سلام، حمل با خودمان", meta_json: undefined });
  const m = DB.raw.prepare("SELECT who, meta_json FROM sp_msgs WHERE thread_id=? AND body='سلام، حمل با خودمان'").get(th);
  assert.equal(m.who, "e");
  assert.equal(JSON.parse(m.meta_json).own, r1.id, "پیامِ خودِ کارشناس به‌جای پیشنهاد");
  assert.ok(!DB.raw.prepare("SELECT 1 AS x FROM sp_msgs WHERE thread_id=? AND body='پیشنهادتون رسید؛ بررسی می‌کنیم.'").get(th), "پیشنهادِ ردشده نرفت");
  assert.equal(prop(f1).state, "pending", "«🏁 تأیید نهایی» با پیامِ کادر رد نمی‌شود");
  assert.equal(DB.raw.prepare("SELECT outcome, note, human_text FROM ai_feedback WHERE kind='prop' AND ref=?").get(r1.id).note, "حمل را باید روشن می‌کرد", "علت به بایگانیِ بازخورد رسید");
});

test("«↩️ برگشت با توضیح»: پیامِ برگشت اجباری؛ بسته با همان پیام برمی‌گردد و پیشنهاد رد می‌شود", { skip: SKIP }, async () => {
  const { th, f1, b1 } = S;
  const noText = await call(`/sp/x/prop/${f1}`, { headers: EX, body: { action: "no", reason: "قیمت بالاتر از سوابق است", bundle: "return" } });
  assert.equal(noText.status, 422);
  assert.equal(noText.data.need_text, true);
  assert.equal(prop(f1).state, "pending");
  const r = await call(`/sp/x/prop/${f1}`, { headers: EX, body: PH.props.finBody("return", { reason: "قیمت بالاتر از سوابق است", text: "لطفاً قیمت واحد را بازبینی کنید." }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = prop(f1);
  assert.deepEqual([p.state, p.reason, JSON.parse(p.meta_json).bundle_act], ["no", "قیمت بالاتر از سوابق است", "return"]);
  assert.equal(bundle(b1), "returned");
  assert.equal(DB.raw.prepare("SELECT comment FROM sp_bundles WHERE id=?").get(b1).comment, "لطفاً قیمت واحد را بازبینی کنید.");
  const ev = DB.raw.prepare("SELECT who, body, meta_json FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id DESC LIMIT 1").get(th);
  assert.equal(ev.who, "e");
  assert.match(ev.body, /برای اصلاح برگشت خورد[\s\S]*لطفاً قیمت واحد را بازبینی کنید\./);
  assert.equal(JSON.parse(ev.meta_json).bundle, b1);
});

test("«⏸ بعداً خودم»: خودکار نمی‌رود، بسته منتظرِ کارشناس می‌ماند و هیچ پیامی نمی‌رود؛ بعد تصمیمِ خودش با همان مسیرِ بسته", { skip: SKIP }, async () => {
  const { th } = S;
  const { bid, f } = await submit("بستهٔ تازه رسید؛ نگاه می‌کنیم.");
  S.b2 = bid;
  assert.equal((await call(`/sp/x/bundle/${bid}/decide`, { headers: EX, body: { action: "return", comment: "x" } })).status, 423, "تا پیشنهاد معطل است، تصمیمِ مستقیم نه");
  const n0 = msgCount(th);
  const r = await call(`/sp/x/prop/${f.id}`, { headers: EX, body: PH.props.finBody("keep", { reason: "می‌خواهم اول با پیشنهادِ بقیه مقایسه کنم", text: "نباید برود" }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = prop(f.id);
  assert.deepEqual([p.state, p.own, JSON.parse(p.meta_json).bundle_act], ["no", null, "keep"]);
  assert.equal(bundle(bid), "pending", "بسته سرِ جایش");
  assert.equal(msgCount(th), n0, "هیچ پیامی برای تأمین‌کننده نرفت");
  /* سرِ مهلت هم نمی‌رود */
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() - 1000, f.id);
  await propsDue(env);
  assert.equal(bundle(bid), "pending");
  /* صفحه: بسته «تصمیم با شما» است و شمارِ پیشنهادها پایین آمد */
  const v = (await call(`/sp/thread/${th}`, { headers: EX })).data;
  assert.ok(v.watch.manual.includes(bid));
  assert.ok(!v.watch.pending.some((x) => x.kind === "final"));
  const t = (await call("/sp/x/threads", { headers: EX })).data.requests[0].threads.find((x) => x.id === th);
  assert.equal(t.props, v.watch.pending.length);
  /* تصمیمِ بعدیِ خودِ کارشناس — دکمه‌های همیشگیِ بسته (/sp/x/bundle/:id/decide) */
  const d = await call(`/sp/x/bundle/${bid}/decide`, { headers: EX, body: { action: "return", comment: "شرایط تسویه را اعتباری کنید." } });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(bundle(bid), "returned");
});

test("«🏁 تأیید نهایی» همان لحظه؛ «❌ رد» بسته را رد می‌کند (پیام اختیاری)", { skip: SKIP }, async () => {
  const { th, H, line } = S;
  const a = await submit("سومین بسته رسید.");
  const ok = await call(`/sp/x/prop/${a.f.id}`, { headers: EX, body: { action: "ok" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(prop(a.f.id).state, "ok");
  assert.equal(bundle(a.bid), "final");
  const q = DB.raw.prepare("SELECT price, saved, final FROM quotes WHERE assignment_id=1 AND item_id=31").get();
  assert.deepEqual([q.price, q.saved, q.final], [4200, 1, 1], "خطِ استعلام با مقدارهای تأمین‌کننده");
  /* تأمین‌کننده پیشنهادِ تأییدنهایی‌شده را «✏️ اصلاح» می‌کند و دوباره می‌فرستد */
  assert.equal((await call(`/sp/line/${line}/revise`, { headers: H, body: {} })).status, 200);
  const b = await submit("بستهٔ اصلاح‌شده رسید.");
  const n0 = DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_msgs WHERE thread_id=? AND who='e' AND kind='text'").get(th).n;
  const r = await call(`/sp/x/prop/${b.f.id}`, { headers: EX, body: PH.props.finBody("reject", { reason: "برند در فهرستِ مجاز نیست" }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const p = prop(b.f.id);
  assert.deepEqual([p.state, p.reason, JSON.parse(p.meta_json).bundle_act], ["no", "برند در فهرستِ مجاز نیست", "reject"]);
  assert.equal(bundle(b.bid), "rejected");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_msgs WHERE thread_id=? AND who='e' AND kind='text'").get(th).n, n0, "بی پیامِ متنیِ اضافه — فقط رخدادِ رد");
  assert.match(DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? AND kind='event' ORDER BY id DESC LIMIT 1").get(th).body, /❌ رد شد/);
});
