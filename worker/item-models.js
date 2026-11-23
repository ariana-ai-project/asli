import { HttpError } from "./http.js";

const T = (v) => String(v == null ? "" : v).trim();
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const nrm = (v) => T(v).replace(/[ي]/g, "ی").replace(/[ك]/g, "ک").replace(/\s+/g, " ");
const nkey = (v) => nrm(v).replace(/‌/g, " ").toLowerCase();
const parse = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

export const MODEL_DDL = `
CREATE TABLE IF NOT EXISTS item_models (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, request_id TEXT, model_no INTEGER NOT NULL, head TEXT NOT NULL, layers_json TEXT NOT NULL, locks_json TEXT, spec_key TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'expert', supplier_id INTEGER, thread_id INTEGER, state TEXT NOT NULL DEFAULT 'draft', created_by TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, submitted_at INTEGER, published INTEGER NOT NULL DEFAULT 0, UNIQUE(item_id, model_no), UNIQUE(item_id, spec_key));
CREATE INDEX IF NOT EXISTS ix_im_item ON item_models(item_id, model_no);
CREATE INDEX IF NOT EXISTS ix_im_thread ON item_models(thread_id);
`;

export const modelKey = (itemId, modelId) => `${int(itemId) || 0}:${int(modelId) || 0}`;

function cleanLayers(input) {
  if (Array.isArray(input)) return input.map((x) => ({ k: nrm(x && x.k).slice(0, 100), v: nrm(x && (x.v ?? x.t)).slice(0, 300), u: nrm(x && x.u).slice(0, 40) })).filter((x) => x.k && x.v);
  return Object.entries(input || {}).map(([k, v]) => ({ k: nrm(k).slice(0, 100), v: nrm(v && typeof v === "object" ? v.t ?? v.v : v).slice(0, 300), u: nrm(v && typeof v === "object" ? v.u : "").slice(0, 40) })).filter((x) => x.k && x.v);
}

function cleanLocks(raw, layers) {
  const src = raw && typeof raw === "object" ? raw : {};
  const old = src.layers && typeof src.layers === "object" ? src.layers : {};
  const byKey = new Map(Object.entries(old).map(([k, v]) => [nkey(k), v]));
  return { title: src.title !== false, qty: src.qty !== false, layers: Object.fromEntries(layers.map((l) => [l.k, byKey.get(nkey(l.k)) !== false])) };
}

function specKey(head, layers, scope) {
  const body = JSON.stringify({ head: nkey(head), layers: layers.map((l) => [nkey(l.k), nkey(l.v), nkey(l.u)]).sort((a, b) => a[0].localeCompare(b[0])) });
  return `${scope}:${body}`;
}

export const supplierSpecKey = (head, layers, threadId) => specKey(head, layers, `thread:${int(threadId) || 0}`);

export function modelOut(r) {
  if (!r) return null;
  const layers = parse(r.layers_json, []);
  return { id: r.id, item_id: r.item_id, request_id: r.request_id, model_no: r.model_no, head: r.head, layers, locks: parse(r.locks_json, null) || cleanLocks(null, layers),
    origin: r.origin, supplier_id: r.supplier_id, thread_id: r.thread_id, state: r.state, created_by: r.created_by, created_at: r.created_at,
    sent_at: r.sent_at, submitted_at: r.submitted_at, published: !!r.published };
}

export async function modelsOfItems(env, itemIds, { forSend = false, requestId = null } = {}) {
  const ids = [...new Set((itemIds || []).map(int).filter(Boolean))];
  if (!ids.length) return new Map();
  const out = new Map(ids.map((id) => [id, []]));
  const where = forSend ? "AND (m.origin='expert' OR m.published=1)" : "AND (m.origin='expert' OR m.published=1 OR m.submitted_at IS NOT NULL)";
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const rows = (await env.DB.prepare(`SELECT m.* FROM item_models m JOIN items scoped ON scoped.id=m.item_id AND scoped.request_id=m.request_id
      WHERE m.item_id IN (${part.map(() => "?").join(",")}) AND m.state!='archived' ${where} ${requestId ? "AND m.request_id=?" : ""} ORDER BY m.model_no, m.id`)
      .bind(...part, ...(requestId ? [requestId] : [])).all()).results || [];
    for (const r of rows) out.get(r.item_id).push(modelOut(r));
  }
  return out;
}

export async function migrateItemModelScope(env) {
  const cols = await env.DB.prepare("PRAGMA table_info(item_models)").all();
  if (!(cols.results || []).some((c) => c.name === "request_id")) await env.DB.exec("ALTER TABLE item_models ADD COLUMN request_id TEXT");
  await env.DB.prepare("UPDATE item_models SET request_id=(SELECT request_id FROM items WHERE items.id=item_models.item_id) WHERE request_id IS NULL").run();
}

export async function modelById(env, id) {
  return modelOut(await env.DB.prepare("SELECT * FROM item_models WHERE id=?").bind(int(id)).first());
}

export async function modelTargets(env, items) {
  const byItem = await modelsOfItems(env, items.map((i) => i.id), { forSend: true });
  const out = [];
  for (const item of items) {
    const models = byItem.get(item.id) || [];
    if (!models.length) out.push({ item, model_id: 0, model_no: 0 });
    else for (const m of models) out.push({ item, ...m, model_id: m.id, title: nrm(item.title), qty: item.qty, unit: T(item.unit) || null });
  }
  return out;
}

async function ownedItem(env, ex, itemId) {
  const item = await env.DB.prepare("SELECT i.* FROM items i JOIN assignments a ON a.id=i.assignment_id WHERE i.id=? AND a.expert_id=?").bind(int(itemId), ex.id).first();
  if (!item) throw new HttpError("این قلم متعلق به شما نیست.", 403);
  return item;
}

export async function createExpertModel(env, ex, itemId, body) {
  const item = await ownedItem(env, ex, itemId);
  if (!item.norm_json) throw new HttpError("اول ساختار قلم را تأیید کنید؛ مدل از همان ساختار ساخته می‌شود.", 409);
  const head = nrm(body.head).slice(0, 160);
  const layers = cleanLayers(body.layers);
  if (!head) throw new HttpError("نوع قلم مدل لازم است.", 422);
  const locks = cleanLocks(body.locks, layers);
  const t = Date.now();
  const top = await env.DB.prepare("SELECT COALESCE(MAX(model_no),0) AS n FROM item_models WHERE item_id=?").bind(item.id).first();
  const key = specKey(head, layers, "expert");
  try {
    const r = await env.DB.prepare("INSERT INTO item_models (item_id,request_id,model_no,head,layers_json,locks_json,spec_key,origin,state,created_by,created_at) VALUES (?,?,?,?,?,?,?,'expert','draft',?,?)")
      .bind(item.id, item.request_id, (top?.n || 0) + 1, head, JSON.stringify(layers), JSON.stringify(locks), key, `expert:${ex.id}`, t).run();
    return modelById(env, r.meta.last_row_id);
  } catch (e) {
    if (/unique/i.test(String(e && e.message))) throw new HttpError("مدلی با دقیقاً همین نوع و لایه‌ها قبلاً ثبت شده است.", 409);
    throw e;
  }
}

export async function updateExpertModel(env, ex, itemId, modelId, body) {
  await ownedItem(env, ex, itemId);
  const old = await modelById(env, modelId);
  if (!old || old.item_id !== int(itemId) || old.origin !== "expert") throw new HttpError("مدل پیدا نشد.", 404);
  if (old.sent_at) throw new HttpError("این مدل برای تأمین‌کننده ارسال شده و مشخصاتش قفل است؛ مدل تازه‌ای از آن بسازید.", 409);
  const head = nrm(body.head).slice(0, 160);
  const layers = cleanLayers(body.layers);
  if (!head) throw new HttpError("نوع قلم مدل لازم است.", 422);
  const locks = cleanLocks(body.locks, layers);
  try {
    await env.DB.prepare("UPDATE item_models SET head=?,layers_json=?,locks_json=?,spec_key=? WHERE id=?")
      .bind(head, JSON.stringify(layers), JSON.stringify(locks), specKey(head, layers, "expert"), old.id).run();
  } catch (e) {
    if (/unique/i.test(String(e && e.message))) throw new HttpError("مدلی با دقیقاً همین نوع و لایه‌ها قبلاً ثبت شده است.", 409);
    throw e;
  }
  return modelById(env, old.id);
}

export async function publishSupplierModel(env, ex, itemId, modelId) {
  await ownedItem(env, ex, itemId);
  const m = await modelById(env, modelId);
  if (!m || m.item_id !== int(itemId) || m.origin !== "supplier" || !m.submitted_at) throw new HttpError("مدل پیشنهادیِ ارسال‌شده پیدا نشد.", 404);
  await env.DB.prepare("UPDATE item_models SET published=1 WHERE id=?").bind(m.id).run();
  return modelById(env, m.id);
}

export async function deleteExpertModel(env, ex, itemId, modelId) {
  const item = await ownedItem(env, ex, itemId);
  const m = await modelById(env, modelId);
  if (!m || m.item_id !== item.id || m.request_id !== item.request_id) throw new HttpError("مدل متعلق به این قلم و درخواست نیست.", 404);
  if (m.state === "archived") return { ok: true, archived: true, already: true };
  const [lines, quotes] = await Promise.all([
    env.DB.prepare("SELECT 1 AS x FROM sp_lines WHERE item_id=? AND model_id=? LIMIT 1").bind(item.id, m.id).first(),
    env.DB.prepare("SELECT 1 AS x FROM quotes WHERE item_id=? AND model_id=? LIMIT 1").bind(item.id, m.id).first(),
  ]);
  if (m.sent_at || m.submitted_at || lines || quotes) {
    await env.DB.prepare("UPDATE item_models SET state='archived' WHERE id=?").bind(m.id).run();
    return { ok: true, archived: true };
  }
  await env.DB.prepare("DELETE FROM item_models WHERE id=?").bind(m.id).run();
  return { ok: true, deleted: true };
}

export async function markModelsSent(env, ids, at = Date.now()) {
  const list = [...new Set((ids || []).map(int).filter(Boolean))];
  for (const id of list) await env.DB.prepare("UPDATE item_models SET sent_at=COALESCE(sent_at,?),state='sent' WHERE id=?").bind(at, id).run();
}

export async function markModelsSubmitted(env, ids, at = Date.now()) {
  const list = [...new Set((ids || []).map(int).filter(Boolean))];
  for (const id of list) await env.DB.prepare("UPDATE item_models SET submitted_at=COALESCE(submitted_at,?),state='answered' WHERE id=?").bind(at, id).run();
}

export async function migrateSpLineModels(env) {
  const cols = await env.DB.prepare("PRAGMA table_info(sp_lines)").all();
  if ((cols.results || []).some((c) => c.name === "model_id")) return;
  const create = `CREATE TABLE sp_lines (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, item_id INTEGER NOT NULL, title TEXT NOT NULL, head TEXT, layers_json TEXT, extra_json TEXT, req_qty REAL, req_unit TEXT, qty REAL, unit TEXT, price REAL, note TEXT, state TEXT NOT NULL DEFAULT 'new', bundle_id INTEGER, quote_id INTEGER, no INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, locks_json TEXT, s_json TEXT, prices_json TEXT, model_id INTEGER NOT NULL DEFAULT 0, model_no INTEGER NOT NULL DEFAULT 0, terms_json TEXT, unavailable INTEGER NOT NULL DEFAULT 0, UNIQUE(thread_id, item_id, model_id))`;
  const copy = `INSERT INTO sp_lines (id,thread_id,item_id,title,head,layers_json,extra_json,req_qty,req_unit,qty,unit,price,note,state,bundle_id,quote_id,no,created_at,updated_at,locks_json,s_json,prices_json,model_id,model_no,terms_json,unavailable)
    SELECT id,thread_id,item_id,title,head,layers_json,extra_json,req_qty,req_unit,qty,unit,price,note,state,bundle_id,quote_id,no,created_at,updated_at,locks_json,s_json,prices_json,0,0,NULL,0 FROM sp_lines_pre_models`;
  await env.DB.batch([
    env.DB.prepare("ALTER TABLE sp_lines RENAME TO sp_lines_pre_models"),
    env.DB.prepare(create),
    env.DB.prepare(copy),
    env.DB.prepare("DROP TABLE sp_lines_pre_models"),
  ]);
}
