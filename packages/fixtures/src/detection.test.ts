import { cp, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vite-plus/test"
import { snapshotProject } from "./detect.ts"

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures")
const projects = (await readdir(fixturesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/**
 * Level 1 of the validation projects (docs/support.md): Parity's detection on each project in `fixtures/`, compared
 * with the `expected.json` committed beside it. Gaps are recorded as they are, so a change to detection shows here as
 * a diff. When detection gets better, `pnpm vitest run packages/fixtures -u` rewrites the files; review the diff.
 */
describe("detection snapshot", { timeout: 120_000 }, () => {
  it.each(projects)("%s", async (name) => {
    const source = join(fixturesDir, name)
    if (!(await exists(join(source, "node_modules")))) {
      throw new Error(`fixtures/${name} isn't installed. Run: pnpm --filter @parity-app/fixtures install-projects`)
    }
    const root = await copyProject(source)
    try {
      const snapshot = await snapshotProject(root)
      await expect(`${JSON.stringify(snapshot, null, 2)}\n`).toMatchFileSnapshot(join(source, "expected.json"))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

/**
 * Copies a project to a temporary folder, so nothing a check does reaches the committed one. Its installed packages
 * are linked rather than copied: they're large, and detection only reads them.
 */
async function copyProject(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `parity-${basename(source)}-`))
  await cp(source, root, {
    recursive: true,
    filter: (path) => !(basename(path) === "node_modules" && dirname(path) === source)
  })
  // A junction on Windows needs no special rights; elsewhere the type is ignored and it's a plain symlink.
  await symlink(join(source, "node_modules"), join(root, "node_modules"), "junction")
  return root
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}
