/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۴ب، گام ۳ (مهر ۱۴۰۵): «📋 شرایط خرید»ِ هر قلم و تصمیمِ بسته بی مدل

   روی SQLite واقعی (همان طرحِ ensureSchema)، با تلگرام، انبار و مدلِ بدلی:
   کارشناس برای هر قلم گزینه‌های تسویه، نوع فاکتور و ارزش افزوده و بازهٔ تحویل را 🔒/🔓 می‌گذارد ← با اولین ارسال ثابت ←
   پنلِ تأمین‌کننده بیرون از 🔒 نمی‌پذیرد (ثبتِ شرایط، «آمادهٔ ارسال»، «ارسال»)، اقلامِ ناسازگار جدا ← گفت‌وگوی کارشناسِ انسانی
   «در انتظار» می‌ماند ← در کارِ کارشناس هوشمند بستهٔ ارسالی همان لحظه تأیید نهایی می‌شود و مدل فقط گفت‌وگو می‌کند ←
   «✏️ اصلاحِ پیشنهاد»: بستهٔ تازه جای خطِ استعلامِ قبلی را می‌گیرد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";
import * as SP from "../../../worker/sp-core.js";
import { cleanLimits, combineLocks, dtimeDate, violations, limitsTxt } from "../../../worker/terms-locks.js";
import { jStr2ms } from "../../../worker/time.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const AI = { "X-Expert-Code": "7001" }, HU = { "X-Expert-Code": "7002" };
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?), (2,'انسانی','انسانی','7002',1,1,'702',?)").run(t, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-H','1405/07/15','پروژهٔ برق'), ('R-A','1405/07/15','پروژهٔ پیچ')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-H',2,5,?,?,?), (2,'R-A',1,5,?,?,?)").run(t, t + 9e8, t, t, t + 9e8, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(11, "R-H", "a", 1, "کابل ۴ در ۲٫۵", 100, "متر", 1, norm("کابل"));
  ins.run(12, "R-H", "b", 2, "سیم ۱٫۵", 200, "متر", 1, norm("سیم"));
  ins.run(13, "R-H", "c", 3, "فیوز مینیاتوری", 30, "عدد", 1, norm("فیوز"));
  ins.run(21, "R-A", "a", 1, "پیچ M8", 500, "عدد", 2, norm("پیچ"));
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method });
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
const terms = (id, body, headers = HU) => call(`/items/${id}/terms`, { method: "PUT", headers, body });
/** نشستِ تأمین‌کننده برای همین شماره (بی رمزِ پیامک) */
async function supplierSession(phone) {
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone=?").get(phone);
  return { "X-SP-Session": await SP.newSession(env, p.id, "web") };
}
const threadOf = (aid, name) => DB.raw.prepare("SELECT t.id FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id WHERE t.assignment_id=? AND s.name=?").get(aid, name).id;
async function fill(th, H, prices) {
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  for (const l of d.lines) {
    const pr = prices[l.item_id];
    if (pr == null) continue;
    const r = await call(`/sp/line/${l.id}`, { method: "PUT", headers: H, body: { qty: l.req_qty, price: pr } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return d;
}
const S = {};

test("قیدِ شرایط (بی پایگاه داده): پاک‌سازی، اشتراکِ چند قلم و ناسازگاری، روزِ تحویل از «شمار روز»، تخلف", () => {
  assert.throws(() => cleanLimits({ pay: { opts: ["چک"] } }), (e) => e.status === 422 && e.extra.field === "pay");
  assert.throws(() => cleanLimits({ dtime: { from: "1405/09/01", to: "1405/08/01" } }), (e) => e.status === 422, "«از» بعد از «تا»");
  assert.throws(() => cleanLimits({ dtime: { to: "1405/07/31" } }), (e) => e.status === 422, "روزِ نبوده");
  assert.equal(cleanLimits({ pay: { opts: [] } }), null, "بی گزینه یعنی بی قید");
  const A = cleanLimits({ pay: { opts: ["اعتباری", "نقدی"], lock: true }, dtime: { to: "۱۴۰۵/۰۸/۲۰", lock: true } });
  assert.deepEqual(A, { pay: { opts: ["نقدی", "اعتباری"], lock: true }, dtime: { to: "1405/08/20", lock: true } }, "ترتیبِ فهرستِ سامانه، رقمِ لاتین");
  const B = cleanLimits({ pay: { opts: ["نقدی"], lock: true }, vat: { opts: ["دارد"], lock: false }, dtime: { from: "1405/08/01", to: "1405/08/25", lock: true } });
  const c = combineLocks([A, B]);
  assert.deepEqual(c, { lock: { pay: ["نقدی"], dtime: { from: "1405/08/01", to: "1405/08/20" } }, conflict: [] }, "🔓 در قید نیست");
  const D = cleanLimits({ pay: { opts: ["اعتباری"], lock: true } });
  assert.deepEqual(combineLocks([B, D]).conflict, ["pay"]);
  /* پنجشنبه ۱۴۰۵/۰۷/۱۶ ظهر: «۲ روز کاری» = شنبه (جمعه نه) */
  const at = jStr2ms("1405/07/16") + 12 * 3600000;
  assert.equal(dtimeDate("2 روز کاری", at), "1405/07/18");
  assert.equal(dtimeDate("۱۰", at), "1405/07/26");
  assert.equal(dtimeDate("2 هفته", at), "1405/07/30");
  assert.equal(dtimeDate("1405/8/1", at), "1405/08/01");
  assert.equal(dtimeDate("فوری", at), null);
  assert.deepEqual(violations({ pay: "نقدی", dtime: "1405/08/10" }, c.lock), []);
  assert.deepEqual(violations({ pay: "اعتباری", dtime: "1405/08/22" }, c.lock).map((x) => x.field), ["pay", "dtime"]);
  assert.match(limitsTxt(B), /شرایط تسویه 🔒 «نقدی» · ارزش افزوده 🔓 «دارد» · زمان تحویل 🔒 بین/);
});

test("کارشناس شرایطِ هر قلم را 🔒/🔓 می‌گذارد؛ نادرست ۴۲۲، کارشناسِ دیگر ۴۰۳؛ بعد از اولین ارسال ثابت", { skip: SKIP }, async () => {
  assert.equal((await terms(11, { pay: { opts: ["چک"], lock: true } })).status, 422);
  assert.equal((await terms(11, { pay: { opts: ["نقدی"], lock: true } }, AI)).status, 403, "قلمِ کارشناسِ دیگر");
  let r = await terms(11, { pay: { opts: ["نقدی", "اعتباری"], lock: true }, dtime: { to: "1499/12/29", lock: true } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.text, /شرایط تسویه 🔒 «نقدی» یا «اعتباری»/);
  assert.equal((await terms(12, { pay: { opts: ["نقدی"], lock: true }, vat: { opts: ["دارد"], lock: true }, invoice: { opts: ["رسمی"], lock: false } })).status, 200);
  assert.equal((await terms(13, { pay: { opts: ["اعتباری"], lock: true } })).status, 200);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='item_terms' AND item_id=11").get(), "رخداد برای پشتیبانی");
  const d = (await call("/assignments/1", { headers: HU })).data;
  assert.deepEqual(JSON.parse(d.items.find((i) => i.id === 12).terms_json).vat, { opts: ["دارد"], lock: true });
  /* اولین ارسال: کابل و سیم به یک تأمین‌کننده */
  const s1 = await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [11, 12], supplier_name: "تأمین برق", phone: "09120000301", label: "فروش" } });
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
  const lk = await terms(11, { pay: { opts: ["نقدی"], lock: true } });
  assert.equal(lk.status, 409, "شرایطِ قلمِ فرستاده‌شده هم ثابت است");
  assert.equal(lk.data.locked, true);
});

test("پنلِ تأمین‌کننده: بیرون از 🔒 نه، 🔓 آزاد؛ گفت‌وگوی کارشناسِ انسانی «در انتظار» می‌ماند و اصلاح ندارد", { skip: SKIP }, async () => {
  const th = threadOf(1, "تأمین برق");
  const H = await supplierSession("09120000301");
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.deepEqual(d.terms_lock, { lock: { pay: ["نقدی"], vat: ["دارد"], dtime: { to: "1499/12/29" } }, conflict: [] }, "اشتراکِ 🔒ِ دو قلم");
  assert.equal(d.lines.find((l) => l.item_id === 12).limits.invoice.lock, false, "🔓 فقط خواسته است");
  assert.equal(d.revise, false);
  let r = await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "اعتباری" } });
  assert.equal(r.status, 422, "کابل اعتباری را می‌پذیرد ولی سیم نه");
  assert.match(r.data.error, /شرایط تسویه فقط «نقدی»/);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { vat: "ندارد" } })).status, 422);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { dtime: "1500/01/01" } })).status, 422, "تحویلِ بیرون از بازه");
  r = await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "غیر رسمی", dtime: "10 روز کاری", valid_days: 7 } });
  assert.equal(r.status, 200, "«غیر رسمی» با فاکتورِ 🔓 پذیرفته است");
  await fill(th, H, { 11: 450000, 12: 120000 });
  for (const l of d.lines) assert.equal((await call(`/sp/line/${l.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "pending", "تصمیمِ گفت‌وگوی کارشناسِ انسانی با خودش است");
  const fin = DB.raw.prepare("SELECT id FROM sp_lines WHERE thread_id=? LIMIT 1").get(th);
  assert.equal((await call(`/sp/line/${fin.id}/revise`, { headers: H, body: {} })).status, 409, "«✏️ اصلاح» فقط برای تأییدنهاییِ کارِ کارشناس هوشمند");
});

test("اقلامِ ناسازگار: ثبتِ شرایط آزاد، «آمادهٔ ارسال» و «ارسال» با قیدِ همان اقلام — جدا فرستاده می‌شوند", { skip: SKIP }, async () => {
  const s2 = await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [12, 13], supplier_name: "برق دوم", phone: "09120000302", label: "فروش" } });
  assert.equal(s2.status, 200, JSON.stringify(s2.data));
  const th = threadOf(1, "برق دوم");
  const H = await supplierSession("09120000302");
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.deepEqual(d.terms_lock.conflict, ["pay"], "سیم فقط نقدی، فیوز فقط اعتباری");
  const L12 = d.lines.find((l) => l.item_id === 12), L13 = d.lines.find((l) => l.item_id === 13);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "1405/09/01", valid_days: 5 } })).status, 200, "ناسازگار: این‌جا آزاد");
  await fill(th, H, { 12: 118000, 13: 95000 });
  assert.equal((await call(`/sp/line/${L12.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const r13 = await call(`/sp/line/${L13.id}/ready`, { headers: H, body: { on: true } });
  assert.equal(r13.status, 422, "فیوز با تسویهٔ نقدی آماده نمی‌شود");
  assert.match(r13.data.error, /فیوز مینیاتوری[\s\S]*اعتباری/);
  /* تسویه به اعتباری: فیوز آماده می‌شود، ولی دو قلم با هم نه */
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "اعتباری" } })).status, 200);
  assert.equal((await call(`/sp/line/${L13.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const both = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(both.status, 422);
  assert.match(both.data.error, /ناسازگار/);
  assert.equal((await call(`/sp/thread/${th}/submit`, { headers: H, body: { line_ids: [L12.id] } })).status, 422, "سیم با تسویهٔ اعتباری نه");
  const one = await call(`/sp/thread/${th}/submit`, { headers: H, body: { line_ids: [L13.id] } });
  assert.equal(one.status, 200, JSON.stringify(one.data));
});

test("کارِ کارشناس هوشمند: بستهٔ ارسالی همان لحظه تأیید نهایی — بی مدل؛ «✏️ اصلاحِ پیشنهاد» و بستهٔ تازه جای خطِ قبلی", { skip: SKIP }, async () => {
  assert.equal((await terms(21, { pay: { opts: ["نقدی"], lock: true }, dtime: { to: "1499/12/29", lock: true } }, AI)).status, 200);
  assert.equal((await call("/items/21/picks", { headers: AI })).status, 200);
  assert.equal((await call("/items/21/picks", { method: "PUT", headers: AI, body: { add: [{ name: "فروشگاه پیچ", src: "manual" }] } })).status, 200);
  assert.equal((await call("/sp/x/phones", { headers: AI, body: { supplier_name: "فروشگاه پیچ", phone: "09120000401", label: "فروش", panel: true } })).status, 200);
  const st = await call("/items/21/ai-start", { headers: AI, body: {} });
  assert.equal(st.status, 200, JSON.stringify(st.data));
  assert.equal((await terms(21, { pay: { opts: ["اعتباری"], lock: true } }, AI)).status, 409, "قلمِ سپرده‌شده منجمد است");
  for (let i = 0; i < 8 && !DB.raw.prepare("SELECT 1 AS x FROM ai_threads").get(); i++) { DB.raw.prepare("UPDATE ai_runs SET next_at=0").run(); await aiTick(env); }
  const th = DB.raw.prepare("SELECT thread_id FROM ai_threads").get().thread_id;
  const H = await supplierSession("09120000401");
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "اعتباری" } })).status, 422);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "7", valid_days: 10 } })).status, 200);
  const d = await fill(th, H, { 21: 3500 });
  const line = d.lines[0];
  assert.equal((await call(`/sp/line/${line.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  /* گامِ فوری فقط گفت‌وگوست: کارِ مدل روی بسته اجرا نمی‌شود */
  let seen = null;
  model = (b) => { seen = b; return jsonOut({ reply: "ممنون 🌷 اگه با همین تسویهٔ نقدی تخفیفی ممکنه، «✏️ اصلاحِ پیشنهاد» رو بزنید.", actions: [{ type: "reject", bundle_id: 1, comment: "", rows: [] }],
    thread_status: "active", memo: "یک بار تخفیف خواستم.", note: "", ask_expert: "" }); };
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  assert.equal(sub.data.state, "final", "همان لحظه تأیید نهایی");
  const q1 = DB.raw.prepare("SELECT price, saved, final FROM quotes WHERE assignment_id=2 AND item_id=21 AND supplier_name='فروشگاه پیچ'").get();
  assert.deepEqual([q1.price, q1.saved, q1.final], [3500, 1, 1]);
  assert.ok(seen, "مدل فقط برای گفت‌وگو صدا زده شد");
  assert.match(seen.messages[0].content[0].text, /شرایطِ شرکت برای این قلم: شرایط تسویه 🔒 «نقدی»/);
  assert.match(seen.messages[0].content[0].text, /کارهای ممکن: هیچ — تصمیمِ بسته با سامانه است/);
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(sub.data.bundle_id).state, "final", "ردِ مدل اجرا نشد");
  /* اصلاحِ پیشنهاد: قیمتِ تازه، بستهٔ تازه همان لحظه نهایی و جای خطِ قبلی */
  const d2 = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.equal(d2.revise, true);
  const rv = await call(`/sp/line/${line.id}/revise`, { headers: H, body: {} });
  assert.equal(rv.status, 200, JSON.stringify(rv.data));
  assert.equal(DB.raw.prepare("SELECT state FROM sp_lines WHERE id=?").get(line.id).state, "draft");
  assert.equal(DB.raw.prepare("SELECT price FROM quotes WHERE assignment_id=2 AND item_id=21").get().price, 3500, "پیشنهادِ قبلی تا ارسالِ تازه سرِ جایش است");
  assert.equal((await call(`/sp/line/${line.id}`, { method: "PUT", headers: H, body: { price: 3200 } })).status, 200);
  assert.equal((await call(`/sp/line/${line.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub2 = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub2.data.state, "final");
  const q2 = DB.raw.prepare("SELECT COUNT(*) AS n, MAX(price) AS price FROM quotes WHERE assignment_id=2 AND item_id=21").get();
  assert.deepEqual([q2.n, q2.price], [1, 3200], "بستهٔ تازه جای خطِ قبلی");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_bundles WHERE thread_id=? AND state='final'").get(th).n, 2);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_log WHERE kind='decide'").get().n, 2, "هر دو تصمیم با سامانه");
  assert.ok(!calls.some((c) => c.bot === "ai" && /proforma|record_check/.test(JSON.stringify(c.body.tools || ""))), "سندی خوانده نشد");
});
