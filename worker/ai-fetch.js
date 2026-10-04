/**
 * فراخوانیِ مدل زبانی، با ضبط برای تب «کارشناس هوشمند» (مهر ۱۴۰۵)
 *
 * aiFetch همان fetch است. اگر env.__aiRec باشد — یعنی این فراخوانی در یک گامِ کارشناس هوشمند است — درخواستِ دقیق
 * (پرامپت سیستم، پیام‌ها، ابزارها، تنظیمات) و پاسخ به آن داده می‌شود تا در ai_calls بنشیند و کارشناس ببیند دقیقاً چه
 * رفت، چه برگشت و تقریباً چند. کارِ کارشناسِ انسانی ضبط نمی‌شود و هزینه‌اش هم به کسی گفته نمی‌شود.
 */
const T = (v) => String(v == null ? "" : v).trim();

/** دلار به ازای یک میلیون توکن (ورودی، خروجی، خواندن از کش، نوشتن در کشِ ۵ دقیقه‌ای) — جدول قیمتِ مهر ۱۴۰۵ */
export const PRICES = {
  "claude-fable-5-1": { in: 10, out: 50, cr: 0.25, cw: 12.5 },
  "claude-opus-5-5": { in: 4, out: 20, cr: 0.2, cw: 5 },
  "claude-opus-5": { in: 5, out: 25, cr: 0.5, cw: 6.25 },
  "claude-opus-4-8": { in: 5, out: 25, cr: 0.5, cw: 6.25 },
  "claude-sonnet-5-5": { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  "claude-sonnet-5": { in: 2, out: 10, cr: 0.2, cw: 2.5 },
  "claude-haiku-4-5": { in: 1, out: 5, cr: 0.1, cw: 1.25 },
};
/* جستجوی وب (ابزار سمت سرور): ۱۰ دلار برای هر هزار جستجو */
const WEB_SEARCH = 0.01;

const priceOf = (model) => {
  const m = T(model);
  const k = Object.keys(PRICES).filter((x) => m === x || m.startsWith(`${x}-`)).sort((a, b) => b.length - a.length)[0];
  return k ? PRICES[k] : null;
};

/** تخمین هزینهٔ یک پاسخ از usage آن (دلار) — مدلِ ناشناخته null */
export function estimateCost(model, u) {
  const p = priceOf(model);
  if (!p || !u) return null;
  const n = (x) => Number(x) || 0;
  const searches = n(u.server_tool_use && u.server_tool_use.web_search_requests);
  return (p.in * n(u.input_tokens) + p.out * n(u.output_tokens) + p.cr * n(u.cache_read_input_tokens) + p.cw * n(u.cache_creation_input_tokens)) / 1e6
    + searches * WEB_SEARCH;
}

/**
 * fetch با ضبط. پاسخِ JSON کپی و خوانده می‌شود (خودِ پاسخ دست‌نخورده به صدازننده می‌رسد)؛ پاسخِ جریانی (جستجوی هوشمند)
 * فقط با درخواستش ضبط می‌شود و مصرفش را صدازننده بعد اضافه می‌کند.
 */
export async function aiFetch(env, url, init = {}) {
  const rec = env && typeof env.__aiRec === "function" ? env.__aiRec : null;
  if (!rec) return fetch(url, init);
  const t0 = Date.now();
  let res = null, err = null;
  try { res = await fetch(url, init); } catch (e) { err = e; }
  const entry = { at: t0, ms: Date.now() - t0, request: typeof init.body === "string" ? init.body : null, status: res ? res.status : 0, error: err ? String((err && err.message) || err) : null, response: null, stream: false };
  if (res) {
    if (/json/i.test(res.headers.get("content-type") || "")) {
      try { entry.response = await res.clone().text(); } catch (_) { /* پاسخ خوانده نشد؛ خودِ درخواست ضبط می‌شود */ }
    } else entry.stream = true;
  }
  try { rec(entry); } catch (e) { console.error("ai rec", e && e.message); }
  if (err) throw err;
  return res;
}
