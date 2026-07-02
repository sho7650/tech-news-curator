# DESIGN: Ingest Fetch Hardening (Phase 1)

**Status:** Approved (scope: Phase 1 only, cookie store 3b included)
**Date:** 2026-07-01
**Branch:** `feat/ingest-fetch-hardening`
**Related:** `POST /ingest` returning 422 (`Failed to extract content from URL`) caused by upstream **HTTP 403** from Cloudflare-fronted sites (e.g. TechCrunch).

## 1. Problem (evidence)

Server-side fetch in `safe-fetch.ts` is permanently on the *bot-score boundary* because of fixed client-side signals (factor ②):

| Signal | Current code | Evidence |
|---|---|---|
| No cookie persistence | no cookie jar in `safe-fetch.ts` | `__cf_bm` "smooths out the bot score / reduces false positives" over a session; 30 min TTL ([Cloudflare Cookies](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)) |
| Non-browser encoding | `Accept-Encoding: identity` (`safe-fetch.ts:66`) | Browsers send `gzip/br` |
| TLS fingerprint mismatch | Node `https` vs Chrome UA (`config.ts:41`) | JA3/JA4 from ClientHello; "no comfortable way to impersonate a browser's fingerprint in native Node.js" ([JA3/JA4](https://developers.cloudflare.com/bots/concepts/ja3-ja4-fingerprint/), [httptoolkit](https://httptoolkit.com/blog/tls-fingerprinting-node-js/)) |

Confirmed log: `service:safe-fetch status:403 → failed to fetch HTML → 422` in 196 ms.

## 2. Scope & non-goals

**In scope (Phase 1):** reduce fixed ② signals *without* leaving the hand-rolled SSRF-safe client.
**Out of scope:** JA3/JA4 impersonation (Phase 2), headless render (Phase 3), factor ① (edge-cache miss on fresh URLs — content-side, not fixable here).

**Honest limitation:** Native Node TLS cannot match Chrome JA3/JA4. Phase 1 lowers the 403 rate but cannot eliminate it.

## 3. Hard constraints

- **SSRF invariant preserved:** DNS resolve → validate every IP (`isSafeIp`) → connect to the validated IP with `Host` + SNI (`servername`). No change to `url-validator.ts`; all SSRF tests stay green.
- Guardrails: files ≤ 300 lines, functions ≤ 50 lines, no `any`, no hardcoded secrets. Prefer many small, pure, testable modules.
- No new heavyweight runtime dependencies (Phase 1 uses Node built-ins only: `zlib`).

## 4. Design — new pure modules (unit-testable)

1. **`services/cookie-store.ts`** — `createCookieStore({ ttlMs=30min, maxHosts=500 })` → `{ getCookieHeader(host, now), storeSetCookies(host, setCookie, now) }`.
   - Host-keyed `Map<host, Map<name,{value,expiresAt}>>`. Honors `Max-Age`; else default TTL (aligns `__cf_bm` 30 min). Drops expired on read. FIFO host eviction past `maxHosts`. Mutation is internal only (never mutates arguments).
2. **`services/http-decompress.ts`** — `decompressBody(body, contentEncoding, maxOutputLength)`.
   - `gzip|deflate|br` → `zlib` sync convenience methods with `{ maxOutputLength }` (zip-bomb bound; Node ≥14.5 throws on exceed — verified against Node zlib docs). `identity`/unknown/empty → passthrough.
3. **`services/browser-headers.ts`** — `buildBrowserHeaders(userAgent)` → Chrome-consistent header set: `Accept` (Chrome value), `Accept-Encoding: gzip, deflate, br`, `Accept-Language`, `Sec-Ch-Ua*`, `Sec-Fetch-*`, `Upgrade-Insecure-Requests`, `User-Agent`. (`Host`/`Cookie` added per-request.)
4. **`services/tls-fingerprint.ts`** — `buildTlsOptions()` → `{ minVersion:'TLSv1.2', ALPNProtocols:['http/1.1'], ciphers: <Chrome-like order> }`.
   - **ALPN stays `http/1.1` only** — Node `https` speaks HTTP/1.1; advertising `h2` we cannot serve would break handshakes. This is a deliberate, correctness-over-fingerprint divergence.

## 5. Integration in `safe-fetch.ts`

- Module-level singleton `cookieStore = createCookieStore()`.
- `buildRequestOptions`: headers = `buildBrowserHeaders(config.fetchUserAgent)` + `Host` + `Cookie` (from store, per request host); for https merge `buildTlsOptions()`.
- `makeRequest`: on `end`, capture `set-cookie` → `cookieStore.storeSetCookies(host, …)`; then `decompressBody(concat, content-encoding, MAX_BODY_SIZE)` inside try/catch (RangeError → reject → `safeFetch` returns `null`, unchanged 422 path). Existing streamed `MAX_BODY_SIZE` cap on *compressed* bytes is kept.
- Redirects: cookies applied per-host automatically (store keyed by host).

## 6. Test plan (TDD, RED first)

Pure-unit tests (no network; SSRF blocks localhost so `safeFetch` itself is not network-tested — matches existing style):
- `cookie-store.test.ts`: store/get round-trip; expiry via injected `now`; `Max-Age` honored; multiple cookies joined; per-host isolation; FIFO eviction; empty/undefined Set-Cookie.
- `http-decompress.test.ts`: gzip/deflate/br round-trip; identity/unknown passthrough; `maxOutputLength` exceeded throws.
- `browser-headers.test.ts`: contains `Sec-Fetch-*`, `Sec-Ch-Ua`, `Accept-Encoding` incl. `br`, passes UA through.
- `tls-fingerprint.test.ts`: `minVersion` `TLSv1.2`, ALPN is `['http/1.1']` (no `h2`), non-empty ciphers.
- Regression: existing `url-validator.test.ts`, `ingest*.test.ts` stay green.

Target: 80%+ coverage on new modules; full suite green; `biome check` + `tsc --noEmit` clean.

## 7. Risks

| Risk | Level | Mitigation |
|---|---|---|
| JA3/JA4 unfixable natively | HIGH | Documented; measure 403 rate post-deploy; escalate to Phase 2/3 only if data warrants |
| Zip-bomb via decompression | MEDIUM | `maxOutputLength = MAX_BODY_SIZE` |
| Cookie store memory/staleness | MEDIUM | TTL + FIFO `maxHosts` cap |
| Cipher list breaks some handshakes | MEDIUM | Conservative Chrome-like order, `minVersion` TLSv1.2, ALPN http/1.1 only |
