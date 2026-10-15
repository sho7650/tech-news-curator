# Toolchain Modernization Design (Node.js 26 / pnpm 12 / TypeScript 7)

**Version**: 1.11
**Status**: Approved
**Date**: 2026-10-15
**ADR**: [ADR-003](decisions/ADR-003-toolchain-nix-pnpm-split-typescript.md)
**Reference**: [sho7650/copier-ts7](https://github.com/sho7650/copier-ts7)（`template/docs/template-decisions.md` の D 番号を本書で引用する）

## 1. Background & Goals

### Current State

| 項目 | 現状 |
|------|------|
| Nix | `nixos-25.05` / `nodejs_22`（npm 同梱） |
| Docker | api `node:22-slim`（major のみ）、frontend `node:22.14.0-slim`（patch 固定） |
| CI | `actions/setup-node@v4` / Node `"22"` / `cache: npm` / `npm ci` / `npm audit` |
| Package manager | npm。api / frontend それぞれ独立した `package-lock.json` |
| TypeScript | api `^5.7`、frontend `^5` |
| `@types/node` | api `^22`、frontend `^20`（不揃い） |
| Node バージョンの記述箇所 | flake / Dockerfile / CI の 3 箇所に手書き |

### Goals（優先順）

1. **型チェックの高速化**（TypeScript 7 ネイティブコンパイラ）。**CI 全体の所要時間は大きく悪化させない**（pnpm 化・TS 化を通じて移行前から +10% 以内）
2. **最新追従による移行負債の回避**（TS 6.0 deprecation の先行解消、Node 26 LTS 化）

### 要件の解釈：TypeScript 7 移行は段階的に行う

要件「TypeScript 7 へ移行したい」に対し、本計画では**移行を段階的に行い、安全策として frontend は現時点では TypeScript 6.0 にとどめる**（2026-10-15 合意）。

- **今回（第 1 段階）**: api を TypeScript 7.0 に移行する。frontend は TypeScript 6.0 に上げ、TS7 でエラーになる設定を先に解消しておく
- **次の段階**: typescript-eslint が TypeScript 7 の API に対応した時点で frontend を TypeScript 7 に上げる（§7）。その時の変更は版の更新だけで済む状態を今回作る
- **理由**: frontend の lint（typescript-eslint）・型生成（openapi-typescript）・エディタ用 Next TS プラグインは TypeScript の JS API に依存し、TS 7.0 には JS API が無い（§2）。一度に移行すると lint と型生成が動かなくなる。1 パッケージに TS6 と TS7 を同居させる回避策は、どちらの `tsc` が使われるか不明確になるため採らない（D14）

### 目標の合否基準（Goal 1）

| 対象 | 測り方 | 合格条件 | 判定する PR |
|------|--------|----------|-------------|
| api の型チェック | 同一マシン・同一条件で `tsc --noEmit` を 3 回実行し、所要時間の中央値をとる。PR3 適用前（TS5）と適用後（TS7）を比較 | TS7 の中央値が TS5 の中央値**より短い** | PR3 |
| CI 全体の所要時間 | **固定ベースライン** = PR2 作成前（npm 構成）の main の CI 実行 3 回の所要時間の中央値。PR2 着手時に一度だけ測り、PR の説明と本書に記録する。PR3 でも同じ固定ベースラインを使う（PR2 マージ後の main を基準にしない）。PR ブランチの CI 実行 3 回の中央値と比較（`gh run list` / `gh run view` の実行時間） | 固定ベースラインから **10% を超えて遅くならない**（PR2・PR3 それぞれで判定するため、累積でも +10% 以内に収まる） | PR2・PR3 |

合格条件を満たさない場合はマージせず、原因を調べてから再判定する。測定値は PR の説明に記録する。

## 2. Research Facts (2026-10-14 時点)

| 対象 | 事実 |
|------|------|
| TypeScript 7.0 | 2026-07-08 GA。npm `typescript@7.0.2`、バイナリ名は `tsc` のまま。**JS API なし**（7.1 で別 API 予定） |
| TypeScript 6.0 | 2026-03-23 リリース。JS 実装の最終版。7.0 でハードエラーになる設定を deprecation 警告する |
| typescript-eslint 8.x | peer `typescript <6.1.0`。TS7 対応 issue は "not planned"（JS API 待ち） |
| openapi-typescript 7.13 | peer `typescript ^5`。TS コンパイラ API でコード生成 → TS7 不可、TS6 は要検証 |
| Next.js 16.4 | `next build` の型チェックは TS7 対応（プロジェクトローカル `tsc` CLI を実行）。Next TS プラグイン（エディタ）は JS API 依存 |
| tsx / drizzle-kit / vitest / biome / tsup(`dts: false`) | TypeScript API に非依存 → api の TS7 化に障害なし |
| Node.js 26 | 2026-05-05 リリース、**2026-10-28 Active LTS**。Corepack 同梱なし（25+） |
| nixpkgs | `nodejs_26` は `nixos-26.05` / `nixpkgs-unstable` に存在。unstable の `pnpm` は `pnpm_12` |
| pnpm 12 | Rust 実装、2026-08 安定版。`allowBuilds` 未記載パッケージのビルドをブロックし、`strictDepBuilds: true` で install 失敗。`minimumReleaseAge` 既定 1440 分 |
| ビルドスクリプトを持つ依存（実測） | api: esbuild、@biomejs/biome、ssh2、cpu-features、protobufjs（後ろ 3 つは testcontainers 経由）。frontend: unrs-resolver（eslint 経由）。sharp は 0.35 でインストールスクリプトが無くなった。**全て実行しなくても全ツールが動作する**（§10） |
| `pnpm import` | pnpm 12.9.0 で動作。npm lock との解決差分は実質なし（§10） |

## 3. Decisions

| # | 決定 | 根拠 |
|---|------|------|
| D1 | copier-ts7 は**参考のみ**。`copier update` は使わない | 2 パッケージ・tsup・Next.js・Docker・release-please 構成でテンプレート前提と乖離し、update 毎に衝突する |
| D2 | **3 PR 分割**: Node 26 → pnpm 12 → TypeScript | 障害切り分け。pnpm の lockfile 再生成による解決差分を TS 変更と混ぜない |
| D3 | Node 26 PR は LTS 昇格（10/28）を待たずにマージ可 | 個人利用 |
| D4 | nixpkgs は `nixpkgs-unstable`。`pkgs.nodejs_26` / `pkgs.pnpm_12` を属性名で明示 | 個人利用。デフォルト属性の変動で major が勝手に変わるのを防ぐ |
| D5 | Node バージョンの基準は `.node-version`（内容 `26`、major のみ）。CI は `node-version-file` で読む。**将来は flake を唯一の基準にし CI も `nix develop` へ** | 現時点で最小のずれ。unstable は lock 更新毎に patch が動くため major 粒度 |
| D6 | `package.json` に `devEngines.runtime: { name: "node", version: "^26", onFail: "error" }`（api / frontend 両方） | flake 外の Node で誤実行したら即失敗（copier-ts7 D17） |
| D7 | Docker イメージは **patch 固定**（`node:26.x.y-slim`）。更新は当面手動 | 本番イメージの再現性。自動化（Renovate）は別 PR |
| D8 | `mise.toml` に `disable_tools = ["node", "pnpm"]` | グローバル mise が node 26 / pnpm を管理しており、direnv とのフック順で PATH が決まる問題を排除（copier-ts7 D14） |
| D9 | **pnpm 12** を nix から供給。`packageManager` フィールドは使わず `devEngines.packageManager: { name: "pnpm", version: "^12", onFail: "error" }` | pnpm 11+ は `packageManager` 指定版を自動ダウンロードし nix の pnpm を迂回する（copier-ts7 D16） |
| D10 | api / frontend は**独立した pnpm プロジェクト**（各自 `pnpm-lock.yaml` / `pnpm-workspace.yaml`）。ルート workspace にしない | Docker ビルドコンテキスト・release-please 設定を維持 |
| D11 | `allowBuilds` で**全てのビルドスクリプトを明示的に拒否**（`false`）する。api: `@biomejs/biome` / `cpu-features` / `esbuild` / `protobufjs` / `ssh2`、frontend: `unrs-resolver`。`strictDepBuilds` / `minimumReleaseAge` は既定のまま | 実行しなくても biome・tsup・tsx・テスト・lint・ビルドが全て動くことを実測済み（§10）。実行するコードを最小にする。新しい依存がスクリプトを持ち込むと install が失敗し、その時点で判断できる |
| D12 | Docker: 各 Dockerfile に共通の `base` ステージ（`FROM node:26.x.y-slim AS base` + `ARG PNPM_VERSION=<exact>` + `RUN npm i -g pnpm@${PNPM_VERSION}`）を置き、pnpm を使うステージ（api: builder / deps / dev、frontend: builder / dev）は全て `FROM base` で pnpm を継承する。api には frontend と同じく開発用の `dev` ステージを新設し、production より前に置く（`docker-compose.dev.yml` は `target: dev` を指定）。**pnpm install を実行する全ステージで、install の前に `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` を COPY する**。api は deps ステージで `pnpm install --prod --frozen-lockfile` → `node_modules` を COPY。frontend は従来どおり standalone 出力を COPY（deps ステージ不要）。production ステージは `base` ではなく `node:26.x.y-slim` から作り、pnpm を入れない。**`PNPM_VERSION` の exact 値は Dockerfile の `ARG` 既定値に書く**（docker-compose・release-images.yml は build-arg を渡さないため、既定値が無いと `pnpm@` = latest になる）。**既存ステージの COPY・`USER`・`HEALTHCHECK`・`CMD` は維持し、変えるのは依存の入れ方だけ**とする | Corepack なし。pnpm の導入を 1 か所にまとめ、ステージごとの入れ忘れ（`pnpm: not found`）を防ぐ。`pnpm-workspace.yaml` を COPY しないと `allowBuilds` と `overrides` が読まれず、`ERR_PNPM_IGNORED_BUILDS` や意図しない postcss 解決になる（§10）。本番イメージは最小に保つ |
| D13 | CI: `pnpm/action-setup@v6`（`version` 明示）+ `actions/setup-node@v7`（`node-version-file: .node-version`, `cache: pnpm`） | 公式に文書化された構成。将来の nix 化までの最小変更。pnpm の版は flake（`pnpm_12`、minor は lock 次第）・CI・api/Dockerfile・frontend/Dockerfile の **4 か所**に現れる。CI と Dockerfile 2 つの exact 版は同じ値に揃える（PR2 の検証で一致を確認）。`devEngines`（`^12`）が保証するのは **major の一致だけ**で、flake と CI・Docker の minor / patch の差は検出しない。lockfile 形式（v9）は pnpm 12 系で共通なので、この差は許容する |
| D14 | api は **TypeScript 7.0.x**、frontend は **TypeScript 6.0.x** | frontend は typescript-eslint / openapi-typescript / Next TS プラグインが JS API に依存。TS 6.0 で TS7 非互換設定を先に潰す |
| D15 | openapi-typescript が TS 6.0 で動かない場合、frontend は **TS 5.x 据え置き**（二重 TS 構成はとらない）。その場合 D18 のエディタも TS 5.x になり、TS6 化は §7 の契機で再挑戦する | frontend の TS6 化は必須ではない |
| D16 | api tsconfig は**最小変更**（`moduleResolution: bundler` / tsup 維持） | 厳格化・no-build 化は別テーマ |
| D17 | lint / format は Biome 1.9 のまま | スコープ外 |
| D18 | `.vscode/` をコミット（`.gitignore` に例外を追加）。`js/ts.tsdk.path` はルートから `frontend/node_modules/typescript/lib`（frontend の TypeScript の `tsserver.js` がある場所）を指し、`js/ts.experimental.useTsgo: false` を明示する。エディタは frontend の TypeScript（通常は 6.0、D15 で据え置いた場合は 5.x）を使い、api のエディタ診断もその版になる。api の正は CLI の `tsc`（TS7） | 1 ウィンドウで tsdk は 1 つ。Next TS プラグインを維持。TS7 拡張はインストール時に未設定の `useTsgo` を true にするため明示が必要（§9） |
| D19 | npm / npx を使う記述は pnpm PR で、§5「npm 記述の置換対象」の一覧に従って更新する。過去の記録・テンプレート・npm レジストリを指す記述と、Dockerfile での pnpm の導入（`npm i -g pnpm`）は変えない | ドキュメントだけ npm が残ると誤操作の原因になる。`devEngines.packageManager`（`onFail: "error"`）により `npm run` は失敗するため、実行に関わる箇所の取りこぼしは動作不良になる |
| D20 | PR2 で api の devDependencies に `openapi-types` を `pnpm add -D` で追加（lock にも反映） | `src/openapi.ts` が型 import しているが未宣言（phantom dependency）。npm では hoist で偶然見えていたが、pnpm では `TS2307` になる（§10） |
| D21 | PR2 で api の tsconfig から `declaration` / `declarationMap` を削除 | `noEmit` + tsup `dts: false` のため何も出力しない設定。pnpm の非 hoist 構成では推論型が `.pnpm/` 内を参照して `TS2742` になる（§10） |
| D22 | PR1 で frontend の production ステージに `ENV HOSTNAME=0.0.0.0` | Next standalone サーバーは `HOSTNAME` に bind し、Docker はそれをコンテナ ID に設定する。そのため `localhost:3000` 宛ての HEALTHCHECK が失敗し、**本番の frontend は現在 unhealthy**（2026-10-15 確認）。pnpm とは無関係の既存不具合 |
| D23 | PR1 で api の dependencies に `zod-openapi`（`^4.2.4`）を明示的に追加 | hono-openapi が依存する `@standard-community/standard-openapi` は zod v3 のスキーマ変換に `zod-openapi` を使うが、**任意の peer 依存**として宣言しているだけ。旧 lock には残っていたが、Node 26 同梱の npm 11 で lock を更新すると入らなくなり、`/openapi.json` が 500 を返した（PR1 の実装中に確認、2026-10-15）。D20 と同じく「使っているのに宣言していない依存」。PR2 の pnpm 化もこの明示的な宣言を前提にする |
| D24 | PR1 で frontend の `@playwright/test` を `^1.63.0`（lock は 1.63.0）に上げる | Playwright 1.58.2 は Node 26 上でブラウザの zip 展開中に停止し、CI の E2E ジョブが「Install Playwright Browsers」で止まった（PR #67、2026-10-15）。ローカルの Node 26.11.1 でも再現。1.63.0 と 1.64.1 は正常にインストールできることを確認。公開から1日の 1.64.1 ではなく、1か月以上経つ 1.63.0 を選んだ |

## 4. PR1: Node.js 26

ブランチ: `chore/node-26`

| ファイル | 変更 |
|----------|------|
| `flake.nix` / `flake.lock` | `nixpkgs-unstable`、`pkgs.nodejs_26`、`pkgs.pnpm_12` 追加、description・shellHook 更新 |
| `.node-version` | 新規: `26` |
| `mise.toml` | 新規: `[settings] disable_tools = ["node", "pnpm"]` |
| `.envrc` | コメントの "Node 22" を更新 |
| `api/Dockerfile` | `node:22-slim` → `node:26.x.y-slim`（全ステージ） |
| `frontend/Dockerfile` | `node:22.14.0-slim` → `node:26.x.y-slim`（全ステージ）。production に `ENV HOSTNAME=0.0.0.0`（D22） |
| `api/tsup.config.ts` | `target: "node22"` → `"node26"` |
| `api/package.json` | dependencies に `zod-openapi` を追加（D23） |
| `frontend/package.json` | `@playwright/test` → `^1.63.0`（D24） |
| `api/package.json` / `frontend/package.json` | `devEngines.runtime`、`@types/node` → `^26` |
| `{api,frontend}/package-lock.json` | `@types/node` 変更後に `npm install` で更新 |
| `.github/workflows/{ci,security}.yml` | `node-version: "22"` → `node-version-file: .node-version` |
| `docs/NIX-DEVELOPMENT.md`、README | Node バージョン記述更新 |

**検証**

- [ ] `npm ci` が api / frontend とも成功する（package.json と lock の一致）
- [ ] `nix flake check`、`direnv exec . node --version` が v26
- [ ] `mise trust` 後、mise ではなく nix の node が使われる
- [ ] api: `npm test` / `npx biome check src/` / `npx tsc --noEmit` / `npm run build`
- [ ] frontend: `npm run lint` / `npx tsc --noEmit` / `npm run build`
- [ ] `docker compose build` → 起動 → `/health` 応答、frontend 表示
- [ ] `/openapi.json` が 200 を返し、`npm run openapi:export` の出力が main と同一（D23）
- [ ] frontend コンテナが `docker ps` で **healthy** になる（D22）
- [ ] `make test-e2e`
- [ ] `tsx watch`（dev）が動作すること（`DEP0205` の `module.register()` 非推奨警告が出ることは確認済み、警告のみで許容）

## 5. PR2: pnpm 12

ブランチ: `chore/pnpm-12`

| ファイル | 変更 |
|----------|------|
| `{api,frontend}/package-lock.json` | 削除 |
| `{api,frontend}/pnpm-lock.yaml` | 新規。`pnpm import` で現 lock から変換する（pnpm 12.9.0 で動作確認済み、差分は §10） |
| `{api,frontend}/pnpm-workspace.yaml` | 新規: `allowBuilds`（D11 の一覧を全て `false`）。frontend は `overrides`（postcss）も |
| `{api,frontend}/package.json` | `devEngines.packageManager`。api は devDependencies に `openapi-types`（D20）。frontend の npm 用 `overrides` は削除し `pnpm-workspace.yaml` へ移す（pnpm は `package.json` の `overrides` を読まない） |
| `api/tsconfig.json` | `declaration` / `declarationMap` を削除（D21） |
| `api/Dockerfile` | 新設の `base` ステージ（`ARG PNPM_VERSION=<exact>` + `npm i -g pnpm@${PNPM_VERSION}`）。builder（`FROM base`）: `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` を COPY → `pnpm install --frozen-lockfile` → `tsup.config.ts` / `tsconfig.json` / `src/` を COPY → build。新設の deps（`FROM base`）: 同じ 3 ファイルを COPY → `pnpm install --prod --frozen-lockfile`。新設の dev（`FROM base`、production より前）: 同じ 3 ファイルを COPY → `pnpm install --frozen-lockfile`（devDependencies の tsx を含む）→ `CMD ["pnpm", "exec", "tsx", "watch", "src/index.ts"]`。production（`FROM node:26.x.y-slim`、最後のステージ）: **`package.json` を COPY**（`"type": "module"` が無いと ESM の `dist/index.js` が CommonJS として解釈され起動しない）、deps の `node_modules` をディレクトリごと COPY（現行の `npm ci --omit=dev` を置き換える）、builder の `dist` を COPY、**`src/db/migrations/` を COPY**（`migrate.ts` が `process.cwd()/src/db/migrations` を読み、`docker-compose.deploy.yml` の news-migrate が同じイメージで実行するため）。`appuser`（uid 10001）・`HEALTHCHECK`・`CMD` は現行のまま |
| `frontend/Dockerfile` | 新設の `base` ステージ（api と同じ、`ARG PNPM_VERSION=<exact>`）。builder と dev は `FROM base` とし、どちらも `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` を COPY → `pnpm install --frozen-lockfile`。dev の `CMD` は `["pnpm", "run", "dev"]`（`npm run` は `devEngines` で失敗するため）。production（`FROM node:26.x.y-slim`）は従来どおり standalone 出力・`.next/static`・`public` を COPY し、`USER node`・`API_URL`・`HEALTHCHECK`・`CMD` も現行のまま（PR1 で入る `ENV HOSTNAME=0.0.0.0` を含む。deps ステージは作らない）。stage の並び（production が最後）は維持する |
| `.github/workflows/ci.yml` | 各ジョブで `pnpm/action-setup@v6` を `setup-node@v7` より**前に**置く（`cache: pnpm` は pnpm の存在が前提）。`cache-dependency-path` を api-test: `api/pnpm-lock.yaml`、frontend-lint: `frontend/pnpm-lock.yaml`、frontend-e2e: 両方 に変更。`npm ci` → `pnpm install --frozen-lockfile`、`npm run` → `pnpm run`、`npx` → `pnpm exec` |
| `.github/workflows/security.yml` | 同上（`cache-dependency-path` は各ジョブの `pnpm-lock.yaml`）+ `npm audit` → `pnpm audit` |
| `.github/workflows/release-images.yml` | 影響確認（Docker ビルドのみなら変更なし） |
| その他の npm 記述 | 下記「npm 記述の置換対象」に従う |

**npm 記述の置換対象**（2026-10-15 に `git grep -nwE "npm|npx"` で洗い出し）

| 区分 | ファイル |
|------|----------|
| 実行に影響 | `frontend/playwright.config.ts`（`webServer.command` を `pnpm run build && pnpm run start` に）、`Makefile`、`docker-compose.dev.yml`（news-api に `build.target: dev` を追加し `command` を `pnpm exec tsx watch src/index.ts` に、news-frontend の `command` を `pnpm run dev` に）、`api/Dockerfile`、`frontend/Dockerfile`、`.github/workflows/ci.yml`、`.github/workflows/security.yml`、`.claude/hooks/pre-commit.sh`、`flake.nix`（shellHook の表示とヒント） |
| 手順書 | `CLAUDE.md`、`README.md`、`README.ja.md`、`frontend/README.md`、`docs/NIX-DEVELOPMENT.md`、`docs/runbooks/local-dev-setup.md`、`docs/runbooks/release-process.md`、`api/src/db/CLAUDE.md`、`.claude/skills/{release,refactor,improve}/`（`improve/references/qa-guide.md` を含む）、メモリ（リポジトリ外） |
| コードのコメント | `api/scripts/export-openapi.ts`、`frontend/src/lib/types.ts` |
| **変えない** | 過去の記録（`docs/DESIGN-*`・`docs/WORKFLOW-*`・`docs/REQUIREMENTS-*`・`docs/SECURITY-FIXES.md`・`docs/TEST-*`・`tasks/todo.md`・`CHANGELOG.md`）、テンプレート（`docs/coding-guide.md`）、npm レジストリを指す記述（`frontend/src/app/layout.tsx` のコメント、`CLAUDE.md` の「feed (npm)」）、`frontend/.gitignore` の `npm-debug.log*`、両 Dockerfile の `base` ステージの `RUN npm i -g pnpm@${PNPM_VERSION}`（pnpm を入れるための意図的な npm 使用。Corepack が無いため） |

**検証**

- [ ] `pnpm install --frozen-lockfile` がクリーン環境で成功（ビルドブロックで失敗しない）
- [ ] `git grep -nwE "npm|npx"` の結果が「変えない」区分の記述だけになる（Dockerfile は `npm i -g pnpm` の 1 行のみ）
- [ ] CI の全ジョブがセットアップ段階（pnpm 導入・キャッシュ復元）を通過する
- [ ] CI（`pnpm/action-setup` の `version`）と両 Dockerfile の `ARG PNPM_VERSION` の既定値が同じ exact 値である
- [ ] build-arg を渡さない通常の `docker compose build` で、イメージ内の pnpm がその exact 版になる（builder ステージで `pnpm --version`）
- [ ] `docker-compose.deploy.yml` の news-migrate（`node dist/db/run-migrate.js`）が新イメージで成功する
- [ ] `make dev` で news-api（tsx watch）と news-frontend（next dev）が両方起動し、api の `/health` と frontend の表示が成功する。ソース変更でホットリロードされる
- [ ] `docker build --target dev` で api / frontend の dev イメージもビルドでき、`pnpm: not found` や `ERR_PNPM_IGNORED_BUILDS` が出ない
- [ ] PR1 と同じテスト・lint・型チェック・ビルド一式
- [ ] api / frontend の Docker イメージをビルド・起動し、`Cannot find module` が出ないこと（scratch で確認済み。実ファイルで再確認）
- [ ] frontend の postcss が override どおり解決されること（`pnpm why postcss`）
- [ ] `pnpm audit --prod` が CI で動作すること
- [ ] `make test-e2e`
- [ ] CI 全体の所要時間が §1 の合格条件（固定ベースラインから +10% 以内）を満たす

## 6. PR3: TypeScript

ブランチ: `chore/typescript-7`

| ファイル | 変更 |
|----------|------|
| `api/package.json` / `api/pnpm-lock.yaml` | `pnpm add -D typescript@~7.0` |
| `api/tsconfig.json` | TS7 で必要な場合のみ修正（現設定は deprecation 対象を使っていない見込み） |
| `frontend/package.json` / `frontend/pnpm-lock.yaml` | `pnpm add -D typescript@~6.0`（D15 のフォールバックあり） |
| `frontend/tsconfig.json` | TS6 deprecation 警告が出た設定を修正（`ignoreDeprecations` で黙らせない） |
| `.vscode/settings.json` | `js/ts.tsdk.path` → `frontend/node_modules/typescript/lib`、`js/ts.experimental.useTsgo: false`、Biome / ESLint 設定 |
| `.vscode/extensions.json` | Biome、ESLint、direnv を推奨 |
| `.gitignore` | `.vscode/` → `.vscode/*` + `!.vscode/settings.json` + `!.vscode/extensions.json`（ディレクトリごと除外していると中のファイルを再包含できないため） |

**検証**

- [ ] `pnpm install --frozen-lockfile` が api / frontend とも成功する
- [ ] api: `pnpm exec tsc --noEmit` が TS7 で成功し、§1 の合格条件（3 回の中央値で TS5 より速い）を満たす
- [ ] CI 全体の所要時間が §1 の合格条件（固定ベースラインから +10% 以内）を満たす
- [ ] frontend: `pnpm exec tsc --noEmit`（TS6、D15 で据え置いた場合は TS5）、`pnpm lint`（typescript-eslint が peer 範囲内）、`pnpm build`
- [ ] `pnpm types:generate` → `git diff --exit-code src/lib/api-types.ts` が空（D15 の判定）
- [ ] VS Code で「TypeScript: Select TypeScript Version → Use Workspace Version」を選び、表示される版が `frontend/package.json` の `typescript`（通常 6.0.x、D15 で据え置いた場合 5.x）と一致する（`tsdk` の指し先が正しいことの確認を兼ねる）
- [ ] `git check-ignore .vscode/settings.json .vscode/extensions.json` が何も返さない（コミット対象になっている）
- [ ] VS Code で api / frontend 双方の診断が表示され、Next TS プラグインが有効（例: Server Component で `useState` を使うと警告が出る）
- [ ] TS7 拡張を入れても `useTsgo` が false のまま維持される

## 7. Out of Scope（将来タスク）

| 項目 | 契機 |
|------|------|
| CI を `nix develop` 実行へ移行、flake を唯一の基準に | PR1〜3 完了後 |
| frontend の TypeScript 7 化 | typescript-eslint が TS7 API に対応した時 |
| frontend の TypeScript 6 化（D15 で 5.x に据え置いた場合のみ） | openapi-typescript が TS 6 に対応した時 |
| api の no-build 化（Node type stripping で `.ts` 直接実行、copier-ts7 D6） | 別設計 |
| api tsconfig 厳格化（`noUncheckedIndexedAccess` 等、copier-ts7 D7） | 別 PR |
| api の `tests/` を型チェック対象に含める（現在 `exclude: ["tests"]`） | 別 PR |
| oxlint / oxfmt への移行（type-aware lint） | 別設計 |
| Renovate 導入（Docker patch / flake.lock / npm / actions） | 別 PR |
| VS Code で TS7 ネイティブ言語サービス（`useTsgo`）を api に使う | §9 で 1 ウィンドウ運用では不可と結論。api / frontend を別ウィンドウで開く運用に変える時、または Next.js が TS 7.1 API にプラグインを移植した時 |

## 8. Open Verification Items

| 項目 | 状態 |
|------|------|
| VS Code の tsgo 全体適用で Next TS プラグインが本当に動かないか / マルチルートでフォルダ別 tsdk が効くか | **調査済み（2026-10-15）** → §9 |
| `@typescript/typescript6` alias 構成時に `next build` が実行する `tsc` の実体 | D14 で alias 構成を採らないため不要 |
| Node 26 `module.register()` deprecation の tsx への影響 | **確認済み**：`DEP0205` 警告が出るが動作に影響なし（§10） |
| pnpm 12 で `pnpm import` が使えるか | **確認済み**：動作する（§10） |
| pnpm の symlink 構成で Docker（api の deps ステージ / frontend standalone）が動くか | **確認済み**：動作する（§10） |
| ビルドスクリプトを全て拒否してもツールが動くか | **確認済み**：動作する（§10） |
| pnpm 12 の `pnpm audit` 動作 | PR2 で確認 |
| openapi-typescript の TS 6.0 動作 | PR3 で確認 |
| `js/ts.tsdk.path` を `…/typescript/lib` にすれば Use Workspace Version に frontend の TypeScript が出るか | PR3 で確認 |

## 9. VS Code と TypeScript 7 の調査結果（D18 の裏付け）

| 論点 | 結論 | 出典 |
|------|------|------|
| tsgo をウィンドウ全体で有効にすると Next TS プラグインは動くか | **動かない**。TS7 の言語サーバーは tsserver プラグインを読み込まない（Go 実装でサードパーティコードを動的リンクできない）。ネイティブ拡張は "server plugins … will not be loaded because TypeScript 7 is enabled globally" と警告する | microsoft/TypeScript#63800、microsoft/typescript-go `_extension/src/extension.ts` |
| 失われるもの | Next 固有のエディタ診断（`'use client'` 境界、route segment config 値、metadata 型など 71001–71011）と補完。**元々エディタ専用で `tsc` / `next build` では検出されない**。typed routes や `PageProps` は生成 `.d.ts` 由来なので失われない | nextjs.org/docs/app/api-reference/config/typescript、vercel/next.js#97229 |
| tsgo で TS6 プロジェクトを型チェックした場合 | tsgo は同梱のチェッカーを使い、`node_modules/typescript` を見ない。frontend の tsconfig は TS7 でエラーになる設定を使っていないので、診断はほぼ同じになる見込み（未検証） | typescript-go `_extension/src/util.ts` |
| マルチルート構成で設定をフォルダ別に分けられるか | **不可**。`js/ts.tsdk.path` と `js/ts.experimental.useTsgo` はどちらも window スコープ | microsoft/vscode `extensions/typescript-language-features/package.json` |
| 7.1 で解消するか | 7.1（stable は 2026-11-24 の予定）で Language Service API が安定化する予定。ただし tsconfig プラグイン互換は約束されておらず、Next 側が移植するかも不明 | microsoft/TypeScript#63703 |

**D18 への反映**

- ルートの `.vscode/settings.json` に **`"js/ts.experimental.useTsgo": false` を明示する**。ネイティブ拡張はインストール時に `useTsgo` が未設定なら true に書き換えるため、明示しないと D18 の構成が崩れる
- 設定名は `js/ts.tsdk.path` / `js/ts.experimental.useTsgo` を使う（`typescript.*` の名前は非推奨）
- `js/ts.tsdk.path` は `tsserver.js` のあるディレクトリ（`frontend/node_modules/typescript/lib`）を指す。TS7 拡張は `tsserver.js` を含むパスを無視して同梱の tsgo に切り替える仕様のため、`useTsgo: false` との組み合わせで初めて frontend の TypeScript（通常 TS6）が使われる
- 別案として、`api/` と `frontend/` を**別々のウィンドウ**で開き、それぞれの `.vscode/settings.json` で api は tsgo、frontend は TS6 と Next プラグインを使う方法がある。ルートを1つのウィンドウで開く運用とは両立しないので採用しない（運用を変えるときに見直す）

## 10. 事前検証の結果（2026-10-15）

scratchpad にリポジトリの api / frontend をコピーし、`nixpkgs-unstable` の `nodejs_26`（26.11.1）と `pnpm_12`（12.9.0）で実行した。リポジトリ本体は変更していない。

### `pnpm import`

| 対象 | 時間 | npm lock との差分 | 原因 | 影響 |
|------|------|-------------------|------|------|
| api | 1.6s | `string-width-cjs` 等 3 件 | npm のエイリアスを pnpm は実名で記録 | なし |
| frontend | 3.6s | `electron-to-chromium` 1.5.455 → 1.5.454 | 1.5.455 は公開から 24 時間未満で `minimumReleaseAge` により除外 | なし |
| frontend | | `semver` 7.7.4 → 7.8.5（is-bun-module 配下） | 範囲 `^7.7.1` 内で重複排除 | なし |
| frontend | | next 配下の `postcss` 8.5.28 → 8.5.23 | `package.json` の npm 用 `overrides` を pnpm は読まない | 8.5.23 も `^8.5.10` を満たす。`pnpm-workspace.yaml` の `overrides` に移す（§5） |

### ビルドスクリプト

`allowBuilds` 無しの `pnpm install --frozen-lockfile` は `ERR_PNPM_IGNORED_BUILDS` で失敗した。対象は §2 の一覧。全て `false` にした状態で次が全て成功した。

- api: `biome check`、`tsup` ビルド、`tsx`、`vitest`（24 ファイル / 237 テスト、testcontainers 含む）
- frontend: `eslint`、`tsc --noEmit`、`next build`、`types:generate`（出力は npm 版と完全一致）

### pnpm 化で表面化した問題

| 問題 | 原因 | 対応 |
|------|------|------|
| `TS2307: Cannot find module 'openapi-types'` | 未宣言の依存（phantom dependency） | D20 |
| `TS2742: The inferred type of 'jsonResponse' cannot be named without a reference to '.pnpm/...'` | 何も出力しない `declaration: true` が移植性チェックを有効にしている | D21（無効化で解消を確認） |

### Docker

`ARG PNPM_VERSION=12.9.0`（既定値で exact 指定）・`npm i -g pnpm@${PNPM_VERSION}`・api のみ deps ステージ・api の production で `package.json` と `src/db/migrations/` を COPY、という構成で `node:26.11.1-slim` からビルドし、検証用 Postgres と同一ネットワークで起動した。検証時は共通 `base` ステージを使わず、pnpm を使う各ステージで個別に `npm i -g` していた（D12 の `base` ステージ化はステージ間で同じ処理をまとめるだけで、結果は変わらない）。全 install ステージで `pnpm-workspace.yaml` を COPY していた。

- api: マイグレーション成功、`/health` → `{"status":"healthy","db":"connected"}`
- frontend: `/` `/articles` `/sources` が全て 200。`Cannot find module` なし
- standalone 出力の `node_modules` は `.pnpm/` への**相対** symlink のまま COPY され、壊れない
- frontend への `localhost:3000` は接続失敗、コンテナのホスト名なら成功 → D22 の原因。本番の frontend コンテナも unhealthy であることを確認済み

### Node 26

- tsx は `DEP0205: module.register() is deprecated` を出す。警告のみで動作に影響なし
