import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import { discoverProject } from "@parity-app/project"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { generateLibrary } from "./index.ts"

/** Detection's parse, reduced to what these projects export: function components. */
const renderer = {
  componentExtensions: [".tsx"],
  findComponents: (source: string) =>
    [...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    }))
} as unknown as RendererAdapter

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-app-library-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A solution-style tsconfig whose only reference builds `ui/`, outside `src`, as a Vite app's often does. */
async function writeSources() {
  await write("package.json", JSON.stringify({ name: "shop" }))
  await write("tsconfig.json", JSON.stringify({ files: [], references: [{ path: "./tsconfig.ui.json" }] }))
  await write(
    "tsconfig.ui.json",
    JSON.stringify({ compilerOptions: { jsx: "preserve", strict: true, noEmit: true }, include: ["ui", "src"] })
  )
  // Just enough of React's types for the type checker to tell a component, as installed.
  await write("node_modules/react/package.json", JSON.stringify({ name: "react", types: "index.d.ts" }))
  await write(
    "node_modules/react/index.d.ts",
    [
      "export interface ReactElement { type: unknown; props: unknown; key: string | null }",
      "export type ReactNode = ReactElement | string | number | boolean | null | undefined",
      "declare global {",
      "  namespace JSX {",
      "    interface Element extends ReactElement {}",
      "    interface IntrinsicElements { [name: string]: unknown }",
      "  }",
      "}"
    ].join("\n")
  )
  await write("ui/Label.tsx", "export function Label(props: { text: string }) { return <label>{props.text}</label> }")
  await write("ui/Badge.tsx", "export function Badge(props: { tone: string }) { return <span>{props.tone}</span> }")
  await write("ui/Label.test.tsx", "export function LabelTest() { return <div /> }")
}

/** What detection and app-library generation each found: the component files, the stylesheets and their tokens. */
async function both() {
  const project = await discoverProject(root, renderer)
  const { manifest, report } = await generateLibrary({ root })
  const list = (manifest.components as { list: Record<string, { declaration: string }> } | undefined)?.list ?? {}
  return {
    detected: {
      files: [...new Set(Object.values(project.components).map((source) => source.path))].sort(),
      styles: project.styles
    },
    generated: {
      files: [...new Set(Object.values(list).map((component) => component.declaration))].sort(),
      // Each DTCG token keeps the custom property it came from.
      tokens: [...JSON.stringify(manifest.tokens ?? {}).matchAll(/"var":"([^"]+)"/g)].map((match) => match[1]).sort(),
      notes: report.notes
    }
  }
}

describe("an app library and project detection", () => {
  it("read the same sources and the stylesheet the HTML entry imports from outside src", async () => {
    await writeSources()
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write(
      "src/main.tsx",
      'import styles from "../theme/site.css"\nimport { createRoot } from "react-dom/client"\ncreateRoot(document.body)'
    )
    await write("theme/site.css", '@import "./colors.css";\n:root { --radius: 6px; }')
    await write("theme/colors.css", ":root { --brand: #3355ff; }")

    const { detected, generated } = await both()
    expect(detected.files).toEqual(["ui/Badge.tsx", "ui/Label.tsx"])
    expect(generated.files).toEqual(detected.files)
    expect(detected.styles).toEqual(["theme/site.css"])
    expect(generated.tokens).toEqual(["brand", "radius"])
    expect(generated.notes.join("\n")).not.toContain("No tsconfig")
  })

  it("read the same sources and a Next-style app/globals.css, with its relative @import", async () => {
    await writeSources()
    await write("app/globals.css", '@import "tailwindcss";\n@import "./theme.css";\n:root { --gap: 12px; }')
    await write("app/theme.css", ":root { --brand: #ff5533; }")

    const { detected, generated } = await both()
    expect(generated.files).toEqual(detected.files)
    expect(detected.styles).toEqual(["app/globals.css"])
    expect(generated.tokens).toEqual(["brand", "gap"])
  })

  it("says when the configs include no files, rather than that there are none", async () => {
    await write("package.json", JSON.stringify({ name: "shop" }))
    await write("tsconfig.json", JSON.stringify({ files: [] }))

    const { generated } = await both()
    expect(generated.notes).toContain(
      "tsconfig.json includes no files, so every .tsx and .jsx file in the project was read."
    )
  })
})
