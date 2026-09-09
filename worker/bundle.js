/**
 * بستهٔ تحویل کارشناس — همهٔ برگه‌های یک ارجاع، آمادهٔ ارسال
 *
 * وقتی کار کارشناس تمام شد (پیش‌فاکتورها ثبت، توضیحات نوشته، و در صورت نیاز
 * نامه آماده)، این ماژول دو تا سه فایل می‌سازد:
 *   ۱. برگهٔ درخواست خرید — از همان داده‌ای که مدیر با اکسل بارگذاری کرده
 *   ۲. جدول مقایسه استعلام بها (فرم کمیسیون)
 *   ۳. نامهٔ پیوست، اگر ساخته شده باشد
 *
 * چرا این‌جا و نه در پنل: کارشناس اغلب سرِ کارگاه و با گوشی است. فایل‌ها هم در
 * تلگرام برایش می‌روند و هم در پنل می‌مانند؛ هیچ‌کدام جای دیگری را نمی‌گیرد.
 */
import { HttpError } from "./http.js";
import { commissionHtml, requestHtml } from "./sheets.js";
import { jStr } from "./time.js";

/** همهٔ داده‌های لازم برای برگه‌ها، با یک بار خواندن از دیتابیس */
export async function bundleData(env, aid, settings, company) {
  const a = await env.DB.prepare(
    `SELECT a.*, e.name AS expert_name, e.label AS expert_label, r.id AS req_id, r.date AS req_date, r.party,
            r.party_type, r.center, r.requester, r.req_type, r.urgency
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
      id: a.req_id, date: a.req_date, party: a.party, center: a.center, requester: a.requester,
      head_req_type: a.req_type, urgency: a.urgency, head_deal_type: null, head_site: null,
    },
    items: items.results || [],
    quotes: quotes.results || [],
    letter,
    expert: a.expert_label || a.expert_name,
    company,
    vatRate: typeof settings.vatRate === "number" ? settings.vatRate : 0.1,
    date: jStr(Date.now()),
  };
}

const XLS = "application/vnd.ms-excel";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * فایل‌های بسته را می‌سازد.
 * `letterBytes` را صدازننده می‌دهد (از انبار خوانده می‌شود) تا این ماژول به
 * جایی وصل نباشد و بشود مستقل تستش کرد.
 */
export function buildFiles(d, letterBytes) {
  const id = d.request.id;
  const files = [
    { name: `درخواست-خرید-${id}.xls`, type: XLS, body: requestHtml(d) },
    { name: `کمیسیون-${id}.xls`, type: XLS, body: commissionHtml({ ...d, notes: d.assignment.notes }) },
  ];
  if (letterBytes) files.push({ name: `نامه-${id}.docx`, type: DOCX, body: letterBytes });
  return files;
}

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
