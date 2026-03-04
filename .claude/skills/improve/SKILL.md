---
name: improve
description: |
  Autonomous improvement loop — QA, Fix, Refactor を自動で繰り返し、コード品質を継続的に向上させる。
  各ラウンドでテストを実行し、リファクタリングでテストが壊れたら自動revertする安全機構付き。
  SuperClaude コマンドと MCP サーバー（serena, sequential-thinking, context7, playwright, tavily）を活用する。
arguments:
  - name: rounds
    description: Maximum number of improvement rounds (early termination if 0 issues found)
    default: "5"
  - name: focus
    description: Scope of improvement (api|frontend|all)
    default: all
  - name: dry-run
    description: If true, run QA only without fixes or refactoring
    default: "false"
---

# Autonomous Improvement Loop (自律改善ループ)

QA → Fix → Refactor → E2E Safety → Reflection → Self-Learning の6フェーズを
最大 {{rounds}} ラウンド繰り返す。open issueが0件になったら早期終了する。

## ツールチェーン

このスキルは以下のツールを組み合わせて使用する:

**SuperClaude コマンド:**
- `/sc:analyze` — Phase 1: コード・アーキテクチャの構造分析
- `/sc:troubleshoot` — Phase 2: テスト失敗のデバッグ・原因特定
- `/sc:cleanup` — Phase 3: 構造化されたリファクタリング
- `/sc:reflect` — Phase 5: 構造化されたレトロスペクティブ

**MCP サーバー:**
- `serena` — Phase 1/3: セマンティックなコード理解、依存関係の把握
- `sequential-thinking` — Phase 1/6: 複雑な問題の多段推論
- `context7` — Phase 2: Hono, Drizzle, Vitest 等のフレームワーク公式ドキュメント参照
- `playwright` — Phase 4: ブラウザベースのE2Eテスト実行
- `tavily` — Phase 6: ベストプラクティスのWeb調査

## 重要な安全ルール

- **全作業はfeature branchで行う。mainブランチは絶対に変更しない**
- リファクタリング後にテストが壊れたら、そのコミットを自動revertする
- 各フェーズの結果を `.improvement-state/` に記録する
- Conventional Commits形式を遵守する

## Phase 0: セットアップ（初回のみ）

1. 作業ディレクトリがgitリポジトリであることを確認する
2. `git status` でワーキングツリーがクリーンであることを確認する
   - クリーンでなければ、ユーザーに警告して中断する
3. 現在のブランチがmainであることを確認する
4. feature branchを作成する:
   ```bash
   git checkout -b improve/$(date +%Y%m%d-%H%M%S)
   ```
5. 状態管理ディレクトリを作成する:
   ```bash
   mkdir -p .improvement-state
   ```
6. `.improvement-config.json` が存在すればロードする。なければデフォルト値で動作する
7. **serena でプロジェクト構造を把握する** — serena MCP を使ってプロジェクトのモジュール構造、依存関係グラフ、主要なエントリポイントを確認する。これにより後続フェーズの分析精度が向上する

## メインループ: Round 1 ~ {{rounds}}

各ラウンドの開始時に `[Round N/{{rounds}}]` をログに出力する。

### Phase 1: QA（バグ発見・起票）

スコープ: {{focus}}

以下を**順番に**実行し、発見した問題を集約する。

#### 1-1. Biome Lint（{{focus}} が api または all の場合）

```bash
cd api && npx biome check src/ 2>&1
```

出力から warning/error を抽出してissueとして記録する。

#### 1-2. TypeScript型チェック（{{focus}} が api または all の場合）

```bash
cd api && npx tsc --noEmit 2>&1
```

型エラーがあればissueとして記録する。

#### 1-3. Vitest テスト（{{focus}} が api または all の場合）

```bash
cd api && npm test 2>&1
```

**注意**: testcontainersがDockerを必要とする。Docker未起動の場合はスキップしてログに記録する。

**テスト失敗の検出は必須（MUST）。以下の手順に従うこと:**

1. コマンドの終了コードを確認する。**exit code が 0 以外ならテスト失敗が存在する**
2. 出力から `FAIL` で始まる行を探し、**各失敗テストを1件ずつ個別のissueとして起票する**
3. 各issueには以下を含めること:
   - テストファイル名（例: `tests/url-validator.test.ts`）
   - テスト名（例: `should block if any resolved IP is private`）
   - エラーメッセージ（例: `promise resolved instead of rejecting`）
   - エラー箇所の行番号
4. **テスト失敗は常に severity: HIGH** とする。テスト失敗はコードの回帰バグを意味する

**テスト出力の読み方（例）:**
```
FAIL  tests/url-validator.test.ts > URL Validator > should block if any resolved IP is private
AssertionError: promise resolved "'https://example.com'" instead of rejecting
 ❯ tests/url-validator.test.ts:47:52
```
→ この場合、以下のissueを起票する:
```
### [HIGH] テスト失敗: should block if any resolved IP is private
- **File**: `tests/url-validator.test.ts:47`
- **Source**: vitest
- **Detail**: promise resolved instead of rejecting — dns.resolve のモックが正しく適用されていない可能性
- **Suggestion**: テストのモックパターンを確認し、vi.spyOn のライフサイクル管理を修正する
```

**テスト結果のサマリー行も必ず確認すること:**
```
Tests  2 failed | 144 passed (146)
```
→ `failed` が 1 以上なら、すべての失敗テストをissue化するまでPhase 1を終了してはならない。

#### 1-4. Playwright E2E（{{focus}} が frontend または all の場合）

`.improvement-config.json` の `qa.playwright` が true の場合のみ実行する。
デフォルトはfalse（E2Eは環境依存が大きいため）。

true の場合、**playwright MCP** を使用してE2Eテストを実行する。
playwright MCP はブラウザの起動・操作・スクリーンショット取得を行えるため、
単純な `npx playwright test` よりも柔軟な検証が可能。

Vitestと同様、**exit code が 0 以外なら失敗テストを1件ずつ個別のissueとして起票する（severity: HIGH）。**

#### 1-5. /sc:analyze によるコード分析

`/sc:analyze` を使用してコードベースの構造分析を行う:

```
/sc:analyze "Analyze {{focus}} codebase for code quality issues:
- Type safety problems (any types, missing type guards)
- Error handling gaps (async without try-catch)
- Files exceeding 300 lines
- Functions exceeding 50 lines
- Missing input validation (Zod schemas)
- Hardcoded strings/config values
- Circular dependencies
- CLAUDE.md convention violations"
```

**serena MCP を併用する**: serena のセマンティック解析を使い、以下を確認する:
- モジュール間の依存関係に問題がないか
- 未使用のエクスポートや孤立したコードがないか
- 関数の呼び出しグラフに循環がないか

**sequential-thinking MCP を併用する**: 複雑なアーキテクチャ上の問題について、
sequential-thinking で多段推論を行い、根本原因まで掘り下げる。
表面的なコーディングスタイルの指摘ではなく、設計レベルの問題を発見する。

**レビュー対象の選定**: 前ラウンドで修正したファイル、またはlintで問題の多いファイルを優先する。
初回ラウンドでは、サービス層（`api/src/services/`）とルート層（`api/src/routes/`）を重点的にレビューする。

#### Issue集約

すべてのQA結果を `.improvement-state/issues-round-N.md` に以下の形式で保存する:

```markdown
# Issues - Round N

**Found**: X issues | **Severity**: CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0

## Issues

### [SEVERITY] 短い説明
- **File**: `path/to/file.ts:line`
- **Source**: lint | typecheck | vitest | playwright | sc:analyze | serena
- **Detail**: 問題の詳細
- **Suggestion**: 修正案（あれば）
```

**判定**: issue数が0 → ループを抜けてPhase 7（ファイナライズ）へ進む。

### Phase 2: Fix（Issue修正）

{{dry-run}} が true の場合、このフェーズをスキップする。

#### 2-1. ツール自動修正

Biome auto-fixが可能なものをまず修正する:

```bash
cd api && npx biome check --write src/
```

#### 2-2. テスト失敗の修正（最優先）

**テスト失敗issueは他のすべてのissueより先に修正する（MUST）。**

**`/sc:troubleshoot` を使用してデバッグする:**

```
/sc:troubleshoot "Test failure in {テストファイル名}:
Error: {エラーメッセージ}
at line {行番号}

Analyze the root cause and suggest a fix."
```

**context7 MCP を併用する**: テストで使用しているフレームワーク（Vitest, Playwright, testcontainers等）の
公式ドキュメントを context7 で参照し、正しいAPIの使い方を確認する。
特にモックのライフサイクル（`vi.spyOn`, `mockImplementation`, `mockReset`, `restoreAllMocks`）や
非同期テストパターンについて、最新のドキュメントに基づいて修正する。

修正手順:
1. **失敗テストのソースコードを Read で読む**（テストファイルとテスト対象の実装ファイルの両方）
2. **`/sc:troubleshoot` + context7 でエラーの原因を特定する**
3. **修正方針を決定する**:
   - 実装側のバグ → 実装を修正する（テストを通すためにテストを書き換えるのはNG）
   - テストのモック/セットアップの問題 → テストコードを修正する（これは正当な修正）
   - テスト自体が古い（スナップショット、期待値の変更等）→ テストを更新する
4. **修正後、そのテストファイルだけを再実行して修正を検証する**:
   ```bash
   cd api && npx vitest run tests/{テストファイル名} 2>&1
   ```
   失敗が残っていれば、修正をやり直す。

#### 2-3. /sc:analyze 指摘の修正

重要度が HIGH 以上の指摘を優先して修正する。
MEDIUM以下は、安全に修正できるものだけ対応する。

修正時も **context7 MCP** を活用し、Hono / Drizzle / Zod 等の正しいパターンを確認してから修正する。

#### 2-4. コミット

```bash
git add -A
git commit -m "fix: resolve N QA issues [round M]"
```

修正したissue数と内容を issues-round-N.md に反映する（statusを `fixed` に更新）。

### Phase 3: Refactor（品質改善）

{{dry-run}} が true の場合、このフェーズをスキップする。

**前提条件チェック（MUST）:**
Phase 2の修正後、リファクタリングに進む前にテストを再実行する:
```bash
cd api && npm test 2>&1
```
**テストが1件でも失敗している場合、リファクタリングに進む前に修正する（MUST）。**
テストが壊れた状態でリファクタリングを行うと、revertの判定が不可能になるため。

以下の手順で修正する:
1. 失敗テストのソースコードとテスト対象の実装を Read で読む
2. Phase 2 の 2-2 と同じ手順で原因分析 → 修正 → 該当テスト再実行で検証
3. 修正したら `git add -A && git commit -m "fix: repair failing tests before refactor [round N]"` でコミット
4. 再度 `cd api && npm test 2>&1` で全テストを実行し、**全テスト通過を確認する**
5. 全テスト通過したらリファクタリングに進む。修正を試みても通過しない場合のみ Phase 5 に進む

**`/sc:cleanup` を使用してリファクタリングする:**

```
/sc:cleanup "{対象ファイルパス} — strategy: {リファクタリング戦略}"
```

**serena MCP を併用する**: リファクタリング前に serena で以下を確認する:
- 対象ファイルを参照している全モジュール（影響範囲の把握）
- 対象関数の呼び出し元（変更による影響を事前に理解）
- 循環依存が生まれないかの確認

`references/refactor-patterns.md` も参照して安全なリファクタリングを行う。

1ラウンドあたり最大3件（`.improvement-config.json` の `refactor.max_per_round` で変更可能）。

リファクタリング候補の選定基準:
- Phase 1で問題が見つかったファイル
- 300行を超えるファイル
- 50行を超える関数
- 複雑な条件分岐（ネスト3段以上）
- 重複コード

**各リファクタリングを個別にコミットする**:

```bash
git add -A
git commit -m "refactor: {具体的な内容} [round N]"
```

### Phase 4: E2E セーフティチェック

Phase 3でリファクタリングを行った場合のみ実行する。

```bash
cd api && npm test 2>&1
```

#### テスト成功時

次のフェーズへ進む。

#### テスト失敗時

Phase 3のrefactorコミットを特定し、自動revertする:

```bash
# refactorコミット数を数える
REFACTOR_COUNT=$(git log --oneline improve/... | grep "^.*refactor:.*\[round N\]" | wc -l)

# refactorコミットだけをrevert（新しい順に）
for i in $(seq 1 $REFACTOR_COUNT); do
  git revert --no-edit HEAD~$((i-1))
done
```

revert後、再度テストを実行する:
- テスト成功 → 「リファクタリングがrevertされた」とログに記録し、次のフェーズへ
- テスト失敗 → Phase 2のfixコミットにも問題がある。fixもrevertし、このラウンドを「失敗」として記録

### Phase 5: 振り返り（結果を記録）

**`/sc:reflect` を使用して構造化された振り返りを行う:**

```
/sc:reflect "Improvement Loop Round N retrospective:
- QA found X issues (sources: lint, typecheck, vitest, sc:analyze, serena)
- Fixed Y issues (auto-fix: p, troubleshoot: q)
- Refactored Z files (reverted: W)
- E2E Safety: PASSED/REVERTED
Analyze what went well, what didn't, and patterns to watch."
```

`/sc:reflect` の出力を `.improvement-state/reflection-log.md` に追記する:

```markdown
## Round N - YYYY-MM-DD HH:MM

| Phase | Result |
|-------|--------|
| QA | X issues found (H:a, M:b, L:c) |
| Fix | Y/X issues fixed (auto: p, troubleshoot: q) |
| Refactor | Z refactorings applied |
| E2E Safety | PASSED / REVERTED |

### ツール活用状況
- serena: {依存関係分析で何を発見したか}
- context7: {どのドキュメントを参照したか}
- sequential-thinking: {どの問題で多段推論を使用したか}

### 修正ファイル
- `path/to/file1.ts` - 修正内容の要約
- `path/to/file2.ts` - 修正内容の要約

### 所見
（/sc:reflect の分析結果を1-3文で記述）

---
```

### Phase 6: 自己学習（改善手法を改善）

**最終ラウンド後のみ実行する**（途中ラウンドでは実行しない）。

**sequential-thinking MCP を使用してパターン分析を行う:**
sequential-thinking で `.improvement-state/reflection-log.md` の全ラウンドの結果を多段的に分析する:
- ステップ1: 各ラウンドのissue数・修正数・revert率の推移を整理
- ステップ2: 繰り返し出現するissueカテゴリのパターンを特定
- ステップ3: ツール（serena, context7等）の活用度と修正成功率の相関を分析
- ステップ4: 改善提案を優先度付きで生成

**tavily MCP を使用してベストプラクティスを調査する:**
繰り返し出現する問題カテゴリについて、tavily で最新のベストプラクティスを調査する:
- 例: 「vitest mock lifecycle best practices 2025」
- 例: 「hono error handling patterns」
- 例: 「drizzle orm query optimization」

調査結果を踏まえて、改善提案の質を向上させる。

出力を `.improvement-state/self-learning-suggestions.md` に保存する:

```markdown
# Self-Learning Suggestions

Generated: YYYY-MM-DD HH:MM
Rounds analyzed: 1-N

## Suggestions

### [IMPACT: HIGH/MEDIUM/LOW] 提案タイトル
- **Current**: 現在の設定/挙動
- **Proposed**: 提案する変更
- **Rationale**: 根拠（データに基づく）
- **Reference**: tavily調査で見つけたベストプラクティスのURL（あれば）
- **Action**: `.improvement-config.json` のどのパラメータを変更すべきか
```

**この提案は自動適用しない。** ユーザーがレビューして手動で設定を変更する。

## Phase 7: ファイナライズ

全ラウンド完了後（または早期終了後）:

1. 最終サマリーを出力する:
   ```
   === Improvement Loop Summary ===
   Rounds completed: X / {{rounds}}
   Total issues found: Y
   Total issues fixed: Z
   Refactorings applied: W (reverted: V)
   Tools used: serena, context7, sequential-thinking, tavily, playwright
   Branch: improve/YYYYMMDD-HHMMSS
   ```

2. feature branchをpushするか確認する:
   ```bash
   git push -u origin improve/YYYYMMDD-HHMMSS
   ```

3. PRの作成を案内する（自動作成はしない）

## エラーハンドリング

| 状況 | 対応 |
|------|------|
| Dockerが未起動（testcontainers失敗） | Vitestをスキップし、lint + sc:analyze のみでQAを続行 |
| Biomeが見つからない | `npx biome` がない場合はlintをスキップ |
| Git conflictが発生 | ループを中断し、状況をユーザーに報告 |
| テストがタイムアウト | 120秒でタイムアウトとし、失敗として扱う |
| 全ラウンドでissue 0 | 「コードは良好な状態です」と報告 |
| MCP サーバー未接続 | 該当MCPなしでフォールバック動作する（MCPは強化であり必須ではない） |
| /sc: コマンド未インストール | SuperClaudeなしでも動作する（MCP + 直接分析にフォールバック） |
