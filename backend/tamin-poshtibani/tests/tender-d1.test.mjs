/* ============================================================
   مناقصه و سقف روزانهٔ خواندن D1 (مهر ۱۴۰۵): جزئیات مناقصهٔ زنده هر ۳ ثانیه تازه می‌شد و هر بار سوابق
   قیمت را با شرط تنهای item_code=? می‌خواند — کل purchases (۷۱ هزار ردیف) در هر بار؛ در چند دقیقه
   ۵ میلیون ردیف رد شد. حالا:
   • سوابق قیمت و تأمین‌کنندگان یک کد با کلید اصلی (head, item_code)، نوع قلم فایل از فهرست
   • جستجوی قلم از فهرست اقلام (cat_heads) با json_each، شمار خرید با کلید اصلی
   • جستجوی نام: اول جدول‌های کوچک، سوابق فقط اگر کم پیدا شد
   • کدی که در فهرست نیست / فهرست خالی ← همان راه قبلی (جستجوی کامل)
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { shardOf, resetCatalogCache } from "../../../worker/catalog.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "4321", COMPANY: "تونل سد آریانا", SITE_ORIGIN: "https://arianaai.website" };
const run = (sql, ...a) => DB.raw.prepare(sql).run(...a);
/* هر کوئری که کل purchases را بی کلید اصلی می‌خواند ثبت می‌شود */
const SCANS = [];
if (DB) {
  const prep = DB.prepare;
  DB.prepare = (sql) => {
    if (/FROM purchases WHERE (item_code=\?|\(title LIKE|supplier LIKE)/.test(sql.replace(/\s+/g, " "))) SCANS.push(sql.replace(/\s+/g, " ").slice(0, 80));
    return prep(sql);
  };
}
const call = async (method, path, body, headers) => {
  const res = await route(new Request("https://x/tamin-poshtibani/api" + path, { method, headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
};
let SUP = null;
const P = "INSERT INTO purchases (head,item_code,h,order_date,ym,qty,unit,amount,amount_adj,supplier,supplier_n,expert,title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
if (DB) {
  await ensureSchema(env);
  SUP = { "X-Support-Token": (await call("POST", "/support/setup", { pass: "9753" })).data.token };
  run(P, "میلگرد", "M16", "a1", "1404/05/01", 140405, 10, "تن", 9e9, 9e9, "فولاد البرز", "foulad alborz", "x", "میلگرد ۱۶");
  run(P, "میلگرد", "M16", "a2", "1404/09/01", 140409, 5, "تن", 5e9, 5e9, "فولاد البرز", "foulad alborz", "x", "میلگرد ۱۶");
  run(P, "میلگرد", "M16", "a3", "1404/10/01", 140410, 8, "تن", 8.4e9, 8.4e9, "آهن‌آلات پارس", "ahan pars", "x", "میلگرد ۱۶");
  run(P, "میلگرد", "M18", "b1", "1404/08/01", 140408, 4, "تن", 4.2e9, 4.2e9, "فولاد البرز", "foulad alborz", "x", "میلگرد ۱۸");
  /* ردیفی با همان کد زیر نوع قلم فایل دیگری: مسیر کلید اصلی فقط نوع قلم فایل فهرست را می‌خواند */
  run(P, "ضایعات", "M16", "z1", "1404/11/01", 140411, 1, "تن", 1e6, 1e6, "دلال", "dalal", "x", "میلگرد ۱۶ ضایعاتی");
  run(P, "سیمان", "C1", "c1", "1404/07/01", 140407, 30, "تن", 3e8, 3e8, "سیمان تهران", "siman tehran", "x", "سیمان پاکتی");
  /* فهرست: «میلگرد آهنی» (نام ذخیره‌شده) با نوع قلم فایل «میلگرد»؛ «سیمان» بی src (همان نام) */
  const items = (xs) => xs.map(([c, t]) => [c, t, "C01", "100003", {}, "", null]);
  run("INSERT INTO cat_heads (head, part, data) VALUES (?,?,?)", "میلگرد آهنی", 0, JSON.stringify({ ref: "تن", src: ["میلگرد"], items: items([["M16", "میلگرد 16"], ["M18", "میلگرد 18"], ["M20", "میلگرد 20"]]) }));
  run("INSERT INTO cat_heads (head, part, data) VALUES (?,?,?)", "سیمان", 0, JSON.stringify({ ref: "تن", items: items([["C1", "سیمان پاکتی"]]) }));
  const shards = new Map();
  for (const [c, h] of [["M16", "میلگرد آهنی"], ["M18", "میلگرد آهنی"], ["M20", "میلگرد آهنی"], ["C1", "سیمان"]]) {
    const s = shardOf("code", c); shards.set(s, { ...(shards.get(s) || {}), [c]: h });
  }
  for (const [s, d] of shards) run("INSERT INTO cat_codes (shard, data) VALUES (?,?)", s, JSON.stringify(d));
  resetCatalogCache();
}

test("جستجوی قلم از فهرست: همان معنا (عنوان یا ابتدای کد)، فقط خریده‌شده‌ها، پرخریدتر اول — بی خواندن کل سوابق", { skip: SKIP }, async () => {
  SCANS.length = 0;
  const r = await call("GET", "/support/tender-items?q=" + encodeURIComponent("میلگرد"), null, SUP);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.items.map((x) => [x.item_code, x.n, x.sups]), [["M16", 3, 2], ["M18", 1, 1]], "M20 خرید ندارد؛ ردیف «ضایعات» شمرده نمی‌شود");
  assert.equal(r.data.items[0].head, "میلگرد");
  assert.equal(r.data.items[0].unit, "تن");
  const two = await call("GET", "/support/tender-items?q=" + encodeURIComponent("میلگرد ۱۸"), null, SUP);
  assert.deepEqual(two.data.items.map((x) => x.item_code), ["M18"], "همهٔ واژه‌ها؛ رقم فارسی جستجو = رقم لاتین عنوان");
  const code = await call("GET", "/support/tender-items?q=M1", null, SUP);
  assert.deepEqual(code.data.items.map((x) => x.item_code).sort(), ["M16", "M18"], "ابتدای کد");
  const cem = await call("GET", "/support/tender-items?q=" + encodeURIComponent("سیمان"), null, SUP);
  assert.deepEqual(cem.data.items.map((x) => [x.item_code, x.head]), [["C1", "سیمان"]], "نوع قلم بی src = همان نام");
  assert.deepEqual(SCANS, [], "هیچ خواندن کامل سوابق");
});

test("تأمین‌کنندگان و سوابق قیمت یک کد با کلید اصلی؛ کد بیرون از فهرست با همان راه قبلی", { skip: SKIP }, async () => {
  SCANS.length = 0;
  const s = await call("GET", "/support/tender-suppliers?code=M16", null, SUP);
  assert.deepEqual(s.data.suppliers.map((x) => [x.name, x.n]), [["فولاد البرز", 2], ["آهن‌آلات پارس", 1]], "«دلال» زیر نوع قلم دیگر نیست");
  const t = await call("POST", "/support/tenders", { title: "میلگرد ۱۶", item_code: "M16", qty: 20, unit: "تن", start_price: "1000000", invites: [{ name: "فولاد البرز", phone: "09121111111" }] }, SUP);
  assert.equal(t.status, 200, JSON.stringify(t.data));
  const d = await call("GET", `/support/tenders/${t.data.tender.id}`, null, SUP);
  assert.equal(d.data.hist.n, 3, "سه خرید M16 زیر «میلگرد»");
  assert.deepEqual(SCANS, [], "هیچ خواندن کامل سوابق");
  /* سوابق قیمت در حافظهٔ isolate: نظرسنجی‌های پیاپی دوباره نمی‌خوانند */
  let reads = 0; const prep = DB.prepare;
  DB.prepare = (sql) => { if (/FROM purchases/.test(sql)) reads++; return prep(sql); };
  try { for (let i = 0; i < 3; i++) await call("GET", `/support/tenders/${t.data.tender.id}`, null, SUP); }
  finally { DB.prepare = prep; }
  assert.equal(reads, 0, "سه بار تازه‌سازی، بی هیچ خواندن سوابق");
  /* کدی که در فهرست نیست: همان شرط تنها (چاره‌ای نیست) */
  run(P, "متفرقه", "X9", "x1", "1404/01/01", 140401, 1, "عدد", 5e5, 5e5, "فروشگاه", "forushgah", "x", "قلم بیرون از فهرست");
  const x = await call("GET", "/support/tender-suppliers?code=X9", null, SUP);
  assert.deepEqual(x.data.suppliers.map((r) => r.name), ["فروشگاه"]);
  assert.equal(SCANS.length, 1);
});

test("جستجوی نام: جدول‌های کوچک کافی‌اند ← سوابق خوانده نمی‌شود؛ کم پیدا شد ← سوابق هم", { skip: SKIP }, async () => {
  for (const [i, n] of ["فولاد البرز", "فولاد ارس", "فولاد کاوه", "فولاد زاگرس", "فولاد شرق"].entries()) run("INSERT INTO supplier_grades (sn, name, code, grade) VALUES (?,?,?,?)", "g" + i, n, "", "A");
  SCANS.length = 0;
  const a = await call("GET", "/support/tender-book?q=" + encodeURIComponent("فولاد"), null, SUP);
  assert.ok(a.data.suppliers.length >= 5);
  assert.deepEqual(SCANS, [], "پنج نام از رده‌بندی؛ سوابق خوانده نشد");
  const b = await call("GET", "/support/tender-book?q=" + encodeURIComponent("دلال"), null, SUP);
  assert.deepEqual(b.data.suppliers.map((x) => x.name), ["دلال"], "فقط در سوابق");
  assert.equal(SCANS.length, 1);
});

test("فهرست خالی: جستجوی قلم با همان راه قبلی", { skip: SKIP }, async () => {
  run("DELETE FROM cat_heads"); run("DELETE FROM cat_codes"); resetCatalogCache();
  const r = await call("GET", "/support/tender-items?q=" + encodeURIComponent("میلگرد"), null, SUP);
  assert.equal(r.data.items[0].item_code, "M16");
  assert.equal(r.data.items[0].n, 4, "راه قبلی همهٔ ردیف‌های کد را می‌شمارد");
});
