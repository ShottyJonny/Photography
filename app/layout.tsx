import './globals.css'
import { Playfair_Display, Newsreader, IBM_Plex_Mono, Hanken_Grotesk } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' })

// The pre-launch crawler block is lifted -- see app/robots.ts for the why and
// the conditions it was waiting on. Deliberately no `robots` key here now: its
// absence is what makes the site indexable. app/admin/layout.tsx declares its
// own restriction and is unaffected.
export const metadata = {
  title: 'Jon Hoffman Photography',
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
