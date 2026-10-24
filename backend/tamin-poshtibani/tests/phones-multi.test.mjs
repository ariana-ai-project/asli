/* ============================================================
   یک شماره برای چند تأمین‌کننده (آبان ۱۴۰۵، خواستهٔ مالک)
   • دیتابیسِ قدیمی (phone UNIQUE) یک بار از نو ساخته می‌شود — همان شناسه‌ها، ستون‌ها و نمایه‌ها؛ یکتایی فقط (تأمین‌کننده، شماره)
   • savePhone همان شماره را برای تأمین‌کنندهٔ دیگر هم می‌پذیرد و برای همان تأمین‌کننده ردیفِ تکراری نمی‌سازد
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./run.mjs";
import { migratePhonesMulti, savePhone } from "../../../worker/sp-core.js";

const DB = await sqliteD1();
const SKIP = !DB;

test("دیتابیسِ قدیمی: یکتاییِ شماره برداشته می‌شود و داده‌ها می‌مانند؛ یک شماره برای دو تأمین‌کننده", { skip: SKIP }, async () => {
  const env = { DB };
  DB.raw.exec(`CREATE TABLE sp_suppliers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_n TEXT NOT NULL, demo INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE sp_phones (id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL, phone TEXT NOT NULL UNIQUE, label TEXT, k TEXT NOT NULL UNIQUE, pass_hash TEXT, pass_at INTEGER, fails INTEGER NOT NULL DEFAULT 0, lock_until INTEGER, resend_at INTEGER, created_by INTEGER, created_at INTEGER NOT NULL);
    CREATE INDEX ix_spph_sup ON sp_phones(supplier_id);
    ALTER TABLE sp_phones ADD COLUMN panel INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE sp_phones ADD COLUMN panel_by INTEGER;
    ALTER TABLE sp_phones ADD COLUMN panel_at INTEGER;
    INSERT INTO sp_suppliers (id,name,name_n,created_at) VALUES (1,'آهن‌آلات الف','آهن آلات الف',1),(2,'فولاد ب','فولاد ب',1);
    INSERT INTO sp_phones (id,supplier_id,phone,label,k,created_at,panel) VALUES (7,1,'09120000001','فروش','k7',1,1);`);
  assert.throws(() => DB.raw.prepare("INSERT INTO sp_phones (supplier_id,phone,k,created_at) VALUES (2,'09120000001','k8',1)").run(), /UNIQUE/);
  assert.equal(await migratePhonesMulti(env), true);
  assert.equal(await migratePhonesMulti(env), false, "یک بار");
  const row = DB.raw.prepare("SELECT * FROM sp_phones WHERE id=7").get();
  assert.deepEqual([row.supplier_id, row.phone, row.label, row.k, row.panel], [1, "09120000001", "فروش", "k7", 1], "همان ردیف و ستون‌های افزوده");
  assert.ok(DB.raw.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='index' AND name='ix_spph_sup'").get(), "نمایه برگشت");
  /* همان شماره برای تأمین‌کنندهٔ دیگر */
  DB.raw.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_spph_supphone ON sp_phones(supplier_id, phone)");
  const r = await savePhone(env, 5, { supplier_id: 2, phone: "09120000001", label: "دفتر" });
  assert.equal(r.supplier.id, 2);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_phones WHERE phone='09120000001'").get().n, 2);
  /* همان تأمین‌کننده: ردیفِ تکراری نه، فقط برچسب */
  const again = await savePhone(env, 5, { supplier_id: 1, phone: "09120000001", label: "مدیر فروش" });
  assert.equal(again.phone.id, 7);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_phones WHERE phone='09120000001'").get().n, 2);
  /* چند شماره برای یک تأمین‌کننده */
  for (const p of ["09120000002", "09120000003", "09120000004"]) await savePhone(env, 5, { supplier_id: 1, phone: p, label: "همراه" });
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM sp_phones WHERE supplier_id=1").get().n, 4);
});
