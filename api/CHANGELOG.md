# Changelog

## [1.4.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.3.0...tech-news-curator-api-v1.4.0) (2026-02-15)


### Features

* Phase 3.0 UI refresh - dark mode, fonts, Bento Grid, reading UX ([b82cb3a](https://github.com/sho7650/tech-news-curator/commit/b82cb3aee260c809dabfd6455b81783208e825c0))


### Bug Fixes

* increase GET /articles rate limit to prevent E2E test failures ([2de04b1](https://github.com/sho7650/tech-news-curator/commit/2de04b1f72fa03367284ed253b1acb7f42ce2755))

## [1.3.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.2.0...tech-news-curator-api-v1.3.0) (2026-02-13)


### Features

* add Phase 2 public features - sources API, category filter, RSS feed ([10a9708](https://github.com/sho7650/tech-news-curator/commit/10a970855ffebc72b05cb3f021c8c855d5e89aab))
* add Phase 2 public features - sources API, category filter, RSS feed ([b325d1d](https://github.com/sho7650/tech-news-curator/commit/b325d1d07e2fccfb7123bbb6da44871cf8d798be))

## [1.2.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.1.0...tech-news-curator-api-v1.2.0) (2026-02-12)


### Features

* add API Key authentication for write endpoints (Phase 1.2 Step 2) ([36008dc](https://github.com/sho7650/tech-news-curator/commit/36008dc5a68128d9042f35a326540c2d21fec690))
* add CI/CD security scanning pipeline (Phase 1.2 Step 8) ([b1a8849](https://github.com/sho7650/tech-news-curator/commit/b1a8849d36a74d2ac3525b7f96a52cf73c6edfab))
* add rate limiting with slowapi and SSE connection limits (Phase 1.2 Step 3) ([28b0802](https://github.com/sho7650/tech-news-curator/commit/28b0802a75657851a4130f6cc6147745750778ec))
* add security headers middleware and global exception handlers (Phase 1.2 Step 4) ([8787e9b](https://github.com/sho7650/tech-news-curator/commit/8787e9b0a22bb3cd1524bed47cc1362b1b79df4c))
* add service layer unit tests (Phase 1.2 Step 6) ([7f97745](https://github.com/sho7650/tech-news-curator/commit/7f97745a5c107280b63b2bdf8f5078e80733dd03))
* harden Docker infrastructure (Phase 1.2 Step 5) ([682caad](https://github.com/sho7650/tech-news-curator/commit/682caad88c72faf6ff90ddf84ed0d60bd607de0c))
* strengthen Pydantic input validation (Phase 1.2 Step 1) ([a60c6e3](https://github.com/sho7650/tech-news-curator/commit/a60c6e35c9df2e839346a818af2c0d38e4aae556))


### Bug Fixes

* correct docker compose merge issues, pydantic-settings type, and prod hardening ([6f1cb15](https://github.com/sho7650/tech-news-curator/commit/6f1cb159cedf6903d9c4f82eb11d42531daab978))
* correct docker compose merge issues, pydantic-settings type, and prod hardening ([7c4ce41](https://github.com/sho7650/tech-news-curator/commit/7c4ce418213556f5f3e026835f150335e9c96c6a))

## [1.1.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.0.0...tech-news-curator-api-v1.1.0) (2026-02-10)


### Features

* add SSRF protection, URL validation, and SSE real-time streaming ([1e11e14](https://github.com/sho7650/tech-news-curator/commit/1e11e1429eca1581dbc3125b7a265fb2e28e4f6f))
* add SSRF protection, URL validation, and SSE real-time streaming ([02c593b](https://github.com/sho7650/tech-news-curator/commit/02c593b095ef48a34da3ae9da0011ec6efce1066))
