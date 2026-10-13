/**
 * آشکارسازهای قطعی که وضعیت‌های مذاکره را از داده برمی‌دارند (A6) — برگردانِ procstrat/detectors.py
 * هر کدام فهرستی از {state, detail} برمی‌گرداند. وضعیت‌های زبانی (آنچه تأمین‌کننده گفت) کارِ طبقه‌بندِ وضعیت است؛
 * این‌ها آن چیزی را می‌پوشانند که فقط عددها نشان می‌دهند.
 */
import * as C from "./config.js";

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const pstdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/* قالبِ :.0% پایتون */
const pct0 = (r) => `${Math.round(r * 100)}%`;

/** quotes: [{supplier_id, unit_price (قیمت مؤثر واحد), validity_hours, fields: {name: value}}] */
export function quoteChecks(quotes, refPrice, ms, requiredFields) {
  const out = [];
  const prices = quotes.filter((q) => q.unit_price).map((q) => q.unit_price);
  /* پیشنهادهای یکسان یا تقریباً یکسان (C-05؛ پرچم‌های قرمز OECD ۲۰۲۵) */
  for (let i = 0; i < quotes.length; i++) {
    for (let j = i + 1; j < quotes.length; j++) {
      const a = quotes[i].unit_price, b = quotes[j].unit_price;
      if (a && b && Math.abs(a - b) / Math.max(a, b) <= C.IDENTICAL_QUOTES_REL) out.push({ state: "ST-Q05", detail: `${quotes[i].supplier_id} و ${quotes[j].supplier_id} تقریباً یکسان` });
    }
  }
  for (const q of quotes) {
    const p = q.unit_price;
    const others = quotes.filter((x) => x !== q && x.unit_price).map((x) => x.unit_price);
    if (p && others.length >= 2 && p < C.ABNORMALLY_LOW_VS_MEDIAN * median(others)) out.push({ state: "ST-Q06", detail: `${q.supplier_id} بسیار پایین‌تر از میانهٔ بقیه` });
    else if (p && refPrice && p < C.ABNORMALLY_LOW_VS_REF * refPrice) out.push({ state: "ST-Q06", detail: `${q.supplier_id} بسیار پایین‌تر از قیمت مرجع` });
    const vh = q.validity_hours;
    if (vh != null && vh < C.SHORT_VALIDITY_HOURS && ms !== "MS-3") out.push({ state: "ST-Q08", detail: `${q.supplier_id} اعتبار ${vh} ساعت` });
    const missing = (requiredFields || []).filter((f) => !((q.fields || {})[f]));
    if (missing.length) out.push({ state: "ST-Q03", detail: `${q.supplier_id} کم دارد: ${missing.join("، ")}` });
  }
  if (refPrice && prices.length && prices.every((p) => p > refPrice * (1 + (C.RV_TOL[ms] ?? 0.05)))) out.push({ state: "ST-Q07", detail: "همهٔ پیشنهادهای معتبر بالاتر از قیمت مرجع + تحمل کلاس" });
  if (prices.length < 2) out.push({ state: "ST-Q02", detail: `فقط ${prices.length} پیشنهاد معتبر` });
  return out;
}

/** تأمین‌کنندگانی که پیشنهادشان بالاتر از قیمت مرجع + تحمل کلاس است (پرچمِ هر پیشنهاد در نمای کمیسیون) */
export function aboveReference(quotes, refPrice, ms) {
  if (!refPrice) return [];
  return quotes.filter((q) => q.unit_price && q.unit_price > refPrice * (1 + (C.RV_TOL[ms] ?? 0.05))).map((q) => q.supplier_id);
}

/** ST-N20: پیشنهادِ اولِ تأمین‌کننده بالاتر از مرجع × (۱ + ۲ × تحمل کلاس) */
export function extremeAnchor(firstOffer, refPrice, ms) {
  if (firstOffer && refPrice && firstOffer > refPrice * (1 + 2 * (C.RV_TOL[ms] ?? 0.05))) {
    return [{ state: "ST-N20", detail: `پیشنهاد اول ${pct0(firstOffer / refPrice - 1)} بالاتر از قیمت مرجع` }];
  }
  return [];
}

/** STAGED_BROADENING فقط وقتی موج دوم را باز می‌کند که موج اول رقابتی به نظر برسد */
export function competitiveSignal(prices) {
  if (prices.length < C.BROADEN_IF.min_valid_quotes) return false;
  const m = mean(prices);
  const cv = m ? pstdev(prices) / m : 0;
  const identical = prices.some((a, i) => prices.slice(i + 1).some((b) => Math.abs(a - b) / Math.max(a, b) <= C.IDENTICAL_QUOTES_REL));
  return cv >= C.BROADEN_IF.min_cv && !(C.BROADEN_IF.no_identical && identical);
}

export function dependenceCheck(shareAfter, cap, active) {
  if (active && shareAfter > cap) return [{ state: "ST-Q11", detail: `سهم پس از این سفارش ${pct0(shareAfter)} > سقف ${pct0(cap)}` }];
  return [];
}

/** history: برنده‌های گذشتهٔ همان نوع قلم [{date, winner, bidders}]، قدیمی اول — نوبت‌دهیِ گروهِ بسته (SRC-06 ص ۱۰–۱۲) */
export function winnerRotation(history, minRounds = 6) {
  if (history.length < minRounds) return [];
  const last = history.slice(-minRounds);
  const winners = last.map((h) => h.winner);
  const group = new Set(winners);
  const bidders = new Set(last.flatMap((h) => h.bidders || []));
  const alternating = winners.every((w, i) => i === winners.length - 1 || w !== winners[i + 1]);
  if (group.size >= 2 && group.size <= 3 && alternating && [...bidders].every((b) => group.has(b))) {
    return [{ state: "ST-Q10", detail: `نوبت‌دهی محتمل میان ${group.size} تأمین‌کننده` }];
  }
  return [];
}

/** غربالِ هرینگتون: افزایشِ پیوسته و سپس قیمت‌هایی به‌طرزِ غیرعادی ثابت */
export function lowVarianceAfterRise(monthlyPrices, window = 6) {
  if (monthlyPrices.length < 2 * window) return [];
  const prev = monthlyPrices.slice(-2 * window, -window), last = monthlyPrices.slice(-window);
  const rise = last[0] > prev[0] * 1.10;
  const cvPrev = pstdev(prev) / mean(prev), cvLast = pstdev(last) / mean(last);
  if (rise && cvLast < 0.5 * cvPrev) return [{ state: "ST-Q10", detail: "پس از افزایش، نوسان قیمت به‌طور غیرعادی کم شده است" }];
  return [];
}
