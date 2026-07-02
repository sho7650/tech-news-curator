import { describe, it, expect } from "vitest";
import { buildTlsOptions } from "../src/services/tls-fingerprint.js";

describe("buildTlsOptions", () => {
  const o = buildTlsOptions();

  it("sets the minimum TLS version to 1.2", () => {
    expect(o.minVersion).toBe("TLSv1.2");
  });

  it("advertises only http/1.1 via ALPN (Node cannot serve h2)", () => {
    expect(o.ALPNProtocols).toEqual(["http/1.1"]);
  });

  it("provides a non-empty cipher list", () => {
    expect(typeof o.ciphers).toBe("string");
    expect(o.ciphers.length).toBeGreaterThan(0);
  });
});
