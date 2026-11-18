import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const READ_SQL = /^\s*(SELECT|PRAGMA|WITH)\b/i;

export function openSqliteD1(filename = ":memory:") {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA busy_timeout = 5000;");
  if (filename !== ":memory:") db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");

  const exec1 = (sql, args) => {
    const started = performance.now();
    const statement = db.prepare(sql);
    if (READ_SQL.test(sql)) {
      const results = statement.all(...args);
      return {
        success: true,
        results,
        meta: { changes: 0, duration: performance.now() - started, rows_read: results.length, rows_written: 0 },
      };
    }
    const result = statement.run(...args);
    const changes = Number(result.changes);
    return {
      success: true,
      results: [],
      meta: {
        changes,
        duration: performance.now() - started,
        last_row_id: Number(result.lastInsertRowid),
        rows_read: 0,
        rows_written: changes,
      },
    };
  };

  const prepare = (sql) => {
    let args = [];
    const statement = {
      sql,
      bind(...values) {
        args = values.map((value) => value === undefined ? null : value);
        return statement;
      },
      async all() {
        const started = performance.now();
        const results = db.prepare(sql).all(...args);
        return {
          success: true,
          results,
          meta: { changes: 0, duration: performance.now() - started, rows_read: results.length, rows_written: 0 },
        };
      },
      async first() {
        const row = db.prepare(sql).get(...args);
        return row === undefined ? null : { ...row };
      },
      async run() { return exec1(sql, args); },
      _run() { return exec1(sql, args); },
    };
    return statement;
  };

  return {
    raw: db,
    prepare,
    async batch(statements) {
      if (!statements.length) return [];
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement._run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 1 };
    },
    checkpoint() { db.exec("PRAGMA wal_checkpoint(TRUNCATE)"); },
    close() { db.close(); },
  };
}
