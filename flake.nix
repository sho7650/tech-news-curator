{
  description = "tech-news-curator — reproducible development toolchain (Node 26 + pnpm 12 + CLIs)";

  inputs = {
    # Pinned via flake.lock. nodejs_26 / pnpm_12 are not in nixos-25.05/25.11
    # (docs/DESIGN-toolchain-modernization.md D4).
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # Major pinned by attribute name so a lock update can't silently change it.
        # Dockerfiles pin the exact patch (node:26.x.y-slim); .node-version is the
        # CI source of truth. npm ships with nodejs.
        nodejs = pkgs.nodejs_26;
        # Adopted as the package manager in the pnpm PR (D9); provided here first.
        pnpm = pkgs.pnpm_12;
      in
      {
        devShells.default = pkgs.mkShellNoCC {
          # Nix supplies the runtime + supporting CLIs only.
          # JS project tooling (biome, tsc, vitest, drizzle-kit, next, eslint,
          # playwright) stays in node_modules to avoid duplicate management.
          packages = [
            nodejs
            pnpm
            pkgs.gnumake # Makefile-driven workflows (make dev / make test)
            pkgs.postgresql_16 # psql client for manual DB inspection (server runs in Docker)
            pkgs.git
            pkgs.jq
          ];

          # Banner goes to stderr so `nix develop -c <cmd>` stdout stays clean.
          shellHook = ''
            {
              echo "tech-news-curator dev shell"
              echo "  node $(node --version)  npm $(npm --version)  pnpm $(pnpm --version)"
              echo "  DB & tests still require a running Docker daemon"
              echo "    (postgres via docker compose, @testcontainers/postgresql for vitest)."
              if [ ! -d api/node_modules ]; then
                echo "  Hint: cd api && npm ci"
              fi
              if [ ! -d frontend/node_modules ]; then
                echo "  Hint: cd frontend && npm ci"
              fi
            } >&2
          '';
        };
      }
    );
}
