/* ============================================================
   برگه‌ها و نامه — worker/docx.js، worker/reqdoc.js، worker/sheets.js

   سه اشتباهی که کارشناس در فایل‌های واقعی دید و این تست‌ها برنمی‌گردند:
   ۱) برگهٔ درخواست خرید پر از تگ XMLِ escape‌شده بود (XMLِ آماده، متن فرض شد)
   ۲) «کنندهٔ» با همزهٔ ترکیبی در B Lotus دایرهٔ نقطه‌چین می‌شد
   ۳) تاریخ سال-اول در Word وارونه چیده می‌شد — باید run چپ‌به‌راست باشد
   و یک قاعده: جدول کمیسیون فقط قلم‌های تیک‌خورده را دارد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { persianize, textRuns, ltrOf, fillHeader, buildDocumentXml, unzip } from "../../../worker/docx.js";
import { requestDocumentXml, requestSheetData, renderRequestDoc } from "../../../worker/reqdoc.js";
import { commissionHtml } from "../../../worker/sheets.js";

const texts = (xml) => [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
const RPR = '<w:rPr><w:rFonts w:cs="B Lotus"/><w:rtl/></w:rPr>';

test("همزهٔ ترکیبی روی ه به «ه‌ی» برمی‌گردد و جایی نمی‌ماند", () => {
  const out = persianize("تأمین‌کنندهٔ نخست و ۀ و خانه ی ما");
  assert.ok(!out.includes("ٔ"), "همزهٔ ترکیبی نباید بماند");
  assert.ok(!out.includes("ۀ"));
  assert.ok(out.includes("کننده‌ی نخست"), out);
  assert.ok(out.includes("خانه‌ی ما"), out);
  assert.ok(persianize("تأمین").includes("تأمین"), "همزهٔ روی الف (حرف واقعی) دست نمی‌خورد");
});

test("تاریخ run جدای چپ‌به‌راست می‌گیرد، متن اطرافش راست‌به‌چپ می‌ماند", () => {
  const xml = textRuns("مورخ ۱۴۰۵/۰۶/۱۹ رسید", RPR, ltrOf(RPR));
  const runs = [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
  assert.equal(runs.length, 3);
  assert.ok(runs[0].includes("<w:rtl/>") && runs[0].includes("مورخ "));
  assert.ok(!runs[1].includes("<w:rtl/>") && runs[1].includes("۱۴۰۵/۰۶/۱۹"), "تاریخ بی <w:rtl/>");
  assert.ok(runs[2].includes("<w:rtl/>") && runs[2].includes(" رسید"));
  assert.ok(textRuns("بدون تاریخ", RPR, ltrOf(RPR)).includes("<w:rtl/>"));
  assert.equal([...textRuns("", RPR, ltrOf(RPR)).matchAll(/<w:r>/g)].length, 1, "سطر خالی هم یک run دارد");
});

test("فیلد تاریخِ سربرگ در run جدای چپ‌به‌راست پر می‌شود", () => {
  const hdr = `<w:p><w:r><w:rPr><w:rFonts w:cs="B Lotus"/><w:sz w:val="18"/><w:rtl/></w:rPr><w:t>تاریخ:</w:t></w:r></w:p>`
    + `<w:p><w:r><w:rPr><w:rtl/></w:rPr><w:t>شماره:</w:t></w:r></w:p>`;
  const out = fillHeader(hdr, { date: "1405/06/19", number: "ت/۱۲" });
  const runs = [...out.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
  assert.equal(runs.length, 4, "برای هر برچسب یک run تازه");
  assert.ok(runs[1].includes("۱۴۰۵/۰۶/۱۹") && !runs[1].includes("<w:rtl/>"), "تاریخ چپ‌به‌راست");
  assert.ok(runs[1].includes('w:cs="B Lotus"'), "همان قلمِ برچسب");
  assert.ok(runs[3].includes("ت/۱۲"));
});

test("بدنهٔ نامه: تاریخ داخل متن هم run چپ‌به‌راست دارد", () => {
  const tpl = `<w:document><w:body><w:p/><w:sectPr/></w:body></w:document>`;
  const xml = buildDocumentXml(tpl, { paragraphs: ["مورخ 18/06/1405 اخذ شد."], to: "کمیسیون" });
  assert.ok(xml.includes("۱۴۰۵/۰۶/۱۸"), "تاریخ سال-اول شد");
  const dateRun = [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]).find((r) => r.includes("۱۴۰۵/۰۶/۱۸"));
  assert.ok(dateRun && !dateRun.includes("<w:rtl/>"));
});

/* ---------- برگهٔ درخواست خرید ---------- */
const D = {
  company: "تونل سد آریانا", date: "1405/06/19", expert: "آقای بهمنی",
  request: { id: "3400976", date: "1405/06/19", center: "", requester: "", party: "مرکز هزینه ایستگاه پمپاژ", party_type: "مرکز هزینه", buy_flow: "جزئی", head_req_type: "کالا", deadline: "1405/06/24" },
  items: [{ id: 1, code: "K1", title: "تابلو برق 1/5*1", qty: 1, unit: "عدد", need_date: "1405/06/19", consumer: "پمپاژ", src_status: "ثبت شده" },
    { id: 2, code: "K2", title: "تابلو برق 50*40", qty: 1, unit: "عدد", need_date: "1405/06/19", consumer: "پمپاژ", src_status: "ثبت شده" }],
  quotes: [{ item_id: 1, supplier_name: "آریا صنعت", saved: 1, final: 1 }],
};

test("برگهٔ درخواست: هیچ XML escape‌شده‌ای در متن نیست", async () => {
  const xml = requestDocumentXml(requestSheetData(D));
  const t = texts(xml);
  assert.ok(t.length > 20);
  for (const x of t) {
    assert.ok(!x.includes("&lt;w:") && !x.includes("w:rPr") && !x.includes("&quot;"), "متنِ خام XML در خانه: " + x.slice(0, 60));
  }
  assert.ok(t.includes("درخواست خرید") && t.some((x) => x.includes("تونل سد آریانا")), "عنوان و نام شرکت به‌عنوان متن");
  assert.ok(t.some((x) => x.startsWith("شماره صفحه")) && t.some((x) => x.startsWith("تاریخ گزارش")));
  assert.ok(t.includes("نام صادر کننده") && t.includes("امضا"));
  /* هیچ ویژگی XML رقم‌فارسی نشده */
  assert.ok(!/w:val="[۰-۹]/.test(xml), "عددهای داخل ویژگی‌ها دست نخورده‌اند");
});

test("برگهٔ درخواست: تاریخ‌ها run چپ‌به‌راست دارند و ساختار جدول‌ها متوازن است", async () => {
  const xml = requestDocumentXml(requestSheetData(D));
  const dateRuns = [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]).filter((r) => r.includes("۱۴۰۵/۰۶/"));
  assert.ok(dateRuns.length >= 4, "تاریخ درخواست، تاریخ گزارش، تاریخ نیاز، مهلت");
  assert.ok(dateRuns.every((r) => !r.includes("<w:rtl/>")), "همهٔ تاریخ‌ها چپ‌به‌راست");
  for (const tag of ["w:tbl", "w:tr", "w:tc", "w:p", "w:r"]) {
    const open = (xml.match(new RegExp(`<${tag}>`, "g")) || []).length, close = (xml.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, tag);
  }
  const buf = Buffer.from(await (await renderRequestDoc(D)).arrayBuffer());
  assert.deepEqual([...buf.slice(0, 2)], [0x50, 0x4b]);
  assert.ok((await unzip(buf)).some((e) => e.name === "word/document.xml"));
});

/* ---------- جدول کمیسیون ---------- */
test("جدول کمیسیون فقط قلم‌های تیک‌خورده را دارد", () => {
  const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, title: "قلم " + n, qty: 1, unit: "عدد" }));
  const quotes = items.map((it) => ({ item_id: it.id, supplier_name: "آریا", saved: 1, final: it.id === 2 || it.id === 5 ? 1 : 0, price: 1000 * it.id, qty: 1, vat: "دارد" }));
  const html = commissionHtml({ request: { id: "R" }, items, quotes, notes: "", expert: "x", company: "c", date: "1405/06/19" });
  const rowTitles = [...html.matchAll(/<td class="rt">(قلم \d)<\/td>/g)].map((m) => m[1]);
  assert.deepEqual(rowTitles, ["قلم 2", "قلم 5"], "فقط دو قلمِ تیک‌خورده");
  assert.ok(html.includes("۷٬۰۰۰"), "جمع = ۲۰۰۰ + ۵۰۰۰");
  assert.ok(!html.includes("۲۸٬۰۰۰"), "جمعِ هفت قلم نباید باشد");
});
