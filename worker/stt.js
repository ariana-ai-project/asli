/**
 * پیاده کردنِ پیامِ صوتیِ تأمین‌کننده به متن — ElevenLabs Speech-to-Text (مهر ۱۴۰۵)
 *
 * POST https://api.elevenlabs.io/v1/speech-to-text — هدر xi-api-key، فرم چندبخشی: model_id (scribe_v2)، file،
 * language_code «fa». پاسخ: { text, language_code, audio_duration_secs, … }. کلید فقط در راز ELEVENLABS_API_KEY
 * (wrangler secret) است. متنِ پیاده‌شده برای کارشناس و کارشناس هوشمند است؛ تأمین‌کننده فقط صدای خودش را می‌بیند.
 *
 * هرگز پرتاب نمی‌کند: پیامِ صوتی حتی اگر پیاده نشد ذخیره می‌شود و کارشناس صدا را می‌شنود؛ { ok:false, error } برمی‌گردد.
 */
const T = (v) => String(v == null ? "" : v).trim();

export const sttReady = (env) => !!(env && env.ELEVENLABS_API_KEY);

/** پسوندِ نامِ فایل از نوعِ صدا — ElevenLabs بیشترِ قالب‌ها را می‌پذیرد، نام فقط برای تشخیصِ بهترِ قالب است */
export function audioExt(mime) {
  const m = T(mime).toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "audio";
}

export async function transcribe(env, bytes, mime) {
  if (!sttReady(env)) return { ok: false, error: "تبدیل صدا به متن هنوز روی سامانه وصل نیست (ELEVENLABS_API_KEY)." };
  try {
    const fd = new FormData();
    fd.append("model_id", T(env.ELEVENLABS_STT_MODEL) || "scribe_v2");
    fd.append("language_code", T(env.ELEVENLABS_STT_LANG) || "fa");
    fd.append("tag_audio_events", "false");
    fd.append("file", new Blob([bytes], { type: mime || "application/octet-stream" }), `voice.${audioExt(mime)}`);
    const base = T(env.ELEVENLABS_API_BASE) || "https://api.elevenlabs.io";
    const r = await fetch(`${base.replace(/\/+$/, "")}/v1/speech-to-text`, {
      method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: fd,
      ...(typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(45000) } : {}),
    });
    const txt = await r.text();
    let d = null;
    try { d = txt ? JSON.parse(txt) : null; } catch (_) { d = null; }
    if (!r.ok) {
      const why = d && d.detail ? (typeof d.detail === "string" ? d.detail : d.detail.message || d.detail.status || JSON.stringify(d.detail)) : txt.slice(0, 160);
      return { ok: false, error: `ElevenLabs ${r.status}: ${T(why).slice(0, 160)}` };
    }
    const text = T(d && (d.text || (Array.isArray(d.transcripts) ? d.transcripts.map((x) => x.text).join(" ") : "")));
    if (!text) return { ok: false, error: "در صدا گفتاری شنیده نشد." };
    return { ok: true, text, lang: (d && d.language_code) || null, dur: d && d.audio_duration_secs ? Math.round(d.audio_duration_secs) : null };
  } catch (e) {
    return { ok: false, error: `تبدیل صدا به متن نشد: ${T(e && e.message).slice(0, 160)}` };
  }
}
