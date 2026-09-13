/**
 * برگهٔ «درخواست خرید» — فایل Word، دقیقاً در قالب چاپِ راهکاران
 *
 * چیدمان از روی نسخهٔ اسکن‌شدهٔ همین فرم برداشته شده: یک کادر دورِ صفحه که چهار خط
 * افقی آن را پنج بخش می‌کنند —
 *   ۱. سربرگ: «درخواست خرید» و نام شرکت وسط، «شماره صفحه» و «تاریخ گزارش» سمت چپ
 *   ۲. مشخصات: شماره درخواست، تاریخ درخواست، واحد/رمز تامین، نوع قلم، توضیحات (ستون
 *      راست) و مرکز درخواست کننده، درخواست کننده، نوع طرف مقابل، طرف مقابل (ستون دوم)
 *   ۳. جدول اقلام با همان دوازده ستون و نوار خاکستری سرستون‌ها، بی خط عمودی
 *   ۴. جای خالی
 *   ۵. نام صادر کننده و نام تایید کننده، با «امضا» زیر هر کدام
 *
 * سند از صفر ساخته می‌شود، نه از روی قالب: لوگو و سربرگی ندارد، پس هیچ فایلی لازم
 * نیست در انبار باشد. چیدمان راست‌به‌چپ است و هم بخش (`w:bidi`) هم جدول‌ها
 * (`w:bidiVisual`) و هم هر پاراگراف صریح علامت می‌خورند؛ Word هیچ‌کدام را از دیگری
 * استنتاج نمی‌کند. جدول‌ها سبک ندارند تا هیچ کادری جز آنچه این‌جا گفته شده کشیده نشود.
 *
 * همان برگه به HTML هم ساخته می‌شود (requestHtml) برای پیش‌نمایش و چاپ پنل.
 */
import { zip, crc32, deflateRaw, persianize, textRuns, ltrOf } from "./docx.js";

const te = new TextEncoder();
const escXml = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONT = "B Nazanin";
const FA = "۰۱۲۳۴۵۶۷۸۹";

/* A4 افقی با حاشیهٔ ۱ سانتی‌متر */
const PAGE_W = 16838, PAGE_H = 11906, MARGIN = 567, USABLE = PAGE_W - 2 * MARGIN;
const PAD = 120;                     /* فاصلهٔ داخلی خانه‌های کادر اصلی از چپ و راست */
const INNER = USABLE - 2 * PAD;
const HEAD_SHD = "D9D9D9";           /* نوار خاکستریِ سرستون‌های جدول اقلام */

/* ستون‌های جدول اقلام، از راست به چپ — همان ترتیب و تقریباً همان پهنای فرم چاپی */
export const REQUEST_COLUMNS = [
  ["ردیف", 0.035], ["کد قلم", 0.08], ["نام قلم", 0.135], ["مقدار", 0.06], ["واحد", 0.05], ["تاریخ نیاز", 0.07],
  ["مصرف کننده", 0.16], ["وضعیت", 0.065], ["تامین کننده", 0.095], ["کارشناس خرید", 0.10], ["روند خرید", 0.06], ["مهلت استعلام", 0.09],
];

/* ------------------------------------------------------------------ */
/* آجرهای OOXML                                                         */
/* ------------------------------------------------------------------ */

/** قلم خط پیچیده + راست‌به‌چپ + زبان — هر سه لازم‌اند (ترتیب فرزندان rPr ثابت است) */
function rProps({ bold, size = 20 }) {
  return `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="cs"/>`
    + (bold ? "<w:b/><w:bCs/>" : "")
    + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rtl/><w:lang w:val="fa-IR" w:bidi="fa-IR"/>`;
}
const rPr = (o) => `<w:rPr>${rProps(o)}</w:rPr>`;

/* کد قلم و شمارهٔ درخواست با قلم لاتین: B Nazanin رقم لاتین را هم فارسی می‌کشد، ولی
   فرم چاپی راهکاران این دو را با رقم لاتین دارد */
const LATIN = "Tahoma";
const latinPr = (size) => `<w:rPr><w:rFonts w:ascii="${LATIN}" w:hAnsi="${LATIN}" w:cs="${LATIN}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;

/**
 * یک پاراگراف راست‌به‌چپ. `latin` یعنی متن دست‌نخورده و چپ‌به‌راست بماند — کد قلم و
 * شمارهٔ درخواست در فرم چاپی با رقم لاتین‌اند؛ تاریخ و مقدار با رقم فارسی.
 */
function para(text, o = {}) {
  const { bold, size = 20, align = "right", latin } = o;
  const pr = rPr({ bold, size });
  const runs = String(text == null ? "" : text).split("\n").map((line, i) => `${i ? `<w:r>${pr}<w:br/></w:r>` : ""}${latin
    ? `<w:r>${latinPr(Math.max(14, size - 2))}<w:t xml:space="preserve">${escXml(line)}</w:t></w:r>`
    : textRuns(persianize(line), pr, ltrOf(pr))}`).join("");
  return `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>`
    + `<w:jc w:val="${align}"/><w:rPr>${rProps({ bold, size })}</w:rPr></w:pPr>${runs || `<w:r>${pr}</w:r>`}</w:p>`;
}
/* پاراگرافِ ناپیدا بعد از جدولِ تو در تو — Word می‌خواهد هر خانه با پاراگراف تمام شود */
const TINY_P = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>`;

/** یک خانه. content متن است یا {xml}؛ رشتهٔ خام هیچ‌وقت XML فرض نمی‌شود */
function tc(content, o = {}) {
  const { w = 0, span = 1, shd, vAlign = "center", mar = [30, 60, 30, 60] } = o;
  const pr = `<w:tcPr><w:tcW w:w="${w}" w:type="${w ? "dxa" : "auto"}"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}`
    + (shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : "")
    + `<w:tcMar><w:top w:w="${mar[0]}" w:type="dxa"/><w:left w:w="${mar[1]}" w:type="dxa"/><w:bottom w:w="${mar[2]}" w:type="dxa"/><w:right w:w="${mar[3]}" w:type="dxa"/></w:tcMar>`
    + `<w:vAlign w:val="${vAlign}"/></w:tcPr>`;
  const body = content && typeof content === "object" && "xml" in content ? content.xml : para(content, o);
  return `<w:tc>${pr}${body}</w:tc>`;
}

const tr = (cells, o = {}) => {
  const pr = (o.cantSplit ? "<w:cantSplit/>" : "")
    + (o.height ? `<w:trHeight w:val="${o.height}"${o.exact ? ' w:hRule="exact"' : ""}/>` : "")
    + (o.header ? "<w:tblHeader/>" : "");
  return `<w:tr>${pr ? `<w:trPr>${pr}</w:trPr>` : ""}${cells.join("")}</w:tr>`;
};

/* نام‌های transitional (left/right)، نه strict — نسخه‌های قدیمی‌ترِ Word دومی را نمی‌شناسند */
const borders = (b = {}) => "<w:tblBorders>"
  + ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((k) => (b[k] ? `<w:${k} w:val="single" w:sz="${b[k]}" w:space="0" w:color="000000"/>` : `<w:${k} w:val="nil"/>`)).join("")
  + "</w:tblBorders>";

/** جدول راست‌به‌چپ؛ `grid` عرض ستون‌ها از **راست** به چپ */
function tbl(grid, rows, b) {
  const width = grid.reduce((x, y) => x + y, 0);
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/>${borders(b)}<w:tblLayout w:type="fixed"/>`
    + `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` + rows.join("") + "</w:tbl>";
}
const split = (total, fr) => { const g = fr.map((f) => Math.round(total * f)); g.push(total - g.reduce((x, y) => x + y, 0)); return g; };

/* ------------------------------------------------------------------ */
/* پنج بخش                                                              */
/* ------------------------------------------------------------------ */

/** ۱. سربرگ: عنوان و نام شرکت وسط، شمارهٔ صفحه و تاریخ گزارش سمت چپ */
function headerSection(dt) {
  const g = split(INNER, [0.30, 0.40]);
  const mid = { xml: para("درخواست خرید", { bold: true, size: 32, align: "center" }) + para(dt.company, { size: 24, align: "center" }) };
  const pg = split(g[2], [0.5]);
  const pairs = tbl(pg, [
    tr([tc("شماره صفحه", { w: pg[0] }), tc("1", { w: pg[1], align: "left", latin: true })]),
    tr([tc("تاریخ گزارش", { w: pg[0] }), tc(dt.date, { w: pg[1], align: "left" })]),
  ]);
  return tbl(g, [tr([tc("", { w: g[0] }), tc(mid, { w: g[1] }), tc({ xml: pairs + TINY_P }, { w: g[2], vAlign: "top" })])]);
}

/** ۲. مشخصات درخواست — دو ستونِ «برچسب: مقدار» در نیمهٔ راست، همان چینش فرم */
function infoSection(r) {
  const g = split(INNER, [0.10, 0.15, 0.12, 0.33]);
  const L = (t, w) => tc(t, { w, bold: true });
  const row = (k1, v1, k2, v2, latin1) => tr([L(k1, g[0]), tc(v1 || "", { w: g[1], latin: latin1 }), L(k2, g[2]), tc(v2 || "", { w: g[3] }), tc("", { w: g[4] })], { cantSplit: true });
  return tbl(g, [
    row("شماره درخواست", r.id, "مرکز درخواست کننده", r.center, true),
    row("تاریخ درخواست", r.date, "درخواست کننده", r.requester),
    row("واحد/رمز تامین", r.supplyUnit, "نوع طرف مقابل", r.party_type),
    row("نوع قلم", r.item_type, "طرف مقابل", r.party),
    tr([L("توضیحات", g[0]), tc(r.note || "", { w: g[1] + g[2], span: 2, vAlign: "top" }), tc("", { w: g[3] + g[4], span: 2 })]),
  ]);
}

/** ۳. جدول اقلام — نوار خاکستری سرستون، خط افقی میان ردیف‌ها، بی خط عمودی */
function itemsSection(dt) {
  const g = REQUEST_COLUMNS.map(([, f]) => Math.round(INNER * f));
  g[g.length - 1] += INNER - g.reduce((x, y) => x + y, 0);
  const head = tr(REQUEST_COLUMNS.map(([t], i) => tc(t, { w: g[i], shd: HEAD_SHD, bold: true, align: "center", size: 16 })), { header: true, cantSplit: true, height: 340 });
  const C = (i, v, o = {}) => tc(v == null ? "" : v, { w: g[i], size: 16, align: "center", mar: [20, 40, 20, 40], ...o });
  const rows = dt.items.map((it, i) => tr([
    C(0, String(i + 1), { latin: true }),
    C(1, it.code || "", { latin: true }),
    C(2, it.title || "", { align: "right" }),
    C(3, it.qty == null ? "" : Number(it.qty).toLocaleString("en-US")),
    C(4, it.unit || ""),
    C(5, it.need_date || ""),
    C(6, it.consumer || "", { align: "right" }),
    C(7, it.src_status || ""),
    C(8, "", { align: "right" }),
    C(9, it.expert || "", { align: "right" }),
    C(10, dt.buy_flow || ""),
    C(11, ""),
  ], { cantSplit: true, height: 360 }));
  return tbl(g, [head, ...rows], { insideH: 4 });
}

/** ۵. نام صادر کننده و نام تایید کننده، «امضا» زیر هر کدام */
function signSection(dt) {
  const g = split(INNER, [0.11, 0.20, 0.11, 0.20]);
  return tbl(g, [
    tr([tc("نام صادر کننده", { w: g[0], bold: true, vAlign: "top" }), tc(dt.request.requester || "", { w: g[1], vAlign: "top" }),
      tc("نام تایید کننده", { w: g[2], bold: true, vAlign: "top" }), tc("", { w: g[3] }), tc("", { w: g[4] })], { height: 480 }),
    tr([tc("امضا", { w: g[0], bold: true }), tc("", { w: g[1] }), tc("امضا", { w: g[2], bold: true }), tc("", { w: g[3] }), tc("", { w: g[4] })], { height: 480 }),
  ]);
}

/* ------------------------------------------------------------------ */
/* بسته‌بندی docx                                                       */
/* ------------------------------------------------------------------ */

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="cs"/>
<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fa-IR" w:bidi="fa-IR"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

const SECT = `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}" w:orient="landscape"/>`
  + `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="0" w:footer="0" w:gutter="0"/>`
  + `<w:bidi/><w:docGrid w:linePitch="360"/></w:sectPr>`;

/** بدنهٔ سند — جدا از بسته‌بندی، تا بشود بدون ZIP سنجیدش */
export function requestDocumentXml(dt) {
  const cell = (xml, vAlign = "top") => tc({ xml: xml + TINY_P }, { w: USABLE, vAlign, mar: [60, PAD, 60, PAD] });
  /* کادر اصلی: چهار ضلع ضخیم، و چهار خط افقیِ میان پنج بخش */
  const frame = tbl([USABLE], [
    tr([cell(headerSection(dt), "center")], { height: 1000, cantSplit: true }),
    tr([cell(infoSection(dt.request))], { cantSplit: true }),
    tr([cell(itemsSection(dt))]),
    /* جای خالیِ بخش چهارم: با اقلام کم بلندتر، با اقلام زیاد کوتاه‌تر — تا برگه در یک صفحه بماند */
    tr([tc("", { w: USABLE })], { height: Math.max(360, 1500 - 170 * Math.max(0, dt.items.length - 4)), exact: true }),
    tr([cell(signSection(dt))], { height: 1000, cantSplit: true }),
  ], { top: 12, left: 12, bottom: 12, right: 12, insideH: 8 });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${frame}${TINY_P}${SECT}</w:body></w:document>`;
}

/**
 * دادهٔ خام ارجاع را به شکلی درمی‌آورد که برگه می‌خواهد.
 *
 * «تامین کننده» از استعلامِ ثبت‌شده می‌آید، نه از فایل ورودی: فرم آن ستون را برای
 * نتیجهٔ کار گذاشته و همان چیزی که کارشناس ثبت کرده باید آن‌جا بنشیند. ترجیح با
 * تأییدنهایی است؛ اگر نبود، هر استعلامِ ثبت‌شدهٔ همان قلم. «کارشناس خرید» نام کامل
 * است، همان‌طور که راهکاران می‌نویسد.
 */
export function requestSheetData(d) {
  /* فقط آنچه مدیر با فایل اکسل بارگذاری کرده (تصمیم مدیر): تأمین‌کننده، مهلت و
     کارشناسی که بعداً در سامانه تعیین می‌شوند در این برگه نمی‌آیند. «کارشناس خرید»
     همان ستون کارشناسِ خودِ فایل است. */
  const notes = [...new Set((d.items || []).map((i) => (i.note || "").trim()).filter(Boolean))];

  return {
    company: `شرکت ${d.company}`,
    date: d.date,
    buy_flow: d.request.buy_flow || "",
    request: {
      id: d.request.id,
      date: d.request.date,
      center: d.request.center,
      requester: d.request.requester,
      party: d.request.party,
      party_type: d.request.party_type,
      supplyUnit: d.request.supply_unit || d.request.buy_type || "",
      item_type: d.request.head_req_type || d.request.req_type || "",
      note: notes.join("\n"),
    },
    items: (d.items || []).map((i) => ({ ...i, expert: i.src_expert || "" })),
  };
}

/** برگهٔ درخواست خرید به‌صورت فایل .docx */
export async function renderRequestDoc(d) {
  const parts = [
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", RELS],
    ["word/document.xml", requestDocumentXml(requestSheetData(d))],
    ["word/_rels/document.xml.rels", DOC_RELS],
    ["word/styles.xml", STYLES],
  ];
  const entries = [];
  for (const [name, text] of parts) {
    const raw = te.encode(text);
    entries.push({ name, method: 8, raw: await deflateRaw(raw), size: raw.length, crc: crc32(raw) });
  }
  return zip(entries);
}

/* ------------------------------------------------------------------ */
/* همان برگه به HTML — پیش‌نمایش و چاپ پنل                               */
/* ------------------------------------------------------------------ */
const escH = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const faD = (s) => String(s).replace(/\d/g, (x) => FA[+x]);

/**
 * اندازه‌ها با --mm است (در چاپ ۱mm، در پنل چند پیکسل) تا صفحه با یک متغیر
 * بزرگ و کوچک شود و تناسبش همان A4 افقی بماند.
 */
export function requestHtml(d) {
  const dt = requestSheetData(d), r = dt.request;
  const txt = (s) => faD(escH(s == null ? "" : s));
  const lat = (s) => escH(s == null ? "" : s);
  const info = (k1, v1, k2, v2) => `<tr><th>${k1}</th><td>${v1}</td><th>${k2}</th><td>${v2}</td><td></td></tr>`;
  const cols = (fr) => `<colgroup>${fr.map((f) => `<col style="width:${(f * 100).toFixed(2)}%">`).join("")}<col></colgroup>`;
  return `<div class="rqdoc"><table class="rq-frame"><tbody>
    <tr class="s1"><td><table class="rq-head"><tbody><tr><td class="c-r"></td>
      <td class="c-m"><div class="ttl">درخواست خرید</div><div class="co">${txt(dt.company)}</div></td>
      <td class="c-l"><table class="rq-pairs"><tbody><tr><td>شماره صفحه</td><td class="v">1</td></tr><tr><td>تاریخ گزارش</td><td class="v">${txt(dt.date)}</td></tr></tbody></table></td></tr></tbody></table></td></tr>
    <tr class="s2"><td><table class="rq-info">${cols([0.10, 0.15, 0.12, 0.33])}<tbody>
      ${info("شماره درخواست", lat(r.id), "مرکز درخواست کننده", txt(r.center))}
      ${info("تاریخ درخواست", txt(r.date), "درخواست کننده", txt(r.requester))}
      ${info("واحد/رمز تامین", txt(r.supplyUnit), "نوع طرف مقابل", txt(r.party_type))}
      ${info("نوع قلم", txt(r.item_type), "طرف مقابل", txt(r.party))}
      <tr><th>توضیحات</th><td colspan="2" class="note">${txt(r.note)}</td><td colspan="2"></td></tr></tbody></table></td></tr>
    <tr class="s3"><td><table class="rq-items"><colgroup>${REQUEST_COLUMNS.map(([, f]) => `<col style="width:${(f * 100).toFixed(2)}%">`).join("")}</colgroup>
      <thead><tr>${REQUEST_COLUMNS.map(([t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
      ${dt.items.map((it, i) => `<tr><td>${i + 1}</td><td>${lat(it.code)}</td><td class="rt">${txt(it.title)}</td><td>${it.qty == null ? "" : faD(Number(it.qty).toLocaleString("en-US"))}</td>`
        + `<td>${txt(it.unit)}</td><td>${txt(it.need_date)}</td><td class="rt">${txt(it.consumer)}</td><td>${txt(it.src_status)}</td>`
        + `<td class="rt"></td><td class="rt">${txt(it.expert)}</td><td>${txt(dt.buy_flow)}</td><td></td></tr>`).join("")}
      </tbody></table></td></tr>
    <tr class="s4"><td></td></tr>
    <tr class="s5"><td><table class="rq-sign">${cols([0.11, 0.20, 0.11, 0.20])}<tbody>
      <tr><th>نام صادر کننده</th><td>${txt(r.requester)}</td><th>نام تایید کننده</th><td></td><td></td></tr>
      <tr><th>امضا</th><td></td><th>امضا</th><td></td><td></td></tr></tbody></table></td></tr>
  </tbody></table></div>`;
}

export const REQUEST_CSS = `.rqdoc{--mm:var(--u,1mm);width:calc(277*var(--mm));box-sizing:border-box;background:#fff;color:#000;direction:rtl;`
  + `font-family:"B Nazanin","B Lotus",Vazirmatn,Tahoma,sans-serif;font-size:calc(3.1*var(--mm));line-height:1.35}`
  + `.rqdoc table{border-collapse:collapse;width:100%;table-layout:fixed}`
  + `.rqdoc td,.rqdoc th{padding:calc(.5*var(--mm)) calc(1.1*var(--mm));vertical-align:middle;text-align:right;font-weight:400}`
  + `.rqdoc th{font-weight:700}`
  + `.rq-frame{border:calc(.5*var(--mm)) solid #000}`
  + `.rq-frame>tbody>tr>td{padding:calc(1*var(--mm)) calc(2*var(--mm));vertical-align:top}`
  + `.rq-frame>tbody>tr+tr>td{border-top:calc(.35*var(--mm)) solid #000}`
  + `.rq-frame>tbody>tr.s1>td{height:calc(21*var(--mm));vertical-align:middle}`
  + `.rq-frame>tbody>tr.s4>td{height:calc(26*var(--mm))}`
  + `.rq-frame>tbody>tr.s5>td{height:calc(19*var(--mm))}`
  + `.rq-head .c-r{width:30%}.rq-head .c-m{width:40%;text-align:center}`
  + `.rq-head .ttl{font-size:calc(5.6*var(--mm));font-weight:700;text-align:center}.rq-head .co{font-size:calc(4.2*var(--mm));text-align:center}`
  + `.rq-pairs td{padding:calc(.3*var(--mm)) calc(1*var(--mm))}.rq-pairs td.v{text-align:left;direction:ltr}`
  + `.rq-info .note{white-space:pre-wrap;vertical-align:top}`
  + `.rq-items th{background:#d9d9d9;text-align:center;font-size:calc(2.9*var(--mm))}`
  + `.rq-items td{text-align:center;font-size:calc(2.9*var(--mm));border-bottom:calc(.2*var(--mm)) solid #444}`
  + `.rq-items td.rt{text-align:right}.rq-items tbody tr:last-child td{border-bottom:0}`
  + `.rq-sign th,.rq-sign td{vertical-align:top}`;
