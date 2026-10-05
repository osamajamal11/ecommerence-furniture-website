import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { database } from "./database.js";
import { seedCatalog } from "./catalog.js";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const fail = (status, message) => Object.assign(new Error(message), { status });
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim()),
  password: z.string().min(10).max(72),
});
const productSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum([
    "Sofas",
    "Chairs",
    "Tables",
    "Lighting",
    "Bedroom",
    "Storage",
  ]),
  price: z.number().int().min(100).max(100000000),
  description: z.string().trim().min(10).max(2000),
  material: z.string().max(150),
  dimensions: z.string().max(100),
  color: z.string().max(80),
  image: z
    .string()
    .max(1500)
    .refine(
      (s) => /^\/images\/[a-zA-Z0-9._-]+$/.test(s) || /^https:\/\//.test(s),
      "Use an HTTPS image URL or local catalog image.",
    ),
  stock: z.number().int().min(0).max(100000),
  featured: z.number().int().min(0).max(1),
  active: z.number().int().min(0).max(1).default(1),
});
export function createApp(binding, config = {}) {
  const app = express(),
    db = database(binding);
  let ready;
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "https:", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["sec-fetch-site"] === "cross-site")
        return next(fail(403, "This request must come from the store."));
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== (config.origin || `${req.protocol}://${req.get("host")}`)
      )
        return next(fail(403, "Origin is not allowed."));
      if (!req.is("application/json"))
        return next(fail(415, "Send JSON content."));
    }
    try {
      if (!ready)
        ready = (async () => {
          await seedCatalog(db);
          if (config.adminEmail && config.adminPassword) {
            const exists = await db.one(
              "SELECT id FROM users WHERE email=?",
              config.adminEmail.toLowerCase(),
            );
            if (!exists)
              await db.run(
                "INSERT OR IGNORE INTO users(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)",
                randomUUID(),
                "Store administrator",
                config.adminEmail.toLowerCase(),
                await bcrypt.hash(config.adminPassword, 12),
                "admin",
                Date.now(),
              );
          }
        })().catch((e) => {
          ready = null;
          throw e;
        });
      await ready;
      next();
    } catch (e) {
      next(e);
    }
  });
  const cookieOptions = {
    httpOnly: true,
    secure: !!config.production,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 86400000,
  };
  const authCookie = config.production ? "__Host-hf_session" : "hf_session";
  app.use("/api", async (req, res, next) => {
    try {
      const token = req.cookies[authCookie];
      req.user = token
        ? await db.one(
            "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?",
            hash(token),
            Date.now(),
          )
        : null;
      let guest = req.cookies.hf_guest;
      if (!/^[a-f0-9]{48}$/.test(guest || "")) {
        guest = randomBytes(24).toString("hex");
        res.cookie("hf_guest", guest, {
          ...cookieOptions,
          maxAge: 30 * 86400000,
        });
      }
      req.guest = "g:" + hash(guest);
      req.owner = req.user ? "u:" + req.user.id : req.guest;
      next();
    } catch (e) {
      next(e);
    }
  });
  const auth = (req, res, next) =>
    req.user ? next() : next(fail(401, "Please sign in to continue."));
  const admin = (req, res, next) =>
    req.user?.role === "admin"
      ? next()
      : next(fail(req.user ? 403 : 401, "Administrator access is required."));
  const rate = async (req) => {
    await db.run("DELETE FROM rate_limits WHERE expires_at < ?", Date.now());
    const ip = config.clientIp
      ? config.clientIp(req)
      : req.socket.remoteAddress || "unknown";
    const bucket = Math.floor(Date.now() / 900000);
    for (const key of [
      `ip:${hash(ip)}:${bucket}`,
      `email:${hash(String(req.body.email || "").toLowerCase())}:${bucket}`,
    ]) {
      await db.run(
        "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
        key,
        Date.now() + 900000,
      );
      const r = await db.one("SELECT count FROM rate_limits WHERE key=?", key);
      if (r.count > 15)
        throw fail(429, "Too many attempts. Please try again in 15 minutes.");
    }
  };
  async function signIn(req, res, user) {
    const token = randomBytes(32).toString("hex");
    await db.batch([
      ["DELETE FROM sessions WHERE expires_at<?", Date.now()],
      [
        "INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)",
        hash(token),
        user.id,
        Date.now() + 7 * 86400000,
      ],
      [
        "INSERT INTO cart_items(owner,product_id,quantity) SELECT ?,product_id,quantity FROM cart_items WHERE owner=? ON CONFLICT(owner,product_id) DO UPDATE SET quantity=MIN(20,cart_items.quantity+excluded.quantity)",
        "u:" + user.id,
        req.guest,
      ],
      ["DELETE FROM cart_items WHERE owner=?", req.guest],
    ]);
    res.cookie(authCookie, token, cookieOptions);
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/auth/me", (req, res) => res.json(req.user));
  app.post("/api/auth/register", async (req, res) => {
    await rate(req);
    const input = credentials
      .extend({ name: z.string().trim().min(2).max(80) })
      .parse(req.body);
    const user = { ...input, id: randomUUID(), role: "customer" };
    try {
      await db.run(
        "INSERT INTO users(id,name,email,password,role,created_at) VALUES (?,?,?,?,?,?)",
        user.id,
        user.name,
        user.email,
        await bcrypt.hash(input.password, 12),
        "customer",
        Date.now(),
      );
    } catch (e) {
      if (/UNIQUE/.test(e.message))
        throw fail(409, "An account already exists with that email.");
      throw e;
    }
    res.status(201);
    await signIn(req, res, user);
  });
  app.post("/api/auth/login", async (req, res) => {
    await rate(req);
    const input = credentials.parse(req.body);
    const user = await db.one("SELECT * FROM users WHERE email=?", input.email);
    const valid = await bcrypt.compare(
      input.password,
      user?.password ||
        "$2b$12$kS75XE/8CXAkloHZBtgszOvDS3Nh4gWcJr6.kYVRRaQ8WO5i9WT1G",
    );
    if (!user || !valid) throw fail(401, "Email or password is incorrect.");
    await signIn(req, res, user);
  });
  app.post("/api/auth/logout", async (req, res) => {
    const t = req.cookies[authCookie];
    if (t) await db.run("DELETE FROM sessions WHERE token=?", hash(t));
    res.clearCookie(authCookie, cookieOptions);
    res.json({ ok: true });
  });
  app.put("/api/auth/password", auth, async (req, res) => {
    const v = z
      .object({
        currentPassword: z.string(),
        password: z.string().min(10).max(72),
      })
      .parse(req.body);
    const u = await db.one(
      "SELECT password FROM users WHERE id=?",
      req.user.id,
    );
    if (!(await bcrypt.compare(v.currentPassword, u.password)))
      throw fail(400, "Current password is incorrect.");
    await db.batch([
      [
        "UPDATE users SET password=? WHERE id=?",
        await bcrypt.hash(v.password, 12),
        req.user.id,
      ],
      ["DELETE FROM sessions WHERE user_id=?", req.user.id],
    ]);
    res.clearCookie(authCookie, cookieOptions);
    res.json({ ok: true });
  });
  app.get("/api/products", async (req, res) => {
    res.json(
      await db.all(
        "SELECT * FROM products WHERE active=1 ORDER BY featured DESC,name",
      ),
    );
  });
  app.get("/api/products/:id", async (req, res) => {
    const p = await db.one(
      "SELECT * FROM products WHERE id=? AND active=1",
      req.params.id,
    );
    if (!p) throw fail(404, "This piece is no longer available.");
    res.json(p);
  });
  const getCart = (owner) =>
    db.all(
      "SELECT p.*,c.quantity FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.owner=?",
      owner,
    );
  app.get("/api/cart", async (req, res) => res.json(await getCart(req.owner)));
  app.put("/api/cart/:id", async (req, res) => {
    const { quantity } = z
      .object({ quantity: z.number().int().min(0).max(20) })
      .parse(req.body);
    if (!quantity) {
      await db.run(
        "DELETE FROM cart_items WHERE owner=? AND product_id=?",
        req.owner,
        req.params.id,
      );
    } else {
      const p = await db.one(
        "SELECT stock,active FROM products WHERE id=?",
        req.params.id,
      );
      if (!p || !p.active) throw fail(404, "Product unavailable.");
      if (quantity > p.stock) throw fail(409, `Only ${p.stock} available.`);
      await db.run(
        "INSERT INTO cart_items(owner,product_id,quantity) VALUES (?,?,?) ON CONFLICT(owner,product_id) DO UPDATE SET quantity=excluded.quantity",
        req.owner,
        req.params.id,
        quantity,
      );
    }
    res.json(await getCart(req.owner));
  });
  app.get("/api/wishlist", auth, async (req, res) =>
    res.json(
      await db.all(
        "SELECT p.* FROM wishlist w JOIN products p ON p.id=w.product_id WHERE w.user_id=? AND p.active=1",
        req.user.id,
      ),
    ),
  );
  app.put("/api/wishlist/:id", auth, async (req, res) => {
    const { saved } = z.object({ saved: z.boolean() }).parse(req.body);
    const p = await db.one(
      "SELECT id FROM products WHERE id=? AND active=1",
      req.params.id,
    );
    if (!p) throw fail(404, "Product unavailable.");
    if (saved)
      await db.run(
        "INSERT OR IGNORE INTO wishlist(user_id,product_id) VALUES (?,?)",
        req.user.id,
        p.id,
      );
    else
      await db.run(
        "DELETE FROM wishlist WHERE user_id=? AND product_id=?",
        req.user.id,
        p.id,
      );
    res.json({ saved });
  });
  const withItems = async (orders) =>
    Promise.all(
      orders.map(async (o) => ({
        ...o,
        address: JSON.parse(o.address),
        items: await db.all("SELECT * FROM order_items WHERE order_id=?", o.id),
      })),
    );
  app.get("/api/orders", auth, async (req, res) =>
    res.json(
      await withItems(
        await db.all(
          "SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC",
          req.user.id,
        ),
      ),
    ),
  );
  app.post("/api/orders", auth, async (req, res) => {
    const data = z
      .object({
        requestKey: z.string().uuid(),
        address: z.object({
          name: z.string().trim().min(2).max(100),
          phone: z.string().trim().min(7).max(30),
          line1: z.string().trim().min(5).max(200),
          city: z.string().trim().min(2).max(100),
          country: z.string().trim().min(2).max(100),
          notes: z.string().max(500).default(""),
        }),
      })
      .parse(req.body);
    const key = req.user.id + ":" + data.requestKey;
    const existing = await db.one(
      "SELECT * FROM orders WHERE request_key=?",
      key,
    );
    if (existing) return res.json((await withItems([existing]))[0]);
    const cart = await getCart(req.owner);
    if (!cart.length) throw fail(400, "Your bag is empty.");
    if (cart.some((p) => !p.active || p.stock < p.quantity))
      throw fail(
        409,
        "One of your pieces is no longer available in that quantity. Please update your bag.",
      );
    const subtotal = cart.reduce((s, p) => s + p.price * p.quantity, 0),
      shipping = subtotal >= 100000 ? 0 : 4900,
      id = randomUUID();
    const queries = [
      [
        "INSERT INTO orders(id,user_id,request_key,subtotal,shipping,total,address,created_at) VALUES (?,?,?,?,?,?,?,?)",
        id,
        req.user.id,
        key,
        subtotal,
        shipping,
        subtotal + shipping,
        JSON.stringify(data.address),
        Date.now(),
      ],
    ];
    for (const p of cart) {
      queries.push([
        "UPDATE products SET stock=CASE WHEN active=1 AND stock>=? AND price=? THEN stock-? ELSE -1 END WHERE id=?",
        p.quantity,
        p.price,
        p.quantity,
        p.id,
      ]);
      queries.push([
        "INSERT INTO order_items(id,order_id,product_id,name,image,price,quantity) VALUES (?,?,?,?,?,?,?)",
        randomUUID(),
        id,
        p.id,
        p.name,
        p.image,
        p.price,
        p.quantity,
      ]);
      queries.push([
        "DELETE FROM cart_items WHERE owner=? AND product_id=?",
        req.owner,
        p.id,
      ]);
    }
    try {
      await db.batch(queries);
    } catch (e) {
      const repeat = await db.one(
        "SELECT * FROM orders WHERE request_key=?",
        key,
      );
      if (repeat) return res.json((await withItems([repeat]))[0]);
      if (/CHECK|constraint/i.test(e.message))
        throw fail(
          409,
          "Stock or price changed. Please review your bag and try again.",
        );
      throw e;
    }
    res
      .status(201)
      .json(
        (
          await withItems([await db.one("SELECT * FROM orders WHERE id=?", id)])
        )[0],
      );
  });
  app.get("/api/admin/products", admin, async (req, res) =>
    res.json(await db.all("SELECT * FROM products ORDER BY name")),
  );
  app.post("/api/admin/products", admin, async (req, res) => {
    const p = productSchema.parse(req.body),
      id = randomUUID();
    await db.run(
      "INSERT INTO products(id,name,category,price,description,material,dimensions,color,image,stock,featured,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      p.name,
      p.category,
      p.price,
      p.description,
      p.material,
      p.dimensions,
      p.color,
      p.image,
      p.stock,
      p.featured,
      p.active,
    );
    res.status(201).json({ id, ...p });
  });
  app.put("/api/admin/products/:id", admin, async (req, res) => {
    const p = productSchema.parse(req.body);
    const exists = await db.one(
      "SELECT id FROM products WHERE id=?",
      req.params.id,
    );
    if (!exists) throw fail(404, "Product not found.");
    await db.run(
      "UPDATE products SET name=?,category=?,price=?,description=?,material=?,dimensions=?,color=?,image=?,stock=?,featured=?,active=? WHERE id=?",
      p.name,
      p.category,
      p.price,
      p.description,
      p.material,
      p.dimensions,
      p.color,
      p.image,
      p.stock,
      p.featured,
      p.active,
      req.params.id,
    );
    res.json({ id: req.params.id, ...p });
  });
  app.get("/api/admin/orders", admin, async (req, res) =>
    res.json(
      await withItems(
        await db.all(
          "SELECT o.*,u.name AS customer_name,u.email AS customer_email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 500",
        ),
      ),
    ),
  );
  app.patch("/api/admin/orders/:id", admin, async (req, res) => {
    const { status } = z
      .object({
        status: z.enum([
          "confirmed",
          "processing",
          "shipped",
          "delivered",
          "cancelled",
        ]),
      })
      .parse(req.body);
    const o = await db.one("SELECT * FROM orders WHERE id=?", req.params.id);
    if (!o) throw fail(404, "Order not found.");
    const allowed = {
      confirmed: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };
    if (!allowed[o.status].includes(status))
      throw fail(400, "That order status transition is not allowed.");
    if (status === "cancelled") {
      const items = await db.all(
        "SELECT * FROM order_items WHERE order_id=?",
        o.id,
      );
      const queries = items.map((i) => [
        "UPDATE products SET stock=stock+? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status=?)",
        i.quantity,
        i.product_id,
        o.id,
        o.status,
      ]);
      queries.push([
        "UPDATE orders SET status=? WHERE id=? AND status=?",
        status,
        o.id,
        o.status,
      ]);
      await db.batch(queries);
    } else
      await db.run(
        "UPDATE orders SET status=? WHERE id=? AND status=?",
        status,
        o.id,
        o.status,
      );
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({
          message: err.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
    if (err.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON." });
    if (err.type === "entity.too.large")
      return res.status(413).json({ message: "Request is too large." });
    if (!err.status) console.error("Request failed:", err.message);
    res
      .status(err.status || 503)
      .json({
        message: err.status
          ? err.message
          : "The store is temporarily unavailable. Please try again.",
      });
  });
  return app;
}
