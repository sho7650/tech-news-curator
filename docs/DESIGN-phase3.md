# Phase 3 設計書 — DESIGN-phase3.md

> **Version**: 1.6
> **Date**: 2026-02-13
> **Status**: レビュー待ち
> **Base**: REQUIREMENTS-v2.0.md, REQUIREMENTS-phase3-brainstorm.md
> **Scope**: Phase 3.0〜3.3（UI刷新 + 収益化）

---

## 変更履歴

| Version | Date | 変更内容 |
|---------|------|----------|
| 1.0 | 2026-02-13 | 初版（Phase 3.0〜3.3 全体設計） |
| 1.1 | 2026-02-13 | レビュー修正: OAuth cookie方式、premium bypass防止、auth contradiction解消、Server Component token flow、アカウントリンク戦略、HTTPBearer変更 |
| 1.2 | 2026-02-13 | レビュー修正: URL routing戦略（/api prefix）、token_version失効、CSRF防御明確化、verified email未取得時挙動、Set-Cookie属性テーブル追加 |
| 1.3 | 2026-02-14 | レビュー修正: ブラウザ側パス `/api/auth/refresh` 統一、アーキテクチャ図更新、Server Component fetch cache制御（§4.4.1）追加、Billing図更新 |
| 1.4 | 2026-02-14 | レビュー修正: 認証/課金エンドポイントのレート制限方針追加、AUTH_REDIRECT_URL同一オリジン制約明記 |
| 1.5 | 2026-02-14 | レビュー修正: Billing UIパス `/api/billing/*` 統一、getArticleFull参照先明記 |
| 1.6 | 2026-02-14 | レビュー修正: §3.9.4 APIクライアント拡張に関数仕様テーブル・設計方針を追加 |

---

## 1. 技術スタック（Phase 3 追加分）

### 1.1 バックエンド追加パッケージ

| パッケージ | バージョン | 用途 | 根拠 |
|-----------|-----------|------|------|
| PyJWT[crypto] | 2.11.0 | JWT RS256 エンコード/デコード | [FastAPI公式がpython-jose非推奨→PyJWT推奨に変更](https://github.com/fastapi/fastapi/discussions/11345) |
| authlib | 1.6.6 | OAuth 2.0 クライアント（Google, GitHub） | [Authlib Starlette Integration](https://docs.authlib.org/en/latest/client/starlette.html) |
| stripe | >=14.3.0 | Stripe SDK（Checkout, Webhook, Customer Portal） | [Stripe Python SDK](https://github.com/stripe/stripe-python/releases)、API version 2026-01-28 |

> **重要**: `python-jose` は非推奨。最終リリースから3年以上経過し、セキュリティリスクあり。FastAPI公式ドキュメントはPyJWTに移行済み。
> **出典**: [FastAPI Discussion #11345](https://github.com/fastapi/fastapi/discussions/11345), [FastAPI JWT Tutorial](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)

### 1.2 フロントエンド追加パッケージ

| パッケージ | バージョン | 用途 | 根拠 |
|-----------|-----------|------|------|
| next-themes | 0.4.6 | テーマ切り替え（ダーク/ライト/システム） | [next-themes GitHub](https://github.com/pacocoursey/next-themes) — FOUC防止のスクリプト注入を内蔵 |

### 1.3 フォント

| フォント | 提供元 | 用途 | ロード方式 |
|----------|--------|------|-----------|
| Inter | next/font/google | 英文テキスト（Variable Font） | next/font 自動最適化・セルフホスト |
| Noto Sans JP | next/font/google | 日本語テキスト（weight: 400, 700） | next/font 自動最適化・セルフホスト |

> **根拠**: [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts) — `next/font` はフォントをビルド時にセルフホストし、Googleへの外部リクエストを排除する。Variable Fontが推奨。Noto Sans JPはVariable Fontではないため、weight指定が必要。

---

## 2. Phase 3.0 — UI刷新

### 2.1 テーマシステム設計

#### 2.1.1 Tailwind CSS v4 ダークモード設定

Tailwind CSS v4 では `tailwind.config.js` の `darkMode: "class"` は廃止。代わりに CSS 内の `@custom-variant` ディレクティブを使用する。

**globals.css 設計:**

```css
@import "tailwindcss";

/* --- Dark mode variant (class-based) --- */
@custom-variant dark (&:where(.dark, .dark *));

/* --- Theme CSS Variables --- */
@theme {
  --color-bg-primary: var(--bg-primary);
  --color-bg-secondary: var(--bg-secondary);
  --color-bg-card: var(--bg-card);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-border: var(--border-color);
  --color-accent: var(--accent-color);
  --color-accent-hover: var(--accent-hover);
}

/* --- Light Theme (default values) --- */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-card: #ffffff;
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --text-muted: #9ca3af;
  --border-color: #e5e7eb;
  --accent-color: #e07070;
  --accent-hover: #d45a5a;
}

/* --- Dark Theme --- */
.dark {
  --bg-primary: #0f0f0f;
  --bg-secondary: #1a1a1a;
  --bg-card: #1e1e1e;
  --text-primary: #f0f0f0;
  --text-secondary: #a0a0a0;
  --text-muted: #6b7280;
  --border-color: #2e2e2e;
  --accent-color: #e88585;
  --accent-hover: #f09090;
}
```

> **根拠**: [Tailwind CSS v4 Dark Mode](https://tailwindcss.com/docs/dark-mode) — `@custom-variant dark (&:where(.dark, .dark *))` でクラスベースのダークモードを有効化。`@theme` ディレクティブで CSS変数をTailwindユーティリティに統合。

#### 2.1.2 next-themes 統合

**ThemeProvider コンポーネント:**

```
frontend/src/components/ThemeProvider.tsx  (Client Component)
```

- `ThemeProvider` from `next-themes` をラップ
- `attribute="class"` — `<html>` の class 属性でテーマを制御
- `defaultTheme="dark"` — デフォルトはダーク
- `themes={["light", "dark", "system"]}` — 3モード
- `enableSystem={true}` — OS設定追従をサポート
- `disableTransitionOnChange={false}` — テーマ切り替え時のトランジション有効

**layout.tsx への統合:**

```
<html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}
      suppressHydrationWarning>
  <body>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <Header />
      <main>{children}</main>
      <Footer />
    </ThemeProvider>
  </body>
</html>
```

> **根拠**: [next-themes](https://github.com/pacocoursey/next-themes) — `suppressHydrationWarning` は `<html>` のみに設定（next-themesがSSR時にスクリプトを注入するため）。これによりFOUC（Flash of Unstyled Content）を防止。

#### 2.1.3 テーマトグル

**ThemeToggle コンポーネント:**

```
frontend/src/components/ThemeToggle.tsx  (Client Component)
```

- `useTheme()` フックで現在のテーマを取得
- 3状態トグル: ライト → ダーク → システム
- アイコン: ☀️(ライト) / 🌙(ダーク) / 💻(システム) — CSSアイコンまたはSVG
- ヘッダー右側に配置
- `mounted` チェックでハイドレーションミスマッチ回避

#### 2.1.4 フォント設定

**layout.tsx でのフォントロード:**

```typescript
import { Inter, Noto_Sans_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansJP = Noto_Sans_JP({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
  preload: false,  // 日本語サブセットは大きいためpreload無効
})
```

**globals.css でのフォント適用:**

```css
body {
  font-family: var(--font-inter), var(--font-noto-sans-jp), ui-sans-serif, system-ui, sans-serif;
}
```

> **根拠**: [Next.js Font Optimization](https://nextjs.org/docs/app/getting-started/fonts) — `preload: false` は大きいフォントファイル（日本語）に推奨。`display: 'swap'` でFOITを回避。CSS変数 (`variable`) 方式でTailwind v4と統合。

### 2.2 レイアウト設計

#### 2.2.1 ヘッダー（リデザイン）

**現状**: Server Component、白背景、シンプルなナビリンク

**変更後:**

| 要素 | 仕様 |
|------|------|
| 位置 | `sticky top-0 z-50` |
| 背景 | `bg-bg-primary/80 backdrop-blur-md` — 半透明ブラー |
| ボーダー | `border-b border-border` |
| ロゴ | 左寄せ。サイト名（font-bold text-xl） |
| ナビ | 中央。記事一覧, ダイジェスト, ソース |
| 右側 | テーマトグル + ログインボタン（Phase 3.1で追加） |
| レスポンシブ | モバイルではハンバーガーメニュー |

#### 2.2.2 記事一覧ページ（リデザイン）

**現状**: HeroSection（2記事）+ 3カラム均等グリッド

**変更後 — Bento Grid レイアウト:**

```
Desktop (lg+):
┌─────────────────┬──────────┐
│                  │          │
│   Hero Card      │ Card 2   │
│   (2/3 width)   │ (1/3)    │
│                  │          │
├──────┬──────┬───┴──────────┤
│Card 3│Card 4│    Card 5     │
│(1/3) │(1/3) │   (1/3)      │
├──────┴──────┴──────────────┤
│   通常グリッド (3カラム)     │
│   Card 6 | Card 7 | Card 8  │
└────────────────────────────┘

Tablet (md):
┌──────────────────┐
│   Hero Card       │
│   (full width)    │
├────────┬─────────┤
│ Card 2 │ Card 3  │
├────────┴─────────┤
│ 2カラムグリッド    │
└──────────────────┘

Mobile (sm):
┌──────────────────┐
│   Hero Card       │
│   (full width)    │
├──────────────────┤
│ Card 2 (full)     │
├──────────────────┤
│ 1カラムリスト      │
└──────────────────┘
```

**ヒーローカード仕様:**
- 全幅（デスクトップでは2/3幅）
- OG画像をフル表示 + グラデーションオーバーレイ（下→上）
- タイトル: text-2xl font-bold、画像上にオーバーレイ
- カテゴリバッジ: アクセントカラー背景
- 読了時間表示

**通常カード仕様:**
- 現在のカード構造を維持しつつ、テーマ対応色に変更
- `bg-bg-card border-border` → CSS変数でテーマ切り替え
- ホバー: `hover:shadow-lg hover:scale-[1.02] transition-all duration-200`
- プレミアムバッジ（Phase 3.2で追加）

#### 2.2.3 記事詳細ページ（リデザイン）

**現状**: タイトル + メタ + ReactMarkdown（summary + body_translated）

**変更後:**

| 要素 | 仕様 |
|------|------|
| プログレスバー | `fixed top-0 left-0 h-1 bg-accent z-50` — スクロール進捗 |
| リード画像 | `aspect-video w-full rounded-xl` — OG画像を記事上部に大きく表示 |
| メタ情報 | ソース名 · 著者 · 公開日 · 読了時間 — アクセントカラーの区切り |
| カテゴリ | バッジ表示（アクセントカラー背景 + テキスト） |
| 本文 | `max-w-prose mx-auto` — 最適な読書幅（65ch） |
| 目次（TOC） | `lg:sticky lg:top-20` — デスクトップでサイドバーに固定表示 |
| タブ切り替え | 「翻訳」「原文」タブ（Phase 3.2で追加） |

**読了時間計算:**

```typescript
function estimateReadingTime(text: string): number {
  // 日本語: 約500文字/分、英語: 約200単語/分
  const jaChars = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length
  const enWords = text.replace(/[\u3000-\u9fff\uff00-\uffef]/g, ' ')
    .split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(jaChars / 500 + enWords / 200))
}
```

**スクロールプログレスバー:**

```
frontend/src/components/ScrollProgress.tsx  (Client Component)
```

- `useEffect` + `scroll` イベントリスナー
- `document.documentElement.scrollHeight - window.innerHeight` で進捗率計算
- `requestAnimationFrame` でパフォーマンス最適化

**目次（TOC）:**

```
frontend/src/components/TableOfContents.tsx  (Client Component)
```

- ReactMarkdown レンダリング後の DOM から `h2`, `h3` を抽出
- IntersectionObserver で現在のセクションをハイライト
- デスクトップ: `lg:sticky lg:top-20` でサイドバー固定
- モバイル: 折りたたみ式（`<details>`/`<summary>`）
- 見出しが3つ未満の場合は非表示

### 2.3 カラーパレット

#### 2.3.1 アクセントカラー（淡い赤系）

| 用途 | ライトモード | ダークモード |
|------|-------------|-------------|
| アクセント | `#e07070` | `#e88585` |
| アクセントホバー | `#d45a5a` | `#f09090` |
| カテゴリバッジ背景 | `#fde8e8` | `#3d2020` |
| カテゴリバッジテキスト | `#b91c1c` | `#fca5a5` |

#### 2.3.2 基本カラー

| 用途 | ライトモード | ダークモード |
|------|-------------|-------------|
| 背景（プライマリ） | `#ffffff` | `#0f0f0f` |
| 背景（セカンダリ） | `#f9fafb` | `#1a1a1a` |
| カード背景 | `#ffffff` | `#1e1e1e` |
| テキスト（プライマリ） | `#111827` | `#f0f0f0` |
| テキスト（セカンダリ） | `#4b5563` | `#a0a0a0` |
| テキスト（ミュート） | `#9ca3af` | `#6b7280` |
| ボーダー | `#e5e7eb` | `#2e2e2e` |

### 2.4 トランジション仕様

| 対象 | CSS |
|------|-----|
| カードホバー | `transition: box-shadow 200ms ease, transform 200ms ease` |
| テーマ切り替え | `transition: background-color 300ms ease, color 300ms ease, border-color 300ms ease` |
| タブ切り替え | `transition: opacity 150ms ease` |
| ページフェードイン | `@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }` |
| プログレスバー | `transition: width 100ms linear` |

### 2.5 コンポーネント変更一覧

| コンポーネント | 変更種別 | 主な変更内容 |
|-------------|---------|-------------|
| `layout.tsx` | 修正 | フォント変更、ThemeProvider追加、CSS変数適用 |
| `globals.css` | 修正 | @custom-variant、@theme、テーマ変数、フォント設定 |
| `Header.tsx` | 修正 | sticky化、ブラー背景、テーマトグル、モバイルメニュー |
| `Footer.tsx` | 修正 | テーマ対応色 |
| `ThemeProvider.tsx` | **新規** | next-themes ラッパー |
| `ThemeToggle.tsx` | **新規** | 3モードテーマ切り替え |
| `ArticleCard.tsx` | 修正 | テーマ対応色、ホバーエフェクト強化 |
| `ArticleListLive.tsx` | 修正 | Bento Grid レイアウト、テーマ対応 |
| `HeroSection.tsx` | 修正 | オーバーレイテキスト、グラデーション |
| `ArticleGrid.tsx` | 修正 | Bento Grid 対応 |
| `ArticleImage.tsx` | 修正 | テーマ対応（error fallback色） |
| `CategoryFilter.tsx` | 修正 | アクセントカラー、テーマ対応 |
| `ScrollProgress.tsx` | **新規** | スクロールプログレスバー |
| `TableOfContents.tsx` | **新規** | 目次（TOC） |
| `ReadingTime.tsx` | **新規** | 読了時間計算・表示 |
| `articles/[id]/page.tsx` | 修正 | リード画像、TOC、プログレスバー、読了時間 |
| `not-found.tsx` | 修正 | テーマ対応色 |
| `error.tsx` | 修正 | テーマ対応色 |

### 2.6 next.config.ts 変更

CSP ヘッダーに `style-src 'self' 'unsafe-inline'` を維持（next-themes が `<html>` の class を操作するため）。追加変更なし。

---

## 3. Phase 3.1 — OAuth認証

### 3.1 認証アーキテクチャ

```
                    Next.js rewrite
                    /api/:path* → API
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

> ブラウザは `/api/auth/*` 経由でAPIにアクセス。Next.js rewrite が `http://news-api:8100/auth/*` に透過プロキシ。Frontend ページ（`/login`, `/auth/success`, `/profile`）は Next.js ルーティングで処理（§3.2 参照）。

### 3.2 URL ルーティング戦略

Phase 3 で追加する `/auth/*`, `/billing/*`, `/users/*` の API エンドポイントは、Frontend のページパス（`/auth/success`, `/billing/success`）と衝突する。Phase 2 で確立済みの Next.js rewrite パターンで解決する。

**ルーティング構成:**

| 層 | パス例 | 処理者 |
|-----|---------|--------|
| ブラウザ → Frontend | `/auth/success`, `/billing/success`, `/login`, `/pricing` | Next.js ページルーティング |
| ブラウザ → API（rewrite経由） | `/api/auth/google/login`, `/api/billing/checkout` | Next.js rewrite → FastAPI |
| Server Component → API（内部） | `http://news-api:8100/auth/refresh` | Docker内部ネットワーク直接 |

**Next.js rewrite（既存設定をそのまま利用）:**

```typescript
// next.config.ts — 既存の rewrite ルール（変更不要）
async rewrites() {
  return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }]
}
```

ブラウザからの `/api/auth/*`, `/api/billing/*` リクエストはこの rewrite により `http://news-api:8100/auth/*`, `http://news-api:8100/billing/*` にプロキシされる。Next.js rewrite はリクエストヘッダー（Cookie含む）とレスポンスヘッダー（Set-Cookie含む）を透過的に転送する。

> **衝突回避の根拠**: FastAPI 側のルートは `/auth/*`（プレフィックスなし）、ブラウザからのアクセスは `/api/auth/*`（rewrite経由）。Frontend ページ `/auth/success` は `/api/` を含まないため、Next.js ページルーティングで処理される。この分離はPhase 2の `/api/articles/stream` SSE rewrite と同じパターン。

### 3.3 OAuth フロー（Authorization Code Flow）

```
1. ユーザーが「Googleでログイン」をクリック
   Browser → GET /api/auth/google/login
   （Next.js rewrite → API /auth/google/login）

2. API が Google の認可エンドポイントにリダイレクト
   API → authorize_redirect(redirect_uri="${PUBLIC_URL}/api/auth/google/callback")
   API → 302 → https://accounts.google.com/o/oauth2/auth?...&redirect_uri=...
   ※ SessionMiddleware が state を session cookie に保存

3. ユーザーがGoogleで認証・同意
   Google → 302 → ${PUBLIC_URL}/api/auth/google/callback?code=xxx&state=yyy
   （Next.js rewrite → API /auth/google/callback）
   ※ ブラウザが session cookie を送信 → rewrite で API に転送

4. API がコールバックを処理
   API → Google Token Exchange → UserInfo 取得
   API → users テーブルに upsert（§3.6.1a 参照）
   API → JWT (access + refresh) を発行

5. API がリフレッシュトークンをhttpOnly cookieに設定し、Frontendにリダイレクト
   API → Set-Cookie: refresh_token=xxx; HttpOnly; SameSite=Lax; Path=/; Secure（本番のみ）
   API → 302 → ${AUTH_REDIRECT_URL}  （= /auth/success、URLにトークンを含めない）

6. Frontend がアクセストークンを取得
   Browser → POST /api/auth/refresh （cookie が自動送信される → rewrite で API に転送）
   API → refresh cookie を検証（token_version チェック含む）
   API → 新しいアクセストークンをJSONレスポンスで返却
   Frontend → アクセストークンをメモリ（React State）に保持
```

**OAuth プロバイダーへの登録 callback URL:**

| プロバイダー | Authorized redirect URI |
|------------|------------------------|
| Google Cloud Console | `${PUBLIC_URL}/api/auth/google/callback` |
| GitHub OAuth App | `${PUBLIC_URL}/api/auth/github/callback` |

> **セキュリティ根拠**: URLにトークンを含めない理由:
> - ブラウザ履歴、Referrerヘッダー、サーバーログにトークンが残る（[RFC 6749 §10.3](https://datatracker.ietf.org/doc/html/rfc6749#section-10.3)）
> - httpOnly cookieはクライアントJavaScriptからアクセスできないため、`Set-Cookie`ヘッダーはサーバー側（API）が設定する必要がある

#### 3.3.1 Set-Cookie 属性の設計

| 属性 | 値 | 理由 |
|------|-----|------|
| `HttpOnly` | 常時 | XSSによるトークン窃取を防止 |
| `SameSite` | `Lax` | CSRF防止。OAuthリダイレクト（GET）でcookieが送信される必要があるため `Strict` は不可 |
| `Path` | `/` | Server Component が任意のページ（`/articles/[id]` 等）で `cookies()` API経由でrefresh_tokenを読み取る必要があるため、全パスで送信されるよう `/` を指定 |
| `Secure` | **本番のみ** | HTTPS接続でのみcookieを送信。`http://localhost` の開発環境ではcookieが保存されなくなるため、開発時は付与しない |
| `Max-Age` | `604800` (7日) | リフレッシュトークンの有効期限と一致 |

**実装方針:**

```python
from app.config import settings

def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",  # 本番のみSecure
        path="/",
        max_age=7 * 24 * 60 * 60,  # 7日
    )
```

> **`Path=/` の安全性**: `Path` はセキュリティ境界ではなく利便性の属性である（[RFC 6265 §8.6](https://datatracker.ietf.org/doc/html/rfc6265#section-8.6)）。cookieの保護は `HttpOnly` + `Secure` + `SameSite` で担保する。

### 3.4 JWT 設計

#### 3.4.1 トークン仕様

| 項目 | アクセストークン | リフレッシュトークン |
|------|----------------|-------------------|
| アルゴリズム | RS256 | RS256 |
| 有効期限 | 15分 | 7日 |
| 格納場所 | メモリ（Frontend State） | httpOnly cookie |
| Payload | sub, exp, iat, iss, plan | sub, exp, iat, iss, type="refresh" |

> **根拠**: [OWASP API2:2023](https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/) — アクセストークンは短命（15分以下）。リフレッシュトークンはhttpOnly cookieに格納し、XSSからの漏洩を防止。

#### 3.4.2 RSA鍵管理

| 項目 | 仕様 |
|------|------|
| 鍵長 | 2048ビット以上 |
| 生成 | `openssl genrsa -out private.pem 2048` |
| 公開鍵抽出 | `openssl rsa -in private.pem -pubout -out public.pem` |
| 環境変数 | `JWT_PRIVATE_KEY`（PEM文字列）、`JWT_PUBLIC_KEY`（PEM文字列） |
| 本番管理 | Docker Secret または環境変数（改行は `\n` エスケープ） |

#### 3.4.3 JWT Claims

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

> **`ver` クレーム**: `users.token_version` の発行時点の値。`POST /auth/refresh` 時に DB の現在値と照合し、不一致なら 401 を返却してトークンを拒否する。ログアウト時に `token_version` がインクリメントされるため、ログアウト前に発行された全リフレッシュトークンが一括無効化される。

### 3.5 API エンドポイント設計

#### 3.5.1 認証エンドポイント

> 以下は FastAPI 側のルート定義。ブラウザからは `/api/auth/*` 経由でアクセス（§3.2 参照）。

| Method | Path（FastAPI側） | ブラウザ側 | Auth | Rate Limit | Description |
|--------|-------------------|-----------|------|-----------|-------------|
| GET | `/auth/google/login` | `/api/auth/google/login` | なし | 10/minute | Google OAuth 認可URLへリダイレクト |
| GET | `/auth/google/callback` | `/api/auth/google/callback` | なし | 10/minute | Google コールバック処理 → cookie設定 + リダイレクト |
| GET | `/auth/github/login` | `/api/auth/github/login` | なし | 10/minute | GitHub OAuth 認可URLへリダイレクト |
| GET | `/auth/github/callback` | `/api/auth/github/callback` | なし | 10/minute | GitHub コールバック処理 → cookie設定 + リダイレクト |
| POST | `/auth/refresh` | `/api/auth/refresh` | Refresh Cookie | 30/minute | アクセストークン再発行（token_version検証含む） |
| POST | `/auth/logout` | `/api/auth/logout` | Refresh Cookie | 10/minute | token_version インクリメント + cookie削除 |
| GET | `/users/me` | `/api/users/me` | JWT Bearer | 60/minute | ログインユーザー情報 |

**レート制限方針:**

既存エンドポイントと同様、`slowapi` の `@limiter.limit` デコレータで IP ベース（`get_remote_address`）の制限を適用する。

| カテゴリ | Rate Limit | 根拠 |
|---------|-----------|------|
| OAuth login/callback | 10/minute | OAuthリダイレクトの乱用防止。正常利用ではログインは低頻度 |
| `/auth/refresh` | 30/minute | ページ読み込み・タブ復帰時に呼ばれるため高めに設定。既存 `POST /articles`（30/min）と同等 |
| `/auth/logout` | 10/minute | 既存の書き込み系（`POST /sources`）と同等 |
| `/users/me` | 60/minute | 既存の読み取り系（`GET /articles`）と同等 |

**POST /auth/logout の処理:**

```
1. Refresh cookie から JWT をデコード → sub claim でユーザー特定
2. users.token_version を +1 にインクリメント
   → 当該ユーザーの全既存リフレッシュトークンが無効化される
3. Set-Cookie: refresh_token=; Max-Age=0; Path=/ でcookieを削除
4. 204 No Content を返却
```

> **根拠**: リフレッシュトークン自体はステートレス（DBに保存しない）であるため、トークン単体では失効できない。`token_version` をDB側に持ち、リフレッシュ時に照合することで、ログアウト後の全セッションを即時無効化する。これは [Auth0 の Token Revocation](https://auth0.com/docs/secure/tokens/refresh-tokens/revoke-refresh-tokens) と同等のパターン。

#### 3.5.2 Authlib OAuth 設定

```python
from authlib.integrations.starlette_client import OAuth

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

> **根拠**: [Authlib Starlette OAuth Client](https://docs.authlib.org/en/latest/client/starlette.html) — GoogleはOpenID Connect対応（`server_metadata_url`で自動設定）。GitHubはOAuth2のみ（URLを個別指定）。

#### 3.5.3 ミドルウェア追加

OAuth のコールバックでは `request.session` にstateを保存するため、`SessionMiddleware` が必要:

```python
from starlette.middleware.sessions import SessionMiddleware

app.add_middleware(SessionMiddleware, secret_key=settings.session_secret)
```

**注意**: `SessionMiddleware` はOAuthのstate保存のみに使用。ユーザー認証はJWTで行う。

### 3.6 DB スキーマ — users テーブル

#### 3.6.1 ORM モデル

```
api/app/models/user.py
```

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | UUID | PK, default=uuid4 | 主キー |
| email | String(254) | NOT NULL | メールアドレス（UNIQUE制約なし） |
| display_name | String(100) | | 表示名 |
| avatar_url | Text | | プロフィール画像URL |
| oauth_provider | String(20) | NOT NULL | "google" / "github" |
| oauth_id | String(100) | NOT NULL | プロバイダー側のユーザーID |
| plan | String(20) | NOT NULL, default="free" | "free" / "premium" / "pro" |
| token_version | Integer | NOT NULL, default=0 | リフレッシュトークン世代番号（ログアウト時にインクリメント） |
| is_active | Boolean | default=True | 有効フラグ |
| created_at | DateTime(timezone=True) | server_default=now() | 作成日時 |
| updated_at | DateTime(timezone=True) | server_default=now(), onupdate=now() | 更新日時 |

**ユニーク制約:**

```python
__table_args__ = (
    UniqueConstraint("oauth_provider", "oauth_id", name="uq_users_oauth"),
)
```

> **`email` のUNIQUE制約を外す理由**: 同一メールアドレスでGoogleとGitHubの両方からOAuthログインされるケースが存在する。`email` にUNIQUE制約があると、2つ目のプロバイダーでの登録が失敗する。

#### 3.6.1a アカウントリンク戦略

**方針: メールアドレスによる自動リンク**

同一メールアドレスで異なるOAuthプロバイダーからログインした場合、既存アカウントに自動リンクする:

```
OAuthコールバック処理:
1. oauth_provider + oauth_id で既存ユーザーを検索
   → 見つかった場合: そのユーザーでログイン

2. email で既存ユーザーを検索
   → 見つかった場合（別プロバイダーで登録済み）:
     → 既存ユーザーの oauth_provider, oauth_id を更新せず、
        新しい行を INSERT せず、既存ユーザーでログインさせる
     ※ ただし、email は OAuth プロバイダーが verified であることが前提

3. 見つからない場合: 新規ユーザーを INSERT
```

**verified email の取得方法と未取得時の挙動:**

| プロバイダー | email 取得元 | verified 判定 | verified email が取得できない場合 |
|------------|------------|-------------|-------------------------------|
| Google | OpenID Connect `userinfo` | `email_verified` claim が `true` | 発生しない（Google は scope `email` で必ず verified email を返す） |
| GitHub | `GET /user/emails` API ([GitHub Docs](https://docs.github.com/en/rest/users/emails#list-email-addresses-for-the-authenticated-user)) | `verified` フィールドが `true` かつ `primary` が `true` | **403 Forbidden** を返却。エラーメッセージ: 「GitHubアカウントに検証済みのメールアドレスが設定されていません。GitHubのメール設定でメールアドレスを検証してから再度お試しください。」 |

```
OAuthコールバック処理（email検証込み）:
0. プロバイダーから email を取得
   → Google: userinfo.email（email_verified=true を確認）
   → GitHub: /user/emails から verified=true かつ primary=true のメールを取得
   → verified email が取得できない場合: 403 Forbidden で中断（ユーザー登録しない）

1. oauth_provider + oauth_id で既存ユーザーを検索
   → 見つかった場合: そのユーザーでログイン

2. verified email で既存ユーザーを検索
   → 見つかった場合（別プロバイダーで登録済み）:
     → 既存ユーザーでログインさせる（アカウント自動リンク）
   → 注意: 未検証メールではリンクしない（上記ステップ0で排除済み）

3. 見つからない場合: 新規ユーザーを INSERT
```

**実装上の注意:**
- GitHub OAuth scope `user:email` により `/user/emails` API へのアクセス権を取得
- GitHub ユーザーが public email を設定していなくても、`/user/emails` API で private email を取得可能
- リンク時にユーザーに通知は出さない（暗黙リンク）。Phase 4 でアカウント設定画面に接続プロバイダー一覧を表示予定

> **根拠**: [Auth0 Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking) — verified email による自動統合パターンを推奨。未検証メールでのリンクはアカウント乗っ取りリスクがあるため禁止。

#### 3.6.2 Pydantic スキーマ

```
api/app/schemas/user.py
```

| スキーマ | 用途 | フィールド |
|---------|------|-----------|
| UserResponse | GET /users/me レスポンス | id, email, display_name, avatar_url, plan, created_at |
| TokenResponse | 認証成功レスポンス | access_token, token_type="bearer" |

### 3.7 認証 Dependency

```
api/app/dependencies.py  (既存ファイルに追加)
```

**現行の `verify_api_key` パターンに準じて追加:**

```python
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# OAuth2PasswordBearerは使用しない（password grantフローが存在しないため）
# HTTPBearerを使用し、OpenAPIドキュメントにはBearerトークン入力欄を表示
bearer_scheme = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """JWT検証 → ユーザー取得。未認証時は401。"""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    # PyJWT RS256 verify → sub claim → DB lookup
    ...

async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User | None:
    """JWT検証 → ユーザー取得。未認証時はNone（公開エンドポイント用）。"""
    if credentials is None:
        return None
    ...
```

> **根拠**: `OAuth2PasswordBearer(tokenUrl=...)` は [Resource Owner Password Credentials Grant](https://datatracker.ietf.org/doc/html/rfc6749#section-4.3) 用であり、OAuth Authorization Code Flowには不適切。当プロジェクトではパスワード認証エンドポイントが存在しないため、`HTTPBearer` を使用する。

### 3.8 Settings 拡張

```
api/app/config.py  (既存ファイルに追加)
```

| 環境変数 | 説明 | 必須 | Phase |
|---------|------|------|-------|
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID | 3.1 | Yes |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret | 3.1 | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | 3.1 | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | 3.1 | Yes |
| `JWT_PRIVATE_KEY` | RSA秘密鍵（PEM形式） | 3.1 | Yes |
| `JWT_PUBLIC_KEY` | RSA公開鍵（PEM形式） | 3.1 | Yes |
| `SESSION_SECRET` | SessionMiddleware用シークレット | 3.1 | Yes |
| `AUTH_REDIRECT_URL` | OAuth成功後のリダイレクト先（**下記制約参照**） | 3.1 | Yes |
| `STRIPE_SECRET_KEY` | Stripe APIシークレットキー | 3.3 | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhookシークレット | 3.3 | Yes |
| `STRIPE_PRICE_PREMIUM` | Premium プランの Price ID | 3.3 | Yes |
| `STRIPE_PRICE_PRO` | Pro プランの Price ID | 3.3 | Yes |

**`AUTH_REDIRECT_URL` の制約:**

`AUTH_REDIRECT_URL` は `PUBLIC_URL` と**同一オリジン**でなければならない。

| 設定例 | PUBLIC_URL | AUTH_REDIRECT_URL | 動作 |
|--------|-----------|-------------------|------|
| 開発 | `http://localhost:3100` | `http://localhost:3100/auth/success` | OK |
| 本番 | `https://news.example.com` | `https://news.example.com/auth/success` | OK |
| **NG** | `https://news.example.com` | `https://other.example.com/auth/success` | cookie が送信されず認証失敗 |

> **理由**: OAuth コールバック時に API が `Set-Cookie: refresh_token=...` を設定する。このcookie のドメインは `PUBLIC_URL` のドメインになる（Next.js rewrite 経由でブラウザに返却されるため）。`AUTH_REDIRECT_URL` が異なるオリジンの場合、リダイレクト先で `POST /api/auth/refresh` を呼んでも cookie が送信されず、認証が成立しない（[RFC 6265 §5.3](https://datatracker.ietf.org/doc/html/rfc6265#section-5.3): cookie はドメイン属性に基づいて送信される）。

### 3.9 フロントエンド認証UI

#### 3.9.1 新規ページ

| パス | コンポーネント | 種別 | 説明 |
|------|-------------|------|------|
| `/login` | LoginPage | Server Component | ログインボタン（Google, GitHub） |
| `/auth/success` | AuthSuccess | Client Component | OAuth成功後、`POST /api/auth/refresh` でアクセストークン取得 → メモリに保持 → リダイレクト |
| `/profile` | ProfilePage | Server Component | ユーザー情報 + プラン表示 |

#### 3.9.2 ヘッダー変更

| 状態 | 表示 |
|------|------|
| 未ログイン | 「ログイン」ボタン（→ /login） |
| ログイン済み | アバター画像 + ドロップダウン（プロフィール、ログアウト） |

#### 3.9.3 認証状態管理

```
frontend/src/lib/auth.ts  (Client-side auth utilities)
```

- `accessToken`: メモリ（React State / Context）に保持
- `refreshToken`: httpOnly cookie（サーバーが設定、クライアントからアクセス不可）
- トークンリフレッシュ: アクセストークン期限切れ時に自動で `POST /api/auth/refresh`（Next.js rewrite経由）
- Next.js の Server Component でもクッキーからリフレッシュ可能

#### 3.9.4 API クライアント拡張

```
frontend/src/lib/api.ts  (既存ファイルに追加)
```

**追加関数一覧:**

| 関数 | URL | 認証 | cache | 用途 |
|------|-----|------|-------|------|
| `getArticleFull(id)` | `${API_BASE}/articles/${id}/full` | なし | `"no-store"` | 非プレミアム記事の全文取得（未ログインでも可） |
| `getArticleFullAuth(id, accessToken)` | `${API_BASE}/articles/${id}/full` | `Bearer` | `"no-store"` | プレミアム記事の全文取得（JWT必須） |
| `refreshAccessToken(cookieHeader)` | `${API_BASE}/auth/refresh` | Cookie 転送 | `"no-store"` | Server Component からトークン再取得 |
| `getCurrentUser(accessToken)` | `${API_BASE}/auth/users/me` | `Bearer` | `"no-store"` | ログインユーザー情報取得 |

**設計方針:**
- 既存関数（`getArticleById` 等）と同じパターン: `fetch` + `signal: AbortSignal.timeout(10_000)` + エラー時 `throw`
- 認証付き関数は `accessToken` を引数で受け取り `Authorization: Bearer` ヘッダーを設定
- `refreshAccessToken` のみ `cookies()` で取得した cookie 文字列を `Cookie` ヘッダーとして転送（Server Component 専用）
- 全関数 `cache: "no-store"` を明示指定（§4.4.1 の defense-in-depth 方針）

---

## 4. Phase 3.2 — 全文翻訳 + 比較表示

### 4.1 DB スキーマ変更

**articles テーブルにカラム追加:**

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| is_premium | Boolean | NOT NULL, default=False | プレミアム記事フラグ |

**Alembic マイグレーション:**

```python
op.add_column('articles', sa.Column('is_premium', sa.Boolean(),
              nullable=False, server_default='false'))
```

### 4.2 API エンドポイント設計

#### 4.2.1 全文翻訳エンドポイント

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/articles/{id}/full` | `get_current_user_optional` | 全文翻訳取得 |

**認証方式:** `get_current_user_optional` を使用（JWT任意）。

**レスポンスロジック:**

```
is_premium = false:
  → JWT有無に関わらず body_translated + body_original を返却
  （通常記事の全文は誰でも閲覧可能）

is_premium = true:
  → 未ログイン（user=None）   → 401 Unauthorized + ログイン誘導
  → plan="free"               → 403 Forbidden + アップグレード誘導
  → plan="premium" or "pro"   → body_translated + body_original を返却
```

> **設計根拠**: 非プレミアム記事にJWTを要求すると、未ログインユーザーが全文翻訳を読むためにわざわざログインを強制されるため、UX上の障壁が不必要に高くなる。プレミアム記事のみログインを要求することで、フリーコンテンツの可読性と有料コンテンツの保護を両立する。

#### 4.2.2 スキーマ設計

```
api/app/schemas/article.py  (既存ファイルに追加)
```

| スキーマ | 用途 | フィールド |
|---------|------|-----------|
| ArticleFull | GET /articles/{id}/full レスポンス | ArticleDetail + body_original, body_translated |

**既存スキーマの変更:**

- `ArticleListItem` に `is_premium: bool` を追加
- `ArticleDetail` に `is_premium: bool` を追加

#### 4.2.3 既存エンドポイントの変更

- `POST /articles`: `ArticleCreate` に `is_premium: bool = False` を追加
- `GET /articles`: レスポンスの `ArticleListItem` に `is_premium` を含める
- `GET /articles/{id}`: レスポンスの `ArticleDetail` に `is_premium` を含める
  - **`is_premium=false`の記事**: 従来通り `body_translated` を含める（公開コンテンツ）
  - **`is_premium=true`の記事**: `body_translated` を **除外**（`null` を返却）。全文翻訳は `GET /articles/{id}/full` でのみ取得可能

> **セキュリティ根拠**: `GET /articles/{id}` は認証不要の公開エンドポイントであるため、プレミアム記事の `body_translated` を返却すると課金を迂回できてしまう。プレミアム記事の全文は認証必須の `/articles/{id}/full` 経由でのみ提供する。

### 4.3 フロントエンド — タブ切り替えUI

#### 4.3.1 ContentTabs コンポーネント

```
frontend/src/components/ContentTabs.tsx  (Client Component)
```

| Props | 型 | 説明 |
|-------|-----|------|
| translatedContent | string | null | 翻訳本文（Markdown） |
| originalContent | string | null | 原文本文（Markdown） |
| isPremium | boolean | プレミアム記事かどうか |
| userPlan | string | null | ユーザーのプラン（null=未ログイン） |

**表示ロジック:**

```
ケース1: 通常記事 or 有料ユーザー
  → タブ切り替え（「翻訳」「原文」）

ケース2: プレミアム記事 × 無料/未ログインユーザー
  → 要約のみ表示 + PaywallBanner

ケース3: 原文がない場合
  → 翻訳のみ表示（タブなし）
```

**タブUI仕様:**

| 要素 | 仕様 |
|------|------|
| タブバー | `flex gap-1 bg-bg-secondary rounded-lg p-1` |
| アクティブタブ | `bg-bg-card text-text-primary shadow-sm rounded-md` |
| 非アクティブタブ | `text-text-muted hover:text-text-secondary` |
| コンテンツ切り替え | `opacity` transition (150ms) |
| デフォルト | 翻訳タブ |

#### 4.3.2 PaywallBanner コンポーネント

```
frontend/src/components/PaywallBanner.tsx  (Client Component)
```

- プレミアム記事で未ログイン/無料ユーザーに表示
- メッセージ: 「この記事の全文翻訳を読むにはPremiumプランが必要です」
- CTAボタン: 「プランを見る」→ /pricing
- 背景: グラデーション（テーマ対応）

#### 4.3.3 PremiumBadge コンポーネント

```
frontend/src/components/PremiumBadge.tsx  (Server Component)
```

- 記事カードと記事詳細に表示
- アイコン + 「Premium」テキスト
- アクセントカラー背景

### 4.4 articles/[id]/page.tsx 変更

**現在の流れ:**

```
getArticleById(id) → ArticleDetail 表示
```

**変更後の流れ:**

```
// Server Component (articles/[id]/page.tsx)

1. getArticleById(id) → 基本情報（ArticleDetail）取得

2. サーバーサイドでの認証チェック:
   const cookieStore = await cookies()  // ← Dynamic API: ルートを dynamic rendering に強制
   const refreshToken = cookieStore.get("refresh_token")?.value

3. if (refreshToken):
     // Server Component から内部API経由でアクセストークン取得
     const tokenRes = await fetch(`${API_URL}/auth/refresh`, {
       method: "POST",
       headers: { Cookie: `refresh_token=${refreshToken}` },
       cache: "no-store",  // POST は元々キャッシュ対象外だが明示
     })
     const { access_token } = await tokenRes.json()

     // 全文取得（ユーザー依存データ）
     const fullArticle = await fetch(`${API_URL}/articles/${id}/full`, {
       headers: { Authorization: `Bearer ${access_token}` },
       cache: "no-store",  // ユーザー固有データのため明示的にキャッシュ除外
     })
     → ContentTabs（翻訳+原文）表示

4. else if (!is_premium):
     // 未ログインでも非プレミアム記事は全文取得可能
     const fullArticle = await getArticleFull(id)  // §3.9.4 で追加する api.ts 関数。cache: "no-store" を内部で指定
     → ContentTabs（翻訳+原文）表示

5. else:
     // 未ログイン × プレミアム記事
     → PaywallBanner 表示
```

#### 4.4.1 Server Component の fetch キャッシュ制御

**Next.js 16 のデフォルト挙動と本ページの関係:**

| 要素 | 挙動 | 根拠 |
|------|------|------|
| `cookies()` 呼び出し | ルートを **dynamic rendering** に強制 | [Next.js Caching: Dynamic APIs](https://nextjs.org/docs/app/building-your-application/caching#dynamic-apis) — "`cookies` ... Using them will opt a route out of the Full Route Cache" |
| dynamic rendering 内の `fetch` | **デフォルトでキャッシュされない** | [Next.js Caching: fetch](https://nextjs.org/docs/app/building-your-application/caching#fetch) — "Dynamic rendering: Fetch runs on every request and always returns fresh data" |
| `POST` リクエスト | Request Memoization の **対象外** | [Next.js Caching: Request Memoization](https://nextjs.org/docs/app/building-your-application/caching#request-memoization) — "Memoization only applies to the `GET` method in `fetch` requests" |

**結論**: `cookies()` を使用するため、このページは必ず dynamic rendering になり、全 `fetch` はリクエスト毎に実行される。`cache: "no-store"` は技術的には冗長だが、以下の理由で**明示的に指定する**:

1. **意図の明示**: 認証トークンやユーザー依存データがキャッシュされてはならないという設計意図をコード上で表明
2. **リファクタリング耐性**: 将来 `cookies()` 呼び出しが移動・削除された場合でも、キャッシュ除外が維持される
3. **コードレビュー容易性**: `cache: "no-store"` が無い `fetch` を見たレビュアーが「キャッシュは大丈夫か」と疑問を持つことを防止

> **Server Component からの認証**: Next.js 16 の Server Component は `cookies()` API（`next/headers`）でリクエストのcookieを読み取れる。refresh_token は httpOnly cookie であるため、クライアントJavaScriptからはアクセスできないが、Server Component からは Cookie ヘッダーとして内部APIに転送可能。`API_URL` はDocker内部ネットワークのURLを使用（`http://news-api:8100`）。

---

## 5. Phase 3.3 — Stripe課金

### 5.1 Stripe アーキテクチャ

```
                    Next.js rewrite
                    /api/:path* → API
┌─────────────┐         │           ┌──────────────┐     ┌─────────────┐
│  Browser     │── /api/billing/* ─→│   API        │────→│  Stripe     │
│             │         │           │  (FastAPI)   │     │             │
│  /pricing   │         │           │  POST        │     │  Checkout   │
│  Page       │── /api/billing/ ──→│  /billing/   │────→│  Session    │
│             │    checkout         │  checkout    │     │             │
│             │         │           │              │     │  Customer   │
│  /profile   │── /api/billing/ ──→│  POST        │────→│  Portal     │
│  Page       │    portal           │  /billing/   │     │             │
│             │     │  portal      │     │             │
│             │     │              │     │             │
│             │     │  POST        │←────│  Webhook    │
│             │     │  /billing/   │     │  Events     │
│             │     │  webhook     │     │             │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
                    ┌──────┴───────┐
                    │  PostgreSQL  │
                    │  users.plan  │
                    │  users.      │
                    │  stripe_*    │
                    └──────────────┘
```

### 5.2 API エンドポイント設計

> 以下は FastAPI 側のルート定義。ブラウザからは `/api/billing/*` 経由でアクセス（§3.2 参照）。

| Method | Path（FastAPI側） | ブラウザ側 | Auth | Rate Limit | Description |
|--------|-------------------|-----------|------|-----------|-------------|
| POST | `/billing/checkout` | `/api/billing/checkout` | JWT Bearer | 5/minute | Stripe Checkout Session 作成 |
| POST | `/billing/portal` | `/api/billing/portal` | JWT Bearer | 5/minute | Stripe Customer Portal セッション作成 |
| POST | `/billing/webhook` | `/api/billing/webhook` | Stripe Signature | **なし** | Stripe Webhook 受信 |

> **`/billing/webhook` にレート制限を設けない理由**: Stripe はイベント配信失敗時にリトライを行う（[Stripe Webhook Best Practices](https://docs.stripe.com/webhooks#best-practices): 最大72時間、指数バックオフ）。レート制限でリトライが拒否されると決済状態の同期が失敗する。Webhook 偽造は署名検証（`stripe.Webhook.construct_event()`）で防御するため、レート制限は不要。

**Stripe Webhook URL の設定:**

Stripe Dashboard の Webhook 設定で、エンドポイントURLを `${PUBLIC_URL}/api/billing/webhook` に設定する。Next.js rewrite により `http://news-api:8100/billing/webhook` に転送される。

#### 5.2.1 POST /billing/checkout

**リクエスト:**

```json
{
  "plan": "premium"
}
```

**処理:**

1. ユーザーの `stripe_customer_id` を確認。なければ `stripe.Customer.create()`
2. `stripe.checkout.Session.create()` を呼び出し:
   - `mode="subscription"`
   - `customer=stripe_customer_id`
   - `line_items=[{"price": STRIPE_PRICE_PREMIUM, "quantity": 1}]`
   - `success_url="{PUBLIC_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}"`
   - `cancel_url="{PUBLIC_URL}/pricing"`
3. `checkout_url` を返却

**レスポンス:**

```json
{
  "checkout_url": "https://checkout.stripe.com/c/pay/..."
}
```

#### 5.2.2 POST /billing/portal

**処理:**

1. ユーザーの `stripe_customer_id` を確認
2. `stripe.billing_portal.Session.create()` を呼び出し
3. `portal_url` を返却

#### 5.2.3 POST /billing/webhook

**処理対象イベント:**

| イベント | 処理 |
|---------|------|
| `checkout.session.completed` | ユーザーの `plan` を更新、`stripe_customer_id` を保存 |
| `customer.subscription.updated` | `plan` と `subscription_end_date` を更新 |
| `customer.subscription.deleted` | `plan` を "free" にダウングレード |
| `invoice.payment_failed` | ログ記録（将来的にメール通知） |

> **根拠**: [Stripe Subscription Webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) — `checkout.session.completed` が決済成功の確定イベント。Webhook署名検証は必須。

**Webhook署名検証:**

```python
event = stripe.Webhook.construct_event(
    payload=body,
    sig_header=request.headers.get("stripe-signature"),
    secret=settings.stripe_webhook_secret,
)
```

### 5.3 DB スキーマ変更 — users テーブル拡張

| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| stripe_customer_id | String(100) | UNIQUE, nullable | Stripe Customer ID |
| subscription_status | String(20) | default="none" | "active", "past_due", "canceled", "none" |
| subscription_end_date | DateTime(timezone=True) | nullable | サブスクリプション有効期限 |

### 5.4 料金プラン

| プラン | 月額 | 機能 | Stripe Price ID |
|--------|------|------|----------------|
| Free | 無料 | 要約閲覧、通常記事の全文翻訳 | — |
| Premium | 500円 | + プレミアム記事の全文翻訳 | `STRIPE_PRICE_PREMIUM` |
| Pro | 1,000円 | + パーソナルサイト + APIフルコントロール（Phase 4） | `STRIPE_PRICE_PRO` |

> **注意**: Pro プランは Phase 3.3 で Stripe 上に作成するが、パーソナルサイト機能自体は Phase 4 で実装。Pro で購入可能にしておき、Phase 4 完了まではPremium相当の機能を提供。

### 5.5 フロントエンド — 課金UI

#### 5.5.1 新規ページ

| パス | コンポーネント | 説明 |
|------|-------------|------|
| `/pricing` | PricingPage | 3プラン比較表 + CTAボタン |
| `/billing/success` | BillingSuccess | 決済成功ページ |

#### 5.5.2 PricingPage 設計

- 3カラムのプラン比較カード
- 現在のプランにハイライト
- Premium: 「月額500円で始める」ボタン → POST /api/billing/checkout
- Pro: 「月額1,000円で始める」ボタン → POST /api/billing/checkout
- Free: 「現在のプラン」表示

#### 5.5.3 ProfilePage 拡張

- プラン情報表示
- 「プランを管理」ボタン → POST /api/billing/portal → Stripe Customer Portal
- サブスクリプション有効期限表示

---

## 6. ファイル構成（Phase 3 追加分）

### 6.1 バックエンド

```
api/app/
├── models/
│   └── user.py                    # 新規: User ORM モデル
├── schemas/
│   └── user.py                    # 新規: UserResponse, TokenResponse
├── routers/
│   ├── auth.py                    # 新規: OAuth + JWT エンドポイント
│   └── billing.py                 # 新規: Stripe エンドポイント
├── services/
│   ├── auth_service.py            # 新規: JWT生成/検証、OAuth処理
│   ├── user_service.py            # 新規: ユーザーCRUD
│   └── billing_service.py         # 新規: Stripe連携
├── config.py                      # 修正: 新規環境変数追加
├── dependencies.py                # 修正: get_current_user 追加
├── main.py                        # 修正: SessionMiddleware、auth/billing router追加
└── oauth.py                       # 新規: Authlib OAuth 設定

api/alembic/versions/
├── xxx_add_users_table.py         # Phase 3.1
├── xxx_add_is_premium.py          # Phase 3.2
└── xxx_add_stripe_columns.py      # Phase 3.3
```

### 6.2 フロントエンド

```
frontend/src/
├── app/
│   ├── login/page.tsx             # 新規: ログインページ
│   ├── auth/success/page.tsx      # 新規: OAuth成功後処理
│   ├── profile/page.tsx           # 新規: プロフィールページ
│   ├── pricing/page.tsx           # 新規: 料金プランページ
│   ├── billing/success/page.tsx   # 新規: 決済成功ページ
│   ├── layout.tsx                 # 修正: フォント、ThemeProvider
│   └── globals.css                # 修正: テーマ変数、ダークモード
├── components/
│   ├── ThemeProvider.tsx           # 新規: next-themes ラッパー
│   ├── ThemeToggle.tsx            # 新規: テーマ切り替え
│   ├── ScrollProgress.tsx         # 新規: スクロールプログレスバー
│   ├── TableOfContents.tsx        # 新規: 目次
│   ├── ReadingTime.tsx            # 新規: 読了時間
│   ├── ContentTabs.tsx            # 新規: 翻訳/原文タブ切り替え
│   ├── PaywallBanner.tsx          # 新規: 有料コンテンツ誘導
│   ├── PremiumBadge.tsx           # 新規: プレミアムバッジ
│   ├── Header.tsx                 # 修正: sticky、テーマトグル、ログイン
│   └── ... (既存コンポーネント修正)
├── lib/
│   ├── auth.ts                    # 新規: 認証ユーティリティ
│   ├── api.ts                     # 修正: 認証付きリクエスト追加
│   └── types.ts                   # 修正: User, Plan 型追加
└── contexts/
    └── AuthContext.tsx             # 新規: 認証状態管理
```

---

## 7. Alembic マイグレーション計画

| Phase | マイグレーション名 | 変更内容 |
|-------|-------------------|---------|
| 3.1 | `add_users_table` | `users` テーブル新規作成（email, display_name, avatar_url, oauth_provider, oauth_id, plan, token_version, is_active, created_at, updated_at） |
| 3.2 | `add_is_premium_to_articles` | `articles` テーブルに `is_premium BOOLEAN NOT NULL DEFAULT FALSE` 追加 |
| 3.3 | `add_stripe_columns_to_users` | `users` テーブルに `stripe_customer_id`, `subscription_status`, `subscription_end_date` 追加 |

---

## 8. テスト戦略

### 8.1 Phase 3.0 テスト

| テスト種別 | 対象 | 件数目安 |
|-----------|------|---------|
| E2E (Playwright) | ダークモード切り替え、テーマ永続化 | 3 |
| E2E (Playwright) | Bento Grid レイアウト表示確認 | 2 |
| E2E (Playwright) | プログレスバー、目次、読了時間 | 3 |

### 8.2 Phase 3.1 テスト

| テスト種別 | 対象 | 件数目安 |
|-----------|------|---------|
| 単体テスト | JWT生成/検証（RS256） | 4 |
| 単体テスト | auth_service（upsertユーザー、アカウントリンク） | 4 |
| 統合テスト | GET /auth/google/login リダイレクト | 1 |
| 統合テスト | GET /auth/google/callback（モック） | 2 |
| 統合テスト | POST /auth/refresh（正常、token_version不一致→401） | 3 |
| 統合テスト | POST /auth/logout（cookie削除、token_version更新確認） | 2 |
| 統合テスト | GET /users/me | 2 |
| 統合テスト | GitHub verified email なし→403 | 1 |
| E2E (Playwright) | ログインフロー | 2 |

### 8.3 Phase 3.2 テスト

| テスト種別 | 対象 | 件数目安 |
|-----------|------|---------|
| 統合テスト | GET /articles/{id}/full（通常記事、未認証→200） | 1 |
| 統合テスト | GET /articles/{id}/full（通常記事、ログイン済み→200） | 1 |
| 統合テスト | GET /articles/{id}/full（プレミアム記事、有料ユーザー→200） | 1 |
| 統合テスト | GET /articles/{id}/full（プレミアム記事、無料ユーザー→403） | 1 |
| 統合テスト | GET /articles/{id}/full（プレミアム記事、未認証→401） | 1 |
| 統合テスト | GET /articles/{id}（プレミアム記事→body_translated=null） | 1 |
| 統合テスト | is_premium フィルタ動作 | 1 |
| E2E (Playwright) | タブ切り替えUI | 2 |
| E2E (Playwright) | PaywallBanner表示 | 1 |

### 8.4 Phase 3.3 テスト

| テスト種別 | 対象 | 件数目安 |
|-----------|------|---------|
| 統合テスト | POST /billing/checkout（モック） | 2 |
| 統合テスト | POST /billing/portal（モック） | 1 |
| 統合テスト | POST /billing/webhook — checkout.session.completed | 1 |
| 統合テスト | POST /billing/webhook — subscription.deleted | 1 |
| 統合テスト | POST /billing/webhook — 署名検証失敗 | 1 |
| E2E (Playwright) | 料金ページ表示 | 1 |

### 8.5 テスト総計

| Phase | 単体 | 統合 | E2E | 合計 |
|-------|------|------|-----|------|
| 3.0 | 0 | 0 | 8 | 8 |
| 3.1 | 8 | 11 | 2 | 21 |
| 3.2 | 0 | 7 | 3 | 10 |
| 3.3 | 0 | 6 | 1 | 7 |
| **合計** | **8** | **24** | **14** | **46** |

---

## 9. セキュリティ考慮事項

### 9.1 JWT セキュリティ

| リスク | 対策 |
|--------|------|
| トークン漏洩 | アクセストークンはメモリのみ、リフレッシュはhttpOnly cookie |
| トークン窃取 | RS256（非対称鍵）で署名。公開鍵のみでは偽造不可 |
| リプレイ攻撃 | `exp` クレームで有効期限を強制 |
| トークン無効化 | `token_version` による世代管理。ログアウト時に一括失効 |
| XSS | httpOnly cookie（JavaScript からアクセス不可）、CSP ヘッダー |
| CSRF | `SameSite=Lax` cookie が主防御（下記詳細参照） |

#### 9.1.1 CSRF 防御戦略

**`SameSite=Lax` による防御:**

`SameSite=Lax` の cookie は、クロスサイトの `POST` リクエストでは送信されない（[RFC 6265bis §5.3.7](https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis-12#section-5.3.7)）。これにより、攻撃者サイトからの `fetch("https://target.com/api/auth/refresh", {method: "POST"})` にはcookieが付与されず、CSRF攻撃が成立しない。

**Origin ヘッダー検証は追加しない理由:**

| 呼び出し元 | Origin ヘッダー | Cookie送信 | CSRF リスク |
|-----------|----------------|-----------|------------|
| ブラウザ（同一サイト POST） | 付与される | `SameSite=Lax` で送信 | なし（同一サイト） |
| ブラウザ（クロスサイト POST） | 付与される | `SameSite=Lax` で **不送信** | なし（cookieなし） |
| Server Component（内部API呼び出し） | **付与されない** | 明示的 Cookie ヘッダー転送 | なし（サーバー間通信） |

Server Component は `cookies()` API で取得した refresh_token を明示的に `Cookie` ヘッダーとして内部 API（`http://news-api:8100`）に転送する。この呼び出しには `Origin` ヘッダーが付与されない。`Origin` 検証を追加すると、この正当な内部呼び出しが拒否される。`SameSite=Lax` が CSRF を防御するため、追加の `Origin` 検証は不要。

> **根拠**: [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#samesite-cookie-attribute) — `SameSite` 属性は CSRF 防御として有効。`Lax` はPOSTのクロスサイトcookie送信を阻止する。

### 9.2 OAuth セキュリティ

| リスク | 対策 |
|--------|------|
| CSRF | OAuth state パラメータ（Authlib が自動管理） |
| オープンリダイレクト | コールバックURLをホワイトリストで制限 |
| トークン漏洩 | OAuth トークンはサーバー側のみで処理、フロントエンドに渡さない |

### 9.3 Stripe セキュリティ

| リスク | 対策 |
|--------|------|
| Webhook偽造 | `stripe.Webhook.construct_event()` で署名検証 |
| 決済情報漏洩 | 決済はStripe Checkoutページで処理（PCI DSS準拠不要） |
| 二重課金 | Stripe の冪等性キー + Webhook の冪等処理 |

---

## 10. 実装順序

```
Phase 3.0 — UI刷新
  Step 1: フォント変更（Inter + Noto Sans JP）
  Step 2: next-themes + ダークモード基盤
  Step 3: カラーパレット + CSS変数
  Step 4: ヘッダー リデザイン（sticky、ブラー、モバイルメニュー）
  Step 5: 記事一覧 Bento Grid レイアウト
  Step 6: 記事詳細 リデザイン（リード画像、読了時間、TOC、プログレスバー）
  Step 7: 全コンポーネントのテーマ対応
  Step 8: E2E テスト

Phase 3.1 — OAuth認証
  Step 1: Alembic: users テーブル作成
  Step 2: User ORM モデル + スキーマ
  Step 3: auth_service（JWT生成/検証、ユーザーupsert）
  Step 4: oauth.py（Authlib OAuth設定）
  Step 5: routers/auth.py（OAuth + JWT エンドポイント）
  Step 6: dependencies.py（get_current_user）
  Step 7: main.py（SessionMiddleware、auth router登録）
  Step 8: フロントエンド（Login, AuthSuccess, Profile, AuthContext）
  Step 9: ヘッダーにログインボタン追加
  Step 10: テスト

Phase 3.2 — 全文翻訳 + 比較表示
  Step 1: Alembic: articles.is_premium 追加
  Step 2: ArticleFull スキーマ + is_premium 追加
  Step 3: GET /articles/{id}/full エンドポイント
  Step 4: ContentTabs コンポーネント
  Step 5: PaywallBanner + PremiumBadge コンポーネント
  Step 6: articles/[id]/page.tsx 修正
  Step 7: テスト

Phase 3.3 — Stripe課金
  Step 1: Alembic: users に stripe カラム追加
  Step 2: billing_service（Stripe SDK連携）
  Step 3: routers/billing.py（checkout, portal, webhook）
  Step 4: フロントエンド（Pricing, BillingSuccess）
  Step 5: Profile ページにプラン管理追加
  Step 6: テスト
```

---

## 11. 参考文献

### 認証・セキュリティ

| 文書 | URL |
|------|-----|
| FastAPI JWT Tutorial (PyJWT) | https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ |
| PyJWT RS256 Usage | https://pyjwt.readthedocs.io/en/latest/usage.html |
| FastAPI python-jose → PyJWT 移行 | https://github.com/fastapi/fastapi/discussions/11345 |
| Authlib Starlette OAuth Client | https://docs.authlib.org/en/latest/client/starlette.html |
| Authlib FastAPI OAuth Client | https://docs.authlib.org/en/latest/client/fastapi.html |
| OWASP API2:2023 Broken Authentication | https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/ |

### Stripe

| 文書 | URL |
|------|-----|
| Stripe Python SDK | https://github.com/stripe/stripe-python/releases |
| Stripe Checkout Session Create | https://docs.stripe.com/api/checkout/sessions/create |
| Stripe Subscription Webhooks | https://docs.stripe.com/billing/subscriptions/webhooks |
| Stripe Customer Portal | https://docs.stripe.com/customer-management/portal-deep-links |

### フロントエンド

| 文書 | URL |
|------|-----|
| next-themes | https://github.com/pacocoursey/next-themes |
| Tailwind CSS v4 Dark Mode | https://tailwindcss.com/docs/dark-mode |
| Next.js Font Optimization | https://nextjs.org/docs/app/getting-started/fonts |
| Next.js Dark Mode (FOUC解決) | https://notanumber.in/blog/fixing-react-dark-mode-flickering |
| Tailwind v4 + next-themes テーマ設定 | https://medium.com/@kevstrosky/theme-colors-with-tailwind-css-v4-0-and-next-themes-dark-light-custom-mode-36dca1e20419 |
