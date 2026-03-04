---
name: release
description: Docker-based release workflow with release-please integration
arguments:
  - name: version
    description: Semver bump type (major|minor|patch) or explicit version (e.g., 1.2.3)
    required: true
  - name: component
    description: Component to release (api|frontend|all)
    default: all
---

# Release Skill

## Process

1. Verify clean working tree: `git status --porcelain`
2. Run full test suite: `cd api && npm test`
3. Run linting: `cd api && npx biome check src/`
4. Run type check: `cd api && npx tsc --noEmit`
5. Run E2E tests: `cd frontend && npx playwright test`
6. Verify release-please PR exists or create one
7. Build Docker images: `make build`
8. Verify build output (image sizes, health check)
9. Present summary for approval before pushing
10. Push images: `make push`

## release-please Integration

This project uses release-please with separate packages for `api` and `frontend`. Configuration is in `release-please-config.json`.

- Conventional Commits drive version bumps automatically
- `feat:` → minor bump, `fix:` → patch bump, `feat!:` or `BREAKING CHANGE` → major bump
- CHANGELOG.md is auto-generated per component
- GitHub Action creates release PRs automatically

## Pre-Release Checklist

- [ ] All tests pass (`cd api && npm test`)
- [ ] No TypeScript errors (`cd api && npx tsc --noEmit`)
- [ ] No lint warnings (`cd api && npx biome check src/`)
- [ ] E2E tests pass (`cd frontend && npx playwright test`)
- [ ] Docker images build successfully (`make build`)
- [ ] CHANGELOG.md updated (via release-please)
- [ ] Version bumped in package.json (via release-please)

## Docker Registry

Images push to `${REGISTRY}/news-curator/{api,frontend}:latest`.
Set `REGISTRY` in `.env` or Makefile (default: `ghcr.io/your-org`).
