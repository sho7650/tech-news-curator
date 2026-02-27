import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.js";

export async function verifyApiKey(c: Context, next: Next): Promise<void> {
  const keys = config.apiKeys;
  if (keys.length === 0) {
    // No keys configured (development mode) — skip auth
    await next();
    return;
  }

  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || !keys.includes(apiKey)) {
    throw new HTTPException(401, { message: "Invalid or missing API key" });
  }

  await next();
}
