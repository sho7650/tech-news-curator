import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { UnsafeURLError, isSafeIp, resolveWithTimeout } from "./url-validator.js";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = "Mozilla/5.0 (compatible; TechNewsCurator/1.0)";
const CONNECT_TIMEOUT = 5000;
const READ_TIMEOUT = 30000;

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

function makeRequest(
  url: string,
  resolvedIp: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const defaultPort = isHttps ? 443 : 80;
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort;
    const path = parsed.pathname + parsed.search;

    // Host header: include port only if non-default
    const hostHeader = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;

    const options: http.RequestOptions | https.RequestOptions = {
      hostname: resolvedIp,
      port,
      path,
      method: "GET",
      headers: {
        Host: hostHeader,
        "User-Agent": USER_AGENT,
      },
      timeout: CONNECT_TIMEOUT,
    };

    if (isHttps) {
      (options as https.RequestOptions).servername = parsed.hostname;
      (options as https.RequestOptions).rejectUnauthorized = true;
    }

    const client = isHttps ? https : http;
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = [];
      const readTimer = setTimeout(() => {
        req.destroy();
        reject(new Error("Read timeout"));
      }, READ_TIMEOUT);

      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        clearTimeout(readTimer);
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
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

export async function safeFetch(url: string): Promise<string | null> {
  let currentUrl = url;

  for (let i = 0; i < MAX_REDIRECTS + 1; i++) {
    const parsed = new URL(currentUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new UnsafeURLError(`Unsupported scheme: ${parsed.protocol.replace(":", "")}`);
    }
    if (!parsed.hostname) {
      throw new UnsafeURLError("No hostname in URL");
    }

    const resolvedIp = await resolveAndValidate(parsed.hostname);

    let response: { status: number; headers: http.IncomingHttpHeaders; body: string };
    try {
      response = await makeRequest(currentUrl, resolvedIp);
    } catch {
      return null;
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.location;
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (response.status !== 200) return null;

    return response.body;
  }

  return null; // Max redirects exceeded
}
