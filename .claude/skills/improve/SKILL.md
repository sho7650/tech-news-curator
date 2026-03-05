---
name: improve
description: |
  Autonomous improvement loop — repeatedly runs QA, Fix, and Refactor cycles to continuously improve code quality.
  Each round runs tests and auto-reverts refactoring commits that break tests.
  Leverages SuperClaude commands and MCP servers (serena, sequential-thinking, context7, playwright, tavily).
  Uses agent teams for parallel QA when CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is enabled.
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
Terminates early when open issues reach 0, or when abort conditions are triggered.

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

**Fallback rule:** If any MCP server or `/sc:` command is unavailable, log a warning and continue without it. MCPs and SuperClaude enhance the loop but are NOT required.

## Critical Safety Rules

- **All work MUST be done on a feature branch. NEVER modify the main branch.**
- Auto-revert refactoring commits when tests break after refactoring.
- Record results of each phase in `.improvement-state/`.
- Follow Conventional Commits format.
- **NEVER weaken or delete tests to make them pass.** Fix the implementation instead.

## Abort Conditions (Loop Stops Entirely)

The loop MUST stop immediately and report to the user if ANY of these occur:

1. **Git conflict**: Any git operation (revert, merge) fails with a conflict.
2. **Net regression**: Issue count INCREASES for 2 consecutive rounds.
3. **Recurring failure**: The same file/test fails in 2 consecutive rounds after being "fixed".
4. **Phase 2 regression**: A fix in Phase 2 causes NEW test failures that did not exist before.
5. **Consecutive reverts**: Phase 4 auto-revert triggers in 2 consecutive rounds.
6. **Test runner crash**: `npm test` exits non-zero but produces no `FAIL` lines AND no test summary line (infrastructure failure, not test failure).
7. **Disk space critical**: Less than 500MB free disk space.

When aborting, output:
```
=== LOOP ABORTED ===
Reason: {specific abort condition}
Round: N / {{rounds}}
Branch: {branch name}
Last stable state: {git tag name}
Action required: {what the user should do}
```

## Phase 0: Setup (first round only)

1. Verify the working directory is a git repository.
2. Run `git status` to confirm the working tree is clean.
   - If not clean, warn the user and abort.
3. Confirm the current branch is main.
4. Create a feature branch:
   ```bash
   BRANCH="improve/$(date +%Y%m%d-%H%M%S)"
   if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
     echo "ERROR: Branch $BRANCH already exists. Aborting."
     exit 1
   fi
   git checkout -b "$BRANCH"
   ```
5. Create the state directory:
   ```bash
   mkdir -p .improvement-state
   ```
6. Initialize the run log:
   ```bash
   echo "# Run Log — $BRANCH" > .improvement-state/run.log
   echo "Started: $(date -Iseconds)" >> .improvement-state/run.log
   echo "Parameters: rounds={{rounds}}, focus={{focus}}, dry-run={{dry-run}}" >> .improvement-state/run.log
   ```
7. Load `.improvement-config.json` if it exists. Otherwise use default values.
8. **Capture test baseline** — run the full test suite and record the initial state:
   ```bash
   cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1 | tee .improvement-state/test-baseline.log
   BASELINE_EXIT=$?
   ```
   Extract baseline test count from the summary line (see "Reading Test Output" section).
   Record: `BASELINE_TEST_COUNT={number}`, `BASELINE_FAIL_COUNT={number}`.
   This baseline is used throughout the loop to detect test count regressions.
9. **Use serena MCP to understand project structure** — Query serena for module structure, dependency graph, and key entry points. This improves analysis accuracy in subsequent phases.

## Reading Test Output

All phases that run tests MUST use this standardized procedure.

### Running tests with timeout

ALWAYS wrap test commands with a timeout:
```bash
cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1 | tee /tmp/test-output.log
TEST_EXIT=$?
```

### Classifying the exit code

If `TEST_EXIT` is non-zero, determine the cause:

1. **Timeout** (`TEST_EXIT=124`): Log as `[HIGH] Test execution timeout`. Check Docker status.
2. **Infrastructure failure**: Check output for these patterns:
   - `Cannot connect to Docker daemon` → Docker not running. Skip Vitest, continue with lint only.
   - `EADDRINUSE` or `port already in use` → Port conflict. Log warning and skip.
   - `no space left on device` → Trigger abort condition #7.
   - `Cannot find module.*vitest` → Config error. Abort loop.
   If ANY of these match, this is NOT a test failure. Do NOT file test issues.
3. **Actual test failure**: Output contains `FAIL` lines or the test summary shows `failed > 0`.

### Parsing test failures

Search the output for ALL of these patterns:

- **Standard failures**: Lines starting with `FAIL` (e.g., `FAIL  tests/file.ts > Test Name`)
- **Compilation errors**: Lines matching `error TS[0-9]` or `SyntaxError` or `ParseError`
- **Import errors**: Lines matching `Cannot find module`
- **Setup failures**: `beforeAll` or `beforeEach` errors in stack traces

**Create a separate issue for EACH failure.** Each issue MUST include:
- Test file name and line number
- Test name (if available)
- Error message
- Severity: **always HIGH**

### Verifying the test summary

Find the summary line (handles multiple Vitest formats):
```
Tests  2 failed | 144 passed (146)        ← Vitest 1.x
Test Files  1 failed | 12 passed (13)     ← Vitest 2.x
```

Extract `failed` and `passed` counts. If no summary line exists AND exit code is non-zero, treat as infrastructure failure.

### Test count regression check

Compare current total test count against `BASELINE_TEST_COUNT`:
- If current total < baseline: **ABORT. A test file may have been deleted.** Log the difference and investigate.
- If current total >= baseline: OK, proceed.

## Main Loop: Round 1 ~ {{rounds}}

Log `[Round N/{{rounds}}]` at the start of each round.

### Phase 1: QA (Issue Detection)

Scope: {{focus}}

**Create a savepoint before this round:**
```bash
git tag "savepoint-round-$ROUND_NUM"
```

If agent teams are available (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), run QA checks in parallel using 3 agent teams:
- **Team A**: Static analysis (1-1 Biome + 1-2 TypeScript)
- **Team B**: Test execution (1-3 Vitest)
- **Team C**: Code analysis (1-5 /sc:analyze + serena + sequential-thinking)

Otherwise, run sequentially.

#### 1-1. Biome Lint (when {{focus}} is api or all)

```bash
cd api && npx biome check src/ 2>&1
```

Extract warnings/errors from output and record as issues.

#### 1-2. TypeScript Type Check (when {{focus}} is api or all)

```bash
cd api && npx tsc --noEmit 2>&1
```

Record type errors as issues (severity: HIGH — type errors mean compilation failure).

#### 1-3. Vitest Tests (when {{focus}} is api or all)

Run tests using the standardized procedure in "Reading Test Output" section.
File each failure as a separate issue.

#### 1-4. Playwright E2E (when {{focus}} is frontend or all)

Only run if `qa.playwright` is `true` in `.improvement-config.json` (default: false).

**Pre-check**: Verify the frontend is running before attempting E2E:
```bash
curl -s --max-time 5 http://localhost:3100 >/dev/null 2>&1
```
If not reachable, skip Playwright and log: "Frontend not running on port 3100, skipping E2E."

When running, use **playwright MCP** for browser-based testing. Same failure detection rules as Vitest: each failure is a separate HIGH-severity issue.

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

**Use serena MCP alongside**: Leverage serena's semantic analysis to check module dependency issues, unused exports, and circular call graphs.

**Use sequential-thinking MCP alongside**: For complex architectural problems, use multi-step reasoning to identify root causes at the design level.

**Review target selection**: Prioritize files modified in the previous round or files with many lint issues. In round 1, focus on the service layer (`api/src/services/`) and route layer (`api/src/routes/`).

#### Issue Aggregation

Save all QA results to `.improvement-state/issues-round-N.md` in this format:

```markdown
# Issues - Round N

**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0
**Baseline test count**: {BASELINE_TEST_COUNT} | **Current test count**: {current}

## Issues

### [SEVERITY] Short description
- **File**: `path/to/file.ts:line`
- **Source**: lint | typecheck | vitest | playwright | sc:analyze | serena
- **Detail**: Description of the problem
- **Suggestion**: Proposed fix (if any)
```

**Decision**:
- Issue count is 0 → exit the loop and proceed to Phase 7 (Finalize).
- **Net regression check**: If this round's issue count > previous round's issue count, increment `REGRESSION_COUNTER`. If `REGRESSION_COUNTER >= 2`, trigger abort condition #2.

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

**Use context7 MCP alongside**: Look up official documentation for frameworks (Vitest, Playwright, testcontainers) via context7. Verify correct API usage, especially mock lifecycle (`vi.spyOn`, `mockImplementation`, `mockReset`, `restoreAllMocks`).

Fix procedure:
1. **Read the source code** of both the failing test file and the implementation under test.
2. **Identify the cause** using `/sc:troubleshoot` + context7.
3. **Decide the fix strategy**:
   - Bug in implementation → fix the implementation (NEVER weaken tests)
   - Mock/setup issue in test → fix the test code (this is a legitimate fix)
   - Outdated test (snapshot, expected values changed) → update the test
4. **After fixing, use serena to check impact**: If you changed a helper/util function, check all callers via serena. If impact is large, consider adding a NEW test.
5. **Verify the fix** by re-running only that test file:
   ```bash
   cd api && npx vitest run tests/{test file name} 2>&1
   ```
   If failures remain, retry the fix (maximum 3 attempts per test). If still failing after 3 attempts, log as "unresolvable" and proceed.

#### 2-3. Fix /sc:analyze Findings

Prioritize HIGH severity and above. Only fix MEDIUM and below if safe and low-risk.

Use **context7 MCP** to verify correct patterns for Hono / Drizzle / Zod before applying fixes.

#### 2-4. Commit

```bash
git add -A
git commit -m "fix: resolve N QA issues [round $ROUND_NUM]"
```

Update issues-round-N.md to reflect fixed issues (set status to `fixed`).

#### 2-5. Post-fix Regression Check (MANDATORY)

After committing Phase 2 fixes, run the full test suite to verify fixes did not introduce new failures:

```bash
cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1 | tee /tmp/postfix-output.log
POSTFIX_EXIT=$?
```

- **All tests pass**: Proceed to Phase 3.
- **New failures appear** (failures that were NOT in Phase 1 issue list): **Trigger abort condition #4.** Revert the Phase 2 commit:
  ```bash
  git revert --no-edit HEAD
  ```
  Log: "Phase 2 fix caused regression. Reverted. Round $ROUND_NUM marked as failed."
  Skip to Phase 5.
- **Same failures as Phase 1 remain**: Log as "partially fixed" and proceed to Phase 3.

### Phase 3: Refactor (Quality Improvement)

Skip this phase if {{dry-run}} is true.

**Pre-condition gate (MANDATORY):**
Run the full test suite:
```bash
cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1
```

**If ANY test fails:**
1. Attempt fix (same procedure as Phase 2-2, maximum 2 attempts).
2. If fixed: commit as `fix: repair failing tests before refactor [round $ROUND_NUM]`
3. Re-run full test suite to confirm ALL tests pass.
4. If still failing after 2 attempts: **skip Phase 3 entirely**, proceed to Phase 5. Log: "Refactoring skipped — tests not stable."

**Check refactor blocklist:** Load `.improvement-state/refactor-blocklist.json`. Skip any file/strategy combination that previously caused a revert.

**Use `/sc:cleanup` for refactoring:**

```
/sc:cleanup "{target file path} — strategy: {refactoring strategy}"
```

**Use serena MCP alongside**: Before refactoring, query serena to check:
- All modules that reference the target file (impact analysis)
- All callers of the target function
- Whether the change would introduce circular dependencies

**Use serena to verify test coverage**: Before refactoring a file, check if it has corresponding test files. If test coverage is low, skip this refactoring candidate.

Also refer to `references/refactor-patterns.md` for safe refactoring patterns.

Maximum 3 refactorings per round (configurable via `refactor.max_per_round` in `.improvement-config.json`).

Refactoring candidate selection criteria:
- Files where Phase 1 found issues
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Complex conditionals (nesting 3+ levels)
- Duplicate code
- **Exclude files in refactor-blocklist**

**Commit each refactoring individually:**

```bash
git add -A
git commit -m "refactor: {specific description} [round $ROUND_NUM]"
```

### Phase 4: E2E Safety Check

Only run if refactoring was performed in Phase 3.

```bash
cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1 | tee /tmp/safety-output.log
SAFETY_EXIT=$?
```

Also run the test count regression check (current total >= BASELINE_TEST_COUNT).

#### On test success

Proceed to Phase 5. Reset `CONSECUTIVE_REVERT_COUNT` to 0.

#### On test failure — Auto-Revert

Identify and revert Phase 3 refactoring commits using stable SHAs:

```bash
# Collect refactor commit SHAs (newest first)
REFACTOR_SHAS=$(git log --oneline "savepoint-round-$ROUND_NUM"..HEAD | grep "refactor:.*\[round $ROUND_NUM\]" | awk '{print $1}')

# Revert each (newest first)
for SHA in $REFACTOR_SHAS; do
  if ! git revert --no-edit "$SHA" 2>&1; then
    echo "ERROR: Revert conflict on $SHA. Aborting loop."
    git revert --abort
    # Trigger abort condition #1 (git conflict)
    exit 1
  fi
done
```

After revert, re-run tests:
```bash
cd api && timeout --kill-after=10s ${TEST_TIMEOUT:-120}s npm test 2>&1
```

- **Tests pass**: Log "Refactoring reverted, tests recovered." Add the refactored file + strategy to `.improvement-state/refactor-blocklist.json`. Increment `CONSECUTIVE_REVERT_COUNT`.
- **Tests still fail**: Phase 2 fixes also have problems. Revert to the savepoint:
  ```bash
  git revert --no-edit "savepoint-round-$ROUND_NUM"..HEAD
  ```
  Log: "Full round revert. Both fixes and refactoring reverted."

**Consecutive revert check**: If `CONSECUTIVE_REVERT_COUNT >= 2`, trigger abort condition #5.

### Phase 5: Reflection (Record Results)

**Use `/sc:reflect` for a structured retrospective:**

```
/sc:reflect "Improvement Loop Round $ROUND_NUM retrospective:
- QA found X issues (sources: lint, typecheck, vitest, sc:analyze, serena)
- Fixed Y issues (auto-fix: p, troubleshoot: q)
- Refactored Z files (reverted: W)
- E2E Safety: PASSED/REVERTED/SKIPPED
Analyze what went well, what didn't, and patterns to watch."
```

Append output to `.improvement-state/reflection-log.md`:

```markdown
## Round N - YYYY-MM-DD HH:MM

| Phase | Result |
|-------|--------|
| QA | X issues found (H:a, M:b, L:c) |
| Fix | Y/X issues fixed (auto: p, troubleshoot: q) |
| Post-fix regression | PASSED / REVERTED |
| Refactor | Z refactorings applied / SKIPPED |
| E2E Safety | PASSED / REVERTED / SKIPPED |

### Tool Usage
- serena: {what dependency analysis revealed}
- context7: {which docs were referenced}
- sequential-thinking: {which problems used multi-step reasoning}

### Modified Files
- `path/to/file1.ts` - summary of changes

### Observations
(1-3 sentence summary from /sc:reflect analysis)

---
```

Also append a summary line to `.improvement-state/run.log`.

### Phase 6: Self-Learning (Improve the Improvement Process)

**Run ONLY after the final round** (not during intermediate rounds).

**Use sequential-thinking MCP for pattern analysis:**
Analyze all rounds in `.improvement-state/reflection-log.md`:
- Step 1: Organize trends in issue count, fix count, and revert rate across rounds
- Step 2: Identify recurring issue category patterns
- Step 3: Analyze correlation between tool usage and fix success rate
- Step 4: Generate prioritized improvement suggestions

**Use tavily MCP to research best practices:**
For recurring problem categories, search for latest best practices:
- e.g., "vitest mock lifecycle best practices 2025"
- e.g., "hono error handling patterns"

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

1. Clean up Docker containers from testcontainers:
   ```bash
   docker ps --filter "label=org.testcontainers=true" --format "{{.ID}}" | xargs -r docker stop 2>/dev/null
   docker ps -a --filter "label=org.testcontainers=true" --format "{{.ID}}" | xargs -r docker rm 2>/dev/null
   ```

2. Output a final summary:
   ```
   === Improvement Loop Summary ===
   Rounds completed: X / {{rounds}}
   Total issues found: Y
   Total issues fixed: Z
   Refactorings applied: W (reverted: V)
   Tools used: serena, context7, sequential-thinking, tavily, playwright
   Branch: $BRANCH

   === Changes Summary ===
   {output of: git log main..$BRANCH --oneline}
   {output of: git diff main...$BRANCH --stat}
   ```

3. **[MANUAL GATE]** Ask the user whether to push the branch:
   ```
   Push $BRANCH to origin? The summary above shows all changes.
   ```
   - If confirmed: `git push -u origin "$BRANCH"`. Check exit code. If push fails, report error.
   - If not confirmed: Keep branch local.

4. Suggest creating a PR (do not auto-create).

## Error Handling

| Situation | Action |
|-----------|--------|
| Docker not running (testcontainers fail) | Skip Vitest, continue QA with lint + sc:analyze only |
| Biome not found | Skip lint if `npx biome` is unavailable |
| Git conflict | **ABORT** the loop (abort condition #1) |
| Test timeout (exit code 124) | Treat as HIGH-severity issue. If 3+ timeouts in one run, ABORT |
| 0 issues in all rounds | Report "codebase is in good shape" |
| MCP server not connected | Log warning, continue without that MCP |
| /sc: command not installed | Log warning, continue without SuperClaude |
| Disk space < 500MB | **ABORT** (abort condition #7) |
| Test count decreased | **ABORT** — potential test file deletion |
