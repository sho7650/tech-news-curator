import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { getTestDb } from "./setup.js";

describe("GET /health", () => {
  it("should return healthy status", async () => {
    const app = createApp(getTestDb());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.db).toBe("connected");
  });
});
