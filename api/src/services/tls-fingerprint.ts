// Conservative TLS ClientHello tuning to nudge the JA3 fingerprint toward a
// modern browser. Note: native Node TLS cannot fully match Chrome's JA3/JA4
// (see docs/DESIGN-ingest-fetch-hardening.md) — this only shifts it partially.
//
// ALPN advertises http/1.1 ONLY: Node's `https` module speaks HTTP/1.1, so
// offering h2 (as Chrome does) would let a server negotiate a protocol we
// cannot serve and break the handshake. Correctness over fingerprint fidelity.

export interface TlsOptions {
  minVersion: "TLSv1.2";
  ALPNProtocols: string[];
  ciphers: string;
}

// Chrome-like cipher ordering (OpenSSL names).
const CHROME_CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

export function buildTlsOptions(): TlsOptions {
  return {
    minVersion: "TLSv1.2",
    ALPNProtocols: ["http/1.1"],
    ciphers: CHROME_CIPHERS,
  };
}
