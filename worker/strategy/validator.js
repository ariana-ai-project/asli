/**
 * اعتبارسنجِ پیش از ارسال (G4) برای هر پیامِ بیرونیِ عامل — برگردانِ procstrat/validator.py
 *
 * validateTurn(turn, ctx) → {ok, violations}
 *   turn: خروجیِ مذاکره‌گر — message_fa، move، offer {unit_price} | null، facts_used
 *   ctx: reservation، allowed_offers (عددهای کد: nextOffer و بسته‌ها)، previous_offers، other_supplier_names، project_names،
 *        disclose_project، valid_fact_ids، offer_effective_unit، plan، round، rules (اختیاری)
 * الگوهای قاعده‌ها برای re پایتون نوشته شده‌اند؛ toJsRegex معنای یونیکدیِ \b و \d پایتون را نگه می‌دارد.
 */
import { VALIDATOR_RULES } from "./validator-rules.js";
import { concessionOk } from "./negotiation.js";

export const norm = (s) => String(s || "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ");

const W = "[\\p{L}\\p{N}_]";
const BOUNDARY = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
const cache = new Map();
/** الگوی re پایتون ← RegExp یونیکدی: \b مرزِ واژهٔ یونیکدی و \d هر رقمِ دهدهی (فارسی هم) */
export function toJsRegex(rx) {
  if (cache.has(rx)) return cache.get(rx);
  let out = "", i = 0;
  while (i < rx.length) {
    const ch = rx[i];
    if (ch === "\\" && i + 1 < rx.length) {
      const nx = rx[i + 1];
      if (nx === "b") out += BOUNDARY;
      else if (nx === "d") out += "\\p{Nd}";
      else out += ch + nx;
      i += 2;
    } else { out += ch; i += 1; }
  }
  const re = new RegExp(out, "u");
  cache.set(rx, re);
  return re;
}

export function validateTurn(turn, ctx) {
  ctx = ctx || {};
  const rules = ctx.rules || VALIDATOR_RULES;
  const msg = norm(turn.message_fa || "");
  const v = [];
  const fp = rules.forbidden_patterns;
  for (const cat of ["urgency", "commitment", "internal", "threat", "tax"]) {
    for (const p of fp[cat] || []) if (msg.includes(norm(p))) v.push(`${cat}: «${p}»`);
  }
  for (const rx of fp.internal_regex || []) if (toJsRegex(rx).test(msg)) v.push(`internal: الگوی ${rx}`);
  for (const rx of fp.count_disclosure_regex || []) if (toJsRegex(rx).test(msg)) v.push("confidential: شمار پیشنهاددهندگان یا پیشنهادهای دیگر");
  for (const name of ctx.other_supplier_names || []) {
    if (name && name.length >= 3 && msg.includes(norm(name))) v.push(`confidential: نام تأمین‌کنندهٔ دیگر «${name}»`);
  }
  if (!ctx.disclose_project) {
    for (const name of ctx.project_names || []) if (name && msg.includes(norm(name))) v.push(`confidential: نام پروژه «${name}»`);
  }
  const facts = new Set(turn.facts_used || []);
  const valid = new Set(ctx.valid_fact_ids || []);
  const subset = [...facts].every((f) => valid.has(f));
  if ((rules.claims_needing_fact || []).some((c) => msg.includes(norm(c)))) {
    if (!facts.size || !subset) v.push("claim: ادعای پیشنهاد یا پذیرش دیگران بی شناسهٔ معتبر در یادداشت مشترک");
  } else if (facts.size && !subset) v.push("claim: شناسهٔ واقعیت نامعتبر");
  /* عددها بر پایهٔ قیمت مؤثر واحدِ برنامه سنجیده می‌شوند؛ backend ctx.offer_effective_unit را می‌دهد، وگرنه همان عدد گفته‌شده */
  const offer = "offer_effective_unit" in ctx ? ctx.offer_effective_unit : (turn.offer || {}).unit_price;
  if (offer != null) {
    const res = ctx.reservation;
    if (res != null && offer > res * (1 + 1e-9)) v.push("number: پیشنهاد ما بالاتر از حد است");
    const allowed = ctx.allowed_offers || [];
    if (allowed.length && !allowed.some((a) => Math.abs(offer - a) <= 0.005 * a)) v.push("number: عدد پیشنهادی با next_offer یا بسته‌های کد نمی‌خواند");
    if (!concessionOk(ctx.previous_offers || [], offer, ctx.plan ?? null, ctx.round ?? null)) v.push("number: امتیاز پس گرفته شد یا از برنامهٔ زمانی امتیاز جلو افتاد");
  }
  if (turn.move === "M-CLOSE" && !msg.includes("کمیسیون")) v.push("commitment: جمع‌بندی بی جملهٔ «پس از تأیید کمیسیون»");
  return { ok: !v.length, violations: v };
}
