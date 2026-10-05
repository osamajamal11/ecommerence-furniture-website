import { build as viteBuild } from "vite";
import { build } from "esbuild";
import { mkdir, cp, writeFile } from "node:fs/promises";
await viteBuild();
await mkdir("dist/server", { recursive: true });
await build({
  entryPoints: ["server/worker.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  external: ["node:*", "cloudflare:*"],
  banner: {
    js: "import { createRequire } from 'node:module';const require = createRequire('/worker.js');",
  },
});
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await writeFile(
  "dist/server/wrangler.json",
  JSON.stringify({
    name: "hearth-and-form",
    main: "index.js",
    compatibility_date: "2026-08-01",
    compatibility_flags: ["nodejs_compat", "enable_nodejs_http_server_modules"],
    assets: {
      directory: "../client",
      binding: "ASSETS",
      run_worker_first: true,
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "hearth-store",
        database_id: "00000000-0000-0000-0000-000000000000",
      },
    ],
  }),
);
