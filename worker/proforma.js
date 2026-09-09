/**
 * استخراج پیش‌فاکتور و ثبت نتیجه در جدول استعلام‌ها.
 *
 * جدا از روتر است چون هم مسیرهای HTTP و هم بات تلگرام همین دو کار را می‌کنند
 * و نباید دو پیاده‌سازی داشته باشند.
 */
import { HttpError } from "./http.js";
import { extractProforma, toRial } from "./extract.js";

const now = () => Date.now();
const T = (v) => String(v == null ? "" : v).trim();

/** پیش‌فاکتور + بررسی مالکیت (INV-11) */
export async function proformaOf(env, pid, ex) {
  const p = await env.DB.prepare(
    "SELECT p.*, a.expert_id, a.request_id FROM proformas p JOIN assignments a ON a.id=p.assignment_id WHERE p.id=?",
  ).bind(pid).first();
  if (!p) throw new HttpError("پیش‌فاکتور پیدا نشد.", 404);
  if (p.expert_id !== ex.id) throw new HttpError("این پیش‌فاکتور متعلق به شما نیست.", 403);
  return p;
}

export async function runExtraction(env, store, p) {
  const items = (await env.DB.prepare(
    "SELECT id, title, qty, unit, spec FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no",
  ).bind(p.assignment_id).all()).results || [];
  const req = await env.DB.prepare("SELECT id, party FROM requests WHERE id=?").bind(p.request_id).first();

  /* لینک کوتاه‌عمر: فقط باید تا وقتی مدل سند را می‌گیرد زنده باشد */
  const fileUrl = await store.signedUrl(p.storage_key, 900);
  const t = now();
  try {
    const { result, meta } = await extractProforma(env, { fileUrl, mime: p.mime, items, request: req || { id: p.request_id } });
    const state = result.extractable ? "ok" : "refused";
    await env.DB.prepare("UPDATE proformas SET extracted_json=?, extract_state=?, extract_at=? WHERE id=?")
      .bind(JSON.stringify({ result, meta }), state, t, p.id).run();
    return { ok: true, state, result, meta };
  } catch (e) {
    await env.DB.prepare("UPDATE proformas SET extract_state='failed', extract_at=? WHERE id=?").bind(t, p.id).run();
    throw new HttpError(e.message, e.status || 502);
  }
}

/**
 * نتیجهٔ استخراج را در جدول استعلام‌ها می‌نویسد.
 * فقط سطرهایی که به یک قلمِ درخواست وصل شده‌اند نوشته می‌شوند؛ بقیه نادیده
 * می‌مانند تا کارشناس خودش تصمیم بگیرد.
 */
export async function applyExtraction(env, p, body) {
  const stored = p.extracted_json ? JSON.parse(p.extracted_json) : null;
  if (!stored || !stored.result) throw new HttpError("برای این پیش‌فاکتور استخراجی ذخیره نشده است.");
  const r = stored.result;
  if (!r.extractable) throw new HttpError("این سند خوانا نبود و چیزی برای ثبت ندارد.");

  /* واحد پول: اگر مدل نفهمیده، کارشناس باید صریح بگوید — وگرنه خطای ده‌برابری */
  const currency = T(body && body.currency) || r.currency;
  if (!currency) throw new HttpError("واحد پول در سند مشخص نبود؛ ریال یا تومان را انتخاب کنید.", 422);

  const supplier = T(body && body.supplier_name) || p.supplier_name;
  const its = new Map(((await env.DB.prepare("SELECT id, qty, unit FROM items WHERE assignment_id=?").bind(p.assignment_id).all()).results || [])
    .map((i) => [i.id, i]));
  const existing = new Map(((await env.DB.prepare("SELECT id, item_id FROM quotes WHERE assignment_id=? AND supplier_name=?")
    .bind(p.assignment_id, supplier).all()).results || []).map((q) => [q.item_id, q.id]));

  const t = now(); const stmts = []; let n = 0, skipped = 0;
  for (const line of r.lines || []) {
    const itemId = line.matched_item_id;
    if (!itemId || !its.has(itemId) || line.unit_price == null) { skipped++; continue; }
    const it = its.get(itemId);
    const price = toRial(line.unit_price, currency);
    const low = line.confidence !== "high" ? 1 : 0;
    n++;
    const qid = existing.get(itemId);
    stmts.push(qid
      ? env.DB.prepare(`UPDATE quotes SET spec=COALESCE(?,spec), unit=COALESCE(unit,?), qty=COALESCE(qty,?), price=?,
           dtime=COALESCE(?,dtime), valid_days=COALESCE(?,valid_days), ship=COALESCE(?,ship), invoice=COALESCE(?,invoice),
           pay=COALESCE(?,pay), low_conf=?, saved=1, source='ai', updated_at=? WHERE id=?`)
        .bind(line.spec || null, line.unit || it.unit, line.qty == null ? it.qty : line.qty, price,
          r.delivery_date || null, r.valid_days == null ? null : String(r.valid_days), r.ship_method || null, r.invoice_type || null,
          r.pay_terms || null, low, t, qid)
      : env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,spec,unit,qty,price,dtime,valid_days,ship,invoice,pay,saved,final,low_conf,source,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,'ai',?,?)`)
        .bind(p.assignment_id, itemId, supplier, line.spec || null, line.unit || it.unit,
          line.qty == null ? it.qty : line.qty, price, r.delivery_date || null,
          r.valid_days == null ? null : String(r.valid_days), r.ship_method || null, r.invoice_type || null, r.pay_terms || null, low, t, t));
  }
  if (!n) throw new HttpError("هیچ سطری از این پیش‌فاکتور به اقلام درخواست وصل نشده بود.", 422);

  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${p.expert_id}`, "extract_applied", p.request_id,
      JSON.stringify({ proforma_id: p.id, supplier, lines: n, skipped, currency, prompt_version: (stored.meta || {}).prompt_version })));
  await env.DB.batch(stmts);
  return { ok: true, applied: n, skipped, currency, supplier };
}
