/**
 * نقطهٔ ورود Worker سایت «asli»
 *
 * فایل‌های ثابت را Cloudflare پیش از رسیدن به این کد سرو می‌کند (run_worker_first=false)،
 * پس این‌جا فقط مسیرهای بدون فایل می‌رسند: API تأمین و پشتیبانی، و هر چیز دیگری
 * که به ASSETS برمی‌گردد تا ۴۰۴ استاندارد بدهد.
 *
 * `scheduled` همان چرخهٔ هشدار و صف پیام بات است (ADR-0032): Worker پروسهٔ دائمی
 * ندارد، پس یادآوری مهلت‌ها با Cron Trigger کار می‌کند نه با یک حلقهٔ همیشه‌روشن.
 */
import { route as apiRoute } from "./worker/api.js";
import { scheduled as botTick } from "./worker/bot.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/tamin-poshtibani/api")) return apiRoute(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    if (!env.TG_BOT_TOKEN) return; /* بات هنوز ست نشده — چیزی برای فرستادن نیست */
    ctx.waitUntil(botTick(env).then(
      (r) => console.log("bot tick", JSON.stringify(r)),
      (e) => console.error("bot tick failed", e && e.message),
    ));
  },
};
