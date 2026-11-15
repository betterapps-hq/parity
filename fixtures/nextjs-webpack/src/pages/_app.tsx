import '@mantine/core/styles.css'
import { MantineProvider } from '@mantine/core'
import type { AppProps } from 'next/app'
import { NavBar } from '@/components/NavBar'
import { theme } from '@/theme'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <NavBar />
      <Component {...pageProps} />
    </MantineProvider>
  )
}
