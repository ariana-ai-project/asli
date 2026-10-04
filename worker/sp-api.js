/**
 * پنل تأمین‌کننده — مسیرهای HTTP زیر /tamin-poshtibani/api/sp/*
 *
 * سه راه احراز هویت، یک وضعیت:
 *   X-SP-Session  نشستِ تأمین‌کننده بعد از ورود با لینک و رمز پیامک (پنل وب)
 *   X-TG-Init     initData مینی‌اپ تلگرام — بات مکاتبات (نقشِ گفت‌وگوی وصل‌شده، sp_tg) یا بات کارشناسان (کارشناسِ همان گفت‌وگو)
 *   X-Expert-Code کد کارشناس (صفحهٔ مکاتبات در مرورگر) — همان کد پنل کارشناس
 *
 * فایل‌ها خام و جریانی به انبار می‌روند (مثل /proformas/upload) تا CPU صرف کدگذاری نشود.
 * پخش به تلگرام بعد از پاسخ (waitUntil) — کندیِ تلگرام کاربر پنل را معطل نمی‌کند.
 */
import { HttpError } from "./http.js";
import { storage, storageKey, MAX_BYTES } from "./storage.js";
import * as C from "./sp-core.js";
import * as P from "./sp-push.js";
import { ensureSpWebhook } from "./sp-bot.js";
import { deliverSms, deliverPass, smsNote } from "./sp-sms.js";
import { aiKick } from "./ai-agent.js";
import { runAiCheck } from "./sp-ai.js";
import { verifyInitData, tgIdentity } from "./tg-auth.js";

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/* اعتبارِ initData در worker/tg-auth.js است (پنل کارشناس هم همان را می‌خواهد)؛ این‌جا برای آزمون‌ها دوباره صادر می‌شود */
export { verifyInitData };

async function whoAmI(request, env, deps) {
  const sess = T(request.headers.get("X-SP-Session"));
  if (sess) {
    const s = await C.sessionOf(env, sess);
    if (!s) throw new HttpError("نشست شما تمام شده است؛ دوباره وارد شوید.", 401, { relogin: true });
    return { supplier: s, side: "s", session: sess };
  }
  const init = request.headers.get("X-TG-Init");
  if (init) {
    const id = await tgIdentity(env, init);
    if (!id) throw new HttpError("اعتبار مینی‌اپ تلگرام تأیید نشد؛ صفحه را از داخل بات دوباره باز کنید.", 401);
    /* مینی‌اپِ بات کارشناسان: همان کارشناسی که گفت‌وگویش به حسابش گره خورده */
    if (id.bot === "main") {
      const ex = await env.DB.prepare("SELECT id, name, label, active FROM experts WHERE telegram_chat=? AND active=1").bind(String(id.user.id)).first();
      if (ex) return { expert: ex, side: "e" };
      throw new HttpError("این حساب تلگرام به هیچ کارشناسی وصل نیست؛ از پنل کارشناس «اتصال به تلگرام» را بزنید.", 401);
    }
    /* مینی‌اپِ بات مکاتبات: نقشِ فعلیِ همان گفت‌وگو (یک گفت‌وگو می‌تواند هر دو هویت را داشته باشد) */
    const row = await P.tgRow(env, id.user.id);
    if (row && row.role === "s" && row.phone_id) { const s = await C.phoneIdentity(env, row.phone_id); if (s) return { supplier: s, side: "s", tg: row }; }
    if (row && row.role === "e" && row.expert_id) {
      const ex = await env.DB.prepare("SELECT id, name, label, active FROM experts WHERE id=?").bind(row.expert_id).first();
      if (ex && ex.active) return { expert: ex, side: "e", tg: row };
    }
    throw new HttpError("این حساب تلگرام هنوز به سامانه وصل نیست: تأمین‌کننده لینکِ پیامک را در بات باز کند؛ کارشناس «بات مکاتبات» را از بات کارشناسان.", 401, { tg_unbound: true });
  }
  if (T(request.headers.get("X-Expert-Code"))) return { expert: await deps.requireExpert(request, env), side: "e" };
  throw new HttpError("وارد نشده‌اید.", 401);
}

/** کارِ بعد از پاسخ: در Worker با waitUntil، در تست همان‌جا */
async function later(ctx, fn) {
  const p = Promise.resolve().then(fn).catch((e) => console.error("sp later", e && e.message));
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p); else await p;
}

const meOut = (s) => ({ name: s.name, phone: C.maskPhone(s.phone), label: s.label, demo: !!s.demo, k: s.k });

/** بدنهٔ خام درخواست به انبار؛ خروجی: {skey, filename, mime, size} */
async function storeBody(env, request, url, aid, prefix) {
  const store = storage(env);
  if (!store) throw new HttpError("انبار فایل هنوز به سامانه وصل نیست.", 503);
  const size = int(request.headers.get("content-length")) || 0;
  if (size > MAX_BYTES) throw new HttpError(`حجم فایل بیشتر از ${Math.round(MAX_BYTES / 1048576)} مگابایت است.`, 413);
  if (!request.body) throw new HttpError("فایلی نرسید.");
  const filename = T(url.searchParams.get("filename")).slice(0, 120) || "file";
  const mime = request.headers.get("content-type") || "application/octet-stream";
  const skey = storageKey(aid, `${prefix}-${filename}`);
  await store.put(skey, request.body, { contentType: mime, size: size || undefined });
  return { skey, filename, mime, size: size || null };
}

async function signed(env, key, seconds = 300) {
  const store = storage(env);
  if (!store || !store.signedUrl) throw new HttpError("انبار فایل هنوز به سامانه وصل نیست.", 503);
  return store.signedUrl(key, seconds);
}

/**
 * مسیرهای /sp/*؛ اگر مسیر مال این‌جا نیست null.
 * deps: {requireExpert, readJson, json} از api.js — همان احراز کارشناس و همان شکلِ پاسخ.
 */
export async function spRoute(request, env, ctx, path, m, url, deps) {
  if (!path.startsWith("/sp/")) return null;
  const { json, readJson } = deps;
  let mm;

  /* --- عمومی --- */
  if (path === "/sp/info" && m === "GET") {
    let bot = await C.spBotUser(env);
    if (env.TG_SP_BOT_TOKEN && env.TG_WEBHOOK_SECRET) {
      const r = await ensureSpWebhook(env, url.origin).catch((e) => ({ error: e.message }));
      if (r && r.username) bot = r.username;
    }
    return json({ bot, botUrl: C.botLink(bot), company: C.COMPANY(env), labels: C.FILE_LABELS, telegram: !!env.TG_SP_BOT_TOKEN });
  }
  if (path === "/sp/login" && m === "POST") {
    const b = await readJson(request);
    const s = await C.login(env, b.k, b.password);
    return json({ ok: true, session: await C.newSession(env, s.phone_id, "web"), me: meOut(s) });
  }
  if (path === "/sp/resend" && m === "POST") {
    const b = await readJson(request);
    const r = await C.resendPassword(env, b.k);
    const d = await deliverPass(env, r).catch((e) => ({ sent: false, error: e.message, where: "" }));
    /* رمز فقط به گوشیِ خودِ تأمین‌کننده می‌رود؛ اگر پیامکِ واقعی نرفت، همان شبیه‌سازی (متن در گفت‌وگوی کارشناس) */
    return json({ ok: true, to: r.masked, sent: !!d.sent, demo: !d.sent, note: d.sent ? ""
      : d.where ? `پیامکِ واقعی ${d.error ? "نرفت" : "فعلاً خاموش است"}؛ متنِ پیامک (با رمز تازه) در ${d.where} آمد و کارشناس خرید آن را به شما می‌رساند.`
        : "پیامک فرستاده نشد و هنوز کارشناسی برای این شماره استعلامی نفرستاده؛ با کارشناس خرید تماس بگیرید." });
  }

  const who = await whoAmI(request, env, deps);

  /* --- هر دو طرف --- */
  if ((mm = /^\/sp\/thread\/(\d+)$/.exec(path)) && m === "GET") {
    const th = await C.threadFor(env, mm[1], who);
    return json(await C.threadFull(env, th, who.side));
  }
  if (path === "/sp/poll" && m === "GET") {
    const th = await C.threadFor(env, url.searchParams.get("t"), who);
    return json(await C.poll(env, th, who.side, url.searchParams.get("since")));
  }
  if ((mm = /^\/sp\/thread\/(\d+)\/msg$/.exec(path)) && m === "POST") {
    const th = await C.threadFor(env, mm[1], who);
    const r = await C.postMsg(env, th, who.side, (await readJson(request)).text);
    await later(ctx, () => P.pushMsgs(env, th, r.msgs));
    /* گفت‌وگوی کارشناس هوشمند: پیامِ تأمین‌کننده گامِ مذاکره را همان لحظه می‌زند (worker/ai-agent.js) */
    if (who.side === "s") aiKick(env, ctx, th.id);
    return json({ ok: true, msgs: r.msgs });
  }
  /* «پاک کردن گفت‌وگو» — فقط از صفحهٔ همین طرف؛ پیام‌ها در دیتابیس می‌مانند */
  if ((mm = /^\/sp\/thread\/(\d+)\/clear$/.exec(path)) && m === "POST") {
    const th = await C.threadFor(env, mm[1], who);
    return json(await C.clearMsgs(env, th, who.side));
  }
  if ((mm = /^\/sp\/file\/(\d+)\/url$/.exec(path)) && m === "GET") {
    const f = await C.fileFor(env, who, mm[1]);
    return json({ url: await signed(env, f.skey), name: f.filename });
  }
  if ((mm = /^\/sp\/bundle\/(\d+)\/pf-url$/.exec(path)) && m === "GET") {
    const b = await C.proformaOfBundle(env, who, mm[1]);
    return json({ url: await signed(env, b.pf_key), name: b.pf_name });
  }

  /* --- تأمین‌کننده --- */
  if (who.side === "s") {
    const sup = who.supplier;
    if (path === "/sp/me" && m === "GET") {
      const bot = await C.spBotUser(env);
      return json({ me: meOut(sup), threads: await C.supplierThreads(env, sup), labels: C.FILE_LABELS, company: C.COMPANY(env),
        bot, botLogin: C.botLink(bot, "s" + sup.k), via: who.tg ? "telegram" : "web", term_enums: C.TERM_ENUMS, term_fa: C.TERM_FA });
    }
    if (path === "/sp/logout" && m === "POST") {
      await C.logout(env, sup.phone_id, who.session);
      /* خروج از مینی‌اپ: فقط هویتِ تأمین‌کننده برداشته می‌شود؛ اگر همین گفت‌وگو کارشناس هم هست، با همان می‌ماند */
      if (who.tg) {
        if (who.tg.expert_id) await env.DB.prepare("UPDATE sp_tg SET phone_id=NULL, role='e', focus=NULL, flow_json=NULL WHERE chat=?").bind(who.tg.chat).run();
        else await env.DB.prepare("DELETE FROM sp_tg WHERE chat=?").bind(who.tg.chat).run();
      }
      return json({ ok: true });
    }
    if ((mm = /^\/sp\/line\/(\d+)$/.exec(path)) && m === "PUT") return json(await C.lineSave(env, sup, mm[1], await readJson(request)));
    if ((mm = /^\/sp\/line\/(\d+)\/ready$/.exec(path)) && m === "POST") return json(await C.lineReady(env, sup, mm[1], !!(await readJson(request)).on));
    if ((mm = /^\/sp\/thread\/(\d+)\/terms$/.exec(path)) && (m === "POST" || m === "PUT")) return json(await C.termsSave(env, sup, mm[1], await readJson(request)));
    if ((mm = /^\/sp\/thread\/(\d+)\/submit$/.exec(path)) && m === "POST") {
      const r = await C.submitLines(env, sup, mm[1], (await readJson(request)).line_ids);
      await later(ctx, () => P.pushMsgs(env, r.thread, r.msgs));
      aiKick(env, ctx, r.thread.id);
      return json({ ok: true, bundle_id: r.bundle_id, state: r.state });
    }
    /* ارسالِ مشخصات همراه با پیش‌فاکتور، یک‌جا: بدنه خودِ فایل است، اقلام در ids (۱,۲,…) */
    if ((mm = /^\/sp\/thread\/(\d+)\/submit-pf$/.exec(path)) && m === "POST") {
      const th = await C.threadFor(env, mm[1], who);
      const ids = T(url.searchParams.get("ids")).split(",").map(int).filter(Boolean);
      const f = await storeBody(env, request, url, th.assignment_id, "sp-pf");
      let r;
      try { r = await C.submitLines(env, sup, th.id, ids, f); }
      catch (e) { const store = storage(env); if (store) await later(ctx, () => store.remove(f.skey)); throw e; }
      await later(ctx, () => P.pushMsgs(env, r.thread, r.msgs));
      aiKick(env, ctx, r.thread.id);
      return json({ ok: true, bundle_id: r.bundle_id, state: r.state });
    }
    if ((mm = /^\/sp\/line\/(\d+)\/file$/.exec(path)) && m === "POST") {
      const target = await C.fileTarget(env, sup, mm[1], url.searchParams.get("label"));
      const th = await C.threadFor(env, target.line.thread_id, who);
      const f = await storeBody(env, request, url, th.assignment_id, "sp");
      const r = await C.addFile(env, sup, target, { ...f, note: url.searchParams.get("note") });
      await later(ctx, () => P.pushMsgs(env, th, r.msgs));
      aiKick(env, ctx, th.id);
      return json({ ok: true, id: r.id });
    }
    if ((mm = /^\/sp\/file\/(\d+)$/.exec(path)) && m === "DELETE") {
      const r = await C.delFile(env, sup, mm[1]);
      const store = storage(env);
      if (store && r.skey) await later(ctx, () => store.remove(r.skey));
      return json({ ok: true });
    }
    if ((mm = /^\/sp\/bundle\/(\d+)\/proforma$/.exec(path)) && m === "POST") {
      const tg = await C.proformaTarget(env, sup, mm[1]);
      const f = await storeBody(env, request, url, tg.th.assignment_id, "sp-pf");
      const r = await C.setProforma(env, tg, f);
      const store = storage(env);
      if (r.old && store) await later(ctx, () => store.remove(r.old));
      await later(ctx, () => P.pushMsgs(env, r.thread, r.msgs));
      aiKick(env, ctx, r.thread.id);
      return json({ ok: true });
    }
    throw new HttpError("مسیر پیدا نشد.", 404);
  }

  /* --- کارشناس --- */
  const ex = who.expert;
  if (path === "/sp/x/threads" && m === "GET") {
    return json({ ...(await C.expertThreads(env, ex)), me: { name: ex.name, label: ex.label }, bot: await C.spBotUser(env), via: who.tg ? "telegram" : "web",
      labels: C.FILE_LABELS, demo: C.DEMO.name, term_fa: C.TERM_FA });
  }
  if (path === "/sp/x/items" && m === "GET") return json({ items: await C.sendableItems(env, ex, url.searchParams.get("aid")) });
  if (path === "/sp/x/phones" && m === "GET") return json({ phones: await C.phonesOfName(env, url.searchParams.get("name")) });
  /* شمارهٔ تازه برای تأمین‌کننده — از کارتِ تأمین‌کنندهٔ «بررسی سوابق» در پنل کارشناس (مهر ۱۴۰۵)؛ تیکِ «پنل» اختیاری */
  if (path === "/sp/x/phones" && m === "POST") return json({ ok: true, ...(await C.savePhone(env, ex.id, await readJson(request))) });
  if (path === "/sp/x/send" && m === "POST") {
    const r = await C.spSend(env, ex, await readJson(request));
    await later(ctx, () => P.pushMsgs(env, { id: r.thread_id }, r.msgs));
    /* پیامکِ واقعی اگر درگاه وصل است (sp-sms.js)؛ متنِ با رمز فقط وقتی به پنل برمی‌گردد که پیامک نرفت */
    const d = await deliverSms(env, { smsId: r.sms.id, expertId: ex.id, threadId: r.thread_id, supplier: r.supplier.name, to: r.sms.to, label: r.sms.label,
      text: r.sms.text, panel: r.links.panel, bot: r.links.bot, demo: r.supplier.demo, kind: "rfq" }, { sim: "none" });
    return json({ ...r, sms: { to: r.sms.to, label: r.sms.label, sent: d.sent, via: d.via, error: d.error, note: smsNote(d, C.maskPhone(r.sms.to)),
      ...(d.sent ? {} : { text: r.sms.text }) } });
  }
  if ((mm = /^\/sp\/x\/bundle\/(\d+)\/decide$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    const r = await C.decide(env, ex, mm[1], T(b.action), { comment: b.comment });
    await later(ctx, () => P.pushMsgs(env, r.thread, r.msgs));
    return json({ ok: true, state: r.state, quote_ids: r.quote_ids, gaps: r.gaps, demo: r.demo });
  }
  /* جدول تطابق: پذیرفتنِ مغایرت (پیش‌فاکتور ملاک) — keys یا all */
  if ((mm = /^\/sp\/x\/bundle\/(\d+)\/accept$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    const r = await C.acceptRows(env, ex, mm[1], { keys: b.keys || b.key, on: b.on !== false, all: b.all === true });
    return json({ ok: true, accept: r.accept, ready: r.ready, problems: r.problems, gaps: r.gaps });
  }
  if ((mm = /^\/sp\/x\/bundle\/(\d+)\/ai$/.exec(path)) && m === "POST") {
    const b = await readJson(request);
    if (b.confirm !== true) throw new HttpError("خوانش هوشمند فقط با تأیید شما اجرا می‌شود.", 428);
    const tg = await C.aiTarget(env, ex, mm[1]);
    const ai = await runAiCheck(env, { fileUrl: await signed(env, tg.b.pf_key, 900), mime: tg.b.pf_mime, lines: tg.lines, terms: tg.terms });
    await C.saveAi(env, tg, ai);
    return json({ ok: true, ai });
  }
  if (path === "/sp/x/tglink" && m === "POST") return json(await C.expertLink(env, ex.id));
  throw new HttpError("مسیر پیدا نشد.", 404);
}
