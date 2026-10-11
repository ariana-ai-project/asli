/* ============================================================
   اعلانِ گوشی و مرورگر (Web Push) برای کارشناس، مدیر و پشتیبان — مهر ۱۴۰۵، درخواستِ مالک

   • هر مرورگر/گوشی یک «اشتراک» دارد (endpoint + دو کلید) که پنل بعد از اجازهٔ کاربر می‌فرستد؛
     با نقش و شناسهٔ همان کاربر ذخیره می‌شود (push_subs). آیفون فقط وقتی پنل «Add to Home Screen»
     شده باشد اشتراک می‌دهد (iOS 16.4+)؛ کروم/اج/فایرفاکسِ کامپیوتر و اندروید همیشه.
   • هر اعلانی که سامانه برای یک نفر می‌فرستد (تلگرام، هشدار پنل، …) با pushTo به همهٔ دستگاه‌های
     همان نفر هم می‌رود. پیام با RFC 8291 (aes128gcm) رمز می‌شود و درخواست با VAPID (RFC 8292، ES256)
     امضا — همه با WebCrypto خودِ Worker، بی کتابخانه.
   • کلیدهای VAPID: اگر VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY (رازِ Worker) ست باشند همان‌ها، وگرنه
     یک بار ساخته و در settings (key='vapid') نگه داشته می‌شوند — فعال شدن به هیچ کار دستی نیاز ندارد.
     عوض کردنِ کلید همهٔ اشتراک‌های قبلی را بی‌اثر می‌کند (مرورگرها باید دوباره اشتراک بگیرند).
   • endpointِ نامعتبر (۴۰۴/۴۱۰ از سرویس push) پاک می‌شود. فقط سرویس‌های push شناخته‌شده پذیرفته
     می‌شوند تا Worker به نشانیِ دلخواه درخواست نفرستد.
   ============================================================ */
import { HttpError } from "./http.js";
import { nextWorkMoment, inWorkHours } from "./time.js";

export const PUSH_DDL = `
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, role TEXT NOT NULL, uid INTEGER NOT NULL DEFAULT 0, p256dh TEXT NOT NULL, auth TEXT NOT NULL, ua TEXT, created_at INTEGER NOT NULL, ok_at INTEGER, fails INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS push_subs_who ON push_subs(role, uid);
CREATE TABLE IF NOT EXISTS push_out (idem TEXT PRIMARY KEY, role TEXT NOT NULL, uid INTEGER NOT NULL DEFAULT 0, payload_json TEXT NOT NULL, next_at INTEGER NOT NULL, created_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS push_out_next ON push_out(next_at);
`;

export const ROLES = ["expert", "manager", "support"];
/* گیرنده‌ها: کارشناس با شناسه؛ مدیر و پشتیبان یک نقشِ مشترک‌اند (یک کد/رمز) — همهٔ دستگاه‌هایشان */
export const MANAGER = { role: "manager", uid: 0 };
export const SUPPORT = { role: "support", uid: 0 };
export const EXPERT = (id) => ({ role: "expert", uid: Number(id) || 0 });
/* همان siteOriginِ sp-core.js — بی ایمپورت تا حلقه نسازد (push.js را همه ایمپورت می‌کنند) */
const siteOrigin = (env) => String((env && env.SITE_ORIGIN) || "").trim() || "https://arianaai.website";
const enc = new TextEncoder();
const now = () => Date.now();

/* ---------- base64url ---------- */
export const b64u = (buf) => {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = (s) => {
  const t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

/* ---------- کلیدهای VAPID ---------- */
let VAPID = null;   /* {pub (base64url، ۶۵ بایت)، key (CryptoKey امضا)} در حافظهٔ isolate */
const jwkOf = (pubRaw, d) => ({ kty: "EC", crv: "P-256", x: b64u(pubRaw.slice(1, 33)), y: b64u(pubRaw.slice(33, 65)), d, ext: true });
async function importVapid(pub, d) {
  const key = await crypto.subtle.importKey("jwk", jwkOf(unb64u(pub), d), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return { pub, key };
}
/** کلید عمومی (برای applicationServerKey مرورگر) و کلیدِ امضا */
export async function vapidKeys(env) {
  if (VAPID) return VAPID;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return (VAPID = await importVapid(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY));
  const read = async () => { const r = await env.DB.prepare("SELECT value FROM settings WHERE key='vapid'").first(); return r ? JSON.parse(r.value) : null; };
  let v = await read();
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
    /* دو isolate هم‌زمان: اولی می‌نویسد، دومی همان را می‌خواند */
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('vapid', ?, ?) ON CONFLICT(key) DO NOTHING").bind(JSON.stringify({ pub: b64u(pub), d: jwk.d, at: now() }), now()).run();
    v = await read();
  }
  return (VAPID = await importVapid(v.pub, v.d));
}
export const resetVapidCache = () => { VAPID = null; JWT.clear(); };

/* ---------- امضای VAPID (JWT با ES256) — برای هر سرویس push دوازده ساعت ---------- */
const JWT = new Map();   /* aud → {exp, jwt} */
async function vapidHeader(env, endpoint) {
  const v = await vapidKeys(env);
  const aud = new URL(endpoint).origin;
  const hit = JWT.get(aud), t = Math.floor(now() / 1000);
  if (hit && hit.exp - t > 3600) return `vapid t=${hit.jwt}, k=${v.pub}`;
  const exp = t + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: siteOrigin(env) })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, v.key, enc.encode(`${head}.${body}`)));
  const jwt = `${head}.${body}.${b64u(sig)}`;
  JWT.set(aud, { exp, jwt });
  return `vapid t=${jwt}, k=${v.pub}`;
}

/* ---------- رمز کردنِ پیام: RFC 8291 روی RFC 8188 (aes128gcm)، یک رکورد ---------- */
const hkdf = async (salt, ikm, info, bytes) => {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
};
/**
 * plaintext (Uint8Array) برای اشتراکِ {p256dh, auth} ← بدنهٔ درخواست.
 * opts.as ({publicKey, privateKey}) و opts.salt فقط برای تستِ بردارهای ثابت.
 */
export async function encryptPayload(plaintext, p256dh, auth, opts = {}) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  if (ua.length !== 65 || secret.length !== 16) throw new Error("کلیدهای اشتراک نامعتبر است.");
  const as = opts.as || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(secret, shared, cat(enc.encode("WebPush: info\0"), ua, asPub), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  /* تک‌رکورد: متن + جداکنندهٔ «رکوردِ آخر» (۰x۰۲)، بی لایه‌گذاری */
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

/* ---------- سرویس‌های push شناخته‌شده ---------- */
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.microsoft\.com$/];
export function validEndpoint(endpoint) {
  let u; try { u = new URL(String(endpoint || "")); } catch (_) { return false; }
  return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname)) && String(endpoint).length <= 1000;
}

/* ---------- ثبت و حذفِ اشتراک ---------- */
/** sub: خروجیِ PushSubscription.toJSON() — {endpoint, keys: {p256dh, auth}} */
export async function pushSubscribe(env, role, uid, sub, ua) {
  if (!ROLES.includes(role)) throw new HttpError("نقش نامعتبر است.");
  const endpoint = sub && sub.endpoint, k = (sub && sub.keys) || {};
  if (!validEndpoint(endpoint)) throw new HttpError("نشانیِ اشتراکِ اعلان پذیرفته نیست.");
  try { if (unb64u(k.p256dh).length !== 65 || unb64u(k.auth).length !== 16) throw 0; } catch (_) { throw new HttpError("کلیدهای اشتراکِ اعلان نامعتبر است."); }
  /* همان دستگاه با کاربرِ دیگر (خروج و ورود) ← اشتراک به کاربرِ تازه می‌رسد */
  await env.DB.prepare(`INSERT INTO push_subs (endpoint, role, uid, p256dh, auth, ua, created_at, fails) VALUES (?,?,?,?,?,?,?,0)
      ON CONFLICT(endpoint) DO UPDATE SET role=excluded.role, uid=excluded.uid, p256dh=excluded.p256dh, auth=excluded.auth, ua=excluded.ua, fails=0`)
    .bind(endpoint, role, Number(uid) || 0, k.p256dh, k.auth, String(ua || "").slice(0, 160), now()).run();
  return { ok: true };
}
export async function pushUnsubscribe(env, endpoint) {
  if (!endpoint) return { ok: true };
  await env.DB.prepare("DELETE FROM push_subs WHERE endpoint=?").bind(String(endpoint)).run();
  return { ok: true };
}

/* ---------- فرستادن ---------- */
/** یک اشتراک: {status} — ۴۰۴/۴۱۰ یعنی اشتراک دیگر نیست */
export async function sendOne(env, sub, msg, opts = {}) {
  const body = await encryptPayload(enc.encode(JSON.stringify(msg)), sub.p256dh, sub.auth);
  const headers = { "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: String(opts.ttl ?? 12 * 3600),
    Urgency: opts.urgency || "high", Authorization: await vapidHeader(env, sub.endpoint) };
  /* Topic: اعلانِ هم‌موضوعِ نرسیده جای قبلی را می‌گیرد (حداکثر ۳۲ نویسهٔ base64url) */
  if (opts.topic) headers.Topic = String(opts.topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
  const r = await (opts.fetch || fetch)(sub.endpoint, { method: "POST", headers, body });
  return { status: r.status };
}

/**
 * اعلان به همهٔ دستگاه‌های یک یا چند نفر.
 * who: {role, uid} یا آرایه‌ای از آن (uid برای مدیر و پشتیبان ۰).
 * msg: {title, body, url (نسبت به /tamin-poshtibani/ یا کامل)، tag (اعلانِ هم‌برچسب جای قبلی را می‌گیرد)}
 * هرگز خطا نمی‌دهد: اعلانِ گوشی هیچ وقت نباید کارِ اصلی را خراب کند.
 */
export async function pushTo(env, who, msg, opts = {}) {
  try {
    const list = (Array.isArray(who) ? who : [who]).filter((w) => w && ROLES.includes(w.role));
    if (!list.length || !env.DB) return { sent: 0 };
    const cond = list.map(() => "(role=? AND uid=?)").join(" OR ");
    const subs = (await env.DB.prepare(`SELECT endpoint, role, uid, p256dh, auth, created_at FROM push_subs WHERE ${cond} LIMIT 40`)
      .bind(...list.flatMap((w) => [w.role, Number(w.uid) || 0])).all().catch(() => ({ results: [] }))).results || [];
    if (!subs.length) return { sent: 0 };
    const payload = {
      t: String(msg.title || "تدارکات آریانا").slice(0, 120),
      b: String(msg.body || "").slice(0, 400),
      u: String(msg.url || "./"),
      g: msg.tag ? String(msg.tag).slice(0, 64) : "",
    };
    const res = await Promise.allSettled(subs.map((s) => sendOne(env, s, payload, { topic: opts.topic || msg.tag, urgency: opts.urgency, ttl: opts.ttl, fetch: opts.fetch })));
    const gone = [], failed = [];
    let sent = 0;
    res.forEach((r, i) => {
      const st = r.status === "fulfilled" ? r.value.status : 0;
      if (st >= 200 && st < 300) sent++;
      /* ۴۰۴/۴۱۰ یعنی اشتراک دیگر نیست — جز در ده دقیقهٔ اول (سرویس push گاهی اشتراکِ تازه را چند لحظه نمی‌شناسد) */
      else if ((st === 404 || st === 410) && now() - (subs[i].created_at || 0) > 10 * 60000) gone.push(subs[i].endpoint);
      else { failed.push(subs[i].endpoint); console.warn("push", st || (r.reason && r.reason.message), new URL(subs[i].endpoint).hostname); }
    });
    const w = [];
    if (gone.length) w.push(env.DB.prepare(`DELETE FROM push_subs WHERE endpoint IN (${gone.map(() => "?").join(",")})`).bind(...gone));
    /* بیستمین شکستِ پیاپی ← اشتراکِ مرده */
    if (failed.length) w.push(env.DB.prepare(`UPDATE push_subs SET fails=fails+1 WHERE endpoint IN (${failed.map(() => "?").join(",")})`).bind(...failed),
      env.DB.prepare("DELETE FROM push_subs WHERE fails>=20"));
    if (w.length) await env.DB.batch(w).catch(() => {});
    return { sent, gone: gone.length, failed: failed.length, total: subs.length };
  } catch (e) {
    console.warn("pushTo", e && e.message);
    return { sent: 0, error: e && e.message };
  }
}

/** بی‌انتظار: با ctx.waitUntil اگر هست، وگرنه همان‌جا (نتیجه مهم نیست) */
export function pushLater(env, ctx, who, msg, opts) {
  const p = pushTo(env, who, msg, opts);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(p);
  return p;
}

/* ---------- صفِ اعلان (کنارِ صفِ تلگرام: worker/queue.js) ----------
   رویدادهایی که پیامِ تلگرامشان به صف می‌رود (ارجاع، مهلت، تصمیم، کمیسیون، هشدار…) اعلانِ گوشی را هم در همان
   batch به push_out می‌گذارند — فقط اگر گیرنده دست‌کم یک اشتراک دارد (بی اشتراک، هیچ نوشتنی). مستقل از تلگرام:
   کارشناسی که تلگرام وصل نکرده هم اعلان می‌گیرد. idem همان کلیدِ رویداد است (تکرار ← یکی). */
/** who: {role, uid}؛ msg: {title, body, url, tag} — statement برای batchِ صدازننده */
export function pushStmt(env, idem, who, msg) {
  const t = now(), role = who && who.role, uid = Number(who && who.uid) || 0;
  return env.DB.prepare(`INSERT INTO push_out (idem, role, uid, payload_json, next_at, created_at)
      SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM push_subs WHERE role=? AND uid=?) ON CONFLICT(idem) DO NOTHING`)
    .bind(`p:${idem}`, role, uid, JSON.stringify({ title: msg.title, body: msg.body || "", url: msg.url || "", tag: msg.tag || "" }), t, t, role, uid);
}
/**
 * صف را می‌فرستد. مثل صفِ تلگرام بیرون از ساعت اداری عقب می‌افتد (۷:۳۰ اولین روز کاری).
 * سقفِ کم چون هر ارسال یک زیردرخواست است (پلن رایگان ۵۰ در هر اجرا)؛ Cron هر دقیقه ادامه می‌دهد.
 * اعلان بهترین‌کوشش است: ردیف بعد از یک بار تلاش پاک می‌شود (اشتراکِ مرده را pushTo خودش پاک می‌کند).
 */
export async function drainPush(env, limit = 8) {
  try {
    const t = now();
    if (!env.TG_IGNORE_HOURS && !inWorkHours(t)) {
      const at = nextWorkMoment(t);
      await env.DB.prepare("UPDATE push_out SET next_at=? WHERE next_at<?").bind(at, at).run();
      return { pushed: 0 };
    }
    const rows = (await env.DB.prepare("SELECT idem, role, uid, payload_json FROM push_out WHERE next_at<=? ORDER BY next_at LIMIT ?").bind(t, limit).all()).results || [];
    if (!rows.length) return { pushed: 0 };
    let pushed = 0;
    for (const r of rows) {
      let m = {}; try { m = JSON.parse(r.payload_json); } catch (_) { /* ردیفِ خراب فقط پاک می‌شود */ }
      if (m.title) pushed += (await pushTo(env, { role: r.role, uid: r.uid }, m)).sent || 0;
    }
    await env.DB.prepare(`DELETE FROM push_out WHERE idem IN (${rows.map(() => "?").join(",")})`).bind(...rows.map((r) => r.idem)).run();
    return { pushed, rows: rows.length };
  } catch (e) {
    console.warn("drainPush", e && e.message);
    return { pushed: 0, error: e && e.message };
  }
}