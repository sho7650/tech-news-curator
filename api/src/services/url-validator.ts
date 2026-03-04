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

function dnsTimeout(hostname: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new UnsafeURLError(`DNS resolution timed out for ${hostname}`)),
      DNS_TIMEOUT_MS,
    );
  });
}

export async function resolveWithTimeout(hostname: string): Promise<string[]> {
  try {
    return await Promise.race([dns.promises.resolve4(hostname), dnsTimeout(hostname)]);
  } catch {
    // Fallback to IPv6
  }

  try {
    return await Promise.race([dns.promises.resolve6(hostname), dnsTimeout(hostname)]);
  } catch {
    throw new UnsafeURLError(`DNS resolution failed for ${hostname}`);
  }
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
