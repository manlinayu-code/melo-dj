import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

const SECRET = env.appSecret || "melo-dj-default-secret-change-me";

export function signJWT(payload: Record<string, unknown>, expiresIn = "7d"): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const days = parseInt(expiresIn) || 7;
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + days * 86400 })
  ).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export function verifyJWT(token: string): { userId: number; name: string } | null {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    const sig = createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(s))) return null;
    const payload = JSON.parse(Buffer.from(b, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, name: payload.name };
  } catch {
    return null;
  }
}
