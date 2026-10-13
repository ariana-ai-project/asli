/* ============================================================
   «⏸ بی‌مهلت» (فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف»؛ تصمیم ۵)

   کنارِ «⏱ با مهلت» و «🤖 خودکار»ِ همکار، حالتِ سوم: پیشنهادِ کارشناس هوشمند بی due_at — تا «✅ ارسال» یا «✏️ رد»ِ کارشناس
   نمی‌رود. با کلیدِ hold، «حالت کار»ِ نوع قلم (دادهٔ تحقیق یا تغییرِ پشتیبانی) کفِ حالت است و سخت‌گیرترینِ دو تا اجرا می‌شود:
   «کارشناس‌محور» همیشه بی‌مهلت، «ترکیبی» دست‌کم با مهلت، «کاملاً هوش مصنوعی» بی کف. کلید خاموش ← رفتارِ امروز.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick, propsDue } from "../../../worker/ai-agent.js";
import * as SP from "../../../worker/sp-core.js";
import { supCfg, supEffective, supOfThread, WORKFLOW_SUP, SUP_RANK } from "../../../worker/ai-supervise.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test", TG_IGNORE_HOURS: "1",
};
const EX = { "X-Expert-Code": "7001" };
const EXPERT_CHAT = "701";
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

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
const outbox = (re) => DB.raw.prepare("SELECT payload_json FROM outbox WHERE target=? ORDER BY id").all(EXPERT_CHAT).map((r) => JSON.parse(r.payload_json)).filter((p) => !re || re.test(p.text));
const msgBy = (th, body) => DB.raw.prepare("SELECT who, meta_json FROM sp_msgs WHERE thread_id=? AND body=?").get(th, body);
let SUP = {};
const S = {};

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,?,?)").run(EXPERT_CHAT, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-H','1405/07/21','پروژهٔ پیچ')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-H',1,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (31,'R-H','a',1,'پیچ M10',400,'عدد','open',1,?)").run(norm("پیچ"));
  const head = DB.raw.prepare("INSERT INTO cr_heads (head,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,rec,version,imported_at) VALUES (?,'BROAD','BROAD',5,6,'A',?,'{}','2.0',?)");
  head.run("پیچ", "کارشناس‌محور", t);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("کفِ «حالت کار» و سخت‌گیرترینِ دو تا (بی پایگاه داده)", () => {
  assert.deepEqual(supCfg({ mode: "hold", minutes: 7 }), { mode: "hold", minutes: 7 });
  assert.deepEqual([WORKFLOW_SUP["کارشناس‌محور"], WORKFLOW_SUP["ترکیبی"], WORKFLOW_SUP["کاملاً هوش مصنوعی"], WORKFLOW_SUP["کاملاً هوش مصنوعی (با شرط تحویل)"]], ["hold", "timer", "auto", "auto"]);
  assert.ok(SUP_RANK.hold > SUP_RANK.timer && SUP_RANK.timer > SUP_RANK.auto);
  const c = (mode) => ({ mode, minutes: 10 });
  assert.equal(supEffective(c("auto"), { mode: "hold" }, true), "hold", "کارشناس‌محور هیچ‌وقت خودکار نمی‌رود");
  assert.equal(supEffective(c("auto"), { mode: "timer" }, true), "timer", "ترکیبی دست‌کم با مهلت");
  assert.equal(supEffective(c("hold"), { mode: "timer" }, true), "hold", "تنظیمِ سخت‌ترِ کارشناس می‌ماند");
  assert.equal(supEffective(c("auto"), null, true), "auto");
  assert.equal(supEffective(c("hold"), null, false), "timer", "کلید خاموش: بی‌مهلتِ ذخیره‌شده همان با مهلت");
  assert.equal(supEffective(c("auto"), { mode: "hold" }, false), "auto", "کلید خاموش: کفِ نوع قلم بی اثر");
});

test("کلیدِ hold: «⏸ بی‌مهلت» در «حساب من» فقط با کلید", { skip: SKIP }, async () => {
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "hold" } })).status, 422, "کلید خاموش");
  assert.equal((await call("/me/supervise", { headers: EX })).data.hold_ok, false);
  assert.equal((await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "auto" } })).status, 200);
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { hold: true } })).status, 200);
  const g = await call("/me/supervise", { headers: EX });
  assert.equal(g.data.hold_ok, true);
  assert.equal(g.data.fa.hold, "⏸ بی‌مهلت");
});

test("نوع قلمِ «کارشناس‌محور» با کارشناسِ «🤖 خودکار»: تأیید نهایی و پاسخ بی مهلت پیشنهاد می‌شوند و Cron نمی‌فرستد", { skip: SKIP }, async () => {
  assert.equal((await call("/items/31/picks", { headers: EX })).status, 200);
  assert.equal((await call("/items/31/picks", { method: "PUT", headers: EX, body: { add: [{ name: "پیچ‌سازان", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: EX, body: { supplier_name: "پیچ‌سازان", phone: "09120000701", label: "فروش", panel: true } })).status, 200);
  assert.equal((await call("/items/31/ai-start", { headers: EX, body: {} })).status, 200);
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = S.th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const s0 = await supOfThread(env, th);
  assert.deepEqual([s0.on, s0.hold, s0.mode, s0.floor && s0.floor.head], [true, true, "hold", "پیچ"]);
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000701'").get();
  const H = S.H = { "X-SP-Session": await SP.newSession(env, p.id, "web") };
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 10 } })).status, 200);
  const line = (await call(`/sp/thread/${th}`, { headers: H })).data.lines[0].id;
  assert.equal((await call(`/sp/line/${line}`, { method: "PUT", headers: H, body: { qty: 400, price: 4200 } })).status, 200);
  assert.equal((await call(`/sp/line/${line}/ready`, { headers: H, body: { on: true } })).status, 200);
  model = () => reply("سلام؛ پیشنهادتون رسید و بررسی می‌کنیم.");
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending", "تأیید نهایی پیشنهاد شد، نه اجرا");
  const P = props(th);
  assert.deepEqual(P.map((x) => [x.kind, x.state, x.due_at]), [["final", "pending", null], ["reply", "pending", null]], "بی مهلت");
  const cards = outbox(/کارشناس هوشمند می‌خواهد این را بفرستد/);
  assert.equal(cards.length, 2);
  assert.ok(cards.every((c) => /⏸ <b>بی‌مهلت: تا «✅ ارسال» یا «✏️ رد»ِ شما نمی‌رود\.<\/b>/.test(c.text) && /نوع قلمِ «پیچ» «کارشناس‌محور» است/.test(c.text) && !/خودکار می‌رود/.test(c.text)));
  /* صفحهٔ مکاتبات: بی‌مهلت با علتش */
  const v = await call(`/sp/thread/${th}`, { headers: EX });
  assert.equal(v.data.thread.ai.watch, true);
  assert.deepEqual([v.data.watch.hold, v.data.watch.mode, v.data.watch.floor.workflow], [true, "hold", "کارشناس‌محور"]);
  assert.equal(v.data.watch.pending[1].due_at, null);
  /* Cron و «سرِ مهلت» نمی‌فرستند؛ «رد» مهلت نمی‌سازد */
  DB.raw.prepare("UPDATE ai_props SET created_at=created_at-86400000 WHERE thread_id=?").run(th);
  assert.equal(await propsDue(env), 0);
  assert.equal((await call(`/sp/x/prop/${P[1].id}`, { headers: EX, body: { action: "due" } })).status, 409);
  const hold = await call(`/sp/x/prop/${P[1].id}`, { headers: EX, body: { action: "hold" } });
  assert.deepEqual([hold.status, hold.data.due_at ?? null, DB.raw.prepare("SELECT due_at FROM ai_props WHERE id=?").get(P[1].id).due_at], [200, null, null]);
  assert.ok(!msgBy(th, "سلام؛ پیشنهادتون رسید و بررسی می‌کنیم."), "نرفت");
  /* «✅ ارسال» همان لحظه */
  const ok = await call(`/sp/x/prop/${P[1].id}`, { headers: EX, body: { action: "ok" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(msgBy(th, "سلام؛ پیشنهادتون رسید و بررسی می‌کنیم."));
});

test("تغییرِ تنظیم و «حالت کار»: «خودکار» معطلِ کارشناس‌محور را نمی‌فرستد؛ پشتیبانی «ترکیبی» کند ← با مهلت؛ کلید خاموش ← رفتارِ امروز", { skip: SKIP }, async () => {
  const { th, H } = S;
  const fin = props(th).find((x) => x.kind === "final" && x.state === "pending");
  assert.ok(fin);
  const r = await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "auto" } });
  assert.deepEqual([r.status, r.data.sent], [200, 0], "کفِ نوع قلم: نرفت");
  assert.equal(DB.raw.prepare("SELECT due_at FROM ai_props WHERE id=?").get(fin.id).due_at, null);
  /* پشتیبانی «حالت کار» را «ترکیبی» می‌کند (با دلیل) ← پیشنهادِ تازه با مهلتِ کارشناس */
  assert.equal((await call(`/support/strategy/heads/${encodeURIComponent("پیچ")}`, { method: "PUT", headers: SUP, body: { workflow: "ترکیبی" } })).status, 422, "بی دلیل نه");
  assert.equal((await call(`/support/strategy/heads/${encodeURIComponent("پیچ")}`, { method: "PUT", headers: SUP, body: { workflow: "بی‌ربط", reason: "آزمون" } })).status, 422);
  assert.equal((await call(`/support/strategy/heads/${encodeURIComponent("پیچ")}`, { method: "PUT", headers: SUP, body: { workflow: "ترکیبی", reason: "بازارِ پیچ ساده است" } })).status, 200);
  const hl = await call(`/support/strategy/heads?q=${encodeURIComponent("پیچ")}`, { headers: SUP });
  assert.deepEqual([hl.data.list[0].wf_over.value, hl.data.list[0].wf_over.reason], ["ترکیبی", "بازارِ پیچ ساده است"]);
  assert.ok(hl.data.workflows.some((w) => w.key === "کارشناس‌محور" && w.sup === "hold"));
  const s1 = await supOfThread(env, th);
  assert.deepEqual([s1.on, s1.hold, s1.mode], [true, false, "timer"], "خودکارِ کارشناس + ترکیبی = با مهلت");
  model = () => reply("یک سؤالِ کوچک دارم.");
  assert.equal((await call(`/sp/thread/${th}/msg`, { headers: H, body: { text: "قیمت با حمل است." } })).status, 200);
  const q = props(th).find((x) => x.kind === "reply" && x.state === "pending");
  assert.ok(q && q.due_at - q.created_at === 10 * 60000, "مهلتِ کارشناس (۱۰ دقیقه)");
  /* «سرِ مهلت» حالا می‌فرستد */
  DB.raw.prepare("UPDATE ai_props SET due_at=? WHERE id=?").run(Date.now() - 1000, q.id);
  assert.equal(await propsDue(env), 1);
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(q.id).state, "auto");
  /* برگشت به دادهٔ تحقیق ← دوباره بی‌مهلت؛ کلید خاموش ← «خودکار»ِ کارشناس همان لحظه می‌فرستد */
  assert.equal((await call(`/support/strategy/heads/${encodeURIComponent("پیچ")}`, { method: "PUT", headers: SUP, body: { clear: ["workflow"], reason: "برگشت" } })).status, 200);
  assert.equal((await supOfThread(env, th)).mode, "hold");
  assert.equal((await call("/support/cr/flags", { method: "PUT", headers: SUP, body: { hold: false } })).status, 200);
  assert.equal((await supOfThread(env, th)).on, false, "کلید خاموش: «خودکار»ِ کارشناس");
  const r2 = await call("/me/supervise", { method: "PUT", headers: EX, body: { mode: "auto" } });
  assert.equal(r2.data.sent, 1, "معطلِ تأیید نهایی رفت");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_props WHERE id=?").get(fin.id).state, "auto");
});
