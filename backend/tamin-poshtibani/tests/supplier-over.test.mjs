/* ============================================================
   «🏷 تأمین‌کنندگان» در پنل پشتیبانی (خواستهٔ مالک، مهر ۱۴۰۵) — worker/supplier-over.js

   ردهٔ سوابق (A/B/C) و مشخصاتِ تأمین‌کننده (نام رسمی، شمارهٔ ثبت، شناسهٔ ملی، نشانی، تلفن) را فقط پشتیبانی، با دلیل، عوض
   می‌کند: ردیفی در supplier_over (جدا از supplier_grades که با هر بارگذاریِ سوابق از نو ساخته می‌شود) و رخدادی در events.
   ردهٔ مؤثر همه‌جا: رتبهٔ نهایی (itemHistory)، «معتمد»ِ برنامهٔ گیرندگان، مناقصه و پروفایل. «-» بی‌رده است و خالی برگشت به سوابق.
   روی کدِ امروز (مهر ۱۴۰۵): جدولِ سوابقِ کارشناس نشانِ ✎ و ردهٔ فایل را می‌گیرد، کشوی پروفایل کلیدِ sn را برای «🏷 ویرایشِ رده و
   مشخصات»ِ پشتیبانی دارد، «%» و «_»ِ جستجو حرف‌اند، و ذخیره فقط فیلدهای عوض‌شده را می‌نویسد (ذخیرهٔ هم‌زمان کارِ دیگری را پاک نمی‌کند).
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadTP, sqliteD1 } from "./run.mjs";
import * as W from "../../../worker/catalog.js";
import { ensureSchema, route } from "../../../worker/api.js";
import { supKey } from "../../../worker/cr-data.js";
import { itemHistory } from "../../../worker/history.js";
import { recipientPlan } from "../../../worker/cr-engine.js";
import { gradeMap, mergeGrade, normTel, phoneList, HIST_SQL, supplierSave } from "../../../worker/supplier-over.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = JSON.parse(gunzipSync(readFileSync(resolve(HERE, "fixtures/cr02-parity.json.gz"))).toString("utf8"));
const TP0 = loadTP();
const XL = TP0.XLSX;
const book = (sheets) => { const wb = XL.utils.book_new(); for (const [n, aoa] of Object.entries(sheets)) XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), n); return wb; };
const ITEM_HEAD = ["کد قلم", "عنوان قلم", "نوع قلم", "واحد مرجع", "کد خوشه", "کد طبقهٔ اصناف", "باقیماندهٔ متن", "اندازه", "جنس", "ویژگی‌ها (JSON)"];
const H = ["شماره", "تاریخ سفارش", "وضعیت", "کارشناس خرید", "کد قلم خریدنی", "عنوان قلم خریدنی", "مقدار", "واحد سنجش", "مبلغ به ارز عملیاتی", "تامین کننده", "کد", "رده", "ماه", "فصل", "سال"];
/* دو خریدِ کاملاً هم‌اندازه (همان روز، مقدار و مبلغ): در همهٔ رتبه‌ها برابرند و فقط رده ترتیب را می‌سازد. شماره و کدِ تأمین‌کننده ثابت‌اند،
   پس بارگذاریِ دوباره با ردهٔ دیگر فقط گروهِ «grades» را از نو می‌سازد */
const buy = (no, supplier, grade) => [String(no), "1404/10/01", "بسته شده", "ک", "1003", "پیچ M10", 90, "عدد", 90000, supplier, String(600 + no), grade, 10, "زمستان", "1404"];
const books = (gJ, gD) => ({
  items: book({ items: [ITEM_HEAD, ["1003", "پیچ M10", "پیچ", "عدد", "C04", "200", "", "M10", "", JSON.stringify({ "اندازه": "M10" })]],
    item_attributes: [["کد قلم", "نوع قلم", "نام لایهٔ ویژگی", "نام لایه (انگلیسی)", "مقدار لایه"], ["x", "x", "اندازه", "size", "x"]] }),
  indices: book({ class_index: [["کد سرگروه اصناف", "سرگروه اصناف", "کد طبقهٔ اصناف", "طبقهٔ اصناف", "کد شاخص"], ["20", "قطعات", "200", "اتصالات", "IDX_A"]],
    index_quarterly: [["کد شاخص", "دوره", "سال", "شمارهٔ فصل", "نام فصل", "شاخص (زمستان ۱۴۰۴ = ۱۰۰)"], ["IDX_A", "1404Q4", 1404, 4, "زمستان", 100]] }),
  units: book({ head_rates: [["نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    cluster_rates: [["کد خوشه", "نام خوشه", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "اطمینان"]],
    item_rates: [["کد قلم", "عنوان قلم", "نوع قلم", "واحد ثبت‌شده", "واحد مرجع", "نرخ تبدیل به واحد مرجع", "مبنای نرخ", "منشأ"]] }),
  history: book({ "حداکثر 500000 رکورد": [H, buy(1, "شرکت ج", gJ), buy(2, "شرکت د", gD)] }),
});

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", SITE_ORIGIN: "https://site.test" };
const realFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { "content-type": "application/json" } });
test.after(() => { globalThis.fetch = realFetch; });
const EX = { "X-Expert-Code": "7001" }, MG = { "X-Manager-Code": "1234" };
let SUP = {};
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) }; let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
/** بارگذاریِ چهار فایل؛ گروهی که اثرانگشتش همان است نوشته نمی‌شود (همان مسیرِ پنلِ مدیر) */
async function importBooks(gJ, gD) {
  const o = TP0.TP.buildCatalog(books(gJ, gD));
  W.resetCatalogCache();
  const beg = await W.catalogBegin(env, { fp: o.fp, meta: o.meta, stats: o.stats, filename: "test" });
  for (const [t, rows] of Object.entries(o.tables)) {
    const g = Object.keys(W.GROUPS).find((k) => W.GROUPS[k].includes(t));
    if (beg.plan[g] === "skip") continue;
    for (let i = 0; i < rows.length; i += 50) await W.catalogChunk(env, { import_id: beg.import_id, table: t, rows: JSON.parse(JSON.stringify(rows.slice(i, i + 50))) });
  }
  await W.catalogFinish(env, { import_id: beg.import_id });
  return beg;
}
const IT = { id: 61, code: "1003", title: "پیچ M10", norm_json: null };
const ranks = async () => Object.fromEntries((await itemHistory(env, IT, { mode: "head" })).suppliers.map((s) => [s.name, { grade: s.grade, rankF: s.rankF }]));
const J = supKey("شرکت ج"), D = supKey("شرکت د");
const put = (body, headers = SUP) => call("/support/supplier", { method: "PUT", headers, body });
const nEvents = () => DB.raw.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='supplier_over'").get().n;

if (DB) {
  await ensureSchema(env);
  await importBooks("A", "C");
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس','کارشناس','7001',1,1,?)").run(t);
  /* «پیچ» در دادهٔ تحقیق، برای «معتمد»ِ برنامهٔ گیرندگان (فعلی + ردهٔ A + خرید ۱۴۰۴) */
  const REC = { ...FX.profiles.find((p) => p.item_head === "پیچ").rec, cluster_main: "C04", item_head: "پیچ" };
  DB.raw.prepare("INSERT INTO cr_heads (head,cluster,ms,rfq_mode,competition_mode,n_wave1,n_max,tier,workflow,spend_rank,rec,version,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'2.0',?)")
    .run("پیچ", "C04", REC.classification.ms, "STANDARD", "STANDARD", 5, 6, "A", "ترکیبی", 500, JSON.stringify(REC), t);
  DB.raw.prepare("INSERT INTO cr_units (unit_key,head,cluster,cands,unit,imported_at) VALUES ('C04|پیچ','پیچ','C04','[]',?,?)").run(JSON.stringify({ codes: ["1003"] }), t);
  /* دفترِ تحقیق: نام رسمی، شمارهٔ ثبت و نشانیِ «شرکت ج»؛ و یک کشف‌شدهٔ بی سوابق برای جستجوی پیشوندی */
  DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,verification,phones,mobiles,data,version,imported_at) VALUES ('601','old','شرکت ج',?,2,'021-66778899',NULL,?,'2.0',?)")
    .run(J, JSON.stringify({ legal_name: "شرکت ج (سهامی خاص)", registration_no: "12345", address: "تهران، خیابان آزادی", rank: "A" }), t);
  DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,verification,phones,mobiles,data,version,imported_at) VALUES ('NEW-9','new','شرکت ژاله',?,1,NULL,'09120000009','{}','2.0',?)")
    .run(supKey("شرکت ژاله"), t);
  /* کشف‌شده‌ای با نامِ نزدیک که پشتیبانی (G4) در «شرکت ج» ادغام کرده: همراه و شناسهٔ ملی‌اش مالِ همین است */
  DB.raw.prepare("INSERT INTO sreg (sid,kind,name,name_n,verification,phones,mobiles,data,version,imported_at) VALUES ('NEW-8','new','ج فروش',?,1,NULL,'0912 555 0000',?,'2.0',?)")
    .run(supKey("ج فروش"), JSON.stringify({ national_id: "10987654321" }), t);
  DB.raw.prepare("INSERT INTO sreg_alias (kind,alias,sid,status,note,by_kind,by_name,at) VALUES ('merge','NEW-8','601','تأییدشده',NULL,'support','پشتیبانی',?)").run(t);
  /* «شرکت د» در پنلِ تأمین‌کننده با یک شماره */
  DB.raw.prepare("INSERT INTO sp_suppliers (id,name,name_n,demo,created_at) VALUES (5,'شرکت د','شرکت د',0,?)").run(t);
  DB.raw.prepare("INSERT INTO sp_phones (supplier_id,phone,label,k,panel,created_at) VALUES (5,'09121110000','فروش','k5',1,?)").run(t);
  SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "9753" } })).data.token };
}

test("تلفن‌ها: رقمِ فارسی، پیش‌شمارهٔ +98، تکراری و نامعتبر (بی پایگاه داده)", () => {
  assert.equal(normTel("۰۹۱۲ ۱۲۳ ۴۵۶۷"), "09121234567");
  assert.equal(normTel("+98 21 6677 8899"), "02166778899");
  assert.equal(normTel("9121234567"), "09121234567");
  assert.equal(normTel("0044 20 7946 0958"), "+442079460958");
  assert.equal(normTel("تلفن ندارد"), null);
  assert.equal(phoneList("09121234567\n۰۹۱۲۱۲۳۴۵۶۷، 021-66778899"), "09121234567, 02166778899", "تکراری یک بار");
  assert.equal(phoneList("  \n "), null, "خالی یعنی همان سوابق");
  assert.throws(() => phoneList("0912, شمارهٔ غلط"), (e) => e.status === 422);
  /* ادغامِ رده: «-» بی‌رده، تغییرِ پشتیبانی بر سوابق، بی ردیف هیچ */
  assert.deepEqual(mergeGrade({ code: "7", grade: "A" }, { grade: "-" }), { grade: null, code: "7", over: true, imported: "A" });
  assert.deepEqual(mergeGrade({ code: "7", grade: "A" }, { grade: null }), { grade: "A", code: "7", over: false, imported: "A" });
  assert.equal(mergeGrade(null, null), null);
});

test("ذخیره بی دلیل، با ردهٔ نامعتبر، شناسهٔ نادرست یا تأمین‌کنندهٔ ناشناخته نه — و هیچ رخدادی هم نمی‌ماند", { skip: SKIP }, async () => {
  assert.equal((await put({ sn: J, grade: "B" })).status, 422, "دلیل لازم است");
  assert.equal((await put({ sn: J, grade: "B", reason: "دو" })).status, 422, "دلیلِ کمتر از سه حرف");
  const bad = await put({ sn: J, grade: "D", reason: "بازدید از کارگاه" });
  assert.equal(bad.status, 422);
  assert.match(bad.data.error, /A، B، C/);
  assert.equal((await put({ sn: J, national_id: "۱۲۳", reason: "استعلامِ ثبتی" })).status, 422);
  assert.equal((await put({ sn: J, phones: "0912\nنامعلوم", reason: "تماس" })).status, 422);
  assert.equal((await put({ name: "شرکتی که هیچ‌جا نیست", grade: "A", reason: "آزمون" })).status, 404);
  assert.equal(nEvents(), 0);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM supplier_over").get().n, 0);
});

test("فقط پشتیبانی: کارشناس و مدیر به /support/supplier نمی‌رسند", { skip: SKIP }, async () => {
  assert.equal((await call(`/support/supplier?sn=${encodeURIComponent(J)}`, { headers: EX })).status, 401);
  assert.equal((await put({ sn: J, grade: "C", reason: "از کارشناس" }, EX)).status, 401);
  assert.equal((await call("/support/suppliers?q=" + encodeURIComponent("شرکت"), { headers: MG })).status, 401);
  assert.equal((await put({ sn: J, grade: "C", reason: "بی ورود" }, {})).status, 401);
  assert.equal(nEvents(), 0);
});

test("ردهٔ پشتیبانی جای سوابق را در رتبهٔ نهایی می‌گیرد؛ «-» بی‌رده و خالی برگشت به سوابق؛ هر ذخیره یک رخداد", { skip: SKIP }, async () => {
  let r = await ranks();
  assert.deepEqual(r["شرکت ج"], { grade: "A", rankF: 1 }, "همه برابر: ردهٔ A جلوتر");
  assert.deepEqual(r["شرکت د"], { grade: "C", rankF: 2 });

  const s1 = await put({ sn: D, name: "شرکت د", grade: "A", grade_reason: "کیفیتِ ثابت و تحویلِ به‌موقع در سه سفارشِ آخر", reason: "بازدید از کارگاه" });
  assert.equal(s1.status, 200, JSON.stringify(s1.data));
  assert.deepEqual([s1.data.effective.grade, s1.data.effective.grade_over, s1.data.imported.grade], ["A", true, "C"]);
  assert.equal((await put({ sn: J, grade: "c", reason: "دو شکایتِ کیفیت" })).status, 200, "حرفِ کوچک هم");
  r = await ranks();
  assert.deepEqual(r["شرکت د"], { grade: "A", rankF: 1 }, "ردهٔ پشتیبانی ترتیب را عوض کرد");
  assert.deepEqual(r["شرکت ج"], { grade: "C", rankF: 2 });

  assert.equal((await put({ sn: J, grade: "-", reason: "تا بازبینی بی‌رده" })).status, 200);
  assert.deepEqual((await ranks())["شرکت ج"], { grade: null, rankF: 2 }, "بی‌رده");
  const g = await gradeMap(env, [J, D, supKey("ناشناس")]);
  assert.deepEqual(g.get(J), { grade: null, code: "601", over: true, imported: "A" });
  assert.equal(g.has(supKey("ناشناس")), false);

  /* بی تغییر ← ۴۲۲؛ خالی ← برگشت به ردهٔ سوابق */
  assert.equal((await put({ sn: J, grade: "-", reason: "دوباره" })).status, 422, "تغییری نیامده");
  assert.equal((await put({ sn: J, grade: "", reason: "برگشت به سوابق" })).status, 200);
  r = await ranks();
  assert.deepEqual(r["شرکت ج"], { grade: "A", rankF: 1 }, "برگشت به A ِ سوابق");
  assert.deepEqual(r["شرکت د"], { grade: "A", rankF: 1 }, "هر دو A و برابر");

  assert.equal(nEvents(), 4);
  const ev = DB.raw.prepare("SELECT actor, payload_json FROM events WHERE kind='supplier_over' ORDER BY id LIMIT 1").get();
  assert.equal(ev.actor, "support");
  assert.deepEqual(JSON.parse(ev.payload_json), { sn: D, name: "شرکت د", before: { grade: null, grade_reason: null },
    after: { grade: "A", grade_reason: "کیفیتِ ثابت و تحویلِ به‌موقع در سه سفارشِ آخر" }, reason: "بازدید از کارگاه" });
});

test("بارگذاریِ دوبارهٔ سوابق (supplier_grades از نو) تغییرِ پشتیبانی را پاک نمی‌کند", { skip: SKIP }, async () => {
  const before = DB.raw.prepare("SELECT * FROM supplier_over ORDER BY sn").all().map((x) => ({ ...x }));
  const beg = await importBooks("B", "C");
  assert.deepEqual(beg.plan, { catalog: "skip", grades: "replace", purchases: "skip" }, "فقط رده‌ها از نو");
  assert.equal(DB.raw.prepare("SELECT grade FROM supplier_grades WHERE sn=?").get(J).grade, "B", "سوابقِ تازه");
  assert.deepEqual(DB.raw.prepare("SELECT * FROM supplier_over ORDER BY sn").all().map((x) => ({ ...x })), before, "supplier_over دست نخورد");
  assert.equal(nEvents(), 4);
  const r = await ranks();
  assert.deepEqual(r["شرکت د"], { grade: "A", rankF: 1 }, "تغییرِ پشتیبانی می‌ماند (سوابق C)");
  assert.deepEqual(r["شرکت ج"], { grade: "B", rankF: 2 }, "بی تغییرِ پشتیبانی، ردهٔ تازهٔ سوابق");
});

test("مشخصات فیلد به فیلد: دادهٔ دفتر کنارِ هر خانه، مقدارِ مؤثر، تاریخچه و جستجو", { skip: SKIP }, async () => {
  const s = await put({ sn: J, name: "شرکت ج", legal_name: "  شرکت  ج   تولیدی ", reg_no: "۵۴۳۲۱", national_id: "۱۰۱۲۳۴۵۶۷۸۹", address: "تهران،  جادهٔ مخصوص\n\n پلاک ۷",
    phones: "۰۹۱۲۱۲۳۴۵۶۷\n021 4455 6677", note: "فقط نقد", grade: "", reason: "استعلامِ روزنامهٔ رسمی" });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const d = s.data;
  assert.deepEqual([d.sn, d.name, d.sid], [J, "شرکت ج", "601"]);
  assert.deepEqual([d.imported.legal_name, d.imported.reg_no, d.imported.national_id, d.imported.address, d.imported.grade, d.imported.code, d.imported.research_rank],
    ["شرکت ج (سهامی خاص)", "12345", "10987654321", "تهران، خیابان آزادی", "B", "601", "A"], "شناسهٔ ملی از کشف‌شدهٔ ادغام‌شده");
  assert.deepEqual(d.imported.phones, [{ phone: "02166778899", src: "دفتر", label: null }, { phone: "09125550000", src: "دفتر", label: null }]);
  assert.deepEqual([d.over.legal_name, d.over.reg_no, d.over.national_id, d.over.address, d.over.phones, d.over.note, d.over.grade],
    ["شرکت ج تولیدی", "54321", "10123456789", "تهران، جادهٔ مخصوص\nپلاک ۷", "09121234567, 02144556677", "فقط نقد", null]);
  assert.deepEqual([d.effective.legal_name, d.effective.grade, d.effective.grade_over], ["شرکت ج تولیدی", "B", false]);
  assert.deepEqual(d.effective.phones, ["09121234567", "02144556677"]);
  assert.equal(d.history.length, 4, "تاریخچه، تازه‌ترین اول");
  assert.equal(d.history[0].reason, "استعلامِ روزنامهٔ رسمی");
  assert.deepEqual(d.history[0].changes.map((c) => c.field).sort(), ["address", "legal_name", "national_id", "note", "phones", "reg_no"]);
  assert.deepEqual(d.history[1].changes, [{ field: "grade", fa: "رده", before: "-", after: null }]);
  /* خالی کردنِ یک فیلد ← برگشت به دفتر */
  const c = (await put({ sn: J, address: "", reason: "نشانیِ دفتر درست است" })).data;
  assert.deepEqual([c.over.address, c.effective.address, c.over.legal_name], [null, "تهران، خیابان آزادی", "شرکت ج تولیدی"]);
  /* جستجو: سوابق اول، ردهٔ مؤثر، نشانِ تغییر؛ کشف‌شده با پیشوند؛ بی q آخرین تغییرها */
  const q = await call(`/support/suppliers?q=${encodeURIComponent("شركت")}`, { headers: SUP });
  assert.equal(q.status, 200);
  const by = Object.fromEntries(q.data.list.map((x) => [x.name, x]));
  assert.deepEqual([by["شرکت ج"].grade, by["شرکت ج"].imported, by["شرکت ج"].grade_over, by["شرکت ج"].edited, by["شرکت ج"].code], ["B", "B", false, true, "601"]);
  assert.deepEqual([by["شرکت د"].grade, by["شرکت د"].imported, by["شرکت د"].grade_over, by["شرکت د"].edited], ["A", "C", true, true]);
  assert.deepEqual([by["شرکت ج"].src, by["شرکت د"].src], [["hist", "reg"], ["hist", "panel"]]);
  assert.deepEqual((await call(`/support/supplier?sn=${encodeURIComponent(D)}`, { headers: SUP })).data.imported.phones, [{ phone: "09121110000", src: "پنل", label: "فروش" }]);
  assert.deepEqual(by["شرکت ژاله"].src, ["reg"], "کشف‌شده با پیشوندِ نام در دفتر");
  assert.ok(q.data.list.findIndex((x) => x.name === "شرکت ژاله") > q.data.list.findIndex((x) => x.name === "شرکت د"), "سوابق اول");
  const rec = (await call("/support/suppliers", { headers: SUP })).data;
  assert.equal(rec.recent, true);
  assert.deepEqual(rec.list.map((x) => x.sn), [J, D], "آخرین تغییر اول");
  /* پروفایل (کارشناس هم می‌بیند): ردهٔ مؤثر و مشخصاتِ پشتیبانی؛ ردهٔ تحقیق جدا */
  const p = (await call(`/sreg/profile?name=${encodeURIComponent("شرکت د")}`, { headers: EX })).data;
  assert.deepEqual([p.grade.grade, p.grade.over, p.grade.imported, p.grade.reason], ["A", true, "C", "کیفیتِ ثابت و تحویلِ به‌موقع در سه سفارشِ آخر"]);
  const pj = (await call("/sreg/profile?sid=601", { headers: EX })).data;
  assert.deepEqual([pj.grade.grade, pj.grade.over, pj.identity.legal_name, pj.identity.reg_no, pj.identity.national_id, pj.contact.address, pj.contact.support_phones, pj.research.rank],
    ["B", false, "شرکت ج تولیدی", "54321", "10123456789", "تهران، خیابان آزادی", "09121234567, 02144556677", "A"]);
  /* رخداد در «رخدادها»ی پشتیبانی */
  const log = (await call("/support/activity?g=support", { headers: SUP })).data.rows.filter((x) => x.kind === "supplier_over");
  assert.equal(log.length, 6);
  /* حرفِ رده جداسازی‌شده (FSI…PDI) تا «A ← C» و «C — ۲» در متنِ راست‌به‌چپ وارونه نشوند */
  assert.match(log.find((x) => /شرکت د/.test(x.text)).text, /🏷 رده و مشخصاتِ تأمین‌کننده — «شرکت د» — رده سوابق ← \u2068A\u2069 — ۱ فیلدِ دیگر — دلیل: بازدید از کارگاه/);
  assert.ok(log.some((x) => x.text.includes("رده \u2068C\u2069 ← بی‌رده")), "ج: C ِ پشتیبانی ← بی‌رده");
});

test("«معتمد»ِ برنامهٔ گیرندگان و ردهٔ مناقصه همان ردهٔ مؤثرند", { skip: SKIP }, async () => {
  const trusted = async () => { const pl = (await recipientPlan(env, "پیچ", { itemCode: "1003" })).plan; return Object.fromEntries([...pl.wave1, ...pl.reserve].map((x) => [x.name, x.trusted])); };
  assert.deepEqual(await trusted(), { "شرکت ج": false, "شرکت د": true }, "ج: ردهٔ B ِ سوابق؛ د: A ِ پشتیبانی");
  assert.equal((await put({ sn: J, grade: "A", reason: "پس از بازدید" })).status, 200);
  assert.deepEqual(await trusted(), { "شرکت ج": true, "شرکت د": true });
  const td = await call("/support/tender-suppliers?code=1003", { headers: SUP });
  assert.equal(td.status, 200);
  assert.deepEqual(Object.fromEntries(td.data.suppliers.map((x) => [x.name, x.grade])), { "شرکت ج": "A", "شرکت د": "A" });
  assert.equal((await put({ sn: D, grade: "-", reason: "بی‌رده تا بازبینی" })).status, 200);
  assert.deepEqual(await trusted(), { "شرکت ج": true, "شرکت د": false });
  assert.equal((await call("/support/tender-suppliers?code=1003", { headers: SUP })).data.suppliers.find((x) => x.name === "شرکت د").grade, null);
});

test("تاریخچه با نمایهٔ جزئی، نه کلِ events؛ پایگاهِ بی supplier_over همان ردهٔ سوابق را می‌دهد", { skip: SKIP }, async () => {
  const plan = DB.raw.prepare("EXPLAIN QUERY PLAN " + HIST_SQL).all().map((x) => x.detail).join(" | ");
  assert.match(plan, /ix_events_supover/, plan);
  assert.doesNotMatch(plan, /TEMP B-TREE/, "ترتیب از خودِ نمایه");
  /* مثلِ آزمون‌های فهرست که فقط جدول‌های فهرست را دارند */
  const db2 = await sqliteD1();
  for (const s of W.CATALOG_DDL) db2.raw.exec(s);
  db2.raw.prepare("INSERT INTO supplier_grades (sn,name,code,grade) VALUES (?,?,?,?)").run(J, "شرکت ج", "601", "B");
  assert.deepEqual((await gradeMap({ DB: db2 }, [J])).get(J), { grade: "B", code: "601", over: false, imported: "B" });
});

test("جدولِ سوابقِ کارشناس: ✎ و ردهٔ فایل فقط روی ردیفِ تغییریافته (کامل و خلاصه)؛ کشوی پروفایل کلیدِ sn دارد", { skip: SKIP }, async () => {
  /* حالا: ج ← A ِ پشتیبانی (فایل B)، د ← بی‌رده به تصمیمِ پشتیبانی (فایل C) */
  for (const brief of [false, true]) {
    const hs = Object.fromEntries((await itemHistory(env, IT, { mode: "head", brief })).suppliers.map((s) => [s.name, s]));
    assert.deepEqual([hs["شرکت ج"].grade, hs["شرکت ج"].gradeOver, hs["شرکت ج"].gradeFile], ["A", true, "B"], `brief=${brief}`);
    assert.deepEqual([hs["شرکت د"].grade, hs["شرکت د"].gradeOver, hs["شرکت د"].gradeFile], [null, true, "C"], `brief=${brief}`);
  }
  assert.equal((await put({ sn: J, grade: "", reason: "برگشت به ردهٔ فایل" })).status, 200);
  const j = (await itemHistory(env, IT, { mode: "head" })).suppliers.find((s) => s.name === "شرکت ج");
  assert.equal(j.grade, "B");
  assert.equal("gradeOver" in j || "gradeFile" in j, false, "بی تغییرِ رده، شکلِ ردیف همان قبلی است");
  /* کشو (کارشناس هم می‌بیند): sn همان کلیدِ سوابق — برای «L:»ِ بی ردیف هم */
  assert.equal((await call("/sreg/profile?sid=601", { headers: EX })).data.sn, J);
  assert.equal((await call(`/sreg/profile?name=${encodeURIComponent("شرکت د")}`, { headers: EX })).data.sn, D);
});

test("جستجو: «%» و «_» حرف‌اند، نه نویسهٔ عامِ LIKE", { skip: SKIP }, async () => {
  for (const q of ["%%", "__", "%_", "ش%"]) {
    const r = await call(`/support/suppliers?q=${encodeURIComponent(q)}`, { headers: SUP });
    assert.equal(r.status, 200);
    assert.equal(r.data.recent, false, q);
    assert.deepEqual(r.data.list, [], q);
  }
});

test("ذخیرهٔ هم‌زمان: هر ذخیره فقط فیلدهای عوض‌شدهٔ خودش را می‌نویسد", { skip: SKIP }, async () => {
  /* پشتیبانِ دیگری درست میانِ خواندن و نوشتنِ این ذخیره یادداشتِ «شرکت ج» را عوض می‌کند */
  const racing = { ...DB, batch: async (list) => {
    if (/INSERT INTO supplier_over/.test(list[0].sql)) DB.raw.prepare("UPDATE supplier_over SET note=? WHERE sn=?").run("یادداشتِ هم‌زمان", J);
    return DB.batch(list);
  } };
  const out = await supplierSave({ ...env, DB: racing }, { kind: "support", name: "پشتیبانی" }, { sn: J, legal_name: "شرکت ج (تازه)", reason: "استعلامِ تازه" });
  assert.deepEqual([out.over.legal_name, out.over.note, out.over.reg_no], ["شرکت ج (تازه)", "یادداشتِ هم‌زمان", "54321"]);
  const ev = JSON.parse(DB.raw.prepare("SELECT payload_json FROM events WHERE kind='supplier_over' ORDER BY id DESC LIMIT 1").get().payload_json);
  assert.deepEqual(ev.after, { legal_name: "شرکت ج (تازه)" }, "رخداد فقط همان فیلد");
});
