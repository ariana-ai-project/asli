/* ============================================================
   حداقلِ استعلام برای «تولید جدول کمیسیون» — یک قاعده برای همه (مهر ۱۴۰۵، گزارشِ مالک)

   پنل پشتیبانی قواعدِ «حداقلِ استعلام» داشت ولی فقط کارشناس هوشمند با آن سنجیده می‌شد؛ «تولید جدول کمیسیون»ِ کارشناس و تبِ
   «تأیید کمیسیون» فقط عددِ ثابتِ مدیر را می‌دیدند. حالا:
   • حدِ هر قلم = بیشینهٔ پایهٔ مدیر (minSuppliers) و بازه‌های پشتیبانی (قیمت واحد، قیمت کل، مقدار)
   • نگهبانِ سرور (پنل و بات) همین را می‌سنجد و می‌گوید کدام قلم چند از چند دارد
   • جزئیاتِ ارجاع برای پنل کارشناس حدِ هر قلم را می‌دهد؛ تبِ «تأیید کمیسیون» حد و علتش را کنارِ هر قلم
   • بی بازه، همه همان پایه‌اند و کوئری اضافه‌ای زده نمی‌شود
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { itemNeeds } from "../../../worker/ai-rules.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", TG_WEBHOOK_SECRET: "raz-e-server" };
const T0 = Date.now() - 3600000;
if (DB) {
  await ensureSchema(env);
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','یک','1111',1,1,?)").run(T0);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-N','1405/07/20','پروژهٔ حد')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-N',1,3,?,?)").run(T0, T0);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (?,'R-N',?,?,?,?,?,'open',1)");
  it.run(31, "a", 1, "پمپ گران", 1, "دستگاه");
  it.run(32, "b", 2, "پیچ ارزان", 100, "عدد");
  const q = DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (?,1,?,?,?,?,?,'10','نقدی','رسمی','دارد',1,?,'panel','history',?,?)`);
  q.run(201, 31, "الف", "دستگاه", 1, 2000000000, 1, T0, T0);
  q.run(202, 32, "ب", "عدد", 100, 50000, 1, T0, T0);
  DB.raw.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('minSuppliers','1',?) ON CONFLICT(key) DO UPDATE SET value='1'").run(T0);
}

async function call(method, path, { body, token, expert } = {}) {
  const headers = {};
  if (token) headers["X-Support-Token"] = token;
  if (expert) headers["X-Expert-Code"] = expert;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() };
}
let TOKEN = null;

test("بی بازه: حدِ همهٔ اقلام همان پایهٔ مدیر و بی کوئریِ پیشنهادها", { skip: SKIP }, async () => {
  let n = 0;
  const spy = { DB: { prepare: (...a) => { n++; return DB.prepare(...a); }, batch: (x) => { n++; return DB.batch(x); } } };
  const m = await itemNeeds(spy, [1], [{ id: 31, qty: 1 }, { id: 32, qty: 100 }], 3, { unit: [], total: [], qty: [], waitHours: 24 });
  assert.deepEqual([...m.values()].map((x) => x.need), [3, 3]);
  assert.equal(n, 0, "قاعده‌ای نیست ← خواندنی نیست");
  const ex = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.equal(ex.status, 200, "پایهٔ ۱ و هر قلم یک استعلام ← جدول ساخته می‌شود");
  DB.raw.exec("UPDATE assignments SET commission_no=NULL, commission_at=NULL WHERE id=1");
});

test("بازهٔ پشتیبانی حدِ قلمِ گران را بالا می‌برد: نگهبانِ کارشناس، جزئیاتِ ارجاع و تبِ «تأیید کمیسیون»", { skip: SKIP }, async () => {
  TOKEN = (await call("POST", "/support/setup", { body: { pass: "1405" } })).data.token;
  assert.ok(TOKEN);
  const put = await call("PUT", "/support/ai/rules", { token: TOKEN, body: { unit: [{ from: "1,000,000,000", to: "", min: "2" }], total: [], qty: [], waitHours: "24" } });
  assert.equal(put.status, 200);

  /* کارشناس: قلمِ گران یک استعلام دارد ولی حدش ۲ است */
  const no = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.equal(no.status, 422);
  assert.match(no.data.error, /پمپ گران \(۱ از ۲\)/);
  assert.doesNotMatch(no.data.error, /پیچ ارزان/, "قلمِ ارزان به حدِ پایه رسیده");
  assert.deepEqual(no.data.missing.map((x) => [x.title, x.n, x.need]), [["پمپ گران", 1, 2]]);
  assert.match(no.data.missing[0].why, /قیمت واحد/);

  /* پنل کارشناس حدِ هر قلم را از جزئیاتِ ارجاع می‌گیرد */
  const d = await call("GET", "/assignments/1", { expert: "1111" });
  assert.equal(d.status, 200);
  assert.equal(d.data.need.base, 1);
  assert.equal(d.data.need.items[31].need, 2);
  assert.equal(d.data.need.items[31].ruled, true);
  assert.equal(d.data.need.items[32].need, 1);

  /* تبِ «تأیید کمیسیون»: حد، علت و شمارِ بازه‌ها */
  const l = await call("GET", "/support/commission?scope=open", { token: TOKEN });
  assert.equal(l.status, 200);
  assert.equal(l.data.min, 1);
  assert.equal(l.data.rules, 1);
  const by = Object.fromEntries(l.data.items.map((i) => [i.id, i]));
  assert.equal(by[31].need, 2); assert.equal(by[31].saved, 1); assert.match(by[31].why, /قیمت واحد/);
  assert.equal(by[32].need, 1);

  /* پیشنهادِ دومی برای قلمِ گران ← جدول باز می‌شود */
  DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (203,1,31,'ج','دستگاه',1,1900000000,'10','نقدی','رسمی','دارد',1,0,'panel','history',?,?)`).run(T0, T0);
  const ok = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.commission_no);
});
