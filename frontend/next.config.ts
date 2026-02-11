import type { NextConfig } from 'next'

const API_URL = process.env.API_URL || 'http://news-api:8100'

const nextConfig: NextConfig = {
  output: 'standalone',
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
}

export default nextConfig
