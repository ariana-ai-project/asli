/* ============================================================
   کارشناس هوشمند — worker/ai-agent.js (مهر ۱۴۰۵)

   کل مسیر روی SQLite واقعی (همان طرحِ ensureSchema)، با تلگرام، انبار، مدل و درگاه پیامکِ بدلی:
   ارجاعِ تازه ← آماده‌سازی و بررسی سوابق ← جستجوی هوشمندِ همان قلم (دوباره خرج نمی‌شود) ← نامزدها؛ بی تیکِ «پنل»
   هیچ دعوت و پیامکی نمی‌رود ← کارشناس شمارهٔ آزمایشیِ خودش را با تیک می‌افزاید ← دعوت با قالب استاندارد و پیامکِ واقعی
   فقط به همان شماره ← تأمین‌کننده وارد می‌شود و مشخصات را می‌فرستد ← گامِ فوریِ مذاکره (تأیید و درخواست پیش‌فاکتور) ←
   پیش‌فاکتور ← خوانش هوشمند ← Cron: تأیید نهایی ← خط استعلام ← «پایان مذاکره» ← شرح و معیارها، نامه، جدول کمیسیون و
   تحویل در تلگرام ← پیامِ پایانی؛ هر فراخوانیِ مدل با پرامپتِ دقیق و هزینه در ai_calls، پروندهٔ md با برچسب‌ها، و
   «خاموش» که همه‌چیز را نگه می‌دارد.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

import { sqliteD1 } from "./run.mjs";
import { ensureSchema, route } from "../../../worker/api.js";
import { aiTick } from "../../../worker/ai-agent.js";

const DB = await sqliteD1();
const SKIP = DB ? false : "node:sqlite در دسترس نیست (Node ≥ 22.5 لازم است)";
const env = {
  DB, TG_BOT_TOKEN: "tok", TG_SP_BOT_TOKEN: "sptok", TG_WEBHOOK_SECRET: "sec", TG_API_BASE: "https://tg.test/bot", TG_FILE_API_BASE: "https://tgfile.test/bot",
  SUPABASE_URL: "https://sb.test", SUPABASE_SERVICE_KEY: "svc", ANTHROPIC_API_KEY: "k", ANTHROPIC_API_BASE: "https://ai.test", SITE_ORIGIN: "https://site.test",
  TEXTBEE_API_KEY: "tbk", TEXTBEE_API_BASE: "https://sms.test",
};
const AI_CHAT = 701;
const EX = { "X-Expert-Code": "7001" };

if (DB) {
  await ensureSchema(env);
  const t = Date.now();
  DB.raw.exec("DELETE FROM experts");
  DB.raw.prepare("INSERT INTO experts (id,name,label,code,active,speed,telegram_chat,created_at) VALUES (1,'test','test','7001',1,1,?,?), (2,'انسانی','انسانی','7002',1,1,NULL,?)")
    .run(String(AI_CHAT), t, t);
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-AI','1405/07/12','پروژهٔ آزمایش')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,deadline_at,created_at) VALUES (1,'R-AI',1,5,?,?,?)").run(t, t + 5 * 86400000, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id,norm_json) VALUES (31,'R-AI','a',1,'گریس نسوز کیلویی',200,'کیلوگرم','open',1,?)")
    .run(JSON.stringify({ v: 2, head: "گریس", layers: { "جنس": "نسوز" } }));
  /* جستجوی هوشمندِ اخیرِ همین قلم: کارشناس هوشمند دوباره خرجش نمی‌کند */
  DB.raw.prepare("INSERT INTO smart_searches (id,item_id,assignment_id,expert_id,result_json,created_at) VALUES (70,31,1,1,?,?)")
    .run(JSON.stringify({ suppliers: [{ name: "روانکاران نمونه", phones: [{ e164: "+989120000001" }] }] }), t);
  DB.raw.prepare("INSERT INTO ai_agents (expert_id,mode,on_at,updated_at) VALUES (1,'on',?,?)").run(t - 1000, t);
}

/* ---------- دنیای بیرونِ بدلی ---------- */
const calls = [];
let nextMsg = 9000;
let model = () => { throw new Error("پاسخِ مدل برای این گام تعریف نشده"); };
const R = (o, status = 200, type = "application/json") => new Response(JSON.stringify(o), { status, headers: { "content-type": type } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith("https://tg.test/bot")) {
    const rest = u.slice("https://tg.test/bot".length);
    const token = rest.split("/")[0], method = rest.split("/").pop();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ bot: token === "sptok" ? "sp" : "main", method, body, form: typeof init.body !== "string" });
    if (method === "getMe") return R({ ok: true, result: { id: 77, username: token === "sptok" ? "AriaSupplierBot" : "ArianaSupplyBot" } });
    return R({ ok: true, result: method === "sendMessage" ? { message_id: ++nextMsg } : method === "sendDocument" ? { message_id: ++nextMsg } : true });
  }
  if (u.startsWith("https://sb.test/storage/v1/object/sign/")) return R({ signedURL: "/object/sign/proformas/x?token=abc" });
  if (u.startsWith("https://sb.test/storage/v1/object/")) {
    calls.push({ bot: "store", method: init.method || "GET", url: u, body: typeof init.body === "string" ? init.body : null });
    if ((init.method || "GET") === "GET") return new Response("not found", { status: 404 });
    return R({ Key: "x" });
  }
  if (u.startsWith("https://ai.test/")) {
    const body = JSON.parse(init.body);
    calls.push({ bot: "ai", body, headers: init.headers });
    return R(model(body));
  }
  if (u.startsWith("https://sms.test/")) {
    calls.push({ bot: "sms", url: u, headers: init.headers, body: JSON.parse(init.body) });
    return R({ data: { success: true, smsBatchId: `b${calls.length}`, recipientCount: 1 } });
  }
  throw new Error(`fetch بیرونیِ پیش‌بینی‌نشده: ${u}`);
};
const pend = [];
const ctx = { waitUntil: (p) => pend.push(p) };
async function call(path, { method, body, headers, raw } = {}) {
  const h = { ...(headers || {}) };
  let b;
  if (raw !== undefined) b = raw;
  else if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await route(new Request(`https://site.test/tamin-poshtibani/api${path}`, { method: method || (b !== undefined ? "POST" : "GET"), headers: h, body: b }), env, ctx);
  while (pend.length) await Promise.all(pend.splice(0));
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = text; }
  return { status: res.status, data, type: res.headers.get("content-type") };
}
const since = (n) => calls.slice(n);
const smsTo = (n) => since(n).filter((c) => c.bot === "sms");
const usage = { input_tokens: 6000, output_tokens: 700, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
/** پاسخِ مدلِ مذاکره‌گر / پایانی: JSON در یک بلوک متن (output_config.format) */
const jsonOut = (o) => ({ model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(o) }] });
const kind = (b) => (b.tools && b.tools[0] && b.tools[0].name) || (b.output_config && b.output_config.format ? (/تمام شده است/.test(JSON.stringify(b.system)) ? "closing" : "negotiate") : "?");
const bundleIn = (b, state) => Number((new RegExp(`بستهٔ (\\d+) — وضعیت: ${state}`).exec(b.messages[0].content[0].text) || [])[1]);
const v = (value, sure = true) => ({ value, sure });
const S = {};

test("کارشناس هوشمند: از ارجاع تا جدول کمیسیون — پیامک فقط به شمارهٔ پنل، هر پرامپت با هزینه ثبت", { skip: SKIP }, async () => {
  /* ۱. ارجاعِ تازه ← اجرا؛ آماده‌سازی (ساختارِ تأییدشده، سوابق بارگذاری‌نشده) */
  let r = await aiTick(env);
  assert.equal(r.ai, 1, JSON.stringify(r));
  const run = DB.raw.prepare("SELECT * FROM ai_runs WHERE assignment_id=1").get();
  assert.ok(run, "اجرا ساخته شد");
  S.run = run.id;
  assert.ok(DB.raw.prepare("SELECT viewed_at FROM assignments WHERE id=1").get().viewed_at, "«مشاهده» زده شد");
  assert.ok(DB.raw.prepare("SELECT hist_done_at FROM items WHERE id=31").get().hist_done_at, "مرحلهٔ بررسی سوابق سبز");
  for (let i = 0; i < 4; i++) await aiTick(env);
  const r2 = DB.raw.prepare("SELECT state, data_json FROM ai_runs WHERE id=?").get(S.run);
  assert.equal(r2.state, "work", "آماده‌سازی و جستجو تمام، دعوت و مذاکره");
  const data = JSON.parse(r2.data_json);
  assert.equal(data.items[0].smart.reused, true, "جستجوی اخیرِ همان قلم دوباره به کار رفت");
  assert.deepEqual(data.cands.map((c) => [c.name, c.src, c.found]), [["روانکاران نمونه", "smart", ["09120000001"]]]);
  assert.ok(!calls.some((c) => c.bot === "ai"), "هنوز هیچ فراخوانی مدلی لازم نبود");

  /* ۲. بی تیکِ «پنل» هیچ دعوت و پیامکی نمی‌رود — حتی شمارهٔ ثبت‌شدهٔ نامزد */
  let n = calls.length;
  const add = await call("/ai/phones", { headers: EX, body: { supplier_name: "روانکاران نمونه", phone: "09120000001", label: "فروش" } });
  assert.equal(add.status, 200, JSON.stringify(add.data));
  assert.equal(add.data.phone.panel, false);
  DB.raw.prepare("UPDATE ai_runs SET next_at=0").run();
  await aiTick(env);
  assert.equal(smsTo(n).length, 0, "شمارهٔ بی تیک پیامک نمی‌گیرد");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_threads").get().n, 0, "دعوتی نرفت");
  const det0 = (await call(`/ai/runs/${S.run}`, { headers: EX })).data;
  const cand = det0.candidates.find((c) => c.name === "روانکاران نمونه");
  assert.deepEqual(cand.phones.map((p) => [p.phone, p.panel]), [["09120000001", false]], "تب شمارهٔ نامزد را بی تیک نشان می‌دهد");

  /* ۳. شمارهٔ آزمایشیِ خودِ کارشناس، با تیک ← دعوت و پیامکِ واقعی فقط به همان */
  const mine = await call(`/ai/runs/${S.run}/supplier`, { headers: EX, body: { supplier_name: "تأمین‌کنندهٔ آزمایشی", phone: "۰۹۱۲ ۱۱۱ ۲۲۲۲", label: "شمارهٔ من" } });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.equal(mine.data.phone.panel, true);
  n = calls.length;
  r = await aiTick(env);
  assert.equal(r.step, "invite", JSON.stringify(r));
  const sms = smsTo(n);
  assert.equal(sms.length, 1, "یک پیامک");
  assert.deepEqual(sms[0].body.recipients, ["+989121112222"]);
  assert.match(sms[0].body.message, /^استعلام قیمت شرکت/);
  assert.match(sms[0].body.message, /supplier\.html#k=[0-9a-f]{12}/);
  assert.match(sms[0].body.message, /رمز ورود: \d{6}/);
  S.k = /#k=([0-9a-f]{12})/.exec(sms[0].body.message)[1];
  S.pass = /رمز ورود: (\d{6})/.exec(sms[0].body.message)[1];
  const ath = DB.raw.prepare("SELECT * FROM ai_threads").get();
  assert.equal(ath.source, "manual");
  S.th = ath.thread_id;
  const first = DB.raw.prepare("SELECT * FROM sp_msgs WHERE thread_id=? ORDER BY id").all(S.th);
  assert.match(first[0].body, /تأمین‌کنندهٔ آزمایشی گرامی/, "قالبِ استانداردِ دعوت");
  assert.equal(JSON.parse(first[0].meta_json).ai, true, "پیامِ کارشناس هوشمند علامت دارد");
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=1 AND supplier_name='تأمین‌کنندهٔ آزمایشی'").get().n, 1, "انتخاب جهت استعلام در تب استعلامات");
  assert.equal(DB.raw.prepare("SELECT via FROM sp_sms ORDER BY id DESC LIMIT 1").get().via, "textbee");
  assert.ok(calls.some((c) => c.bot === "store" && c.method === "POST" && /ai-negotiation-R-AI\.md$/.test(c.url)), "پروندهٔ md در انبار");
  n = calls.length;
  await aiTick(env);
  assert.equal(smsTo(n).length, 0, "نامزدِ بی تیک هنوز دعوت نمی‌شود");

  /* ۴. تأمین‌کننده (همان شمارهٔ آزمایشی) وارد می‌شود و مشخصات را می‌فرستد ← گامِ فوریِ مذاکره */
  const sess = (await call("/sp/login", { body: { k: S.k, password: S.pass } })).data.session;
  assert.ok(sess, "ورود با رمزِ همان پیامک");
  const H = { "X-SP-Session": sess };
  const th = (await call(`/sp/thread/${S.th}`, { headers: H })).data;
  const line = th.lines[0];
  await call(`/sp/thread/${S.th}/terms`, { headers: H, body: { dtime: "1405/08/20", pay: "نقدی", invoice: "رسمی", vat: "دارد" } });
  await call(`/sp/line/${line.id}`, { method: "PUT", headers: H, body: { qty: 200, price: 1250000 } });
  await call(`/sp/line/${line.id}/ready`, { headers: H, body: { on: true } });
  model = (b) => {
    assert.equal(kind(b), "negotiate");
    S.neg = b;
    return jsonOut({ reply: "سپاس از پاسخ شما. لطفاً پیش‌فاکتورِ رسمی را با همین شرایط بارگذاری کنید.", actions: [{ type: "approve", bundle_id: bundleIn(b, "pending"), comment: "", rows: [] }],
      thread_status: "waiting", memo: "منتظر پیش‌فاکتور؛ هنوز تخفیف نخواسته‌ام.", note: "قیمت در محدودهٔ پیشنهادهاست؛ مشخصات کامل." });
  };
  n = calls.length;
  const sub = await call(`/sp/thread/${S.th}/submit`, { headers: H, body: {} });
  assert.equal(sub.status, 200, JSON.stringify(sub.data));
  S.b = sub.data.bundle_id;
  assert.equal(DB.raw.prepare("SELECT state FROM sp_bundles WHERE id=?").get(S.b).state, "approved", "مدل تأیید کرد و پیش‌فاکتور خواست");
  /* درخواستِ دقیقِ مدل */
  assert.equal(S.neg.model, "claude-opus-5-5");
  assert.equal(S.neg.output_config.format.type, "json_schema");
  assert.equal(S.neg.output_config.effort, "low", "گامِ فوری: تلاشِ کمتر");
  assert.equal(S.neg.fallbacks, "default");
  assert.equal(since(n).find((c) => c.bot === "ai").headers["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.equal(S.neg.system[0].cache_control.type, "ephemeral", "پرامپتِ سیستم کش می‌شود");
  const ctxText = S.neg.messages[0].content[0].text;
  assert.match(ctxText, /\[کد ۱\] گریس نسوز کیلویی/);
  assert.match(ctxText, /لایه‌های قفل‌شده: جنس = نسوز/);
  assert.match(ctxText, /کارهای ممکن: approve، return، reject/);
  assert.match(ctxText, /#### پیام .* · تأمین‌کننده ← شرکت · ارسال مشخصات و قیمت/, "گفت‌وگو همان بخشِ فایل md است");
  assert.doesNotMatch(ctxText, /09121112222/, "شمارهٔ کامل به مدل نمی‌رود");
  const msgs = DB.raw.prepare("SELECT * FROM sp_msgs WHERE thread_id=? ORDER BY id").all(S.th);
  const reply = msgs.find((m) => m.who === "e" && m.kind === "text" && /پیش‌فاکتورِ رسمی/.test(m.body));
  assert.ok(reply && JSON.parse(reply.meta_json).ai, "پاسخِ مدل با علامتِ 🤖");
  assert.ok(msgs.some((m) => m.kind === "note" && /محدودهٔ پیشنهادهاست/.test(m.body)), "یادداشتِ درونی برای کارشناس");
  const call1 = DB.raw.prepare("SELECT * FROM ai_calls WHERE purpose='negotiate' ORDER BY id DESC LIMIT 1").get();
  assert.ok(call1, "فراخوانی ضبط شد");
  assert.match(call1.request_json, /کارشناس هوشمند خرید/, "پرامپتِ دقیق");
  assert.equal(call1.effort, "low");
  /* ۶۰۰۰×۴ + ۷۰۰×۲۰ + ۳۰۰۰×۰٫۲ = ۳۸٬۶۰۰ میکرودلار */
  assert.equal(call1.cost_usd, 0.0386);
  assert.equal(DB.raw.prepare("SELECT memo FROM ai_threads WHERE thread_id=?").get(S.th).memo, "منتظر پیش‌فاکتور؛ هنوز تخفیف نخواسته‌ام.");

  /* ۵. پیش‌فاکتور ← گامِ فوری فقط خوانش (تصمیم با Cron) */
  model = (b) => {
    assert.equal(kind(b), "record_check");
    return { model: "claude-haiku-4-5", usage: { input_tokens: 3000, output_tokens: 500 }, content: [{ type: "tool_use", name: "record_check", input: {
      readable: true, currency: "ریال", vat_included: false, delivery: v("1405/08/20"), pay: { value: "نقدی", sure: true }, invoice: v("رسمی"), vat: v("دارد"), valid_days: v(7),
      lines: [{ key: "L1", found: true, doc_title: "گریس نسوز", qty: v(200), unit: { value: "کیلوگرم", same: true, sure: true }, unit_price: v(1250000),
        layers: [{ name: "جنس", status: "explicit", seen: "نسوز", sure: true }] }] } }] };
  };
  const pf = await call(`/sp/bundle/${S.b}/proforma?filename=pf.pdf`, { headers: { ...H, "Content-Type": "application/pdf" }, raw: "PDF" });
  assert.equal(pf.status, 200, JSON.stringify(pf.data));
  const b1 = DB.raw.prepare("SELECT * FROM sp_bundles WHERE id=?").get(S.b);
  assert.equal(b1.state, "proforma");
  assert.equal(JSON.parse(b1.ai_json).ok, true, "خوانش: همه ✅");
  assert.ok(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE purpose='proforma'").get().n >= 1);

  /* ۶. Cron: تأیید نهایی ← خط استعلامِ ثبت‌موقت با تیکِ تأیید نهایی */
  model = (b) => {
    assert.equal(kind(b), "negotiate");
    assert.equal(b.output_config.effort, "medium");
    assert.match(b.messages[0].content[0].text, /\[\d+\|price\] قیمت واحد/, "جدول تطابق با کلیدِ ردیف‌ها");
    return jsonOut({ reply: "", actions: [{ type: "final", bundle_id: bundleIn(b, "proforma"), comment: "", rows: [] }], thread_status: "done", memo: "تمام.", note: "سند با درخواست می‌خواند." });
  };
  r = await aiTick(env);
  assert.equal(r.step, "turn", JSON.stringify(r));
  const q = DB.raw.prepare("SELECT * FROM quotes WHERE assignment_id=1 AND supplier_name='تأمین‌کنندهٔ آزمایشی'").get();
  assert.deepEqual([q.price, q.qty, q.saved, q.final], [1250000, 200, 1, 1], "خط استعلام کامل و نهایی");
  assert.equal(DB.raw.prepare("SELECT state FROM ai_threads WHERE thread_id=?").get(S.th).state, "final");

  /* ۷. «پایان مذاکره» ← شرح و معیارها ← نامه ← جدول کمیسیون و تحویل ← پیامِ پایانی */
  const fin = await call(`/ai/runs/${S.run}/act`, { headers: EX, body: { action: "finish" } });
  assert.equal(fin.status, 200);
  model = (b) => {
    if (kind(b) === "closing") return jsonOut({ narrative: "استعلام از تأمین‌کنندهٔ آزمایشی گرفته شد و پیش‌فاکتورِ رسمی رسید.", criteria: ["انطباق کامل با لایهٔ جنس"],
      challenges: ["نامزدِ جستجوی هوشمند شمارهٔ پنلِ تأییدشده نداشت"], picks: [{ item: "گریس نسوز کیلویی", supplier: "تأمین‌کنندهٔ آزمایشی", why: "تنها پیشنهادِ کامل" }], notes: "یک پیشنهادِ کامل رسید." });
    assert.equal(kind(b), "write_letter");
    return { model: "claude-haiku-4-5", usage: { input_tokens: 2000, output_tokens: 300 }, content: [{ type: "tool_use", name: "write_letter",
      input: { paragraphs: ["احتراماً به استحضار می‌رساند استعلام از تأمین‌کنندهٔ آزمایشی اخذ گردید."], closing: "مراتب جهت استحضار ارائه می‌گردد.", uncertain: [] } }] };
  };
  await aiTick(env);   /* wait → closing */
  assert.equal(DB.raw.prepare("SELECT state FROM ai_runs WHERE id=?").get(S.run).state, "closing");
  await aiTick(env);   /* شرح */
  assert.equal(DB.raw.prepare("SELECT notes FROM assignments WHERE id=1").get().notes, "یک پیشنهادِ کامل رسید.", "توضیحاتِ برگهٔ کمیسیون");
  await aiTick(env);   /* نامه */
  const L = DB.raw.prepare("SELECT * FROM letters WHERE assignment_id=1 ORDER BY id DESC LIMIT 1").get();
  assert.equal(L.state, "written");
  assert.match(L.transcript, /معیارهای انتخاب:\n- انطباق کامل/);
  n = calls.length;
  await aiTick(env);   /* جدول و تحویل */
  assert.ok(DB.raw.prepare("SELECT commission_no FROM assignments WHERE id=1").get().commission_no, "شمارهٔ فرم کمیسیون");
  const tg = since(n).filter((c) => c.bot === "main" && String(c.body.chat_id || "") === String(AI_CHAT) || (c.bot === "main" && c.method === "sendDocument"));
  assert.ok(tg.some((c) => c.method === "sendMessage" && /تحویلِ درخواست R-AI/.test(c.body.text)), "خلاصه در بات کارشناسان");
  assert.ok(since(n).filter((c) => c.bot === "main" && c.method === "sendDocument").length >= 2, "جدول و پروندهٔ md");
  await aiTick(env);   /* پیامِ پایانی */
  assert.equal(DB.raw.prepare("SELECT state FROM ai_runs WHERE id=?").get(S.run).state, "done");
  assert.ok(DB.raw.prepare("SELECT body FROM sp_msgs WHERE thread_id=? ORDER BY id DESC LIMIT 1").get(S.th).body.includes("کمیسیون معاملات"), "خداحافظی با تأمین‌کننده");

  /* ۸. تب: فراخوانی‌ها با پرامپت و هزینه، پیامک‌ها، پروندهٔ md */
  const st = (await call("/ai/state", { headers: EX })).data;
  assert.equal(st.agent.on, true);
  assert.equal(st.runs[0].state, "done");
  assert.ok(st.totals.cost > 0);
  const list = (await call("/ai/calls", { headers: EX })).data.calls;
  assert.deepEqual([...new Set(list.map((c) => c.purpose))].sort(), ["closing", "letter", "negotiate", "proforma"]);
  const one = (await call(`/ai/calls/${list.find((c) => c.purpose === "closing").id}`, { headers: EX })).data.call;
  assert.match(one.request_json, /مذاکره‌های یک درخواست خرید تمام شده/);
  assert.match(one.response_json, /narrative/);
  const smsLog = (await call("/ai/sms", { headers: EX })).data.sms;
  assert.ok(smsLog.some((s) => s.phone === "09121112222" && s.via === "textbee" && /رمز ورود: •{6}/.test(s.body) && !/رمز ورود: \d{6}/.test(s.body)), "پیامک ثبت شد، رمز پوشیده");
  const md = await call(`/ai/runs/${S.run}/md`, { headers: EX });
  assert.match(md.type, /markdown/);
  assert.match(md.data, /# پروندهٔ مذاکره — درخواست R-AI/);
  assert.match(md.data, /- زمان: .* \(\d{4}-\d\d-\d\dT/);
  assert.match(md.data, /- قلم: کد ۱ — گریس نسوز کیلویی/);
  assert.match(md.data, /- تأمین‌کننده: تأمین‌کنندهٔ آزمایشی · 09121112222 \(شمارهٔ من\)/);
  assert.match(md.data, /کارشناس هوشمند → تأمین‌کننده/);

  /* ۹. کارشناسِ دیگر به تب دسترسی ندارد */
  assert.equal((await call("/ai/state", { headers: { "X-Expert-Code": "7002" } })).status, 403);
});

test("خاموش: هیچ گامی برداشته نمی‌شود؛ روشن کردنِ دوباره ارجاع‌های قدیمی را خودکار برنمی‌دارد", { skip: SKIP }, async () => {
  const off = await call("/ai/mode", { method: "PUT", headers: EX, body: { on: false } });
  assert.equal(off.status, 200);
  const t = Date.now();
  DB.raw.prepare("INSERT INTO requests (id,date,party) VALUES ('R-AI2','1405/07/13','پروژهٔ دو')").run();
  DB.raw.prepare("INSERT INTO assignments (id,request_id,expert_id,days,dispatched_at,created_at) VALUES (2,'R-AI2',1,5,?,?)").run(t, t);
  DB.raw.prepare("INSERT INTO items (id,request_id,item_key,line_no,title,qty,unit,state,assignment_id) VALUES (32,'R-AI2','a',1,'پیچ',10,'عدد','open',2)").run();
  assert.deepEqual(await aiTick(env), { ai: 0 }, "خاموش");
  await new Promise((res) => setTimeout(res, 5));
  await call("/ai/mode", { method: "PUT", headers: EX, body: { on: true } });
  await aiTick(env);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM ai_runs WHERE assignment_id=2").get().n, 0, "ارجاعِ پیش از روشن شدن فقط با «▶️ شروع»");
  const st = (await call("/ai/state", { headers: EX })).data;
  assert.deepEqual(st.open.map((a) => a.request_id), ["R-AI2"]);
  const go = await call("/ai/runs", { headers: EX, body: { assignment_id: 2 } });
  assert.equal(go.status, 200, JSON.stringify(go.data));
  assert.equal(DB.raw.prepare("SELECT state FROM ai_runs WHERE assignment_id=2").get().state, "prep");
});
