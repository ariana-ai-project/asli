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

test("نظرسنجی پنل با اثر انگشت: چیزی عوض نشده ← {same} بی خواندن پیشنهادها؛ هر تغییر ← کامل", { skip: SKIP }, async () => {
  const t = await call("POST", "/support/tenders", { title: "پیچ M10", qty: 5, unit: "عدد", start_price: "50000", invites: [{ name: "آهن‌آلات پارس", phone: "09122222222" }] }, SUP);
  const id = t.data.tender.id;
  const L = await call("GET", "/support/tenders", null, SUP);
  assert.ok(L.data.fp && Array.isArray(L.data.tenders));
  const D = await call("GET", `/support/tenders/${id}`, null, SUP);
  assert.ok(D.data.fp && D.data.tender);
  /* همان اثر انگشت: پاسخ کوتاه و هیچ خواندنی از tender_bids */
  let bidReads = 0; const prep = DB.prepare;
  DB.prepare = (sql) => { if (/tender_bids/.test(sql)) bidReads++; return prep(sql); };
  try {
    const l2 = await call("GET", `/support/tenders?fp=${encodeURIComponent(L.data.fp)}`, null, SUP);
    const d2 = await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(D.data.fp)}`, null, SUP);
    assert.deepEqual([l2.data.same, d2.data.same], [true, true]);
    assert.equal(l2.data.tenders, undefined);
    assert.ok(d2.data.now > 0);
  } finally { DB.prepare = prep; }
  assert.equal(bidReads, 0, "نظرسنجیِ بی‌تغییر هیچ پیشنهادی نمی‌خواند");
  /* دعوت تازه: هم فهرست (شمار دعوت‌شده) هم جزئیات عوض می‌شود */
  await call("POST", `/support/tenders/${id}/invites`, { name: "بازرگانی نو", phone: "09133333334" }, SUP);
  const l3 = await call("GET", `/support/tenders?fp=${encodeURIComponent(L.data.fp)}`, null, SUP);
  const d3 = await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(D.data.fp)}`, null, SUP);
  assert.equal(l3.data.same, undefined, "فهرست تازه");
  assert.equal(d3.data.invites.length, 2, "جزئیات تازه");
  /* دیدن لینک توسط تأمین‌کننده (بی تغییر rev): فقط جزئیات عوض می‌شود */
  run("UPDATE tender_invites SET seen_at=? WHERE tender_id=? AND alias=(SELECT MIN(alias) FROM tender_invites WHERE tender_id=?)", Date.now(), id, id);
  const l4 = await call("GET", `/support/tenders?fp=${encodeURIComponent(l3.data.fp)}`, null, SUP);
  const d4 = await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(d3.data.fp)}`, null, SUP);
  assert.equal(l4.data.same, true);
  assert.ok(d4.data.invites.some((i) => i.seen_at), "«دید» تازه می‌رسد");
  /* پیشنهاد (rev) و کار جستجوی هوشمند */
  run("UPDATE tenders SET rev=rev+1 WHERE id=?", id);
  assert.equal((await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(d4.data.fp)}`, null, SUP)).data.same, undefined);
  const d5 = await call("GET", `/support/tenders/${id}`, null, SUP);
  run("INSERT INTO tender_jobs (tender_id, query, state, at) VALUES (?, 'q', 'pending', ?)", id, Date.now());
  assert.equal((await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(d5.data.fp)}`, null, SUP)).data.same, undefined, "کار تازهٔ جستجو");
});

test("زمان‌شمار: رسیدنِ زمانِ شروع (بی هیچ تغییری در ردیف) هم پنل پشتیبانی هم صفحهٔ تأمین‌کننده را به «زنده» می‌برد", { skip: SKIP }, async () => {
  const t = await call("POST", "/support/tenders", { title: "مهره M12", qty: 10, unit: "عدد", start_price: "40000", invites: [{ name: "فولاد البرز", phone: "09121111111" }] }, SUP);
  const id = t.data.tender.id, code = t.data.tender.code;
  const s = await call("POST", `/support/tenders/${id}/schedule`, { start_in_min: 10, duration_min: 30 }, SUP);
  assert.equal(s.data.tender.state, "scheduled");
  const L = await call("GET", "/support/tenders", null, SUP), D = await call("GET", `/support/tenders/${id}`, null, SUP);
  const pp = await call("POST", `/support/tenders/${id}/invites/${D.data.invites[0].alias}/pass`, {}, SUP);
  const A = { "X-Tender-Token": (await call("POST", `/tender/${code}/login`, { phone: "09121111111", pass: pp.data.pass })).data.token };
  const v = (await call("GET", `/tender/${code}/state`, null, A)).data;
  assert.equal(v.tender.state, "scheduled");
  assert.equal((await call("GET", `/tender/${code}/state?rev=${v.tender.rev}&st=scheduled`, null, A)).data.same, true, "پیش از شروع: همان");
  /* گذشتِ زمان: زمانِ شروع و پایانِ دور در گذشته/آینده، بی rev و updated_at (همان چیزی که با گذشتِ ساعت پیش می‌آید) */
  const n = Date.now();
  run("UPDATE tenders SET start_at=?, end_at=? WHERE id=?", n - 1000, n + 30 * 60e3, id);
  const l2 = await call("GET", `/support/tenders?fp=${encodeURIComponent(L.data.fp)}`, null, SUP);
  assert.equal(l2.data.same, undefined, "فهرست: شروعِ مناقصه دیده می‌شود");
  assert.equal(l2.data.tenders.find((x) => x.id === id).state, "live");
  const d2 = await call("GET", `/support/tenders/${id}?fp=${encodeURIComponent(D.data.fp)}`, null, SUP);
  assert.equal(d2.data.same, undefined, "جزئیات: شروعِ مناقصه دیده می‌شود");
  assert.equal(d2.data.tender.state, "live");
  const v2 = (await call("GET", `/tender/${code}/state?rev=${v.tender.rev}&st=scheduled`, null, A)).data;
  assert.equal(v2.same, undefined, "صفحهٔ تأمین‌کننده: نمای کامل با وضعیت زنده، نه «همان»");
  assert.equal(v2.tender.state, "live");
  assert.equal((await call("GET", `/tender/${code}/state?rev=${v2.tender.rev}&st=live`, null, A)).data.same, true, "بعدش دوباره «همان»");
  /* دورِ سربسته تمام شد ← زنده (همین راه) */
  run("UPDATE tenders SET sealed_end_at=?, sealed_done=1 WHERE id=?", n + 5 * 60e3, id);
  const v3 = (await call("GET", `/tender/${code}/state?rev=${v2.tender.rev}&st=live`, null, A)).data;
  assert.equal(v3.tender.state, "sealed", "ورود به دور سربسته هم دیده می‌شود");
});

test("فهرست خالی: جستجوی قلم با همان راه قبلی", { skip: SKIP }, async () => {
  run("DELETE FROM cat_heads"); run("DELETE FROM cat_codes"); resetCatalogCache();
  const r = await call("GET", "/support/tender-items?q=" + encodeURIComponent("میلگرد"), null, SUP);
  assert.equal(r.data.items[0].item_code, "M16");
  assert.equal(r.data.items[0].n, 4, "راه قبلی همهٔ ردیف‌های کد را می‌شمارد");
});
