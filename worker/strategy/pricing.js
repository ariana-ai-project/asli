/**
 * قیمت مؤثر (A4؛ R11–R16) و مقایسهٔ با جریمهٔ وابستگی (A3؛ R08) — برگردانِ procstrat/pricing.py
 *
 * همهٔ پول‌ها ریال. قطعی است: مدل زبانی نتیجه را می‌خواند و توضیح می‌دهد، هرگز حسابش نمی‌کند (R16).
 */
import * as C from "./config.js";

/** گردکردنِ پایتونی (نیمه به زوج) تا خروجی با موتور مرجع یکی بماند */
export function pyRound(x, nd = 0) {
  const m = 10 ** nd, y = x * m, f = Math.floor(y), d = y - f;
  if (Math.abs(d - 0.5) < 1e-12) return (f % 2 === 0 ? f : f + 1) / m;
  return Math.round(y) / m;
}
const pct1 = (r) => `${(r * 100).toFixed(1)}%`;
const pct0 = (r) => `${Math.round(r * 100)}%`;
/* قالبِ :g پایتون برای عددهای کوچکِ این‌جا (ماه و روز): ۲ ← «2»، ۱٫۵ ← «1.5» */
const g = (v) => String(Number(v.toPrecision(6)));

/** نرخی که پرداختِ دیرتر را به پولِ امروز برمی‌گرداند. basis: panel | fx | max */
export function monthlyDiscountRate(panelRate, fxGrowth, basis = C.DISCOUNT_BASIS) {
  const p = panelRate || 0.0, gr = fxGrowth || 0.0;
  if (basis === "panel") return p;
  if (basis === "fx") return gr;
  return Math.max(p, gr);
}

/**
 * یک پیشنهاد را به «ریالِ امروز» مقایسه‌پذیر می‌رساند و هر گام را نشان می‌دهد.
 * offer: {price, qty, vat_included, has_official_invoice, pay_months, prepay_share, delivery_days, condition_ok, quality_coef, logistics_cost}
 * item: {needed_by_days, delay_cost_per_day, condition_risk: {p, cost_share}}
 * settings: {vat_rate, vat_creditable, panel_rate, fx_growth, basis, no_invoice_premium}
 */
export function effectivePrice(offer, item, settings) {
  item = item || {}; settings = settings || {};
  const steps = [];
  let price = Number(offer.price) * Number(offer.qty ?? 1);
  steps.push(["قیمت کل پیشنهاد", price]);
  const vat = settings.vat_rate ?? C.VAT_RATE;
  const creditable = settings.vat_creditable ?? C.VAT_CREDITABLE;
  if (offer.has_official_invoice) {
    if (offer.vat_included) {
      if (creditable) { price = price / (1 + vat); steps.push(["حذف مالیات بر ارزش افزودهٔ قابل‌استرداد", price]); }
    } else if (!creditable) { price = price * (1 + vat); steps.push(["افزودن مالیات بر ارزش افزودهٔ غیرقابل‌استرداد", price]); }
  } else {
    const prem = settings.no_invoice_premium ?? C.NO_INVOICE_RISK_PREMIUM;
    price = price * (1 + prem);
    steps.push(["افزودن ریسک خرید بی صورتحساب رسمی", price]);
  }
  const rho = monthlyDiscountRate(settings.panel_rate, settings.fx_growth, settings.basis ?? C.DISCOUNT_BASIS);
  const pre = Number(offer.prepay_share || 0);
  const months = Number(offer.pay_months || 0);
  /* بخشِ پیش‌پرداخت به‌طور میانگین یک ماه پیش از تحویل پرداخت می‌شود؛ بقیه پس از months */
  let pv = price * pre * (1 + rho) ** 1.0 + price * (1 - pre) / (1 + rho) ** months;
  if (Math.abs(pv - price) > 1e-6) steps.push([`ارزش امروز با نرخ ماهانهٔ ${pct1(rho)} (پیش‌پرداخت ${pct0(pre)}، بقیه پس از ${g(months)} ماه)`, pv]);
  const risk = item.condition_risk || {};
  if (!(offer.condition_ok ?? true) && Object.keys(risk).length) {
    pv += pv * (risk.p || 0) * (risk.cost_share || 0);
    steps.push(["هزینهٔ مورد انتظار نپذیرفتن شرط تحویل (احتمال × هزینه)", pv]);
  }
  const late = Math.max(0.0, Number(offer.delivery_days || 0) - Number(item.needed_by_days || 1e9));
  if (late && item.delay_cost_per_day) { pv += late * item.delay_cost_per_day; steps.push([`هزینهٔ ${g(late)} روز تأخیر نسبت به نیاز`, pv]); }
  if (offer.logistics_cost) { pv += Number(offer.logistics_cost); steps.push(["هزینهٔ حمل و تخلیه", pv]); }
  const q = Number(offer.quality_coef || 1.0);
  if (q !== 1.0) { pv = pv / q; steps.push([`ضریب کیفیت کارشناس ${g(q)}`, pv]); }
  const qty = Number(offer.qty || 1) || 1;
  return { effective_price: pv, effective_unit_price: pv / qty, steps, monthly_rate: rho };
}

/** قیمتِ اسمیِ واحدی که زیرِ terms همان قیمتِ مؤثرِ داده‌شده را دارد (effectivePrice در قیمتِ اسمی آفین است) */
export function nominalForEffective(effectiveUnit, terms, item, settings) {
  const t0 = { ...terms, price: 0.0 };
  const b = effectivePrice(t0, item, settings).effective_unit_price;
  const a = effectivePrice({ ...terms, price: 1.0 }, item, settings).effective_unit_price - b;
  return a ? (effectiveUnit - b) / a : NaN;
}

/** تنظیم‌های effectivePrice: پیش‌فرضِ پنل، با نرخِ ماهانهٔ کارشناس برای همین نوع قلم (Q14) */
export function settingsFor(profile, panel) {
  const s = { ...panel };
  if (profile.monthly_rate != null) s.panel_rate = profile.monthly_rate;
  return s;
}

/* ------------------------------------------------------------------ */
/* وابستگی (R08)                                                       */
/* ------------------------------------------------------------------ */
/** سقفِ سهم، کمینهٔ فعال و بیشینهٔ گرانیِ پذیرفتنی برای تنوع در یک نوع قلم */
export function dependenceParams(profile) {
  const labels = profile.labels || [];
  let active = labels.includes("L4") || (["MS-4", "MS-5"].includes(profile.ms) && (labels.includes("L12") || labels.includes("L2")))
    || profile.dependence === "زیاد";
  const structural = profile.supply_power === "زیاد" || profile.ms === "MS-4" || (profile.ms === "MS-5" && (profile.n_sup_recent || 0) <= 2);
  const kind = structural ? "structural" : "self_made";
  let pi = C.PI_BASE[kind];
  if (labels.includes("L12")) pi += C.PI_ADD.critical;
  if (labels.includes("L2") || profile.ms === "MS-4") pi += C.PI_ADD.scarce;
  if (profile.impact_high) pi += C.PI_ADD.high_impact;
  let source = "پیش‌فرض";
  if (profile.pi_override != null) {
    pi = Number(profile.pi_override); source = "کارشناس (Q11)";
    active = active || pi > 0;
  }
  return { active: !!active, kind, cap: C.DEP_CAP[kind], min_active: C.DEP_MIN_ACTIVE, window_months: C.DEP_WINDOW_MONTHS,
    max_premium: pyRound(Math.min(pi, C.PI_MAX), 3), premium_source: source, needs_commission: pi > C.PI_MAX };
}

/** قیمتِ جریمه‌دار، فقط برای رتبه‌بندی: رساندنِ یک تأمین‌کننده از سقف به ۱۰۰٪ سهم دقیقاً max_premium گران‌تر است */
export function dependenceAdjusted(ep, shareAfter, cap, maxPremium) {
  const excess = Math.max(0.0, shareAfter - cap) / Math.max(1e-9, 1 - cap);
  return ep * (1 + maxPremium * excess);
}

/** offers: [{supplier_id, effective_price}]؛ sharesAfter: سهمِ ۱۲ ماههٔ هر تأمین‌کننده اگر این سفارش به او برسد */
export function rankOffers(offers, sharesAfter, dep) {
  const out = offers.map((o) => {
    let adj = o.effective_price;
    if (dep.active) adj = dependenceAdjusted(o.effective_price, sharesAfter[o.supplier_id] ?? 0.0, dep.cap, dep.max_premium);
    return { ...o, adjusted_price: adj, dependence_penalty: adj - o.effective_price };
  });
  out.sort((a, b) => a.adjusted_price - b.adjusted_price);
  if (dep.active && out.length >= 2) {
    const cheapest = out.reduce((m, x) => (x.effective_price < m.effective_price ? x : m), out[0]);
    if (out[0].supplier_id !== cheapest.supplier_id) out[0].note = "به خاطر سقف سهم، تأمین‌کنندهٔ دیگر برگزیده شد؛ گرانی پرداخت‌شده برای تنوع در کمیسیون نمایش داده شود (R08)";
  }
  return out;
}

/** بیشترین مقداری که ارزان‌ترین تأمین‌کننده بی شکستنِ سقف می‌گیرد (بقیه به بعدی) */
export function splitAward(qty, cheapestShareNow, totalWindowQty, cap) {
  const allowed = cap * (totalWindowQty + qty) - cheapestShareNow * totalWindowQty;
  return Math.max(0.0, Math.min(qty, allowed));
}
