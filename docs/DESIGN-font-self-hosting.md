# DESIGN: フォント供給方式の変更 — next/font/google から @fontsource へ

- **Version**: 1.0
- **Date**: 2026-06-11
- **Status**: Approved(計画承認済み)
- **Supersedes**: docs/DESIGN-phase3.md「フォント」節(next/font/google 採用部分)

## 背景 / 問題

`make build`(Docker 内・linux/amd64)で frontend のビルドが失敗するようになった。

### 原因(2026-06-11 調査で特定)

- Next.js 16 の `next build` は既定で Turbopack を使用し、`next/font/google`
  (Inter + Noto Sans JP)のフォントファイルを**ビルド時に** fonts.gstatic.com から
  Turbopack 内蔵の Rust 製 HTTP クライアント(reqwest)でダウンロードする
- この Rust ネットワークスタックは Docker コンテナ内、特に arm64 ホスト上の
  linux/amd64 エミュレーション(Rosetta)下で接続確立に確率的に失敗する
- Turbopack はダウンロード失敗を webpack のようなフォールバックではなく
  fatal な `Module not found` として扱い、ビルド全体が失敗する

### 切り分け結果(証拠)

| 検証 | 結果 |
|------|------|
| ホスト macOS で `npm run build`(キャッシュなし) | 成功 |
| コンテナ内 Node.js fetch(gstatic、50並列含む) | 全て成功 |
| builder ステージ arm64 ネイティブビルド | 成功(ただし別試行で接続警告あり=フレーク) |
| builder ステージ amd64 エミュレーションビルド | **失敗を再現**(接続警告11・Module not found 22) |

→ 失敗は「Turbopack の Rust HTTP クライアント × Docker コンテナ(特にエミュレーション)」に局在。
コンテナの一般ネットワークは正常。

参考(公式): vercel/next.js #91653(16.2 の取得リグレッション)、#92671(重複)、
#78472(Turbopack の Rust 網は Node の TLS 設定を無視)、Discussion #61886 / #81721(同症状)。

## 決定

**`@fontsource-variable/inter` + `@fontsource/noto-sans-jp`(npm パッケージ)でフォントを同梱し、
ビルド時の Google Fonts への外部接続を完全に排除する。**

フォント取得は `npm ci`(Node/npm 経由 — コンテナ内で安定動作を実証済み)に一本化され、
バージョンは package-lock.json で固定される。

## 検討した選択肢

| 案 | 内容 | 判定 |
|----|------|------|
| A | @fontsource パッケージ同梱 | **採用** — ビルド時外部接続ゼロ。unicode-range サブセット維持。CSP `font-src 'self'` 無変更 |
| B | `next build --webpack`(公式オプトアウト) | 不採用 — 取得経路は安定化するが、ビルド時の外部接続依存が残る。webpack は将来縮退方向 |
| C | builder を `--platform=$BUILDPLATFORM` でネイティブ実行 | 不採用 — ネイティブでも接続フレークを観測。根本対策にならない |

## 設計詳細

### 変更点

1. **依存追加**: `@fontsource-variable/inter`(Variable)、`@fontsource/noto-sans-jp`(weight 400/700)
2. **`src/app/layout.tsx`**: `next/font/google` の import と `Inter()` / `Noto_Sans_JP()` 呼び出しを削除し、
   fontsource の CSS import に置換。`<html>` の font 変数 className を削除
3. **`src/app/globals.css`**: `--font-sans` の先頭を fontsource のファミリー名
   (`'Inter Variable', 'Noto Sans JP'`)に変更。フォールバックスタックは現行維持

### 維持される設計特性

- **セルフホスト / ブラウザから Google への直接リクエストなし**(DESIGN-phase3.md の本来の意図)
- woff2 は Next.js のアセットパイプラインで `/_next/static/media` から同一オリジン配信
  → CSP `font-src 'self'` は無変更で整合
- fontsource の CSS は Google Fonts と同じ **unicode-range サブセット分割**を持つため、
  日本語フォントもクライアントは必要なサブセットのみダウンロード(配信特性は現行同等)
- `font-display: swap` は fontsource 既定で維持

### トレードオフ(受容)

- `next/font` の自動フォールバックメトリクス調整(`adjustFontFallback`)を失う
  → フォント読込中の CLS がわずかに増える可能性
- イメージサイズ増(woff2 サブセット群、推定 +2〜4MB)
- フォントのバージョン更新は npm 依存更新として追従(renovate / npm audit の対象)

### ライセンス

Inter・Noto Sans JP とも SIL Open Font License 1.1 — アプリケーションへの同梱・再配布可。

## 検証計画

1. ローカル `npm run build` 成功 + ログに fonts.gstatic.com への言及ゼロ
2. `docker build --target builder --platform linux/amd64`(従来の失敗条件)を 2 回連続成功
3. `npx tsc --noEmit` / `npm run lint` パス
4. 本番サーバ起動でフォントが `/_next/static/media` から配信されることを確認
