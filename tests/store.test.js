import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.js";
import { localBinding } from "../server/local-db.js";
import { migrate } from "../scripts/migrate.mjs";
const address = {
  name: "Test Customer",
  phone: "0599000000",
  line1: "123 Test Street",
  city: "Nablus",
  country: "Palestine",
  notes: "",
};
async function setup() {
  const binding = localBinding(":memory:");
  migrate(binding);
  const app = createApp(binding, {
    origin: "https://store.test",
    adminEmail: "admin@example.test",
    adminPassword: "Admin-testing-12345",
  });
  await request(app).get("/api/health").expect(200);
  return { binding, app };
}
const register = (a, email = "buyer@example.test") =>
  a
    .post("/api/auth/register")
    .send({
      name: "Test Buyer",
      email,
      password: "Customer-test-12345",
      role: "admin",
    });
test("complete guest-to-customer shopping flow, durable session, server totals and idempotency", async () => {
  const { binding, app } = await setup();
  const a = request.agent(app);
  let r = await a.get("/api/products").expect(200);
  assert.equal(r.body.length, 6);
  await a.put("/api/cart/haven-sofa").send({ quantity: 1 }).expect(200);
  r = await register(a).expect(201);
  assert.equal(r.body.role, "customer");
  assert.equal(r.body.password, undefined);
  const cookie = r.headers["set-cookie"].find((c) =>
    c.startsWith("hf_session="),
  );
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.notEqual(
    binding.db
      .prepare("SELECT password FROM users WHERE email=?")
      .get("buyer@example.test").password,
    "Customer-test-12345",
  );
  r = await a.get("/api/cart").expect(200);
  assert.equal(r.body[0].quantity, 1);
  await a.put("/api/wishlist/milo-chair").send({ saved: true }).expect(200);
  assert.equal((await a.get("/api/wishlist")).body[0].id, "milo-chair");
  const key = randomUUID();
  r = await a
    .post("/api/orders")
    .send({ requestKey: key, address, total: 1, shipping: 0 })
    .expect(201);
  assert.equal(r.body.total, 129900);
  assert.equal(r.body.shipping, 0);
  const id = r.body.id;
  r = await a
    .post("/api/orders")
    .send({ requestKey: key, address })
    .expect(200);
  assert.equal(r.body.id, id);
  assert.equal(
    binding.db
      .prepare("SELECT stock FROM products WHERE id=?")
      .get("haven-sofa").stock,
    11,
  );
  assert.equal((await a.get("/api/cart")).body.length, 0);
  await a.post("/api/auth/logout").send({}).expect(200);
  await a.get("/api/orders").expect(401);
  await a
    .post("/api/auth/login")
    .send({ email: "buyer@example.test", password: "Customer-test-12345" })
    .expect(200);
  assert.equal((await a.get("/api/orders")).body.length, 1);
  binding.db.close();
});
test("role protection, user isolation, validation and cross-origin protection", async () => {
  const { binding, app } = await setup();
  const a = request.agent(app),
    b = request.agent(app);
  await register(a).expect(201);
  await register(b, "second@example.test").expect(201);
  await request(app).get("/api/admin/products").expect(401);
  await a.get("/api/admin/products").expect(403);
  await a.post("/api/admin/products").send({}).expect(403);
  await a.put("/api/cart/haven-sofa").send({ quantity: -1 }).expect(400);
  await a.put("/api/cart/haven-sofa").send({ quantity: 13 }).expect(409);
  await a.put("/api/cart/missing").send({ quantity: 1 }).expect(404);
  await a
    .put("/api/cart/milo-chair")
    .set("Origin", "https://evil.test")
    .send({ quantity: 1 })
    .expect(403);
  await a
    .put("/api/cart/milo-chair")
    .set("Sec-Fetch-Site", "cross-site")
    .send({ quantity: 1 })
    .expect(403);
  await a.put("/api/cart/milo-chair").send({ quantity: 1 }).expect(200);
  const order = await a
    .post("/api/orders")
    .send({ requestKey: randomUUID(), address })
    .expect(201);
  assert.equal(order.body.total, 49800);
  assert.equal((await b.get("/api/orders")).body.length, 0);
  assert.equal((await b.get("/api/cart")).body.length, 0);
  await b
    .patch("/api/admin/orders/" + order.body.id)
    .send({ status: "cancelled" })
    .expect(403);
  await a
    .post("/api/auth/login")
    .send({ email: "' OR 1=1--@test.com", password: "Customer-test-12345" })
    .expect(400);
  binding.db.close();
});
test("admin edits, archival, cancellation restores inventory exactly once", async () => {
  const { binding, app } = await setup();
  const admin = request.agent(app),
    buyer = request.agent(app);
  await admin
    .post("/api/auth/login")
    .send({ email: "admin@example.test", password: "Admin-testing-12345" })
    .expect(200);
  await register(buyer).expect(201);
  let products = (await admin.get("/api/admin/products").expect(200)).body;
  const sofa = products.find((p) => p.id === "haven-sofa");
  await buyer.put("/api/cart/haven-sofa").send({ quantity: 2 }).expect(200);
  const o = (
    await buyer
      .post("/api/orders")
      .send({ requestKey: randomUUID(), address })
      .expect(201)
  ).body;
  await admin
    .patch("/api/admin/orders/" + o.id)
    .send({ status: "delivered" })
    .expect(400);
  await admin
    .patch("/api/admin/orders/" + o.id)
    .send({ status: "cancelled" })
    .expect(200);
  await admin
    .patch("/api/admin/orders/" + o.id)
    .send({ status: "cancelled" })
    .expect(400);
  assert.equal(
    binding.db.prepare("SELECT stock FROM products WHERE id=?").get(sofa.id)
      .stock,
    12,
  );
  await admin
    .put("/api/admin/products/" + sofa.id)
    .send({ ...sofa, active: 0 })
    .expect(200);
  await buyer
    .put("/api/cart/" + sofa.id)
    .send({ quantity: 1 })
    .expect(404);
  await admin
    .post("/api/admin/products")
    .send({ ...sofa, name: "New piece", image: "javascript:alert(1)" })
    .expect(400);
  const created = await admin
    .post("/api/admin/products")
    .send({ ...sofa, name: "New piece", image: "/images/sofa.jpg" })
    .expect(201);
  assert.ok(created.body.id);
  assert.equal((await admin.get("/api/admin/orders")).body.length, 1);
  binding.db.close();
});
test("simultaneous purchases of last stock cannot oversell", async () => {
  const { binding, app } = await setup();
  const a = request.agent(app),
    b = request.agent(app);
  await register(a).expect(201);
  await register(b, "second@example.test").expect(201);
  binding.db
    .prepare("UPDATE products SET stock=1 WHERE id=?")
    .run("milo-chair");
  await a.put("/api/cart/milo-chair").send({ quantity: 1 }).expect(200);
  await b.put("/api/cart/milo-chair").send({ quantity: 1 }).expect(200);
  const results = await Promise.all([
    a.post("/api/orders").send({ requestKey: randomUUID(), address }),
    b.post("/api/orders").send({ requestKey: randomUUID(), address }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    binding.db
      .prepare("SELECT stock FROM products WHERE id=?")
      .get("milo-chair").stock,
    0,
  );
  assert.equal(
    binding.db.prepare("SELECT COUNT(*) AS n FROM orders").get().n,
    1,
  );
  binding.db.close();
});
test("password change invalidates all previous sessions", async () => {
  const { binding, app } = await setup();
  const a = request.agent(app),
    b = request.agent(app);
  await register(a).expect(201);
  await b
    .post("/api/auth/login")
    .send({ email: "buyer@example.test", password: "Customer-test-12345" })
    .expect(200);
  await a
    .put("/api/auth/password")
    .send({ currentPassword: "wrong", password: "New-password-12345" })
    .expect(400);
  await a
    .put("/api/auth/password")
    .send({
      currentPassword: "Customer-test-12345",
      password: "New-password-12345",
    })
    .expect(200);
  await b.get("/api/orders").expect(401);
  await a
    .post("/api/auth/login")
    .send({ email: "buyer@example.test", password: "New-password-12345" })
    .expect(200);
  binding.db.close();
});
