import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import ipaddr from "ipaddr.js";
import { config } from "../config.js";
import type { AppEnv } from "../types.js";

let rateLimitEnabled = true;

export function setRateLimitEnabled(enabled: boolean): void {
  rateLimitEnabled = enabled;
}

export interface ClientAddressSources {
  socketAddress: string | undefined;
  realIp: string | undefined;
  forwardedFor: string | undefined;
}

type Cidr = [ipaddr.IPv4 | ipaddr.IPv6, number];

// Malformed entries are dropped rather than thrown so one typo in
// TRUSTED_PROXIES cannot take the API down at boot.
function parseCidrs(cidrs: readonly string[]): Cidr[] {
  return cidrs.flatMap((cidr) => {
    try {
      return [ipaddr.parseCIDR(cidr)];
    } catch {
      return [];
    }
  });
}

// Node reports dual-stack peers as ::ffff:a.b.c.d; normalize so IPv4 CIDRs match.
function normalizeIp(address: string): string | undefined {
  try {
    return ipaddr.process(address).toString();
  } catch {
    return undefined;
  }
}

function isTrustedProxy(address: string, cidrs: Cidr[]): boolean {
  if (cidrs.length === 0) return false;
  const ip = ipaddr.process(address);
  return ipaddr.subnetMatch(ip, { trusted: cidrs }, "untrusted") === "trusted";
}

function lastForwardedHop(forwardedFor: string | undefined): string | undefined {
  const hops = forwardedFor
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return hops?.at(-1);
}

// Forwarding headers are client-controlled unless the immediate peer is a
// proxy we operate, so only honor them from TRUSTED_PROXIES.
export function resolveClientIp(
  sources: ClientAddressSources,
  trustedProxies: readonly string[],
): string {
  const socket = sources.socketAddress ? normalizeIp(sources.socketAddress) : undefined;

  if (socket && isTrustedProxy(socket, parseCidrs(trustedProxies))) {
    const forwarded = sources.realIp?.trim() || lastForwardedHop(sources.forwardedFor);
    if (forwarded) return forwarded;
  }

  return socket ?? "unknown";
}

function clientIpFromContext(c: Context<AppEnv>): string {
  return resolveClientIp(
    {
      socketAddress: c.env?.incoming?.socket?.remoteAddress,
      realIp: c.req.header("x-real-ip"),
      forwardedFor: c.req.header("x-forwarded-for"),
    },
    config.trustedProxies,
  );
}

export function createRateLimiter(limit: number, windowMs = 60000) {
  return rateLimiter<AppEnv>({
    windowMs,
    limit,
    keyGenerator: (c) => {
      if (!rateLimitEnabled) return "disabled";
      return clientIpFromContext(c);
    },
    handler: (c) => {
      return c.json({ detail: "Rate limit exceeded" }, 429);
    },
  });
}
