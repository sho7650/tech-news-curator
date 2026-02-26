import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";

export function getPgErrorCode(err: unknown): string | undefined {
  // Direct postgres.js error
  if (err && typeof err === "object" && "code" in err && typeof (err as any).code === "string") {
    return (err as any).code;
  }
  // Drizzle wraps postgres.js errors in cause
  if (err && typeof err === "object" && "cause" in err) {
    const cause = (err as any).cause;
    if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
      return cause.code;
    }
  }
  return undefined;
}

function getPgErrorMessage(err: unknown): string | undefined {
  const inner = err && typeof err === "object" && "cause" in err ? (err as any).cause : err;
  if (inner && typeof inner === "object" && "message" in inner) {
    return (inner as any).message;
  }
  return undefined;
}

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return c.json({ detail: err.message }, err.status);
  }

  const pgCode = getPgErrorCode(err);

  if (pgCode) {
    // PostgreSQL unique constraint violation (23505)
    if (pgCode === "23505") {
      return c.json({ detail: "Resource conflict" }, 409);
    }

    // Other PostgreSQL integrity constraint violations — log for debugging
    if (pgCode.startsWith("23")) {
      const pgMessage = getPgErrorMessage(err);
      console.error(`PostgreSQL constraint error [${pgCode}]:`, pgMessage ?? err.message);
      return c.json({ detail: "Data integrity error" }, 422);
    }
  }

  console.error("Unhandled error:", err);
  return c.json({ detail: "Internal server error" }, 500);
}
