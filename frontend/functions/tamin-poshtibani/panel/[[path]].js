/**
 * پروکسی Cloudflare Pages Function
 *
 * هر درخواستی به  arianaai.website/tamin-poshtibani/panel/*
 * پشت پرده به اپ FastAPI روی Render فرستاده می‌شود.
 * کاربر هیچ‌وقت آدرس Render را نمی‌بیند و همه‌چیز روی همین دامنه می‌ماند.
 *
 * چرا پروکسی و نه کپی کردن اپ داخل این مخزن:
 * Cloudflare Pages فقط فایل ثابت سرو می‌کند و نمی‌تواند پایتون اجرا کند،
 * ولی اپ برای پارس اکسل، دیتابیس و تلگرام به سرور واقعی نیاز دارد.
 * کد اپ در مخزن purchasing-support می‌ماند و اینجا تکرار نمی‌شود.
 */

const UPSTREAM = "https://purchasing-support-staging.onrender.com";
const PREFIX = "/tamin-poshtibani/panel";

export async function onRequest(context) {
  const req = context.request;
  const url = new URL(req.url);

  // مسیر بعد از پیشوند — همان چیزی که به Render فرستاده می‌شود
  let path = url.pathname.startsWith(PREFIX)
    ? url.pathname.slice(PREFIX.length)
    : url.pathname;
  if (path === "" || path === "/") path = "/";

  // اگر fetch نسبی از صفحه‌ای با اسلش پایانی آمده باشد
  // (مثل /panel/manager/api/import) فقط بخش api نگه داشته می‌شود
  const api = path.indexOf("/api/");
  if (api > 0) path = path.slice(api);

  const target = UPSTREAM + path + url.search;

  const upstreamReq = new Request(target, {
    method: req.method,
    headers: stripHopByHop(req.headers),
    body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
    redirect: "manual",
  });

  let res;
  try {
    res = await fetch(upstreamReq);
  } catch (err) {
    return new Response(
      page("سامانه در دسترس نیست", "اتصال به سرور سامانه پشتیبانی خرید برقرار نشد. چند لحظه بعد دوباره تلاش کنید."),
      { status: 502, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  // ریدایرکت سرور بالادست باید داخل همین مسیر بماند، نه به دامنه Render
  const loc = res.headers.get("location");
  const headers = new Headers(res.headers);
  if (loc) {
    try {
      const l = new URL(loc, UPSTREAM);
      if (l.origin === UPSTREAM) headers.set("location", PREFIX + l.pathname + l.search);
    } catch (_) { /* مقدار نامعتبر — دست‌نخورده می‌ماند */ }
  }
  // این نمونه staging است و نباید در موتورهای جستجو ایندکس شود
  headers.set("x-robots-tag", "noindex, nofollow");

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** هدرهایی که نباید بین دو اتصال منتقل شوند */
function stripHopByHop(h) {
  const out = new Headers(h);
  ["host", "connection", "keep-alive", "transfer-encoding", "upgrade"].forEach((k) => out.delete(k));
  return out;
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:Tahoma,sans-serif;background:#030814;color:#eef4ff;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}
h1{font-size:22px;margin:0 0 10px}p{color:#9fb2d8}</style></head>
<body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
}
