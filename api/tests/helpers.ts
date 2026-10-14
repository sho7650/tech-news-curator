import { expect } from "vitest";
import { setRateLimitEnabled } from "../src/middleware/rate-limit.js";
import { articleBroker } from "../src/services/sse-broker.js";

// Disable rate limiting in tests
setRateLimitEnabled(false);

// Must match API_KEYS set in setup.ts before config loads.
export const TEST_API_KEY = "test-key-for-testing";

// The SSE route unsubscribes in a finally block after its 1s wait loop notices
// the abort, so tests that open a stream must drain the shared broker before
// another test reasons about its client count.
export async function waitForBrokerDrain(timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (articleBroker.clientCount > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(articleBroker.clientCount).toBe(0);
}

export function jsonHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": TEST_API_KEY,
  };
}
