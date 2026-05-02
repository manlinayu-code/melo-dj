import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { pbkdf2Sync, randomBytes } from "crypto";
import { signJWT } from "../lib/jwt";

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return derived === hash;
}

export const authRouter = createRouter({
  register: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(50),
        password: z.string().min(4).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) return { success: false, error: "Database not available", token: null };

      try {
        const existing = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        if (existing.length > 0) {
          return { success: false, error: "Username already exists", token: null };
        }

        const hashed = hashPassword(input.password);
        await db.insert(users).values({
          name: input.name,
          password: hashed,
          avatar: `/melo-avatar.jpg`,
        });

        // TiDB may return insertId as 0n, so re-query to get the actual id
        const newUsers = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        if (newUsers.length === 0) {
          return { success: false, error: "Failed to create user", token: null };
        }
        const userId = Number(newUsers[0].id);
        const token = signJWT({ userId, name: input.name });
        return { success: true, token, user: { id: userId, name: input.name } };
      } catch (err: any) {
        console.error("[auth.register] Database error:", err);
        const message = err.cause?.sqlMessage || err.cause?.message || err.message || "Database error";
        return { success: false, error: message || "Unknown database error", token: null };
      }
    }),

  login: publicQuery
    .input(
      z.object({
        name: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) return { success: false, error: "Database not available", token: null };

      try {
        const rows = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        if (rows.length === 0) {
          return { success: false, error: "User not found", token: null };
        }

        const user = rows[0];
        if (!user.password || !verifyPassword(input.password, user.password)) {
          return { success: false, error: "Invalid password", token: null };
        }

        const token = signJWT({ userId: user.id, name: user.name });
        return { success: true, token, user: { id: user.id, name: user.name || "" } };
      } catch (err: any) {
        console.error("[auth.login] Database error:", err);
        const message = err.cause?.sqlMessage || err.cause?.message || err.message || "Database error";
        return { success: false, error: message, token: null };
      }
    }),

  me: publicQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!db || !ctx.user) return { user: null };
    const rows = await db.select().from(users).where(eq(users.id, ctx.user.userId)).limit(1);
    if (rows.length === 0) return { user: null };
    const user = rows[0];
    return { user: { id: user.id, name: user.name, avatar: user.avatar, location: user.location } };
  }),
});
