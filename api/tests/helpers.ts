import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "../src/config.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { securityHeaders } from "../src/middleware/security-headers.js";
import { setRateLimitEnabled } from "../src/middleware/rate-limit.js";

// Disable rate limiting in tests
setRateLimitEnabled(false);

// Set test API key
config.apiKeys = ["test-key-for-testing"];

export const TEST_API_KEY = "test-key-for-testing";

export function createTestApp(): Hono {
  const app = new Hono();
  app.onError(errorHandler);
  app.use(
    "*",
    cors({
      origin: ["http://localhost:3100"],
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type", "Accept", "X-API-Key"],
    }),
  );
  app.use("*", securityHeaders);
  return app;
}

export function authHeaders(): Record<string, string> {
  return { "X-API-Key": TEST_API_KEY };
}

export function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": TEST_API_KEY,
  };
}
