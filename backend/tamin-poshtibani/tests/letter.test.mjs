/* ============================================================
   نامهٔ پیوست — worker/letter.js

   چرا این تست وجود دارد: مدل یک بار «هفت قلم» و جمعِ هفت قلم را در نامه نوشت،
   وقتی کارشناس فقط دو خط را تیک زده بود. از نسخهٔ ۲، مدل عدد نمی‌نویسد؛
   جای‌خالی می‌گذارد و سامانه از همان داده‌ای که جدول کمیسیون را می‌سازد پرش
   می‌کند. این‌جا همان قاعده سنجیده می‌شود، بدون فراخوان مدل.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { letterData, fillLetter, LETTER_PROMPT_VERSION } from "../../../worker/letter.js";

const request = { id: "3400976", date: "1405/06/19", party: "ایستگاه پمپاژ دوم" };
const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, title: "تابلو برق " + n, qty: 1, unit: "عدد" }));
const quotes = items.map((it) => ({ item_id: it.id, supplier_name: "شرکت فنی و مهندسی آریا صنعت", saved: 1, final: it.id === 2 || it.id === 5 ? 1 : 0, price: 1000000 * it.id, qty: 1 }));

test("دادهٔ نامه فقط تیک‌خورده‌ها را می‌بیند — همان جدول کمیسیون", () => {
  const d = letterData({ request, items, quotes, allItems: items });
  assert.deepEqual(d.items.map((i) => i.id), [2, 5]);
  assert.equal(d.totalItems, 7);
  assert.equal(d.suppliers.length, 1);
  assert.equal(d.suppliers[0].count, 2);
  assert.equal(d.suppliers[0].sum, 7000000, "۲ + ۵ میلیون، نه ۲۸ میلیون");
});

test("جای‌خالی‌ها از دادهٔ سامانه پر می‌شوند", () => {
  const d = letterData({ request, items, quotes, allItems: items });
  const { letter, unresolved, suspicious } = fillLetter({
    subject: "گزارش استعلام درخواست {{شماره_درخواست}}",
    paragraphs: [
      "درخواست {{شماره_درخواست}} مورخ {{تاریخ_درخواست}} برای {{طرف_مقابل}} {{تعداد_اقلام_درخواست}} قلم دارد و جدول کمیسیون {{تعداد_اقلام_کمیسیون}} قلم ({{اقلام_کمیسیون}}).",
      "جمع پیشنهاد {{جمع|آریا صنعت}} ریال برای {{تعداد|آریا صنعت}} قلم؛ قیمت {{قیمت|آریا صنعت|تابلو برق 5}} ریال.",
    ],
    closing: "خواهشمند است دستور فرمایید.",
  }, d);
  assert.equal(letter.subject, "گزارش استعلام درخواست 3400976");
  assert.ok(letter.paragraphs[0].includes("مورخ 1405/06/19"));
  assert.ok(letter.paragraphs[0].includes("ایستگاه پمپاژ دوم 7 قلم دارد و جدول کمیسیون 2 قلم (تابلو برق 2، تابلو برق 5)"), letter.paragraphs[0]);
  assert.ok(letter.paragraphs[1].includes("جمع پیشنهاد 7,000,000 ریال برای 2 قلم"), letter.paragraphs[1]);
  assert.ok(letter.paragraphs[1].includes("قیمت 5,000,000 ریال"), "نام تأمین‌کننده با تطبیقِ جزئی هم پیدا می‌شود");
  assert.deepEqual(unresolved, []);
  assert.deepEqual(suspicious, [], "عددهای پرشده مشکوک نیستند");
});

test("جای‌خالیِ ناشناس «—» می‌شود و گزارش می‌شود", () => {
  const d = letterData({ request, items, quotes, allItems: items });
  const { letter, unresolved } = fillLetter({ paragraphs: ["جمع {{جمع|شرکت ناموجود}} ریال و {{چیز_عجیب}}"] }, d);
  assert.equal(letter.paragraphs[0], "جمع — ریال و —");
  assert.deepEqual(unresolved.sort(), ["جمع|شرکت ناموجود", "چیز_عجیب"]);
});

test("عددِ بزرگی که مدل خودش نوشته، مشکوک علامت می‌خورد", () => {
  const d = letterData({ request, items, quotes, allItems: items });
  const { suspicious } = fillLetter({ paragraphs: ["جمع مبلغ پیشنهادی ۱۱۴,۱۵۰,۰۰۰ ریال برای هفت قلم؛ در سال ۱۴۰۴ سه بار تماس گرفتیم."] }, d);
  assert.deepEqual(suspicious, ["۱۱۴,۱۵۰,۰۰۰"], "سال ۱۴۰۴ و عددهای کوچک مشکوک نیستند");
});

test("نسخهٔ دستور عوض شده تا خروجی‌های قدیمی قابل تشخیص باشند", () => {
  assert.equal(LETTER_PROMPT_VERSION, "letter/2.0");
});
