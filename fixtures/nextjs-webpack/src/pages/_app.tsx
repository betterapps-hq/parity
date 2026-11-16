import type { AppProps } from 'next/app'
import { NavBar } from '@/components/NavBar'
import { Provider } from '@/components/Provider'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Provider>
      <NavBar />
      <Component {...pageProps} />
    </Provider>
  )
}
