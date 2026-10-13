/**
 * برنامه و حرکت‌های مذاکره (A5) — برگردانِ procstrat/negotiation.py
 *
 * planNegotiation یک بار برای هر قلمِ درخواست پس از رسیدنِ پیشنهادها؛ nextOffer و accept در هر دور.
 * واحد: همهٔ قیمت‌ها «قیمت مؤثر واحد»اند (pricing.effectivePrice(...).effective_unit_price). برای گفتنِ عدد به تأمین‌کننده
 * با شرایطِ مشخص، pricing.nominalForEffective. حد، هدف و قیمت مرجع هرگز به تأمین‌کننده گفته نمی‌شوند.
 */
import * as C from "./config.js";

/** قیمت مرجعِ امروز: میانهٔ قیمت واقعیِ ۲۴ ماه (item_price_reference) × ضریبِ شاخص از زمستان ۱۴۰۴ تا امروز */
export function referencePrice(itemRef, indexFactor = 1.0) {
  const v = itemRef.median_real_24m || itemRef.median_real_all;
  return v == null ? null : Number(v) * indexFactor;
}

/**
 * هدف و حد برای یک مذاکره. quotes: قیمت مؤثرِ پیشنهادهای معتبرِ تأمین‌کنندگانِ «دیگر» (بهترینشان BATNA این گفت‌وگوست).
 */
export function planNegotiation(profile, refPrice, quotes, urgent = false, expertRv = null) {
  const ms = profile.ms || "MS-1";
  const labels = profile.labels || [];
  const best = quotes && quotes.length ? Math.min(...quotes) : null;
  const anchor = refPrice ? refPrice : best;
  if (anchor == null) return { status: "NO_ANCHOR", action: "پیش از مذاکره دست‌کم دو پیشنهاد یا قیمت مرجع لازم است (S-13، T-06)" };
  let target = anchor * (1 + C.TARGET_VS_REF[ms]);
  if (best != null) target = Math.min(target, best);               /* هرگز بالاتر از پیشنهادی که کسی داده هدف نگیر */
  const tol = C.RV_TOL[ms] + (urgent ? C.URGENT_RV_EXTRA : 0.0);
  const rvRef = anchor * (1 + tol);
  let reservation = best != null ? Math.min(rvRef, best) : rvRef;  /* هرگز بیشتر از بهترین جایگزینِ واقعی */
  if (expertRv) reservation = expertRv;
  const c = (labels.includes("L2") || ms === "MS-4") ? C.CONCESSION_C_SCARCE : C.CONCESSION_C[ms];
  return { status: "OK", target, reservation, anchor, batna: best, c, rounds: C.ROUNDS[ms], needs_approval_above_reservation: true,
    urgent_extra_needs_expert: urgent,
    disclose: { reservation: false, target: false, urgency: false, competitor_names: false, real_competing_offer: true } };
}

/** پیشنهاد ما در دور t از T: هدف + (حد − هدف) × (t/T)^(1/c) — فاراتین و همکاران ۱۹۹۸ */
export function nextOffer(plan, t) {
  const T = Math.max(1, plan.rounds);
  const x = Math.min(1.0, Math.max(0.0, t / T));
  return plan.target + (plan.reservation - plan.target) * x ** (1.0 / plan.c);
}

/** AC_next، یا (دور آخر و درون حد و بهترینِ دیده‌شده) — بارسلاگ و همکاران ۲۰۱۱. «بله» یعنی پیشنهاد به انسان؛ عامل تعهد نمی‌دهد (G2) */
export function accept(plan, t, supplierOffer, bestSeen = null, hardConstraintsOk = true) {
  if (!hardConstraintsOk) return { accept: false, reason: "قید سخت برآورده نشده است (R10)" };
  if (supplierOffer > plan.reservation) return { accept: false, reason: "بالاتر از حد؛ ادامه یا ارجاع به کارشناس" };
  if (bestSeen != null && supplierOffer > bestSeen) return { accept: false, reason: "پیشنهاد واقعی بهتری ثبت شده است؛ با همان واقعیت (بی نام) پیشنهاد متقابل بده" };
  if (t >= plan.rounds) return { accept: true, reason: "دور آخر، درون حد و بهترین پیشنهاد دیده‌شده (AC_combi)" };
  const nxt = nextOffer(plan, t + 1);
  if (supplierOffer <= nxt) return { accept: true, reason: "پیشنهاد فروشنده از پیشنهاد بعدی ما بهتر یا برابر است (AC_next)" };
  return { accept: false, reason: "پیشنهاد متقابل بده" };
}

/** امتیاز هرگز پس گرفته نمی‌شود (رایفا) و از برنامهٔ زمانی جلو نمی‌افتد: با plan، پیشنهاد ≤ nextOffer(plan, t) */
export function concessionOk(previousOurs, proposed, plan = null, t = null) {
  if (previousOurs && previousOurs.length && proposed < previousOurs[previousOurs.length - 1] - 1e-9) return false;
  if (plan != null && t != null && proposed > nextOffer(plan, t) * (1 + 1e-9)) return false;
  return true;
}
