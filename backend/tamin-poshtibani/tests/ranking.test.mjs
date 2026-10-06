/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۲ (مهر ۱۴۰۵): قیمت روز، رتبهٔ ارزش خرید، رتبهٔ نهایی و «قاعدهٔ دعوت»

   • قیمت روز = مبلغ × نرخ دلارِ امروز ÷ نرخ دلارِ روزِ خرید؛ خریدِ پیش از اولین نرخ با نرخِ همان روز (early)
   • ارزش خرید و رتبه‌اش (rankV)؛ رتبهٔ نهایی = میانگینِ وزنیِ رتبه‌های نسبی + رده (A ۱، B ۰٫۶۶، C ۰٫۳۳) با وزن‌های پشتیبانی
   • ریز خریدها: قیمت واحد و مبلغ کل به قیمت روز
   • قاعدهٔ دعوت: پیش‌فرض ردهٔ A عین قلم تا ۵ نفر، بعد نوع قلم؛ ردهٔ B، «اول عین قلم» و «فقط عین قلم»
   • پنل پشتیبانی: خواندن و ذخیرهٔ وزن‌ها و قاعده، با خطای فرم
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { itemHistory, supplierBuys, finalRank } from "../../../worker/history.js";
import { dispatchOrder, cleanWeights, cleanDispatch, resetRankingCache, RANK_DEFAULT } from "../../../worker/ranking.js";
import { resetUsdCache } from "../../../worker/usd.js";

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
const buy = (no, date, code, title, qty, supplier, grade) => [String(no), date, "بسته شده", "ک", code, title, qty, "عدد", qty * 1000, supplier, grade ? 600 + no : null, grade, +date.slice(5, 7), "زمستان", date.slice(0, 4)];
const books = () => ({
  items: book({
    items: [ITEM_HEAD, item("1001", "پیچ آلن M8 فولادی", "پیچ", { "اندازه": "M8", "جنس": "فولاد" }), item("1003", "پیچ M10", "پیچ", { "اندازه": "M10" })],
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
  /* ب: ۱۰۰۱ در ۱۴۰۴/۱۰/۰۱ — الف (A): ۱۰۰۳ پیش از اولین نرخ — ج: ۱۰۰۱ در ۱۴۰۲/۰۵/۱۰ */
  history: book({ "حداکثر 500000 رکورد": [H, buy(1, "1404/10/01", "1001", "پیچ آلن M8 فولادی", 40, "شرکت ب", "B"), buy(2, "1398/01/15", "1003", "پیچ M10", 30, "شرکت الف", "A"),
    buy(3, "1402/05/10", "1001", "پیچ آلن M8 فولادی", 10, "شرکت ج", null)] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, SITE_ORIGIN: "https://site.test" };
const IT = { id: 61, title: "پیچ آلن M8 فولادی", code: "1001", norm_json: JSON.stringify({ v: 2, head: "پیچ", layers: { "اندازه": "M8", "جنس": "فولاد" }, source: "catalog" }) };
if (DB) {
  await ensureSchema(env);
  const out = TP0.TP.buildCatalog(books());
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: out.fp, meta: out.meta, stats: out.stats, filename: "test" });
  for (const [t, rows] of Object.entries(out.tables)) {
    for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  }
  await W.catalogFinish(env, { import_id: beg.import_id });
  const ins = DB.raw.prepare("INSERT INTO usd_rates (jday,rate,src,ref,at) VALUES (?,?,'excel',NULL,0)");
  for (const [d, r] of [["1398/03/27", 130000], ["1402/05/10", 500000], ["1404/10/01", 1000000], ["1405/07/13", 2000000]]) ins.run(d, r);
  resetUsdCache(); resetRankingCache();
}
globalThis.fetch = async (url) => { throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${url}`); };

test("رتبهٔ نهایی: میانگینِ وزنیِ رتبه‌های نسبی و رده", () => {
  const rows = [
    { name: "الف", grade: "A", rankN: 1, rankQty: 2, rankM: 2, rankV: 1 },
    { name: "ب", grade: "B", rankN: 2, rankQty: 1, rankM: 1, rankV: 2 },
    { name: "ج", grade: null, rankN: 3, rankQty: 3, rankM: 3, rankV: 3 },
  ];
  finalRank(rows, RANK_DEFAULT);
  assert.deepEqual(rows.map((r) => [r.name, r.score, r.rankF]), [["الف", 87.5, 1], ["ب", 66.5, 2], ["ج", 0, 3]], "(۱+۰٫۵+۱+۱)÷۴ و (۰٫۵+۱+۰٫۵+۰٫۶۶)÷۴");
  finalRank(rows, { n: 0, qty: 0, qtyM: 1, val: 0, grade: 0 });
  assert.deepEqual(rows.map((r) => r.rankF), [2, 1, 3], "فقط گشتاور");
});

test("قیمت روز با نرخ دلار، ارزش خرید و رتبه‌اش، رتبهٔ نهایی؛ ریز خریدها به قیمت روز", { skip: SKIP }, async () => {
  const h = await itemHistory(env, IT, { mode: "head", k: 5 });
  assert.equal(h.available, true, JSON.stringify(h));
  assert.deepEqual(h.usd, { latest: 2000000, latestDay: "1405/07/13", firstDay: "1398/03/27" });
  const by = Object.fromEntries(h.suppliers.map((s) => [s.name, s]));
  assert.equal(Math.round(by["شرکت ب"].val), 80000, "۴۰٬۰۰۰ × ۲٬۰۰۰٬۰۰۰ ÷ ۱٬۰۰۰٬۰۰۰");
  assert.equal(Math.round(by["شرکت ج"].val), 40000, "۱۰٬۰۰۰ × ۲٬۰۰۰٬۰۰۰ ÷ ۵۰۰٬۰۰۰");
  assert.equal(Math.round(by["شرکت الف"].val), Math.round(30000 * 2000000 / 130000), "پیش از اولین نرخ: نرخِ همان روز");
  assert.equal(by["شرکت الف"].early, 1);
  assert.equal(Math.round(by["شرکت ب"].avgUsd), 2000, "قیمت واحد به قیمت روز");
  assert.equal(Math.round(by["شرکت ب"].adjVal), 40000, "تعدیلِ مرکز آمار (شاخص زمستان ۱۴۰۴ = ۱۰۰)");
  assert.deepEqual(["شرکت الف", "شرکت ب", "شرکت ج"].map((n) => by[n].rankV), [1, 2, 3]);
  assert.deepEqual(["شرکت الف", "شرکت ب", "شرکت ج"].map((n) => by[n].rankF), [1, 2, 3]);
  assert.equal(by["شرکت الف"].score, 87.5);
  assert.deepEqual(h.weights, RANK_DEFAULT);
  const x = await itemHistory(env, IT, { mode: "exact", k: 5 });
  assert.deepEqual(x.suppliers.map((s) => s.name).sort(), ["شرکت ب", "شرکت ج"], "عین قلم: فقط ۱۰۰۱");
  const b = await supplierBuys(env, IT, "شرکت ب", { mode: "head" });
  assert.equal(b.buys[0].usd_rate, 1000000);
  assert.equal(Math.round(b.buys[0].amount_usd), 80000);
  assert.equal(Math.round(b.buys[0].unit_price_usd), 2000);
  assert.equal(b.usd.latest, 2000000);
  const e = await supplierBuys(env, IT, "شرکت الف", { mode: "head" });
  assert.equal(e.buys[0].usd_early, true);
});

test("قاعدهٔ دعوت: A عین قلم جدا از رتبه تا سقف، بعد نوع قلم؛ ردهٔ B، اول عین قلم، فقط عین قلم", () => {
  const S = (key, grade, rankF) => ({ key, name: key, grade, rankF });
  const exact = [S("e-c", "C", 1), S("e-b", "B", 2), S("e-a1", "A", 5), S("e-a2", "A", 3)];
  const type = [S("t1", null, 1), S("e-c", "C", 2), S("e-a2", "A", 4), S("t2", "B", 3), S("e-b", "B", 6), S("e-a1", "A", 7)];
  const keys = (o) => o.map((x) => `${x.key}:${x.tier}`);
  assert.deepEqual(keys(dispatchOrder({ exact, type })), ["e-a2:grade", "e-a1:grade", "t1:type", "e-c:type", "t2:type", "e-b:type"], "پیش‌فرض: A عین قلم (به رتبهٔ نهایی)، بعد نوع قلم بی تکرار");
  assert.deepEqual(keys(dispatchOrder({ exact, type }, { tier: { A: 1, B: 1, C: 0 }, then: "type" })), ["e-a2:grade", "e-b:grade", "t1:type", "e-c:type", "t2:type", "e-a1:type"], "سقفِ A یک نفر، B هم");
  assert.deepEqual(keys(dispatchOrder({ exact, type }, { tier: { A: 5, B: 0, C: 0 }, then: "exact" })), ["e-a2:grade", "e-a1:grade", "e-c:exact", "e-b:exact", "t1:type", "t2:type"], "اول باقیِ عین قلم");
  assert.deepEqual(keys(dispatchOrder({ exact, type }, { tier: { A: 0, B: 0, C: 0 }, then: "exactOnly" })), ["e-c:exact", "e-b:exact", "e-a2:exact", "e-a1:exact"], "فقط عین قلم");
  assert.deepEqual(cleanDispatch(null), { tier: { A: 5, B: 0, C: 0 }, then: "type" });
  assert.throws(() => cleanDispatch({ tier: { A: "۳۱" } }), /سقفِ ردهٔ A/);
  assert.deepEqual(cleanWeights({ n: "۲", val: "1.5" }), { n: 2, qty: 0, qtyM: 1, val: 1.5, grade: 1, k: 5 });
  assert.throws(() => cleanWeights({ n: 0, qty: 0, qtyM: 0, val: 0, grade: 0 }), /دست‌کم یکی/);
  assert.throws(() => cleanWeights({ k: 11 }), /ضریب گشتاور/);
});

test("پنل پشتیبانی: وزن‌ها و قاعدهٔ دعوت — خواندن، ذخیره با رخداد، و اثر بر رتبهٔ نهایی", { skip: SKIP }, async () => {
  const call = async (path, { method, body, headers } = {}) => {
    const h = { ...(headers || {}) };
    let b;
    if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await call("/support/ai/ranking")).status, 401);
  const SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "rotbe-123" } })).data.token };
  const g = await call("/support/ai/ranking", { headers: SUP });
  assert.deepEqual(g.data.weights, RANK_DEFAULT);
  assert.equal(g.data.dispatch.then, "type");
  assert.equal(g.data.fa.val, "ارزش خرید به قیمت روز");
  const bad = await call("/support/ai/ranking", { method: "PUT", headers: SUP, body: { weights: { n: 20 }, dispatch: {} } });
  assert.equal(bad.status, 400);
  const ok = await call("/support/ai/ranking", { method: "PUT", headers: SUP, body: { weights: { n: 0, qty: 0, qtyM: 1, val: 0, grade: 0, k: 5 }, dispatch: { tier: { A: 2, B: 1 }, then: "exact" } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.deepEqual(ok.data.dispatch, { tier: { A: 2, B: 1, C: 0 }, then: "exact" });
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_ranking' AND actor='support'").get(), "رخداد در گزارش");
  const h = await itemHistory(env, IT, { mode: "head", k: 5 });
  const by = Object.fromEntries(h.suppliers.map((s) => [s.name, s]));
  assert.deepEqual(["شرکت ب", "شرکت الف", "شرکت ج"].map((n) => by[n].rankF), [1, 2, 3], "فقط گشتاور: ب جلوتر");
});
