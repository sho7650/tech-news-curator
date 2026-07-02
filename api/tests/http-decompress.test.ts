import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { decompressBody } from "../src/services/http-decompress.js";

const MAX = 10 * 1024 * 1024;

describe("decompressBody", () => {
  const text = "hello world, this is the article body";
  const buf = Buffer.from(text, "utf-8");

  it("decompresses gzip", () => {
    expect(decompressBody(gzipSync(buf), "gzip", MAX).toString("utf-8")).toBe(text);
  });

  it("decompresses deflate", () => {
    expect(decompressBody(deflateSync(buf), "deflate", MAX).toString("utf-8")).toBe(text);
  });

  it("decompresses brotli", () => {
    expect(decompressBody(brotliCompressSync(buf), "br", MAX).toString("utf-8")).toBe(text);
  });

  it("passes through identity encoding", () => {
    expect(decompressBody(buf, "identity", MAX)).toEqual(buf);
  });

  it("passes through undefined encoding", () => {
    expect(decompressBody(buf, undefined, MAX)).toEqual(buf);
  });

  it("passes through unknown encoding", () => {
    expect(decompressBody(buf, "weird", MAX)).toEqual(buf);
  });

  it("normalizes encoding case and whitespace", () => {
    expect(decompressBody(gzipSync(buf), "  GZIP  ", MAX).toString("utf-8")).toBe(text);
  });

  it("throws when decompressed output exceeds maxOutputLength", () => {
    const big = Buffer.alloc(1024 * 1024, 0x61); // 1MB, highly compressible
    expect(() => decompressBody(gzipSync(big), "gzip", 1024)).toThrow();
  });
});
