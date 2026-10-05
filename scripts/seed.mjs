import { localBinding } from "../server/local-db.js";
import { database } from "../server/database.js";
import { seedCatalog } from "../server/catalog.js";
import { migrate } from "./migrate.mjs";
const b = localBinding(process.env.DATABASE_PATH);
migrate(b);
await seedCatalog(database(b));
b.db.close();
console.log("Catalog seeded.");
