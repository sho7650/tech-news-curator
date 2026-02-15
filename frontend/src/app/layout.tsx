import type { Metadata } from 'next'
import { Inter, Noto_Sans_JP } from 'next/font/google'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ThemeProvider from '@/components/ThemeProvider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansJP = Noto_Sans_JP({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
  preload: false,
})

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
    <html lang="ja" className={`${inter.variable} ${notoSansJP.variable}`}
          suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-bg-primary text-text-primary antialiased">
        <ThemeProvider>
          <Header />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
