/* ============================================================
   ارجاع و آستانه‌ها — worker/assign.js
   آستانه‌های کارشناس ارشد برای تیمش، دکمه‌های پیام «ارجاع جدید»، و امضای ارجاعِ ارشد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { parseThresholds, seenKb, dispatchText } from "../../../worker/assign.js";

test("آستانه‌ها: شش‌تایی، صعودی، ۱ تا ۱۰۰؛ خالی یعنی خاموش", () => {
  assert.deepEqual(parseThresholds([10, 30, 50, 70, 90, 100]), [10, 30, 50, 70, 90, 100]);
  assert.deepEqual(parseThresholds("[5,15,\"\",40,60,90]"), [5, 15, "", 40, 60, 90]);
  assert.deepEqual(parseThresholds(["", "", "", "", "", 100]), ["", "", "", "", "", 100]);
  assert.equal(parseThresholds([50, 10, 20, 30, 40, 60]), null, "نزولی");
  assert.equal(parseThresholds([0, 10, 20, 30, 40, 60]), null, "صفر");
  assert.equal(parseThresholds([10, 20, 30, 40, 50, 101]), null, "بیش از ۱۰۰");
  assert.equal(parseThresholds([10, 20, 30]), null, "کمتر از شش");
  assert.equal(parseThresholds(null), null);
  assert.equal(parseThresholds("خراب"), null);
});

test("دکمه‌های پیام ارجاع: «ارجاع به تیم» فقط برای کارشناس ارشدِ تیم‌دار", () => {
  assert.deepEqual(seenKb(7).flat().map((b) => b.callback_data), ["seen:a:7"]);
  assert.deepEqual(seenKb(7, true).flat().map((b) => b.callback_data), ["seen:a:7", "dg:7:n"]);
});

test("پیام ارجاع: امضای مدیر، یا «از سوی» کارشناس ارشد", () => {
  const a = { request_id: "R1", party: "پروژه", item_count: 1, days: 2, deadline_at: Date.UTC(2026, 8, 20, 10), items: [{ title: "پیچ", qty: 3, unit: "عدد" }] };
  assert.match(dispatchText(a), /ارجاع از سوی مدیر واحد پشتیبانی/);
  assert.match(dispatchText({ ...a, from: "آقای کوشاری" }), /ارجاع از سوی آقای کوشاری/);
  assert.doesNotMatch(dispatchText({ ...a, from: "آقای کوشاری" }), /مدیر واحد پشتیبانی/);
});
