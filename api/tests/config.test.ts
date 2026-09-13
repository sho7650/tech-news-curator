import { afterEach, describe, expect, it, vi } from "vitest";
import { validateProduction } from "../src/config.js";

describe("loadConfig env fallbacks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("falls back to defaults when PUBLIC_URL and FETCH_USER_AGENT are empty strings", async () => {
    // Compose passes `${VAR}` as an empty string when unset in .env.
    vi.stubEnv("PUBLIC_URL", "");
    vi.stubEnv("FETCH_USER_AGENT", "");
    vi.resetModules();

    const { config } = await import("../src/config.js");

    expect(config.publicUrl).toBe("http://localhost:3100");
    expect(config.fetchUserAgent).toMatch(/^Mozilla\/5\.0/);
  });

  it("parses TRUSTED_PROXIES as a CSV list and defaults to empty", async () => {
    vi.stubEnv("TRUSTED_PROXIES", "10.0.0.0/8, 172.16.0.0/12");
    vi.resetModules();
    const withProxies = await import("../src/config.js");
    expect(withProxies.config.trustedProxies).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);

    vi.stubEnv("TRUSTED_PROXIES", "");
    vi.resetModules();
    const without = await import("../src/config.js");
    expect(without.config.trustedProxies).toEqual([]);
  });

  it("uses PUBLIC_URL and FETCH_USER_AGENT when set", async () => {
    vi.stubEnv("PUBLIC_URL", "https://news.example.com");
    vi.stubEnv("FETCH_USER_AGENT", "curator-bot/1.0");
    vi.resetModules();

    const { config } = await import("../src/config.js");

    expect(config.publicUrl).toBe("https://news.example.com");
    expect(config.fetchUserAgent).toBe("curator-bot/1.0");
  });
});

function productionConfig(overrides: Partial<Parameters<typeof validateProduction>[0]> = {}) {
  return {
    databaseUrl: "postgresql://news:secret@news-db:5432/news_curator",
    databaseAdminUrl: "",
    environment: "production",
    corsOrigins: ["https://news.example.com"],
    apiKeys: ["k1"],
    publicUrl: "https://news.example.com",
    fetchUserAgent: "Mozilla/5.0",
    ...overrides,
  };
}

describe("validateProduction", () => {
  it("accepts a fully configured production config", () => {
    expect(() => validateProduction(productionConfig())).not.toThrow();
  });

  it("skips validation outside production", () => {
    expect(() =>
      validateProduction(
        productionConfig({ environment: "development", publicUrl: "http://localhost:3100" }),
      ),
    ).not.toThrow();
  });

  it("rejects placeholder database credentials", () => {
    expect(() =>
      validateProduction(
        productionConfig({ databaseUrl: "postgresql://news:CHANGEME@localhost:5432/x" }),
      ),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects an empty API key list", () => {
    expect(() => validateProduction(productionConfig({ apiKeys: [] }))).toThrow(/API_KEYS/);
  });

  it("rejects localhost CORS origins", () => {
    expect(() =>
      validateProduction(productionConfig({ corsOrigins: ["http://localhost:3100"] })),
    ).toThrow(/CORS origin/);
  });

  it("rejects a localhost PUBLIC_URL", () => {
    expect(() =>
      validateProduction(productionConfig({ publicUrl: "http://localhost:3100" })),
    ).toThrow(/PUBLIC_URL/);
    expect(() =>
      validateProduction(productionConfig({ publicUrl: "http://127.0.0.1:3100" })),
    ).toThrow(/PUBLIC_URL/);
  });
});
