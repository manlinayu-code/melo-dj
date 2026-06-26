// Shared rate limiter and timeout helpers for netease API calls.
// Used by both netease router and library router.

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 1000;
const rateWindow: number[] = [];

const DEFAULT_TIMEOUT_MS = 5000;

export async function rateLimitGate(): Promise<void> {
  while (true) {
    const now = Date.now();
    while (rateWindow.length > 0 && now - rateWindow[0] > RATE_LIMIT_WINDOW_MS) {
      rateWindow.shift();
    }
    if (rateWindow.length < RATE_LIMIT_MAX) {
      rateWindow.push(now);
      return;
    }
    const waitMs = RATE_LIMIT_WINDOW_MS - (now - rateWindow[0]) + 5;
    await new Promise((r) => setTimeout(r, Math.max(20, waitMs)));
  }
}

export async function withTimeout<T>(
  p: Promise<T>,
  ms = DEFAULT_TIMEOUT_MS,
  label = "netease",
): Promise<T> {
  return await Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export async function gated<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await rateLimitGate();
  return await withTimeout(fn(), DEFAULT_TIMEOUT_MS, label);
}
