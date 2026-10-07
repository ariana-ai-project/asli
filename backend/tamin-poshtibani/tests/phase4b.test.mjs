/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۴ب، گام ۱ (مهر ۱۴۰۵): حالتِ هر نوع قلم، تیکِ «🤖 هوشمند»ِ مدیر و «انجام دستی»

   روی SQLite واقعی (همان طرحِ ensureSchema)، با تلگرامِ بدلی:
   حالتِ نوع قلم در پنل پشتیبانی (سپردن یا برگشت / انتخاب کارشناس / مستقیم، و «حالت تأیید مجاز») ← تیکِ مدیر فقط برای کارشناسِ
   هوشمند، برداشتنش با توضیح مگر همهٔ اقلام «مستقیم» باشند ← درخواستِ دستیِ مدیر برای کارشناس قفل ندارد و سپرده نمی‌شود ←
   قلمِ «مستقیم» پیش از سپردن آزاد است ← «انجام دستی» با علت، تأیید و ردِ مدیر ← سپردن فقط اقلامِ هوشمند، و قلمِ «مستقیم» با تیکِ
   خودِ کارشناس.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { modeOf, getModes, resetModesCache } from "../../../worker/ai-modes.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
};
const EX = { "X-Expert-Code": "7001" }, EX2 = { "X-Expert-Code": "7002" }, MGR = { "X-Manager-Code": "1234" };
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'هوشمند','هوشمند','7001',1,1,'701',?), (2,'دستی','دستی','7002',1,1,'702',?)").run(t, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 1000, t);
  DB.raw.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat','\"900\"',?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-B','1405/07/15','پروژهٔ ب'), ('R-C','1405/07/15','پروژهٔ ج'), ('R-D','1405/07/15','پروژهٔ د')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-B',1,5,?,?,?), (2,'R-C',2,5,?,?,?), (3,'R-D',1,5,?,?,?)")
    .run(t, t + 5 * 86400000, t, t, t + 5 * 86400000, t, t, t + 5 * 86400000, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (?,?,?,?,?,?,?,'open',?,?)");
  ins.run(41, "R-B", "a", 1, "پیچ آلن M8", 100, "عدد", 1, norm("پیچ"));
  ins.run(42, "R-B", "b", 2, "دستکش ایمنی", 20, "جفت", 1, norm("دستکش"));
  ins.run(43, "R-B", "c", 3, "مهره M8", 50, "عدد", 1, norm("مهره"));
  ins.run(51, "R-C", "a", 1, "واشر", 10, "عدد", 2, norm("واشر"));
  ins.run(61, "R-D", "a", 1, "دستکش چرمی", 10, "جفت", 3, norm("دستکش"));
  ins.run(62, "R-D", "b", 2, "پیچ سرتخت", 30, "عدد", 3, norm("پیچ"));
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    calls.push({ bot: "tg", method, body: typeof init.body === "string" ? JSON.parse(init.body) : {} });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: calls.length } : true });
  }
  if (u.startsWith("https://sb.test/")) return R({ Key: "x" });
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
let SUP = {};
if (DB) SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "azmoon-123" } })).data.token };
/** «بررسی سوابق»ِ یک قلم برای کارشناس: ۴۲۳ یعنی دستِ کارشناس هوشمند است */
const hist = (item, headers = EX) => call(`/suppliers/history?item_id=${item}`, { headers });
const outbox = (like) => DB.raw.prepare("SELECT target, payload_json FROM outbox WHERE idem LIKE ? ORDER BY id").all(like).map((r) => ({ to: r.target, text: JSON.parse(r.payload_json).text }));
const S = {};

test("حالتِ هر نوع قلم در پنل پشتیبانی: پیش‌فرض «انتخاب کارشناس»، «مستقیم» و «سپردن یا برگشت»، و «حالت تأیید مجاز»", { skip: SKIP }, async () => {
  const g0 = await call("/support/ai/modes", { headers: SUP });
  assert.equal(g0.status, 200, JSON.stringify(g0.data));
  assert.deepEqual([g0.data.heads, g0.data.default], [{}, { mode: "pick", supervise: false }]);
  assert.equal(g0.data.fa.direct, "مستقیم");
  assert.equal((await call("/support/ai/modes", { headers: EX })).status, 401, "فقط پشتیبانی");
  const put = await call("/support/ai/modes", { method: "PUT", headers: SUP, body: { heads: { "دستکش": { mode: "direct" }, "پیچ": { mode: "handoff", supervise: true }, "واشر": { mode: "بی‌معنی" } } } });
  assert.equal(put.status, 200, JSON.stringify(put.data));
  assert.deepEqual(put.data.heads, { "دستکش": { mode: "direct", supervise: false }, "پیچ": { mode: "handoff", supervise: true }, "واشر": { mode: "pick", supervise: false } });
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_modes'").get(), "رخداد برای گزارشِ پشتیبانی");
  resetModesCache();
  const cfg = await getModes(env);
  assert.deepEqual(modeOf(cfg, "پيچ"), { mode: "handoff", supervise: true, set: true }, "ی/ک عربی همان نوع قلم است");
  assert.deepEqual(modeOf(cfg, "مهره"), { mode: "pick", supervise: false, set: false }, "نام‌نبرده: پیش‌فرض (تصمیم ۲۴)");
  const hs = await call("/support/ai/heads?q=پیچ", { headers: SUP });
  assert.equal(hs.status, 200);
  assert.ok(Array.isArray(hs.data.heads));
});

test("تیکِ «🤖 هوشمند»ِ مدیر: فقط برای کارشناسِ هوشمند، برداشتن با توضیح، درخواستِ دستی بی قفل و بی سپردن", { skip: SKIP }, async () => {
  assert.equal((await call("/assign/ai", { headers: EX, body: { assignment_id: 1, on: false, reason: "x" } })).status, 401, "فقط مدیر");
  const other = await call("/assign/ai", { headers: MGR, body: { assignment_id: 2, on: false, reason: "x" } });
  assert.equal(other.status, 409, "کارشناس هوشمندِ این کارشناس خاموش است (تصمیم ۱۵)");
  const bare = await call("/assign/ai", { headers: MGR, body: { assignment_id: 1, on: false } });
  assert.equal(bare.status, 422);
  assert.equal(bare.data.need_reason, true, "برداشتنِ تیک توضیح می‌خواهد");
  /* گام ۲: بررسی سوابق کارِ خودِ کارشناس است؛ نشانهٔ «هوشمند» بودن، «🎯 فهرست دعوت»ِ قلم است */
  assert.notEqual((await hist(41)).status, 423, "بررسی سوابق کارِ خودِ کارشناس است (گام ۲)");
  assert.equal((await call("/items/41/picks", { headers: EX })).status, 200, "پیش از برداشتن: فهرستِ دعوتِ کارشناس هوشمند");
  const off = await call("/assign/ai", { headers: MGR, body: { assignment_id: 1, on: false, reason: "خریدِ فوری؛ کارشناس خودش تماس دارد." } });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.deepEqual(Object.values(DB.raw.prepare("SELECT ai_on, ai_note, ai_set_by FROM assignments WHERE id=1").get()), [0, "خریدِ فوری؛ کارشناس خودش تماس دارد.", "manager"]);
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_tick'").get());
  const msg = outbox("aitick:1:%").pop();
  assert.equal(msg.to, "701");
  assert.match(msg.text, /دستی شد[\s\S]*خریدِ فوری/, "خبر به کارشناس با توضیحِ مدیر");
  /* درخواستِ دستی: قفل ندارد، در کارتابل بی 🤖، سپرده نمی‌شود */
  assert.notEqual((await hist(41)).status, 423);
  assert.equal((await call("/items/41/picks", { headers: EX })).status, 409, "درخواستِ دستی فهرستِ دعوت ندارد");
  const tray = (await call("/tray", { headers: EX })).data;
  assert.equal(tray.assignments.find((a) => a.id === 1).ai, 0);
  const ho = await call("/assignments/1/handoff", { headers: EX, body: {} });
  assert.equal(ho.status, 409);
  assert.match(ho.data.error, /دستی ارجاع داده است/);
  const det = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual([det.ai.on, det.ai.note], [false, "خریدِ فوری؛ کارشناس خودش تماس دارد."]);
  /* زدنِ دوباره، بی توضیح */
  const on = await call("/assign/ai", { headers: MGR, body: { assignment_id: 1, on: true } });
  assert.equal(on.status, 200);
  assert.equal(DB.raw.prepare("SELECT ai_on FROM assignments WHERE id=1").get().ai_on, 1);
  assert.equal((await call("/items/41/picks", { headers: EX })).status, 200, "دوباره هوشمند");
});

test("قلمِ «مستقیم» دستِ خودِ کارشناس است؛ برداشتنِ تیک برای درخواستِ تمام‌مستقیم توضیح نمی‌خواهد", { skip: SKIP }, async () => {
  assert.notEqual((await hist(42)).status, 423, "دستکش: «مستقیم» — پیش از سپردن آزاد");
  assert.notEqual((await hist(43)).status, 423, "مهره: «انتخاب کارشناس» — سوابقش کارِ خودِ کارشناس (گام ۲)");
  const det = (await call("/assignments/1", { headers: EX })).data;
  assert.deepEqual(det.ai.items.map((i) => [i.id, i.mode, i.supervise, i.manual]), [[41, "handoff", true, false], [42, "direct", false, false], [43, "pick", false, false]]);
  /* درخواستی که فقط اقلامِ «مستقیم» دارد */
  const t = Date.now();
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-E','1405/07/15','پروژهٔ ه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (4,'R-E',1,5,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (71,'R-E','a',1,'دستکش نخی',5,'جفت','open',4,?)").run(norm("دستکش"));
  const free = await call("/assign/ai", { headers: MGR, body: { assignment_id: 4, on: false } });
  assert.equal(free.status, 200, JSON.stringify(free.data));
});

test("«انجام دستی»: علتِ اجباری، همیشه با تأییدِ مدیر — تأیید قلم را آزاد می‌کند، رد با پاسخِ مدیر", { skip: SKIP }, async () => {
  const noWhy = await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [43] } });
  assert.equal(noWhy.status, 400);
  const req = await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [43], reason: "تأمین‌کنندهٔ این قلم فقط با کارشناسِ ما کار می‌کند." } });
  assert.equal(req.status, 200, JSON.stringify(req.data));
  assert.deepEqual([req.data.pending, req.data.items], [true, 1], "بی «منوط به تأیید من» هم در صفِ مدیر");
  S.d1 = req.data.decision_id;
  assert.equal((await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [43], reason: "دوباره" } })).status, 409, "درخواستِ تکراری نه");
  const card = outbox(`dec:${S.d1}:%:ask`).pop();
  assert.equal(card.to, "900");
  assert.match(card.text, /انجام دستی[\s\S]*مهره M8[\s\S]*علت:[\s\S]*فقط با کارشناسِ ما/);
  const det = (await call("/assignments/1", { headers: EX })).data;
  assert.equal(det.ai.items.find((i) => i.id === 43).waiting, true);
  const list = (await call("/decisions", { headers: MGR })).data.decisions;
  assert.ok(list.some((d) => d.id === S.d1 && d.action === "manual"));
  const ok = await call(`/decisions/${S.d1}/approve`, { headers: MGR, body: {} });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(DB.raw.prepare("SELECT ai_off FROM items WHERE id=43").get().ai_off, 1);
  assert.equal(DB.raw.prepare("SELECT state FROM items WHERE id=43").get().state, "open", "وضعیتِ قلم عوض نمی‌شود");
  assert.notEqual((await hist(43)).status, 423, "قلمِ دستی برای کارشناس آزاد");
  assert.match(outbox(`dec:${S.d1}:%:ok`).pop().text, /انجام دستی را تأیید کرد[\s\S]*۱ قلم دستِ خودِ شماست/);
  /* ردِ مدیر */
  const req2 = await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [41], reason: "قیمتِ این قلم را خودم می‌گیرم." } });
  const no = await call(`/decisions/${req2.data.decision_id}/reject`, { headers: MGR, body: { note: "کارشناس هوشمند برای این قلم سوابقِ خوب دارد." } });
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(DB.raw.prepare("SELECT ai_off FROM items WHERE id=41").get().ai_off, null);
  assert.match(outbox(`dec:${req2.data.decision_id}:%:no`).pop().text, /رد کرد[\s\S]*سوابقِ خوب[\s\S]*با کارشناس هوشمند می‌مانند/);
});

test("سپردن فقط اقلامِ هوشمند: نه «انجام دستی»، نه «مستقیم»ِ انتخاب‌نشده؛ «مستقیم» با تیکِ خودِ کارشناس", { skip: SKIP }, async () => {
  const ho = await call("/assignments/1/handoff", { headers: EX, body: {} });
  assert.equal(ho.status, 200, JSON.stringify(ho.data));
  assert.deepEqual([ho.data.items, ho.data.manual], [1, 2]);
  const run = DB.raw.prepare("SELECT data_json FROM ai_runs WHERE assignment_id=1").get();
  assert.deepEqual(JSON.parse(run.data_json).items.map((x) => x.id), [41]);
  assert.deepEqual(DB.raw.prepare("SELECT id FROM items WHERE assignment_id=1 AND frozen_at IS NOT NULL").all().map((r) => r.id), [41], "فقط همان منجمد");
  assert.equal((await call("/items/41/norm", { method: "PUT", headers: EX, body: { head: "پیچ", layers: {} } })).status, 409, "ساختارِ سپرده‌شده منجمد");
  assert.notEqual((await hist(42)).status, 423, "بیرون از کار: آزاد");
  assert.notEqual((await hist(43)).status, 423);
  assert.equal((await call("/assignments/1/decision", { headers: EX, body: { action: "manual", item_ids: [41], reason: "دیر شد" } })).status, 409, "قلمِ سپرده‌شده «انجام دستی» نمی‌شود");
  /* «مستقیم» با تیکِ کارشناس */
  const ho3 = await call("/assignments/3/handoff", { headers: EX, body: { include: [61] } });
  assert.equal(ho3.status, 200, JSON.stringify(ho3.data));
  assert.deepEqual(JSON.parse(DB.raw.prepare("SELECT data_json FROM ai_runs WHERE assignment_id=3").get().data_json).items.map((x) => x.id), [61, 62]);
  /* بعد از سپردن، تیکِ مدیر عوض نمی‌شود */
  assert.equal((await call("/assign/ai", { headers: MGR, body: { assignment_id: 3, on: false, reason: "x" } })).status, 409);
});
