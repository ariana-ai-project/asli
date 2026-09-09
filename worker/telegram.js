/**
 * آداپتور پیام‌رسان — لایهٔ حمل
 *
 * تنها جایی از سامانه که با Bot API تلگرام حرف می‌زند. منطق کاری در `bot.js` است
 * و از این‌جا فقط چهار-پنج تابع می‌بیند. دلیلش ADR-0006 است: قرار است روزی «بله»
 * یا «روبیکا» هم اضافه شود و هر دو Bot API تقریباً یکسانی دارند؛ آن روز فقط همین
 * فایل کپی و آدرس پایه‌اش عوض می‌شود، نه منطق ارجاع و مهلت.
 *
 * وبهوک به‌جای long polling (ADR-0032): Worker پروسهٔ دائمی ندارد، ولی خودش یک
 * نقطهٔ پایانی عمومی HTTPS روی ۴۴۳ است — همان چیزی که setWebhook می‌خواهد.
 */

const API = "https://api.telegram.org/bot";

/** خطای قابل‌تشخیصِ تلگرام تا صف بداند «دوباره تلاش کن» یا «هرگز» */
export class TgError extends Error {
  constructor(method, code, description, retryAfter) {
    super(`${method}: ${code} ${description}`);
    this.code = code; this.description = description || ""; this.retryAfter = retryAfter || 0;
  }
  /**
   * آیا تکرار این پیام بی‌فایده است؟
   *
   * ۴۰۳ یعنی کاربر بات را بلاک کرده و ۴۰۰ یعنی خودِ درخواست خراب است — این دو
   * با تکرار درست نمی‌شوند. ولی ۴۰۱ یعنی توکن غلط است؛ آن یک ایراد پیکربندی
   * سراسری است که مدیر می‌تواند رفعش کند، پس پیام‌ها نباید بسوزند و باید تا
   * سقف تلاش‌ها منتظر بمانند. ۴۲۹ و ۵xx هم موقتی‌اند.
   */
  get permanent() {
    return this.code === 400 || this.code === 403 || this.code === 404;
  }
}

export function telegram(env) {
  const token = env.TG_BOT_TOKEN;
  if (!token) throw new TgError("init", 503, "TG_BOT_TOKEN روی این پروژه ست نشده است.");

  async function call(method, body) {
    const r = await fetch(API + token + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new TgError(method, d.error_code || r.status, d.description, d.parameters && d.parameters.retry_after);
    return d.result;
  }

  return {
    call,
    getMe: () => call("getMe"),
    /** متن با دکمه‌های شیشه‌ای. `keyboard` آرایه‌ای از سطرهاست. */
    sendMessage: (chat_id, text, keyboard) => call("sendMessage", {
      chat_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      ...(keyboard && keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
    editMessageText: (chat_id, message_id, text, keyboard) => call("editMessageText", {
      chat_id, message_id, text, parse_mode: "HTML", link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    }),
    /** پاسخ به فشردن دکمه — تلگرام تا این نیاید ساعت شنی را روی دکمه نگه می‌دارد */
    answerCallback: (callback_query_id, text, alert) =>
      call("answerCallbackQuery", { callback_query_id, ...(text ? { text } : {}), ...(alert ? { show_alert: true } : {}) }),
    getFile: (file_id) => call("getFile", { file_id }),
    /** آدرس دانلود فایل. لینک حداقل یک ساعت معتبر است، پس دانلود باید فوری باشد (ADR-0008) */
    fileUrl: (file_path) => `https://api.telegram.org/file/bot${token}/${file_path}`,
    setWebhook: (url, secret_token) => call("setWebhook", {
      url, secret_token,
      allowed_updates: ["message", "callback_query", "my_chat_member"],
      drop_pending_updates: true,
    }),
    deleteWebhook: () => call("deleteWebhook", { drop_pending_updates: true }),
    getWebhookInfo: () => call("getWebhookInfo"),
  };
}

/** گریزِ HTML برای parse_mode=HTML — نام طرف مقابل و عنوان قلم از فایل اکسل می‌آید و کنترل‌نشده است */
export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
