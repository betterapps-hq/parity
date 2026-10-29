import { readdir, readFile } from "node:fs/promises"
import { join, posix, relative } from "node:path"
import {
  commandOption,
  type ComponentSource,
  type PackageManifest,
  scriptRunning,
  type StorybookInfo,
  type StoryFile
} from "@parity/core"
import { findConfig } from "./configs.ts"

/** Storybook's own config: `main` in its config folder, with any extension Storybook accepts. */
const mainConfig = { files: ["main"], extensions: ["ts", "mts", "cts", "js", "mjs", "cjs"], here: true }
const storyFile = /\.stories\.(?:[cm]?[jt]sx?)$/
const skipped = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "storybook-static", ".turbo"])
const moduleExtensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"]

/**
 * The project's Storybook, if it has one: where its config is, the script that starts it and the port it asks for,
 * and which components have stories. A story file belongs to a component when its meta's `component` is imported
 * from that component's module.
 */
export async function findStorybook(
  root: string,
  pkg: PackageManifest & { scripts?: Record<string, string> },
  components: Record<string, ComponentSource>,
  resolveAlias: (specifier: string) => Promise<string | undefined>
): Promise<StorybookInfo | undefined> {
  const config = await storybookConfig(root, pkg)
  if (!config) return undefined
  const { configDir, main, script } = config
  const port = script ? Number(commandOption(script[1], ["-p", "--port"])) || undefined : undefined
  const stories: Record<string, StoryFile[]> = {}
  for (const path of await findStoryFiles(root)) {
    const source = await readFile(join(root, path), "utf8").catch(() => "")
    const parsed = parseStoryFile(source)
    if (!parsed.component) continue
    const imported = importsOf(source).get(parsed.component)
    if (!imported) continue
    const key = await componentFor(path, imported, components, resolveAlias)
    if (!key) continue
    ;(stories[key] ??= []).push({ path, ...(parsed.title ? { title: parsed.title } : {}), exports: parsed.exports })
  }
  return {
    configDir: posix.normalize(configDir.replaceAll("\\", "/")),
    main,
    ...(script ? { script: script[0] } : {}),
    ...(port ? { port } : {}),
    stories
  }
}

/**
 * Where the project's Storybook config is: the folder its `storybook dev` script names with `-c` or `--config-dir`, else
 * `.storybook`, and the `main` file there, relative to the root.
 */
export async function storybookConfig(
  root: string,
  pkg: PackageManifest
): Promise<{ configDir: string; main: string; script?: [name: string, command: string] } | undefined> {
  const script = scriptRunning(pkg.scripts, /\bstorybook\s+dev\b/)
  const configDir = (script && commandOption(script[1], ["-c", "--config-dir"])) ?? ".storybook"
  const main = await findConfig(root, join(root, configDir), mainConfig)
  return main ? { configDir, main, ...(script ? { script } : {}) } : undefined
}

async function findStoryFiles(root: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (folder: string) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name) && !entry.name.startsWith(".")) await walk(join(folder, entry.name))
      } else if (storyFile.test(entry.name)) {
        found.push(relative(root, join(folder, entry.name)).replaceAll("\\", "/"))
      }
    }
  }
  await walk(root)
  return found.sort()
}

/** The meta's component and title, and the stories a CSF file exports. */
export function parseStoryFile(source: string): { component?: string; title?: string; exports: string[] } {
  const component = /\bcomponent\s*:\s*([A-Za-z_$][\w$]*)/.exec(source)?.[1]
  const title = /\btitle\s*:\s*["'`]([^"'`]+)["'`]/.exec(source)?.[1]
  const exports = [...source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]!)
  return { ...(component ? { component } : {}), ...(title ? { title } : {}), exports }
}

/** What each imported name refers to: the module it comes from and the name it has there. */
function importsOf(source: string): Map<string, { specifier: string; name: string }> {
  const found = new Map<string, { specifier: string; name: string }>()
  for (const match of source.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
    const [clause, specifier] = [match[1]!, match[2]!]
    const named = /\{([^}]*)\}/.exec(clause)?.[1]
    for (const part of named?.split(",") ?? []) {
      const [name, local] = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .map((text) => text.trim())
      if (name) found.set(local ?? name, { specifier, name })
    }
    const fallback = /^([A-Za-z_$][\w$]*)/.exec(clause.trim())?.[1]
    if (fallback) found.set(fallback, { specifier, name: "default" })
  }
  return found
}

async function componentFor(
  storyPath: string,
  imported: { specifier: string; name: string },
  components: Record<string, ComponentSource>,
  resolveAlias: (specifier: string) => Promise<string | undefined>
): Promise<string | undefined> {
  const { specifier, name } = imported
  // A library component is imported by its package name.
  const fromPackage = Object.entries(components).find(
    ([, source]) => source.library && source.path === specifier && source.export === name
  )
  if (fromPackage) return fromPackage[0]
  const base = specifier.startsWith(".")
    ? posix.normalize(posix.join(posix.dirname(storyPath), specifier))
    : await resolveAlias(specifier)
  if (!base) return undefined
  const stem = base.replace(/\.[cm]?[jt]sx?$/, "")
  const candidates = new Set([base, ...moduleExtensions.map((extension) => stem + extension)])
  const match = Object.entries(components).find(
    ([, source]) => !source.library && candidates.has(source.path) && source.export === name
  )
  return match?.[0]
}
