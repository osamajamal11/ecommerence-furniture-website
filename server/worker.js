import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createApp } from "./app.js";
const app = createApp(env.DB, {
  origin: env.APP_ORIGIN,
  production: true,
  adminEmail: env.ADMIN_EMAIL,
  adminPassword: env.ADMIN_PASSWORD,
  clientIp: (req) => req.headers["cf-connecting-ip"] || "unknown",
});
app.listen(3000);
const handler = httpServerHandler({ port: 3000 });
export default {
  async fetch(request, environment, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return handler.fetch(request, environment, ctx);
    let r = await environment.ASSETS.fetch(request);
    if (
      r.status === 404 &&
      request.method === "GET" &&
      request.headers.get("accept")?.includes("text/html")
    )
      return environment.ASSETS.fetch(
        new Request(new URL("/index.html", request.url), request),
      );
    return r;
  },
};
