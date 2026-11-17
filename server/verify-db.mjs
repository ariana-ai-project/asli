import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node server/verify-db.mjs <database.sqlite>");
  process.exitCode = 2;
} else {
  const db = new DatabaseSync(resolve(file), { readOnly: true });
  try {
    const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
    const tables = {};
    for (const name of names) {
      const quoted = `"${name.replaceAll('"', '""')}"`;
      tables[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get().n;
    }
    console.log(JSON.stringify({ integrity, tableCount: names.length, tables }, null, 2));
    if (integrity !== "ok") process.exitCode = 1;
  } finally { db.close(); }
}
