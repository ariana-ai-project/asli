/* ============================================================
   بررسی سوابق (مهر ۱۴۰۵، درخواست مالک — فاز ۱): «＋ لایهٔ تازه…» و قفلِ عنوان/مقدار در «📋 شرایط خرید»

   • نامِ لایهٔ تازه: سنجش (طول، حرف، تکرار) و ماندن برای همان نوع قلم (settings.customLayers)
   • ذخیرهٔ ساختار با لایهٔ بیرون از فهرستِ ثابت پذیرفته می‌شود؛ دفعهٔ بعد در layerNames همان نوع قلم
   • PUT /items/:id/locks: همان norm_json.locks (پس sp-core.js:lineLocks همان را می‌خواند) + سابقهٔ تغییر؛
     ذخیرهٔ بعدیِ ساختار بی title/qty قفل‌های قبلی را نگه می‌دارد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { newLayerName, addCustomLayers, withTqLocks, diffLines } from "../../../worker/structure.js";
import { tqKeep } from "../../../worker/normalize.js";
import { lineLocks } from "../../../worker/sp-core.js";

const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => {
  const wb = XL.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), name);
  return wb;
};
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const item = (code, title, head, attrs) => [code, title, head, "عدد", "C04", "200", "", attrs["اندازه"] || "", attrs["جنس"] || "", JSON.stringify(attrs)];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
const buy = (no, code, title, qty, supplier, grade, date = "1404/10/01") => [String(no), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + no : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)];
const books = () => ({
  items: book({
    items: [ITEM_HEAD, item("1001", "پیچ آلن M8 فولادی", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }), item("1003", "پیچ M10", "پیچ", { "اندازه": "M10" }), item("2001", "مهره M8", "مهره", { "اندازه": "M8" })],
    item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"], ["x", "x", "اندازه", "size", "x"], ["x", "x", "جنس", "material", "x"]],
  }),
  indices: book({
    class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"], ["20", "قطعات", "200", "اتصالات", "IDX_A"]],
    index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100]],
  }),
  units: book({
    head_rates: [["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    cluster_rates: [["کد خوشه", "نام خوشه", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"]],
  }),
  history: book({ "حداکثر 500000 رکورد": [H, buy(1, "1001", "پیچ آلن M8 فولادی", 40, "شرکت ب", "B"), buy(2, "1003", "پیچ M10", 30, "شرکت الف", "A"), buy(3, "2001", "مهره M8", 5, "مهره‌فروشی", "C")] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, SITE_ORIGIN: "https://site.test", TG_API_BASE: "https://tg.test/bot" };
const AI = { "X-Expert-Code": "8001" }, HUMAN = { "X-Expert-Code": "8002" };
if (DB) {
  await ensureSchema(env);
  const out = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: out.fp, meta: out.meta, stats: out.stats, filename: "test" });
  for (const [t, rows] of Object.entries(out.tables)) {
    for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  }
  await W.catalogFinish(env, { import_id: beg.import_id });
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'هوشمند','آقای هوشمند','8001',1,1,?), (2,'انسانی','خانم انسانی','8002',1,1,?)").run(t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-S1','1405/07/14','پروژهٔ ساختار'), ('R-S2','1405/07/14','پروژهٔ دستی')").run();
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (1,'R-S1',1,5,?,?), (2,'R-S2',2,5,?,?)").run(t, t, t, t);
  const ins = DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,qty,unit,state,assignment_id) VALUES (?,?,?,?,?,?,?,?,'open',?)");
  ins.run(51, "R-S2", "a", 1, "1001", "پیچ آلن M8 فولادی", 7, "عدد", 2);
  ins.run(52, "R-S2", "b", 2, "1003", "پیچ M10", 3, "عدد", 2);
  ins.run(53, "R-S2", "c", 3, "2001", "مهره M8", 3, "عدد", 2);
}
globalThis.fetch = async (url) => { throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${url}`); };
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
test("نامِ لایهٔ تازه: بی فاصلهٔ اضافه، حداکثر ۳۰ نویسه، با حرف، بی تکرار", () => {
  assert.deepEqual(newLayerName("  رنگ   بدنه "), { name: "رنگ بدنه" });
  assert.deepEqual(newLayerName("رنگ\u200cبدنه"), { name: "رنگ بدنه" }, "نیم‌فاصله همان فاصله");
  assert.match(newLayerName("").err, /بنویسید/);
  assert.match(newLayerName("x".repeat(31)).err, /حداکثر/);
  assert.match(newLayerName("123").err, /حرف/);
  assert.match(newLayerName("<b>").err, /نامجاز/);
  assert.match(newLayerName("جنس", ["جنس", "اندازه"]).err, /همین حالا/);
  assert.equal(newLayerName("ي".repeat(2)).name, "یی", "ی عربی ← فارسی");
});

test("فهرستِ لایه‌های تازهٔ هر نوع قلم: بی تکرار و با سقف", () => {
  let m = addCustomLayers(null, "پیچ", ["رنگ بدنه"]);
  m = addCustomLayers(m, "پیچ", ["رنگ بدنه", "برند"]);
  assert.deepEqual(m, { "پیچ": ["رنگ بدنه", "برند"] });
  assert.deepEqual(addCustomLayers(m, "", ["x"]), m, "بی نوع قلم دست نمی‌خورد");
  const many = addCustomLayers({}, "پیچ", Array.from({ length: 50 }, (_, i) => `لایه ${i}`));
  assert.equal(many["پیچ"].length, 40);
});

test("قفلِ عنوان و مقدار: withTqLocks فقط همان دو را عوض می‌کند و tqKeep قبلی‌ها را نگه می‌دارد", () => {
  const n = { head: "پیچ", layers: { "اندازه": "M8" }, locks: { title: true, qty: true, layers: { "اندازه": false } } };
  const a = withTqLocks(n, { qty: false });
  assert.deepEqual(a.locks, { title: true, qty: false, layers: { "اندازه": false } });
  assert.equal(n.locks.qty, true, "ورودی دست نخورد");
  assert.deepEqual(withTqLocks({ head: "پیچ", layers: {} }, { title: false }).locks, { title: false, qty: true, layers: {} });
  assert.deepEqual(tqKeep({ layers: { "اندازه": true } }, a), { layers: { "اندازه": true }, title: true, qty: false });
  assert.deepEqual(tqKeep({ title: false }, a), { title: false, qty: false }, "فرستاده‌شده بر قبلی مقدم است");
  assert.deepEqual(tqKeep(null, null), {});
});

test("ذخیرهٔ ساختار با «＋ لایهٔ تازه…»: پذیرفته، ماندگار برای همان نوع قلم، و کمّی نیست", { skip: SKIP }, async () => {
  const p = await call("/items/51/normalize", { headers: HUMAN, body: {} });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.ok(!p.data.layerNames.includes("رنگ بدنه"));
  const bad = await call("/items/51/norm", { method: "PUT", headers: HUMAN, body: { head: "پیچ", layers: { "اندازه": "M8", "جنس": "فولاد", ["x".repeat(31)]: "y" }, source: "catalog", code: "1001", reason: "آزمون" } });
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  const sv = await call("/items/51/norm", { method: "PUT", headers: HUMAN, body: { head: "پیچ", layers: { "اندازه": "M8", "جنس": "فولاد", "رنگ بدنه": "مشکی" }, source: "catalog", code: "1001", reason: "رنگ در نقشه آمده" } });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.equal(sv.data.norm.layers["رنگ بدنه"], "مشکی", "لایهٔ تازه متن می‌ماند");
  assert.equal(sv.data.norm.locks.layers["رنگ بدنه"], true);
  const st = JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='customLayers'").get().value);
  assert.deepEqual(st, { "پیچ": ["رنگ بدنه"] });
  assert.ok(diffLines(JSON.parse(DB.raw.prepare("SELECT diff_json FROM item_changes WHERE item_id=51 ORDER BY id DESC").get().diff_json)).includes("لایهٔ تازهٔ «رنگ بدنه»: «مشکی»"), "سابقهٔ تغییر");
  /* قلمِ دیگری از همان نوع: نامِ تازه در فهرست؛ نوعِ دیگر نه */
  const p2 = await call("/items/52/normalize", { headers: HUMAN, body: {} });
  assert.ok(p2.data.layerNames.includes("رنگ بدنه"));
  const p3 = await call("/items/53/normalize", { headers: HUMAN, body: {} });
  assert.ok(!p3.data.layerNames.includes("رنگ بدنه"));
  /* پنلِ تأمین‌کننده: قفلِ لایهٔ تازه مثلِ بقیه */
  const it = DB.raw.prepare("SELECT * FROM items WHERE id=51").get();
  assert.equal(lineLocks(it, [{ k: "رنگ بدنه", v: "مشکی" }]).layers["رنگ بدنه"], true);
});

test("قفلِ عنوان/مقدار از «📋 شرایط خرید»: همان لحظه در norm_json.locks و سابقه؛ ذخیرهٔ بعدیِ ساختار نگهش می‌دارد", { skip: SKIP }, async () => {
  const un = await call("/items/53/locks", { method: "PUT", headers: HUMAN, body: { qty: false } });
  assert.equal(un.status, 409, "قلمِ تأییدنشده: قفل با «تأییدِ ساختار» می‌رود");
  assert.equal(un.data.need_norm, true);
  const r = await call("/items/51/locks", { method: "PUT", headers: HUMAN, body: { qty: false } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.locks.qty, false);
  assert.equal(r.data.locks.title, true);
  const it = DB.raw.prepare("SELECT * FROM items WHERE id=51").get();
  assert.equal(JSON.parse(it.norm_json).locks.qty, false);
  assert.deepEqual({ title: lineLocks(it, []).title, qty: lineLocks(it, []).qty }, { title: true, qty: false }, "پنلِ تأمین‌کننده همان را می‌خواند");
  const last = DB.raw.prepare("SELECT kind, diff_json FROM item_changes WHERE item_id=51 ORDER BY id DESC").get();
  assert.equal(last.kind, "norm");
  assert.deepEqual(diffLines(JSON.parse(last.diff_json)), ["مقدار: 🔓 باز — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد"]);
  const t2 = await call("/items/51/locks", { method: "PUT", headers: HUMAN, body: { title: false } });
  assert.deepEqual([t2.data.locks.title, t2.data.locks.qty], [false, false]);
  /* ذخیرهٔ ساختار از ویرایشگر بی title/qty (دکمه‌هایشان دیگر آن‌جا نیست): قبلی‌ها می‌مانند */
  const sv = await call("/items/51/norm", { method: "PUT", headers: HUMAN, body: { head: "پیچ", layers: { "اندازه": "M8", "جنس": "فولاد", "رنگ بدنه": "مشکی" }, source: "catalog", code: "1001", locks: { layers: { "اندازه": false } } } });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.deepEqual(sv.data.norm.locks, { title: false, qty: false, layers: { "اندازه": false, "جنس": true, "رنگ بدنه": true } });
  /* قلمِ کهنه که قفل‌هایش فقط در norm_json است (بی هیچ تغییری) همان را می‌دهد */
  const old = { ...it, norm_json: JSON.stringify({ head: "پیچ", layers: {}, locks: { title: false, qty: true } }) };
  assert.deepEqual([lineLocks(old, []).title, lineLocks(old, []).qty], [false, true]);
});
