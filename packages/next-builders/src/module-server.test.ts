import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CodeChange } from "@parity-app/core"
import { readTsconfig } from "@parity-app/project"
import { describe, expect, it } from "vite-plus/test"
import { watchCodeChanges } from "./module-server.ts"

describe("the project's code changes", () => {
  it("tells the canvas which components a changed file reaches, a JSON file of data among them", async () => {
    const root = await mkdtemp(join(tmpdir(), "parity-code-changes-"))
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src/prices.json"), '{ "plan": 10 }\n')
    await writeFile(
      join(root, "src/Pricing.tsx"),
      'import prices from "./prices.json"\nexport const Pricing = () => null\n'
    )
    await writeFile(join(root, "README.md"), "# Shop\n")

    const changes: CodeChange[] = []

    const stop = await watchCodeChanges({
      root,
      tsconfig: readTsconfig(root),
      components: () => ["src/Pricing.tsx"],
      stylesDigest: async () => "unchanged",
      send: (change) => changes.push(change)
    })

    try {
      await writeFile(join(root, "README.md"), "# Shop, again\n")
      await new Promise((done) => setTimeout(done, 400))

      expect(changes).toEqual([])

      await writeFile(join(root, "src/prices.json"), '{ "plan": 12 }\n')
      await expect.poll(() => changes.map((change) => change.paths), { timeout: 5000 }).toEqual([["src/Pricing.tsx"]])
      expect(changes[0]?.styles).toBeUndefined()
    } finally {
      stop()
    }
  })
})
