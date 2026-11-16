import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { PreviewDescription } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findPreviewFile, findProjectPreview } from "./preview-file.ts"

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-preview-file-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function write(path: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), "export const decorators = []\n")
}

describe("the project's preview file (PAR-100)", () => {
  it("is .parity/preview.tsx", async () => {
    await write(".parity/preview.tsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.tsx")
  })

  it("can be JavaScript, for a project its loaders compile as JavaScript", async () => {
    await write(".parity/preview.jsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.jsx")
  })

  it("is the TypeScript one when there are several", async () => {
    await write(".parity/preview.js")
    await write(".parity/preview.tsx")

    expect(await findPreviewFile(root)).toBe(".parity/preview.tsx")
  })

  it("isn't there without the folder, or with only other files in it", async () => {
    expect(await findPreviewFile(root)).toBeUndefined()

    await write(".parity/preview.css")

    expect(await findPreviewFile(root)).toBeUndefined()
  })
})

describe("a preview an extension names for its tool (PAR-98)", () => {
  const storybook: PreviewDescription = {
    id: "storybook",
    files: [".storybook/preview.tsx", ".storybook/preview.ts"],
    compose: { api: "portable-stories", from: ["@storybook/react", "@storybook/react-vite"] }
  }

  const framework = { devDependencies: { "@storybook/react-vite": "10.6.5" } }

  it("is the first of its files that's there, composed with the first of its packages the project depends on", async () => {
    await write(".storybook/preview.ts")

    expect(await findProjectPreview(root, framework, [storybook])).toEqual({
      preview: ".storybook/preview.ts",
      previewComposer: { api: "portable-stories", module: "@storybook/react-vite", extension: "storybook" }
    })
  })

  it("isn't used without a package to compose it, or without its file", async () => {
    await write(".storybook/preview.ts")

    expect(
      await findProjectPreview(root, { devDependencies: { "@storybook/vue3-vite": "10.6.5" } }, [storybook])
    ).toEqual({})

    expect(await findProjectPreview(root, framework, [{ ...storybook, files: [".storybook/preview.jsx"] }])).toEqual({})
  })

  it("gives way to Parity's preview file, which replaces it on the canvas", async () => {
    await write(".storybook/preview.ts")
    await write(".parity/preview.tsx")

    expect(await findProjectPreview(root, framework, [storybook])).toEqual({ preview: ".parity/preview.tsx" })
  })
})
