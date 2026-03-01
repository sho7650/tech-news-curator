# Ingest E2E Snapshot テスト — 実装ワークフロー

**設計書**: `docs/DESIGN-ingest-e2e-snapshot.md`
**ブランチ**: `feature/ingest-noise-phase2`（継続）
**生成日**: 2026-03-01
**前提**: Phase 2 ノイズ除去（130 tests passing）完了済み

---

## Phase 1: DI パラメータ追加

- [x] **1.1** `extractArticle()` に `fetcher` DI パラメータ追加
- [x] **1.2** 既存テスト回帰確認 — 130 tests 全パス、tsc クリーン

---

## Phase 2: HTML fixture 取得

- [x] **2.1** `api/tests/fixtures/` ディレクトリ作成
- [x] **2.2** `api/scripts/capture-fixtures.ts` 作成
- [x] **2.3** fixture 取得実行 — 4 ファイル取得（合計 822 KB）

---

## Phase 3: E2E テスト作成

- [x] **3.1** `api/tests/ingest-e2e.test.ts` 作成
- [x] **3.2** snapshot 初回生成 — 8 テスト全パス、4 snapshot 生成

---

## Phase 4: 全体検証

- [x] **4.1** 全テスト実行 — 122 passed, 16 skipped (Docker 環境依存の 2 ファイル)
- [x] **4.2** 品質チェック — tsc クリーン、biome クリーン
- [x] **4.3** snapshot 内容レビュー — 全記事の 5 フィールド妥当性確認済み

---

## Phase 5: クリーンアップ & コミット

- [x] **5.1** capture スクリプト削除
- [ ] **5.2** コミット
