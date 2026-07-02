import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

// Decompress an HTTP response body by its Content-Encoding. `maxOutputLength`
// bounds the decompressed size (zlib throws if exceeded) to guard against
// decompression bombs. Unknown/identity encodings pass through unchanged.
export function decompressBody(
  body: Buffer,
  contentEncoding: string | undefined,
  maxOutputLength: number,
): Buffer {
  const encoding = contentEncoding?.trim().toLowerCase().split(",")[0]?.trim() ?? "";

  switch (encoding) {
    case "gzip":
      return gunzipSync(body, { maxOutputLength });
    case "deflate":
      return inflateSync(body, { maxOutputLength });
    case "br":
      return brotliDecompressSync(body, { maxOutputLength });
    default:
      return body;
  }
}
