/* ============================================================
   «📋 شرایط خرید» — شرطِ شرکت (بازخوردِ آزمونِ مهر ۱۴۰۵): محل تحویل، محل معامله، روش حمل و کمینهٔ اعتبار پیش‌فاکتور

   کنارِ تسویه، فاکتور، ارزش افزوده و زمان تحویل، هر کدام 🔒/🔓. این‌ها را تأمین‌کننده وارد نمی‌کند: زیرِ هر قلمِ پیامِ استعلام
   (کارتِ رخداد و متنِ بات) می‌روند، در پنل کنارِ شرایط فاکتور دیده می‌شوند، و پیش‌فاکتورِ سامانه و خطِ استعلام از همین‌ها پر
   می‌شوند (terms-locks.js:withCompany). اعتبارِ کمتر از کمینهٔ 🔒 پذیرفته نیست.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import * as SP from "../../../worker/sp-core.js";
import { cleanLimits, combineLocks, violations, limitsTxt, withCompany, fieldTxt } from "../../../worker/terms-locks.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, MANAGER_CODE: "1234", TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", SITE_ORIGIN: "https://site.test",
};
const HU = { "X-Expert-Code": "7002" };
const norm = (head) => JSON.stringify({ v: 2, head, layers: {}, source: "catalog" });

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (2,'انسانی','انسانی','7002',1,1,'702',?)").run(t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-T','1405/07/22','پروژهٔ تونل')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-T',2,5,?,?,?)").run(t, t + 9e8, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (31,'R-T','a',1,'سیمان تیپ ۲',40,'تن','open',1,?)").run(norm("سیمان"));
}

const R = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const method = u.split("/").pop();
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: "AriaSupplierBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: 1 } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/")) return (init.method || "GET") === "GET" ? new Response("nf", { status: 404 }) : R({ Key: "x" });
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

test("شرطِ شرکت (بی پایگاه داده): پاک‌سازی، خطاها، کمینهٔ اعتبار، متن و پر کردنِ جاهای خالی", () => {
  assert.throws(() => cleanLimits({ place: { opt: "درب منزل" } }), (e) => e.status === 422 && e.extra.field === "place");
  assert.throws(() => cleanLimits({ place: { opt: "سایر" } }), (e) => e.status === 422, "«سایر» بی نشانی");
  assert.throws(() => cleanLimits({ deal: { opt: "بازار" } }), (e) => e.status === 422 && e.extra.field === "deal");
  assert.throws(() => cleanLimits({ valid: { min: "0" } }), (e) => e.status === 422 && e.extra.field === "valid");
  assert.throws(() => cleanLimits({ valid: { min: "۴۰۰" } }), (e) => e.status === 422);
  assert.equal(cleanLimits({ place: { opt: "" }, ship: { text: "  " }, valid: { min: "" } }), null, "خالی یعنی بی قید");
  const L = cleanLimits({ place: { opt: "سایر", note: "کارگاه تونل البرز، کیلومتر ۱۲", lock: true }, deal: { opt: "کارگاه" }, ship: { text: "حمل با فروشنده" }, valid: { min: "۷", lock: true } });
  assert.deepEqual(L, { place: { opt: "سایر", note: "کارگاه تونل البرز، کیلومتر ۱۲", lock: true }, deal: { opt: "کارگاه", lock: false }, ship: { text: "حمل با فروشنده", lock: false }, valid: { min: 7, lock: true } });
  assert.match(limitsTxt(L), /محل تحویل 🔒 «سایر» \(کارگاه تونل البرز، کیلومتر ۱۲\) · محل معامله 🔓 «کارگاه» · روش حمل 🔓 «حمل با فروشنده» · اعتبار پیش‌فاکتور 🔒 دست‌کم ۷ روز/);
  assert.equal(fieldTxt("valid", L.valid), "دست‌کم ۷ روز");
  assert.equal(fieldTxt("place", L.place), "سایر (کارگاه تونل البرز، کیلومتر ۱۲)");
  /* کمینهٔ 🔒: بزرگ‌ترینِ اقلام؛ 🔓 در قید نیست */
  const c = combineLocks([L, cleanLimits({ valid: { min: 10, lock: true } }), cleanLimits({ valid: { min: 30 } })]);
  assert.equal(c.lock.valid, 10);
  assert.deepEqual(violations({ valid_days: "5" }, c.lock).map((x) => x.field), ["valid_days"]);
  assert.deepEqual(violations({ valid_days: "۱۲" }, c.lock), []);
  /* جاهای خالیِ شرایطِ تأمین‌کننده از شرطِ شرکت؛ پرشده دست نمی‌خورد */
  assert.deepEqual(withCompany({ pay: "نقدی" }, L), { pay: "نقدی", place: "سایر", place_other: "کارگاه تونل البرز، کیلومتر ۱۲", deal: "کارگاه", ship: "حمل با فروشنده" });
  assert.equal(withCompany({ ship: "پیک" }, L).ship, "پیک");
});

test("شرطِ شرکت تا تأمین‌کننده و تا خطِ استعلام: کارتِ استعلام، پنل، کمینهٔ اعتبار، پیش‌فاکتور و ستون‌های کمیسیون", { skip: SKIP }, async () => {
  const set = await call("/items/31/terms", { method: "PUT", headers: HU, body: {
    pay: { opts: ["نقدی"], lock: true }, place: { opt: "سایر", note: "کارگاه تونل البرز", lock: true }, deal: { opt: "کارگاه", lock: false },
    ship: { text: "حمل با فروشنده تا کارگاه", lock: true }, valid: { min: 10, lock: true } } });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  assert.match(set.data.text, /محل تحویل 🔒 «سایر» \(کارگاه تونل البرز\)/);
  const s = await call("/sp/x/send", { headers: HU, body: { assignment_id: 1, item_ids: [31], supplier_name: "سیمان شرق", phone: "09120000501", label: "فروش", text: "سلام، قیمت سیمان؟" } });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  /* کارتِ استعلام (meta) و متنِ همان پیام (بات) هر دو شرایط را دارند */
  const ev = DB.raw.prepare("SELECT body, meta_json FROM sp_msgs WHERE thread_id=? AND kind='event'").get(s.data.thread_id);
  const meta = JSON.parse(ev.meta_json);
  assert.equal(meta.ev, "rfq");
  assert.match(meta.items[0].lim, /شرایط تسویه 🔒 «نقدی» · محل تحویل 🔒 «سایر» \(کارگاه تونل البرز\) · محل معامله 🔓 «کارگاه» · روش حمل 🔒/);
  assert.match(ev.body, /📋 شرایط خرید: شرایط تسویه 🔒 «نقدی»/);
  /* پنلِ تأمین‌کننده: متنِ کوتاه و قیدِ کمینهٔ اعتبار */
  const p = DB.raw.prepare("SELECT id FROM sp_phones WHERE phone='09120000501'").get();
  const H = { "X-SP-Session": await SP.newSession(env, p.id, "web") };
  const th = s.data.thread_id;
  const d = (await call(`/sp/thread/${th}`, { headers: H })).data;
  assert.match(d.lines[0].limits_txt, /اعتبار پیش‌فاکتور 🔒 دست‌کم ۱۰ روز/);
  assert.equal(d.terms_lock.lock.valid, 10);
  const low = await call(`/sp/thread/${th}/terms`, { headers: H, body: { valid_days: 5 } });
  assert.equal(low.status, 422, "اعتبارِ کمتر از کمینهٔ 🔒");
  assert.match(low.data.error, /دست‌کم ۱۰ روز/);
  assert.equal((await call(`/sp/thread/${th}/terms`, { headers: H, body: { pay: "نقدی", vat: "دارد", invoice: "رسمی", dtime: "10", valid_days: 15 } })).status, 200);
  const l = d.lines[0];
  assert.equal((await call(`/sp/line/${l.id}`, { method: "PUT", headers: H, body: { qty: 40, price: 41000000 } })).status, 200);
  assert.equal((await call(`/sp/line/${l.id}/ready`, { headers: H, body: { on: true } })).status, 200);
  const sub = await call(`/sp/thread/${th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  /* پیش‌نمایش و پیش‌فاکتورِ بسته با شرطِ شرکت */
  const pv = await SP.bundleProforma(env, { expert: { id: 2 } }, sub.data.bundle_id);
  assert.deepEqual([pv.terms.place, pv.terms.place_other, pv.terms.deal, pv.terms.ship], ["سایر", "کارگاه تونل البرز", "کارگاه", "حمل با فروشنده تا کارگاه"]);
  /* تأیید نهایی ← خطِ استعلام با ستون‌های کمیسیون از شرطِ شرکت */
  const fin = await call(`/sp/x/bundle/${sub.data.bundle_id}/decide`, { headers: HU, body: { action: "final" } });
  assert.equal(fin.status, 200, JSON.stringify(fin.data));
  const q = DB.raw.prepare("SELECT pay, deal, place, place_other, ship, valid_days, final FROM quotes WHERE assignment_id=1 AND item_id=31 AND supplier_name='سیمان شرق'").get();
  assert.deepEqual({ ...q }, { pay: "نقدی", deal: "کارگاه", place: "سایر", place_other: "کارگاه تونل البرز", ship: "حمل با فروشنده تا کارگاه", valid_days: "15", final: 1 });
});
