/**
 * بستهٔ تحویل کارشناس — همهٔ برگه‌های یک ارجاع، آمادهٔ ارسال
 *
 * وقتی کار کارشناس تمام شد (پیش‌فاکتورها ثبت، توضیحات نوشته، و در صورت نیاز
 * نامه آماده)، این ماژول دو تا سه فایل می‌سازد:
 *   ۱. برگهٔ درخواست خرید — فایل Word در قالب فرم چاپی شرکت، از همان داده‌ای
 *      که مدیر با اکسل بارگذاری کرده — نه تأمین‌کننده، نه مهلت
 *   ۲. جدول مقایسه استعلام بها (فرم کمیسیون)
 *   ۳. نامهٔ پیوست، اگر ساخته شده باشد
 *
 * چرا این‌جا و نه در پنل: کارشناس اغلب سرِ کارگاه و با گوشی است. فایل‌ها هم در
 * تلگرام برایش می‌روند و هم در پنل می‌مانند؛ هیچ‌کدام جای دیگری را نمی‌گیرد.
 */
import { HttpError } from "./http.js";
import { commissionXlsx, XLSX_MIME } from "./sheets.js";
import { renderRequestDoc } from "./reqdoc.js";
import { jStr, fmtFa } from "./time.js";

/** همهٔ داده‌های لازم برای برگه‌ها، با یک بار خواندن از دیتابیس */
export async function bundleData(env, aid, settings, company) {
  const a = await env.DB.prepare(
    `SELECT a.*, e.name AS expert_name, e.label AS expert_label, r.id AS req_id, r.date AS req_date, r.party,
            r.party_type, r.center, r.requester, r.req_type, r.buy_type, r.buy_flow, r.urgency
     FROM assignments a JOIN experts e ON e.id=a.expert_id JOIN requests r ON r.id=a.request_id WHERE a.id=?`,
  ).bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);

  const [items, quotes, letter] = await Promise.all([
    env.DB.prepare("SELECT * FROM items WHERE assignment_id=? ORDER BY line_no").bind(aid).all(),
    env.DB.prepare("SELECT * FROM quotes WHERE assignment_id=?").bind(aid).all(),
    env.DB.prepare("SELECT * FROM letters WHERE assignment_id=? AND state='written' ORDER BY id DESC LIMIT 1").bind(aid).first(),
  ]);

  return {
    assignment: a,
    request: {
      id: a.req_id, date: a.req_date, party: a.party, party_type: a.party_type,
      center: a.center, requester: a.requester, buy_type: a.buy_type, buy_flow: a.buy_flow,
      head_req_type: a.req_type, urgency: a.urgency, head_deal_type: null, head_site: null,
      /* «مهلت استعلام» در فرمِ چاپی همان مهلتِ ارجاع است */
      deadline: a.deadline_at ? jStr(a.deadline_at) : "",
      deadlineFull: a.deadline_at ? fmtFa(a.deadline_at) : "",
    },
    items: items.results || [],
    quotes: quotes.results || [],
    letter,
    expert: a.expert_label || a.expert_name,
    expertName: a.expert_name,
    commission_no: a.commission_no || null,
    company,
    vatRate: typeof settings.vatRate === "number" ? settings.vatRate : 0.1,
    date: jStr(Date.now()),
  };
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * فایل‌های بسته را می‌سازد.
 * `letterBytes` را صدازننده می‌دهد (از انبار خوانده می‌شود) تا این ماژول به
 * جایی وصل نباشد و بشود مستقل تستش کرد.
 */
export async function buildFiles(d, letterBytes) {
  const id = d.request.id;
  const files = [
    { name: `درخواست-خرید-${id}.docx`, type: DOCX, body: await (await renderRequestDoc(d)).arrayBuffer() },
    { name: `کمیسیون-${id}.xlsx`, type: XLSX_MIME, body: await (await commissionXlsx({ ...d, notes: d.assignment.notes })).arrayBuffer() },
  ];
  if (letterBytes) files.push({ name: `نامه-${id}.docx`, type: DOCX, body: letterBytes });
  return files;
}

/**
 * نگهبان جدول کمیسیون — یک قاعده برای پنل و بات: دست‌کم یک «تأیید نهایی»، و برای
 * هر قلمِ باز دست‌کم به تعدادِ «حداقل تأمین‌کننده»ی مدیر استعلامِ ثبت‌موقت‌شده.
 */
export async function commissionGuard(env, aid, settings) {
  const need = Math.max(1, Number(settings && settings.minSuppliers) || 1);
  const [items, counts, fin] = await Promise.all([
    env.DB.prepare("SELECT id, title FROM items WHERE assignment_id=? AND state='open'").bind(aid).all(),
    env.DB.prepare("SELECT item_id, COUNT(*) AS n FROM quotes WHERE assignment_id=? AND saved=1 GROUP BY item_id").bind(aid).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM quotes WHERE assignment_id=? AND saved=1 AND final=1").bind(aid).first(),
  ]);
  const byItem = new Map((counts.results || []).map((c) => [c.item_id, c.n]));
  const missing = (items.results || []).filter((i) => (byItem.get(i.id) || 0) < need).map((i) => ({ title: i.title, n: byItem.get(i.id) || 0 }));
  return { need, missing, finals: (fin && fin.n) || 0 };
}

/**
 * ثبتِ «جدول کمیسیون ساخته شد» + شمارهٔ ترتیبی فرم.
 *
 * کد بالای فرم (TSA-PS-FO-n) یک شمارندهٔ سراسری است که هر جدول کمیسیونی که ساخته
 * می‌شود یکی جلو می‌رود (تصمیم مدیر). هر ارجاع فقط یک بار شماره می‌گیرد: ساختن دوبارهٔ
 * جدول همان درخواست، همان شماره را نگه می‌دارد. پنل، بات و «تحویل» همه از همین‌جا
 * رد می‌شوند تا شماره یک جا داده شود. شماره را برمی‌گرداند.
 */
export async function markCommission(env, aid, at) {
  const t = at || Date.now();
  const a = await env.DB.prepare("SELECT commission_no FROM assignments WHERE id=?").bind(aid).first();
  if (!a) throw new HttpError("ارجاع پیدا نشد.", 404);
  if (a.commission_no) {
    await env.DB.prepare("UPDATE assignments SET commission_at=COALESCE(commission_at,?) WHERE id=?").bind(t, aid).run();
    return a.commission_no;
  }
  const c = await env.DB.prepare(
    "INSERT INTO counters (key,value) VALUES ('commission',1) ON CONFLICT(key) DO UPDATE SET value=value+1 RETURNING value",
  ).first();
  const no = Number(c && c.value) || 1;
  await env.DB.prepare("UPDATE assignments SET commission_at=COALESCE(commission_at,?), commission_no=COALESCE(commission_no,?) WHERE id=?").bind(t, no, aid).run();
  const row = await env.DB.prepare("SELECT commission_no FROM assignments WHERE id=?").bind(aid).first();
  return (row && row.commission_no) || no;
}

/** کد فرم کمیسیون روی برگه؛ پیش از تولید، شماره ندارد */
export const commissionCode = (no) => `TSA-PS-FO-${no ? String(no) : "—"}`;

/** چه چیزی هنوز آماده نیست — پیش از تحویل به کارشناس گفته می‌شود، نه بعدش */
export function readiness(d) {
  const finals = d.quotes.filter((q) => q.final && q.saved);
  const suppliers = new Set(finals.map((q) => q.supplier_name));
  const priced = new Set(finals.map((q) => q.item_id));
  const missing = d.items.filter((i) => i.state === "open" && !priced.has(i.id));
  return {
    suppliers: suppliers.size,
    itemsMissing: missing.map((i) => i.title),
    hasNotes: !!d.assignment.notes,
    hasLetter: !!d.letter,
    ready: suppliers.size > 0 && missing.length === 0,
  };
}
