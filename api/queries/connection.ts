import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

let instance: ReturnType<typeof drizzle<typeof fullSchema>> | null = null;

export function getDb() {
  if (!env.databaseUrl) {
    return null;
  }
  if (!instance) {
    const pool = mysql.createPool({
      uri: env.databaseUrl,
      ssl: {
        rejectUnauthorized: true,
      },
    });
    instance = drizzle(pool, {
      schema: fullSchema,
    });
  }
  return instance;
}
