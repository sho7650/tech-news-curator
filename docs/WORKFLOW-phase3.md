# Phase 3 実装ワークフロー

> **Version**: 1.0
> **Date**: 2026-02-14
> **Base**: `docs/DESIGN-phase3.md` v1.6
> **Status**: レビュー待ち

---

## 前提条件

- Phase 2 が完了し、`main` ブランチが最新であること
- 設計書 `docs/DESIGN-phase3.md` v1.6 がレビュー承認済みであること
- Google Cloud Console で OAuth 2.0 クライアント ID/Secret を取得済み
- GitHub OAuth App で Client ID/Secret を取得済み
- RSA鍵ペアを生成済み（`openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem`）
- Stripe アカウントで API Key、Webhook Secret、Price ID を取得済み（Phase 3.3 開始前までに）

---

## ブランチ戦略

```
main
 └── feature/phase3-ui-auth-billing
      ├── Phase 3.0: Step 1-8   UI刷新（テーマ、Bento Grid、読書UX）
      ├── Phase 3.1: Step 9-18  OAuth認証（users テーブル、JWT、OAuth フロー、認証UI）
      ├── Phase 3.2: Step 19-25 全文翻訳 + 比較表示（is_premium、ペイウォール）
      └── Phase 3.3: Step 26-31 Stripe課金（checkout、webhook、料金UI）
```

単一の feature ブランチで段階的にコミット。各ステップ完了後にテスト実行・確認を行う。

---

## Phase 3.0 — UI刷新

### Step 1: フォント変更（Inter + Noto Sans JP）

> 依存: なし | 設計書: §2.1.4, §1.3

#### 1.1 layout.tsx でフォント設定

| タスク | ファイル | 操作 |
|--------|---------|------|
| `Inter`（Variable Font）と `Noto_Sans_JP`（weight: 400, 700）を `next/font/google` からインポート | `frontend/src/app/layout.tsx` | **変更** |
| `<html>` に `className={inter.variable} ${notoSansJP.variable}` を設定 | 同上 | **変更** |

**チェックポイント**:
- `Noto_Sans_JP` に `preload: false` が設定されていること（日本語フォントは大きいため）
- 両フォントに `display: 'swap'` が設定されていること（FOIT回避）
- CSS変数方式（`variable`）で宣言されていること

#### 1.2 globals.css でフォント適用

| タスク | ファイル | 操作 |
|--------|---------|------|
| `body` の `font-family` を `var(--font-inter), var(--font-noto-sans-jp), ui-sans-serif, system-ui, sans-serif` に変更 | `frontend/src/app/globals.css` | **変更** |

#### 1.3 動作確認

```bash
make dev
# ブラウザで Inter + Noto Sans JP が適用されていることを確認
# DevTools > Elements > Computed > font-family を確認
```

---

### Step 2: next-themes + ダークモード基盤

> 依存: Step 1 | 設計書: §2.1.1, §2.1.2, §1.2

#### 2.1 next-themes インストール

| タスク | ファイル | 操作 |
|--------|---------|------|
| `next-themes@0.4.6` を追加 | `frontend/package.json` | **変更** |

```bash
cd frontend && npm install next-themes@0.4.6
```

#### 2.2 globals.css にテーマ変数を追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `@custom-variant dark (&:where(.dark, .dark *))` ディレクティブ追加 | `frontend/src/app/globals.css` | **変更** |
| `@theme` ブロックで CSS変数を Tailwind ユーティリティに統合 | 同上 | **変更** |
| `:root`（ライトテーマ）と `.dark`（ダークテーマ）のCSS変数を定義 | 同上 | **変更** |

**チェックポイント**:
- §2.3.1, §2.3.2 のカラーパレット値と一致すること
- `@custom-variant` が Tailwind CSS v4 の正式構文であること（v3 の `darkMode: "class"` は使わない）

#### 2.3 ThemeProvider コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `next-themes` の `ThemeProvider` をラップする Client Component を作成 | `frontend/src/components/ThemeProvider.tsx` | **新規** |

**チェックポイント**:
- `"use client"` ディレクティブがあること
- `attribute="class"`, `defaultTheme="dark"`, `enableSystem={true}` が設定されていること

#### 2.4 layout.tsx に ThemeProvider を統合

| タスク | ファイル | 操作 |
|--------|---------|------|
| `<ThemeProvider>` で `<body>` 内の children をラップ | `frontend/src/app/layout.tsx` | **変更** |
| `<html>` に `suppressHydrationWarning` を追加 | 同上 | **変更** |

#### 2.5 動作確認

```bash
make dev
# ブラウザでダークテーマがデフォルトで適用されていることを確認
# DevTools > Elements で <html class="dark"> を確認
```

---

### Step 3: テーマトグル

> 依存: Step 2 | 設計書: §2.1.3

#### 3.1 ThemeToggle コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 3状態トグル（ライト→ダーク→システム）の Client Component を作成 | `frontend/src/components/ThemeToggle.tsx` | **新規** |

**チェックポイント**:
- `useTheme()` フックを使用
- `mounted` チェックでハイドレーションミスマッチを回避
- アイコンでテーマ状態を視覚的に区別

#### 3.2 ヘッダーにテーマトグル追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| ヘッダー右側に `<ThemeToggle />` を配置 | `frontend/src/components/Header.tsx` | **変更** |

#### 3.3 動作確認

```bash
make dev
# テーマトグルをクリックしてライト/ダーク/システムが正しく切り替わること
# ページリロード後もテーマが永続化されること（localStorage）
```

---

### Step 4: ヘッダー リデザイン

> 依存: Step 3 | 設計書: §2.2.1

#### 4.1 ヘッダーのスタイル変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `sticky top-0 z-50` + `bg-bg-primary/80 backdrop-blur-md` に変更 | `frontend/src/components/Header.tsx` | **変更** |
| ボーダー `border-b border-border` 追加 | 同上 | **変更** |
| モバイル向けハンバーガーメニューを実装 | 同上 | **変更** |

**チェックポイント**:
- テーマ変数（`bg-bg-primary`, `border-border` 等）を使用し、ハードコードされた色がないこと
- スクロール時にヘッダーが画面上部に固定されること
- モバイルビューでハンバーガーメニューが機能すること

---

### Step 5: 記事一覧 Bento Grid レイアウト

> 依存: Step 2 | 設計書: §2.2.2

#### 5.1 ヒーローカードの改修

| タスク | ファイル | 操作 |
|--------|---------|------|
| 全幅ヒーローカード: OG画像フル表示 + グラデーションオーバーレイ + テキストオーバーレイ | `frontend/src/components/HeroSection.tsx` | **変更** |
| カテゴリバッジにアクセントカラー背景を適用 | 同上 | **変更** |

#### 5.2 ArticleGrid を Bento Grid に変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| デスクトップ: 2/3 + 1/3 → 1/3 × 3 → 3カラムグリッドの Bento レイアウト | `frontend/src/components/ArticleGrid.tsx` | **変更** |
| タブレット: 全幅ヒーロー → 2カラムグリッド | 同上 | **変更** |
| モバイル: 全幅ヒーロー → 1カラムリスト | 同上 | **変更** |

#### 5.3 ArticleCard テーマ対応

| タスク | ファイル | 操作 |
|--------|---------|------|
| `bg-bg-card border-border` にテーマ対応色を適用 | `frontend/src/components/ArticleCard.tsx` | **変更** |
| ホバーエフェクト: `hover:shadow-lg hover:scale-[1.02] transition-all duration-200` | 同上 | **変更** |

#### 5.4 ArticleListLive テーマ対応

| タスク | ファイル | 操作 |
|--------|---------|------|
| Bento Grid レイアウトとテーマ対応色を適用 | `frontend/src/components/ArticleListLive.tsx` | **変更** |

**チェックポイント**:
- §2.2.2 の ASCII ワイヤーフレームと一致するレイアウトであること
- デスクトップ/タブレット/モバイルの3ブレークポイントが正しく動作すること

---

### Step 6: 記事詳細 リデザイン

> 依存: Step 2 | 設計書: §2.2.3

#### 6.1 ReadingTime コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `estimateReadingTime(text)` 関数を含む Server Component を作成 | `frontend/src/components/ReadingTime.tsx` | **新規** |

**チェックポイント**:
- 日本語: 約500文字/分、英語: 約200単語/分で計算
- 最小値は1分

#### 6.2 ScrollProgress コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `fixed top-0 left-0 h-1 bg-accent z-50` のスクロールプログレスバー Client Component を作成 | `frontend/src/components/ScrollProgress.tsx` | **新規** |

**チェックポイント**:
- `requestAnimationFrame` でパフォーマンス最適化
- `useEffect` で `scroll` イベントリスナーを登録（クリーンアップ含む）

#### 6.3 TableOfContents コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `h2`, `h3` を抽出しサイドバー固定表示する Client Component を作成 | `frontend/src/components/TableOfContents.tsx` | **新規** |

**チェックポイント**:
- `IntersectionObserver` で現在のセクションをハイライト
- デスクトップ: `lg:sticky lg:top-20` でサイドバー固定
- モバイル: `<details>`/`<summary>` で折りたたみ
- 見出しが3つ未満の場合は非表示

#### 6.4 記事詳細ページの統合

| タスク | ファイル | 操作 |
|--------|---------|------|
| リード画像（`aspect-video w-full rounded-xl`）を記事上部に追加 | `frontend/src/app/articles/[id]/page.tsx` | **変更** |
| メタ情報（ソース名・著者・公開日・読了時間）のレイアウト変更 | 同上 | **変更** |
| カテゴリバッジ表示 | 同上 | **変更** |
| 本文 `max-w-prose mx-auto`（最適読書幅 65ch） | 同上 | **変更** |
| `<ScrollProgress />` と `<TableOfContents />` を追加 | 同上 | **変更** |

---

### Step 7: 全コンポーネントのテーマ対応

> 依存: Step 2 | 設計書: §2.5, §2.4

#### 7.1 既存コンポーネントのテーマ対応

| タスク | ファイル | 操作 |
|--------|---------|------|
| テーマ対応色に変更 | `frontend/src/components/Footer.tsx` | **変更** |
| テーマ対応色に変更（error fallback色） | `frontend/src/components/ArticleImage.tsx` | **変更** |
| アクセントカラー、テーマ対応色に変更 | `frontend/src/components/CategoryFilter.tsx` | **変更** |
| テーマ対応色に変更 | `frontend/src/app/not-found.tsx` | **変更** |
| テーマ対応色に変更 | `frontend/src/app/error.tsx` | **変更** |

#### 7.2 トランジション適用

| タスク | ファイル | 操作 |
|--------|---------|------|
| §2.4 のトランジション仕様を globals.css に追加 | `frontend/src/app/globals.css` | **変更** |

**チェックポイント**:
- テーマ切り替え時: `background-color 300ms ease`, `color 300ms ease`, `border-color 300ms ease`
- ハードコードされた色（`#xxx`, `bg-white`, `text-gray-*` 等）が残っていないこと

---

### Step 8: Phase 3.0 E2E テスト

> 依存: Step 1-7 | 見積テスト数: 8 | 設計書: §8.1

#### 8.1 E2E テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| ダークモード切り替え、テーマ永続化 | `frontend/e2e/theme.spec.ts` | **新規** | 3 |
| Bento Grid レイアウト表示確認 | `frontend/e2e/bento-grid.spec.ts` | **新規** | 2 |
| プログレスバー、目次、読了時間 | `frontend/e2e/reading-ux.spec.ts` | **新規** | 3 |

#### 8.2 テスト実行・確認

```bash
make test-e2e
```

**合格基準**: 既存 E2E テスト (14) + Phase 3.0 新規 (8) = 全て PASSED

---

## Phase 3.1 — OAuth認証

### Step 9: 依存パッケージ追加

> 依存: なし | 設計書: §1.1

#### 9.1 バックエンド依存パッケージ追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `PyJWT[crypto]>=2.11.0,<3.0.0` を追加 | `api/requirements.txt` | **変更** |
| `authlib>=1.6.0,<2.0.0` を追加 | `api/requirements.txt` | **変更** |

```bash
cd api && pip install -r requirements.txt
```

---

### Step 10: Alembic — users テーブル作成

> 依存: Step 9 | 設計書: §3.6.1, §7

#### 10.1 User ORM モデル作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `User` モデルを定義（id, email, display_name, avatar_url, oauth_provider, oauth_id, plan, token_version, is_active, created_at, updated_at） | `api/app/models/user.py` | **新規** |

**チェックポイント**:
- `id` は `UUID` 型、`default=uuid4`
- `email` は `String(254)`, NOT NULL, **UNIQUE制約なし**（§3.6.1a 参照）
- `token_version` は `Integer`, NOT NULL, `default=0`
- `__table_args__` に `UniqueConstraint("oauth_provider", "oauth_id", name="uq_users_oauth")`
- SQLAlchemy 2.0 パターン: `Mapped[]` + `mapped_column()`

#### 10.2 models/__init__.py に User をインポート

| タスク | ファイル | 操作 |
|--------|---------|------|
| `from .user import User` を追加 | `api/app/models/__init__.py` | **変更** |

#### 10.3 Alembic マイグレーション生成・実行

```bash
make migrate msg="add_users_table"
# 生成されたマイグレーションファイルを確認
make migrate-up
```

**チェックポイント**:
- マイグレーションに `UniqueConstraint` が含まれていること
- `email` に UNIQUE 制約がないこと

---

### Step 11: Pydantic スキーマ — User

> 依存: Step 10 | 設計書: §3.6.2

#### 11.1 User スキーマ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `UserResponse`（id, email, display_name, avatar_url, plan, created_at）を定義 | `api/app/schemas/user.py` | **新規** |
| `TokenResponse`（access_token, token_type="bearer"）を定義 | 同上 | **新規** |

**チェックポイント**:
- `ConfigDict(from_attributes=True)` が設定されていること
- `token_version` はレスポンスに含めないこと

---

### Step 12: auth_service（JWT生成/検証、ユーザーupsert）

> 依存: Step 10-11 | 設計書: §3.4, §3.5.1, §3.6.1a

#### 12.1 auth_service 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `create_access_token(user)` — RS256 で署名、sub/exp/iat/iss/plan claims | `api/app/services/auth_service.py` | **新規** |
| `create_refresh_token(user)` — RS256 で署名、sub/exp/iat/iss/type="refresh"/ver claims | 同上 | **新規** |
| `verify_token(token, expected_type)` — RS256 で検証、claims 返却 | 同上 | **新規** |
| `upsert_user(email, display_name, avatar_url, oauth_provider, oauth_id)` — §3.6.1a のアカウントリンク戦略を実装 | 同上 | **新規** |
| `set_refresh_cookie(response, token)` — §3.3.1 の Set-Cookie 属性を設定 | 同上 | **新規** |
| `increment_token_version(user_id)` — ログアウト時の token_version インクリメント | 同上 | **新規** |

**チェックポイント**:
- PyJWT の `jwt.encode()` / `jwt.decode()` を使用（python-jose は不使用）
- RS256 鍵は `settings.jwt_private_key` / `settings.jwt_public_key` から取得
- `upsert_user` のアカウントリンク: (1) oauth_provider+oauth_id検索 → (2) verified email検索 → (3) 新規INSERT
- `set_refresh_cookie` の `secure` パラメータが `settings.environment == "production"` であること

#### 12.2 user_service 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `get_user_by_id(user_id)` — UUID でユーザー取得 | `api/app/services/user_service.py` | **新規** |
| `get_user_by_oauth(provider, oauth_id)` — OAuth プロバイダー + ID で検索 | 同上 | **新規** |
| `get_user_by_email(email)` — verified email でユーザー検索 | 同上 | **新規** |

---

### Step 13: OAuth 設定（Authlib）

> 依存: Step 9 | 設計書: §3.5.2

#### 13.1 oauth.py 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `OAuth()` インスタンス作成 | `api/app/oauth.py` | **新規** |
| Google OAuth 登録（`server_metadata_url` 使用、scope: `openid email profile`） | 同上 | **新規** |
| GitHub OAuth 登録（URL 個別指定、scope: `user:email`） | 同上 | **新規** |

**チェックポイント**:
- Google は OpenID Connect 対応（`server_metadata_url` で自動設定）
- GitHub は OAuth2 のみ（`authorize_url`, `access_token_url`, `api_base_url` を個別指定）

---

### Step 14: 認証 Dependency

> 依存: Step 12 | 設計書: §3.7

#### 14.1 dependencies.py に認証 Dependency を追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `bearer_scheme = HTTPBearer(auto_error=False)` を追加 | `api/app/dependencies.py` | **変更** |
| `get_current_user(credentials, session)` — JWT検証 → ユーザー取得。未認証時 401 | 同上 | **変更** |
| `get_current_user_optional(credentials, session)` — JWT検証 → ユーザー取得。未認証時 None | 同上 | **変更** |

**チェックポイント**:
- `OAuth2PasswordBearer` は使用しないこと（パスワード認証フローが存在しないため）
- `get_current_user_optional` は認証失敗時に例外を投げず `None` を返すこと

---

### Step 15: Settings 拡張

> 依存: なし | 設計書: §3.8

#### 15.1 config.py に環境変数追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `google_client_id`, `google_client_secret` を追加 | `api/app/config.py` | **変更** |
| `github_client_id`, `github_client_secret` を追加 | 同上 | **変更** |
| `jwt_private_key`, `jwt_public_key` を追加 | 同上 | **変更** |
| `session_secret` を追加 | 同上 | **変更** |
| `auth_redirect_url` を追加 | 同上 | **変更** |

#### 15.2 .env.example に環境変数の雛形を追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| Phase 3.1 の環境変数を追加（値はプレースホルダ） | `.env.example` | **変更** |

**チェックポイント**:
- `auth_redirect_url` のコメントに同一オリジン制約の注意書きがあること

---

### Step 16: routers/auth.py（OAuth + JWT エンドポイント）

> 依存: Step 12-15 | 設計書: §3.5.1

#### 16.1 auth router 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `GET /auth/google/login` — Google 認可URLへリダイレクト | `api/app/routers/auth.py` | **新規** |
| `GET /auth/google/callback` — Google コールバック処理 → cookie設定 + リダイレクト | 同上 | **新規** |
| `GET /auth/github/login` — GitHub 認可URLへリダイレクト | 同上 | **新規** |
| `GET /auth/github/callback` — GitHub コールバック処理 → cookie設定 + リダイレクト | 同上 | **新規** |
| `POST /auth/refresh` — アクセストークン再発行（token_version検証含む） | 同上 | **新規** |
| `POST /auth/logout` — token_version インクリメント + cookie削除 | 同上 | **新規** |
| `GET /users/me` — ログインユーザー情報 | 同上 | **新規** |

**チェックポイント**:
- 全エンドポイントに `@limiter.limit` が設定されていること（§3.5.1 Rate Limit 列参照）
- GitHub callback で `/user/emails` API を呼び、`verified=true` かつ `primary=true` のメールを取得すること
- GitHub で verified email が取得できない場合は `403 Forbidden` を返却すること
- `POST /auth/logout` は `204 No Content` を返却し、cookie を `Max-Age=0` で削除すること
- OAuth callback の `redirect_uri` が `${PUBLIC_URL}/api/auth/{provider}/callback` であること

---

### Step 17: main.py 統合（Phase 3.1）

> 依存: Step 16 | 設計書: §3.5.3

#### 17.1 ミドルウェア・ルーター登録

| タスク | ファイル | 操作 |
|--------|---------|------|
| `SessionMiddleware(secret_key=settings.session_secret)` を追加 | `api/app/main.py` | **変更** |
| `auth` ルーターを登録 | 同上 | **変更** |
| CORS `allow_methods` にメソッド追加が必要なら確認 | 同上 | **変更** |

**チェックポイント**:
- `SessionMiddleware` は OAuth state 保存のみに使用（ユーザー認証は JWT）
- バージョンを `"3.0.0"` に更新

#### 17.2 バージョン更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| `version` を `"3.0.0"` に更新 | `api/app/main.py` | **変更** |
| `version` を `"3.0.0"` に更新 | `api/pyproject.toml` | **変更** |

---

### Step 18: Phase 3.1 バックエンドテスト

> 依存: Step 10-17 | 見積テスト数: 19（単体 8 + 統合 11） | 設計書: §8.2

#### 18.1 単体テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| JWT生成/検証（RS256）テスト | `api/tests/test_auth_service.py` | **新規** | 4 |
| auth_service（upsertユーザー、アカウントリンク）テスト | 同上 | **新規** | 4 |

テストケース:
- `test_create_access_token` — 正常系、claims 検証
- `test_create_refresh_token` — 正常系、`type="refresh"` と `ver` claims 検証
- `test_verify_token_expired` — 期限切れトークンで例外
- `test_verify_token_invalid` — 不正トークンで例外
- `test_upsert_user_new` — 新規ユーザー作成
- `test_upsert_user_existing_oauth` — 同一 provider+id で既存ユーザー返却
- `test_upsert_user_email_link` — 異なる provider、同一 verified email でアカウントリンク
- `test_upsert_user_new_different_email` — 異なるメールで新規ユーザー作成

#### 18.2 統合テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 認証エンドポイント統合テスト | `api/tests/test_auth.py` | **新規** | 11 |

テストケース:
- `test_google_login_redirect` — GET /auth/google/login → 302
- `test_google_callback_success` — コールバック処理（Google OAuth モック）
- `test_google_callback_invalid_state` — 不正 state → エラー
- `test_refresh_success` — POST /auth/refresh → 200 + 新しい access_token
- `test_refresh_no_cookie` — cookie なし → 401
- `test_refresh_invalid_token` — 不正トークン → 401
- `test_refresh_version_mismatch` — token_version 不一致 → 401
- `test_logout_success` — POST /auth/logout → 204 + cookie 削除
- `test_logout_token_version_incremented` — ログアウト後に token_version が +1
- `test_users_me_authenticated` — GET /users/me → 200 + ユーザー情報
- `test_github_no_verified_email` — GitHub で verified email なし → 403

#### 18.3 テスト実行・確認

```bash
cd api && python -m pytest tests/test_auth_service.py tests/test_auth.py -v
```

**合格基準**: 19 テスト全て PASSED

#### 18.4 全 API テスト実行

```bash
cd api && python -m pytest tests/ -v
```

**合格基準**: Phase 2 既存テスト (93) + Phase 3.1 新規 (19) = 全て PASSED

---

### Step 19: フロントエンド認証UI

> 依存: Step 16-17 | 設計書: §3.9

#### 19.1 TypeScript 型追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `User`, `TokenResponse` 型を追加 | `frontend/src/lib/types.ts` | **変更** |

#### 19.2 API クライアント拡張

| タスク | ファイル | 操作 |
|--------|---------|------|
| `refreshAccessToken(cookieHeader)` を追加 | `frontend/src/lib/api.ts` | **変更** |
| `getCurrentUser(accessToken)` を追加 | 同上 | **変更** |

**チェックポイント**:
- §3.9.4 の関数仕様テーブルと一致すること
- 全関数に `cache: "no-store"` + `signal: AbortSignal.timeout(10_000)` が設定されていること

#### 19.3 認証ユーティリティ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| クライアントサイド認証ユーティリティ（トークンリフレッシュ等） | `frontend/src/lib/auth.ts` | **新規** |

#### 19.4 AuthContext 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 認証状態管理の Context + Provider（Client Component） | `frontend/src/contexts/AuthContext.tsx` | **新規** |

**チェックポイント**:
- `accessToken` はメモリ（React State）に保持
- `refreshToken` は httpOnly cookie（クライアントからアクセス不可）

#### 19.5 ログインページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| Google / GitHub ログインボタン（Server Component） | `frontend/src/app/login/page.tsx` | **新規** |

#### 19.6 OAuth 成功ページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `POST /api/auth/refresh` でアクセストークン取得 → メモリ保持 → リダイレクト（Client Component） | `frontend/src/app/auth/success/page.tsx` | **新規** |

**チェックポイント**:
- `/api/auth/refresh`（`/api` プレフィックス付き）を呼ぶこと
- cookie は自動送信される（SameSite=Lax、同一サイト POST）

#### 19.7 プロフィールページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| ユーザー情報 + プラン表示（Server Component） | `frontend/src/app/profile/page.tsx` | **新規** |

#### 19.8 ヘッダーにログインボタン追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| 未ログイン: 「ログイン」ボタン（→ /login） | `frontend/src/components/Header.tsx` | **変更** |
| ログイン済み: アバター画像 + ドロップダウン（プロフィール、ログアウト） | 同上 | **変更** |

---

### Step 20: Phase 3.1 E2E テスト

> 依存: Step 19 | 見積テスト数: 2 | 設計書: §8.2

#### 20.1 E2E テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| ログインフロー E2E テスト | `frontend/e2e/auth.spec.ts` | **新規** | 2 |

テストケース:
- ログインページの表示とボタン確認
- 未認証時のプロフィールページリダイレクト確認

#### 20.2 テスト実行・確認

```bash
make test-e2e
```

**合格基準**: 全 E2E テスト PASSED

---

## Phase 3.2 — 全文翻訳 + 比較表示

### Step 21: Alembic — articles.is_premium 追加

> 依存: なし | 設計書: §4.1, §7

#### 21.1 Article モデル変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `is_premium: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')` を追加 | `api/app/models/article.py` | **変更** |

#### 21.2 Alembic マイグレーション生成・実行

```bash
make migrate msg="add_is_premium_to_articles"
make migrate-up
```

---

### Step 22: スキーマ・サービス変更

> 依存: Step 21 | 設計書: §4.2

#### 22.1 スキーマ変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `ArticleListItem` に `is_premium: bool` を追加 | `api/app/schemas/article.py` | **変更** |
| `ArticleDetail` に `is_premium: bool` を追加 | 同上 | **変更** |
| `ArticleFull` スキーマを新規定義（ArticleDetail + body_original, body_translated） | 同上 | **変更** |
| `ArticleCreate` に `is_premium: bool = False` を追加 | 同上 | **変更** |

#### 22.2 サービス変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `get_article_by_id` で `is_premium=true` の場合に `body_translated=None` を返却するロジック追加 | `api/app/services/article_service.py` | **変更** |
| `get_article_full(id, user)` メソッド追加 — 認証状態とプランに基づくアクセス制御 | 同上 | **変更** |

**チェックポイント**:
- `GET /articles/{id}` でプレミアム記事の `body_translated` が `null` になること
- `get_article_full` のロジックが §4.2.1 のレスポンスロジックと一致すること

---

### Step 23: GET /articles/{id}/full エンドポイント

> 依存: Step 14, Step 22 | 設計書: §4.2.1

#### 23.1 エンドポイント追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `GET /articles/{id}/full` — `get_current_user_optional` を使用 | `api/app/routers/articles.py` | **変更** |

**チェックポイント**:
- `Depends(get_current_user_optional)` で JWT 任意
- is_premium=false → JWT有無に関わらず 200
- is_premium=true + 未ログイン → 401
- is_premium=true + plan="free" → 403
- is_premium=true + plan="premium"/"pro" → 200

---

### Step 24: フロントエンド — タブ切り替え・ペイウォール

> 依存: Step 23 | 設計書: §4.3, §4.4

#### 24.1 API クライアント追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `getArticleFull(id)` を追加（認証なし、非プレミアム記事用） | `frontend/src/lib/api.ts` | **変更** |
| `getArticleFullAuth(id, accessToken)` を追加（認証付き、プレミアム記事用） | 同上 | **変更** |

**チェックポイント**:
- §3.9.4 の関数仕様テーブルと一致すること

#### 24.2 ContentTabs コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 翻訳/原文タブ切り替え Client Component を作成 | `frontend/src/components/ContentTabs.tsx` | **新規** |

**チェックポイント**:
- §4.3.1 の表示ロジック3ケースを実装
- タブUI が §4.3.1 のタブUI仕様と一致すること

#### 24.3 PaywallBanner コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 有料コンテンツ誘導 Client Component を作成 | `frontend/src/components/PaywallBanner.tsx` | **新規** |

#### 24.4 PremiumBadge コンポーネント作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| プレミアムバッジ Server Component を作成 | `frontend/src/components/PremiumBadge.tsx` | **新規** |

#### 24.5 記事詳細ページ変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| §4.4 の Server Component フロー（cookies() → auth check → full article fetch）を実装 | `frontend/src/app/articles/[id]/page.tsx` | **変更** |

**チェックポイント**:
- `cookies()` で dynamic rendering を強制
- `cache: "no-store"` を全 fetch に明示指定（§4.4.1 defense-in-depth）
- Server Component から内部 API（`http://news-api:8100`）に Cookie ヘッダーを転送
- 未ログイン × プレミアム → PaywallBanner 表示

#### 24.6 ArticleCard にプレミアムバッジ追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `is_premium=true` の記事カードに `<PremiumBadge />` を表示 | `frontend/src/components/ArticleCard.tsx` | **変更** |

---

### Step 25: Phase 3.2 テスト

> 依存: Step 21-24 | 見積テスト数: 10（統合 7 + E2E 3） | 設計書: §8.3

#### 25.1 統合テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 全文翻訳エンドポイント統合テスト | `api/tests/test_article_full.py` | **新規** | 7 |

テストケース:
- `test_article_full_normal_no_auth` — 通常記事 × 未認証 → 200
- `test_article_full_normal_authenticated` — 通常記事 × ログイン済み → 200
- `test_article_full_premium_paid_user` — プレミアム × 有料ユーザー → 200
- `test_article_full_premium_free_user` — プレミアム × 無料ユーザー → 403
- `test_article_full_premium_no_auth` — プレミアム × 未認証 → 401
- `test_article_detail_premium_excludes_body` — GET /articles/{id} プレミアム → body_translated=null
- `test_article_is_premium_in_list` — GET /articles でレスポンスに is_premium が含まれること

#### 25.2 E2E テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| タブ切り替え・ペイウォール E2E テスト | `frontend/e2e/premium.spec.ts` | **新規** | 3 |

テストケース:
- タブ切り替えUI 動作確認 (2)
- PaywallBanner 表示確認 (1)

#### 25.3 テスト実行・確認

```bash
# API テスト
cd api && python -m pytest tests/test_article_full.py -v

# 全 API テスト
cd api && python -m pytest tests/ -v

# E2E テスト
make test-e2e
```

**合格基準**: 全テスト PASSED

---

## Phase 3.3 — Stripe課金

### Step 26: 依存パッケージ追加 + Settings 拡張

> 依存: なし | 設計書: §1.1, §3.8

#### 26.1 Stripe SDK 追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| `stripe>=14.3.0` を追加 | `api/requirements.txt` | **変更** |

```bash
cd api && pip install -r requirements.txt
```

#### 26.2 Settings 拡張

| タスク | ファイル | 操作 |
|--------|---------|------|
| `stripe_secret_key`, `stripe_webhook_secret`, `stripe_price_premium`, `stripe_price_pro` を追加 | `api/app/config.py` | **変更** |

#### 26.3 .env.example 更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| Stripe 環境変数の雛形を追加 | `.env.example` | **変更** |

---

### Step 27: Alembic — users に Stripe カラム追加

> 依存: Step 10 | 設計書: §5.3, §7

#### 27.1 User モデル変更

| タスク | ファイル | 操作 |
|--------|---------|------|
| `stripe_customer_id` (String(100), UNIQUE, nullable) を追加 | `api/app/models/user.py` | **変更** |
| `subscription_status` (String(20), default="none") を追加 | 同上 | **変更** |
| `subscription_end_date` (DateTime(timezone=True), nullable) を追加 | 同上 | **変更** |

#### 27.2 Alembic マイグレーション生成・実行

```bash
make migrate msg="add_stripe_columns_to_users"
make migrate-up
```

---

### Step 28: billing_service + routers/billing.py

> 依存: Step 14, Step 26-27 | 設計書: §5.2

#### 28.1 billing_service 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `create_checkout_session(user, plan)` — Stripe Checkout Session 作成 | `api/app/services/billing_service.py` | **新規** |
| `create_portal_session(user)` — Stripe Customer Portal セッション作成 | 同上 | **新規** |
| `handle_webhook_event(event)` — Webhook イベント処理（4イベント種別） | 同上 | **新規** |

**チェックポイント**:
- `stripe.Customer.create()` は `stripe_customer_id` が未設定の場合のみ
- `handle_webhook_event` が `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` の4種を処理すること
- `success_url` が `{PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}` であること

#### 28.2 billing router 作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| `POST /billing/checkout` — JWT Bearer 認証、5/minute | `api/app/routers/billing.py` | **新規** |
| `POST /billing/portal` — JWT Bearer 認証、5/minute | 同上 | **新規** |
| `POST /billing/webhook` — Stripe Signature 検証、レート制限なし | 同上 | **新規** |

**チェックポイント**:
- `/billing/webhook` にレート制限を設けないこと（§5.2 参照）
- Webhook 署名検証に `stripe.Webhook.construct_event()` を使用すること
- `/billing/checkout` と `/billing/portal` に `Depends(get_current_user)` が設定されていること

---

### Step 29: main.py 統合（Phase 3.3）

> 依存: Step 28

#### 29.1 billing ルーター登録

| タスク | ファイル | 操作 |
|--------|---------|------|
| `billing` ルーターを登録 | `api/app/main.py` | **変更** |

**登録順序**: health → ingest → sse → articles → digest → sources → feed → auth → billing

---

### Step 30: フロントエンド — 課金UI

> 依存: Step 28-29 | 設計書: §5.5

#### 30.1 料金ページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 3カラムプラン比較カード + CTAボタン | `frontend/src/app/pricing/page.tsx` | **新規** |

**チェックポイント**:
- CTA ボタンが `POST /api/billing/checkout`（`/api` プレフィックス付き）を呼ぶこと
- Free プランは「現在のプラン」表示

#### 30.2 決済成功ページ作成

| タスク | ファイル | 操作 |
|--------|---------|------|
| 決済成功メッセージ表示 | `frontend/src/app/billing/success/page.tsx` | **新規** |

#### 30.3 プロフィールページにプラン管理を追加

| タスク | ファイル | 操作 |
|--------|---------|------|
| プラン情報表示 + 「プランを管理」ボタン（→ `POST /api/billing/portal`） | `frontend/src/app/profile/page.tsx` | **変更** |
| サブスクリプション有効期限表示 | 同上 | **変更** |

**チェックポイント**:
- 「プランを管理」ボタンが `POST /api/billing/portal`（`/api` プレフィックス付き）を呼ぶこと

---

### Step 31: Phase 3.3 テスト

> 依存: Step 26-30 | 見積テスト数: 7（統合 6 + E2E 1） | 設計書: §8.4

#### 31.1 統合テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| Stripe 統合テスト | `api/tests/test_billing.py` | **新規** | 6 |

テストケース:
- `test_checkout_session_new_customer` — POST /billing/checkout（モック）→ 新規 customer 作成
- `test_checkout_session_existing_customer` — POST /billing/checkout（モック）→ 既存 customer 使用
- `test_portal_session` — POST /billing/portal（モック）→ portal_url 返却
- `test_webhook_checkout_completed` — checkout.session.completed → plan 更新
- `test_webhook_subscription_deleted` — customer.subscription.deleted → plan="free"
- `test_webhook_invalid_signature` — 署名検証失敗 → 400

**チェックポイント**:
- Stripe SDK はモック化すること（実際の Stripe API を呼ばない）

#### 31.2 E2E テスト作成

| タスク | ファイル | 操作 | テスト数 |
|--------|---------|------|---------|
| 料金ページ E2E テスト | `frontend/e2e/pricing.spec.ts` | **新規** | 1 |

テストケース:
- 料金ページの3プラン表示確認

#### 31.3 テスト実行・確認

```bash
# API テスト
cd api && python -m pytest tests/test_billing.py -v

# 全 API テスト
cd api && python -m pytest tests/ -v

# E2E テスト
make test-e2e
```

**合格基準**: 全テスト PASSED

---

## 最終確認

### 全テスト実行

```bash
# API テスト（既存 + Phase 3 全新規）
cd api && python -m pytest tests/ -v

# E2E テスト
make test-e2e

# セキュリティチェック
make security
```

### 合格基準

| テスト種別 | Phase 2 既存 | Phase 3.0 | Phase 3.1 | Phase 3.2 | Phase 3.3 | 合計 |
|-----------|-------------|----------|----------|----------|----------|------|
| API 単体テスト | 16 | 0 | 8 | 0 | 0 | 24 |
| API 統合テスト | 58 | 0 | 11 | 7 | 6 | 82 |
| フロントエンド E2E | 14 | 8 | 2 | 3 | 1 | 28 |
| **合計** | **88** | **8** | **21** | **10** | **7** | **134** |

> **注**: Phase 2 既存テスト数は Phase 1.2 (54 統合 + 16 単体) + Phase 2 (20 統合 + 12 単体 - 重複) + E2E (14) = 合計 88（API 74 + E2E 14）。Phase 2 の `test_article_service.py` と `test_articles.py` は統合テストとして計上。

### CI ワークフロー更新

| タスク | ファイル | 操作 |
|--------|---------|------|
| E2E テストに OAuth 環境変数のダミー値を追加（テスト実行に影響しない範囲） | `.github/workflows/ci.yml` | **変更** |
| Stripe 環境変数のダミー値を追加 | 同上 | **変更** |

### PR 作成

全テスト合格後に `feature/phase3-ui-auth-billing` → `main` の PR を作成する。

---

## ファイル変更サマリ

### 新規ファイル (24)

| ファイル | Step | Phase |
|---------|------|-------|
| `frontend/src/components/ThemeProvider.tsx` | 2 | 3.0 |
| `frontend/src/components/ThemeToggle.tsx` | 3 | 3.0 |
| `frontend/src/components/ScrollProgress.tsx` | 6 | 3.0 |
| `frontend/src/components/TableOfContents.tsx` | 6 | 3.0 |
| `frontend/src/components/ReadingTime.tsx` | 6 | 3.0 |
| `frontend/e2e/theme.spec.ts` | 8 | 3.0 |
| `frontend/e2e/bento-grid.spec.ts` | 8 | 3.0 |
| `frontend/e2e/reading-ux.spec.ts` | 8 | 3.0 |
| `api/app/models/user.py` | 10 | 3.1 |
| `api/app/schemas/user.py` | 11 | 3.1 |
| `api/app/services/auth_service.py` | 12 | 3.1 |
| `api/app/services/user_service.py` | 12 | 3.1 |
| `api/app/oauth.py` | 13 | 3.1 |
| `api/app/routers/auth.py` | 16 | 3.1 |
| `api/tests/test_auth_service.py` | 18 | 3.1 |
| `api/tests/test_auth.py` | 18 | 3.1 |
| `frontend/src/lib/auth.ts` | 19 | 3.1 |
| `frontend/src/contexts/AuthContext.tsx` | 19 | 3.1 |
| `frontend/src/app/login/page.tsx` | 19 | 3.1 |
| `frontend/src/app/auth/success/page.tsx` | 19 | 3.1 |
| `frontend/src/app/profile/page.tsx` | 19 | 3.1 |
| `frontend/e2e/auth.spec.ts` | 20 | 3.1 |
| `frontend/src/components/ContentTabs.tsx` | 24 | 3.2 |
| `frontend/src/components/PaywallBanner.tsx` | 24 | 3.2 |
| `frontend/src/components/PremiumBadge.tsx` | 24 | 3.2 |
| `api/tests/test_article_full.py` | 25 | 3.2 |
| `frontend/e2e/premium.spec.ts` | 25 | 3.2 |
| `api/app/services/billing_service.py` | 28 | 3.3 |
| `api/app/routers/billing.py` | 28 | 3.3 |
| `api/tests/test_billing.py` | 31 | 3.3 |
| `frontend/src/app/pricing/page.tsx` | 30 | 3.3 |
| `frontend/src/app/billing/success/page.tsx` | 30 | 3.3 |
| `frontend/e2e/pricing.spec.ts` | 31 | 3.3 |

### 変更ファイル (19)

| ファイル | Step | Phase |
|---------|------|-------|
| `frontend/src/app/layout.tsx` | 1, 2 | 3.0 |
| `frontend/src/app/globals.css` | 1, 2, 7 | 3.0 |
| `frontend/src/components/Header.tsx` | 3, 4, 19 | 3.0, 3.1 |
| `frontend/src/components/HeroSection.tsx` | 5 | 3.0 |
| `frontend/src/components/ArticleGrid.tsx` | 5 | 3.0 |
| `frontend/src/components/ArticleCard.tsx` | 5, 24 | 3.0, 3.2 |
| `frontend/src/components/ArticleListLive.tsx` | 5 | 3.0 |
| `frontend/src/components/Footer.tsx` | 7 | 3.0 |
| `frontend/src/components/ArticleImage.tsx` | 7 | 3.0 |
| `frontend/src/components/CategoryFilter.tsx` | 7 | 3.0 |
| `frontend/src/app/not-found.tsx` | 7 | 3.0 |
| `frontend/src/app/error.tsx` | 7 | 3.0 |
| `frontend/src/app/articles/[id]/page.tsx` | 6, 24 | 3.0, 3.2 |
| `frontend/package.json` | 2 | 3.0 |
| `api/requirements.txt` | 9, 26 | 3.1, 3.3 |
| `api/app/config.py` | 15, 26 | 3.1, 3.3 |
| `api/app/dependencies.py` | 14 | 3.1 |
| `api/app/main.py` | 17, 29 | 3.1, 3.3 |
| `api/pyproject.toml` | 17 | 3.1 |
| `api/app/models/article.py` | 21 | 3.2 |
| `api/app/models/user.py` | 27 | 3.3 |
| `api/app/schemas/article.py` | 22 | 3.2 |
| `api/app/services/article_service.py` | 22 | 3.2 |
| `api/app/routers/articles.py` | 23 | 3.2 |
| `frontend/src/lib/types.ts` | 19 | 3.1 |
| `frontend/src/lib/api.ts` | 19, 24 | 3.1, 3.2 |
| `frontend/src/app/profile/page.tsx` | 30 | 3.3 |
| `api/app/models/__init__.py` | 10 | 3.1 |

### その他変更

| ファイル | Step | Phase |
|---------|------|-------|
| `.env.example` | 15, 26 | 3.1, 3.3 |
| `.github/workflows/ci.yml` | 最終確認 | — |
| `api/alembic/versions/xxx_add_users_table.py` | 10 | 3.1 |
| `api/alembic/versions/xxx_add_is_premium.py` | 21 | 3.2 |
| `api/alembic/versions/xxx_add_stripe_columns.py` | 27 | 3.3 |
