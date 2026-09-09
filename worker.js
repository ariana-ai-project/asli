/**
 * نقطهٔ ورود Worker سایت «asli»
 *
 * فایل‌های ثابت را Cloudflare پیش از رسیدن به این کد سرو می‌کند (run_worker_first=false)،
 * پس این‌جا فقط مسیرهای بدون فایل می‌رسند: API تأمین و پشتیبانی، و هر چیز دیگری
 * که به ASSETS برمی‌گردد تا ۴۰۴ استاندارد بدهد.
 */
import { route as apiRoute } from "./worker/api.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/tamin-poshtibani/api")) return apiRoute(request, env);
    return env.ASSETS.fetch(request);
  },
};
