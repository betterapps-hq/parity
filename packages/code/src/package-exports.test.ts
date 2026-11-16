import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { packageExports } from "./package-exports.ts"

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = (await mkdtemp(join(tmpdir(), "canvas-package-exports-"))).replaceAll("\\", "/")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("packageExports (PAR-1168)", () => {
  it("names every value an entry exports, whatever declares it, through each kind of re-export", async () => {
    await write(
      "dist/index.d.mts",
      [
        'export * from "./card.mjs"',
        'export { Panel, Kept as Renamed } from "./panel.mjs"',
        'export * as Menu from "./menu.mjs"',
        'export { default as Badge } from "./badge.mjs"',
        'export * as Dialog from "@radix-ui/react-dialog"',
        'export { Slot } from "@radix-ui/react-slot"',
        "declare const Local: unknown",
        "export { Local }",
        "export declare const One: Factory<{}>, Two: Factory<{}>",
        'export type { PanelProps } from "./panel.mjs"',
        "export interface Theme { dark: boolean }",
        'export * from "./types.mjs"'
      ].join("\n")
    )
    await write(
      "dist/card.d.mts",
      "export declare const Card: Factory<{ props: CardProps }>\ntype Factory<T> = () => T"
    )
    await write("dist/badge.d.mts", "declare const Badge: () => null\nexport default Badge")
    // A value, but only its type is passed on.
    await write(
      "dist/types.d.mts",
      'export type { Hidden } from "./panel.mjs"\nexport { type Kept as Typed } from "./panel.mjs"'
    )
    await write("dist/menu.d.mts", "export declare const Root: () => null")
    await write(
      "dist/panel.d.mts",
      "export declare const Panel: () => null\nexport declare const Kept: () => null\nexport declare const Hidden: () => null\nexport type PanelProps = {}"
    )

    expect([...packageExports(join(root, "dist/index.d.mts"))].sort()).toEqual([
      "Badge",
      "Card",
      "Dialog",
      "Local",
      "Menu",
      "One",
      "Panel",
      "Renamed",
      "Slot",
      "Two"
    ])
  })

  it("names nothing for an entry that isn't there", () => {
    expect(packageExports(join(root, "missing.d.ts")).size).toBe(0)
  })
})
