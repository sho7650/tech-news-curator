import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Tech News Curator',
  description: '海外テックニュースを日本語で',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-gray-50 antialiased`}
      >
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
