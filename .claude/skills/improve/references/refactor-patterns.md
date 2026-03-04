# Refactoring Patterns

This document defines safe refactoring patterns for Phase 3 (Refactor) of the autonomous improvement loop.

## Core Principles

1. **Preserve behavior**: Refactoring MUST NOT change externally observable behavior.
2. **One commit per change**: Each refactoring is an independent commit.
3. **Verify with tests**: Always run tests after refactoring.
4. **Keep reversible**: Keep changes small enough to safely `git revert`.

## Pattern 1: Extract Function (extract-function)

**When to apply**: Function exceeds 50 lines.

**Steps**:
1. Identify a cohesive block of logic within the function.
2. Extract it into a new private function.
3. Call the new function from the original location.
4. Carry over type information accurately.

**Warnings**:
- Be careful when extracting blocks with side effects.
- Pass closure-captured variables as explicit arguments.
- Name the extracted function to accurately describe its purpose.

**Commit message example**: `refactor: extract parseArticleContent from ingest-service [round N]`

## Pattern 2: Simplify Conditional (simplify-conditional)

**When to apply**: Nesting 3+ levels deep, or complex boolean expressions.

**Steps**:
1. Reduce nesting with guard clauses (early return).
2. Extract complex conditions into named boolean variables.
3. Replace switch statements with object maps (when appropriate).

**Warnings**:
- Ensure removing else clauses preserves the original logic exactly.
- Watch for side effects when reordering conditions.

**Commit message example**: `refactor: simplify error handling conditionals in article-service [round N]`

## Pattern 3: Remove Duplication (remove-duplication)

**When to apply**: Same or very similar code blocks exist in 2+ locations.

**Steps**:
1. Identify duplicate sections and clarify their differences.
2. Parameterize differences and create a shared function.
3. Replace original locations with calls to the shared function.
4. Place the shared function in an appropriate module (avoid dumping into generic utils/helpers).

**Warnings**:
- Do NOT deduplicate coincidental duplication (looks the same but exists for different reasons).
- Verify that deduplication does not create complex dependency chains.

**Commit message example**: `refactor: extract shared pagination logic from article and source routes [round N]`

## Pattern 4: Split File (split-file)

**When to apply**: File exceeds 300 lines.

**Steps**:
1. Classify responsibilities within the file.
2. Create new files and move related code.
3. Update export/import statements.
4. Add re-exports in index.ts (if needed).

**Warnings**:
- MUST NOT create circular dependencies.
- Update ALL existing import paths.
- Update test file imports as well.

**Commit message example**: `refactor: split article-service into article-query and article-mutation [round N]`

## Pattern 5: Strengthen Types (strengthen-types)

**When to apply**: Use of `any` type, excessive type assertions, insufficient type guards.

**Steps**:
1. Replace `any` with specific types.
2. Replace type assertions (`as Type`) with type guard functions.
3. Add exhaustive checks for union types.

**Warnings**:
- When external library type definitions are insufficient, allow `any` with a `// biome-ignore` comment.
- Verify that type changes do not break existing tests.

**Commit message example**: `refactor: replace any types with proper interfaces in ingest-service [round N]`

## Patterns NOT to Apply

The following refactorings are **NOT performed** in the autonomous improvement loop (too risky):

- Architecture changes (major directory structure reorganization)
- Database schema changes
- External API interface changes
- Dependency library updates
- Test framework or build tool changes
- Performance optimization (optimization without measurement is harmful)
