export interface Config {
  databaseUrl: string;
  databaseAdminUrl: string;
  environment: string;
  corsOrigins: string[];
  apiKeys: string[];
  publicUrl: string;
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(): Config {
  const corsOriginsRaw = process.env.CORS_ORIGINS ?? "http://localhost:3100,http://localhost:3000";
  const apiKeysRaw = process.env.API_KEYS ?? "";

  return {
    databaseUrl:
      process.env.DATABASE_URL ?? "postgresql://news:CHANGEME@localhost:5432/news_curator",
    databaseAdminUrl: process.env.DATABASE_ADMIN_URL ?? "",
    environment: process.env.ENVIRONMENT ?? "development",
    corsOrigins: parseCsv(corsOriginsRaw),
    apiKeys: parseCsv(apiKeysRaw),
    publicUrl: process.env.PUBLIC_URL ?? "http://localhost:3100",
  };
}

export function validateProduction(config: Config): void {
  if (config.environment !== "production") return;

  if (config.databaseUrl.includes("CHANGEME")) {
    throw new Error(
      "DATABASE_URL contains placeholder credentials. Set DATABASE_URL environment variable for production.",
    );
  }
  if (config.apiKeys.length === 0) {
    throw new Error(
      "API_KEYS must be set in production. Provide at least one API key via API_KEYS environment variable.",
    );
  }
  for (const origin of config.corsOrigins) {
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      throw new Error(
        `CORS origin '${origin}' contains localhost. Remove localhost origins in production.`,
      );
    }
  }
}

export const config = loadConfig();
