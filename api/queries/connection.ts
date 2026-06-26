import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!env.databaseUrl) {
    return null;
  }
  if (!instance) {
    console.log(`[db] Connecting to PostgreSQL via postgres-js...`);
    const client = postgres(env.databaseUrl, {
      max: 10,
      idle_timeout: 30,
    });
    instance = drizzle(client, {
      schema: fullSchema,
    });
  }
  return instance;
}
