import type { HttpBindings } from "@hono/node-server";
import type { AppLogger } from "./lib/logger.js";

export type AppEnv = {
  // Present when served by @hono/node-server; absent under app.request() in tests.
  Bindings: HttpBindings;
  Variables: {
    logger: AppLogger;
  };
};
