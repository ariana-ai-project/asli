/* ============================================================
   باگ‌های بازبینیِ مهر ۱۴۰۵ — مسیرهای Worker روی SQLite واقعی (همان طرحِ ensureSchema)

   هر تست یکی از خطاهایی است که پیش از این اصلاح بازتولید شد:
   • GET /experts کدِ ورودِ همهٔ کارشناسان را به هر کارشناسی می‌داد (کد همان رمز است)
   • جایگزینیِ فایل پیش‌فاکتور از پنل، خوانده‌های فایل قبلی را نگه می‌داشت
   • تغییر کارشناس روی کسی که ارجاعِ ارسال‌نشده روی همان درخواست داشت، کار را «ارسال‌نشده» می‌کرد
   • پیام‌های تصمیم بعد از استفادهٔ دوبارهٔ شناسهٔ تصمیم بی‌صدا دور ریخته می‌شد
   • سرآیند فرم کمیسیون ویرایشِ کارشناس را نمی‌خواند
   • حذف درخواست پیام‌های در صف را کامل پاک نمی‌کرد و جستجوهای هوشمند به قلمِ تازه می‌چسبید
   • نامهٔ ناموفق دوباره نوشته نمی‌شد (۴۰۹)
   • رمز تب پشتیبانی با رقم فارسی ذخیره می‌شد ولی کار نمی‌کرد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { bundleData } from "../../../worker/bundle.js";
import { getSettings } from "../../../worker/settings.js";
import { checkSiteCode, putSite } from "../../../worker/site.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
/* انبار فایلِ بدلی به شکل Workers KV (storage.js:kvStore) */
const kv = new Map();
const FILES = {
  async put(k, body, opts) { kv.set(k, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), meta: opts && opts.metadata }); },
  async getWithMetadata(k) { const v = kv.get(k); return v ? { value: new Response(v.bytes).body, metadata: v.meta } : { value: null }; },
  async delete(k) { kv.delete(k); },
};
/* بدون TG_BOT_TOKEN: پیام‌ها در صف می‌مانند و شبکه‌ای در کار نیست */
const env = { DB, MANAGER_CODE: "4321", FILES };
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (?,?,?,?,1,1,?,?)");
  ex.run(1, "کارشناس یک", "یک", "1111", "700", t);
  ex.run(2, "کارشناس دو", "دو", "2222", null, t);
  ex.run(3, "کارشناس سه", "سه", "3333", "900", t);
  const rq = DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES (?,'1405/07/01',?)");
  for (const n of [1, 2, 3, 5, 6]) rq.run(`R-${n}`, `پروژهٔ ${n}`);
  const as = DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (?,?,?,?,?,?)");
  as.run(1, "R-1", 1, 3, t, t);
  as.run(2, "R-2", 1, 3, t, t);      /* ارسال‌شده؛ به کارشناس ۲ منتقل می‌شود… */
  as.run(3, "R-2", 2, 2, null, t);   /* …که روی همین درخواست ارجاعِ ارسال‌نشده دارد */
  as.run(4, "R-3", 1, 3, t, t);
  as.run(5, "R-5", 1, 3, null, t);
  as.run(6, "R-6", 3, 3, t, t);
  const it = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,1,'عدد','open',?)");
  it.run(11, "R-1", "a", 1, "قلم یک", 1); it.run(12, "R-1", "b", 2, "قلم دو", 1);
  it.run(21, "R-2", "a", 1, "قلم یک", 2); it.run(22, "R-2", "b", 2, "قلم دو", 3);
  it.run(31, "R-3", "a", 1, "قلم یک", 4);
  it.run(51, "R-5", "a", 1, "قلم یک", 5); it.run(52, "R-5", "b", 2, "قلم دو", null);
  it.run(61, "R-6", "a", 1, "قلم یک", 6);
}

async function call(method, path, { body, expert, raw, ctype } = {}) {
  const headers = expert ? { "X-Expert-Code": expert } : { "X-Manager-Code": "4321" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (ctype) headers["Content-Type"] = ctype;
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, {
    method, headers, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  }), env, { waitUntil() {} });
  const ct = res.headers.get("content-type") || "";
  return { status: res.status, data: ct.includes("json") ? await res.json() : await res.text() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("فهرست کارشناسان فقط برای مدیر است و کد ورود در آن نیست", { skip: SKIP }, async () => {
  const asExpert = await call("GET", "/experts", { expert: "1111" });
  assert.equal(asExpert.status, 401);
  assert.doesNotMatch(JSON.stringify(asExpert.data), /2222|3333/, "کد کارشناس دیگر بیرون نمی‌رود");
  const asManager = await call("GET", "/experts");
  assert.equal(asManager.status, 200);
  /* مهر ۱۴۰۵: مدیر هم کد نمی‌بیند — کدها فقط در پنل پشتیبانی (/support/codes) */
  assert.ok(asManager.data.experts.length >= 2);
  assert.doesNotMatch(JSON.stringify(asManager.data), /2222|3333/, "پنل مدیر کدها را نمی‌بیند");
});

test("جایگزینیِ فایل پیش‌فاکتور از پنل، خوانده‌های فایل قبلی را پاک می‌کند", { skip: SKIP }, async () => {
  const up = (name) => call("POST", `/proformas/upload?assignment_id=1&supplier_name=${encodeURIComponent("تأمین آزمون")}&filename=${encodeURIComponent(name)}`,
    { expert: "1111", raw: new TextEncoder().encode("%PDF-1.4 " + name), ctype: "application/pdf" });
  assert.equal((await up("v1.pdf")).status, 200);
  DB.raw.prepare("UPDATE proformas SET extracted_json=?, extract_state='ok', extract_at=? WHERE assignment_id=1")
    .run(JSON.stringify({ result: { extractable: true, currency: "ریال", lines: [{ matched_item_id: 11, unit_price: 1000, qty: 1, confidence: "high" }] } }), Date.now());
  assert.equal((await up("v2.pdf")).status, 200);
  const p = DB.raw.prepare("SELECT id, filename, extracted_json, extract_state, extract_at FROM proformas WHERE assignment_id=1").get();
  assert.deepEqual([p.filename, p.extracted_json, p.extract_state, p.extract_at], ["v2.pdf", null, null, null]);
  const apply = await call("POST", `/proformas/${p.id}/apply`, { expert: "1111", body: {} });
  assert.equal(apply.status, 400, "خوانده‌ای برای فایل تازه نیست");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=1").get().n, 0, "قیمتِ فایل قبلی ننشست");
});

test("تغییر کارشناس روی کسی که ارجاعِ ارسال‌نشده روی همین درخواست دارد: کار ارسال‌شده می‌ماند", { skip: SKIP }, async () => {
  const r = await call("POST", "/reassign", { body: { assignment_id: 2, expert_id: 2, days: 4 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.assignment_id, 3, "به ارجاعِ موجودِ کارشناس دو رفت");
  const a = DB.raw.prepare("SELECT dispatched_at, days, deadline_at FROM assignments WHERE id=3").get();
  assert.ok(a.dispatched_at, "ارسال‌شده ماند — وگرنه در کارتابل دیده نمی‌شد ولی هشدارش می‌رفت");
  assert.equal(a.days, 4);
  assert.ok(a.deadline_at);
  assert.deepEqual(DB.raw.prepare("SELECT id FROM items WHERE assignment_id=3 ORDER BY id").all().map((x) => x.id), [21, 22]);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM assignments WHERE id=2").get().n, 0);
  const tray = await call("GET", "/tray", { expert: "2222" });
  assert.equal(tray.status, 200);
  assert.match(JSON.stringify(tray.data), /R-2/, "در کارتابل کارشناس تازه هست");
});

test("پیام‌های تصمیم بعد از استفادهٔ دوبارهٔ شناسهٔ تصمیم هم به صف می‌روند", { skip: SKIP }, async () => {
  await call("PUT", "/settings", { body: { approvalRequired: true } });
  DB.raw.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('managerChat',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify("-1001"), Date.now());
  const ask = async () => (await call("POST", "/assignments/6/decision", { expert: "3333", body: { action: "hold" } })).data;
  const keys = () => DB.raw.prepare("SELECT idem FROM outbox WHERE idem LIKE 'dec:%' ORDER BY id").all().map((r) => r.idem);

  const d1 = await ask();
  assert.equal(d1.pending, true);
  assert.equal((await call("POST", `/decisions/${d1.decision_id}/reject`, { body: { note: "فعلاً نه" } })).status, 200);
  assert.equal(keys().length, 2, "درخواستِ تأیید برای مدیر و پاسخ برای کارشناس");

  /* حذف درخواست‌ها تصمیم‌هایشان را هم می‌برد، پس شناسه دوباره داده می‌شود */
  DB.raw.exec("UPDATE outbox SET status='sent' WHERE idem LIKE 'dec:%'; DELETE FROM decisions;");
  await wait(5);
  const d2 = await ask();
  assert.equal(d2.decision_id, d1.decision_id, "همان شناسه");
  assert.equal((await call("POST", `/decisions/${d2.decision_id}/approve`)).status, 200);
  assert.equal(keys().length, 4, "پیام‌های تصمیمِ تازه با پیام‌های قدیمیِ همان شناسه تداخل نکردند");
  await call("PUT", "/settings", { body: { approvalRequired: false } });
});

test("سرآیند فرم کمیسیون همان سه فیلدی است که کارشناس در تب استعلامات عوض می‌کند", { skip: SKIP }, async () => {
  const h = await call("PUT", "/requests/R-1/head", { expert: "1111", body: { req_type: "فوری", deal_type: "فروش", site: "کارگاه آزمون" } });
  assert.equal(h.status, 200);
  const d = await bundleData(env, 1, await getSettings(env), "آریانا");
  assert.deepEqual([d.request.head_req_type, d.request.head_deal_type, d.request.head_site], ["فوری", "فروش", "کارگاه آزمون"]);
});

test("حذف درخواست: همهٔ پیام‌های در صفِ ارجاع‌هایش پاک و جستجوهای هوشمند از شناسهٔ قلم جدا می‌شوند", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO smart_searches (item_id, assignment_id, expert_id, item_code, created_at) VALUES (31, 4, 1, 'C-31', ?)").run(t);
  DB.raw.prepare("INSERT INTO decisions (id, assignment_id, expert_id, action, requested_at) VALUES (99, 4, 1, 'hold', ?)").run(t);
  const q = DB.raw.prepare("INSERT INTO outbox (idem,channel,target,payload_json,status,next_at,created_at) VALUES (?,'telegram','700','{}','pending',?,?)");
  const gone = ["dispatch:4:1", "dispatch:4", "stage:4:0:1", "over:4:1", "over-mgr:4:1", "over-team:4:1", "mgr:4:1:x", "team:4:1:x",
    "closed:4:1", "closed-team:4:1", "partial:4:1", "state:4:hold:1", "dec:99:1:ask"];
  const stay = ["dispatch:44:1", "stage:40:0:1", "mgr:41:1:x"];
  for (const k of [...gone, ...stay]) q.run(k, t, t);

  const del = await call("POST", "/requests/delete", { body: { ids: ["R-3"] } });
  assert.equal(del.status, 200);
  const mine = new Set([...gone, ...stay]);
  const left = DB.raw.prepare("SELECT idem FROM outbox WHERE status='pending'").all().map((r) => r.idem).filter((k) => mine.has(k)).sort();
  assert.deepEqual(left, [...stay].sort(), "فقط پیام‌های ارجاع‌های دیگر ماند");
  const s = DB.raw.prepare("SELECT item_id, item_code FROM smart_searches").get();
  assert.deepEqual([s.item_id, s.item_code], [0, "C-31"], "جستجو با کد قلم پیدا می‌شود، ولی دیگر به شناسهٔ قلمِ حذف‌شده نمی‌چسبد");
});

test("انتخاب کارشناس برای اقلامِ بی‌کارشناس، ارجاعِ کارشناس دیگرِ همان درخواست را دست نمی‌زند", { skip: SKIP }, async () => {
  const r = await call("POST", "/assign", { body: { request_id: "R-5", expert_id: 2, item_ids: [52] } });
  assert.equal(r.status, 200);
  const rows = DB.raw.prepare("SELECT i.id, a.expert_id FROM items i LEFT JOIN assignments a ON a.id=i.assignment_id WHERE i.request_id='R-5' ORDER BY i.id").all();
  assert.deepEqual(rows.map((x) => [x.id, x.expert_id]), [[51, 1], [52, 2]]);
});

test("نامه‌ای که نگارشش شکست خورده، دوباره نوشته می‌شود", { skip: SKIP }, async () => {
  const t = Date.now();
  DB.raw.prepare("INSERT INTO letters (id, assignment_id, expert_id, state, transcript, created_at, updated_at) VALUES (5, 1, 1, 'failed', ?, ?, ?)")
    .run("خرید این اقلام با تأیید کمیسیون از کم‌قیمت‌ترین تأمین‌کننده انجام شد.", t, t);
  const write = () => call("POST", "/assignments/1/letter/write", { expert: "1111", body: { letter_id: 5, subject_titles: ["قلم یک"] } });
  const w = await write();
  assert.equal(w.status, 200, "از بررسیِ وضعیت گذشت");
  assert.equal(w.data.available, false, "و به کلیدِ مدل رسید (در تست ست نشده)");
  DB.raw.prepare("UPDATE letters SET state='written' WHERE id=5").run();
  assert.equal((await write()).status, 409, "نامهٔ نوشته‌شده همچنان دوباره نوشته نمی‌شود");
});

test("رمز تب پشتیبانی با رقم فارسی هم ذخیره و هم پذیرفته می‌شود", { skip: SKIP }, async () => {
  await putSite(env, { pass: "۵۶۷۸" }, "4321");
  for (const c of ["5678", "۵۶۷۸", "٥٦٧٨", " ۵۶۷۸ "]) assert.equal(await checkSiteCode(env, c), true, `«${c}»`);
  assert.equal(await checkSiteCode(env, "۴۳۲۱"), true, "کد مدیر با رقم فارسی");
  assert.equal(await checkSiteCode(env, "5679"), false);
});
