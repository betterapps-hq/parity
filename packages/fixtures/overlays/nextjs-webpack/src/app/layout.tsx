import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NavBar } from '@/components/NavBar'
import { Provider } from '@/components/Provider'

export const metadata: Metadata = {
  title: 'Acme',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>
          <NavBar />
          {children}
        </Provider>
      </body>
    </html>
  )
}
