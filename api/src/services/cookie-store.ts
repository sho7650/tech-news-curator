// Host-keyed in-memory cookie jar. Lets Cloudflare's __cf_bm bot-management
// cookie persist across ingests so its bot-score smoothing can take effect
// (see docs/DESIGN-ingest-fetch-hardening.md). State is internal only; inputs
// are never mutated.

interface StoredCookie {
  value: string;
  expiresAt: number; // epoch ms
}

export interface CookieStore {
  /** Returns a `Cookie` header value for the host (expired cookies dropped), or "". */
  getCookieHeader(host: string, now: number): string;
  /** Parses Set-Cookie header(s) and stores them under the host. */
  storeSetCookies(host: string, setCookie: string[] | string | undefined, now: number): void;
}

interface CookieStoreOptions {
  ttlMs?: number;
  maxHosts?: number;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000; // aligns with __cf_bm 30-minute lifetime
const DEFAULT_MAX_HOSTS = 500;

// Parse the "name=value" pair and optional Max-Age from one Set-Cookie line.
function parseSetCookie(line: string, now: number, ttlMs: number): [string, StoredCookie] | null {
  const parts = line.split(";");
  const pair = parts[0]?.trim() ?? "";
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;

  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  let expiresAt = now + ttlMs;
  for (const attr of parts.slice(1)) {
    const [rawKey, rawVal] = attr.split("=");
    if (rawKey?.trim().toLowerCase() === "max-age" && rawVal !== undefined) {
      const maxAge = Number.parseInt(rawVal.trim(), 10);
      if (!Number.isNaN(maxAge)) expiresAt = now + maxAge * 1000;
    }
  }

  return [name, { value, expiresAt }];
}

export function createCookieStore(options: CookieStoreOptions = {}): CookieStore {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxHosts = options.maxHosts ?? DEFAULT_MAX_HOSTS;

  // Map preserves insertion order → first key is the oldest host (FIFO eviction).
  const hosts = new Map<string, Map<string, StoredCookie>>();

  function toLines(setCookie: string[] | string | undefined): string[] {
    if (!setCookie) return [];
    return Array.isArray(setCookie) ? setCookie : [setCookie];
  }

  return {
    getCookieHeader(host, now) {
      const jar = hosts.get(host);
      if (!jar) return "";

      const pairs: string[] = [];
      for (const [name, cookie] of jar) {
        if (now >= cookie.expiresAt) {
          jar.delete(name);
          continue;
        }
        pairs.push(`${name}=${cookie.value}`);
      }
      return pairs.join("; ");
    },

    storeSetCookies(host, setCookie, now) {
      const lines = toLines(setCookie);
      if (lines.length === 0) return;

      let jar = hosts.get(host);
      if (!jar) {
        if (hosts.size >= maxHosts) {
          const oldest = hosts.keys().next().value;
          if (oldest !== undefined) hosts.delete(oldest);
        }
        jar = new Map<string, StoredCookie>();
        hosts.set(host, jar);
      }

      for (const line of lines) {
        const parsed = parseSetCookie(line, now, ttlMs);
        if (parsed) jar.set(parsed[0], parsed[1]);
      }
    },
  };
}
