# ADR-001: Adopt Claude Code Project Structure

## Status

Accepted

## Date

2026-03-04

## Context

The project has grown beyond its initial structure. As AI-assisted development becomes central to the workflow, the `.claude/` directory needs to be organized with skills, hooks, and documentation to enable consistent, repeatable interactions with Claude Code.

The existing `CLAUDE.md` provides good project context but lacks structured skills for common workflows (code review, refactoring, releases, ADRs) and guardrails (pre-commit checks, output validation).

## Decision Drivers

- Need for consistent code review and refactoring workflows
- Release process should be documented and repeatable
- Architecture decisions need formal tracking (ADRs)
- Pre-commit quality gates should be automated
- Module-level context helps Claude Code understand code boundaries

## Considered Options

1. Keep minimal `.claude/` with just `settings.json`
2. Adopt full Claude Code project structure with skills, hooks, and docs
3. Use external tooling (GitHub Actions only) without Claude Code integration

## Decision Outcome

Chosen option: "Adopt full Claude Code project structure", because it provides the best integration between AI-assisted development and project quality standards.

### Positive Consequences

- Structured skills enable repeatable workflows (`/code-review`, `/refactor`, `/release`, `/adr`)
- Pre-commit hooks enforce quality gates (Biome lint, TypeScript type check)
- Module-level CLAUDE.md files provide context boundaries for AI assistance
- ADR tracking creates a decision history for the project
- Runbooks document operational procedures

### Negative Consequences

- More files to maintain in `.claude/` directory
- Team members need to understand the skill/hook conventions
- ADRs add overhead to decision-making (mitigated by the `/adr` skill)

## Thinking Process

The project already uses Claude Code extensively for development. Formalizing the structure makes interactions more predictable and ensures quality standards are consistently applied. The overhead of maintaining the structure is minimal compared to the benefits of repeatable, high-quality workflows.

## Links

- Implements: feature/claude-project-structure branch
