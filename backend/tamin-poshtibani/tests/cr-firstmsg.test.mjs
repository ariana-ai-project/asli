/* ============================================================
   «✉️ پیام اول» (فاز ۳؛ سند طراحی، بخش ۱؛ تصمیم‌های ۱ و ۶)
   • قالب‌های استاندارد با جای‌خالی‌های تازه؛ خانوادهٔ محتاط بی مقدار
   • قالبِ پیش‌فرضِ درخواست، قالب یا متنِ جدا برای هر تأمین‌کننده؛ متنِ ممنوع (نامِ دیگران، شمارِ پیشنهادها) ذخیره نمی‌شود
   • متنِ متفاوت در حالتِ محتاط: گیرندگانِ پیاپی گونه‌های دیگر
   • کارشناس هوشمند در دعوت همین متن را می‌فرستد؛ کلید خاموش ← همان دعوتِ پیشین
   • «📚 قالب‌های پیام» (درخواست مالک، مهر ۱۴۰۵): یک کتابخانه با جستجوی هوشمند و بات، سیزده جای‌خالیِ یکی، «فعال» برای هر
     کارشناس (فقط فعال‌ها گزینه‌اند، دست‌کم یکی فعال)، و قاعدهٔ علت: ردیفی که با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض؛
     برگشت به پیش‌فرض هم) علت می‌خواهد و «🚀 شروع» بی آن ۴۰۹ است؛ گونه‌های خودکارِ متن فرق نیستند
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { fillFm, fmCheck, qtyRange, STD, stdList, stdKey, FAMILY_OF_MODE, fmReasons, fmDefKey, fmTextFor, tplLib, tplCheck, FM_TOKENS } from "../../../worker/first-msg.js";
import { fillTemplate, defaultTemplates, TEMPLATE_TOKENS } from "../../../worker/templates.js";
import { TOKENS as FRONT_TOKENS, fillMsg } from "../../../frontend/tamin-poshtibani/msg-fill.mjs";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { nkey } from "../../../worker/sp-core.js";

const items = [{ title: "ورق سیاه ۳ میل", qty: 1200, unit: "کیلوگرم", spec: "ST37", fixed: ["ضخامت: ۳ میل", "شرایط تسویه: نقدی"], open: ["برند: —"], due: "1405/08/10" }];

test("قالب‌های استاندارد: پنج خانواده، دست‌کم دو گونه، همه با «دستیار هوشمند» و «کمیسیون»", () => {
  assert.deepEqual(Object.keys(STD).sort(), ["cautious", "consult", "index", "max", "oem"]);
  for (const [f, vs] of Object.entries(STD)) {
    assert.ok(vs.length >= 2, f);
    for (const b of vs) { assert.match(b, /دستیار هوشمند/); assert.match(b, /کمیسیون/); assert.match(b, /\{فهرست اقلام\}/); }
  }
  assert.equal(stdList().length, Object.values(STD).reduce((s, v) => s + v.length, 0));
  assert.equal(FAMILY_OF_MODE.LIMITED_STAGED, "cautious");
  assert.equal(stdKey("max", 0), "std:max:1");
});

test("پر کردن: فهرست اقلام، ثابت و قابل تغییر، موارد لازم؛ در خانوادهٔ محتاط بی مقدار", () => {
  const ctx = { company: "تونل سد آریانا", supplier: "آهن الف", expertName: "آقای یک", family: "max", items, must: ["قیمت واحد", "زمان تحویل"] };
  const t = fillFm(STD.max[0], ctx);
  assert.match(t, /• ورق سیاه ۳ میل — ۱۲۰۰ کیلوگرم/);
  assert.match(t, /ضخامت: ۳ میل، شرایط تسویه: نقدی/);
  assert.match(t, /برند: —/);
  assert.match(t, /قیمت واحد، زمان تحویل/);
  assert.match(t, /تونل سد آریانا/);
  assert.doesNotMatch(t, /\{[^}]+\}/, "جای‌خالیِ پرنشده نماند");
  const c = fillFm(STD.cautious[0], { ...ctx, family: "cautious" });
  assert.doesNotMatch(c, /۱۲۰۰/, "محتاط: مقدارِ کامل نه");
  assert.match(c, /• ورق سیاه ۳ میل — حدود ۶۰۰ تا ۲۰۰۰ کیلوگرم/, "بازهٔ متعارف (تصمیم ۱۲)");
  assert.match(c, /مقدار نهایی پس از جمع‌بندی/);
  assert.equal(fillFm("{مقدار} {واحد}", { ...ctx, family: "cautious" }), "حدود ۶۰۰ تا ۲۰۰۰ کیلوگرم");
  assert.match(fillFm(STD.cautious[0], { ...ctx, family: "cautious", items: [{ ...items[0], qty: null }] }), /• ورق سیاه ۳ میل\n/, "بی مقدار: بی بازه، ساختگی نه");
  /* جای‌خالی‌های قبلی هم کار می‌کنند */
  assert.equal(fillFm("{تامین‌کننده} — {عنوان قلم} {مقدار} {واحد} — {نام کارشناس}", ctx), "آهن الف — ورق سیاه ۳ میل ۱۲۰۰ کیلوگرم — آقای یک");
});

test("سنجشِ افشا: نامِ دیگران و شمارِ پیشنهادها نمی‌رود؛ فوریت و مقدارِ کامل در محتاط هشدار", () => {
  const ok = fmCheck(fillFm(STD.max[1], { company: "ش", family: "max", items, must: [] }), { otherNames: ["آهن ب"], family: "max", items });
  assert.deepEqual(ok.block, []);
  const bad = fmCheck("سلام، آهن ب ارزان‌تر داد و از پنج فروشنده قیمت گرفتیم؛ حد ما ۱۰۰ است.", { otherNames: ["آهن ب"], family: "max", items });
  assert.ok(bad.block.some((x) => x.includes("آهن ب")));
  assert.ok(bad.block.some((x) => x.includes("شمار")));
  assert.ok(bad.block.some((x) => x.includes("حد ما")));
  const w = fmCheck("کار فوری است؛ ۱۲۰۰ کیلوگرم لازم داریم.", { otherNames: [], family: "cautious", items });
  assert.deepEqual(w.block, []);
  assert.ok(w.warn.some((x) => x.includes("فوری")));
  assert.ok(w.warn.some((x) => x.includes("مقدارِ کامل")));
});

test("بازهٔ متعارف: مقدارِ واقعی همیشه درونِ بازه و خودش گفته نمی‌شود؛ گرد", () => {
  assert.deepEqual(qtyRange(30), { lo: 15, hi: 45 });
  assert.deepEqual(qtyRange(1200), { lo: 600, hi: 2000 });
  assert.deepEqual(qtyRange(12), { lo: 6, hi: 20 });
  assert.deepEqual(qtyRange(1), { lo: 1, hi: 2 });
  assert.equal(qtyRange(null), null);
  assert.equal(qtyRange(0), null);
  for (const q of [2, 3, 7, 10, 18, 55, 99, 100, 101, 250, 999, 1000, 4321, 25000, 2.5]) {
    const r = qtyRange(q);
    assert.ok(r.lo < q && q < r.hi, `${q} درونِ ${r.lo}..${r.hi}`);
    assert.ok(r.lo >= 1);
  }
});

/* ------------------------------------------------------------------ */
/* جای‌خالی‌های یکی (پیام اول، جستجوی هوشمند، بات)                         */
/* ------------------------------------------------------------------ */
/* {مشخصات ثابت} و {قابل تغییر} جدا سنجیده می‌شوند: خالی‌شان کلِ همان بند را برمی‌دارد */
const ALL = "{شرکت}|{تامین‌کننده}|{فهرست اقلام}|{عنوان قلم}|{مقدار}|{واحد}|{مشخصات فنی}|{موارد لازم}|{تاریخ تحویل}|{مهلت پاسخ}|{نام کارشناس}";

test("جای‌خالی‌ها یکی‌اند: سیزده‌تا در پنل، Worker و بات؛ هر کدام در پیامِ تک‌قلمیِ جستجوی هوشمند هم پر می‌شود", () => {
  assert.equal(TEMPLATE_TOKENS, FM_TOKENS);
  assert.equal(TEMPLATE_TOKENS, FRONT_TOKENS, "پنل و Worker همان فهرست");
  assert.equal(TEMPLATE_TOKENS.length, 13);
  for (const t of ["شرکت", "فهرست اقلام", "مشخصات ثابت", "قابل تغییر", "موارد لازم", "تاریخ تحویل", "مهلت پاسخ", "عنوان قلم", "مقدار", "واحد", "مشخصات فنی", "تامین‌کننده", "نام کارشناس"]) assert.ok(TEMPLATE_TOKENS.includes(t), t);
  /* جستجوی هوشمند و بات بی زمینهٔ قلم: خودِ قلم؛ بندِ ثابت و قابل تغییرِ خالی نمی‌آید؛ موارد لازم و مهلت پیش‌فرض */
  const it = { title: "پیچ آلن M8", qty: 100, unit: "عدد", spec: "فولادی", need_date: "1405/09/01" };
  const one = fillTemplate(ALL, { supplier: "آهن الف", item: it, expertName: "آقای یک", company: "تونل سد آریانا" });
  assert.equal(one, "تونل سد آریانا|آهن الف|• پیچ آلن M8 — ۱۰۰ عدد|پیچ آلن M8|۱۰۰|عدد|فولادی|قیمت واحد، زمان تحویل و شرایط تسویه|1405/09/01|پایان روز کاری بعد|آقای یک");
  assert.equal(fillTemplate("سلام {تامین‌کننده}.\nثابت: {مشخصات ثابت}\nقیمت بدهید.", { supplier: "ب", item: it }), "سلام ب.\nقیمت بدهید.", "بندِ ثابتِ خالی نمی‌آید");
  /* با زمینهٔ قلم (ai-agent.js:tplCtx) همان لایه‌های 🔒/🔓 */
  const ctx = { company: "ش", expertName: "آقای یک", family: "max", must: [], items: [{ title: "پیچ آلن M8", qty: 100, unit: "عدد", spec: "فولادی", fixed: ["قطر: M8"], open: ["برند: —"], due: "1405/09/01" }] };
  assert.equal(fillTemplate("ثابت: {مشخصات ثابت} · آزاد: {قابل تغییر} · {تاریخ تحویل}", { supplier: "ب", ctx }), "ثابت: قطر: M8 · آزاد: برند: — · 1405/09/01");
  /* نامِ جای‌خالی با «أ» یا بی نیم‌فاصله هم؛ ناشناخته دست نمی‌خورد */
  assert.equal(fillTemplate("{تأمین‌کننده} {تامین کننده} {ناشناخته}", { supplier: "ب", item: it }), "ب ب {ناشناخته}");
  /* قالب‌های پیشینِ جستجوی هوشمند همان‌طور پر می‌شوند (رقمِ فارسی، همان پیامِ «پیام اول») */
  const [, , formal] = defaultTemplates("تونل سد آریانا");
  assert.equal(fillTemplate(formal.body, { supplier: "ب", item: it, expertName: "آقای یک" }),
    "با سلام و احترام\nشرکت تونل سد آریانا در نظر دارد نسبت به تامین پیچ آلن M8 به مقدار ۱۰۰ عدد با مشخصات فولادی اقدام نماید.\nخواهشمند است قیمت، شرایط پرداخت و زمان تحویل را اعلام فرمایید.\nبا تشکر — آقای یک");
});

test("پیامِ چندقلمیِ «پیام اول»: جای‌خالی‌های تک‌قلمی همهٔ اقلام را می‌گویند — {واحد} در خودِ مقدار؛ محتاط با بازه", () => {
  const two = [items[0], { title: "پیچ M10", qty: 30, unit: "عدد", spec: "", fixed: [], open: [] }];
  const ctx = { company: "ش", supplier: "آهن الف", family: "max", items: two, must: [] };
  assert.equal(fillFm("برای {عنوان قلم} به مقدار {مقدار} {واحد} قیمت بدهید — {مشخصات فنی}", ctx), "برای ورق سیاه ۳ میل و پیچ M10 به مقدار ۱۲۰۰ کیلوگرم و ۳۰ عدد قیمت بدهید — ورق سیاه ۳ میل: ST37");
  assert.equal(fillFm("{فهرست اقلام}", ctx), "• ورق سیاه ۳ میل — ۱۲۰۰ کیلوگرم\n• پیچ M10 — ۳۰ عدد");
  assert.equal(fillFm("{مقدار} {واحد}.", { ...ctx, family: "cautious" }), "حدود ۶۰۰ تا ۲۰۰۰ کیلوگرم و حدود ۱۵ تا ۴۵ عدد.");
  assert.equal(fillMsg("{عنوان قلم}", { items: [...two, { title: "مهره" }] }), "ورق سیاه ۳ میل، پیچ M10 و مهره");
});

/* ------------------------------------------------------------------ */
/* قاعدهٔ علت و قالبِ مؤثر (توابعِ خالص)                                    */
/* ------------------------------------------------------------------ */
const R = (effs, why = {}, go = []) => effs.map((eff, i) => ({ k: `s${i + 1}`, eff, why: why[`s${i + 1}`] || "", go: go.includes(`s${i + 1}`) }));
const miss = (rows, def = "D") => fmReasons(rows, def).map((r) => r.k);

test("قاعدهٔ علت: ردیفی که با ردیفِ بالایی فرق دارد (ردیفِ اول با پیش‌فرض) علت می‌خواهد — برگشت به پیش‌فرض هم", () => {
  /* ردیف‌های ۱ تا ۳ همان پیش‌فرض، ردیفِ ۴ متفاوت ← فقط ردیفِ ۴ */
  assert.deepEqual(miss(R(["D", "D", "D", "X"])), ["s4"]);
  /* ردیفِ ۲ با ۱ فرق دارد ← ۲؛ ردیفِ ۳ با ۲ فرق دارد (برگشت به پیش‌فرض) ← ۳ هم */
  assert.deepEqual(miss(R(["D", "X", "D", "D"])), ["s2", "s3"]);
  /* ردیفِ اول با پیش‌فرض می‌سنجد؛ ردیف‌های پیاپیِ یک قالب یک علت */
  assert.deepEqual(miss(R(["X", "X", "Y", "Y"])), ["s1", "s3"]);
  const rows = R(["D", "X", "D"]);
  fmReasons(rows, "D");
  assert.deepEqual(rows.map((r) => [r.diff, r.need_why]), [[false, false], [true, true], [true, true]]);
  /* علتِ نوشته‌شده کافی است؛ ردیفِ سپرده‌شده (پیامش رفته) در زنجیره می‌ماند ولی علت نمی‌خواهد */
  assert.deepEqual(miss(R(["D", "X", "D"], { s2: "فقط به نامهٔ رسمی پاسخ می‌دهد" })), ["s3"]);
  assert.deepEqual(miss(R(["D", "X", "D"], {}, ["s2"])), ["s3"]);
  /* «✏️ متنِ دستی» همیشه مقدارِ جدایی است: دو متنِ دستیِ پیاپی هر دو علت می‌خواهند */
  assert.deepEqual(miss(R(["D", "✏️:s2", "✏️:s3", "D"])), ["s2", "s3", "s4"]);
});

test("قالبِ مؤثر: گونه‌های خودکارِ متن (ضدتبانی) همان قالب‌اند — فقط گونه‌های فعال می‌چرخند؛ پیش‌فرض از قالب‌های فعال", async () => {
  const lib = stdList().map((t) => ({ ...t, def_on: t.family === "cautious", active: t.family === "cautious" }));
  const ctx = { family: "cautious", variation: true, items, must: [] };
  const choices = { def: null, per: {}, varOff: null };
  const ex = { id: 1, label: "آقای یک" };
  const at = (idx, L = lib, c = choices) => fmTextFor(null, { aid: 1, expert: ex, supplier: "آهن الف", k: `s${idx}`, ctx, choices: c, lib: L, idx, company: "ش" });
  const rs = await Promise.all([0, 1, 2].map((i) => at(i)));
  assert.deepEqual(rs.map((r) => r.tpl), ["std:cautious:1", "std:cautious:2", "std:cautious:3"], "هر گیرنده گونهٔ دیگر");
  assert.ok(rs.every((r) => r.base === "std:cautious:1" && r.eff === "std:cautious:1"), "ولی همان قالب — فرق نیست");
  assert.equal(new Set(rs.map((r) => r.text)).size, 3);
  /* گونهٔ ۲ خاموش: میانِ ۱ و ۳ می‌چرخد */
  const L2 = lib.map((t) => (t.key === "std:cautious:2" ? { ...t, active: false } : t));
  assert.deepEqual((await Promise.all([0, 1, 2].map((i) => at(i, L2)))).map((r) => r.tpl), ["std:cautious:1", "std:cautious:3", "std:cautious:1"]);
  /* قالبِ صریحِ ردیف نمی‌چرخد و ردیفِ بی قالبِ هم‌جایگاهش می‌چرخد؛ متنِ دستی مقدارِ جداست */
  const c2 = { def: null, varOff: null, per: { s1: { tpl: "std:cautious:1" }, s2: { body: "سلام؛ قیمت بدهید." } } };
  const f = (k, idx) => fmTextFor(null, { aid: 1, expert: ex, supplier: "آهن الف", k, ctx, choices: c2, lib, idx, company: "ش" });
  const r1 = await f("s1", 1);
  assert.equal(r1.tpl, "std:cautious:1", "قالبِ صریح نمی‌چرخد");
  assert.equal(r1.eff, "std:cautious:1", "و با پیش‌فرض فرقی ندارد");
  assert.equal((await f("s3", 1)).tpl, "std:cautious:2", "ردیفِ بی قالب می‌چرخد");
  const r2 = await f("s2", 1);
  assert.equal(r2.eff, "✏️:s2");
  assert.equal(r2.text, "سلام؛ قیمت بدهید.");
  /* پیش‌فرضِ مؤثر */
  assert.equal(fmDefKey(choices, lib, "cautious"), "std:cautious:1");
  assert.equal(fmDefKey(choices, lib.map((t) => (t.key === "std:cautious:1" ? { ...t, active: false } : t)), "cautious"), "std:cautious:2", "آمادهٔ اول خاموش: نخستین فعال");
  assert.equal(fmDefKey({ def: { tpl: "std:max:1" } }, lib, "cautious"), "std:max:1", "انتخابِ پیشینِ خاموش‌شده بی‌صدا عوض نمی‌شود");
  assert.equal(fmDefKey({ def: { tpl: "999" } }, lib, "cautious"), "std:cautious:1", "قالبِ حذف‌شده ← پیش‌فرض");
});

test("سنجشِ افشای قالب پیش از ذخیره: نامِ تأمین‌کننده، واژهٔ درونی و شمارِ پیشنهادها نه؛ جای‌خالی و فوریت (هشدار) آری", () => {
  assert.deepEqual(tplCheck("سلام {تامین‌کننده}؛ {فهرست اقلام}", ["آهن الف"]).block, []);
  assert.ok(tplCheck("سلام؛ آهن الف هم قیمت داده", ["آهن الف"]).block.some((x) => x.includes("آهن الف")));
  assert.ok(tplCheck("حد ما ۱۰۰ است").block.length);
  assert.ok(tplCheck("از سه فروشنده قیمت گرفتیم").block.length);
  const w = tplCheck("کار فوری است");
  assert.deepEqual(w.block, []);
  assert.ok(w.warn.length);
});

/* ------------------------------------------------------------------ */
/* مسیرهای سرور: کتابخانه، «فعال»، قاعدهٔ علت و دروازهٔ «🚀 شروع»          */
/* ------------------------------------------------------------------ */
const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, MANAGER_CODE: "1234", COMPANY: "تونل سد آریانا", TG_BOT_TOKEN: "tok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", SITE_ORIGIN: "https://site.test" };
globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
const EX = { "X-Expert-Code": "7101" }, EX2 = { "X-Expert-Code": "7102" };
const NAMES = ["آهن الف", "فولاد بهمن", "صنایع پارس", "بازرگانی تهران"];
const K = NAMES.map((n) => nkey(n));
const pend = [];
async function call(path, { method, body, headers } = {}) {
  const h = { ...(headers || {}) }; let b;
  if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil: (p) => pend.push(p) });
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data };
}
const put = (body) => call("/items/91/first-msg", { method: "PUT", headers: EX, body });
const act = (d) => d.templates.filter((x) => x.active).map((x) => x.key);
if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,created_at) VALUES (1,'کارشناس یک','آقای یک','7101',1,1,?), (2,'کارشناس دو','آقای دو','7102',1,1,?)").run(t, t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 60000, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-9','1405/07/20','پروژهٔ نه')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (9,'R-9',1,5,?,?,?)").run(t, t + 9e8, t);
  /* فهرستِ دعوت با چهار تیک‌خورده به همین ترتیب */
  const ent = (name) => ({ k: nkey(name), name, src: "manual", pos: null, top: false, on: true, why: null, grade: null, rankF: null, score: null, buys: null, last: null, ph: [], sid: null, go: null });
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,code,title,spec,qty,unit,need_date,state,assignment_id,norm_json,pick_json) VALUES (91,'R-9','a',1,'5001','ورق سیاه ۳ میل','ST37',1200,'کیلوگرم','1405/08/10','open',9,?,?)")
    .run(JSON.stringify({ v: 2, head: "ورق", layers: { "ضخامت": "۳ میل" }, source: "catalog" }), JSON.stringify({ v: 1, at: t, by: "expert:1", rule: null, n: 0, msg: null, top_n: 0, list: NAMES.map(ent) }));
  DB.raw.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES ('crFlags',?,?)").run(JSON.stringify({ firstmsg: 1 }), t);
  DB.raw.prepare(`INSERT INTO templates (id,expert_id,title,body,created_at) VALUES (11,1,'رسمی','با سلام؛ {شرکت} برای {عنوان قلم} به مقدار {مقدار} {واحد} قیمت می‌خواهد. {نام کارشناس}',?),
    (12,1,'کوتاه','سلام {تامین‌کننده}؛ قیمتِ این اقلام را تا {مهلت پاسخ} بفرمایید:\n{فهرست اقلام}',?), (13,NULL,'مشترک','سلام؛ استعلامِ {عنوان قلم}.',?), (14,2,'مالِ دیگری','سلام',?)`).run(t, t, t, t);
}

test("«📚 قالب‌های پیام»: قالب‌های امروز و آماده‌های همان خانواده فعال؛ روشن و خاموش جدا برای هر کارشناس؛ دست‌کم یکی فعال می‌ماند", { skip: SKIP }, async () => {
  const g = await call("/items/91/first-msg", { headers: EX });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.equal(g.data.family, "max");
  assert.deepEqual(act(g.data), ["std:max:1", "std:max:2", "11", "12", "13"]);
  assert.ok(!g.data.templates.some((x) => x.key === "14"), "قالبِ کارشناسِ دیگر نه");
  assert.equal(g.data.def_eff, "std:max:1");
  assert.equal(g.data.tokens.length, 13);
  assert.deepEqual(g.data.ctx.items[0].fixed, ["ضخامت: ۳ میل"], "زمینهٔ پیش‌نمایشِ ویرایشگر");
  assert.deepEqual(g.data.rows.map((r) => r.k), K, "به ترتیبِ فهرستِ دعوت");
  let r = await put({ active: { "std:max:1": false, "std:oem:1": true, "11": false, "13": false } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(act(r.data), ["std:max:2", "std:oem:1", "12"]);
  assert.equal(r.data.def_eff, "std:max:2", "آمادهٔ اول خاموش شد: نخستین قالبِ فعال");
  assert.equal(DB.raw.prepare("SELECT active FROM templates WHERE id=11").get().active, 0, "قالبِ خودِ کارشناس: templates.active");
  assert.deepEqual(DB.raw.prepare("SELECT key, active FROM tpl_prefs WHERE expert_id=1 ORDER BY key").all().map((x) => [x.key, x.active]), [["13", 0], ["std:max:1", 0], ["std:oem:1", 1]]);
  const lib2 = await tplLib(env, 2, "max");
  assert.ok(lib2.find((x) => x.key === "13").active && lib2.find((x) => x.key === "std:max:1").active, "ترجیحِ هر کارشناس جداست");
  r = await put({ active: { "std:max:1": true, "11": true, "13": true } });
  assert.deepEqual(act(r.data), ["std:max:1", "std:max:2", "std:oem:1", "11", "12", "13"]);
  assert.deepEqual(DB.raw.prepare("SELECT key FROM tpl_prefs WHERE expert_id=1").all().map((x) => x.key), ["std:oem:1"], "برگشت به پیش‌فرض: ترجیح پاک می‌شود");
  const z = await put({ active: Object.fromEntries(r.data.templates.map((x) => [x.key, false])) });
  assert.equal(z.status, 422);
  assert.equal(z.data.need_active, true);
  assert.deepEqual(act((await call("/items/91/first-msg", { headers: EX })).data), act(r.data), "چیزی ننشست");
  assert.equal((await put({ active: { "999": false } })).status, 422);
});

test("فقط قالب‌های فعال انتخاب می‌شوند؛ انتخابِ پیشینی که بعداً خاموش شد بی‌صدا عوض نمی‌شود", { skip: SKIP }, async () => {
  await put({ active: { "11": false } });
  assert.equal((await put({ def: "11" })).status, 422);
  assert.equal((await put({ per: { [K[0]]: { tpl: "std:cautious:1" } } })).status, 422, "آمادهٔ خانوادهٔ دیگر خاموش است");
  let r = await put({ def: "12" });
  assert.equal(r.status, 200);
  assert.equal(r.data.def_eff, "12");
  assert.match(r.data.rows[0].text, /^سلام آهن الف؛ قیمتِ این اقلام را تا پایان روز کاری بعد بفرمایید:\n• ورق سیاه ۳ میل — ۱۲۰۰ کیلوگرم$/);
  r = await put({ active: { "12": false, "11": true } });
  assert.equal(r.data.def, "12");
  assert.equal(r.data.def_eff, "12", "پیش‌فرضِ خاموش‌شده همان می‌ماند و کادر «غیرفعال» نشانش می‌دهد");
  assert.equal(r.data.templates.find((x) => x.key === "12").active, false);
  r = await put({ def: null, active: { "12": true } });
  assert.equal(r.data.def_eff, "std:max:1");
});

test("قاعدهٔ علت روی مسیر: ردیفِ متفاوت با ردیفِ بالایی علت می‌خواهد — برگشت به پیش‌فرض هم؛ علت با برگشت نمی‌رود", { skip: SKIP }, async () => {
  /* ردیف‌های ۱ تا ۳ پیش‌فرض، ردیفِ ۴ قالبِ دیگر ← فقط ردیفِ ۴ */
  let r = await put({ per: { [K[3]]: { tpl: "11" } } });
  assert.deepEqual(r.data.rows.map((x) => x.diff), [false, false, false, true]);
  assert.deepEqual(r.data.missing.map((x) => x.k), [K[3]]);
  /* ردیفِ ۲ با ۱ فرق دارد و ۳ با برگشت به پیش‌فرض با ۲ */
  r = await put({ per: { [K[3]]: null, [K[1]]: { tpl: "11" } } });
  assert.deepEqual(r.data.missing.map((x) => x.k), [K[1], K[2]]);
  assert.equal(r.data.rows[1].base, "11");
  /* «✏️ متنِ دستی» مقدارِ جداست */
  r = await put({ per: { [K[2]]: { body: "سلام؛ قیمتِ ورق را بفرمایید. پاسخ‌ها را دستیار هوشمند خرید ما می‌دهد." } } });
  assert.deepEqual(r.data.missing.map((x) => x.k), [K[1], K[2], K[3]]);
  assert.equal(r.data.rows[2].eff, `✏️:${K[2]}`);
  /* علت‌ها؛ برگشتِ ردیف به پیش‌فرض علتش را نگه می‌دارد */
  r = await put({ why: { [K[1]]: "فقط به نامهٔ رسمی پاسخ می‌دهد", [K[3]]: "  " } });
  assert.deepEqual(r.data.missing.map((x) => x.k), [K[2], K[3]], "علتِ خالی علت نیست");
  assert.equal(r.data.rows[1].why, "فقط به نامهٔ رسمی پاسخ می‌دهد");
  r = await put({ per: { [K[1]]: null } });
  assert.equal(DB.raw.prepare("SELECT why FROM fm_choice WHERE assignment_id=9 AND k=?").get(K[1]).why, "فقط به نامهٔ رسمی پاسخ می‌دهد");
  assert.deepEqual(r.data.missing.map((x) => x.k), [K[2], K[3]]);
  assert.equal(r.data.rows[1].diff, false, "ردیفِ ۲ دوباره همان پیش‌فرض است");
  /* ردیفی که نه قالب دارد، نه متن و نه علت، دیگر ردیفی در fm_choice ندارد */
  await put({ why: { [K[1]]: "" } });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM fm_choice WHERE assignment_id=9 AND k=?").get(K[1]).n, 0);
});

test("دروازهٔ «🚀 شروع»: بی علت ۴۰۹ با همان ردیف‌ها (ai-start و سپردنِ یکجا)؛ کادرِ شروع پیش از تأیید می‌گوید؛ با علت سپرده می‌شود", { skip: SKIP }, async () => {
  const pv = await call("/items/91/invite-preview", { headers: EX });
  assert.deepEqual(pv.data.fm_missing.map((x) => x.k), [K[2], K[3]]);
  const s0 = await call("/items/91/ai-start", { headers: EX, body: {} });
  assert.equal(s0.status, 409, JSON.stringify(s0.data));
  assert.deepEqual(s0.data.need_fm_why.map((x) => x.k), [K[2], K[3]]);
  assert.match(s0.data.error, /صنایع پارس/);
  const h0 = await call("/assignments/9/handoff", { headers: EX, body: {} });
  assert.equal(h0.status, 409, "سپردنِ یکجای کارشناس هم دور نمی‌زند");
  assert.deepEqual(h0.data.need_fm_why.map((x) => x.k), [K[2], K[3]]);
  assert.equal(DB.raw.prepare("SELECT ai_start_at FROM items WHERE id=91").get().ai_start_at, null);
  /* کلید خاموش: قاعدهٔ «پیام اول» هم نیست */
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='crFlags'").run(JSON.stringify({ firstmsg: 0 }));
  assert.deepEqual((await call("/items/91/invite-preview", { headers: EX })).data.fm_missing, []);
  DB.raw.prepare("UPDATE settings SET value=? WHERE key='crFlags'").run(JSON.stringify({ firstmsg: 1 }));
  const w = await put({ why: { [K[2]]: "تأمین‌کنندهٔ اصلی؛ پیامِ کوتاه‌تر", [K[3]]: "برگشت به پیامِ آماده" } });
  assert.deepEqual(w.data.missing, []);
  const s = await call("/items/91/ai-start", { headers: EX, body: {} });
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const after = await call("/items/91/first-msg", { headers: EX });
  assert.ok(after.data.rows.every((x) => x.go && !x.need_why), "سپرده‌شده‌ها دیگر علت نمی‌خواهند");
});

test("یک کتابخانه با جستجوی هوشمند: /templates قالب‌ها، آماده‌ها، جای‌خالی‌ها و زمینهٔ همان قلم؛ متنِ افشاگر ذخیره نمی‌شود", { skip: SKIP }, async () => {
  const g = await call("/templates?item_id=91", { headers: EX });
  assert.equal(g.status, 200);
  assert.deepEqual(g.data.templates.map((x) => x.id), [11, 12, 13]);
  assert.equal(g.data.std.length, stdList().length);
  assert.ok(g.data.std.every((x) => x.std && /^آماده — /.test(x.title)));
  assert.equal(g.data.tokens.length, 13);
  assert.deepEqual(g.data.ctx.items[0].fixed, ["ضخامت: ۳ میل"]);
  assert.equal(g.data.ctx.items[0].due, "1405/08/10");
  assert.equal(g.data.ctx.family, "max", "بی سیاستِ استعلام: مقدارِ کامل");
  assert.equal(g.data.ctx.expertName, "آقای یک");
  assert.equal(fillTemplate(g.data.templates[1].body, { supplier: "آهن الف", ctx: g.data.ctx }), "سلام آهن الف؛ قیمتِ این اقلام را تا پایان روز کاری بعد بفرمایید:\n• ورق سیاه ۳ میل — ۱۲۰۰ کیلوگرم");
  assert.equal((await call("/templates?item_id=91", { headers: EX2 })).data.ctx, null, "قلمِ کارشناسِ دیگر زمینه ندارد");
  assert.equal((await call("/templates", { headers: EX })).data.ctx, null);
  /* سنجشِ افشا پیش از ذخیره: نامِ تأمین‌کنندهٔ فهرستِ دعوت، واژهٔ درونی، شمارِ پیشنهادها */
  const bad = await call("/templates", { headers: EX, body: { title: "بد", body: "سلام؛ فولاد بهمن هم قیمت داده است.", item_id: 91 } });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.block.some((x) => x.includes("فولاد بهمن")));
  assert.equal((await call("/templates", { headers: EX, body: { title: "بد", body: "حد ما ۱۰۰ است" } })).status, 422);
  assert.equal((await call("/templates", { headers: EX, body: { title: "بد", body: "از سه فروشنده قیمت گرفتیم" } })).status, 422);
  const ok = await call("/templates", { headers: EX, body: { title: "فوری", body: "سلام {تامین‌کننده}؛ کار فوری است:\n{فهرست اقلام}", item_id: 91 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(ok.data.warn.some((x) => x.includes("فوری")), "فوریت فقط هشدار");
  assert.equal(DB.raw.prepare("SELECT active FROM templates WHERE id=?").get(ok.data.id).active, 1, "قالبِ تازه فعال است");
  const ed = await call(`/templates/${ok.data.id}`, { method: "PUT", headers: EX, body: { title: "فوری", body: "صنایع پارس ارزان‌تر داد", item_id: 91 } });
  assert.equal(ed.status, 422);
  assert.match(DB.raw.prepare("SELECT body FROM templates WHERE id=?").get(ok.data.id).body, /کار فوری است/, "ویرایشِ افشاگر ننشست");
});
