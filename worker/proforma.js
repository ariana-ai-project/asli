/**
 * استخراج پیش‌فاکتور و ثبت نتیجه در جدول استعلام‌ها.
 *
 * جدا از روتر است چون هم مسیرهای HTTP و هم بات تلگرام همین دو کار را می‌کنند
 * و نباید دو پیاده‌سازی داشته باشند.
 */
import { HttpError } from "./http.js";
import { extractProforma, toRial } from "./extract.js";
import { VAT_RATE, netOf, ENUMS, missingRequired, INVOICE_DEFAULT } from "./quote-rules.js";

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

/**
 * سند را به مدل می‌دهد و خروجی خام را برمی‌گرداند. **چیزی در دیتابیس نمی‌نویسد.**
 *
 * جدا از runExtraction است چون مسیر «استعلام جدید» در بات، سند را پیش از آنکه
 * ردیف پیش‌فاکتوری وجود داشته باشد می‌خواند — نام تأمین‌کننده که کلیدِ همان ردیف
 * است، خودش از دل همین خواندن بیرون می‌آید.
 */
export async function extractFor(env, store, { assignment_id, request_id, storage_key, mime }) {
  const items = (await env.DB.prepare(
    "SELECT id, title, qty, unit, spec FROM items WHERE assignment_id=? AND state='open' ORDER BY line_no",
  ).bind(assignment_id).all()).results || [];
  const req = await env.DB.prepare("SELECT id, party FROM requests WHERE id=?").bind(request_id).first();

  /* لینک کوتاه‌عمر: فقط باید تا وقتی مدل سند را می‌گیرد زنده باشد */
  const fileUrl = await store.signedUrl(storage_key, 900);
  try {
    return await extractProforma(env, { fileUrl, mime, items, request: req || { id: request_id } });
  } catch (e) {
    throw new HttpError(e.message, e.status || 502);
  }
}

/** خروجی خواندن را روی ردیف پیش‌فاکتور می‌نشاند (INV-15: خام نگه داشته می‌شود) */
export async function saveExtraction(env, pid, { result, meta }) {
  const state = result.extractable ? "ok" : "refused";
  await env.DB.prepare("UPDATE proformas SET extracted_json=?, extract_state=?, extract_at=? WHERE id=?")
    .bind(JSON.stringify({ result, meta }), state, now(), pid).run();
  return state;
}

export async function runExtraction(env, store, p) {
  let out;
  try { out = await extractFor(env, store, p); }
  catch (e) {
    await env.DB.prepare("UPDATE proformas SET extract_state='failed', extract_at=? WHERE id=?").bind(now(), p.id).run();
    throw e;
  }
  const state = await saveExtraction(env, p.id, out);
  return { ok: true, state, result: out.result, meta: out.meta };
}

/**
 * نتیجهٔ استخراج را در جدول استعلام‌ها می‌نویسد — هم روی خط‌های موجود و هم با
 * ساختن خط تازه اگر برای این تأمین‌کننده خطی نباشد.
 *
 * همهٔ فیلدهای تب استعلامات از همین‌جا پر می‌شوند، جز «محل معامله» که تصمیم
 * داخلی شرکت است و روی پیش‌فاکتور نوشته نمی‌شود.
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
  const existing = new Map(((await env.DB.prepare("SELECT * FROM quotes WHERE assignment_id=? AND supplier_name=?")
    .bind(p.assignment_id, supplier).all()).results || []).map((q) => [q.item_id, q]));

  const lines = r.lines || [];
  const priced = lines.filter((l) => lineUnitPrice(l) != null);
  /* اگر درخواست فقط یک قلم دارد و سند هم فقط یک سطر قیمت‌دار، تطبیق‌نکردنِ مدل
     ابهام واقعی نیست. بیش از این را حدس نمی‌زنیم؛ تطبیق غلط بدتر از نبودش است. */
  const soleItem = its.size === 1 && priced.length === 1 ? [...its.keys()][0] : null;

  /* شرایط فاکتور، مشترک برای همهٔ خط‌های این تأمین‌کننده.
     نوع فاکتور اگر در سند نبود «رسمی» است — قاعدهٔ شرکت، نه حدسِ مدل. */
  const terms = {
    supplier_code: r.supplier_code || null,
    dtime: r.delivery_date || null,
    valid_days: r.valid_days == null ? null : String(r.valid_days),
    ship: r.ship_method || null,
    invoice: r.invoice_type || INVOICE_DEFAULT,
    pay: r.pay_class || r.pay_terms || null,
    place: r.place || null,
    place_other: r.place === "سایر" ? (r.place_other || null) : null,
    vat: ENUMS.vat.includes(r.vat_status) ? r.vat_status : null,
  };

  /* اگر عددهای سند ارزش افزوده را در خود داشته‌اند، این‌جا از قیمت بیرون کشیده
     می‌شود: جدول کمیسیون خودش یک سطر جدا برای ارزش افزوده دارد و اگر قیمت ردیف
     هم آن را داشته باشد، دو بار حساب می‌شود. تقسیم را کد انجام می‌دهد نه مدل —
     مثل تبدیل تومان به ریال، یک کارِ قطعی است. */
  const stripVat = r.vat_included === true;
  const vatRate = stripVat && r.vat_rate > 0 && r.vat_rate < 100 ? r.vat_rate / 100 : VAT_RATE;

  const t = now(); const stmts = []; let n = 0, created = 0, skipped = 0, savedN = 0;
  const missingAll = new Set();
  for (const line of lines) {
    const itemId = line.matched_item_id && its.has(line.matched_item_id) ? line.matched_item_id
      : (lineUnitPrice(line) != null ? soleItem : null);
    const unitPrice = lineUnitPrice(line);
    if (!itemId || unitPrice == null) { skipped++; continue; }
    const it = its.get(itemId);
    const raw = toRial(unitPrice, currency);
    /* قیمتِ حاصل از تقسیمِ مبلغ کل باید رُند شود؛ اگر رُند نبود یعنی رابطهٔ کل و
       مقدار آن‌قدرها هم روشن نبوده — کم‌اطمینان علامت می‌خورد. */
    const derived = line.unit_price == null;
    const price = stripVat ? netOf(raw, vatRate) : Math.round(raw);
    /* فقط سطرهایی که مدل خودش مطمئن نبوده علامت می‌خورند.
       (روی یک اسکن بسیار بی‌کیفیت و وارونه، مدل جایی هم که مطمئن بود اشتباه
       خواند؛ ولی آن سند نمونهٔ کارِ واقعی نیست — کارشناس فایل درست بارگذاری
       می‌کند. برای همین ملاک، همان اطمینانِ اعلام‌شدهٔ مدل است.) */
    const low = line.confidence !== "high" || stripVat || (derived && price !== raw) ? 1 : 0;
    n++;
    const old = existing.get(itemId);
    if (!old) created++;

    /* خطِ نهایی پس از نشستنِ خوانده‌ها روی خطِ موجود — همان چیزی که ذخیره می‌شود */
    const merged = old
      ? { ...old, spec: line.spec || old.spec, unit: old.unit || line.unit || it.unit, qty: old.qty ?? line.qty ?? it.qty, price,
          supplier_code: old.supplier_code || terms.supplier_code, dtime: terms.dtime || old.dtime, valid_days: terms.valid_days || old.valid_days,
          ship: terms.ship || old.ship, invoice: r.invoice_type || old.invoice || INVOICE_DEFAULT, pay: terms.pay || old.pay,
          place: terms.place || old.place, place_other: terms.place_other || old.place_other, vat: terms.vat || old.vat }
      : { spec: line.spec || null, unit: line.unit || it.unit, qty: line.qty == null ? it.qty : line.qty, price, ...terms };
    /* ثبت موقت فقط وقتی همهٔ اجباری‌ها هستند؛ وگرنه خط می‌ماند تا کارشناس در بات یا پنل پرش کند */
    const miss = missingRequired(merged);
    const saved = miss.length ? 0 : 1;
    if (saved) savedN++; else miss.forEach((f) => missingAll.add(f));

    stmts.push(old
      ? env.DB.prepare(`UPDATE quotes SET supplier_code=?, spec=?, unit=?, qty=?, price=?, dtime=?, valid_days=?, ship=?, invoice=?,
           pay=?, vat=?, place=?, place_other=?, low_conf=?, saved=?, source='ai', updated_at=? WHERE id=?`)
        .bind(merged.supplier_code, merged.spec, merged.unit, merged.qty, price, merged.dtime, merged.valid_days, merged.ship, merged.invoice,
          merged.pay, merged.vat, merged.place, merged.place_other, low, saved, t, old.id)
      : env.DB.prepare(`INSERT INTO quotes (assignment_id,item_id,supplier_name,supplier_code,spec,unit,qty,price,dtime,valid_days,ship,invoice,pay,vat,place,place_other,saved,final,low_conf,source,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,'ai',?,?)`)
        .bind(p.assignment_id, itemId, supplier, merged.supplier_code, merged.spec, merged.unit, merged.qty, price, merged.dtime,
          merged.valid_days, merged.ship, merged.invoice, merged.pay, merged.vat, merged.place, merged.place_other, saved, low, t, t));
  }
  if (!n) throw new HttpError("هیچ سطری از این پیش‌فاکتور به اقلام درخواست وصل نشده بود.", 422);

  stmts.push(env.DB.prepare("INSERT INTO events (at,actor,kind,request_id,payload_json) VALUES (?,?,?,?,?)")
    .bind(t, `expert:${p.expert_id}`, "extract_applied", p.request_id,
      JSON.stringify({ proforma_id: p.id, supplier, lines: n, created, skipped, saved: savedN, currency, vat_stripped: stripVat, prompt_version: (stored.meta || {}).prompt_version })));
  await env.DB.batch(stmts);
  return { ok: true, applied: n, created, skipped, saved: savedN, unsaved: n - savedN, missing: [...missingAll], currency, supplier, vatStripped: stripVat };
}

/**
 * قیمت واحدِ یک سطر: یا خودش نوشته شده، یا از مبلغ کل و مقدارِ همان سطر درمی‌آید.
 * تقسیم این‌جا انجام می‌شود نه در مدل: یک کارِ قطعی است و نباید به تشخیص مدل
 * سپرده شود. رابطه باید بی‌تردید باشد — مقدار و مبلغ کلِ خودِ همان سطر — نه
 * مقدارِ قلمِ درخواست، که ممکن است با آنچه فروشنده قیمت داده فرق کند.
 */
export function lineUnitPrice(line) {
  if (line.unit_price != null) return line.unit_price;
  if (line.total_price != null && Number(line.qty) > 0) return line.total_price / Number(line.qty);
  return null;
}
