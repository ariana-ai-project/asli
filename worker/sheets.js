/**
 * جدول مقایسه استعلام بها (فرم TSA-PS-FO-02) — عیناً مثل فایل نمونهٔ مدیر
 *
 * چیدمان از روی «نمونه کمیسیون.xlsx» برداشته شده: همان ستون‌ها و ردیف‌ها، همان
 * عرض و ارتفاع، قلم B Nazanin (۷۲ و ۴۸)، کادرهای نازک و ضخیمِ هر خانه، سلول‌های
 * ادغام‌شده، بلوک‌های خاکستری/سفیدِ یک‌درمیانِ تأمین‌کنندگان، لوگو، و چاپ A4 افقی
 * در یک صفحه. برگه چپ‌به‌راست است: ردیف و شرح اقلام سمت راست، و تأمین‌کنندهٔ اول
 * نزدیک‌ترین بلوک به اقلام.
 *
 * یک مدل (Sheet) هر دو خروجی را می‌سازد: فایل xlsx برای دانلود و تلگرام، و HTML
 * برای پیش‌نمایش و چاپ پنل — پس آنچه دیده و چاپ می‌شود همان فایل است.
 *
 * فرم هشت بلوک تأمین‌کننده و دوازده ردیف قلم دارد؛ اگر بیشتر لازم شد، بلوک و ردیف
 * با همان قالب اضافه می‌شود و چاپ همچنان در یک صفحه جا می‌گیرد (fitToPage).
 * «شماره بازنگری، تاریخ تنظیم سند» شناسنامهٔ خودِ فرم‌اند و ثابت می‌مانند؛ عددِ آخرِ
 * «کد» (TSA-PS-FO-n) شمارهٔ ترتیبی جدول‌های کمیسیونِ ساخته‌شده است (تصمیم مدیر).
 */
import { Sheet, buildXlsx, sheetHtml, cellRef } from "./xlsx.js";
import { COMMISSION_LOGO_PNG, COMMISSION_LOGO_URL } from "./logo.js";

/* کد فرم: TSA-PS-FO-n — n شمارهٔ ترتیبی جدول‌های کمیسیونِ ساخته‌شده (bundle.js:markCommission) */
const formCode = (d) => `TSA-PS-FO-${d.commission_no || (d.assignment && d.assignment.commission_no) || "—"}`;

/* همهٔ اندازه‌ها نصفِ فایل نمونه‌اند (قلم ۳۶ و ۲۴ به‌جای ۷۲ و ۴۸، عرض و ارتفاع هم نصف):
   تناسب و ظاهرِ چاپ دقیقاً همان است، ولی «جا دادن در یک صفحه» به بزرگ‌نمایی ~۲۰٪ می‌رسد.
   فایل نمونه با ۷۲ پوینت درست روی کمینهٔ ۱۰٪ اکسل چاپ می‌شد و هر ستونِ پهن‌تر یا
   بلوک اضافه، چاپ را چندصفحه‌ای می‌کرد. */
const SCALE = 0.5;
const FONT = "B Nazanin";
const GRAY = "F2F2F2";        /* همان تهِ رنگِ «سفید، ۵٪ تیره‌تر» فایل نمونه */
const t = "thin", M = "medium";
const F72 = { name: FONT, size: 72 * SCALE, bold: true };
const F72n = { name: FONT, size: 72 * SCALE };
const F48 = { name: FONT, size: 48 * SCALE };
const F48b = { name: FONT, size: 48 * SCALE, bold: true };
const NUM = 3;                /* #,##0 */
const box = (left, right, top, bottom) => ({ left, right, top, bottom });

/* عرض ستون‌های فایل نمونه (A..AC) و ارتفاع ردیف‌هایش */
const TW = [0, 19, 29.5546875, 34, 35.6640625, 45.5546875, 56.6640625, 35.6640625, 48.5546875, 49.109375, 35.6640625, 35.6640625, 54,
  35.6640625, 51.109375, 54.44140625, 35.6640625, 88.6640625, 75.44140625, 35.6640625, 82.88671875, 56.109375, 37.44140625, 88.109375,
  76.77734375, 52.33203125, 42, 35.6640625, 82.6640625, 26.44140625];
const HEAD_H = [0, 173.4, 100.2, 173.4, 120, 226.95, 213.6].map((h) => h * SCALE);
const ROW_H = 173.4 * SCALE, FIRST_ITEM_H = 212.25 * SCALE, DTIME_H = 248.25 * SCALE;
const W = (w) => +(w * SCALE).toFixed(4);

/** استعلام‌های تأییدنهایی به تفکیک تأمین‌کننده، و فقط قلم‌هایی که دست‌کم یکی‌شان قیمت داده (CM-05) */
export function commissionData({ items, quotes }) {
  const groups = [];
  for (const q of (quotes || []).filter((x) => x.final && x.saved)) {
    let g = groups.find((x) => x.name === q.supplier_name);
    if (!g) { g = { name: q.supplier_name, rows: {}, pay: q.pay, valid: q.valid_days, dtime: q.dtime, deal: q.deal, invoice: q.invoice, vat: q.vat }; groups.push(g); }
    g.rows[q.item_id] = q;
  }
  return { groups, items: (items || []).filter((it) => groups.some((g) => g.rows[it.id])) };
}

const money = (n) => Math.round(Number(n) || 0);
/* «ـهٔ» و «ۀ» در B Nazanin دایرهٔ نقطه‌چین جدا می‌شوند (همان مشکلِ docx.js:persianize) — «ه‌ی» همه‌جا درست است */
const fa = (s) => (s == null ? s : String(s).replace(/هٔ/g, "ه‌ی").replace(/ۀ/g, "ه‌ی").replace(/ٔ/g, ""));
const chk = (on) => (on ? "☑" : "□");

/** مدل برگه از دادهٔ ارجاع (bundleData) */
export function commissionSheet(d) {
  const { groups, items } = commissionData(d);
  const request = d.request || {};
  const vatRate = typeof d.vatRate === "number" ? d.vatRate : 0.1;
  const nB = Math.max(8, groups.length);
  const nI = Math.max(12, items.length);
  const X = 3 * nB;                                   /* آخرین ستونِ بلوک‌ها */
  const cU = X + 1, cQ = X + 2, cD1 = X + 3, cD2 = X + 4, cR = X + 5;
  const r0 = 7, rN = 6 + nI, rS = rN + 1;               /* ردیف اقلام، و ردیف «جمع کل» */
  const sh = new Sheet("مقایسه استعلام بها");
  sh.zoom = 50;

  /* ---- ستون‌ها: بلوکِ k (صفر = نزدیک‌ترین به اقلام) همان عرضِ بلوکِ هم‌جای فایل نمونه ---- */
  const blockCols = (k) => [X - 3 * k - 2, X - 3 * k - 1, X - 3 * k];
  const fillOf = (k) => (k % 2 === 0 ? GRAY : null);
  const blockW = (k) => (k < 8 ? [TW[22 - 3 * k], TW[23 - 3 * k], TW[24 - 3 * k]] : [TW[22], TW[23], TW[24]]);
  for (let k = 0; k < nB; k++) blockCols(k).forEach((c, i) => sh.width(c, W(blockW(k)[i])));
  [cU, cQ, cD1, cD2, cR].forEach((c, i) => sh.width(c, W(TW[25 + i])));
  /* عددهای بزرگ ریالی نباید «####» شوند: اگر لازم شد ستون مبلغ پهن‌تر می‌شود (رقمِ ۷۲ پوینت ≈ ۷٫۶ واحد عرض) */
  const widen = (c, n) => { const need = W(String(money(n).toLocaleString("en-US")).length * 7.6 + 6); if (need > (sh.widths.get(c) || 0)) sh.width(c, need); };

  for (let r = 1; r <= 6; r++) sh.height(r, HEAD_H[r]);
  for (let r = r0; r <= rN; r++) sh.height(r, r === r0 ? FIRST_ITEM_H : ROW_H);
  for (let r = rS; r <= rS + 13; r++) sh.height(r, r === rS + 5 ? DTIME_H : ROW_H);

  /* ---- سربرگ ---- */
  const H = (h, v, wrap = true) => ({ font: F72, h, v: v || "center", wrap });
  sh.merge(1, 1, 1, X - 6, `کد: ${formCode(d)}                         شماره بازنگری:                                      تاریخ تنظیم سند :1405/02/07`, { ...H("center"), border: box(M, t, M, M) });
  sh.merge(1, X - 5, 1, X + 3, "مقایسه استعلام بها", { ...H("center"), border: box(M, t, M, M) });
  sh.merge(1, cD2, 3, cR, null, { ...H("center"), border: box(M, M, M, M) });
  sh.image({ png: COMMISSION_LOGO_PNG, src: COMMISSION_LOGO_URL, cell: { r: 1, c: cD2 },
    from: { col: cD2 - 1, colOff: Math.round(551180 * SCALE), row: 0, rowOff: Math.round(127000 * SCALE) }, to: { col: cR - 1, colOff: Math.round(39255 * SCALE), row: 1, rowOff: Math.round(589346 * SCALE) } });

  const deal = (v) => groups.some((g) => g.deal === v);
  const dealType = request.head_deal_type || "خرید", reqType = request.head_req_type || "عادی";
  sh.merge(2, 1, 2, X - 12, `محل معامله :${chk(deal("کارگاه"))} کارگاه :                           ${chk(deal("دفتر مرکزی"))} دفتر مرکزی`, { ...H("center"), border: box(M, t, M, M) });
  sh.merge(2, X - 11, 2, X - 5, `نوع معامله:   ${chk(dealType === "خرید")} خرید   ${chk(dealType === "فروش")} فروش`, { ...H("center"), border: box(M, t, M, M) });
  sh.merge(2, X - 4, 2, X + 3, `نوع درخواست:    ${chk(reqType === "فوری")} فوری   ${chk(reqType !== "فوری")} عادی`, { ...H("center"), border: box(M, M, M, M) });

  const need = items.map((i) => i.need_date).filter(Boolean).sort()[0] || "";
  sh.merge(3, 1, 3, X - 17, `تاریخ نیاز: ${need}`, { ...H("right"), border: box(M, t, M, null) });
  sh.merge(3, X - 16, 3, X - 12, `تاریخ درخواست خرید:  ${request.date || ""}`, { ...H("right"), border: box(null, null, null, null) });
  sh.merge(3, X - 11, 3, X - 6, `شماره درخواست : ${request.id || ""}`, { ...H("right"), border: box(M, t, null, M) });
  sh.merge(3, X - 5, 3, X + 3, `محل پروژه: ${fa(request.head_site == null ? (request.party || "") : request.head_site)}`, { ...H("right", "center", false), border: box(M, M, M, M) });

  sh.merge(4, 1, 4, X, "فروشنده / ارائه دهنده خدمات , خریدار / دریافت کننده خدمات", { ...H("center"), border: box(M, M, M, M) });
  sh.merge(4, cU, 4, cR, null, { ...H("center"), border: box(M, M, M, null) });

  /* ---- سرستون‌ها ---- */
  sh.merge(5, cU, 6, cU, "واحد", { font: F72n, wrap: true, border: box(M, t, M, t) });
  sh.merge(5, cQ, 6, cQ, "تعداد ", { font: F72n, wrap: true, border: box(t, t, M, t) });
  sh.merge(5, cD1, 6, cD2, "شرح اقلام", { font: F72n, wrap: true, border: box(t, t, M, t) });
  sh.merge(5, cR, 6, cR, "ردیف", { font: F72n, wrap: true, border: box(t, M, M, t) });
  for (let k = 0; k < nB; k++) {
    const [c1, c2, c3] = blockCols(k), fill = fillOf(k), g = groups[k];
    sh.merge(5, c1, 5, c3, g ? fa(g.name) : null, { font: F72, fill, wrap: true, border: box(M, t, M, t) });
    sh.put(6, c1, "جنس", { font: F48, fill, wrap: true, border: box(M, t, t, t) });
    sh.put(6, c2, "مبلغ کل (ريال)", { font: F48, fill, wrap: true, border: box(t, t, t, t) });
    sh.put(6, c3, "مبلغ واحد (ريال)", { font: F48, fill, wrap: true, border: box(t, k === 0 ? null : M, t, t) });
  }

  /* ---- اقلام ---- */
  const sums = groups.map(() => 0);
  for (let n = 0; n < nI; n++) {
    const r = r0 + n, it = items[n];
    sh.put(r, cU, it ? fa(it.unit || "") : null, { font: F48b, wrap: true, border: box(M, t, t, t) });
    sh.put(r, cQ, it && it.qty != null ? Number(it.qty) : null, { font: F48b, wrap: true, numFmt: NUM, border: box(t, t, t, t) });
    sh.merge(r, cD1, r, cD2, it ? fa(it.title) : null, { font: F48b, wrap: true, border: box(t, t, t, t) });
    sh.put(r, cR, it ? n + 1 : null, { font: F72n, wrap: true, border: box(t, M, t, t) });
    for (let k = 0; k < nB; k++) {
      const [c1, c2, c3] = blockCols(k), fill = fillOf(k), g = groups[k];
      const q = g && it ? g.rows[it.id] : null;
      const total = q ? money((+q.price || 0) * (+q.qty || 0)) : null;
      if (q) { sums[k] += total; widen(c2, total); widen(c3, q.price); }
      sh.put(r, c1, q ? fa(q.spec || "") : null, { font: F48b, fill, wrap: true, border: box(M, t, t, t) });
      /* فرمولِ فرم «قیمت واحد × تعداد» است؛ اگر مقدارِ پیش‌فاکتور با مقدار درخواست فرق دارد، عددِ درست بی فرمول می‌نشیند */
      const sameQty = q && it && Number(q.qty) === Number(it.qty);
      sh.put(r, c2, total, { font: F72, fill, wrap: true, numFmt: NUM, border: box(t, t, t, t) }, sameQty ? `${cellRef(r, c3)}*${cellRef(r, cQ)}` : undefined);
      sh.put(r, c3, q ? money(q.price) : null, { font: F72, fill, wrap: true, numFmt: NUM, border: box(t, k === 0 ? null : M, t, t) });
    }
  }

  /* ---- جمع‌ها و شرایط ---- */
  const LABELS = ["جمع کل بدون ارزش افزوده(ریال):", "ارزش افزوده:", "جمع کل با ارزش افزوده(ریال):", "مدت اعتبار پیش فاکتور:", "شرایط تسویه :", "زمان تحویل:", "تاییدیه فنی:"];
  LABELS.forEach((lab, i) => {
    const r = rS + i;
    sh.merge(r, cU, r, cR, lab, { font: F72, wrap: true, border: box(M, t, t, i === 6 ? M : t) });
    for (let k = 0; k < nB; k++) {
      const [c1, c2, c3] = blockCols(k), fill = fillOf(k), g = groups[k];
      const st = { font: F72, fill, wrap: i >= 3, numFmt: i <= 2 ? NUM : 0, border: box(M, k === 0 ? null : M, M, t) };
      const sumRef = cellRef(rS, c1), vatRef = cellRef(rS + 1, c1);
      if (!g) { sh.merge(r, c1, r, c3, null, st); continue; }
      const vat = g.vat === "ندارد" ? 0 : Math.round(sums[k] * vatRate);
      if (i === 0) sh.merge(r, c1, r, c3, sums[k], st, `SUM(${cellRef(r0, c2)}:${cellRef(rN, c2)})`);
      else if (i === 1) sh.merge(r, c1, r, c3, vat, st, g.vat === "ندارد" ? undefined : `${sumRef}*${vatRate}`);
      else if (i === 2) sh.merge(r, c1, r, c3, sums[k] + vat, st, `${sumRef}+${vatRef}`);
      else if (i === 3) sh.merge(r, c1, r, c3, g.valid ? `${g.valid} روز` : "", st);
      else if (i === 4) sh.merge(r, c1, r, c3, fa(g.pay || ""), st);
      else if (i === 5) sh.merge(r, c1, r, c3, fa(g.dtime || ""), st);
      else sh.merge(r, c1, r, c3, "", st);
    }
  });

  /* ---- نظرها و امضاها ---- */
  const RT = (h = "right") => ({ font: F72, h, v: "top", wrap: true });
  const notes = fa(String(d.notes == null ? "" : d.notes).trim());
  sh.merge(rS + 7, 1, rS + 7, X - 9, "نظر کارگاه :", { ...RT(), border: box(M, M, M, M) });
  sh.merge(rS + 7, X - 8, rS + 8, cR, `توضیحات تدارکات و پشتیبانی : \n${notes}`, { ...RT(), border: box(M, M, M, M) });
  sh.merge(rS + 8, 1, rS + 10, X - 17, "نظر واحد فنی:", { ...RT(), border: box(M, t, M, t) });
  sh.merge(rS + 8, X - 16, rS + 10, X - 9, "نظر واحد حقوقی:", { ...RT(), border: box(M, t, M, t) });
  sh.merge(rS + 9, X - 8, rS + 10, X - 3, "امضا مدیر پشتیبانی:", { ...RT(), border: box(M, t, M, t) });
  sh.merge(rS + 9, X - 2, rS + 10, cR, `امضا کارشناس خرید: ${fa(d.expert || "")}`, { ...RT(), border: box(M, t, M, t) });
  sh.merge(rS + 11, 1, rS + 12, X - 15, "عضو کمیسیون", { ...RT("center"), border: box(M, M, M, M) });
  sh.merge(rS + 11, X - 14, rS + 12, X - 5, "عضو کمیسیون", { ...RT("center"), border: box(M, M, M, M) });
  sh.merge(rS + 11, X - 4, rS + 12, cR, "عضو کمیسیون", { ...RT("center"), border: box(M, M, M, M) });
  sh.merge(rS + 13, 1, rS + 13, cR, "نظر و امضا مدیر عامل:", { ...RT(), border: box(t, t, null, t) });
  return sh;
}

/** فایل xlsx جدول کمیسیون (Blob) */
export const commissionXlsx = (d) => buildXlsx(commissionSheet(d));

/** همان جدول به HTML — پیش‌نمایش و چاپ پنل (CSS در xlsx.js:SHEET_CSS) */
export const commissionHtml = (d) => sheetHtml(commissionSheet(d));

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
