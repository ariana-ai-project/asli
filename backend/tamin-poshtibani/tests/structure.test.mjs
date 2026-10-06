/* ============================================================
   طرح «خرید هوشمند، کارشناس ناظر» — فاز ۱ (مهر ۱۴۰۵): ساختارِ قلم پیش از سپردن (worker/structure.js)

   • فرقِ دو ساختار به زبانِ پیامِ پشتیبانی: نوع قلم، لایه‌ها (با هم‌ارزیِ واحد)، نرخ‌های تبدیل و 🔒/🔓
   • نرمال‌سازی اجباری و اول از همه: سوابقِ قلمِ تأییدنشده خوانده نمی‌شود؛ تأیید با قفلِ عنوان، مقدار و هر لایه؛ هر ذخیره در سابقه
   • حالتِ هوشمند: نرمال‌سازی پیش از سپردن باز است؛ «بررسی سوابق و سپردن به کارشناس هوشمند» فقط با همهٔ اقلامِ تأییدشده —
     ساختار منجمد، پیامِ تغییراتِ هر قلم، رخداد و شروعِ کار
   • پنل پشتیبانی ← «🧩 تغییرات اقلام»: یک پیام برای هر قلم، و تاریخچه
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { structDiff, diffLines, cleanLocks, suggOf } from "../../../worker/structure.js";

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
  ins.run(41, "R-S1", "a", 1, "1001", "پیچ آلن M8 فولادی", 10, "عدد", 1);
  ins.run(42, "R-S1", "b", 2, "2001", "مهره M8", 4, "عدد", 1);
  ins.run(51, "R-S2", "a", 1, "1001", "پیچ آلن M8 فولادی", 7, "عدد", 2);
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
const changes = (id) => DB.raw.prepare("SELECT kind, actor, diff_json FROM item_changes WHERE item_id=? ORDER BY id").all(id).map((r) => ({ ...r, diff: JSON.parse(r.diff_json) }));

test("فرقِ دو ساختار: نوع قلم، لایه‌ها با هم‌ارزیِ واحد، نرخ‌ها و 🔒/🔓", () => {
  const sugg = { sugg: true, head: "ورق آهنی", layers: { "ضخامت": { v: "2", n: [2], u: "میلی‌متر" }, "جنس": "آهنی", "رنگ": "سفید" }, sysRates: { "کیلوگرم": 0.5, "عدد": 20 } };
  const norm = { head: "ورق گالوانیزه", layers: { "ضخامت": { v: "0.2", n: [0.2], u: "سانتی‌متر" }, "جنس": "گالوانیزه", "طول": { v: "2000", n: [2000], u: "میلی‌متر" } },
    rates: { "کیلوگرم": 0.6, "عدد": 20 }, locks: { title: true, qty: false, layers: { "ضخامت": true, "جنس": false, "طول": true } } };
  const d = structDiff(sugg, norm);
  assert.deepEqual(d.map((x) => [x.k, x.name || "", x.to]), [
    ["head", "", "ورق گالوانیزه"], ["layer", "جنس", "گالوانیزه"], ["layer+", "طول", "2000 میلی‌متر"], ["layer-", "رنگ", undefined],
    ["rate", "کیلوگرم", 0.6], ["lock", "qty", false], ["lock", "جنس", false],
  ], "ضخامتِ ۲ میلی‌متر همان ۰٫۲ سانتی‌متر است؛ نرخِ «عدد» همان پیشنهاد");
  const lines = diffLines(d);
  assert.equal(lines[0], "نوع قلم: «ورق آهنی» ← «ورق گالوانیزه»");
  assert.ok(lines.includes("لایهٔ «رنگ» («سفید») حذف شد"));
  assert.ok(lines.includes("نرخ تبدیلِ «کیلوگرم»: 0.5 ← 0.6"));
  assert.ok(lines.some((l) => /^مقدار: 🔓 باز — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد$/.test(l)));
  /* ذخیرهٔ بعدی: نرخِ دستی برداشته شد، قفلِ مقدار برگشت */
  const d2 = structDiff(norm, { ...norm, rates: {}, locks: { ...norm.locks, qty: true } });
  assert.deepEqual(diffLines(d2), ["نرخِ دستیِ «کیلوگرم» (0.6) برداشته شد", "نرخِ دستیِ «عدد» (20) برداشته شد", "مقدار: 🔒 قفل — کلِ مقدار لازم است"]);
  assert.deepEqual(structDiff(sugg, { head: sugg.head, layers: sugg.layers }), [], "همان پیشنهاد با قفل‌های پیش‌فرض = بی‌تغییر");
  assert.deepEqual(cleanLocks(null, { "قطر": "12" }), { title: true, qty: true, layers: { "قطر": true } }, "پیش‌فرض همه 🔒 (تصمیم ۲)");
  assert.equal(suggOf({ head: "پیچ", confirmed: true }), null, "ساختارِ تأییدشده پیشنهادِ سامانه نیست");
});

test("کارشناسِ دستی: سوابقِ قلمِ تأییدنشده خوانده نمی‌شود؛ تأیید با 🔒/🔓 و سابقهٔ تغییر", { skip: SKIP }, async () => {
  const h0 = await call("/suppliers/history?item_id=51&mode=head&norm=1", { headers: HUMAN });
  assert.equal(h0.status, 200);
  assert.equal(h0.data.available, false);
  assert.equal(h0.data.need_norm, true);
  assert.match(h0.data.message, /نرمال‌سازی اجباری است/);
  const p = await call("/items/51/normalize", { headers: HUMAN, body: {} });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  assert.equal(p.data.head, "پیچ");
  const sg = JSON.parse(DB.raw.prepare("SELECT sugg_json FROM items WHERE id=51").get().sugg_json);
  assert.equal(sg.head, "پیچ");
  assert.equal(sg.source, "catalog", "پیشنهادِ سامانه یک بار ثبت شد");
  /* کارشناس اندازه را عوض می‌کند و مقدار و اندازه را 🔓 می‌کند («فولاد» همان جنسِ «آهنی» است) */
  const sv = await call("/items/51/norm", { method: "PUT", headers: HUMAN, body: { head: "پیچ", layers: { "اندازه": "M10", "جنس": "فولاد" }, source: "catalog", code: "1001", locks: { title: true, qty: false, layers: { "اندازه": false } } } });
  assert.equal(sv.status, 200, JSON.stringify(sv.data));
  assert.deepEqual(sv.data.norm.locks, { title: true, qty: false, layers: { "اندازه": false, "جنس": true } }, "لایهٔ بی‌قفل‌گفته 🔒");
  const ch = changes(51);
  assert.equal(ch.length, 1);
  assert.equal(ch[0].kind, "norm");
  assert.equal(ch[0].actor, "expert:2");
  assert.deepEqual(diffLines(ch[0].diff), ["لایهٔ «اندازه»: «M8» ← «M10»", "مقدار: 🔓 باز — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد", "لایهٔ «اندازه»: 🔓 باز"]);
  const h1 = await call("/suppliers/history?item_id=51&mode=head&norm=1", { headers: HUMAN });
  assert.equal(h1.status, 200);
  assert.notEqual(h1.data.available, false, JSON.stringify(h1.data));
  assert.ok((h1.data.suppliers || []).length >= 1, "بعد از تأیید، سوابق");
  /* دوباره، دوباره نرمال‌سازی پیشنهادِ سامانهٔ اول را عوض نمی‌کند */
  await call("/items/51/normalize", { headers: HUMAN, body: {} });
  assert.equal(JSON.parse(DB.raw.prepare("SELECT sugg_json FROM items WHERE id=51").get().sugg_json).at, sg.at);
});

let SUP = {};
test("حالتِ هوشمند: نرمال‌سازی پیش از سپردن باز؛ سپردن فقط با همهٔ اقلامِ تأییدشده؛ انجماد، پیامِ تغییرات و شروعِ کار", { skip: SKIP }, async () => {
  assert.equal((await call("/suppliers/history?item_id=41&mode=head&norm=1", { headers: AI })).status, 423, "بررسی سوابق کارِ کارشناس هوشمند است");
  assert.equal((await call("/items/41/normalize", { headers: AI, body: {} })).status, 200, "نرمال‌سازی پیش از سپردن کارِ خودِ کارشناس است");
  assert.equal((await call("/items/42/normalize", { headers: AI, body: {} })).status, 200);
  const early = await call("/assignments/1/handoff", { headers: AI, body: {} });
  assert.equal(early.status, 409);
  assert.match(early.data.error, /نرمال‌سازی اجباری است/);
  assert.deepEqual(early.data.missing, [41, 42]);
  const d0 = (await call("/assignments/1", { headers: AI })).data;
  assert.deepEqual(d0.ai.handoff, { total: 2, ok: 0, frozen: 0, pending: true });
  /* ۴۱ همان پیشنهاد؛ ۴۲ با مقدارِ 🔓 */
  const p41 = await call("/items/41/normalize", { headers: AI, body: {} });
  assert.equal((await call("/items/41/norm", { method: "PUT", headers: AI, body: { head: p41.data.head, layers: p41.data.layers, source: p41.data.source, code: "1001" } })).status, 200);
  const p42 = await call("/items/42/normalize", { headers: AI, body: {} });
  assert.equal((await call("/items/42/norm", { method: "PUT", headers: AI, body: { head: p42.data.head, layers: p42.data.layers, source: p42.data.source, code: "2001", locks: { qty: false } } })).status, 200);
  assert.equal((await call("/assignments/1", { headers: AI })).data.ai.handoff.ok, 2);
  const ho = await call("/assignments/1/handoff", { headers: AI, body: {} });
  assert.equal(ho.status, 200, JSON.stringify(ho.data));
  assert.equal(ho.data.items, 2);
  const its = DB.raw.prepare("SELECT id, frozen_at, frozen_by FROM items WHERE assignment_id=1 ORDER BY id").all();
  assert.ok(its.every((i) => i.frozen_at && i.frozen_by === "expert:1"), "ساختارِ هر دو منجمد");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_runs WHERE assignment_id=1").get().state, "prep", "کارشناس هوشمند شروع کرد");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM events WHERE kind='ai_handoff' AND actor='expert:1' AND request_id='R-S1'").get(), "رخدادِ سپردن");
  assert.deepEqual(changes(42).map((c) => c.kind), ["norm", "freeze"]);
  assert.deepEqual(diffLines(changes(42)[1].diff), ["مقدار: 🔓 باز — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد"], "پیامِ سپردن: فرقِ پیشنهادِ سامانه با ساختارِ منجمد");
  const fz = await call("/items/41/norm", { method: "PUT", headers: AI, body: { head: "پیچ", layers: {} } });
  assert.equal(fz.status, 409);
  assert.match(fz.data.error, /منجمد شد/);
  assert.equal((await call("/items/41/norm", { method: "DELETE", headers: AI })).status, 409, "برداشتنِ ذخیره هم نه");
  assert.equal((await call("/assignments/1/handoff", { headers: AI, body: {} })).status, 409, "دو بار سپرده نمی‌شود");
  /* پنل پشتیبانی: «🧩 تغییرات اقلام» */
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "sakhtar-123" } })).data.token };
  assert.equal((await call("/support/changes")).status, 401, "بی رمز پشتیبانی نه");
  const list = (await call("/support/changes?expert=1", { headers: SUP })).data.items;
  assert.deepEqual(list.map((x) => x.id).sort(), [41, 42]);
  const c42 = list.find((x) => x.id === 42), c41 = list.find((x) => x.id === 41);
  assert.deepEqual(c42.lines, ["مقدار: 🔓 باز — تأمین‌کننده می‌تواند مقدارِ کمتری پیشنهاد دهد"]);
  assert.ok(c42.frozen_at);
  assert.deepEqual(c41.lines, [], "۴۱ همان پیشنهادِ سامانه");
  assert.equal(c41.has_sugg, true);
  const only = (await call("/support/changes?changed=1", { headers: SUP })).data.items;
  assert.deepEqual(only.map((x) => x.id).sort(), [42, 51], "فقط تغییرکرده‌ها، همهٔ کارشناسان");
  const log = (await call("/support/changes/51", { headers: SUP })).data;
  assert.equal(log.item.title, "پیچ آلن M8 فولادی");
  assert.deepEqual(log.changes.map((c) => c.kind), ["norm"]);
  assert.equal(log.changes[0].lines.length, 3);
});
