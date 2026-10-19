/* ============================================================
   مکاتباتِ کارشناس هوشمند «⏱ با مهلت / 🤖 خودکار» (مهر ۱۴۰۵، درخواستِ مالک؛ جای «👁 حالت تأیید»ِ فاز ۴ب گام ۴)

   روی SQLite واقعی (همان طرحِ ensureSchema)، با تلگرام، انبار و مدلِ بدلی:
   فقط خودِ کارشناس حالت را می‌گذارد (پیش‌فرض با مهلتِ ۱۰ دقیقه؛ ۱ تا ۶۰) ← در «با مهلت» هر پاسخ و تصمیمِ بسته اول پیشنهاد می‌شود
   (due_at) و با شمارش در مکاتبات، اعلان و بات می‌آید ← «✅ ارسال» همان لحظه؛ «✏️ رد» علت و پیامِ تازهٔ خودِ کارشناس (اجباری) ←
   بی‌پاسخ سرِ مهلت خودکار می‌رود (Cron یا صفحهٔ باز) ← پیامِ تازهٔ تأمین‌کننده پیشنهادِ پاسخِ معطل را کنار می‌گذارد ← «🤖 خودکار»
   معطل‌ها را همان لحظه می‌فرستد و از آن پس بی پیشنهاد ← «🚨 باز کردنِ اضطراری» معطل‌ها را کنار می‌گذارد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick, propsDue } from "../../../worker/ai-agent.js";
import { handleUpdate } from "../../../worker/bot.js";
import * as SP from "../../../worker/sp-core.js";
import { supCfg, rejectBody, SUP_DEFAULT } from "../../../worker/ai-supervise.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1",
};
const EX = { "X-Expert-Code": "7001" }, MG = { "X-Manager-Code": "1234" };
const EXPERT_CHAT = "701";
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?,?)").run(EXPERT_CHAT, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-S','1405/07/15','پروژهٔ پیچ'), ('R-Q','1405/07/15','پروژهٔ مهره')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-S',1,5,?,?,?), (2,'R-Q',1,5,?,?,?)").run(t, t + 9e8, t, t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(31, "R-S", "a", 1, "پیچ M10", 400, "عدد", 1, norm("پیچ"));
  ins.run(41, "R-Q", "a", 1, "پیچ M12", 100, "عدد", 2, norm("پیچ"));
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method, body: init.body ? JSON.parse(init.body) : null });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "AriaSupplierBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
  if (u.startsWith("https://ai.test/")) { const b = JSON.parse(init.body); calls.push({ bot: "ai", body: b }); return R(model(b)); }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
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
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify(o) }] });
const reply = (text) => jsonOut({ reply: text, actions: [], thread_status: "active", memo: "یادداشت.", note: "", ask_expert: "" });
async function supplierSession(phone) {
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone=?").get(phone);
  return { "X-SP-Session": await SP.newSession(env, p.id, "web") };
}
const props = (th) => DB.raw.prepare("SELECT * FROM ai_props WHERE thread_id=? ORDER BY id").all(th);
const outbox = (re) => DB.raw.prepare("SELECT payload_json FROM outbox WHERE target=? ORDER BY id").all(EXPERT_CHAT).map((r) => JSON.parse(r.payload_json)).filter((p) => !re || re.test(p.text));
let cbn = 0;
const tg = (data) => handleUpdate(env, { callback_query: { id: `cb${++cbn}`, data, message: { message_id: 900 + cbn, chat: { id: EXPERT_CHAT }, text: "کارت" } } });
const tgText = (text) => handleUpdate(env, { message: { message_id: 5000 + ++cbn, chat: { id: EXPERT_CHAT, type: "private" }, text } });
const sentTexts = () => calls.filter((c) => c.bot === "tg" && c.method === "sendMessage").map((c) => c.body.text);
const msgBy = (th, body) => DB.raw.prepare("SELECT who, meta_json FROM sp_msgs WHERE thread_id=? AND body=?").get(th, body);
const S = {};

test("تنظیمات و بدنهٔ «رد» (بی پایگاه داده)", () => {
  assert.deepEqual(SUP_DEFAULT, { mode: "timer", minutes: 10 }, "پیش‌فرضِ مالک: با مهلتِ ۱۰ دقیقه");
  assert.deepEqual(supCfg(null), SUP_DEFAULT);
  assert.deepEqual(supCfg('{"chat":true,"bundle":false}'), SUP_DEFAULT, "قالبِ قدیمیِ «👁» = پیش‌فرض");
  assert.deepEqual(supCfg({ mode: "auto", minutes: "۵" }), { mode: "auto", minutes: 5 });
  assert.deepEqual(supCfg({ mode: "x", minutes: 99 }), SUP_DEFAULT);
  assert.throws(() => rejectBody({ kind: "reply", body: "سلام" }, { reason: " " }), (e) => e.status === 422 && e.extra.need_reason);
  assert.throws(() => rejectBody({ kind: "reply", body: "سلام" }, { reason: "لحن تند است", text: "" }), (e) => e.status === 422 && e.extra.need_text, "ردِ پیام بی پیامِ تازه نه");
  assert.deepEqual(rejectBody({ kind: "reply", body: "سلام" }, { reason: "لحن تند است", text: "سلام، ممنون" }), { reason: "لحن تند است", text: "سلام، ممنون", bundle: null });
  assert.equal(rejectBody({ kind: "act", body: null }, { reason: "زود است" }).text, "", "تصمیمِ بیِ پیام: پیام اختیاری");
  assert.equal(rejectBody({ kind: "final" }, { reason: "گران", text: "لطفاً قیمت را اصلاح کنید" }).bundle, "return");
  assert.equal(rejectBody({ kind: "final" }, { reason: "گران" }).bundle, "keep");
  assert.throws(() => rejectBody({ kind: "final" }, { reason: "گران", bundle: "return" }), (e) => e.status === 422 && e.extra.need_text);
});

test("فقط خودِ کارشناس حالت را می‌گذارد؛ تیکِ مدیر و درخواست از مدیر دیگر نیست", { skip: SKIP }, async () => {
  const g = await call("/me/supervise", { headers: EX });
  assert.deepEqual([g.data.cfg, g.data.min, g.data.max], [{ mode: "timer", minutes: 10 }, 1, 60]);
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "x" } })).status, 422);
  for (const minutes of [0, 61, "abc", 2.5]) assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "timer", minutes } })).status, 422, String(minutes));
  const ok = await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "timer", minutes: "۵" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.cfg, { mode: "timer", minutes: 5 });
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_sup_cfg'").get());
  assert.equal((await call("/me/supervise", { method: "PUT", headers: MG, body: { mode: "auto" } })).status, 401, "مدیر نه");
  assert.equal((await call("/assign/sup", { headers: MG, body: { assignment_id: 1, on: true } })).status, 404, "تیکِ «👁» مدیر برداشته شد");
  assert.equal((await call("/assignments/2/decision", { headers: EX, body: { action: "supervise", item_ids: [41], reason: "حساس" } })).status, 410);
  const d = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual(d.ai.sup, { cfg: { mode: "timer", minutes: 5 } });
});

test("با مهلت: تأیید نهایی و پاسخِ مدل پیشنهاد می‌شوند با due_at و نمی‌روند؛ کارت، اعلان و شمارش", { skip: SKIP }, async () => {
  assert.equal((await call("/items/31/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/31/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000501", label: "فروش", panel: true } })).status, 200);
  const st = await call("/items/31/ai-start", { headers: EX, body: {} });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = S.th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const H = S.H = await supplierSession("09120000501");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 10 } })).status, 200);
  S.line = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  assert.equal((await call(`/sp/line/${S.line}`, { method: "PUT", headers: H, body: { qty: 400, price: 4200 } })).status, 200);
  assert.equal((await call(`/sp/line/${S.line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("سلام 🌷 پیشنهادتون رسید؛ بررسی می‌کنیم و خبر می‌دیم.");
  const t0 = Date.now();
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending", "تأیید نهایی پیشنهاد شد، نه اجرا");
  S.bundle = sub.data.bundle_id;
  const P = props(th);
  assert.deepEqual(P.map((p) => [p.kind, p.state]), [["final", "pending"], ["reply", "pending"]]);
  for (const p of P) assert.ok(p.due_at >= t0 + 5 * 60000 - 50 && p.due_at <= Date.now() + 5 * 60000, "مهلت = ۵ دقیقهٔ کارشناس");
  assert.ok(!msgBy(th, "سلام 🌷 پیشنهادتون رسید؛ بررسی می‌کنیم و خبر می‌دیم."), "پاسخِ مدل نرفت");
  const cards = outbox(/کارشناس هوشمند می‌خواهد این را بفرستد/);
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => /اگر تا ساعتِ [۰-۹]{2}:[۰-۹]{2} پاسخ ندهید، همین خودکار می‌رود/.test(c.text)), "ساعتِ ارسالِ خودکار روی کارت");
  assert.deepEqual(cards[1].keyboard[0].map((b) => [b.text, b.callback_data]), [["✅ ارسال همین حالا", `prop:${P[1].id}:ok`], ["✏️ رد و پیامِ خودم", `prop:${P[1].id}:no`]]);
  const push = DB.raw.prepare("SELECT payload_json FROM outbox WHERE channel='push' AND idem=?").get(`prop:${P[1].id}`);
  if (push) assert.match(JSON.parse(push.payload_json).title, /۵ دقیقه مهلت/);
  /* فهرست و گفت‌وگو برای کارشناس: باز، فقط‌خواندنی، با مهلت و ساعتِ سرور */
  const ls = (await call("/sp/x/threads", { headers: EX })).data;
  const t = ls.requests.find((g) => g.assignment_id === 1).threads.find((x) => x.id === th);
  assert.deepEqual([t.ai, t.props], ["watch", 2]);
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.equal(v.data.thread.ai.watch, true);
  assert.deepEqual(v.data.watch.pending.map((p) => p.kind), ["final", "reply"]);
  assert.equal(v.data.watch.minutes, 5);
  assert.ok(Math.abs(v.data.watch.now - Date.now()) < 5000);
  assert.equal(v.data.watch.pending[1].due_at, P[1].due_at);
  const own = await call(`/sp/thread/${th}/msg`, { headers: EX, body: { text: "سلام از کارشناس" } });
  assert.equal(own.status, 423);
  assert.equal(own.data.ai_watch, true);
  assert.equal((await call(`/sp/x/bundle/${S.bundle}/decide`, { headers: EX, body: { action: "final" } })).status, 423, "تصمیمِ مستقیم نه");
});

test("«✅ ارسال» همان لحظه؛ پیامِ تازهٔ تأمین‌کننده معطل را کنار می‌گذارد؛ «✏️ رد» علت و پیامِ تازهٔ خودِ کارشناس می‌خواهد", { skip: SKIP }, async () => {
  const { th, H } = S;
  const first = props(th).find((p) => p.kind === "reply" && p.state === "pending");
  const ok = await call(`/sp/x/prop/${first.id}`, { headers: EX, body: { action: "ok" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(DB.raw.prepare("SELECT state, decided_by FROM ai_props WHERE id=?").get(first.id).decided_by, "expert:1");
  assert.ok(JSON.parse(msgBy(th, "سلام 🌷 پیشنهادتون رسید؛ بررسی می‌کنیم و خبر می‌دیم.").meta_json).ai, "رفت، به نامِ کارشناس هوشمند");
  assert.equal((await call(`/sp/x/prop/${first.id}`, { headers: EX, body: { action: "ok" } })).status, 409, "دوباره نه");
  model = () => reply("ممنون؛ امکانِ تخفیف برای تسویهٔ نقدی هست؟");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "قیمت با حمل است." } })).status, 200);
  const old = props(th).find((p) => p.kind === "reply" && p.state === "pending");
  model = () => reply("خبرِ تازه‌ای هست؟");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "راستی موجودی محدود است." } })).status, 200);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(old.id).state, "stale");
  const fresh = props(th).find((p) => p.kind === "reply" && p.state === "pending");
  assert.ok(fresh && fresh.id !== old.id);
  assert.equal((await call(`/sp/x/prop/${fresh.id}`, { headers: EX, body: { action: "no", reason: "" } })).status, 422, "بی علت نه");
  const noText = await call(`/sp/x/prop/${fresh.id}`, { headers: EX, body: { action: "no", reason: "لحنش سرد است" } });
  assert.equal(noText.status, 422, "بی پیامِ تازه نه");
  assert.equal(noText.data.need_text, true);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(fresh.id).state, "pending", "تا ردِ کامل، معطل می‌ماند");
  const no = await call(`/sp/x/prop/${fresh.id}`, { headers: EX, body: { action: "no", reason: "تخفیف را بعد از تأیید نهایی بخواه", text: "حمل با خودتان باشد، ممنون." } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  const m = msgBy(th, "حمل با خودتان باشد، ممنون.");
  assert.equal(JSON.parse(m.meta_json).own, fresh.id);
  assert.ok(!JSON.parse(m.meta_json).ai, "پیامِ انسانی");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason FROM ai_props WHERE id=?").get(fresh.id) }, { state: "no", reason: "تخفیف را بعد از تأیید نهایی بخواه" });
  /* دورِ بعد: «⏱ با مهلت» و نظرِ کارشناس در پرونده */
  let seen = null;
  model = (b) => { seen = b; return reply("چشم؛ حمل با ما."); };
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "باشه، حمل با ما." } })).status, 200);
  const ctxText = seen.messages[0].content[0].text;
  assert.match(ctxText, /⏱ با مهلت: پاسخ‌هایت و تصمیم‌های بسته پیش از رفتن به کارشناسِ خرید نشان داده می‌شود/);
  assert.match(ctxText, /<نظر_کارشناس_بر_پیشنهادهایت>[\s\S]*✅ کارشناس تأیید کرد و رفت[\s\S]*❌ کارشناس رد کرد — توضیحش: «تخفیف را بعد از تأیید نهایی بخواه»؛ پیامِ خودِ کارشناس: «حمل با خودتان باشد، ممنون\.»/);
});

test("بی‌پاسخ سرِ مهلت: صفحهٔ باز سرِ صفر می‌فرستد، Cron هم؛ پیش از مهلت نه", { skip: SKIP }, async () => {
  const { th } = S;
  const p = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  assert.ok(p, "پاسخِ «چشم؛ حمل با ما.» معطل است");
  const early = await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "due" } });
  assert.equal(early.status, 409, "پیش از مهلت نه");
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() + 30000, p.id);
  const hold = await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "hold" } });
  assert.equal(hold.status, 200);
  assert.ok(hold.data.due_at >= Date.now() + 2.9 * 60000, "بازکردنِ «رد» مهلت را دست‌کم سه دقیقه می‌کند");
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() - 1000, p.id);
  const due = await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "due" } });
  assert.equal(due.status, 200, JSON.stringify(due.data));
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, decided_by FROM ai_props WHERE id=?").get(p.id) }, { state: "auto", decided_by: "auto" });
  const m = JSON.parse(msgBy(th, "چشم؛ حمل با ما.").meta_json);
  assert.ok(m.ai && m.auto, "به نامِ کارشناس هوشمند، با نشانِ خودکار");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM ai_log WHERE kind='prop' AND body LIKE '⏱ کارشناس در مهلت پاسخ نداد%'").get());
  /* تأیید نهایی هم سرِ مهلت: Cronِ هر دقیقه (aiTick) — بستهٔ تأییدنهایی و خطِ استعلام */
  const f = props(th).find((x) => x.kind === "final" && x.state === "pending");
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() - 1000, f.id);
  DB.raw.prepare("UPDATE ai_runs SET next_at=9e15").run();
  await aiTick(env);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(f.id).state, "auto");
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(S.bundle).state, "final");
  const q = DB.raw.prepare("SELECT price, saved, final FROM quotes WHERE assignment_id=1 AND item_id=31").get();
  assert.deepEqual([q.price, q.saved, q.final], [4200, 1, 1]);
  assert.equal(await propsDue(env), 0, "دوباره چیزی نمی‌رود");
});

test("بات: «✅ ارسال همین حالا» می‌فرستد؛ «✏️ رد» علت و پیامِ تازه می‌خواهد و «-» برای پیام پذیرفته نیست", { skip: SKIP }, async () => {
  const { th, H } = S;
  /* سقفِ ۵ دورِ کارشناس هوشمند (ai-lock.js:TURN_CAP) آزمونِ خودش را دارد؛ این‌جا دورهای همین گفت‌وگو از نو */
  DB.raw.prepare("UPDATE ai_threads SET turns=0 WHERE thread_id=?").run(th);
  model = () => reply("پیشنهادِ تازه برای ارسال.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "خبری شد؟" } })).status, 200);
  const p = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  await tg(`prop:${p.id}:ok`);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(p.id).state, "ok");
  assert.ok(msgBy(th, "پیشنهادِ تازه برای ارسال."));
  assert.ok(calls.some((c) => c.method === "editMessageText" && /همین حالا برای تأمین‌کننده رفت/.test(c.body.text)));
  model = () => reply("پیشنهادِ تازه برای رد.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "منتظرم." } })).status, 200);
  const q = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  await tg(`prop:${q.id}:no`);
  assert.match(sentTexts().pop(), /چرا ردش می‌کنید؟[\s\S]*مهلت تا [۰-۹]+ دقیقهٔ دیگر تمدید شد/);
  assert.ok(DB.raw.prepare("SELECT due_at FROM ai_props WHERE id=?").get(q.id).due_at >= Date.now() + 2.9 * 60000, "رد باز شد: مهلت دست‌کم سه دقیقه");
  await tgText("هنوز زود است");
  assert.match(sentTexts().pop(), /پیامِ تازهٔ خودتان را برای تأمین‌کننده بنویسید/);
  await tgText("-");
  assert.match(sentTexts().pop(), /پیامِ خودتان لازم است/);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(q.id).state, "pending");
  await tgText("فردا خبر می‌دهیم، ممنون از صبرتان.");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason, own FROM ai_props WHERE id=?").get(q.id) }, { state: "no", reason: "هنوز زود است", own: "فردا خبر می‌دهیم، ممنون از صبرتان." });
  assert.ok(msgBy(th, "فردا خبر می‌دهیم، ممنون از صبرتان."));
  assert.ok(!msgBy(th, "پیشنهادِ تازه برای رد."), "پیشنهادِ ردشده نرفت");
});

test("«🤖 خودکار»: معطل‌ها همان لحظه می‌روند، گفت‌وگو بسته و پاسخ‌ها بی پیشنهاد؛ برگشت به مهلت و «🚨 اضطراری»", { skip: SKIP }, async () => {
  const { th, H } = S;
  /* سقفِ ۵ دورِ کارشناس هوشمند (ai-lock.js:TURN_CAP) آزمونِ خودش را دارد؛ این‌جا دورهای همین گفت‌وگو از نو */
  DB.raw.prepare("UPDATE ai_threads SET turns=0 WHERE thread_id=?").run(th);
  model = () => reply("پیامِ معطل پیش از خودکار.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سؤالی دارم" } })).status, 200);
  const p = props(th).find((x) => x.state === "pending");
  assert.ok(p);
  const auto = await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "auto" } });
  assert.equal(auto.status, 200, JSON.stringify(auto.data));
  assert.deepEqual([auto.data.cfg, auto.data.sent], [{ mode: "auto", minutes: 5 }, 1], "دقیقه‌ها می‌مانند؛ معطل رفت");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(p.id).state, "auto");
  assert.ok(msgBy(th, "پیامِ معطل پیش از خودکار."));
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.equal(v.data.thread.ai.locked, true, "خودکار: فقط دیدن");
  assert.equal(v.data.watch, undefined);
  model = () => reply("پاسخِ بی پیشنهاد.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سؤالِ دیگر" } })).status, 200);
  assert.ok(msgBy(th, "پاسخِ بی پیشنهاد."), "همان لحظه رفت");
  assert.equal(props(th).filter((x) => x.state === "pending").length, 0);
  /* برگشت به «با مهلت» و باز کردنِ اضطراری: پیشنهادِ معطل کنار می‌رود و سرِ مهلت نمی‌رود */
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "timer", minutes: 1 } })).status, 200);
  model = () => reply("پیامی که نباید برود.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سلام دوباره" } })).status, 200);
  const q = props(th).find((x) => x.state === "pending");
  assert.ok(q && q.due_at - q.created_at === 60000, "مهلتِ تازه: یک دقیقه");
  const tk = await call(`/sp/x/thread/${th}/takeover`, { headers: EX, body: { reason: "تأمین‌کننده تلفنی گفت فوری است" } });
  assert.equal(tk.status, 200, JSON.stringify(tk.data));
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, decided_by FROM ai_props WHERE id=?").get(q.id) }, { state: "off", decided_by: "takeover" });
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() - 1000, q.id);
  assert.equal(await propsDue(env), 0);
  assert.ok(!msgBy(th, "پیامی که نباید برود."));
});

test("ردِ «🏁 تأیید نهایی» از بات با «❌ ردِ بسته» و بی پیام", { skip: SKIP }, async () => {
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "timer", minutes: 10 } })).status, 200);
  assert.equal((await call("/items/41/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/41/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌گستر", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌گستر", phone: "09120000601", label: "فروش", panel: true } })).status, 200);
  assert.equal((await call("/items/41/ai-start", { headers: EX, body: {} })).status, 200);
  const thOf = () => DB.raw.prepare("SELECT x.thread_id FROM ai_threads x JOIN sp_threads t ON t.id=x.thread_id WHERE t.assignment_id=2").get();
  for (let i = 0; i < 8 && !thOf(); i++) {
    DB.raw.prepare("UPDATE ai_runs SET next_at=CASE WHEN assignment_id=2 THEN 0 ELSE 9e15 END").run();
    await aiTick(env);
  }
  const th = thOf().thread_id;
  const H = await supplierSession("09120000601");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "5", valid_days: 10 } })).status, 200);
  const line = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  assert.equal((await call(`/sp/line/${line}`, { method: "PUT", headers: H, body: { qty: 100, price: 9000 } })).status, 200);
  assert.equal((await call(`/sp/line/${line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("رسید، ممنون.");
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.data.state, "pending");
  const f = props(th).find((x) => x.kind === "final" && x.state === "pending");
  assert.ok(f, "تأیید نهایی پیشنهاد شد");
  await tg(`prop:${f.id}:no`);
  await tgText("برند نامعتبر است");
  const flow = DB.raw.prepare("SELECT id, step FROM tg_flows WHERE kind='prop' ORDER BY id DESC LIMIT 1").get();
  assert.equal(flow.step, "need_bact", "سرنوشتِ بسته با دکمه");
  await tg(`pb:${flow.id}:x`);
  await tgText("-");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason, own FROM ai_props WHERE id=?").get(f.id) }, { state: "no", reason: "برند نامعتبر است", own: null });
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).state, "rejected", "بسته رد شد");
  assert.match(sentTexts().pop(), /پیشنهاد رد شد[\s\S]*بسته رد شد/);
});

test("سقفِ ۵ دورِ کارشناس هوشمند: پیامِ بعدیِ تأمین‌کننده بی مدل به کارشناس سپرده می‌شود؛ «🤖 برگرداندن» ۵ دورِ تازه می‌دهد", { skip: SKIP }, async () => {
  const { th, H } = S;
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "auto" } })).status, 200);
  /* بعد از «🚨 اضطراری»ِ آزمونِ پیشین: اول برگرداندن */
  if (DB.raw.prepare("SELECT state FROM ai_threads WHERE thread_id=?").get(th).state === "human") assert.equal((await call(`/sp/x/thread/${th}/handback`, { headers: EX, body: {} })).status, 200);
  DB.raw.prepare("UPDATE ai_threads SET turns=COALESCE(json_extract(ask_json,'$.cap_base'),0)+5 WHERE thread_id=?").run(th);
  let n = 0;
  model = () => { n++; return reply("این پیام نباید برود."); };
  const c0 = calls.length;
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "پیامِ ششم" } })).status, 200);
  assert.equal(n, 0, "مدل صدا زده نشد");
  const x = DB.raw.prepare("SELECT state, ask_json FROM ai_threads WHERE thread_id=?").get(th);
  assert.equal(x.state, "human");
  assert.equal(JSON.parse(x.ask_json).cap.max, 5);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM sp_msgs WHERE thread_id=? AND kind='note' AND body LIKE '%دورش را در این گفت‌وگو زد%'").get(th), "یادداشتِ درونی");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_cap'").get());
  assert.ok(calls.slice(c0).some((c) => c.method === "sendMessage" && /گفت‌وگو به شما سپرده شد/.test(String(c.body.text || ""))), "خبر به کارشناس");
  assert.ok(!msgBy(th, "این پیام نباید برود."));
  /* برگرداندن: سقفِ تازه از همین لحظه */
  assert.equal((await call(`/sp/x/thread/${th}/handback`, { headers: EX, body: {} })).status, 200);
  const y = DB.raw.prepare("SELECT state, turns, ask_json FROM ai_threads WHERE thread_id=?").get(th);
  assert.deepEqual([y.state, JSON.parse(y.ask_json).cap_base], ["active", y.turns]);
  model = () => { n++; return reply("دورِ تازه بعد از برگرداندن."); };
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "پیامِ هفتم" } })).status, 200);
  assert.equal(n, 1, "بعد از برگرداندن، کارشناس هوشمند دوباره پاسخ می‌دهد");
});