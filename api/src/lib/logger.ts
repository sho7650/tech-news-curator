import { createRequire } from "node:module";
import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const IS_DEV = (process.env.ENVIRONMENT ?? "development") === "development";

function isPinoPrettyAvailable(): boolean {
  try {
    const req = createRequire(import.meta.url);
    req.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

export const rootLogger = pino({
  level: LOG_LEVEL,
  ...(IS_DEV && isPinoPrettyAvailable()
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});

export type AppLogger = pino.Logger;
