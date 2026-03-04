# Issues - Round 3 (Session 3)

**Found**: 3 issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=3, LOW=0
**Note**: Biome clean, TypeScript clean, Vitest 146/146 passed.

## Issues

### [MEDIUM] #1 ReDoS risk in CONTACT_INFO_PATTERNS regex
- **File**: `src/services/text-cleaner.ts:37`
- **Source**: code-analysis
- **Detail**: Greedy `.*` in `/\b(?:contact|reach|...)\b.*\S+@\S+/i` can cause backtracking on long input. Input is capped at 200 chars by caller, limiting practical risk, but `.*?` is strictly better.
- **Suggestion**: Replace `.*` with `.*?` (non-greedy)

### [MEDIUM] #2 ReDoS risk in View Bio/Profile regex
- **File**: `src/services/text-cleaner.ts:39`
- **Source**: code-analysis
- **Detail**: Greedy `.*` in `/^\[View (?:Bio|Profile)\]\(.*\)\s*$/i` backtracks when `)` is absent. Use `[^)]*` instead.
- **Suggestion**: Replace `.*` with `[^)]*` for bounded match

### [MEDIUM] #3 Empty types/env.ts — dead file
- **File**: `src/types/env.ts`
- **Source**: code-analysis
- **Detail**: File is 0 bytes, no exports, no imports reference it. Dead code from previous cleanup.
- **Suggestion**: Delete file
