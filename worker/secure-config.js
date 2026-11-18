import { HttpError } from "./http.js";
import { normalizeModelBase, modelFetch } from "./model-provider.js";

export const SECURE_DDL = `
CREATE TABLE IF NOT EXISTS secure_configs (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
`;

export const SECRET_FIELDS = [
  ["ELEVENLABS_API_KEY", "کلید ElevenLabs"],
  ["SUPABASE_SERVICE_KEY", "کلید سرویس Supabase"],
  ["TG_BOT_TOKEN", "توکن ربات کارشناسان"],
  ["TG_TEAM_BOT_TOKEN", "توکن ربات تیم"],
  ["TG_SP_BOT_TOKEN", "توکن ربات تأمین‌کنندگان"],
  ["TG_VB_BOT_TOKEN", "توکن ربات ویس"],
  ["TG_WEBHOOK_SECRET", "راز وبهوک تلگرام"],
  ["RELAY_KEY", "کلید پل پیامک"],
  ["IPPANEL_API_KEY", "کلید IPPanel"],
  ["IPPANEL_FROM", "خط فرستندهٔ IPPanel"],
  ["TEXTBEE_API_KEY", "کلید TextBee"],
  ["TEXTBEE_DEVICE_ID", "شناسهٔ دستگاه TextBee"],
];
const ALLOWED = new Set(SECRET_FIELDS.map(([key]) => key));
const EMPTY = () => ({ version: 1, secrets: {}, providers: [], active_provider: "", eleven: { base_url: "", model: "" } });
const CACHE = new WeakMap();
const T = (value) => String(value == null ? "" : value).trim();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const bytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const hex = (bytes0) => [...new Uint8Array(bytes0)].map((x) => x.toString(16).padStart(2, "0")).join("");
const id0 = () => hex(crypto.getRandomValues(new Uint8Array(8)));

function masterBytes(env) {
  const value = T(env.CONFIG_ENCRYPTION_KEY);
  if (/^[0-9a-f]{64}$/i.test(value)) return Uint8Array.from(value.match(/.{2}/g), (x) => parseInt(x, 16));
  try { const raw = bytes(value); if (raw.length === 32) return raw; } catch (_) { /* تنظیم نامعتبر */ }
  return null;
}
async function cryptoKey(env) {
  const raw = masterBytes(env);
  if (!raw) throw new HttpError("کلید اصلی رمزنگاری روی سرور تنظیم نشده است.", 503, { code: "encryption_key" });
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(env), new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: b64(iv), data: b64(data) });
}
async function open(env, value) {
  const packed = JSON.parse(value);
  if (packed.v !== 1) throw new Error("Secure config version is not supported");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(packed.iv) }, await cryptoKey(env), bytes(packed.data));
  return JSON.parse(new TextDecoder().decode(clear));
}

async function readConfig(env, fresh = false) {
  if (!env.DB) return EMPTY();
  const cached = CACHE.get(env);
  if (!fresh && cached && Date.now() - cached.at < 5000) return cached.value;
  const row = await env.DB.prepare("SELECT value FROM secure_configs WHERE key='runtime'").first().catch((error) => {
    if (/no such table/i.test(String(error && error.message))) return null;
    throw error;
  });
  const value = row ? await open(env, row.value) : EMPTY();
  value.secrets = value.secrets && typeof value.secrets === "object" ? value.secrets : {};
  value.providers = Array.isArray(value.providers) ? value.providers : [];
  value.eleven = { base_url: "", model: "", ...(value.eleven || {}) };
  CACHE.set(env, { at: Date.now(), value });
  return value;
}
export function resetSecureConfig(env) { CACHE.delete(env); }

function validBase(value, label) {
  const base = T(value).replace(/\/+$/, "");
  if (!base) return "";
  let url;
  try { url = new URL(base); } catch (_) { throw new HttpError(`${label} معتبر نیست.`, 400); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new HttpError(`${label} باید HTTPS باشد.`, 400);
  if (url.username || url.password) throw new HttpError(`${label} نباید رمز در نشانی داشته باشد.`, 400);
  return base;
}

export async function withSecureConfig(env) {
  try {
    const config = await readConfig(env);
    const out = { ...env, ...config.secrets };
    if (config.eleven.base_url) out.ELEVENLABS_API_BASE = config.eleven.base_url;
    if (config.eleven.model) { out.ELEVENLABS_STT_MODEL = config.eleven.model; out.STT_MODEL = config.eleven.model; }
    const active = config.providers.find((provider) => provider.id === config.active_provider);
    if (active) {
      out.AI_CUSTOM_PROVIDER = "1";
      if (active.api_key) out.ANTHROPIC_API_KEY = active.api_key;
      out.ANTHROPIC_API_BASE = normalizeModelBase(active.base_url) || "https://api.anthropic.com";
      if (active.model) { out.AI_MODEL = active.model; out.LEGAL_MODEL = active.model; }
    }
    return out;
  } catch (error) {
    console.error("secure config unavailable", error && error.message);
    return env;
  }
}

export async function secureOverview(env) {
  const config = await readConfig(env);
  return {
    encryption_ready: !!masterBytes(env),
    secrets: SECRET_FIELDS.map(([key, label]) => ({
      key, label,
      configured: !!(config.secrets[key] || env[key]),
      source: config.secrets[key] ? "panel" : env[key] ? "environment" : null,
    })),
    providers: config.providers.map((provider) => ({
      id: provider.id, label: provider.label, base_url: provider.base_url || "", model: provider.model || "",
      key_configured: !!provider.api_key, active: provider.id === config.active_provider,
    })),
    eleven: { base_url: config.eleven.base_url || "", model: config.eleven.model || "" },
  };
}

export async function saveSecureConfigVerified(env, body) {
  await cryptoKey(env);
  const config = await readConfig(env, true);
  const secrets = body.secrets && typeof body.secrets === "object" ? body.secrets : {};
  for (const [key, value0] of Object.entries(secrets)) {
    if (!ALLOWED.has(key)) continue;
    const value = T(value0);
    if (value) config.secrets[key] = value.slice(0, 10000);
  }
  for (const key of Array.isArray(body.clear) ? body.clear : []) if (ALLOWED.has(key)) delete config.secrets[key];

  const previous = new Map(config.providers.map((provider) => [provider.id, provider]));
  config.providers = (Array.isArray(body.providers) ? body.providers : []).slice(0, 20).map((input) => {
    const id = T(input.id) || id0();
    const old = previous.get(id) || {};
    return {
      id,
      label: T(input.label).slice(0, 80) || "سرویس‌دهنده",
      base_url: validBase(input.base_url, "نشانی سرویس‌دهنده"),
      model: T(input.model).slice(0, 160),
      api_key: T(input.api_key) ? T(input.api_key).slice(0, 10000) : old.api_key || "",
    };
  });
  const wanted = T(body.active_provider);
  config.active_provider = config.providers.some((provider) => provider.id === wanted) ? wanted : (config.providers[0] && config.providers[0].id) || "";
  config.eleven = {
    base_url: validBase(body.eleven && body.eleven.base_url, "نشانی ElevenLabs"),
    model: T(body.eleven && body.eleven.model).slice(0, 160),
  };
  const value = await seal(env, config);
  await env.DB.prepare("INSERT INTO secure_configs(key,value,updated_at) VALUES('runtime',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(value, Date.now()).run();
  resetSecureConfig(env);
  return secureOverview(env);
}

export async function testSecureService(env, kind) {
  const clean = (value) => {
    let text = String(value || "").slice(0, 300);
    for (const key of ["ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "SUPABASE_SERVICE_KEY", "TG_BOT_TOKEN", "TG_TEAM_BOT_TOKEN", "TG_SP_BOT_TOKEN", "TG_VB_BOT_TOKEN"]) {
      if (env[key]) text = text.replaceAll(env[key], "[hidden]");
    }
    return text;
  };
  const request = async (url, init, useModel = false) => {
    const options = { ...init, signal: AbortSignal.timeout(25000) };
    const response = await (useModel ? modelFetch(env, url, options) : fetch(url, options));
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${clean(text)}`);
    return text ? JSON.parse(text) : {};
  };
  try {
    if (kind === "ai") {
      if (!env.ANTHROPIC_API_KEY) return { ok: false, error: "کلید مدل تنظیم نشده است." };
      const base = T(env.ANTHROPIC_API_BASE).replace(/\/+$/, "") || "https://api.anthropic.com";
      await request(`${base}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: T(env.AI_MODEL) || "claude-sonnet-5", max_tokens: 1, messages: [{ role: "user", content: "OK" }] }),
      }, true);
      return { ok: true, message: "اتصال و پاسخ مدل فعال موفق است." };
    }
    if (kind === "eleven") {
      if (!env.ELEVENLABS_API_KEY) return { ok: false, error: "کلید ElevenLabs تنظیم نشده است." };
      const base = T(env.ELEVENLABS_API_BASE).replace(/\/+$/, "") || "https://api.elevenlabs.io";
      await request(`${base}/v1/models`, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
      return { ok: true, message: "کلید ElevenLabs معتبر و دسترسی مدل‌ها برقرار است." };
    }
    if (kind === "supabase") {
      if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return { ok: false, error: "نشانی یا کلید Supabase کامل نیست." };
      const bucket = encodeURIComponent(T(env.SUPABASE_BUCKET) || "proformas");
      await request(`${T(env.SUPABASE_URL).replace(/\/+$/, "")}/storage/v1/bucket/${bucket}`, {
        headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, apikey: env.SUPABASE_SERVICE_KEY },
      });
      return { ok: true, message: "اتصال Supabase و دسترسی به Bucket موفق است." };
    }
    if (kind === "telegram") {
      const bots = [["TG_BOT_TOKEN", "کارشناسان"], ["TG_TEAM_BOT_TOKEN", "تیم"], ["TG_SP_BOT_TOKEN", "تأمین‌کنندگان"], ["TG_VB_BOT_TOKEN", "ویس"]].filter(([key]) => env[key]);
      if (!bots.length) return { ok: false, error: "هیچ توکن ربات تلگرامی تنظیم نشده است." };
      const results = [];
      for (const [key, label] of bots) {
        const data = await request(`https://api.telegram.org/bot${env[key]}/getMe`);
        results.push(`${label}: @${data.result && data.result.username ? data.result.username : "متصل"}`);
      }
      return { ok: true, message: results.join(" · ") };
    }
    return { ok: false, error: "سرویس تست ناشناخته است." };
  } catch (error) {
    return { ok: false, error: clean(error && error.message ? error.message : error) };
  }
}
