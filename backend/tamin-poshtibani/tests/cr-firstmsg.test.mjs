/* ============================================================
   «✉️ پیام اول» (فاز ۳؛ سند طراحی، بخش ۱؛ تصمیم‌های ۱ و ۶)
   • قالب‌های استاندارد با جای‌خالی‌های تازه؛ خانوادهٔ محتاط بی مقدار
   • قالبِ پیش‌فرضِ درخواست، قالب یا متنِ جدا برای هر تأمین‌کننده؛ متنِ ممنوع (نامِ دیگران، شمارِ پیشنهادها) ذخیره نمی‌شود
   • متنِ متفاوت در حالتِ محتاط: گیرندگانِ پیاپی گونه‌های دیگر
   • کارشناس هوشمند در دعوت همین متن را می‌فرستد؛ کلید خاموش ← همان دعوتِ پیشین
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { fillFm, fmCheck, qtyRange, STD, stdList, stdKey, FAMILY_OF_MODE } from "../../../worker/first-msg.js";

const items = [{ title: "ورق سیاه ۳ میل", qty: 1200, unit: "کیلوگرم", spec: "ST37", fixed: ["ضخامت: ۳ میل", "شرایط تسویه: نقدی"], open: ["برند: —"], due: "1405/08/10" }];

test("قالب‌های استاندارد: پنج خانواده، دست‌کم دو گونه، همه با «دستیار هوشمند» و «کمیسیون»", () => {
  assert.deepEqual(Object.keys(STD).sort(), ["cautious", "consult", "index", "max", "oem"]);
  for (const [f, vs] of Object.entries(STD)) {
    assert.ok(vs.length >= 2, f);
    for (const b of vs) { assert.match(b, /دستیار هوشمند/); assert.match(b, /کمیسیون/); assert.match(b, /\{فهرست اقلام\}/); }
  }
  assert.equal(stdList().length, Object.values(STD).reduce((s, v) => s + v.length, 0));
  assert.equal(FAMILY_OF_MODE.LIMITED_STAGED, "cautious");
  assert.equal(stdKey("max", 0), "std:max:1");
});

test("پر کردن: فهرست اقلام، ثابت و قابل تغییر، موارد لازم؛ در خانوادهٔ محتاط بی مقدار", () => {
  const ctx = { company: "تونل سد آریانا", supplier: "آهن الف", expertName: "آقای یک", family: "max", items, must: ["قیمت واحد", "زمان تحویل"] };
  const t = fillFm(STD.max[0], ctx);
  assert.match(t, /• ورق سیاه ۳ میل — ۱۲۰۰ کیلوگرم/);
  assert.match(t, /ضخامت: ۳ میل، شرایط تسویه: نقدی/);
  assert.match(t, /برند: —/);
  assert.match(t, /قیمت واحد، زمان تحویل/);
  assert.match(t, /تونل سد آریانا/);
  assert.doesNotMatch(t, /\{[^}]+\}/, "جای‌خالیِ پرنشده نماند");
  const c = fillFm(STD.cautious[0], { ...ctx, family: "cautious" });
  assert.doesNotMatch(c, /۱۲۰۰/, "محتاط: مقدارِ کامل نه");
  assert.match(c, /• ورق سیاه ۳ میل — حدود ۶۰۰ تا ۲۰۰۰ کیلوگرم/, "بازهٔ متعارف (تصمیم ۱۲)");
  assert.match(c, /مقدار نهایی پس از جمع‌بندی/);
  assert.equal(fillFm("{مقدار} {واحد}", { ...ctx, family: "cautious" }), "حدود ۶۰۰ تا ۲۰۰۰ کیلوگرم");
  assert.match(fillFm(STD.cautious[0], { ...ctx, family: "cautious", items: [{ ...items[0], qty: null }] }), /• ورق سیاه ۳ میل\n/, "بی مقدار: بی بازه، ساختگی نه");
  /* جای‌خالی‌های قبلی هم کار می‌کنند */
  assert.equal(fillFm("{تامین‌کننده} — {عنوان قلم} {مقدار} {واحد} — {نام کارشناس}", ctx), "آهن الف — ورق سیاه ۳ میل ۱۲۰۰ کیلوگرم — آقای یک");
});

test("سنجشِ افشا: نامِ دیگران و شمارِ پیشنهادها نمی‌رود؛ فوریت و مقدارِ کامل در محتاط هشدار", () => {
  const ok = fmCheck(fillFm(STD.max[1], { company: "ش", family: "max", items, must: [] }), { otherNames: ["آهن ب"], family: "max", items });
  assert.deepEqual(ok.block, []);
  const bad = fmCheck("سلام، آهن ب ارزان‌تر داد و از پنج فروشنده قیمت گرفتیم؛ حد ما ۱۰۰ است.", { otherNames: ["آهن ب"], family: "max", items });
  assert.ok(bad.block.some((x) => x.includes("آهن ب")));
  assert.ok(bad.block.some((x) => x.includes("شمار")));
  assert.ok(bad.block.some((x) => x.includes("حد ما")));
  const w = fmCheck("کار فوری است؛ ۱۲۰۰ کیلوگرم لازم داریم.", { otherNames: [], family: "cautious", items });
  assert.deepEqual(w.block, []);
  assert.ok(w.warn.some((x) => x.includes("فوری")));
  assert.ok(w.warn.some((x) => x.includes("مقدارِ کامل")));
});

test("بازهٔ متعارف: مقدارِ واقعی همیشه درونِ بازه و خودش گفته نمی‌شود؛ گرد", () => {
  assert.deepEqual(qtyRange(30), { lo: 15, hi: 45 });
  assert.deepEqual(qtyRange(1200), { lo: 600, hi: 2000 });
  assert.deepEqual(qtyRange(12), { lo: 6, hi: 20 });
  assert.deepEqual(qtyRange(1), { lo: 1, hi: 2 });
  assert.equal(qtyRange(null), null);
  assert.equal(qtyRange(0), null);
  for (const q of [2, 3, 7, 10, 18, 55, 99, 100, 101, 250, 999, 1000, 4321, 25000, 2.5]) {
    const r = qtyRange(q);
    assert.ok(r.lo < q && q < r.hi, `${q} درونِ ${r.lo}..${r.hi}`);
    assert.ok(r.lo >= 1);
  }
});
