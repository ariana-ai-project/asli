/**
 * گزارش‌های پنل مدیر — «وضعیت درخواست ها» و «گزارش سه ماهه»
 *
 * ساختار هر دو دقیقاً از فایل‌های نمونهٔ واحد پشتیبانی آمده است:
 *   «وضعیت درخواست ها.xlsx»: برگهٔ «درخواست کلی» (جدول اکسل با سه برش‌دهندهٔ وضعیت، طرف مقابل،
 *     کارشناس خرید و ستون‌های پنهان) و «گزارش روزانه» (ارجاع‌ها با تاریخ تحویل به کارشناس).
 *   «گزارش فصل زمستان اکسل نهایی.xlsx»: چهار برگهٔ دیدنی — وضعیت کلی گروه‌ها، درصد مدیران پروژه،
 *     درخواست و اقلام پروژه‌ها، کارشناس خرید — با همان رنگ‌ها، ادغام‌ها، فرمول‌ها و نمودارها.
 *
 * چارچوب ثابت (نام پروژه، شهر، مدیر پروژه) در تنظیمات است و پیش‌فرضش همان فایل نمونه؛ عددها از
 * درخواست‌های روزانهٔ ذخیره‌شده و «سوابق» (مبلغ فاکتورها) ساخته می‌شوند.
 *
 * تعریف‌ها (فرض‌های پیش از تأیید مدیر — در پاسخ به مدیر فهرست شده‌اند):
 *   درخواستِ «خرید شده»: هیچ قلم باز یا معلقی ندارد و دست‌کم یک قلمش خاتمه یافته است.
 *   «متوقف شده»: همهٔ اقلامش متوقف است. بقیه «اقدامی نشده / در جریان».
 *   کارشناس درخواست: ارجاعِ ارسال‌شده با بیشترین قلم؛ اگر در سامانه ارجاع نشده، ستون «کارشناس خرید»
 *     فایل راهکاران (با نام کارشناسان تطبیق داده می‌شود). هیچ‌کدام = «ارجاع نشده».
 *   گروه (سرگروه): کارشناس ارشد خودش یا ارشدِ کارشناس (تب کارشناسان).
 */
import { Book, WSheet, buildBook, sheetHtml, chartSvg, absRef, colName, BOOK_CSS } from "./xlsxbook.js";
import { jLen, jStr, jStr2ms, tehranParts, HOUR } from "./time.js";
import { HttpError } from "./http.js";

const T = (v) => String(v == null ? "" : v).trim();
const nrm = (x) => T(x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ");
const p2 = (n) => String(n).padStart(2, "0");

export const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export const SEASONS = ["بهار", "تابستان", "پاییز", "زمستان"];
const COUNT_WORDS = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده", "یازده"];

/* ------------------------------------------------------------------ */
/* چارچوب ثابت: پروژه‌ها و مدیران — از برگهٔ «درخواست خرید و اقلام پروژه ها»   */
/* block: ردیف‌های یک «جمع کل» · keys: کلیدواژه در «طرف مقابل» (بعد «مرکز درخواست کننده») */
/* managerLabel: نام در برگهٔ مدیران (دو «مهندس محمدی» آنجا با شهر جدا شده‌اند)        */
/* ------------------------------------------------------------------ */
export const DEFAULT_PROJECTS = [
  { block: 1, name: "راغون", city: "تاجیکستان", manager: "دکتر پور یزدان خواه", keys: ["راغون"] },
  { block: 2, name: "کاجاران", city: "ارمنستان", manager: "دکتر پور یزدان خواه", keys: ["کاجاران", "آختالا"] },
  { block: 2, name: "شهر مهندسی ارمنستان", city: "ارمنستان", manager: "دکتر پور یزدان خواه", keys: ["شهر مهندسی"] },
  { block: 3, name: "ایوانک", city: "تهران", manager: "مهندس عباسی", keys: ["ایوانک"] },
  { block: 3, name: "خانه کشتی", city: "تهران", manager: "مهندس رزاقیان", keys: ["خانه کشتی"] },
  { block: 3, name: "گلشن", city: "تهران", manager: "مهندس رزاقیان", keys: ["گلشن"] },
  { block: 3, name: "ساختمان هروی", city: "تهران", manager: "مهندس رزاقیان", keys: ["هروی"] },
  { block: 4, name: "آلکالی ماهشهر", city: "بندر ماهشهر", manager: "مهندس محمدی", managerLabel: "مهندس محمدی(ماهشهر)", keys: ["کلر آلکالی"] },
  { block: 4, name: "رستوران ماهشهر", city: "بندر ماهشهر", manager: "مهندس محمدی", managerLabel: "مهندس محمدی(ماهشهر)", keys: ["رستوران"] },
  { block: 4, name: "شمع کوبی ماهشهر", city: "بندر ماهشهر", manager: "مهندس محمدی", managerLabel: "مهندس محمدی(ماهشهر)", keys: ["ساخت شمع کلر آلکالی", "شمع کوبی"] },
  { block: 5, name: "تقاطع غیر همسطح", city: "کرج", manager: "مهندس محمدی", managerLabel: "مهندس محمدی(کرج)", keys: ["تقاطع غیر همسطح"] },
  { block: 5, name: "ساختمان کرج", city: "کرج", manager: "مهندس محمدی", managerLabel: "مهندس محمدی(کرج)", keys: ["ساختمان تجاری مسکونی رجائی", "مسکونی کرج", "ساختمان کرج"] },
  { block: 6, name: "تونل خلخال", city: "خلخال", manager: "مهندس عبداللهی", managerLabel: "مهندس عبدالهی", keys: ["خلخال"] },
  { block: 7, name: "سد نسا", city: "کرمان", manager: "مهندس عبدالهی", keys: ["سد نساء", "سد نسا", "نساء کرمان"] },
  { block: 7, name: "جاده خمین-الیگودرز", city: "خمین", manager: "مهندس عبدالهی", keys: ["خمین"] },
  { block: 8, name: "انتقال مس میدوک", city: "کرمان", manager: "مهندس طهماسبی", keys: ["انتقال رسوب", "انتقال مس"] },
  { block: 8, name: "سنگ شکن مس میدوک", city: "کرمان", manager: "مهندس طهماسبی", keys: ["سنگ شکن"] },
  { block: 8, name: "بن یکه", city: "کرمان", manager: "مهندس طهماسبی", keys: ["بن یکه"] },
  { block: 8, name: "فلوتاسیون خاتون آباد 0043", city: "کرمان", manager: "مهندس طهماسبی", keys: ["0043"] },
  { block: 8, name: "فلوتاسیون خاتون آباد 0036", city: "کرمان", manager: "مهندس طهماسبی", keys: ["0036"] },
  { block: 8, name: "ماختارال 1 قزاقستان", city: "قزاقستان", manager: "مهندس طهماسبی", keys: ["ماختارال"] },
  { block: 9, name: "زرشوران", city: "تکاب", manager: "مهندس هدایت موسوی", keys: ["زرشوران"] },
  { block: 10, name: "سد تانزانیا", city: "تانزانیا", manager: "مهندس یعقوب زاده", keys: ["تانزانیا"] },
  { block: 11, name: "تونل آب کامه", city: "تربت حیدریه", manager: "مهندس ضرابی", keys: ["کامه"] },
  { block: 12, name: "شهراب سازه", city: "بوشهر", manager: "مهندس بدریان", keys: ["شهراب"], noSystem: true,
    note: "*پروژه شهراب سازه پاسارگاد به دلیل عدم ثبت درخواست سیستمی در همکاران سیستم در ماه های اخیر ، امکان اعلام  دقیق تعداد درخواست و تعداد اقلام وجود ندارد*" },
  { block: 13, name: "دلیجان", city: "", manager: "دکتر احمدی", keys: ["دلیجان"] },
  { block: 14, name: "انبار مرکزی(چهاردانگه)", city: "تهران ( مرکزی)", manager: "", managerLabel: "دفتر و انبار مرکزی", keys: ["چهار دانگه", "چهاردانگه", "انبار مرکزی"] },
  { block: 14, name: "دفتر مرکزی", city: "تهران ( مرکزی)", manager: "", managerLabel: "دفتر و انبار مرکزی", keys: ["دفتر مرکزی"] },
];
export const DEFAULT_MANAGERS = ["دکتر پور یزدان خواه", "مهندس هدایت موسوی", "مهندس طهماسبی", "مهندس بدریان", "مهندس یعقوب زاده", "مهندس رزاقیان", "مهندس عباسی",
  "مهندس محمدی(ماهشهر)", "مهندس محمدی(کرج)", "مهندس عبدالهی", "دکتر احمدی", "مهندس ضرابی", "دفتر و انبار مرکزی"];

export const reportProjects = (s) => (Array.isArray(s && s.reportProjects) && s.reportProjects.length ? s.reportProjects : DEFAULT_PROJECTS)
  .map((p, i) => ({ ...p, block: Number(p.block) || i + 1, keys: (Array.isArray(p.keys) ? p.keys : String(p.keys || "").split(/[،,]/)).map(T).filter(Boolean) }));
export const reportManagers = (s) => (Array.isArray(s && s.reportManagers) && s.reportManagers.length ? s.reportManagers : DEFAULT_MANAGERS);
const managerLabelOf = (p) => p.managerLabel || p.manager || "بدون مدیر پروژه";

/** پروژهٔ یک درخواست: طولانی‌ترین کلیدواژهٔ پیداشده در «طرف مقابل»، وگرنه در «مرکز درخواست کننده» */
export function projectOf(projects, party, center) {
  for (const hay of [nrm(party), nrm(center)]) {
    if (!hay) continue;
    let best = null, bl = 0;
    for (const p of projects) for (const k of p.keys) { const kk = nrm(k); if (kk && hay.includes(kk) && kk.length > bl) { best = p; bl = kk.length; } }
    if (best) return best;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* کارشناس‌ها: نام کوتاه و تطبیق ستون «کارشناس خرید» فایل راهکاران          */
/* ------------------------------------------------------------------ */
const TITLES = new Set(["آقای", "آقا", "خانم", "مهندس", "دکتر", "سید", "سیده"]);
const words = (s) => nrm(s).split(/[\s\-–،,/()]+/).filter((w) => w.length >= 2 && !TITLES.has(w));

/** «آقای ابوذر بهمنی» → «بهمنی»؛ اگر نام خانوادگی تکراری باشد، نام کامل بی عنوان */
export function shortNames(experts) {
  const last = new Map(experts.map((e) => { const w = words(e.label || e.name); return [e.id, w[w.length - 1] || T(e.label || e.name)]; }));
  const cnt = {}; for (const v of last.values()) cnt[v] = (cnt[v] || 0) + 1;
  return new Map(experts.map((e) => [e.id, cnt[last.get(e.id)] > 1 ? words(e.label || e.name).join(" ") : last.get(e.id)]));
}
/** «کارشناس خرید» فایل‌ها → کارشناس. یک کلمهٔ مشترک کافی نیست («زاده»، «مریم»، «حسین» نام‌های بیرون از
    فهرست را به کارشناس دیگری می‌چسباند)؛ فقط: نام کامل برابر، یا همهٔ کلمه‌های نام/برچسب کارشناس درون نام،
    یا نامِ تک‌کلمه‌ای برابر نام خانوادگی (یا پیشوند دست‌کم ۴ حرفی آن). کارشناس فعال مقدم است. */
export function expertMatcher(experts) {
  const E = experts.map((e) => {
    const nw = words(e.name), lw = words(e.label);
    return { e, full: nw.join(" "), sets: [nw, lw].filter((s) => s.length), last: [...new Set([...lw, ...(nw.length > 1 ? nw.slice(1) : nw)])].filter((x) => x.length >= 3) };
  });
  const first = (...lists) => { for (const l of lists) { const h = l.find((t) => t.e.active) || l[0]; if (h) return h.e; } return null; };
  const memo = new Map();
  return (raw) => {
    const w = words(raw), key = w.join(" ");
    if (!key) return null;
    if (memo.has(key)) return memo.get(key);
    let found = null;
    if (w.length > 1) {
      const rs = new Set(w);
      const exact = E.filter((t) => t.full === key), sub = E.filter((t) => t.sets.some((s) => s.every((x) => rs.has(x))));
      const act = (l) => l.filter((t) => t.e.active);
      found = first(act(exact), act(sub), exact, sub);
    } else if (w[0].length >= 3) {
      const p = w[0];
      found = first(E.filter((t) => t.last.includes(p)),
        p.length >= 4 ? E.filter((t) => t.last.some((x) => x.length >= 4 && (x.startsWith(p) || p.startsWith(x)))) : []);
    }
    memo.set(key, found);
    return found;
  };
}

/* ------------------------------------------------------------------ */
/* دورهٔ گزارش                                                           */
/* ------------------------------------------------------------------ */
const ymKey = (y, m) => `${y}/${p2(m)}`;
const joinFa = (a) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join("، ") + " و " + a[a.length - 1]);

export function parsePeriod(sel = {}) {
  const years = [...new Set((sel.years || []).map(Number).filter((y) => y > 1300 && y < 1500))].sort((a, b) => a - b);
  if (!years.length) throw new HttpError("دست‌کم یک سال انتخاب کنید.");
  const set = new Set((sel.months || []).map(Number).filter((m) => m >= 1 && m <= 12));
  for (const s of (sel.seasons || []).map(Number).filter((x) => x >= 1 && x <= 4)) for (let m = (s - 1) * 3 + 1; m <= s * 3; m++) set.add(m);
  if (!set.size) for (let m = 1; m <= 12; m++) set.add(m);
  const months = [...set].sort((a, b) => a - b);
  const keys = new Set(), prior = new Set();
  for (const y of years) { for (const m of months) keys.add(ymKey(y, m)); for (let m = 1; m < months[0]; m++) prior.add(ymKey(y, m)); }
  const yearsFa = years.join(" و ");
  /* نام دوره: فصل‌های کامل با نام فصل، باقی ماه‌ها با نام ماه */
  let rest = months.slice(); const parts = [];
  if (months.length === 12) parts.push("سال");
  else for (let s = 1; s <= 4; s++) { const sm = [(s - 1) * 3 + 1, (s - 1) * 3 + 2, s * 3]; if (sm.every((m) => rest.includes(m))) { parts.push(`فصل ${SEASONS[s - 1]}`); rest = rest.filter((m) => !sm.includes(m)); } }
  if (months.length !== 12) rest.forEach((m) => parts.push(MONTHS[m - 1]));
  const label = `${joinFa(parts)} ${yearsFa}`;
  const nPrior = months[0] - 1;
  const priorLabel = nPrior === 0 ? `پیش از ${label}` : nPrior === 1 ? `فروردین ${yearsFa}` : `${COUNT_WORDS[nPrior]} ماه اول ${yearsFa}`;
  const lastYear = years[years.length - 1], lastMonth = months[months.length - 1];
  return { years, months, keys, prior, label, priorLabel, lastYear, lastMonth, shortLabel: parts.length === 1 && months.length === 3 ? SEASONS[Math.floor((months[0] - 1) / 3)] : joinFa(parts) };
}

/** روزهای کاری دوره تا امروز (جمعه و تعطیلات رسمی نه) — «میانگین در روز» برگهٔ مدیران */
export function workingDays(keys, holidays, todayJ) {
  let n = 0;
  for (const k of keys) {
    const [y, m] = k.split("/").map(Number);
    for (let d = 1; d <= jLen(y, m); d++) {
      const s = `${y}/${p2(m)}/${p2(d)}`;
      if (todayJ && s > todayJ) break;
      if (holidays.has(s)) continue;
      if (tehranParts(jStr2ms(s) + 12 * HOUR).dow === 5) continue;
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* خواندن داده                                                            */
/* ------------------------------------------------------------------ */
const OPEN_ORDER = ["در جریان", "بررسی مجدد", "تایید شده", "ثبت شده"];

async function loadExperts(env) {
  return (await env.DB.prepare("SELECT id, name, label, senior, senior_id, active FROM experts ORDER BY COALESCE(senior,0) DESC, name").all()).results || [];
}

/** درخواست‌ها با شمارش اقلام به تفکیک وضعیت و کارشناسِ اصلی — یک ردیف برای هر درخواست */
async function loadRequestRows(env, years) {
  const where = years && years.length ? `WHERE substr(r.date,1,4) IN (${years.map(() => "?").join(",")})` : "";
  const sql = `SELECT r.id, r.date, r.supply_unit, r.center, r.requester, r.party_type, r.party, r.req_type,
      COUNT(i.id) AS n, COALESCE(SUM(i.state='closed'),0) AS nc, COALESCE(SUM(i.state='stop'),0) AS ns, COALESCE(SUM(i.state='hold'),0) AS nh,
      GROUP_CONCAT(DISTINCT CASE WHEN i.state='open' THEN i.src_status END) AS ost, MAX(i.src_status) AS anyst, MAX(i.src_expert) AS sx,
      MAX(CASE WHEN i.note IS NOT NULL AND i.note<>'' THEN i.note END) AS note,
      (SELECT a.expert_id FROM assignments a WHERE a.request_id=r.id AND a.dispatched_at IS NOT NULL
        ORDER BY (SELECT COUNT(*) FROM items i2 WHERE i2.assignment_id=a.id) DESC, a.dispatched_at DESC LIMIT 1) AS eid
    FROM requests r LEFT JOIN items i ON i.request_id=r.id ${where} GROUP BY r.id ORDER BY r.date DESC, r.id DESC`;
  return (await env.DB.prepare(sql).bind(...(years || []).map(String)).all()).results || [];
}

/** وضعیت مؤثر درخواست — همان منطقِ فیلتر وضعیت میز مدیر، در سطح درخواست */
export function requestStatus(r) {
  const open = r.n - r.nc - r.ns - r.nh;
  if (open > 0) {
    if (r.eid) return "در جریان";
    const st = String(r.ost || "").split(",").map(T).filter(Boolean);
    return OPEN_ORDER.find((s) => st.includes(s)) || st[0] || "ثبت شده";
  }
  if (r.nh > 0) return "معلق";
  if (r.nc > 0) return "بسته شده";
  if (r.ns > 0) return "متوقف شده";
  return T(r.anyst) || "ثبت شده";
}
/** خرید شده | متوقف | باز — برای شمارش‌های گزارش سه‌ماهه */
export function purchaseClass(r) {
  if (!r.n) return "open";
  const open = r.n - r.nc - r.ns - r.nh;
  if (open === 0 && r.nh === 0 && r.nc > 0) return "bought";
  if (r.ns === r.n) return "stopped";
  return "open";
}

/* ------------------------------------------------------------------ */
/* سبک‌ها — رنگ‌های تم فایل نمونه به RGB                                   */
/* ------------------------------------------------------------------ */
const C = { green: "C5E0B4", green2: "E2F0D9", peach: "FBE5D6", peach2: "F8CBAD", yellow: "FFF2CC", blue: "DAE3F3", gold: "FFC000", red: "FF5050", grey: "D9D9D9", dgrey: "808080", navy: "002060", lime: "CCFF33" };
const ALL = { left: "thin", right: "thin", top: "thin", bottom: "thin" };
const st = (o = {}) => ({ border: ALL, ...o, font: { name: "B Nazanin", size: 11, ...(o.font || {}) } });
const AMOUNT = "#,##0";

/* ================================================================== */
/* ۱) وضعیت درخواست ها                                                   */
/* ================================================================== */
export const STATUS_COLUMNS = ["شماره", "تاریخ درخواست", "وضعیت", "واحد/رمز تامین", "مرکزدرخواست کننده", "درخواست کننده", "نوع طرف مقابل", "طرف مقابل", "توضیحات", "نوع درخواست خرید", "صادر کننده سند", "کارشناس خرید"];
export const STATUS_HIDDEN = [4, 5, 6, 7, 9, 10, 11];
export const DAILY_COLUMNS = ["ردیف", "شماره درخواست", "تاریخ درخواست", "نام پروژه/مکان تحویل", "کارشناس خرید", "تاریخ تحویل درخواست به کارشناس"];

export async function statusData(env, settings) {
  const [rows, experts] = await Promise.all([loadRequestRows(env, null), loadExperts(env)]);
  const short = shortNames(experts), match = expertMatcher(experts), byId = new Map(experts.map((e) => [e.id, e]));
  const projects = reportProjects(settings);
  const general = rows.map((r) => {
    const e = r.eid ? byId.get(r.eid) : match(r.sx);
    return [r.id, r.date, requestStatus(r), T(r.supply_unit), T(r.center), T(r.requester), T(r.party_type), T(r.party), T(r.note), T(r.req_type), "",
      e ? short.get(e.id) : T(r.sx)];
  });
  const disp = (await env.DB.prepare(`SELECT a.request_id, a.expert_id, a.dispatched_at, r.date, r.party, r.center FROM assignments a JOIN requests r ON r.id=a.request_id
    WHERE a.dispatched_at IS NOT NULL ORDER BY a.dispatched_at, a.id`).all()).results || [];
  const daily = disp.map((a, i) => { const p = projectOf(projects, a.party, a.center); return [i + 1, a.request_id, a.date, p ? p.name : T(a.center) || T(a.party), short.get(a.expert_id) || "", jStr(a.dispatched_at)]; });
  return { columns: STATUS_COLUMNS, hidden: STATUS_HIDDEN, general, dailyColumns: DAILY_COLUMNS, daily, generatedAt: Date.now() };
}

export function statusBook(data) {
  const book = new Book();
  /* برگهٔ ۱: درخواست کلی — جدول اکسل (TableStyleMedium10) با سه برش‌دهنده، قلم B Mitra ۱۴ */
  const g = book.add(new WSheet("درخواست کلی", { tabColor: "C55A11", zoom: 80, defaultRowHeight: 21 }));
  [8.66, 16.33, 10.33, 17.33, 20.44, 36.33, 16.33, 50.1, 10.44, 19.33, 26.44, 14.66].forEach((w, i) => g.width(i + 1, w, STATUS_HIDDEN.includes(i + 1)));
  const F = { name: "B Mitra", size: 14 };
  const hs = { font: { ...F, bold: true }, fill: C.grey, border: { right: "thin", left: "thin", bottom: "thin" } };
  const ds = { font: F, border: ALL };
  g.height(1, 21.6);
  STATUS_COLUMNS.forEach((h, i) => g.put(1, i + 1, h, hs));
  const rows = data.general.length ? data.general : [STATUS_COLUMNS.map(() => "")];
  rows.forEach((row, k) => row.forEach((v, i) => g.put(k + 2, i + 1, v === "" ? null : v, i === 7 || i === 8 ? { ...ds, h: "center" } : ds)));
  g.tables.push({ name: "Table1", r1: 1, c1: 1, r2: rows.length + 1, c2: 12, columns: STATUS_COLUMNS, style: "TableStyleMedium10" });
  g.slicers.push(
    { name: "وضعیت", table: "Table1", column: 3, from: { col: 27, row: 1 }, to: { col: 30, row: 9 } },
    { name: "طرف مقابل", table: "Table1", column: 8, from: { col: 21, row: 0 }, to: { col: 27, row: 30 } },
    { name: "کارشناس خرید", table: "Table1", column: 12, from: { col: 16, row: 0 }, to: { col: 19, row: 27 } },
  );

  /* برگهٔ ۲: گزارش روزانه — ردیف اول ۱٫۸ پوینت و ادغام، سرستون خاکستری با متن سرمه‌ای، فیلتر خودکار */
  const d = book.add(new WSheet("گزارش روزانه", { zoom: 107, freeze: { row: 2 } }));
  [9.1, 20.1, 15.3, 21.4, 14.8, 17.2, 17.2, 26.4].forEach((w, i) => d.width(i + 1, w));
  d.height(1, 1.8).merge(1, 1, 1, 6, null, {});
  d.height(2, 70.2);
  const dh = { font: { name: "B Nazanin", size: 14, bold: true, color: C.navy }, fill: C.dgrey, wrap: true, border: { left: "thin", right: "thin", bottom: "thin" } };
  [...DAILY_COLUMNS, ""].forEach((h, i) => d.put(2, i + 1, h || null, dh));
  const dd = { font: { name: "B Nazanin", size: 12 }, border: ALL };
  data.daily.forEach((row, k) => { d.height(k + 3, 30); row.forEach((v, i) => d.put(k + 3, i + 1, v, dd)); d.put(k + 3, 7, null, dd); });
  d.autoFilter = { r1: 2, c1: 2, r2: Math.max(3, data.daily.length + 2), c2: 6 };
  return book;
}

/* ================================================================== */
/* ۲) گزارش سه ماهه                                                        */
/* ================================================================== */
export const SEASON_SHEETS = [
  ["overview", "وضعیت کلی"],
  ["managers", "نمودار درصد مدیر پروژه ها"],
  ["projects", "درخواست خرید و اقلام پروژه ها"],
  ["experts", "کارشناس خرید"],
];

/** همهٔ شمارش‌های گزارش سه‌ماهه — مستقل از قالب اکسل تا آزمون‌پذیر باشد */
export async function seasonData(env, settings, sel) {
  const P = parsePeriod(sel);
  const [rows, experts, hol] = await Promise.all([
    loadRequestRows(env, P.years), loadExperts(env),
    env.DB.prepare("SELECT date_j FROM holidays").all().then((x) => new Set((x.results || []).map((h) => h.date_j))).catch(() => new Set()),
  ]);
  const yq = P.years.map(() => "?").join(",");
  /* سوابق خرید (worker/catalog.js:purchases) — تا بارگذاری نشده، جدول نیست و مبلغ‌ها خالی می‌ماند */
  const amounts = ((await env.DB.prepare(`SELECT substr(order_date,1,7) AS ym, expert, SUM(amount) AS amt FROM purchases WHERE substr(order_date,1,4) IN (${yq}) GROUP BY 1,2`)
    .bind(...P.years.map(String)).all().catch(() => ({ results: [] }))).results) || [];
  return computeSeason({ P, rows, experts, holidays: hol, amounts, settings, todayJ: jStr(Date.now()) });
}

/** محاسبهٔ خالص (بی دیتابیس) — reports.test.mjs همین را می‌آزماید */
export function computeSeason({ P, rows, experts, holidays, amounts, settings, todayJ }) {
  const projects = reportProjects(settings), match = expertMatcher(experts), byId = new Map(experts.map((e) => [e.id, e]));
  const groupOf = (e) => (!e ? null : e.senior ? e.id : e.senior_id && byId.get(e.senior_id) && byId.get(e.senior_id).senior ? e.senior_id : 0);
  const seniors = experts.filter((e) => e.senior && e.active);

  const inP = rows.filter((r) => P.keys.has(String(r.date).slice(0, 7)));
  const inPrior = rows.filter((r) => P.prior.has(String(r.date).slice(0, 7)));
  const enrich = (r) => { const e = r.eid ? byId.get(r.eid) : match(r.sx); return { ...r, cls: purchaseClass(r), expert: e || null, group: groupOf(e), project: projectOf(projects, r.party, r.center) }; };
  const R = inP.map(enrich);

  /* گروه‌ها: ارشدهای فعال به ترتیب تب کارشناسان؛ «بدون سرگروه» فقط اگر درخواست یا مبلغی داشته باشد */
  const groups = seniors.map((s) => ({ id: s.id, name: T(s.name) }));
  const amountNoGroup = amounts.some((a) => P.keys.has(a.ym) && T(a.expert) && Number(a.amt) && groupOf(match(a.expert)) === 0);
  if (R.some((r) => r.expert && r.group === 0) || amountNoGroup || !groups.length) groups.push({ id: 0, name: groups.length ? "بدون سرگروه" : "همه کارشناسان" });
  const gStat = groups.map((g) => {
    const mine = R.filter((r) => r.expert && (groups.length === 1 && g.id === 0 ? true : r.group === g.id));
    return { ...g, open: mine.filter((r) => r.cls === "open").length, bought: mine.filter((r) => r.cls === "bought").length, stopped: mine.filter((r) => r.cls === "stopped").length,
      total: mine.length, items: mine.reduce((a, r) => a + r.n, 0), amount: null };
  });
  const unassigned = R.filter((r) => !r.expert).length;

  /* مبلغ فاکتورها از «سوابق»: کل دوره، پیش از دوره، و سهم هر گروه اگر فایل ستون کارشناس داشت */
  const amtIn = (set) => amounts.filter((a) => set.has(a.ym)).reduce((s, a) => s + (Number(a.amt) || 0), 0);
  const hasExpertAmounts = amounts.some((a) => T(a.expert));
  if (hasExpertAmounts) {
    for (const a of amounts.filter((x) => P.keys.has(x.ym))) {
      const e = match(a.expert), gid = groupOf(e);
      const g = gStat.find((x) => (groups.length === 1 && x.id === 0) || x.id === gid);
      if (g) g.amount = (g.amount || 0) + (Number(a.amt) || 0);
    }
  }
  const totals = {
    period: { requests: R.length, items: R.reduce((a, r) => a + r.n, 0), amount: amtIn(P.keys) },
    prior: { requests: inPrior.length, items: inPrior.reduce((a, r) => a + r.n, 0), amount: amtIn(P.prior) },
  };

  /* پروژه‌ها */
  const projStat = (list) => ({ requests: list.length, bought: list.filter((r) => r.cls === "bought").length, items: list.reduce((a, r) => a + r.n, 0), itemsBought: list.reduce((a, r) => a + r.nc, 0) });
  const pRows = projects.map((p) => ({ ...p, ...projStat(R.filter((r) => r.project === p)) }));
  const other = projStat(R.filter((r) => !r.project));
  const unmatched = {};
  R.filter((r) => !r.project).forEach((r) => { const k = T(r.party) || T(r.center) || "—"; unmatched[k] = (unmatched[k] || 0) + 1; });

  /* روند ماهانهٔ سال آخر (ستون‌های سمت چپ برگهٔ پروژه‌ها) */
  const trendMonths = []; for (let m = 1; m <= P.lastMonth; m++) trendMonths.push(ymKey(P.lastYear, m));
  const yearRows = rows.filter((r) => String(r.date).slice(0, 4) === String(P.lastYear)).map((r) => ({ ym: String(r.date).slice(0, 7), n: r.n, project: projectOf(projects, r.party, r.center) }));
  const trend = projects.map((p) => ({ name: p.name, city: p.city, req: trendMonths.map((k) => yearRows.filter((r) => r.project === p && r.ym === k).length), items: trendMonths.map((k) => yearRows.filter((r) => r.project === p && r.ym === k).reduce((a, r) => a + r.n, 0)) }));

  /* مدیران پروژه */
  const order = reportManagers(settings).slice();
  for (const p of projects) if (!order.includes(managerLabelOf(p))) order.push(managerLabelOf(p));
  const mRows = order.map((label) => {
    const ps = pRows.filter((p) => managerLabelOf(p) === label);
    return { label, noSystem: ps.length > 0 && ps.every((p) => p.noSystem), requests: ps.reduce((a, p) => a + p.requests, 0), items: ps.reduce((a, p) => a + p.items, 0) };
  }).filter((m) => m.noSystem || pRows.some((p) => managerLabelOf(p) === m.label));

  /* کارشناسان: فعال‌ها همیشه، غیرفعال‌ها فقط اگر درخواستی داشتند؛ متوقف‌ها در ردیف «متوقف شده» */
  const eRows = experts.filter((e) => e.active || R.some((r) => r.expert === e)).map((e) => {
    const mine = R.filter((r) => r.expert === e && r.cls !== "stopped");
    return { id: e.id, name: T(e.name), requests: mine.length, bought: mine.filter((r) => r.cls === "bought").length, items: mine.reduce((a, r) => a + r.n, 0), itemsBought: mine.reduce((a, r) => a + r.nc, 0) };
  });
  const stoppedAll = R.filter((r) => r.cls === "stopped");
  const unassignedOpen = R.filter((r) => !r.expert && r.cls !== "stopped");
  const specials = [
    { name: "متوقف شده", requests: stoppedAll.length, bought: 0, items: stoppedAll.reduce((a, r) => a + r.n, 0), itemsBought: 0 },
    { name: "تامین از پروژه", requests: 0, bought: 0, items: 0, itemsBought: 0 },
    { name: "ارجاع نشده", requests: unassignedOpen.length, bought: 0, items: unassignedOpen.reduce((a, r) => a + r.n, 0), itemsBought: 0 },
  ];

  return { period: P, groups: gStat, unassigned, hasExpertAmounts, totals, projects: pRows, other, unmatched, trendMonths, trend, managers: mRows,
    workDays: Math.max(1, workingDays(P.keys, holidays || new Set(), todayJ)), experts: eRows, specials };
}

/* ------------------------------------------------------------------ */
/* برگه‌ها                                                                */
/* ------------------------------------------------------------------ */
function overviewSheet(D) {
  const P = D.period, G = D.groups, n = G.length, last = 2 + n;
  const sh = new WSheet("وضعیت کلی", { tabColor: "92D050", zoom: 112 });
  sh.width(1, 5).width(2, 38.6); G.forEach((_, i) => sh.width(3 + i, 20));
  if (last < 4) sh.width(4, 21.6);   /* جدول دوم همیشه دو ستون C و D دارد */
  const title = st({ fill: C.green, font: { size: 14, bold: true } }), hdr = st({ fill: C.green, font: { bold: true } });
  const num = st({ fill: C.green, font: { size: 12 } }), lab = st({ h: "right", font: { bold: true } });
  const val = (fill, fmt) => st({ fill, fmt, font: { bold: true } });
  const colRange = (r) => `${colName(3)}${r}:${colName(last)}${r}`;

  sh.height(1, 32.4).merge(1, 1, 1, last, `وضعیت کلی گروه ها در ${P.months.length === 3 ? "سه ماه " + (P.shortLabel || P.label) + " " + P.years.join(" و ") : P.label}`, title);
  sh.merge(2, 1, 3, 1, "ردیف", hdr).merge(2, 2, 3, 2, "وضعیت", hdr).merge(2, 3, 2, last, "سرگروه", hdr);
  G.forEach((g, i) => sh.put(3, 3 + i, g.name, hdr));
  const line = (r, no, label, fill, cells, fmt) => {
    sh.height(r, 18.6).put(r, 1, no, num).put(r, 2, label, lab);
    G.forEach((g, i) => { const c = cells(g, i); sh.put(r, 3 + i, c.v, val(fill, fmt), c.f); });
  };
  const L = (i) => colName(3 + i);
  line(4, 1, "اقدامی نشده", null, (g) => ({ v: g.open }));
  line(5, 2, "خرید شده  و ارسال شده", null, (g) => ({ v: g.bought }));
  line(6, 3, "تامین از پروژه", null, () => ({ v: 0 }));
  line(7, 4, "درخواست متوقف شده", null, (g) => ({ v: g.stopped }));
  line(8, 5, "درخواست های ارسال جهت تعمیر", null, () => ({ v: 0 }));
  sh.height(9, 18.6).put(9, 1, 6, num).put(9, 2, "درخواست های ارجاع نشده", lab).merge(9, 3, 9, last, D.unassigned, val(null));
  line(10, 7, "تعداد درخواست های خرید شده", C.peach, (g, i) => ({ v: g.bought, f: `${L(i)}5` }));
  line(11, 8, "تعداد کل درخواست ها", C.peach, (g, i) => ({ v: g.total, f: `SUM(${L(i)}4:${L(i)}8)` }));
  const reqSum = G.reduce((a, g) => a + g.total, 0), itemSum = G.reduce((a, g) => a + g.items, 0);
  sh.height(12, 18.6).put(12, 1, 9, num).put(12, 2, "جمع درخواست های خرید ", lab).merge(12, 3, 12, last, reqSum, val(C.peach), `SUM(${colRange(11)})`);
  line(13, 10, "درصد درخواست های خرید ", C.peach, (g, i) => ({ v: reqSum ? g.total / reqSum : 0, f: `IF($C$12=0,0,${L(i)}11/$C$12)` }), "0%");
  line(14, 13, "کل اقلام ", C.yellow, (g) => ({ v: g.items }));
  sh.height(15, 18.6).put(15, 1, 14, num).put(15, 2, "جمع اقلام ", lab).merge(15, 3, 15, last, itemSum, val(C.yellow), `SUM(${colRange(14)})`);
  line(16, 15, "درصد اقلام ", C.yellow, (g, i) => ({ v: itemSum ? g.items / itemSum : 0, f: `IF($C$15=0,0,${L(i)}14/$C$15)` }), "0%");
  const amtSum = D.hasExpertAmounts ? G.reduce((a, g) => a + (g.amount || 0), 0) : D.totals.period.amount;
  line(17, 18, "مبلغ دوره فاکتور های ثبت شده", C.blue, (g) => ({ v: D.hasExpertAmounts ? g.amount || 0 : "—" }), AMOUNT);
  sh.height(18, 18.6).put(18, 1, 19, num).put(18, 2, "جمع مبلغ دوره ایی فاکتورهای ثبت شده ", lab).merge(18, 3, 18, last, amtSum, val(C.blue, AMOUNT), D.hasExpertAmounts ? `SUM(${colRange(17)})` : undefined);
  line(19, 20, "درصد مبلغ  دوره  ایی فاکتور ها", C.blue, (g, i) => (D.hasExpertAmounts ? { v: amtSum ? (g.amount || 0) / amtSum : 0, f: `IF($C$18=0,0,${L(i)}17/$C$18)` } : { v: "—" }), "0%");

  /* گزارش کلی درخواست‌ها و اقلام: پیش از دوره در برابر دوره */
  const endName = `${MONTHS[P.lastMonth - 1]} ${P.lastYear}`;
  const t = D.totals, lc = Math.max(4, last);
  sh.merge(21, 1, 21, lc, "گزارش کلی درخواست ها و اقلام ", st({ fill: C.green, font: { size: 12, bold: true } }));
  const h12 = st({ fill: C.green, font: { size: 12, bold: true } });
  sh.put(22, 1, "ردیف", h12).put(22, 2, "وضعیت", h12).put(22, 3, P.priorLabel, h12).put(22, 4, P.label, h12);
  const v2 = (fmt) => st({ fill: C.peach, fmt, font: { bold: true } });
  const n12 = st({ fill: C.green, font: { size: 12, bold: true } });
  sh.put(23, 1, 1, n12).put(23, 2, "جمع کل درخواست های خرید ماه", lab).put(23, 3, t.prior.requests, v2()).put(23, 4, t.period.requests, v2());
  sh.put(24, 1, 2, n12).put(24, 2, `جمع درخواست ها تا کنون(از ابتدای سال تا ${endName})`, lab).merge(24, 3, 24, 4, t.prior.requests + t.period.requests, v2(), "SUM(C23:D23)");
  sh.put(25, 1, 3, n12).put(25, 2, "تعداد اقلام", lab).put(25, 3, t.prior.items, v2()).put(25, 4, t.period.items, v2());
  sh.put(26, 1, 4, n12).put(26, 2, `جمع اقلام تا کنون(از ابتدای سال تا ${endName})`, lab).merge(26, 3, 26, 4, t.prior.items + t.period.items, v2(), "C25+D25");
  sh.put(27, 1, 5, n12).put(27, 2, "جمع مبلغ دوره ایی فاکتورهای ثبت شده ", lab).put(27, 3, t.prior.amount, v2(AMOUNT)).put(27, 4, t.period.amount, v2(AMOUNT));
  sh.merge(28, 1, 28, 2, `جمع مبلغ فاکتور های ثبت شده سال ${P.lastYear}`, st({ fill: C.gold, font: { bold: true } })).merge(28, 3, 28, 4, t.prior.amount + t.period.amount, st({ fill: C.gold, fmt: AMOUNT, font: { bold: true } }), "C27+D27");

  /* دادهٔ کمکی نمودار «آمار تجمعی» — همان خانه‌های B36:D37 فایل نمونه */
  const plain = st({});
  sh.put(36, 3, "تعداد درخواست", plain).put(36, 4, "تعداد اقلام", plain);
  sh.put(37, 2, `تعداد درخواست و اقلام ${P.lastYear} `, plain).put(37, 3, t.prior.requests + t.period.requests, plain, "C24").put(37, 4, t.prior.items + t.period.items, plain, "C26");

  const N = sh.name, cats = { ref: absRef(N, 3, 3, 3, last), values: G.map((g) => g.name) }, x0 = last + 1;
  sh.charts.push(
    { type: "bar3d", title: `گزارش کلی درخواست های هر گروه ${P.label}`, from: { col: x0, row: 1 }, to: { col: x0 + 8, row: 19 }, cats, labels: true,
      series: [{ name: "تعداد کل درخواست", ref: absRef(N, 11, 3, 11, last), values: G.map((g) => g.total), color: "2F5597" }, { name: "تعداد درخواست های خرید شده", ref: absRef(N, 10, 3, 10, last), values: G.map((g) => g.bought), color: "FF6600" }] },
    { type: "bar", title: `مقایسه تعداد درخواست و اقلام ${P.priorLabel} با ${P.label}`, from: { col: x0 + 9, row: 1 }, to: { col: x0 + 17, row: 19 }, labels: true,
      cats: { ref: absRef(N, 22, 3, 22, 4), values: [P.priorLabel, P.label] },
      series: [{ name: "تعداد درخواست", ref: absRef(N, 23, 3, 23, 4), values: [t.prior.requests, t.period.requests], color: "2F5597" }, { name: "تعداد اقلام", ref: absRef(N, 25, 3, 25, 4), values: [t.prior.items, t.period.items], color: "FF6600" }] },
    { type: "bar3d", title: "مبلغ دوره ای فاکتورهای ثبت شده", from: { col: x0, row: 20 }, to: { col: x0 + 8, row: 38 }, cats, labels: true, fmt: AMOUNT, legend: null,
      series: [{ name: "مبلغ دوره فاکتور های ثبت شده", ref: absRef(N, 17, 3, 17, last), values: G.map((g) => (D.hasExpertAmounts ? g.amount || 0 : null)), color: "00B050" }] },
    { type: "bar3d", title: `آمار تجمعی سال ${P.lastYear}`, from: { col: x0 + 9, row: 20 }, to: { col: x0 + 17, row: 38 }, labels: true, legend: null,
      cats: { ref: absRef(N, 36, 3, 36, 4), values: ["تعداد درخواست", "تعداد اقلام"] },
      series: [{ name: `تعداد درخواست و اقلام ${P.lastYear} `, nameRef: absRef(N, 37, 2), ref: absRef(N, 37, 3, 37, 4), values: [t.prior.requests + t.period.requests, t.prior.items + t.period.items], color: "4472C4" }] },
    { type: "bar3d", title: `مبلغ فاکتورهای ثبت شده ${P.priorLabel} و ${P.label}`, from: { col: x0, row: 39 }, to: { col: x0 + 8, row: 57 }, labels: true, fmt: AMOUNT, legend: null,
      cats: { ref: absRef(N, 22, 3, 22, 4), values: [P.priorLabel, P.label] },
      series: [{ name: "مبلغ فاکتورها", ref: absRef(N, 27, 3, 27, 4), values: [t.prior.amount, t.period.amount], color: "70AD47" }] },
  );
  if (!D.hasExpertAmounts) sh.notes.push("فایل سوابق ستون «کارشناس خرید» ندارد؛ مبلغ فاکتورها فقط به‌صورت جمع کل آمده است، نه به تفکیک گروه.");
  return sh;
}

function managersSheet(D) {
  const P = D.period, M = D.managers;
  const sh = new WSheet("نمودار درصد مدیر پروژه ها", { tabColor: "92D050", zoom: 77 });
  [5.9, 20.4, 9, 11.3, 15.3, 11.7, 16.1].forEach((w, i) => sh.width(i + 1, w));
  const F12 = { size: 12 }, hdr = st({ fill: C.green, font: { ...F12, bold: true } }), cell = (o = {}) => st({ ...o, font: F12 });
  sh.height(3, 24.75).merge(3, 1, 3, 7, " وضعیت اقلام و درخواست ها به تفکیک مدیران پروژه", hdr);
  sh.height(4, 20.4).height(5, 20.4);
  sh.merge(4, 1, 5, 1, "ردیف ", hdr).merge(4, 2, 5, 2, "مدیر پروژه", hdr).merge(4, 3, 4, 5, "درخواست ", hdr).merge(4, 6, 4, 7, "اقلام ", hdr);
  ["تعداد", "درصد", "میانگین در روزه", "تعداد", "درصد"].forEach((h, i) => sh.put(5, 3 + i, h, hdr));
  const first = 6, lastR = first + M.length - 1, tot = lastR + 1;
  const reqT = M.reduce((a, m) => a + (m.noSystem ? 0 : m.requests), 0), itT = M.reduce((a, m) => a + (m.noSystem ? 0 : m.items), 0);
  M.forEach((m, k) => {
    const r = first + k, red = m.noSystem ? C.red : null;
    sh.height(r, 18.6).put(r, 1, k + 1, cell({ fill: red })).put(r, 2, m.label, cell({ fill: red }));
    if (m.noSystem) { for (let c = 3; c <= 7; c++) sh.put(r, c, "-", cell({ fill: red })); return; }
    sh.put(r, 3, m.requests, cell()).put(r, 4, reqT ? m.requests / reqT : 0, cell({ fmt: "0%" }), `IF($C$${tot}=0,0,C${r}/$C$${tot})`)
      .put(r, 5, m.requests / D.workDays, cell({ fmt: "0.0" }), `C${r}/${D.workDays}`)
      .put(r, 6, m.items, cell()).put(r, 7, itT ? m.items / itT : 0, cell({ fmt: "0%" }), `IF($F$${tot}=0,0,F${r}/$F$${tot})`);
  });
  const ts = (fmt) => st({ fill: C.peach, fmt, font: { ...F12, bold: true } });
  sh.height(tot, 18.6).merge(tot, 1, tot, 2, "جمع", ts()).put(tot, 3, reqT, ts(), `SUM(C${first}:C${lastR})`).put(tot, 4, reqT ? 1 : 0, ts("0%"), `SUM(D${first}:D${lastR})`)
    .put(tot, 5, reqT / D.workDays, ts("0.0"), `SUM(E${first}:E${lastR})`).put(tot, 6, itT, ts(), `SUM(F${first}:F${lastR})`).put(tot, 7, itT ? 1 : 0, ts("0%"), `SUM(G${first}:G${lastR})`);
  sh.put(tot + 1, 2, `میانگین در روز = تعداد ÷ ${D.workDays} روز کاری ${P.label}`, st({ border: {}, h: "right", font: { size: 10, color: "595959" } }));
  const N = sh.name;
  sh.charts.push({ type: "pie3d", title: "گزارش اقلام برای مدیران پروژه ", from: { col: 8, row: 3 }, to: { col: 16, row: 24 }, labels: true, fmt: "0%", legend: "r",
    cats: { ref: absRef(N, first, 2, lastR, 2), values: M.map((m) => m.label) },
    series: [{ name: "اقلام", ref: absRef(N, first, 7, lastR, 7), values: M.map((m) => (m.noSystem || !itT ? null : m.items / itT)) }] });
  return sh;
}

function projectsSheet(D) {
  const P = D.period, lbl = P.shortLabel || P.label;
  const sh = new WSheet("درخواست خرید و اقلام پروژه ها", { tabColor: "92D050", zoom: 78 });
  [4.9, 16, 11.3, 15.2, 14.6, 15.2, 12.1, 10.9, 10.9, 11.7, 11.1, 9.1, 9.1, 12.4, 8.9, 4.1, 21.3, 13.6].forEach((w, i) => sh.width(i + 1, w, [7, 8, 12].includes(i + 1)));
  const F10 = { size: 10 }, c10 = (o = {}) => st({ ...o, font: { ...F10, ...(o.font || {}) } });
  const hdr = c10({ fill: C.green, wrap: true, font: { bold: true } });
  sh.height(1, 18).merge(1, 1, 1, 13, `وضعیت درخواست های خرید و اقلام پروژه ها ${P.label}`, st({ fill: C.green, font: { size: 14, bold: true } }));
  sh.height(2, 32);
  ["ردیف", "عنوان پروژه", "شهر/کشور", "مدیر پروژه", `تعداد درخواست های ${lbl}`, `تعداد درخواست های خرید شده ${lbl}`, "درصد سهم درخواست ها", "درصد انجام کار(درخواست)", "درصد انجام کار",
    `تعداد اقلام ${lbl}`, `کل اقلام خرید شده ${lbl}`, "درصد انجام کار(اقلام)", "درصد انجام کار"].forEach((h, i) => sh.put(2, i + 1, h, hdr));

  /* ردیف‌ها: هر بلوک پروژه + «جمع کل» بلوک؛ پروژه‌های بی کلیدواژهٔ منطبق در «سایر» */
  const blocks = [];
  for (const p of D.projects) { let b = blocks.find((x) => x.block === p.block); if (!b) blocks.push(b = { block: p.block, rows: [] }); b.rows.push(p); }
  if (D.other.requests) blocks.push({ block: "other", rows: [{ name: "سایر (بدون پروژهٔ تعریف‌شده)", city: "", manager: "", ...D.other }] });
  let r = 3, no = 1; const totalRows = [], projRows = [];
  const GRAND = r + D.projects.length + (D.other.requests ? 1 : 0) + blocks.length; /* ردیف «جمع» نهایی */
  for (const b of blocks) {
    const r1 = r;
    b.rows.forEach((p) => {
      const red = p.noSystem ? C.red : null, dash = (v) => (p.noSystem && !v ? "-" : v);
      sh.height(r, 16.8).put(r, 1, no++, c10({ fill: C.green })).put(r, 2, p.name, c10({ fill: red }));
      sh.put(r, 5, dash(p.requests), c10({ fill: red })).put(r, 6, p.bought, c10({ fill: red }))
        .put(r, 7, D.totals.period.requests ? p.requests / D.totals.period.requests : 0, c10({ fill: red, fmt: "0%" }), `IF($E$${GRAND}=0,0,N(E${r})/$E$${GRAND})`)
        .put(r, 8, p.requests ? p.bought / p.requests : 0, c10({ fill: red, fmt: "0%" }), `IF(N(E${r})=0,0,F${r}/E${r})`)
        .put(r, 9, p.requests ? p.bought / p.requests : 0, c10({ fill: red || C.peach, fmt: "0%" }), `IF(N(E${r})=0,0,F${r}/E${r})`)
        .put(r, 10, dash(p.items), c10({ fill: red })).put(r, 11, p.itemsBought, c10({ fill: red }))
        .put(r, 12, p.items ? p.itemsBought / p.items : 0, c10({ fill: red, fmt: "0%" }), `IF(N(J${r})=0,0,K${r}/J${r})`)
        .put(r, 13, p.items ? p.itemsBought / p.items : 0, c10({ fill: red || C.peach, fmt: "0%" }), `IF(N(J${r})=0,0,K${r}/J${r})`);
      projRows.push({ r, p });
      r++;
    });
    /* شهر و مدیرِ پشت‌سرهمِ یکسان در بلوک ادغام می‌شوند — همان چینش فایل نمونه */
    for (const [col, key, bold] of [[3, "city", true], [4, "manager", false]]) {
      let s = r1;
      for (let k = r1; k <= r; k++) {
        const cur = k < r ? T(b.rows[k - r1][key]) : null, prev = T(b.rows[s - r1][key]);
        if (k === r || cur !== prev) {
          const fill = b.rows[s - r1].noSystem && s === k - 1 ? C.red : null;
          if (k - 1 > s) sh.merge(s, col, k - 1, col, prev || null, c10({ fill, font: { bold } })); else sh.put(s, col, prev || null, c10({ fill, font: { bold } }));
          s = k;
        }
      }
    }
    const ts = (o = {}) => c10({ fill: C.peach, ...o });
    sh.height(r, 16.8).put(r, 1, no++, c10({ fill: C.green })).merge(r, 2, r, 4, "جمع کل", ts());
    const sum = (col) => `SUM(${col}${r1}:${col}${r - 1})`, vals = b.rows.reduce((a, p) => ({ q: a.q + p.requests, b: a.b + p.bought, i: a.i + p.items, k: a.k + p.itemsBought }), { q: 0, b: 0, i: 0, k: 0 });
    sh.put(r, 5, vals.q, ts(), sum("E")).put(r, 6, vals.b, ts(), sum("F")).put(r, 7, null, ts()).put(r, 8, null, ts())
      .put(r, 9, vals.q ? vals.b / vals.q : 0, ts({ fill: C.peach2, fmt: "0%" }), `IF(E${r}=0,0,F${r}/E${r})`)
      .put(r, 10, vals.i, ts(), sum("J")).put(r, 11, vals.k, ts(), sum("K")).put(r, 12, null, ts())
      .put(r, 13, vals.i ? vals.k / vals.i : 0, ts({ fill: C.peach2, fmt: "0%" }), `IF(J${r}=0,0,K${r}/J${r})`);
    totalRows.push({ r, vals });
    r++;
  }
  const g = totalRows.reduce((a, t) => ({ q: a.q + t.vals.q, b: a.b + t.vals.b, i: a.i + t.vals.i, k: a.k + t.vals.k }), { q: 0, b: 0, i: 0, k: 0 });
  const gs = (o = {}) => c10({ fill: C.green, font: { bold: true }, ...o }), plus = (col) => totalRows.map((t) => `${col}${t.r}`).join("+");
  sh.height(r, 18).merge(r, 1, r, 4, "جمع ", gs()).put(r, 5, g.q, gs(), plus("E")).put(r, 6, g.b, gs(), plus("F")).put(r, 7, g.q ? 1 : 0, gs({ fmt: "0%" }), `SUM(G3:G${r - 1})`).put(r, 8, null, gs())
    .put(r, 9, g.q ? g.b / g.q : 0, gs({ fmt: "0%" }), `IF(E${r}=0,0,F${r}/E${r})`).put(r, 10, g.i, gs(), plus("J")).put(r, 11, g.k, gs(), plus("K")).put(r, 12, null, gs())
    .put(r, 13, g.i ? g.k / g.i : 0, gs({ fmt: "0%" }), `IF(J${r}=0,0,K${r}/J${r})`);
  const grand = r;
  const notes = D.projects.filter((p) => p.noSystem && p.note).map((p) => p.note);
  if (notes.length) sh.merge(grand + 3, 2, grand + 5, 12, notes.join("\n"), st({ border: {}, wrap: true, font: { bold: true, size: 11 } }));

  /* روند ماهانهٔ سال — ستون Q به بعد */
  const Q = 17, months = D.trendMonths, nm = months.length;
  const th = (size = 11) => st({ fill: C.green2, wrap: true, font: { size, bold: true } });
  sh.put(2, Q, "عنوان پروژه", th(14)).put(2, Q + 1, "شهر/کشور", th(14));
  months.forEach((k, i) => { sh.width(Q + 2 + i, 12).put(2, Q + 2 + i, `درخواست ها ${MONTHS[+k.slice(5) - 1]} ماه`, th()); });
  const cR = Q + 2 + nm; sh.width(cR, 16).put(2, cR, "درخواست ها تا کنون", th());
  months.forEach((k, i) => { sh.width(cR + 1 + i, 12).put(2, cR + 1 + i, `اقلام ${MONTHS[+k.slice(5) - 1]} ماه`, th()); });
  const cI = cR + 1 + nm; sh.width(cI, 18).put(2, cI, "کل اقلام تا کنون", th());
  const tc = st({ font: { size: 11 } });
  D.trend.forEach((t, k) => {
    const rr = 3 + k;
    sh.put(rr, Q, t.name, tc).put(rr, Q + 1, t.city || null, tc);
    t.req.forEach((v, i) => sh.put(rr, Q + 2 + i, v, tc));
    sh.put(rr, cR, t.req.reduce((a, b) => a + b, 0), st({ fill: C.lime }), `SUM(${colName(Q + 2)}${rr}:${colName(Q + 1 + nm)}${rr})`);
    t.items.forEach((v, i) => sh.put(rr, cR + 1 + i, v, tc));
    sh.put(rr, cI, t.items.reduce((a, b) => a + b, 0), st({ fill: C.lime }), `SUM(${colName(cR + 1)}${rr}:${colName(cR + nm)}${rr})`);
  });
  const tr = 3 + D.trend.length, tb = st({ fill: C.peach, font: { bold: true } });
  sh.put(tr, Q, "جمع", tb).put(tr, Q + 1, null, tb);
  for (let c = Q + 2; c <= cI; c++) sh.put(tr, c, D.trend.reduce((a, t) => a + (c < cR ? t.req[c - Q - 2] : c === cR ? t.req.reduce((x, y) => x + y, 0) : c < cI ? t.items[c - cR - 1] : t.items.reduce((x, y) => x + y, 0)), 0), tb, `SUM(${colName(c)}3:${colName(c)}${tr - 1})`);

  /* دادهٔ کمکی دو نمودار درصد — مثل E66:F94 فایل نمونه، زیر جدول اصلی */
  const h1 = grand + 8, h2 = h1 + projRows.length + 3, plain = st({});
  sh.put(h1, 5, "پروژه", plain).put(h1, 6, "خرید انجام شده", plain).put(h2, 5, "پروژه", plain).put(h2, 6, "اقلام خرید شده", plain);
  projRows.forEach(({ r: pr, p }, k) => {
    sh.put(h1 + 1 + k, 5, p.name, plain, `B${pr}`).put(h1 + 1 + k, 6, p.requests ? p.bought / p.requests : 0, st({ fmt: "0%" }), `I${pr}`);
    sh.put(h2 + 1 + k, 5, p.name, plain, `B${pr}`).put(h2 + 1 + k, 6, p.items ? p.itemsBought / p.items : 0, st({ fmt: "0%" }), `M${pr}`);
  });
  const N = sh.name, names = projRows.map((x) => x.p.name), n = projRows.length;
  sh.charts.push(
    { type: "bar", title: `گزارش درصد درخواست خرید انجام شده به تفکیک پروژه ${P.label}`, from: { col: Q - 1, row: tr + 2 }, to: { col: Q + 17, row: tr + 22 }, labels: true, fmt: "0%", legend: null,
      cats: { ref: absRef(N, h1 + 1, 5, h1 + n, 5), values: names }, series: [{ name: "خرید انجام شده", nameRef: absRef(N, h1, 6), ref: absRef(N, h1 + 1, 6, h1 + n, 6), values: projRows.map(({ p }) => (p.requests ? p.bought / p.requests : 0)), color: "FF6600" }] },
    { type: "bar", title: `گزارش درصد اقلام خرید شده به تفکیک پروژه ${P.label}`, from: { col: Q - 1, row: tr + 23 }, to: { col: Q + 17, row: tr + 43 }, labels: true, fmt: "0%", legend: null,
      cats: { ref: absRef(N, h2 + 1, 5, h2 + n, 5), values: names }, series: [{ name: "اقلام خرید شده", nameRef: absRef(N, h2, 6), ref: absRef(N, h2 + 1, 6, h2 + n, 6), values: projRows.map(({ p }) => (p.items ? p.itemsBought / p.items : 0)), color: "00B050" }] },
  );
  if (Object.keys(D.unmatched).length) sh.notes.push(`${Object.values(D.unmatched).reduce((a, b) => a + b, 0)} درخواست با هیچ پروژه‌ای تطبیق نخورد و در ردیف «سایر» آمد: ${Object.entries(D.unmatched).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join("، ")}`);
  return sh;
}

function expertsSheet(D) {
  const P = D.period;
  const sh = new WSheet("کارشناس خرید", { tabColor: "92D050", zoom: 70 });
  [6.3, 17.3, 20.9, 22.3, 16, 12.3, 18, 16].forEach((w, i) => sh.width(i + 1, w));
  sh.height(1, 37.2).merge(1, 1, 1, 8, `وضعیت  درخواست و اقلام خرید کارشناس های واحد پشتیبانی  ${P.label}  `, st({ fill: C.green, font: { size: 14, bold: true } }));
  const hdr = st({ fill: C.green, font: { size: 12, bold: true } });
  sh.height(2, 20.4);
  ["ردیف", "کارشناس خرید", "کل درخواست های خرید", "درخواست های خرید شده", "درصد انجام کار", "کل اقلام", "کل اقلام خرید شده", "درصد انجام کار"].forEach((h, i) => sh.put(2, i + 1, h, hdr));
  const list = [...D.experts, ...D.specials];
  const num = st({ fill: C.green }), name = st({ font: { size: 12 } }), v = (fmt) => st({ fmt });
  list.forEach((e, k) => {
    const r = 3 + k;
    sh.height(r, 18.6).put(r, 1, k + 1, num).put(r, 2, e.name, name).put(r, 3, e.requests, v()).put(r, 4, e.bought, v())
      .put(r, 5, e.requests ? e.bought / e.requests : 0, v("0%"), `IF(C${r}=0,0,D${r}/C${r})`)
      .put(r, 6, e.items, v()).put(r, 7, e.itemsBought, v()).put(r, 8, e.items ? e.itemsBought / e.items : 0, v("0%"), `IF(F${r}=0,0,G${r}/F${r})`);
  });
  const last = 2 + list.length, tot = last + 1, ts = (sz) => st({ fill: C.peach, font: { bold: true, size: sz || 11 } });
  const sum = (key) => list.reduce((a, e) => a + e[key], 0);
  sh.height(tot, 18.6).merge(tot, 1, tot, 2, "جمع", ts()).put(tot, 3, sum("requests"), ts(12), `SUM(C3:C${last})`).put(tot, 4, sum("bought"), ts(12), `SUM(D3:D${last})`).put(tot, 5, null, ts())
    .put(tot, 6, sum("items"), ts(12), `SUM(F3:F${last})`).put(tot, 7, sum("itemsBought"), ts(12), `SUM(G3:G${last})`).put(tot, 8, null, ts());
  const N = sh.name, lastE = 2 + D.experts.length;
  sh.charts.push(
    { type: "bar3d", title: `گزارش درصد اقلام خرید شده به کارشناسان ${P.label}`, from: { col: 9, row: 1 }, to: { col: 30, row: 28 }, labels: true, fmt: "0%", dataTable: true,
      cats: { ref: absRef(N, 3, 2, last, 2), values: list.map((e) => e.name) },
      series: [{ name: "درخواست های خرید شده", ref: absRef(N, 3, 5, last, 5), values: list.map((e) => (e.requests ? e.bought / e.requests : 0)), color: "FF6600" },
        { name: "اقلام خرید شده", ref: absRef(N, 3, 8, last, 8), values: list.map((e) => (e.items ? e.itemsBought / e.items : 0)), color: "00B050" }] },
    { type: "bar3d", title: `گزارش درخواست خرید و اقلام ارجاع شده به کارشناسان ${P.label}`, from: { col: 9, row: 30 }, to: { col: 30, row: 58 }, labels: true, dataTable: true,
      cats: { ref: absRef(N, 3, 2, lastE, 2), values: D.experts.map((e) => e.name) },
      series: [{ name: "درخواست های خرید شده", ref: absRef(N, 3, 4, lastE, 4), values: D.experts.map((e) => e.bought), color: "2F5597" },
        { name: "اقلام خرید شده", ref: absRef(N, 3, 7, lastE, 7), values: D.experts.map((e) => e.itemsBought), color: "FF6600" }] },
  );
  return sh;
}

const BUILDERS = { overview: overviewSheet, managers: managersSheet, projects: projectsSheet, experts: expertsSheet };

export function seasonBook(D, sheetKeys) {
  const keys = SEASON_SHEETS.map((s) => s[0]).filter((k) => !sheetKeys || !sheetKeys.length || sheetKeys.includes(k));
  if (!keys.length) throw new HttpError("دست‌کم یک برگه را تیک بزنید.");
  const book = new Book();
  for (const k of keys) { const sh = book.add(BUILDERS[k](D)); sh.key = k; }
  return book;
}

/** پیش‌نمایش پنل: HTML هر برگه + نمودارها به SVG، از همان Book که فایل را می‌سازد */
export function bookPreview(book, { maxRows = 400 } = {}) {
  return book.sheets.map((sh) => ({ key: sh.key || sh.name, name: sh.name, rows: sh.maxRow, html: sheetHtml(sh, { maxRows }), charts: sh.charts.map((c) => ({ title: c.title, svg: chartSvg(c) })), notes: sh.notes }));
}

export async function bookFile(book) { return buildBook(book); }
export { BOOK_CSS };

/** داده‌های فرم گزارش: سال‌های موجود، پروژه‌ها، مدیران و «طرف مقابل»هایی که پروژه ندارند */
export async function reportMeta(env, settings) {
  const years = new Set();
  const ry = (await env.DB.prepare("SELECT DISTINCT substr(date,1,4) AS y FROM requests WHERE date IS NOT NULL").all()).results || [];
  ry.forEach((x) => { if (/^\d{4}$/.test(x.y)) years.add(+x.y); });
  /* سال‌های سوابق از آمار آخرین بارگذاری (بازهٔ ym)، نه با پیمایش ۷۱ هزار ردیف در هر بار باز شدن تب */
  try {
    const imp = await env.DB.prepare("SELECT stats_json FROM hist_imports WHERE state='ready' ORDER BY id DESC LIMIT 1").first();
    const s = imp ? JSON.parse(imp.stats_json || "{}") : {};
    const yOf = (ym) => Math.floor((ym - 1) / 12);
    if (s.minYm && s.maxYm) for (let y = yOf(s.minYm); y <= yOf(s.maxYm); y++) years.add(y);
  } catch (_) { /* سوابق بارگذاری نشده */ }
  const projects = reportProjects(settings);
  const parties = (await env.DB.prepare("SELECT party, center, COUNT(*) AS n FROM requests GROUP BY party, center ORDER BY n DESC LIMIT 400").all()).results || [];
  const unmatched = parties.filter((p) => !projectOf(projects, p.party, p.center)).slice(0, 60);
  const today = tehranParts(Date.now());
  return { years: [...years].sort((a, b) => b - a), today: { year: today.jy, month: today.jm }, projects, managers: reportManagers(settings), unmatched,
    sheets: SEASON_SHEETS.map(([key, name]) => ({ key, name })), defaults: { projects: DEFAULT_PROJECTS, managers: DEFAULT_MANAGERS } };
}
