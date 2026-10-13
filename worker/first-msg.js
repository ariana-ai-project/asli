/**
 * «✉️ پیام اول» — فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (سند طراحی، بخش ۱؛ تصمیم‌های ۱ و ۶)
 *
 * نخستین پیامِ هر تأمین‌کننده در یک درخواست از قالب ساخته می‌شود — همان سازوکارِ جای‌خالیِ {} قالب‌های پیام (templates.js)،
 * با جای‌خالی‌های تازه. کارشناس برای کلِ درخواست یک قالب می‌گذارد (پیش‌فرضِ همه) و برای هر تأمین‌کننده می‌تواند قالبِ دیگری
 * بگذارد یا متن را دستی عوض کند. «🚀 شروع» همین را می‌فرستد و کارشناس هوشمند از آن به بعد ادامه می‌دهد (ai-agent.js:inviteOne).
 *
 * قالب‌های استاندارد (STD) پنج خانواده‌اند — از قاعده‌های نویسندهٔ متن استعلامِ بسته (04_prompts/P2_rfq_composer.md):
 *   گسترده (گسترده، استاندارد، قرارداد چارچوب) · محتاط (محدود و مرحله‌ای، مرحله‌ای با گسترش، مستقیم با آزمون بازار؛ بی مقدار)
 *   · قیمت‌مرجع (قیمت تفکیکی و ساعت اعتبار) · اصلی و معادل (چندکاناله) · مشورت (مرحلهٔ اولِ «مشورت سپس رقابت»)
 * هر خانواده دو سه گونه با اطلاعاتِ یکسان و واژه‌بندیِ دیگر دارد؛ وقتی سیاستِ استعلام «متن متفاوت» می‌خواهد (text_variation)،
 * گیرندگان به نوبت گونه‌های دیگر را می‌گیرند تا هم‌بازارها متنِ یکسان نبینند (تصمیم ۱). همهٔ قالب‌ها جملهٔ «پاسخ‌ها را دستیار هوشمند
 * خرید ما می‌دهد» را دارند (تصمیم ۶).
 *
 * سنجشِ افشا پیش از ذخیره و پیش از ارسال (fmCheck): نامِ دیگر گیرندگان، شمارِ پیشنهاددهندگان، واژه‌های درونی (حد، قیمت مرجع،
 * بودجه…) ← نمی‌رود؛ فوریت، و مقدارِ کامل در خانوادهٔ محتاط ← هشدار. مقدار ساختگی هرگز.
 *
 * fm_choice (assignment_id, k): k = «*» برای پیش‌فرضِ درخواست، وگرنه کلیدِ نامِ تأمین‌کننده (nkey) — tpl: «std:…» یا شناسهٔ قالبِ
 * جدولِ templates؛ body: متنِ دستیِ همان تأمین‌کننده (بر قالب مقدم است).
 */
import { HttpError } from "./http.js";
import { listTemplates } from "./templates.js";
import { VALIDATOR_RULES } from "./strategy/validator-rules.js";
import { norm as vnorm, toJsRegex } from "./strategy/validator.js";

export const FM_DDL = "CREATE TABLE IF NOT EXISTS fm_choice (assignment_id INTEGER NOT NULL, k TEXT NOT NULL, tpl TEXT, body TEXT, by TEXT, at INTEGER NOT NULL, PRIMARY KEY (assignment_id, k)) WITHOUT ROWID";
export const FM_TOKENS = ["شرکت", "فهرست اقلام", "مشخصات ثابت", "قابل تغییر", "موارد لازم", "تاریخ تحویل", "مهلت پاسخ"];
const T = (v) => String(v == null ? "" : v).trim();
const faN = (s) => String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]);

/* ------------------------------------------------------------------ */
/* خانواده‌ها و قالب‌های استاندارد                                       */
/* ------------------------------------------------------------------ */
export const FAMILY_OF_MODE = { BROAD: "max", STANDARD: "max", FRAMEWORK_CALLOFF: "max", LIMITED_STAGED: "cautious", STAGED_BROADENING: "cautious",
  DIRECT_PLUS_MARKET_TEST: "cautious", SIMULTANEOUS_INDEX: "index", MULTICHANNEL: "oem", CONSULT_THEN_COMPETE: "consult" };
export const FAMILY_FA = { max: "گسترده", cautious: "محتاط", index: "قیمت‌مرجع", oem: "اصلی و معادل", consult: "مشورت" };
/* اولویت وقتی اقلامِ یک پیام از خانواده‌های مختلف‌اند: محتاط‌ترین */
const FAMILY_RANK = { cautious: 0, consult: 1, index: 2, oem: 3, max: 4 };
const TAIL = "بعد از توافق، پیشنهاد نهایی‌تون پیش‌فاکتور ثبت می‌شه. پاسخ‌ها رو دستیار هوشمند خرید ما می‌ده؛ تصمیم نهایی با کمیسیون شرکته.";
export const STD = {
  max: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} پیام می‌دم.\nاستعلام قیمت برای:\n{فهرست اقلام}\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\nبقیه رو اگه پیشنهاد بهتری دارید همین‌جا تغییر بدید: {قابل تغییر}\nلطفاً تا {مهلت پاسخ} بنویسید: {موارد لازم}\n" + TAIL,
    "درود؛ واحد تدارکات {شرکت} هستیم و برای این اقلام قیمت می‌خوایم:\n{فهرست اقلام}\nلطفاً تا {مهلت پاسخ} همین‌جا بنویسید: {موارد لازم}\nمشخصات 🔒 تغییر نمی‌کنه ({مشخصات ثابت})؛ در {قابل تغییر} اگه پیشنهادی دارید بفرمایید.\nپیشنهادِ نهایی بعد از توافق پیش‌فاکتورِ شما ثبت می‌شه. گفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
  cautious: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} هستم.\nبرای این اقلام استعلام قیمت داریم:\n{فهرست اقلام}\nمقدار نهایی پس از جمع‌بندی اعلام می‌شه.\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\nلطفاً بنویسید: {موارد لازم}\n" + TAIL,
    "درود؛ از تدارکات {شرکت} پیام می‌دم. قیمتِ این اقلام رو می‌خواستیم:\n{فهرست اقلام}\nلطفاً {موارد لازم} رو بنویسید؛ مقدارِ نهایی بعد از جمع‌بندی گفته می‌شه.\nمشخصاتِ 🔒 ثابته: {مشخصات ثابت}\nپیشنهادِ نهایی بعد از توافق پیش‌فاکتورِ شما ثبت می‌شه. گفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
    "سلام. واحد خرید {شرکت} برای این اقلام قیمت می‌گیره:\n{فهرست اقلام}\nموارد لازم در پیشنهاد: {موارد لازم}\nمشخصاتِ ثابت (🔒): {مشخصات ثابت} — مقدار پس از جمع‌بندی اعلام می‌شه.\nدستیار هوشمند خرید ما همین‌جا پاسخ می‌ده؛ تصمیم نهایی با کمیسیون شرکته و پیشنهادِ نهایی پیش‌فاکتور ثبت می‌شه.",
  ],
  index: [
    "سلام. واحد خرید {شرکت}: برای این اقلام قیمت می‌خوایم:\n{فهرست اقلام}\nلطفاً قیمت رو تفکیکی بنویسید (پایه، حاشیه، حمل، برش یا خدمات) و اگه قیمت کارخانه یا بورس مبناست، بفرمایید کدوم؛ ساعتِ اعتبارِ قیمت رو هم بنویسید.\n{موارد لازم}\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\n" + TAIL,
    "درود؛ تدارکات {شرکت} هستیم. قیمتِ این اقلام رو با تفکیکِ پایه، حاشیه، حمل و برش و با ساعتِ اعتبار می‌خوایم:\n{فهرست اقلام}\nمبنا (کارخانه یا بورس) و {موارد لازم} رو هم بنویسید. مشخصاتِ 🔒: {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
  oem: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} هستم.\nبرای این اقلام قیمت می‌خوایم:\n{فهرست اقلام}\nاگه هم اصلی دارید و هم معادل، قیمتِ هر کدوم رو جدا با برند، شمارهٔ فنی و کشورِ سازنده بنویسید.\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\nلطفاً بنویسید: {موارد لازم}\n" + TAIL,
    "درود؛ تدارکات {شرکت}. قیمتِ اصلی و معادلِ این اقلام رو جدا می‌خوایم (برند، شمارهٔ فنی، کشورِ سازنده):\n{فهرست اقلام}\n{موارد لازم} رو هم بنویسید. مشخصاتِ 🔒: {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
  consult: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} هستم.\nاین پیام مرحلهٔ مشورته و استعلامِ قیمت جدا می‌آد. برای این اقلام می‌خوایم بدونیم چه مشخصاتی پیشنهاد می‌کنید:\n{فهرست اقلام}\nلطفاً برند، رده و مشخصاتِ دقیقِ کالا یا راه‌حلِ پیشنهادی رو بنویسید.\nآنچه 🔒 ثابته: {مشخصات ثابت}\nپاسخ‌ها رو دستیار هوشمند خرید ما می‌ده؛ تصمیم نهایی با کمیسیون شرکته.",
    "درود؛ تدارکات {شرکت}. پیش از استعلامِ قیمت، نظرِ شما رو دربارهٔ مشخصاتِ مناسبِ این اقلام می‌خوایم:\n{فهرست اقلام}\nبرند، رده و مشخصاتِ پیشنهادی رو بنویسید؛ استعلامِ قیمت جدا می‌آد. ثابت (🔒): {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
};
export const stdKey = (family, v) => `std:${family}:${v + 1}`;
export const stdList = () => Object.entries(STD).flatMap(([f, vs]) => vs.map((body, i) => ({ key: stdKey(f, i), title: `استاندارد — ${FAMILY_FA[f]} (گونهٔ ${faN(i + 1)})`, body, std: true, family: f, variant: i + 1 })));
const stdOf = (key) => { const m = /^std:(\w+):(\d+)$/.exec(T(key)); return m && STD[m[1]] && STD[m[1]][+m[2] - 1] ? { family: m[1], v: +m[2] - 1, body: STD[m[1]][+m[2] - 1] } : null; };

/* ------------------------------------------------------------------ */
/* پر کردن                                                             */
/* ------------------------------------------------------------------ */
/**
 * ctx: {company, supplier, expertName, family, items: [{title, qty, unit, spec, fixed: [«ک: م»…], open: [«ک: م»…], due}], must: [...], reply}
 * {فهرست اقلام} در خانوادهٔ محتاط بی مقدار است (افشا: «مقدار نهایی پس از جمع‌بندی»)
 */
export function fillFm(body, ctx) {
  const it0 = (ctx.items || [])[0] || {};
  const noQty = ctx.family === "cautious";
  const list = (ctx.items || []).map((i) => `• ${i.title}${noQty ? "" : ` — ${faN(i.qty == null ? "—" : i.qty)} ${i.unit || ""}`.trimEnd()}`).join("\n");
  const join = (k) => [...new Set((ctx.items || []).flatMap((i) => i[k] || []))].join("، ") || "—";
  const due = [...new Set((ctx.items || []).map((i) => i.due).filter(Boolean))].join("، ") || "—";
  return String(body || "")
    .replace(/\{شرکت\}/g, ctx.company || "")
    .replace(/\{فهرست اقلام\}/g, list)
    .replace(/\{مشخصات ثابت\}/g, join("fixed"))
    .replace(/\{قابل تغییر\}/g, join("open"))
    .replace(/\{موارد لازم\}/g, (ctx.must || []).join("، ") || "قیمت واحد، زمان تحویل و شرایط تسویه")
    .replace(/\{تاریخ تحویل\}/g, due)
    .replace(/\{مهلت پاسخ\}/g, ctx.reply || "پایان روز کاری بعد")
    /* جای‌خالی‌های قبلیِ قالب‌ها (templates.js:fillTemplate) — قلمِ اول */
    .replace(/\{تامین‌کننده\}/g, ctx.supplier || "")
    .replace(/\{عنوان قلم\}/g, it0.title || "")
    .replace(/\{مقدار\}/g, noQty ? "مقدار پس از جمع‌بندی" : it0.qty != null ? faN(it0.qty) : "")
    .replace(/\{واحد\}/g, noQty ? "" : it0.unit || "")
    .replace(/\{مشخصات فنی\}/g, it0.spec || "—")
    .replace(/\{نام کارشناس\}/g, ctx.expertName || "");
}

/** سنجشِ افشا: block (نمی‌رود) و warn (هشدار با دلیل) */
export function fmCheck(text, { otherNames = [], family, items = [], allow = [] } = {}) {
  const msg = vnorm(text || "");
  const fp = VALIDATOR_RULES.forbidden_patterns;
  const block = [], warn = [];
  /* نامِ خودِ گیرنده، نامِ شرکت و عنوانِ اقلام افشا نیست: پیش از جستجوی نامِ دیگران کنار می‌روند — مگر بخشی از نامِ دیگری باشند */
  const others = otherNames.filter((n) => n && n.length >= 3).map((n) => [n, vnorm(n)]);
  let rest = msg;
  for (const a of [...allow, ...items.map((i) => i && i.title)]) {
    const x = a ? vnorm(a) : "";
    if (x.length >= 2 && !others.some(([, o]) => o !== x && o.includes(x))) rest = rest.split(x).join(" ");
  }
  for (const [n, o] of others) if (rest.includes(o)) block.push(`نامِ تأمین‌کنندهٔ دیگر «${n}»`);
  for (const rx of fp.count_disclosure_regex || []) if (toJsRegex(rx).test(msg)) { block.push("شمارِ پیشنهاددهندگان یا پیشنهادهای دیگر"); break; }
  for (const p of fp.internal || []) if (msg.includes(vnorm(p))) block.push(`واژهٔ درونی «${p}»`);
  for (const rx of fp.internal_regex || []) if (toJsRegex(rx).test(msg)) block.push("کدِ درونیِ سامانه");
  for (const p of fp.commitment || []) if (msg.includes(vnorm(p))) block.push(`تعهد «${p}»`);
  for (const p of fp.urgency || []) if (msg.includes(vnorm(p))) warn.push(`فوریت «${p}»`);
  if (family === "cautious") {
    for (const i of items) if (i.qty != null && i.qty > 1 && (msg.includes(faN(i.qty)) || new RegExp(`(^|[^0-9])${i.qty}([^0-9]|$)`).test(msg))) { warn.push(`مقدارِ کامل «${faN(i.qty)}» در حالتِ محتاط (بسته: بازهٔ متعارف در موج اول)`); break; }
  }
  return { block: [...new Set(block)], warn: [...new Set(warn)] };
}

/* ------------------------------------------------------------------ */
/* زمینهٔ یک درخواست                                                    */
/* ------------------------------------------------------------------ */
/**
 * deps: {lockedLayers, lineLocks, limitsOf, LIMIT_FA, headPolicy, headOf} — تزریق از ai-agent.js تا این پرونده بی حلقه بماند.
 * items: ردیف‌های items (code, title, spec, qty, unit, need_date, norm_json, terms_json).
 */
export async function fmContext(env, deps, items) {
  const out = [], fams = [], must = new Set();
  let variation = false;
  for (const it of items) {
    const ll = await deps.lockedLayers(env, it).catch(() => ({ head: null, layers: [] }));
    const lk = deps.lineLocks(it, ll.layers);
    const fixed = [], open = [];
    for (const x of ll.layers) (lk.layers[x.k] !== false ? fixed : open).push(`${x.k}: ${x.v}`);
    const lim = deps.limitsOf(it) || {};
    for (const [f, v] of Object.entries(lim)) {
      const txt = f === "dtime" ? [v.from, v.to].filter(Boolean).join(" تا ") : (v.opts || []).join(" یا ");
      if (!txt) continue;
      (v.lock ? fixed : open).push(`${deps.LIMIT_FA[f] || f}: ${txt}`);
    }
    const due = lim.dtime && lim.dtime.to ? lim.dtime.to : T(it.need_date) || null;
    const head = ll.head || (await deps.headOf(env, it).catch(() => null));
    let family = "max";
    /* «🧭 استراتژی استعلام» روی همین قلم چیده شده؟ همان حالت (مثلاً «محتاط») خانوادهٔ پیام را تعیین می‌کند */
    let pk = null; try { pk = it.pick_json ? JSON.parse(it.pick_json) : null; } catch (_) { pk = null; }
    const stMode = pk && pk.strategy ? pk.strategy.competition_mode || pk.strategy.mode : null;
    if (head && deps.headPolicy) {
      const hp = await deps.headPolicy(env, head, { itemCode: it.code || null, cautious: !!(pk && pk.strategy && pk.strategy.cautious) }).catch(() => null);
      if (hp) {
        family = FAMILY_OF_MODE[stMode || hp.policy.mode] || "max";
        for (const q of hp.policy.quote_must_include || []) must.add(q);
        if (hp.policy.disclosure && hp.policy.disclosure.text_variation) variation = true;
        if ((hp.policy.spec_clarification || []).length) must.add("برند، رده و مشخصاتِ دقیقِ کالای پیشنهادی");
      }
    } else if (stMode) family = FAMILY_OF_MODE[stMode] || "max";
    if (family === "cautious") variation = true;
    fams.push(family);
    out.push({ id: it.id, title: it.title, qty: it.qty, unit: it.unit, spec: it.spec, fixed, open, due, head, family });
  }
  const family = fams.sort((a, b) => FAMILY_RANK[a] - FAMILY_RANK[b])[0] || "max";
  return { items: out, family, must: [...must].slice(0, 9), variation };
}

/* ------------------------------------------------------------------ */
/* انتخاب‌ها                                                            */
/* ------------------------------------------------------------------ */
export async function fmChoices(env, aid) {
  const rows = (await env.DB.prepare("SELECT k, tpl, body, by, at FROM fm_choice WHERE assignment_id=?").bind(aid).all()).results || [];
  const per = {};
  let def = null;
  for (const r of rows) { if (r.k === "*") def = { tpl: r.tpl, by: r.by, at: r.at }; else per[r.k] = { tpl: r.tpl || null, body: r.body || null, by: r.by, at: r.at }; }
  return { def, per };
}
/** متنِ قالب (استاندارد یا جدولِ templates) — null اگر پیدا نشد یا مالِ این کارشناس نیست */
export async function fmBody(env, expertId, key) {
  const s = stdOf(key);
  if (s) return { body: s.body, std: true, family: s.family, v: s.v };
  const id = parseInt(key, 10);
  if (!Number.isFinite(id)) return null;
  const r = await env.DB.prepare("SELECT body FROM templates WHERE id=? AND (expert_id IS NULL OR expert_id=?)").bind(id, expertId).first();
  return r ? { body: r.body, std: false } : null;
}

/**
 * متنِ نخستین پیامِ یک تأمین‌کننده: متنِ دستیِ همان تأمین‌کننده ← قالبِ همان تأمین‌کننده ← قالبِ پیش‌فرضِ درخواست ← استانداردِ
 * خانوادهٔ اقلام. idx: جایگاهِ تأمین‌کننده میانِ دعوت‌ها (برای گونهٔ متن وقتی متنِ متفاوت لازم است).
 * خروجی {text, tpl, block, warn, family}
 */
export async function fmTextFor(env, { aid, expert, supplier, k, items, ctx, choices, otherNames = [], idx = 0, company }) {
  const c = choices || (await fmChoices(env, aid));
  const per = c.per[k] || null;
  let tpl = (per && per.tpl) || (c.def && c.def.tpl) || null;
  let body = per && per.body ? per.body : null;
  let fam = ctx.family;
  if (!body) {
    let b = tpl ? await fmBody(env, expert.id, tpl) : null;
    if (!b) { tpl = stdKey(ctx.family, 0); b = await fmBody(env, expert.id, tpl); }
    /* متنِ متفاوت: گونهٔ دیگرِ همان خانوادهٔ استاندارد برای گیرندهٔ بعدی */
    if (b.std && ctx.variation && !(per && per.tpl)) { const vs = STD[b.family]; const v = (b.v + idx) % vs.length; tpl = stdKey(b.family, v); b = { ...b, body: vs[v] }; }
    if (b.std) fam = b.family === "cautious" || ctx.family === "cautious" ? "cautious" : b.family;
    body = fillFm(b.body, { company, supplier, expertName: expert.label || expert.name, family: fam, items: ctx.items, must: ctx.must });
  }
  const chk = fmCheck(body, { otherNames: otherNames.filter((n) => n && n !== supplier), family: ctx.family, items: ctx.items, allow: [supplier, company] });
  return { text: body, tpl: per && per.body ? "manual" : tpl, ...chk, family: fam };
}

/** ذخیرهٔ انتخاب‌ها — {def: tplKey|null, per: {k: {tpl, body} | null}}؛ متنِ دستیِ ممنوع ← ۴۲۲ */
export async function fmSave(env, { aid, expert, b, check }) {
  const t = Date.now(), by = expert.label || expert.name, stmts = [];
  if (b.def !== undefined) {
    if (b.def && !(await fmBody(env, expert.id, b.def))) throw new HttpError("این قالب پیدا نشد.", 422);
    stmts.push(b.def ? env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,by,at) VALUES (?, '*', ?, NULL, ?, ?) ON CONFLICT(assignment_id,k) DO UPDATE SET tpl=excluded.tpl, by=excluded.by, at=excluded.at").bind(aid, b.def, by, t)
      : env.DB.prepare("DELETE FROM fm_choice WHERE assignment_id=? AND k='*'").bind(aid));
  }
  for (const [k, v] of Object.entries((b && b.per) || {})) {
    if (!k || k === "*") continue;
    if (!v || (!v.tpl && !T(v.body))) { stmts.push(env.DB.prepare("DELETE FROM fm_choice WHERE assignment_id=? AND k=?").bind(aid, k)); continue; }
    if (v.tpl && !(await fmBody(env, expert.id, v.tpl))) throw new HttpError("این قالب پیدا نشد.", 422);
    const body = T(v.body).slice(0, 3000) || null;
    if (body && check) {
      const c = check(k, body);
      if (c.block.length) throw new HttpError(`این متن نمی‌رود: ${c.block.join("، ")}.`, 422, { block: c.block, k });
    }
    stmts.push(env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,by,at) VALUES (?,?,?,?,?,?) ON CONFLICT(assignment_id,k) DO UPDATE SET tpl=excluded.tpl, body=excluded.body, by=excluded.by, at=excluded.at")
      .bind(aid, k, v.tpl || null, body, by, t));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return fmChoices(env, aid);
}

export { listTemplates };
