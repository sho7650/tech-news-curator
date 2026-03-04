# Self-Learning Suggestions

Generated: 2026-03-04
Rounds analyzed: 1-4

## Suggestions

### [IMPACT: HIGH] Add Biome rule for `any` type detection
- **Current**: `any` types were not caught by Biome lint; all 10+ instances required manual code review
- **Proposed**: Enable `noExplicitAny` rule in biome.json to auto-detect `any` usage
- **Rationale**: 50% of HIGH issues in Round 1 (5/10 total) were `any` type violations. Auto-detection would catch these before code review.
- **Action**: Add `"noExplicitAny": "error"` to `biome.json` linter rules

### [IMPACT: HIGH] Enable Vitest in improvement loop
- **Current**: Vitest requires manual approval and was skipped in all rounds
- **Proposed**: Pre-authorize test execution or run tests before starting the loop
- **Rationale**: Without tests, E2E safety checks only cover static analysis. The refactorings in Rounds 2-3 (file splits, shared types) would ideally be validated by the full test suite.
- **Action**: Ensure Docker is running and test commands are pre-approved before starting `/improve`

### [IMPACT: MEDIUM] Reduce max rounds for mature codebases
- **Current**: `rounds: 5` in `.improvement-config.json`
- **Proposed**: `rounds: 3` for this codebase
- **Rationale**: Round 3 found only 2 actionable LOW items. Round 4 found 0 new issues. Diminishing returns after Round 2. Three rounds would have been sufficient.
- **Action**: Set `"rounds": 3` in `.improvement-config.json`

### [IMPACT: MEDIUM] Prioritize services layer in initial review
- **Current**: Review covers routes and services equally
- **Proposed**: Focus initial review on services layer where business logic lives
- **Rationale**: Most impactful issues (type safety, timer leaks, file splitting) were in services, not routes. Routes are thin handlers.
- **Action**: Update `.improvement-config.json` to add `qa.review_priority: ["services", "middleware", "routes"]`

### [IMPACT: MEDIUM] Allow file deletion for dead code removal
- **Current**: `rm` and `git rm` commands blocked by security policy
- **Proposed**: Allow file deletion within the project directory during improvement loops
- **Rationale**: Two unused files (health.ts, env.ts) could not be removed. Dead code persists.
- **Action**: Approve `git rm` operations or configure allowed working directories

### [IMPACT: LOW] Track issue categories for pattern detection
- **Current**: Issues categorized ad-hoc
- **Proposed**: Standardize: `type-safety`, `dry-violation`, `dead-code`, `error-handling`, `guardrail-violation`, `performance`
- **Rationale**: Clear pattern: R1=type-safety (5/10), R2=dry-violation (11/19), R3=dead-code (5/6). Knowing this focuses future reviews.
- **Action**: Add `categories` field to issue format in the skill template
