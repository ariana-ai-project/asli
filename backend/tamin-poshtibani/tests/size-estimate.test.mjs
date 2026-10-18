/* ============================================================
   برچسبِ اندازهٔ درخواست و برآوردِ مکانیکیِ قیمت (مهر ۱۴۰۵، درخواست مالک — فاز ۲؛ worker/size.js، worker/estimate.js)

   • رده‌ها به تومان (۱ تومان = ۱۰ ریال): جزئی ≤ ۵۰م < متوسط ≤ ۲۰۰م < بزرگ ≤ ۵ میلیارد < عمده
   • برآورد: ترتیبِ رتبهٔ نهایی، آخرین خریدِ هم‌واحد (و در «نوع قلم» هم‌لایه)، وگرنه خریدِ قبلی و تأمین‌کنندهٔ بعدی
   • ذخیره روی قلم (est_*)، برچسبِ میز و کارتابل از همان؛ تنظیم فقط از پنل پشتیبانی
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { sizeCat, sizeOfRial, rialToToman, reqSize, reqSizeAgg, cleanSizeRules, minQOf, SIZE_DEFAULT } from "../../../worker/size.js";
import { pickEstimate, sameUnit, layersFit, estimateItem, estimateRun } from "../../../worker/estimate.js";

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
const env = { DB, SITE_ORIGIN: "https://site.test", TG_API_BASE: "https://tg.test/bot", MANAGER_CODE: "4321" };
const MG = { "X-Manager-Code": "4321" };
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
  ins.run(52, "R-S2", "b", 2, "1003", "پیچ M10", 3, "کیلوگرم", 2);
  ins.run(53, "R-S2", "c", 3, "9999", "قلمِ ناشناس", 3, "عدد", 2);
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
test("رده‌ها به تومان: مرزها خودشان در ردهٔ پایین‌ترند؛ ریال ÷ ۱۰", () => {
  const th = SIZE_DEFAULT.th;
  assert.equal(sizeCat(50e6, th), "s");
  assert.equal(sizeCat(50e6 + 1, th), "m");
  assert.equal(sizeCat(200e6, th), "m");
  assert.equal(sizeCat(200e6 + 1, th), "l");
  assert.equal(sizeCat(5e9, th), "l");
  assert.equal(sizeCat(5e9 + 1, th), "b");
  assert.equal(sizeCat(null, th), null);
  assert.equal(rialToToman(500e6), 50e6);
  assert.equal(sizeOfRial(500e6, th), "s", "۵۰۰ میلیون ریال = ۵۰ میلیون تومان = جزئی");
  assert.equal(sizeOfRial(500e6 + 10, th), "m");
});

test("برچسبِ درخواست: جمعِ برآوردِ کل، ناقص، در صف؛ اقلامِ متوقف نه", () => {
  const items = [
    { qty: 10, est_unit_rial: 30e6, est_at: 1, state: "open" },   /* ۳۰۰م ریال */
    { qty: 2, est_unit_rial: 150e6, est_at: 1, state: "open" },   /* ۳۰۰م ریال */
    { qty: 5, est_unit_rial: null, est_at: 1, state: "open" },    /* بی‌برآورد */
    { qty: 5, est_unit_rial: null, est_at: null, state: "hold" }, /* در صف */
    { qty: 1, est_unit_rial: 9e12, est_at: 1, state: "stop" },
  ];
  const z = reqSize(items, SIZE_DEFAULT);
  assert.deepEqual(z, { cat: "m", total_rial: 600e6, n: 4, est: 2, miss: 1, pend: 1, partial: true });
  assert.deepEqual(reqSize([{ qty: 1, est_at: null, state: "open" }], SIZE_DEFAULT), { cat: null, total_rial: null, n: 1, est: 0, miss: 0, pend: 1, partial: false });
  assert.deepEqual(reqSizeAgg({ est_sum: 600e6, est_n: 4, est_ok: 2, est_pend: 1 }, SIZE_DEFAULT), z, "جمع‌های SQLِ کارتابل همان را می‌دهند");
  assert.equal(minQOf(SIZE_DEFAULT, "b"), 7);
  assert.equal(minQOf(SIZE_DEFAULT, null), 3, "بی رده ← جزئی");
});

test("تنظیمِ اندازه: صعودی، حداقلِ ۱ تا ۲۰، موجِ ۵ تا ۹۵٪", () => {
  assert.deepEqual(cleanSizeRules({}), SIZE_DEFAULT);
  assert.throws(() => cleanSizeRules({ th: [5, 4, 9] }), /صعودی/);
  assert.throws(() => cleanSizeRules({ th: [1, 2] }), /سه مرز/);
  assert.throws(() => cleanSizeRules({ minQ: { b: 0 } }), /عمده/);
  assert.throws(() => cleanSizeRules({ waveAt: 100 }), /۹۵/);
  assert.deepEqual(cleanSizeRules({ th: [1e6, 2e6, 3e6], minQ: { s: 2 }, waveAt: 25 }).minQ, { s: 2, m: 5, l: 5, b: 7 });
});

test("یکسانیِ واحد و سازگاریِ لایه‌ها", () => {
  assert.ok(sameUnit("کیلوگرم", "کیلو گرم"));
  assert.ok(sameUnit("عدد", " عدد "));
  assert.ok(!sameUnit("عدد", "کیلوگرم"));
  assert.ok(!sameUnit("", "عدد"));
  assert.ok(layersFit({ "اندازه": "M8", "جنس": "فولاد" }, { "اندازه": "M8" }), "لایهٔ نبوده ناسازگار نیست");
  assert.ok(!layersFit({ "اندازه": "M8" }, { "اندازه": "M10" }));
  assert.ok(layersFit({}, { "اندازه": "M10" }));
});

test("انتخابِ خرید: رتبهٔ نهایی، آخرین خریدِ هم‌واحد، وگرنه قبلی و بعد تأمین‌کنندهٔ بعدی", () => {
  const suppliers = [{ key: "b", name: "ب", rankF: 2 }, { key: "a", name: "الف", rankF: 1 }, { key: "c", name: "ج", rankF: 3 }];
  const buys = [
    { sn: "a", order_date: "1404/12/01", item_code: "x", unit: "کیلوگرم", qty: 2, usd: 200, amount_adj: 100 },  /* واحدِ دیگر */
    { sn: "a", order_date: "1404/10/01", item_code: "x", unit: "عدد", qty: 4, usd: 800, amount_adj: 400 },
    { sn: "b", order_date: "1405/01/01", item_code: "y", unit: "عدد", qty: 1, usd: 999, amount_adj: 999 },
  ];
  const p = pickEstimate({ suppliers, buys, unit: "عدد", layers: {}, exact: true });
  assert.deepEqual([p.sup, p.unit_rial, p.date, p.basis], ["الف", 200, "1404/10/01", "usd"], "اولِ رتبه، خریدِ قبلی‌اش چون آخرینش واحدِ دیگر بود");
  const p2 = pickEstimate({ suppliers, buys: buys.filter((b) => b.unit !== "عدد" || b.sn === "b"), unit: "عدد", layers: {}, exact: true });
  assert.equal(p2.sup, "ب", "تأمین‌کنندهٔ اول خریدِ جور نداشت ← بعدی");
  /* «نوع قلم»: لایه‌ها باید بخوانند */
  const lb = [{ sn: "a", order_date: "1405/01/01", item_code: "x", unit: "عدد", qty: 1, usd: 50, layers: { "اندازه": "M10" } },
    { sn: "c", order_date: "1404/01/01", item_code: "z", unit: "عدد", qty: 2, usd: null, amount_adj: 60, layers: { "اندازه": "M8" } }];
  const p3 = pickEstimate({ suppliers, buys: lb, unit: "عدد", layers: { "اندازه": "M8" }, exact: false });
  assert.deepEqual([p3.sup, p3.unit_rial, p3.basis], ["ج", 30, "adj"], "بی نرخ دلار: مبلغِ تعدیل‌شده");
  assert.equal(pickEstimate({ suppliers, buys: lb, unit: "متر", layers: {}, exact: false }), null, "هیچ خریدِ هم‌واحد ← بی‌برآورد");
});

test("برآورد روی سوابقِ واقعیِ آزمون، ذخیره روی قلم؛ برچسبِ میز و کارتابل؛ صف و تنظیمِ پشتیبانی", { skip: SKIP }, async () => {
  const it = DB.raw.prepare("SELECT * FROM items WHERE id=51").get();
  const est = await estimateItem(env, it);
  assert.ok(est, "قلمِ ۱۰۰۱ سوابق دارد");
  assert.equal(est.scope, "exact");
  assert.equal(est.sup, "شرکت ب");
  assert.ok(Math.abs(est.unit_rial - 1000) < 1e-6, `قیمت واحد ${est.unit_rial}`);
  const row = DB.raw.prepare("SELECT est_unit_rial, est_src, est_at FROM items WHERE id=51").get();
  assert.ok(row.est_at && Math.abs(row.est_unit_rial - 1000) < 1e-6);
  assert.equal(JSON.parse(row.est_src).sup, "شرکت ب");
  /* ۵۲: واحدِ کیلوگرم در سوابق نیست ← بی‌برآورد؛ ۵۳: ناشناس */
  assert.equal(await estimateItem(env, DB.raw.prepare("SELECT * FROM items WHERE id=52").get()), null);
  const r52 = DB.raw.prepare("SELECT est_unit_rial, est_at FROM items WHERE id=52").get();
  assert.equal(r52.est_unit_rial, null); assert.ok(r52.est_at, "بی‌برآورد هم ثبت می‌شود");
  /* صف: ۵۳ و ۴۱/۴۲ هنوز برآورد نشده‌اند */
  const run = await estimateRun(env, { max: 10, budget: 1000 });
  assert.ok(run.done >= 1);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM items WHERE est_at IS NULL AND state IN ('open','hold')").get().n, 0);
  const capped = await estimateRun(env, { daily: true });
  assert.equal(capped.done, 0, "صف خالی");
  /* میز مدیر: برچسب ۷ × ۱۰۰۰ = ۷۰۰۰ ریال ← جزئی، ناقص */
  DB.raw.prepare("UPDATE assignments SET dispatched_at=? WHERE id=2").run(Date.now());
  const d = await call("/desk?scope=all", { headers: MG });
  assert.equal(d.status, 200, JSON.stringify(d.data).slice(0, 300));
  const r = d.data.requests.find((x) => x.id === "R-S2");
  assert.equal(r.size.cat, "s");
  assert.equal(r.size.partial, true);
  assert.equal(r.size.total_rial, 7000);
  const tr = await call("/tray", { headers: HUMAN });
  assert.equal(tr.data.assignments.find((a) => a.id === 2).size.cat, "s");
  assert.deepEqual(d.data.settings.sizeRules, SIZE_DEFAULT, "پیش‌فرض در تنظیمات");
  /* تنظیم: فقط پشتیبانی؛ مدیر نمی‌تواند */
  await call("/settings", { method: "PUT", headers: MG, body: { sizeRules: { th: [1, 2, 3] } } });
  assert.deepEqual((await call("/settings", { headers: MG })).data.sizeRules, SIZE_DEFAULT);
  const SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
  const bad = await call("/support/size-rules", { method: "PUT", headers: SUP, body: { th: [3, 2, 1] } });
  assert.equal(bad.status, 400);
  const ok = await call("/support/size-rules", { method: "PUT", headers: SUP, body: { th: [100, 200, 300], minQ: { s: 2, m: 4, l: 6, b: 8 }, waveAt: 30 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  const d2 = await call("/desk?scope=all", { headers: MG });
  assert.equal(d2.data.requests.find((x) => x.id === "R-S2").size.cat, "b", "۷۰۰ تومان > ۳۰۰ ← عمده با مرزهای تازه");
  /* تغییرِ ساختار برآورد را دوباره در صف می‌گذارد */
  const p = await call("/items/51/normalize", { headers: HUMAN, body: {} });
  const sv = await call("/items/51/norm", { method: "PUT", headers: HUMAN, body: { head: p.data.head, layers: p.data.layers, source: p.data.source, code: "1001" } });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.equal(DB.raw.prepare("SELECT est_at FROM items WHERE id=51").get().est_at, null);
  const re = await call("/items/51/estimate", { headers: HUMAN, body: {} });
  assert.ok(Math.abs(re.data.est_unit_rial - 1000) < 1e-6);
  /* سقفِ ۵۰ کوئریِ هر اجرا: با بودجهٔ پیش‌فرض هیچ اجرا از سقف نمی‌گذرد */
  DB.raw.prepare("UPDATE items SET est_at=NULL").run();
  const b1 = await estimateRun(env, {});
  assert.ok(b1.done >= 1 && b1.queries <= 50, JSON.stringify(b1));
  const mr = await call("/estimate/run", { headers: MG, body: { import_id: 999 } });
  assert.deepEqual([mr.status, mr.data.left], [200, false]);
});
