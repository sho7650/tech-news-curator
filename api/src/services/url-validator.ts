import dns from "node:dns";
import ipaddr from "ipaddr.js";

const DNS_TIMEOUT_MS = 5000;

export class UnsafeURLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeURLError";
  }
}

export function isSafeIp(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(ip);
  } catch {
    return false;
  }

  const range = parsed.range();
  const unsafeRanges = [
    "private",
    "loopback",
    "linkLocal",
    "multicast",
    "reserved",
    "unspecified",
    "uniqueLocal",
    "broadcastAddress",
    "carrierGradeNat",
  ];

  return !unsafeRanges.includes(range);
}

export function resolveWithTimeout(hostname: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new UnsafeURLError(`DNS resolution timed out for ${hostname}`));
    }, DNS_TIMEOUT_MS);

    dns.resolve(hostname, (err, addresses) => {
      clearTimeout(timer);
      if (err) {
        // Try resolve6 as fallback
        dns.resolve6(hostname, (err6, addresses6) => {
          if (err6) {
            reject(new UnsafeURLError(`DNS resolution failed for ${hostname}`));
          } else {
            resolve(addresses6);
          }
        });
      } else {
        resolve(addresses);
      }
    });
  });
}

export async function validateUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeURLError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeURLError(`Unsupported scheme: ${parsed.protocol.replace(":", "")}`);
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    throw new UnsafeURLError("No hostname in URL");
  }

  // Strip brackets from IPv6
  const cleanHostname = hostname.replace(/^\[|\]$/g, "");

  // Check if hostname is an IP literal
  if (ipaddr.isValid(cleanHostname)) {
    if (!isSafeIp(cleanHostname)) {
      throw new UnsafeURLError(`IP address ${cleanHostname} is not safe`);
    }
    return url;
  }

  // Domain name: resolve and check all IPs
  const addresses = await resolveWithTimeout(cleanHostname);

  for (const addr of addresses) {
    if (!isSafeIp(addr)) {
      throw new UnsafeURLError(`Hostname ${cleanHostname} resolves to unsafe IP ${addr}`);
    }
  }

  return url;
}
