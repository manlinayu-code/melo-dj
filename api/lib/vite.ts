import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type App = Hono<{ Bindings: HttpBindings }>;

function getCurrentDir(): string {
  // In CJS, __dirname is available (production bundle)
  if (typeof __dirname !== "undefined") return __dirname;
  // Fallback for ESM or bundled environments
  try {
    return path.dirname(fileURLToPath((import.meta as any).url));
  } catch {
    return process.cwd();
  }
}

function findPublicDir(): string {
  const currentDir = getCurrentDir();
  
  // Production: boot.cjs is in dist/, public is dist/public/
  const prodPath = path.resolve(currentDir, "public");
  if (fs.existsSync(prodPath)) return prodPath;
  
  // Development: vite.ts is in api/lib/, need to go up to dist/public/
  const devPath = path.resolve(currentDir, "../../dist/public");
  if (fs.existsSync(devPath)) return devPath;
  
  // Fallback: try cwd + dist/public
  const cwdPath = path.resolve(process.cwd(), "dist/public");
  if (fs.existsSync(cwdPath)) return cwdPath;
  
  return prodPath;
}

export function serveStaticFiles(app: App) {
  const distPath = findPublicDir();

  app.use("*", serveStatic({ root: distPath }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const indexPath = path.resolve(distPath, "index.html");
    const content = fs.readFileSync(indexPath, "utf-8");
    return c.html(content);
  });
}
