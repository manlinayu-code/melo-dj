import type { Hono } from "hono";

const ALLOWED_HOST_SUFFIXES = [
  ".126.net",
  ".music.163.com",
  "music.126.net",
  "music.163.com",
];

function isAllowedHost(hostname: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(
    (s) => hostname === s || hostname.endsWith(s),
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Type",
  };
}

export function registerAudioProxy(app: Hono<any>) {
  app.options("/api/audio/proxy", (c) => {
    const headers = corsHeaders();
    return new Response(null, { status: 204, headers });
  });

  const handler = async (c: any) => {
    const url = c.req.query("url");
    if (!url || typeof url !== "string") {
      return c.text("Missing url", 400);
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return c.text("Invalid url", 400);
    }

    if (!isAllowedHost(parsed.hostname)) {
      return c.text(`Forbidden host: ${parsed.hostname}`, 403);
    }

    const range = c.req.header("range");
    const upstreamHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: "https://music.163.com/",
    };
    if (range) upstreamHeaders["Range"] = range;

    let upstream: Response;
    try {
      upstream = await fetch(parsed.toString(), {
        method: c.req.method === "HEAD" ? "HEAD" : "GET",
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch (err) {
      console.error("[audioProxy] fetch failed:", (err as Error).message);
      return c.text("Upstream fetch failed", 502);
    }

    const responseHeaders = new Headers();
    const forward = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "expires",
      "last-modified",
      "etag",
    ];
    for (const k of forward) {
      const v = upstream.headers.get(k);
      if (v) responseHeaders.set(k, v);
    }
    if (!responseHeaders.has("content-type")) {
      responseHeaders.set("content-type", "audio/mpeg");
    }
    if (!responseHeaders.has("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }
    for (const [k, v] of Object.entries(corsHeaders())) {
      responseHeaders.set(k, v);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  };

  app.get("/api/audio/proxy", handler);
  app.on("HEAD", "/api/audio/proxy", handler);
}
