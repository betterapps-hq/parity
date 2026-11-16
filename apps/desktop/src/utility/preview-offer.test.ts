import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { previewOffer, writePreviewFile } from "./preview-offer.ts"

let root: string

async function write(path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), text)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-preview-offer-"))
  await write(
    "src/main.jsx",
    `import { createRoot } from "react-dom/client"
import { ThemeProvider } from "styled-components"
import { theme } from "./theme"
import App from "./App"

createRoot(document.getElementById("root")).render(<ThemeProvider theme={theme}><App /></ThemeProvider>)
`
  )
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("the preview file offered from the app's providers (PAR-104)", () => {
  it("is written where the offer says, with the offer's text", async () => {
    const offer = await previewOffer(root)

    expect(await writePreviewFile(root)).toEqual({ file: ".parity/preview.jsx" })
    expect(await readFile(join(root, ".parity/preview.jsx"), "utf8")).toBe(offer?.text)
  })

  it("isn't offered, or written, once the project has a preview file", async () => {
    await write(".parity/preview.tsx", "export const decorators = []\n")

    expect(await previewOffer(root)).toBeUndefined()
    await expect(writePreviewFile(root)).rejects.toThrow(/has a preview file already/)
    expect(await readFile(join(root, ".parity/preview.tsx"), "utf8")).toBe("export const decorators = []\n")
  })
})
