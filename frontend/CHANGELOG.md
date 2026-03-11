# Changelog

## [0.6.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.5.2...tech-news-curator-frontend-v0.6.0) (2026-03-11)


### Features

* **frontend:** add prev/next article navigation ([5560e1e](https://github.com/sho7650/tech-news-curator/commit/5560e1e40aa5455093c84982069677f7f1415075))
* **frontend:** add related articles to sidebar ([6fb38b9](https://github.com/sho7650/tech-news-curator/commit/6fb38b920272bf7bc67571a485ef5e71ff9f643f))
* **frontend:** add sticky article title on scroll ([4d7017c](https://github.com/sho7650/tech-news-curator/commit/4d7017c9cfa1678d56de15806ed1945a3bd892f6))
* **frontend:** integrate layout improvements into article page ([1b5bae3](https://github.com/sho7650/tech-news-curator/commit/1b5bae37c21ed728e242b04f21c39453834227aa))
* **frontend:** widen layout to max-w-7xl with 4-column grid ([1d40f9f](https://github.com/sho7650/tech-news-curator/commit/1d40f9f809f4623f5e1dd8811713cefefac4c420))
* improve news layout with wider grid, sticky title, related articles, and prev/next navigation ([1f5f1d3](https://github.com/sho7650/tech-news-curator/commit/1f5f1d3183c5b93b7e15e180ae68791bac29cc4b))

## [0.5.2](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.5.1...tech-news-curator-frontend-v0.5.2) (2026-03-05)


### Bug Fixes

* restore body_translated in article detail API and frontend ([ff0c467](https://github.com/sho7650/tech-news-curator/commit/ff0c4676ee57eb1b836d0ff1671bcb4049435b75))

## [0.5.1](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.5.0...tech-news-curator-frontend-v0.5.1) (2026-03-05)


### Bug Fixes

* frontend type cleanup and auth security hardening ([19b8cbc](https://github.com/sho7650/tech-news-curator/commit/19b8cbc83f20a6bf8d0792d7d400984e7d18e938))
* remove stale body_translated from frontend types and page ([f47cab1](https://github.com/sho7650/tech-news-curator/commit/f47cab1af17f278fe37d4e78f1ba497d56b1225c))

## [0.5.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.4.0...tech-news-curator-frontend-v0.5.0) (2026-02-15)


### Features

* Phase 3.0 UI refresh - dark mode, fonts, Bento Grid, reading UX ([b82cb3a](https://github.com/sho7650/tech-news-curator/commit/b82cb3aee260c809dabfd6455b81783208e825c0))
* Phase 3.0 UI refresh - dark mode, fonts, Bento Grid, reading UX ([5bbdb75](https://github.com/sho7650/tech-news-curator/commit/5bbdb75a67e4cf787e55e8fafd89a2dc3e194772))


### Bug Fixes

* increase GET /articles rate limit to prevent E2E test failures ([2de04b1](https://github.com/sho7650/tech-news-curator/commit/2de04b1f72fa03367284ed253b1acb7f42ce2755))
* resolve lint errors and E2E test failures for Phase 3.0 ([e24cfb2](https://github.com/sho7650/tech-news-curator/commit/e24cfb29303e9fcf4f9bd4383634782b187eccef))
* use polling assertion in bento-grid E2E test for WebKit hydration ([2f50403](https://github.com/sho7650/tech-news-curator/commit/2f504034c7cc5f278682d55c6904f92298673654))

## [0.4.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.3.1...tech-news-curator-frontend-v0.4.0) (2026-02-13)


### Features

* add Phase 2 public features - sources API, category filter, RSS feed ([10a9708](https://github.com/sho7650/tech-news-curator/commit/10a970855ffebc72b05cb3f021c8c855d5e89aab))
* add Phase 2 public features - sources API, category filter, RSS feed ([b325d1d](https://github.com/sho7650/tech-news-curator/commit/b325d1d07e2fccfb7123bbb6da44871cf8d798be))


### Bug Fixes

* disable CSP upgrade-insecure-requests for E2E tests ([dfe466d](https://github.com/sho7650/tech-news-curator/commit/dfe466ddd726f2a0f221076fed2bcd78c97f7bdb))
* disable standalone output for E2E tests to fix WebKit navigation ([a5be16a](https://github.com/sho7650/tech-news-curator/commit/a5be16a0db22c10316ec53162aed9d74d63e289c))
* remove external image URL from E2E seed data ([420a6c2](https://github.com/sho7650/tech-news-curator/commit/420a6c20f59e1dee36e10d82d5724ff27137f354))
* resolve remaining E2E failures — WebKit 404, webServer timeout, seed errors ([ebe1fb6](https://github.com/sho7650/tech-news-curator/commit/ebe1fb6dc79216aa6694388631a19dfbab05422b))
* resolve WebKit E2E test failures in CI ([87a978f](https://github.com/sho7650/tech-news-curator/commit/87a978fa7da73cc3cbe85117476195d6246b23ec))

## [0.3.1](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.3.0...tech-news-curator-frontend-v0.3.1) (2026-02-12)


### Bug Fixes

* correct docker compose merge issues, pydantic-settings type, and prod hardening ([6f1cb15](https://github.com/sho7650/tech-news-curator/commit/6f1cb159cedf6903d9c4f82eb11d42531daab978))

## [0.3.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.2.0...tech-news-curator-frontend-v0.3.0) (2026-02-11)


### Features

* redesign article list with hero section, responsive grid, and infinite scroll ([0f0e746](https://github.com/sho7650/tech-news-curator/commit/0f0e746af68c1f624235a742c829232dcf1f83d4))
* redesign article list with hero section, responsive grid, and infinite scroll ([76c6a7c](https://github.com/sho7650/tech-news-curator/commit/76c6a7ce44585fd8c3f1e2881a5e04f973e01e6a))

## [0.2.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-frontend-v0.1.0...tech-news-curator-frontend-v0.2.0) (2026-02-10)


### Features

* add SSRF protection, URL validation, and SSE real-time streaming ([1e11e14](https://github.com/sho7650/tech-news-curator/commit/1e11e1429eca1581dbc3125b7a265fb2e28e4f6f))
* add SSRF protection, URL validation, and SSE real-time streaming ([02c593b](https://github.com/sho7650/tech-news-curator/commit/02c593b095ef48a34da3ae9da0011ec6efce1066))
