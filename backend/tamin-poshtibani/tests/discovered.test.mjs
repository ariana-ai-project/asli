/* ============================================================
   «🗂 تأمین‌کنندگان کشف‌شده» در تب «جستجوی هوشمند» و دروازهٔ «اجرای جستجوی هوشمند» (درخواست مالک، مهر ۱۴۰۵)
   • GET /search/smart فهرستِ ۴۰ نفرِ واحدِ کشفِ قلم را با رکوردِ دفتر و اصلاحِ کارشناس می‌دهد؛ «رد در دروازه» نمی‌آید؛
     cands شش‌خانه‌ای (ورودِ پیشین) و یازده‌خانه‌ای (با شاهدِ تناسب) هر دو خوانده می‌شوند
   • کمتر از min (پیش‌فرض ۱۰) کشف‌شده ← جستجو باز؛ ۱۰ یا بیشتر ← بسته و POST با ۴۰۹ و دلیل
   • پنل پشتیبانی: حد، خاموش کردنِ قاعده و «همیشه باز» برای هر کارشناس؛ مدیر همیشه آزاد
   • «🎯 به فهرست دعوت» با منبعِ «کشف‌شده (تحقیق)» و «➕ به استعلامات» با origin=disc
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { applyEdits, PICK_SRC_FA } from "../../../worker/ai-picks.js";
import { supKey } from "../../../worker/cr-data.js";
import { resetSgCache, gateMsg } from "../../../worker/discovered.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
/* بی ANTHROPIC_API_KEY: جستجوی بازِ POST به «وصل نیست» می‌رسد و مدلی صدا زده نمی‌شود */
const env = { DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", SITE_ORIGIN: "https://site.test" };
const EX1 = { "X-Expert-Code": "7001" }, MGR = { "X-Manager-Code": "1234" };
globalThis.fetch = async (url) => { if (String(url).startsWith("https://tg.test/bot")) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } })); throw new Error(`fetch بیرونی: ${url}`); };
const ctx = { waitUntil: () => {} };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) }; let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
let SUP = {};
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','کارشناس یک','7001',1,1,?)").run(t);
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (2,'کارشناس دو','کارشناس دو','7002',1,1,?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-9','1405/07/27','پروژهٔ نه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (9,'R-9',1,5,?,?,?)").run(t, t + 9e8, t);
  const item = (id, title, head, code) => DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id,norm_json) VALUES (?,'R-9',?,?,?,?,10,'عدد','open',9,?)")
    .run(id, `k${id}`, id, code, title, JSON.stringify({ v: 2, head, layers: {}, source: "catalog" }));
  item(91, "پیچ M10", "پیچ", "1003");
  item(92, "مهره M10", "مهره", null);
  item(93, "کابل افشان", "کابل", null);
  const head = (h) => DB.raw.prepare("INSERT INTO cr_heads (head,cluster,rfq_mode,rec,version,imported_at) VALUES (?, 'C04', 'STANDARD', '{}', '2.0', ?)").run(h, t);
  head("پیچ"); head("مهره");
  const sup = (sid, name, v, phones, mobiles, data) => DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,hub,province,city,role,country,verification,phones,mobiles,data,version,imported_at) VALUES (?,'new',?,?,?,?,?,?,?,?,?,?,?,'2.0',?)")
    .run(sid, name, supKey(name), "بازار امین‌حضور", "تهران", "تهران", "عمده‌فروش/توزیع‌کننده", data.country || "ایران", v, phones, mobiles, JSON.stringify(data), t);
  /* «پیچ»: ۱۱ نامزد — ۱۰ دیدنی و یکی «رد در دروازه» (راستی‌آزماییِ −۱)؛ نفرِ اول با شاهدِ تناسب، نفرِ دوم ردیفِ شش‌خانه‌ایِ قدیمی */
  const cands = [];
  for (let i = 1; i <= 11; i++) {
    const sid = `NEW-${String(i).padStart(4, "0")}`;
    const rejected = i === 5;
    sup(sid, `پیچ‌فروشی ${i}`, rejected ? -1 : 1, `021-5555${String(i).padStart(4, "0")}`, i === 1 ? "09121110001" : null,
      i === 3 ? { country: "امارات متحده عربی", latin_name: "Bolt Trading LLC", website: "bolt.ae" } : { legal_name: `شرکت پیچ ${i}`, products: "پیچ و مهره", sources: "https://example.ir/a https://example.ir/b" });
    cands.push(i === 2 ? [sid, 0, i, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.5, 0.1]
      : [sid, i % 2, i, i === 1 ? "تأییدشده" : "رقیب (رتبهٔ ۱۱ تا ۴۰)", 2.5 - i / 10, 0.9, 2.1, 2.8, "S2", i === 1 ? "پیچ و مهره، عمده" : null, i === 1 ? "https://example.ir/p" : null]);
  }
  /* ترتیبِ نامرتب در cands: خروجی به ترتیبِ رتبه است */
  cands.reverse();
  DB.raw.prepare("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C04|پیچ','پیچ','C04',?,?,?)")
    .run(JSON.stringify(cands), JSON.stringify({ codes: ["1003"], cluster_name: "اتصالات", route: "D", n_found: 117 }), t);
  /* «مهره»: سه نامزد */
  DB.raw.prepare("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C04|مهره','مهره','C04',?,?,?)")
    .run(JSON.stringify([["NEW-0001", 1, 1, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 2, 0.5], ["NEW-0002", 1, 2, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.9, 0.4], ["NEW-0003", 0, 3, "رقیب (رتبهٔ ۱۱ تا ۴۰)", 1.5, 0.2]]),
      JSON.stringify({ codes: [] }), t);
  /* اصلاحِ کارشناس روی تلفنِ نفرِ ششم */
  DB.raw.prepare("INSERT INTO sreg_x (sid,field,value,by_kind,by_name,at,active) VALUES ('NEW-0006','phones','021-99998888','expert','کارشناس یک',?,1)").run(t);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("فهرستِ کشف‌شده‌ها: ترتیبِ رتبه، رکوردِ دفتر، شاهدِ تناسب، اصلاحِ کارشناس؛ «رد در دروازه» نمی‌آید", { skip: SKIP }, async () => {
  const r = await call("/search/smart?item_id=91", { headers: EX1 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const D = r.data.discovered;
  assert.equal(D.unit_key, "C04|پیچ");
  assert.equal(D.cluster_name, "اتصالات");
  assert.equal(D.n_found, 117);
  assert.equal(D.count, 10);
  assert.deepEqual(D.list.map((x) => x.rank), [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
  const [a, b] = D.list;
  assert.equal(a.sid, "NEW-0001");
  assert.equal(a.fit, "اصلی");
  assert.equal(a.status, "تأییدشده");
  assert.equal(a.verification, 2, "«تأییدشده» یعنی همهٔ دروازه‌ها قبول");
  assert.equal(a.quote, "پیچ و مهره، عمده");
  assert.equal(a.url, "https://example.ir/p");
  assert.deepEqual([a.lo, a.hi, a.basis], [2.1, 2.8, "S2"]);
  assert.equal(a.mobiles, "09121110001");
  assert.equal(a.d.legal_name, "شرکت پیچ 1");
  /* ردیفِ قدیمیِ شش‌خانه‌ای */
  assert.equal(b.fit, "خانواده");
  assert.deepEqual([b.lo, b.hi, b.basis, b.quote, b.url], [null, null, null, null, null]);
  const fx = D.list.find((x) => x.sid === "NEW-0003");
  assert.equal(fx.country, "امارات متحده عربی");
  assert.equal(fx.d.latin_name, "Bolt Trading LLC");
  const six = D.list.find((x) => x.sid === "NEW-0006");
  assert.equal(six.phones, "021-99998888");
  assert.equal(six.staff_phone, true);
  assert.ok(!D.list.some((x) => x.sid === "NEW-0005"));
});

test("دروازه: ۱۰ کشف‌شده ← بسته (۴۰۹ با دلیل)؛ ۳ و صفر ← باز", { skip: SKIP }, async () => {
  const g = (await call("/search/smart?item_id=91", { headers: EX1 })).data.gate;
  assert.deepEqual(g, { open: false, count: 10, min: 10, by: "count" });
  const p = await call("/search/smart", { headers: EX1, body: { item_id: 91, markets: ["IR"] } });
  assert.equal(p.status, 409);
  assert.equal(p.data.error, gateMsg(g));
  assert.match(p.data.error, /۱۰ تأمین‌کنندهٔ کشف‌شده/);
  assert.deepEqual(p.data.gate, g);

  const m = await call("/search/smart?item_id=92", { headers: EX1 });
  assert.equal(m.data.discovered.count, 3);
  assert.deepEqual(m.data.gate, { open: true, count: 3, min: 10, by: "count" });
  const pm = await call("/search/smart", { headers: EX1, body: { item_id: 92, markets: ["IR"] } });
  assert.equal(pm.status, 200);
  assert.equal(pm.data.available, false, "باز است و فقط کلیدِ مدل در آزمون نیست");

  const k = await call("/search/smart?item_id=93", { headers: EX1 });
  assert.equal(k.data.discovered.unit_key, null);
  assert.equal(k.data.discovered.count, 0);
  assert.equal(k.data.gate.open, true);
});

test("مدیر همیشه آزاد است", { skip: SKIP }, async () => {
  const r = await call("/search/smart?item_id=91", { headers: MGR });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.gate, { open: true, count: 10, min: 10, by: "staff" });
});

test("پنل پشتیبانی: «همیشه باز» برای یک کارشناس، حدِ تازه و خاموش کردنِ قاعده — با رخداد", { skip: SKIP }, async () => {
  const g0 = await call("/support/ai/smart-gate", { headers: SUP });
  assert.equal(g0.status, 200, JSON.stringify(g0.data));
  assert.deepEqual([g0.data.cfg.on, g0.data.cfg.min, g0.data.cfg.open], [true, 10, []]);
  assert.deepEqual(g0.data.experts.map((e) => e.id), [1, 2]);

  let s = await call("/support/ai/smart-gate", { method: "PUT", headers: SUP, body: { cfg: { open: [1, "۲", "x"] } } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  assert.deepEqual(s.data.cfg.open, [1, 2]);
  assert.equal(s.data.cfg.min, 10, "فیلدِ نیامده همان قبلی است");
  assert.deepEqual((await call("/search/smart?item_id=91", { headers: EX1 })).data.gate, { open: true, count: 10, min: 10, by: "support" });
  const p = await call("/search/smart", { headers: EX1, body: { item_id: 91, markets: ["IR"] } });
  assert.equal(p.status, 200);
  assert.equal(p.data.available, false);

  s = await call("/support/ai/smart-gate", { method: "PUT", headers: SUP, body: { cfg: { open: [], min: "۱۱" } } });
  assert.equal(s.data.cfg.min, 11);
  assert.deepEqual((await call("/search/smart?item_id=91", { headers: EX1 })).data.gate, { open: true, count: 10, min: 11, by: "count" });

  assert.equal((await call("/support/ai/smart-gate", { method: "PUT", headers: SUP, body: { cfg: { min: "ده" } } })).status, 422);

  s = await call("/support/ai/smart-gate", { method: "PUT", headers: SUP, body: { cfg: { on: false, min: 10 } } });
  assert.equal(s.data.cfg.on, false);
  assert.equal((await call("/search/smart?item_id=91", { headers: EX1 })).data.gate.by, "off");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='smart_gate_cfg'").get());

  /* برگشت به پیش‌فرض برای آزمون‌های بعدی */
  await call("/support/ai/smart-gate", { method: "PUT", headers: SUP, body: { cfg: { on: true, min: 10, open: [] } } });
  resetSgCache();
  assert.equal((await call("/search/smart?item_id=91", { headers: EX1 })).data.gate.open, false);
});

test("«🎯 به فهرست دعوت» با منبعِ «کشف‌شده (تحقیق)»؛ «➕ به استعلامات» با origin=disc", { skip: SKIP }, async () => {
  const pick = { list: [] };
  applyEdits(pick, { add: [{ name: "پیچ‌فروشی 1", src: "disc", rsid: "NEW-0001", ph: ["09121110001"] }] }, { mode: "pick", by: "expert:1" });
  assert.equal(pick.list[0].src, "disc");
  assert.equal(pick.list[0].rsid, "NEW-0001");
  assert.equal(pick.list[0].sid, null);
  assert.equal(pick.list[0].on, true);
  assert.equal(PICK_SRC_FA.disc, "کشف‌شده (تحقیق)");
  /* همان نام دوباره: فقط تیک */
  pick.list[0].on = false;
  applyEdits(pick, { add: [{ name: "پیچ‌فروشی 1", src: "disc", rsid: "NEW-0001" }] }, { mode: "pick", by: "expert:1" });
  assert.equal(pick.list.length, 1);
  assert.equal(pick.list[0].on, true);

  const q = await call("/quotes", { headers: EX1, body: { assignment_id: 9, item_ids: [91], supplier_name: "پیچ‌فروشی 1", origin: "disc" } });
  assert.equal(q.status, 200, JSON.stringify(q.data));
  assert.equal(DB.raw.prepare("SELECT origin FROM quotes WHERE assignment_id=9 AND item_id=91").get().origin, "disc");
});
