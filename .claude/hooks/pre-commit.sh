#!/bin/bash
# Pre-commit guardrails: Biome lint + TypeScript type check
set -euo pipefail

echo "Running pre-commit checks..."

# Biome lint
echo "  -> Biome lint..."
cd api && npx biome check src/ || { echo "Lint failed"; exit 1; }

# Type check
echo "  -> TypeScript type check..."
npx tsc --noEmit || { echo "Type check failed"; exit 1; }

echo "All pre-commit checks passed"
