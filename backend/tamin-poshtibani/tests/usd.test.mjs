/* ============================================================
   نرخ دلار (worker/usd.js) — پایهٔ «قیمت روز»ِ سوابق (طرح «خرید هوشمند، کارشناس ناظر»، مهر ۱۴۰۵)

   • خواندن متن پیام‌های کانال: همان نمونه‌های test_parsers.py ربات پایتونیِ کاربر
   • صفحهٔ عمومی t.me/s: شناسه، زمان و متنِ هر پیام (برچسب‌ها، <br>، موجودیت‌ها)
   • نرخ هر روز: پیام «پایان معاملات» با عدد؛ بی‌عدد ← آخرین «معامله شد»ِ فردایی پیش از آن؛ عددِ بیرون از کف و سقف ← اصلاح
   • درون‌یابی خطیِ روزهای خالی (تصمیم ۵) و بازسازی‌اش با هر نرخِ تازه
   • ربات روزانه: نرخ دیروز، جمعهٔ بی‌معامله، اجرای دوباره بی درخواست؛ مسیرهای پنل پشتیبانی
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { normText, summaryLastTrade, writtenDate, isMarker, tradePrice, parsePosts, selectDays, interpolate, usdDaily, usdSlot,
  putRates, usdTable, resetUsdCache, dayNo, shiftDay, tradingDay, jDay } from "../../../worker/usd.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = { DB, SITE_ORIGIN: "https://site.test" };
if (DB) await ensureSchema(env);

/* ---------- صفحهٔ بدلیِ کانال، با همان ساختار t.me/s ---------- */
const post = (id, iso, html) => `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="dollar_tehran3bze/${id}" data-view="x">
  <div class="tgme_widget_message_bubble"><div class="tgme_widget_message_author accent_color"><span dir="auto">قیمت لحظه‌ای دلار تهران</span></div>
  <div class="media_supported_cont"><div class="tgme_widget_message_text js-message_text" dir="auto">${html}</div></div>
  <div class="tgme_widget_message_footer compact js-message_footer"><div class="tgme_widget_message_info short js-message_info"><span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/dollar_tehran3bze/${id}"><time datetime="${iso}" class="time">21:00</time></a></span></div></div></div></div></div>`;
const page = (...posts) => `<html><body><section class="tgme_channel_history js-message_history">${posts.join("\n")}</section></body></html>`;
const em = (e) => `<tg-emoji emoji-id="1"><i class="emoji" style="background-image:url('x')"><b>${e}</b></i></tg-emoji>`;
const mark = (w) => `<mark class="highlight">${w}</mark>`;
const summary = (d, last) => `${em("📌")} ${mark("پایان")} ${mark("معاملات")}<br/>🗓 | ${d}<br/>💠 شروع : ${last - 1000}<br/>🔺 سقف : ${last + 1000}<br/>🔻 کف : ${last - 2000}<br/>⏳ آخرین معامله : ${last.toLocaleString("en-US")}`;

test("خواندن متن پیام‌ها — نمونه‌های test_parsers.py", () => {
  const S = [
    ["📌 پایان معاملات🗓 چهارشنبه | 1405.06.25✅\n💠 شروع : 229,000\n⏳ آخرین معامله : 230,400", 230400, "1405/06/25"],
    ["پایان معاملات، خسته نباشید 🌺\n🗓 سه‌شنبه 1400.03.25\n📝 23,950 آخرین‌ معامله فردایی", 23950, "1400/03/25"],
    ["پایان معاملات\n😀38,170آخرین‌ معامله فردایی\n1401.09.23", 38170, "1401/09/23"],
    ["📌پایان معاملات، خسته نباشید 🌹🌹\n\n⏳ 13,610 شروع معاملات فردایی✔️🤝\n🔻 13,500 کف‌معامله 🔺13,920 سقف‌معامله\n⚡️ 13,850 کلوز دلار تهران (سبزه)⛳️\n1398.09.18", 13850, "1398/09/18"],
    ["🕚پایان معاملات، خسته نباشید.🌷\n\n💠 13,420 شروع معاملات ✅\n🔻 13,420 کف 🔺13,490 سقف \n📌 13,490 کلوز\n1398.11.02", 13490, "1398/11/02"],
    ["پایان معاملات، خسته نباشید 🌺\n\n💠 26,050 شروع معاملات ✅\n🔻 25,800 کف 🔺26,050 سقف\n📌 26,050 فروش کلوز\n1399.11.29", 26050, "1399/11/29"],
    ["📌پایان معاملات، خسته نباشید 🌹🌹\n\n⏳ 12,650 شروع معاملات ✔️🤝\n🔻 12,520 کف‌معامله 🔺12,700 سقف‌معامله\n1398.09.07", null, "1398/09/07"],
    ["پایان معاملات، خسته نباشید🌹", null, null],
    ["📌 پایان معاملات\n🗓 دوشنبه | ۱۴۰۵.۰۷.۱۳\n💠 شروع : 269,500\n🔺 سقف : 272,300\n🔻 کف : 268,500\n⏳ آخرین معامله : ۲۶۹,۴۰۰", 269400, "1405/07/13"],
  ];
  for (const [raw, close, d] of S) {
    const x = normText(raw);
    assert.equal(isMarker(x), true, raw);
    assert.equal(summaryLastTrade(x), close, raw);
    assert.equal(writtenDate(x), d, raw);
  }
  const T = [["سبزه ⛳️ 12,070 معامله ⌛️ فردایی ✔️🤝", 12070], ["دلار فردایی تهران ⏳ 235,400 مـعامله شد✅", 235400],
    ["دلار نـقدی تهران 💵 105,350 معامله شد☑️", null], ["پایان معاملات، خسته نباشید🌹", null], ["تتر 105,000 معامله شد", null]];
  for (const [raw, p] of T) assert.equal(tradePrice(normText(raw)), p, raw);
});

test("صفحهٔ t.me/s: شناسه، زمان و متن هر پیام", () => {
  const ps = parsePosts(page(
    post(12, "2026-10-04T17:31:00+00:00", `${mark("پایان")} ${mark("معاملات")} خسته نباشید ${em("💐")}<br/>.`),
    post(11, "2026-10-04T17:28:00+00:00", `دلار فردایی تهران ⏳ ۲۶۹,۰۰۰ مـعامله شد&#9989; &amp; سبزه`),
  ));
  assert.deepEqual(ps.map((p) => p.id), [11, 12], "به ترتیب شناسه");
  assert.equal(ps[1].x, "پایان معاملات خسته نباشید 💐\n.");
  assert.equal(ps[1].t, Date.parse("2026-10-04T17:31:00Z"));
  assert.equal(ps[0].x, "دلار فردایی تهران ⏳ 269,000 معامله شد✅ & سبزه");
  assert.equal(tradePrice(ps[0].x), 269000);
});

test("روز معاملاتی و تاریخ‌ها: مرز ۴ صبح تهران، کبیسه، تاریخ سوابق", () => {
  assert.equal(tradingDay(Date.parse("2026-10-05T23:59:00Z")), "1405/07/13", "۰۳:۲۹ تهران مال دیروز است");
  assert.equal(tradingDay(Date.parse("2026-10-06T00:40:00Z")), "1405/07/14");
  assert.equal(shiftDay("1403/12/30", 1), "1404/01/01");
  assert.equal(shiftDay("1404/12/29", 1), "1405/01/01");
  assert.equal(dayNo("1405/07/14") - dayNo("1405/06/31"), 14);
  assert.equal(jDay("۱۴۰۲/۲/۱۰"), "1402/02/10");
  assert.equal(jDay("1402-02-10 10:00"), "1402/02/10");
  assert.equal(jDay("1402/13/01"), "");
});

test("نرخ هر روز: با عدد، بی‌عدد (آخرین معامله)، و عدد بیرون از کف و سقف", () => {
  const P = (id, iso, x) => ({ id, t: Date.parse(iso), x: normText(x) });
  const msgs = [
    P(100, "2026-10-03T17:30:00Z", "پایان معاملات\n🗓 | 1405.07.11\n⏳ آخرین معامله : 268,700"),
    P(200, "2026-10-04T17:10:00Z", "دلار فردایی تهران ⏳ 268,900 معامله شد✅"),
    P(201, "2026-10-04T17:20:00Z", "دلار نقدی تهران 💵 265,000 معامله شد"),
    P(202, "2026-10-04T17:28:00Z", "دلار فردایی تهران ⏳ 269,000 معامله شد✅"),
    P(203, "2026-10-04T17:31:00Z", "پایان معاملات خسته نباشید 💐"),
    P(300, "2026-10-05T17:00:00Z", "دلار فردایی تهران ⏳ 269,300 معامله شد✅"),
    /* «آخرین معامله» ۲۹۶٬۴۰۰ بیرون از کف و سقف است (اشتباه تایپی ۲۶۹٬۴۰۰) */
    P(301, "2026-10-05T17:31:00Z", "📌 پایان معاملات\n🗓 | 1405.07.13\n🔺 سقف : 272,300\n🔻 کف : 268,500\n⏳ آخرین معامله : 296,400"),
  ];
  const sel = selectDays(msgs, new Set(["1405/07/12", "1405/07/13"]));
  assert.deepEqual([...sel.keys()].sort(), ["1405/07/11", "1405/07/12", "1405/07/13"]);
  assert.equal(sel.get("1405/07/11").price, 268700);
  assert.equal(sel.get("1405/07/11").how, "summary");
  assert.equal(sel.get("1405/07/12").price, 269000, "نقدی شمرده نمی‌شود");
  assert.equal(sel.get("1405/07/12").how, "last_trade");
  assert.equal(sel.get("1405/07/13").price, 269300);
  assert.equal(sel.get("1405/07/13").how, "last_trade_fix");
  /* بی خواندنِ پیام‌های پیش از آن، عدد مشکوک می‌ماند ولی یادداشت دارد */
  const raw = selectDays(msgs.filter((m) => m.id !== 300), new Set());
  assert.equal(raw.get("1405/07/13").price, 296400);
  assert.match(raw.get("1405/07/13").note, /کف و سقف/);
});

test("درون‌یابی خطیِ روزهای خالی", () => {
  const rows = interpolate([{ jday: "1405/07/09", rate: 2590000 }, { jday: "1405/07/11", rate: 2687000 }, { jday: "1405/07/15", rate: 2707000 }]);
  assert.deepEqual(rows.map((r) => [r.jday, r.rate]), [["1405/07/10", 2638500], ["1405/07/12", 2692000], ["1405/07/13", 2697000], ["1405/07/14", 2702000]]);
});

test("نوبت ربات: از ۶ صبح تهران، هر ۱۰ دقیقه؛ اجرای دستی همیشه", () => {
  const at = (hh, mm) => Date.parse(`2026-10-06T00:00:00Z`) + ((hh - 3.5) * 60 + mm) * 60000;
  assert.equal(usdSlot(at(5, 53), "* * * * *"), false);
  assert.equal(usdSlot(at(6, 3), "* * * * *"), true);
  assert.equal(usdSlot(at(6, 4), "* * * * *"), false);
  assert.equal(usdSlot(at(21, 43), "* * * * *"), true);
  assert.equal(usdSlot(at(2, 4), undefined), true);
});

/* ---------- ربات روزانه روی پایگاه داده ---------- */
const M09 = 788100, M11 = 789449, M12 = 790264;
const fetched = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.host !== "t.me") throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
  fetched.push(Object.fromEntries(u.searchParams));
  if (u.searchParams.get("q") === "پایان معاملات") return new Response(page(
    post(M09, "2026-10-01T17:30:00+00:00", summary("1405.07.09", 259000)),
    post(M11, "2026-10-03T17:30:00+00:00", summary("1405.07.11", 268700)),
    post(M12, "2026-10-04T17:31:00+00:00", `${mark("پایان")} ${mark("معاملات")} خسته نباشید ${em("💐")}<br/>.`),
  ));
  if (u.searchParams.get("before") === String(M12)) return new Response(page(
    post(M12 - 9, "2026-10-04T17:10:00+00:00", "دلار فردایی تهران ⏳ 268,900 مـعامله شد✅"),
    post(M12 - 7, "2026-10-04T17:20:00+00:00", "دلار نـقدی تهران 💵 265,000 معامله شد☑️"),
    post(M12 - 6, "2026-10-04T17:28:00+00:00", "دلار فردایی تهران ⏳ 269,000 مـعامله شد✅"),
  ));
  return new Response(page());
};
const rows = () => DB.raw.prepare("SELECT jday, rate, src FROM usd_rates ORDER BY jday").all().map((r) => ({ ...r }));
const MON_0830 = Date.parse("2026-10-05T05:00:00Z"); /* دوشنبه ۱۴۰۵/۰۷/۱۳، ۸:۳۰ تهران */

test("ربات روزانه: نرخ‌های جاافتاده تا دیروز، جمعهٔ بی‌معامله درون‌یابی می‌شود", { skip: SKIP }, async () => {
  DB.raw.exec("DELETE FROM usd_rates; DELETE FROM settings WHERE key='usdBot'");
  assert.deepEqual(await usdDaily(env, { now: MON_0830 }), {}, "جدول خالی: ربات کاری نمی‌کند");
  await putRates(env, [{ jday: "1405/07/06", rate: 2440000 }, { jday: "1405/07/08", rate: 2553000 }], { now: MON_0830 });
  assert.deepEqual(rows().map((r) => [r.jday, r.rate, r.src]), [["1405/07/06", 2440000, "excel"], ["1405/07/07", 2496500, "interp"], ["1405/07/08", 2553000, "excel"]]);
  fetched.length = 0;
  const r = await usdDaily(env, { now: MON_0830 });
  assert.deepEqual(r.usd.found.map((f) => [f.jday, f.rate, f.how]), [["1405/07/09", 2590000, "summary"], ["1405/07/11", 2687000, "summary"], ["1405/07/12", 2690000, "last_trade"]]);
  assert.deepEqual(r.usd.none, ["1405/07/10"], "جمعه پیام پایانی ندارد و بعدش روز معاملاتی آمده");
  assert.equal(r.usd.requests, 2, "جستجوی «پایان معاملات» + یک صفحه پیش از پیامِ بی‌عدد");
  assert.deepEqual(fetched.map((f) => f.q || `before ${f.before}`), ["پایان معاملات", `before ${M12}`]);
  assert.deepEqual(rows().slice(3).map((r) => [r.jday, r.rate, r.src]), [["1405/07/09", 2590000, "bot"], ["1405/07/10", 2638500, "interp"], ["1405/07/11", 2687000, "bot"], ["1405/07/12", 2690000, "bot"]]);
  const st = JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='usdBot'").get().value);
  assert.deepEqual(st.none, ["1405/07/10"]);
  assert.equal(st.runs[0].found[2].ref, `t.me/dollar_tehran3bze/${M12 - 6}`);
  /* همان روز دوباره: چیزی عقب نیست، درخواستی هم نمی‌رود */
  fetched.length = 0;
  assert.deepEqual(await usdDaily(env, { now: MON_0830 + 600000 }), {});
  assert.equal(fetched.length, 0);
  /* فردا صبح: دیروز (۱۳) هنوز پیام پایانی ندارد و روز کاری است ← ناموفق، دوباره سنجیده می‌شود */
  const r2 = await usdDaily(env, { now: MON_0830 + 86400000 });
  assert.deepEqual(r2.usd.failed, ["1405/07/13"]);
  const st2 = JSON.parse(DB.raw.prepare("SELECT value FROM settings WHERE key='usdBot'").get().value);
  assert.equal(st2.fail["1405/07/13"], 1);
});

test("نرخ دستی و فایل: درون‌یابیِ همسایه‌ها بازسازی می‌شود؛ جدول نرخ برای سوابق", { skip: SKIP }, async () => {
  DB.raw.exec("DELETE FROM usd_rates");
  resetUsdCache();
  await putRates(env, [{ jday: "1398/03/27", rate: 133500 }, { jday: "1398/03/30", rate: 136500 }, { jday: "1398/04/01", rate: "137,000" }, { jday: "1398/13/01", rate: 1 }]);
  assert.deepEqual(rows().map((r) => [r.jday, r.rate, r.src]), [["1398/03/27", 133500, "excel"], ["1398/03/28", 134500, "interp"], ["1398/03/29", 135500, "interp"], ["1398/03/30", 136500, "excel"], ["1398/03/31", 136750, "interp"], ["1398/04/01", 137000, "excel"]]);
  /* اصلاح دستیِ یک روزِ درون‌یابی‌شده */
  const m = await putRates(env, [{ jday: "1398/03/28", rate: 140000 }], { src: "manual" });
  assert.equal(m.written, 1);
  assert.deepEqual(rows().slice(0, 4).map((r) => [r.jday, r.rate, r.src]), [["1398/03/27", 133500, "excel"], ["1398/03/28", 140000, "manual"], ["1398/03/29", 138250, "interp"], ["1398/03/30", 136500, "excel"]]);
  /* حذف یک نرخ واقعی ← خودش درون‌یابی می‌شود */
  await putRates(env, [{ jday: "1398/03/30", rate: null }]);
  assert.deepEqual(rows().slice(2, 5).map((r) => [r.jday, r.rate, r.src]), [["1398/03/29", 139250, "interp"], ["1398/03/30", 138500, "interp"], ["1398/03/31", 137750, "interp"]]);
  const t = await usdTable(env);
  assert.deepEqual(t.latest, { jday: "1398/04/01", rate: 137000 });
  assert.deepEqual(t.rateOn("1398/03/29"), { rate: 139250, early: false });
  assert.deepEqual(t.rateOn("1405/01/01"), { rate: 137000, early: false }, "بعد از آخرین نرخ = آخرین نرخ");
  assert.deepEqual(t.rateOn("1397/05/01"), { rate: 133500, early: true }, "پیش از اولین نرخ: نرخ اولین روز، با نشان");
  assert.equal(t.rateOn("بی‌تاریخ"), null);
});

test("پنل پشتیبانی: وضعیت، بارگذاری و خواندن دستی از کانال", { skip: SKIP }, async () => {
  DB.raw.exec("DELETE FROM usd_rates; DELETE FROM settings WHERE key='usdBot'");
  const call = async (path, { method, body, headers } = {}) => {
    const h = { ...(headers || {}) };
    let b;
    if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, { waitUntil() {} });
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await call("/support/usd")).status, 401, "بی رمز پشتیبانی بسته است");
  const SUP = { "X-Support-Token": (await call("/support/setup", { body: { pass: "dollar-123" } })).data.token };
  const up = await call("/support/usd/rows", { body: { rows: [{ jday: "1405/07/06", rate: 2440000 }, { jday: "1405/07/08", rate: 2553000 }], file: "dollar_rates.xlsx" }, headers: SUP });
  assert.equal(up.data.written, 2);
  assert.equal(up.data.interp, 1);
  /* اجرای دستی با ساعت واقعی: کدام روزها عقب‌اند به امروز بستگی دارد، پس فقط شکلِ پاسخ و ثبتِ اجرا سنجیده می‌شود */
  const f = await call("/support/usd/fetch", { method: "POST", headers: SUP });
  assert.equal(f.status, 200);
  assert.ok(f.data.usd && Array.isArray(f.data.usd.found), JSON.stringify(f.data));
  const s = await call("/support/usd?days=10", { headers: SUP });
  assert.equal(s.status, 200);
  assert.ok(s.data.count >= 3);
  assert.equal(s.data.bot.runs.length, 1);
  assert.equal(s.data.channel, "dollar_tehran3bze");
});
