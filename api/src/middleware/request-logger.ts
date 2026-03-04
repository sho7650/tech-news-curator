import crypto from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { rootLogger } from "../lib/logger.js";
import type { AppEnv } from "../types.js";

export const requestLogger: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = crypto.randomUUID();
  const method = c.req.method;
  const path = c.req.path;

  const logger = rootLogger.child({ requestId, method, path });
  c.set("logger", logger);

  const start = Date.now();
  logger.info("request started");

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  c.header("X-Request-Id", requestId);

  if (status >= 500) {
    logger.error({ status, duration }, "request completed");
  } else if (status >= 400) {
    logger.warn({ status, duration }, "request completed");
  } else {
    logger.info({ status, duration }, "request completed");
  }
};
