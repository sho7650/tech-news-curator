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
3. Fill in the template interactively, asking for:
   - Context: What is the issue motivating this decision?
   - Decision Drivers: What forces are at play?
   - Considered Options: What alternatives were evaluated?
   - Decision Outcome: What was chosen and why?

## Process for "list"

- List all ADRs with number, title, status, and date in a table

## Process for "supersede"

- Update the old ADR's status to "Superseded by ADR-{{new_number}}"
- Create new ADR referencing the old one

## Process for "deprecate"

- Update the ADR's status to "Deprecated"
- Add deprecation note with reason and date

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
