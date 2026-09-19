/* ============================================================
   گزارش‌های مدیر — worker/reports.js و worker/xlsxbook.js
   ساختار از «وضعیت درخواست ها.xlsx» و «گزارش فصل زمستان اکسل نهایی.xlsx» واحد پشتیبانی.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePeriod, workingDays, projectOf, reportProjects, purchaseClass, requestStatus, shortNames, expertMatcher,
  computeSeason, seasonBook, statusBook, bookPreview, STATUS_COLUMNS, STATUS_HIDDEN, DAILY_COLUMNS,
} from "../../../worker/reports.js";
import { buildBook, chartXml, formatValue } from "../../../worker/xlsxbook.js";

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
