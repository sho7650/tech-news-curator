import type { AppLogger } from "./lib/logger.js";

export type AppEnv = {
  Variables: {
    logger: AppLogger;
  };
};
