import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function localBinding(path = "data/store.sqlite") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  const prepare = (sql) => ({
    bind: (...params) => ({
      first: async () => db.prepare(sql).get(...params) || null,
      all: async () => ({ results: db.prepare(sql).all(...params) }),
      run: async () => ({ meta: db.prepare(sql).run(...params) }),
      _sql: sql,
      _params: params,
    }),
  });
  return {
    db,
    prepare,
    batch: async (statements) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map((s) => ({
          meta: db.prepare(s._sql).run(...s._params),
        }));
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
