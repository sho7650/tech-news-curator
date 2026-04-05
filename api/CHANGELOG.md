# Changelog

## [1.11.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.10.0...tech-news-curator-api-v1.11.0) (2026-04-05)


### Features

* add API Key authentication for write endpoints (Phase 1.2 Step 2) ([36008dc](https://github.com/sho7650/tech-news-curator/commit/36008dc5a68128d9042f35a326540c2d21fec690))
* add CI/CD security scanning pipeline (Phase 1.2 Step 8) ([b1a8849](https://github.com/sho7650/tech-news-curator/commit/b1a8849d36a74d2ac3525b7f96a52cf73c6edfab))
* add cleanArticleText() for refined noise removal in ingest pipeline ([b898fad](https://github.com/sho7650/tech-news-curator/commit/b898fad60ffad3f4cb3bf2a6e8ed0d45dd695554))
* add drizzle-orm migration system ([9be2355](https://github.com/sho7650/tech-news-curator/commit/9be2355cd5492051f68d79a4a5e7b81792a1404f))
* add drizzle-orm migration system for production-safe schema management ([8a93f80](https://github.com/sho7650/tech-news-curator/commit/8a93f800f59af0fdb7a4d56035a720cc0174712c))
* add Phase 2 public features - sources API, category filter, RSS feed ([10a9708](https://github.com/sho7650/tech-news-curator/commit/10a970855ffebc72b05cb3f021c8c855d5e89aab))
* add Phase 2 public features - sources API, category filter, RSS feed ([b325d1d](https://github.com/sho7650/tech-news-curator/commit/b325d1d07e2fccfb7123bbb6da44871cf8d798be))
* add rate limiting with slowapi and SSE connection limits (Phase 1.2 Step 3) ([28b0802](https://github.com/sho7650/tech-news-curator/commit/28b0802a75657851a4130f6cc6147745750778ec))
* add security headers middleware and global exception handlers (Phase 1.2 Step 4) ([8787e9b](https://github.com/sho7650/tech-news-curator/commit/8787e9b0a22bb3cd1524bed47cc1362b1b79df4c))
* add service layer unit tests (Phase 1.2 Step 6) ([7f97745](https://github.com/sho7650/tech-news-curator/commit/7f97745a5c107280b63b2bdf8f5078e80733dd03))
* add SSRF protection, URL validation, and SSE real-time streaming ([1e11e14](https://github.com/sho7650/tech-news-curator/commit/1e11e1429eca1581dbc3125b7a265fb2e28e4f6f))
* add SSRF protection, URL validation, and SSE real-time streaming ([02c593b](https://github.com/sho7650/tech-news-curator/commit/02c593b095ef48a34da3ae9da0011ec6efce1066))
* add trailing contact info removal to ingest pipeline ([127dfd5](https://github.com/sho7650/tech-news-curator/commit/127dfd54ca4bb0bd6395195be75eee8a39a1a310))
* add trailing contact info removal to ingest pipeline ([a3e13a5](https://github.com/sho7650/tech-news-curator/commit/a3e13a5290bea64901729bfb2fc90acfb927487e))
* **api:** add GET /articles/:id/neighbors endpoint ([9e4367d](https://github.com/sho7650/tech-news-curator/commit/9e4367dd10431e0415241e4be08898e6bc650edb))
* **api:** add structured logging with Pino ([9b881d3](https://github.com/sho7650/tech-news-curator/commit/9b881d3ad489bd417ba5fbf396b483c1276c84ed))
* **api:** add structured logging with Pino ([f4a61f0](https://github.com/sho7650/tech-news-curator/commit/f4a61f0fa6c1b1d9d38ca773070e93006299d2c3))
* extend ingest noise removal and add E2E snapshot tests ([973015c](https://github.com/sho7650/tech-news-curator/commit/973015cc2d38127155409c4662603b6a329827cd))
* extend ingest noise removal and add E2E snapshot tests ([e409896](https://github.com/sho7650/tech-news-curator/commit/e40989691f9a3adb2de1179fae5faf6556a47d1a))
* harden Docker infrastructure (Phase 1.2 Step 5) ([682caad](https://github.com/sho7650/tech-news-curator/commit/682caad88c72faf6ff90ddf84ed0d60bd607de0c))
* improve news layout with wider grid, sticky title, related articles, and prev/next navigation ([1f5f1d3](https://github.com/sho7650/tech-news-curator/commit/1f5f1d3183c5b93b7e15e180ae68791bac29cc4b))
* Phase 3.0 UI refresh - dark mode, fonts, Bento Grid, reading UX ([b82cb3a](https://github.com/sho7650/tech-news-curator/commit/b82cb3aee260c809dabfd6455b81783208e825c0))
* rewrite backend API from Python FastAPI to TypeScript Hono ([bd5198b](https://github.com/sho7650/tech-news-curator/commit/bd5198b110e9615b5b22c888033b17f2da468398))
* rewrite backend API from Python FastAPI to TypeScript Hono ([ececf0b](https://github.com/sho7650/tech-news-curator/commit/ececf0b06f9aeb4669204048f84f7dbb6e5051f0))
* strengthen Pydantic input validation (Phase 1.2 Step 1) ([a60c6e3](https://github.com/sho7650/tech-news-curator/commit/a60c6e35c9df2e839346a818af2c0d38e4aae556))


### Bug Fixes

* add metadata type guard and eliminate timing leak in auth ([a814946](https://github.com/sho7650/tech-news-curator/commit/a814946d49c2754dcf6dc26811f185e4d1a533e3))
* add URL protocol validation and null guard for metadata ([c8010e2](https://github.com/sho7650/tech-news-curator/commit/c8010e24f27c8d9a14dfe59300ac42cb9c75ed45))
* add URL protocol validation and null guard for metadata ([959f39f](https://github.com/sho7650/tech-news-curator/commit/959f39fc2a8974f4e0988f48f05a24941a1087a9))
* **api:** update hono and @hono/node-server to fix high severity CVEs ([6c949c8](https://github.com/sho7650/tech-news-curator/commit/6c949c843615f048968cb603cf423262e73ef240))
* code quality improvements from autonomous improvement loop ([e3305b4](https://github.com/sho7650/tech-news-curator/commit/e3305b4b8c0ae1137d13c297dadd241e5e5d6ce6))
* correct docker compose merge issues, pydantic-settings type, and prod hardening ([6f1cb15](https://github.com/sho7650/tech-news-curator/commit/6f1cb159cedf6903d9c4f82eb11d42531daab978))
* correct docker compose merge issues, pydantic-settings type, and prod hardening ([7c4ce41](https://github.com/sho7650/tech-news-curator/commit/7c4ce418213556f5f3e026835f150335e9c96c6a))
* eliminate any types, add URL validation, fix null assertion [round 1] ([6acef29](https://github.com/sho7650/tech-news-curator/commit/6acef298c4b31cfe03ec8cd492bb779d942f8d7d))
* extract shared DB type, add server.close() to shutdown [round 3] ([2e2ac9e](https://github.com/sho7650/tech-news-curator/commit/2e2ac9e4a391cd6fb72fe716e0315e2095427070))
* frontend type cleanup and auth security hardening ([19b8cbc](https://github.com/sho7650/tech-news-curator/commit/19b8cbc83f20a6bf8d0792d7d400984e7d18e938))
* increase GET /articles rate limit to prevent E2E test failures ([2de04b1](https://github.com/sho7650/tech-news-curator/commit/2de04b1f72fa03367284ed253b1acb7f42ce2755))
* **ingest:** use realistic browser headers and refactor safe-fetch ([a63af67](https://github.com/sho7650/tech-news-curator/commit/a63af67691fb10423ffa911d73238f79041db89f))
* **ingest:** use realistic browser headers in safe-fetch to avoid 403 ([cd3e026](https://github.com/sho7650/tech-news-curator/commit/cd3e02679d800ac3e359e39de262550b150372c3))
* list schema files explicitly in drizzle config to avoid CJS resolution failure ([91e5efb](https://github.com/sho7650/tech-news-curator/commit/91e5efb5328cb8233ad9cf2609d4b0ce9ddb278f))
* remove await on void broadcast() in article-monitor ([8b312e5](https://github.com/sho7650/tech-news-curator/commit/8b312e562c4de5bcfa8eceaa48957278364ac484))
* remove unnecessary copyright restriction on article detail API ([acf2ea7](https://github.com/sho7650/tech-news-curator/commit/acf2ea7a1093ed311db444057e78549033bf6f21))
* remove unnecessary copyright restriction on article detail API ([8249123](https://github.com/sho7650/tech-news-curator/commit/8249123b56a4958b01adf1129c5ea1152367242e))
* resolve 12 QA issues [round 1] ([7955f52](https://github.com/sho7650/tech-news-curator/commit/7955f524ea9d2eacfd802c1b3d08f28ad6e66c52))
* resolve 3 QA issues [round 3] ([2a40526](https://github.com/sho7650/tech-news-curator/commit/2a405261eacf3d18003bc81c06624326a64ab475))
* resolve 4 QA issues [round 1] ([114622b](https://github.com/sho7650/tech-news-curator/commit/114622b532c6a99706cda7df146be036e5e56ba0))
* resolve 4 QA issues [round 3] ([8d4481e](https://github.com/sho7650/tech-news-curator/commit/8d4481ef061974c048810b6b5cebd8e4e4e83800))
* resolve 6 QA issues [round 2] ([42fb530](https://github.com/sho7650/tech-news-curator/commit/42fb5306a88d6c7271277e2af16645f2dd81c4b5))
* resolve 8 QA issues [round 2] ([8ec5bb0](https://github.com/sho7650/tech-news-curator/commit/8ec5bb0ed5df33288b81208a78b2d847018ad974))
* resolve CI lint format error and drizzle-kit schema loading ([73be7b3](https://github.com/sho7650/tech-news-curator/commit/73be7b3c5bd132e688d4780ad78ef27aeb98a43c))
* restore body_translated in article detail API and frontend ([ff0c467](https://github.com/sho7650/tech-news-curator/commit/ff0c4676ee57eb1b836d0ff1671bcb4049435b75))
* restore body_translated in article detail API and frontend rendering ([1bc43a0](https://github.com/sho7650/tech-news-curator/commit/1bc43a0967d0949e8170fd338f17fb94b62ec33c))
* update url-validator tests to match dns.promises refactor ([7248f95](https://github.com/sho7650/tech-news-curator/commit/7248f95ecaf717f27fb9c2d6de3d117cd1f13dcd))
* upgrade vulnerable dependencies (lodash, picomatch, brace-expansion, yaml) ([ad2c0a7](https://github.com/sho7650/tech-news-curator/commit/ad2c0a7b947641775601efc2128b3e591b35d1a5))
* upgrade vulnerable dependencies to resolve npm audit failures ([43b28a4](https://github.com/sho7650/tech-news-curator/commit/43b28a418730c97b816896b8cc71992d346dbd7a))


### Performance

* optimize article queries and fix NULL ordering [round 4] ([08e8d60](https://github.com/sho7650/tech-news-curator/commit/08e8d6063deb26c7f9039a56c051ce7b7660cfcd))

## [1.10.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.9.2...tech-news-curator-api-v1.10.0) (2026-04-05)


### Features

* add drizzle-orm migration system ([9be2355](https://github.com/sho7650/tech-news-curator/commit/9be2355cd5492051f68d79a4a5e7b81792a1404f))
* add drizzle-orm migration system for production-safe schema management ([8a93f80](https://github.com/sho7650/tech-news-curator/commit/8a93f800f59af0fdb7a4d56035a720cc0174712c))


### Bug Fixes

* upgrade vulnerable dependencies (lodash, picomatch, brace-expansion, yaml) ([ad2c0a7](https://github.com/sho7650/tech-news-curator/commit/ad2c0a7b947641775601efc2128b3e591b35d1a5))

## [1.9.2](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.9.1...tech-news-curator-api-v1.9.2) (2026-03-21)


### Bug Fixes

* upgrade vulnerable dependencies to resolve npm audit failures ([43b28a4](https://github.com/sho7650/tech-news-curator/commit/43b28a418730c97b816896b8cc71992d346dbd7a))

## [1.9.1](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.9.0...tech-news-curator-api-v1.9.1) (2026-03-12)


### Bug Fixes

* add URL protocol validation and null guard for metadata ([c8010e2](https://github.com/sho7650/tech-news-curator/commit/c8010e24f27c8d9a14dfe59300ac42cb9c75ed45))
* add URL protocol validation and null guard for metadata ([959f39f](https://github.com/sho7650/tech-news-curator/commit/959f39fc2a8974f4e0988f48f05a24941a1087a9))

## [1.9.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.5...tech-news-curator-api-v1.9.0) (2026-03-11)


### Features

* **api:** add GET /articles/:id/neighbors endpoint ([9e4367d](https://github.com/sho7650/tech-news-curator/commit/9e4367dd10431e0415241e4be08898e6bc650edb))
* improve news layout with wider grid, sticky title, related articles, and prev/next navigation ([1f5f1d3](https://github.com/sho7650/tech-news-curator/commit/1f5f1d3183c5b93b7e15e180ae68791bac29cc4b))

## [1.8.5](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.4...tech-news-curator-api-v1.8.5) (2026-03-06)


### Bug Fixes

* remove unnecessary copyright restriction on article detail API ([acf2ea7](https://github.com/sho7650/tech-news-curator/commit/acf2ea7a1093ed311db444057e78549033bf6f21))
* remove unnecessary copyright restriction on article detail API ([8249123](https://github.com/sho7650/tech-news-curator/commit/8249123b56a4958b01adf1129c5ea1152367242e))

## [1.8.4](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.3...tech-news-curator-api-v1.8.4) (2026-03-05)


### Bug Fixes

* restore body_translated in article detail API and frontend ([ff0c467](https://github.com/sho7650/tech-news-curator/commit/ff0c4676ee57eb1b836d0ff1671bcb4049435b75))

## [1.8.3](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.2...tech-news-curator-api-v1.8.3) (2026-03-05)


### Bug Fixes

* add metadata type guard and eliminate timing leak in auth ([a814946](https://github.com/sho7650/tech-news-curator/commit/a814946d49c2754dcf6dc26811f185e4d1a533e3))
* frontend type cleanup and auth security hardening ([19b8cbc](https://github.com/sho7650/tech-news-curator/commit/19b8cbc83f20a6bf8d0792d7d400984e7d18e938))

## [1.8.2](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.1...tech-news-curator-api-v1.8.2) (2026-03-05)


### Bug Fixes

* resolve 4 QA issues [round 1] ([114622b](https://github.com/sho7650/tech-news-curator/commit/114622b532c6a99706cda7df146be036e5e56ba0))
* resolve 4 QA issues [round 3] ([8d4481e](https://github.com/sho7650/tech-news-curator/commit/8d4481ef061974c048810b6b5cebd8e4e4e83800))
* resolve 6 QA issues [round 2] ([42fb530](https://github.com/sho7650/tech-news-curator/commit/42fb5306a88d6c7271277e2af16645f2dd81c4b5))


### Performance

* optimize article queries and fix NULL ordering [round 4] ([08e8d60](https://github.com/sho7650/tech-news-curator/commit/08e8d6063deb26c7f9039a56c051ce7b7660cfcd))

## [1.8.1](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.8.0...tech-news-curator-api-v1.8.1) (2026-03-05)


### Bug Fixes

* **ingest:** use realistic browser headers and refactor safe-fetch ([a63af67](https://github.com/sho7650/tech-news-curator/commit/a63af67691fb10423ffa911d73238f79041db89f))
* **ingest:** use realistic browser headers in safe-fetch to avoid 403 ([cd3e026](https://github.com/sho7650/tech-news-curator/commit/cd3e02679d800ac3e359e39de262550b150372c3))
* remove await on void broadcast() in article-monitor ([8b312e5](https://github.com/sho7650/tech-news-curator/commit/8b312e562c4de5bcfa8eceaa48957278364ac484))

## [1.8.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.7.2...tech-news-curator-api-v1.8.0) (2026-03-05)


### Features

* **api:** add structured logging with Pino ([9b881d3](https://github.com/sho7650/tech-news-curator/commit/9b881d3ad489bd417ba5fbf396b483c1276c84ed))
* **api:** add structured logging with Pino ([f4a61f0](https://github.com/sho7650/tech-news-curator/commit/f4a61f0fa6c1b1d9d38ca773070e93006299d2c3))


### Bug Fixes

* **api:** update hono and @hono/node-server to fix high severity CVEs ([6c949c8](https://github.com/sho7650/tech-news-curator/commit/6c949c843615f048968cb603cf423262e73ef240))

## [1.7.2](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.7.1...tech-news-curator-api-v1.7.2) (2026-03-04)


### Bug Fixes

* code quality improvements from autonomous improvement loop ([e3305b4](https://github.com/sho7650/tech-news-curator/commit/e3305b4b8c0ae1137d13c297dadd241e5e5d6ce6))
* resolve 12 QA issues [round 1] ([7955f52](https://github.com/sho7650/tech-news-curator/commit/7955f524ea9d2eacfd802c1b3d08f28ad6e66c52))
* resolve 3 QA issues [round 3] ([2a40526](https://github.com/sho7650/tech-news-curator/commit/2a405261eacf3d18003bc81c06624326a64ab475))

## [1.7.1](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.7.0...tech-news-curator-api-v1.7.1) (2026-03-04)


### Bug Fixes

* eliminate any types, add URL validation, fix null assertion [round 1] ([6acef29](https://github.com/sho7650/tech-news-curator/commit/6acef298c4b31cfe03ec8cd492bb779d942f8d7d))
* extract shared DB type, add server.close() to shutdown [round 3] ([2e2ac9e](https://github.com/sho7650/tech-news-curator/commit/2e2ac9e4a391cd6fb72fe716e0315e2095427070))
* resolve 8 QA issues [round 2] ([8ec5bb0](https://github.com/sho7650/tech-news-curator/commit/8ec5bb0ed5df33288b81208a78b2d847018ad974))
* update url-validator tests to match dns.promises refactor ([7248f95](https://github.com/sho7650/tech-news-curator/commit/7248f95ecaf717f27fb9c2d6de3d117cd1f13dcd))

## [1.7.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.6.0...tech-news-curator-api-v1.7.0) (2026-03-04)


### Features

* add trailing contact info removal to ingest pipeline ([127dfd5](https://github.com/sho7650/tech-news-curator/commit/127dfd54ca4bb0bd6395195be75eee8a39a1a310))
* add trailing contact info removal to ingest pipeline ([a3e13a5](https://github.com/sho7650/tech-news-curator/commit/a3e13a5290bea64901729bfb2fc90acfb927487e))

## [1.6.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.5.0...tech-news-curator-api-v1.6.0) (2026-03-01)


### Features

* add cleanArticleText() for refined noise removal in ingest pipeline ([b898fad](https://github.com/sho7650/tech-news-curator/commit/b898fad60ffad3f4cb3bf2a6e8ed0d45dd695554))
* extend ingest noise removal and add E2E snapshot tests ([973015c](https://github.com/sho7650/tech-news-curator/commit/973015cc2d38127155409c4662603b6a329827cd))
* extend ingest noise removal and add E2E snapshot tests ([e409896](https://github.com/sho7650/tech-news-curator/commit/e40989691f9a3adb2de1179fae5faf6556a47d1a))

## [1.5.0](https://github.com/sho7650/tech-news-curator/compare/tech-news-curator-api-v1.4.0...tech-news-curator-api-v1.5.0) (2026-02-27)


### Features

* rewrite backend API from Python FastAPI to TypeScript Hono ([bd5198b](https://github.com/sho7650/tech-news-curator/commit/bd5198b110e9615b5b22c888033b17f2da468398))
* rewrite backend API from Python FastAPI to TypeScript Hono ([ececf0b](https://github.com/sho7650/tech-news-curator/commit/ececf0b06f9aeb4669204048f84f7dbb6e5051f0))


### Bug Fixes

* list schema files explicitly in drizzle config to avoid CJS resolution failure ([91e5efb](https://github.com/sho7650/tech-news-curator/commit/91e5efb5328cb8233ad9cf2609d4b0ce9ddb278f))
* resolve CI lint format error and drizzle-kit schema loading ([73be7b3](https://github.com/sho7650/tech-news-curator/commit/73be7b3c5bd132e688d4780ad78ef27aeb98a43c))
