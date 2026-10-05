import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { localBinding } from "../server/local-db.js";
import { readdirSync, readFileSync } from "node:fs";
export function migrate(binding) {
  binding.db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)",
  );
  for (const file of readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      !binding.db.prepare("SELECT name FROM _migrations WHERE name=?").get(file)
    ) {
      binding.db.exec("BEGIN");
      try {
        binding.db.exec(readFileSync("drizzle/" + file, "utf8"));
        binding.db.prepare("INSERT INTO _migrations VALUES (?)").run(file);
        binding.db.exec("COMMIT");
      } catch (e) {
        binding.db.exec("ROLLBACK");
        throw e;
      }
    }
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const b = localBinding(process.env.DATABASE_PATH);
  migrate(b);
  console.log("Database migrated.");
  b.db.close();
}
