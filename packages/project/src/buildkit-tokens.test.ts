import { newestEntries } from "@parity-app/registry"
import { describe, expect, it } from "vite-plus/test"
import { describedTokens } from "./libraries.ts"

// Buildkit's styles ship their tokens as a DTCG resolver (PAR-139), which `parity lib` copies into each registry file.
const styles = (await newestEntries()).filter((entry) =>
  entry.manifest.package?.name.startsWith("@buildkitgg/shadcn-baseui-")
)

describe("Buildkit's style tokens", () => {
  it("covers all eight styles", () => {
    expect(styles.map((entry) => entry.manifest.id ?? "").sort((a, b) => a.localeCompare(b))).toEqual([
      "luma",
      "lyra",
      "maia",
      "mira",
      "nova",
      "rhea",
      "sera",
      "vega"
    ])
  })

  it.each(styles.map((entry) => [entry.manifest.id, entry] as const))(
    "reads %s's tokens whole, each typed and described, with dark values where they differ",
    async (_id, entry) => {
      const notes: string[] = []
      const described = await describedTokens("", entry.path, entry.manifest, notes, entry.file)
      expect(notes).toEqual([])
      expect(described?.error).toBeUndefined()
      const tokens = described?.tokens ?? []
      expect(tokens.filter((token) => !token.type || !token.description).map((token) => token.path)).toEqual([])
      const byPath = new Map(tokens.map((token) => [token.path, token]))
      // A path is its CSS variable's name split at each hyphen, with a group's own token in `$root`.
      expect(byPath.get("card.foreground")).toMatchObject({ type: "color", description: "Text on cards." })
      expect(byPath.get("card.foreground")?.values.dark).toBeDefined()
      expect(byPath.get("radius")?.type).toBe("dimension")
      expect(byPath.get("radius.lg")?.values.default).toBe(byPath.get("radius")?.values.default)
    }
  )
})
