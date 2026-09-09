/**
 * خودآزمون سرویس‌های بیرونی
 *
 * چهار سرویس بیرونی در مسیر کار کارشناس هستند و اگر هرکدام از کار بیفتد،
 * خطایش وسط یک گفت‌وگوی تلگرامی ظاهر می‌شود — دیر و در بدترین جا.
 * این مسیر همان چهار را از داخل خودِ Worker می‌سنجد، با همان کلیدها و همان
 * مسیر شبکه‌ای که در کار واقعی طی می‌شود. نه شبیه‌سازی، نه از بیرون.
 *
 * هر بررسی زمان پاسخ را هم برمی‌گرداند تا کندی را قبل از قطعی ببینیم.
 */
import { telegram } from "./telegram.js";
import { storage } from "./storage.js";

const ms = (t0) => Math.round(Date.now() - t0);

/** یک WAV کوتاه و معتبر می‌سازد — کوچک‌ترین ورودیِ قابل قبول برای سرویس تبدیل صوت */
function tinyWav(seconds = 0.4, rate = 16000) {
  const n = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const put = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  put(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); put(8, "WAVEfmt ");
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  put(36, "data"); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.round(2500 * Math.sin(i / 10)), true);
  return new Uint8Array(buf);
}

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: ms(t0), ...(detail || {}) };
  } catch (e) {
    return { name, ok: false, ms: ms(t0), error: String(e && e.message ? e.message : e).slice(0, 300) };
  }
}

export async function selfTest(env) {
  const store = storage(env);

  const checks = await Promise.all([
    check("تلگرام", async () => {
      if (!env.TG_BOT_TOKEN) throw new Error("TG_BOT_TOKEN ست نشده است.");
      const api = telegram(env);
      const me = await api.getMe();
      const wh = await api.getWebhookInfo();
      if (!wh.url) throw new Error("وبهوک ثبت نشده است — /tg/setup را بزنید.");
      return { bot: me.username, webhook: wh.url, pending: wh.pending_update_count, lastError: wh.last_error_message || null };
    }),

    check("انبار فایل (Supabase)", async () => {
      if (!store) throw new Error("انبار فایل پیکربندی نشده است.");
      if (!store.signedUrl) throw new Error("این انبار لینک امضاشده نمی‌سازد.");
      const key = `_selftest/${Date.now()}.bin`;
      const body = new TextEncoder().encode("selftest");
      /* نوع عمومی، چون فهرست نوع‌های مجازِ سطل عمداً تنگ است */
      await store.put(key, body, { contentType: "application/octet-stream", size: body.length });
      const got = await store.get(key);
      if (!got) throw new Error("فایل نوشته شد ولی خوانده نشد.");
      const back = await new Response(got.body).text();
      if (back !== "selftest") throw new Error("محتوای برگشتی با نوشته‌شده یکی نیست.");
      const url = await store.signedUrl(key, 120);
      await store.remove(key);
      return { backend: store.backend, signed: url.includes("token=") || url.includes("?") };
    }),

    check("قالب سربرگ نامه", async () => {
      if (!store) throw new Error("انبار فایل پیکربندی نشده است.");
      const f = await store.get("_templates/letterhead.docx");
      if (!f) throw new Error("سربرگ در انبار نیست — فایل را در _templates/letterhead.docx بگذارید.");
      const bytes = new Uint8Array(await new Response(f.body).arrayBuffer());
      if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("فایل سربرگ docx معتبر نیست.");
      return { size: bytes.length };
    }),

    check("تبدیل صوت به متن (ElevenLabs)", async () => {
      if (!env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY ست نشده است.");
      const form = new FormData();
      form.append("model_id", env.STT_MODEL || "scribe_v2");
      form.append("language_code", "fa");
      form.append("file", new Blob([tinyWav()], { type: "audio/wav" }), "probe.wav");
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(d.detail || d).slice(0, 200)}`);
      return { model: env.STT_MODEL || "scribe_v2", language: d.language_code };
    }),

    check("مدل زبانی (Anthropic)", async () => {
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY ست نشده است.");
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: env.AI_MODEL || "claude-sonnet-5", max_tokens: 64, messages: [{ role: "user", content: "فقط این یک کلمه را بنویس: سالم" }] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status}: ${String(d.error && d.error.message).slice(0, 200)}`);
      /* مدل اول یک بلوک «تفکر» می‌فرستد؛ با سقف کم، پیش از رسیدن به متن قطع می‌شود */
      const reply = (d.content || []).map((c) => c.text || "").join("").trim();
      /* پاسخ خالی یعنی کلید کار می‌کند ولی مدل چیزی نداد — این را نباید «سالم» شمرد */
      if (!reply) throw new Error("مدل پاسخ خالی داد.");
      return { model: d.model, reply: reply.slice(0, 30) };
    }),

    check("دیتابیس (D1)", async () => {
      const row = await env.DB.prepare(
        `SELECT (SELECT COUNT(*) FROM experts WHERE active=1) AS experts,
                (SELECT COUNT(*) FROM requests) AS requests,
                (SELECT COUNT(*) FROM experts WHERE telegram_chat IS NOT NULL) AS connected,
                (SELECT COUNT(*) FROM outbox WHERE status='pending') AS queued,
                (SELECT COUNT(*) FROM outbox WHERE status='dead') AS dead`,
      ).first();
      return row;
    }),
  ]);

  const bad = checks.filter((c) => !c.ok);
  return { ok: bad.length === 0, failed: bad.length, checks };
}
