# Deploy From Registry — Single-File Compose

**Branch**: `feat/deploy-from-registry` (from `main`)
**Goal**: dev ホストにソースコードを置かず、registry から pull した image だけで `docker compose up -d` 一発起動できる構成を追加する

---

## Phase 1: DB image の独立化

- [x] **1.1** `db/.dockerignore` 作成 — `ca.key`, `generate-certs.sh` を除外
- [x] **1.2** `db/Dockerfile` 作成 — postgres:16.11 ベース、init scripts と SSL 証明書を焼き込み

## Phase 2: 単一 deploy compose

- [x] **2.1** `docker-compose.deploy.yml` 作成
  - 全 service を `image:` 参照のみ（build 無し）
  - `pull_policy: always`
  - `news-migrate` を one-shot サービスとして追加
  - `depends_on` で db→migrate→api→frontend をチェーン
  - prod 相当の resource limit / port mapping を内包

## Phase 3: Makefile 更新

- [x] **3.1** `build-db` ターゲット追加
- [x] **3.2** `build` ターゲットに db を含める
- [x] **3.3** `push` ターゲットに db image push を追加
- [x] **3.4** `deploy-pull` / `deploy-up` ターゲット追加（dev ホスト用）

## Phase 4: ドキュメント

- [x] **4.1** `docs/runbooks/release-process.md` 更新 — registry deploy 手順を追記
- [x] **4.2** README に deploy 手順への参照を追加（必要なら）

## Phase 5: 検証

- [x] **5.1** ローカルで `docker compose -f docker-compose.deploy.yml config` が通る
- [x] **5.2** db Dockerfile の build が通る
- [x] **5.3** Commit

---

## Files Changed

| Action | File |
|--------|------|
| **NEW** | `db/.dockerignore` |
| **NEW** | `db/Dockerfile` |
| **NEW** | `docker-compose.deploy.yml` |
| MODIFY | `Makefile` |
| MODIFY | `docs/runbooks/release-process.md` |

---

## Review

### What was built
- `db/Dockerfile` (+ `.dockerignore`) — postgres:16.11 with init scripts and SSL certs baked in. `ca.key` and `generate-certs.sh` are excluded from the image.
- `docker-compose.deploy.yml` — single compose file with no `build:` directives; pulls all 3 images with `pull_policy: always`. Includes `news-migrate` as a one-shot service that runs `node dist/run-migrate.js` and exits, gating `news-api` startup via `service_completed_successfully`.
- `Makefile` — added `build-db`, `deploy-pull`, `deploy-up`, `deploy-down` targets. `build` and `push` now include the db image.
- `docs/runbooks/release-process.md` — documented the registry-pull deploy flow.

### Verified
- `docker compose -f docker-compose.deploy.yml config` produces valid output.
- `docker build ./db` succeeds. The resulting image contains init scripts and the 3 expected SSL files (no CA key).

### Deploy host workflow
```
docker-compose.deploy.yml + .env  →  make deploy-pull && make deploy-up
```
Chain: db (healthy) → migrate (exits 0) → api (healthy) → frontend.
