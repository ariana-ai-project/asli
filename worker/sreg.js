/**
 * دفترِ تأمین‌کنندگان، پروفایل، نظرها و گراف روابط — فاز ۱ طرح «پیام اول، استراتژی‌ها، پروفایل و گراف» (مهر ۱۴۰۵)
 *
 * یک شناسهٔ پایدار برای هر تأمین‌کننده (sid): NEW-xxxx برای کشف‌شده، کد راهکاران یا «N:نام» برای تأمین‌کنندهٔ سوابق، و
 * «L:کلیدِ نام» برای تأمین‌کننده‌ای که فقط در سامانه دیده شده (استعلام، مکاتبه، پنل). نام‌ها با supKey پیدا می‌شوند؛
 * ادغامِ «نام نزدیک» (G4) با تأیید پشتیبانی.
 *
 * نظرها (sreg_ops): هر کارشناس، مدیر یا پشتیبان؛ «از طرف خودم» یا «از زبان دیگری» (با نام صاحب‌نظر). فقط نویسنده ویرایش
 * می‌کند و نسخهٔ قبلی در prev می‌ماند؛ حذف فقط پنهان کردن با دلیل است. همهٔ کارکنان می‌بینند، تأمین‌کننده هرگز (تصمیم ۹).
 * در مذاکره فقط نظرهای همان تأمین‌کننده، در بخشِ «محرمانه»، و نگهبانِ opinionLeak پیش از ارسال (worker/strategy-guard.js).
 *
 * گراف (sreg_edges): یال‌های پیشنهادیِ تحقیق (شاهد و شدت) و پیوندهای کارشناسان؛ نوعِ رابطه و رنگِ خط در cr-data.js:NATURES.
 * یالِ پیشنهادی تا رد نشده در گزینشِ گیرنده اثر دارد (تصمیم ۸).
 */
import { HttpError } from "./http.js";
import { supKey, NATURES } from "./cr-data.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const OPINION_TOPICS = ["کیفیت", "قیمت", "خوش‌قولی", "رفتار", "هشدار", "دیگر"];
const MAX_BODY = 2000;

/** نقشِ خواننده یا نویسنده: {kind: expert|manager|support, id, name} */
export const whoName = (w) => (w.kind === "expert" ? (w.name || "کارشناس") : w.kind === "manager" ? "مدیر خرید" : "پشتیبانی");

/* ------------------------------------------------------------------ */
/* پیدا کردن                                                            */
/* ------------------------------------------------------------------ */
/** شناسه از روی نام (یا خودِ شناسه): اول ادغام‌های تأییدشده، بعد نامِ دفتر، وگرنه «L:کلید» (بی ساختنِ ردیف) */
export async function resolveSid(env, { sid, name } = {}) {
  const s = T(sid);
  if (s) {
    const m = await env.DB.prepare("SELECT sid FROM sreg_alias WHERE kind='merge' AND alias=? AND status='تأییدشده'").bind(s).first();
    return m ? m.sid : s;
  }
  const k = supKey(name);
  if (!k) throw new HttpError("نام تأمین‌کننده خالی است.");
  const [al, rg] = await env.DB.batch([
    env.DB.prepare("SELECT sid FROM sreg_alias WHERE kind='name' AND alias=? AND status='تأییدشده'").bind(k),
    env.DB.prepare("SELECT sid, kind FROM sreg WHERE name_n=? ORDER BY CASE kind WHEN 'old' THEN 0 WHEN 'new' THEN 1 ELSE 2 END LIMIT 1").bind(k)]);
  const a = (al.results || [])[0], r = (rg.results || [])[0];
  if (a) return a.sid;
  if (r) {
    const m = await env.DB.prepare("SELECT sid FROM sreg_alias WHERE kind='merge' AND alias=? AND status='تأییدشده'").bind(r.sid).first();
    return m ? m.sid : r.sid;
  }
  return `L:${k}`;
}

/** ردیفِ دفتر برای sid؛ برای «L:» که هنوز ردیفی ندارد، ردیفِ مجازی از نام */
async function regRow(env, sid, nameHint) {
  const r = await env.DB.prepare("SELECT * FROM sreg WHERE sid=?").bind(sid).first();
  if (r) return r;
  if (sid.startsWith("L:")) return { sid, kind: "loc", name: T(nameHint) || sid.slice(2), name_n: sid.slice(2), data: null, virtual: true };
  return null;
}
/** پیش از نوشتنِ نظر یا پیوند برای «L:»، ردیفِ دفتر ساخته می‌شود (یک بار) */
async function ensureLocal(env, sid, name) {
  if (!sid.startsWith("L:")) return;
  await env.DB.prepare("INSERT OR IGNORE INTO sreg (sid,kind,name,name_n,verification,imported_at) VALUES (?, 'loc', ?, ?, 0, ?)").bind(sid, T(name) || sid.slice(2), sid.slice(2), now()).run();
}

/* ------------------------------------------------------------------ */
/* پروفایل                                                              */
/* ------------------------------------------------------------------ */
const NATURE_FA = Object.fromEntries(Object.entries(NATURES).map(([k, v]) => [k, v.fa]));
const edgeOut = (e, me) => ({ id: e.id, other: e.a === me ? e.b : e.a, nature: e.nature, nature_fa: NATURE_FA[e.nature] || e.nature, color: (NATURES[e.nature] || {}).color || "#6b7280",
  ev: e.ev, strength: e.strength, evidence: e.evidence, source: e.source, status: e.status, note: e.note, by: e.by_name || null, at: e.at, rev_by: e.rev_by || null, rev_note: e.rev_note || null });
const opOut = (o, w) => ({ id: o.id, voice: o.voice, holder: o.holder, holder_role: o.holder_role, topic: o.topic, conf: o.conf, body: o.body, author: o.author_name,
  author_kind: o.author_kind, mine: o.author_kind === w.kind && (w.kind !== "expert" || o.author_id === w.id), hidden: !!o.hidden, hidden_note: o.hidden ? o.hidden_note : null,
  edited: !!o.prev, at: o.created_at, updated_at: o.updated_at });

/**
 * GET /sreg/profile?sid=|name= — همه چیزِ یک تأمین‌کننده برای کشوی پروفایل: دفتر (با اصلاح‌های کارشناس)، سوابقِ خرید در
 * سامانه، نظرها، روابطِ یک قدمی و ادغام‌ها
 */
export async function supplierProfile(env, w, q) {
  const sid = await resolveSid(env, q);
  const row = await regRow(env, sid, q.name);
  if (!row) throw new HttpError("این تأمین‌کننده در دفتر نیست.", 404);
  const [xs, ops, edges, aliases] = await env.DB.batch([
    env.DB.prepare("SELECT field, value, by_name, at FROM sreg_x WHERE sid=? AND active=1 ORDER BY at").bind(sid),
    env.DB.prepare("SELECT * FROM sreg_ops WHERE sid=? ORDER BY created_at DESC LIMIT 200").bind(sid),
    env.DB.prepare("SELECT * FROM sreg_edges WHERE (a=? OR b=?) AND status<>'ردشده' ORDER BY at DESC LIMIT 200").bind(sid, sid),
    /* sid با نمایه، alias با کلید اصلی (kind, alias) — بی خواندنِ کلِ جدول */
    env.DB.prepare("SELECT kind, alias, sid, status, note, by_name, at FROM sreg_alias WHERE sid=? UNION SELECT kind, alias, sid, status, note, by_name, at FROM sreg_alias WHERE kind IN ('g4','merge','name') AND alias=?").bind(sid, sid)]);
  const data = parse(row.data, {});
  const fix = {};
  for (const x of xs.results || []) fix[x.field] = { value: x.value, by: x.by_name, at: x.at };
  const eRows = edges.results || [];
  const others = [...new Set(eRows.map((e) => (e.a === sid ? e.b : e.a)))];
  const names = new Map();
  if (others.length) {
    const rs = (await env.DB.prepare(`SELECT sid, name, hub FROM sreg WHERE sid IN (${others.map(() => "?").join(",")})`).bind(...others).all()).results || [];
    for (const r of rs) names.set(r.sid, r);
  }
  /* سوابقِ خرید در سامانه: فقط وقتی نوع قلم معلوم است (کلید اصلیِ purchases با head شروع می‌شود؛ بی آن خواندنِ کلِ جدول بود) */
  const buys = T(q.head) ? await purchaseSummary(env, row, T(q.head)) : null;
  return {
    sid, kind: row.kind, virtual: !!row.virtual,
    name: fix.name ? fix.name.value : row.name,
    identity: { legal_name: data.legal_name || null, brand_name: data.brand_name || null, national_id: data.national_id || null, type: data.supplier_type || data.legal_form || null,
      role: row.role || data.chain_role || data.role_hint || null, manager: data.manager || null, established: data.established || null, registry_status: data.registry_status || null },
    contact: { address: fix.address ? fix.address.value : data.address || null, phones: fix.phones ? fix.phones.value : row.phones || null,
      mobiles: fix.mobiles ? fix.mobiles.value : row.mobiles || null, website: data.website || null, email: data.email || null, social: data.social || null,
      verified: data.verified_contacts || null, verified_by_staff: fix.phones || fix.mobiles ? true : false },
    market: { country: row.country || null, province: row.province || null, city: row.city || null, hub: row.hub || null, brands: data.brands || null, products: data.products || null },
    verification: { level: row.verification, gates: data.gates_summary || null, open: data.open_gates || null, last_activity: data.last_activity || null, last_activity_date: data.last_activity_date || null,
      g4: data.g4_review || null, completeness: data.completeness != null ? Number(data.completeness) : null, sources: data.sources || null, checked: data.checked || null },
    research: row.kind === "old" ? { rank: data.rank || null, spend_bn: data.spend_bn ?? null, heads: data.heads ?? null, years: data.years ?? null, first_yr: data.first_yr ?? null,
      last_yr: data.last_yr ?? null, dominant_heads: data.dominant_heads || null, premium_median: data.premium_median ?? null } :
      { best_rank: data.best_rank ?? null, best_rank_unit: data.best_rank_unit || null, n_top10: data.n_top10 ?? null, top10_units: data.top10_units || null },
    buys,
    fixes: fix,
    opinions: (ops.results || []).filter((o) => !o.hidden || o.author_kind === w.kind || w.kind !== "expert").map((o) => opOut(o, w)),
    edges: eRows.map((e) => ({ ...edgeOut(e, sid), other_name: (names.get(e.a === sid ? e.b : e.a) || {}).name || (e.a === sid ? e.b : e.a) })),
    aliases: (aliases.results || []).map((a) => ({ kind: a.kind, alias: a.alias, sid: a.sid, status: a.status, note: a.note, by: a.by_name, at: a.at })),
    natures: Object.entries(NATURES).map(([k, v]) => ({ key: k, fa: v.fa, color: v.color })),
    topics: OPINION_TOPICS,
  };
}

/** خریدهای سامانه از این تأمین‌کننده در یک نوع قلم (کلید اصلی (head, …) — فقط ردیف‌های همان نوع قلم خوانده می‌شود) */
async function purchaseSummary(env, row, head) {
  if (!row.name_n) return null;
  const r = await env.DB.prepare("SELECT COUNT(*) AS n, SUM(COALESCE(amount_adj, amount, 0)) AS v, MAX(ym) AS last, MIN(ym) AS first FROM purchases WHERE head=? AND supplier_n=?")
    .bind(head, row.name_n).first().catch(() => null);
  return r && r.n ? { head, n: r.n, value: r.v, last_ym: r.last, first_ym: r.first } : { head, n: 0 };
}

/* ------------------------------------------------------------------ */
/* نظرها                                                                */
/* ------------------------------------------------------------------ */
function cleanOpinion(b) {
  const body = T(b.body).slice(0, MAX_BODY);
  if (body.length < 3) throw new HttpError("متن نظر را بنویسید.", 422);
  const voice = b.voice === "other" ? "other" : "self";
  const holder = voice === "other" ? T(b.holder).slice(0, 120) : null;
  if (voice === "other" && !holder) throw new HttpError("برای «از زبان دیگری» نام صاحب‌نظر را بنویسید.", 422);
  const topic = OPINION_TOPICS.includes(T(b.topic)) ? T(b.topic) : null;
  const conf = int(b.conf);
  return { body, voice, holder, holder_role: voice === "other" ? (T(b.holder_role).slice(0, 80) || null) : null, topic, conf: conf && conf >= 1 && conf <= 5 ? conf : null };
}
/** POST /sreg/opinions — {sid|name, body, voice: self|other, holder, holder_role, topic, conf} */
export async function addOpinion(env, w, b) {
  const sid = await resolveSid(env, b);
  await ensureLocal(env, sid, b.name);
  if (!(await env.DB.prepare("SELECT 1 FROM sreg WHERE sid=?").bind(sid).first())) throw new HttpError("این تأمین‌کننده در دفتر نیست.", 404);
  const o = cleanOpinion(b), t = now();
  const kind = b.kind === "note" && w.kind !== "expert" ? "note" : "opinion";
  const r = await env.DB.prepare(`INSERT INTO sreg_ops (sid,kind,voice,holder,holder_role,topic,conf,body,author_kind,author_id,author_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(sid, kind, o.voice, o.holder, o.holder_role, o.topic, o.conf, o.body, w.kind, w.id || null, whoName(w), t, t).run();
  return { ok: true, id: r.meta.last_row_id, sid };
}
/** PUT /sreg/opinions/:id — فقط نویسنده؛ نسخهٔ قبلی در prev */
export async function editOpinion(env, w, id, b) {
  const o = await env.DB.prepare("SELECT * FROM sreg_ops WHERE id=?").bind(id).first();
  if (!o) throw new HttpError("این نظر پیدا نشد.", 404);
  if (o.author_kind !== w.kind || (w.kind === "expert" && o.author_id !== w.id)) throw new HttpError("هر نظر را فقط نویسنده‌اش ویرایش می‌کند.", 403);
  const c = cleanOpinion({ ...o, ...b });
  const prev = parse(o.prev, []);
  prev.push({ body: o.body, voice: o.voice, holder: o.holder, topic: o.topic, conf: o.conf, at: o.updated_at });
  await env.DB.prepare("UPDATE sreg_ops SET voice=?, holder=?, holder_role=?, topic=?, conf=?, body=?, prev=?, updated_at=? WHERE id=?")
    .bind(c.voice, c.holder, c.holder_role, c.topic, c.conf, c.body, JSON.stringify(prev.slice(-20)), now(), id).run();
  return { ok: true };
}
/** POST /sreg/opinions/:id/hide — نویسنده یا پشتیبان؛ دلیل لازم است؛ ردیف می‌ماند */
export async function hideOpinion(env, w, id, b) {
  const o = await env.DB.prepare("SELECT * FROM sreg_ops WHERE id=?").bind(id).first();
  if (!o) throw new HttpError("این نظر پیدا نشد.", 404);
  const mine = o.author_kind === w.kind && (w.kind !== "expert" || o.author_id === w.id);
  if (!mine && w.kind !== "support") throw new HttpError("پنهان کردن فقط با نویسنده یا پشتیبانی است.", 403);
  const note = T(b && b.note).slice(0, 300);
  if (note.length < 3) throw new HttpError("دلیلِ پنهان کردن را بنویسید.", 422);
  await env.DB.prepare("UPDATE sreg_ops SET hidden=1, hidden_by=?, hidden_note=?, hidden_at=? WHERE id=?").bind(whoName(w), note, now(), id).run();
  return { ok: true };
}

/** نظرهای فعالِ یک تأمین‌کننده برای زمینهٔ مدل (فقط همان تأمین‌کننده؛ بخشِ «محرمانه») — worker/strategy-guard.js هم متنشان را برای نگهبان می‌خواند */
export async function opinionsFor(env, sid) {
  return ((await env.DB.prepare("SELECT voice, holder, holder_role, topic, conf, body, author_name, created_at FROM sreg_ops WHERE sid=? AND hidden=0 ORDER BY created_at DESC LIMIT 30")
    .bind(sid).all()).results || []);
}

/* ------------------------------------------------------------------ */
/* پیوندها و گراف                                                      */
/* ------------------------------------------------------------------ */
/** POST /sreg/links — {sid|name, to: [{sid|name}], nature, note} — پیوندِ کارشناس «تأییدشده» است */
export async function addLinks(env, w, b) {
  const from = await resolveSid(env, b);
  if (!NATURES[b.nature]) throw new HttpError("نوعِ رابطه را انتخاب کنید.", 422);
  const list = Array.isArray(b.to) ? b.to.slice(0, 20) : [];
  if (!list.length) throw new HttpError("دست‌کم یک تأمین‌کنندهٔ دیگر انتخاب کنید.", 422);
  await ensureLocal(env, from, b.name);
  const t = now(), note = T(b.note).slice(0, 300) || null, stmts = [], ids = [];
  for (const x of list) {
    const to = await resolveSid(env, x);
    if (to === from) continue;
    await ensureLocal(env, to, x.name);
    const [a, c] = from < to ? [from, to] : [to, from];
    const dup = await env.DB.prepare("SELECT id FROM sreg_edges WHERE a=? AND b=? AND nature=? AND source='کارشناس' AND status<>'ردشده'").bind(a, c, b.nature).first();
    if (dup) { ids.push(dup.id); continue; }
    stmts.push(env.DB.prepare(`INSERT INTO sreg_edges (a,b,ev,nature,strength,directed,evidence,source,status,note,by_kind,by_id,by_name,at) VALUES (?,?,NULL,?,NULL,0,NULL,'کارشناس','تأییدشده',?,?,?,?,?)`)
      .bind(a, c, b.nature, note, w.kind, w.id || null, whoName(w), t));
  }
  if (stmts.length) { const res = await env.DB.batch(stmts); for (const r of res) ids.push(r.meta.last_row_id); }
  return { ok: true, ids };
}
/** POST /sreg/edges/:id/review — {ok: true|false, note} — یال پیشنهادی تأیید یا رد (ردِ بی دلیل نه) */
export async function reviewEdge(env, w, id, b) {
  const e = await env.DB.prepare("SELECT * FROM sreg_edges WHERE id=?").bind(id).first();
  if (!e) throw new HttpError("این پیوند پیدا نشد.", 404);
  const ok = b && b.ok === true, note = T(b && b.note).slice(0, 300);
  if (!ok && note.length < 3) throw new HttpError("دلیلِ رد را بنویسید.", 422);
  await env.DB.prepare("UPDATE sreg_edges SET status=?, rev_by=?, rev_at=?, rev_note=? WHERE id=?").bind(ok ? "تأییدشده" : "ردشده", whoName(w), now(), note || null, id).run();
  return { ok: true, status: ok ? "تأییدشده" : "ردشده" };
}

/** GET /sreg/graph?sid=&depth=1|2 — همسایه‌های یک و دو قدمی (حداکثر ۶۰ گره و ۲۰۰ یال) برای «🕸 کاوش گراف» */
export async function egoGraph(env, q) {
  const root = await resolveSid(env, q);
  const depth = Math.min(2, Math.max(1, int(q.depth) || 1));
  const MAXN = 60, MAXE = 200;
  const nodes = new Set([root]), edges = new Map();
  let frontier = [root];
  for (let d = 0; d < depth && frontier.length && nodes.size < MAXN; d++) {
    const ph = frontier.slice(0, 40).map(() => "?").join(",");
    const rows = (await env.DB.prepare(`SELECT * FROM sreg_edges WHERE (a IN (${ph}) OR b IN (${ph})) AND status<>'ردشده' LIMIT ${MAXE}`).bind(...frontier.slice(0, 40), ...frontier.slice(0, 40)).all()).results || [];
    const next = [];
    for (const e of rows) {
      if (edges.size >= MAXE) break;
      edges.set(e.id, e);
      for (const s of [e.a, e.b]) if (!nodes.has(s) && nodes.size < MAXN) { nodes.add(s); next.push(s); }
    }
    frontier = next;
  }
  const ids = [...nodes];
  const meta = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    const rs = (await env.DB.prepare(`SELECT sid, name, hub, city, kind, verification, role FROM sreg WHERE sid IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || [];
    for (const r of rs) meta.set(r.sid, r);
  }
  return {
    root,
    nodes: ids.map((s) => { const m = meta.get(s) || {}; return { sid: s, name: m.name || (s.startsWith("L:") || s.startsWith("N:") ? s.slice(2) : s), hub: m.hub || null, city: m.city || null, kind: m.kind || null, role: m.role || null, verification: m.verification ?? null, root: s === root }; }),
    edges: [...edges.values()].filter((e) => nodes.has(e.a) && nodes.has(e.b)).map((e) => ({ id: e.id, a: e.a, b: e.b, nature: e.nature, color: (NATURES[e.nature] || {}).color || "#6b7280",
      fa: NATURE_FA[e.nature] || e.nature, status: e.status, strength: e.strength, source: e.source, ev: e.ev })),
    natures: Object.entries(NATURES).map(([k, v]) => ({ key: k, fa: v.fa, color: v.color })),
  };
}

/** GET /sreg/search?q= — جست‌وجوی نام در دفتر (برای «🔗 پیوند») */
export async function searchSuppliers(env, q) {
  const k = supKey(q.q || "");
  if (k.length < 2) return { list: [] };
  const rows = (await env.DB.prepare("SELECT sid, name, hub, city, kind, verification FROM sreg WHERE name_n >= ? AND name_n < ? ORDER BY name_n LIMIT 20").bind(k, k + "￿").all()).results || [];
  return { list: rows };
}

/* ------------------------------------------------------------------ */
/* پشتیبانی: «نام نزدیک» (G4) و گرافِ کامل                              */
/* ------------------------------------------------------------------ */
/** GET /support/sreg/g4?state=پیشنهادی|تأییدشده|ردشده — فهرستِ بازبینیِ یکی‌بودن (با نامِ هر دو طرف) */
export async function g4List(env, q) {
  const st = ["پیشنهادی", "تأییدشده", "ردشده"].includes(T(q.state)) ? T(q.state) : "پیشنهادی";
  const rows = (await env.DB.prepare("SELECT al.alias, al.sid, al.status, al.note, al.by_name, al.at, n.name AS new_name, n.hub, n.phones, n.mobiles, o.name AS old_name FROM sreg_alias al LEFT JOIN sreg n ON n.sid=al.alias LEFT JOIN sreg o ON o.sid=al.sid WHERE al.kind='g4' AND al.status=? ORDER BY al.alias LIMIT 300")
    .bind(st).all()).results || [];
  return { state: st, list: rows };
}
/** POST /support/sreg/g4/:alias — {same: true|false, sid (هدف، اگر پیشنهاد خالی بود یا اشتباه), note} */
export async function g4Decide(env, w, alias, b) {
  const g = await env.DB.prepare("SELECT * FROM sreg_alias WHERE kind='g4' AND alias=?").bind(alias).first();
  if (!g) throw new HttpError("این مورد پیدا نشد.", 404);
  const t = now(), note = T(b && b.note).slice(0, 300) || null;
  if (b && b.same === true) {
    const target = T(b.sid) || g.sid;
    if (!target) throw new HttpError("تأمین‌کنندهٔ سوابق را انتخاب کنید.", 422);
    if (!(await env.DB.prepare("SELECT 1 FROM sreg WHERE sid=?").bind(target).first())) throw new HttpError("تأمین‌کنندهٔ هدف در دفتر نیست.", 404);
    await env.DB.batch([
      env.DB.prepare("UPDATE sreg_alias SET status='تأییدشده', sid=?, by_kind=?, by_name=?, at=? WHERE kind='g4' AND alias=?").bind(target, w.kind, whoName(w), t, alias),
      env.DB.prepare("INSERT INTO sreg_alias (kind,alias,sid,status,note,by_kind,by_name,at) VALUES ('merge',?,?, 'تأییدشده', ?, ?, ?, ?) ON CONFLICT(kind, alias) DO UPDATE SET sid=excluded.sid, status='تأییدشده', note=excluded.note, by_kind=excluded.by_kind, by_name=excluded.by_name, at=excluded.at")
        .bind(alias, target, note, w.kind, whoName(w), t)]);
    return { ok: true, status: "تأییدشده", sid: target };
  }
  await env.DB.prepare("UPDATE sreg_alias SET status='ردشده', note=COALESCE(?, note), by_kind=?, by_name=?, at=? WHERE kind='g4' AND alias=?").bind(note, w.kind, whoName(w), t, alias).run();
  return { ok: true, status: "ردشده" };
}

/** GET /support/graph?head=&hub=&limit= — گرافِ کامل با فیلتر (گره‌های نامزدِ یک نوع قلم یا یک بازار)، حداکثر ۴۰۰ یال */
export async function fullGraph(env, q) {
  const limit = Math.min(400, Math.max(20, int(q.limit) || 200));
  let seeds = [];
  if (T(q.head)) {
    const us = (await env.DB.prepare("SELECT cands FROM cr_units WHERE head=?").bind(T(q.head)).all()).results || [];
    for (const u of us) for (const c of parse(u.cands, [])) seeds.push(c[0]);
  } else if (T(q.hub)) {
    seeds = ((await env.DB.prepare("SELECT sid FROM sreg WHERE hub=? LIMIT 300").bind(T(q.hub)).all()).results || []).map((r) => r.sid);
  }
  seeds = [...new Set(seeds)].slice(0, 300);
  let rows;
  if (seeds.length) {
    const out = new Map();
    for (let i = 0; i < seeds.length && out.size < limit; i += 50) {
      const part = seeds.slice(i, i + 50), ph = part.map(() => "?").join(",");
      for (const e of (await env.DB.prepare(`SELECT * FROM sreg_edges WHERE (a IN (${ph}) OR b IN (${ph})) AND status<>'ردشده' LIMIT ${limit}`).bind(...part, ...part).all()).results || []) out.set(e.id, e);
    }
    rows = [...out.values()].slice(0, limit);
  } else {
    rows = (await env.DB.prepare(`SELECT * FROM sreg_edges WHERE status<>'ردشده' ORDER BY id DESC LIMIT ${limit}`).all()).results || [];
  }
  const ids = [...new Set(rows.flatMap((e) => [e.a, e.b]))];
  const meta = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    for (const r of (await env.DB.prepare(`SELECT sid, name, hub, kind FROM sreg WHERE sid IN (${part.map(() => "?").join(",")})`).bind(...part).all()).results || []) meta.set(r.sid, r);
  }
  return {
    nodes: ids.map((s) => ({ sid: s, name: (meta.get(s) || {}).name || s, hub: (meta.get(s) || {}).hub || null, kind: (meta.get(s) || {}).kind || null })),
    edges: rows.map((e) => ({ id: e.id, a: e.a, b: e.b, nature: e.nature, color: (NATURES[e.nature] || {}).color || "#6b7280", fa: NATURE_FA[e.nature] || e.nature, status: e.status, source: e.source })),
    natures: Object.entries(NATURES).map(([k, v]) => ({ key: k, fa: v.fa, color: v.color })),
  };
}
