import crypto from "node:crypto";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.js";

function constantTimeMatch(keys: string[], candidate: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  let found = false;
  for (const key of keys) {
    const keyBuf = Buffer.from(key);
    if (keyBuf.length === candidateBuf.length && crypto.timingSafeEqual(keyBuf, candidateBuf)) {
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
