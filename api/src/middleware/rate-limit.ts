import { rateLimiter } from "hono-rate-limiter";

export let rateLimitEnabled = true;

export function setRateLimitEnabled(enabled: boolean): void {
  rateLimitEnabled = enabled;
}

function getRemoteAddress(c: { req: { header: (name: string) => string | undefined } }): string {
  // Prefer X-Real-IP (set by trusted reverse proxies like nginx)
  // Fall back to last entry of X-Forwarded-For (closest proxy hop) to resist spoofing
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim());
    return parts[parts.length - 1] || "unknown";
  }
  return "unknown";
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
