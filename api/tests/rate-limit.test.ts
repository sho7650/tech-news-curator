import { describe, expect, it } from "vitest";
import { resolveClientIp } from "../src/middleware/rate-limit.js";

describe("resolveClientIp", () => {
  const trusted = ["10.0.0.0/8", "172.16.0.0/12", "::1/128"];

  it("keys on the socket address when no proxies are trusted", () => {
    expect(
      resolveClientIp(
        { socketAddress: "203.0.113.5", realIp: "1.2.3.4", forwardedFor: "5.6.7.8" },
        [],
      ),
    ).toBe("203.0.113.5");
  });

  it("ignores forwarding headers from an untrusted peer", () => {
    expect(
      resolveClientIp(
        { socketAddress: "203.0.113.5", realIp: "1.2.3.4", forwardedFor: "5.6.7.8" },
        trusted,
      ),
    ).toBe("203.0.113.5");
  });

  it("prefers X-Real-IP from a trusted proxy", () => {
    expect(
      resolveClientIp(
        { socketAddress: "10.1.2.3", realIp: "198.51.100.7", forwardedFor: "5.6.7.8, 10.1.2.3" },
        trusted,
      ),
    ).toBe("198.51.100.7");
  });

  it("falls back to the last X-Forwarded-For hop from a trusted proxy", () => {
    expect(
      resolveClientIp(
        { socketAddress: "10.1.2.3", realIp: undefined, forwardedFor: "5.6.7.8, 198.51.100.7" },
        trusted,
      ),
    ).toBe("198.51.100.7");
  });

  it("treats IPv4-mapped socket addresses as their IPv4 form", () => {
    // Node reports dual-stack peers as ::ffff:a.b.c.d
    expect(
      resolveClientIp(
        { socketAddress: "::ffff:10.1.2.3", realIp: "198.51.100.7", forwardedFor: undefined },
        trusted,
      ),
    ).toBe("198.51.100.7");
  });

  it("matches an IPv6 trusted proxy", () => {
    expect(
      resolveClientIp(
        { socketAddress: "::1", realIp: "198.51.100.7", forwardedFor: undefined },
        trusted,
      ),
    ).toBe("198.51.100.7");
  });

  it("returns 'unknown' when the socket address is missing and no header is trusted", () => {
    expect(
      resolveClientIp({ socketAddress: undefined, realIp: "1.2.3.4", forwardedFor: undefined }, []),
    ).toBe("unknown");
  });

  it("ignores malformed trusted proxy entries instead of throwing", () => {
    expect(
      resolveClientIp(
        { socketAddress: "10.1.2.3", realIp: "198.51.100.7", forwardedFor: undefined },
        ["not-a-cidr", "10.0.0.0/8"],
      ),
    ).toBe("198.51.100.7");
  });
});
