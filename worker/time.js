/**
 * موتور تقویم و ساعات کاری — سمت سرور
 *
 * چرا این فایل وجود دارد:
 * تا امروز کل محاسبهٔ مهلت و رنگ مراحل فقط در مرورگر بود (`shared.js`: TP.wh، TP.endN،
 * TP.budget). Cron کلودفلیر مرورگر ندارد، پس برای هشدار تلگرام همین منطق سمت سرور لازم است.
 *
 * تفاوت حیاتی با نسخهٔ مرورگر:
 * `shared.js` از `new Date().setHours(8,...)` استفاده می‌کند، یعنی **ساعت محلی کاربر**.
 * در مرورگرِ کارشناس آن ساعت تهران است، ولی Worker همیشه روی **UTC** اجرا می‌شود.
 * کپی مستقیم آن کد، ساعت کاری را ۳٫۵ ساعت جابه‌جا می‌کرد و هشدارها را در زمان غلط می‌فرستاد.
 * این‌جا همه‌چیز صریحاً روی افست ثابت تهران حساب می‌شود.
 *
 * چرا افست ثابت درست است: ایران از سال ۱۴۰۱ ساعت تابستانی ندارد، پس +۰۳:۳۰ در کل سال
 * ثابت است و می‌توان روزها را با جمع ساده‌ی ۲۴ ساعت جلو برد.
 *
 * درستی این پیاده‌سازی با تست تطابق (`time.test.mjs`) در برابر همان `shared.js` واقعی
 * سنجیده می‌شود، نه با چشم — تا این دو هیچ‌وقت از هم واگرا نشوند.
 */

export const HOUR = 3600000;
export const DAY = 86400000;

/** افست ثابت تهران نسبت به UTC (+۰۳:۳۰) */
export const TEHRAN_OFFSET = 3.5 * HOUR;

/* ---------- تقویم شمسی (همان الگوریتم shared.js) ---------- */
/* تقسیم با کوتاه‌سازی به سمت صفر — دقیقاً مانند shared.js */
const dv = (a, b) => Math.trunc(a / b);
const md = (a, b) => a - dv(a, b) * b;

function jalCal(jy) {
  const br = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2137];
  const gy = jy + 621; let leapJ = -14, jp = br[0], jm = 0, jump = 0;
  for (let i = 1; i < br.length; i++) { jm = br[i]; jump = jm - jp; if (jy < jm) break; leapJ += dv(jump, 33) * 8 + dv(md(jump, 33), 4); jp = jm; }
  let n = jy - jp;
  leapJ += dv(n, 33) * 8 + dv(md(n, 33) + 3, 4);
  if (md(jump, 33) === 4 && jump - n === 4) leapJ++;
  const leapG = dv(gy, 4) - dv((dv(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + dv(jump + 4, 33) * 33;
  let leap = md(md(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  const d = dv((gy + dv(gm - 8, 6) + 100100) * 1461, 4) + dv(153 * md(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - dv(dv(gy + 100100 + dv(gm - 8, 6), 100) * 3, 4) + 752;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + dv(dv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = dv(md(j, 1461), 4) * 5 + 308;
  const gd = dv(md(i, 153), 5) + 1, gm = md(dv(i, 153), 12) + 1, gy = dv(j, 1461) - 100100 + dv(8 - gm, 6);
  return [gy, gm, gd];
}
function j2d(jy, jm, jd) { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - dv(jm, 7) * (jm - 7) + jd - 1; }
function g2j(gy_, gm_, gd_) {
  const jdn = g2d(gy_, gm_, gd_), gy = d2g(jdn)[0]; let jy = gy - 621;
  const r = jalCal(jy), jdn1f = g2d(gy, 3, r.march); let k = jdn - jdn1f;
  if (k >= 0) { if (k <= 185) return [jy, 1 + dv(k, 31), md(k, 31) + 1]; k -= 186; }
  else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return [jy, 7 + dv(k, 30), md(k, 30) + 1];
}

export const WEEKDAYS = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const p2 = (n) => String(n).padStart(2, "0");

/** اجزای تاریخ/ساعت یک لحظه، به وقت تهران */
export function tehranParts(ms) {
  const d = new Date(ms + TEHRAN_OFFSET);
  const [jy, jm, jd] = g2j(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return { jy, jm, jd, dow: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** «1405/06/19» به وقت تهران */
export function jStr(ms) { const p = tehranParts(ms); return `${p.jy}/${p2(p.jm)}/${p2(p.jd)}`; }

/** «پنجشنبه 1405/06/19 — 13:00» */
export function fmtFa(ms) {
  const p = tehranParts(ms);
  return `${WEEKDAYS[p.dow]} ${p.jy}/${p2(p.jm)}/${p2(p.jd)} — ${p2(p.hour)}:${p2(p.minute)}`;
}

/** شمار روزهای یک ماه شمسی (اسفند در سال کبیسه ۳۰ روز است) */
export function jLen(jy, jm) { if (jm <= 6) return 31; if (jm <= 11) return 30; return jalCal(jy).leap === 0 ? 30 : 29; }

/**
 * تاریخ شمسیِ واقعاً موجود؟
 * فقط الگوی «چهار رقم / دو رقم / دو رقم» کافی نیست: «1405/13/01» و «1405/07/31»
 * الگو را می‌پذیرند ولی وجود ندارند و اگر ذخیره شوند، هیچ‌وقت با هیچ روزی برابر نمی‌شوند
 * و تعطیلی‌شان بی‌صدا بی‌اثر می‌ماند.
 */
export function jValid(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s || "").trim());
  if (!m) return false;
  const jy = +m[1], jm = +m[2], jd = +m[3];
  return jy >= 1300 && jy <= 1500 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= jLen(jy, jm);
}

/** یکسان‌سازی «1405/6/7» → «1405/06/07»؛ اگر الگو نخورد، ورودی دست‌نخورده برمی‌گردد */
export function jNorm(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s || "").trim());
  return m ? `${m[1]}/${p2(+m[2])}/${p2(+m[3])}` : String(s || "").trim();
}

/** «1405/06/19» → میلی‌ثانیهٔ نیمه‌شب همان روز به وقت تهران؛ نامعتبر → null */
export function jStr2ms(s) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const [gy, gm, gd] = d2g(j2d(+m[1], +m[2], +m[3]));
  return Date.UTC(gy, gm - 1, gd) - TEHRAN_OFFSET;
}

/** نیمه‌شبِ روزِ تهرانیِ یک لحظه، بر حسب میلی‌ثانیهٔ UTC */
function dayStart(ms) { return Math.floor((ms + TEHRAN_OFFSET) / DAY) * DAY - TEHRAN_OFFSET; }

/**
 * پنجرهٔ کاری یک روز: [ساعت شروع، ساعت پایان] یا null برای تعطیل.
 * شنبه–چهارشنبه ۸–۱۷ · پنجشنبه ۸–۱۳ · جمعه تعطیل (SLA-01)
 * `isHoliday(jalaliDate)` تعطیلات رسمی را هم تعطیل می‌کند.
 */
/**
 * پنجرهٔ کاری یک روز، به ساعتِ اعشاریِ تهران.
 * شنبه–چهارشنبه ۷:۳۰ تا ۱۷:۰۰ · پنجشنبه ۷:۳۰ تا ۱۲:۳۰ · جمعه و تعطیل رسمی: هیچ.
 */
function windowOf(dayStartMs, isHoliday) {
  const p = tehranParts(dayStartMs + 12 * HOUR); /* ظهر، تا مرز نیمه‌شب دردسر نسازد */
  if (p.dow === 5) return null;
  if (isHoliday && isHoliday(`${p.jy}/${p2(p.jm)}/${p2(p.jd)}`)) return null;
  return p.dow === 4 ? [7.5, 12.5] : [7.5, 17];
}

/**
 * نزدیک‌ترین لحظه‌ای که می‌شود اعلان فرستاد.
 *
 * اگر همین حالا وسط ساعت اداری است، همین حالا؛ وگرنه شروعِ اولین روز کاریِ
 * بعدی. کارشناس نباید نیمه‌شب یا جمعه با اعلان سامانه بیدار شود — و اعلانی که
 * سرِ کار خوانده نشود، عملاً فرستاده نشده است.
 */
export function nextWorkMoment(ms, isHoliday) {
  for (let day = dayStart(ms), guard = 0; guard < 400; day += DAY, guard++) {
    const w = windowOf(day, isHoliday); if (!w) continue;
    const open = day + w[0] * HOUR, close = day + w[1] * HOUR;
    if (ms < open) return open;
    if (ms < close) return ms;
  }
  return ms;
}

/** آیا این لحظه داخل ساعت اداری است؟ */
export const inWorkHours = (ms, isHoliday) => nextWorkMoment(ms, isHoliday) === ms;

/**
 * رنگ یکی از شش باکس پایش — همان تابعِ `TP.stageColor` در shared.js.
 *
 * چرا این‌جا هم لازم است: مدیر باید در تلگرام همان رنگی را ببیند که در میز کار
 * می‌بیند. اگر دو پیاده‌سازی واگرا شوند، اعلانی می‌رسد که با صفحه نمی‌خواند —
 * و آن بدتر از نبودِ اعلان است. تست تطابق (time.test.mjs) این دو را قفل می‌کند.
 *
 *   idle  ارسال‌نشده        done  انجام‌شده       muted  هشدار خاموش / خارج از کارتابل
 *   empty در مهلت           warn  از آستانه گذشت  late   از آستانهٔ بعدی هم گذشت
 *   over  مهلت تمام شد
 */
export function stageColor(a, i, thr, nowMs, isHoliday) {
  if (!a.dispatchedAt) return "idle";
  if (!a.active) return a.done[i] ? "done" : "muted";
  if (a.done[i]) return "done";
  const act = thr.map((p, k) => ({ i: k, p })).filter((t) => t.p !== "" && t.p != null && !isNaN(t.p));
  const mine = act.find((t) => t.i === i); if (!mine) return "muted";
  const b = budgetHours(a.dispatchedAt, a.days, isHoliday); if (b <= 0) return "empty";
  const el = workHours(a.dispatchedAt, nowMs, isHoliday); if (el >= b) return "over";
  const t = Math.max(mine.p / 100 * b, 1), nx = act.find((t2) => t2.i > i);
  if (nx && el >= Math.max(nx.p / 100 * b, 1)) return "late";
  return el >= t ? "warn" : "empty";
}

/** رنگ هر شش باکس، یک‌جا */
export const stageColors = (a, thr, nowMs, isHoliday) =>
  [0, 1, 2, 3, 4, 5].map((i) => stageColor(a, i, thr, nowMs, isHoliday));

/** ساعات کاری بین دو لحظه */
export function workHours(a, b, isHoliday) {
  if (!(b > a)) return 0;
  let t = 0;
  for (let day = dayStart(a); day < b; day += DAY) {
    const w = windowOf(day, isHoliday); if (!w) continue;
    const f = Math.max(day + w[0] * HOUR, a), o = Math.min(day + w[1] * HOUR, b);
    if (o > f) t += (o - f) / HOUR;
  }
  return t;
}

/** پایان n‌اُمین روز کاری پس از `start` (پایان روز = ۱۷:۰۰ یا پنجشنبه ۱۳:۰۰) */
export function endOfNthWorkingDay(start, n, isHoliday) {
  const want = Math.max(1, Number(n) || 1);
  let k = 0;
  for (let day = dayStart(start), guard = 0; guard < 4000; day += DAY, guard++) {
    const w = windowOf(day, isHoliday); if (!w) continue;
    const e = day + w[1] * HOUR;
    if (e > start) { k++; if (k >= want) return e; }
  }
  throw new Error("پایان روز کاری پیدا نشد");
}

/** بودجهٔ مهلت بر حسب ساعت کاری */
export function budgetHours(dispatchedAt, days, isHoliday) {
  return workHours(dispatchedAt, endOfNthWorkingDay(dispatchedAt, days, isHoliday), isHoliday);
}

/**
 * لحظه‌ای که `hours` ساعتِ کاری پس از `start` سپری شده است.
 * وارونِ workHours است و برای ساختن زمان‌بندی هشدارها لازم است.
 */
export function addWorkingHours(start, hours, isHoliday) {
  let left = Math.max(0, Number(hours) || 0);
  if (left === 0) return start;
  for (let day = dayStart(start), guard = 0; guard < 4000; day += DAY, guard++) {
    const w = windowOf(day, isHoliday); if (!w) continue;
    const s = Math.max(day + w[0] * HOUR, start), e = day + w[1] * HOUR;
    if (e <= s) continue;
    const avail = (e - s) / HOUR;
    if (left <= avail) return s + left * HOUR;
    left -= avail;
  }
  throw new Error("افزودن ساعت کاری به نتیجه نرسید");
}

/**
 * زمان‌بندی هشدارهای یک ارجاع، در لحظهٔ ارسال.
 *
 * چرا از پیش ساخته می‌شود و در لحظهٔ هشدار حساب نمی‌شود:
 * (۱) `SLA-04` می‌گوید تغییر آستانه‌ها نباید روی ارجاع‌های در جریان اثر بگذارد؛
 * (۲) Cron در پلن رایگان فقط ۱۰ میلی‌ثانیه CPU دارد، پس باید صرفاً یک SELECT ساده بزند.
 *
 * خروجی: [{ stage, fireAt }] برای آستانه‌های فعال + یک ردیف `over` روی خود مهلت.
 */
export function alertSchedule(dispatchedAt, days, thresholds, isHoliday) {
  const deadlineAt = endOfNthWorkingDay(dispatchedAt, days, isHoliday);
  const budget = workHours(dispatchedAt, deadlineAt, isHoliday);
  const rows = [];
  if (budget > 0) {
    (thresholds || []).forEach((p, stage) => {
      if (p === "" || p == null || isNaN(p)) return;              /* آستانهٔ خاموش (SLA-10) */
      const h = Math.max((Number(p) / 100) * budget, 1);          /* حداقل یک ساعت کاری */
      if (h >= budget) return;                                    /* روی مهلت یا بعدش: ردیف over پوشش می‌دهد */
      rows.push({ stage, fireAt: addWorkingHours(dispatchedAt, h, isHoliday) });
    });
  }
  return { deadlineAt, budget, rows };
}
