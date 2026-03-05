import type { Context, Next } from "hono";
import { config } from "../config.js";

const SKIP_CSP_PATHS = new Set(["/docs", "/redoc", "/openapi.json", "/feed/rss"]);

export async function securityHeaders(c: Context, next: Next): Promise<void> {
  await next();

  c.header("X-Content-Type-Options", "nosniff");
  if (config.environment === "production") {
    c.header("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("X-XSS-Protection", "0");

  if (c.req.path === "/feed/rss") {
    c.header("Cache-Control", "public, max-age=300");
  } else {
    c.header("Cache-Control", "no-store");
  }

  if (!SKIP_CSP_PATHS.has(c.req.path)) {
    c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
}
