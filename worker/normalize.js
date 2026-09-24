/**
 * نرمال‌سازی اقلام — تفکیک عنوان قلمِ درخواست به «نوع قلم» و «لایه‌های ویژگی»
 * با همان ساختاری که فهرست استاندارد اقلام (فایل ۱) دارد.
 *
 * سه راه، به ترتیب ارزانی:
 *   ۱. کد راهکاران قلم در فهرست هست (شهریور ۱۴۰۵: ۸۱٪ اقلام درخواست‌ها) → ساختار
 *      مستقیم از فهرست؛ رایگان و قطعی، بی‌مدل.
 *   ۲. همین عنوان قبلاً با مدل تفکیک شده (norm_cache) → همان نتیجه، بی‌هزینهٔ دوباره.
 *   ۳. وگرنه واژه‌های عنوان با فهرست تطبیق داده می‌شوند (cat_words)، چند نوع قلمِ
 *      محتمل با نزدیک‌ترین اقلامشان (حداکثر ۲۵ ردیف)، عرف‌های همان نوع‌ها و نام لایه‌های
 *      استاندارد به Haiku می‌رود تا عنوان را با همان ساختار تفکیک کند. پرامپت عمداً کوچک
 *      است: حداقل طول قابل‌کش در Haiku 4.5 چهار هزار توکن است و این پرامپت به آن نمی‌رسد،
 *      پس ارزان‌ترین راه، کوتاه نگه داشتنِ خود پرامپت است (≈۰٫۶ سنت در هر فراخوانی؛ آزمون مهر ۱۴۰۵).
 *
 * خروجیِ هر سه راه از یک صافی می‌گذرد (settle) — همان قواعدی که فهرست اقلام با آن ساخته
 * شده (frontend/tamin-poshtibani/catalog-rules.mjs و catalog-head-rules.mjs):
 *   • لایهٔ کمّی عدد است و واحدش جدا، با نام استاندارد («۲ میل» ← ۲ + میلی‌متر)؛ عددِ
 *     بی‌واحد واحدِ عرفِ همان لایه در همان نوع قلم را می‌گیرد، با علامت «ضمنی».
 *   • جنسِ گفته‌نشده فقط با عرفِ پذیرفته‌شدهٔ نوع قلم پر می‌شود («ورق ۲ میل» ← ورق آهنی)؛
 *     حدسِ مدل جای قاعده را نمی‌گیرد.
 *   • نوع قلمی که جنس بازارش را جدا می‌کند با جنس نام می‌گیرد («ورق آهنی»).
 * پس مقایسهٔ «عین قلم» میان درخواست و فهرست بر یک زبان است.
 *
 * خروجی راه ۲ و ۳ «پیشنهاد» است و تا کارشناس تأییدش نکند، سوابق بر آن جستجو نمی‌شود.
 */
import { HttpError } from "./http.js";
import { MODEL } from "./extract.js";
import { runCost } from "./discovery.js";
import { nameOf, keyOf, words, catalogMeta, headOfCode, headData, itemOf, wordHeads, rateFor } from "./catalog.js";
import * as RULES from "../frontend/tamin-poshtibani/catalog-rules.mjs";
import { HEAD_RULES } from "../frontend/tamin-poshtibani/catalog-head-rules.mjs";

const API = (env) => (env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
export const NORM_PROMPT_VERSION = "item-norm/2.0";
/* نسخهٔ ساختارِ ذخیره‌شده (norm_json و norm_cache): ۲ = لایهٔ کمّی عدد + واحد، جنسِ ضمنی، نوع قلمِ مؤثر */
const NORM_V = 2;
const T = (v) => String(v == null ? "" : v).trim();
const now = () => Date.now();

/* چند نوع قلم و چند نمونه به مدل برسد. بیشتر فقط هزینه است: نمونه‌ها برای یاد دادنِ
   «این نوع قلم معمولاً چه لایه‌هایی دارد» است و ده‌ها نمونه چیزی اضافه نمی‌کند. */
const TOP_HEADS = 4, MAX_SAMPLES = 25, NAME_HEADS = 8;
/* هزینهٔ تقریبیِ یک تفکیک با مدل، تا وقتی سابقهٔ کافی در norm_cache نیست — میانگینِ
   آزمون مهر ۱۴۰۵ با همین پرامپت روی ۸۰ قلمِ واقعی (Haiku 4.5): ۰٫۰۰۶۳ دلار */
export const NORM_COST_EST = 0.006;

/* ------------------------------------------------------------------ */
/* یافتن نوع‌های محتمل و اقلام مشابه                                    */
/* ------------------------------------------------------------------ */

/**
 * امتیاز هر نوع قلم برای یک عنوان: جمعِ کمیابیِ واژه‌های مشترک (idf) — واژه‌ای که فقط
 * در یک نوع قلم هست نشانهٔ قوی است، واژه‌ای که در صد نوع هست تقریباً هیچ. اگر نام
 * خودِ نوع قلم کامل در عنوان باشد، نشانهٔ قوی‌تری است.
 */
export function scoreHeads(title, wh, totalHeads) {
  const ws = [...new Set(words(title))], t = keyOf(title);
  const score = new Map();
  for (const w of ws) {
    const hs = wh[w]; if (!hs || !hs.length) continue;
    const idf = Math.log(1 + Math.max(1, totalHeads) / hs.length);
    for (const h of hs) score.set(h, (score.get(h) || 0) + idf);
  }
  /* نوع قلمِ جنس‌دار («شیلنگ لاستیکی») با نامِ پایه‌اش در عنوان می‌آید («شیلنگ بیل …»): جنسش یا گفته
     می‌شود یا ضمنی است، پس نشانهٔ نام کامل همان نامِ پایه است */
  for (const [h, s] of score) {
    const k = keyOf(RULES.splitHead(h, HEAD_RULES).base);
    if (k.length > 1 && t.includes(k)) score.set(h, s + 3);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([head, s]) => ({ head, score: Math.round(s * 100) / 100 }));
}

/** نزدیک‌ترین اقلام فهرست به عنوان (هم‌پوشانی واژه‌ها)، از میان نوع‌های محتمل */
export function nearestItems(title, heads, max = MAX_SAMPLES) {
  const ws = new Set(words(title));
  const all = [];
  heads.forEach((hd, rank) => {
    for (const it of hd.items) {
      const iw = new Set(words(it[1]));
      let common = 0; for (const w of iw) if (ws.has(w)) common++;
      const jac = common / Math.max(1, new Set([...ws, ...iw]).size);
      all.push({ hd, it, s: jac - rank * 0.02 });
    }
  });
  all.sort((a, b) => b.s - a.s);
  /* هر نوع قلم دست‌کم چند نمونه بیاورد، وگرنه نوعِ اول همه را می‌بلعد و مدل لایه‌های
     نوعِ درست را (اگر دومی بود) هرگز نمی‌بیند */
  const out = [], per = new Map();
  const floor = Math.max(2, Math.floor(max / Math.max(1, heads.length) / 2));
  for (const x of all) { const n = per.get(x.hd.head) || 0; if (n < floor) { out.push(x); per.set(x.hd.head, n + 1); } }
  for (const x of all) { if (out.length >= max) break; if (!out.includes(x)) out.push(x); }
  return out.slice(0, max).map((x) => ({ head: x.hd.head, code: x.it[0], title: x.it[1], layers: x.it[4] || {} }));
}

/**
 * عرف‌های پذیرفته‌شدهٔ نوع‌های محتمل، برای پرامپت: جنس جزء نام است یا نه، جنسِ گفته‌نشده
 * چیست، و واحدِ رایجِ هر لایهٔ کمّی (با بازهٔ مقدارهای دیده‌شده). فقط همین‌ها — عرفی که این‌جا
 * نیامده، به مدل گفته می‌شود حدس نزند.
 */
export function conventionLines(heads) {
  const lines = [], seen = new Set();
  const range = (c) => (c.lo === c.hi ? `${c.lo}` : `${c.lo} تا ${c.hi}`);
  for (const hd of heads) {
    const { base, rule } = RULES.splitHead(hd.head, HEAD_RULES);
    if (rule && !seen.has(base)) {
      seen.add(base);
      /* نشانه‌های پشت‌سرِ هم با یک نتیجه یک‌جا («کونیک»، «پرچی»، … ← نامعلوم) — پرامپتِ کوتاه‌تر */
      const groups = [];
      for (const [cue, v, m] of rule.c || []) {
        const to = m || "نامعلوم", g = groups[groups.length - 1];
        if (cue === "w" && g && g.cue === "w" && g.to === to) g.vs.push(v); else groups.push({ cue, vs: [v], to });
      }
      const when = groups.map((g) => (g.cue === "u" ? `اندازه به ${g.vs[0]} ← ${g.to}` : `${g.vs.map((v) => `«${v}»`).join("، ")} در عنوان ← ${g.to}`));
      const dflt = rule.d ? `جنسِ گفته‌نشده: ${rule.d}`
        : when.length || rule.f ? `جنسِ گفته‌نشده: ${[...when, rule.f ? `وگرنه ${rule.f}` : "وگرنه نامعلوم — حدس نزن"].join("؛ ")}`
          : "جنسِ گفته‌نشده نامعلوم است — حدس نزن";
      lines.push(`- «${base}»: ${rule.r === "f" ? `جنس جزء نام نوع قلم است («${base} + جنس»)` : "جنس لایهٔ ویژگی است، نه جزء نام"}؛ ${dflt}.`);
    }
    const uc = Object.entries(hd.uc || {}).filter(([, cs]) => cs && cs.length).slice(0, 4);
    if (uc.length) lines.push(`- واحدِ رایج در «${hd.head}»: ${uc.map(([k, cs]) => `${k}: ${cs.slice(0, 2).map((c) => `${c.u} (${range(c)})`).join(" یا ")}`).join("؛ ")}.`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* مدل                                                                  */
/* ------------------------------------------------------------------ */
/* پرامپت فارسی گران است (هر نویسه نزدیک یک توکن): دو قاعدهٔ عام این‌جا کوتاه آمده‌اند و
   نام‌گذاریِ استانداردِ واحد را کد انجام می‌دهد (settle ← catalog-rules.mjs:canonUnit)، نه فهرستِ
   بلندِ واحدها در شِمای ابزار — همان فهرست ۱٬۷۰۰ توکن به هر فراخوانی می‌افزود. */
export const systemPrompt = (layers) => `تو عنوان یک قلمِ درخواست خرید را به «نوع قلم» و «لایه‌های ویژگی» تفکیک می‌کنی، با همان ساختار فهرست استاندارد اقلام این شرکت.
نوع قلم: فقط هستهٔ معنایی قلم، نه کل عنوان («پیچ»، «فیلتر روغن»)؛ اگر یکی از نوع‌های پیشنهادی درست است عین همان را بنویس، وگرنه نوع تازهٔ کوتاه.
لایه‌ها: فقط از فهرست زیر و فقط آنچه در عنوان هست (جز ویژگیِ ضمنی، قاعدهٔ ۲)؛ مقدار عیناً همان بخشِ عنوان است و چیزی از خودت نیفزا. باقیمانده: بخشی از عنوان که به هیچ لایه‌ای نخورد. از نمونه‌ها یاد بگیر هر نوع قلم چه لایه‌هایی دارد.

قاعدهٔ ۱ — عدد و واحد جدا: در لایهٔ کمّی (قطر، طول، عرض، ضخامت، ابعاد، وزن، حجم، توان، ولتاژ، جریان، فشار…) value فقط عدد است و unit واحدش؛ «ورق 2 میل» ← ضخامت: value=2، unit=میلی‌متر («میل»، «mm» و «میلیمتر» همه میلی‌متر، «"» و «اینچی» اینچ). کسرِ اینچی همان‌طور («1 1/2»)؛ در واحد متریک «/» ممیز است («1/5 متر» = 1.5). ابعاد با ×، بازه با -. واحدِ نگفته را خالی بگذار؛ سامانه واحدِ رایجِ همان نوع قلم را «ضمنی» می‌گذارد. نمره، مدل، شماره فنی و رزوه (M8) unit ندارند.

قاعدهٔ ۲ — ویژگیِ ضمنی: در زبان خرید مقدارِ رایجِ یک ویژگی گفته نمی‌شود و فقط استثنا نام برده می‌شود؛ پس ویژگیِ نگفته یعنی «همان رایج»، نه «هر چیزی». مثال: «ورق 2 میل» یعنی ورق آهنی — ورقِ گالوانیزه، استیل یا آلومینیومی همیشه نام برده می‌شوند — و «ورق آهنی» و «ورق گالوانیزه» دو نوع قلم‌اند. عرف را فقط وقتی به کار ببر که در «عرف‌های پذیرفته‌شده» پایینِ پیام آمده؛ وگرنه حدس نزن. ویژگیِ ضمنی implicit=true.
نامِ ماده‌ای که کاربرد یا مادهٔ هدف است جنس نیست: «چسب آهن» چسبِ مخصوصِ آهن است و «بوش پمپ بتن» بوشِ پمپِ بتن.

لایه‌های استاندارد (${layers.length}): ${layers.map((l) => l.en ? `${l.fa} (${l.en})` : l.fa).join("، ")}`;

export function userPrompt(it, cands, samples, conv) {
  const ex = samples.map((s) => `- ${s.title} → ${s.head}${Object.keys(s.layers).length ? " | " + Object.entries(s.layers).map(([k, v]) => `${k}=${RULES.showLayer(v)}`).join("؛ ") : ""}`).join("\n");
  return `عنوان قلم: «${T(it.title)}»`
    + (T(it.spec) ? `\nمشخصهٔ فنی: ${T(it.spec)}` : "")
    + (T(it.unit) ? `\nواحد درخواست: ${T(it.unit)}` : "")
    + `\n\nنوع‌های محتمل (به ترتیب شباهت): ${cands.length ? cands.join("، ") : "— (هیچ واژهٔ مشترکی با فهرست نبود)"}`
    + (conv && conv.length ? `\n\nعرف‌های پذیرفته‌شده:\n${conv.join("\n")}` : "")
    + (ex ? `\n\nنمونه‌های نزدیک از فهرست (عنوان → نوع قلم | لایه‌ها):\n${ex}` : "");
}

/* strict: نام لایه را خودِ API از فهرست اجبار می‌کند. واحد متنِ آزاد است — هر املایی که مدل
   بنویسد («میل»، «mm»، «"») در settle به نام استاندارد می‌رسد؛ توضیحِ فیلدها همان پرامپت است. */
export const toolSchema = (layers) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    head: { type: "string", description: "نوع قلم — هستهٔ معنایی، نه کل عنوان" },
    layers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", enum: layers.map((l) => l.fa) },
          value: { type: "string" },
          unit: { type: "string" },
          implicit: { type: "boolean" },
        },
        required: ["name", "value", "unit", "implicit"],
      },
    },
    residual: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["head", "layers", "residual", "confidence"],
});

/**
 * خروجی مدل یا فرم کارشناس → ساختار استاندارد (بالا را ببینید). `raw.layers` یا آرایهٔ مدل
 * است ([{name, value, unit, implicit}]) یا نقشهٔ فرم ({لایه: متن | {v, u, i} | [...]}).
 * `text`: عنوان (و مشخصهٔ فنی) — برای خواندن جنسِ گفته‌شده و نشانه‌های عرف. `strict`: ورودیِ
 * کارشناس است؛ عددِ نامعتبر خطا می‌دهد به‌جای این‌که متن بماند.
 * خروجی: {head, layers, residual, confidence, hd}.
 */
export async function settle(env, meta, raw, text, { strict = false } = {}) {
  const known = new Set(meta.layers.map((l) => l.fa));
  const entries = Array.isArray(raw && raw.layers)
    ? raw.layers.map((x) => [nameOf(x && x.name), { text: T(x && x.value), unit: T(x && x.unit), imp: !!(x && x.implicit) }])
    : Object.entries((raw && raw.layers) || {}).map(([k, v]) => [nameOf(k), Array.isArray(v) || (v && typeof v === "object")
      ? (Array.isArray(v) ? { text: RULES.layerText(v), unit: "", imp: false } : { text: T(v.v), unit: T(v.u), imp: !!v.i })
      : { text: T(v), unit: "", imp: false }]);
  const attrs = {}, quant = [], extra = [];
  let said = null;   /* جنسی که مدل یا کارشناس گفته: {v, imp} */
  /* واحدی که مدل می‌دهد فقط وقتی پذیرفته است که در خودِ عنوان (یا مشخصهٔ فنی) آمده باشد — همان
     قاعدهٔ جنس: گفته‌شده، یا عرفِ پذیرفته‌شده؛ نه حدسِ مدل («انکر بولت M24*810» واحدِ طول را
     نگفته، پس ۸۱۰ «میلی‌متر» نمی‌شود مگر عرفِ همان نوع قلم بگوید). ورودیِ کارشناس (strict) صریح است. */
  const stated = RULES.unitsInTitle(text);
  const said1 = (u) => strict || !u || stated.has(u);
  const canonU = (u) => (u ? RULES.canonUnit(u) || (RULES.UNITS[u] ? u : "") : "");
  for (const [k, x] of entries) {
    if (!known.has(k) || k in attrs || !x.text) continue;
    if (strict && x.unit && !canonU(x.unit)) throw new HttpError(`«${x.unit}» واحد شناخته‌شده‌ای نیست.`);
    if (RULES.QUANT[k]) {
      /* عدد همان‌طور که نوشته شده نگه داشته می‌شود و بعد از دانستنِ نوع قلم یک بار خوانده می‌شود،
         چون «1/2» بی‌واحد را عرفِ همان نوع قلم معنا می‌کند (نیم اینچ، یا ۱٫۲) */
      const parts = x.text.split(/\s+\/\s+/).map((p) => {
        const s = RULES.splitUnit(p), u = s.unit || canonU(x.unit);
        return { num: s.num, unit: u && said1(u) ? u : "" };
      });
      attrs[k] = x.text; quant.push([k, parts, x]);
      continue;
    }
    if (k === "جنس") {
      const m = RULES.canonMaterial(x.text);
      /* از مدل فقط جنسِ شناخته‌شده؛ «ورق» در «دستگاه نورد ورق» جنس نیست و به باقیمانده می‌رود */
      if (m || strict) said = { v: m || nameOf(x.text), imp: x.imp }; else extra.push(x.text);
      continue;
    }
    attrs[k] = x.unit && said1(canonU(x.unit)) ? `${x.text} ${x.unit}` : x.text;
  }

  /* جنس: پوششِ گالوانیزه، یا گفته‌شده (مدل، فرم، یا خودِ عنوان)، یا عرفِ پذیرفته‌شده. نشانه‌های
     واحدِ عرف («فلنج ۴ اینچ») فقط از واحدهای گفته‌شده در عنوان می‌آیند.
     فهرستی که پیش از این قواعد ساخته شده (meta.rules ندارد) نه «ورق آهنی» دارد نه جنسِ ضمنی؛
     تا ورودِ دوباره‌اش، درخواست هم به همان زبان می‌ماند — وگرنه «ورق آهنی» در فهرستِ کهنه پیدا
     نمی‌شد و سوابقِ «ورق» از دست می‌رفت. */
  const head0 = nameOf(raw && raw.head);
  if (!head0) throw new HttpError(strict ? "نوع قلم لازم است." : "مدل نوع قلم را برنگرداند.", strict ? 400 : 502);
  const sh0 = RULES.splitHead(head0, HEAD_RULES);
  const sh = meta.rules ? sh0 : { base: sh0.base, mat: null, rule: null };
  const head = meta.rules ? head0 : sh0.base;
  const folded = RULES.foldCoating({ ...attrs, ...(said && !said.imp ? { "جنس": said.v } : {}) });
  for (const k of Object.keys(attrs)) if (!(k in folded)) delete attrs[k];   /* پوششِ تاشده */
  let mat = folded["جنس"] || null, how = mat ? "said" : null;
  if (!mat && sh.rule) {
    const t = RULES.materialInTitle(text, sh.base, null);
    if (t) { mat = t; how = "title"; }
  }
  if (!mat && sh.rule) {
    const units = new Set([...stated, ...quant.flatMap(([, ps]) => ps.map((p) => p.unit)).filter(Boolean)]);
    const im = RULES.impliedMaterial(sh.rule, text, units);
    if (im) { mat = im; how = "implied"; }
  }
  /* جنسی که فقط در نام نوع قلمِ پیشنهادیِ مدل آمده («لوله پلی اتیلن» برای «لوله ۱۱۰») و نه در
     عنوان و نه در عرف، حدس است و کنار می‌رود — نوع قلم به نامِ پایه برمی‌گردد. جنسِ ضمنیِ مدل
     هم همین‌طور: فقط عرفِ پذیرفته‌شده (impliedMaterial) جنسِ گفته‌نشده را پر می‌کند. */
  if (mat) attrs["جنس"] = how === "implied" ? { v: mat, i: 1 } : mat;
  const eff = sh.rule ? RULES.effectiveHead(sh.base, sh.rule, mat) : head;

  /* لایه‌های کمّی: واحدِ گفته‌شده، وگرنه واحدِ عرفِ همان لایه در همان نوع قلم (همان که فهرست با آن
     ساخته شده)، وگرنه پیش‌فرضِ لایه — «ضمنی»؛ عددی که خوانا نیست متن می‌ماند */
  const hd = await headData(env, eff);
  for (const [k, parts, x] of quant) {
    const conv = (hd && hd.uc && hd.uc[k]) || null;
    const qs = parts.map((p) => {
      if (p.unit) return RULES.quantWith(k, p.num, p.unit, strict && x.imp);
      const q = RULES.parseQuant(k, p.num, conv);
      return q && !q.list ? q : null;
    });
    if (qs.every(Boolean)) attrs[k] = qs.length > 1 ? qs : qs[0];
    else if (strict && parts.some((p) => p.unit)) throw new HttpError(`«${k}»: «${x.text}» عدد نیست؛ یا عدد بنویسید یا واحد را بردارید تا متن بماند.`);
  }
  return {
    head: eff, layers: attrs, residual: [T(raw && raw.residual), ...extra].filter(Boolean).join(" "),
    confidence: ["high", "medium", "low"].includes(raw && raw.confidence) ? raw.confidence : "low", hd,
  };
}

async function askModel(env, it, meta, cands, samples, conv) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل روی این پروژه ست نشده است.", 503);
  const model = env.AI_MODEL || MODEL;
  const r = await fetch(API(env), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system: systemPrompt(meta.layers),
      /* خروجی با ابزار، نه متن آزاد — همان قاعدهٔ extract.js: همیشه JSON معتبرِ هم‌شکل */
      tools: [{ name: "record_split", description: "تفکیک عنوان قلم را ثبت می‌کند.", strict: true, input_schema: toolSchema(meta.layers) }],
      tool_choice: { type: "tool", name: "record_split" },
      messages: [{ role: "user", content: userPrompt(it, cands, samples, conv) }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(`مدل پاسخ نداد: ${String((d && d.error && d.error.message) || `خطای ${r.status}`).slice(0, 300)}`, r.status === 429 ? 429 : 502);
  const use = (d.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new HttpError("مدل خروجی ساختاریافته برنگرداند.", 502);
  const u = { input: d.usage && d.usage.input_tokens, output: d.usage && d.usage.output_tokens };
  return { raw: use.input, model: d.model || model, usage: u, cost: runCost(d.model || model, u) };
}

/* ------------------------------------------------------------------ */
/* ورودی                                                                */
/* ------------------------------------------------------------------ */
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };
export const normOf = (it) => parse(it && it.norm_json);
const textOf = (it) => `${T(it && it.title)} ${T(it && it.spec)}`.trim();

/**
 * ساختاری که پیش از یکسان‌سازی (نسخهٔ ۱) ذخیره شده — تأیید کارشناس یا کش مدل — به زبان
 * امروز: «ورق» + ضخامت «2 میل» ← «ورق آهنی» + ضخامت ۲ میلی‌متر + جنسِ ضمنیِ آهنی.
 */
export async function canonStruct(env, meta, s, it) {
  if (!s || s.v === NORM_V) return s;
  const r = await settle(env, meta, { head: s.head, layers: s.layers, residual: s.residual, confidence: s.confidence }, textOf(it));
  return { ...s, head: r.head, layers: r.layers, v: NORM_V };
}

/** ساختار قلم از فهرست، اگر کد راهکارانش آن‌جا باشد — {head, layers, residual, code} یا null */
export async function catalogStruct(env, code) {
  const head = await headOfCode(env, code);
  if (head == null) return null;
  const hd = await headData(env, head);
  const x = itemOf(hd, code);
  return hd && x ? { hd, struct: { head: hd.head, layers: x[4] || {}, residual: x[5] || "", code: x[0], title: x[1] } } : null;
}

/** واحدهای ثبت‌شده در سوابق این نوع قلم و نرخ هرکدام به واحد مرجع — برای نمایش و ویرایش */
export function ratesView(hd, code, override) {
  if (!hd) return { ref: null, units: [] };
  const item = code ? itemOf(hd, code) : null;
  const units = new Set([...Object.keys(hd.hr || {}), ...Object.keys((item && item[6]) || {}), ...Object.keys(override || {})]);
  units.delete(hd.ref);
  return {
    ref: hd.ref,
    units: [...units].sort().map((u) => ({ unit: u, ...(rateFor(hd, item, u, override) || { rate: null, basis: "نرخی نیست", conf: "—", src: "none" }) })),
  };
}

/* هزینهٔ تقریبیِ یک تفکیک با مدل — میانگینِ ۵۰ اجرای آخرِ همین نسخهٔ پرامپت، هر ده دقیقه یک بار */
let costCache = { at: 0, v: null };
export async function costEstimate(env) {
  if (costCache.v != null && now() - costCache.at < 10 * 60000) return costCache.v;
  const r = await env.DB.prepare(`SELECT AVG(cost_usd) AS a, COUNT(*) AS n FROM (SELECT cost_usd FROM norm_cache
      WHERE cost_usd > 0 AND json_extract(result, '$.v') = ? ORDER BY created_at DESC LIMIT 50)`).bind(NORM_V).first().catch(() => null);
  costCache = { at: now(), v: r && r.n >= 5 && r.a > 0 ? r.a : NORM_COST_EST };
  return costCache.v;
}

/**
 * پیشنهاد تفکیک یک قلم. `force`: حتی اگر کد در فهرست هست یا عنوان در کش است، از مدل بپرس.
 * خروجی ذخیره نمی‌شود — تأیید کارشناس (confirmNorm) آن را روی قلم می‌نویسد.
 */
export async function normalizeItem(env, it, opts = {}) {
  const meta = await catalogMeta(env);
  if (!meta) throw new HttpError("فهرست اقلام هنوز بارگذاری نشده است؛ مدیر آن را از تب «سوابق تأمین» بارگذاری می‌کند.", 409);
  /* نام لایه‌های استاندارد همراه هر پاسخ — پنل برای ویرایش لایه‌ها فهرستشان را لازم دارد؛
     costEst: هزینهٔ تقریبیِ «تفکیک دوباره با مدل»، کنار همان دکمه */
  const [p, costEst] = await Promise.all([proposal(env, it, meta, opts), costEstimate(env)]);
  return { ...p, layerNames: meta.layers.map((l) => l.fa), costEst };
}

async function proposal(env, it, meta, { force = false }) {

  if (!force) {
    /* از قبل تأیید شده: همان، با نرخ‌هایی که کارشناس عوض کرده بود */
    const done0 = normOf(it);
    if (done0) {
      const done = await canonStruct(env, meta, done0, it);
      const hd = await headData(env, done.head);
      return { ...done, source: done.source || "manual", confirmed: true, rates: ratesView(hd, done.code, done.rates), known: !!hd };
    }
    const c = await catalogStruct(env, it.code);
    if (c) return { source: "catalog", ...c.struct, rates: ratesView(c.hd, c.struct.code), known: true };
    const hit = await env.DB.prepare("SELECT result, model FROM norm_cache WHERE title_n=?").bind(keyOf(it.title)).first();
    if (hit) {
      const r = await canonStruct(env, meta, parse(hit.result), it);
      const hd = await headData(env, r.head);
      return { source: "cache", ...r, rates: ratesView(hd, null), known: !!hd, model: hit.model };
    }
  }

  /* نوع‌های محتمل از واژه‌های عنوان (و مشخصهٔ فنی، که اغلب اندازه و جنس است) */
  const text = textOf(it);
  const wh = await wordHeads(env, [...new Set(words(text))]);
  const ranked = scoreHeads(text, wh, meta.heads);
  const top = [];
  for (const { head } of ranked.slice(0, TOP_HEADS)) { const hd = await headData(env, head); if (hd) top.push(hd); }
  const samples = nearestItems(text, top);
  const cands = ranked.slice(0, NAME_HEADS).map((x) => x.head);

  /* عرف‌ها فقط وقتی فهرست با همین قواعد ساخته شده؛ فهرستِ کهنه «ورق آهنی» ندارد */
  const ans = await askModel(env, it, meta, cands, samples, meta.rules ? conventionLines(top) : []);
  const s = await settle(env, meta, ans.raw, text);
  const split = { v: NORM_V, head: s.head, layers: s.layers, residual: s.residual, confidence: s.confidence };
  await env.DB.prepare(`INSERT INTO norm_cache (title_n,result,model,cost_usd,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(title_n) DO UPDATE SET result=excluded.result, model=excluded.model, cost_usd=excluded.cost_usd, created_at=excluded.created_at`)
    .bind(keyOf(it.title), JSON.stringify(split), ans.model, ans.cost, now()).run();
  return {
    source: "model", ...split, rates: ratesView(s.hd, null), known: !!s.hd, candidates: cands,
    model: ans.model, cost: ans.cost, usage: ans.usage, promptVersion: NORM_PROMPT_VERSION,
  };
}

/**
 * تأیید کارشناس: ساختاری که از این پس «بررسی سوابق» بر آن انجام می‌شود، به‌همراه
 * نرخ‌های تبدیلی که عوض کرده. از همان صافیِ خروجی مدل می‌گذرد، پس «۲ میل» که کارشناس
 * تایپ کند همان ۲ میلی‌متر است و «ورق» با جنسِ آهنی همان «ورق آهنی». نوع قلمِ تازه (نه در
 * فهرست) پذیرفته می‌شود ولی سابقه‌ای ندارد.
 */
export async function confirmNorm(env, it, body) {
  const meta = await catalogMeta(env);
  if (!meta) throw new HttpError("فهرست اقلام هنوز بارگذاری نشده است.", 409);
  if (!nameOf(body && body.head)) throw new HttpError("نوع قلم لازم است.");
  const known = new Set(meta.layers.map((l) => l.fa));
  for (const k of Object.keys((body && body.layers) || {})) if (!known.has(nameOf(k))) throw new HttpError(`«${nameOf(k)}» لایهٔ استاندارد نیست.`);
  const rates = {};
  for (const [u, r] of Object.entries((body && body.rates) || {})) {
    const n = Number(r);
    if (!nameOf(u)) continue;
    if (!(n > 0) || !Number.isFinite(n)) throw new HttpError(`نرخ «${nameOf(u)}» باید عدد مثبت باشد.`);
    rates[nameOf(u)] = n;
  }
  const s = await settle(env, meta, { head: body.head, layers: body.layers, residual: body.residual, confidence: "high" }, textOf(it), { strict: true });
  const norm = {
    v: NORM_V, head: s.head, layers: s.layers, residual: T(body.residual), source: ["catalog", "cache", "model", "manual"].includes(body.source) ? body.source : "manual",
    code: T(body.code) || null, rates, confirmed_at: now(),
  };
  await env.DB.prepare("UPDATE items SET norm_json=?, norm_at=? WHERE id=?").bind(JSON.stringify(norm), norm.confirmed_at, it.id).run();
  return { ok: true, norm, known: !!s.hd, rates: ratesView(s.hd, norm.code, rates) };
}

export async function clearNorm(env, it) {
  await env.DB.prepare("UPDATE items SET norm_json=NULL, norm_at=NULL WHERE id=?").bind(it.id).run();
  return { ok: true };
}
