/* ============================================================
   «جعبه‌های نقد» و «نظرِ کلی»ِ درخواست (فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف»؛ تصمیم ۷)

   با کلیدِ boxes پنل پشتیبانی:
   «✏️ رد»ِ پیشنهاد (مکاتبات و بات) دست‌کم یک جعبه می‌خواهد ← ستارهٔ ۱ و ۲ دست‌کم یک جعبه، ۳ تا ۵ اختیاری ← «خاتمه» تا
   «نظرِ کلی دربارهٔ کلِ مذاکرهٔ این درخواست» نیامده معلق است ← جعبه‌ها با کد در ai_rates، ai_props و ai_feedback و شمارشِ هر
   کدام در «⭐ ارزیابی ربات». کلید خاموش ← رفتارِ همکار.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import { handleUpdate } from "../../../worker/bot.js";
import * as SP from "../../../worker/sp-core.js";
import { rateGaps } from "../../../worker/ai-rates.js";
import { boxesIn, BOXES } from "../../../worker/critique.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1",
};
const EX = { "X-Expert-Code": "7001" };
const EXPERT_CHAT = "701";

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
const reply = (text) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify({ reply: text, actions: [], thread_status: "active", memo: "یادداشت.", note: "", ask_expert: "" }) }] });
const props = (th) => DB.raw.prepare("SELECT * FROM ai_props WHERE thread_id=? ORDER BY id").all(th);
const pending = (th) => props(th).find((x) => x.kind === "reply" && x.state === "pending");
let cbn = 0;
const tg = (data) => handleUpdate(env, { callback_query: { id: `cb${++cbn}`, data, message: { message_id: 900 + cbn, chat: { id: EXPERT_CHAT }, text: "کارت" } } });
const tgText = (text) => handleUpdate(env, { message: { message_id: 5000 + ++cbn, chat: { id: EXPERT_CHAT, type: "private" }, text } });
const sent = () => calls.filter((c) => c.bot === "tg" && c.method === "sendMessage").map((c) => c.body);
const msgId = (th, body) => (DB.raw.prepare("SELECT id FROM sp_msgs WHERE thread_id=? AND body=?").get(th, body) || {}).id;
let SUP = {};
const S = {};

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?,?)").run(EXPERT_CHAT, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-B','1405/07/22','پروژهٔ نقد')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-B',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (31,'R-B','a',1,'پیچ M10',400,'عدد','open',1,?)")
    .run(JSON.stringify({ v: 2, head: "پیچ", layers: {}, source: "catalog" }));
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("فهرستِ جعبه‌ها و سنجشِ ورودی (بی پایگاه داده)", () => {
  assert.equal(BOXES.length, 9);
  assert.deepEqual(BOXES.map((b) => b.stage).filter((x, i, a) => a.indexOf(x) === i), ["فهم", "تصمیم", "بیان", "حفاظت", "فرایند"]);
  assert.deepEqual(boxesIn(["leak", "tone", "leak"]), ["tone", "leak"], "یکتا و به ترتیبِ فهرست");
  assert.deepEqual(boxesIn("tone,move"), ["move", "tone"]);
  assert.throws(() => boxesIn(["x"]), (e) => e.status === 422);
  assert.throws(() => boxesIn([], { need: true }), (e) => e.status === 422 && e.extra.need_boxes);
  assert.deepEqual(boxesIn(["s_market"], { strategy: true }), ["s_market"]);
});

test("«✏️ رد» در مکاتبات: با کلیدِ boxes دست‌کم یک جعبه؛ جعبه‌ها در پیشنهاد و بایگانی", { skip: SKIP }, async () => {
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { boxes: true } })).status, 200);
  assert.equal((await call("/items/31/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/31/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000801", label: "فروش", panel: true } })).status, 200);
  assert.equal((await call("/items/31/ai-start", { headers: EX, body: {} })).status, 200);
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = S.th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const ph = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000801'").get();
  const H = S.H = { "X-SP-Session": await SP.newSession(env, ph.id, "web") };
  model = () => reply("سلام؛ ممنون از پاسخ‌تان.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سلام، قیمت را فردا می‌دهم." } })).status, 200);
  const p = pending(th);
  assert.ok(p, "پاسخِ مدل پیشنهاد شد (با مهلتِ پیش‌فرض)");
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.deepEqual(v.data.critique.map((b) => b.code), BOXES.map((b) => b.code), "فهرستِ جعبه‌ها برای صفحه");
  const noBox = await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "no", reason: "لحنش خشک است", text: "سلام، ممنون؛ منتظریم." } });
  assert.equal(noBox.status, 422);
  assert.equal(noBox.data.need_boxes, true);
  assert.equal((await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "no", reason: "لحنش خشک است", text: "سلام، ممنون؛ منتظریم.", boxes: ["بی‌ربط"] } })).status, 422);
  const ok = await call(`/sp/x/prop/${p.id}`, { headers: EX, body: { action: "no", reason: "لحنش خشک است", text: "سلام، ممنون؛ منتظریم.", boxes: ["tone"] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT boxes FROM ai_props WHERE id=?").get(p.id).boxes), ["tone"]);
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT boxes FROM ai_feedback WHERE kind='prop' AND ref=?").get(p.id).boxes), ["tone"]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM ai_log WHERE kind='prop' AND body LIKE '%جعبه‌ها: لحن و روشنی%'").get());
});

test("بات: پس از علت، دکمه‌های جعبه؛ بعد پیامِ خودِ کارشناس", { skip: SKIP }, async () => {
  const { th, H } = S;
  model = () => reply("قیمتِ نهایی را بفرمایید؛ ما عجله داریم.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "موجودی داریم." } })).status, 200);
  const p = pending(th);
  await tg(`prop:${p.id}:no`);
  await tgText("فوریت را لو داد");
  const ask = sent().pop();
  assert.match(ask.text, /کدام جزءِ کارِ کارشناس هوشمند درست نبود/);
  const kb = ask.reply_markup.inline_keyboard.flat();
  assert.equal(kb.length, 9);
  const leak = kb.find((b) => b.text === "محرمانگی");
  assert.match(leak.callback_data, /^pbx:\d+:leak$/);
  await tgText("این نباید جعبه شود");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(p.id).state, "pending", "تا جعبه زده نشده، معطل");
  await tg(leak.callback_data);
  assert.match(sent().pop().text, /پیامِ تازهٔ خودتان را برای تأمین‌کننده بنویسید/);
  await tgText("لطفاً قیمتِ نهایی را بفرمایید، ممنون.");
  assert.deepEqual({ ...DB.raw.prepare("SELECT state, reason, boxes FROM ai_props WHERE id=?").get(p.id) }, { state: "no", reason: "فوریت را لو داد", boxes: '["leak"]' });
});

test("ستارهٔ پیام: ۱ و ۲ دست‌کم یک جعبه، ۳ تا ۵ اختیاری؛ جعبه‌ها در امتیازهای گفت‌وگو", { skip: SKIP }, async () => {
  const { th, H } = S;
  model = () => reply("چشم، منتظرِ پیش‌فاکتور هستیم.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "پیش‌فاکتور را می‌فرستم." } })).status, 200);
  assert.equal((await call(`/sp/x/prop/${pending(th).id}`, { headers: EX, body: { action: "ok" } })).status, 200);
  const mid = msgId(th, "چشم، منتظرِ پیش‌فاکتور هستیم.");
  assert.ok(mid);
  const r1 = await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: mid, stars: 2, note: "زود پذیرفت" } });
  assert.equal(r1.status, 422);
  assert.equal(r1.data.need_boxes, true);
  const r2 = await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: mid, stars: 2, note: "زود پذیرفت", boxes: ["move", "tone"] } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  assert.deepEqual(r2.data.boxes, ["move", "tone"]);
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.deepEqual(v.data.rates.msgs[mid].boxes, ["move", "tone"]);
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: mid, stars: 4 } })).status, 200, "چهار ستاره بی جعبه");
  assert.equal(DB.raw.prepare("SELECT boxes FROM ai_rates WHERE kind='msg' AND ref=?").get(mid).boxes, null, "امتیازِ تازه جای قبلی");
  assert.equal(DB.raw.prepare("SELECT boxes FROM ai_feedback WHERE kind='msg' AND ref=?").get(mid).boxes, null);
});

test("«خاتمه»: «نظرِ کلی»ِ درخواست کوتاه و اجباری؛ بایگانی با گفت‌وگوها؛ شمارشِ جعبه‌ها در «⭐ ارزیابی ربات»", { skip: SKIP }, async () => {
  const g = await rateGaps(env, 1);
  assert.equal(g.request, true);
  const d = await call("/assignments/1", { headers: EX });
  assert.equal(d.data.ai.rates.request, true);
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "request", assignment_id: 1, stars: 4 } })).status, 422, "بی نظر نه");
  const ok = await call("/sp/x/rate", { headers: EX, body: { kind: "request", assignment_id: 1, stars: 4, note: "در کل خوب بود؛ فقط زود پذیرفت.", boxes: ["pace"] } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.gaps.request, false);
  const fb = DB.raw.prepare("SELECT request_id, context_json FROM ai_feedback WHERE kind='request' AND ref=1").get();
  assert.equal(fb.request_id, "R-B");
  assert.equal(JSON.parse(fb.context_json).threads[0].supplier, "پیچ‌سازان");
  /* «⭐ ارزیابی ربات» */
  const st = await call("/support/ai/feedback?win=30d", { headers: SUP });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  const n = Object.fromEntries(st.data.boxes.list.map((b) => [b.code, b.n]));
  assert.deepEqual([n.tone, n.leak, n.pace, n.move], [1, 1, 1, 0], "ردِ مکاتبات، ردِ بات و «نظرِ کلی»؛ امتیازِ دوبارهٔ پیام جعبه‌هایش را برداشت");
  assert.deepEqual(st.data.boxes.list.slice(0, 3).map((b) => b.code), ["tone", "leak", "pace"], "پرتکرارترین‌ها اول، به ترتیبِ روال");
  const only = await call("/support/ai/feedback?win=30d&box=leak", { headers: SUP });
  assert.ok(only.data.items.length >= 1 && only.data.items.every((x) => x.boxes.includes("leak")));
  const csv = await route(new Request("https://site.test/tamin-poshtibani/api/support/ai/feedback/export?win=30d&format=csv", { headers: SUP }), env, ctx);
  assert.match(await csv.text(), /جعبه‌های نقد[\s\S]*لحن و روشنی/);
});

test("کلید خاموش: رفتارِ همکار — ستارهٔ کم بی جعبه، رد بی جعبه، بی «نظرِ کلی»", { skip: SKIP }, async () => {
  const { th, H } = S;
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { boxes: false } })).status, 200);
  const mid = msgId(th, "چشم، منتظرِ پیش‌فاکتور هستیم.");
  assert.equal((await call("/sp/x/rate", { headers: EX, body: { kind: "msg", msg_id: mid, stars: 1, note: "اشتباه بود" } })).status, 200);
  model = () => reply("پیامِ تازه.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "سلام دوباره" } })).status, 200);
  assert.equal((await call(`/sp/x/prop/${pending(th).id}`, { headers: EX, body: { action: "no", reason: "زود است", text: "صبر کنید، ممنون." } })).status, 200);
  assert.equal((await rateGaps(env, 1)).request, false);
  assert.equal((await call(`/sp/thread/${th}`, { headers: EX })).data.critique, undefined);
});
