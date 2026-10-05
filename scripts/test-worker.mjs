import { Miniflare } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const mf = new Miniflare({
  workers: [
    {
      name: "store",
      modules: true,
      scriptPath: "dist/server/index.js",
      compatibilityDate: "2026-08-01",
      compatibilityFlags: [
        "nodejs_compat",
        "enable_nodejs_http_server_modules",
      ],
      d1Databases: ["DB"],
      bindings: { APP_ORIGIN: "https://store.test" },
      assets: {
        directory: "dist/client",
        binding: "ASSETS",
        routerConfig: {
          has_user_worker: true,
          invoke_user_worker_ahead_of_assets: true,
        },
      },
    },
  ],
});
try {
  const db = await mf.getD1Database("DB");
  for (const f of readdirSync("drizzle").filter((f) => f.endsWith(".sql"))) {
    for (const sql of readFileSync("drizzle/" + f, "utf8")
      .split("--> statement-breakpoint")
      .filter((s) => s.trim()))
      await db.prepare(sql.trim()).run();
  }
  let r = await mf.dispatchFetch("https://store.test/api/products");
  assert.equal(r.status, 200, await r.clone().text());
  const p = await r.json();
  assert.equal(p.length, 6);
  r = await mf.dispatchFetch("https://store.test/", {
    headers: { Accept: "text/html" },
  });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Hearth &amp; Form|Hearth & Form/);
  r = await mf.dispatchFetch("https://store.test/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://store.test",
    },
    body: JSON.stringify({
      name: "Worker Tester",
      email: "worker@example.test",
      password: "Worker-test-12345",
    }),
  });
  assert.equal(r.status, 201, await r.clone().text());
  assert.match(r.headers.get("set-cookie"), /Secure/);
  const cookies = r.headers
    .getSetCookie()
    .map((x) => x.split(";")[0])
    .join("; ");
  r = await mf.dispatchFetch("https://store.test/api/cart/milo-chair", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://store.test",
      Cookie: cookies,
    },
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  r = await mf.dispatchFetch("https://store.test/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://store.test",
      Cookie: cookies,
    },
    body: JSON.stringify({
      requestKey: crypto.randomUUID(),
      address: {
        name: "Worker Tester",
        phone: "0599000000",
        line1: "123 Test Street",
        city: "Nablus",
        country: "Palestine",
      },
    }),
  });
  assert.equal(r.status, 201, await r.clone().text());
  assert.equal((await r.json()).total, 49800);
  console.log(
    "Worker runtime: assets, Express, D1 migrations, secure login, cart and checkout passed.",
  );
} finally {
  await mf.dispose();
}
