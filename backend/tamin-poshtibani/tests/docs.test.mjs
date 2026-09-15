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
import { commissionHtml, commissionXlsx } from "../../../worker/sheets.js";

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
  request: { id: "3400976", date: "1405/06/19", center: "", requester: "", party: "مرکز هزینه ایستگاه پمپاژ", party_type: "مرکز هزینه", buy_flow: "جزئی", req_type: "کالا", head_req_type: "فوری", deadline: "1405/06/24" },
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
  assert.ok(dateRuns.length >= 4, "تاریخ درخواست، تاریخ گزارش، تاریخ نیازِ هر قلم");
  assert.ok(dateRuns.every((r) => !r.includes("<w:rtl/>")), "همهٔ تاریخ‌ها چپ‌به‌راست");
  for (const tag of ["w:tbl", "w:tr", "w:tc", "w:p", "w:r"]) {
    const open = (xml.match(new RegExp(`<${tag}>`, "g")) || []).length, close = (xml.match(new RegExp(`</${tag}>`, "g")) || []).length;
    assert.equal(open, close, tag);
  }
  const buf = Buffer.from(await (await renderRequestDoc(D)).arrayBuffer());
  assert.deepEqual([...buf.slice(0, 2)], [0x50, 0x4b]);
  assert.ok((await unzip(buf)).some((e) => e.name === "word/document.xml"));
});

test("برگهٔ درخواست فقط از دادهٔ فایل اکسل پر می‌شود: نه تأمین‌کنندهٔ استعلام، نه مهلت، نه کارشناسِ ارجاع", async () => {
  const d = { ...D, assignment: { expert_name: "کارشناسِ ارجاع" },
    items: D.items.map((i, k) => ({ ...i, src_expert: k ? "ابوذر بهمنی" : "" })) };
  const dt = requestSheetData(d);
  assert.deepEqual(dt.items.map((i) => i.expert), ["", "ابوذر بهمنی"]);
  assert.ok(!("supplier" in dt.items[0]) && !("deadline" in dt) && !("expert" in dt));
  const xml = requestDocumentXml(dt);
  const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|");
  assert.ok(!text.includes("آریا صنعت"), "تأمین‌کنندهٔ استعلام در برگه نیست");
  assert.ok(!text.includes("۱۴۰۵/۰۶/۲۴") && !text.includes("1405/06/24"), "مهلت ارجاع در برگه نیست");
  assert.ok(!text.includes("کارشناسِ ارجاع") && !text.includes("آقای بهمنی"), "کارشناسِ ارجاع در برگه نیست");
  assert.ok(text.includes("ابوذر بهمنی"), "کارشناسِ ستون فایل در برگه هست");
  assert.equal(dt.request.item_type, "کالا", "بی ستونِ «نوع قلم»، نوع درخواست فایل می‌نشیند — نه «فوری/عادی» سرآیند کمیسیون");
  /* ستون‌های خروجی تازهٔ راهکاران: واحد/رمز تامین و نوع قلم روی درخواست، مهلت استعلام روی هر قلم */
  const dt2 = requestSheetData({ ...d, request: { ...d.request, supply_unit: "دفتر مرکزی", item_type: "خدمت" }, items: d.items.map((i) => ({ ...i, quote_deadline: "1405/06/20" })) });
  assert.equal(dt2.request.supplyUnit, "دفتر مرکزی");
  assert.equal(dt2.request.item_type, "خدمت");
  const xml2 = requestDocumentXml(dt2);
  const t2 = [...xml2.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("|");
  assert.ok(t2.includes("دفتر مرکزی") && t2.includes("۱۴۰۵/۰۶/۲۰"), "واحد تامین و مهلت استعلامِ فایل روی برگه هست");
});

/* ---------- جدول کمیسیون ---------- */
test("جدول کمیسیون فقط قلم‌های تیک‌خورده را دارد، و xlsx واقعی با لوگوست", async () => {
  const items = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, title: "قلم " + n, qty: 1, unit: "عدد" }));
  const quotes = items.map((it) => ({ item_id: it.id, supplier_name: "آریا", saved: 1, final: it.id === 2 || it.id === 5 ? 1 : 0, price: 1000 * it.id, qty: 1, vat: "دارد" }));
  const d = { request: { id: "R" }, items, quotes, notes: "", expert: "x", company: "c", date: "1405/06/19", commission_no: 7 };
  const html = commissionHtml(d);
  /* HTML رقم فارسی دارد، مثل قلمِ B Nazanin در اکسل */
  const cells = html.replace(/<[^>]+>/g, "|");
  assert.ok(cells.includes("|قلم ۲|") && cells.includes("|قلم ۵|"), "دو قلمِ تیک‌خورده هست");
  for (const n of ["۱", "۳", "۴", "۶", "۷"]) assert.ok(!cells.includes(`|قلم ${n}|`), `قلم ${n} نباید باشد`);
  assert.ok(html.includes("۷٬۰۰۰"), "جمع = ۲۰۰۰ + ۵۰۰۰");
  assert.ok(!html.includes("۲۸٬۰۰۰"), "جمعِ هفت قلم نباید باشد");
  /* کد فرم: شمارهٔ ترتیبی جدول‌های کمیسیون (تصمیم مدیر)، نه شمارهٔ ثابت ۰۲ */
  assert.ok(html.includes("مقایسه استعلام بها") && html.includes("TSA-PS-FO-۷") && !html.includes("TSA-PS-FO-۰۲"), "سربرگ فرم با شمارهٔ ترتیبی");
  assert.ok(commissionHtml({ ...d, commission_no: null }).includes("TSA-PS-FO-—"), "پیش از تولید، شماره ندارد");
  const buf = Buffer.from(await (await commissionXlsx(d)).arrayBuffer());
  assert.deepEqual([...buf.slice(0, 2)], [0x50, 0x4b]);
  const names = (await unzip(buf)).map((e) => e.name);
  for (const n of ["xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml", "xl/drawings/drawing1.xml", "xl/media/image1.png"]) assert.ok(names.includes(n), n);
});
