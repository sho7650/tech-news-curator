import type { NextConfig } from 'next'

const API_URL = process.env.API_URL || 'http://news-api:8100'
const isDev = process.env.NODE_ENV === 'development'

// CSP ディレクティブ構成
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
if (!isDev) {
  cspDirectives.push('upgrade-insecure-requests')
}
const cspHeader = cspDirectives.join('; ')

const nextConfig: NextConfig = {
  // Docker 本番は standalone、E2E テストは next start 互換のため無効化
  output: process.env.NEXT_OUTPUT_STANDALONE === '0' ? undefined : 'standalone',
  images: {
    // og_image_url は様々な外部サイトから取得するため全 HTTPS ドメインを許可
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // クライアントサイドfetchをAPIにプロキシ（CORS不要）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ]
  },
  async headers() {
    const securityHeaders = [
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]

    return [
      {
        // RSS フィードは XML コンテンツのため CSP 不要
        source: '/api/feed/:path*',
        headers: securityHeaders,
      },
      {
        // RSS 以外の全ページに CSP + セキュリティヘッダーを付与
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
          ...securityHeaders,
        ],
      },
    ]
  },
}

export default nextConfig
