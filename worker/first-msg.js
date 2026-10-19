/**
 * «✉️ پیام اول» — فاز ۳ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (سند طراحی، بخش ۱؛ تصمیم‌های ۱ و ۶)
 *
 * نخستین پیامِ هر تأمین‌کننده در یک درخواست از قالب ساخته می‌شود — همان سازوکارِ جای‌خالیِ {} قالب‌های پیام (templates.js)،
 * با جای‌خالی‌های تازه. کارشناس برای کلِ درخواست یک قالب می‌گذارد (پیش‌فرضِ همه) و برای هر تأمین‌کننده می‌تواند قالبِ دیگری
 * بگذارد یا متن را دستی عوض کند. «🚀 شروع» همین را می‌فرستد و کارشناس هوشمند از آن به بعد ادامه می‌دهد (ai-agent.js:inviteOne).
 *
 * قالب‌های استاندارد (STD) پنج خانواده‌اند — از قاعده‌های نویسندهٔ متن استعلامِ بسته (04_prompts/P2_rfq_composer.md):
 *   گسترده (گسترده، استاندارد، قرارداد چارچوب) · محتاط (محدود و مرحله‌ای، مرحله‌ای با گسترش، مستقیم با آزمون بازار؛ مقدار با «بازهٔ متعارف»)
 *   · قیمت‌مرجع (قیمت تفکیکی و ساعت اعتبار) · اصلی و معادل (چندکاناله) · مشورت (مرحلهٔ اولِ «مشورت سپس رقابت»)
 * هر خانواده دو سه گونه با اطلاعاتِ یکسان و واژه‌بندیِ دیگر دارد؛ وقتی سیاستِ استعلام «متن متفاوت» می‌خواهد (text_variation)،
 * گیرندگان به نوبت گونه‌های دیگر را می‌گیرند تا هم‌بازارها متنِ یکسان نبینند (تصمیم ۱)؛ کارشناس می‌بیند و با دلیل خاموشش می‌کند
 * (fm_choice با k=«~var»). همهٔ قالب‌ها جملهٔ «پاسخ‌ها را دستیار هوشمند
 * خرید ما می‌دهد» را دارند (تصمیم ۶).
 *
 * سنجشِ افشا پیش از ذخیره و پیش از ارسال (fmCheck): نامِ دیگر گیرندگان، شمارِ پیشنهاددهندگان، واژه‌های درونی (حد، قیمت مرجع،
 * بودجه…) ← نمی‌رود؛ فوریت، و مقدارِ کامل در خانوادهٔ محتاط ← هشدار. مقدار ساختگی هرگز.
 *
 * fm_choice (assignment_id, k): k = «*» برای پیش‌فرضِ درخواست، «~var» برای خاموش کردنِ گونه‌ها (body = دلیل)، وگرنه کلیدِ نامِ
 * تأمین‌کننده (nkey) — tpl: «std:…» یا شناسهٔ قالبِ جدولِ templates؛ body: متنِ دستیِ همان تأمین‌کننده (بر قالب مقدم است)؛ why: علتِ
 * ردیفی که قالبش با ردیفِ بالایی فرق دارد (fmReasons).
 *
 * «📚 قالب‌های پیام» (درخواست مالک، مهر ۱۴۰۵): یک کتابخانه با جستجوی هوشمند و بات — قالب‌های کارشناس (templates.js) و همین
 * آماده‌ها، هر کدام با «فعال» (tplLib)؛ فقط فعال‌ها گزینهٔ پیش‌فرض و ردیف‌ها می‌شوند و دست‌کم یکی فعال می‌ماند. جای‌خالی‌ها و
 * پرکردن یکی است (frontend/tamin-poshtibani/msg-fill.mjs، همان که پنل برای پیش‌نمایش می‌خواند). قاعدهٔ علت: از ردیفِ اول به پایین،
 * ردیفی که قالبش با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض؛ برگشت به پیش‌فرض هم) علت می‌خواهد و بی آن «🚀 شروع» نمی‌رود.
 */
import { HttpError } from "./http.js";
import { listTemplates, tplPrefs } from "./templates.js";
import { VALIDATOR_RULES } from "./strategy/validator-rules.js";
import { norm as vnorm, toJsRegex } from "./strategy/validator.js";
import { TOKENS, fillMsg, qtyRange } from "../frontend/tamin-poshtibani/msg-fill.mjs";

export const FM_DDL = "CREATE TABLE IF NOT EXISTS fm_choice (assignment_id INTEGER NOT NULL, k TEXT NOT NULL, tpl TEXT, body TEXT, by TEXT, at INTEGER NOT NULL, PRIMARY KEY (assignment_id, k)) WITHOUT ROWID";
/** علتِ ردیفِ متفاوت (درخواست مالک، مهر ۱۴۰۵) */
export const FM_COLUMNS = [["fm_choice", "why", "TEXT"]];
/** جای‌خالی‌ها — همان سیزده‌تای جستجوی هوشمند و بات (msg-fill.mjs) */
export const FM_TOKENS = TOKENS;
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
    "سلام. واحد خرید {شرکت} برای این اقلام قیمت می‌گیره:\n{فهرست اقلام}\nموارد لازم در پیشنهاد: {موارد لازم}\nمشخصاتِ ثابت (🔒): {مشخصات ثابت}؛ مقدار پس از جمع‌بندی اعلام می‌شه.\nدستیار هوشمند خرید ما همین‌جا پاسخ می‌ده؛ تصمیم نهایی با کمیسیون شرکته و پیشنهادِ نهایی پیش‌فاکتور ثبت می‌شه.",
  ],
  index: [
    "سلام. واحد خرید {شرکت}: برای این اقلام قیمت می‌خوایم:\n{فهرست اقلام}\nلطفاً قیمت رو تفکیکی بنویسید (پایه، حاشیه، حمل، برش یا خدمات) و اگه قیمت کارخانه یا بورس مبناست، بفرمایید کدوم؛ ساعتِ اعتبارِ قیمت رو هم بنویسید.\n{موارد لازم}\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\n" + TAIL,
    "درود؛ تدارکات {شرکت} هستیم. قیمتِ این اقلام رو با تفکیکِ پایه، حاشیه، حمل و برش و با ساعتِ اعتبار می‌خوایم:\n{فهرست اقلام}\nمبنا (کارخانه یا بورس) و {موارد لازم} رو هم بنویسید؛ مشخصاتِ 🔒: {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
  oem: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} هستم.\nبرای این اقلام قیمت می‌خوایم:\n{فهرست اقلام}\nاگه هم اصلی دارید و هم معادل، قیمتِ هر کدوم رو جدا با برند، شمارهٔ فنی و کشورِ سازنده بنویسید.\nموارد 🔒 ثابت‌اند: {مشخصات ثابت}\nلطفاً بنویسید: {موارد لازم}\n" + TAIL,
    "درود؛ تدارکات {شرکت}. قیمتِ اصلی و معادلِ این اقلام رو جدا می‌خوایم (برند، شمارهٔ فنی، کشورِ سازنده):\n{فهرست اقلام}\n{موارد لازم} رو هم بنویسید؛ مشخصاتِ 🔒: {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
  consult: [
    "سلام، وقت بخیر. از واحد خرید {شرکت} هستم.\nاین پیام مرحلهٔ مشورته و استعلامِ قیمت جدا می‌آد. برای این اقلام می‌خوایم بدونیم چه مشخصاتی پیشنهاد می‌کنید:\n{فهرست اقلام}\nلطفاً برند، رده و مشخصاتِ دقیقِ کالا یا راه‌حلِ پیشنهادی رو بنویسید.\nآنچه 🔒 ثابته: {مشخصات ثابت}\nپاسخ‌ها رو دستیار هوشمند خرید ما می‌ده؛ تصمیم نهایی با کمیسیون شرکته.",
    "درود؛ تدارکات {شرکت}. پیش از استعلامِ قیمت، نظرِ شما رو دربارهٔ مشخصاتِ مناسبِ این اقلام می‌خوایم:\n{فهرست اقلام}\nبرند، رده و مشخصاتِ پیشنهادی رو بنویسید؛ استعلامِ قیمت جدا می‌آد؛ ثابت (🔒): {مشخصات ثابت}\nگفت‌وگو با دستیار هوشمند خرید ماست و تصمیم با کمیسیون شرکت.",
  ],
};
export const stdKey = (family, v) => `std:${family}:${v + 1}`;
export const stdList = () => Object.entries(STD).flatMap(([f, vs]) => vs.map((body, i) => ({ key: stdKey(f, i), title: `آماده — ${FAMILY_FA[f]} (گونهٔ ${faN(i + 1)})`, body, std: true, family: f, variant: i + 1 })));

/* ------------------------------------------------------------------ */
/* پر کردن                                                             */
/* ------------------------------------------------------------------ */
/* «بازهٔ متعارف» و پرکردن در msg-fill.mjs اند (یک منبع با پنل و جستجوی هوشمند)؛ نام‌های پیشین برای turn-engine.js و آزمون‌ها */
export { qtyRange };
/**
 * ctx: {company, supplier, expertName, family, items: [{title, qty, unit, spec, fixed: [«ک: م»…], open: [«ک: م»…], due}], must: [...], reply}
 * {فهرست اقلام} در خانوادهٔ محتاط با «بازهٔ متعارف» است، نه مقدارِ کامل («مقدار نهایی پس از جمع‌بندی»)
 */
export const fillFm = (body, ctx) => fillMsg(body, ctx);

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
 * deps: {lockedLayers, lineLocks, limitsOf, LIMIT_FA, fieldTxt, headPolicy, headOf} — تزریق از ai-agent.js تا این پرونده بی حلقه بماند.
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
      const txt = deps.fieldTxt ? deps.fieldTxt(f, v) : f === "dtime" ? [v.from, v.to].filter(Boolean).join(" تا ") : (v.opts || []).join(" یا ");
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
      /* گزینهٔ چیده‌شده («چینش گسترده / محتاط») همان سیاست را برمی‌گرداند؛ فهرست‌های پیش از آن فقط پرچمِ cautious دارند */
      const hp = await deps.headPolicy(env, head, { itemCode: it.code || null, cautious: !!(pk && pk.strategy && pk.strategy.cautious), variant: pk && pk.strategy ? pk.strategy.variant : undefined }).catch(() => null);
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
/* «📚 قالب‌های پیام»: کتابخانه و «فعال»                                  */
/* ------------------------------------------------------------------ */
/**
 * کتابخانهٔ قالب‌های یک کارشناس در زمینهٔ خانوادهٔ پیامِ یک درخواست (درخواست مالک، مهر ۱۴۰۵): آماده‌ها (STD، فقط‌خواندنی) و
 * قالب‌های جدولِ templates (خودِ کارشناس و مشترک)، هر کدام با active. پیش‌فرض: قالب‌های امروزِ کارشناس همه فعال (templates.active)،
 * مشترک‌ها فعال، آماده‌های همین خانواده فعال و بقیهٔ آماده‌ها خاموش — مگر کارشناس در tpl_prefs عوضش کرده باشد (def_on: پیش‌فرضِ
 * آمادهٔ همین خانواده). ترتیب: آماده‌های همین خانواده، آماده‌های دیگر، بعد قالب‌های جدول.
 */
export async function tplLib(env, expertId, family) {
  const [rows, prefs] = await Promise.all([listTemplates(env, expertId), tplPrefs(env, expertId)]);
  const std = stdList().map((t) => ({ ...t, def_on: t.family === family, active: prefs.has(t.key) ? prefs.get(t.key) : t.family === family }));
  return [...std.filter((t) => t.def_on), ...std.filter((t) => !t.def_on), ...rows.map((t) => {
    const key = String(t.id), shared = t.expert_id == null;
    return { key, id: t.id, title: t.title, body: t.body, std: false, own: !shared, shared, active: shared ? (prefs.has(key) ? prefs.get(key) : true) : t.active !== 0 };
  })];
}

/**
 * روشن و خاموش کردنِ قالب‌ها (on: {key: true|false}) در زمینهٔ خانوادهٔ همین درخواست — دست‌کم یک قالب فعال می‌ماند (۴۲۲). قالبِ
 * خودِ کارشناس در templates.active؛ مشترک و آماده در tpl_prefs، و آن‌که به پیش‌فرضش برگشت ترجیحش پاک می‌شود (آمادهٔ خانوادهٔ
 * دیگر در درخواستِ دیگر همان پیش‌فرضِ خودش را دارد). خروجی: کتابخانهٔ تازه.
 */
export async function tplSetActive(env, expert, on, family) {
  const lib = await tplLib(env, expert.id, family);
  const t = Date.now(), stmts = [];
  for (const [k, v] of Object.entries(on || {})) {
    const x = lib.find((y) => y.key === String(k));
    if (!x) throw new HttpError("این قالب پیدا نشد؛ صفحه را تازه کنید.", 422);
    const want = v === true || v === 1;
    if (x.active === want) continue;
    x.active = want;
    if (x.own) stmts.push(env.DB.prepare("UPDATE templates SET active=? WHERE id=? AND expert_id=?").bind(want ? 1 : 0, x.id, expert.id));
    else if (want === (x.std ? x.def_on : true)) stmts.push(env.DB.prepare("DELETE FROM tpl_prefs WHERE expert_id=? AND key=?").bind(expert.id, x.key));
    else stmts.push(env.DB.prepare("INSERT INTO tpl_prefs (expert_id,key,active,at) VALUES (?,?,?,?) ON CONFLICT(expert_id,key) DO UPDATE SET active=excluded.active, at=excluded.at")
      .bind(expert.id, x.key, want ? 1 : 0, t));
  }
  if (!lib.some((x) => x.active)) throw new HttpError("دست‌کم یک قالب باید فعال بماند؛ اول قالبِ دیگری را روشن کنید.", 422, { need_active: true });
  if (stmts.length) await env.DB.batch(stmts);
  return lib;
}

/**
 * سنجشِ افشای متنِ یک قالب پیش از ذخیره (پنل و بات): قالب برای همهٔ گیرندگان می‌رود، پس نامِ هیچ تأمین‌کننده‌ای از فهرست‌های دعوت
 * (برای نامِ گیرنده {تامین‌کننده})، شمارِ پیشنهادها، واژه‌های درونی و تعهد نه — همان fmCheck.
 */
export const tplCheck = (body, otherNames = []) => fmCheck(body, { otherNames });

/* ------------------------------------------------------------------ */
/* انتخاب‌ها                                                            */
/* ------------------------------------------------------------------ */
const VAR_K = "~var";
export async function fmChoices(env, aid) {
  const rows = (await env.DB.prepare("SELECT k, tpl, body, why, by, at FROM fm_choice WHERE assignment_id=?").bind(aid).all()).results || [];
  const per = {};
  let def = null, varOff = null;
  for (const r of rows) {
    if (r.k === "*") def = { tpl: r.tpl, by: r.by, at: r.at };
    else if (r.k === VAR_K) varOff = { reason: r.body || "", by: r.by, at: r.at };
    else per[r.k] = { tpl: r.tpl || null, body: r.body || null, why: r.why || null, by: r.by, at: r.at };
  }
  return { def, per, varOff };
}

/**
 * قالبِ مؤثرِ «پیش‌فرض برای همه»: انتخابِ کارشناس اگر قالبش هنوز هست (حتی اگر بعداً خاموش شده — انتخاب بی‌صدا عوض نمی‌شود و
 * کادر «غیرفعال» نشانش می‌دهد)؛ وگرنه آمادهٔ اولِ خانوادهٔ پیام اگر فعال است، وگرنه نخستین قالبِ فعال؛ هیچ نبود، همان آمادهٔ اول.
 */
export function fmDefKey(choices, lib, family) {
  const d = choices && choices.def && choices.def.tpl;
  if (d && lib.some((t) => t.key === d)) return d;
  const auto = stdKey(STD[family] ? family : "max", 0);
  if (lib.some((t) => t.key === auto && t.active)) return auto;
  const first = lib.find((t) => t.active);
  return first ? first.key : auto;
}
/** قالبِ خودِ ردیف اگر هنوز هست (null یعنی همان پیش‌فرض) */
const ownKey = (per, lib) => (per && per.tpl && lib.some((t) => t.key === per.tpl) ? per.tpl : null);

/**
 * قاعدهٔ علت (درخواست مالک، مهر ۱۴۰۵): گیرندگان به ترتیبِ «🎯 فهرست دعوت» (تیک‌خورده‌ها)؛ از ردیفِ اول به پایین هر ردیفی که
 * مقدارش (eff) با ردیفِ بالایی فرق دارد علت می‌خواهد — ردیفِ اول با پیش‌فرض، و برگشت به پیش‌فرض بعد از ردیفِ متفاوت هم. eff:
 * متنِ دستی همیشه مقدارِ جدایی است؛ وگرنه قالبِ مؤثر پیش از گونه — گونه‌های خودکارِ متن (ضدتبانی) همان قالب‌اند. ردیفِ سپرده‌شده
 * (go، پیامش رفته) در زنجیره می‌ماند ولی علت نمی‌خواهد. rows: [{k, eff, why, go}] — diff و need_why روی همان‌ها؛ خروجی: بی‌علت‌ها.
 */
export function fmReasons(rows, def) {
  let prev = def;
  for (const r of rows) { r.diff = r.eff !== prev; r.need_why = r.diff && !r.go; prev = r.eff; }
  return rows.filter((r) => r.need_why && !T(r.why));
}

/**
 * متنِ نخستین پیامِ یک تأمین‌کننده: متنِ دستیِ همان تأمین‌کننده ← قالبِ همان تأمین‌کننده ← قالبِ پیش‌فرضِ درخواست (fmDefKey).
 * idx: جایگاهِ تأمین‌کننده میانِ دعوت‌ها — ردیفی که پیش‌فرضِ آماده را می‌گیرد و سیاستِ استعلام «متن متفاوت» می‌خواهد، گونهٔ بعدیِ
 * همان خانواده را می‌گیرد (فقط گونه‌های فعال؛ پایه همیشه). lib: کتابخانهٔ همین درخواست (tplLib) — پیش‌نمایش و ارسال یکی.
 * خروجی {text, tpl (گونه‌ای که رفت)، base (قالبِ مؤثر پیش از گونه)، eff (مقدارِ قاعدهٔ علت)، block, warn, family}
 */
export async function fmTextFor(env, { aid, expert, supplier, k, ctx, choices, lib, otherNames = [], idx = 0, company }) {
  const c = choices || (await fmChoices(env, aid));
  const L = lib || (await tplLib(env, expert.id, ctx.family));
  const per = c.per[k] || null;
  const own = ownKey(per, L);
  const base = own || fmDefKey(c, L, ctx.family);
  let tpl = base, body = per && per.body ? per.body : null, fam = ctx.family;
  if (!body) {
    const t = L.find((x) => x.key === base) || L.find((x) => x.key === stdKey("max", 0));
    let b = { body: t.body, std: !!t.std, family: t.family, v: (t.variant || 1) - 1 };
    tpl = t.key;
    /* متنِ متفاوت: گونهٔ دیگرِ همان خانوادهٔ آماده برای گیرندهٔ بعدی */
    if (b.std && ctx.variation && !c.varOff && !own) {
      const vs = STD[b.family].map((_, v) => v).filter((v) => v === b.v || L.some((x) => x.key === stdKey(b.family, v) && x.active));
      const v = vs[(vs.indexOf(b.v) + idx) % vs.length];
      tpl = stdKey(b.family, v); b = { ...b, body: STD[b.family][v] };
    }
    if (b.std) fam = b.family === "cautious" || ctx.family === "cautious" ? "cautious" : b.family;
    body = fillFm(b.body, { company, supplier, expertName: expert.label || expert.name, family: fam, items: ctx.items, must: ctx.must });
  }
  const chk = fmCheck(body, { otherNames: otherNames.filter((n) => n && n !== supplier), family: ctx.family, items: ctx.items, allow: [supplier, company] });
  return { text: body, tpl: per && per.body ? "manual" : tpl, base, eff: per && per.body ? `✏️:${k}` : base, ...chk, family: fam };
}

/**
 * ذخیرهٔ انتخاب‌ها — {def: key|null, per: {k: {tpl, body} | null}, why: {k: متن}, variation: false + reason | true}. lib: کتابخانهٔ همین
 * درخواست — انتخابِ تازه فقط از قالب‌های فعال (۴۲۲). متنِ دستیِ ممنوع ← ۴۲۲. برگشتِ ردیف به پیش‌فرض علتش را نگه می‌دارد؛ ردیفی که
 * نه قالب دارد، نه متن و نه علت پاک می‌شود.
 */
export async function fmSave(env, { aid, expert, b: b0, check, lib }) {
  const t = Date.now(), by = expert.label || expert.name, stmts = [];
  const b = b0 && typeof b0 === "object" ? b0 : {};
  const L = lib || [];
  const usable = (key) => {
    const x = L.find((y) => y.key === key);
    if (!x) throw new HttpError("این قالب پیدا نشد.", 422);
    if (!x.active) throw new HttpError(`قالبِ «${x.title}» فعال نیست؛ اول در «📚 قالب‌های پیام» روشنش کنید.`, 422, { inactive: key });
  };
  /* خاموش کردنِ گونه‌های متن (تصمیم ۱): با دلیل؛ روشن کردن بی دلیل */
  if (b && b.variation === false) {
    const why = T(b.reason).slice(0, 300);
    if (why.length < 3) throw new HttpError("برای متنِ یکسانِ همه دلیل بنویسید.", 422, { need_reason: true });
    stmts.push(env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,by,at) VALUES (?,?,'off',?,?,?) ON CONFLICT(assignment_id,k) DO UPDATE SET body=excluded.body, by=excluded.by, at=excluded.at").bind(aid, VAR_K, why, by, t));
  } else if (b && b.variation === true) stmts.push(env.DB.prepare("DELETE FROM fm_choice WHERE assignment_id=? AND k=?").bind(aid, VAR_K));
  if (b.def !== undefined) {
    if (b.def) usable(b.def);
    stmts.push(b.def ? env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,by,at) VALUES (?, '*', ?, NULL, ?, ?) ON CONFLICT(assignment_id,k) DO UPDATE SET tpl=excluded.tpl, by=excluded.by, at=excluded.at").bind(aid, b.def, by, t)
      : env.DB.prepare("DELETE FROM fm_choice WHERE assignment_id=? AND k='*'").bind(aid));
  }
  for (const [k, v] of Object.entries((b && b.per) || {})) {
    if (!k || k === "*" || k === VAR_K) continue;
    if (!v || (!v.tpl && !T(v.body))) { stmts.push(env.DB.prepare("UPDATE fm_choice SET tpl=NULL, body=NULL, by=?, at=? WHERE assignment_id=? AND k=?").bind(by, t, aid, k)); continue; }
    if (v.tpl) usable(v.tpl);
    const body = T(v.body).slice(0, 3000) || null;
    if (body && check) {
      const c = check(k, body);
      if (c.block.length) throw new HttpError(`این متن نمی‌رود: ${c.block.join("، ")}.`, 422, { block: c.block, k });
    }
    stmts.push(env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,by,at) VALUES (?,?,?,?,?,?) ON CONFLICT(assignment_id,k) DO UPDATE SET tpl=excluded.tpl, body=excluded.body, by=excluded.by, at=excluded.at")
      .bind(aid, k, v.tpl || null, body, by, t));
  }
  /* علتِ ردیفِ متفاوت: جدا از قالب و متن، تا با برگشت به پیش‌فرض نرود */
  for (const [k, v] of Object.entries((b && b.why) || {})) {
    if (!k || k === "*" || k === VAR_K) continue;
    stmts.push(env.DB.prepare("INSERT INTO fm_choice (assignment_id,k,tpl,body,why,by,at) VALUES (?,?,NULL,NULL,?,?,?) ON CONFLICT(assignment_id,k) DO UPDATE SET why=excluded.why, by=excluded.by, at=excluded.at")
      .bind(aid, k, T(v).slice(0, 300) || null, by, t));
  }
  if (stmts.length) {
    stmts.push(env.DB.prepare("DELETE FROM fm_choice WHERE assignment_id=? AND k NOT IN ('*', ?) AND tpl IS NULL AND body IS NULL AND COALESCE(why,'')=''").bind(aid, VAR_K));
    await env.DB.batch(stmts);
  }
  return fmChoices(env, aid);
}

export { listTemplates };
