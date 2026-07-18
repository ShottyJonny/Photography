import './globals.css'
import { Playfair_Display, Newsreader, IBM_Plex_Mono, Hanken_Grotesk } from 'next/font/google'

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' })

export const metadata = { title: 'Jon Hoffman Photography' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${newsreader.variable} ${mono.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  )
}
