import "dotenv/config";

function optional(name: string): string {
  return process.env[name] ?? "";
}

function isViteDev(): boolean {
  try {
    const meta = import.meta as any;
    if (meta.env?.DEV === true) return true;
    if (meta.env?.PROD === false) return true;
    if (meta.hot) return true; // Vite HMR marker
  } catch {
    // ignore
  }
  // Fallback: detect Vite CLI in process arguments
  try {
    if (process.argv.some((a) => a.includes("vite"))) return true;
  } catch {}
  return false;
}

/** postgres-js expects `postgres://` not `postgresql://`; normalize Supabase URLs */
function normalizeDatabaseUrl(url: string): string {
  if (url.startsWith("postgresql://")) {
    return "postgres://" + url.slice("postgresql://".length);
  }
  return url;
}

export const env = {
  appId: optional("APP_ID"),
  appSecret: optional("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production" && !isViteDev(),
  databaseUrl: normalizeDatabaseUrl(optional("DATABASE_URL")),
  skipAutoMigrate: optional("SKIP_AUTO_MIGRATE") === "1",
};
