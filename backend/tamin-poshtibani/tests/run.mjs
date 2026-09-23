/* ============================================================
   تست پارسر بارگذاری اکسل — بدون وابستگی بیرونی، با node:test

   اجرا:  node --test backend/tamin-poshtibani/tests/

   چرا این تست وجود دارد (ADR-0031، بدهی شمارهٔ ۱):
   منطق پارس اکسل از پایتون به جاوااسکریپت سمت مرورگر منتقل شد و
   تست طلایی IMP-08 معادلی نداشت. این فایل همان اعداد الزام‌آور
   docs/01-domain/import-policy.md را روی فایل نمونهٔ واقعی می‌سنجد.

   import.js و shared.js برای مرورگر نوشته شده‌اند (IIFE روی window)،
   پس این‌جا یک window ساختگی می‌سازیم و همان فایل‌های تولیدی را
   عیناً اجرا می‌کنیم — نه یک کپی که ممکن است واگرا شود.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONT = resolve(HERE, "../../../frontend/tamin-poshtibani");

/** یک محیط شبه‌مرورگر می‌سازد و shared.js + import.js واقعی را داخلش اجرا می‌کند. */
export function loadTP() {
  const sandbox = { console, setTimeout, clearTimeout, TextDecoder, TextEncoder, Date, Math, JSON };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const f of ["vendor/xlsx.full.min.js", "shared.js", "import.js", "catalog-import.js"]) {
    vm.runInContext(readFileSync(resolve(FRONT, f), "utf8"), sandbox, { filename: f });
  }
  if (!sandbox.XLSX) throw new Error("XLSX در سندباکس بار نشد");
  if (!sandbox.TP || !sandbox.TP.importExcel) throw new Error("TP.importExcel بار نشد");
  if (!sandbox.TP.buildCatalog) throw new Error("TP.buildCatalog بار نشد");
  return sandbox;
}

/**
 * یک D1 بدلی روی SQLite داخلی Node (از نسخهٔ ۲۲٫۵) — همان API که Worker می‌بیند:
 * prepare().bind().all()/first()/run()، batch() در یک تراکنش، و exec().
 * D1 خودش SQLite است، پس کوئری‌ها همان‌طور که در تولید اجرا می‌شوند آزموده می‌شوند.
 * اگر Node قدیمی‌تر باشد null برمی‌گرداند و تست‌های وابسته skip می‌شوند.
 */
export async function sqliteD1() {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch (_) { return null; }
  const db = new DatabaseSync(":memory:");
  const exec1 = (sql, args) => {
    const st = db.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) return { results: st.all(...args), meta: { changes: 0 } };
    const r = st.run(...args);
    return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const prepare = (sql) => {
    let args = [];
    const s = {
      sql,
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: db.prepare(sql).all(...args), meta: {} }; },
      async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
      async run() { return exec1(sql, args); },
      _run() { return exec1(sql, args); },
    };
    return s;
  };
  return {
    raw: db,
    prepare,
    async batch(list) {
      db.exec("BEGIN");
      try { const out = list.map((s) => s._run()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
    async exec(sql) { db.exec(sql); return { count: 1 }; },
  };
}

/** یک شیء شبیه File که importExcel لازم دارد (فقط name و arrayBuffer).
 *
 *  نکتهٔ مهم: بافر باید داخل همان realmِ سندباکس ساخته شود. اگر ArrayBuffer
 *  دنیای بیرون را پاس بدهیم، بررسی‌های `instanceof ArrayBuffer` داخل SheetJS
 *  رد می‌شوند و کتابخانه فایل را به‌جای zip، «متن» می‌خواند و خروجی بی‌معنا
 *  می‌دهد. این دقیقاً همان چیزی است که در مرورگر رخ نمی‌دهد. */
export function fileFrom(sandbox, path, name) {
  const buf = readFileSync(path);
  const inner = vm.runInContext("new Uint8Array(" + buf.length + ")", sandbox);
  inner.set(buf);
  return {
    name: name || path.split(/[\\/]/).pop(),
    size: buf.length,
    async arrayBuffer() { return inner.buffer; },
  };
}
