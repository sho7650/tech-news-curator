import { resolver } from "hono-openapi";
import type { OpenAPIV3_1 } from "openapi-types";
import type { z } from "zod";
import { errorResponseSchema } from "./schemas/base.js";

// Small vocabulary for describeRoute() so route files stay declarative.

export const API_KEY_SECURITY = [{ apiKey: [] }];

export function jsonResponse(description: string, schema: z.ZodTypeAny) {
  return {
    description,
    content: { "application/json": { schema: resolver(schema) } },
  };
}

export function errorResponse(description: string) {
  return jsonResponse(description, errorResponseSchema);
}

export const openApiDocumentation = {
  info: {
    title: "Tech News Curator API",
    version: "1.0.0",
    description:
      "Storage, extraction, and delivery layer for the n8n-orchestrated tech news pipeline. " +
      "Write endpoints require the X-API-Key header.",
  },
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
} as const;

// All 422 responses share the { detail: issues[] } envelope from validationHook.
export const validationErrorResponse: OpenAPIV3_1.ResponseObject = {
  description: "Request validation failed",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          detail: { type: "array", items: { type: "object" } },
        },
        required: ["detail"],
      },
    },
  },
};
