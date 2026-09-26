/* ============================================================
   گزارش‌های مدیر — worker/reports.js و worker/xlsxbook.js
   ساختار از «وضعیت درخواست ها.xlsx» و «گزارش فصل زمستان اکسل نهایی.xlsx» واحد پشتیبانی.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePeriod, workingDays, projectOf, reportProjects, purchaseClass, requestStatus, shortNames, expertMatcher,
  computeSeason, periodExperts, seasonBook, statusBook, bookPreview, STATUS_COLUMNS, STATUS_HIDDEN, DAILY_COLUMNS,
  normTeam, validateTeam, reportTeam, putReportTeam, seasonData, seasonExperts,
} from "../../../worker/reports.js";
import { buildBook, chartXml, formatValue } from "../../../worker/xlsxbook.js";
import { getSettings } from "../../../worker/settings.js";
import { ensureSchema } from "../../../worker/api.js";
import { sqliteD1 } from "./run.mjs";

test("دوره: فصل، ماه، ترکیب و کل سال — با ستون «پیش از دوره»", () => {
  const w = parsePeriod({ years: [1404], seasons: [4] });
  assert.equal(w.label, "فصل زمستان 1404");
  assert.equal(w.priorLabel, "نه ماه اول 1404");
  assert.deepEqual(w.months, [10, 11, 12]);
  assert.ok(w.keys.has("1404/10") && w.prior.has("1404/09") && !w.prior.has("1404/10"));
  assert.equal(parsePeriod({ years: [1404], months: [6] }).label, "شهریور 1404");
  assert.equal(parsePeriod({ years: [1404], seasons: [1], months: [7] }).label, "فصل بهار و مهر 1404");
  assert.equal(parsePeriod({ years: [1403, 1404] }).label, "سال 1403 و 1404");
  assert.equal(parsePeriod({ years: [1405], months: [2] }).priorLabel, "فروردین 1405");
  assert.throws(() => parsePeriod({ years: [] }));
});

test("روز کاری: جمعه و تعطیل رسمی شمرده نمی‌شوند، روزهای آینده هم نه", () => {
  /* اسفند ۱۴۰۴: ۲۹ روز و پنج جمعه (۱، ۸، ۱۵، ۲۲، ۲۹ — با تقویم ایرانیِ Intl سنجیده شد) */
  assert.equal(workingDays(new Set(["1404/12"]), new Set(), "1405/01/01"), 24);
  assert.equal(workingDays(new Set(["1404/12"]), new Set(["1404/12/28"]), "1405/01/01"), 23);
  assert.equal(workingDays(new Set(["1404/12"]), new Set(["1404/12/29"]), "1405/01/01"), 24, "تعطیلِ روز جمعه دوباره کم نمی‌شود");
  assert.equal(workingDays(new Set(["1404/12"]), new Set(), "1404/12/03"), 2);
});

test("پروژه با کلیدواژهٔ «طرف مقابل»؛ طولانی‌ترین کلیدواژه برنده است", () => {
  const P = reportProjects({});
  assert.equal(projectOf(P, "مرکز هزینه استخراج ماده معدنی زرشوران", "پروژه‌های داخلی").name, "زرشوران");
  assert.equal(projectOf(P, "مرکز هزینه ساخت شمع کلر آلکالی پتروشیمی بندر امام", "ابنیه").name, "شمع کوبی ماهشهر");
  assert.equal(projectOf(P, "مرکز هزینه کلر آلکالی پتروشیمی بندر مام ماهشهر", "ابنیه").name, "آلکالی ماهشهر");
  assert.equal(projectOf(P, "مرکز هزینه عمومی - تقاطع غیر همسطح رجائی شهر کرج", "").name, "تقاطع غیر همسطح");
  assert.equal(projectOf(P, "مرکز هزینه پل آختالا", "کاجاران").name, "کاجاران");
  assert.equal(projectOf(P, "مرکز هزینه کانال توپولانگ ازبکستان", ""), null);
  assert.equal(projectOf(P, "نامعلوم", "راغون").name, "راغون", "اگر طرف مقابل نخورد، مرکز درخواست کننده");
});

test("وضعیت و دستهٔ خرید درخواست از شمارش اقلام", () => {
  const r = (o) => ({ n: 3, nc: 0, ns: 0, nh: 0, ...o });
  assert.equal(purchaseClass(r({ nc: 2, ns: 1 })), "bought");
  assert.equal(purchaseClass(r({ nc: 2 })), "open");
  assert.equal(purchaseClass(r({ ns: 3 })), "stopped");
  assert.equal(purchaseClass(r({ nc: 2, nh: 1 })), "open");
  assert.equal(requestStatus(r({ ost: "تایید شده,ثبت شده" })), "تایید شده");
  assert.equal(requestStatus(r({ eid: 4, ost: "ثبت شده" })), "در جریان");
  assert.equal(requestStatus(r({ nc: 3 })), "بسته شده");
  assert.equal(requestStatus(r({ nc: 1, nh: 2 })), "معلق");
});

test("نام کوتاه و تطبیق «کارشناس خرید» راهکاران", () => {
  const E = [{ id: 1, name: "ابوذر بهمنی", label: "آقای بهمنی", active: 1 }, { id: 2, name: "امیرحسین کریم خان", label: "آقای کریمخانی", active: 1 },
    { id: 3, name: "سالار کوشاری", label: "آقای سالار کوشاری", active: 1 }, { id: 4, name: "ارسلان کوشاری", label: "آقای ارسلان کوشاری", active: 1 }];
  const sn = shortNames(E);
  assert.equal(sn.get(1), "بهمنی");
  assert.equal(sn.get(3), "سالار کوشاری", "نام خانوادگی تکراری → نام کامل");
  const m = expertMatcher(E);
  assert.equal(m("بهمنی").id, 1);
  assert.equal(m("کریمخان").id, 2);
  assert.equal(m("ک-م"), null);
});

test("تطبیق نام کامل سوابق: یک کلمهٔ مشترک کافی نیست؛ برچسب کارشناس تازه بر رکورد غیرفعال مقدم", () => {
  const E = [{ id: 1, name: "مریم محمودی اصل زاده", label: "خانم محمودی", active: 1 }, { id: 2, name: "حسین احسانی", label: "آقای احسانی", active: 1 },
    { id: 3, name: "سید حمید رسولی طاهر", label: "آقای رسولی", active: 0 }, { id: 4, name: "آقای رسولی", label: "آقای رسولی", active: 1 },
    { id: 5, name: "مهدی طراوتی", label: "آقای طراوتی", active: 0 }, { id: 6, name: "آقای شیری", label: "آقای شیری", active: 1 }];
  const m = expertMatcher(E);
  for (const n of ["محمدرضا عسکری زاده جزی", "مریم معافی", "حسین مدرس", "سیدحمید حسینی"]) assert.equal(m(n), null, n);
  assert.equal(m("مریم  محمودی اصل زاده").id, 1);
  assert.equal(m("سید حمید رسولی طاهر").id, 4);
  assert.equal(m("مهدی شیری آغول بیک").id, 6);
  assert.equal(m("طراوتی").id, 5);
});

const EXPERTS = [
  { id: 1, name: "ارسلان کوشاری", label: "آقای کوشاری", senior: 1, active: 1 },
  { id: 2, name: "حمید رسولی", label: "آقای رسولی", senior: 1, active: 1 },
  { id: 3, name: "ابوذر بهمنی", label: "آقای بهمنی", senior: 0, senior_id: 1, active: 1 },
  { id: 4, name: "مریم محمودی", label: "خانم محمودی", senior: 0, senior_id: 2, active: 1 },
];
const ROWS = [
  { id: "1", date: "1404/10/02", party: "مرکز هزینه استخراج ماده معدنی زرشوران", n: 4, nc: 4, ns: 0, nh: 0, eid: 3 },
  { id: "2", date: "1404/11/12", party: "راغون", n: 2, nc: 0, ns: 0, nh: 0, eid: 4 },
  { id: "3", date: "1404/12/20", party: "راغون", n: 1, nc: 0, ns: 1, nh: 0, sx: "محمودی" },
  { id: "4", date: "1404/12/21", party: "مرکز هزینه کانال توپولانگ ازبکستان", n: 3, nc: 0, ns: 0, nh: 0 },
  { id: "5", date: "1404/07/01", party: "راغون", n: 5, nc: 5, ns: 0, nh: 0, eid: 3 },
];

test("محاسبهٔ سه‌ماهه: گروه‌ها، ارجاع‌نشده، پروژه‌ها، کارشناسان و پیش از دوره", () => {
  const D = computeSeason({ P: parsePeriod({ years: [1404], seasons: [4] }), rows: ROWS, experts: EXPERTS, holidays: new Set(), settings: {}, todayJ: "1405/01/01",
    amounts: [{ ym: "1404/10", expert: "ابوذر بهمنی", amt: 1000 }, { ym: "1404/11", expert: "محمودی", amt: 500 }, { ym: "1404/08", expert: "بهمنی", amt: 70 }] });
  const [g1, g2] = D.groups;
  assert.deepEqual([g1.name, g1.total, g1.bought, g1.items], ["ارسلان کوشاری", 1, 1, 4]);
  assert.deepEqual([g2.name, g2.total, g2.open, g2.stopped], ["حمید رسولی", 2, 1, 1]);
  assert.equal(D.unassigned, 1);
  assert.deepEqual([g1.amount, g2.amount], [1000, 500]);
  assert.deepEqual(D.totals.prior, { requests: 1, items: 5, amount: 70 });
  assert.equal(D.totals.period.requests, 4);
  const zr = D.projects.find((p) => p.name === "زرشوران"), rg = D.projects.find((p) => p.name === "راغون");
  assert.deepEqual([zr.requests, zr.bought, zr.itemsBought, rg.requests], [1, 1, 4, 2]);
  assert.equal(D.other.requests, 1);
  const bh = D.experts.find((e) => e.name === "ابوذر بهمنی"), mh = D.experts.find((e) => e.name === "مریم محمودی");
  assert.deepEqual([bh.requests, bh.bought, mh.requests], [1, 1, 1], "متوقف‌ها از ردیف کارشناس بیرون‌اند");
  assert.deepEqual(D.specials.map((s) => s.requests), [1, 0, 1]);
  assert.equal(D.managers.find((m) => m.label === "دکتر پور یزدان خواه").requests, 2);
  assert.ok(D.managers.find((m) => m.label === "مهندس بدریان").noSystem);
  assert.equal(D.workDays, 76);
});

const plainNames = (D) => JSON.stringify([D.groups, D.experts, D.specials, D.totals]);
test("تیکِ کارشناسان (تصمیم مدیر، مهر ۱۴۰۵): فهرستِ همان دوره، و گزارش فقط با تیک‌خورده‌ها", () => {
  const P = parsePeriod({ years: [1404], seasons: [4] });
  const L = periodExperts({ P, rows: ROWS, experts: EXPERTS });
  assert.deepEqual(L.map((e) => [e.id, e.requests, e.items]), [[1, 0, 0], [2, 0, 0], [3, 1, 4], [4, 2, 3]],
    "فعال‌ها همه، با شمارِ درخواست و اقلامِ همین دوره؛ درخواستِ مهر (پیش از دوره) شمرده نشد");
  const inactive = [...EXPERTS, { id: 9, name: "رفته", label: "رفته", active: 0 }];
  assert.ok(!periodExperts({ P, rows: ROWS, experts: inactive }).some((e) => e.id === 9), "غیرفعالِ بی درخواست در دوره نمی‌آید");
  assert.ok(periodExperts({ P, rows: [...ROWS, { id: "9", date: "1404/10/05", n: 1, nc: 0, ns: 0, nh: 0, eid: 9 }], experts: inactive }).some((e) => e.id === 9), "غیرفعالِ با درخواست می‌آید");

  const base = { P, rows: ROWS, experts: EXPERTS, holidays: new Set(), settings: {}, todayJ: "1405/01/01",
    amounts: [{ ym: "1404/10", expert: "ابوذر بهمنی", amt: 1000 }, { ym: "1404/11", expert: "محمودی", amt: 500 }] };
  const all = computeSeason(base);
  assert.equal(all.picked, null);
  assert.deepEqual(plainNames(computeSeason({ ...base, pick: [1, 2, 3, 4] })), plainNames(all), "همه تیک‌خورده = همان گزارشِ پیشین");
  /* محمودی و سرگروهش (رسولی) بی‌تیک */
  const D = computeSeason({ ...base, pick: [1, 3] });
  assert.deepEqual(D.experts.map((e) => e.name), ["ارسلان کوشاری", "ابوذر بهمنی"]);
  assert.deepEqual(D.groups.map((g) => [g.name, g.total, g.amount]), [["ارسلان کوشاری", 1, 1000]], "ستونِ گروهی که هیچ عضوِ تیک‌خورده‌ای ندارد نمی‌آید؛ مبلغ محمودی هم نه");
  assert.equal(D.specials[0].requests, 0, "درخواستِ متوقفِ محمودی در «متوقف شده» نیست");
  assert.equal(D.unassigned, 1, "ارجاع‌نشده مال هیچ کارشناسی نیست و می‌ماند");
  assert.equal(D.totals.period.requests, 4, "جمع کلِ دوره همهٔ درخواست‌ها");
  assert.equal(D.projects.find((p) => p.name === "راغون").requests, 2, "آمار پروژه‌ها همهٔ درخواست‌ها");
  assert.deepEqual(D.picked, { n: 2, of: 4 });
  /* سرگروه بی‌تیک ولی عضوش تیک‌خورده: ستونِ گروه می‌ماند، ردیفِ خودِ سرگروه نه */
  const E = computeSeason({ ...base, pick: [3, 4] });
  assert.deepEqual(E.groups.map((g) => g.name), ["ارسلان کوشاری", "حمید رسولی"]);
  assert.deepEqual(E.experts.map((e) => e.name), ["ابوذر بهمنی", "مریم محمودی"]);
});

test("جدول گروه‌بندی (تصمیم مدیر، مهر ۱۴۰۵): گزارش دقیقاً با روابطِ جدول، نه تب کارشناسان", () => {
  const P = parsePeriod({ years: [1404], seasons: [4] });
  assert.deepEqual(periodExperts({ P, rows: ROWS, experts: EXPERTS }).map((e) => [e.id, e.senior, e.senior_id]), [[1, true, null], [2, true, null], [3, false, 1], [4, false, 2]],
    "ارشدی و سرپرستِ تب کارشناسان — پیش‌فرضِ جدول برای کارشناسی که هنوز جا داده نشده");
  const base = { P, rows: ROWS, experts: EXPERTS, holidays: new Set(), settings: {}, todayJ: "1405/01/01",
    amounts: [{ ym: "1404/10", expert: "ابوذر بهمنی", amt: 1000 }, { ym: "1404/11", expert: "محمودی", amt: 500 }] };
  const live = JSON.stringify(EXPERTS), old = computeSeason(base);

  /* بهمنی در تب کارشناسان زیر کوشاری است؛ در جدول زیر رسولی، و کوشاری دیگر سرگروه نیست */
  const D = computeSeason({ ...base, team: { seniors: [2], parent: { 1: null, 3: 2, 4: 2 } } });
  assert.deepEqual(D.groups.map((g) => [g.name, g.total, g.bought, g.open, g.stopped, g.items, g.amount]), [["حمید رسولی", 3, 1, 1, 1, 7, 1500]],
    "ستون رسولی = خودش و اعضای جدول (درخواست و مبلغ بهمنی هم)؛ کوشاری درخواستی ندارد، پس «بدون سرگروه» هم نمی‌آید");
  assert.equal(JSON.stringify(EXPERTS), live, "جدولِ کارشناسانِ ورودی دست نخورد");
  assert.deepEqual(D.experts.map((e) => e.name), old.experts.map((e) => e.name), "ردیف‌های برگهٔ «کارشناس خرید» همان می‌مانند");

  /* کارشناسِ رفته (غیرفعال) که در دوره درخواست داشته: در جدول سرگروه شد و ستونش می‌آید؛ بی‌سرگروه‌ها در «بدون سرگروه» */
  const gone = { id: 9, name: "کامران بخشی", label: "آقای بخشی", senior: 0, active: 0 };
  const rows9 = [...ROWS, { id: "9", date: "1404/10/05", party: "راغون", n: 2, nc: 2, ns: 0, nh: 0, eid: 9 }];
  const G = computeSeason({ ...base, experts: [...EXPERTS, gone], rows: rows9, pick: [9, 3, 4], team: { seniors: [9], parent: { 3: 9, 4: null } } });
  assert.deepEqual(G.groups.map((g) => [g.name, g.total, g.items, g.amount]), [["کامران بخشی", 2, 6, 1000], ["بدون سرگروه", 2, 3, 500]]);
  assert.deepEqual(computeSeason({ ...base, experts: [...EXPERTS, gone], rows: rows9, pick: [9, 3, 4] }).groups.map((g) => [g.name, g.total]),
    [["ارسلان کوشاری", 1], ["حمید رسولی", 2], ["بدون سرگروه", 1]], "بی جدول: غیرفعال سرگروه نمی‌شود و ستون‌ها همان تب کارشناسان");

  /* ترتیب ستون‌ها همان ترتیب جدول؛ همان روابطِ تب کارشناسان همان گزارشِ پیشین است؛ بی جدول رفتار قبلی */
  assert.deepEqual(computeSeason({ ...base, team: { seniors: [2, 1], parent: { 3: 1, 4: 2 } } }).groups.map((g) => g.name), ["حمید رسولی", "ارسلان کوشاری"]);
  assert.equal(plainNames(computeSeason({ ...base, team: { seniors: [1, 2], parent: { 3: 1, 4: 2 } } })), plainNames(old));
  assert.equal(plainNames(computeSeason({ ...base, team: null })), plainNames(old));
  /* هیچ سرگروهی در جدول: یک ستون «همه کارشناسان» */
  assert.deepEqual(computeSeason({ ...base, team: { seniors: [], parent: {} } }).groups.map((g) => [g.name, g.total]), [["همه کارشناسان", 3]]);
});

test("نگاشتِ گروه‌بندی: ذخیره سخت‌گیر است و خواندن بی‌خطا یکدست می‌کند", () => {
  const known = new Map([[1, "آقای کوشاری"], [2, "آقای رسولی"], [3, "آقای بهمنی"], [4, "خانم محمودی"]]);
  assert.deepEqual(validateTeam({ seniors: [1, 2], parent: { "3": 1, "4": null } }, known), { seniors: [1, 2], parent: { 3: 1, 4: null } });
  assert.deepEqual(validateTeam({ seniors: [1, "1"], parent: { 1: null } }, known), { seniors: [1], parent: {} }, "تکراری یکی؛ «بی‌سرگروه» برای سرگروه یعنی نبودنِ مدخل");
  const bad = (t, re) => assert.throws(() => validateTeam(t, known), (e) => e.status === 400 && re.test(e.message), JSON.stringify(t));
  bad({ seniors: [1], parent: { 9: 1 } }, /در فهرست کارشناسان نیست/);
  bad({ seniors: [9], parent: {} }, /در فهرست کارشناسان نیست/);
  bad({ seniors: [1], parent: { 3: 3 } }, /سرگروه خودش/);
  bad({ seniors: [1], parent: { 3: 2 } }, /در فهرست سرگروه‌ها نیست/);
  bad({ seniors: [1, 2], parent: { 2: 1 } }, /سرگروه است/);
  bad({ seniors: ["1.5"], parent: {} }, /عدد صحیح/);
  bad({ seniors: [true], parent: {} }, /عدد صحیح/);
  bad({ seniors: [1], parent: { x: 1 } }, /عدد صحیح/);
  bad([], /seniors/);
  bad({ seniors: [1] }, /seniors/);

  assert.deepEqual(normTeam(null), { seniors: [], parent: {} });
  assert.deepEqual(normTeam("خراب"), { seniors: [], parent: {} });
  assert.deepEqual(normTeam({ seniors: [1, "2", "x", 9], parent: { 1: 2, 3: 1, 4: 7, 5: 5, 9: 1 } }, new Set([1, 2, 3, 4, 5])),
    { seniors: [1, 2], parent: { 3: 1, 4: null, 5: null } }, "کارشناسِ ناموجود (۹) می‌رود؛ سرگروهِ ناسرگروه (۷) و خودِ کارشناس (۵) null؛ سرگروه زیرِ کسی نمی‌رود");
});

test("کارپوشه‌ها: برگه‌های تیک‌خورده، جدول و برش‌دهنده، نمودار، پیش‌نمایش", async () => {
  const D = computeSeason({ P: parsePeriod({ years: [1404], seasons: [4] }), rows: ROWS, experts: EXPERTS, holidays: new Set(), amounts: [], settings: {}, todayJ: "1405/01/01" });
  const book = seasonBook(D, ["experts", "overview"]);
  assert.deepEqual(book.sheets.map((s) => s.name), ["وضعیت کلی", "کارشناس خرید"], "ترتیب فایل نمونه، فقط برگه‌های انتخابی");
  assert.throws(() => seasonBook(D, ["nope"]));
  const text = new TextDecoder("latin1").decode(await (await buildBook(book)).arrayBuffer());
  for (const part of ["xl/workbook.xml", "xl/worksheets/sheet2.xml", "xl/charts/chart5.xml", "xl/drawings/drawing2.xml", "xl/sharedStrings.xml"]) assert.ok(text.includes(part), part);
  const pv = bookPreview(book);
  assert.match(pv[0].html, /وضعیت کلی گروه ها در سه ماه زمستان/);
  assert.ok(pv[1].charts.length === 2 && pv[1].charts[0].svg.startsWith("<svg"));

  const sb = statusBook({ columns: STATUS_COLUMNS, hidden: STATUS_HIDDEN, dailyColumns: DAILY_COLUMNS,
    general: [["1", "1404/01/01", "ثبت شده", "", "", "", "", "راغون", "", "", "", "بهمنی"]], daily: [[1, "1", "1404/01/01", "راغون", "بهمنی", "1404/01/02"]] });
  const st = new TextDecoder("latin1").decode(await (await buildBook(sb)).arrayBuffer());
  for (const part of ["xl/tables/table1.xml", "xl/slicers/slicer1.xml", "xl/slicerCaches/slicerCache3.xml"]) assert.ok(st.includes(part), part);
});

test("قالب عدد و XML نمودار", () => {
  assert.equal(formatValue(0.456, "0%"), "۴۶٪");
  assert.equal(formatValue(1908024636833, "#,##0"), "۱٬۹۰۸٬۰۲۴٬۶۳۶٬۸۳۳");
  assert.equal(formatValue(2.625, "0.0"), "۲٫۶");
  const x = chartXml({ type: "pie3d", title: "t", cats: { ref: "'a'!$A$1:$A$2", values: ["x", "y"] }, series: [{ name: "s", ref: "'a'!$B$1:$B$2", values: [0.4, 0.6] }], labels: true, fmt: "0%" });
  assert.match(x, /<c:pie3DChart>/); assert.equal((x.match(/<c:dPt>/g) || []).length, 2);
});

/* ---------- گروه‌بندی روی SQLite واقعی (همان طرحِ ensureSchema) ----------
   کوشاری و رسولی ارشدِ تب کارشناسان، بهمنی زیر کوشاری، بخشی رفته (غیرفعال) ولی در زمستان ۱۴۰۴ ارجاع داشته. */
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB };
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  const ex = DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,senior,senior_id,created_at) VALUES (?,?,?,?,?,1,?,?,?)");
  ex.run(1, "ارسلان کوشاری", "آقای کوشاری", "9001", 1, 1, null, t);
  ex.run(2, "حمید رسولی", "آقای رسولی", "9002", 1, 1, null, t);
  ex.run(3, "ابوذر بهمنی", "آقای بهمنی", "9003", 1, 0, 1, t);
  ex.run(4, "کامران بخشی", "آقای بخشی", "9004", 0, 0, null, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('A','1404/10/02','راغون'), ('B','1404/11/05','راغون'), ('C','1404/12/01','راغون')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,dispatched_at,created_at) VALUES (1,'A',3,?,?), (2,'B',4,?,?), (3,'C',2,?,?)").run(t, t, t, t, t, t);
  const it = DB.raw.prepare("INSERT INTO items (request_id,item_key,line_no,title,state,src_status,assignment_id) VALUES (?,'a',1,?,?,?,?)");
  it.run("A", "پیچ", "closed", "بسته شده", 1);
  it.run("B", "مهره", "open", "در جریان", 2);
  it.run("C", "ورق", "open", "در جریان", 3);
}
const liveTeam = () => DB.raw.prepare("SELECT id, senior, senior_id FROM experts ORDER BY id").all().map((r) => [r.id, r.senior, r.senior_id]);

test("گروه‌بندی در دیتابیس: GET/PUT /reports/team جدا از جدول کارشناسان و با تاریخچه؛ گزارش با روابطِ جدول", { skip: SKIP }, async () => {
  const sel = { years: [1404], seasons: [4] };
  assert.deepEqual((await seasonExperts(env, sel)).experts.map((e) => [e.id, e.senior, e.senior_id]), [[1, true, null], [2, true, null], [3, false, 1], [4, false, null]],
    "رفته‌ای که در دوره ارجاع داشته هم می‌آید؛ senior_id برای پیش‌فرضِ جدول");
  assert.deepEqual(await reportTeam(env), { team: { seniors: [], parent: {} } }, "هنوز چیزی ذخیره نشده");
  const before = liveTeam();

  const put = await putReportTeam(env, { seniors: [4], parent: { 2: null, 3: 4 } });
  assert.deepEqual(put.team, { seniors: [4], parent: { 2: null, 3: 4 } });
  assert.deepEqual((await reportTeam(env)).team, put.team, "دفعهٔ بعد همان از پیش پر است");
  assert.deepEqual(liveTeam(), before, "senior/senior_id جدول کارشناسان (ارجاع، تیم ارشد، اعلان‌ها) دست نخورد");
  assert.equal((await getSettings(env)).reportTeam, undefined, "از GET /settings بیرون است");
  const hist = DB.raw.prepare("SELECT value_json, prev_json, actor FROM settings_history WHERE key='reportTeam'").all();
  assert.deepEqual(hist.map((h) => [JSON.parse(h.value_json), h.prev_json, h.actor]), [[put.team, null, "manager"]]);
  await putReportTeam(env, put.team);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM settings_history WHERE key='reportTeam'").get().n, 1, "ذخیرهٔ بی‌تغییر تاریخچه نمی‌سازد");

  for (const t of [{ seniors: [4], parent: { 3: 1 } }, { seniors: [77], parent: {} }, { seniors: [4], parent: { 4: 3 } }, null]) {
    await assert.rejects(() => putReportTeam(env, t), (e) => e.status === 400, JSON.stringify(t));
  }
  assert.deepEqual((await reportTeam(env)).team, put.team, "ذخیرهٔ نامعتبر چیزی را عوض نکرد");
  /* مدخلِ کارشناسی که دیگر در جدول نیست موقع خواندن کنار می‌رود تا ذخیرهٔ بعدیِ پنل به خطا نخورد */
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='reportTeam'").run(JSON.stringify({ seniors: [4, 77], parent: { 2: null, 3: 77, 77: 4 } }));
  assert.deepEqual((await reportTeam(env)).team, { seniors: [4], parent: { 2: null, 3: null } });
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='reportTeam'").run(JSON.stringify(put.team));

  /* گزارش: بدنهٔ team همان روابط جدول است — بخشیِ رفته سرگروه با بهمنی، رسولی بی‌سرگروه */
  const settings = await getSettings(env);
  const D = await seasonData(env, settings, { ...sel, experts: [2, 3, 4], team: { seniors: [4], parent: { 2: null, 3: 4 } } });
  assert.deepEqual(D.groups.map((g) => [g.name, g.total, g.bought]), [["کامران بخشی", 2, 1], ["بدون سرگروه", 1, 0]]);
  const old = await seasonData(env, settings, { ...sel, experts: [2, 3, 4] });
  assert.deepEqual(old.groups.map((g) => [g.name, g.total]), [["ارسلان کوشاری", 1], ["حمید رسولی", 1], ["بدون سرگروه", 1]], "بی team همان تب کارشناسان");
  assert.deepEqual((await seasonData(env, settings, { ...sel, experts: [2, 3, 4], team: "خراب" })).groups.map((g) => g.name), old.groups.map((g) => g.name),
    "team نامعتبر = بی team");
});
