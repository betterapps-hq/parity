import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { preferredExports } from "./icon-exports.ts"

/** Writes a declaration file, runs `test` with its path, and removes it. */
async function withTypes(text: string, test: (file: string) => void): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "parity-icon-types-"))
  try {
    const file = join(dir, "index.d.ts")
    await writeFile(file, text)
    test(file)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe("preferredExports", () => {
  it("prefers a name that isn't deprecated, as Phosphor's current names", async () => {
    await withTypes(
      `type Icon = (props: { weight?: string }) => unknown
declare const I: Icon;
/** @deprecated Use GearIcon */
export declare const Gear: Icon;
export { I as GearIcon };
export declare const Acorn: Icon;`,
      (file) => {
        expect(preferredExports(file, [["Gear", "GearIcon"], ["Acorn"]], () => true)).toEqual(["GearIcon"])
      }
    )
  })

  it("prefers the name an icon is declared under over its aliases, as Lucide's", async () => {
    await withTypes(
      `type Icon = (props: { size?: number }) => unknown
declare const TriangleAlert: Icon;
declare const X: Icon;
export { TriangleAlert, TriangleAlert as AlertTriangle, TriangleAlert as TriangleAlertIcon, X, X as XIcon };`,
      (file) => {
        // X is already the shortest, so it needs no entry.
        const groups = [
          ["AlertTriangle", "TriangleAlert", "TriangleAlertIcon"],
          ["X", "XIcon"]
        ]
        expect(preferredExports(file, groups, () => true)).toEqual(["TriangleAlert"])
      }
    )
  })

  it("only prefers names the set's pattern allows", async () => {
    await withTypes(
      `type Icon = () => unknown
declare const I: Icon;
/** @deprecated */
export declare const Gear: Icon;
export { I as GearFreeIcons };`,
      (file) => {
        expect(preferredExports(file, [["Gear", "GearFreeIcons"]], (name) => !name.endsWith("FreeIcons"))).toEqual([])
      }
    )
  })
})
