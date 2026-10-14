import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { cors } from "hono/cors";
import { config } from "./config.js";
import type { DB } from "./database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { securityHeaders } from "./middleware/security-headers.js";
import { openApiDocumentation, validationErrorResponse } from "./openapi.js";
import {
  type ExtractArticle,
  createArticlesRoute,
  createDigestRoute,
  createFeedRoute,
  createHealthRoute,
  createIngestRoute,
  createSourcesRoute,
  sseRoute,
} from "./routes/index.js";
import type { AppEnv } from "./types.js";

export interface AppDeps {
  extractArticle?: ExtractArticle;
}

// Single place that wires middleware and routes, used by the server and by
// tests, so registration order and auth attachment are covered by the suite.
export function createApp(db: DB, deps: AppDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError(errorHandler);

  app.use(
    "*",
    cors({
      origin: config.corsOrigins,
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type", "Accept", "X-API-Key"],
    }),
  );
  app.use("*", securityHeaders);
  app.use("*", requestLogger);

  // Order matters: SSE before articles so "stream" is not parsed as :article_id.
  app.route("", createHealthRoute(db));
  app.route("", createIngestRoute(deps.extractArticle));
  app.route("", sseRoute);
  app.route("", createArticlesRoute(db));
  app.route("", createDigestRoute(db));
  app.route("", createSourcesRoute(db));
  app.route("", createFeedRoute(db));

  // Generated from the validators and describeRoute() metadata above; the
  // frontend types are produced from this document (see api/openapi.json).
  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: openApiDocumentation,
      excludeMethods: ["OPTIONS"],
      defaultValidationErrorResponse: validationErrorResponse,
    }),
  );

  return app;
}
