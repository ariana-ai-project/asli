/**
 * تولید برگه‌ها سمت سرور — جدول کمیسیون و برگهٔ درخواست خرید
 *
 * چرا سمت سرور و نه فقط در پنل: کارشناس بیشتر با گوشی کار می‌کند و می‌خواهد
 * فایل‌ها را در تلگرام داشته باشد. پنل همان جدول را نشان می‌دهد، ولی بات باید
 * بتواند فایل بسازد و بفرستد بدون اینکه مرورگری باز باشد.
 *
 * قالب خروجی همان چیزی است که پنل تولید می‌کند: جدول HTML با پسوند xls.
 * اکسل آن را با کادر و راست‌به‌چپ درست باز می‌کند و برخلاف ساختن xlsx واقعی،
 * نه کتابخانه می‌خواهد نه CPU — که در پلن رایگان کلودفلیر تعیین‌کننده است.
 */

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FA = "۰۱۲۳۴۵۶۷۸۹";
const M = (n) => String(n == null ? "" : n).replace(/\d/g, (d) => FA[+d]);
const money = (n) => M(Number(n || 0).toLocaleString("en-US")).replace(/,/g, "٬");

const STYLE = `<style>
  table{border-collapse:collapse;font-family:Tahoma,'B Nazanin',sans-serif;font-size:10pt;width:100%}
  td,th{border:1px solid #555;padding:4px 6px;vertical-align:middle}
  .ttl{font-size:13pt;font-weight:700;text-align:center;background:#e8e8e8}
  .lbl{background:#f2f2f2;font-weight:700;text-align:center}
  .rt{text-align:right}.num{text-align:center}
  .tall td{height:52px;vertical-align:top}
  .sup{background:#eef3ff;font-weight:700;text-align:center}
</style>`;

const wrap = (title, body) =>
  `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><title>${esc(title)}</title>`
  + `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(title)}</x:Name>`
  + `<x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->`
  + `${STYLE}</head><body dir="rtl">${body}</body></html>`;

/**
 * جدول مقایسه استعلام بها — فرم TSA-PS-FO-02.
 * راست‌به‌چپ: ردیف و شرح اقلام سمت راست، بلوک سه‌ستونهٔ هر تأمین‌کننده به چپ.
 */
export function commissionHtml({ request, items, quotes, notes, expert, company, vatRate = 0.1, date }) {
  /* فقط استعلام‌های تأییدنهایی‌شده و ذخیره‌شده وارد جدول می‌شوند (CM-05) */
  const groups = [];
  for (const q of quotes.filter((x) => x.final && x.saved)) {
    let g = groups.find((x) => x.name === q.supplier_name);
    if (!g) { g = { name: q.supplier_name, rows: {}, pay: q.pay, valid: q.valid_days, dtime: q.dtime, deal: q.deal, invoice: q.invoice }; groups.push(g); }
    g.rows[q.item_id] = q;
  }
  const N = groups.length, span = 4 + 3 * N;
  const sums = groups.map((g) => items.reduce((n, it) => n + ((g.rows[it.id] ? (+g.rows[it.id].price || 0) * (+g.rows[it.id].qty || 0) : 0)), 0));
  const vat = sums.map((s) => Math.round(s * vatRate));
  const B = (fn) => groups.map(fn).join("");
  const chk = (v, t) => (v === t ? "☑" : "☐");
  const dealChk = (v) => (groups.some((g) => g.deal === v) ? "☑" : "☐");

  const body = `<table>
    <tr><td class="ttl" colspan="4">مقایسه استعلام بها</td><td class="lbl rt" colspan="${3 * N || 1}">کد: TSA-PS-FO-02 &nbsp; تاریخ تنظیم: ${esc(date)}</td></tr>
    <tr><td class="rt" colspan="${Math.max(2, Math.ceil(span / 3))}">محل معامله: ${dealChk("کارگاه")} کارگاه &nbsp; ${dealChk("دفتر مرکزی")} دفتر مرکزی</td>
        <td class="rt" colspan="${Math.max(1, Math.ceil(span / 3))}">نوع معامله: ${chk(request.head_deal_type || "خرید", "خرید")} خرید &nbsp; ${chk(request.head_deal_type, "فروش")} فروش</td>
        <td class="rt" colspan="${Math.max(1, span - 2 * Math.ceil(span / 3))}">نوع درخواست: ${chk(request.head_req_type, "فوری")} فوری &nbsp; ${chk(request.head_req_type || "عادی", "عادی")} عادی</td></tr>
    <tr><td class="rt" colspan="2">شماره درخواست: ${esc(request.id)}</td><td class="rt" colspan="2">تاریخ درخواست: ${esc(request.date)}</td>
        <td class="rt" colspan="${Math.max(1, 3 * N)}">محل پروژه: ${esc(request.head_site == null ? request.party : request.head_site)}</td></tr>
    <tr><td class="lbl" colspan="4">خریدار: ${esc(company)}</td><td class="lbl" colspan="${3 * N || 1}">فروشنده / ارائه‌دهنده خدمات</td></tr>
    <tr><td class="lbl">ردیف</td><td class="lbl">شرح اقلام</td><td class="lbl">تعداد</td><td class="lbl">واحد</td>${B((g) => `<td class="sup" colspan="3">${esc(g.name)}</td>`)}</tr>
    <tr><td colspan="4"></td>${B(() => `<td class="lbl">جنس</td><td class="lbl">مبلغ کل (ریال)</td><td class="lbl">مبلغ واحد (ریال)</td>`)}</tr>
    ${items.map((it, i) => `<tr><td class="num">${M(i + 1)}</td><td class="rt">${esc(it.title)}</td><td class="num">${it.qty == null ? "" : M(it.qty)}</td><td class="num">${esc(it.unit)}</td>
      ${B((g) => { const q = g.rows[it.id]; return `<td>${q ? esc(q.spec) : ""}</td><td class="num">${q ? money((+q.price || 0) * (+q.qty || 0)) : ""}</td><td class="num">${q ? money(q.price) : ""}</td>`; })}</tr>`).join("")}
    <tr><td class="lbl rt" colspan="4">جمع کل بدون ارزش افزوده (ریال):</td>${B((g, k) => `<td class="num" colspan="3">${money(sums[k])}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">ارزش افزوده (${M(Math.round(vatRate * 100))}٪):</td>${B((g, k) => `<td class="num" colspan="3">${money(vat[k])}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">جمع کل با ارزش افزوده (ریال):</td>${B((g, k) => `<td class="num" colspan="3"><b>${money(sums[k] + vat[k])}</b></td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">نوع فاکتور و میزان مالیات و عوارض:</td>${B((g) => `<td colspan="3">${esc(g.invoice || "—")}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">مدت اعتبار پیش‌فاکتور:</td>${B((g) => `<td colspan="3">${g.valid ? M(g.valid) + " روز" : "—"}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">شرایط تسویه:</td>${B((g) => `<td colspan="3">${esc(g.pay || "—")}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">زمان تحویل:</td>${B((g) => `<td colspan="3">${esc(g.dtime || "—")}</td>`)}</tr>
    <tr><td class="lbl rt" colspan="4">تاییدیه فنی:</td>${B(() => `<td colspan="3">—</td>`)}</tr>
    <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">نظر کارگاه:</td>
        <td class="rt" colspan="${span - Math.ceil(span / 2)}">توضیحات تدارکات و پشتیبانی:${notes ? `<br>${esc(notes).replace(/\n/g, "<br>")}` : ""}</td></tr>
    <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">نظر واحد فنی:</td><td class="rt" colspan="${span - Math.ceil(span / 2)}">نظر واحد حقوقی:</td></tr>
    <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 2)}">امضا کارشناس خرید: ${esc(expert)}</td><td class="rt" colspan="${span - Math.ceil(span / 2)}">امضا مدیر پشتیبانی:</td></tr>
    <tr class="tall"><td class="rt" colspan="${Math.ceil(span / 3)}">عضو کمیسیون</td><td class="rt" colspan="${Math.ceil(span / 3)}">عضو کمیسیون</td><td class="rt" colspan="${span - 2 * Math.ceil(span / 3)}">عضو کمیسیون</td></tr>
  </table>`;
  return wrap("جدول کمیسیون", body);
}

/** برگهٔ درخواست خرید — از همان داده‌ای که مدیر با اکسل راهکاران بارگذاری کرده */
export function requestHtml({ request, items, expert, company, date }) {
  const body = `<table>
    <tr><td class="ttl" colspan="6">برگه درخواست خرید</td></tr>
    <tr><td class="rt" colspan="2">شماره درخواست: <b>${esc(request.id)}</b></td><td class="rt" colspan="2">تاریخ درخواست: ${esc(request.date)}</td>
        <td class="rt" colspan="2">نوع درخواست: ${esc(request.head_req_type || request.urgency || "عادی")}</td></tr>
    <tr><td class="rt" colspan="3">طرف مقابل / مرکز هزینه: ${esc(request.party)}</td><td class="rt" colspan="3">کارشناس خرید: ${esc(expert)}</td></tr>
    ${request.requester || request.center ? `<tr><td class="rt" colspan="3">درخواست‌کننده: ${esc(request.requester || "—")}</td><td class="rt" colspan="3">مرکز هزینه: ${esc(request.center || "—")}</td></tr>` : ""}
    <tr><td class="lbl">ردیف</td><td class="lbl">کد قلم</td><td class="lbl">شرح قلم</td><td class="lbl">تعداد</td><td class="lbl">واحد</td><td class="lbl">توضیحات</td></tr>
    ${items.map((it, i) => `<tr><td class="num">${M(i + 1)}</td><td class="num">${esc(it.code || "—")}</td><td class="rt">${esc(it.title)}</td>
      <td class="num">${it.qty == null ? "" : M(it.qty)}</td><td class="num">${esc(it.unit)}</td><td class="rt">${esc(it.note || it.spec || "")}</td></tr>`).join("")}
    <tr><td class="rt" colspan="6">شرکت ${esc(company)} — تاریخ تنظیم برگه: ${esc(date)}</td></tr>
    <tr class="tall"><td class="rt" colspan="3">امضا درخواست‌کننده:</td><td class="rt" colspan="3">امضا مدیر پشتیبانی:</td></tr>
  </table>`;
  return wrap("برگه درخواست خرید", body);
}
