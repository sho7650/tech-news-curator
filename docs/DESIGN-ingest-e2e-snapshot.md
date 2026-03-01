# Ingest E2E Snapshot テスト — 設計書

## 目的

実データ HTML を fixture として保存し、`extractArticle()` の出力を
Vitest snapshot で管理する。ネットワーク不要で再現可能な回帰テストを実現する。

---

## 方針

- **Snapshot テスト** (`toMatchSnapshot()`) で出力全体を検証
- **ノイズ不在アサーション** を snapshot と併用し、Phase 1/2 除去ルールの回帰を明示的に検出
- **DI パラメータ** で `safeFetch` を差し替え（既存プロジェクトのモックパターンに合致、`vi.mock()` 不使用）

---

## ファイル構成

```
api/
  tests/
    fixtures/
      ingest-e2e-1-techcrunch-wbd.html        ← 記事 #1 生 HTML (~250KB)
      ingest-e2e-2-techcrunch-anthropic.html   ← 記事 #2 生 HTML
      ingest-e2e-3-techcrunch-netflix.html     ← 記事 #3 生 HTML
      ingest-e2e-4-arstechnica-chatgpt.html    ← 記事 #4 生 HTML
    ingest-e2e.test.ts                         ← E2E snapshot テスト
    __snapshots__/
      ingest-e2e.test.ts.snap                  ← Vitest 自動生成
  scripts/
    capture-fixtures.ts                        ← HTML 取得スクリプト（一回限り）
  src/services/
    ingest-service.ts                          ← extractArticle() に fetcher DI 追加
```

---

## 変更詳細

### 1. `extractArticle()` に DI パラメータ追加

```typescript
// Before
export async function extractArticle(url: string): Promise<IngestResponse | null> {
  const html = await safeFetch(url);

// After
export async function extractArticle(
  url: string,
  fetcher: (url: string) => Promise<string | null> = safeFetch,
): Promise<IngestResponse | null> {
  const html = await fetcher(url);
```

- デフォルト引数 `= safeFetch` により、既存の呼び出し元は変更不要
- 既存テスト (`ingest.test.ts`) のモックパターンと一貫性あり

### 2. HTML fixture 取得スクリプト

`api/scripts/capture-fixtures.ts` — 一回限りの実行で 4 URL の HTML を保存。

```typescript
import { safeFetch } from "../src/services/safe-fetch.js";
import { writeFileSync } from "node:fs";

const URLS = [
  { file: "ingest-e2e-1-techcrunch-wbd.html", url: "https://techcrunch.com/..." },
  { file: "ingest-e2e-2-techcrunch-anthropic.html", url: "https://techcrunch.com/..." },
  { file: "ingest-e2e-3-techcrunch-netflix.html", url: "https://techcrunch.com/..." },
  { file: "ingest-e2e-4-arstechnica-chatgpt.html", url: "https://arstechnica.com/..." },
];

for (const { file, url } of URLS) {
  const html = await safeFetch(url);
  if (!html) {
    console.error(`Failed to fetch: ${url}`);
    process.exit(1);
  }
  writeFileSync(`tests/fixtures/${file}`, html, "utf-8");
  console.log(`Saved: ${file} (${html.length} bytes)`);
}
```

実行後、fixture ファイルを git にコミットし、スクリプトは削除可。

### 3. E2E snapshot テスト

```typescript
// api/tests/ingest-e2e.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { IngestResponse } from "../src/schemas/ingest.js";
import { extractArticle } from "../src/services/ingest-service.js";

// Node.js 22.x: import.meta.dirname は ESM で __dirname 相当
const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

interface FixtureCase {
  id: number;
  file: string;
  url: string;
  label: string;
  noiseAbsent: string[];
  authorExpected?: string;
}

const FIXTURE_CASES: FixtureCase[] = [
  {
    id: 1,
    file: "ingest-e2e-1-techcrunch-wbd.html",
    url: "https://techcrunch.com/2026/02/28/warner-bros-netflix-paramount-acquisition-timeline-wbd/",
    label: "TechCrunch: WBD sale",
    noiseAbsent: ["Techcrunch event", "Boston, MA | June 9, 2026"],
  },
  {
    id: 2,
    file: "ingest-e2e-2-techcrunch-anthropic.html",
    url: "https://techcrunch.com/2026/02/28/the-trap-anthropic-built-for-itself/",
    label: "TechCrunch: Anthropic trap",
    noiseAbsent: ["Techcrunch event", "San Francisco, CA | October 13-15, 2026"],
  },
  {
    id: 3,
    file: "ingest-e2e-3-techcrunch-netflix.html",
    url: "https://techcrunch.com/2026/02/28/why-did-netflix-back-down-from-its-deal-to-acquire-warner-bros/",
    label: "TechCrunch: Netflix backs down",
    noiseAbsent: [
      "In Brief", "Posted:", "2:07 PM PST",
      "### Newsletters", "Subscribe for the industry",
      "## Related", "## Latest in Media",
    ],
  },
  {
    id: 4,
    file: "ingest-e2e-4-arstechnica-chatgpt.html",
    url: "https://arstechnica.com/health/2026/02/did-chatgpt-help-health-officials-solve-a-weird-outbreak-maybe/",
    label: "Ars Technica: ChatGPT outbreak",
    noiseAbsent: [],
    authorExpected: "Beth Mole",
  },
];

describe("ingest E2E (fixture-based snapshot)", () => {
  for (const fixture of FIXTURE_CASES) {
    describe(`Article #${fixture.id}: ${fixture.label}`, () => {
      let result: IngestResponse | null;

      beforeAll(async () => {
        const html = readFileSync(resolve(FIXTURES_DIR, fixture.file), "utf-8");
        const fetcher = vi.fn().mockResolvedValue(html);
        result = await extractArticle(fixture.url, fetcher);
      });

      it("should match snapshot", () => {
        expect(result).toMatchSnapshot();
      });

      if (fixture.noiseAbsent.length > 0) {
        it("should not contain known noise patterns", () => {
          for (const noise of fixture.noiseAbsent) {
            expect(result?.body).not.toContain(noise);
          }
        });
      }

      if (fixture.authorExpected) {
        it("should have trimmed author field", () => {
          expect(result?.author).toBe(fixture.authorExpected);
        });
      }
    });
  }
});
```

---

## テスト一覧（期待: 8 テスト）

| # | テスト | 記事 |
|---|--------|------|
| 1 | snapshot 一致 | #1 TechCrunch WBD |
| 2 | ノイズ不在 | #1 イベントプロモ × 2 |
| 3 | snapshot 一致 | #2 TechCrunch Anthropic |
| 4 | ノイズ不在 | #2 イベントプロモ × 2 |
| 5 | snapshot 一致 | #3 TechCrunch Netflix |
| 6 | ノイズ不在 | #3 メタデータ + ナビ × 7 |
| 7 | snapshot 一致 | #4 Ars Technica |
| 8 | author trim | #4 `"Beth Mole"` |

（計 8 テスト。ノイズ不在は記事ごとに 1 テストにまとめて内部ループ）

---

## snapshot 更新ワークフロー

```bash
# 初回 or クリーンアップ関数変更後
cd api && npx vitest run tests/ingest-e2e.test.ts --update

# 通常の回帰テスト
cd api && npm test
```

`--update` 実行後は `__snapshots__/ingest-e2e.test.ts.snap` の diff を確認してコミット。

---

## fixture サイズと .gitignore

| fixture | 想定サイズ |
|---------|-----------|
| 記事 #1 | ~250 KB |
| 記事 #2 | ~200 KB |
| 記事 #3 | ~150 KB |
| 記事 #4 | ~200 KB |
| **合計** | **~800 KB** |

HTML fixture は git にコミットする（テストの再現性のため）。
`.gitignore` への追加は不要。

---

## 設計判断

### snapshot 粒度: `IngestResponse` 全体

`body` フィールド単位ではなく `IngestResponse` オブジェクト全体を snapshot 対象とする。

**理由**:
- `title`, `author`, `published_at`, `og_image_url` の抽出ロジック変更も回帰検出したい
- フィールド間の整合性（例: body 内容と title の関連）を一括で確認できる
- snapshot 更新時の diff で全フィールドの変化を一目で把握可能

`body` が大きいため snapshot ファイルは数 KB になるが、4 記事分なので許容範囲。

### `beforeAll` による fixture 共通化

同一 fixture に対する `extractArticle()` の呼び出しは決定的であり、
`describe` ブロック内で `beforeAll` を使い 1 回だけ実行する。
これにより各 `it()` ブロックの重複コードを排除し、テスト実行時間も短縮する。

### ノイズ不在アサーションの役割

snapshot テストのみでもノイズ混入は検出可能だが、ノイズ不在テストを併用する理由:
- snapshot 更新時（`--update`）にノイズ再混入を**明示的に**検出
- クリーンアップルールの仕様を**実行可能なドキュメント**として表現
- 個別パターンの失敗メッセージにより、**どのルールが壊れたか**即座に特定可能

---

## 実装手順

1. `api/tests/fixtures/` ディレクトリ作成
2. `capture-fixtures.ts` で HTML 取得・保存
3. `extractArticle()` に `fetcher` DI パラメータ追加
4. `ingest-e2e.test.ts` 作成
5. `npx vitest run tests/ingest-e2e.test.ts --update` で snapshot 生成
6. 全テスト実行（既存 130 + 新規 8 = 138）
7. capture スクリプト削除、fixture + snapshot + テストをコミット
