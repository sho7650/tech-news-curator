import type { Context } from "hono";

interface ValidationResult {
  success: boolean;
  // hono-openapi's validator passes a standard-schema issue array; zod's
  // validator passes a ZodError. Both are reduced to an issue list.
  error?: unknown;
}

function toIssues(error: unknown): unknown[] {
  if (Array.isArray(error)) return error;
  if (error && typeof error === "object" && "errors" in error) {
    const { errors } = error as { errors: unknown };
    return Array.isArray(errors) ? errors : [];
  }
  return [];
}

export function validationHook(result: ValidationResult, c: Context): Response | undefined {
  if (!result.success) {
    return c.json({ detail: toIssues(result.error) }, 422);
  }
}
