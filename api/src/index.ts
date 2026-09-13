import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config, validateProduction } from "./config.js";
import { db, queryClient } from "./database.js";
import { rootLogger } from "./lib/logger.js";
import { startMonitor, stopMonitor } from "./services/article-monitor.js";

// Validate production config
validateProduction(config);

const app = createApp(db);

// Start article monitor
startMonitor(db);

const port = Number.parseInt(process.env.PORT ?? "8100", 10);

const server = serve({
  fetch: app.fetch,
  port,
});

rootLogger.info({ port }, "Tech News Curator API started");

// Graceful shutdown
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  rootLogger.info("Shutting down...");
  stopMonitor();

  const forceTimer = setTimeout(() => {
    rootLogger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
  forceTimer.unref();

  server.close(async () => {
    clearTimeout(forceTimer);
    try {
      await queryClient.end();
    } catch (err) {
      rootLogger.error({ err }, "Error closing database connection");
    } finally {
      process.exit(0);
    }
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export { app };
