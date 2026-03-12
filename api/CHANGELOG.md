# Changelog

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
