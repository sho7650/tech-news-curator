# Design: Digest Source Articles Endpoint

**Status:** Implemented
**Date:** 2026-06-20
**Branch:** `feat/digest-source-articles`

## Motivation

The `digest` feature stores a finished daily digest (`POST /digest`), but building
that digest in n8n required fetching the article **list** (`GET /articles?date=`,
bodies omitted) and then calling `GET /articles/:id` once per article to obtain the
full text — N+1 requests and glue code on the n8n side.

This endpoint returns a whole JST day's articles **with the content needed for LLM
digest generation** in a single request. n8n feeds the response to an LLM and POSTs
the generated digest back to the existing `POST /digest`.

## Endpoint

```
GET /digest/source-articles?date=YYYY-MM-DD
```

- `date` (optional): a **JST** calendar date. When omitted, defaults to **前日**
  (yesterday in JST, computed from server time).
- Read-only; rate-limited (60/min); no API key required — consistent with the other
  read endpoints (`GET /articles/:id`, etc.). Like the detail endpoint it returns
  translated bodies, so it must remain on the internal network and not be exposed
  publicly. (See `CLAUDE.md` → Content Access.)

### Response

```jsonc
{
  "date": "2026-06-19",
  "count": 42,
  "truncated": false,           // true if the safety cap (500) was hit
  "articles": [
    {
      "id": "…",                // pass back as POST /digest article_ids
      "source_url": "…",
      "source_name": "…",
      "title_original": "…",
      "title_ja": "…",
      "summary_ja": "…",
      "body_translated": "…",   // Japanese body for the LLM
      "author": "…",
      "published_at": "…",
      "categories": ["…"],
      "created_at": "…"
    }
  ]
}
```

`body_original` is **not** returned (more conservative than the detail endpoint);
only the Japanese `summary_ja` + `body_translated` are needed for digest generation.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Date basis | **`created_at`** (collection date) | A daily digest summarizes what was *collected* that day; RSS `published_at` is uneven and may be null. |
| Timezone | **JST** half-open interval `[date 00:00+09:00, +1 day)` | Owner is in Japan; "前日" means the JST calendar day. `created_at` is stored as TIMESTAMPTZ (UTC) and compared against the JST-derived UTC bounds. |
| Content | `summary_ja` + `body_translated` | Enough for an LLM digest; avoids the larger `body_original`. |
| Volume | All rows, capped at **500** (`DIGEST_SOURCE_MAX`), newest-first | One request for n8n; `truncated` flags overflow without silently dropping. |

## Implementation

- `src/lib/jst-date.ts` — `jstDayInterval(date)` and `jstYesterday(now)` (pure, unit-tested).
- `src/services/article-service.ts` — `getArticlesForDigest(db, date, limit)`; selects
  the digest field subset (excludes `body_original`), filters by `created_at` in the
  JST interval, orders `created_at DESC`, fetches `limit + 1` to detect truncation.
- `src/routes/digest.ts` — `GET /digest/source-articles`, registered **before**
  `/digest/:digest_date` so the static segment is not parsed as a date.
- `src/schemas/digest.ts` — `digestSourceQuerySchema`, `DigestSourceArticle`, `DigestSourceResponse`.

### Incidental fix

`src/schemas/base.ts` `dateString` `.refine()` called `toISOString()` on an Invalid
Date for regex-passing-but-invalid inputs (e.g. `2026-13-40`), which **threw** and
surfaced as a 500. Guarded with `Number.isNaN(parsed.getTime())` so such inputs now
correctly return 422 across all endpoints that use `dateString`.

## Tests

- `tests/jst-date.test.ts` — interval bounds, 24h width, month/year boundaries,
  yesterday computation across UTC↔JST day boundaries.
- `tests/digest-source.test.ts` — JST boundary inclusion/exclusion, field selection
  (`body_translated`/`summary_ja` present, `body_original` absent), DESC ordering,
  empty day, truncation cap, route envelope, default-to-前日, and 422 on invalid date.
