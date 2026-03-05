import crypto from "node:crypto";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.js";

function constantTimeMatch(keys: string[], candidate: string): boolean {
  // HMAC both sides so timingSafeEqual always compares equal-length buffers,
  // preventing length-based timing leaks
  const hmacKey = "api-key-compare";
  const candidateHash = crypto.createHmac("sha256", hmacKey).update(candidate).digest();
  let found = false;
  for (const key of keys) {
    const keyHash = crypto.createHmac("sha256", hmacKey).update(key).digest();
    if (crypto.timingSafeEqual(keyHash, candidateHash)) {
      found = true;
    }
  }
  return found;
}

export async function verifyApiKey(c: Context, next: Next): Promise<void> {
  const keys = config.apiKeys;
  if (keys.length === 0) {
    // No keys configured (development mode) — skip auth
    await next();
    return;
  }

  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || !constantTimeMatch(keys, apiKey)) {
    throw new HTTPException(401, { message: "Invalid or missing API key" });
  }

  await next();
}
