# QAフェーズ詳細ガイド

## QAツール別の出力パース方法

### Biome lint

**コマンド**:
```bash
cd api && npx biome check src/ 2>&1
```

**出力例**:
```
api/src/services/article-service.ts:45:3 lint/suspicious/noExplicitAny ━━━━━━━━
  ✖ Unexpected any. Specify a different type.
```

**パース方法**:
- `ファイルパス:行:列 カテゴリ` 形式で1issue
- severity: error → HIGH, warning → MEDIUM, info → LOW

### TypeScript型チェック

**コマンド**:
```bash
cd api && npx tsc --noEmit 2>&1
```

**出力例**:
```
src/services/digest-service.ts(23,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

**パース方法**:
- `ファイルパス(行,列): error TSxxxx: メッセージ` 形式
- severity: すべて HIGH（型エラーはコンパイル不可を意味する）

### Vitest

**コマンド**:
```bash
cd api && npm test 2>&1
```

**出力例**:
```
 FAIL  tests/articles.test.ts > GET /articles > should return articles
AssertionError: expected 200 to be 404
```

**パース方法**:
- `FAIL` 行からテストファイルとテスト名を抽出
- エラーメッセージから失敗理由を抽出
- severity: すべて HIGH（テスト失敗は回帰バグ）

### Playwright

**コマンド**:
```bash
cd frontend && npx playwright test 2>&1
```

**出力例**:
```
  1) [chromium] › e2e/home.spec.ts:5:3 › home page › should display header
     Timeout of 30000ms exceeded.
```

**パース方法**:
- `数字)` から始まる行が失敗テスト
- ブラウザ名、テストファイル、テスト名、エラー理由を抽出
- severity: すべて HIGH

### Claudeコードレビュー

**レビュー対象の選定**:

初回ラウンド:
1. `api/src/services/*.ts` — ビジネスロジック
2. `api/src/routes/*.ts` — APIエンドポイント
3. `api/src/middleware/*.ts` — ミドルウェア

2ラウンド目以降:
1. 前ラウンドで修正したファイル
2. まだレビューしていないファイル（ラウンドごとにローテーション）

**レビュー観点チェックリスト**:
- [ ] `any` 型が正当な理由なく使用されていないか
- [ ] async関数にtry-catchまたはエラーハンドリングがあるか
- [ ] Zodスキーマで外部入力がバリデーションされているか
- [ ] ハードコードされたマジックナンバーや文字列がないか
- [ ] 関数が50行以内か
- [ ] ファイルが300行以内か
- [ ] 循環importがないか
- [ ] SSRF対策（外部URL取得に safe-fetch.ts を使用しているか）
- [ ] Copyright制約（body_original/body_translatedが公開レスポンスに含まれていないか）

**severity判定基準**:
- CRITICAL: セキュリティ脆弱性（SSRF, injection等）
- HIGH: バグの可能性が高い、型安全性の欠如、テスト失敗
- MEDIUM: コーディング規約違反、可読性の問題
- LOW: スタイルの改善提案、パフォーマンスのヒント

## Issue集約テンプレート

```markdown
# Issues - Round N

**Date**: YYYY-MM-DD HH:MM
**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0
**Sources**: lint=a, typecheck=b, vitest=c, playwright=d, review=e

## Issues

### [HIGH] Missing error handling in digest-service
- **File**: `api/src/services/digest-service.ts:45`
- **Source**: review
- **Detail**: generateDigest() の外部API呼び出しにtry-catchがない
- **Suggestion**: try-catch追加 + エラーログ出力
- **Status**: open

### [MEDIUM] Unused import
- **File**: `api/src/routes/articles.ts:3`
- **Source**: lint
- **Detail**: 'zValidator' is imported but never used
- **Suggestion**: importを削除（biome --write で自動修正可能）
- **Status**: open
```
