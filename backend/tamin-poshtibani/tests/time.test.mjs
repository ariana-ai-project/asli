/* ============================================================
   تست موتور ساعات کاری سمت سرور — worker/time.js

   اجرا:  node --test backend/tamin-poshtibani/tests/

   دو چیز را می‌سنجد:

   ۱) تطابق با مرورگر — همان `shared.js` واقعی داخل یک سندباکس با منطقهٔ زمانی
      تهران اجرا می‌شود و خروجی‌اش با ماژول سرور روی صدها لحظهٔ تصادفی مقایسه
      می‌شود. اگر روزی یکی از این دو عوض شود و دیگری نه، این تست می‌شکند.
      (بدون این، کارشناس در پنل یک مهلت می‌بیند و بات چیز دیگری می‌گوید.)

   ۲) قواعد الزام‌آور `docs/01-domain/sla-policy.md` بند SLA-01 و SLA-02:
      شنبه–چهارشنبه ۷:۳۰–۱۷ · پنجشنبه ۷:۳۰–۱۲:۳۰ · جمعه تعطیل · هفته = ۵۲٫۵ ساعت کاری.
   ============================================================ */
process.env.TZ = "Asia/Tehran"; /* باید پیش از ساختِ هر Date اجرا شود */
const DAY_MS = 24 * 3600000;

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

import {
  HOUR, TEHRAN_OFFSET, workHours, endOfNthWorkingDay, budgetHours,
  addWorkingHours, alertSchedule, jStr, jStr2ms, tehranParts, jValid, jLen,
  nextWorkMoment, inWorkHours, stageColor, stageColors,
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

test("تطابق رنگ باکس‌های پایش با مرورگر", () => {
  /* مدیر باید در تلگرام همان رنگی را ببیند که در میز کار می‌بیند. اگر این دو
     واگرا شوند، اعلانی می‌رسد که با صفحه نمی‌خواند — بدتر از نبودِ اعلان. */
  const r = rng(31337);
  const THRS = [[10, 30, 50, 70, 90, 100], [20, 40, 60, 80, "", 100], [5, "", null, 70, 95, 100]];
  let seen = new Set();
  for (let k = 0; k < 500; k++) {
    const dispatchedAt = randomMoment(r);
    const a = {
      dispatchedAt: r() < 0.05 ? null : dispatchedAt,
      days: 1 + Math.floor(r() * 6),
      active: r() > 0.15,
      done: [0, 1, 2, 3, 4, 5].map(() => r() > 0.6),
    };
    const thr = THRS[Math.floor(r() * THRS.length)];
    const nowMs = dispatchedAt + Math.floor(r() * 12 * 24 * HOUR);
    for (let i = 0; i < 6; i++) {
      const mine = stageColor(a, i, thr, nowMs);
      seen.add(mine);
      assert.equal(mine, TP.stageColor(a, i, thr, nowMs), `باکس ${i} در ${new Date(nowMs).toISOString()}`);
    }
    assert.deepEqual(stageColors(a, thr, nowMs), [0, 1, 2, 3, 4, 5].map((i) => stageColor(a, i, thr, nowMs)));
  }
  /* اگر نمونه‌ها فقط یک رنگ بدهند، تست عملاً چیزی نسنجیده است */
  for (const c of ["idle", "done", "muted", "empty", "warn", "late", "over"]) {
    assert.ok(seen.has(c), `رنگ «${c}» در نمونه‌ها نیامد — تست پوشش ندارد`);
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

test("SLA-01: هفتهٔ کاری ۵۲٫۵ ساعت است و جمعه تعطیل", () => {
  /* شنبه ۱۴۰۵/۰۶/۲۱ ساعت ۰۰:۰۰ تهران تا شنبهٔ بعد */
  const sat = jStr2ms("1405/06/21");
  assert.equal(tehranParts(sat).dow, 6, "روز مبنا باید شنبه باشد");
  assert.equal(workHours(sat, sat + 7 * 24 * HOUR), 5 * 9.5 + 5);

  /* جمعه هیچ ساعت کاری ندارد */
  const fri = jStr2ms("1405/06/27");
  assert.equal(tehranParts(fri).dow, 5, "روز مبنا باید جمعه باشد");
  assert.equal(workHours(fri, fri + 24 * HOUR), 0);

  /* پنجشنبه ۵ ساعت: ۷:۳۰ تا ۱۲:۳۰ */
  const thu = jStr2ms("1405/06/26");
  assert.equal(tehranParts(thu).dow, 4, "روز مبنا باید پنجشنبه باشد");
  assert.equal(workHours(thu, thu + 24 * HOUR), 5);

  /* روز عادی ۹٫۵ ساعت */
  assert.equal(workHours(sat, sat + 24 * HOUR), 9.5);
});

test("اعلان بیرون از ساعت اداری به اولین لحظهٔ کاری می‌افتد", () => {
  const sat = jStr2ms("1405/06/21");                 /* شنبه ۰۰:۰۰ */
  const open = sat + 7.5 * HOUR, close = sat + 17 * HOUR;

  assert.equal(nextWorkMoment(sat + 3 * HOUR), open, "نیمه‌شب → ۷:۳۰ همان روز");
  assert.equal(nextWorkMoment(sat + 7.4 * HOUR), open, "کمی پیش از باز شدن");
  assert.equal(nextWorkMoment(sat + 10 * HOUR), sat + 10 * HOUR, "وسط روز، همان لحظه");
  assert.equal(nextWorkMoment(close), sat + DAY_MS + 7.5 * HOUR, "لحظهٔ بسته‌شدن → فردا");
  assert.equal(nextWorkMoment(sat + 20 * HOUR), sat + DAY_MS + 7.5 * HOUR, "شب → فردا ۷:۳۰");

  /* پنجشنبه بعدازظهر و جمعه، هر دو به شنبه می‌افتند */
  const thu = jStr2ms("1405/06/26");
  const nextSat = jStr2ms("1405/06/28");
  assert.equal(tehranParts(nextSat).dow, 6);
  assert.equal(nextWorkMoment(thu + 14 * HOUR), nextSat + 7.5 * HOUR, "پنجشنبه بعدازظهر");
  assert.equal(nextWorkMoment(jStr2ms("1405/06/27") + 10 * HOUR), nextSat + 7.5 * HOUR, "جمعه");

  assert.equal(inWorkHours(sat + 10 * HOUR), true);
  assert.equal(inWorkHours(sat + 20 * HOUR), false);
  assert.equal(inWorkHours(thu + 14 * HOUR), false);

  /* تعطیل رسمی هم مثل جمعه است */
  const isHol = (d) => d === "1405/06/28";
  assert.equal(nextWorkMoment(nextSat + 3 * HOUR, isHol), jStr2ms("1405/06/29") + 7.5 * HOUR);
});

test("SLA-02: مهلت روی پایان ساعت کاری می‌نشیند، نه ۲۴ ساعت بعد", () => {
  const satNoon = jStr2ms("1405/06/21") + 12 * HOUR; /* شنبه ۱۲:۰۰ */
  const end1 = endOfNthWorkingDay(satNoon, 1);
  assert.equal(tehranParts(end1).hour, 17, "پایان روز کاری عادی ۱۷:۰۰ است");
  assert.equal(jStr(end1), "1405/06/21");

  /* پنجشنبه باید ۱۲:۳۰ تمام شود */
  const wedNoon = jStr2ms("1405/06/25") + 12 * HOUR;
  const end2 = endOfNthWorkingDay(wedNoon, 2);
  const p2 = tehranParts(end2);
  assert.equal(p2.hour, 12);
  assert.equal(p2.minute, 30);
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
  assert.equal(workHours(sat, sat + 3 * 24 * HOUR), 3 * 9.5, "سه روز کاری عادی");
  assert.equal(workHours(sat, sat + 3 * 24 * HOUR, holiday), 2 * 9.5, "با یک روز تعطیل");

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
  /* هیچ هشداری خارج از ساعت اداری نمی‌افتد (SLA-06) */
  for (const x of s.rows) {
    const p = tehranParts(x.fireAt);
    assert.notEqual(p.dow, 5, "هشدار نباید روز جمعه بیفتد");
    assert.ok(inWorkHours(x.fireAt), `هشدار در ${p.hour}:${p.minute} افتاده`);
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
