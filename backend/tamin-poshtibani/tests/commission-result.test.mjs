/* ============================================================
   نتیجهٔ کمیسیون و پیامِ تشکر (مهر ۱۴۰۵، درخواست مالک)
   • پشتیبانی برندهٔ هر قلم و علتش را ثبت می‌کند؛ تیکِ «تأیید کمیسیون» همان اقلام زده می‌شود
   • به تأمین‌کنندهٔ برنده‌نشده‌ای که گفت‌وگو دارد یک پیامِ تشکر با علت می‌رود — فقط یک بار
   • استعلامِ دستیِ بی گفت‌وگو پیامی نمی‌گیرد؛ برنده باید یکی از استعلام‌های همان قلم باشد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا" };
const T0 = Date.now();
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
const call = async (method, path, body, token) => {
  const h = { "Content-Type": "application/json" };
  if (token) h["X-Support-Token"] = token;
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
let TOKEN = null;
if (DB) {
  await ensureSchema(env);
  run("DELETE FROM experts");
  run("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس','کارشناس','7001',1,1,?)", T0);
  run("INSERT INTO requests (id,date,party) VALUES ('R-1','1405/07/16','پروژهٔ آزمایشی')");
  run("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-1',1,3,?,?)", T0, T0);
  run("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (1,'R-1','a',1,'دیسک ترمز',2,'عدد','open',1), (2,'R-1','b',2,'لنت',4,'عدد','open',1)");
  run("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (1,'شرکت الف','شرکت الف',0,?), (2,'شرکت ب','شرکت ب',0,?)", T0, T0);
  run("INSERT INTO sp_phones (id,supplier_id,phone,k,created_at) VALUES (1,1,'09120000001','k1',?), (2,2,'09120000002','k2',?)", T0, T0);
  run("INSERT INTO sp_threads (id,assignment_id,request_id,supplier_id,phone_id,last_at,created_at) VALUES (1,1,'R-1',1,1,?,?), (2,1,'R-1',2,2,?,?)", T0, T0, T0, T0);
  const q = DB.raw.prepare("INSERT INTO quotes (id,assignment_id,item_id,supplier_name,price,qty,unit,saved,final,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,1,?,?)");
  q.run(11, 1, 1, "شرکت الف", 1000, 2, "عدد", T0, T0);
  q.run(12, 1, 1, "شرکت ب", 900, 2, "عدد", T0, T0);
  q.run(13, 1, 1, "فروشگاه دستی", 950, 2, "عدد", T0, T0);
  q.run(21, 1, 2, "شرکت الف", 50, 4, "عدد", T0, T0);
  q.run(22, 1, 2, "شرکت ب", 60, 4, "عدد", T0, T0);
  TOKEN = (await call("POST", "/support/setup", { pass: "9753" })).data.token;
}
const msgs = (th) => DB.raw.prepare("SELECT body, meta_json FROM sp_msgs WHERE thread_id=? ORDER BY id").all(th);

test("پیشنهادهای هر قلم با گفت‌وگوی تأمین‌کننده", { skip: SKIP }, async () => {
  const r = await call("GET", "/support/commission/result?aid=1", null, TOKEN);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const it1 = r.data.items.find((i) => i.id === 1);
  assert.deepEqual(it1.quotes.map((q) => [q.supplier, q.thread_id]), [["شرکت ب", 2], ["فروشگاه دستی", null], ["شرکت الف", 1]], "به ترتیبِ قیمت؛ دستی بی گفت‌وگو");
  assert.ok(r.data.reasons.some((x) => x.key === "price"));
});

test("ثبتِ برنده و علت: تأیید کمیسیون و پیامِ تشکر به برنده‌نشده‌ها، یک بار", { skip: SKIP }, async () => {
  const bad = await call("POST", "/support/commission/result", { assignment_id: 1, items: [{ item_id: 1, quote_id: 21, reason: "price" }] }, TOKEN);
  assert.equal(bad.status, 400, "برنده باید از استعلام‌های همان قلم باشد");
  const noWhy = await call("POST", "/support/commission/result", { assignment_id: 1, items: [{ item_id: 1, quote_id: 12, reason: "other" }] }, TOKEN);
  assert.equal(noWhy.status, 400, "«علت دیگر» متن می‌خواهد");
  const r = await call("POST", "/support/commission/result", { assignment_id: 1, sms: false, items: [
    { item_id: 1, quote_id: 12, reason: "price" }, { item_id: 2, quote_id: 21, reason: "time" }] }, TOKEN);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.saved, 2);
  assert.equal(r.data.messages, 2, "یک پیام برای هر گفت‌وگوی برنده‌نشده");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM items WHERE assignment_id=1 AND commission_ok=1").get().n, 2, "تیکِ تأیید کمیسیون");
  const a = msgs(1), b = msgs(2);
  assert.equal(a.length, 1); assert.equal(b.length, 1);
  assert.match(a[0].body, /«دیسک ترمز»/); assert.match(a[0].body, /به‌خاطرِ قیمتِ پایین‌تر/);
  assert.doesNotMatch(a[0].body, /لنت/, "الف در لنت برنده است");
  assert.match(b[0].body, /«لنت»/); assert.match(b[0].body, /زمانِ تحویلِ کوتاه‌تر/);
  assert.match(b[0].body, /امیدواریم در خریدهای بعدی/);
  assert.equal(JSON.parse(a[0].meta_json).sys, "regret");
  const res = DB.raw.prepare("SELECT item_id, winner, reason FROM commission_results ORDER BY item_id").all().map((x) => [x.item_id, x.winner, x.reason]);
  assert.deepEqual(res, [[1, "شرکت ب", "price"], [2, "شرکت الف", "time"]]);
  /* ثبتِ دوباره (برنده عوض شد) کسی را دوبار خبر نمی‌کند */
  const again = await call("POST", "/support/commission/result", { assignment_id: 1, sms: false, items: [{ item_id: 1, quote_id: 11, reason: "record" }] }, TOKEN);
  assert.equal(again.status, 200);
  assert.equal(msgs(1).length, 1, "الف برای دیسک قبلاً پیام گرفته بود");
  assert.equal(msgs(2).length + 0, 2, "ب حالا برای دیسک برنده نیست و یک بار خبردار می‌شود");
  assert.equal(DB.raw.prepare("SELECT winner FROM commission_results WHERE item_id=1").get().winner, "شرکت الف");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='commission_result'").get(), "رخداد");
});

test("حذفِ درخواست نتیجه و یادداشت‌های پیام را هم پاک می‌کند", { skip: SKIP }, async () => {
  const res = await route(new Request("https://x/tamin-poshtibani/api/requests/delete", { method: "POST", headers: { "Content-Type": "application/json", "X-Manager-Code": "4321" }, body: JSON.stringify({ ids: ["R-1"] }) }), env, { waitUntil() {} });
  assert.equal(res.status, 200);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM commission_results").get().n, 0);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM commission_notes").get().n, 0);
});
