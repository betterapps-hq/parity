import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import { offerPreviewFile, type ReadProjectFile } from "./app-providers.ts"

/** A project's files from their text, by path from its root. */
function files(texts: Record<string, string>): ReadProjectFile {
  return async (path) => texts[path]
}

/** App F's own files, read from the fixture, so the offer follows the app as it's written. */
function appF(): ReadProjectFile {
  const root = join(import.meta.dirname, "../../../fixtures/webpack-react-router")

  return async (path) => readFile(join(root, path), "utf8").catch(() => undefined)
}

describe("a preview file offered from the app's providers (PAR-104)", () => {
  it("wraps app F's frames in its ThemeProvider, with the light or dark theme by the frame's theme", async () => {
    const offer = await offerPreviewFile(appF())

    expect(offer?.file).toBe(".parity/preview.jsx")
    expect(offer?.providers).toEqual([{ name: "ThemeProvider", file: "src/App.jsx", themed: true }])
    expect(offer?.leftOut).toEqual([])
    expect(offer?.text).toBe(`import { ThemeProvider } from 'styled-components'
import { darkTheme, lightTheme } from '../src/theme'

// The providers src/App.jsx renders around the app, around every frame on the canvas.
const withProviders = (Story, context) => (
  <ThemeProvider theme={context.globals.theme === 'dark' ? darkTheme : lightTheme}>
    <Story />
  </ThemeProvider>
)

export const decorators = [withProviders]

export const globalTypes = {
  theme: { description: 'Theme', defaultValue: 'light' },
}
`)
  })

  it("takes the app's own Providers component from the entry, importing it from the preview folder", async () => {
    const offer = await offerPreviewFile(
      files({
        "index.html": `<script type="module" src="/src/main.tsx"></script>`,
        "src/main.tsx": `import { createRoot } from "react-dom/client"
import { Providers } from "./providers"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(<Providers><App /></Providers>)
`
      })
    )

    expect(offer?.file).toBe(".parity/preview.tsx")
    expect(offer?.providers.map((provider) => provider.name)).toEqual(["Providers"])
    expect(offer?.text).toContain(`import { Providers } from "../src/providers"`)
    expect(offer?.text).toContain(`const withProviders = (Story: ComponentType) => (`)
    expect(offer?.text).not.toContain("globalTypes")
  })

  it("nests providers outermost first, passing over StrictMode and the router, and copies what they're made from", async () => {
    const offer = await offerPreviewFile(
      files({
        "src/main.tsx": `import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { IntlProvider } from "react-intl"
import messages from "./messages/en.json"
import App from "./App"

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <IntlProvider locale="en" messages={messages}>
          <App />
        </IntlProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
`
      })
    )

    expect(offer?.providers.map((provider) => provider.name)).toEqual(["QueryClientProvider", "IntlProvider"])
    expect(offer?.text).toContain(`import { QueryClient, QueryClientProvider } from "@tanstack/react-query"`)
    expect(offer?.text).toContain(`import messages from "../src/messages/en.json"`)
    expect(offer?.text).toContain(
      `const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })`
    )
    expect(offer?.text).toContain(`  <QueryClientProvider client={queryClient}>
    <IntlProvider locale="en" messages={messages}>
      <Story />
    </IntlProvider>
  </QueryClientProvider>`)
    expect(offer?.text).not.toContain("BrowserRouter")
  })

  it("leaves out a provider whose prop is the app's state, saying what it needs", async () => {
    const offer = await offerPreviewFile(
      files({
        "src/main.jsx": `import { createRoot } from "react-dom/client"
import App from "./App"

createRoot(document.getElementById("root")).render(<App />)
`,
        "src/App.jsx": `import { useState } from "react"
import { SessionProvider } from "./session"
import { ThemeProvider } from "styled-components"
import { theme } from "./theme"

export default function App() {
  const [user] = useState(null)
  return (
    <SessionProvider user={user}>
      <ThemeProvider theme={theme}>
        <Home />
      </ThemeProvider>
    </SessionProvider>
  )
}
`
      })
    )

    expect(offer?.providers).toEqual([{ name: "ThemeProvider", file: "src/App.jsx", themed: false }])
    expect(offer?.leftOut).toEqual([{ name: "SessionProvider", file: "src/App.jsx", needs: "user" }])
  })

  it("offers nothing when the entry renders no providers", async () => {
    const offer = await offerPreviewFile(
      files({
        "src/main.tsx": `import { createRoot } from "react-dom/client"
import { App } from "./App"

createRoot(document.getElementById("root")!).render(<App />)
`,
        "src/App.tsx": `export function App() {
  return <main><h1>Hello</h1></main>
}
`
      })
    )

    expect(offer).toBeUndefined()
  })

  it("offers nothing when every provider needs something only the running app has", async () => {
    const offer = await offerPreviewFile(
      files({
        "src/index.jsx": `import { createRoot } from "react-dom/client"
import { Provider } from "react-redux"
import App from "./App"

createRoot(document.getElementById("root")).render(<Provider {...props}><App /></Provider>)
`
      })
    )

    expect(offer).toBeUndefined()
  })

  it("offers nothing for a project without an entry", async () => {
    expect(await offerPreviewFile(files({}))).toBeUndefined()
  })
})
