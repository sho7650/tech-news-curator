import { describe, it, expect } from "vitest";
import { createCookieStore } from "../src/services/cookie-store.js";

describe("cookie-store", () => {
  it("stores and returns a cookie for the same host", () => {
    const s = createCookieStore();
    s.storeSetCookies("example.com", ["a=1; Path=/"], 0);
    expect(s.getCookieHeader("example.com", 0)).toBe("a=1");
  });

  it("joins multiple cookies with '; '", () => {
    const s = createCookieStore();
    s.storeSetCookies("example.com", ["a=1", "b=2"], 0);
    expect(s.getCookieHeader("example.com", 0)).toBe("a=1; b=2");
  });

  it("isolates cookies per host", () => {
    const s = createCookieStore();
    s.storeSetCookies("a.com", ["x=1"], 0);
    expect(s.getCookieHeader("b.com", 0)).toBe("");
  });

  it("expires cookies after the default TTL", () => {
    const s = createCookieStore({ ttlMs: 1000 });
    s.storeSetCookies("example.com", ["a=1"], 0);
    expect(s.getCookieHeader("example.com", 999)).toBe("a=1");
    expect(s.getCookieHeader("example.com", 1000)).toBe("");
  });

  it("honors Max-Age over the default TTL", () => {
    const s = createCookieStore({ ttlMs: 1000 });
    s.storeSetCookies("example.com", ["a=1; Max-Age=10"], 0);
    expect(s.getCookieHeader("example.com", 9000)).toBe("a=1");
    expect(s.getCookieHeader("example.com", 10000)).toBe("");
  });

  it("overwrites a cookie with the same name", () => {
    const s = createCookieStore();
    s.storeSetCookies("example.com", ["a=1"], 0);
    s.storeSetCookies("example.com", ["a=2"], 0);
    expect(s.getCookieHeader("example.com", 0)).toBe("a=2");
  });

  it("ignores empty or undefined Set-Cookie input", () => {
    const s = createCookieStore();
    s.storeSetCookies("example.com", undefined, 0);
    s.storeSetCookies("example.com", [], 0);
    s.storeSetCookies("example.com", [""], 0);
    expect(s.getCookieHeader("example.com", 0)).toBe("");
  });

  it("accepts a single Set-Cookie string", () => {
    const s = createCookieStore();
    s.storeSetCookies("example.com", "a=1; Secure", 0);
    expect(s.getCookieHeader("example.com", 0)).toBe("a=1");
  });

  it("evicts the oldest host beyond maxHosts (FIFO)", () => {
    const s = createCookieStore({ maxHosts: 2 });
    s.storeSetCookies("h1.com", ["a=1"], 0);
    s.storeSetCookies("h2.com", ["a=1"], 0);
    s.storeSetCookies("h3.com", ["a=1"], 0);
    expect(s.getCookieHeader("h1.com", 0)).toBe("");
    expect(s.getCookieHeader("h2.com", 0)).toBe("a=1");
    expect(s.getCookieHeader("h3.com", 0)).toBe("a=1");
  });
});
