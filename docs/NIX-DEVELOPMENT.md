# Nix Development Environment

This repository ships a [Nix flake](../flake.nix) that provides a **reproducible
development toolchain**: a pinned Node.js runtime plus a few supporting CLIs.
Every contributor gets the exact same Node version regardless of what is
installed on the host machine — no `nvm`, no version drift.

## What Nix provides (and what it does not)

| Concern | Provided by | Notes |
|---------|-------------|-------|
| Node.js 22 + npm | **Nix** (`nodejs_22`) | Matches the Dockerfiles (`node:22`) |
| `make`, `psql` (client), `git`, `jq` | **Nix** | `psql` is the client only; the server runs in Docker |
| biome, tsc, tsx, tsup, vitest, drizzle-kit, next, eslint, playwright | **`node_modules`** | Stay in `package.json`; Nix does not duplicate them |
| PostgreSQL server | **Docker** (`docker compose`) | Not replaced by Nix |
| Test database | **Docker** (`@testcontainers/postgresql`) | `vitest` needs a running Docker daemon |
| Playwright browsers | **Playwright** (`npx playwright install`) | Self-downloaded; works on macOS |

> **Important:** Nix supplies the *toolchain*, not the *services*. Running the
> stack (`make dev`), the unit tests (`cd api && npm test`, which uses
> testcontainers), and the E2E tests (Playwright) all still require a running
> **Docker daemon**.

## Prerequisites

- [Nix](https://nixos.org/download) with flakes enabled
  (`experimental-features = nix-command flakes` in `nix.conf`).
- [direnv](https://direnv.net/) (optional but recommended), ideally with
  [nix-direnv](https://github.com/nix-community/nix-direnv) for caching.
- A running **Docker daemon** for the database, unit tests, and E2E tests.

## Usage

### Option A — direnv (recommended)

```bash
direnv allow      # one time, in the repo root
```

After that the dev shell loads automatically whenever you `cd` into the
directory, and unloads when you leave. The shell is re-evaluated when
`flake.nix` / `flake.lock` change (see [`.envrc`](../.envrc)).

### Option B — manual

```bash
nix develop                       # enter an interactive dev shell
nix develop -c node --version     # run a single command in the shell
nix develop -c make dev           # e.g. start the stack
```

### First-time JS dependency install

The flake intentionally does **not** run `npm ci` for you (no hidden side
effects). Install workspace dependencies once:

```bash
cd api && npm ci
cd ../frontend && npm ci
```

## Verifying the setup

```bash
nix flake check                       # evaluates the dev shell — "all checks passed!"
nix develop -c node --version         # -> v22.x  (host Node is ignored)
nix develop -c sh -c 'cd api && npx tsc --noEmit && npx biome check src/'
```

## Why Node 22?

The API and frontend Dockerfiles build on `node:22` / `node:22.14.0`. Pinning
the dev shell to the same major version keeps local development, CI, and
production aligned. The exact patch version is whatever `nixpkgs` (pinned in
`flake.lock`) provides for `nodejs_22`; major-version parity is what matters.

## Updating the pinned toolchain

```bash
nix flake update          # bump all inputs (nixpkgs, flake-utils) + relock
# or update a single input:
nix flake update nixpkgs
```

Commit the resulting `flake.lock` so every contributor moves in lockstep.

## Troubleshooting

- **`error: experimental Nix feature 'flakes' is disabled`**
  Enable flakes in `~/.config/nix/nix.conf`:
  `experimental-features = nix-command flakes`.
- **`Path 'flake.nix' ... is not tracked by Git`**
  Flakes only see git-tracked files. `git add` new files before evaluating.
- **direnv shows nothing on `cd`**
  Run `direnv allow` once; confirm the direnv shell hook is installed
  (`eval "$(direnv hook bash)"` / `zsh` / `fish`).
- **Tests fail to start a database**
  Ensure the Docker daemon is running — testcontainers needs it.
- **Playwright: browser not found**
  Run `cd frontend && npx playwright install`. On NixOS the self-downloaded
  browsers may not run (dynamic linking); use the nixpkgs `playwright-driver`
  browsers instead. macOS is unaffected.
