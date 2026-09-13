import dns from "node:dns";
import { describe, expect, it, vi } from "vitest";
import { UnsafeURLError, isSafeIp, validateUrl } from "../src/services/url-validator.js";

describe("URL Validator (SSRF Protection)", () => {
  it("should allow safe public URL", async () => {
    vi.spyOn(dns.promises, "resolve4").mockResolvedValue(["93.184.216.34"]);

    const result = await validateUrl("https://example.com");
    expect(result).toBe("https://example.com");
    vi.restoreAllMocks();
  });

  it("should block private IPv4", async () => {
    await expect(validateUrl("http://10.0.0.1")).rejects.toThrow(UnsafeURLError);
  });

  it("should block loopback", async () => {
    await expect(validateUrl("http://127.0.0.1")).rejects.toThrow(UnsafeURLError);
  });

  it("should block link-local", async () => {
    await expect(validateUrl("http://169.254.169.254")).rejects.toThrow(UnsafeURLError);
  });

  it("should block IPv6 loopback", async () => {
    await expect(validateUrl("http://[::1]")).rejects.toThrow(UnsafeURLError);
  });

  it("should block non-http scheme", async () => {
    await expect(validateUrl("ftp://example.com")).rejects.toThrow(UnsafeURLError);
  });

  it("should block if any resolved IP is private", async () => {
    vi.spyOn(dns.promises, "resolve4").mockResolvedValue(["93.184.216.34", "10.0.0.1"]);

    await expect(validateUrl("https://example.com")).rejects.toThrow(UnsafeURLError);
    vi.restoreAllMocks();
  });

  it("should handle DNS timeout", async () => {
    vi.spyOn(dns.promises, "resolve4").mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    vi.spyOn(dns.promises, "resolve6").mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    await expect(validateUrl("https://slow.example.com")).rejects.toThrow(/timed out/);
    vi.restoreAllMocks();
  });

  it("should identify safe IPs correctly", () => {
    expect(isSafeIp("93.184.216.34")).toBe(true);
    expect(isSafeIp("8.8.8.8")).toBe(true);
    expect(isSafeIp("10.0.0.1")).toBe(false);
    expect(isSafeIp("127.0.0.1")).toBe(false);
    expect(isSafeIp("169.254.1.1")).toBe(false);
    expect(isSafeIp("192.168.1.1")).toBe(false);
    expect(isSafeIp("::1")).toBe(false);
  });

  describe("IPv4-mapped and IPv6 transition addresses", () => {
    it("should block IPv4-mapped forms of unsafe IPv4 addresses", () => {
      expect(isSafeIp("::ffff:169.254.169.254")).toBe(false);
      expect(isSafeIp("::ffff:127.0.0.1")).toBe(false);
      expect(isSafeIp("::ffff:10.0.0.1")).toBe(false);
      expect(isSafeIp("::ffff:192.168.1.1")).toBe(false);
      expect(isSafeIp("::ffff:0.0.0.0")).toBe(false);
    });

    it("should block hex-notation IPv4-mapped forms", () => {
      // ::ffff:a9fe:a9fe == ::ffff:169.254.169.254
      expect(isSafeIp("::ffff:a9fe:a9fe")).toBe(false);
      // ::ffff:7f00:1 == ::ffff:127.0.0.1
      expect(isSafeIp("::ffff:7f00:1")).toBe(false);
    });

    it("should still allow IPv4-mapped forms of public addresses", () => {
      expect(isSafeIp("::ffff:8.8.8.8")).toBe(true);
      expect(isSafeIp("::ffff:93.184.216.34")).toBe(true);
    });

    it("should block IPv6 transition ranges that embed IPv4", () => {
      expect(isSafeIp("2002:7f00:1::1")).toBe(false); // 6to4 embedding 127.0.0.1
      expect(isSafeIp("2001:0::1")).toBe(false); // Teredo
      expect(isSafeIp("64:ff9b::7f00:1")).toBe(false); // RFC 6052 NAT64 prefix
      expect(isSafeIp("::ffff:0:7f00:1")).toBe(false); // RFC 6145 IPv4-translated
      expect(isSafeIp("::7f00:1")).toBe(false); // deprecated IPv4-compatible (RFC 4291)
      expect(isSafeIp("::a9fe:a9fe")).toBe(false); // IPv4-compatible link-local
    });

    it("should keep :: and ::1 on their native classification", () => {
      expect(isSafeIp("::")).toBe(false);
      expect(isSafeIp("::1")).toBe(false);
      expect(isSafeIp("::2")).toBe(false); // IPv4-compatible 0.0.0.2, unspecified range
    });

    it("should reject IPv6 literals carrying a zone ID", async () => {
      // WHATWG URL parsing refuses %-encoded zone IDs, so this fails closed as an invalid URL.
      await expect(validateUrl("http://[fe80::1%25eth0]/")).rejects.toThrow(UnsafeURLError);
      expect(isSafeIp("fe80::1%eth0")).toBe(false);
    });

    it("should reject URLs with IPv4-mapped literal hosts", async () => {
      await expect(validateUrl("http://[::ffff:127.0.0.1]:5432/")).rejects.toThrow(UnsafeURLError);
      await expect(
        validateUrl("http://[::ffff:169.254.169.254]/latest/meta-data/"),
      ).rejects.toThrow(UnsafeURLError);
    });

    it("should reject hostnames whose AAAA record is an IPv4-mapped unsafe address", async () => {
      vi.spyOn(dns.promises, "resolve4").mockRejectedValue(new Error("ENODATA"));
      vi.spyOn(dns.promises, "resolve6").mockResolvedValue(["::ffff:10.0.0.1"]);

      await expect(validateUrl("https://evil.example.com")).rejects.toThrow(UnsafeURLError);
      vi.restoreAllMocks();
    });
  });
});
