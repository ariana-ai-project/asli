/* ============================================================
   خوانندهٔ فایل سوابق تأمین در مرورگر — TP.importHistory (import.js)

   فایلِ اسناد از حسابداری می‌آید و شکل ثابتی ندارد؛ ستون‌ها با نام‌های جایگزین
   شناخته می‌شوند و سرستون می‌تواند در سطر اول نباشد. این‌جا با اکسل ساختگی
   همان XLSX واقعیِ سندباکس سنجیده می‌شود.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadTP } from "./run.mjs";

function sheetFile(sandbox, sheets) {
  const bytes = vm.runInContext(
    `(() => { const wb = XLSX.utils.book_new();
       for (const [name, rows] of ${JSON.stringify(sheets)}) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
       return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })); })()`, sandbox);
  return { name: "asnad.xlsx", size: bytes.length, async arrayBuffer() { return bytes.buffer; } };
}
const arr = (x) => Array.from(x || []);
const parse = async (sheets) => { const s = loadTP(); return s.TP.importHistory(sheetFile(s, sheets)); };

test("ستون‌ها با نام‌های جایگزین پیدا می‌شوند و مبلغ از فی×مقدار درمی‌آید", async () => {
  const out = await parse([["Sheet1", [
    ["شماره فاکتور", "تاریخ فاکتور", "فروشنده", "شرح کالا", "تعداد", "قیمت واحد", "مرکز هزینه"],
    ["F-1", "1404/02/10", "بازرگانی الف", "شیر فلکه", 10, "100,000", "پروژه شمال"],
    ["F-2", "۱۴۰۱/۵/۱", "بازرگانی ب", "لوله", 3, 2000000, ""],
  ]]]);
  const rows = arr(out.rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 1000000, "فی × مقدار");
  assert.equal(rows[0].doc, "F-1");
  assert.equal(rows[0].party, "پروژه شمال");
  assert.equal(rows[1].date, "1401/05/01", "تاریخ فارسی و بی‌صفر یکدست شد");
  assert.equal(out.stats.suppliers, 2);
  assert.equal(out.stats.dateMin, "1401/05/01");
  assert.equal(out.stats.dateMax, "1404/02/10");
  assert.equal(out.headers[out.mapping.price], "قیمت واحد", "نقشهٔ ستون برای پیش‌نمایش مدیر");
});

test("مبلغِ صریح بر فی×مقدار مقدم است؛ سطرِ بی‌تاریخ یا بی‌مبلغ ناقص شمرده می‌شود", async () => {
  const out = await parse([["اسناد", [
    ["تاریخ سند", "تامین کننده", "عنوان قلم خریدنی", "مقدار", "فی", "مبلغ"],
    ["1403/11/20", "ب", "کالا", 2, 100, 5000],
    ["", "ب", "کالا", 2, 100, 5000],
    ["1403/11/21", "ب", "کالا", 2, "", ""],
  ]]]);
  assert.equal(arr(out.rows).length, 1);
  assert.equal(arr(out.rows)[0].amount, 5000);
  assert.equal(out.stats.bad, 2);
});

test("سرستون در سطر اول نیست و کاربرگ اول نامربوط است", async () => {
  const out = await parse([
    ["خلاصه", [["گزارش خرید"], ["جمع", 12]]],
    ["ریز", [["شرکت تونل سد آریانا"], [], ["تاریخ", "طرف مقابل", "کالا", "مبلغ کل"], ["1404/01/05", "الف", "پیچ", 900]]],
  ]);
  assert.equal(out.sheet, "ریز");
  assert.equal(arr(out.rows).length, 1);
  assert.equal(arr(out.rows)[0].item, "پیچ");
});

test("بدون ستون‌های لازم، با کد BAD_HEADER رد می‌شود", async () => {
  await assert.rejects(() => parse([["x", [["تاریخ", "کالا"], ["1404/01/01", "پیچ"]]]]), (e) => e.code === "BAD_HEADER");
});
