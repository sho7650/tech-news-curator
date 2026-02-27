import type { Context, Next } from "hono";

const SKIP_CSP_PATHS = new Set(["/docs", "/redoc", "/openapi.json", "/feed/rss"]);

export async function securityHeaders(c: Context, next: Next): Promise<void> {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  c.header("Cache-Control", "no-store");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-XSS-Protection", "0");

  if (!SKIP_CSP_PATHS.has(c.req.path)) {
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
}
