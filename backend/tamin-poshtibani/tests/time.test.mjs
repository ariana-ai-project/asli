/* ============================================================
   تست موتور ساعات کاری سمت سرور — worker/time.js

   اجرا:  node --test backend/tamin-poshtibani/tests/

   دو چیز را می‌سنجد:

   ۱) تطابق با مرورگر — همان `shared.js` واقعی داخل یک سندباکس با منطقهٔ زمانی
      تهران اجرا می‌شود و خروجی‌اش با ماژول سرور روی صدها لحظهٔ تصادفی مقایسه
      می‌شود. اگر روزی یکی از این دو عوض شود و دیگری نه، این تست می‌شکند.
      (بدون این، کارشناس در پنل یک مهلت می‌بیند و بات چیز دیگری می‌گوید.)

   ۲) قواعد الزام‌آور `docs/01-domain/sla-policy.md` بند SLA-01 و SLA-02:
      شنبه–چهارشنبه ۸–۱۷ · پنجشنبه ۸–۱۳ · جمعه تعطیل · هفته = ۵۰ ساعت کاری.
   ============================================================ */
process.env.TZ = "Asia/Tehran"; /* باید پیش از ساختِ هر Date اجرا شود */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

import {
  HOUR, TEHRAN_OFFSET, workHours, endOfNthWorkingDay, budgetHours,
  addWorkingHours, alertSchedule, jStr, jStr2ms, tehranParts, jValid, jLen,
} from "../../../worker/time.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../../../frontend/tamin-poshtibani");

/** همان shared.js تولیدی را در سندباکس اجرا می‌کند تا مرجع مقایسه باشد. */
function loadBrowserTP() {
  const sandbox = { console, Date, Math, JSON, TextDecoder, TextEncoder, setTimeout, clearTimeout };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  sandbox.document = { createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener() {} };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(resolve(FRONT, "shared.js"), "utf8"), sandbox, { filename: "shared.js" });
  if (!sandbox.TP || !sandbox.TP.wh) throw new Error("TP.wh در سندباکس بار نشد");
  return sandbox.TP;
}

const TP = loadBrowserTP();

/* مولد شبه‌تصادفی با دانهٔ ثابت — تست باید هر بار یکسان باشد */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** یک لحظهٔ تصادفی در بازهٔ ۱۴۰۴ تا ۱۴۰۶ */
function randomMoment(r) {
  const start = Date.UTC(2025, 2, 21), end = Date.UTC(2027, 2, 21);
  return start + Math.floor(r() * (end - start));
}

test("تطابق ساعات کاری با پیاده‌سازی مرورگر روی ۴۰۰ بازهٔ تصادفی", () => {
  const r = rng(20260909);
  for (let i = 0; i < 400; i++) {
    const a = randomMoment(r), b = a + Math.floor(r() * 20 * 24 * HOUR);
    assert.equal(
      Math.round(workHours(a, b) * 1e6) / 1e6,
      Math.round(TP.wh(a, b) * 1e6) / 1e6,
      `ساعات کاری بین ${new Date(a).toISOString()} و ${new Date(b).toISOString()}`,
    );
  }
});

test("تطابق پایان n‌اُمین روز کاری و بودجهٔ مهلت با مرورگر", () => {
  const r = rng(7);
  for (let i = 0; i < 300; i++) {
    const a = randomMoment(r), n = 1 + Math.floor(r() * 10);
    assert.equal(endOfNthWorkingDay(a, n), TP.endN(a, n), `پایان روز کاری ${n}اُم از ${new Date(a).toISOString()}`);
    assert.equal(
      Math.round(budgetHours(a, n) * 1e6) / 1e6,
      Math.round(TP.budget(a, n) * 1e6) / 1e6,
      `بودجه برای ${n} روز از ${new Date(a).toISOString()}`,
    );
  }
});

test("تطابق تبدیل تاریخ شمسی با مرورگر", () => {
  const r = rng(99);
  for (let i = 0; i < 300; i++) {
    const a = randomMoment(r);
    assert.equal(jStr(a), TP.fmtD(a), `تاریخ ${new Date(a).toISOString()}`);
  }
  for (const s of ["1404/01/01", "1404/12/29", "1405/06/19", "1405/1/5", "1406/11/30"]) {
    assert.equal(jStr2ms(s), TP.jStr2ms(s), `تبدیل «${s}»`);
  }
});

test("SLA-01: هفتهٔ کاری ۵۰ ساعت است و جمعه تعطیل", () => {
  /* شنبه ۱۴۰۵/۰۶/۲۱ ساعت ۰۰:۰۰ تهران تا شنبهٔ بعد */
  const sat = jStr2ms("1405/06/21");
  assert.equal(tehranParts(sat).dow, 6, "روز مبنا باید شنبه باشد");
  assert.equal(workHours(sat, sat + 7 * 24 * HOUR), 50);

  /* جمعه هیچ ساعت کاری ندارد */
  const fri = jStr2ms("1405/06/27");
  assert.equal(tehranParts(fri).dow, 5, "روز مبنا باید جمعه باشد");
  assert.equal(workHours(fri, fri + 24 * HOUR), 0);

  /* پنجشنبه ۵ ساعت */
  const thu = jStr2ms("1405/06/26");
  assert.equal(tehranParts(thu).dow, 4, "روز مبنا باید پنجشنبه باشد");
  assert.equal(workHours(thu, thu + 24 * HOUR), 5);
});

test("SLA-02: مهلت روی پایان ساعت کاری می‌نشیند، نه ۲۴ ساعت بعد", () => {
  const satNoon = jStr2ms("1405/06/21") + 12 * HOUR; /* شنبه ۱۲:۰۰ */
  const end1 = endOfNthWorkingDay(satNoon, 1);
  assert.equal(tehranParts(end1).hour, 17, "پایان روز کاری عادی ۱۷:۰۰ است");
  assert.equal(jStr(end1), "1405/06/21");

  /* پنجشنبه باید ۱۳:۰۰ تمام شود */
  const wedNoon = jStr2ms("1405/06/25") + 12 * HOUR;
  const end2 = endOfNthWorkingDay(wedNoon, 2);
  assert.equal(tehranParts(end2).hour, 13);
  assert.equal(jStr(end2), "1405/06/26");
});

test("منطقهٔ زمانی: مرز ساعت کاری در تهران است نه UTC", () => {
  /* ۰۵:۰۰ UTC = ۰۸:۳۰ تهران → داخل ساعت کاری؛ اگر UTC حساب می‌شد، هنوز کار شروع نشده بود */
  const sat = jStr2ms("1405/06/21");
  const t0830 = sat + 8.5 * HOUR;
  assert.equal(new Date(t0830).getUTCHours(), 5, "این لحظه باید ۰۵:۰۰ UTC باشد");
  assert.equal(workHours(t0830, t0830 + HOUR), 1, "۰۸:۳۰ تا ۰۹:۳۰ تهران یک ساعت کاری است");

  /* ۱۷:۰۰ تهران = ۱۳:۳۰ UTC → پایان کار */
  const t1700 = sat + 17 * HOUR;
  assert.equal(workHours(t1700, t1700 + HOUR), 0, "بعد از ۱۷:۰۰ تهران ساعت کاری نیست");
  assert.equal(TEHRAN_OFFSET, 3.5 * HOUR);
});

test("addWorkingHours وارونِ workHours است", () => {
  const r = rng(4242);
  for (let i = 0; i < 200; i++) {
    const a = randomMoment(r), h = Math.round(r() * 40 * 100) / 100;
    const t = addWorkingHours(a, h);
    assert.ok(Math.abs(workHours(a, t) - h) < 1e-6, `${h} ساعت کاری از ${new Date(a).toISOString()}`);
  }
});

test("تعطیلات رسمی از ساعات کاری حذف می‌شوند", () => {
  const sat = jStr2ms("1405/06/21");
  const holiday = (d) => d === "1405/06/22"; /* یکشنبه تعطیل رسمی */
  assert.equal(workHours(sat, sat + 3 * 24 * HOUR), 27, "سه روز کاری عادی = ۲۷ ساعت");
  assert.equal(workHours(sat, sat + 3 * 24 * HOUR, holiday), 18, "با یک روز تعطیل = ۱۸ ساعت");

  /* روز تعطیل در شمارش روز کاری هم رد می‌شود */
  const e = endOfNthWorkingDay(sat + 9 * HOUR, 2, holiday);
  assert.equal(jStr(e), "1405/06/23", "روز کاری دوم باید دوشنبه باشد نه یکشنبه");
});

test("SLA-04: زمان‌بندی هشدارها در لحظهٔ ارسال ساخته می‌شود و صعودی است", () => {
  const dispatched = jStr2ms("1405/06/21") + 9 * HOUR; /* شنبه ۰۹:۰۰ */
  const s = alertSchedule(dispatched, 3, [10, 30, 50, 70, 90, 100]);

  assert.equal(s.budget, workHours(dispatched, s.deadlineAt));
  assert.equal(tehranParts(s.deadlineAt).hour, 17);

  /* آستانهٔ ۱۰۰٪ روی خود مهلت است و ردیف جدا نمی‌گیرد */
  assert.deepEqual(s.rows.map((x) => x.stage), [0, 1, 2, 3, 4]);
  for (let i = 1; i < s.rows.length; i++) {
    assert.ok(s.rows[i].fireAt > s.rows[i - 1].fireAt, "زمان هشدارها باید صعودی باشد");
  }
  /* هیچ هشداری بعد از مهلت نمی‌افتد */
  assert.ok(s.rows.every((x) => x.fireAt < s.deadlineAt));
  /* هیچ هشداری خارج از ساعت کاری نمی‌افتد (SLA-06) */
  for (const x of s.rows) {
    const p = tehranParts(x.fireAt);
    assert.notEqual(p.dow, 5, "هشدار نباید روز جمعه بیفتد");
    assert.ok(p.hour >= 8 && p.hour <= 17, `هشدار در ساعت ${p.hour} افتاده`);
  }
});

test("SLA-10: آستانهٔ خالی هشدار تولید نمی‌کند", () => {
  const dispatched = jStr2ms("1405/06/21") + 9 * HOUR;
  const s = alertSchedule(dispatched, 3, [10, "", null, 70, undefined, 100]);
  assert.deepEqual(s.rows.map((x) => x.stage), [0, 3]);
});

test("آستانه‌ها حداقل یک ساعت کاری پس از ارسال می‌افتند", () => {
  const dispatched = jStr2ms("1405/06/21") + 9 * HOUR;
  const s = alertSchedule(dispatched, 10, [1, 2, 3, 70, 90, 100]);
  for (const x of s.rows.slice(0, 3)) {
    assert.ok(workHours(dispatched, x.fireAt) >= 1 - 1e-9, "حداقل یک ساعت کاری فاصله لازم است");
  }
});

test("jValid تاریخ‌های ناموجود را رد می‌کند", () => {
  for (const ok of ["1405/01/01", "1405/06/31", "1405/07/30", "1403/12/30", "1405/1/5"]) {
    assert.equal(jValid(ok), true, `«${ok}» باید معتبر باشد`);
  }
  for (const bad of ["1405/13/01", "1405/00/01", "1405/07/31", "1405/06/32", "1405/12/30", "", "abc", "1405/1", null]) {
    assert.equal(jValid(bad), false, `«${bad}» نباید معتبر باشد`);
  }
  /* اسفند در سال کبیسه ۳۰ روز است — ۱۴۰۳ کبیسه بود، ۱۴۰۵ نیست */
  assert.equal(jLen(1403, 12), 30);
  assert.equal(jLen(1405, 12), 29);
});
