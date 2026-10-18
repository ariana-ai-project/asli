/* ============================================================
   حداقلِ استعلام برای «تولید جدول کمیسیون» — یک قاعده برای همه (مهر ۱۴۰۵، گزارشِ مالک)

   از مهر ۱۴۰۵ (تصمیمِ مالک، برچسبِ اندازه — worker/size.js) حدِ هر قلم ردهٔ اندازهٔ خودِ همان قلم است:
   • ردهٔ «بالاترین پیشنهادِ کل» (قیمت واحد × مقدار)، وگرنه برآوردِ کل، وگرنه «جزئی» ← minQ: جزئی ۳، متوسط ۵، بزرگ ۵، عمده ۷
   • استعلام‌ها از تأمین‌کنندگانِ مختلف شمرده می‌شوند
   • نگهبانِ سرور (پنل و بات) می‌گوید کدام قلم در کدام رده چند از چند دارد؛ جزئیاتِ ارجاع و تبِ «تأیید کمیسیون» همان حد را دارند
   • برچسبِ درخواست در لحظهٔ جدول کمیسیون روی ارجاع می‌نشیند (assignments.size_cm)
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

const Q = DB ? DB.raw.prepare(`INSERT INTO quotes (id,assignment_id,item_id,supplier_name,unit,qty,price,dtime,pay,invoice,vat,saved,final,source,origin,created_at,updated_at)
    VALUES (?,1,?,?,?,?,?,'10','نقدی','رسمی','دارد',1,?,'panel','history',?,?)`) : null;

test("حدِ هر قلم از ردهٔ خودش: بالاترین پیشنهادِ کل، وگرنه برآورد، وگرنه جزئی", { skip: SKIP }, async () => {
  const sr = { th: [50e6, 200e6, 5e9], minQ: { s: 3, m: 5, l: 6, b: 7 }, waveAt: 20 };
  /* پمپ: ۲ میلیارد ریال = ۲۰۰ میلیون تومان ← متوسط؛ پیچ: ۱۰۰ × ۵۰ هزار ریال = ۵۰۰ هزار تومان ← جزئی؛ ۳۳: بی پیشنهاد با برآورد ← بزرگ */
  const m = await itemNeeds(env, [1], [{ id: 31, qty: 1 }, { id: 32, qty: 100 }, { id: 33, qty: 10, est_unit_rial: 3e9 }, { id: 34, qty: 1 }], null, null, sr);
  assert.deepEqual([31, 32, 33, 34].map((k) => [m.get(k).cat, m.get(k).need, m.get(k).src]), [["m", 5, "quote"], ["s", 3, "quote"], ["l", 6, "est"], ["s", 3, "none"]]);
  assert.match(m.get(31).why, /ردهٔ «متوسط» — بالاترین پیشنهادِ کل ≈ ۲۰۰ میلیون تومان ← ۵/);
  assert.match(m.get(33).why, /برآوردِ کل/);
});

test("نگهبانِ جدول کمیسیون، جزئیاتِ ارجاع و تبِ «تأیید کمیسیون» با ردهٔ هر قلم؛ تأمین‌کنندگانِ مختلف؛ برچسبِ کمیسیون", { skip: SKIP }, async () => {
  TOKEN = (await call("POST", "/support/setup", { body: { pass: "1405" } })).data.token;
  assert.ok(TOKEN);
  const no = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.equal(no.status, 422);
  assert.match(no.data.error, /پمپ گران \(ردهٔ «متوسط»: ۱ از ۵\)/);
  assert.match(no.data.error, /پیچ ارزان \(ردهٔ «جزئی»: ۱ از ۳\)/);
  assert.match(no.data.error, /استعلامِ بیشتر/);
  assert.deepEqual(no.data.missing.map((x) => [x.title, x.n, x.need, x.cat]), [["پمپ گران", 1, 5, "m"], ["پیچ ارزان", 1, 3, "s"]]);

  const d = await call("GET", "/assignments/1", { expert: "1111" });
  assert.equal(d.status, 200);
  assert.equal(d.data.need.base, 3);
  assert.equal(d.data.need.items[31].need, 5);
  assert.equal(d.data.need.items[31].cat, "m");
  assert.equal(d.data.need.items[32].need, 3);

  const l = await call("GET", "/support/commission?scope=open", { token: TOKEN });
  assert.equal(l.status, 200);
  const by = Object.fromEntries(l.data.items.map((i) => [i.id, i]));
  assert.equal(by[31].need, 5); assert.equal(by[31].cat, "m"); assert.match(by[31].why, /متوسط/);
  assert.equal(by[32].need, 3);

  /* دو خطِ دیگر از همان تأمین‌کننده یکی حساب می‌شوند */
  Q.run(210, 32, "ب", "عدد", 100, 51000, 0, T0, T0);
  Q.run(211, 32, "ب", "عدد", 100, 52000, 0, T0, T0);
  const still = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.match(still.data.error, /پیچ ارزان \(ردهٔ «جزئی»: ۱ از ۳\)/, "تأمین‌کنندگانِ مختلف");
  /* پیشنهادِ بزرگ‌تر رده را بالا می‌برد: پمپ ۶ میلیارد ریال = ۶۰۰ میلیون تومان ← بزرگ (۵) */
  Q.run(212, 31, "ج", "دستگاه", 1, 6000000000, 0, T0, T0);
  const up = await call("GET", "/assignments/1", { expert: "1111" });
  assert.equal(up.data.need.items[31].cat, "l");
  for (const [id, it, sup] of [[213, 31, "د"], [214, 31, "ه"], [215, 31, "و"], [216, 32, "ز"], [217, 32, "ح"]]) Q.run(id, it, sup, it === 31 ? "دستگاه" : "عدد", it === 31 ? 1 : 100, it === 31 ? 2100000000 : 50000, 0, T0, T0);
  const ok = await call("POST", "/assignments/1/commission", { expert: "1111", body: {} });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.commission_no);
  /* برچسبِ کمیسیون: پمپ ۶ میلیارد + پیچ ۱۰۰ × ۵۲ هزار = ۶٫۰۰۵۲ میلیارد ریال ≈ ۶۰۰ میلیون تومان ← بزرگ */
  const sz = JSON.parse(DB.raw.prepare("SELECT size_cm FROM assignments WHERE id=1").get().size_cm);
  assert.equal(sz.cat, "l");
  assert.equal(sz.total_rial, 6000000000 + 5200000);
  assert.equal(sz.partial, false);
  const l2 = await call("GET", "/support/commission?scope=open", { token: TOKEN });
  assert.equal(l2.data.items.find((i) => i.id === 31).size_cm.cat, "l", "پنل کمیسیون برچسب را دارد");
});
