import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, validateProduction } from "./config.js";
import { db, queryClient } from "./database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { securityHeaders } from "./middleware/security-headers.js";
import {
  articlesRoute,
  digestRoute,
  feedRoute,
  health,
  ingestRoute,
  sourcesRoute,
  sseRoute,
} from "./routes/index.js";
import { startMonitor, stopMonitor } from "./services/article-monitor.js";

// Validate production config
validateProduction(config);

const app = new Hono();

// Global error handler
app.onError(errorHandler);

// Middleware (applied in order)
app.use(
  "*",
  cors({
    origin: config.corsOrigins,
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
    allowHeaders: ["Content-Type", "Accept", "X-API-Key"],
  }),
);
app.use("*", securityHeaders);

// Routes (order matters: SSE before articles to avoid :article_id catching "stream")
app.route("", health);
app.route("", ingestRoute);
app.route("", sseRoute);
app.route("", articlesRoute);
app.route("", digestRoute);
app.route("", sourcesRoute);
app.route("", feedRoute);

// Start article monitor
startMonitor(db);

const port = Number.parseInt(process.env.PORT ?? "8100", 10);

const server = serve({
  fetch: app.fetch,
  port,
});

console.log(`Tech News Curator API running on port ${port}`);

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  stopMonitor();
  queryClient.end().then(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
