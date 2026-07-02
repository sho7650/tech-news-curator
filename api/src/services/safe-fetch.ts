import http from "node:http";
import https from "node:https";
import type tls from "node:tls";
import ipaddr from "ipaddr.js";
import { config } from "../config.js";
import type { AppLogger } from "../lib/logger.js";
import { rootLogger } from "../lib/logger.js";
import { buildBrowserHeaders } from "./browser-headers.js";
import { createCookieStore } from "./cookie-store.js";
import { decompressBody } from "./http-decompress.js";
import { buildTlsOptions } from "./tls-fingerprint.js";
import { UnsafeURLError, isSafeIp, resolveWithTimeout } from "./url-validator.js";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CONNECT_TIMEOUT = 5000;
const READ_TIMEOUT = 30000;
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB

// Persist Cloudflare's __cf_bm cookie across ingests so its bot-score smoothing
// applies (see docs/DESIGN-ingest-fetch-hardening.md). Keyed by hostname only,
// so it does not affect SSRF IP validation.
const cookieStore = createCookieStore();

async function resolveAndValidate(hostname: string): Promise<string> {
  // IP literal
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(cleanHostname)) {
    if (!isSafeIp(cleanHostname)) {
      throw new UnsafeURLError(`IP address ${cleanHostname} is not safe`);
    }
    return cleanHostname;
  }

  // Domain: resolve all records
  const addresses = await resolveWithTimeout(hostname);
  let safeIp: string | null = null;

  for (const addr of addresses) {
    if (!isSafeIp(addr)) {
      throw new UnsafeURLError(`Hostname ${hostname} resolves to unsafe IP ${addr}`);
    }
    if (safeIp === null) safeIp = addr;
  }

  if (safeIp === null) {
    throw new UnsafeURLError(`No addresses found for ${hostname}`);
  }

  return safeIp;
}

function buildRequestOptions(
  url: string,
  resolvedIp: string,
  cookieHeader: string,
): { options: http.RequestOptions | https.RequestOptions; isHttps: boolean } {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === "https:";
  const defaultPort = isHttps ? 443 : 80;
  const port = parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort;
  const path = parsed.pathname + parsed.search;

  // Host header: include port only if non-default
  const hostHeader = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;

  const headers: http.OutgoingHttpHeaders = {
    ...buildBrowserHeaders(config.fetchUserAgent),
    Host: hostHeader,
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const options: http.RequestOptions | https.RequestOptions = {
    hostname: resolvedIp,
    port,
    path,
    method: "GET",
    headers,
    timeout: CONNECT_TIMEOUT,
  };

  if (isHttps) {
    const tlsOptions = buildTlsOptions();
    // ALPNProtocols lives on tls.ConnectionOptions (honored at runtime by
    // https.request via tls.connect) but is absent from https.RequestOptions.
    const httpsOptions = options as https.RequestOptions & tls.ConnectionOptions;
    httpsOptions.servername = parsed.hostname;
    httpsOptions.rejectUnauthorized = true;
    httpsOptions.minVersion = tlsOptions.minVersion;
    httpsOptions.ALPNProtocols = tlsOptions.ALPNProtocols;
    httpsOptions.ciphers = tlsOptions.ciphers;
  }

  return { options, isHttps };
}

// Store Set-Cookie (e.g. __cf_bm) then decompress the body by Content-Encoding.
function finalizeResponse(
  res: http.IncomingMessage,
  cookieHost: string,
  chunks: Buffer[],
): { status: number; headers: http.IncomingHttpHeaders; body: string } {
  cookieStore.storeSetCookies(cookieHost, res.headers["set-cookie"], Date.now());
  const body = decompressBody(
    Buffer.concat(chunks),
    res.headers["content-encoding"],
    MAX_BODY_SIZE,
  ).toString("utf-8");
  return { status: res.statusCode ?? 0, headers: res.headers, body };
}

function makeRequest(
  url: string,
  resolvedIp: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const cookieHost = new URL(url).hostname;
    const cookieHeader = cookieStore.getCookieHeader(cookieHost, Date.now());
    const { options, isHttps } = buildRequestOptions(url, resolvedIp, cookieHeader);

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      const readTimer = setTimeout(() => {
        req.destroy();
        reject(new Error("Read timeout"));
      }, READ_TIMEOUT);

      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_SIZE) {
          clearTimeout(readTimer);
          req.destroy();
          reject(new Error(`Response body too large (>${MAX_BODY_SIZE} bytes)`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        clearTimeout(readTimer);
        try {
          resolve(finalizeResponse(res, cookieHost, chunks));
        } catch (err) {
          reject(err);
        }
      });
      res.on("error", (err) => {
        clearTimeout(readTimer);
        reject(err);
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Connect timeout"));
    });
    req.end();
  });
}

async function validateAndResolve(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeURLError(`Unsupported scheme: ${parsed.protocol.replace(":", "")}`);
  }
  if (!parsed.hostname) {
    throw new UnsafeURLError("No hostname in URL");
  }
  return resolveAndValidate(parsed.hostname);
}

export async function safeFetch(url: string, logger?: AppLogger): Promise<string | null> {
  const log =
    logger?.child({ service: "safe-fetch" }) ?? rootLogger.child({ service: "safe-fetch" });
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS + 1; i++) {
    const resolvedIp = await validateAndResolve(currentUrl);

    let response: { status: number; headers: http.IncomingHttpHeaders; body: string };
    try {
      response = await makeRequest(currentUrl, resolvedIp);
    } catch (err) {
      log.warn(
        { url: currentUrl, error: err instanceof Error ? err.message : String(err) },
        "request failed",
      );
      return null;
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.location;
      if (!location) {
        log.warn({ url: currentUrl, status: response.status }, "redirect without Location header");
        return null;
      }
      const nextUrl = new URL(location, currentUrl).toString();
      log.debug({ from: currentUrl, to: nextUrl, status: response.status }, "following redirect");
      currentUrl = nextUrl;
      continue;
    }

    if (response.status !== 200) {
      log.warn({ url: currentUrl, status: response.status }, "non-200 response");
      return null;
    }

    log.debug({ url: currentUrl, bodyLength: response.body.length }, "fetch successful");
    return response.body;
  }

  log.warn({ url, maxRedirects: MAX_REDIRECTS }, "max redirects exceeded");
  return null;
}
