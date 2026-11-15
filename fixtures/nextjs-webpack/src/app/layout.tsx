import '@mantine/core/styles.css'
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from '@mantine/core'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { NavBar } from '@/components/NavBar'
import { theme } from '@/theme'

export const metadata: Metadata = {
  title: 'Acme',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="auto">
          <NavBar />
          {children}
        </MantineProvider>
      </body>
    </html>
  )
}
