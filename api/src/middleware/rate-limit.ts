import { rateLimiter } from "hono-rate-limiter";

export let rateLimitEnabled = true;

export function setRateLimitEnabled(enabled: boolean): void {
  rateLimitEnabled = enabled;
}

function getRemoteAddress(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function createRateLimiter(limit: number, windowMs = 60000) {
  return rateLimiter({
    windowMs,
    limit,
    keyGenerator: (c) => {
      if (!rateLimitEnabled) return "disabled";
      return getRemoteAddress(c);
    },
    handler: (c) => {
      return c.json({ detail: "Rate limit exceeded" }, 429);
    },
  });
}
