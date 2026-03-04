import type { Context } from "hono";
import type { ZodError } from "zod";

export function validationHook(
  result: { success: boolean; error?: ZodError },
  c: Context,
): Response | undefined {
  if (!result.success) {
    return c.json({ detail: result.error!.errors }, 422);
  }
}
