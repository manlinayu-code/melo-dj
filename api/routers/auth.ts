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

      console.log(`[auth.register] Attempting to register user: ${input.name}`);

      try {
        const existing = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        console.log(`[auth.register] Existing users with name '${input.name}': ${existing.length}`);
        if (existing.length > 0) {
          console.log(`[auth.register] Rejected: username already exists`);
          return { success: false, error: "Username already exists", token: null };
        }

        const hashed = hashPassword(input.password);
        console.log(`[auth.register] Inserting new user with hashed password`);
        await db.insert(users).values({
          name: input.name,
          password: hashed,
          avatar: `/melo-avatar.jpg`,
        });
        console.log(`[auth.register] Insert completed, re-querying...`);

        // TiDB may return insertId as 0n, so re-query to get the actual id
        const newUsers = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        console.log(`[auth.register] Re-query found ${newUsers.length} user(s)`);
        if (newUsers.length === 0) {
          console.error(`[auth.register] CRITICAL: User inserted but not found on re-query`);
          return { success: false, error: "Failed to create user", token: null };
        }
        const userId = Number(newUsers[0].id);
        console.log(`[auth.register] Success: created user id=${userId}`);
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

      console.log(`[auth.login] Attempting login for user: ${input.name}`);

      try {
        const rows = await db.select().from(users).where(eq(users.name, input.name)).limit(1);
        console.log(`[auth.login] Found ${rows.length} user(s)`);
        if (rows.length === 0) {
          return { success: false, error: "User not found", token: null };
        }

        const user = rows[0];
        const passwordValid = user.password ? verifyPassword(input.password, user.password) : false;
        console.log(`[auth.login] Password valid: ${passwordValid}`);
        if (!user.password || !passwordValid) {
          return { success: false, error: "Invalid password", token: null };
        }

        const token = signJWT({ userId: user.id, name: user.name });
        console.log(`[auth.login] Success for user id=${user.id}`);
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
