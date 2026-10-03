import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Newsreader } from 'next/font/google'
import { ThemeProvider, themeInitScript } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth-context'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['italic', 'normal'],
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'et-alicite | A Place to Organize, Manage, and Collaborate on Research',
  description:
    'Organize research chapters, manage academic sources and citations, assign tasks, and collaborate with your research group — with an AI research guide alongside you.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/favicon.png',
        sizes: '48x48',
        type: 'image/png',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    siteName: 'et-alicite',
    images: [
      {
        url: 'https://et-alicite.vercel.app/og-image.png',
        width: 1200,
        height: 630,
        alt: 'et-alicite — Research workspace for student teams',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['https://et-alicite.vercel.app/og-image.png'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#eef2fb',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'et-alicite',
              url: 'https://et-alicite.vercel.app/',
            }),
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
