/**
 * ورود از مینی‌اپ تلگرام — مشترکِ پنل کارشناس (بات کارشناسان) و صفحه‌های پنل تأمین‌کننده (بات مکاتبات).
 *
 * initData را تلگرام با توکنِ همان باتی امضا می‌کند که مینی‌اپ را باز کرده: HMAC-SHA256 با کلیدِ
 * HMAC_SHA256("WebAppData", توکن) روی همهٔ فیلدها (مرتب، key=value، با \n) جز hash. نسخه‌های تازهٔ تلگرام
 * فیلد signature هم دارند؛ اگر با آن نشد، بی آن هم سنجیده می‌شود — هر دو با همان توکن امضا شده‌اند.
 * کهنه‌تر از یک روز پذیرفته نمی‌شود.
 */
const int = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function verifyInitData(token, initData, maxAgeSec = 24 * 3600) {
  if (!token || !initData) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get("hash");
  if (!hash) return null;
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ok = async (skip) => {
    const s = [...p.entries()].filter(([k]) => !skip.includes(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("\n");
    return hex(await crypto.subtle.sign("HMAC", k2, enc.encode(s))) === hash;
  };
  if (!(await ok(["hash"])) && !(await ok(["hash", "signature"]))) return null;
  const auth = int(p.get("auth_date"));
  if (!auth || Date.now() / 1000 - auth > maxAgeSec) return null;
  try { const u = JSON.parse(p.get("user") || "null"); return u && u.id ? u : null; } catch (_) { return null; }
}

/** initData ← {bot: "sp" | "main", user} — از کدام بات آمده، با توکنِ همان */
export async function tgIdentity(env, initData) {
  const sp = env.TG_SP_BOT_TOKEN ? await verifyInitData(env.TG_SP_BOT_TOKEN, initData) : null;
  if (sp) return { bot: "sp", user: sp };
  const main = env.TG_BOT_TOKEN ? await verifyInitData(env.TG_BOT_TOKEN, initData) : null;
  if (main) return { bot: "main", user: main };
  return null;
}

/**
 * کارشناسِ پشتِ initData: در بات کارشناسان همان کسی که گفت‌وگویش به حسابش گره خورده (experts.telegram_chat)؛
 * در بات مکاتبات هویتِ کارشناسیِ همان گفت‌وگو (sp_tg.expert_id). null اگر کارشناس نیست.
 */
export async function expertOfInit(env, initData) {
  const id = await tgIdentity(env, initData);
  if (!id) return null;
  if (id.bot === "main") {
    return env.DB.prepare("SELECT * FROM experts WHERE telegram_chat=? AND active=1").bind(String(id.user.id)).first();
  }
  const row = await env.DB.prepare("SELECT expert_id FROM sp_tg WHERE chat=?").bind(String(id.user.id)).first();
  return row && row.expert_id ? env.DB.prepare("SELECT * FROM experts WHERE id=? AND active=1").bind(row.expert_id).first() : null;
}
