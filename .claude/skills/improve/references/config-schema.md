# 設定ファイル仕様 (.improvement-config.json)

プロジェクトルートに `.improvement-config.json` を配置することで、自律改善ループの挙動をカスタマイズできる。
ファイルが存在しない場合はすべてデフォルト値で動作する。

## スキーマ

```json
{
  "rounds": 5,
  "focus": "all",
  "qa": {
    "biome": true,
    "typecheck": true,
    "vitest": true,
    "playwright": false,
    "claude_review": true,
    "severity_filter": ["critical", "high", "medium"]
  },
  "refactor": {
    "enabled": true,
    "max_per_round": 3,
    "strategies": [
      "extract-function",
      "simplify-conditional",
      "remove-duplication",
      "split-file",
      "strengthen-types"
    ]
  },
  "safety": {
    "auto_revert_on_failure": true,
    "test_timeout_ms": 120000
  },
  "self_learning": {
    "enabled": true
  }
}
```

## フィールド説明

### トップレベル

| フィールド | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `rounds` | number | 5 | 最大ラウンド数。CLIの `--rounds` で上書き可能 |
| `focus` | string | "all" | 対象スコープ: "api", "frontend", "all" |

### qa

| フィールド | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `biome` | boolean | true | Biome lintを実行するか |
| `typecheck` | boolean | true | tsc --noEmitを実行するか |
| `vitest` | boolean | true | Vitestテストを実行するか（Docker必須） |
| `playwright` | boolean | false | Playwright E2Eを実行するか（環境依存大） |
| `claude_review` | boolean | true | Claudeコードレビューを行うか |
| `severity_filter` | string[] | ["critical","high","medium"] | この重要度以上のissueのみ対応する |

### refactor

| フィールド | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `enabled` | boolean | true | リファクタリングフェーズを実行するか |
| `max_per_round` | number | 3 | 1ラウンドあたりの最大リファクタリング数 |
| `strategies` | string[] | (全パターン) | 許可するリファクタリング戦略 |

### safety

| フィールド | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `auto_revert_on_failure` | boolean | true | テスト失敗時に自動revertするか |
| `test_timeout_ms` | number | 120000 | テスト実行のタイムアウト（ミリ秒） |

### self_learning

| フィールド | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `enabled` | boolean | true | 自己学習フェーズを実行するか |

## .gitignore への追加

以下を `.gitignore` に追加することを推奨:

```
# Improvement loop state (session-specific)
.improvement-state/

# Improvement config (optional: team共有したい場合はコミットしてもよい)
# .improvement-config.json
```
