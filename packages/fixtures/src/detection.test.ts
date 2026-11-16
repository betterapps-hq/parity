import { execFile } from "node:child_process"
import { cp, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, expect, it } from "vite-plus/test"
import { type ProjectSnapshot, snapshotProject } from "./detect.ts"

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures")

const projects = (await readdir(fixturesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

/**
 * Level 1 of the validation projects (docs/support.md): Parity's detection on each project in `fixtures/`, compared
 * with the `expected.json` committed beside it. Gaps are recorded as they are, so a change to detection shows here as
 * a diff. When detection gets better, `pnpm vitest run packages/fixtures -u` rewrites the files; review the diff.
 * It runs only in CI, which installs the projects with npm, Yarn and Bun: they're a cross-compatibility check, not
 * something to install locally.
 */
describe.skipIf(!process.env.CI)("detection snapshot", { timeout: 120_000 }, () => {
  it.each(projects)("%s", async (name) => {
    const source = join(fixturesDir, name)

    if (!(await installed(source))) {
      throw new Error(`fixtures/${name} isn't installed. Run: pnpm --filter @parity-app/fixtures install-projects`)
    }

    const snapshot = await snapshotOf(source)

    await expect(`${JSON.stringify(snapshot, null, 2)}
`).toMatchFileSnapshot(join(source, "expected.json"))
  })
})

/**
 * Detects a project. Yarn's map leads to its archives by how many folders up they are, so a Plug'n'Play project is read
 * where it's installed, since in a copy elsewhere its packages aren't found; detection only reads it. Any other project
 * is read from a copy.
 */
async function snapshotOf(source: string): Promise<ProjectSnapshot> {
  if (await exists(join(source, ".pnp.cjs"))) {
    return snapshotInNode(source)
  }

  const root = await copyProject(source)

  try {
    return await snapshotProject(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Copies a project to a temporary folder, so nothing a check does reaches the committed one. Its installed packages
 * are linked rather than copied: they're large, and detection only reads them.
 */
async function copyProject(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `parity-${basename(source)}-`))
  await cp(source, root, {
    recursive: true,
    // Nor what a builder built there, which the Turbopack builder's check may be writing as this copies.
    filter: (path) => !(["node_modules", ".next"].includes(basename(path)) && dirname(path) === source)
  })
  // A junction on Windows needs no special rights; elsewhere the type is ignored and it's a plain symlink.
  await symlink(join(source, "node_modules"), join(root, "node_modules"), "junction")

  return root
}

/**
 * A Plug'n'Play project's snapshot, taken in a Node process of its own, as the app's processes run detection. Vitest
 * resolves the project's own Vite with its copy of Node's resolver, which can't read Yarn's archives, where Node can
 * once Yarn's runtime is loaded.
 */
async function snapshotInNode(root: string): Promise<ProjectSnapshot> {
  const script = fileURLToPath(new URL("snapshot.ts", import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [script, root], { maxBuffer: 64 * 1024 * 1024 })

  // SAFETY: snapshot.ts prints the ProjectSnapshot that snapshotProject returns.
  return JSON.parse(stdout) as ProjectSnapshot
}

/** Whether a project's packages are installed: in `node_modules`, or by Yarn's Plug'n'Play. */
async function installed(project: string): Promise<boolean> {
  return (await exists(join(project, "node_modules"))) || (await exists(join(project, ".pnp.cjs")))
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}
