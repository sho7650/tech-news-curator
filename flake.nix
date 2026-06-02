{
  description = "tech-news-curator — reproducible development toolchain (Node 22 + CLIs)";

  inputs = {
    # Pinned via flake.lock. Stable channel for a stable toolchain.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # Match the Dockerfiles (node:22 / 22.14.0). npm ships with nodejs.
        nodejs = pkgs.nodejs_22;
      in
      {
        devShells.default = pkgs.mkShellNoCC {
          # Nix supplies the runtime + supporting CLIs only.
          # JS project tooling (biome, tsc, vitest, drizzle-kit, next, eslint,
          # playwright) stays in node_modules to avoid duplicate management.
          packages = [
            nodejs
            pkgs.gnumake # Makefile-driven workflows (make dev / make test)
            pkgs.postgresql_16 # psql client for manual DB inspection (server runs in Docker)
            pkgs.git
            pkgs.jq
          ];

          # Banner goes to stderr so `nix develop -c <cmd>` stdout stays clean.
          shellHook = ''
            {
              echo "tech-news-curator dev shell"
              echo "  node $(node --version)  npm $(npm --version)"
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
