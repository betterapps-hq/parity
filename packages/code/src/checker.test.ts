import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { findComponents } from "./checker.ts"

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = (await mkdtemp(join(tmpdir(), "canvas-checker-"))).replaceAll("\\", "/")
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("finding an app's components with the checker", () => {
  it("lists a component an index re-exports once, where it's declared", async () => {
    await write(
      "src/components/widgets/stat-card.tsx",
      "export function StatCard(props: { label: string }) { return null }"
    )
    await write(
      "src/components/index.tsx",
      'export { StatCard } from "./widgets/stat-card"\nexport { StatCard as Stat } from "./widgets/stat-card"'
    )
    // The index comes first, so without the rule it would be listed there, as `Stat`.
    const entries = ["src/components/index.tsx", "src/components/widgets/stat-card.tsx"].map(
      (path) => `${root}/${path}`
    )
    const report = findComponents({ entries, root, defaultExports: true })
    expect(report.components.map((component) => [component.name, component.entry.slice(root.length + 1)])).toEqual([
      ["StatCard", "src/components/widgets/stat-card.tsx"]
    ])
  })
})
