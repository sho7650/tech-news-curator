# Audit Remediation Plan — tech-news-curator

Source: audit at commit 6855e0b (2026-09-13). Three independently approvable phases,
one feature branch each, TDD for every code change, conventional commits.
No code is written until a phase is explicitly approved.

## Phase 1 — This week (critical/high)  · branch `fix/audit-phase1-security-perf`

### 1.1 SSRF IPv4-mapped bypass (CRITICAL)
- [ ] RED `api/tests/url-validator.test.ts`: `isSafeIp` false for `::ffff:169.254.169.254`, `::ffff:127.0.0.1`,
      `::ffff:10.0.0.1`, `::ffff:192.168.1.1`; `validateUrl("http://[::ffff:127.0.0.1]:5432/")` rejects;
      6to4 `2002:7f00:1::1`, Teredo `2001:0::1`, rfc6052 `64:ff9b::7f00:1` rejected; `::ffff:8.8.8.8` allowed.
- [ ] GREEN `api/src/services/url-validator.ts`: parse with `ipaddr.process()` (auto-unwraps mapped → IPv4),
      add `rfc6052`, `rfc6145`, `6to4`, `teredo` to `UNSAFE_IP_RANGES`.
- [ ] Redirect test in `api/tests/ingest-service.test.ts` (or safe-fetch test): 302 to mapped-form address refused.
- [ ] Verify: `cd api && npx vitest run tests/url-validator.test.ts && npm test`
- Commit: `fix(security): block IPv4-mapped IPv6 addresses in SSRF guard`

### 1.2 og:image validated at ingest (depends on 1.1)
- [ ] RED `api/tests/ingest-service.test.ts`: fixture with `og:image` → `http://169.254.169.254/x.png` yields
      `og_image_url: null`; public host passes.
- [ ] GREEN `api/src/services/ingest-service.ts:89-92`: keep scheme pre-filter, then `validateUrl()`;
      rejection nulls the field (logged), never fails the ingest.
- [ ] Verify: `npx vitest run tests/ingest-service.test.ts tests/ingest-e2e.test.ts`
- DECISION: validation does one DNS lookup per image inside `/ingest`. Accept the latency (recommended), or null-and-log async.
- Commit: `fix(security): validate og:image URL through SSRF validator at ingest`

### 1.3 Dependency bumps (independent)
- [ ] `api/package.json`: hono → 4.13.7, @hono/node-server → 1.19.17 (in-range, lockfile refresh).
- [ ] `frontend/package.json`: next + eslint-config-next → 16.3.5 (Context7: no stable breaking changes 16.2→16.3).
- [ ] `.github/workflows/security.yml`: add `frontend-dependency-scan` (`npm audit --audit-level=high`);
      lower API scan to `--audit-level=moderate`.
- [ ] Verify: `cd api && npm test && npx tsc --noEmit`; `cd frontend && npm run lint && npx tsc --noEmit`; `make test-e2e`.
- Risk: image optimizer / middleware behavior change → separate commits per package so either reverts alone.
- Commits: `chore(deps): bump hono to 4.13.7 and @hono/node-server to 1.19.17` /
           `chore(deps): bump next to 16.3.5` / `ci: scan frontend dependencies and lower API audit threshold`

### 1.4 Article indexes (independent)
- [ ] `api/src/db/schema/articles.ts`: add `index("ix_articles_published_at_desc").on(table.publishedAt.desc().nullsLast())`
      and `index("ix_articles_created_at").on(table.createdAt)` (Drizzle ≥0.31 index API, verified via Context7).
- [ ] `cd api && npx drizzle-kit generate` → `api/src/db/migrations/0001_*.sql`; inspect SQL for `DESC NULLS LAST`.
- [ ] Verify: `npm test` (testcontainers applies schema); `EXPLAIN` on the list query in a dev DB shows index scan.
- Risk: brief write lock during index build (sub-second at current volume).
- DECISION: keep the existing ascending `ix_articles_published_at` for the "next" neighbor query (recommended), or drop it.
- Commit: `perf(db): add published_at DESC and created_at indexes`

### 1.5 PUBLIC_URL / FETCH_USER_AGENT wiring (independent)
- [ ] RED config test: `validateProduction` throws when `ENVIRONMENT=production` and `PUBLIC_URL` is localhost.
- [ ] GREEN `api/src/config.ts`; add both vars to `news-api` env in `docker-compose.yml` and
      `docker-compose.deploy.yml`; add to `.env.example`.
- [ ] Verify: config test; `docker compose config` and `docker compose -f docker-compose.deploy.yml config` render.
- Commit: `fix(config): wire PUBLIC_URL and FETCH_USER_AGENT into compose`

Estimate: 1–1.5 days. Gate: full API suite + `make test-e2e`.

## Phase 2 — Quick wins  · branch `docs/audit-phase2-cleanup`
- [ ] Rewrite `README.md` / `README.ja.md` from `api/package.json` + `CLAUDE.md`. `docs: rewrite READMEs for the TypeScript stack`
- [ ] Fix 3 claims in `docs/architecture.md` (storage via POST /articles; ingest has no DB; detail returns bodies). `docs: correct architecture.md against the code`
- [ ] Delete `tasks/todo.md`, `tools/**/.gitkeep`, `zap-config.conf`; drop ZAP target `Makefile:106`. `chore: remove stale tracked files`
- [ ] Dedupe `.env.example` (one `REGISTRY`, drop `PUBLIC_API_URL`). `chore: dedupe .env.example`
- [ ] Remove `lint` + `test` jobs from `security.yml` (keep dependency-scan, docker-build). `ci: remove jobs duplicated from the CI workflow`
- [ ] Rate limiter proxy trust `api/src/middleware/rate-limit.ts`: RED untrusted peer's X-Real-IP ignored;
      GREEN honor headers only from allowlisted peer, else socket remoteAddress. `fix(security): trust proxy headers only from allowlisted peers`
- DECISION: allowlist source — `TRUSTED_PROXIES` CIDR env var (recommended) vs. default-trust Docker bridge subnet.
Estimate: ~1 day.

## Phase 3 — Structural  · branch `refactor/audit-phase3-structure` (ordered; 1–2 gate the rest)
1. [ ] Extract `api/src/mappers/` from route formatters; mount real routes (`api/src/routes/index.ts`) in every HTTP test,
       one test file per commit; add SSE route + `pollNewArticles` coverage.
2. [ ] OpenAPI from Zod via `@hono/zod-openapi`, serve `/openapi.json`; `openapi-typescript` → `frontend/src/lib/api-types.ts`
       replacing hand-written `types.ts`. No npm workspace (Dockerfiles rely on per-dir `npm ci`).
3. [ ] Tag-triggered workflow: build + push api/frontend/db images under release version and `:latest`.
4. [ ] CI E2E job: replace `drizzle-kit push` with the migration runner (`npm run db:migrate`).
5. [ ] Collapse `docker-compose.deploy.yml` into base + deploy overlay.
6. [ ] Group protected routes under a sub-app with shared `verifyApiKey` + rate limiter (pre-Phase 3.1).
7. [ ] `docs/README.md` index, mark Python-era docs superseded, ADR for the TypeScript migration.
Estimate: 3–4 days.

WAITING FOR CONFIRMATION
