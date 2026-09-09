/* ============================================================
   تست طلایی IMP-08 روی پارسر واقعی مرورگر (frontend/tamin-poshtibani/import.js)

   اجرا:  node --test backend/tamin-poshtibani/tests/

   مرجع اعداد: purchasing-support/docs/01-domain/import-policy.md بند IMP-08
   «تست ورود اکسل باید دقیقاً همین هشت عدد را تولید کند. اگر نکرد، یا پارس
    غلط است یا فایل عوض شده.»
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { loadTP, fileFrom } from "./run.mjs";

/* فایل نمونهٔ واقعی. در مخزن asli نگه داشته نمی‌شود (داده واقعی شرکت است و این
   مخزن عمومی است) — از مخزن خصوصی purchasing-support خوانده می‌شود. */
const FIXTURE = "D:/Poshtibani/5 Github/purchasing-support/tests/fixtures/rahkaran-export-sample.xlsx";
const HAVE_FIXTURE = existsSync(FIXTURE);

/* اعداد الزام‌آور IMP-08 */
const GOLDEN = {
  itemRows: 1975,
  requests: 691,
  multiItem: 289,
  maxItems: 75,
  parties: 30,
  closedOnly: 410,          // «بسته شده» — جدا از «متوقف شده» (IMP-05)
  expertConflictAuto: 13,
  expertConflictDecision: 1,
};

let cached = null;
async function parsed() {
  if (!cached) {
    const s = loadTP();
    cached = await s.TP.importExcel(fileFrom(s, FIXTURE));
  }
  return cached;
}

test("IMP-08 — هر هشت عدد طلایی", { skip: !HAVE_FIXTURE && "فایل نمونه در دسترس نیست" }, async () => {
  const { stats } = await parsed();
  for (const [k, want] of Object.entries(GOLDEN)) {
    assert.equal(stats[k], want, `${k}: انتظار ${want} بود، ${stats[k]} شد`);
  }
});

test("کاربرگ «اقلام» با محتوای سرستون پیدا می‌شود، نه با جایگاه", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  assert.equal(out.sheet, "اقلام");
});

test("هیچ سطری گم یا تکرار نمی‌شود", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  const total = out.requests.reduce((a, r) => a + r.items.length, 0);
  assert.equal(total, GOLDEN.itemRows);
  assert.equal(out.stats.rows, GOLDEN.itemRows);
});

test("شمارهٔ درخواست‌ها یکتا هستند", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  const ids = out.requests.map((r) => r.id);
  assert.equal(new Set(ids).size, GOLDEN.requests);
});

test("تفکیک غیرفعال‌ها با closedRequests جمع می‌خورد", { skip: !HAVE_FIXTURE }, async () => {
  const { stats } = await parsed();
  assert.equal(stats.closedOnly + stats.stoppedOnly + stats.mixedInactive, stats.closedRequests);
  assert.equal(stats.openRequests + stats.closedRequests, GOLDEN.requests);
});

test("IMP-04 — دو کارشناس متفاوت یعنی تعارضِ نیازمند تصمیم", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  const conflicted = out.requests.filter((r) => r.expertConflict);
  assert.equal(conflicted.length, GOLDEN.expertConflictDecision);
  assert.ok(conflicted[0].experts.length > 1, "درخواست متعارض باید بیش از یک کارشناس داشته باشد");
});

test("IMP-07 — تعارض طرف مقابل شمرده می‌شود و بی‌صدا رد نمی‌شود", { skip: !HAVE_FIXTURE }, async () => {
  const { stats } = await parsed();
  assert.equal(stats.partyConflicts, 1);   // درخواست 3101198: «کاجاران» در کنار نام کامل
  assert.equal(stats.dateConflicts, 0);
});

test("هیچ وضعیت ناشناخته‌ای در فایل نمونه نیست و مقدارها سالم‌اند", { skip: !HAVE_FIXTURE }, async () => {
  const { stats } = await parsed();
  // شیء از realmِ سندباکس می‌آید، پس با کلیدها مقایسه می‌شود نه با deepEqual
  assert.deepEqual(Object.keys(stats.unknownStatuses), []);
  assert.equal(stats.badQty, 0);
});

test("ADR-0009 — درخواست تا وقتی یک قلم باز دارد «باز» است", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  for (const r of out.requests) {
    const hasOpen = r.items.some((i) => i.state === "open" || i.state === "hold");
    assert.equal(r.anyOpen, hasOpen, `درخواست ${r.id}`);
  }
});

test("payload فقط درخواست‌های باز را می‌فرستد، بسته‌ها فقط شناسه", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  const s = loadTP();
  const p = s.TP.importPayload(out);
  assert.equal(p.open.length, out.stats.openRequests);
  assert.equal(p.closedIds.length, out.stats.closedRequests);
  assert.ok(p.open.every((r) => r.anyOpen));
});

test("برش دسته‌ای از سقف اقلام عبور نمی‌کند مگر یک درخواست تنها بزرگ‌تر باشد", { skip: !HAVE_FIXTURE }, async () => {
  const out = await parsed();
  const s = loadTP();
  const chunks = s.TP.chunkRequests(out.requests.filter((r) => r.anyOpen), 600);
  assert.ok(chunks.length > 0);
  const seen = chunks.flat().length;
  assert.equal(seen, out.stats.openRequests, "هیچ درخواستی در برش گم نمی‌شود");
  for (const c of chunks) {
    const n = c.reduce((a, r) => a + r.items.length, 0);
    assert.ok(n <= 600 || c.length === 1, `دستهٔ ${n} قلمی با ${c.length} درخواست`);
  }
});

/* --- ورودی‌های نامعتبر: باید با پیام روشن رد شوند، نه خروجی بی‌معنا --- */

test("فایل غیر اکسل رد می‌شود", async () => {
  const s = loadTP();
  const fake = { name: "x.txt", size: 10, async arrayBuffer() { return new ArrayBuffer(10); } };
  await assert.rejects(() => s.TP.importExcel(fake), /فقط فایل اکسل/);
});

test("فایل بزرگ‌تر از سقف رد می‌شود", async () => {
  const s = loadTP();
  const big = { name: "big.xlsx", size: 60 * 1024 * 1024, async arrayBuffer() { return new ArrayBuffer(0); } };
  await assert.rejects(() => s.TP.importExcel(big), /سقف/);
});

test("اکسل بدون ستون‌های لازم با کد BAD_HEADER رد می‌شود", async () => {
  const s = loadTP();
  const ws = s.XLSX.utils.aoa_to_sheet([["الف", "ب"], [1, 2]]);
  const wb = s.XLSX.utils.book_new();
  s.XLSX.utils.book_append_sheet(wb, ws, "چیزی");
  const bytes = s.XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const f = { name: "bad.xlsx", size: bytes.byteLength, async arrayBuffer() { return bytes; } };
  await assert.rejects(() => s.TP.importExcel(f), (e) => e.code === "BAD_HEADER");
});
