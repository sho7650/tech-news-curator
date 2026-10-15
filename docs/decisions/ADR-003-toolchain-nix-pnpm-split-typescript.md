# ADR-003: Nix as toolchain source, pnpm 12, and split TypeScript versions (api 7 / frontend 6)

## Status

Accepted

## Date

2026-10-15

## Context

The toolchain was Node.js 22 with npm, and TypeScript 5.x in both packages. Node versions were written by hand in three places (flake, Dockerfiles, CI). The goals are faster type checking (TypeScript 7's native compiler) without a meaningful CI slowdown and avoiding migration debt (Node 26 LTS on 2026-10-28, TypeScript 6.0 deprecations).

Two facts shape the decision:

- TypeScript 7.0 (GA 2026-07-08) has no programmatic JS API. Tools that `import "typescript"` cannot run on it. In this repo those are typescript-eslint (via eslint-config-next), openapi-typescript and the Next.js editor plugin, all in `frontend/`. `api/` has no such consumer (tsx, drizzle-kit, vitest, biome and tsup with `dts: false` don't depend on the TypeScript API).
- Node.js 25+ no longer bundles Corepack, and pnpm 11+ downloads and switches to the version in `packageManager`, which bypasses a Nix-provided pnpm.

Design details: [DESIGN-toolchain-modernization.md](../DESIGN-toolchain-modernization.md).

## Decision Drivers

- Faster type checks, without making CI as a whole more than 10% slower than before the migration
- One source of truth for runtime and package manager versions (Nix now, CI on Nix later)
- Supply-chain defaults (pnpm build-script blocking, minimum release age)
- Keep Docker build contexts and release-please per-package setup unchanged
- No dual-TypeScript setups inside one package

## Considered Options

1. TypeScript 7 in both packages, with `@typescript/typescript6` aliased as `typescript` in frontend for lint, codegen and the editor
2. TypeScript 7 in api, TypeScript 6.0 in frontend until typescript-eslint supports TS 7
3. Stay on TypeScript 5.x everywhere until the TS 7.1 API lands

For the package manager: keep npm, pnpm via `packageManager`/Corepack, or pnpm from Nix guarded by `devEngines`.

## Decision Outcome

Chosen: option 2, plus pnpm 12 provided by Nix (`nixpkgs-unstable`, `pkgs.pnpm_12`, `pkgs.nodejs_26`) and guarded by `devEngines.packageManager` / `devEngines.runtime` with `onFail: "error"`, without a `packageManager` field. api and frontend stay independent pnpm projects (one lockfile each, no root workspace).

Option 2 gets the speed where it is free (api), and moves frontend to TS 6.0 so the options that become errors in TS 7 get fixed now. Option 1 puts two compilers in one package, and it is unclear which `tsc` `next build` would run. Option 3 gives up the goal.

### Positive Consequences

- api type checks run on the native compiler
- frontend is TS 7-ready config-wise; moving later is only a version bump
- Node and pnpm versions come from Nix, and running outside the dev shell fails at once
- No dependency install scripts run at all: `allowBuilds` denies every one explicitly, which was verified not to break any tool (design §10). A new dependency that brings a script fails the install until someone decides on it
- pnpm's strict `node_modules` surfaced an undeclared dependency (`openapi-types`), now declared

### Negative Consequences

- Two TypeScript major versions in one repo; the VS Code window uses frontend's TypeScript (6.0, or 5.x if openapi-typescript forces the fallback) for editor diagnostics in api too, so the CLI `tsc` (TS 7) is authoritative for api
- The requirement "migrate to TypeScript 7" is met in stages: frontend stays on TS 6.0 for now as a safety measure and moves to TS 7 once typescript-eslint supports it
- Until CI runs on Nix, the pnpm version appears in four places: the flake (`pnpm_12`, minor follows the lock), CI's `pnpm/action-setup`, and `ARG PNPM_VERSION` in both Dockerfiles. The three exact pins must be kept equal by hand. `devEngines` (`^12`) only guarantees the major version, so minor drift between the flake and the pins is tolerated (pnpm 12 shares lockfile v9)
- Docker images install pnpm via `npm i -g` in the builder stage since Corepack is gone
- VS Code must pin `js/ts.experimental.useTsgo: false`, because the TypeScript 7 extension turns it on when unset and that disables the Next.js editor plugin
- `nixpkgs-unstable` moves Node patch versions on each lock update; Docker images pin the patch version separately

## Thinking Process

The deciding question was "which tools need the TypeScript JS API?". Mapping each dependency showed that the blocker is entirely in frontend, which splits the migration cleanly by package. For pnpm, Corepack's removal and pnpm 11's `packageManager` auto-download meant Nix plus `devEngines` was the only way to keep one source of truth. The approach follows [sho7650/copier-ts7](https://github.com/sho7650/copier-ts7) (D14, D16, D17), adapted to a two-package repo with Docker and release-please.

## Links

- Related: ADR-002-migrate-api-python-fastapi-to-typescript-hono
- Design: docs/DESIGN-toolchain-modernization.md
- Reference: https://github.com/sho7650/copier-ts7/blob/main/template/docs/template-decisions.md
