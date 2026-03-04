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
3. Analyze for: type safety, error handling, Hono API patterns, Drizzle ORM usage, security
4. Focus area: {{focus}}

## Output Format

For each finding, output:

### [SEVERITY] Title

- **File**: `path/to/file.ts:lineNumber`
- **Category**: security | performance | readability | maintainability | correctness
- **Finding**: Description of the issue
- **Suggestion**: Concrete fix with code example
- **Reference**: Link to relevant docs or ADR if applicable

Severity levels: CRITICAL | HIGH | MEDIUM | LOW | GOOD (positive callout)

## Checklist

- [ ] No `any` types without justification
- [ ] All async operations have error handling
- [ ] Hono middleware used correctly (context flow, error propagation)
- [ ] Drizzle ORM queries use proper typing (no raw SQL without justification)
- [ ] Zod schemas validate all external input
- [ ] No hardcoded strings (use constants or environment variables)
- [ ] Functions ≤ 50 lines
- [ ] Files ≤ 300 lines
- [ ] No circular imports
- [ ] SSRF protection on external URL fetching (safe-fetch.ts)
- [ ] Copyright constraint respected (no body_original/body_translated in public responses)
