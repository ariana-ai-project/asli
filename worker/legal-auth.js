import { HttpError } from "./http.js";

export const LEGAL_AUTH_DDL = `
CREATE TABLE IF NOT EXISTS legal_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login INTEGER);
CREATE TABLE IF NOT EXISTS legal_sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_legal_session_user ON legal_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_legal_session_exp ON legal_sessions(expires_at);
CREATE TABLE IF NOT EXISTS legal_auth_guard (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
`;
const READY = new WeakSet();
const ITERATIONS = 120000;
const SESSION_TTL = 7 * 86400000;
const LOCK_MS = 15 * 60000;
const MAX_FAILS = 5;
const T = (value) => String(value == null ? "" : value).trim();
const hex = (buffer) => [...new Uint8Array(buffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const sha256 = async (value) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const usernameOf = (value) => T(value).toLowerCase();
const publicUser = (row) => ({ id: row.id, username: row.username, active: !!row.active, created_at: row.created_at, updated_at: row.updated_at, last_login: row.last_login || null });

export async function ensureLegalAuth(env) {
  if (READY.has(env.DB)) return;
  await env.DB.exec(LEGAL_AUTH_DDL);
  READY.add(env.DB);
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: ITERATIONS }, key, 256));
}
function validUsername(value) {
  const username = usernameOf(value);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new HttpError("نام کاربری باید ۳ تا ۴۰ نویسهٔ لاتین، رقم، نقطه، خط تیره یا زیرخط باشد.", 400);
  return username;
}
function validPassword(value, required = true) {
  const password = String(value == null ? "" : value);
  if (!password && !required) return "";
  if (password.length < 8 || password.length > 200) throw new HttpError("رمز کاربر حقوقی باید دست‌کم ۸ نویسه باشد.", 400);
  return password;
}
function same(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function cookies(request) {
  const out = {};
  for (const part of String(request.headers.get("Cookie") || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}
function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `legal_session=${token}; Path=/hoghooghi; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function listLegalUsers(env) {
  await ensureLegalAuth(env);
  return (await env.DB.prepare("SELECT * FROM legal_users ORDER BY username").all()).results.map(publicUser);
}
export async function saveLegalUser(env, body) {
  await ensureLegalAuth(env);
  const id = Number(body.id) || 0;
  const username = validUsername(body.username);
  const password = validPassword(body.password, !id);
  const active = body.active === false || body.active === 0 ? 0 : 1;
  const at = Date.now();
  if (id) {
    const old = await env.DB.prepare("SELECT * FROM legal_users WHERE id=?").bind(id).first();
    if (!old) throw new HttpError("کاربر حقوقی پیدا نشد.", 404);
    if (!active && old.active) {
      const others = await env.DB.prepare("SELECT COUNT(*) AS n FROM legal_users WHERE active=1 AND id<>?").bind(id).first();
      if (!others.n) throw new HttpError("دست‌کم یک کاربر فعال حقوقی باید بماند.", 409);
    }
    const salt = password ? hex(crypto.getRandomValues(new Uint8Array(16))) : old.salt;
    const hash = password ? await passwordHash(password, salt) : old.password_hash;
    await env.DB.prepare("UPDATE legal_users SET username=?,salt=?,password_hash=?,active=?,updated_at=? WHERE id=?")
      .bind(username, salt, hash, active, at, id).run();
    if (!active) await env.DB.prepare("DELETE FROM legal_sessions WHERE user_id=?").bind(id).run();
  } else {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await passwordHash(password, salt);
    await env.DB.prepare("INSERT INTO legal_users(username,salt,password_hash,active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .bind(username, salt, hash, active, at, at).run().catch((error) => {
        if (/unique/i.test(String(error && error.message))) throw new HttpError("این نام کاربری قبلاً ساخته شده است.", 409);
        throw error;
      });
  }
  return listLegalUsers(env);
}

export async function legalSession(request, env) {
  const token = cookies(request).legal_session;
  if (!token) throw new HttpError("برای بخش حقوقی وارد نشده‌اید.", 401);
  const row = await env.DB.prepare(`SELECT u.*,s.token_hash,s.expires_at,s.last_seen FROM legal_sessions s JOIN legal_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1`).bind(await sha256(token), Date.now()).first();
  if (!row) throw new HttpError("نشست حقوقی تمام شده؛ دوباره وارد شوید.", 401);
  return publicUser(row);
}
export async function legalLogin(request, env) {
  const ip = T(request.headers.get("CF-Connecting-IP")) || "local";
  const body = await request.json().catch(() => ({}));
  const username = usernameOf(body.username);
  const password = String(body.password || "");
  const guard = await env.DB.prepare("SELECT * FROM legal_auth_guard WHERE ip=?").bind(ip).first();
  if (guard && guard.locked_until > Date.now()) throw new HttpError("ورود حقوقی به‌خاطر تلاش‌های ناموفق موقتاً قفل شده است.", 429);
  const user = await env.DB.prepare("SELECT * FROM legal_users WHERE username=? AND active=1").bind(username).first();
  const salt = user ? user.salt : "00000000000000000000000000000000";
  const hash = await passwordHash(password, salt);
  const valid = !!user && same(hash, user.password_hash);
  if (!valid) {
    const fails = ((guard && guard.fails) || 0) + 1;
    const locked = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
    await env.DB.prepare("INSERT INTO legal_auth_guard(ip,fails,locked_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(ip) DO UPDATE SET fails=excluded.fails,locked_until=excluded.locked_until,updated_at=excluded.updated_at")
      .bind(ip, locked ? 0 : fails, locked, Date.now()).run();
    throw new HttpError("نام کاربری یا رمز درست نیست.", 401);
  }
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const at = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM legal_auth_guard WHERE ip=?").bind(ip),
    env.DB.prepare("INSERT INTO legal_sessions(token_hash,user_id,created_at,expires_at,last_seen) VALUES(?,?,?,?,?)")
      .bind(await sha256(token), user.id, at, at + SESSION_TTL, at),
    env.DB.prepare("UPDATE legal_users SET last_login=? WHERE id=?").bind(at, user.id),
  ]);
  return { body: { ok: true, user: publicUser({ ...user, last_login: at }) }, cookie: sessionCookie(request, token, Math.floor(SESSION_TTL / 1000)) };
}
export async function legalLogout(request, env) {
  const token = cookies(request).legal_session;
  if (token) await env.DB.prepare("DELETE FROM legal_sessions WHERE token_hash=?").bind(await sha256(token)).run();
  return sessionCookie(request, "", 0);
}
export async function legalAuthCleanup(env) {
  await ensureLegalAuth(env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM legal_sessions WHERE expires_at<?").bind(Date.now()),
    env.DB.prepare("DELETE FROM legal_auth_guard WHERE locked_until<? AND updated_at<?").bind(Date.now(), Date.now() - 86400000),
  ]);
}
