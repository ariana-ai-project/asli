/**
 * ذخیرهٔ فایل پیش‌فاکتور — لایهٔ انتزاعی
 *
 * D1 جای فایل نیست و R2 روی این حساب فعال نیست، پس دو گزینهٔ رایگان می‌ماند و
 * کد نباید به هیچ‌کدام گره بخورد:
 *
 *   supabase  — سطل Storage در همان پروژه‌ای که تابع استخراج هوش مصنوعی رویش است.
 *               مزیت اصلی: فایل کنار مدل می‌ماند و برای استخراج، رفت‌وبرگشت و
 *               لینک امضاشده لازم نیست. رایگان: ۱ گیگ، هر فایل تا ۵۰ مگابایت.
 *   kv        — Workers KV. روی همان کلودفلیر، بایندینگ بومی، بدون راز اضافه.
 *               رایگان: ۱ گیگ، هر مقدار تا ۲۵ مگابایت، ۱۰۰۰ نوشتن در روز.
 *               ولی KV یک کش کلید-مقدار است نه انبار فایل: انتشارش سراسری و
 *               نهایتاً سازگار است، پس فایل ممکن است تا یک دقیقه بعدِ آپلود
 *               از همه‌جا خوانده نشود.
 *
 * انتخاب خودکار است: هر کدام پیکربندی شده باشد. اگر هیچ‌کدام نبود، `null`
 * برمی‌گردد و مسیرهای فایل با پیام روشن «هنوز وصل نشده» جواب می‌دهند — نه با خطا.
 *
 * سقف واقعی از این‌ها کوچک‌تر است: بات تلگرام فایل بزرگ‌تر از ۲۰ مگابایت را
 * اصلاً نمی‌تواند دانلود کند (ADR-0008).
 */

/* هر چیزی جز حرف (فارسی یا لاتین)، رقم، نقطه، خط تیره و زیرخط */
const RE_UNSAFE = /[^\p{L}\p{N}._-]+/gu;

export const MAX_BYTES = 20 * 1024 * 1024;

export function storage(env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return supabaseStore(env);
  if (env.FILES) return kvStore(env);
  return null;
}

/**
 * توضیح وضعیت برای پنل مدیر و برای عیب‌یابی راه‌اندازی.
 * `missing` می‌گوید دقیقاً چه چیزی ست نشده — وگرنه «وصل نیست» هیچ سرنخی نمی‌دهد.
 */
export function storageInfo(env) {
  const s = storage(env);
  const missing = [];
  if (!s) {
    if (env.SUPABASE_URL && !env.SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_KEY");
    else if (!env.SUPABASE_URL && !env.FILES) missing.push("SUPABASE_URL + SUPABASE_SERVICE_KEY یا بایندینگ FILES");
  }
  return { configured: !!s, backend: s ? s.backend : null, maxBytes: MAX_BYTES, ...(missing.length ? { missing } : {}) };
}

/* ------------------------------------------------------------------ */

function supabaseStore(env) {
  const bucket = env.SUPABASE_BUCKET || "proformas";
  const base = `${String(env.SUPABASE_URL).replace(/\/+$/, "")}/storage/v1/object`;
  const auth = { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, apikey: env.SUPABASE_SERVICE_KEY };

  return {
    backend: "supabase",
    async put(key, body, { contentType, size } = {}) {
      const r = await fetch(`${base}/${bucket}/${encodeURI(key)}`, {
        method: "POST",
        headers: {
          ...auth,
          "content-type": contentType || "application/octet-stream",
          "x-upsert": "true",
          ...(size ? { "content-length": String(size) } : {}),
        },
        body,
      });
      if (!r.ok) throw new Error(`آپلود در Supabase شکست خورد (${r.status}): ${(await r.text()).slice(0, 200)}`);
      return { key };
    },
    async get(key) {
      const r = await fetch(`${base}/${bucket}/${encodeURI(key)}`, { headers: auth });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`خواندن فایل از Supabase شکست خورد (${r.status})`);
      return { body: r.body, contentType: r.headers.get("content-type"), size: +(r.headers.get("content-length") || 0) };
    },
    async remove(key) {
      await fetch(`${base}/${bucket}/${encodeURI(key)}`, { method: "DELETE", headers: auth });
    },
  };
}

function kvStore(env) {
  return {
    backend: "kv",
    async put(key, body, { contentType } = {}) {
      /* KV جریان می‌پذیرد، پس بایت‌ها از حافظهٔ Worker رد نمی‌شوند و CPU (۱۰ms در
         پلن رایگان) صرف کدگذاری نمی‌شود. */
      await env.FILES.put(key, body, { metadata: { contentType: contentType || "application/octet-stream" } });
      return { key };
    },
    async get(key) {
      const r = await env.FILES.getWithMetadata(key, { type: "stream" });
      if (!r || !r.value) return null;
      return { body: r.value, contentType: (r.metadata && r.metadata.contentType) || "application/octet-stream", size: 0 };
    },
    async remove(key) { await env.FILES.delete(key); },
  };
}

/**
 * کلید فایل: تاریخ + شناسهٔ ارجاع + نام تمیزشده.
 * نام اصلی حفظ می‌شود چون کارشناس با همان نام می‌شناسدش، ولی هر چیزی که
 * می‌تواند مسیر بسازد یا در URL بشکند حذف می‌شود.
 */
export function storageKey(assignmentId, filename) {
  const clean = String(filename || "file")
    .normalize("NFC")
    /* حروف فارسی و لاتین و رقم و نقطه و خط تیره می‌مانند؛ هر چیز دیگری — اسلش،
       بک‌اسلش، فاصله و نویسه‌های کنترلی — زیرخط می‌شود تا نه مسیر بسازد نه در URL بشکند. */
    .replace(RE_UNSAFE, "_")
    .replace(/^_+|_+$/g, "")
    .slice(-80) || "file";
  return `${new Date().toISOString().slice(0, 10)}/${assignmentId || "unassigned"}/${Date.now()}-${clean}`;
}
