/**
 * دادهٔ تحقیقِ «درخواست تغییر ۰۲» در D1 — لایهٔ تحقیق (فقط با ابزارِ ورود نوشته می‌شود) و لایهٔ کارشناس (هر تغییرِ
 * کارشناس یا پشتیبان با منبع، دلیل و تاریخچه). ورودِ دوبارهٔ تحقیق فقط لایهٔ تحقیق را عوض می‌کند (R02، INV-04) و حذفِ
 * فیزیکی نداریم.
 *
 * طراحی برای کمترین نوشتن در D1 (سقف روزانهٔ رایگان ۱۰۰ هزار ردیف؛ همان الگوی worker/catalog.js):
 *   cr_heads   یک ردیف برای هر نوع قلم (۲٬۴۵۷): خلاصهٔ تخت برای فهرست‌ها + پروفایل کامل (rec) برای موتور و سند راهبرد
 *   cr_codes   کد قلم → خوشه، واحد مرجع، شاخص و استثنای سطح قلم — ۶۴ تکهٔ JSON (به‌جای ۲۳ هزار ردیف)
 *   cr_prices  قیمت مرجعِ هر کد قلم و واحد مرجع — ۶۴ تکهٔ JSON (به‌جای ۱۱٬۶۹۲ ردیف)
 *   cr_units   یک ردیف برای هر واحدِ کشف (خوشه|نوع قلم، ۲٬۰۰۳): ۴۰ نامزدِ برترِ ردنشده و شاخص‌های واحد
 *   sreg       دفترِ تأمین‌کنندگان، یک ردیف برای هر شناسهٔ پایدار (۸٬۷۳۰ کشف‌شده + ۱٬۷۳۸ از سوابق)
 *   sreg_edges یال‌های گراف (۱٬۸۶۱ پیشنهادِ تحقیق + پیوندهای کارشناسان)
 * و لایهٔ کارشناس:
 *   cr_head_x  تغییرِ کارشناس یا پشتیبان روی نوع قلم (حالت استعلام، کلاس، شمار، پاسخ پرسش‌نامه) — آخرینِ فعالِ هر فیلد مؤثر است
 *   sreg_x     اصلاحِ فیلدهای دفتر (مثلاً تلفنِ تأییدشده)
 *   sreg_alias نام یا کدِ دیگرِ همان تأمین‌کننده (ادغامِ «نام نزدیک» G4، حساب پنل) با وضعیتِ پیشنهادی/تأییدشده/ردشده
 *   sreg_ops   نظرها و یادداشت‌ها
 */
export const CR_SHARDS = 64;
export const CR02_DDL = `
CREATE TABLE IF NOT EXISTS cr_heads (head TEXT PRIMARY KEY, cluster TEXT, ms TEXT, labels TEXT, quadrant TEXT, tier TEXT, rfq_mode TEXT, competition_mode TEXT, n_wave1 INTEGER, n_max INTEGER, workflow TEXT, priority TEXT, confidence TEXT, review_status TEXT, spend_bn REAL, spend_rank INTEGER, rec TEXT NOT NULL, version TEXT, as_of TEXT, imported_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS cr_codes (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS cr_prices (shard TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS cr_units (unit_key TEXT PRIMARY KEY, head TEXT NOT NULL, cluster TEXT, cands TEXT NOT NULL, unit TEXT, imported_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS cr_head_x (id INTEGER PRIMARY KEY, head TEXT NOT NULL, field TEXT NOT NULL, value TEXT, source TEXT NOT NULL, by_kind TEXT, by_id INTEGER, by_name TEXT, reason TEXT, at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS ix_crhx_head ON cr_head_x(head, field) WHERE active=1;
CREATE TABLE IF NOT EXISTS sreg (sid TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, name_n TEXT NOT NULL, hub TEXT, province TEXT, city TEXT, role TEXT, country TEXT, verification INTEGER, phones TEXT, mobiles TEXT, data TEXT, version TEXT, imported_at INTEGER NOT NULL) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_sreg_name ON sreg(name_n);
CREATE TABLE IF NOT EXISTS sreg_x (id INTEGER PRIMARY KEY, sid TEXT NOT NULL, field TEXT NOT NULL, value TEXT, by_kind TEXT, by_id INTEGER, by_name TEXT, reason TEXT, at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS ix_sregx_sid ON sreg_x(sid) WHERE active=1;
CREATE TABLE IF NOT EXISTS sreg_alias (kind TEXT NOT NULL, alias TEXT NOT NULL, sid TEXT NOT NULL, status TEXT NOT NULL, note TEXT, by_kind TEXT, by_name TEXT, at INTEGER NOT NULL, PRIMARY KEY (kind, alias)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS ix_salias_sid ON sreg_alias(sid);
CREATE TABLE IF NOT EXISTS sreg_edges (id INTEGER PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, ev TEXT, nature TEXT NOT NULL, strength TEXT, directed INTEGER NOT NULL DEFAULT 0, evidence TEXT, source TEXT NOT NULL, status TEXT NOT NULL, note TEXT, by_kind TEXT, by_id INTEGER, by_name TEXT, at INTEGER NOT NULL, rev_by TEXT, rev_at INTEGER, rev_note TEXT);
CREATE INDEX IF NOT EXISTS ix_sedge_a ON sreg_edges(a);
CREATE INDEX IF NOT EXISTS ix_sedge_b ON sreg_edges(b);
CREATE TABLE IF NOT EXISTS sreg_ops (id INTEGER PRIMARY KEY, sid TEXT NOT NULL, kind TEXT NOT NULL, voice TEXT NOT NULL, holder TEXT, holder_role TEXT, topic TEXT, conf INTEGER, body TEXT NOT NULL, author_kind TEXT NOT NULL, author_id INTEGER, author_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, hidden_by TEXT, hidden_note TEXT, hidden_at INTEGER, prev TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sops_sid ON sreg_ops(sid, created_at);
CREATE TABLE IF NOT EXISTS cr_imports (id INTEGER PRIMARY KEY, part TEXT NOT NULL, version TEXT, rows INTEGER, sha256 TEXT, detail TEXT, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cr_cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL) WITHOUT ROWID;
`;

/* ------------------------------------------------------------------ */
/* کلیدها و تکه‌ها — مشترک با ابزارِ ورود (backend/tamin-poshtibani/tools/cr02-import.mjs)          */
/* ------------------------------------------------------------------ */
export const fnv32 = (s, h = 0x811c9dc5) => { s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
export const crShard = (code) => "s" + String(fnv32(String(code).trim()) % CR_SHARDS).padStart(2, "0");
/** کلیدِ نامِ تأمین‌کننده — همان keyOf ِ فهرست اقلام، چون purchases.supplier_n و supplier_grades.sn با همین ساخته می‌شوند */
export { keyOf as supKey } from "./catalog.js";

/** نوعِ رابطه‌ها در گراف و رنگِ خطشان (سند طراحی، بخش ۶) */
export const NATURES = {
  rival: { fa: "رقابت", color: "#2563eb" },
  partner: { fa: "همکاری", color: "#ea580c" },
  same_market: { fa: "هم‌بازار", color: "#6b7280" },
  same_business: { fa: "یک کسب‌وکار", color: "#7c3aed" },
  chain: { fa: "زنجیرهٔ تأمین", color: "#16a34a" },
  collusion: { fa: "تبانی محتمل", color: "#dc2626" },
};
/** نوعِ شاهدِ یال‌های تحقیق ← نوعِ رابطه */
export function natureOfEvidence(type) {
  const t = String(type || "");
  if (t.startsWith("هم‌پاساژ")) return "same_market";
  if (t.startsWith("تلفن مشترک") || t.startsWith("نشانی یکسان") || t.startsWith("مدیر هم‌نام")) return "same_business";
  if (t.startsWith("الگوی سلطهٔ مکمل")) return "collusion";
  return "same_market";
}
