import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { serve } from "@hono/node-server";
import { serveStaticFiles } from "./lib/vite";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { runAutoMigrate } from "./lib/autoMigrate";
import { registerAudioProxy } from "./lib/audioProxy";
import { startCron } from "./lib/syncScheduler";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));
registerAudioProxy(app);
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

console.log(`[boot] Starting... NODE_ENV=${process.env.NODE_ENV}, isProduction=${env.isProduction}`);

if (env.isProduction) {
  console.log("[boot] Production mode detected, starting server...");

  process.on("uncaughtException", (err) => {
    console.error("[boot] Uncaught Exception:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[boot] Unhandled Rejection:", reason);
    process.exit(1);
  });

  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000", 10);
  console.log(`[boot] Starting HTTP server on port ${port}...`);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[boot] Server running on port ${(info as any)?.port || port}`);
  });

  runAutoMigrate()
    .then(() => {
      console.log("[boot] Migration step done");
    })
    .catch((err) => {
      console.error("[boot] Migration step failed; continuing to serve app:", err);
    })
    .finally(() => {
      startCron();
    });
} else {
  console.log("[boot] Not production, skipping server start");
}
