// Response types derived from the API's OpenAPI document.
// Regenerate api-types.ts with `npm run types:generate` after
// `cd ../api && npm run openapi:export`; never edit api-types.ts by hand.
import type { paths } from './api-types'

type Json<T> = T extends { content: { 'application/json': infer Body } } ? Body : never

export type ArticleListResponse = Json<paths['/articles']['get']['responses'][200]>
export type ArticleListItem = ArticleListResponse['items'][number]

export type ArticleDetail = Json<paths['/articles/{article_id}']['get']['responses'][200]>

export type ArticleNeighborsResponse = Json<
  paths['/articles/{article_id}/neighbors']['get']['responses'][200]
>
export type ArticleNeighborItem = NonNullable<ArticleNeighborsResponse['prev']>

export type DigestListResponse = Json<paths['/digest']['get']['responses'][200]>
export type DigestListItem = DigestListResponse['items'][number]
export type DigestResponse = Json<paths['/digest/{digest_date}']['get']['responses'][200]>

export type SourceListResponse = Json<paths['/sources']['get']['responses'][200]>
export type SourceResponse = SourceListResponse['items'][number]
