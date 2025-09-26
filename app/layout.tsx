import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stamp Comparison App',
  description: 'Compare two stamps to see if they match',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
