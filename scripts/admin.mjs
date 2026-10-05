import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { localBinding } from "../server/local-db.js";
import { migrate } from "./migrate.mjs";
const email = process.env.ADMIN_EMAIL?.toLowerCase(),
  password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) first.");
const b = localBinding(process.env.DATABASE_PATH);
migrate(b);
const p = await bcrypt.hash(password, 12);
b.db
  .prepare(
    "INSERT INTO users(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET password=excluded.password,role=excluded.role",
  )
  .run(randomUUID(), "Store administrator", email, p, "admin", Date.now());
b.db.close();
console.log("Administrator account created or updated.");
