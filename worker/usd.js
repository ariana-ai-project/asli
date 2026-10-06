/**
 * نرخ دلار — پایهٔ «قیمت روز» و رتبهٔ «ارزش خرید» در سوابق (طرح «خرید هوشمند، کارشناس ناظر»، مهر ۱۴۰۵)
 *
 * تصمیم‌های کاربر (۱۴۰۵/۰۷/۱۴):
 *  - «قیمت روز»ِ سوابق پیش‌فرض با نسبتِ نرخ دلارِ امروز به نرخِ روزِ خرید تعدیل می‌شود؛ تیکِ «مرکز آمار» همان تعدیلِ
 *    فصلیِ زمستان ۱۴۰۴ را نشان می‌دهد. مبنای رتبه‌بندی همیشه دلار است.
 *  - روزی که نرخ ندارد (جمعه، تعطیل) با درون‌یابی خطیِ ساده بین نزدیک‌ترین روزِ قبل و بعد پر می‌شود.
 *  - هر روز صبح نرخ دیروز از کانال تلگرام خوانده و ثبت می‌شود.
 *
 * منبع: کانال عمومی «قیمت لحظه‌ای دلار تهران» (t.me/dollar_tehran3bze). این فایل نسخهٔ جاوااسکریپتِ ربات پایتونیِ خود
 * کاربر (dollar_bot.py) است با همان قاعده: نرخ هر روز عدد «آخرین معامله» (در ۹۸–۹۹ «کلوز») در پیام «پایان معاملات»
 * همان روز است؛ اگر آن پیام عدد نداشت، آخرین «معامله شد»ِ دلار فردایی پیش از آن؛ اگر عددش بیرون از کف و سقفِ خود پیام
 * بود (اشتباه تایپی)، آخرین معاملهٔ پیش از آن ملاک است. نرخ‌های کانال تومان‌اند و این‌جا ×۱۰ (ریال) ذخیره می‌شوند.
 * ورود به حساب لازم نیست: فقط نسخهٔ عمومیِ وبِ کانال (t.me/s/…) خوانده می‌شود، و Worker بیرون از ایران است.
 *
 * جدول usd_rates — یک ردیف برای هر روز (jday شمسی «1405/07/13»):
 *   src: excel (فایل اولیه یا بارگذاری) | bot (کانال) | manual (پشتیبانی) | interp (درون‌یابی؛ با هر نرخِ تازه بازسازی می‌شود)
 *   روزهای بعد از آخرین نرخ ردیف ندارند و «نرخ روز» همان آخرین نرخ است؛ روزهای پیش از اولین نرخ (کانال از ۱۳۹۸/۰۳/۲۷)
 *   نرخ اولین روز را می‌گیرند و جدا شمرده می‌شوند (usdTable.rateOn → early).
 */
import { jStr, jStr2ms, jValid, jNorm, tehranParts, DAY, HOUR, TEHRAN_OFFSET } from "./time.js";

export const USD_DDL = `
CREATE TABLE IF NOT EXISTS usd_rates (jday TEXT PRIMARY KEY, rate INTEGER NOT NULL, src TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL) WITHOUT ROWID;
`;

export const CHANNEL = "dollar_tehran3bze";
const PAGE = "https://t.me/s/" + CHANNEL;
const STATE_KEY = "usdBot";
const CUTOFF_HOUR = 4;                       /* پیامِ پیش از ۴ صبح تهران مال روزِ معاملاتیِ قبل است */
const PRICE_MIN = 3000, PRICE_MAX = 5000000; /* بازهٔ معقولِ نرخ، به تومان */
const RATE_MIN = 30000, RATE_MAX = 100000000;/* بازهٔ پذیرفتنیِ نرخ دستی یا فایل، به ریال */
const MAX_BACK = 14;                         /* حداکثر چند روزِ عقب‌مانده در یک اجرا */
const MAX_TRIES = 12;                        /* روزِ ناموفق چند بار دوباره سنجیده شود (هر ۱۰ دقیقه یک بار) */
const BOT_FROM_HOUR = 6;                     /* «هر روز صبح»: از ساعت ۶ تهران */

/* ------------------------------------------------------------------ */
/* روزهای شمسی                                                          */
/* ------------------------------------------------------------------ */
/** «1405/07/13» → شمارهٔ روز (روزهای پس از ۱۹۷۰/۰۱/۰۱)؛ تفاضلِ دو روز = فاصله‌شان */
export const dayNo = (j) => Math.round((jStr2ms(j) + TEHRAN_OFFSET) / DAY);
export const dayStr = (n) => jStr(n * DAY - TEHRAN_OFFSET);
export const shiftDay = (j, n) => dayStr(dayNo(j) + n);
/** روزِ معاملاتیِ یک لحظه: پیامِ پیش از ۴ صبح تهران مال روزِ قبل است */
export const tradingDay = (ms) => jStr(ms - CUTOFF_HOUR * HOUR);
/** تاریخِ سوابق («1402/2/10»، با رقم فارسی یا بی صفر) → «1402/02/10»؛ نامعتبر → "" */
export function jDay(s) {
  const j = jNorm(String(s == null ? "" : s).replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) % 16)).replace(/[-.]/g, "/").trim().slice(0, 10));
  return jValid(j) ? j : "";
}

/* ------------------------------------------------------------------ */
/* خواندن متن پیام‌ها — همان dollar_bot.py                               */
/* ------------------------------------------------------------------ */
/** متن فارسی → شکلِ قابل مقایسه: رقم لاتین، بی کشیده و نیم‌فاصله، «ی/ک» یکسان، فاصله‌های تکی (خط‌شکن می‌ماند) */
export function normText(s) {
  return String(s || "")
    .replace(/[۰-۹٠-٩]/g, (c) => String(c.charCodeAt(0) % 16))
    .replace(/[يىۍ]/g, "ی").replace(/ك/g, "ک")
    .replace(/[ـ‌‏‎﻿]/g, "")
    .replace(/[ \t\r\f\v\xa0  ]+/g, " ");
}

/* 23,950 · 28.460 (نقطه به‌جای جداکنندهٔ هزارگان) · 23950؛ تاریخ‌هایی مثل 1400.08.21 نمی‌خورند چون عدد نباید درست
   بعد از رقم، ویرگول یا نقطه شروع شود */
const NUM = /(?<![\d,.])(\d{1,3}(?:[,.]\d{3})+|\d{4,7})(?!\d|[,.]\d)/g;
/** [مقدار، شروع، پایان]ِ هر عددِ قیمت‌مانند در متنِ یکسان‌شده */
export function numbers(s) {
  const out = [];
  for (const m of s.matchAll(NUM)) {
    const v = Number(m[1].replace(/[,.]/g, ""));
    if (v >= PRICE_MIN && v <= PRICE_MAX) out.push([v, m.index, m.index + m[0].length]);
  }
  return out;
}

/** پیامِ روزانهٔ پایان معاملات («پایان معاملات»؛ یک هفته در ۱۴۰۰ «پایان ساعت کاری») */
export const isMarker = (t) => t.includes("پایان معاملات") || t.includes("پایان ساعت کاری");

const CLOSE_LABELS = ["آخرین معامله", "کلوز"];
const GAP_WORDS = /فروش|خرید|معامله|فردایی|دلار|تهران/g;
const LETTER = /[آ-ی]/;
function finds(t, label) {
  const out = [];
  for (let i = t.indexOf(label); i >= 0; i = t.indexOf(label, i + label.length)) out.push([i, i + label.length]);
  return out;
}

/** عدد پایانیِ پیامِ پایان معاملات؛ کنار برچسب، در همان خط، درست بعد یا درست قبل از آن:
 *  «📌 13,490 کلوز» «⚡️ 13,850 کلوز دلار تهران» «📝 23,950 آخرین معامله فردایی» «⏳ آخرین معامله : 235,600» */
export function summaryLastTrade(t) {
  const nums = numbers(t);
  for (const label of CLOSE_LABELS) {
    for (const [i, j] of finds(t, label)) {
      const nxt = nums.filter(([, a]) => a >= j);
      if (nxt.length && nxt[0][1] - j <= 12) {
        const gap = t.slice(j, nxt[0][1]);
        if (!gap.includes("\n") && !LETTER.test(gap)) return nxt[0][0];
      }
      const prv = nums.filter(([, , b]) => b <= i);
      if (prv.length) {
        const p = prv[prv.length - 1];
        if (i - p[2] <= 20) {
          const gap = t.slice(p[2], i);
          if (!gap.includes("\n") && !LETTER.test(gap.replace(GAP_WORDS, ""))) return p[0];
        }
      }
    }
  }
  return null;
}

/** عددِ کنار برچسبی مثل «کف» یا «سقف»، در همان خط: درست قبلش («🔻 21,600 کف») یا درست بعدش («📉 کف معاملات: 268,500») */
function labelled(t, label) {
  const nums = numbers(t);
  for (const [i, j] of finds(t, label)) {
    const prv = nums.filter(([, , b]) => b <= i);
    if (prv.length) {
      const p = prv[prv.length - 1];
      if (i - p[2] <= 4 && !t.slice(p[2], i).includes("\n")) return p[0];
    }
    const nxt = nums.filter(([, a]) => a >= j);
    if (nxt.length && nxt[0][1] - j <= 16) {
      const gap = t.slice(j, nxt[0][1]);
      if (!gap.includes("\n") && !LETTER.test(gap.replace(/معاملات|معامله/g, ""))) return nxt[0][0];
    }
  }
  return null;
}

/** عدد پایانی بیرون از کف و سقفِ همان پیام است — نشانهٔ اشتباه تایپی */
export function summaryOutOfRange(t) {
  const c = summaryLastTrade(t), lo = labelled(t, "کف"), hi = labelled(t, "سقف");
  return c != null && lo != null && hi != null && !(Math.min(lo, hi) <= c && c <= Math.max(lo, hi));
}

const DATE = /(1[34]\d\d)\s*[./\-]\s*(\d{1,2})\s*[./\-]\s*(\d{1,2})/;
/** تاریخِ نوشته‌شده در متن پیام («1405.07.13») → «1405/07/13» */
export function writtenDate(t) {
  const m = DATE.exec(t);
  if (!m) return null;
  const j = `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
  return jValid(j) ? j : null;
}

/* بازارها یا قراردادهای دیگری که آن‌ها هم «معامله» می‌نویسند (نقدی، امروزی، هرات، تتر، ارزها و سکه)، و اعلان‌های «نیست»،
   سنجاق، شروع و خلاصه */
const NOT_TEHRAN_NEXT_DAY = /نقدی|امروزی|تتر|USDT|هرات|سلیمانیه|اربیل|یورو|درهم|پوند|لیر|یوان|دینار|سکه|طلا|نیست|pinned|شروع معاملات|کف|سقف/;
/** قیمتِ پیامِ «معامله شد»ِ دلار فردایی تهران («سبزه ⛳️ 12,070 معامله ⌛️ فردایی»، «دلار فردایی تهران ⏳ 235,400 معامله شد»)؛
 *  همان قرارداد با نام‌های روزِ پیش از تعطیلی («شنبه‌ای»، «پس‌فردا») هم؛ بقیه null */
export function tradePrice(t) {
  if (isMarker(t) || !t.includes("معامله") || NOT_TEHRAN_NEXT_DAY.test(t)) return null;
  if (!/سبزه|دلار|تهران/.test(t)) return null;
  const nums = numbers(t);
  return nums.length === 1 ? nums[0][0] : null;
}

/** روزِ معاملاتیِ پیامِ پایان معاملات: معمولاً روزِ انتشار؛ تاریخِ نوشته‌شده فقط وقتی ملاک است که پیام صبحِ فردا
 *  دیر منتشر شده باشد (تاریخی که از پیام قبلی کپی مانده، ملاک نیست) */
export function markerDay(m) {
  const td = tradingDay(m.t);
  const w = writtenDate(m.x);
  if (w && w === shiftDay(td, -1) && tehranParts(m.t).hour < 12) return w;
  return td;
}

/**
 * نرخِ هر روز از پیام‌های خوانده‌شده — همان select_days ربات پایتونی.
 * msgs: [{id, t (میلی‌ثانیه)، x (متنِ یکسان‌شده)}]؛ streamed: روزهایی که پیام‌های پیش از پیام پایانی‌شان خوانده شده.
 * خروجی: Map روز ← {price (تومان)، how، id، t، note}
 */
export function selectDays(msgs, streamed = new Set()) {
  msgs = msgs.filter((m) => m.t).slice().sort((a, b) => a.id - b.id);
  const byDay = new Map();
  for (const m of msgs) {
    const d = isMarker(m.x) ? markerDay(m) : tradingDay(m.t);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(m);
  }
  const out = new Map();
  /* ۱) پیامِ پایان معاملات با عدد */
  for (const m of msgs) {
    if (!isMarker(m.x)) continue;
    const p = summaryLastTrade(m.x);
    if (p == null) continue;
    const d = markerDay(m);
    if (out.has(d) && m.id < out.get(d).id) continue;
    const w = writtenDate(m.x);
    const notes = w && w !== d ? [`تاریخِ نوشته‌شده در پیام ${w} بود؛ روزِ انتشارِ پیام ملاک شد`] : [];
    let rec = { price: p, how: "summary", id: m.id, t: m.t };
    if (summaryOutOfRange(m.x)) {
      const trades = streamed.has(d) ? (byDay.get(d) || []).filter((x) => x.id < m.id && !isMarker(x.x) && tradePrice(x.x) != null) : [];
      const last = trades[trades.length - 1];
      if (last && tradePrice(last.x) !== p) {
        rec = { price: tradePrice(last.x), how: "last_trade_fix", id: last.id, t: last.t };
        notes.push(`عدد «آخرین معامله»ٔ پیام پایانی ${p} بود و با کف و سقفِ همان پیام نمی‌خواند؛ آخرین معاملهٔ پیش از آن ملاک شد`);
      } else if (!last) notes.push("عدد «آخرین معامله» با کف و سقفِ همان پیام نمی‌خواند و معامله‌ای برای مقایسه خوانده نشد");
    }
    rec.note = notes.join("؛ ");
    out.set(d, rec);
  }
  /* ۲) بقیهٔ روزها: آخرین «معامله شد»ِ فردایی پیش از پیام پایان معاملاتِ همان روز */
  for (const [d, ms] of byDay) {
    if (out.has(d)) continue;
    const markers = ms.filter((x) => isMarker(x.x)).map((x) => x.id);
    const stop = markers.length ? markers[markers.length - 1] : null;
    const trades = ms.filter((x) => !isMarker(x.x) && tradePrice(x.x) != null && (stop == null || x.id < stop));
    if (trades.length) {
      const last = trades[trades.length - 1];
      out.set(d, { price: tradePrice(last.x), how: stop ? "last_trade" : "last_trade_no_marker", id: last.id, t: last.t, note: "" });
    }
  }
  return out;
}

export const HOW_FA = {
  summary: "پیام «پایان معاملات» همان روز",
  last_trade: "آخرین «معامله شد» پیش از پیام «پایان معاملات» (پیام پایانی عدد نداشت)",
  last_trade_no_marker: "آخرین «معامله شد» روز (پیام «پایان معاملات» پیدا نشد)",
  last_trade_fix: "آخرین «معامله شد» پیش از پیام «پایان معاملات» (عدد پیام پایانی اشتباه تایپی بود)",
};

/* ------------------------------------------------------------------ */
/* صفحهٔ عمومیِ کانال (t.me/s)                                           */
/* ------------------------------------------------------------------ */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? all);

/** متنِ پیام: درونِ div با کلاسِ tgme_widget_message_text، با <br> به‌جای خط‌شکن و بی برچسب‌ها */
function textOf(seg) {
  const open = /<div class="tgme_widget_message_text(?:\s[^"]*)?"[^>]*>/.exec(seg);
  if (!open) return "";
  const start = open.index + open[0].length;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = start;
  let depth = 1, end = seg.length, t;
  while ((t = tag.exec(seg))) { depth += t[1] ? -1 : 1; if (!depth) { end = t.index; break; } }
  return decode(seg.slice(start, end).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
}

/** پیام‌های یک صفحهٔ t.me/s → [{id، t (میلی‌ثانیه)، x (متنِ یکسان‌شده)}] به ترتیب شناسه */
export function parsePosts(html) {
  const starts = [];
  for (const m of String(html || "").matchAll(/data-post="[^"/]+\/(\d+)"/g)) starts.push([+m[1], m.index]);
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    const seg = html.slice(starts[k][1], k + 1 < starts.length ? starts[k + 1][1] : html.length);
    const times = [...seg.matchAll(/<time[^>]*datetime="([^"]+)"/g)];
    const t = times.length ? Date.parse(times[times.length - 1][1]) : NaN;
    out.push({ id: starts[k][0], t: isNaN(t) ? null : t, x: normText(textOf(seg)) });
  }
  return out.sort((a, b) => a.id - b.id);
}

async function tgPage(fetcher, params) {
  const u = new URL(PAGE);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12000);
  try {
    const r = await fetcher(u.toString(), { headers: { "user-agent": "Mozilla/5.0 (compatible; tamin-poshtibani usd-rate; once a day)", "accept-language": "fa,en;q=0.5" }, signal: ac.signal });
    if (!r.ok) throw new Error(`t.me پاسخ ${r.status} داد`);
    return parsePosts(await r.text());
  } finally { clearTimeout(timer); }
}

/* ------------------------------------------------------------------ */
/* جدول نرخ و درون‌یابی                                                  */
/* ------------------------------------------------------------------ */
/** روزهای خالیِ بینِ نرخ‌های واقعیِ پیاپی، با درون‌یابی خطیِ ساده (تصمیم ۵). real: [{jday, rate}] مرتب */
export function interpolate(real) {
  const out = [];
  for (let k = 1; k < real.length; k++) {
    const a = real[k - 1], b = real[k];
    const da = dayNo(a.jday), n = dayNo(b.jday) - da;
    for (let i = 1; i < n; i++) out.push({ jday: dayStr(da + i), rate: Math.round(a.rate + (b.rate - a.rate) * i / n), ref: `${a.jday}~${b.jday}` });
  }
  return out;
}

const upsertSql = "INSERT INTO usd_rates (jday,rate,src,ref,at) VALUES (?,?,?,?,?) ON CONFLICT(jday) DO UPDATE SET rate=excluded.rate, src=excluded.src, ref=excluded.ref, at=excluded.at";

/**
 * روزهای درون‌یابی‌شدهٔ بازهٔ [from, to] را از نو می‌سازد: از آخرین نرخ واقعیِ پیش از from تا اولین نرخ واقعیِ بعد از to.
 * خروجی: دستورهایی که باید در همان batch بیایند (نه اجرا) — تا نرخ تازه و درون‌یابی‌اش با هم بنشینند.
 * extra: نرخ‌های واقعی‌ای که در همین batch نوشته می‌شوند ولی هنوز در جدول نیستند.
 */
export async function interpStmts(env, from, to, extra = [], now = Date.now()) {
  const lo = await env.DB.prepare("SELECT jday FROM usd_rates WHERE src!='interp' AND jday<? ORDER BY jday DESC LIMIT 1").bind(from).first();
  const hi = await env.DB.prepare("SELECT jday FROM usd_rates WHERE src!='interp' AND jday>? ORDER BY jday ASC LIMIT 1").bind(to).first();
  const a = lo ? lo.jday : from, b = hi ? hi.jday : to;
  const { results } = await env.DB.prepare("SELECT jday, rate FROM usd_rates WHERE src!='interp' AND jday>=? AND jday<=? ORDER BY jday").bind(a, b).all();
  const real = new Map((results || []).map((r) => [r.jday, r.rate]));
  for (const r of extra) if (r.rate == null) real.delete(r.jday); else real.set(r.jday, r.rate);
  const sorted = [...real].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([jday, rate]) => ({ jday, rate }));
  const rows = interpolate(sorted);
  return [
    env.DB.prepare("DELETE FROM usd_rates WHERE src='interp' AND jday>? AND jday<?").bind(a, b),
    ...rows.map((r) => env.DB.prepare(upsertSql).bind(r.jday, r.rate, "interp", r.ref, now)),
  ];
}

/** نرخ‌های واقعی (فایل یا دستی) را می‌نشاند و درون‌یابیِ بازه‌شان را از نو می‌سازد. rows: [{jday, rate (ریال) | null برای حذف}] */
export async function putRates(env, rows, { src = "excel", ref = null, now = Date.now() } = {}) {
  const clean = [];
  const bad = [];
  for (const r of rows || []) {
    const jday = jDay(r.jday);
    const rate = r.rate == null || r.rate === "" ? null : Math.round(Number(String(r.rate).replace(/,/g, "")));
    if (!jday || (rate != null && !(rate >= RATE_MIN && rate <= RATE_MAX))) { bad.push(r); continue; }
    clean.push({ jday, rate });
  }
  if (!clean.length) return { written: 0, interp: 0, bad: bad.length };
  clean.sort((x, y) => (x.jday < y.jday ? -1 : 1));
  const stmts = clean.map((r) => r.rate == null
    ? env.DB.prepare("DELETE FROM usd_rates WHERE jday=? AND src!='interp'").bind(r.jday)
    : env.DB.prepare(upsertSql).bind(r.jday, r.rate, src, r.ref || ref, now));
  const it = await interpStmts(env, clean[0].jday, clean[clean.length - 1].jday, clean, now);
  /* D1: هر batch در یک تراکنش؛ فایل‌های بزرگ چند batch می‌شوند ولی درون‌یابی همیشه در آخرین */
  const all = [...stmts, ...it];
  for (let i = 0; i < all.length; i += 400) await env.DB.batch(all.slice(i, i + 400));
  usdCache = null;
  return { written: clean.length, interp: it.length - 1, bad: bad.length, from: clean[0].jday, to: clean[clean.length - 1].jday };
}

/* همهٔ نرخ‌ها در حافظهٔ isolate (۵ دقیقه): «قیمت روز» صدها ردیف سوابق با یک کوئری حساب می‌شود */
let usdCache = null;
/**
 * {latest:{jday, rate}، first، rateOn(jday) → {rate, early}} — rateOn نرخِ همان روز یا نزدیک‌ترین روزِ قبل از آن را می‌دهد
 * (بعد از آخرین نرخ = آخرین نرخ)؛ پیش از اولین نرخ، نرخِ اولین روز با early=true. جدول خالی → null
 */
export async function usdTable(env, now = Date.now()) {
  if (usdCache && now - usdCache.at < 5 * 60000) return usdCache.t;
  const { results } = await env.DB.prepare("SELECT jday, rate FROM usd_rates ORDER BY jday").all();
  const rows = results || [];
  let t = null;
  if (rows.length) {
    const days = rows.map((r) => r.jday), rates = rows.map((r) => r.rate);
    t = {
      latest: { jday: days[days.length - 1], rate: rates[rates.length - 1] },
      first: days[0],
      count: rows.length,
      rateOn(j) {
        const d = jDay(j);
        if (!d) return null;
        if (d < days[0]) return { rate: rates[0], early: true };
        let lo = 0, hi = days.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (days[mid] <= d) lo = mid; else hi = mid - 1; }
        return { rate: rates[lo], early: false };
      },
    };
  }
  usdCache = { at: now, t };
  return t;
}
export function resetUsdCache() { usdCache = null; }

/* ------------------------------------------------------------------ */
/* ربات روزانه                                                           */
/* ------------------------------------------------------------------ */
async function readState(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(STATE_KEY).first();
  try { const v = r ? JSON.parse(r.value) : null; return v && typeof v === "object" ? v : {}; } catch (_) { return {}; }
}
const stateStmt = (env, st, now) => env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
  .bind(STATE_KEY, JSON.stringify(st), now);

/** این دقیقه نوبتِ ربات نرخ است؟ از ساعت ۶ صبح تهران، هر ۱۰ دقیقه یک بار (دقیقهٔ ۳، ۱۳، …)؛ اجرای دستی همیشه */
export function usdSlot(now, cron) {
  if (!cron) return true;
  const p = tehranParts(now);
  return p.hour >= BOT_FROM_HOUR && p.minute % 10 === 3;
}

/**
 * نرخِ روزهای جاافتاده تا دیروز را از کانال می‌خواند و ثبت می‌کند. اگر کاری نبود {} برمی‌گرداند (فقط دو خواندن از D1).
 * معمولاً یک درخواست: جستجوی «پایان معاملات» پیام‌های پایانیِ حدود بیست روزِ آخر را می‌دهد؛ اگر پیامِ روزی عدد نداشت
 * یا عددش با کف و سقف نمی‌خواند، یک صفحهٔ پیش از همان پیام هم خوانده می‌شود. روزی که پیام پایانی ندارد و بعدش روز
 * معاملاتیِ دیگری آمده (یا جمعه و تعطیل است) «بی‌معامله» ثبت می‌شود و با درون‌یابی پر می‌شود.
 */
export async function usdDaily(env, { now = Date.now(), force = false, fetcher = fetch } = {}) {
  const last = await env.DB.prepare("SELECT jday FROM usd_rates WHERE src!='interp' ORDER BY jday DESC LIMIT 1").first();
  if (!last) return force ? { usd: { state: "empty", note: "جدول نرخ خالی است؛ اول فایل نرخ‌ها بارگذاری شود." } } : {};
  const yday = shiftDay(jStr(now), -1);
  const st = await readState(env);
  const none = new Set(st.none || []), fail = { ...(st.fail || {}) };
  const targets = [];
  for (let d = shiftDay(last.jday, 1); d <= yday; d = shiftDay(d, 1)) {
    if (none.has(d)) continue;
    if (!force && (fail[d] || 0) >= MAX_TRIES) continue;
    targets.push(d);
  }
  const todo = targets.slice(-MAX_BACK);
  if (!todo.length) return force ? { usd: { state: "upToDate", last: last.jday } } : {};

  const msgs = new Map();
  const add = (posts) => { for (const p of posts) if (p.t) msgs.set(p.id, p); };
  const streamed = new Set();
  let requests = 0, error = null;
  try {
    add(await tgPage(fetcher, { q: "پایان معاملات" })); requests++;
    const markerOf = () => {
      const byDay = new Map();
      for (const m of msgs.values()) if (isMarker(m.x)) { const d = markerDay(m); if (!byDay.has(d) || byDay.get(d).id < m.id) byDay.set(d, m); }
      return byDay;
    };
    let markers = markerOf();
    /* روزهای خیلی قدیمی‌تر از نتیجهٔ جستجو: جستجوی تاریخ (همان فاز ۱ ربات پایتونی) */
    const oldest = [...markers.keys()].sort()[0];
    for (const d of todo) {
      if (markers.has(d) || (oldest && d > oldest) || requests >= 6) continue;
      add(await tgPage(fetcher, { q: d.replace(/\//g, ".") })); requests++;
    }
    markers = markerOf();
    /* پیامِ پایانیِ بی‌عدد یا با عددِ مشکوک: تا دو صفحهٔ پیش از همان پیام، تا آخرین «معامله شد»ِ آن روز پیدا شود */
    for (const d of todo) {
      const mk = markers.get(d);
      if (!mk || requests >= 8) continue;
      if (summaryLastTrade(mk.x) != null && !summaryOutOfRange(mk.x)) continue;
      let before = mk.id;
      for (let page = 0; page < 2 && requests < 8; page++) {
        const posts = await tgPage(fetcher, { before }); requests++;
        add(posts); streamed.add(d);
        const trade = posts.some((p) => p.t && p.id < mk.id && tradingDay(p.t) === d && tradePrice(p.x) != null);
        const first = posts[0];
        if (trade || !first || !first.t || tradingDay(first.t) < d) break;
        before = first.id;
      }
    }
  } catch (e) { error = (e && e.name === "AbortError") ? "t.me در ۱۲ ثانیه جواب نداد" : (e && e.message) || String(e); }

  const sel = selectDays([...msgs.values()], streamed);
  const markers = new Set([...msgs.values()].filter((m) => isMarker(m.x)).map((m) => markerDay(m)));
  const newestMarker = [...markers].sort().pop() || "";
  /* تعطیل رسمی (جدول holidays پنل مدیر) و جمعه: بی‌معامله، حتی اگر روزِ معاملاتیِ بعدی هنوز نیامده باشد */
  const holidays = new Set(((await env.DB.prepare(`SELECT date_j FROM holidays WHERE date_j IN (${todo.map(() => "?").join(",")})`).bind(...todo).all()).results || []).map((r) => r.date_j));
  const found = [], noTrade = [], failed = [];
  for (const d of todo) {
    const r = sel.get(d);
    if (r) { found.push({ jday: d, rate: r.price * 10, ref: `t.me/${CHANNEL}/${r.id}`, how: r.how, note: r.note || "" }); continue; }
    const holiday = tehranParts(jStr2ms(d) + 12 * HOUR).dow === 5 || holidays.has(d);
    if (!error && !markers.has(d) && (newestMarker > d || holiday)) { noTrade.push(d); continue; }
    failed.push(d);
  }
  for (const d of found) delete fail[d.jday];
  for (const d of noTrade) { none.add(d); delete fail[d]; }
  for (const d of failed) fail[d] = (fail[d] || 0) + 1;
  /* فقط روزهای ۴۰ روزِ اخیر در وضعیت می‌مانند */
  const keepFrom = shiftDay(yday, -40);
  const run = { at: now, days: todo, found: found.map((f) => ({ jday: f.jday, rate: f.rate, how: f.how, ref: f.ref, note: f.note || undefined })), none: noTrade, failed, requests, error: error || undefined };
  const next = {
    ...st, at: now,
    none: [...none].filter((d) => d >= keepFrom).sort(),
    fail: Object.fromEntries(Object.entries(fail).filter(([d]) => d >= keepFrom)),
    runs: [run, ...(st.runs || [])].slice(0, 20),
  };
  const stmts = found.map((f) => env.DB.prepare(upsertSql).bind(f.jday, f.rate, "bot", f.ref, now));
  if (found.length) stmts.push(...await interpStmts(env, found[0].jday, found[found.length - 1].jday, found, now));
  stmts.push(stateStmt(env, next, now));
  await env.DB.batch(stmts);
  if (found.length) usdCache = null;
  return { usd: { found: run.found, none: noTrade, failed, requests, error: error || undefined } };
}

/* ------------------------------------------------------------------ */
/* پنل پشتیبانی: «💵 نرخ دلار»                                           */
/* ------------------------------------------------------------------ */
export async function usdStatus(env, url) {
  const days = Math.min(400, Math.max(7, parseInt(url && url.searchParams.get("days"), 10) || 45));
  const [{ results }, cnt, st] = await Promise.all([
    env.DB.prepare("SELECT jday, rate, src, ref, at FROM usd_rates ORDER BY jday DESC LIMIT ?").bind(days).all(),
    env.DB.prepare("SELECT COUNT(*) AS n, SUM(src!='interp') AS real, MIN(jday) AS first, MAX(jday) AS last FROM usd_rates").first(),
    readState(env),
  ]);
  return {
    channel: CHANNEL,
    count: cnt ? cnt.n : 0, real: cnt ? cnt.real || 0 : 0, first: cnt && cnt.first, last: cnt && cnt.last,
    latest: results && results[0] ? results[0] : null,
    rows: results || [],
    bot: { at: st.at || null, runs: (st.runs || []).slice(0, 10), none: (st.none || []).slice(-15), fail: st.fail || {}, fromHour: BOT_FROM_HOUR },
  };
}

/** مسیرهای /support/usd… — پیش از این requireSupport شده است */
export async function usdAdmin(request, env, sub, m, url, { json, readJson }) {
  if (sub === "" && m === "GET") return json(await usdStatus(env, url));
  if (sub === "/fetch" && m === "POST") return json(await usdDaily(env, { force: true }));
  if (sub === "/rows" && m === "POST") {
    const b = await readJson(request);
    const src = b.src === "manual" ? "manual" : "excel";
    const r = await putRates(env, b.rows, { src, ref: src === "excel" ? String(b.file || "").slice(0, 80) || "excel" : "پشتیبانی" });
    return json({ ok: true, ...r });
  }
  return json({ error: "مسیر نرخ دلار پیدا نشد." }, 404);
}
