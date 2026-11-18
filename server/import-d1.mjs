import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export function importD1Dump(input, output) {
  const source = resolve(input);
  const target = resolve(output);
  if (!existsSync(source)) throw new Error(`SQL dump not found: ${source}`);
  if (existsSync(target)) throw new Error(`Refusing to overwrite an existing database: ${target}`);

  const sql = readFileSync(source, "utf8").replace("CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq);", "");
  const db = new DatabaseSync(target);
  try {
    db.exec(sql);
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    if (integrity !== "ok") throw new Error(`SQLite integrity_check failed: ${integrity}`);
    const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n;
    const indexes = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index'").get().n;
    const result = { sourceBytes: statSync(source).size, tables, indexes, integrity };
    db.close();
    return { ...result, targetBytes: statSync(target).size };
  } catch (error) {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${target}${suffix}`, { force: true });
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error("Usage: node server/import-d1.mjs <dump.sql> <new.sqlite>");
    process.exitCode = 2;
  } else {
    try { console.log(JSON.stringify(importD1Dump(input, output), null, 2)); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
