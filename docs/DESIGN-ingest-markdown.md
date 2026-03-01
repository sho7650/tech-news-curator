# Ingest 記事抽出品質の改善 — 設計書

**Version**: 1.0
**Date**: 2026-02-28
**Status**: Draft

---

## 1. 課題

### 現状

```
safeFetch(url)
  → HTML 取得
  → linkedom でパース
  → Readability で抽出
  → article.textContent をそのまま返却   ← ★ 問題箇所
```

`article.textContent` は DOM ツリー内の**すべてのテキストノード**を結合するため、
以下のノイズが本文に混入する：

| ノイズの種類 | 例 |
|---|---|
| 画像キャプション重複 | `Apple's 2018-era design...` が2回出現 |
| Credit テキスト | `Credit: Valentina Palladino` |
| 空白・改行の大量挿入 | `\n  \n  \n  \n` |
| ナビゲーション要素 | `0 Comments` |
| 補足テキスト | 著者プロフィール全文 |

### 影響

n8n 経由で LLM（Ollama）に翻訳指示を出す際、ノイズ混じりのテキストにより：

1. LLM がコンテンツ構造を把握できず**要約を生成**（全文翻訳ではなく）
2. 入力トークン数がノイズ分だけ増加（コスト・レイテンシの無駄）
3. セクション見出しが消失し、翻訳結果の構造が崩壊

## 2. 解決策

### データフロー（改善後）

```
safeFetch(url)
  → HTML 取得
  → linkedom でパース
  → Readability で抽出
  → article.content（クリーン HTML）を取得     ← ★ textContent → content に変更
  → linkedom で再パース
  → ノイズ要素を除去（figcaption, aside, nav 等）
  → turndown で Markdown に変換
  → 空白正規化
  → クリーンな Markdown を返却
```

### 技術選定: `turndown`

| 選択肢 | 評価 |
|---|---|
| **turndown（採用）** | HTML→Markdown 変換の事実上の標準。ルールベースで正確な変換。依存ゼロ。 |
| 自前の正規表現変換 | エッジケースが多く保守コストが高い。見出し・リンク・リスト等の対応が煩雑。 |
| textContent のクリーンアップ | パラグラフ構造の復元が不可能。根本的解決にならない。 |
| HTML をそのまま返却 | LLM のトークン効率が悪い。タグがノイズとなる。 |

### 除去対象の要素

Readability が `article.content` に残すが翻訳に不要な要素：

```
figcaption   — 画像キャプション・Credit（本文に重複して含まれる場合が多い）
aside        — サイドバー・関連記事・広告枠
nav          — 記事内ナビゲーション
[role="complementary"]  — WAI-ARIA 補足コンテンツ
```

### turndown の設定

```typescript
const turndownService = new TurndownService({
  headingStyle: "atx",        // # Heading 形式
  bulletListMarker: "-",       // リストマーカー
  codeBlockStyle: "fenced",   // ```code``` 形式
});

// 画像は除去（テキスト翻訳には不要）
turndownService.addRule("removeImages", {
  filter: "img",
  replacement: () => "",
});
```

## 3. 変更対象

| ファイル | 変更内容 |
|---|---|
| `api/package.json` | `turndown` + `@types/turndown` 追加 |
| `api/src/services/ingest-service.ts` | `htmlToMarkdown()` 関数追加、`body` 出力変更 |
| `api/tests/ingest-service.test.ts` | `htmlToMarkdown()` 単体テスト（新規） |

### `api/src/services/ingest-service.ts` の変更

```typescript
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const NOISE_SELECTORS = ["figcaption", "aside", "nav", '[role="complementary"]'];

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

// 画像タグを除去（翻訳対象外）
turndown.addRule("removeImages", {
  filter: "img",
  replacement: () => "",
});

export function htmlToMarkdown(html: string): string {
  const { document } = parseHTML(html);

  // ノイズ要素を除去
  for (const selector of NOISE_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      el.remove();
    }
  }

  const md = turndown.turndown(document.toString());

  // 空白の正規化: 3行以上の連続改行を2行に圧縮
  return md.replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractArticle(url: string): Promise<IngestResponse | null> {
  const html = await safeFetch(url);
  if (!html) return null;

  const { document } = parseHTML(html);
  const reader = new Readability(document);
  const article = reader.parse();

  if (!article) return null;

  // ★ 変更箇所: textContent → content (HTML) → Markdown
  const body = article.content ? htmlToMarkdown(article.content) : null;

  // ... (og:image, publishedAt は変更なし)

  return {
    title: article.title ?? null,
    body,   // ← Markdown 形式
    author: article.byline ?? null,
    published_at: publishedAt,
    og_image_url: ogImage,
  };
}
```

### 出力例（Before / After）

**Before** (textContent):
```
\n  \n  \n  it's what's on the inside that counts\n  \n    Apple is taking...
\n    \n      Apple's 2018-era design for the then-Intel...\n
Credit:\n  Valentina Palladino\n  \n  Apple's 2018-era design for the then-Intel...
Credit:\n  Valentina Palladino\n ...
```

**After** (Markdown):
```markdown
Apple is taking an "ain't broke/don't fix" approach to most of its gadgets.

Excepting the AirTag 2, so far it's been a quiet year for Apple hardware...

## The long-awaited "budget" MacBook

Most rumors and leaks agree that Apple is preparing to launch a new MacBook...

## The $349 iPad

Speaking of the Apple A18 series, Apple is apparently planning a refresh...

## The iPhone 17e

Apple would let the old iPhone SE languish for at least a couple years...

## The iPad Air

Do you like the current iPad Air with the Apple M3? ...

## Other possibilities

Apple could choose to refresh almost any of its Macs next week...
```

## 4. テスト計画

### 単体テスト（`api/tests/ingest-service.test.ts` 新規）

| テストケース | 検証内容 |
|---|---|
| 見出しの保持 | `<h2>Title</h2>` → `## Title` |
| パラグラフ構造 | `<p>A</p><p>B</p>` → `A\n\nB` |
| figcaption 除去 | `<figcaption>Credit</figcaption>` が出力に含まれない |
| aside 除去 | `<aside>...</aside>` が出力に含まれない |
| 画像タグ除去 | `<img src="...">` が出力に含まれない |
| リンク保持 | `<a href="url">text</a>` → `[text](url)` |
| 空白正規化 | 3行以上の連続改行が2行に圧縮 |
| 空 HTML | 空文字列入力 → 空文字列出力 |

### 既存テスト

`api/tests/ingest.test.ts` はモックベースのため変更不要。

### E2E 検証

```bash
# Docker 起動後
curl -X POST http://localhost:8100/ingest \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://arstechnica.com/gadgets/2026/02/what-new-hardware-to-expect-from-apple-next-week/"}' \
  | jq '.body' -r | head -30
```

確認項目：
- セクション見出し（`##`）が出力されること
- 画像キャプション / Credit が除去されていること
- パラグラフが適切に分離されていること
- 記事末尾（著者プロフィール等）が除去されていること

## 5. 互換性

### API レスポンス

`IngestResponse.body` のスキーマ（`string | null`）は変更なし。
内容がプレーンテキストから Markdown に変わるが、n8n 側の LLM プロンプトで
「markdown で整形して」と指示済みのため、Markdown 入力はむしろ整合性が向上する。

### DB 格納

`body_original` は `text` 型（最大 200,000 文字）で格納。
Markdown 形式でもサイズは従来と同等（ノイズ除去によりむしろ縮小）。

### n8n 翻訳プロンプト

変更不要。既に「元の文書の構造のままに markdown で整形して」と指示されており、
Markdown 入力を前提とした出力を期待している。
