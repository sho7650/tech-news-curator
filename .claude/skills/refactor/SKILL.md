---
name: refactor
description: Safe refactoring with pre/post validation
arguments:
  - name: target
    description: File or module to refactor
    required: true
  - name: strategy
    description: Refactoring strategy (extract|inline|rename|restructure|simplify)
    required: true
---

# Refactor Skill

## Process

1. Read {{target}} and all files that import from it
2. Run existing tests to establish baseline: `cd api && npm test`
3. Identify refactoring scope for strategy: {{strategy}}
4. Create a plan and present it for approval BEFORE making changes
5. Execute refactoring in small, atomic commits
6. Run tests after each change to verify no regressions
7. Update any affected imports across the codebase

## Strategies

### extract

- Extract functions, components, or modules into separate files
- Ensure single responsibility principle

### inline

- Collapse unnecessary abstractions
- Remove wrapper functions that add no value

### rename

- Rename for clarity across the entire codebase
- Update all references, imports, tests, and documentation

### restructure

- Move files/modules to better locations
- Update all import paths

### simplify

- Reduce cyclomatic complexity
- Replace complex conditionals with early returns or strategy patterns

## Safety Rules

- NEVER refactor and add features in the same commit
- ALWAYS run `cd api && npm test` between steps
- If tests fail, revert the last change and report
- Create ADR if refactoring changes architectural boundaries
