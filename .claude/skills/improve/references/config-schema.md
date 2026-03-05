# Configuration File Spec (.improvement-config.json)

Place `.improvement-config.json` in the project root to customize improvement loop behavior.
If the file does not exist, all defaults are used.

## Schema

```json
{
  "rounds": 5,
  "focus": "all",
  "qa": {
    "biome": true,
    "typecheck": true,
    "vitest": true,
    "playwright": false,
    "claude_review": true,
    "severity_filter": ["critical", "high", "medium"]
  },
  "refactor": {
    "enabled": true,
    "max_per_round": 3,
    "strategies": [
      "extract-function",
      "simplify-conditional",
      "remove-duplication",
      "split-file",
      "strengthen-types"
    ]
  },
  "safety": {
    "auto_revert_on_failure": true,
    "test_timeout_s": 120,
    "max_fix_attempts_per_test": 3,
    "max_consecutive_reverts": 2,
    "max_consecutive_regressions": 2
  },
  "self_learning": {
    "enabled": true
  }
}
```

## Field Descriptions

### Top Level

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rounds` | number | 5 | Maximum round count. Overridable via CLI `--rounds` |
| `focus` | string | "all" | Target scope: "api", "frontend", "all" |

### qa

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `biome` | boolean | true | Run Biome lint |
| `typecheck` | boolean | true | Run tsc --noEmit |
| `vitest` | boolean | true | Run Vitest tests (requires Docker) |
| `playwright` | boolean | false | Run Playwright E2E (highly environment-dependent) |
| `claude_review` | boolean | true | Run Claude code review via /sc:analyze |
| `severity_filter` | string[] | ["critical","high","medium"] | Only address issues at or above these severity levels |

### refactor

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | true | Run the refactoring phase |
| `max_per_round` | number | 3 | Maximum refactorings per round |
| `strategies` | string[] | (all patterns) | Allowed refactoring strategies |

### safety

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `auto_revert_on_failure` | boolean | true | Auto-revert refactoring on test failure |
| `test_timeout_s` | number | 120 | Test execution timeout in seconds (used with `timeout` command) |
| `max_fix_attempts_per_test` | number | 3 | Max attempts to fix a single failing test before giving up |
| `max_consecutive_reverts` | number | 2 | Abort loop if this many consecutive Phase 4 reverts occur |
| `max_consecutive_regressions` | number | 2 | Abort loop if issue count increases this many consecutive rounds |

### self_learning

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | true | Run the self-learning phase |

## State Files

The loop creates these files in `.improvement-state/`:

| File | Purpose |
|------|---------|
| `run.log` | High-level audit log with timestamps for each phase |
| `issues-round-N.md` | Issues found in round N |
| `test-baseline.log` | Initial test output before any modifications |
| `reflection-log.md` | Retrospective notes appended after each round |
| `self-learning-suggestions.md` | Generated after the final round |
| `refactor-blocklist.json` | Files/strategies that caused reverts (persists across runs) |

## Recommended .gitignore additions

```
# Improvement loop state (session-specific, except blocklist)
.improvement-state/

# Improvement config (optional: commit if you want to share with team)
# .improvement-config.json
```
