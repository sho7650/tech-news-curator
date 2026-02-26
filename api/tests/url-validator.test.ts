import { describe, it, expect, vi } from "vitest";
import dns from "node:dns";
import { UnsafeURLError, validateUrl, isSafeIp } from "../src/services/url-validator.js";

describe("URL Validator (SSRF Protection)", () => {
  it("should allow safe public URL", async () => {
    vi.spyOn(dns, "resolve").mockImplementation(((
      hostname: string,
      callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void,
    ) => {
      callback(null, ["93.184.216.34"]);
    }) as any);

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
    vi.spyOn(dns, "resolve").mockImplementation(((
      hostname: string,
      callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void,
    ) => {
      callback(null, ["93.184.216.34", "10.0.0.1"]);
    }) as any);

    await expect(validateUrl("https://example.com")).rejects.toThrow(UnsafeURLError);
    vi.restoreAllMocks();
  });

  it("should handle DNS timeout", async () => {
    vi.spyOn(dns, "resolve").mockImplementation(((
      hostname: string,
      callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void,
    ) => {
      // Never call callback to simulate timeout
    }) as any);

    vi.spyOn(dns, "resolve6").mockImplementation(((
      hostname: string,
      callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void,
    ) => {
      // Never call callback
    }) as any);

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
});
