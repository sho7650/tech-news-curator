import dns from "node:dns";
import ipaddr from "ipaddr.js";

const DNS_TIMEOUT_MS = 5000;

export class UnsafeURLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeURLError";
  }
}

const UNSAFE_IP_RANGES = new Set([
  "private",
  "loopback",
  "linkLocal",
  "multicast",
  "reserved",
  "unspecified",
  "uniqueLocal",
  "broadcastAddress",
  "carrierGradeNat",
  // IPv6 transition ranges embed an IPv4 address that the OS may route to
  // directly (6to4, Teredo, NAT64, deprecated IPv4-compatible). Block them all.
  "ipv4Mapped",
  "rfc6052",
  "rfc6145",
  "6to4",
  "teredo",
]);

const IPV4_COMPATIBLE_PREFIX = ipaddr.IPv6.parse("::");
const IPV4_COMPATIBLE_PREFIX_LENGTH = 96;

// The deprecated IPv4-compatible form (::a.b.c.d, RFC 4291 §2.5.5.1) has no
// named range in ipaddr.js, so judge it by the embedded IPv4 address.
function unwrapIPv4Compatible(addr: ipaddr.IPv4 | ipaddr.IPv6): ipaddr.IPv4 | ipaddr.IPv6 {
  if (addr.kind() !== "ipv6") return addr;
  const v6 = addr as ipaddr.IPv6;
  if (!v6.match(IPV4_COMPATIBLE_PREFIX, IPV4_COMPATIBLE_PREFIX_LENGTH)) return addr;
  const [hi, lo] = v6.parts.slice(6);
  return new ipaddr.IPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
}

export function isSafeIp(ip: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    // process() unwraps IPv4-mapped IPv6 (::ffff:a.b.c.d) to plain IPv4 so the
    // embedded address is range-checked, not the ::ffff:0:0/96 wrapper.
    parsed = unwrapIPv4Compatible(ipaddr.process(ip));
  } catch {
    return false;
  }

  return !UNSAFE_IP_RANGES.has(parsed.range());
}

function withDnsTimeout<T>(promise: Promise<T>, hostname: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new UnsafeURLError(`DNS resolution timed out for ${hostname}`)),
      DNS_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function resolveWithTimeout(hostname: string): Promise<string[]> {
  try {
    return await withDnsTimeout(dns.promises.resolve4(hostname), hostname);
  } catch (err) {
    if (err instanceof UnsafeURLError && err.message.includes("timed out")) throw err;
    // Fallback to IPv6
  }

  try {
    return await withDnsTimeout(dns.promises.resolve6(hostname), hostname);
  } catch (err) {
    if (err instanceof UnsafeURLError && err.message.includes("timed out")) throw err;
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
