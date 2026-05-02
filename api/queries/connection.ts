import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../lib/env";
import { parseDatabaseUrl } from "../lib/dbConfig";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!env.databaseUrl) {
    return null;
  }
  if (!instance) {
    const config = parseDatabaseUrl(env.databaseUrl);
    console.log(
      `[db] Connecting to ${config.host}:${config.port} as ${config.user}, ssl=${config.ssl ? "enabled" : "disabled"}`
    );
    const pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    instance = drizzle(pool, {
      schema: fullSchema,
      mode: "default",
    });
  }
  return instance;
}
