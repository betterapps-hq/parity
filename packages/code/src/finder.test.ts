import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { findAll, reactFinder } from "./finder.ts"

/** Exported functions are components, as a renderer's parse would read them. */
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
  root = (await mkdtemp(join(tmpdir(), "canvas-finder-"))).replaceAll("\\", "/")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("finding an app's components through the finder contract", () => {
  it("gives each one's id, file, export, import, role, evidence and props", async () => {
    await write("tsconfig.json", '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } }, "include": ["src"] }')
    await write(
      "src/components/ui/button.tsx",
      'export function Button(props: { size?: "sm" | "lg"; label: string }) { return null }'
    )
    await write("src/app/orders/page.tsx", "export function OrdersPage() { return null }")
    await write("src/features/stat-card.tsx", "export function StatCard(props: { value: number }) { return null }")

    const found = await findAll(reactFinder, renderer, root, "src/components/ui")
    const byId = Object.fromEntries(found.map((component) => [component.id, component]))
    expect(Object.keys(byId).sort()).toEqual(["Button", "OrdersPage", "StatCard"])
    expect(byId.Button).toMatchObject({
      path: "src/components/ui/button.tsx",
      export: "Button",
      import: "@/components/ui/button",
      role: "kit",
      evidence: "function"
    })
    expect(byId.Button!.props?.map((prop) => prop.name).sort()).toEqual(["label", "size"])
    expect(byId.OrdersPage).toMatchObject({ role: "page", import: "@/app/orders/page" })
    expect(byId.StatCard).toMatchObject({ role: "app", import: "@/features/stat-card" })
  })
})
