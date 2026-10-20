/* ============================================================
   ورود به فاز اجرایی (آبان ۱۴۰۵)
   • کد ورودِ چهاررقمیِ تصادفی: مدیر از منوی «⋯» می‌بیند و تازه می‌کند؛ «🎲 برای همه»؛ کد قبلی دیگر کار نمی‌کند
   • پیش‌فرضِ دستی (aiOptIn): دیتابیسِ موجود یک بار دستی می‌شود (کارِ سپرده‌شده می‌ماند)؛ «🤖» روی درخواست ← هوشمند در ارسال
   • روالِ دستیِ سادهٔ کارشناس: ارسال ← خطِ دستیِ استعلام ← ثبت موقت و تأیید نهایی ← حد نصاب ← جدول کمیسیون و فایلش
   • «📊 کارکرد کارشناسان»: ارجاع، فراخوانیِ مدل، جستجوی هوشمند، پیامک، قالب و کپیِ پیام
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route, migrateAiOptIn } from "../../../worker/api.js";
import { aiOwned } from "../../../worker/ai-lock.js";
import { callGuard } from "../../../worker/final-call.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", SITE_ORIGIN: "https://site.test" };
const MGR = { "X-Manager-Code": "4321" };
const T0 = Date.now();
globalThis.fetch = async (u) => { throw new Error(`fetch بیرونی: ${u}`); };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) }; let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.arrayBuffer() };
}
const code = (id) => String(DB.raw.prepare("SELECT code FROM experts WHERE id=?").get(id).code);
let SUP = {};
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','یک','1111',1,1,?)").run(T0);
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (2,'کارشناس دو','دو','2222',1,1,?)").run(T0);
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (3,'رفته','رفته','3333',0,1,?)").run(T0);
  /* دو ارجاعِ بی‌تکلیفِ پیش از قاعده: یکی با کارِ سپرده‌شده به کارشناس هوشمند */
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-OLD','1405/07/20','پیشین')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (90,'R-OLD',1,3,?,?)").run(T0, T0);
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (91,'R-OLD',2,3,?,?)").run(T0, T0);
  DB.raw.prepare("INSERT INTO ai_runs (assignment_id,expert_id,request_id,state,created_at,updated_at) VALUES (91,2,'R-OLD','work',?,?)").run(T0, T0);
  /* درخواستِ ساده: یک قلم پیچ */
  for (const [rid, iid] of [["R-M", 11], ["R-A", 12]]) {
    DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES (?, '1405/08/01', 'پروژهٔ آزمون')").run(rid);
    DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state) VALUES (?,?,'a',1,'پیچ M10',100,'عدد','open')").run(iid, rid);
  }
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("کد ورود: مدیر می‌بیند و تازه می‌کند؛ «برای همه» یکتا و چهاررقمی؛ کد قبلی دیگر کار نمی‌کند", { skip: SKIP }, async () => {
  const g = await call("/experts/1/code", { headers: MGR });
  assert.equal(g.status, 200);
  assert.equal(g.data.code, "1111");
  assert.equal((await call("/experts/1/code", { headers: { "X-Expert-Code": "2222" } })).status, 401, "کارشناس کدِ دیگران را نمی‌بیند");
  const n = await call("/experts/1/code", { method: "POST", headers: MGR, body: {} });
  assert.match(n.data.code, /^\d{4}$/);
  assert.notEqual(n.data.code, "1111");
  assert.equal((await call("/me", { headers: { "X-Expert-Code": "1111" } })).status, 401);
  assert.equal((await call("/me", { headers: { "X-Expert-Code": n.data.code } })).status, 200);
  const all = await call("/experts/codes/random", { headers: MGR, body: {} });
  assert.equal(all.data.n, 2, "فقط کارشناسانِ فعال");
  const c1 = code(1), c2 = code(2);
  assert.match(c1, /^\d{4}$/); assert.match(c2, /^\d{4}$/);
  assert.notEqual(c1, c2);
  assert.notEqual(c1, "4321"); assert.notEqual(c2, "4321");
  assert.equal(code(3), "3333", "کارشناسِ رفته دست نمی‌خورد");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='code_reset'").get().n, 3);
});

test("پیش‌فرضِ دستی: ارجاع‌های بازِ پیشین دستی، کارِ سپرده‌شده هوشمند می‌ماند؛ یک بار", { skip: SKIP }, async () => {
  await migrateAiOptIn(env, true);
  const r = (id) => DB.raw.prepare("SELECT ai_on, ai_set_by FROM assignments WHERE id=?").get(id);
  assert.deepEqual({ ...r(90) }, { ai_on: 0, ai_set_by: "default" });
  assert.deepEqual({ ...r(91) }, { ai_on: 1, ai_set_by: "default" });
  DB.raw.prepare("UPDATE assignments SET ai_on=NULL WHERE id=90").run();
  await migrateAiOptIn(env, true);
  assert.equal(r(90).ai_on, null, "دوباره اجرا نمی‌شود");
  DB.raw.prepare("UPDATE assignments SET ai_on=0 WHERE id=90").run();
  const desk = await call("/desk", { headers: MGR });
  assert.equal(desk.data.ai_opt_in, true);
});

test("درخواستِ بی «🤖» دستی ارسال می‌شود؛ با «🤖»ِ کارتِ درخواست، هوشمند و کارشناس هوشمندِ کارشناس روشن", { skip: SKIP }, async () => {
  for (const [rid, eid] of [["R-M", 1], ["R-A", 2]]) assert.equal((await call("/assign", { headers: MGR, body: { request_id: rid, expert_id: eid, days: 3 } })).status, 200);
  const aid = (rid) => DB.raw.prepare("SELECT id FROM assignments WHERE request_id=?").get(rid).id;
  const tick = await call("/assign/ai-req", { headers: MGR, body: { request_id: "R-A", on: true } });
  assert.equal(tick.status, 200, JSON.stringify(tick.data));
  assert.equal(DB.raw.prepare("SELECT ai_req FROM requests WHERE id='R-A'").get().ai_req, 1);
  const d = await call("/dispatch", { headers: MGR, body: { assignment_ids: [aid("R-M"), aid("R-A")] } });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(DB.raw.prepare("SELECT ai_on FROM assignments WHERE id=?").get(aid("R-M")).ai_on, 0);
  assert.equal(DB.raw.prepare("SELECT ai_on FROM assignments WHERE id=?").get(aid("R-A")).ai_on, 1);
  assert.equal(DB.raw.prepare("SELECT mode FROM ai_agents WHERE expert_id=2").get().mode, "on");
  assert.equal(await aiOwned(env, aid("R-M")), null, "دستی");
  assert.ok(await aiOwned(env, aid("R-A")), "هوشمند");
  /* دستی کردنِ ارجاعِ هوشمند (هنوز سپرده نشده) علت نمی‌خواهد */
  const off = await call("/assign/ai", { headers: MGR, body: { assignment_id: aid("R-A"), on: false } });
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.equal(await aiOwned(env, aid("R-A")), null);
  /* و برگرداندنش */
  assert.equal((await call("/assign/ai", { headers: MGR, body: { assignment_id: aid("R-A"), on: true } })).status, 200);
  assert.ok(await aiOwned(env, aid("R-A")));
});

test("روالِ دستیِ ساده: سه خطِ دستی ← فقط «ثبت موقت» ← جدول کمیسیون و فایلش، بی «تأیید نهایی» و بی فراخوان", { skip: SKIP }, async () => {
  const EX = { "X-Expert-Code": code(1) };
  const aid = DB.raw.prepare("SELECT id FROM assignments WHERE request_id='R-M'").get().id;
  const det = await call(`/assignments/${aid}`, { headers: EX });
  assert.equal(det.status, 200);
  assert.equal(det.data.ai.on, false, "پنل کارشناس هم دستی می‌بیند");
  const ids = [];
  for (const [name, price] of [["پیچ‌فروشی الف", 52000], ["پیچ‌فروشی ب", 50000], ["پیچ‌فروشی ج", 55000]]) {
    const q = await call("/quotes", { headers: EX, body: { assignment_id: aid, item_ids: [11], supplier_name: name, origin: "manual", unit: "عدد", qty: 100, price, dtime: "7", pay: "نقدی", invoice: "رسمی", vat: "دارد" } });
    assert.equal(q.status, 200, JSON.stringify(q.data));
    ids.push(DB.raw.prepare("SELECT id FROM quotes WHERE assignment_id=? AND supplier_name=?").get(aid, name).id);
  }
  /* آبان ۱۴۰۵ (خواستهٔ مالک): در دستی حداقلِ «ثبت موقت» کافی است — «تأیید نهایی» اختیاری و «📨 فراخوانِ پیش‌فاکتورِ رسمی» نیست */
  for (const id of ids) {
    const s = await call(`/quotes/${id}`, { method: "PUT", headers: EX, body: { save: true } });
    assert.equal(s.status, 200, JSON.stringify(s.data));
  }
  const d2 = (await call(`/assignments/${aid}`, { headers: EX })).data;
  assert.equal(d2.ai.req, false, "درخواستِ دستی");
  assert.equal(d2.final_call.on, false, "کارتِ فراخوان برای دستی پنهان");
  assert.equal(await callGuard(env, aid), null);
  const fc = await call(`/assignments/${aid}/final-call`, { headers: EX, body: {} });
  assert.equal(fc.status, 409);
  assert.match(fc.data.error, /دستی فراخوانِ پیش‌فاکتورِ رسمی ندارد/);
  /* درخواستِ هوشمند هنوز فراخوان لازم دارد */
  const aiAid = DB.raw.prepare("SELECT id FROM assignments WHERE request_id='R-A'").get().id;
  await assert.rejects(callGuard(env, aiAid), /فراخوان/);
  const ok = await call(`/assignments/${aid}/commission`, { headers: EX, body: {} });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.commission_no);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=? AND commission_at IS NOT NULL").get(aid).n, 3, "هر سه «ثبت موقت» در جدول");
  const f = await call(`/assignments/${aid}/sheet/commission`, { headers: EX });
  assert.equal(f.status, 200);
  assert.ok(f.data.byteLength > 1000, "فایل جدول کمیسیون");
});

test("«📊 کارکرد کارشناسان»: ارجاع، فراخوانیِ مدل، جستجو، پیامک، قالب و کپیِ پیام", { skip: SKIP }, async () => {
  const EX = { "X-Expert-Code": code(1) };
  DB.raw.prepare("INSERT INTO ai_calls (expert_id,purpose,model,in_tok,out_tok,status,at) VALUES (1,'negotiate','m',100,20,'ok',?)").run(Date.now());
  DB.raw.prepare("INSERT INTO smart_searches (item_id,assignment_id,expert_id,model,in_tokens,out_tokens,created_at,request_id) VALUES (11,1,1,'m',10,5,?,'R-M')").run(Date.now());
  DB.raw.prepare("INSERT INTO sp_sms (phone_id,expert_id,kind,body,at) VALUES (1,1,'invite','x',?)").run(Date.now());
  assert.equal((await call("/templates", { headers: EX, body: { title: "سلام", body: "سلام {تامین‌کننده}" } })).status, 200);
  assert.equal((await call("/me/activity", { headers: EX, body: { kind: "msg_copy", supplier: "پیچ‌فروشی الف", item_id: 11, template: "سلام", chars: 120 } })).status, 200);
  assert.equal((await call("/me/activity", { headers: EX, body: { kind: "hack" } })).status, 422);
  const o = await call("/support/usage?days=30", { headers: SUP });
  assert.equal(o.status, 200, JSON.stringify(o.data));
  const e1 = o.data.experts.find((e) => e.id === 1);
  /* R-OLD (پیش از قاعده) و R-M */
  assert.deepEqual([e1.requests, e1.ai.agent, e1.ai.search, e1.sms, e1.templates, e1.copies], [2, 1, 1, 1, 1, 1]);
  const d = await call("/support/usage/1?days=0", { headers: SUP });
  assert.equal(d.status, 200, JSON.stringify(d.data));
  assert.equal(d.data.copies[0].supplier, "پیچ‌فروشی الف");
  assert.equal(d.data.copies[0].request_id, "R-M");
  assert.equal(d.data.requests[0].request_id, "R-M");
  assert.equal(d.data.templates[0].title, "سلام");
  assert.equal((await call("/support/usage", { headers: MGR })).status, 401, "فقط پشتیبانی");
});
