import { describe, it, expect } from "vitest";
import { buildBrowserHeaders } from "../src/services/browser-headers.js";

describe("buildBrowserHeaders", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/137.0.0.0 Safari/537.36";
  const h = buildBrowserHeaders(ua);

  it("passes the User-Agent through", () => {
    expect(h["User-Agent"]).toBe(ua);
  });

  it("requests gzip/deflate/br compression", () => {
    expect(h["Accept-Encoding"]).toContain("gzip");
    expect(h["Accept-Encoding"]).toContain("br");
  });

  it("includes Sec-Fetch navigation headers", () => {
    expect(h["Sec-Fetch-Mode"]).toBe("navigate");
    expect(h["Sec-Fetch-Dest"]).toBe("document");
  });

  it("includes client-hint and upgrade headers", () => {
    expect(h["Sec-Ch-Ua"]).toBeDefined();
    expect(h["Upgrade-Insecure-Requests"]).toBe("1");
  });

  it("includes an HTML Accept header", () => {
    expect(h["Accept"]).toContain("text/html");
  });
});
