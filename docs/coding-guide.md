You are restructuring an existing TypeScript/JS Chrome Extension repository into a modular Claude Code project structure. The repository already has a .claude/ directory. Your job is to reorganize and augment it following the architecture below, preserving all existing source code and git history.

## Target Directory Structure

```
tech-news-curator/
├── CLAUDE.md                  # Project memory & instructions for Claude
├── README.md                  # Human-facing documentation
│
├── docs/
│   ├── architecture.md        # System architecture overview
│   ├── decisions/             # ADR (Architecture Decision Records)
│   │   ├── ADR-001-*.md
│   │   └── ADR-TEMPLATE.md
│   └── runbooks/              # Operational runbooks
│
├── .claude/
│   ├── settings.json          # Claude Code settings
│   ├── hooks/
│   │   ├── pre-commit.sh      # Lint + type-check before commit
│   │   ├── post-tool-output.sh # Validate & clean tool output
│   │   └── validate-json.sh   # JSON structure validation
│   └── skills/
│       ├── code-review/
│       │   └── SKILL.md
│       ├── refactor/
│       │   └── SKILL.md
│       ├── release/
│       │   └── SKILL.md
│       └── adr/
│           └── SKILL.md
│
├── tools/
│   ├── scripts/               # Build, deploy, utility scripts
│   └── prompts/               # Reusable prompt templates
│
└── src/                       # Existing source code (preserve as-is)
    ├── ... (existing structure)
    └── CLAUDE.md              # Module-level context (optional)
```

## Execution Plan

Work through these phases in order. After each phase, report what you created/moved and confirm before proceeding.

### Phase 1: Audit Current State

1. List the current directory structure (2 levels deep).
2. Read the existing .claude/ directory contents.
3. Read the existing CLAUDE.md if present.
4. Identify what already exists vs. what needs to be created.
5. Summarize findings and wait for my confirmation.

### Phase 2: Create CLAUDE.md (Project Memory)

Create or rewrite the root CLAUDE.md with these sections:

```markdown
# tech-news-curator

## Project Overview

{{Brief description of the Chrome extension and its purpose}}

## Tech Stack

- Language: TypeScript
- Runtime: Chrome Extension (Manifest V3)
- Build: {{webpack/vite/rollup — detect from existing config}}
- Package Manager: {{npm/yarn/pnpm — detect from lockfile}}
- Testing: {{detect from existing config}}

## Standards & Constraints

- All code must pass `tsc --noEmit` with strict mode
- ESLint + Prettier enforced on every commit
- No `any` types unless explicitly justified with a comment
- Chrome Extension Manifest V3 APIs only
- Minimum Chrome version: {{detect or ask}}

## Tone & Style

- Commit messages: Conventional Commits (feat/fix/refactor/docs/chore)
- Code comments: English, concise, "why" not "what"
- Variable naming: camelCase for variables, PascalCase for types/interfaces

## Non-Negotiables

- Never modify user data without explicit consent
- All storage operations must be wrapped in try/catch
- CSP-compliant: no inline scripts, no eval()
- Permissions must follow principle of least privilege

## Guardrails

- Max file length: 300 lines (split if exceeded)
- Max function length: 50 lines
- Cyclomatic complexity: ≤ 10 per function
- No circular dependencies between modules
```

Detect actual values from the existing codebase wherever possible. Ask me for anything you cannot infer.

### Phase 3: Set Up Skills

Create each SKILL.md with YAML frontmatter. Each skill must be self-contained and reusable.

#### .claude/skills/code-review/SKILL.md

```markdown
---
name: code-review
description: Structured code review with severity-based findings
arguments:
  - name: target
    description: File path or glob pattern to review
    required: true
  - name: focus
    description: Review focus area (security|performance|readability|all)
    default: all
---

# Code Review Skill

## Process

1. Read the target file(s): {{target}}
2. Check against project standards defined in root CLAUDE.md
3. Analyze for: type safety, error handling, Chrome API usage, CSP compliance, accessibility
4. Focus area: {{focus}}

## Output Format

For each finding, output:

### [SEVERITY] Title

- **File**: `path/to/file.ts:lineNumber`
- **Category**: security | performance | readability | maintainability | correctness
- **Finding**: Description of the issue
- **Suggestion**: Concrete fix with code example
- **Reference**: Link to relevant docs or ADR if applicable

Severity levels: 🔴 CRITICAL | 🟠 HIGH | 🟡 MEDIUM | 🔵 LOW | ✅ GOOD (positive callout)

## Checklist

- [ ] No `any` types without justification
- [ ] All async operations have error handling
- [ ] Chrome APIs used correctly (MV3)
- [ ] No hardcoded strings (use constants or i18n)
- [ ] Functions ≤ 50 lines
- [ ] No circular imports
```

#### .claude/skills/refactor/SKILL.md

```markdown
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
2. Run existing tests to establish baseline: `npm test`
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
- ALWAYS run tests between steps
- If tests fail, revert the last change and report
- Create ADR if refactoring changes architectural boundaries
```

#### .claude/skills/release/SKILL.md

```markdown
---
name: release
description: Chrome extension release workflow
arguments:
  - name: version
    description: Semver version (major|minor|patch or explicit like 1.2.3)
    required: true
  - name: channel
    description: Release channel (dev|beta|production)
    default: production
---

# Release Skill

## Process

1. Verify clean working tree: `git status --porcelain`
2. Run full test suite: `npm test`
3. Run linting: `npm run lint`
4. Run type check: `tsc --noEmit`
5. Bump version in package.json and manifest.json: {{version}}
6. Update CHANGELOG.md following Keep a Changelog format
7. Build for {{channel}}: `npm run build`
8. Verify build output (check zip size, file count)
9. Create git tag: `v{{resolved_version}}`
10. Generate release notes from conventional commits since last tag
11. Present summary for approval before pushing

## Pre-Release Checklist

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No lint warnings
- [ ] manifest.json permissions unchanged (or justified in ADR)
- [ ] CHANGELOG.md updated
- [ ] Version bumped in all relevant files

## Channel-Specific Steps

- **dev**: Build only, no tag, no changelog
- **beta**: Tag as v{{version}}-beta.N, limited release notes
- **production**: Full changelog, git tag, release notes
```

#### .claude/skills/adr/SKILL.md

````markdown
---
name: adr
description: Create or update Architecture Decision Records
arguments:
  - name: action
    description: Action to perform (new|list|supersede|deprecate)
    required: true
  - name: title
    description: ADR title (required for 'new')
    required: false
---

# ADR Skill

## Process for "new"

1. List existing ADRs in docs/decisions/ to determine next number
2. Create docs/decisions/ADR-{{NNN}}-{{slugified_title}}.md
3. Fill in the template interactively, asking me for:
   - Context: What is the issue motivating this decision?
   - Decision Drivers: What forces are at play?
   - Considered Options: What alternatives were evaluated?
   - Decision Outcome: What was chosen and why?

## ADR Template (Thinking ADR Format)

```markdown
# ADR-{{NNN}}: {{title}}

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-{{NNN}}

## Date

{{YYYY-MM-DD}}

## Context

{{What is the issue? What forces are at play?}}

## Decision Drivers

- {{Driver 1}}
- {{Driver 2}}

## Considered Options

1. {{Option A}}
2. {{Option B}}
3. {{Option C}}

## Decision Outcome

Chosen option: "{{Option X}}", because {{justification}}.

### Positive Consequences

- {{Benefit 1}}
- {{Benefit 2}}

### Negative Consequences

- {{Tradeoff 1}}
- {{Tradeoff 2}}

## Thinking Process

{{How did we arrive at this decision? What mental models or frameworks informed the choice?}}

## Links

- Related: ADR-{{NNN}}
- Implements: {{issue/PR link if applicable}}
```
````

## Process for "list"

- List all ADRs with number, title, status, and date in a table

## Process for "supersede"

- Update the old ADR's status to "Superseded by ADR-{{new_number}}"
- Create new ADR referencing the old one

## Process for "deprecate"

- Update the ADR's status to "Deprecated"
- Add deprecation note with reason and date

````

### Phase 4: Set Up Hooks

#### .claude/hooks/pre-commit.sh

```bash
#!/bin/bash
# Pre-commit guardrails
set -euo pipefail

echo "🔍 Running pre-commit checks..."

# Type check
echo "  → TypeScript type check..."
npx tsc --noEmit || { echo "❌ Type check failed"; exit 1; }

# Lint
echo "  → ESLint..."
npx eslint . --ext .ts,.tsx --max-warnings 0 || { echo "❌ Lint failed"; exit 1; }

# Format check
echo "  → Prettier check..."
npx prettier --check "src/**/*.{ts,tsx,json}" || { echo "❌ Format check failed"; exit 1; }

echo "✅ All pre-commit checks passed"
````

#### .claude/hooks/post-tool-output.sh

```bash
#!/bin/bash
# Validate and clean Claude tool output
set -euo pipefail

# Strip ANSI codes from output
sed 's/\x1b\[[0-9;]*m//g'

# Validate JSON if output looks like JSON
if echo "$1" | head -c1 | grep -q '{'; then
  echo "$1" | jq . > /dev/null 2>&1 || echo "⚠️  Invalid JSON in tool output"
fi
```

### Phase 5: Set Up Documentation

1. Create `docs/architecture.md` by analyzing the existing codebase:
   - Identify main modules and their responsibilities
   - Map Chrome Extension components (background, content scripts, popup, options)
   - Document message passing patterns
   - Document storage patterns

2. Create `docs/decisions/ADR-TEMPLATE.md` using the Thinking ADR template from the adr skill above.

3. Create `docs/decisions/ADR-001-adopt-claude-code-project-structure.md`:
   - Context: Why we are restructuring
   - Decision: Adopt modular Claude Code project structure
   - Consequence: Better AI-assisted development, reusable workflows

4. Create `docs/runbooks/` with at least:
   - `local-dev-setup.md`
   - `release-process.md`

### Phase 6: Create tools/ Directory

1. Create `tools/scripts/` — move or create build/utility scripts
2. Create `tools/prompts/` — extract any reusable prompt patterns from existing conversations or comments

### Phase 7: Module-Level CLAUDE.md (Optional)

If the src/ directory has clearly separated modules (e.g., src/background/, src/popup/, src/content/), create a CLAUDE.md in each major module directory with:

- Module purpose (1-2 sentences)
- Key files and their roles
- Dependencies and interfaces
- Testing approach

### Phase 8: Validate & Report

1. Show the final directory tree (3 levels deep)
2. Verify no source files were lost (compare file count before/after)
3. Run `npm test` to confirm nothing is broken
4. Run `tsc --noEmit` to confirm type safety
5. List all new files created with one-line descriptions
6. Suggest next steps (e.g., MCP integrations, subagents, GitHub Actions)

## Critical Rules

- NEVER delete existing source files — only MOVE or AUGMENT
- NEVER modify existing logic during restructuring — structure only
- Commit after each phase with a descriptive conventional commit message
- If anything is ambiguous, ASK before proceeding
- Preserve all git history (use `git mv` for moves)
- Keep .claude/settings.json intact — only add, never remove existing settings

````

---

## Quick Start

```bash
cd /path/to/your-chrome-extension
# Paste the prompt above into Claude Code
# Replace tech-news-curator with your actual project name
# Claude will start with Phase 1 (audit) and ask for confirmation at each step
````

## Notes

- The prompt is designed to be **interactive** — Claude will pause at each phase for your approval.
- **Thinking ADR format** is integrated into the ADR skill, aligned with your framework.
- All skills use **YAML frontmatter** for Claude Code's native skill invocation (`/code-review`, `/refactor`, `/release`, `/adr`).
- Hooks are kept simple and bash-based for maximum portability.
