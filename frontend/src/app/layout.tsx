import type { Metadata } from 'next'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ThemeProvider from '@/components/ThemeProvider'
// Fonts are bundled from npm (@fontsource) instead of next/font/google:
// Turbopack's build-time download from fonts.gstatic.com is unreliable inside
// Docker builds (see docs/DESIGN-font-self-hosting.md). Same self-hosting and
// unicode-range subsetting, but fetched via npm ci. font-display: swap built in.
import '@fontsource-variable/inter'
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/700.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tech News Curator',
  description: '海外テックニュースを日本語で',
  alternates: {
    types: {
      'application/rss+xml': '/api/feed/rss',
    },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-bg-primary text-text-primary antialiased">
        <ThemeProvider>
          <Header />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
