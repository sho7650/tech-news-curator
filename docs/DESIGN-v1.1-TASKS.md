# Tech News Curator — Phase 1.1 詳細設計書

> **Version**: 1.4 (第3回レビュー反映)
> **Date**: 2026-02-10
> **Scope**: GitHub公開品質 + SSE自動更新 + CI/CD
> **前提ドキュメント**: `docs/REQUIREMENTS.md` (v1.0), `docs/DESIGN.md` (v1.1)

---

## 目次

1. [Task 1: SSRF 対策](#task-1-ssrf-対策)
2. [Task 2: 著作権対応テスト追加](#task-2-著作権対応テスト追加)
3. [Task 3: CORS / fetch タイムアウト修正](#task-3-cors--fetch-タイムアウト修正)
4. [Task 4: SSE — API エンドポイント](#task-4-sse--api-エンドポイント)
5. [Task 5: SSE — フロントエンド自動更新](#task-5-sse--フロントエンド自動更新)
6. [Task 6: テスト CI (GitHub Actions)](#task-6-テスト-ci-github-actions)
7. [Task 7: release-please 設定](#task-7-release-please-設定)

---

## Task 1: SSRF 対策

### 背景

`POST /ingest` はユーザー指定の URL に対して `trafilatura.fetch_url()` で HTTP リクエストを発行する。
現状は `pydantic.HttpUrl` でフォーマット検証のみ行い、プライベート IP アドレスへのリクエストをブロックしていない。

**リスク**: 攻撃者が `http://169.254.169.254/latest/meta-data/` 等を指定し、内部ネットワークを探索できる (SSRF)。

### 設計

#### 方針: `fetch_url()` を廃止し、自前 HTTP クライアントで取得

旧設計では `validate_url()` で事前に DNS 解決して IP を検証した後、`trafilatura.fetch_url()` に
URL をそのまま渡していた。しかし以下のリスクが残る:

1. **DNS リバインディング**: 事前検証時は安全な IP を返し、`fetch_url()` 内部の再解決時にプライベート IP を返す
2. **HTTP リダイレクト**: `fetch_url()` は最大 2 回のリダイレクトを自動追従（trafilatura `settings.cfg` の `MAX_REDIRECTS = 2`）するが、リダイレクト先 URL の IP 検証は行われない
3. **DNS 解決の DoS**: `socket.getaddrinfo()` にはタイムアウトパラメータが存在しない（Python 公式ドキュメント: https://docs.python.org/3/library/socket.html#socket.getaddrinfo ）

**解決策**: `trafilatura.fetch_url()` を使用せず、`urllib3`（trafilatura の依存ライブラリ、既にインストール済み）
で自前の安全なフェッチャーを実装する。各リクエスト（リダイレクト含む）の前に IP 検証を行い、
取得した HTML を `trafilatura.bare_extraction()` に渡す。

根拠: trafilatura は `bare_extraction()` に HTML 文字列を直接渡せる設計になっている。
(参照: https://trafilatura.readthedocs.io/en/latest/corefunctions.html)

#### 新規ファイル: `api/app/services/url_validator.py`

**`is_safe_ip()` のブロック対象** (Python 標準 `ipaddress` モジュール):

| プロパティ | ブロック対象 | 例 |
|-----------|-------------|-----|
| `is_private` | RFC 1918 + ULA | `10.x`, `172.16-31.x`, `192.168.x`, `fc00::/7` |
| `is_loopback` | ループバック | `127.0.0.1`, `::1` |
| `is_link_local` | リンクローカル | `169.254.x.x`, `fe80::/10` |
| `is_multicast` | マルチキャスト | `224.0.0.0/4`, `ff00::/8` |
| `is_reserved` | IETF 予約 | `240.0.0.0/4` |
| `is_unspecified` | 未指定 | `0.0.0.0`, `::` |

根拠: Python `ipaddress` モジュール公式ドキュメント
(https://docs.python.org/3/library/ipaddress.html)

**関数シグネチャと処理フロー**:

```python
import ipaddress
import socket
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from urllib.parse import urlparse

# DNS 解決用のタイムアウト付きスレッドプール
_dns_executor = ThreadPoolExecutor(max_workers=4)
DNS_TIMEOUT_SECONDS = 5

class UnsafeURLError(ValueError):
    """URL がプライベートアドレスに解決された、またはスキームが不正な場合に送出"""
    pass

def is_safe_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """IP アドレスがグローバルに到達可能かを判定"""
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )

def _resolve_with_timeout(hostname: str) -> list[tuple]:
    """DNS 解決にタイムアウトを適用する。

    socket.getaddrinfo() にはタイムアウトパラメータがないため、
    concurrent.futures.ThreadPoolExecutor で実行しタイムアウトを制御する。
    (参照: https://docs.python.org/3/library/socket.html#socket.getaddrinfo)

    Raises:
        UnsafeURLError: DNS 解決がタイムアウトした場合
    """
    future = _dns_executor.submit(socket.getaddrinfo, hostname, None)
    try:
        return future.result(timeout=DNS_TIMEOUT_SECONDS)
    except FuturesTimeoutError:
        future.cancel()
        raise UnsafeURLError(f"DNS resolution timed out for {hostname}")
    except socket.gaierror:
        raise UnsafeURLError(f"DNS resolution failed for {hostname}")

def validate_url(url: str) -> str:
    """URL を検証し、安全であれば元の URL を返す。

    処理フロー:
    1. urlparse でスキーム・ホスト名を抽出
    2. スキームが http / https 以外 → UnsafeURLError
    3. ホスト名が IP リテラルの場合 → is_safe_ip() で判定
    4. ホスト名がドメインの場合:
       - _resolve_with_timeout() で全 A/AAAA レコードを解決 (5秒タイムアウト)
       - 解決された全 IP に対して is_safe_ip() で判定
       - 1 つでも unsafe → UnsafeURLError
    5. 通過すれば元の URL 文字列を返す

    Raises:
        UnsafeURLError: unsafe な場合
    """
```

#### 新規ファイル: `api/app/services/safe_fetch.py`

`trafilatura.fetch_url()` を置き換える安全な HTTP フェッチャー。
DNS リバインディングを完全に防止するため、**検証済み IP に直接接続し、Host ヘッダーを手動設定**する。

```python
"""SSRF 安全な HTTP フェッチャー。
検証済み IP に直接接続し、DNS リバインディングを完全に防止する。
"""

import ipaddress
import socket
from urllib.parse import urlparse, urljoin

import urllib3

from app.services.url_validator import (
    UnsafeURLError,
    is_safe_ip,
    _resolve_with_timeout,
)

MAX_REDIRECTS = 5
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
USER_AGENT = "Mozilla/5.0 (compatible; TechNewsCurator/1.0)"

def _resolve_and_validate(hostname: str) -> str:
    """ホスト名を DNS 解決し、全 IP を検証して最初の安全な IP を返す。

    Returns:
        検証済みの IP アドレス文字列

    Raises:
        UnsafeURLError: 全 IP が unsafe、またはホスト名が IP リテラルで unsafe な場合
    """
    # ホスト名が IP リテラルの場合
    try:
        ip = ipaddress.ip_address(hostname)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"IP address {ip} is not safe")
        return str(ip)
    except ValueError:
        pass

    # ドメイン名の場合: 全 A/AAAA レコードを解決
    addr_info = _resolve_with_timeout(hostname)

    safe_ip = None
    for info in addr_info:
        ip_str = info[4][0]
        ip = ipaddress.ip_address(ip_str)
        if not is_safe_ip(ip):
            raise UnsafeURLError(f"Hostname {hostname} resolves to unsafe IP {ip}")
        if safe_ip is None:
            safe_ip = ip_str

    if safe_ip is None:
        raise UnsafeURLError(f"No addresses found for {hostname}")

    return safe_ip

def _make_request(url: str) -> urllib3.HTTPResponse:
    """URL を解析し、検証済み IP に直接接続してレスポンスを返す。

    DNS リバインディング対策:
    1. ホスト名を DNS 解決 → 全 IP を検証
    2. 検証済み IP に直接 TCP 接続（再度の DNS 解決を回避）
    3. Host ヘッダーを元のホスト名に設定
    4. HTTPS の場合は server_hostname でSNI / 証明書検証を元のホスト名に対して実行

    参照:
    - urllib3 HTTPSConnectionPool server_hostname パラメータ:
      https://urllib3.readthedocs.io/en/stable/reference/urllib3.connectionpool.html
    """
    parsed = urlparse(url)
    scheme = parsed.scheme
    hostname = parsed.hostname
    port = parsed.port
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    if scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported scheme: {scheme}")

    if not hostname:
        raise UnsafeURLError("No hostname in URL")

    # DNS 解決 + IP 検証
    resolved_ip = _resolve_and_validate(hostname)

    # 検証済み IP に直接接続
    default_port = 443 if scheme == "https" else 80
    actual_port = port or default_port

    # Host ヘッダー: 非デフォルトポートの場合は hostname:port 形式
    # (参照: RFC 7230 Section 5.4 — Host = uri-host [ ":" port ])
    # (参照: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Host)
    host_header = hostname if port is None else f"{hostname}:{port}"

    if scheme == "https":
        pool = urllib3.HTTPSConnectionPool(
            host=resolved_ip,
            port=actual_port,
            server_hostname=hostname,    # SNI + 証明書検証は元のホスト名に対して (ポート不要)
            timeout=urllib3.Timeout(connect=5, read=30),
            retries=False,
            maxsize=1,
            block=False,
        )
    else:
        pool = urllib3.HTTPConnectionPool(
            host=resolved_ip,
            port=actual_port,
            timeout=urllib3.Timeout(connect=5, read=30),
            retries=False,
            maxsize=1,
            block=False,
        )

    return pool.request(
        "GET",
        path,
        headers={
            "Host": host_header,         # 元のホスト名 (非デフォルトポート時は :port 付き)
            "User-Agent": USER_AGENT,
        },
        redirect=False,
        assert_same_host=False,          # IP ≠ hostname のため必須
    )

def safe_fetch(url: str) -> str | None:
    """URL からコンテンツを安全に取得する。

    処理フロー:
    1. URL を解析し、ホスト名を DNS 解決 → 全 IP を検証
    2. 検証済み IP に直接 TCP 接続 (Host ヘッダーは元のホスト名)
    3. リダイレクトレスポンスの場合:
       a. Location ヘッダーから次の URL を urljoin で解決
          (絶対URL、相対パス、スキーム相対 //host/path に対応)
       b. リダイレクト先ホストを再度 DNS 解決 → IP 検証 → IP 直接接続
    4. 最大 MAX_REDIRECTS 回まで繰り返す
    5. 最終レスポンスの HTML を返す

    Returns:
        HTML 文字列。取得失敗時は None。

    Raises:
        UnsafeURLError: URL またはリダイレクト先が unsafe な場合
    """
    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        try:
            response = _make_request(current_url)
        except (urllib3.exceptions.HTTPError, OSError):
            return None

        if response.status in REDIRECT_STATUSES:
            location = response.headers.get("Location")
            if not location:
                return None
            # urljoin で相対 URL 全般を正規化
            # - 絶対 URL (https://other.com/page): そのまま使用
            # - スキーム相対 (//other.com/page): 現在の scheme を継承
            # - 絶対パス (/page): 現在の scheme + host を継承
            # - 相対パス (next, ../next): 現在の URL を基準に解決
            # 参照: https://docs.python.org/3/library/urllib.parse.html#urllib.parse.urljoin
            current_url = urljoin(current_url, location)
            continue

        if response.status != 200:
            return None

        return response.data.decode("utf-8", errors="replace")

    return None  # リダイレクト回数超過
```

**設計判断**:

- `urllib3` を使用する理由: trafilatura の依存ライブラリとして既にインストール済み。新たな依存関係の追加が不要
- **DNS リバインディング完全対策**: `_resolve_and_validate()` で DNS 解決 → IP 検証し、
  `HTTPSConnectionPool(host=resolved_ip)` で検証済み IP に直接接続する。
  urllib3 の内部で再度 DNS 解決は行われないため、検証と接続の間に DNS が変わる TOCTOU 問題が発生しない。
  (参照: https://urllib3.readthedocs.io/en/stable/reference/urllib3.connectionpool.html)
- **Host ヘッダーのポート対応**: `urlparse().port` が `None`（デフォルトポート）の場合は `hostname` のみ、
  非デフォルトポートの場合は `hostname:port` 形式で設定。RFC 7230 Section 5.4 の `Host = uri-host [ ":" port ]` に準拠。
  `server_hostname` は SNI 用でありポートを含めない（TLS SNI はホスト名のみ）
- **HTTPS 対応**: `server_hostname=hostname` で SNI と証明書検証を元のホスト名に対して実行。
  `assert_same_host=False` で IP ≠ hostname のチェックをスキップ
- **相対 URL 完全対応**: `urllib.parse.urljoin()` で絶対 URL、スキーム相対 (`//host/path`)、
  絶対パス (`/path`)、相対パス (`next`, `../next`) すべてを正しく解決。
  (参照: https://docs.python.org/3/library/urllib.parse.html#urllib.parse.urljoin)
- 各リダイレクトステップで `_make_request()` → `_resolve_and_validate()` が呼ばれるため、
  リダイレクト先ホストの IP も必ず検証される

#### 変更ファイル: `api/app/services/ingest_service.py`

```python
# Before (現状):
from trafilatura import bare_extraction, fetch_url

def extract_article(url: str) -> IngestResponse | None:
    downloaded = fetch_url(url)
    if downloaded is None:
        return None
    doc = bare_extraction(downloaded, url=url, with_metadata=True)
    ...

# After:
from trafilatura import bare_extraction

from app.services.safe_fetch import safe_fetch

def extract_article(url: str) -> IngestResponse | None:
    """URL から記事を抽出する。

    safe_fetch() が SSRF 検証 + リダイレクト追従を行い、
    bare_extraction() が HTML からコンテンツを抽出する。
    UnsafeURLError は呼び出し元 (router) で捕捉する。
    """
    downloaded = safe_fetch(url)  # validate_url() + リダイレクト検証込み
    if downloaded is None:
        return None
    doc = bare_extraction(downloaded, url=url, with_metadata=True)
    ...
```

**変更点**:
- `fetch_url` の import を削除
- `safe_fetch` を使用（SSRF 検証 + リダイレクト追従が一体化）
- `validate_url()` の個別呼び出しは不要（`safe_fetch()` 内部で実行）

#### 変更ファイル: `api/app/routers/ingest.py`

```python
# エラーハンドリング追加:
from app.services.url_validator import UnsafeURLError

@router.post("/ingest", response_model=IngestResponse)
def ingest_article(request: IngestRequest):
    try:
        result = extract_article(str(request.url))
    except UnsafeURLError:
        raise HTTPException(status_code=400, detail="URL points to a private or reserved address")
    if result is None:
        raise HTTPException(status_code=422, detail="Failed to extract content from URL")
    return result
```

#### テスト

`validate_url` / `safe_fetch` 単体テストは `api/tests/test_url_validator.py` に:

```
test_safe_public_url              — https://example.com         → 通過
test_block_private_ipv4           — http://10.0.0.1             → UnsafeURLError
test_block_loopback               — http://127.0.0.1            → UnsafeURLError
test_block_link_local             — http://169.254.169.254      → UnsafeURLError
test_block_ipv6_loopback          — http://[::1]                → UnsafeURLError
test_block_non_http_scheme        — ftp://example.com           → UnsafeURLError
test_dns_resolution_all_ips       — mock で複数 IP 応答、1つが private → UnsafeURLError
test_dns_timeout                  — mock で getaddrinfo を遅延 → UnsafeURLError
test_redirect_to_private_blocked  — mock で 302 → http://10.0.0.1 → UnsafeURLError
test_redirect_chain_validated     — mock で 301→301→200、各ステップの URL を検証
test_max_redirects_exceeded       — mock で 6 回リダイレクト → None (取得失敗)
```

統合テスト `api/tests/test_ingest.py` に追加:

```
test_ingest_private_ip       — http://192.168.1.1/article → 400
test_ingest_loopback         — http://127.0.0.1/secret    → 400
test_ingest_link_local       — http://169.254.169.254/     → 400
```

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `api/app/services/url_validator.py` | 新規 |
| `api/app/services/safe_fetch.py` | 新規 |
| `api/app/services/ingest_service.py` | 修正 (fetch_url → safe_fetch) |
| `api/app/routers/ingest.py` | 修正 (try/except 追加) |
| `api/tests/test_url_validator.py` | 新規 |
| `api/tests/test_ingest.py` | 追加 (3テスト) |

---

## Task 2: 著作権対応テスト追加

### 背景

REQUIREMENTS.md §9「公開API は要約 + 元記事リンクのみ」と定義。
現状 `ArticleListItem` は `body_original` を含まない設計だが、
これを保証するテストが存在しない。リグレッション防止のためテストを追加する。

### 設計

#### 変更ファイル: `api/tests/test_articles.py` に追加

```python
async def test_list_articles_excludes_body_original(client):
    """著作権対応: 一覧レスポンスに body_original が含まれないことを確認"""
    await client.post("/articles", json=SAMPLE_ARTICLE)
    response = await client.get("/articles")
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert "body_original" not in item

async def test_detail_excludes_body_original(client):
    """著作権対応: 詳細レスポンスに body_original が含まれないことを確認"""
    create_resp = await client.post("/articles", json=SAMPLE_ARTICLE)
    article_id = create_resp.json()["id"]
    response = await client.get(f"/articles/{article_id}")
    assert response.status_code == 200
    data = response.json()
    assert "body_original" not in data
```

### 根拠

- `ArticleListItem` スキーマに `body_original` フィールドが存在しない → Pydantic は未定義フィールドをシリアライズしない
- `ArticleDetail` スキーマにも `body_original` フィールドが存在しない → 同様
- テストはこの不変条件を明示的に検証する

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `api/tests/test_articles.py` | 追加 (2テスト) |

---

## Task 3: CORS / fetch タイムアウト修正

### 3-A: CORS 修正

#### 背景

2点の問題がある:

1. `allow_headers=["*"]` — フロントエンドが使用するヘッダーは `Content-Type` と `Accept` のみ
2. `allow_origins` がハードコード — 本番環境で SSE (Task 5) を別ドメインから接続する場合に対応不可。
   EventSource は標準 CORS ルールに従うため、`Access-Control-Allow-Origin` に
   フロントエンドのオリジンが含まれていなければブラウザがブロックする
   (参照: https://developer.mozilla.org/en-US/docs/Web/API/EventSource)

#### 設計

**変更ファイル: `api/app/config.py`**

```python
class Settings(BaseSettings):
    ...
    cors_origins: list[str] = ["http://localhost:3100", "http://localhost:3000"]
```

環境変数 `CORS_ORIGINS` で設定可能。pydantic-settings が JSON 形式リストをパースする。
```bash
# .env (本番例)
CORS_ORIGINS=["https://frontend.example.com"]
```

**変更ファイル: `api/app/main.py`**

```python
# Before:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3100", "http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# After:
from app.database import settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept"],
)
```

根拠:
- `allow_headers`: OWASP CORS ガイドライン — ワイルドカードヘッダー許可は不要なヘッダーインジェクションのリスクを増す
- `allow_origins`: 環境変数化により開発/本番で異なるオリジンを設定可能。デフォルト値は開発用 localhost

### 3-B: フロントエンド fetch タイムアウト

#### 背景

現状: `fetch()` にタイムアウト設定なし。API 無応答時に Server Component レンダリングが無期限にブロックされる。

#### 設計

**変更ファイル: `frontend/src/lib/api.ts`**

`AbortSignal.timeout()` を使用する。Web API 標準であり、Node.js 18+ でサポート済み。
(参照: MDN Web Docs — AbortSignal.timeout())

```typescript
// Before:
const res = await fetch(`${API_BASE}/articles?page=${page}&per_page=20`, {
  cache: 'no-store',
})

// After:
const res = await fetch(`${API_BASE}/articles?page=${page}&per_page=20`, {
  cache: 'no-store',
  signal: AbortSignal.timeout(10_000),  // 10秒
})
```

**全 4 関数** (`getArticles`, `getArticleById`, `getDigests`, `getDigestByDate`) に同一の変更を適用。

タイムアウト値の根拠:
- API は内部 Docker ネットワーク内で通信 → 通常 100ms 以内
- trafilatura の外部フェッチを含む `/ingest` とは異なり、DB クエリのみ
- 10秒は DB 負荷時のバッファとして十分

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `api/app/config.py` | 修正 (`cors_origins` フィールド追加) |
| `api/app/main.py` | 修正 (`allow_origins` 環境変数化 + `allow_headers` 制限) |
| `frontend/src/lib/api.ts` | 修正 (4箇所) |
| `.env.example` | 修正 (`CORS_ORIGINS` 追加) |

---

## Task 4: SSE — API エンドポイント

### 背景

フロントエンドで新着記事の自動更新を実現するため、Server-Sent Events (SSE) エンドポイントを API に追加する。

### 技術選定

**sse-starlette 3.2.0** を使用する。

| 選択肢 | 評価 |
|--------|------|
| `StreamingResponse` (手動 SSE) | SSE プロトコル準拠を手動実装する必要あり。ping、reconnect、Last-Event-ID 対応が煩雑 |
| **`sse-starlette`** | W3C SSE 仕様準拠。ping、切断検出、リトライ制御を内蔵。FastAPI/Starlette との統合実績豊富 |

根拠: sse-starlette は PyPI で月間 300万+ DL、FastAPI 公式ドキュメントでも参照される業界標準。
(参照: https://pypi.org/project/sse-starlette/)

### 設計

#### アーキテクチャ: DB ポーリング + インメモリ Pub/Sub

```
┌──────────────────────────────────────────────────────────┐
│  FastAPI (lifespan)                                      │
│                                                          │
│  ┌──────────────────┐     ┌──────────────────────────┐  │
│  │ _article_monitor │     │  GET /articles/stream     │  │
│  │ (background task)│     │  (SSE endpoint)           │  │
│  │                  │     │                           │  │
│  │ 5秒毎にDB問い合わせ│──→│  client_queue (per conn) │  │
│  │ 新着 → broadcast │     │  → EventSourceResponse   │  │
│  └──────────────────┘     └──────────────────────────┘  │
│          ↕                                               │
│    AsyncSessionFactory                                   │
│          ↕                                               │
│     PostgreSQL                                           │
└──────────────────────────────────────────────────────────┘
```

**ポーリング間隔: 5秒**

根拠: n8n のスケジュールは2時間毎（Workflow A）。記事追加は低頻度であり、
5秒ポーリングはリアルタイム性と DB 負荷のバランスが適切。

**Redis を使用しない理由**:
- 単一サーバー構成（Docker Compose 内）
- インフラ追加コスト（Redis コンテナ）に対してメリットが薄い
- Phase 2 でスケールアウトが必要になった場合に Redis Pub/Sub へ移行可能

#### 新規ファイル: `api/app/services/sse_broker.py`

```python
"""インメモリ SSE ブローカー: 新着記事を全接続クライアントにブロードキャストする"""

import asyncio
import logging

logger = logging.getLogger(__name__)

# 1クライアントあたりのキューサイズ上限。
# n8n のスケジュール (2時間毎) と1回あたりの記事数 (最大数十件) を考慮し、
# 64 イベント分のバッファで十分。溢れた場合はドロップ (最新優先)。
CLIENT_QUEUE_MAXSIZE = 64

class SSEBroker:
    """asyncio.Queue ベースの Pub/Sub ブローカー"""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict]] = set()

    def subscribe(self) -> asyncio.Queue[dict]:
        """新しいクライアントキューを作成して返す"""
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=CLIENT_QUEUE_MAXSIZE)
        self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        """クライアント切断時にキューを削除"""
        self._queues.discard(queue)

    async def broadcast(self, event: dict) -> None:
        """全接続クライアントにイベントを送信。

        キューが満杯の場合はイベントをドロップする（遅いクライアントへの対応）。
        ドロップ発生時はログに記録する。
        """
        for queue in list(self._queues):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE client queue full, dropping event")

    @property
    def client_count(self) -> int:
        return len(self._queues)

# モジュールレベルのシングルトン
article_broker = SSEBroker()
```

#### 新規ファイル: `api/app/services/article_monitor.py`

```python
"""バックグラウンドタスク: DB を定期ポーリングし新着記事を SSE ブローカーへ通知"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionFactory
from app.models.article import Article
from app.services.sse_broker import article_broker

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5

async def article_monitor() -> None:
    """新着記事を監視し、SSE ブローカーにブロードキャストする。

    lifespan の startup で起動、shutdown でキャンセルされる。
    """
    last_checked = datetime.now(timezone.utc)

    while True:
        try:
            if article_broker.client_count > 0:
                async with AsyncSessionFactory() as session:
                    result = await session.execute(
                        select(Article)
                        .where(Article.created_at > last_checked)
                        .order_by(Article.created_at.asc())
                    )
                    articles = result.scalars().all()

                    for article in articles:
                        await article_broker.broadcast({
                            "id": str(article.id),
                            "source_url": article.source_url,
                            "source_name": article.source_name,
                            "title_ja": article.title_ja,
                            "summary_ja": article.summary_ja,
                            "author": article.author,
                            "published_at": (
                                article.published_at.isoformat()
                                if article.published_at else None
                            ),
                            "og_image_url": article.og_image_url,
                            "categories": article.categories,
                            "created_at": article.created_at.isoformat(),
                        })

                    if articles:
                        last_checked = articles[-1].created_at
            else:
                # クライアント未接続時は last_checked を現在時刻に進める。
                # これにより、初回クライアント接続時に過去記事が大量に
                # 流れることを防止する。SSE は「接続後の新着」のみ配信する。
                last_checked = datetime.now(timezone.utc)
        except Exception:
            logger.exception("article_monitor: polling error")

        await asyncio.sleep(POLL_INTERVAL_SECONDS)
```

**設計上の考慮点**:

- `client_count > 0` チェックにより、SSE 接続がない場合は DB クエリを発行しない
- **クライアント未接続時に `last_checked` を現在時刻に更新**: 初回クライアント接続時の過去記事大量配信を防止。
  初回データは Server Component の SSR で取得済みであるため、SSE は「接続後の新着のみ」を配信すれば十分
- `AsyncSessionFactory` から独立したセッションを生成（`get_session` 依存注入とは分離）
- `created_at > last_checked` による増分クエリ（`created_at` は `server_default=func.now()` でDB側タイムスタンプ）
- 例外は `logger.exception` でログ出力し、ループは継続

#### 変更ファイル: `api/app/main.py` — lifespan にモニター起動を追加

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.database import settings
    settings.validate_production()

    # SSE 記事モニターをバックグラウンド起動
    from app.services.article_monitor import article_monitor
    monitor_task = asyncio.create_task(article_monitor())

    yield

    # シャットダウン時にモニターをキャンセル
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    await async_engine.dispose()
```

#### 新規ファイル: `api/app/routers/sse.py`

```python
"""SSE エンドポイント: 新着記事のリアルタイムストリーム"""

import asyncio
import json

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse, ServerSentEvent

from app.services.sse_broker import article_broker

router = APIRouter(tags=["sse"])


async def _article_stream(request: Request):
    """クライアントごとの SSE ジェネレーター"""
    queue = article_broker.subscribe()
    try:
        while True:
            # request.is_disconnected() で切断を検出
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield ServerSentEvent(
                    data=json.dumps(event, ensure_ascii=False),
                    event="new_article",
                )
            except asyncio.TimeoutError:
                continue  # タイムアウト → ループ継続（ping は EventSourceResponse が自動送信）
    finally:
        article_broker.unsubscribe(queue)


@router.get("/articles/stream")
async def stream_articles(request: Request):
    """新着記事の SSE ストリーム。

    EventSource API で接続:
      const es = new EventSource('/articles/stream')
      es.addEventListener('new_article', (e) => { ... })
    """
    return EventSourceResponse(
        _article_stream(request),
        ping=15,  # 15秒毎にコメント行を送信（接続維持）
    )
```

**設計判断**:

- `event="new_article"` をイベント名として使用 → フロントエンドで `addEventListener("new_article", ...)` で受信
- `ping=15` — 15秒ごとに SSE コメント（`: ping`）を送信し、プロキシ/ロードバランサーによるタイムアウト切断を防止
- `ensure_ascii=False` — 日本語テキストをエスケープせずに送信
- `asyncio.wait_for(timeout=1.0)` — 切断検出ループのために短いタイムアウトで queue.get()

#### 変更ファイル: `api/app/main.py` — ルーター登録

```python
from app.routers import articles, digest, health, ingest, sse

app.include_router(sse.router)
```

#### 依存関係追加: `api/requirements.txt`

```
sse-starlette>=3.2.0,<4.0.0
```

#### テスト: `api/tests/test_sse.py` (新規)

SSE エンドポイントは長寿命接続のため、統合テストでは httpx の `stream()` を使用:

```
test_sse_endpoint_returns_event_stream  — Content-Type: text/event-stream を確認
test_sse_broker_broadcast               — ブローカー単体テスト: subscribe → broadcast → 受信確認
test_sse_broker_unsubscribe             — unsubscribe 後にイベントが届かないことを確認
test_sse_broker_queue_full_drops_event  — maxsize 超過時にイベントがドロップされることを確認
test_article_monitor_skips_when_no_clients — client_count==0 のとき DB クエリが発行されないことを確認
```

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `api/app/services/sse_broker.py` | 新規 |
| `api/app/services/article_monitor.py` | 新規 |
| `api/app/routers/sse.py` | 新規 |
| `api/app/main.py` | 修正 (lifespan + ルーター登録) |
| `api/requirements.txt` | 追加 (sse-starlette) |
| `api/tests/test_sse.py` | 新規 |

---

## Task 5: SSE — フロントエンド自動更新

### 背景

Server Components (SSR) で初回データを取得し、以降は SSE で差分更新する
ハイブリッド構成を実装する。対象ページ: トップページ (`/`) と記事一覧 (`/articles`)。

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                 │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Server Component (page.tsx)                     │    │
│  │  → SSR: getArticles(1) で初回データ取得           │    │
│  │  → props として ArticleListLive に渡す            │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     ↓                                    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Client Component (ArticleListLive.tsx)          │    │
│  │  "use client"                                    │    │
│  │  → useState(initialData)                         │    │
│  │  → useEffect: EventSource → /articles/stream    │    │
│  │  → new_article イベント → prepend to state       │    │
│  └─────────────────────────────────────────────────┘    │
│                     ↕ SSE                                │
│              news-api:8100                               │
└─────────────────────────────────────────────────────────┘
```

### 設計

#### SSE 接続先の URL 設計

SSE は**ブラウザから直接** API に接続する（Server Component 経由ではない）。

- 開発環境: `http://localhost:8100/articles/stream`
- 本番環境: ブラウザから API に到達可能な URL（リバースプロキシや API ドメイン）

フロントエンドに `NEXT_PUBLIC_SSE_URL` 環境変数を追加する。
`NEXT_PUBLIC_` プレフィックスが必要な理由: SSE はブラウザ (Client Component) から直接接続するため。

**重要**: `NEXT_PUBLIC_SSE_URL` はブラウザが解決する URL であり、Docker 内部ホスト名は使用不可。
`localhost` は開発環境でのみ有効。本番環境ではブラウザからアクセス可能なドメインを設定する。

**開発環境** (`docker-compose.dev.yml`):

```yaml
news-frontend:
  environment:
    API_URL: http://news-api:8100                 # Server Component 用 (既存)
    NEXT_PUBLIC_SSE_URL: http://localhost:8100     # Client Component SSE 用 (開発のみ)
```

**本番環境** (`docker-compose.yml`):

`docker-compose.yml` 自体には `NEXT_PUBLIC_SSE_URL` を**設定しない**。
本番の公開 URL はデプロイ先ごとに異なるため、`.env` で環境変数として注入する。

```yaml
# docker-compose.yml (本番)
news-frontend:
  environment:
    API_URL: http://news-api:8100                 # Server Component 用 (Docker 内部, 変更なし)
    # NEXT_PUBLIC_SSE_URL は .env から ${PUBLIC_API_URL:-} で読み込む
    # 未設定の場合、フロントエンドのフォールバック値 (後述) が使用される
```

```bash
# .env.example (本番用テンプレート)
PUBLIC_API_URL=https://api.example.com
# リバースプロキシ (nginx等) が api.example.com → news-api:8100 に転送する構成を想定
```

フロントエンド側のフォールバック値:
```typescript
// ArticleListLive.tsx
const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''
// 空文字の場合、EventSource は同一オリジンに接続する (相対パス)
const es = new EventSource(`${sseUrl}/articles/stream`)
```

この設計により:
- 開発環境: `NEXT_PUBLIC_SSE_URL=http://localhost:8100` → `http://localhost:8100/articles/stream`
- 本番環境 (リバプロ同一ドメイン): 未設定 → `/articles/stream` (同一オリジン相対パス)
- 本番環境 (API 別ドメイン): `NEXT_PUBLIC_SSE_URL=https://api.example.com` → `https://api.example.com/articles/stream`

#### 新規ファイル: `frontend/src/components/ArticleListLive.tsx`

```typescript
"use client"

import { useState, useEffect, useRef } from 'react'
import type { ArticleListItem } from '@/lib/types'
import ArticleCard from '@/components/ArticleCard'

interface Props {
  initialArticles: ArticleListItem[]
  total: number
}

export default function ArticleListLive({ initialArticles, total }: Props) {
  const [articles, setArticles] = useState(initialArticles)
  const [newCount, setNewCount] = useState(0)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const sseUrl = process.env.NEXT_PUBLIC_SSE_URL || ''

    function connect() {
      // 既存接続があれば閉じる
      esRef.current?.close()

      const es = new EventSource(`${sseUrl}/articles/stream`)
      esRef.current = es

      es.addEventListener('new_article', (e: MessageEvent) => {
        const article: ArticleListItem = JSON.parse(e.data)
        setArticles((prev) => [article, ...prev])
        setNewCount((c) => c + 1)
      })

      es.onerror = () => {
        // EventSource は自動再接続する (W3C 仕様)
        // ただし close() 後は再接続されないため、
        // 手動 close 後の再接続は handleVisibility で行う
        console.warn('SSE connection error, will auto-reconnect')
      }
    }

    // タブ表示/非表示に応じて SSE 接続を管理
    // W3C 仕様: EventSource.close() 後は自動再接続されない
    // (参照: https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsource-close)
    // そのため、タブ非表示時に close() → タブ復帰時に新規接続を作成する
    const handleVisibility = () => {
      if (document.hidden) {
        esRef.current?.close()
        esRef.current = null
      } else {
        // タブ復帰時に再接続
        connect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  return (
    <div>
      {newCount > 0 && (
        <p className="mb-4 text-sm text-blue-600">
          {newCount}件の新着記事
        </p>
      )}
      <p className="mb-4 text-sm text-gray-500">全{total + newCount}件</p>
      {articles.length === 0 ? (
        <p className="text-gray-500">まだ記事がありません。</p>
      ) : (
        <div className="flex flex-col gap-4">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**設計判断**:

- `useRef` で EventSource インスタンスを保持 → `handleVisibility` から安全に参照可能
- **タブ非表示時に `close()`、復帰時に `connect()` で新規接続を作成**:
  W3C 仕様上、`EventSource.close()` 後は自動再接続されない
  (参照: https://html.spec.whatwg.org/multipage/server-sent-events.html#dom-eventsource-close)。
  そのため復帰時に明示的に再接続する必要がある
- `connect()` 内で `esRef.current?.close()` を先に呼ぶことで、二重接続を防止
- タブ復帰時に取りこぼしたイベントは配信されないが、初回データは SSR で取得済みのため、
  タブ復帰直前の数件のみが欠落する。完全性が必要な場合は Phase 2 で `Last-Event-ID` 対応を検討
- `newCount` で新着件数を表示 → ユーザーに新しい記事が追加されたことを視覚的にフィードバック
- 古い記事の除去は行わない（表示件数が増える方向のみ）

#### 変更ファイル: `frontend/src/app/page.tsx`

```typescript
// Before: Server Component が直接 ArticleCard をレンダリング

// After: Server Component が初回データを取得し、ArticleListLive に渡す
import { getArticles } from '@/lib/api'
import ArticleListLive from '@/components/ArticleListLive'

export default async function HomePage() {
  let data
  try {
    data = await getArticles(1)
  } catch {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
        <p className="text-gray-500">
          記事を取得できませんでした。APIが起動しているか確認してください。
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">最新のテックニュース</h1>
      <ArticleListLive initialArticles={data.items} total={data.total} />
    </div>
  )
}
```

#### 変更ファイル: `frontend/src/app/articles/page.tsx`

同じパターンで `ArticleListLive` を使用する。

#### 変更ファイル: `frontend/src/lib/types.ts` (変更なし)

既存の `ArticleListItem` インターフェースは SSE イベントのペイロードと一致するため、
追加の型定義は不要。

#### CORS 設定の更新

SSE はブラウザから API へ直接接続するため、CORS 設定で SSE エンドポイントへのアクセスを許可する必要がある。
Task 3 で `allow_origins` を環境変数 `CORS_ORIGINS` から読み込む設計に変更済み。
本番環境で API を別ドメインにする場合は `CORS_ORIGINS` にフロントエンドのオリジンを設定する。
（SSE は GET リクエストであり、simple request に該当するため preflight は発生しない）。

ただし、EventSource API は CORS の `withCredentials` に対応しないため、
認証が必要になった場合は別途検討が必要（Phase 2 スコープ）。

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `frontend/src/components/ArticleListLive.tsx` | 新規 |
| `frontend/src/app/page.tsx` | 修正 |
| `frontend/src/app/articles/page.tsx` | 修正 |
| `docker-compose.dev.yml` | 修正 (`NEXT_PUBLIC_SSE_URL: http://localhost:8100` 追加) |
| `.env.example` | 修正 (`PUBLIC_API_URL` 追加) |

---

## Task 6: テスト CI (GitHub Actions)

### 背景

PR 時に自動テストを実行し、コード品質を担保する。
テストは既存の testcontainers (PostgreSQL) をそのまま CI で使用する。

### 技術仕様

- **ランナー**: `ubuntu-latest` (Docker プリインストール済み)
- **Python**: 3.12 (`pyproject.toml` の `requires-python = ">=3.12"` に準拠)
- **testcontainers**: GitHub Actions の Docker デーモンで動作確認済み
  (参照: Docker Blog — Running Testcontainers Tests Using GitHub Actions)

### 設計

#### 新規ファイル: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  api-test:
    name: API Tests
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: api/requirements-dev.txt

      - name: Install dependencies
        working-directory: api
        run: pip install -r requirements-dev.txt

      - name: Run pytest
        working-directory: api
        run: python -m pytest tests/ -v --tb=short

  frontend-lint:
    name: Frontend Lint
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        working-directory: frontend
        run: npm ci

      - name: Lint
        working-directory: frontend
        run: npm run lint

      - name: Type check
        working-directory: frontend
        run: npx tsc --noEmit
```

**設計判断**:

- `api-test` と `frontend-lint` は独立ジョブとして並列実行 → CI 時間の短縮
- `cache: pip` / `cache: npm` で依存関係のキャッシュを有効化
- testcontainers は特別な環境変数不要 (`TESTCONTAINERS_RYUK_DISABLED` は設定しない — Ryuk は有効のまま)
- frontend は `lint` + `tsc --noEmit` (型チェック) を実行。ビルドは含めない
  (ビルドには `API_URL` 環境設定が不要だが、standalone ビルドは CI 時間を消費するため除外)

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `.github/workflows/ci.yml` | 新規 |

---

## Task 7: release-please 設定

### 背景

Conventional Commits ベースの自動バージョニングと CHANGELOG 生成を導入する。
プロジェクトは api (Python) と frontend (Node.js) のモノレポ構成。

### 技術仕様

- **release-please-action**: v4 (googleapis/release-please-action@v4)
  (参照: https://github.com/googleapis/release-please-action/releases)
- **Python パッケージ**: `release-type: "python"` → `pyproject.toml` の `version` を自動更新
- **Node.js パッケージ**: `release-type: "node"` → `package.json` の `version` を自動更新
- **モノレポ設定**: `packages` オブジェクトでディレクトリごとにリリースタイプを指定
  (参照: https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)

### 設計

#### 新規ファイル: `release-please-config.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "separate-pull-requests": false,
  "include-component-in-tag": true,
  "include-v-in-tag": true,
  "tag-separator": "-",
  "changelog-sections": [
    { "type": "feat", "section": "Features" },
    { "type": "fix", "section": "Bug Fixes" },
    { "type": "perf", "section": "Performance" },
    { "type": "refactor", "section": "Refactoring", "hidden": true },
    { "type": "docs", "section": "Documentation", "hidden": true },
    { "type": "chore", "section": "Miscellaneous", "hidden": true },
    { "type": "test", "section": "Tests", "hidden": true },
    { "type": "ci", "section": "CI", "hidden": true }
  ],
  "packages": {
    "api": {
      "release-type": "python",
      "package-name": "tech-news-curator-api",
      "changelog-path": "CHANGELOG.md"
    },
    "frontend": {
      "release-type": "node",
      "package-name": "tech-news-curator-frontend",
      "changelog-path": "CHANGELOG.md"
    }
  }
}
```

**設計判断**:

- `separate-pull-requests: false` — 単一の Release PR にまとめる（小規模プロジェクトのため）
- `include-component-in-tag: true` — タグは `api-v1.1.0`, `frontend-v0.2.0` のように分離
- `hidden: true` — `refactor`, `docs`, `chore`, `test`, `ci` は CHANGELOG に含めない（ノイズ低減）
- **`changelog-path` はパッケージディレクトリからの相対パス**:
  release-please のマニフェストリリーサーでは、`packages` キーがディレクトリパスを表し、
  `changelog-path` はそのディレクトリからの相対パスとして解決される。
  したがって `"api"` パッケージの `"changelog-path": "CHANGELOG.md"` は `api/CHANGELOG.md` に、
  `"frontend"` パッケージの `"changelog-path": "CHANGELOG.md"` は `frontend/CHANGELOG.md` に生成される。
  (参照: https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md
  — "changelog-path: Path + filename of the changelog relative to the package directory")

#### 新規ファイル: `.release-please-manifest.json`

```json
{
  "api": "1.0.0",
  "frontend": "0.1.0"
}
```

現在のバージョン:
- `api/pyproject.toml` の `version = "1.0.0"` に一致
- `frontend/package.json` の `version: "0.1.0"` に一致

#### 新規ファイル: `.github/workflows/release-please.yml`

```yaml
name: Release Please

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

**Docker ビルド & プッシュは含めない** — レジストリ (`registry.oshiire.to`) がローカルネットワーク内にあるため、
GitHub Actions から到達不可。リリース後のイメージプッシュは `make push` で手動実行する。

### Conventional Commits の運用規約

release-please が正しく動作するには、コミットメッセージが Conventional Commits 仕様に準拠する必要がある:

```
feat(api): add SSE endpoint for article streaming
fix(frontend): add timeout to fetch calls
docs: update DESIGN.md with SSE architecture
chore(ci): add GitHub Actions test workflow
```

スコープ (`api`, `frontend`) は任意だが、モノレポでは変更対象の明示に有用。
release-please は変更されたファイルのパスから自動的にパッケージを判定する。

### 影響範囲

| ファイル | 変更種別 |
|---------|---------|
| `release-please-config.json` | 新規 |
| `.release-please-manifest.json` | 新規 |
| `.github/workflows/release-please.yml` | 新規 |

---

## 全体影響範囲サマリー

### 新規ファイル (11)

| ファイル | Task |
|---------|------|
| `api/app/services/url_validator.py` | 1 |
| `api/app/services/safe_fetch.py` | 1 |
| `api/tests/test_url_validator.py` | 1 |
| `api/app/services/sse_broker.py` | 4 |
| `api/app/services/article_monitor.py` | 4 |
| `api/app/routers/sse.py` | 4 |
| `api/tests/test_sse.py` | 4 |
| `frontend/src/components/ArticleListLive.tsx` | 5 |
| `.github/workflows/ci.yml` | 6 |
| `.github/workflows/release-please.yml` | 7 |
| `release-please-config.json` | 7 |

### 変更ファイル (12)

| ファイル | Task | 変更内容 |
|---------|------|---------|
| `api/app/services/ingest_service.py` | 1 | fetch_url → safe_fetch に置換 |
| `api/app/routers/ingest.py` | 1 | UnsafeURLError ハンドリング追加 |
| `api/tests/test_ingest.py` | 1 | SSRF テスト 3件追加 |
| `api/tests/test_articles.py` | 2 | 著作権テスト 2件追加 |
| `api/app/config.py` | 3 | `cors_origins` フィールド追加 |
| `api/app/main.py` | 3,4 | CORS環境変数化 + allow_headers制限 + lifespan修正 + ルーター追加 |
| `frontend/src/lib/api.ts` | 3 | タイムアウト追加 |
| `frontend/src/app/page.tsx` | 5 | ArticleListLive 使用に変更 |
| `frontend/src/app/articles/page.tsx` | 5 | ArticleListLive 使用に変更 |
| `api/requirements.txt` | 4 | sse-starlette 追加 |
| `docker-compose.yml` | 5 | NEXT_PUBLIC_SSE_URL (本番) 追加 |
| `docker-compose.dev.yml` | 5 | NEXT_PUBLIC_SSE_URL (開発) 追加 |
| `.env.example` | 5 | PUBLIC_API_URL 追加 |

### 新規設定ファイル (1)

| ファイル | Task |
|---------|------|
| `.release-please-manifest.json` | 7 |

---

## 実装順序

```
Task 1 (SSRF)  ──→ Task 2 (著作権テスト) ──→ Task 3 (CORS/timeout)
                                                       ↓
Task 6 (CI) ←──────────────────────────── Task 4 (SSE API)
    ↓                                          ↓
Task 7 (release-please)              Task 5 (SSE Frontend)
```

- Task 1-3 は互いに独立しており並列実装可能
- Task 4 (SSE API) は Task 5 (SSE Frontend) の前提
- Task 6 (CI) は全テストが通過した後に設定
- Task 7 (release-please) は最後に設定（初回リリース PR の正確性のため）
