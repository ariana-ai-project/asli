/**
 * پروندهٔ مذاکرهٔ کارشناس هوشمند — یک فایل md برای هر درخواست (مهر ۱۴۰۵)
 *
 * هر پیامِ هر گفت‌وگو با برچسب: شماره، زمان (تهران و UTC)، جهت (تأمین‌کننده ← / کارشناس هوشمند →)، نوع (پیام، ارسال
 * مشخصات، پیش‌فاکتور، تصمیم…)، درخواست، قلم (کد و عنوان) و تأمین‌کننده (نام، شماره، برچسب، منبع). همین بخشِ هر گفت‌وگو
 * (بی شمارهٔ کامل) پروندهٔ مدلِ مذاکره‌گر است، پس مدل دقیقاً همان را می‌خواند که در فایل ذخیره شده.
 */
import { fmtFa } from "./time.js";

const T = (v) => String(v == null ? "" : v).trim();
const FA = "۰۱۲۳۴۵۶۷۸۹";
const faN = (s) => String(s).replace(/\d/g, (d) => FA[+d]);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
const mask = (p) => { const s = T(p); return s.length > 7 ? `${s.slice(0, 4)}•••${s.slice(-4)}` : s; };
const quote = (s) => T(s).split("\n").map((x) => `> ${x}`).join("\n") || "> —";

export const SOURCE_FA = { history: "سوابق خرید شرکت", smart: "جستجوی هوشمند", manual: "معرفیِ کارشناس", human: "ارسالِ کارشناسِ انسانی" };
const EV_FA = {
  rfq: "استعلام", remind: "یادآوری استعلام", submit: "ارسال مشخصات و قیمت", pf: "پیش‌فاکتور", file: "پیوست",
  approve: "تأیید مشخصات و درخواست پیش‌فاکتور", return: "برگشت برای اصلاح", reject: "رد", final: "تأیید نهایی", ai: "خوانش هوشمند پیش‌فاکتور",
};

const kindOf = (m, meta) => (m.kind === "note" ? "یادداشت درونی" : m.kind === "event" ? EV_FA[meta && meta.ev] || "رخداد" : "پیام");
const dirOf = (m, meta) => (m.who === "s" ? "تأمین‌کننده ← شرکت"
  : m.kind === "note" ? (meta && meta.ai ? "یادداشتِ کارشناس هوشمند (تأمین‌کننده نمی‌بیند)" : "یادداشتِ درونی (تأمین‌کننده نمی‌بیند)")
    : meta && meta.ai ? "کارشناس هوشمند → تأمین‌کننده" : "کارشناس → تأمین‌کننده");
const itemsOf = (meta, lines) => {
  const xs = meta && Array.isArray(meta.items) && meta.items.length ? meta.items : null;
  if (xs) return xs.map((x) => `کد ${faN(x.no || "?")} — ${x.title}`).join("؛ ");
  return lines && lines.length ? `همهٔ اقلامِ گفت‌وگو (${lines.map((l) => `کد ${faN(l.no || "?")} — ${l.title}`).join("؛ ")})` : "—";
};

/** یک پیام با برچسب‌هایش */
export function msgEntry(m, t, { full } = {}) {
  const meta = m.meta !== undefined ? m.meta : parse(m.meta_json, null);
  return [
    `#### پیام ${faN(m.id)} · ${dirOf(m, meta)} · ${kindOf(m, meta)}`,
    `- زمان: ${fmtFa(m.at)} (${new Date(m.at).toISOString()})`,
    `- درخواست: ${t.request_id}${t.party ? ` — ${t.party}` : ""}`,
    `- قلم: ${itemsOf(meta, t.lines)}`,
    `- تأمین‌کننده: ${t.supplier}${full ? ` · ${t.phone || "—"}` : t.phone ? ` · ${mask(t.phone)}` : ""}${t.label ? ` (${t.label})` : ""}`,
    "",
    quote(m.body),
  ].join("\n");
}

/**
 * بخشِ یک گفت‌وگو. t: {thread_id, supplier, supplier_id, phone, label, source, request_id, party, lines, state}
 * forModel: یادداشت‌های درونی کنار می‌روند، شماره پوشیده می‌ماند و فقط آخرین `last` پیام می‌آید.
 */
export function threadSection(t, msgs, { forModel = false, last = 60, full = false } = {}) {
  let list = forModel ? msgs.filter((m) => m.kind !== "note") : msgs;
  const skipped = forModel && list.length > last ? list.length - last : 0;
  if (skipped) list = list.slice(-last);
  const head = forModel ? [] : [
    `## گفت‌وگو با «${t.supplier}»`,
    `<!-- thread=${t.thread_id} supplier=${t.supplier_id || ""} source=${t.source || ""} -->`,
    `- شماره: ${full ? t.phone || "—" : mask(t.phone)}${t.label ? ` (${t.label})` : ""} · منبع: ${SOURCE_FA[t.source] || t.source || "—"} · وضعیت: ${t.state || "—"}`,
    "",
  ];
  return [...head, ...(skipped ? [`(${faN(skipped)} پیامِ قدیمی‌تر اینجا نیامده)`, ""] : []), ...(list.length ? list.map((m) => msgEntry(m, t, { full })) : ["هنوز پیامی نیست."])].join("\n\n");
}

/** کلِ فایل */
export function runMd({ company, run, request, expert, items, threads, msgsBy, now }) {
  const st = { prep: "آماده‌سازی و بررسی سوابق", search: "جستجوی هوشمند", work: "دعوت و مذاکره", closing: "تهیهٔ جدول کمیسیون و نامه", done: "پایان‌یافته", paused: "متوقف", failed: "خطا" };
  const fm = [
    "---",
    "پرونده: مذاکرهٔ کارشناس هوشمند",
    `شرکت: ${company}`,
    `درخواست: ${request.id}`,
    `طرف مقابل: ${request.party || "—"}`,
    `کارشناس: ${expert}`,
    `شروع: ${fmtFa(run.created_at)}`,
    `به‌روزرسانی: ${fmtFa(now)}`,
    `وضعیت: ${st[run.state] || run.state}`,
    "---",
  ].join("\n");
  const its = (items || []).map((i) => `- [قلم ${i.id}] ${i.title} — ${faN(i.qty == null ? "—" : i.qty)} ${i.unit || ""}${i.head ? ` · نوع قلم: ${i.head}` : ""}${i.layers && i.layers.length ? ` · لایه‌ها: ${i.layers.map((x) => `${x.k} = ${x.v}`).join("، ")}` : ""}`).join("\n");
  const table = ["| # | تأمین‌کننده | شماره | منبع | وضعیت | دورِ مذاکره |", "|---|---|---|---|---|---|",
    ...(threads || []).map((t, n) => `| ${faN(n + 1)} | ${t.supplier} | ${t.phone || "—"} | ${SOURCE_FA[t.source] || t.source || "—"} | ${t.state || "—"} | ${faN(t.turns || 0)} |`)].join("\n");
  const body = (threads || []).map((t) => threadSection(t, (msgsBy && msgsBy.get(t.thread_id)) || [], { full: true })).join("\n\n---\n\n");
  return `${fm}\n\n# پروندهٔ مذاکره — درخواست ${request.id}\n\n## اقلام\n${its || "—"}\n\n## تأمین‌کنندگانِ دعوت‌شده\n${(threads || []).length ? table : "هنوز دعوتی نرفته است."}\n\n${body}\n`;
}
