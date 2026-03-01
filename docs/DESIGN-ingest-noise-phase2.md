# Ingest ノイズ除去 Phase 2 — 設計書

## Context

Phase 1（重複段落・Credit行・コメントリンク・著者プロフィール除去）は実装済み（`b898fad`）。
4 記事の実データ検証（`docs/TEST-articles.md`）で、新たに 5 カテゴリのノイズが観測された。

**残存ノイズ（実データより）:**

```
カテゴリA — イベントプロモーション（TechCrunch 記事 #1, #2）:
  Techcrunch event
  Boston, MA | June 9, 2026

カテゴリB — ナビゲーション残骸（TechCrunch 記事 #3）:
  ### Newsletters
  Subscribe for the industry's biggest tech news
  ## Related
  ## Latest in Media & Entertainment

カテゴリC — メタデータ混入（TechCrunch 記事 #3）:
  In Brief
  Posted:
  2:07 PM PST · February 28, 2026

カテゴリD — コンテンツ抽出欠落（記事 #1: 文途中打切り、記事 #4: 後半のみ）

カテゴリE — author フィールド空白（Ars Technica 記事 #4）:
  "\n                    Beth Mole\n                "
```

本設計は対処可能な **A/B/C/E** の 4 カテゴリを扱う。D（抽出欠落）は既知の制限として記録。

---

## 根本原因分析

### A. イベントプロモーションブロック

**原因**: TechCrunch はインラインのイベント広告ブロックを記事 HTML 内に `<div>` として
埋め込む。Readability はこれを記事本文の一部としてスコアリングし保持する。
CSS クラス名はサイト固有であり、DOM レベルのセレクタ除去は汎用性に欠ける。

Markdown 変換後のパターンは以下の 2 段落構造:
```
Techcrunch event              ← 短い見出し的テキスト
                              ← 空行
Boston, MA | June 9, 2026     ← 「都市名, 州略称 | 日付」
```

### B. ナビゲーション残骸

**原因**: Readability の `_cleanConditionally` は `nav` 要素を除去するが、
記事 `<div>` 内に配置されたニュースレター CTA や関連記事セクションは
記事コンテンツの一部としてスコアリングされ保持される。
特に短い記事では、これらの要素が相対的に大きなスコアを獲得しやすい。

### C. 先頭メタデータ

**原因**: TechCrunch の "In Brief" 形式の短い記事では、記事カテゴリラベル
（"In Brief"）と投稿日時メタデータが記事本文と同じ DOM 要素内に配置されている。
Readability はこれを記事コンテンツとして抽出する。

### D. コンテンツ抽出欠落（対処対象外）

**原因**: 2 つの異なる問題:
- 記事 #1: ソース HTML の不完全性、または Readability のスコアリングが
  記事コンテナの一部のみを最適候補として選択
- 記事 #4: Readability が記事の後半セクションを最高スコア候補として選択

`safeFetch` にはレスポンスサイズ制限なし（確認済み）。

### E. author フィールド空白

**原因**: Readability の `_getArticleMetadata` が byline を抽出する際、
ソース HTML 内の余分な空白・改行をそのまま保持する。
`extractArticle()` が `.trim()` を適用していない。

---

## 設計方針

### 設計原則（Phase 1 から継続）

1. **Safety first**: 正当な記事コンテンツを削除しないこと（false positive の回避）
2. **汎用性**: サイト固有の CSS クラス名に依存せず、テキストパターンで対処
3. **関心の分離**: HTML→Markdown 変換と、コンテンツレベルのクリーンアップを分離
4. **テスト可能性**: 各クリーンアップルールに明確なテストケースを持たせる

### CSS クラスベースの除去を採用しない理由（Phase 1 と同一）

イベントプロモやナビゲーション残骸もサイトごとに異なるクラス名を使用するため、
テキストパターンベースで汎用的に対処する。

---

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `api/src/services/ingest-service.ts` | 3 関数追加 + `cleanArticleText` パイプライン拡張 + author `.trim()` |
| `api/tests/ingest-service.test.ts` | ~15 テスト追加 |

---

## 詳細設計

### 1. 先頭メタデータ除去 — `removeLeadingMetadata()`

記事先頭のカテゴリラベルとタイムスタンプを検出・除去する。

**検出アルゴリズム**:
1. 先頭 5 段落以内で**タイムスタンプ行**（必須アンカー）を探す
2. タイムスタンプが見つかったら、直前の**メタデータラベル**行を遡って除去
3. タイムスタンプが見つからなければ**何もしない**（安全側フォールバック）

**regex**:
```typescript
// アンカー: タイムスタンプ行
// "2:07 PM PST · February 28, 2026"
const TIMESTAMP_LINE =
  /^\d{1,2}:\d{2}\s*(?:AM|PM)\s+[A-Z]{2,4}\s*[·•]\s*\w+\s+\d{1,2},?\s*\d{4}\s*$/i;

// メタデータラベル
// "In Brief", "Posted:", "Updated:", "Published:"
const METADATA_LABELS =
  /^(?:in\s+brief|posted|updated|published)\s*:?\s*$/i;
```

**安全性分析**:
- タイムスタンプ行が**必須アンカー**。タイムスタンプなしでは何も除去しない
- 「In Brief」が記事タイトルとして使われても、後続にタイムスタンプが来なければ安全
- 先頭 5 段落のみスキャン。中間・末尾のコンテンツには影響しない

**偽陽性リスク**: 極めて低い。

---

### 2. イベントプロモーションブロック除去 — `removeEventPromotionBlocks()`

インラインのイベント/カンファレンス広告ブロックを検出・除去する。

**検出アルゴリズム**:
1. 段落を `\n\n` で分割
2. 各段落の次段落が `City, ST | Date` パターンにマッチするか判定
3. 直前の段落が短く（≤80文字）かつ文構造なし（`. ` を含まない）なら**両方除去**
4. location/date 行が単独の場合も除去

**アンカー regex**:
```typescript
// "Boston, MA | June 9, 2026", "San Francisco, CA | October 13-15, 2026"
const EVENT_LOCATION_DATE =
  /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2}\s*\|\s*\w+\s+\d{1,2}(?:[–-]\d{1,2})?,?\s*\d{4}\s*$/;
```

**安全性分析**:
- **アンカーは `City, ST | Date`** のパイプ区切り。イベント告知固有の書式であり、
  通常の記事本文で都市名がこの形式で独立段落になることはない
- 直前段落の ≤80文字 + 文構造なしチェックにより、記事本文の短い段落が
  偶然マッチすることを防止
- `^...$` アンカーにより段落全体マッチを要求

**偽陽性リスク**: 低い。

---

### 3. 末尾ナビゲーション残骸除去 — `removeTrailingNavigationSections()`

記事末尾のニュースレター CTA や関連記事セクションを検出・除去する。

**検出アルゴリズム**:
1. 段落を末尾から逆方向にスキャン
2. **ナビゲーション見出し**にマッチ → 除去マーク
3. 既にノイズゾーン内にある**短い非見出しテキスト**（≤100文字, `. ` なし）→ 除去マーク
4. **空段落** → 除去マーク続行
5. 実質的なコンテンツに到達 → **停止**

**ナビゲーション見出しパターン**:
```typescript
const NAVIGATION_HEADINGS = [
  /^#{1,3}\s+newsletters?\s*$/i,
  /^#{1,3}\s+related\s*$/i,
  /^#{1,3}\s+latest\s+(in\s+)?/i,
  /^#{1,3}\s+more\s+(from|stories|in)\s+/i,
  /^#{1,3}\s+recommended\s*$/i,
  /^#{1,3}\s+trending\s*$/i,
  /^#{1,3}\s+popular\s*$/i,
  /^#{1,3}\s+subscribe\s*$/i,
];
```

**安全性分析**:
- **末尾からの逆方向スキャンのみ**。記事中間のヘッダーは影響を受けない
- 見出しの後に実質的な本文段落がある場合はそこで停止
- `## Related Work` のような学術的見出しでも、後続に本文が続いていれば保持

**偽陽性リスク**: 低い。

---

### 4. author フィールド `.trim()` 追加

```typescript
// Before (L179)
author: article.byline ?? null,

// After
author: article.byline?.trim() || null,
```

空白のみの `byline` は `null` を返す。偽陽性リスク: ゼロ。

---

## cleanArticleText() パイプライン（変更後）

```typescript
export function cleanArticleText(text, options) {
  let cleaned = text;

  // 1. Remove leading article metadata (timestamps, "In Brief")  ← NEW
  cleaned = removeLeadingMetadata(cleaned);

  // 2. Remove duplicate paragraphs
  cleaned = removeDuplicateParagraphs(cleaned);

  // 3. Remove inline event/conference promotion blocks            ← NEW
  cleaned = removeEventPromotionBlocks(cleaned);

  // 4. Remove trailing navigation sections                        ← NEW
  cleaned = removeTrailingNavigationSections(cleaned);

  // 5. Remove Credit lines
  cleaned = cleaned.replace(/[ \t]*\bCredit:\s+.+$/gm, "")
                    .replace(/^\s+$/gm, "");

  // 6. Remove comment links
  cleaned = cleaned.replace(/\[\d+\s+Comments?\]\(.*?\)/g, "")
                    .replace(/^\d+\s+Comments?\s*$/gm, "");

  // 7. Remove trailing author bio
  cleaned = removeTrailingAuthorBio(cleaned, options.byline ?? null);

  // 8. Final whitespace normalization
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return cleaned;
}
```

**順序の根拠**:
1. 先頭メタデータ → 最初に除去（独立処理、他ルールに影響しない）
2. 重複段落 → 早期にテキスト量を削減
3. イベントブロック → 構造ノイズ（末尾ナビ検出の前に除去）
4. 末尾ナビ → 著者プロフィール検出の前に除去（末尾 3 段落の判定に影響するため）
5. Credit/コメント/著者プロフィール → 細粒度テキストパターン
6. 空白正規化 → 最後

---

## テスト計画

### removeLeadingMetadata() テストケース

| # | テスト | 入力 | 期待出力 |
|---|---|---|---|
| 1 | In Brief + Posted + タイムスタンプ除去 | `"In Brief\n\nPosted:\n\n2:07 PM PST · February 28, 2026\n\nArticle."` | `"Article."` |
| 2 | タイムスタンプなし → 変更なし | `"In Brief\n\nArticle content."` | 変更なし |
| 3 | タイムスタンプ単独除去 | `"2:07 PM PST · February 28, 2026\n\nArticle."` | `"Article."` |

### removeEventPromotionBlocks() テストケース

| # | テスト | 入力 | 期待出力 |
|---|---|---|---|
| 4 | イベントブロック除去 | `"Content.\n\nTechcrunch event\n\nBoston, MA \| June 9, 2026\n\nMore."` | `"Content.\n\nMore."` |
| 5 | 日付範囲付き除去 | `"Content.\n\nTechcrunch event\n\nSan Francisco, CA \| October 13-15, 2026\n\nMore."` | `"Content.\n\nMore."` |
| 6 | 長い段落は保持 | `"Content about Boston, MA and its tech scene.\n\nMore."` | 変更なし |
| 7 | location\|date 以外の後続 → 保持 | `"Short text\n\nNormal paragraph.\n\nMore."` | 変更なし |

### removeTrailingNavigationSections() テストケース

| # | テスト | 入力 | 期待出力 |
|---|---|---|---|
| 8 | Newsletters + CTA + Related + Latest 一括除去 | 末尾に 4 ブロック | `"Article content."` |
| 9 | `## Related Work` + 本文 → 保持 | `"...\n\n## Related Work\n\nSmith et al."` | 変更なし |
| 10 | 末尾の空見出しのみ除去 | `"Content.\n\n## Related"` | `"Content."` |
| 11 | 記事中間の見出しは影響なし | 中間に `## Related` あり | 変更なし |
| 12 | `## More from TechCrunch` 除去 | `"Content.\n\n## More from TechCrunch"` | `"Content."` |

### 統合テスト

| # | テスト | 入力 | 期待出力 |
|---|---|---|---|
| 13 | 全ノイズ複合除去 | メタデータ + イベント + ナビ + Credit | 記事本文のみ |

### 既存テスト

全 28 テストが変更後もパスすること。

---

## カテゴリ D: コンテンツ抽出欠落 — 既知の制限

### 現象
- 記事 #1: `...after acquiescing to c` で文途中打切り
- 記事 #4: 記事の後半セクションのみ抽出

### 調査結果
- `safeFetch` にレスポンスサイズ制限なし（全チャンクを蓄積）
- Readability のスコアリングアルゴリズムが最適でない候補要素を選択
- ソース HTML の構造に依存する問題

### 対処方針
本フェーズでは対処しない。以下を将来の検討事項として記録:
- Readability の `charThreshold` パラメータ調整
- 複数候補のフォールバック抽出
- JavaScript レンダリング対応（Playwright 等）

---

## 検証方法

1. `cd api && npm test` — 全テストパス（既存 28 + 新規 ~15）
2. `npx tsc --noEmit` — 型チェックパス
3. `npx biome check src/` — リントパス
4. TEST-articles.md の 4 記事で ingest 再実行:
   - 記事 #1, #2: イベントプロモブロック消失確認
   - 記事 #3: メタデータ + ナビゲーション残骸消失確認
   - 記事 #4: author フィールド空白解消確認
   - 全記事: 正当な記事コンテンツが保持されていること
