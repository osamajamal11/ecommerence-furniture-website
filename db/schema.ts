import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("customer"),
  createdAt: integer("created_at").notNull(),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    price: integer("price").notNull(),
    description: text("description").notNull(),
    material: text("material").notNull(),
    dimensions: text("dimensions").notNull(),
    color: text("color").notNull(),
    image: text("image").notNull(),
    stock: integer("stock").notNull(),
    featured: integer("featured").notNull().default(0),
    active: integer("active").notNull().default(1),
  },
  (t) => [
    check("stock_nonnegative", sql`${t.stock} >= 0`),
    check("price_positive", sql`${t.price} > 0`),
  ],
);
export const carts = sqliteTable(
  "cart_items",
  {
    owner: text("owner").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.owner, t.productId] }),
    check("quantity_valid", sql`${t.quantity} BETWEEN 1 AND 20`),
  ],
);
export const wishes = sqliteTable(
  "wishlist",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestKey: text("request_key").notNull().unique(),
    status: text("status").notNull().default("confirmed"),
    subtotal: integer("subtotal").notNull(),
    shipping: integer("shipping").notNull(),
    total: integer("total").notNull(),
    address: text("address").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("orders_user_idx").on(t.userId)],
);
export const items = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    image: text("image").notNull(),
    price: integer("price").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("items_order_idx").on(t.orderId)],
);
export const limits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
