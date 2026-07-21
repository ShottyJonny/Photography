import './globals.css'
import { Playfair_Display, Newsreader, IBM_Plex_Mono, Hanken_Grotesk } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' })

// `robots` is TEMPORARY -- see app/robots.ts for why, and remove both together.
// Declared here as well as in robots.txt because the two do different jobs: the
// file asks crawlers not to fetch, this tells the ones that fetch anyway not to
// index. app/admin/layout.tsx sets its own noindex and is unaffected either way.
export const metadata = {
  title: 'Jon Hoffman Photography',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${newsreader.variable} ${mono.variable} ${hanken.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme:v1');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
