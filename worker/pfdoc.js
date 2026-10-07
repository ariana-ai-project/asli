/**
 * «پیش‌فاکتور تولیدی» — فاز ۴ طرح «خرید هوشمند، کارشناس ناظر» (مهر ۱۴۰۵؛ تصمیم ۱۴: قالبِ خنثیِ «پیش‌فاکتور» با نام
 * تأمین‌کننده و شمارهٔ درخواست، Word و PDF)
 *
 * پیش‌فاکتور دیگر فایلی نیست که تأمین‌کننده بارگذاری کند و مدل بخواند: سامانه آن را از همان فیلدهایی می‌سازد که تأمین‌کننده
 * در پنل یا بات پر کرده — هر قلم با لایه‌های ویژگی (🔒 و 🔓)، مقدار، واحد، قیمت واحد و توضیح، و شرایطِ فروش. تأمین‌کننده پیش از
 * «ارسال» همین را می‌بیند (proformaHtml)؛ کارشناس و پشتیبانی همان را Word می‌گیرند (renderProformaDoc) و PDF با چاپِ همان
 * پیش‌نمایش. قیمتِ هر ردیف بی ارزش افزوده است و ارزش افزوده (۱۰٪، همان فرم کمیسیون — quote-rules.js:VAT_RATE) ته جدول می‌آید.
 * سربرگ و مُهری ندارد؛ پانویس می‌گوید از اطلاعاتِ ثبت‌شدهٔ تأمین‌کننده در سامانه ساخته شده است.
 */
import { zip, crc32, deflateRaw, persianize, textRuns, ltrOf } from "./docx.js";
import { VAT_RATE } from "./quote-rules.js";

const te = new TextEncoder();
/* نویسه‌های کنترلی (از متنِ کپی‌شدهٔ تأمین‌کننده) در XML مجاز نیستند و فایل را برای Word خراب می‌کنند */
const escXml = (s) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const FONT = "B Nazanin";
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faD = (s) => String(s == null ? "" : s).replace(/\d/g, (x) => FA[+x]);
const money = (n) => (n == null || !Number.isFinite(Number(n)) ? "" : Math.round(Number(n)).toLocaleString("en-US"));
const qtyTxt = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 3 }));

/* A4 عمودی با حاشیهٔ ۱٫۵ سانتی‌متر */
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 850, USABLE = PAGE_W - 2 * MARGIN;
const HEAD_SHD = "D9D9D9";
export const PF_COLUMNS = [["ردیف", 0.06], ["شرح کالا و مشخصات", 0.42], ["مقدار", 0.1], ["واحد", 0.09], ["قیمت واحد (ریال)", 0.15], ["مبلغ کل (ریال)", 0.18]];

/** شرحِ هر ردیف: عنوان، بعد لایه‌ها («قطر: ۱۲ میلی‌متر · جنس: آهنی») و لایه‌های افزودهٔ تأمین‌کننده، و توضیحِ همان قلم */
const layerLine = (l) => [...(l.layers || []), ...(l.extras || [])].filter((x) => x && x.k && String(x.v || "").trim()).map((x) => `${x.k}: ${x.v}${x.u ? ` ${x.u}` : ""}`).join(" · ");

/**
 * ورودی: {company, supplier, request:{id, party}, date, no, lines:[{no, title, layers, extras, qty, unit, price, note}], terms, comment}
 * خروجی: همان، با جمع‌ها — یک‌جا تا Word و HTML یک عدد بگویند.
 */
export function proformaData(d) {
  const lines = (d.lines || []).map((l, i) => {
    const qty = l.qty == null || l.qty === "" ? null : Number(l.qty), price = l.price == null || l.price === "" ? null : Number(l.price);
    return { ...l, row: i + 1, qty, price, total: qty != null && price != null ? qty * price : null, desc: layerLine(l) };
  });
  const sum = lines.reduce((a, l) => a + (l.total || 0), 0);
  const t = d.terms || {};
  const vat = t.vat === "دارد" ? Math.round(sum * VAT_RATE) : 0;
  return { ...d, lines, sum, vat, grand: sum + vat, terms: t };
}

/** شرایط به ترتیبِ چاپ؛ خالی‌ها نمی‌آیند */
export function termRows(t) {
  const dt = String(t.dtime || "").trim();
  const dtime = !dt ? "" : /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dt) ? `تا تاریخ ${dt}` : /^\d+$/.test(dt) ? `${dt} روز پس از سفارش` : dt;
  const place = t.place === "سایر" ? t.place_other || "سایر" : t.place;
  return [["اعتبار پیش‌فاکتور", t.valid_days ? `${t.valid_days} روز` : ""], ["زمان تحویل", dtime], ["شرایط تسویه", t.pay], ["نوع فاکتور", t.invoice],
    ["ارزش افزوده", t.vat], ["روش حمل", t.ship], ["محل معامله", t.deal], ["محل تحویل", place]].filter(([, v]) => String(v || "").trim());
}

/* ------------------------------------------------------------------ */
/* OOXML — همان آجرهای برگهٔ درخواست خرید (reqdoc.js)                    */
/* ------------------------------------------------------------------ */
function rProps({ bold, size = 20 }) {
  return `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="cs"/>` + (bold ? "<w:b/><w:bCs/>" : "")
    + `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rtl/><w:lang w:val="fa-IR" w:bidi="fa-IR"/>`;
}
const rPr = (o) => `<w:rPr>${rProps(o)}</w:rPr>`;
const LATIN = "Tahoma";
const latinPr = (size) => `<w:rPr><w:rFonts w:ascii="${LATIN}" w:hAnsi="${LATIN}" w:cs="${LATIN}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
function para(text, o = {}) {
  const { bold, size = 20, align = "right", latin, after = 0 } = o;
  const pr = rPr({ bold, size });
  const runs = String(text == null ? "" : text).split("\n").map((line, i) => `${i ? `<w:r>${pr}<w:br/></w:r>` : ""}${latin
    ? `<w:r>${latinPr(Math.max(14, size - 2))}<w:t xml:space="preserve">${escXml(line)}</w:t></w:r>`
    : textRuns(persianize(line), pr, ltrOf(pr))}`).join("");
  return `<w:p><w:pPr><w:bidi/><w:spacing w:before="0" w:after="${after}" w:line="260" w:lineRule="auto"/>`
    + `<w:jc w:val="${align}"/><w:rPr>${rProps({ bold, size })}</w:rPr></w:pPr>${runs || `<w:r>${pr}</w:r>`}</w:p>`;
}
const TINY_P = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>`;
function tc(content, o = {}) {
  const { w = 0, span = 1, shd, vAlign = "center", mar = [40, 80, 40, 80] } = o;
  const pr = `<w:tcPr><w:tcW w:w="${w}" w:type="${w ? "dxa" : "auto"}"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}`
    + (shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd}"/>` : "")
    + `<w:tcMar><w:top w:w="${mar[0]}" w:type="dxa"/><w:left w:w="${mar[1]}" w:type="dxa"/><w:bottom w:w="${mar[2]}" w:type="dxa"/><w:right w:w="${mar[3]}" w:type="dxa"/></w:tcMar>`
    + `<w:vAlign w:val="${vAlign}"/></w:tcPr>`;
  const body = content && typeof content === "object" && "xml" in content ? content.xml : para(content, o);
  return `<w:tc>${pr}${body}</w:tc>`;
}
const tr = (cells, o = {}) => {
  const pr = (o.cantSplit ? "<w:cantSplit/>" : "") + (o.height ? `<w:trHeight w:val="${o.height}"/>` : "") + (o.header ? "<w:tblHeader/>" : "");
  return `<w:tr>${pr ? `<w:trPr>${pr}</w:trPr>` : ""}${cells.join("")}</w:tr>`;
};
const borders = (b = {}) => "<w:tblBorders>" + ["top", "left", "bottom", "right", "insideH", "insideV"]
  .map((k) => (b[k] ? `<w:${k} w:val="single" w:sz="${b[k]}" w:space="0" w:color="000000"/>` : `<w:${k} w:val="nil"/>`)).join("") + "</w:tblBorders>";
function tbl(grid, rows, b) {
  const width = grid.reduce((x, y) => x + y, 0);
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="${width}" w:type="dxa"/><w:jc w:val="center"/>${borders(b)}<w:tblLayout w:type="fixed"/>`
    + `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` + rows.join("") + "</w:tbl>";
}
const split = (total, fr) => { const g = fr.map((f) => Math.round(total * f)); g.push(total - g.reduce((x, y) => x + y, 0)); return g; };

export function proformaDocumentXml(dt) {
  const g2 = split(USABLE, [0.5]);
  const head = tbl(g2, [tr([
    tc({ xml: para("پیش‌فاکتور", { bold: true, size: 36 }) + para(`فروشنده: ${dt.supplier || ""}`, { size: 22 }) }, { w: g2[0], vAlign: "top" }),
    tc({ xml: para(`خریدار: ${dt.company || ""}`, { size: 20, align: "left" }) + para(`شمارهٔ درخواست: ${dt.request && dt.request.id || ""}`, { size: 20, align: "left" })
      + para(`تاریخ: ${dt.date || ""}`, { size: 20, align: "left" }) + (dt.no ? para(`شمارهٔ پیش‌فاکتور: ${dt.no}`, { size: 20, align: "left" }) : "") }, { w: g2[1], vAlign: "top" }),
  ])]);
  const g = PF_COLUMNS.map(([, f]) => Math.round(USABLE * f)); g[g.length - 1] += USABLE - g.reduce((x, y) => x + y, 0);
  const hrow = tr(PF_COLUMNS.map(([t], i) => tc(t, { w: g[i], shd: HEAD_SHD, bold: true, align: "center", size: 18 })), { header: true, cantSplit: true });
  const C = (i, v, o = {}) => tc(v == null ? "" : v, { w: g[i], size: 18, align: "center", ...o });
  const rows = dt.lines.map((l) => tr([
    C(0, String(l.row), { latin: true }),
    tc({ xml: para(l.title || "", { size: 18, bold: true }) + (l.desc ? para(l.desc, { size: 16 }) : "") + (l.note ? para(`توضیح: ${l.note}`, { size: 16 }) : "") }, { w: g[1] }),
    C(2, qtyTxt(l.qty)), C(3, l.unit || ""), C(4, money(l.price), { bold: true }), C(5, money(l.total), { bold: true }),
  ], { cantSplit: true }));
  const span = g.slice(0, 5).reduce((a, b) => a + b, 0);
  const sumRow = (label, v, bold) => tr([tc(label, { w: span, span: 5, align: "left", bold, size: 18 }), C(5, money(v), { bold })], { cantSplit: true });
  const items = tbl(g, [hrow, ...rows, sumRow("جمع (بی ارزش افزوده)", dt.sum, true), ...(dt.vat ? [sumRow(`ارزش افزوده (${Math.round(VAT_RATE * 100)}٪)`, dt.vat)] : []), sumRow("جمع کل", dt.grand, true)],
    { top: 8, left: 8, bottom: 8, right: 8, insideH: 4, insideV: 4 });
  const tg = split(USABLE, [0.3]);
  const terms = termRows(dt.terms);
  const termsTbl = terms.length ? tbl(tg, terms.map(([k, v]) => tr([tc(k, { w: tg[0], bold: true, size: 18 }), tc(v, { w: tg[1], size: 18 })], { cantSplit: true })), { insideH: 2 }) : "";
  const body = head + para("", { after: 120 }) + items + para("", { after: 120 })
    + (terms.length ? para("شرایط", { bold: true, size: 22, after: 60 }) + termsTbl : "")
    + (dt.comment ? para("", { after: 60 }) + para(`توضیحات فروشنده: ${dt.comment}`, { size: 18 }) : "")
    + para("", { after: 200 }) + para("این پیش‌فاکتور از اطلاعاتی ساخته شده که فروشنده خودش در سامانهٔ تأمین ثبت کرده است.", { size: 16, align: "center" });
  const sect = `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="0" w:footer="0" w:gutter="0"/><w:bidi/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${TINY_P}${sect}</w:body></w:document>`;
}

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
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:hint="cs"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="fa-IR" w:bidi="fa-IR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="0" w:line="260" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`;

/** پیش‌فاکتور به‌صورت .docx */
export async function renderProformaDoc(d) {
  const parts = [["[Content_Types].xml", CONTENT_TYPES], ["_rels/.rels", RELS], ["word/document.xml", proformaDocumentXml(proformaData(d))],
    ["word/_rels/document.xml.rels", DOC_RELS], ["word/styles.xml", STYLES]];
  const entries = [];
  for (const [name, text] of parts) { const raw = te.encode(text); entries.push({ name, method: 8, raw: await deflateRaw(raw), size: raw.length, crc: crc32(raw) }); }
  return zip(entries);
}

/* ------------------------------------------------------------------ */
/* همان به HTML — پیش‌نمایشِ پنل تأمین‌کننده و کارشناس، و چاپ به PDF       */
/* ------------------------------------------------------------------ */
const escH = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const txt = (s) => faD(escH(s));
/** `missing`: فیلدهای اجباریِ خالی — پیش‌نمایش با خانهٔ قرمز نشانشان می‌دهد */
export function proformaHtml(d, { missing = [] } = {}) {
  const dt = proformaData(d);
  const miss = new Set(missing);
  const terms = termRows(dt.terms);
  const lack = (k) => (miss.has(k) ? ` class="pf-miss"` : "");
  return `<div class="pfdoc"><div class="pf-head"><div><div class="pf-ttl">پیش‌فاکتور</div><div>فروشنده: <b>${txt(dt.supplier)}</b></div></div>
    <div class="pf-meta"><div>خریدار: ${txt(dt.company)}</div><div>شمارهٔ درخواست: <span dir="ltr">${escH(dt.request && dt.request.id)}</span></div><div>تاریخ: ${txt(dt.date)}</div>${dt.no ? `<div>شمارهٔ پیش‌فاکتور: ${txt(dt.no)}</div>` : ""}</div></div>
    <table class="pf-items"><thead><tr>${PF_COLUMNS.map(([t]) => `<th>${t}</th>`).join("")}</tr></thead><tbody>
    ${dt.lines.map((l) => `<tr><td>${faD(l.row)}</td><td class="rt"><b>${txt(l.title)}</b>${l.desc ? `<div class="pf-desc">${txt(l.desc)}</div>` : ""}${l.note ? `<div class="pf-desc">توضیح: ${txt(l.note)}</div>` : ""}</td>
      <td${lack(`qty:${l.no}`)}>${faD(qtyTxt(l.qty))}</td><td>${txt(l.unit)}</td><td class="pf-num${miss.has(`price:${l.no}`) ? " pf-miss" : ""}"><b>${faD(money(l.price))}</b></td><td class="pf-num"><b>${faD(money(l.total))}</b></td></tr>`).join("")}
    <tr class="pf-sum"><td colspan="5">جمع (بی ارزش افزوده)</td><td class="pf-num"><b>${faD(money(dt.sum))}</b></td></tr>
    ${dt.vat ? `<tr class="pf-sum"><td colspan="5">ارزش افزوده (${faD(Math.round(VAT_RATE * 100))}٪)</td><td class="pf-num">${faD(money(dt.vat))}</td></tr>` : ""}
    <tr class="pf-sum"><td colspan="5">جمع کل</td><td class="pf-num"><b>${faD(money(dt.grand))}</b></td></tr></tbody></table>
    ${terms.length || miss.size ? `<div class="pf-h2">شرایط</div><table class="pf-terms"><tbody>${terms.map(([k, v]) => `<tr><th>${k}</th><td>${txt(v)}</td></tr>`).join("")}
      ${[["valid_days", "اعتبار پیش‌فاکتور"], ["dtime", "زمان تحویل"], ["pay", "شرایط تسویه"], ["invoice", "نوع فاکتور"], ["vat", "ارزش افزوده"]].filter(([k]) => miss.has(k)).map(([, l]) => `<tr class="pf-miss"><th>${l}</th><td>— لازم است</td></tr>`).join("")}</tbody></table>` : ""}
    ${dt.comment ? `<div class="pf-cmt">توضیحات فروشنده: ${txt(dt.comment)}</div>` : ""}
    <div class="pf-foot">این پیش‌فاکتور از اطلاعاتی ساخته شده که فروشنده خودش در سامانهٔ تأمین ثبت کرده است.</div></div>`;
}

export const PROFORMA_CSS = `.pfdoc{--mm:var(--u,1mm);width:calc(190*var(--mm));max-width:100%;box-sizing:border-box;background:#fff;color:#000;direction:rtl;margin:0 auto;padding:calc(6*var(--mm));`
  + `font-family:"B Nazanin","B Lotus",Vazirmatn,Tahoma,sans-serif;font-size:calc(3.6*var(--mm));line-height:1.6}`
  + `.pfdoc table{border-collapse:collapse;width:100%}`
  + `.pf-head{display:flex;justify-content:space-between;gap:calc(4*var(--mm));margin-bottom:calc(4*var(--mm))}.pf-ttl{font-size:calc(7*var(--mm));font-weight:700}.pf-meta{text-align:left}`
  + `.pf-items th{background:#d9d9d9;border:1px solid #000;padding:calc(1.2*var(--mm));font-size:calc(3.2*var(--mm))}`
  + `.pf-items td{border:1px solid #000;padding:calc(1.2*var(--mm));text-align:center;vertical-align:top}.pf-items td.rt{text-align:right}`
  + `.pf-items .pf-num{direction:ltr;text-align:left;font-size:calc(3.9*var(--mm))}.pf-desc{font-size:calc(3.1*var(--mm));color:#333}`
  + `.pf-sum td{text-align:left;font-weight:700}.pf-h2{font-weight:700;margin:calc(4*var(--mm)) 0 calc(1.5*var(--mm))}`
  + `.pf-terms th{width:32%;text-align:right;padding:calc(1*var(--mm));border-bottom:1px solid #999}.pf-terms td{padding:calc(1*var(--mm));border-bottom:1px solid #999}`
  + `.pf-miss,.pf-miss td,.pf-miss th{background:#fde2e2!important;color:#991b1b}`
  + `.pf-cmt{margin-top:calc(3*var(--mm))}.pf-foot{margin-top:calc(6*var(--mm));font-size:calc(2.9*var(--mm));color:#555;text-align:center}`
  + `@media print{.pfdoc{width:auto;padding:0}}`;
