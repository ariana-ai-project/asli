/**
 * منوی ثابتِ بات کارشناسان (تصمیم مدیر، مهر ۱۴۰۵): «↩️ بازگشت»، «📋 کارتابل»، «📄 درخواست» و «🧩 پنل کارشناس»
 * (مینی‌اپ) همیشه پایینِ صفحه‌اند و از دکمه‌های شیشه‌ایِ تک‌تکِ پیام‌ها برداشته می‌شوند.
 *
 * هر صفحه‌ای که بات نشان می‌داد، دکمهٔ «بازگشتِ» خودش و درخواستی را که به آن مربوط بود داشت. حالا آن دو
 * برای همان گفت‌وگو در tg_nav می‌مانند: «بازگشت» همان دکمه را از نو می‌زند و «درخواست» منوی همان درخواست را
 * باز می‌کند. برداشتنِ دکمه‌ها فقط بعد از رسیدنِ منوی ثابت به همان گفت‌وگوست — وگرنه کارشناس راهی برای
 * برگشتن نداشت. پیام‌های صف (اعلان ارجاع و یادآوری) دست نمی‌خورند؛ آن‌ها دکمهٔ کارِ خودشان را دارند.
 */
import { siteOrigin } from "./sp-core.js";

export const NAV = { back: "↩️ بازگشت", kartabl: "📋 کارتابل", req: "📄 درخواست", app: "🧩 پنل کارشناس" };
export const NAV_DDL = "CREATE TABLE IF NOT EXISTS tg_nav (chat TEXT PRIMARY KEY, back TEXT, aid INTEGER, menu_v INTEGER, updated_at INTEGER NOT NULL) WITHOUT ROWID;";
/** نسخهٔ منو: اگر روزی دکمه‌ها عوض شوند، با بالا بردنِ این عدد منوی تازه دوباره برای همه می‌رود */
export const MENU_V = 1;
const BACK_TEXTS = new Set(["↩️ بازگشت", "↩️ برگشت"]);

export const expertAppUrl = (env) => `${siteOrigin(env)}/tamin-poshtibani/expert.html?tg=1`;
export const navKeyboard = (env) => ({
  keyboard: [[{ text: NAV.back }, { text: NAV.kartabl }, { text: NAV.req }], [{ text: NAV.app, web_app: { url: expertAppUrl(env) } }]],
  is_persistent: true, resize_keyboard: true,
});

/* دکمه‌هایی که شناسهٔ درخواست را در خود دارند (منوی درخواست و کارهایش) — «📄 درخواست» از روی همین‌ها هم پیدا می‌شود */
const AID_RE = /^(?:rq:(\d+):|(?:hs|sm):a:(\d+)$|qt:(\d+)$|ct:(\d+):|dvo:(\d+)$|cm:(\d+):|dg:(\d+):)/;
const aidOf = (cd) => { const m = AID_RE.exec(cd); return m ? +m.slice(1).find(Boolean) : null; };

/**
 * دکمه‌های راهبری را از کیبورد شیشه‌ای برمی‌دارد: کارتابل، «📄 درخواست» و «بازگشت» — بقیه می‌مانند.
 * aid: درخواستِ صفحه — از «📄 درخواست»، وگرنه اگر همهٔ دکمه‌های درخواست‌دارِ صفحه یک درخواست‌اند (کارتابلِ
 * چنددرخواستی درخواستِ جاری را عوض نمی‌کند).
 */
export function stripNav(kb) {
  const out = [];
  let back = null, aid = null;
  const seen = new Set();
  for (const row of Array.isArray(kb) ? kb : []) {
    const keep = [];
    for (const b of Array.isArray(row) ? row : []) {
      const cd = (b && b.callback_data) || "";
      if (cd === "kt:n") continue;
      const m = /^rq:(\d+):m$/.exec(cd);
      if (m && b.text === NAV.req) { aid = +m[1]; continue; }
      if (cd && BACK_TEXTS.has(b.text)) { back = cd; continue; }
      const a = aidOf(cd);
      if (a) seen.add(a);
      keep.push(b);
    }
    if (keep.length) out.push(keep);
  }
  if (!aid && seen.size === 1) aid = [...seen][0];
  return { kb: out, back, aid };
}

export async function navLoad(env, chat) {
  const r = await env.DB.prepare("SELECT * FROM tg_nav WHERE chat=?").bind(String(chat)).first().catch(() => null);
  return { chat: String(chat), back: r ? r.back : null, aid: r ? r.aid : null, menu_v: r ? r.menu_v || 0 : 0, dirty: false };
}
export async function navSave(env, st) {
  if (!st || !st.dirty) return;
  await env.DB.prepare(`INSERT INTO tg_nav (chat,back,aid,menu_v,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(chat) DO UPDATE SET back=excluded.back, aid=excluded.aid, menu_v=excluded.menu_v, updated_at=excluded.updated_at`)
    .bind(st.chat, st.back, st.aid, st.menu_v, Date.now()).run();
  st.dirty = false;
}

/**
 * همان رابط telegram(env)، برای یک گفت‌وگو: پیش از فرستادن یا ویرایش، دکمه‌های راهبری برداشته و «بازگشت» و
 * درخواستِ صفحه نگه داشته می‌شود. صفحه‌ای که دکمه دارد ولی «بازگشت» ندارد (مثل کارتابل)، بازگشت را خالی می‌کند.
 */
export function navApi(api, st) {
  const fix = (chatId, kb) => {
    if (!st || st.menu_v < MENU_V || String(chatId) !== st.chat || !Array.isArray(kb) || !kb.length) return kb;
    const s = stripNav(kb);
    st.back = s.back;
    if (s.aid) st.aid = s.aid;
    st.dirty = true;
    return s.kb;
  };
  return {
    ...api,
    nav: st,
    sendMessage: (chatId, text, kb) => api.sendMessage(chatId, text, fix(chatId, kb)),
    editMessageText: (chatId, mid, text, kb) => api.editMessageText(chatId, mid, text, fix(chatId, kb)),
  };
}

/**
 * منوی ثابت و دکمهٔ مینی‌اپِ کنار کادر پیام — یک بار برای هر گفت‌وگو (یا با force بعد از اتصال). فقط اگر پیامِ
 * منو واقعاً رسید علامت می‌خورد؛ وگرنه دکمه‌های راهبری از پیام‌ها برداشته می‌شدند و کارشناس راهِ برگشت نداشت.
 * گفت‌وگویی که بات را بسته (۴۰۳) یا دیگر نیست، دوباره امتحان نمی‌شود.
 */
export async function ensureMenu(env, api, st, force) {
  if (!st || (!force && st.menu_v >= MENU_V)) return false;
  let ok = false, gone = false;
  try {
    await api.call("sendMessage", {
      chat_id: st.chat, parse_mode: "HTML", reply_markup: navKeyboard(env),
      text: "📌 <b>منوی پایین</b>: «↩️ بازگشت» به صفحهٔ قبل، «📋 کارتابل»، «📄 درخواست» (همان درخواستی که رویش هستید) و «🧩 پنل کارشناس» (مینی‌اپ) همیشه همین پایین‌اند؛ دیگر زیر هر پیام تکرار نمی‌شوند.",
    });
    ok = true;
  } catch (e) {
    gone = !!(e && (e.code === 403 || /chat not found|bot was blocked|user is deactivated/i.test(e.description || e.message || "")));
    console.error("nav menu", e && e.message);
  }
  if (ok) {
    await api.call("setChatMenuButton", { chat_id: st.chat, menu_button: { type: "web_app", text: "پنل کارشناس", web_app: { url: expertAppUrl(env) } } })
      .catch((e) => console.error("nav menu button", e && e.message));
  }
  if (ok || gone) { st.menu_v = MENU_V; st.dirty = true; }
  return ok;
}

/**
 * منو برای کارشناسانی که بات را وصل کرده‌اند ولی هنوز منو نگرفته‌اند — از Cron، بی آن‌که منتظرِ پیامِ بعدیِ کارشناس
 * بمانیم (درس مهر ۱۴۰۵: کارشناسی که بعد از استقرار چیزی به بات نفرستاد، منو را هیچ‌وقت نمی‌دید). دکمهٔ مینی‌اپِ
 * کنار کادر پیام هم یک بار برای همهٔ گفت‌وگوهای بات (بی chat_id) گذاشته می‌شود. هر بار چند گفت‌وگو، و در هر
 * isolate هر پنج دقیقه یک بار — تا سقف زیردرخواست‌های Cron نشکند.
 */
let lastPush = 0;
export async function pushNavMenus(env, api, limit = 3) {
  if (Date.now() - lastPush < 5 * 60000) return { navSent: 0 };
  lastPush = Date.now();
  const cur = await env.DB.prepare("SELECT value FROM settings WHERE key='navMenu'").first().catch(() => null);
  if (!cur || Number(cur.value) !== MENU_V) {
    const ok = await api.call("setChatMenuButton", { menu_button: { type: "web_app", text: "پنل کارشناس", web_app: { url: expertAppUrl(env) } } })
      .then(() => true).catch((e) => { console.error("nav default menu button", e && e.message); return false; });
    if (ok) {
      await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('navMenu',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
        .bind(String(MENU_V), Date.now()).run();
    }
  }
  const rows = (await env.DB.prepare(`SELECT e.telegram_chat AS chat FROM experts e LEFT JOIN tg_nav n ON n.chat=e.telegram_chat
      WHERE e.active=1 AND e.telegram_chat IS NOT NULL AND (n.menu_v IS NULL OR n.menu_v < ?) LIMIT ?`).bind(MENU_V, limit).all()).results || [];
  let sent = 0;
  for (const r of rows) {
    const st = await navLoad(env, r.chat);
    if (await ensureMenu(env, api, st, true)) sent++;
    await navSave(env, st).catch((e) => console.error("nav save", e && e.message));
  }
  return { navSent: sent };
}
