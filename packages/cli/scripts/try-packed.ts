// Packs the CLI as npm will publish it, installs the tarball into an empty folder and runs it there, as someone
// installing @parity-app/cli would: its help, its skill, and the registry's library files it ships. CI runs it on each
// system, since a bundle can work in the workspace and still miss a file or a dependency once it's packed.
// Usage: node packages/cli/scripts/try-packed.ts
import { execSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const cli = join(import.meta.dirname, "..")
const work = mkdtempSync(join(tmpdir(), "parity-cli-"))

/** Runs a command line, without NODE_PATH, which pnpm's shims set and which could find packages the tarball lacks. */
function run(command: string, cwd: string): string {
  return execSync(command, { cwd, encoding: "utf8", env: { ...process.env, NODE_PATH: "" } })
}

function check(passed: boolean, what: string): void {
  if (!passed) throw new Error(`The packed CLI failed: ${what}`)
  console.log(`ok: ${what}`)
}

try {
  run(`pnpm pack --pack-destination "${work}"`, cli)
  const tarball = join(work, readdirSync(work).find((file) => file.endsWith(".tgz")) ?? "")
  const project = join(work, "project")
  mkdirSync(project)
  run(`npm install --no-save --no-package-lock --no-audit --no-fund "${tarball}"`, project)

  check(run("npx parity --help", project).includes("parity tabs"), "`parity --help` prints the commands")
  check(run("npx parity skill", project).startsWith("# Parity"), "`parity skill` prints the skill")

  const dist = join(project, "node_modules", "@parity-app", "cli", "dist")
  const registry = join(cli, "..", "registry")
  const shipped = readdirSync(join(registry, "libraries")).every((file) => existsSync(join(dist, "libraries", file)))
  check(shipped && existsSync(join(dist, "in-app.json")), "it ships every file in the registry and its in-app floors")
  const chunk = readdirSync(dist).find(
    (file) => file.endsWith(".mjs") && readFileSync(join(dist, file), "utf8").includes("function registryEntries(")
  )
  const module: Record<string, unknown> = chunk ? await import(pathToFileURL(join(dist, chunk)).href) : {}
  const registryEntries = Object.values(module).find(
    (value): value is () => Promise<unknown[]> => typeof value === "function" && value.name === "registryEntries"
  )
  const entries = registryEntries ? await registryEntries() : []
  check(entries.length > 0, `the registry reads the ${entries.length} library files it ships`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
