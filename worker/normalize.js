/**
 * نرمال‌سازی اقلام — تفکیک عنوان قلمِ درخواست به «نوع قلم» و «لایه‌های ویژگی»
 * با همان ساختاری که فهرست استاندارد اقلام (فایل ۱) دارد.
 *
 * سه راه، به ترتیب ارزانی:
 *   ۱. کد راهکاران قلم در فهرست هست (شهریور ۱۴۰۵: ۸۱٪ اقلام درخواست‌ها) → ساختار
 *      مستقیم از فهرست؛ رایگان و قطعی، بی‌مدل.
 *   ۲. همین عنوان قبلاً با مدل تفکیک شده (norm_cache) → همان نتیجه، بی‌هزینهٔ دوباره.
 *   ۳. وگرنه واژه‌های عنوان با فهرست تطبیق داده می‌شوند (cat_words)، چند نوع قلمِ
 *      محتمل با نزدیک‌ترین اقلامشان (حداکثر ۲۵ ردیف) و نام ۳۴ لایهٔ استاندارد به
 *      Haiku می‌رود تا عنوان را با همان ساختار تفکیک کند. پرامپت عمداً کوچک است:
 *      حداقل طول قابل‌کش در Haiku 4.5 چهار هزار توکن است و این پرامپت به آن نمی‌رسد،
 *      پس ارزان‌ترین راه، کوتاه نگه داشتنِ خود پرامپت است (≈۰٫۴ سنت در هر فراخوانی).
 *
 * خروجی راه ۲ و ۳ «پیشنهاد» است و تا کارشناس تأییدش نکند، سوابق بر آن جستجو نمی‌شود.
 * (Task.txt «پایتون» گفته بود؛ سرور روی Cloudflare جاوااسکریپت اجرا می‌کند و همان
 * تطبیق واژه‌به‌واژه این‌جا انجام می‌شود.)
 */
import { HttpError } from "./http.js";
import { MODEL } from "./extract.js";
import { runCost } from "./discovery.js";
import { nameOf, keyOf, words, catalogMeta, headOfCode, headData, itemOf, wordHeads, rateFor } from "./catalog.js";

const API = (env) => (env.ANTHROPIC_API_BASE || "https://api.anthropic.com") + "/v1/messages";
export const NORM_PROMPT_VERSION = "item-norm/1.0";
const T = (v) => String(v == null ? "" : v).trim();
const now = () => Date.now();

/* چند نوع قلم و چند نمونه به مدل برسد. بیشتر فقط هزینه است: نمونه‌ها برای یاد دادنِ
   «این نوع قلم معمولاً چه لایه‌هایی دارد» است و ده‌ها نمونه چیزی اضافه نمی‌کند. */
const TOP_HEADS = 4, MAX_SAMPLES = 25, NAME_HEADS = 8;

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
  for (const [h, s] of score) if (keyOf(h).length > 1 && t.includes(keyOf(h))) score.set(h, s + 3);
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

/* ------------------------------------------------------------------ */
/* مدل                                                                  */
/* ------------------------------------------------------------------ */
const systemPrompt = (layers) => `تو عنوان یک قلمِ درخواست خرید را به «نوع قلم» و «لایه‌های ویژگی» تفکیک می‌کنی — دقیقاً با همان ساختاری که فهرست استاندارد اقلام این شرکت دارد.

نوع قلم: هستهٔ معنایی قلم، مثل «پیچ» یا «فیلتر روغن». اگر یکی از نوع‌های پیشنهادی درست است، عین همان نوشته را بنویس؛ فقط اگر هیچ‌کدام نمی‌خورد، نوع تازه بنویس.
لایه‌ها: فقط از فهرست زیر. مقدار هر لایه همان بخشی از عنوان است که آن ویژگی را می‌گوید — عدد، واحد و نگارشش را عوض نکن و چیزی از خودت اضافه نکن. لایه‌ای که در عنوان نیست را ننویس.
باقیمانده: بخشی از عنوان که به نوع قلم یا هیچ لایه‌ای نمی‌خورد.
از نمونه‌ها یاد بگیر که هر نوع قلم معمولاً چه لایه‌هایی دارد و مقدارشان چه شکلی است.

فهرست لایه‌های استاندارد (${layers.length}): ${layers.map((l) => l.en ? `${l.fa} (${l.en})` : l.fa).join("، ")}`;

function userPrompt(it, cands, samples) {
  const ex = samples.map((s) => `- ${s.title} → ${s.head}${Object.keys(s.layers).length ? " | " + Object.entries(s.layers).map(([k, v]) => `${k}=${v}`).join("؛ ") : ""}`).join("\n");
  return `عنوان قلم: «${T(it.title)}»`
    + (T(it.spec) ? `\nمشخصهٔ فنی: ${T(it.spec)}` : "")
    + (T(it.unit) ? `\nواحد درخواست: ${T(it.unit)}` : "")
    + `\n\nنوع‌های محتمل (به ترتیب شباهت): ${cands.length ? cands.join("، ") : "— (هیچ واژهٔ مشترکی با فهرست نبود)"}`
    + (ex ? `\n\nنمونه‌های نزدیک از فهرست (عنوان → نوع قلم | لایه‌ها):\n${ex}` : "");
}

const toolSchema = (layers) => ({
  type: "object",
  properties: {
    head: { type: "string", description: "نوع قلم" },
    layers: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string", enum: layers.map((l) => l.fa) }, value: { type: "string" } },
        required: ["name", "value"],
      },
    },
    residual: { type: "string", description: "بخشی از عنوان که به هیچ لایه‌ای نخورد؛ خالی اگر چیزی نماند" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["head", "layers", "residual", "confidence"],
});

/** خروجی مدل → ساختار تمیز. نام لایهٔ ناشناخته و مقدار خالی کنار می‌رود؛ تکراری اولی می‌ماند. */
export function cleanSplit(raw, layers) {
  const known = new Set(layers.map((l) => l.fa));
  const out = {};
  for (const x of Array.isArray(raw && raw.layers) ? raw.layers : []) {
    const k = nameOf(x && x.name), v = T(x && x.value);
    if (known.has(k) && v && !(k in out)) out[k] = v;
  }
  const head = nameOf(raw && raw.head);
  if (!head) throw new HttpError("مدل نوع قلم را برنگرداند.", 502);
  return { head, layers: out, residual: T(raw && raw.residual), confidence: ["high", "medium", "low"].includes(raw && raw.confidence) ? raw.confidence : "low" };
}

async function askModel(env, it, meta, cands, samples) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError("کلید مدل روی این پروژه ست نشده است.", 503);
  const model = env.AI_MODEL || MODEL;
  const r = await fetch(API(env), {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 1024,
      system: systemPrompt(meta.layers),
      /* خروجی با ابزار، نه متن آزاد — همان قاعدهٔ extract.js: همیشه JSON معتبرِ هم‌شکل */
      tools: [{ name: "record_split", description: "تفکیک عنوان قلم را ثبت می‌کند.", input_schema: toolSchema(meta.layers) }],
      tool_choice: { type: "tool", name: "record_split" },
      messages: [{ role: "user", content: userPrompt(it, cands, samples) }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(`مدل پاسخ نداد: ${String((d && d.error && d.error.message) || `خطای ${r.status}`).slice(0, 300)}`, r.status === 429 ? 429 : 502);
  const use = (d.content || []).find((c) => c.type === "tool_use");
  if (!use) throw new HttpError("مدل خروجی ساختاریافته برنگرداند.", 502);
  const u = { input: d.usage && d.usage.input_tokens, output: d.usage && d.usage.output_tokens };
  return { split: cleanSplit(use.input, meta.layers), model: d.model || model, usage: u, cost: runCost(d.model || model, u) };
}

/* ------------------------------------------------------------------ */
/* ورودی                                                                */
/* ------------------------------------------------------------------ */
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };
export const normOf = (it) => parse(it && it.norm_json);

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

/**
 * پیشنهاد تفکیک یک قلم. `force`: حتی اگر کد در فهرست هست یا عنوان در کش است، از مدل بپرس.
 * خروجی ذخیره نمی‌شود — تأیید کارشناس (confirmNorm) آن را روی قلم می‌نویسد.
 */
export async function normalizeItem(env, it, opts = {}) {
  const meta = await catalogMeta(env);
  if (!meta) throw new HttpError("فهرست اقلام هنوز بارگذاری نشده است؛ مدیر آن را از تب «سوابق تأمین» بارگذاری می‌کند.", 409);
  /* نام ۳۴ لایهٔ استاندارد همراه هر پاسخ — پنل برای ویرایش لایه‌ها فهرستشان را لازم دارد */
  return { ...await proposal(env, it, meta, opts), layerNames: meta.layers.map((l) => l.fa) };
}

async function proposal(env, it, meta, { force = false }) {

  if (!force) {
    /* از قبل تأیید شده: همان، با نرخ‌هایی که کارشناس عوض کرده بود */
    const done = normOf(it);
    if (done) {
      const hd = await headData(env, done.head);
      return { ...done, source: done.source || "manual", confirmed: true, rates: ratesView(hd, done.code, done.rates), known: !!hd };
    }
    const c = await catalogStruct(env, it.code);
    if (c) return { source: "catalog", ...c.struct, rates: ratesView(c.hd, c.struct.code), known: true };
    const hit = await env.DB.prepare("SELECT result, model FROM norm_cache WHERE title_n=?").bind(keyOf(it.title)).first();
    if (hit) {
      const r = parse(hit.result);
      const hd = await headData(env, r.head);
      return { source: "cache", ...r, rates: ratesView(hd, null), known: !!hd, model: hit.model };
    }
  }

  /* نوع‌های محتمل از واژه‌های عنوان (و مشخصهٔ فنی، که اغلب اندازه و جنس است) */
  const text = `${T(it.title)} ${T(it.spec)}`;
  const wh = await wordHeads(env, [...new Set(words(text))]);
  const ranked = scoreHeads(text, wh, meta.heads);
  const top = [];
  for (const { head } of ranked.slice(0, TOP_HEADS)) { const hd = await headData(env, head); if (hd) top.push(hd); }
  const samples = nearestItems(text, top);
  const cands = ranked.slice(0, NAME_HEADS).map((x) => x.head);

  const ans = await askModel(env, it, meta, cands, samples);
  const hd = await headData(env, ans.split.head);
  await env.DB.prepare(`INSERT INTO norm_cache (title_n,result,model,cost_usd,created_at) VALUES (?,?,?,?,?)
      ON CONFLICT(title_n) DO UPDATE SET result=excluded.result, model=excluded.model, cost_usd=excluded.cost_usd, created_at=excluded.created_at`)
    .bind(keyOf(it.title), JSON.stringify(ans.split), ans.model, ans.cost, now()).run();
  return {
    source: "model", ...ans.split, rates: ratesView(hd, null), known: !!hd, candidates: cands,
    model: ans.model, cost: ans.cost, usage: ans.usage, promptVersion: NORM_PROMPT_VERSION,
  };
}

/**
 * تأیید کارشناس: ساختاری که از این پس «بررسی سوابق» بر آن انجام می‌شود، به‌همراه
 * نرخ‌های تبدیلی که عوض کرده. نوع قلمِ تازه (نه در فهرست) پذیرفته می‌شود ولی سابقه‌ای ندارد.
 */
export async function confirmNorm(env, it, body) {
  const meta = await catalogMeta(env);
  if (!meta) throw new HttpError("فهرست اقلام هنوز بارگذاری نشده است.", 409);
  const head = nameOf(body && body.head);
  if (!head) throw new HttpError("نوع قلم لازم است.");
  const known = new Set(meta.layers.map((l) => l.fa));
  const layers = {};
  for (const [k, v] of Object.entries((body && body.layers) || {})) {
    const n = nameOf(k), val = T(v);
    if (!known.has(n)) throw new HttpError(`«${n}» لایهٔ استاندارد نیست.`);
    if (val) layers[n] = val;
  }
  const rates = {};
  for (const [u, r] of Object.entries((body && body.rates) || {})) {
    const n = Number(r);
    if (!nameOf(u)) continue;
    if (!(n > 0) || !Number.isFinite(n)) throw new HttpError(`نرخ «${nameOf(u)}» باید عدد مثبت باشد.`);
    rates[nameOf(u)] = n;
  }
  const hd = await headData(env, head);
  const norm = {
    v: 1, head, layers, residual: T(body.residual), source: ["catalog", "cache", "model", "manual"].includes(body.source) ? body.source : "manual",
    code: T(body.code) || null, rates, confirmed_at: now(),
  };
  await env.DB.prepare("UPDATE items SET norm_json=?, norm_at=? WHERE id=?").bind(JSON.stringify(norm), norm.confirmed_at, it.id).run();
  return { ok: true, norm, known: !!hd, rates: ratesView(hd, norm.code, rates) };
}

export async function clearNorm(env, it) {
  await env.DB.prepare("UPDATE items SET norm_json=NULL, norm_at=NULL WHERE id=?").bind(it.id).run();
  return { ok: true };
}
