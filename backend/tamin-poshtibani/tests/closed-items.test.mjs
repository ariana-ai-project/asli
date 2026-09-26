/* ============================================================
   قلمِ «بسته شده» وارد پنل نمی‌شود — frontend/tamin-poshtibani/import.js

   چرا این تست وجود دارد: خروجی راهکاران تاریخچه هم دارد. یک درخواست ممکن است
   سه قلم داشته باشد که یکی‌شان ماه پیش بسته شده. آن قلم نه باید در پیش‌نمایش
   مدیر بیاید، نه در پنل، نه در ارجاعی که برای کارشناس می‌رود.

   ولی کنارگذاشتن ≠ نفرستادن: کلید قلم از **ترتیب سطرهای فایل** ساخته می‌شود،
   پس اگر سطر بسته را از فهرست بیندازیم، کلیدِ قلم‌های هم‌نامِ بعدی جابه‌جا
   می‌شود و بارگذاری بعدی قلم تکراری می‌سازد. برای همین سطرها کامل می‌روند و
   تصمیم «وارد نکن» سمت سرور گرفته می‌شود.

   عددهای طلایی IMP-08 روی itemRows بسته شده‌اند و نباید تکان بخورند؛ شمارشِ
   کارِ واقعی در liveItemRows می‌آید.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { loadTP } from "./run.mjs";

const HEAD = ["شماره درخواست", "تاریخ درخواست", "طرف مقابل", "عنوان قلم خریدنی", "مقدار", "واحد", "وضعیت", "کارشناس خرید"];
const row = (id, title, status, expert = "") => [id, "1405/02/16", "کاجاران", title, "10", "عدد", status, expert];

/** یک اکسل ساختگی با همان XLSX واقعیِ داخل سندباکس */
function sheetFile(sandbox, rows) {
  const bytes = vm.runInContext(
    `(() => {
       const ws = XLSX.utils.aoa_to_sheet(${JSON.stringify(rows)});
       const wb = XLSX.utils.book_new();
       XLSX.utils.book_append_sheet(wb, ws, "اقلام");
       return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
     })()`, sandbox);
  return { name: "test.xlsx", size: bytes.length, async arrayBuffer() { return bytes.buffer; } };
}

/* آرایه‌های داخل سندباکس Array دیگری‌اند و deepEqual روی نمونهٔ بیگانه نمی‌گیرد */
const arr = (x) => Array.from(x || []);

const parse = async (rows) => {
  const s = loadTP();
  return s.TP.importExcel(sheetFile(s, [HEAD, ...rows]));
};

test("قلمِ بسته از شمارشِ واردشدنی کنار می‌رود ولی سطر فایل شمرده می‌شود", async () => {
  const { requests, stats } = await parse([
    row("R1", "شیر فلکه", "ثبت شده"),
    row("R1", "الکترود", "بسته شده"),
    row("R1", "سیم جوش", "در جریان"),
  ]);
  assert.equal(arr(requests).length, 1);
  assert.equal(stats.itemRows, 3, "IMP-08: سطرهای فایل دست‌نخورده شمرده می‌شوند");
  assert.equal(stats.liveItemRows, 2, "فقط دو قلم وارد پنل می‌شود");
  assert.equal(stats.closedItemsSkipped, 1);
  assert.equal(stats.partlyClosed, 1, "این درخواست فقط بخشی از اقلامش بسته است");
  assert.equal(requests[0].liveItems, 2);
});

test("درخواستی که همهٔ اقلامش بسته است اصلاً وارد نمی‌شود", async () => {
  const parsed = await parse([
    row("R1", "شیر فلکه", "ثبت شده"),
    row("R2", "الکترود", "بسته شده"),
    row("R2", "سیم جوش", "بسته شده"),
  ]);
  const p = loadTP().TP.importPayload(parsed);
  assert.deepEqual(arr(p.open).map((r) => r.id), ["R1"], "فقط درخواست باز فرستاده می‌شود");
  assert.deepEqual(arr(p.closedIds), ["R2"], "بستهٔ کامل فقط با شناسه می‌رود");
  assert.equal(parsed.stats.closedItemsSkipped, 2);
  assert.equal(parsed.stats.partlyClosed, 0, "درخواستی که هیچ قلم زنده‌ای ندارد «بخشی‌بسته» نیست");
});

test("سطرها کامل فرستاده می‌شوند تا کلیدِ قلم جابه‌جا نشود", async () => {
  const parsed = await parse([
    row("R1", "الکترود", "بسته شده"),
    row("R1", "الکترود", "ثبت شده"),   /* هم‌نام: کلیدش به ترتیب سطر بستگی دارد */
    row("R1", "سیم جوش", "ثبت شده"),
  ]);
  const p = loadTP().TP.importPayload(parsed);
  const items = arr(p.open[0].items);
  assert.equal(items.length, 3, "هر سه سطر می‌روند؛ نگه‌داشتن یا نداشتن با سرور است");
  assert.deepEqual(items.map((i) => i.state), ["closed", "open", "open"]);
  assert.deepEqual(items.map((i) => i.lineNo), [1, 2, 3], "ترتیب فایل حفظ می‌شود");
});

test("کارشناسِ فایل از قلمِ بسته خوانده نمی‌شود", async () => {
  const { requests, stats } = await parse([
    row("R1", "شیر فلکه", "ثبت شده"),
    row("R1", "الکترود", "بسته شده", "آقای بهمنی"),
  ]);
  assert.deepEqual(arr(requests[0].experts), [], "نام کارشناسِ کارِ تمام‌شده به درخواست تازه نمی‌چسبد");
  assert.equal(requests[0].expertConflict, false);
  assert.equal(stats.expertConflictDecision, 0);
});

/* گزارش سه‌ماهه بسته‌ها را هم می‌شمارد، پس هر درخواستِ فایل — باز و بسته — یک ردیفِ خلاصه در بایگانی دارد (ممیزی مهر ۱۴۰۵) */
test("خلاصهٔ بایگانی برای گزارش‌ها: هر درخواست، باز و بسته، با شمارش اقلام و کارشناسِ رایج", async () => {
  const parsed = await parse([
    row("R1", "شیر فلکه", "ثبت شده", "ابوذر بهمنی"),
    row("R1", "الکترود", "بسته شده", "ابوذر بهمنی"),
    row("R1", "سیم جوش", "متوقف شده", "حسین احسانی"),
    row("R2", "الکترود", "بسته شده"),
  ]);
  const TP = loadTP().TP;
  const H = arr(TP.requestSummaries(parsed));
  const r1 = H.find((h) => h.id === "R1"), r2 = H.find((h) => h.id === "R2");
  assert.deepEqual([r1.n, r1.nc, r1.ns, r1.nh, r1.sx, r1.ost, r1.date, r1.party], [3, 1, 1, 0, "ابوذر بهمنی", "ثبت شده", "1405/02/16", "کاجاران"]);
  assert.deepEqual([r2.n, r2.nc, r2.sx], [1, 1, ""], "درخواستِ کاملاً بسته هم بایگانی می‌شود");
  assert.match(r1.fp, /^[0-9a-f]+$/);
  assert.equal(arr(TP.requestSummaries(parsed)).find((h) => h.id === "R1").fp, r1.fp, "اثرانگشتِ پایدار");
  const later = await parse([
    row("R1", "شیر فلکه", "بسته شده", "ابوذر بهمنی"),
    row("R1", "الکترود", "بسته شده", "ابوذر بهمنی"),
    row("R1", "سیم جوش", "متوقف شده", "حسین احسانی"),
  ]);
  assert.notEqual(arr(TP.requestSummaries(later))[0].fp, r1.fp, "بسته شدنِ یک قلم اثرانگشت را عوض می‌کند و ردیف دوباره نوشته می‌شود");
});

test("وضعیت مختلط همچنان گزارش می‌شود", async () => {
  const { stats } = await parse([
    row("R1", "شیر فلکه", "ثبت شده"),
    row("R1", "الکترود", "بسته شده"),
  ]);
  assert.equal(stats.statusMixed, 1, "مدیر باید بداند اقلام این درخواست یکدست نیستند");
});
