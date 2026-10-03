/**
 * نقطهٔ ورود Worker سایت «asli»
 *
 * فایل‌های ثابت را Cloudflare پیش از رسیدن به این کد سرو می‌کند (run_worker_first=false)،
 * پس این‌جا فقط مسیرهای بدون فایل می‌رسند: API تأمین و پشتیبانی، API بخش حقوقی، و هر چیز
 * دیگری که به ASSETS برمی‌گردد تا ۴۰۴ استاندارد بدهد.
 *
 * `scheduled` همان چرخهٔ هشدار و صف پیام بات است (ADR-0032): Worker پروسهٔ دائمی
 * ندارد، پس یادآوری مهلت‌ها با Cron Trigger کار می‌کند نه با یک حلقهٔ همیشه‌روشن.
 * ساعتی یک بار هم فایل‌های کهنهٔ بخش حقوقی از Files API انتروپیک پاک می‌شوند.
 */
import { route as apiRoute, ensureSchema } from "./worker/api.js";
import { scheduled as botTick } from "./worker/bot.js";
import { ensureSpWebhook } from "./worker/sp-bot.js";
import { legalRoute, legalCleanup, PREFIX as LEGAL_PREFIX } from "./worker/legal.js";

/* وبهوکِ بات مکاتبات تأمین‌کنندگان یک بار در هر isolate سنجیده می‌شود (یک خواندن از settings)؛ اگر
   ثبت نشده یا دامنه عوض شده، همین‌جا ثبت می‌شود — بعد از استقرار کار دستی لازم نیست. */
let spHooked = false;

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/tamin-poshtibani/api")) return apiRoute(request, env, ctx);
    if (pathname.startsWith(LEGAL_PREFIX)) return legalRoute(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (new Date(event.scheduledTime || Date.now()).getUTCMinutes() === 17) {
      ctx.waitUntil(legalCleanup(env).then(
        (r) => r.removed && console.log("legal cleanup", JSON.stringify(r)),
        (e) => console.error("legal cleanup failed", e && e.message),
      ));
    }
    if (!env.TG_BOT_TOKEN) return; /* بات هنوز ست نشده — چیزی برای فرستادن نیست */
    /* طرحِ دیتابیس پیش از Cron: اگر اولین اجرا بعد از استقرار Cron باشد نه یک درخواست، ستون‌های تازه
       (مثل outbox.bot) هنوز ساخته نشده‌اند. با اثر انگشتِ طرح، روی دیتابیس به‌روز فقط یک کوئری است. */
    ctx.waitUntil(ensureSchema(env).then(() => botTick(env, event.cron)).then(
      (r) => console.log("bot tick", JSON.stringify(r)),
      (e) => console.error("bot tick failed", e && e.message),
    ));
    if (!spHooked && env.TG_SP_BOT_TOKEN && env.TG_WEBHOOK_SECRET) {
      spHooked = true;
      ctx.waitUntil(ensureSchema(env).then(() => ensureSpWebhook(env)).then(
        (r) => r && !r.cached && console.log("sp webhook", JSON.stringify(r)),
        (e) => { spHooked = false; console.error("sp webhook failed", e && e.message); },
      ));
    }
  },
};
