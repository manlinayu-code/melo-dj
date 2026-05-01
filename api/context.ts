import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { verifyJWT } from "./lib/jwt";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: { userId: number; name: string } | null;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  let user: { userId: number; name: string } | null = null;
  const authHeader = opts.req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    user = verifyJWT(authHeader.slice(7));
  }
  return { req: opts.req, resHeaders: opts.resHeaders, user };
}
