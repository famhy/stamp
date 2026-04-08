import type { Metadata } from 'next'
import Link from 'next/link'
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
      <body>
        <nav style={{
          display: 'flex',
          gap: '1rem',
          padding: '0.75rem 1.5rem',
          background: '#1e1e2e',
          borderBottom: '1px solid #333',
          flexWrap: 'wrap',
        }}>
          <Link href="/" style={{ color: '#cdd6f4', textDecoration: 'none', fontWeight: 500 }}>Home</Link>
          <Link href="/stamp" style={{ color: '#cdd6f4', textDecoration: 'none', fontWeight: 500 }}>Stamp v1</Link>
          <Link href="/stamp2" style={{ color: '#cdd6f4', textDecoration: 'none', fontWeight: 500 }}>Stamp v2</Link>
          <Link href="/stamp3" style={{ color: '#cdd6f4', textDecoration: 'none', fontWeight: 500 }}>Stamp v3</Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
