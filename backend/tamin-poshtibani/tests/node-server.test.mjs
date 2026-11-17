import test from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openSqliteD1 } from "../../../server/sqlite-d1.mjs";
import { createAssets } from "../../../server/assets.mjs";
import { createNodeServer } from "../../../server/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "../../../frontend");

function tempDir(t) {
  const directory = mkdtempSync(join(tmpdir(), "asli-node-"));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return directory;
}

test("SQLite D1: bind, first, all, run and atomic batch", async () => {
  const db = openSqliteD1();
  try {
    await db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT UNIQUE, payload BLOB)");
    const inserted = await db.prepare("INSERT INTO sample VALUES (?,?,?)").bind(1, "یک", new Uint8Array([1, 2, 3])).run();
    assert.equal(inserted.meta.changes, 1);
    assert.equal(inserted.meta.last_row_id, 1);
    assert.equal((await db.prepare("SELECT name FROM sample WHERE id=?").bind(1).first()).name, "یک");
    assert.equal((await db.prepare("SELECT * FROM sample").all()).results.length, 1);
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO sample(id,name) VALUES (?,?)").bind(2, "دو"),
      db.prepare("INSERT INTO sample(id,name) VALUES (?,?)").bind(3, "یک"),
    ]));
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sample").first()).n, 1);
    await db.batch([
      db.prepare("INSERT INTO sample(id,name) VALUES (?,?)").bind(2, "دو"),
      db.prepare("UPDATE sample SET name=? WHERE id=?").bind("سه", 1),
    ]);
    assert.deepEqual((await db.prepare("SELECT id FROM sample ORDER BY id").all()).results.map((row) => row.id), [1, 2]);
  } finally { db.close(); }
});

test("D1 dump import: internal sequence, restored rows and integrity", (t) => {
  const directory = tempDir(t);
  const source = join(directory, "dump.sql");
  const target = join(directory, "restored.sqlite");
  const script = resolve(HERE, "../../../server/import-d1.mjs");
  writeFileSync(source, [
    "BEGIN TRANSACTION;",
    "CREATE TABLE sample(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);",
    "INSERT INTO sample VALUES(2,'hello');",
    "PRAGMA writable_schema=ON;",
    "CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq);",
    "DELETE FROM sqlite_sequence;",
    "INSERT INTO sqlite_sequence VALUES('sample',7);",
    "COMMIT;",
  ].join("\n"));
  const result = JSON.parse(execFileSync(process.execPath, [script, source, target], { encoding: "utf8" }));
  assert.equal(result.integrity, "ok");
  assert.equal(result.tables, 1);
  assert.throws(() => execFileSync(process.execPath, [script, source, target], { stdio: "pipe" }));
  const verify = `import { DatabaseSync } from "node:sqlite"; const db = new DatabaseSync(${JSON.stringify(target)}); const name = db.prepare("SELECT name FROM sample WHERE id=2").get().name; const seq = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='sample'").get().seq; console.log(JSON.stringify({ name, seq })); db.close();`;
  const restored = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", verify], { encoding: "utf8" }));
  assert.deepEqual(restored, { name: "hello", seq: 7 });
});

test("static assets: HTML, HEAD, range, ETag and traversal guard", async () => {
  const assets = createAssets(FRONTEND);
  const page = await assets.match(new Request("https://example.com/tamin-poshtibani/"));
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /<!DOCTYPE html>/i);

  const head = await assets.match(new Request("https://example.com/manifest.json", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const range = await assets.match(new Request("https://example.com/manifest.json", { headers: { Range: "bytes=0-9" } }));
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 10);
  assert.equal(range.headers.get("content-range"), `bytes 0-9/${readFileSync(join(FRONTEND, "manifest.json")).length}`);

  const fresh = await assets.match(new Request("https://example.com/manifest.json"));
  const cached = await assets.match(new Request("https://example.com/manifest.json", { headers: { "If-None-Match": fresh.headers.get("etag") } }));
  assert.equal(cached.status, 304);
  assert.equal(await assets.match(new Request("https://example.com/%2e%2e%2fworker.js")), null);
});

test("Node HTTP server runs the real Worker API and static frontend", async (t) => {
  const db = openSqliteD1();
  const app = createNodeServer({
    db,
    assetsDirectory: FRONTEND,
    env: { MANAGER_CODE: "1234", SITE_ORIGIN: "https://example.com", D1_GUARD: "off" },
  });
  t.after(async () => { if (app.server.listening) await app.close(); });
  await new Promise((resolveListen, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = app.server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${base}/tamin-poshtibani/api/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.ok, true);
  assert.equal(body.schema, true);

  const page = await fetch(`${base}/tamin-poshtibani/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<!DOCTYPE html>/i);
  assert.equal((await fetch(`${base}/not-found`)).status, 404);
  await app.close();
});
