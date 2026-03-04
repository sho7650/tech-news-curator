---
name: improve
description: |
  Autonomous improvement loop — repeatedly runs QA, Fix, and Refactor cycles to continuously improve code quality.
  Each round runs tests and auto-reverts refactoring commits that break tests.
  Leverages SuperClaude commands and MCP servers (serena, sequential-thinking, context7, playwright, tavily).
arguments:
  - name: rounds
    description: Maximum number of improvement rounds (early termination if 0 issues found)
    default: "5"
  - name: focus
    description: Scope of improvement (api|frontend|all)
    default: all
  - name: dry-run
    description: If true, run QA only without fixes or refactoring
    default: "false"
---

# Autonomous Improvement Loop

Repeats QA → Fix → Refactor → E2E Safety → Reflection → Self-Learning for up to {{rounds}} rounds.
Terminates early when open issues reach 0.

## Toolchain

This skill combines the following tools:

**SuperClaude commands:**
- `/sc:analyze` — Phase 1: Code and architecture structural analysis
- `/sc:troubleshoot` — Phase 2: Debug and root-cause test failures
- `/sc:cleanup` — Phase 3: Structured refactoring
- `/sc:reflect` — Phase 5: Structured retrospective

**MCP servers:**
- `serena` — Phase 1/3: Semantic code understanding, dependency graph analysis
- `sequential-thinking` — Phase 1/6: Multi-step reasoning for complex problems
- `context7` — Phase 2: Official documentation for Hono, Drizzle, Vitest, etc.
- `playwright` — Phase 4: Browser-based E2E test execution
- `tavily` — Phase 6: Web research for best practices

## Critical Safety Rules

- **All work MUST be done on a feature branch. NEVER modify the main branch.**
- Auto-revert refactoring commits when tests break after refactoring.
- Record results of each phase in `.improvement-state/`.
- Follow Conventional Commits format.

## Phase 0: Setup (first round only)

1. Verify the working directory is a git repository.
2. Run `git status` to confirm the working tree is clean.
   - If not clean, warn the user and abort.
3. Confirm the current branch is main.
4. Create a feature branch:
   ```bash
   git checkout -b improve/$(date +%Y%m%d-%H%M%S)
   ```
5. Create the state directory:
   ```bash
   mkdir -p .improvement-state
   ```
6. Load `.improvement-config.json` if it exists. Otherwise use default values.
7. **Use serena MCP to understand project structure** — Query serena for module structure, dependency graph, and key entry points. This improves analysis accuracy in subsequent phases.

## Main Loop: Round 1 ~ {{rounds}}

Log `[Round N/{{rounds}}]` at the start of each round.

### Phase 1: QA (Issue Detection)

Scope: {{focus}}

Run the following checks **in order** and aggregate all discovered issues.

#### 1-1. Biome Lint (when {{focus}} is api or all)

```bash
cd api && npx biome check src/ 2>&1
```

Extract warnings/errors from output and record as issues.

#### 1-2. TypeScript Type Check (when {{focus}} is api or all)

```bash
cd api && npx tsc --noEmit 2>&1
```

Record type errors as issues.

#### 1-3. Vitest Tests (when {{focus}} is api or all)

```bash
cd api && npm test 2>&1
```

**Note**: testcontainers requires Docker. If Docker is not running, skip and log.

**Detecting test failures is MANDATORY. Follow these steps exactly:**

1. Check the command exit code. **If exit code is non-zero, test failures exist.**
2. Find lines starting with `FAIL` and **create a separate issue for each failing test.**
3. Each issue MUST include:
   - Test file name (e.g., `tests/url-validator.test.ts`)
   - Test name (e.g., `should block if any resolved IP is private`)
   - Error message (e.g., `promise resolved instead of rejecting`)
   - Error location line number
4. **Test failures are always severity: HIGH.** A test failure indicates a regression bug.

**How to read Vitest output (example):**
```
FAIL  tests/url-validator.test.ts > URL Validator > should block if any resolved IP is private
AssertionError: promise resolved "'https://example.com'" instead of rejecting
 ❯ tests/url-validator.test.ts:47:52
```
→ File this issue:
```
### [HIGH] Test failure: should block if any resolved IP is private
- **File**: `tests/url-validator.test.ts:47`
- **Source**: vitest
- **Detail**: promise resolved instead of rejecting — dns.resolve mock may not be applied correctly
- **Suggestion**: Check test mock pattern and fix vi.spyOn lifecycle management
```

**MUST also verify the test summary line:**
```
Tests  2 failed | 144 passed (146)
```
→ If `failed` is 1 or more, DO NOT exit Phase 1 until every failing test has been filed as an issue.

#### 1-4. Playwright E2E (when {{focus}} is frontend or all)

Only run if `qa.playwright` is `true` in `.improvement-config.json` (default: false, because E2E is highly environment-dependent).

When true, use **playwright MCP** to run E2E tests. The playwright MCP can launch browsers, interact with pages, and capture screenshots, enabling more flexible verification than plain `npx playwright test`.

Same as Vitest: **if exit code is non-zero, file each failing test as a separate issue (severity: HIGH).**

#### 1-5. Code Analysis with /sc:analyze

Use `/sc:analyze` for structural analysis of the codebase:

```
/sc:analyze "Analyze {{focus}} codebase for code quality issues:
- Type safety problems (any types, missing type guards)
- Error handling gaps (async without try-catch)
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Missing input validation (Zod schemas)
- Hardcoded strings/config values
- Circular dependencies
- CLAUDE.md convention violations"
```

**Use serena MCP alongside**: Leverage serena's semantic analysis to check:
- Module dependency issues
- Unused exports or orphaned code
- Circular call graphs

**Use sequential-thinking MCP alongside**: For complex architectural problems, use sequential-thinking for multi-step reasoning to identify root causes. Focus on design-level issues, not superficial coding style.

**Review target selection**: Prioritize files modified in the previous round or files with many lint issues. In round 1, focus on the service layer (`api/src/services/`) and route layer (`api/src/routes/`).

#### Issue Aggregation

Save all QA results to `.improvement-state/issues-round-N.md` in this format:

```markdown
# Issues - Round N

**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0

## Issues

### [SEVERITY] Short description
- **File**: `path/to/file.ts:line`
- **Source**: lint | typecheck | vitest | playwright | sc:analyze | serena
- **Detail**: Description of the problem
- **Suggestion**: Proposed fix (if any)
```

**Decision**: If issue count is 0 → exit the loop and proceed to Phase 7 (Finalize).

### Phase 2: Fix (Issue Resolution)

Skip this phase if {{dry-run}} is true.

#### 2-1. Auto-fix with Tools

Apply Biome auto-fixes first:

```bash
cd api && npx biome check --write src/
```

#### 2-2. Fix Test Failures (HIGHEST PRIORITY)

**Test failure issues MUST be fixed before all other issues.**

**Use `/sc:troubleshoot` for debugging:**

```
/sc:troubleshoot "Test failure in {test file name}:
Error: {error message}
at line {line number}

Analyze the root cause and suggest a fix."
```

**Use context7 MCP alongside**: Look up official documentation for the frameworks used in tests (Vitest, Playwright, testcontainers, etc.) via context7. Verify correct API usage, especially mock lifecycle (`vi.spyOn`, `mockImplementation`, `mockReset`, `restoreAllMocks`) and async test patterns, based on the latest docs.

Fix procedure:
1. **Read the source code** of both the failing test file and the implementation under test using Read.
2. **Identify the cause** using `/sc:troubleshoot` + context7.
3. **Decide the fix strategy**:
   - Bug in implementation → fix the implementation (NEVER weaken tests to make them pass)
   - Mock/setup issue in test → fix the test code (this is a legitimate fix)
   - Outdated test (snapshot, expected values changed) → update the test
4. **Verify the fix** by re-running only that test file:
   ```bash
   cd api && npx vitest run tests/{test file name} 2>&1
   ```
   If failures remain, redo the fix.

#### 2-3. Fix /sc:analyze Findings

Prioritize HIGH severity and above. Only fix MEDIUM and below if the fix is safe and low-risk.

Also use **context7 MCP** to verify correct patterns for Hono / Drizzle / Zod before applying fixes.

#### 2-4. Commit

```bash
git add -A
git commit -m "fix: resolve N QA issues [round M]"
```

Update issues-round-N.md to reflect fixed issues (set status to `fixed`).

### Phase 3: Refactor (Quality Improvement)

Skip this phase if {{dry-run}} is true.

**Pre-condition check (MANDATORY):**
After Phase 2 fixes, re-run tests before starting any refactoring:
```bash
cd api && npm test 2>&1
```
**If ANY test fails, fix it BEFORE proceeding to refactoring.**
Refactoring with broken tests makes revert decisions impossible.

Fix procedure when tests fail:
1. Read the failing test source and the implementation under test.
2. Follow the same steps as Phase 2 section 2-2: analyze → fix → re-run that test file to verify.
3. Commit: `git add -A && git commit -m "fix: repair failing tests before refactor [round N]"`
4. Re-run `cd api && npm test 2>&1` to confirm **all tests pass**.
5. Proceed to refactoring only after all tests pass. If fix attempts fail, skip to Phase 5.

**Use `/sc:cleanup` for refactoring:**

```
/sc:cleanup "{target file path} — strategy: {refactoring strategy}"
```

**Use serena MCP alongside**: Before refactoring, query serena to check:
- All modules that reference the target file (impact analysis)
- All callers of the target function (understand change impact)
- Whether the change would introduce circular dependencies

Also refer to `references/refactor-patterns.md` for safe refactoring patterns.

Maximum 3 refactorings per round (configurable via `refactor.max_per_round` in `.improvement-config.json`).

Refactoring candidate selection criteria:
- Files where Phase 1 found issues
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Complex conditionals (nesting 3+ levels)
- Duplicate code

**Commit each refactoring individually:**

```bash
git add -A
git commit -m "refactor: {specific description} [round N]"
```

### Phase 4: E2E Safety Check

Only run if refactoring was performed in Phase 3.

```bash
cd api && npm test 2>&1
```

#### On test success

Proceed to the next phase.

#### On test failure

Identify Phase 3 refactoring commits and auto-revert:

```bash
# Count refactor commits
REFACTOR_COUNT=$(git log --oneline improve/... | grep "^.*refactor:.*\[round N\]" | wc -l)

# Revert refactor commits only (newest first)
for i in $(seq 1 $REFACTOR_COUNT); do
  git revert --no-edit HEAD~$((i-1))
done
```

After revert, re-run tests:
- Tests pass → log "refactoring reverted" and proceed to next phase
- Tests fail → Phase 2 fix commits also have problems. Revert those too and record this round as "failed"

### Phase 5: Reflection (Record Results)

**Use `/sc:reflect` for a structured retrospective:**

```
/sc:reflect "Improvement Loop Round N retrospective:
- QA found X issues (sources: lint, typecheck, vitest, sc:analyze, serena)
- Fixed Y issues (auto-fix: p, troubleshoot: q)
- Refactored Z files (reverted: W)
- E2E Safety: PASSED/REVERTED
Analyze what went well, what didn't, and patterns to watch."
```

Append `/sc:reflect` output to `.improvement-state/reflection-log.md`:

```markdown
## Round N - YYYY-MM-DD HH:MM

| Phase | Result |
|-------|--------|
| QA | X issues found (H:a, M:b, L:c) |
| Fix | Y/X issues fixed (auto: p, troubleshoot: q) |
| Refactor | Z refactorings applied |
| E2E Safety | PASSED / REVERTED |

### Tool Usage
- serena: {what dependency analysis revealed}
- context7: {which docs were referenced}
- sequential-thinking: {which problems used multi-step reasoning}

### Modified Files
- `path/to/file1.ts` - summary of changes
- `path/to/file2.ts` - summary of changes

### Observations
(1-3 sentence summary from /sc:reflect analysis)

---
```

### Phase 6: Self-Learning (Improve the Improvement Process)

**Run ONLY after the final round** (not during intermediate rounds).

**Use sequential-thinking MCP for pattern analysis:**
Analyze all rounds in `.improvement-state/reflection-log.md` using multi-step reasoning:
- Step 1: Organize trends in issue count, fix count, and revert rate across rounds
- Step 2: Identify recurring issue category patterns
- Step 3: Analyze correlation between tool usage (serena, context7, etc.) and fix success rate
- Step 4: Generate prioritized improvement suggestions

**Use tavily MCP to research best practices:**
For recurring problem categories, search for latest best practices via tavily:
- e.g., "vitest mock lifecycle best practices 2025"
- e.g., "hono error handling patterns"
- e.g., "drizzle orm query optimization"

Incorporate research findings to improve the quality of suggestions.

Save output to `.improvement-state/self-learning-suggestions.md`:

```markdown
# Self-Learning Suggestions

Generated: YYYY-MM-DD HH:MM
Rounds analyzed: 1-N

## Suggestions

### [IMPACT: HIGH/MEDIUM/LOW] Suggestion title
- **Current**: Current setting/behavior
- **Proposed**: Proposed change
- **Rationale**: Evidence-based reasoning
- **Reference**: Best practice URL found via tavily (if any)
- **Action**: Which parameter in `.improvement-config.json` to change
```

**These suggestions are NOT auto-applied.** The user reviews and manually updates the config.

## Phase 7: Finalize

After all rounds complete (or early termination):

1. Output a final summary:
   ```
   === Improvement Loop Summary ===
   Rounds completed: X / {{rounds}}
   Total issues found: Y
   Total issues fixed: Z
   Refactorings applied: W (reverted: V)
   Tools used: serena, context7, sequential-thinking, tavily, playwright
   Branch: improve/YYYYMMDD-HHMMSS
   ```

2. Push the feature branch:
   ```bash
   git push -u origin improve/YYYYMMDD-HHMMSS
   ```

3. Suggest creating a PR (do not auto-create).

## Error Handling

| Situation | Action |
|-----------|--------|
| Docker not running (testcontainers fail) | Skip Vitest, continue QA with lint + sc:analyze only |
| Biome not found | Skip lint if `npx biome` is unavailable |
| Git conflict | Abort the loop and report the situation to the user |
| Test timeout | Treat as failure after 120 seconds |
| 0 issues in all rounds | Report "codebase is in good shape" |
| MCP server not connected | Fall back to operation without that MCP (MCPs enhance but are not required) |
| /sc: command not installed | Fall back to operation without SuperClaude (use MCP + direct analysis) |
