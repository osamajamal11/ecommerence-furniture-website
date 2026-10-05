import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { localBinding } from "./local-db.js";
import { migrate } from "../scripts/migrate.mjs";
const binding = localBinding(process.env.DATABASE_PATH);
migrate(binding);
if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
  throw new Error("APP_ORIGIN is required in production");
const app = createApp(binding, {
  origin: process.env.APP_ORIGIN,
  production: process.env.NODE_ENV === "production",
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
});
app.use(express.static(resolve("dist/client"), { index: false }));
app.get("/{*path}", (req, res) =>
  res.sendFile(resolve("dist/client/index.html")),
);
const server = app.listen(process.env.PORT || 3000, () =>
  console.log("Hearth & Form is listening."),
);
process.on("SIGTERM", () =>
  server.close(() => {
    binding.db.close();
    process.exit(0);
  }),
);
