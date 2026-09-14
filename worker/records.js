/**
 * ثبت‌های پایگاه داده — آنچه در جریان کار رخ می‌دهد و باید بماند
 *
 * تصمیم مدیر (شهریور ۱۴۰۵): تغییرات مهم سامانه نه فقط «آخرین وضعیت»، بلکه با تاریخ و
 * عامل ثبت شوند تا بعداً بشود تحلیلشان کرد:
 *   • هر تأمین‌کننده و هر شمارهٔ تلفنی که جستجوی هوشمند پیدا کرد (search_suppliers، supplier_phones)
 *   • بررسی پیام‌رسان‌های هر شماره — یک ردیف برای هر شماره با ستونِ هر پیام‌رسان، مشترک بین
 *     همهٔ کارشناسان، و تاریخچهٔ هر کلیک (phone_channels، phone_channel_log)
 *   • جستجوهای قبلیِ همان قلم، حتی در درخواست و دستِ کارشناسِ دیگر (کلید قلم روی smart_searches)
 *   • ارجاع‌ها با زمان، کارشناس و مهلت (assignment_log)
 *   • هر تغییرِ تنظیمات، ضرایب و امتیازهای مدیر (settings_history، scores_history)
 *   • خط‌های استعلامِ حذف‌شده (quotes_deleted) — از تب و بات کامل بیرون می‌روند، ولی می‌مانند
 *   • هر جدول کمیسیونِ ساخته‌شده با خط‌هایش (commission_tables) و تصمیم‌های خاتمه (closures)
 *
 * این‌جا فقط تابع‌های ثبت و خواندن است؛ DDL در api.js (ثابت SCHEMA) و schema.sql.
 */

const now = () => Date.now();

/* ------------------------------------------------------------------ */
/* کلید قلم و شمارهٔ تلفن                                               */
/* ------------------------------------------------------------------ */

/** عنوان نرمال‌شده — همان قاعدهٔ api.js:nrm، به‌علاوهٔ حروف کوچک */
export const titleKey = (x) => String(x == null ? "" : x).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک")
  .replace(/‌/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/* پیش‌شمارهٔ هر بازار (نام فارسی، همان که در نتیجهٔ جستجو می‌آید) */
const DIAL = { "ایران": "98", "تاجیکستان": "992", "ترکمنستان": "993", "ازبکستان": "998", "قزاقستان": "7", "ارمنستان": "374", "چین": "86", "امارات": "971", "ترکیه": "90" };

/**
 * کلید یکتای یک شماره: فقط رقم با «+» و پیش‌شمارهٔ کشور. همان شماره اگر یک بار
 * «۰۹۱۲ ۱۲۳ ۴۵۶۷» و بار دیگر «+98 912-123-4567» آمده باشد، یک کلید می‌گیرد — وگرنه
 * تیکی که کارشناسی زده برای کارشناس بعدی پیدا نمی‌شد.
 */
export function phoneKey(raw, market) {
  let s = String(raw == null ? "" : raw)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
  const plus = /^\s*\+/.test(s);
  s = s.replace(/\D/g, "");
  if (!s) return "";
  if (plus) return "+" + s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  const dial = DIAL[String(market || "").trim()];
  if (s.startsWith("0") && dial) return "+" + dial + s.replace(/^0+/, "");
  if (dial && s.startsWith(dial) && s.length > dial.length + 7) return "+" + s;
  return s;
}

const phonesOf = (s) => (Array.isArray(s.phones) ? s.phones : []).map((p) => (p && typeof p === "object" ? p.e164 || p.verbatim : p)).filter(Boolean);

/** هر تأمین‌کنندهٔ نتیجه، کلید شماره‌هایش را هم دارد (phone_keys هم‌ردیفِ phones) */
export function withPhoneKeys(result) {
  if (!result || !Array.isArray(result.suppliers)) return result;
  return {
    ...result,
    suppliers: result.suppliers.map((s) => {
      if (!s || typeof s !== "object") return s;
      const market = s.market || (s.location && s.location.country) || "";
      return { ...s, phone_keys: phonesOf(s).map((p) => phoneKey(p, market)) };
    }),
  };
}

/* ------------------------------------------------------------------ */
/* جستجوی هوشمند: تأمین‌کنندگان، شماره‌ها، جستجوهای قبلی همان قلم        */
/* ------------------------------------------------------------------ */

/** کلیدهای قلم برای ردیف smart_searches — پیدا کردن همان قلم در درخواست دیگر */
export const itemKeys = (it) => ({ item_code: it.code || null, hist_code: it.hist_code || null, title_n: titleKey(it.title) || null });

/**
 * تأمین‌کنندگان و شماره‌های یک جستجو، ردیف‌به‌ردیف. نتیجهٔ کامل همچنان در
 * smart_searches.result_json است؛ این‌ها برای پرس‌وجو و تحلیل‌اند.
 */
export function searchSupplierStmts(env, searchId, it, ex, result, t) {
  const stmts = [];
  (result.suppliers || []).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const market = s.market || (s.location && s.location.country) || "";
    const emails = (Array.isArray(s.emails) ? s.emails : []).map((e) => (e && typeof e === "object" ? e.verbatim : e)).filter(Boolean);
    const price = s.price && typeof s.price === "object" ? s.price : null;
    stmts.push(env.DB.prepare(
      `INSERT INTO search_suppliers (search_id,idx,item_id,assignment_id,request_id,expert_id,name,name_n,type,market,website,emails_json,price_text,price_unit,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(searchId, i, it.id, it.aid || null, it.request_id || null, ex ? ex.id : null, String(s.name || ""), titleKey(s.name),
      s.type || s.role || null, market || null, s.website || null, emails.length ? JSON.stringify(emails) : null,
      price ? price.text || null : null, price ? price.unit || null : null, t));
    for (const p of phonesOf(s)) {
      const key = phoneKey(p, market);
      if (!key) continue;
      stmts.push(env.DB.prepare("INSERT INTO supplier_phones (search_id,idx,phone,phone_raw,supplier_name,market,created_at) VALUES (?,?,?,?,?,?,?)")
        .bind(searchId, i, key, String(p), String(s.name || ""), market || null, t));
    }
  });
  return stmts;
}

/**
 * همهٔ جستجوهای همان قلم — این قلم، یا همان قلم در درخواست‌ها و دستِ کارشناس‌های دیگر
 * (کد استاندارد، کد راهکاران یا عنوان نرمال). تازه‌ترین اول.
 */
export async function itemSearches(env, it, limit = 8) {
  const k = itemKeys(it);
  const rows = (await env.DB.prepare(
    `SELECT s.id, s.item_id, s.assignment_id, s.expert_id, s.request_id, s.result_json, s.params_json, s.cost_usd, s.created_at, s.prompt_version,
            e.name AS expert_name, e.label AS expert_label
       FROM smart_searches s LEFT JOIN experts e ON e.id=s.expert_id
      WHERE s.item_id=? OR (s.hist_code IS NOT NULL AND s.hist_code=?) OR (s.item_code IS NOT NULL AND s.item_code=?) OR (s.title_n IS NOT NULL AND s.title_n=?)
      ORDER BY s.id DESC LIMIT ?`,
  ).bind(it.id, k.hist_code, k.item_code, k.title_n, limit).all()).results || [];
  return rows.map((r) => {
    let result = null, params = null;
    try { result = JSON.parse(r.result_json); } catch (_) { /* خراب */ }
    try { params = JSON.parse(r.params_json); } catch (_) { /* خراب */ }
    return {
      search_id: r.id, item_id: r.item_id, assignment_id: r.assignment_id, expert_id: r.expert_id, request_id: r.request_id,
      expert: r.expert_label || r.expert_name || "", created_at: r.created_at, cost: r.cost_usd, same_item: r.item_id === it.id,
      markets: params && params.markets, result: withPhoneKeys(result),
    };
  });
}

/**
 * ردیف‌های قدیمی smart_searches کلید قلم ندارند؛ یک بار در هر isolate از جدول اقلام
 * پر می‌شوند. عنوان نرمال فقط در JS درست ساخته می‌شود، برای همین در SQL نیست.
 */
export async function backfillSearchKeys(env) {
  const rows = (await env.DB.prepare(
    `SELECT s.id, i.title, i.code, i.hist_code, i.request_id FROM smart_searches s JOIN items i ON i.id=s.item_id
      WHERE s.title_n IS NULL LIMIT 200`,
  ).all()).results || [];
  if (!rows.length) return 0;
  await env.DB.batch(rows.map((r) => {
    const k = itemKeys(r);
    return env.DB.prepare("UPDATE smart_searches SET item_code=?, hist_code=?, title_n=?, request_id=COALESCE(request_id,?) WHERE id=?")
      .bind(k.item_code, k.hist_code, k.title_n || "", r.request_id || null, r.id);
  }));
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* پیام‌رسان‌های هر شماره                                                */
/* ------------------------------------------------------------------ */

export const PLATFORMS = ["telegram", "whatsapp", "bale", "rubika"];
const STATES = ["ok", "no", "unk"];

/** وضعیت ثبت‌شدهٔ شماره‌ها: { "+98912…": { telegram:"ok", whatsapp:"no", …, updated_at, updated_by } } */
export async function phoneChannels(env, keys) {
  const list = [...new Set((keys || []).filter(Boolean))].slice(0, 300);
  const out = {};
  for (let i = 0; i < list.length; i += 90) {
    const part = list.slice(i, i + 90);
    const rows = (await env.DB.prepare(
      `SELECT c.*, e.name AS expert_name, e.label AS expert_label FROM phone_channels c LEFT JOIN experts e ON e.id=c.updated_by
        WHERE c.phone IN (${part.map(() => "?").join(",")})`,
    ).bind(...part).all()).results || [];
    for (const r of rows) {
      out[r.phone] = { updated_at: r.updated_at, updated_by: r.expert_label || r.expert_name || null };
      for (const p of PLATFORMS) out[r.phone][p] = r[p] || "unk";
    }
  }
  return out;
}

/** یک کلیک کارشناس: وضعیت یک پیام‌رسانِ یک شماره + ردیف تاریخچه */
export async function setPhoneChannel(env, expertId, phone, platform, state) {
  if (!PLATFORMS.includes(platform)) throw Object.assign(new Error("پیام‌رسان نامعتبر است."), { status: 400 });
  if (!STATES.includes(state)) throw Object.assign(new Error("وضعیت باید ok، no یا unk باشد."), { status: 400 });
  const key = String(phone || "").trim();
  if (!key || key.length > 32) throw Object.assign(new Error("شمارهٔ تلفن نامعتبر است."), { status: 400 });
  const t = now();
  const prev = await env.DB.prepare(`SELECT ${platform} AS s FROM phone_channels WHERE phone=?`).bind(key).first();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO phone_channels (phone,${platform},updated_by,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(phone) DO UPDATE SET ${platform}=excluded.${platform}, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .bind(key, state, expertId || null, t),
    env.DB.prepare("INSERT INTO phone_channel_log (phone,platform,state,prev_state,expert_id,at) VALUES (?,?,?,?,?,?)")
      .bind(key, platform, state, (prev && prev.s) || null, expertId || null, t),
  ]);
  return (await phoneChannels(env, [key]))[key];
}

/* ------------------------------------------------------------------ */
/* ارجاع، تنظیمات و امتیازها                                            */
/* ------------------------------------------------------------------ */

/** یک ردیف تاریخچهٔ ارجاع — action: assign | unassign | reassign | days | dispatch */
export const assignmentLogStmt = (env, r) => env.DB.prepare(
  `INSERT INTO assignment_log (at,action,request_id,assignment_id,expert_id,from_expert_id,days,deadline_at,item_ids_json,source,actor)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
).bind(r.at || now(), r.action, r.request_id || null, r.assignment_id || null, r.expert_id || null, r.from_expert_id || null,
  r.days == null ? null : r.days, r.deadline_at || null, r.item_ids ? JSON.stringify(r.item_ids) : null, r.source || "manual", r.actor || "manager");

/** تنظیمات: فقط کلیدهایی که واقعاً عوض شده‌اند، با مقدار قبلی */
export async function settingsHistoryStmts(env, patch, actor) {
  const keys = Object.keys(patch || {});
  if (!keys.length) return [];
  const old = new Map(((await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => "?").join(",")})`).bind(...keys).all()).results || [])
    .map((r) => [r.key, r.value]));
  const t = now();
  return keys.filter((k) => old.get(k) !== JSON.stringify(patch[k])).map((k) =>
    env.DB.prepare("INSERT INTO settings_history (key,value_json,prev_json,at,actor) VALUES (?,?,?,?,?)")
      .bind(k, JSON.stringify(patch[k]), old.has(k) ? old.get(k) : null, t, actor || "manager"));
}

/** امتیاز کارشناس‌ها و ضریب گروه/پروژه: فقط تغییرها، با مقدار قبلی */
export async function scoresHistoryStmts(env, body, actor) {
  const t = now(), out = [];
  const scores = Array.isArray(body.scores) ? body.scores : [], weights = Array.isArray(body.weights) ? body.weights : [];
  for (const s of scores) {
    const score = Math.max(0, Math.min(5, parseInt(s.score, 10) || 0));
    const prev = await env.DB.prepare("SELECT score FROM expert_scores WHERE expert_id=? AND kind=? AND key=?").bind(parseInt(s.expert_id, 10), String(s.kind), String(s.key)).first();
    if (prev && prev.score === score) continue;
    out.push(env.DB.prepare("INSERT INTO scores_history (kind,expert_id,score_kind,key,value,prev,at,actor) VALUES ('score',?,?,?,?,?,?,?)")
      .bind(parseInt(s.expert_id, 10), String(s.kind), String(s.key), score, prev ? prev.score : null, t, actor || "manager"));
  }
  for (const w of weights) {
    const v = Number(w.w) || 1;
    const prev = await env.DB.prepare("SELECT w FROM weights WHERE kind=? AND key=?").bind(String(w.kind), String(w.key)).first();
    if (prev && prev.w === v) continue;
    out.push(env.DB.prepare("INSERT INTO scores_history (kind,expert_id,score_kind,key,value,prev,at,actor) VALUES ('weight',NULL,?,?,?,?,?,?)")
      .bind(String(w.kind), String(w.key), v, prev ? prev.w : null, t, actor || "manager"));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* خط‌های استعلام، جدول کمیسیون، خاتمه                                   */
/* ------------------------------------------------------------------ */

/**
 * حذف خط‌های استعلام (تصمیم مدیر): از تب استعلامات و همهٔ گزینه‌های بات کامل بیرون
 * می‌روند — ردیفشان واقعاً از quotes پاک می‌شود — ولی نسخهٔ کاملشان با زمان و عامل در
 * quotes_deleted می‌ماند. `expertId` مالکیت را هم می‌سنجد. تعداد حذف‌شده را برمی‌گرداند.
 */
export async function deleteQuotes(env, { ids, expertId, assignmentId, channel }) {
  const list = [...new Set((ids || []).map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  if (!list.length) return 0;
  const rows = (await env.DB.prepare(
    `SELECT q.*, a.request_id AS _request_id FROM quotes q JOIN assignments a ON a.id=q.assignment_id
      WHERE q.id IN (${list.map(() => "?").join(",")}) AND a.expert_id=?${assignmentId ? " AND q.assignment_id=?" : ""}`,
  ).bind(...list, expertId, ...(assignmentId ? [assignmentId] : [])).all()).results || [];
  if (!rows.length) return 0;
  const t = now();
  const stmts = rows.map((q) => {
    const { _request_id, ...row } = q;
    return env.DB.prepare("INSERT INTO quotes_deleted (quote_id,assignment_id,request_id,item_id,supplier_name,row_json,deleted_at,deleted_by,channel) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(q.id, q.assignment_id, _request_id || null, q.item_id, q.supplier_name, JSON.stringify(row), t, expertId || null, channel || "panel");
  });
  stmts.push(env.DB.prepare(`DELETE FROM quotes WHERE id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((q) => q.id)));
  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${expertId}`, "quote_deleted", rows[0]._request_id || null,
      JSON.stringify({ assignment_id: rows[0].assignment_id, quote_ids: rows.map((q) => q.id), suppliers: [...new Set(rows.map((q) => q.supplier_name))], channel: channel || "panel" })));
  await env.DB.batch(stmts);
  return rows.length;
}

/**
 * عکسِ یک جدول کمیسیونِ ساخته‌شده: شماره، زمان، کارشناس، خط‌های تأییدنهایی و توضیحات.
 * روی خود خط‌ها هم commission_at می‌نشیند — خطِ داخل آخرین جدول تاریخ دارد و بقیه NULL.
 */
export async function commissionRecordStmts(env, aid, { no, expertId, channel, t }) {
  const at = t || now();
  const [a, lines] = await Promise.all([
    env.DB.prepare("SELECT request_id, notes FROM assignments WHERE id=?").bind(aid).first(),
    env.DB.prepare(`SELECT q.id, q.item_id, q.supplier_name, q.price, q.qty, q.unit, q.vat, q.origin, i.title
      FROM quotes q JOIN items i ON i.id=q.item_id WHERE q.assignment_id=? AND q.saved=1 AND q.final=1 ORDER BY q.supplier_name, i.line_no`).bind(aid).all(),
  ]);
  const rows = lines.results || [];
  return [
    env.DB.prepare("INSERT INTO commission_tables (assignment_id,request_id,commission_no,expert_id,at,channel,quote_ids_json,lines_json,notes) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(aid, a ? a.request_id : null, no || null, expertId || null, at, channel || "panel", JSON.stringify(rows.map((r) => r.id)), JSON.stringify(rows), a ? a.notes || null : null),
    env.DB.prepare("UPDATE quotes SET commission_at=CASE WHEN saved=1 AND final=1 THEN ? ELSE NULL END WHERE assignment_id=?").bind(at, aid),
  ];
}

/** تصمیم خاتمه/تعلیق/توقف که اعمال شد — چه اقلامی، کی، با تأیید چه کسی */
export const closureStmt = (env, r) => env.DB.prepare(
  `INSERT INTO closures (assignment_id,request_id,expert_id,action,item_ids_json,closed,fully_closed,actor,decision_id,at)
   VALUES (?,?,?,?,?,?,?,?,?,?)`,
).bind(r.assignment_id, r.request_id || null, r.expert_id || null, r.action, JSON.stringify(r.item_ids || []), r.closed || 0, r.fully_closed ? 1 : 0,
  r.actor, r.decision_id || null, r.at || now());
