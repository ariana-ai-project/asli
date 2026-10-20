/**
 * «📊 کارکرد کارشناسان» در پنل پشتیبانی (آبان ۱۴۰۵، خواستهٔ مالک): برای هر کارشناس، کارهای مهمش در یک بازه —
 *   درخواست‌هایی که برایش فرستاده شد (assignments)، هر استفاده از API هوش مصنوعی (کارشناس هوشمند: ai_calls؛ جستجوی هوشمند:
 *   smart_searches؛ خوانشِ پیش‌فاکتور: proformas.extract_at؛ نرمال‌سازی با مدل و ساختِ نامه: events/letters)، ElevenLabs (صدای نامهٔ
 *   کمیسیون: letters.voice_secs؛ بات صوتی: voice_jobs روی تلگرامِ همان کارشناس)، پیامک‌ها (sp_sms)، قالب‌های پیامی که ساخت (templates)
 *   و پیام‌هایی که کپی کرد (events.msg_copy از پنل کارشناس).
 * فقط شمار و فهرست — بی هزینهٔ دلاری (هزینه فقط در داشبوردِ کارشناس هوشمند).
 */
const DAY = 86400000;
const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const sinceOf = (url) => { const d = int(url && url.searchParams.get("days")); return d === 0 ? 0 : Date.now() - (d && d > 0 ? Math.min(d, 3650) : 30) * DAY; };

/* شمارهای هر کارشناس در بازه — یک batch */
export async function usageOverview(env, url) {
  const from = sinceOf(url);
  const q = (sql) => env.DB.prepare(sql).bind(from);
  const [ex, asg, calls, srch, pf, norm, lt, vb, sms, tpl, cp] = await env.DB.batch([
    env.DB.prepare("SELECT id, name, label, telegram_chat FROM experts WHERE active=1 ORDER BY senior DESC, name"),
    q("SELECT expert_id AS e, COUNT(*) AS n FROM assignments WHERE dispatched_at>=? GROUP BY expert_id"),
    q("SELECT expert_id AS e, COUNT(*) AS n FROM ai_calls WHERE at>=? AND expert_id IS NOT NULL GROUP BY expert_id"),
    q("SELECT expert_id AS e, COUNT(*) AS n FROM smart_searches WHERE created_at>=? AND expert_id IS NOT NULL GROUP BY expert_id"),
    q("SELECT a.expert_id AS e, COUNT(*) AS n FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.extract_at>=? GROUP BY a.expert_id"),
    q("SELECT CAST(substr(actor,8) AS INTEGER) AS e, COUNT(*) AS n FROM events WHERE kind='norm_ai' AND at>=? AND actor LIKE 'expert:%' GROUP BY actor"),
    q("SELECT expert_id AS e, COUNT(*) AS n, SUM(CASE WHEN voice_secs>0 THEN voice_secs ELSE 0 END) AS secs FROM letters WHERE created_at>=? GROUP BY expert_id"),
    q("SELECT chat, COUNT(*) AS n, SUM(COALESCE(secs,0)) AS secs FROM voice_jobs WHERE created_at>=? GROUP BY chat"),
    q("SELECT expert_id AS e, COUNT(*) AS n FROM sp_sms WHERE at>=? AND expert_id IS NOT NULL GROUP BY expert_id"),
    q("SELECT expert_id AS e, COUNT(*) AS n FROM templates WHERE created_at>=? AND expert_id IS NOT NULL GROUP BY expert_id"),
    q("SELECT CAST(substr(actor,8) AS INTEGER) AS e, COUNT(*) AS n FROM events WHERE kind='msg_copy' AND at>=? AND actor LIKE 'expert:%' GROUP BY actor"),
  ]);
  const m = (r) => new Map((r.results || []).map((x) => [Number(x.e), x]));
  const M = { asg: m(asg), calls: m(calls), srch: m(srch), pf: m(pf), norm: m(norm), lt: m(lt), sms: m(sms), tpl: m(tpl), cp: m(cp) };
  const vbBy = new Map((vb.results || []).map((x) => [String(x.chat), x]));
  const n = (k, id, f = "n") => Number((M[k].get(id) || {})[f]) || 0;
  return { from, experts: (ex.results || []).map((e) => {
    const v = e.telegram_chat ? vbBy.get(String(e.telegram_chat)) || {} : {};
    return { id: e.id, name: e.label || e.name, requests: n("asg", e.id),
      ai: { agent: n("calls", e.id), search: n("srch", e.id), proforma: n("pf", e.id), normalize: n("norm", e.id), letter: n("lt", e.id) },
      el: { letter_secs: Math.round(n("lt", e.id, "secs")), voice_bot: Number(v.n) || 0, voice_bot_secs: Math.round(Number(v.secs) || 0) },
      sms: n("sms", e.id), templates: n("tpl", e.id), copies: n("cp", e.id) };
  }) };
}

/* ریزِ کارهای یک کارشناس — هر بخش حداکثر ۲۰۰ ردیف، تازه‌ترین اول */
export async function usageExpert(env, id, url) {
  const from = sinceOf(url);
  const e = await env.DB.prepare("SELECT id, name, label, telegram_chat FROM experts WHERE id=?").bind(id).first();
  if (!e) return null;
  const L = 200;
  const [asg, calls, srch, pf, norm, lt, vb, sms, tpl, cp] = await env.DB.batch([
    env.DB.prepare(`SELECT a.id, a.request_id, a.dispatched_at, a.ai_on, a.commission_no, r.party, (SELECT COUNT(*) FROM items i WHERE i.assignment_id=a.id) AS items
      FROM assignments a JOIN requests r ON r.id=a.request_id WHERE a.expert_id=? AND a.dispatched_at>=? ORDER BY a.dispatched_at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT c.at, c.purpose, c.model, c.in_tok, c.out_tok, c.status, r.request_id FROM ai_calls c LEFT JOIN ai_runs r ON r.id=c.run_id
      WHERE c.expert_id=? AND c.at>=? ORDER BY c.at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT s.created_at AS at, s.model, s.in_tokens, s.out_tokens, s.request_id, i.title FROM smart_searches s LEFT JOIN items i ON i.id=s.item_id
      WHERE s.expert_id=? AND s.created_at>=? ORDER BY s.created_at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT p.extract_at AS at, p.supplier_name, p.extract_state, a.request_id FROM proformas p JOIN assignments a ON a.id=p.assignment_id
      WHERE a.expert_id=? AND p.extract_at>=? ORDER BY p.extract_at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT ev.at, ev.request_id, i.title FROM events ev LEFT JOIN items i ON i.id=ev.item_id WHERE ev.kind='norm_ai' AND ev.actor=? AND ev.at>=? ORDER BY ev.at DESC LIMIT ${L}`).bind(`expert:${id}`, from),
    env.DB.prepare(`SELECT l.created_at AS at, l.voice_secs, l.state, (l.letter_json IS NOT NULL) AS made, a.request_id FROM letters l JOIN assignments a ON a.id=l.assignment_id
      WHERE l.expert_id=? AND l.created_at>=? ORDER BY l.created_at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT created_at AS at, bot, secs, state FROM voice_jobs WHERE chat=? AND created_at>=? ORDER BY created_at DESC LIMIT ${L}`).bind(String(e.telegram_chat || "-"), from),
    env.DB.prepare(`SELECT m.at, m.kind, ph.phone, s.name AS supplier, t.assignment_id, a.request_id FROM sp_sms m LEFT JOIN sp_phones ph ON ph.id=m.phone_id LEFT JOIN sp_suppliers s ON s.id=ph.supplier_id
      LEFT JOIN sp_threads t ON t.id=m.thread_id LEFT JOIN assignments a ON a.id=t.assignment_id WHERE m.expert_id=? AND m.at>=? ORDER BY m.at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT created_at AS at, title, substr(body,1,160) AS body FROM templates WHERE expert_id=? AND created_at>=? ORDER BY created_at DESC LIMIT ${L}`).bind(id, from),
    env.DB.prepare(`SELECT at, request_id, payload_json FROM events WHERE kind='msg_copy' AND actor=? AND at>=? ORDER BY at DESC LIMIT ${L}`).bind(`expert:${id}`, from),
  ]);
  const R = (r) => r.results || [];
  return { from, expert: { id: e.id, name: e.label || e.name },
    requests: R(asg), ai_agent: R(calls), ai_search: R(srch), ai_proforma: R(pf), ai_normalize: R(norm), letters: R(lt), voice_bot: R(vb), sms: R(sms), templates: R(tpl),
    copies: R(cp).map((x) => { let p = {}; try { p = JSON.parse(x.payload_json || "{}"); } catch (_) { p = {}; } return { at: x.at, request_id: x.request_id, supplier: T(p.supplier) || null, template: T(p.template) || null, chars: p.chars || 0 }; }) };
}
