/**
 * پرسش‌نامهٔ کارشناس ← کلاس، برچسب‌ها و پارامترها (A7) — برگردانِ procstrat/questionnaire.py
 * پاسخ‌ها کدهای گزینهٔ 05_expert_feedback/questionnaire.json اند. مقدارهای داده «پیشنهاد»اند؛ پاسخ کارشناس با منبع
 * «کارشناس» جایشان را می‌گیرد و تاریخچه می‌ماند (R02، INV-04).
 */
import { pyRound } from "./pricing.js";
import { decideMode } from "./rfq.js";

export const DIMENSIONS = ["price", "payment", "delivery", "condition", "quality"];

/** درختِ تصمیم روی پاسخ‌ها (همان ترتیبِ تقدمِ قاعده‌های داده) */
export function impliedClass(a) {
  if (a.Q00 === "service") return "MS-6";
  const imported = ["agent", "importers", "both"].includes(a.Q04);
  if (a.Q02 === "locked" && imported) return "MS-5";
  const few = ["1", "2-3"].includes(a.Q01);
  if (few || a.Q05 === "often") return "MS-4";
  if (a.Q03 === "upstream") return "MS-3";
  if (["differs", "locked"].includes(a.Q02)) return "MS-2";
  if (["4-6", "7+"].includes(a.Q01) && ["same", "slightly"].includes(a.Q02)) return "MS-1";
  return null;
}

/** برچسب ← true/false/null (null یعنی پاسخ نیست؛ پیشنهادِ داده می‌ماند) */
export function impliedLabels(a) {
  const has = (k) => Object.prototype.hasOwnProperty.call(a, k);
  const m = {};
  m.L1 = !has("Q02") ? null : ["differs", "locked"].includes(a.Q02);
  m.L2 = !(has("Q01") || has("Q05")) ? null : (["1", "2-3"].includes(a.Q01) || a.Q05 === "often");
  m.L3 = !has("Q09") ? null : a.Q09 === "consult";
  m.L5 = !has("Q06") ? null : a.Q06 === "one_market";
  m.L6 = !has("Q10") ? null : ["inspect_then_pay", "approval_then_pay"].includes(a.Q10);
  m.L7 = !has("Q03") ? null : a.Q03 === "upstream";
  m.L8 = !has("Q07") ? null : ["yes", "unsure"].includes(a.Q07);
  m.L11 = !has("Q04") ? null : ["agent", "importers", "both"].includes(a.Q04);
  m.L12 = !has("Q08") ? null : ["machine_stops", "project_stops"].includes(a.Q08);
  if (has("Q11")) m.L4 = Number(a.Q11) > 0;
  return m;
}

/** وزن‌دهی نوسانی (بورچردینگ و همکاران ۱۹۹۱): مهم‌ترین بعد ۱۰۰، بقیه ۰ تا ۱۰۰ نسبت به آن؛ وزن = امتیازِ نرمال‌شده */
export function swingWeights(scores) {
  const tot = DIMENSIONS.reduce((s, d) => s + Math.max(0.0, Number(scores[d] || 0)), 0);
  if (tot <= 0) return {};
  const out = {};
  for (const d of DIMENSIONS) out[d] = pyRound(Math.max(0.0, Number(scores[d] || 0)) / tot, 3);
  return out;
}

/**
 * {updates, status, audit} بی آنکه پروفایل عوض شود. اطمینان زیاد ← جایگزین؛ متوسط ← جایگزین مگر کلاسِ داده پایدار و متفاوت
 * باشد (DISPUTED و کارشناس دوم)؛ کم ← فقط ثبت. دو کارشناس هم‌نظر ← CONFIRMED؛ ناهم‌نظر ← DELPHI_ROUND_2.
 */
export function applyAnswers(profile, answers, confidence, secondExpert = null) {
  const audit = [], upd = {};
  const cls = impliedClass(answers);
  const dataCls = profile.ms ?? null;
  if (confidence === "low") {
    return { updates: {}, status: "RECORDED", proposed_class: cls, audit: [`پاسخ کم‌اطمینان فقط ثبت شد (کلاس ضمنی: ${cls || "نامعلوم"})؛ چیزی عوض نشد`] };
  }
  if (secondExpert != null) {
    const cls2 = impliedClass(secondExpert);
    if (cls && cls2 && cls !== cls2) return { updates: {}, status: "DELPHI_ROUND_2", audit: [`دو کارشناس متفاوت گفتند (${cls} و ${cls2}); دور دوم با بازخورد بی‌نام (Delphi)`] };
  }
  if (cls && cls !== dataCls) {
    const stable = profile.class_confidence === "زیاد";
    if (confidence === "high" || (confidence === "medium" && !stable)) {
      upd.ms = cls;
      audit.push(`کلاس از ${dataCls} به ${cls} (پاسخ کارشناس، اطمینان ${confidence})`);
    } else {
      audit.push(`کارشناس ${cls} گفت ولی دادهٔ پایدار ${dataCls} است: اختلاف ثبت و از کارشناس دوم پرسیده شود`);
      return { updates: {}, status: "DISPUTED", audit };
    }
  }
  for (const [k, v] of Object.entries(impliedLabels(answers))) {
    if (v == null) continue;
    (upd.labels_set ||= {})[k] = v;
  }
  const has = (k) => Object.prototype.hasOwnProperty.call(answers, k);
  if (has("Q11")) upd.max_diversification_premium = Number(answers.Q11);
  if (has("Q14")) upd.monthly_rate = Number(answers.Q14);
  if (has("Q13")) upd.weights = swingWeights(answers.Q13);
  if (answers.Q10b === "hard") upd.hard_constraints_add = ["شرط تحویل و پرداخت"];
  if (has("Q12")) {
    upd.rfq_mode_preference = answers.Q12;
    if (answers.Q12 === "BROAD" && (upd.ms || dataCls) === "MS-4") audit.push("هشدار: استعلام گسترده برای قلم متمرکز؛ کارشناس دلیل بنویسد (R06)");
  }
  if (answers.Q15) upd.trusted_suppliers = answers.Q15;
  if (answers.Q16) upd.edges_proposed = answers.Q16;
  if (Object.keys(upd).length) upd.confidence = confidence;
  const status = secondExpert != null ? "CONFIRMED" : (Object.keys(upd).length ? "UPDATED" : "RECORDED");
  return { updates: upd, status, audit };
}

/* کدام پرسش اول (ارزشِ اطلاعات، شکلِ ساده) */
export const QUESTION_OPTIONS = {
  Q00: ["goods", "service"],
  Q01: ["1", "2-3", "4-6", "7+"],
  Q02: ["same", "slightly", "differs", "locked"],
  Q03: ["upstream", "seller", "negotiated"],
  Q04: ["domestic", "agent", "importers", "both"],
  Q05: ["never", "sometimes", "often"],
  Q06: ["dispersed", "several_markets", "one_market"],
  Q07: ["no", "unsure", "yes"],
  Q08: ["none", "small_delay", "machine_stops", "project_stops"],
  Q09: ["clear", "partly", "consult"],
  Q12: ["BROAD", "STANDARD", "LIMITED", "DIRECT"],
};

function simulate(profile, answers) {
  const p = { ...profile };
  const cls = impliedClass(answers);
  if (cls) p.ms = cls;
  const labels = new Set(p.labels || []);
  for (const [k, v] of Object.entries(impliedLabels(answers))) { if (v === true) labels.add(k); else if (v === false) labels.delete(k); }
  p.labels = [...labels].sort();
  if (Object.prototype.hasOwnProperty.call(answers, "Q12")) { p.expert_rfq = answers.Q12; p.expert_confidence = "high"; }
  return p;
}

/** برای هر پرسش، گزینه‌هایی که حالتِ استعلامِ این نوع قلم را عوض می‌کنند؛ پرسش‌های تصمیم‌ساز اول */
export function decisionRelevantQuestions(profile) {
  const [baseMode] = decideMode(profile);
  const order = Object.keys(QUESTION_OPTIONS);
  const out = order.map((q) => {
    const modes = {};
    for (const o of QUESTION_OPTIONS[q]) modes[o] = decideMode(simulate(profile, { [q]: o }))[0];
    return { q, changes_mode_for: Object.entries(modes).filter(([, m]) => m !== baseMode).map(([o]) => o), modes };
  });
  out.sort((a, b) => (b.changes_mode_for.length - a.changes_mode_for.length) || (order.indexOf(a.q) - order.indexOf(b.q)));
  return out;
}
