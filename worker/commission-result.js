/**
 * نتیجهٔ کمیسیون و پیامِ تشکر به تأمین‌کنندگانی که از آن‌ها خرید نشد (درخواست مالک، مهر ۱۴۰۵)
 *
 * پشتیبانی در پنل خودش برای هر قلمِ بازِ یک ارجاع، برنده را از میانِ استعلام‌های ثبت‌شده انتخاب می‌کند و علتِ انتخاب را
 * می‌گذارد (قیمت پایین‌تر، تحویل زودتر، …). با ثبت:
 *   • نتیجه در commission_results می‌ماند (یک ردیف برای هر قلم؛ ثبتِ دوباره جای قبلی را می‌گیرد)
 *   • تیکِ «تأیید کمیسیون» همان اقلام زده می‌شود (support.js:setCommission — کارشناس در تلگرام خبردار می‌شود)
 *   • به هر تأمین‌کننده‌ای که برای این اقلام پیشنهاد داده و برنده نشده، یک پیامِ تشکر با علت در گفت‌وگوی خودش می‌رود
 *     (و تلگرامِ بات مکاتباتش اگر وصل است)، و اگر شمارهٔ پنل دارد و پشتیبانی خواسته، پیامکِ کوتاهش
 * پیام فقط یک بار برای هر قلم و تأمین‌کننده می‌رود (commission_notes)؛ ثبتِ دوباره کسی را دوبار خبر نمی‌کند.
 */
import { HttpError } from "./http.js";
import { setCommission } from "./support.js";
import { pushMsgs } from "./sp-push.js";
import { smsReady, sendSms } from "./sms.js";

export const CR_DDL = `
CREATE TABLE IF NOT EXISTS commission_results (item_id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL, request_id TEXT, quote_id INTEGER, winner TEXT, price REAL, reason TEXT NOT NULL, reason_text TEXT, by TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cr_asg ON commission_results(assignment_id);
CREATE TABLE IF NOT EXISTS commission_notes (item_id INTEGER NOT NULL, supplier TEXT NOT NULL, thread_id INTEGER, sms TEXT, at INTEGER NOT NULL, PRIMARY KEY (item_id, supplier)) WITHOUT ROWID;
`;

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const now = () => Date.now();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const nameKey = (s) => T(s).replace(/[يى]/g, "ی").replace(/ك/g, "ک").replace(/[‌\s]+/g, " ").toLowerCase();

/** علت‌های انتخاب؛ phrase همان تکه‌ای است که در پیامِ تأمین‌کنندهٔ دیگر می‌آید («… به‌خاطرِ قیمتِ پایین‌تر …») */
export const REASONS = {
  price: { fa: "قیمت پایین‌تر", phrase: "به‌خاطرِ قیمتِ پایین‌تر" },
  time: { fa: "زمان تحویل کوتاه‌تر", phrase: "به‌خاطرِ زمانِ تحویلِ کوتاه‌تر" },
  pay: { fa: "شرایط پرداخت بهتر", phrase: "به‌خاطرِ شرایطِ پرداختِ مناسب‌تر" },
  spec: { fa: "انطباق بیشتر با مشخصات", phrase: "به‌خاطرِ انطباقِ بیشتر با مشخصاتِ خواسته‌شده" },
  record: { fa: "سابقهٔ همکاری", phrase: "به‌خاطرِ سابقهٔ همکاریِ قبلی" },
  other: { fa: "علت دیگر", phrase: "" },
};

/**
 * پیشنهادهای هر قلم با گفت‌وگو و شمارهٔ تأمین‌کننده (اگر دارد). گفت‌وگوی قدیمیِ «تأمین‌کنندهٔ فرضی» (demo=1) این‌جا نیست: نه پیامِ
 * تشکر می‌گیرد و نه پیامک
 */
async function itemsOf(env, aid) {
  const a = await env.DB.prepare("SELECT a.id, a.request_id, a.expert_id, r.party FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  const [items, quotes, threads, results, notes] = await Promise.all([
    env.DB.prepare("SELECT id, title, qty, unit, line_no, commission_ok FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no").bind(aid).all(),
    env.DB.prepare("SELECT id, item_id, supplier_name, price, qty, unit, dtime, pay, invoice, vat, saved, final, origin, origin_ref FROM quotes WHERE assignment_id=? AND saved=1 ORDER BY item_id, price").bind(aid).all(),
    env.DB.prepare(`SELECT t.id, t.supplier_id, s.name, p.phone, p.id AS phone_id, (SELECT b.id FROM sp_bundles b WHERE b.thread_id=t.id ORDER BY b.id DESC LIMIT 1) AS last_b
      FROM sp_threads t JOIN sp_suppliers s ON s.id=t.supplier_id AND s.demo=0 LEFT JOIN sp_phones p ON p.id=t.phone_id WHERE t.assignment_id=? AND (t.request_id IS NULL OR t.request_id=?)`).bind(aid, a.request_id).all(),
    env.DB.prepare("SELECT * FROM commission_results WHERE assignment_id=?").bind(aid).all(),
    env.DB.prepare("SELECT n.* FROM commission_notes n JOIN items i ON i.id=n.item_id WHERE i.assignment_id=?").bind(aid).all(),
  ]);
  const th = threads.results || [];
  const bundles = new Map();
  for (const t of th) {
    for (const b of ((await env.DB.prepare("SELECT id FROM sp_bundles WHERE thread_id=?").bind(t.id).all()).results || [])) bundles.set(b.id, t);
  }
  const threadOf = (q) => (q.origin === "supplier" && bundles.get(q.origin_ref)) || th.find((t) => nameKey(t.name) === nameKey(q.supplier_name)) || null;
  const res = new Map((results.results || []).map((r) => [r.item_id, r]));
  const sent = new Set((notes.results || []).map((n) => `${n.item_id}|${nameKey(n.supplier)}`));
  return {
    a,
    items: (items.results || []).map((it) => {
      const qs = (quotes.results || []).filter((q) => q.item_id === it.id).map((q) => {
        const t = threadOf(q);
        return { id: q.id, supplier: q.supplier_name, price: q.price, total: q.price != null && it.qty != null ? q.price * (q.qty ?? it.qty) : null, qty: q.qty, unit: q.unit,
          dtime: q.dtime, pay: q.pay, invoice: q.invoice, vat: q.vat, final: !!q.final, thread_id: t ? t.id : null,
          phone: t && t.phone ? `${t.phone.slice(0, 4)}•••${t.phone.slice(-4)}` : null, sent: sent.has(`${it.id}|${nameKey(q.supplier_name)}`) };
      });
      return { ...it, quotes: qs, result: res.get(it.id) || null };
    }),
    threads: th,
  };
}

/** GET /support/commission/result?aid= — اقلامِ باز با پیشنهادها و نتیجهٔ ثبت‌شده */
export async function commissionResultGet(env, url) {
  const aid = int(url.searchParams.get("aid"));
  if (!aid) throw new HttpError("ارجاع مشخص نیست.");
  const d = await itemsOf(env, aid);
  return { assignment: d.a, items: d.items, reasons: Object.entries(REASONS).map(([k, v]) => ({ key: k, fa: v.fa })), sms: smsReady(env) };
}

const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join("، ")} و ${xs[xs.length - 1]}`);

/** متنِ پیامِ تشکر برای یک تأمین‌کننده؛ lost: [{title, phrase}] */
export function regretText(lost, company) {
  const titles = lost.map((x) => `«${x.title}»`);
  const phrases = [...new Set(lost.map((x) => x.phrase).filter(Boolean))];
  const why = phrases.length === 1 ? ` ${phrases[0]}` : "";
  const per = phrases.length > 1 ? `\n${lost.filter((x) => x.phrase).map((x) => `• «${x.title}»: ${x.phrase}`).join("\n")}` : "";
  return `سلام، وقتتون بخیر\nممنون که برای ${list(titles)} پیشنهاد فرستادید و پاسخگو بودید. کمیسیون معاملات شرکت ${company} این بار${why} از تأمین‌کنندهٔ دیگری خرید کرد.${per}\n`
    + "امیدواریم در خریدهای بعدی با هم همکاری کنیم.";
}
const smsText = (lost, company, request) =>
  `شرکت ${company}: از پیشنهادتان برای استعلام ${faN(request)} سپاسگزاریم. این بار خرید از تأمین‌کنندهٔ دیگری انجام شد؛ امیدواریم در خریدهای بعدی همکاری کنیم.`;

/**
 * POST /support/commission/result — body {assignment_id, items: [{item_id, quote_id, reason, reason_text}], notify (پیش‌فرض بله), sms (پیش‌فرض بله)}
 * برنده باید یکی از استعلام‌های ثبت‌شدهٔ همان قلم باشد. خروجی: {ok, saved, messages, sms, notified}
 */
export async function commissionResultSave(env, body, company) {
  const aid = int(body && body.assignment_id);
  if (!aid) throw new HttpError("ارجاع مشخص نیست.");
  const picks = Array.isArray(body.items) ? body.items : [];
  if (!picks.length) throw new HttpError("برای هیچ قلمی برنده انتخاب نشده.");
  const d = await itemsOf(env, aid);
  const t = now();
  const rows = [];
  for (const p of picks) {
    const it = d.items.find((x) => x.id === int(p.item_id));
    if (!it) throw new HttpError("این قلم در این ارجاع باز نیست.");
    const q = it.quotes.find((x) => x.id === int(p.quote_id));
    if (!q) throw new HttpError(`برندهٔ «${it.title}» باید یکی از استعلام‌های ثبت‌شدهٔ همین قلم باشد.`);
    const reason = REASONS[p.reason] ? p.reason : "price";
    const text = T(p.reason_text).slice(0, 300);
    if (reason === "other" && !text) throw new HttpError(`علتِ انتخابِ «${q.supplier}» برای «${it.title}» را بنویسید.`);
    rows.push({ it, q, reason, text });
  }
  const stmts = rows.map((r) => env.DB.prepare(`INSERT INTO commission_results (item_id,assignment_id,request_id,quote_id,winner,price,reason,reason_text,by,at) VALUES (?,?,?,?,?,?,?,?,'support',?)
      ON CONFLICT(item_id) DO UPDATE SET quote_id=excluded.quote_id, winner=excluded.winner, price=excluded.price, reason=excluded.reason, reason_text=excluded.reason_text, by=excluded.by, at=excluded.at`)
    .bind(r.it.id, aid, d.a.request_id, r.q.id, r.q.supplier, r.q.price, r.reason, r.text || null, t));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)").bind(t, "support", "commission_result", d.a.request_id,
    JSON.stringify({ assignment_id: aid, items: rows.map((r) => ({ item_id: r.it.id, title: r.it.title, winner: r.q.supplier, price: r.q.price, reason: r.reason, reason_text: r.text || null })) })));
  await env.DB.batch(stmts);
  /* تیکِ «تأیید کمیسیون» همان اقلام (کارشناس خبردار می‌شود) */
  const cm = await setCommission(env, { item_ids: rows.map((r) => r.it.id), ok: true });

  /* پیامِ تشکر: هر تأمین‌کننده‌ای که برای این اقلام پیشنهاد داده و برنده نشده — یک پیام برای هر گفت‌وگو */
  let messages = 0, sms = 0;
  if (body.notify !== false) {
    const bySup = new Map();
    for (const r of rows) {
      const phrase = r.reason === "other" ? `به این علت که ${r.text}` : REASONS[r.reason].phrase;
      for (const q of r.it.quotes) {
        if (q.id === r.q.id || nameKey(q.supplier) === nameKey(r.q.supplier) || q.sent || !q.thread_id) continue;
        const k = q.thread_id;
        if (!bySup.has(k)) bySup.set(k, { thread_id: k, supplier: q.supplier, lost: [] });
        if (!bySup.get(k).lost.some((x) => x.item_id === r.it.id)) bySup.get(k).lost.push({ item_id: r.it.id, title: r.it.title, phrase });
      }
    }
    for (const g of bySup.values()) {
      const text = regretText(g.lost, company);
      const at = now();
      const meta = { sys: "regret", items: g.lost.map((x) => x.item_id) };
      const [ins] = await env.DB.batch([
        env.DB.prepare("INSERT INTO sp_msgs (thread_id,who,kind,body,meta_json,at) VALUES (?,?,?,?,?,?)").bind(g.thread_id, "e", "text", text, JSON.stringify(meta), at),
        env.DB.prepare("UPDATE sp_threads SET last_at=?, rev=rev+1 WHERE id=?").bind(at, g.thread_id),
      ]);
      messages++;
      await pushMsgs(env, { id: g.thread_id }, [{ id: ins.meta.last_row_id, thread_id: g.thread_id, who: "e", kind: "text", body: text, meta, at }]).catch(() => {});
      let smsVia = null;
      const th = d.threads.find((x) => x.id === g.thread_id);
      if (body.sms !== false && th && th.phone && smsReady(env)) {
        /* commission_notes.sms: نامِ درگاهی که پیامک را برد (textbee | ippanel) یا «failed: …» */
        try { smsVia = (await sendSms(env, th.phone, smsText(g.lost, company, d.a.request_id), { pattern: { key: "thanks", params: { req: faN(d.a.request_id) } } })).provider; sms++; }
        catch (e) { smsVia = `failed: ${String((e && e.message) || e).slice(0, 120)}`; }
      }
      await env.DB.batch(g.lost.map((x) => env.DB.prepare("INSERT OR REPLACE INTO commission_notes (item_id,supplier,thread_id,sms,at) VALUES (?,?,?,?,?)")
        .bind(x.item_id, g.supplier, g.thread_id, smsVia, at)));
    }
  }
  return { ok: true, saved: rows.length, messages, sms, notified: cm.notified || 0, changed: cm.changed || 0 };
}
