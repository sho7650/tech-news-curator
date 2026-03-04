# Phase 3.1 設計書 — OAuth認証

> **Version**: 1.3
> **Date**: 2026-02-17
> **Status**: レビュー待ち
> **Base**: REQUIREMENTS-v2.0.md §2.11, §6, DESIGN-phase3.md §3
> **Scope**: Phase 3.1（OAuth認証 — Google, GitHub）

---

## 変更履歴

| Version | Date | 変更内容 |
|---------|------|----------|
| 1.0 | 2026-02-15 | 初版。DESIGN-phase3.md §3 を基に Phase 3.1 単独の詳細設計として再構成 |

---

## 1. 概要

### 1.1 目的

Phase 3.1 では OAuth 2.0 による外部プロバイダー認証（Google, GitHub）と JWT トークン管理を導入する。これは Phase 3.2（全文翻訳アクセス制御）と Phase 3.3（Stripe課金）の前提となる認証基盤である。

### 1.2 スコープ

**対象:**
- User ORM モデル + Alembic マイグレーション
- OAuth 2.0 Authorization Code Flow（Google, GitHub）
- JWT RS256 トークン（アクセス + リフレッシュ）
- 認証エンドポイント（login, callback, refresh, logout, users/me）
- 認証 Dependency（`get_current_user`, `get_current_user_optional`）
- SessionMiddleware（OAuth state管理用）
- フロントエンド認証UI（Login, AuthSuccess, Profile ページ）
- 認証状態管理（AuthContext）
- テスト

**対象外:**
- `is_premium` カラム追加（Phase 3.2）
- 全文翻訳エンドポイント（Phase 3.2）
- Stripe課金連携（Phase 3.3）

---

## 2. 技術スタック（Phase 3.1 追加分）

### 2.1 バックエンド追加パッケージ

| パッケージ | バージョン | requirements.txt 記法 | 用途 |
|-----------|-----------|---------------------|------|
| PyJWT[crypto] | 2.11.0 | `PyJWT[crypto]>=2.11.0,<3.0.0` | JWT RS256 エンコード/デコード |
| authlib | 1.6.7 | `authlib>=1.6.7,<2.0.0` | OAuth 2.0 クライアント（Google, GitHub） |
| itsdangerous | (authlib依存) | — | SessionMiddleware のセッション署名 |

> **PyJWT[crypto]**: `[crypto]` extras で `cryptography` パッケージが自動インストールされ、RS256 アルゴリズムが利用可能になる。`cryptography` を別途 requirements.txt に書かない（未使用依存と誤認されるリスク回避）。
> **出典**: [PyJWT Installation](https://pyjwt.readthedocs.io/en/stable/installation.html)

> **python-jose は使用しない**: python-jose は最終リリースから3年以上経過し、FastAPI 公式ドキュメントは PyJWT に移行済み。
> **出典**: [FastAPI Discussion #11345](https://github.com/fastapi/fastapi/discussions/11345), [FastAPI JWT Tutorial](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)

> **Authlib バージョン**: v1.6.7 は 2026-02-06 リリース。Python 3.10+ 対応（本プロジェクトは Python 3.12 のため問題なし）。Starlette 統合は `authlib.integrations.starlette_client` から import。
> **出典**: [Authlib PyPI](https://pypi.org/project/Authlib/), [Authlib Changelog](https://docs.authlib.org/en/latest/changelog.html)

### 2.2 バージョン互換性確認

| 依存 | 要件 | 現状 | 判定 |
|------|------|------|------|
| PyJWT 2.11.0 | Python >= 3.9 | Python 3.12 | OK |
| Authlib 1.6.7 | Python >= 3.10 | Python 3.12 | OK |
| Authlib 1.6.7 | Starlette >= 0.27 | FastAPI 0.128.x (Starlette ~0.40) | OK |
| PyJWT 2.11.0 | cryptography >= 3.4 | PyJWT[crypto] が自動解決 | OK |

---

## 3. 認証アーキテクチャ

### 3.1 全体フロー図

```
                    Next.js rewrite（既存）
                    /api/:path* → news-api:8100/:path*
┌─────────────┐         │           ┌──────────────┐     ┌─────────────┐
│  Browser     │─── /api/auth/* ───→│   API        │────→│  OAuth       │
│             │         │           │  (FastAPI)   │     │  Provider    │
│  /login     │         │           │  /auth/*     │     │  (Google/    │
│  /auth/     │←── 302 + cookie ───│  callback    │←────│   GitHub)    │
│   success   │         │           │              │     │              │
│  /profile   │         │           │              │     │              │
└─────────────┘                     └──────┬───────┘     └─────────────┘
                                           │
                                    ┌──────┴───────┐
                                    │  PostgreSQL  │
                                    │  users table │
                                    └──────────────┘
```

> ブラウザは `/api/auth/*` 経由で API にアクセス。`next.config.ts` の既存 rewrite ルール（変更不要）が `http://news-api:8100/auth/*` に透過プロキシ。Frontend ページ（`/login`, `/auth/success`, `/profile`）は Next.js ページルーティングで処理される。

### 3.2 URL ルーティング戦略

Phase 3.1 で追加する `/auth/*` のパスは、Frontend のページパス（`/auth/success`）と衝突し得る。Phase 2 で確立済みの Next.js rewrite パターンで解決する。

| 層 | パス例 | 処理者 |
|-----|---------|--------|
| ブラウザ → Frontend | `/login`, `/auth/success`, `/profile` | Next.js ページルーティング |
| ブラウザ → API（rewrite経由） | `/api/auth/google/login`, `/api/auth/refresh` | Next.js rewrite → FastAPI |
| Server Component → API（内部） | `${API_BASE}/auth/refresh` | Docker内部ネットワーク直接（`API_BASE` 経由） |

> **`API_BASE` の定義**: `frontend/src/lib/api.ts`（既存）で `const API_BASE = process.env.API_URL || 'http://news-api:8100'` として定義済み。このファイルは `import 'server-only'` により Server Component 専用であり、ブラウザには公開されない。Phase 3.1 で追加する Server Component 用関数（`refreshAccessToken()` / `getCurrentUser()`）も同じ `api.ts` に追加するため、同一の `API_BASE` を使用する。
>
> **Client Component からの API アクセス**: Client Component（AuthContext 等）は `api.ts`（`server-only`）を import できない。ブラウザからの API 呼び出しは Next.js rewrite 経由の相対パス（`/api/auth/refresh` 等）を `fetch()` で直接使用する。この Client 用ユーティリティは `frontend/src/lib/api.client.ts` に配置する（§15.6 参照）。
>
> **ローカル開発時の注意**: `API_BASE` のデフォルト値 `http://news-api:8100` は Docker Compose 内部ネットワーク前提。`npm run dev` でホスト直接実行する場合は `API_URL=http://localhost:8100` の設定が必須。`docker-compose.yml` の frontend サービスでは `API_URL` が設定済みのため、Docker 経由の開発・本番では追加設定不要。

**Next.js rewrite（既存設定 — 変更不要）:**

```typescript
// next.config.ts — 既存の rewrite ルール
async rewrites() {
  return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }]
}
```

> **衝突回避**: FastAPI 側のルートは `/auth/*`（プレフィックスなし）。ブラウザからは `/api/auth/*`（rewrite経由）でアクセス。Frontend ページ `/auth/success` は `/api/` を含まないため Next.js が処理する。

---

## 4. OAuth フロー詳細設計

### 4.1 Authorization Code Flow

```
1. ユーザーが「Googleでログイン」をクリック
   Browser → GET /api/auth/google/login
   （Next.js rewrite → API /auth/google/login）

2. API が Google の認可エンドポイントにリダイレクト
   API → authorize_redirect(request, redirect_uri)
   API → 302 → https://accounts.google.com/o/oauth2/auth?...
   ※ SessionMiddleware が state を session cookie に保存

3. ユーザーが Google で認証・同意
   Google → 302 → ${PUBLIC_URL}/api/auth/google/callback?code=xxx&state=yyy
   （Next.js rewrite → API /auth/google/callback）
   ※ ブラウザが session cookie を送信 → rewrite で API に転送

4. API がコールバックを処理
   API → authorize_access_token(request) → token exchange + userinfo 取得
   API → users テーブルに upsert（§4.3 アカウントリンク参照）
   API → JWT (access + refresh) を発行

5. API がリフレッシュトークンを httpOnly cookie に設定し、Frontend にリダイレクト
   API → Set-Cookie: refresh_token=xxx; HttpOnly; SameSite=Lax; Path=/; ...
   API → 302 → ${AUTH_REDIRECT_URL}（/auth/success）

6. Frontend がアクセストークンを取得
   Browser → POST /api/auth/refresh（cookie 自動送信 → rewrite で API に転送）
   API → refresh cookie を検証（token_version チェック含む）
   API → 新しいアクセストークンを JSON レスポンスで返却
   Frontend → アクセストークンをメモリ（React State）に保持
```

### 4.2 OAuth プロバイダー設定

#### 4.2.1 Authlib OAuth クライアント初期化

```python
# api/app/oauth.py（新規ファイル）

from authlib.integrations.starlette_client import OAuth

from app.config import settings

oauth = OAuth()

oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

oauth.register(
    name="github",
    client_id=settings.github_client_id,
    client_secret=settings.github_client_secret,
    authorize_url="https://github.com/login/oauth/authorize",
    access_token_url="https://github.com/login/oauth/access_token",
    api_base_url="https://api.github.com/",
    client_kwargs={"scope": "user:email"},
)
```

> **Google**: OpenID Connect 対応のため `server_metadata_url` で自動設定。`userinfo` は `authorize_access_token()` の戻り値の `token["userinfo"]` に含まれる。
> **GitHub**: OAuth 2.0 のみ対応のため URL を個別指定。`user:email` scope で `/user/emails` API へのアクセス権を取得。
> **出典**: [Authlib Starlette OAuth Client](https://docs.authlib.org/en/latest/client/starlette.html)

#### 4.2.2 OAuth プロバイダーへの登録

| プロバイダー | Authorized redirect URI |
|------------|------------------------|
| Google Cloud Console | `${PUBLIC_URL}/api/auth/google/callback` |
| GitHub OAuth App | `${PUBLIC_URL}/api/auth/github/callback` |

### 4.3 アカウントリンク戦略

**方針: verified email による自動リンク**

```
OAuthコールバック処理:

0. プロバイダーから verified email を取得
   → Google: userinfo.email（email_verified=true を確認）
   → GitHub: GET /user/emails API から verified=true かつ primary=true のメールを取得
   → verified email が取得できない場合: 403 Forbidden で中断（ユーザー登録しない）

1. oauth_provider + oauth_id で既存ユーザーを検索
   → 見つかった場合: そのユーザーでログイン

2. verified email で既存ユーザーを検索
   → 見つかった場合: 既存ユーザーでログイン（アカウント自動リンク）

3. 見つからない場合: 新規ユーザーを INSERT
```

> **verified email 以外ではリンクしない**: 未検証メールでのリンクはアカウント乗っ取りリスクがある。
> **出典**: [Auth0 Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)

### 4.4 Set-Cookie 属性設計

| 属性 | 値 | 理由 |
|------|-----|------|
| `HttpOnly` | 常時 | XSS によるトークン窃取を防止 |
| `SameSite` | `Lax` | CSRF 防止。OAuth リダイレクト（GET）で cookie が送信される必要があるため `Strict` は不可 |
| `Path` | `/` | Server Component が任意のページで `cookies()` API 経由で refresh_token を読み取る必要があるため |
| `Secure` | **本番のみ** | HTTPS 接続でのみ cookie を送信。開発環境（`http://localhost`）では付与しない |
| `Max-Age` | `604800` (7日) | リフレッシュトークンの有効期限と一致 |

```python
# api/app/services/auth_service.py 内のヘルパー関数

def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
        max_age=7 * 24 * 60 * 60,  # 7日
    )

def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )
```

> **`Path=/` の安全性**: `Path` はセキュリティ境界ではなく利便性の属性（[RFC 6265 §8.6](https://datatracker.ietf.org/doc/html/rfc6265#section-8.6)）。保護は `HttpOnly` + `Secure` + `SameSite` で担保。

---

## 5. JWT 設計

### 5.1 トークン仕様

| 項目 | アクセストークン | リフレッシュトークン |
|------|----------------|-------------------|
| アルゴリズム | RS256 | RS256 |
| 有効期限 | 15分 | 7日 |
| 格納場所 | メモリ（Frontend State） | httpOnly cookie |
| Payload | sub, exp, iat, iss, plan | sub, exp, iat, iss, type="refresh", ver |

> **出典**: [OWASP API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/) — アクセストークンは短命（15分以下）。

### 5.2 JWT Claims

**アクセストークン:**

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "exp": 1707840000,
  "iat": 1707839100,
  "iss": "tech-news-curator",
  "plan": "free"
}
```

**リフレッシュトークン:**

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "exp": 1708444800,
  "iat": 1707840000,
  "iss": "tech-news-curator",
  "type": "refresh",
  "ver": 0
}
```

> **`ver` クレーム**: `users.token_version` の発行時点の値。`POST /auth/refresh` 時に DB の現在値と照合し、不一致なら 401 を返却。ログアウト時に `token_version` をインクリメントすることで、全リフレッシュトークンを一括無効化する。

### 5.3 RSA 鍵管理

| 項目 | 仕様 |
|------|------|
| 鍵長 | 2048ビット以上 |
| 生成 | `openssl genrsa -out private.pem 2048` |
| 公開鍵抽出 | `openssl rsa -in private.pem -pubout -out public.pem` |
| 環境変数 | `JWT_PRIVATE_KEY`（PEM文字列）、`JWT_PUBLIC_KEY`（PEM文字列） |
| 本番管理 | Docker Secret または環境変数（改行は `\n` エスケープ） |

### 5.4 PyJWT RS256 API 使用方法

```python
import jwt
from datetime import datetime, timedelta, timezone

# --- エンコード（秘密鍵で署名） ---
payload = {
    "sub": str(user.id),
    "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    "iat": datetime.now(timezone.utc),
    "iss": "tech-news-curator",
    "plan": user.plan,
}
token = jwt.encode(payload, settings.jwt_private_key, algorithm="RS256")
# 戻り値: str（PyJWT 2.x 以降）

# --- デコード（公開鍵で検証） ---
decoded = jwt.decode(
    token,
    settings.jwt_public_key,
    algorithms=["RS256"],
    issuer="tech-news-curator",
    options={"require": ["sub", "exp", "iat", "iss"]},
)
# 戻り値: dict
```

> **`algorithms` パラメータは必須**: PyJWT 2.x では `algorithms` を明示しないとエラー。アルゴリズム混同攻撃を防止するため。
> **出典**: [PyJWT Usage Examples](https://pyjwt.readthedocs.io/en/stable/usage.html)

---

## 6. API エンドポイント設計

### 6.1 エンドポイント一覧

> 以下は FastAPI 側のルート定義。ブラウザからは `/api/auth/*` 経由でアクセス（§3.2 参照）。

| Method | Path（FastAPI側） | ブラウザ側 | Auth | Rate Limit | Description |
|--------|-------------------|-----------|------|-----------|-------------|
| GET | `/auth/google/login` | `/api/auth/google/login` | なし | 10/minute | Google OAuth 認可URLへリダイレクト |
| GET | `/auth/google/callback` | `/api/auth/google/callback` | なし | 10/minute | Google コールバック処理 → cookie設定 + リダイレクト |
| GET | `/auth/github/login` | `/api/auth/github/login` | なし | 10/minute | GitHub OAuth 認可URLへリダイレクト |
| GET | `/auth/github/callback` | `/api/auth/github/callback` | なし | 10/minute | GitHub コールバック処理 → cookie設定 + リダイレクト |
| POST | `/auth/refresh` | `/api/auth/refresh` | Refresh Cookie | 30/minute | アクセストークン再発行（token_version 検証含む） |
| POST | `/auth/logout` | `/api/auth/logout` | Refresh Cookie | 10/minute | token_version インクリメント + cookie 削除 |
| GET | `/users/me` | `/api/users/me` | JWT Bearer | 60/minute | ログインユーザー情報 |

### 6.2 レート制限方針

既存エンドポイントと同様、`slowapi` の `@limiter.limit` デコレータで IP ベース（`get_remote_address`）の制限を適用。

| カテゴリ | Rate Limit | 根拠 |
|---------|-----------|------|
| OAuth login/callback | 10/minute | OAuth リダイレクトの乱用防止。正常利用ではログインは低頻度 |
| `/auth/refresh` | 30/minute | ページ読み込み・タブ復帰時に呼ばれるため高めに設定。既存 `POST /articles`（30/min）と同等 |
| `/auth/logout` | 10/minute | 低頻度操作 |
| `/users/me` | 60/minute | 既存の読み取り系（`GET /articles`）と同等 |

### 6.3 エンドポイント詳細

#### 6.3.1 GET /auth/{provider}/login

```python
@router.get("/auth/{provider}/login")
@limiter.limit("10/minute")
async def oauth_login(request: Request, provider: str):
    if provider not in ("google", "github"):
        raise HTTPException(status_code=404, detail="Unknown provider")
    client = oauth.create_client(provider)
    redirect_uri = f"{settings.public_url}/api/auth/{provider}/callback"
    return await client.authorize_redirect(request, redirect_uri)
```

**処理:**
1. プロバイダー名を検証
2. Authlib の `authorize_redirect()` で OAuth 認可 URL にリダイレクト
3. `SessionMiddleware` が state パラメータをセッション cookie に自動保存

#### 6.3.2 GET /auth/{provider}/callback

```
処理フロー:
1. authorize_access_token(request) でトークン交換 + state 検証
2. プロバイダーからユーザー情報取得:
   - Google: token["userinfo"] から email, name, picture
   - GitHub: GET /user + GET /user/emails
3. verified email の確認（§4.3 参照）
   → verified email がない場合: 403 Forbidden
4. ユーザー upsert（oauth_provider + oauth_id → email リンク → 新規作成）
5. JWT（access + refresh）を生成
6. Set-Cookie: refresh_token=... を設定
7. 302 リダイレクト → AUTH_REDIRECT_URL（/auth/success）
```

**GitHub のメール取得:**

```python
token = await oauth.github.authorize_access_token(request)
# GitHub API でユーザー情報を取得
resp = await oauth.github.get("user", token=token)
github_user = resp.json()

# verified primary email を取得
emails_resp = await oauth.github.get("user/emails", token=token)
emails = emails_resp.json()
verified_email = next(
    (e["email"] for e in emails if e["verified"] and e["primary"]),
    None,
)
if not verified_email:
    raise HTTPException(
        status_code=403,
        detail="GitHubアカウントに検証済みのメールアドレスが設定されていません。",
    )
```

#### 6.3.3 POST /auth/refresh

```
処理:
1. Request の Cookie ヘッダーから refresh_token を取得
   → 無い場合: 401 Unauthorized
2. PyJWT で RS256 デコード（algorithms=["RS256"], issuer 検証, type="refresh" 検証）
   → 失敗（期限切れ、署名不正等）: 401 Unauthorized
3. sub claim でユーザーを DB から取得
   → 見つからない場合: 401 Unauthorized
4. ver claim と users.token_version を照合
   → 不一致: 401 Unauthorized（ログアウト後のトークン再利用を拒否）
5. 新しいアクセストークンを生成
6. JSON レスポンスで返却: {"access_token": "...", "token_type": "bearer"}
```

#### 6.3.4 POST /auth/logout

```
処理:
1. Request の Cookie ヘッダーから refresh_token を取得 → デコード → sub claim
2. users.token_version を +1 にインクリメント
   → 当該ユーザーの全既存リフレッシュトークンが無効化
3. Set-Cookie: refresh_token=; Max-Age=0; Path=/ で cookie を削除
4. 204 No Content を返却
```

#### 6.3.5 GET /users/me

```
処理:
1. Authorization: Bearer <token> ヘッダーからアクセストークン取得
2. PyJWT で RS256 デコード → sub claim → DB からユーザー取得
3. UserResponse スキーマで返却
```

---

## 7. DB スキーマ設計

### 7.1 users テーブル — ORM モデル

```
ファイル: api/app/models/user.py（新規）
```

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, default=uuid4 | 主キー |
| email | String(254) | NOT NULL | メールアドレス（UNIQUE制約なし — §7.2 参照） |
| display_name | String(100) | | 表示名 |
| avatar_url | Text | | プロフィール画像URL |
| oauth_provider | String(20) | NOT NULL | "google" / "github" |
| oauth_id | String(100) | NOT NULL | プロバイダー側のユーザーID |
| plan | String(20) | NOT NULL, default="free" | "free" / "premium" / "pro" |
| token_version | Integer | NOT NULL, default=0 | リフレッシュトークン世代番号 |
| is_active | Boolean | default=True | 有効フラグ |
| created_at | DateTime(timezone=True) | server_default=now() | 作成日時（UTC） |
| updated_at | DateTime(timezone=True) | server_default=now(), onupdate=now() | 更新日時（UTC） |

**SQLAlchemy 2.0 ORM モデル:**

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    oauth_provider: Mapped[str] = mapped_column(String(20), nullable=False)
    oauth_id: Mapped[str] = mapped_column(String(100), nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False, default="free")
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("oauth_provider", "oauth_id", name="uq_users_oauth"),
    )
```

### 7.2 email に UNIQUE 制約を付けない理由

同一メールアドレスで Google と GitHub の両方から OAuth ログインされるケースが存在する。`email` に UNIQUE 制約があると、2つ目のプロバイダーでの登録が失敗する。代わりに `(oauth_provider, oauth_id)` の複合ユニーク制約で一意性を保証する。

### 7.3 Pydantic スキーマ

```
ファイル: api/app/schemas/user.py（新規）
```

| スキーマ | 用途 | フィールド |
|---------|------|-----------|
| UserResponse | GET /users/me レスポンス | id, email, display_name, avatar_url, plan, created_at |
| TokenResponse | POST /auth/refresh レスポンス | access_token, token_type="bearer" |

```python
import uuid
from datetime import datetime
from typing import Optional

from app.schemas import AppBaseModel


class UserResponse(AppBaseModel):
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    plan: str
    created_at: datetime


class TokenResponse(AppBaseModel):
    access_token: str
    token_type: str = "bearer"
```

### 7.4 Alembic マイグレーション

```
ファイル: api/alembic/versions/xxx_add_users_table.py
```

```python
def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False, default=uuid.uuid4),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("oauth_provider", sa.String(20), nullable=False),
        sa.Column("oauth_id", sa.String(100), nullable=False),
        sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("oauth_provider", "oauth_id", name="uq_users_oauth"),
    )

def downgrade() -> None:
    op.drop_table("users")
```

**`alembic/env.py` の変更:**

```python
# 既存の import に User を追加
from app.models import Article, Digest, Source  # noqa: F401
from app.models.user import User  # noqa: F401  ← Phase 3.1 追加
```

**`api/app/models/__init__.py` の変更:**

```python
from app.models.article import Article
from app.models.digest import Digest
from app.models.source import Source
from app.models.user import User  # Phase 3.1

__all__ = ["Article", "Digest", "Source", "User"]
```

---

## 8. 認証 Dependency 設計

### 8.1 HTTPBearer 方式

```
ファイル: api/app/dependencies.py（既存ファイルに追加）
```

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """JWT検証 → ユーザー取得。未認証時は401。"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    # auth_service.verify_access_token(token) → sub → DB lookup
    ...


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """JWT検証 → ユーザー取得。未認証時はNone（公開エンドポイント用）。"""
    if credentials is None:
        return None
    # auth_service.verify_access_token(token) → sub → DB lookup → 失敗時 None
    ...
```

> **`OAuth2PasswordBearer` を使用しない理由**: `OAuth2PasswordBearer(tokenUrl=...)` は Resource Owner Password Credentials Grant 用。本プロジェクトではパスワード認証エンドポイントが存在しないため `HTTPBearer` を使用する。`HTTPBearer` は OpenAPI ドキュメントに Bearer トークン入力欄を表示する。
> **出典**: [FastAPI Security Reference](https://fastapi.tiangolo.com/reference/security/)

> **`auto_error=False` の理由**: FastAPI の最近の変更で security classes は missing credentials 時に 401 を返すようになった（PR #13786）。`auto_error=False` にすることで `None` を返し、`get_current_user_optional` での任意認証パターンを実現する。

---

## 9. SessionMiddleware 設計

### 9.1 main.py への追加

```python
from starlette.middleware.sessions import SessionMiddleware

# Middleware order (Starlette LIFO):
# CORSMiddleware → SecurityHeaders → SlowAPI → SessionMiddleware
# SessionMiddleware は最も内側（最後に追加）
app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
```

**ミドルウェアスタック（Phase 3.1 後）:**

```
Request → CORSMiddleware → SecurityHeaders → SlowAPI → SessionMiddleware → Router
```

> **SessionMiddleware の目的**: OAuth フローの state パラメータ保存のみ。ユーザー認証は JWT で行う。Authlib が `request.session` にstateを保存するために必須。
> **出典**: [Authlib Starlette OAuth Client](https://docs.authlib.org/en/latest/client/starlette.html)

### 9.2 SESSION_SECRET

- `SessionMiddleware` のセッション cookie 署名に使用
- `itsdangerous` パッケージで署名（Starlette の依存として自動インストール）
- 本番環境: `openssl rand -hex 32` で生成した 64 文字の hex 文字列を推奨

---

## 10. Settings 拡張

### 10.1 追加環境変数

```
ファイル: api/app/config.py（既存ファイルに追加）
```

| 環境変数 | 型 | デフォルト | 必須 | 説明 |
|---------|-----|----------|------|------|
| `GOOGLE_CLIENT_ID` | str | `""` | Phase 3.1 | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | str | `""` | Phase 3.1 | Google OAuth Client Secret |
| `GITHUB_CLIENT_ID` | str | `""` | Phase 3.1 | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | str | `""` | Phase 3.1 | GitHub OAuth Client Secret |
| `JWT_PRIVATE_KEY` | str | `""` | Phase 3.1 | RSA 秘密鍵（PEM形式） |
| `JWT_PUBLIC_KEY` | str | `""` | Phase 3.1 | RSA 公開鍵（PEM形式） |
| `SESSION_SECRET` | str | `""` | Phase 3.1 | SessionMiddleware 用シークレット |
| `AUTH_REDIRECT_URL` | str | `"http://localhost:3100/auth/success"` | Phase 3.1 | OAuth 成功後のリダイレクト先 |

### 10.2 Settings クラス変更

```python
class Settings(BaseSettings):
    # ... 既存フィールド ...

    # Phase 3.1: OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    github_client_id: str = ""
    github_client_secret: str = ""

    # Phase 3.1: JWT
    jwt_private_key: str = ""
    jwt_public_key: str = ""

    # Phase 3.1: Session
    session_secret: str = ""

    # Phase 3.1: Auth
    auth_redirect_url: str = "http://localhost:3100/auth/success"

    def validate_production(self) -> None:
        # ... 既存の検証 ...

        # Phase 3.1: OAuth + JWT の本番検証
        if not self.jwt_private_key or not self.jwt_public_key:
            raise ValueError("JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production.")
        if not self.session_secret:
            raise ValueError("SESSION_SECRET must be set in production.")
```

### 10.3 AUTH_REDIRECT_URL の制約

`AUTH_REDIRECT_URL` は `PUBLIC_URL` と**同一オリジン**でなければならない。

| PUBLIC_URL | AUTH_REDIRECT_URL | 動作 |
|-----------|-------------------|------|
| `http://localhost:3100` | `http://localhost:3100/auth/success` | OK |
| `https://news.example.com` | `https://news.example.com/auth/success` | OK |
| `https://news.example.com` | `https://other.example.com/auth/success` | **NG** — cookie が送信されず認証失敗 |

> **理由**: OAuth コールバック時に API が `Set-Cookie` を設定する。cookie のドメインは `PUBLIC_URL` のドメインになる（Next.js rewrite 経由）。`AUTH_REDIRECT_URL` が異なるオリジンの場合、cookie が送信されない。

---

## 11. CORS 設定変更

### 11.1 allow_methods への追加

現在の `main.py` の CORSMiddleware 設定:

```python
allow_methods=["GET", "POST", "PUT", "DELETE"],
```

Phase 3.1 では変更不要。`POST` メソッドは既に許可されており、`/auth/refresh` と `/auth/logout` は `POST` を使用する。

### 11.2 allow_headers への確認

```python
allow_headers=["Content-Type", "Accept", "X-API-Key"],
```

Phase 3.1 で `Authorization` ヘッダーの追加が**必要**:

```python
allow_headers=["Content-Type", "Accept", "X-API-Key", "Authorization"],
```

> **理由**: `GET /users/me` 等の JWT 認証エンドポイントは `Authorization: Bearer <token>` ヘッダーを使用。ブラウザからの CORS プリフライトリクエストで `Authorization` が許可されていないと 403 になる。

---

## 12. SecurityHeadersMiddleware 変更

### 12.1 CSP スキップパスの追加

OAuth コールバックエンドポイントは外部プロバイダーからのリダイレクト受信時に動作するため、CSP の `default-src 'none'` が問題になる場合がある。ただし、コールバックは即座に `302` リダイレクトを返すため、**CSP スキップは不要**。

変更なし。

---

## 13. サービス層設計

### 13.1 auth_service.py

```
ファイル: api/app/services/auth_service.py（新規）
```

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `create_access_token(user)` | User | str | アクセストークン生成（RS256, 15分） |
| `create_refresh_token(user)` | User | str | リフレッシュトークン生成（RS256, 7日, ver含む） |
| `verify_access_token(token)` | str | dict | アクセストークン検証 → payload 返却。失敗時は例外 |
| `verify_refresh_token(token)` | str | dict | リフレッシュトークン検証 → payload 返却。失敗時は例外 |
| `set_refresh_cookie(response, token)` | Response, str | None | httpOnly cookie 設定 |
| `clear_refresh_cookie(response)` | Response | None | cookie 削除 |

### 13.2 user_service.py

```
ファイル: api/app/services/user_service.py（新規）
```

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `get_user_by_id(session, user_id)` | AsyncSession, UUID | User \| None | ID でユーザー取得 |
| `get_user_by_oauth(session, provider, oauth_id)` | AsyncSession, str, str | User \| None | OAuth ID でユーザー取得 |
| `get_user_by_email(session, email)` | AsyncSession, str | User \| None | メールでユーザー取得 |
| `upsert_user(session, provider, oauth_id, email, display_name, avatar_url)` | AsyncSession, ... | User | ユーザー upsert（§4.3 のロジック） |
| `increment_token_version(session, user)` | AsyncSession, User | None | token_version を +1 |

---

## 14. ファイル構成（Phase 3.1 追加・変更分）

### 14.1 バックエンド

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `api/app/models/user.py` | **新規** | User ORM モデル |
| `api/app/models/__init__.py` | 修正 | User import 追加 |
| `api/app/schemas/user.py` | **新規** | UserResponse, TokenResponse |
| `api/app/routers/auth.py` | **新規** | OAuth + JWT エンドポイント |
| `api/app/routers/users.py` | **新規** | GET /users/me エンドポイント |
| `api/app/services/auth_service.py` | **新規** | JWT 生成/検証、cookie 操作 |
| `api/app/services/user_service.py` | **新規** | ユーザー CRUD |
| `api/app/oauth.py` | **新規** | Authlib OAuth クライアント設定 |
| `api/app/config.py` | 修正 | 新規環境変数追加、本番検証拡張 |
| `api/app/dependencies.py` | 修正 | `get_current_user`, `get_current_user_optional` 追加 |
| `api/app/main.py` | 修正 | SessionMiddleware、auth/users router 登録、CORS Authorization ヘッダー |
| `api/app/middleware.py` | 変更なし | — |
| `api/alembic/env.py` | 修正 | User モデル import 追加 |
| `api/alembic/versions/xxx_add_users_table.py` | **新規** | users テーブルマイグレーション |
| `api/requirements.txt` | 修正 | PyJWT[crypto], authlib 追加 |

### 14.2 フロントエンド

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `frontend/src/app/login/page.tsx` | **新規** | ログインページ（Google, GitHub ボタン） |
| `frontend/src/app/auth/success/page.tsx` | **新規** | OAuth 成功後処理（Client Component） |
| `frontend/src/app/profile/page.tsx` | **新規** | プロフィールページ（Server Component） |
| `frontend/src/components/Header.tsx` | 修正 | ログインボタン / アバター表示 |
| `frontend/src/components/UserMenu.tsx` | **新規** | ユーザードロップダウンメニュー（Client Component） |
| `frontend/src/contexts/AuthContext.tsx` | **新規** | 認証状態管理（Context + Provider） |
| `frontend/src/lib/api.ts` | 修正 | Server Component 用認証関数追加 |
| `frontend/src/lib/api.client.ts` | **新規** | Client Component 用認証関数（AuthContext から使用） |
| `frontend/src/lib/types.ts` | 修正 | User, TokenResponse 型追加 |
| `frontend/next.config.ts` | 変更なし | 既存 rewrite ルールで対応済み |

---

## 15. フロントエンド設計

### 15.1 AuthContext（認証状態管理）

```
ファイル: frontend/src/contexts/AuthContext.tsx（新規、Client Component）
```

> **`server-only` 制約**: AuthContext は Client Component のため、`frontend/src/lib/api.ts`（`import 'server-only'`）を import できない。API 呼び出しには `frontend/src/lib/api.client.ts`（§15.6 参照）の関数を使用する。URL は Next.js rewrite 経由の相対パス（`/api/auth/refresh` 等）。

| State | 型 | 初期値 | 説明 |
|-------|-----|--------|------|
| accessToken | string \| null | null | メモリ上のアクセストークン |
| user | User \| null | null | ログインユーザー情報 |
| isLoading | boolean | true | 初期化中フラグ |

**初期化フロー:**

```
1. マウント時に POST /api/auth/refresh を試行（cookie が自動送信される）
   → 成功: accessToken をセット
   → 失敗（401）: 未ログイン状態のまま → 3 へ
2. GET /api/users/me（Authorization: Bearer {accessToken}）でユーザー情報取得
   → 成功: user をセット
   → 失敗（401）: accessToken / user をクリア（不正トークン）
3. isLoading を false に設定
```

> `/auth/refresh` の `TokenResponse` は `access_token` のみを返却する（§8 参照）。ユーザー情報は別途 `GET /users/me` で取得する設計とし、レスポンス肥大化を防ぐ。
> 上記すべての `fetch` 呼び出しは `api.client.ts` の関数経由で行い、`api.ts`（`server-only`）は使用しない。

**提供する関数:**

| 関数 | 説明 |
|------|------|
| `login(provider)` | `window.location.href = /api/auth/{provider}/login` でリダイレクト |
| `logout()` | POST /api/auth/logout → state クリア → / にリダイレクト |
| `getAccessToken()` | 現在のトークンを返す。期限切れ時は自動リフレッシュ |

### 15.2 ログインページ

```
ファイル: frontend/src/app/login/page.tsx（Server Component）
```

- 「Googleでログイン」ボタン → `<a href="/api/auth/google/login">`
- 「GitHubでログイン」ボタン → `<a href="/api/auth/github/login">`
- テーマ対応のデザイン（bg-bg-card, text-text-primary）
- ログイン済みの場合は `/profile` にリダイレクト

> **`<a>` タグを使用する理由**: OAuth login エンドポイントは 302 リダイレクトを返す。`fetch()` ではブラウザのリダイレクトを処理できないため、通常のリンクナビゲーションを使用する。

### 15.3 AuthSuccess ページ

```
ファイル: frontend/src/app/auth/success/page.tsx（Client Component）
```

**処理フロー:**

```
1. マウント時に AuthContext の refreshToken 処理が自動実行
2. ユーザー情報取得完了を待機
3. 成功: / (ホーム) にリダイレクト
4. 失敗: エラーメッセージ表示 + /login へのリンク
```

### 15.4 プロフィールページ

```
ファイル: frontend/src/app/profile/page.tsx（Server Component）
```

**Server Component での認証チェック:**

```typescript
import { cookies } from 'next/headers'

export default async function ProfilePage() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get('refresh_token')?.value

  if (!refreshToken) {
    redirect('/login')
  }

  // Server Component から内部 API 経由でトークン取得
  const tokenRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: `refresh_token=${refreshToken}` },
    cache: 'no-store',
  })

  if (!tokenRes.ok) {
    redirect('/login')
  }

  const { access_token } = await tokenRes.json()

  // ユーザー情報取得
  const userRes = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${access_token}` },
    cache: 'no-store',
  })
  const user = await userRes.json()

  return <ProfileContent user={user} />
}
```

> **`cache: "no-store"` を明示指定する理由**: `cookies()` 呼び出しによりページは dynamic rendering になるが、意図の明示・リファクタリング耐性・コードレビュー容易性のために明示的に指定する。
> **出典**: [Next.js Caching: Dynamic APIs](https://nextjs.org/docs/app/building-your-application/caching#dynamic-apis)

### 15.5 ヘッダー変更

| 状態 | 表示 |
|------|------|
| 未ログイン | 「ログイン」ボタン（→ /login） |
| ログイン済み | アバター画像 + ドロップダウン（プロフィール、ログアウト） |

**Header.tsx の変更方針:**

- Header は Server Component のまま維持
- ログインボタン / UserMenu 部分を Client Component として分離
- AuthContext を使用して認証状態を表示

### 15.6 API クライアント拡張

Phase 3.1 では Server Component 用と Client Component 用の2つのモジュールに認証関連関数を追加する。

#### 15.6.1 Server Component 用（既存ファイルに追加）

```
ファイル: frontend/src/lib/api.ts（既存、import 'server-only'）
```

> `API_BASE` は同ファイル内で定義済み（`process.env.API_URL || 'http://news-api:8100'`）。§3.2 参照。

| 関数 | URL | 認証 | cache | 用途 |
|------|-----|------|-------|------|
| `refreshAccessToken(cookieHeader)` | `${API_BASE}/auth/refresh` | Cookie 転送 | `"no-store"` | Server Component からトークン再取得 |
| `getCurrentUser(accessToken)` | `${API_BASE}/users/me` | `Bearer` | `"no-store"` | Server Component からユーザー情報取得 |

#### 15.6.2 Client Component 用（新規）

```
ファイル: frontend/src/lib/api.client.ts（新規、ブラウザ実行用）
```

> Client Component は `api.ts`（`import 'server-only'`）を import できない。ブラウザからの API 呼び出しは Next.js rewrite 経由の相対パス（`/api/...`）を使用する。このファイルに `'server-only'` は含めない。

| 関数 | URL | 認証 | 用途 |
|------|-----|------|------|
| `clientRefreshToken()` | `/api/auth/refresh` | Cookie（自動送信） | AuthContext 初期化・トークン再取得 |
| `clientGetCurrentUser(accessToken)` | `/api/users/me` | `Bearer` | AuthContext ユーザー情報取得 |
| `clientLogout()` | `/api/auth/logout` | Cookie（自動送信） | ログアウト |

### 15.7 型定義追加

```
ファイル: frontend/src/lib/types.ts（既存ファイルに追加）
```

```typescript
export interface User {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  plan: string
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}
```

---

## 16. CSRF 防御戦略

### 16.1 SameSite=Lax による防御

`SameSite=Lax` の cookie は、クロスサイトの `POST` リクエストでは送信されない（[RFC 6265bis §5.3.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-12#section-5.3.7)）。

| 呼び出し元 | Origin ヘッダー | Cookie送信 | CSRF リスク |
|-----------|----------------|-----------|------------|
| ブラウザ（同一サイト POST） | 付与される | `SameSite=Lax` で送信 | なし |
| ブラウザ（クロスサイト POST） | 付与される | `SameSite=Lax` で **不送信** | なし |
| Server Component（内部API） | 付与されない | 明示的 Cookie ヘッダー転送 | なし |

### 16.2 Origin ヘッダー検証を追加しない理由

Server Component は `cookies()` API で取得した refresh_token を明示的に `Cookie` ヘッダーとして内部 API（`http://news-api:8100`）に転送する。この呼び出しには `Origin` ヘッダーが付与されない。`Origin` 検証を追加すると、この正当な内部呼び出しが拒否される。

> **出典**: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#samesite-cookie-attribute)

---

## 17. Docker / インフラ変更

### 17.1 docker-compose.dev.yml への追加

開発用環境変数:

```yaml
news-api:
  environment:
    # ... 既存 ...
    # Phase 3.1: OAuth（開発用ダミー値、実際の値は .env で上書き）
    GOOGLE_CLIENT_ID: ""
    GOOGLE_CLIENT_SECRET: ""
    GITHUB_CLIENT_ID: ""
    GITHUB_CLIENT_SECRET: ""
    JWT_PRIVATE_KEY: ""
    JWT_PUBLIC_KEY: ""
    SESSION_SECRET: "dev-session-secret-change-in-production"
    AUTH_REDIRECT_URL: "http://localhost:3100/auth/success"
```

### 17.2 .env.example への追加

```
# Phase 3.1: OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Phase 3.1: JWT (generate with: openssl genrsa -out private.pem 2048)
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=

# Phase 3.1: Session
SESSION_SECRET=

# Phase 3.1: Auth
AUTH_REDIRECT_URL=http://localhost:3100/auth/success
```

---

## 18. セキュリティ考慮事項

### 18.1 JWT セキュリティ

| リスク | 対策 |
|--------|------|
| トークン漏洩 | アクセストークンはメモリのみ、リフレッシュは httpOnly cookie |
| トークン偽造 | RS256（非対称鍵）で署名。公開鍵のみでは偽造不可 |
| リプレイ攻撃 | `exp` クレームで有効期限を強制 |
| トークン無効化 | `token_version` による世代管理。ログアウト時に一括失効 |
| XSS | httpOnly cookie（JavaScript からアクセス不可）、CSP ヘッダー |
| CSRF | `SameSite=Lax` cookie（§16 参照） |
| アルゴリズム混同 | `jwt.decode()` に `algorithms=["RS256"]` を明示指定 |
| 部分的 issuer マッチ | PyJWT 2.10.1 で修正済み（GHSA-75c5-xw7c-p5pm） |

### 18.2 OAuth セキュリティ

| リスク | 対策 |
|--------|------|
| CSRF | OAuth state パラメータ（Authlib が SessionMiddleware 経由で自動管理） |
| オープンリダイレクト | `AUTH_REDIRECT_URL` を環境変数で固定 |
| トークン漏洩 | OAuth トークンはサーバー側のみで処理。フロントエンドに渡さない |
| 未検証メールによるアカウント乗っ取り | verified email のみでアカウントリンク（§4.3 参照） |

---

## 19. テスト戦略

### 19.1 テストケース一覧

| テスト種別 | 対象 | テストケース | 件数 |
|-----------|------|------------|------|
| 単体テスト | `auth_service.create_access_token` | 正常系（payload 確認） | 1 |
| 単体テスト | `auth_service.verify_access_token` | 正常系、期限切れ、署名不正、issuer 不正 | 3 |
| 単体テスト | `auth_service.create_refresh_token` | 正常系（ver クレーム確認） | 1 |
| 単体テスト | `auth_service.verify_refresh_token` | 正常系、type クレーム不正 | 2 |
| 単体テスト | `user_service.upsert_user` | 新規作成、oauth_id 一致、email リンク | 3 |
| 統合テスト | `GET /auth/google/login` | リダイレクト先の確認 | 1 |
| 統合テスト | `GET /auth/google/callback` | 正常フロー（OAuth モック）、verified email なし | 2 |
| 統合テスト | `GET /auth/github/callback` | 正常フロー（OAuth モック）、verified email なし→403 | 2 |
| 統合テスト | `POST /auth/refresh` | 正常系、cookie なし→401、token_version 不一致→401 | 3 |
| 統合テスト | `POST /auth/logout` | 正常系（cookie 削除 + token_version 確認） | 1 |
| 統合テスト | `GET /users/me` | 正常系、未認証→401 | 2 |
| E2E (Playwright) | ログインフロー | Google/GitHub ボタン表示確認 | 1 |
| E2E (Playwright) | プロフィールページ | 未認証時リダイレクト確認 | 1 |

### 19.2 テスト件数集計

| 種別 | 件数 |
|------|------|
| 単体テスト | 10 |
| 統合テスト | 11 |
| E2E テスト | 2 |
| **合計** | **23** |

### 19.3 テスト方針

**OAuth モック:**

統合テストでは実際の OAuth プロバイダーにアクセスしない。`oauth.google.authorize_access_token` をモックして、固定のユーザー情報を返す。

```python
# テスト用のモックパターン
from unittest.mock import AsyncMock, patch

@patch("app.routers.auth.oauth")
async def test_google_callback(mock_oauth, client, db_session):
    mock_google = mock_oauth.create_client.return_value
    mock_google.authorize_access_token = AsyncMock(return_value={
        "userinfo": {
            "sub": "google-123",
            "email": "test@example.com",
            "email_verified": True,
            "name": "Test User",
            "picture": "https://example.com/avatar.jpg",
        }
    })
    # ...
```

**JWT テスト用鍵:**

テスト conftest.py でテスト用の RSA 鍵ペアを生成し、`settings` をオーバーライド:

```python
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

@pytest.fixture(scope="session")
def rsa_keys():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem
```

**conftest.py への変更:**

```python
# 既存の client fixture を拡張
settings.jwt_private_key = private_pem
settings.jwt_public_key = public_pem
settings.session_secret = "test-session-secret"
```

---

## 20. 実装順序

```
Phase 3.1 — OAuth認証

Step 1: requirements.txt に PyJWT[crypto] と authlib を追加
Step 2: Alembic マイグレーション — users テーブル作成
Step 3: User ORM モデル（api/app/models/user.py）
Step 4: User Pydantic スキーマ（api/app/schemas/user.py）
Step 5: config.py — 新規環境変数追加
Step 6: auth_service.py — JWT 生成/検証、cookie 操作
Step 7: user_service.py — ユーザー CRUD
Step 8: oauth.py — Authlib OAuth クライアント設定
Step 9: routers/auth.py — OAuth + JWT エンドポイント
Step 10: routers/users.py — GET /users/me
Step 11: dependencies.py — get_current_user, get_current_user_optional
Step 12: main.py — SessionMiddleware、router 登録、CORS 変更
Step 13: 単体テスト（auth_service, user_service）
Step 14: 統合テスト（auth, users エンドポイント）
Step 15: フロントエンド — types.ts, api.ts 拡張
Step 16: フロントエンド — AuthContext
Step 17: フロントエンド — Login ページ
Step 18: フロントエンド — AuthSuccess ページ
Step 19: フロントエンド — Profile ページ
Step 20: フロントエンド — Header 変更（ログインボタン / UserMenu）
Step 21: E2E テスト
Step 22: .env.example, docker-compose.dev.yml 更新
```

---

## 21. 参考文献

### 認証・セキュリティ

| 文書 | URL |
|------|-----|
| FastAPI JWT Tutorial (PyJWT) | https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ |
| PyJWT RS256 Usage | https://pyjwt.readthedocs.io/en/stable/usage.html |
| PyJWT API Reference | https://pyjwt.readthedocs.io/en/stable/api.html |
| PyJWT Installation (crypto extras) | https://pyjwt.readthedocs.io/en/stable/installation.html |
| FastAPI python-jose → PyJWT 移行 | https://github.com/fastapi/fastapi/discussions/11345 |
| FastAPI Security Reference | https://fastapi.tiangolo.com/reference/security/ |
| Authlib Starlette OAuth Client | https://docs.authlib.org/en/latest/client/starlette.html |
| Authlib FastAPI OAuth Client | https://docs.authlib.org/en/latest/client/fastapi.html |
| Authlib Changelog | https://docs.authlib.org/en/latest/changelog.html |
| OWASP API2:2023 Broken Authentication | https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ |
| OWASP CSRF Prevention Cheat Sheet | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html |
| Auth0 Account Linking | https://auth0.com/docs/manage-users/user-accounts/user-account-linking |
| RFC 6749 — OAuth 2.0 | https://datatracker.ietf.org/doc/html/rfc6749 |
| RFC 6265 — HTTP Cookies | https://datatracker.ietf.org/doc/html/rfc6265 |
| RFC 6265bis — SameSite | https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-12 |

### Next.js

| 文書 | URL |
|------|-----|
| Next.js Caching: Dynamic APIs | https://nextjs.org/docs/app/building-your-application/caching#dynamic-apis |
| Next.js cookies() API | https://nextjs.org/docs/app/api-reference/functions/cookies |
