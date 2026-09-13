import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types.js";
import { verifyApiKey } from "./auth.js";
import { createRateLimiter } from "./rate-limit.js";

// Every write endpoint shares this pair, rate limit first so key guessing is
// throttled. Swapping the auth scheme (Phase 3.1) is a one-line change here.
export function writeGuard(limit: number): [MiddlewareHandler<AppEnv>, MiddlewareHandler<AppEnv>] {
  return [createRateLimiter(limit), verifyApiKey];
}
