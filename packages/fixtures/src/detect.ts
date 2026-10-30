import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { viteBuilder } from "@parity-app/builder-vite"
import {
  type BuilderAdapter,
  type BuilderDetection,
  type ComponentSource,
  type Detection,
  type PackageManagerDetection,
  type PackageManifest,
  prepareCanvasCss,
  type RendererAdapter,
  type StorybookInfo,
  type StylesAdapter,
  type ThemeVariable
} from "@parity-app/core"
import { detectProject, discoverProject } from "@parity-app/project"
import { reactRenderer } from "@parity-app/renderer-react"
import { tailwindStyles } from "@parity-app/styles-tailwind"
import { extractTokens } from "@parity-app/tokens"

// The adapters the desktop app opens projects with.
const renderers: RendererAdapter[] = [reactRenderer]
const builders: BuilderAdapter[] = [viteBuilder]
const stylesAdapters: StylesAdapter[] = [tailwindStyles]

/**
 * The version cutoff depends on the date, so snapshots are taken as of a fixed one and don't change by themselves. Move
 * it forward when the supported versions are reviewed.
 */
export const checkedOn = new Date("2026-10-28T00:00:00Z")

/** Everything Parity's detection found in a project, as the validation projects' `expected.json` records it. */
export interface ProjectSnapshot {
  /** `true`, or the error the desktop app would show instead of opening the project. */
  opens: true | string
  renderer: string | null
  builder: (BuilderDetection & { id: string }) | null
  packageManager: PackageManagerDetection
  /** Installed versions of the tools Parity runs or renders with, checked against the version cutoff. */
  tools: Detection[]
  notice?: string
  styles: {
    stylesheets: string[]
    /** Stylesheets detection named that aren't in the project. */
    missing: string[]
    adapter?: string
    error?: string
  }
  tokens: {
    count: number
    /** How many tokens of each category, the styling framework's scale included. */
    categories: Record<string, number>
    /** The project's own tokens, with their value in each theme. */
    semantic: Record<string, Record<string, string>>
  }
  /** Themes the tokens have values for; `default` is the root. */
  themes: string[]
  breakpoints: Record<string, string>
  components: Record<string, ComponentSource>
  libraries: Record<string, unknown>[]
  icons: Record<string, unknown>[]
  storybook: StorybookInfo | null
  notes: string[]
}

/**
 * Runs Parity's detection on a project without a window or a dev server: the steps the desktop app takes when it opens
 * one (`start` in apps/desktop/src/utility/projects.ts), up to starting the builder. Where the app stops at the first
 * problem, this records the problem and carries on, so the snapshot shows everything detection finds. Tokens are read
 * from the stylesheets' sources; the app reads the CSS the builder compiles from them.
 */
export async function snapshotProject(root: string): Promise<ProjectSnapshot> {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as PackageManifest & { name?: string }
  const problems: string[] = []
  const renderer = renderers.find((adapter) => adapter.detect(pkg))
  if (!renderer) problems.push(`No renderer supports ${pkg.name ?? root}`)

  let builder: ProjectSnapshot["builder"] = null
  const misses: string[] = []
  for (const adapter of builders) {
    try {
      const detection = await adapter.detect(root)
      if (detection.found) {
        builder = { id: adapter.id, ...detection }
        break
      }
      misses.push(`${adapter.name}: ${detection.summary}`)
    } catch (error) {
      problems.push(message(error))
    }
  }
  const detection = await detectProject(
    root,
    pkg,
    builder ? { id: builder.id, detection: builder } : undefined,
    checkedOn
  )
  if (!builder && misses.length > 0) problems.push(`No builder supports ${root}.\n${misses.join("\n")}`)

  const config = renderer ? await discoverProject(root, renderer, pkg) : undefined
  const stylesheets = config?.styles ?? []
  const sources = await Promise.all(
    stylesheets.map((path) => readFile(join(root, path), "utf8").catch(() => undefined))
  )
  const styles: ProjectSnapshot["styles"] = {
    stylesheets,
    missing: stylesheets.filter((_, index) => sources[index] === undefined)
  }
  let theme: ThemeVariable[] = []
  for (const [index, stylesheet] of stylesheets.entries()) {
    const adapter = stylesAdapters.find((candidate) => candidate.detect(sources[index] ?? ""))
    if (!adapter) continue
    styles.adapter = adapter.id
    // As the app does: an untested version is tried like any other, and a failure says it's untested.
    try {
      theme = await adapter.loadTheme(root, stylesheet)
    } catch (error) {
      const tool = detection.tools.find((candidate) => candidate.id === adapter.id)
      styles.error = `${message(error)}${tool?.status === "dropped" ? ` (${tool.summary})` : ""}`
    }
    break
  }

  const css = prepareCanvasCss(sources.filter((source) => source !== undefined).join("\n"), {
    baseUrl: "http://localhost"
  }).scoped
  const tokens = extractTokens(css, theme)
  const categories: Record<string, number> = {}
  for (const token of tokens) categories[token.category] = (categories[token.category] ?? 0) + 1
  const themes = new Set(tokens.flatMap((token) => Object.keys(token.values)))
  const breakpoints: Record<string, string> = {}
  for (const token of tokens.filter((candidate) => candidate.category === "breakpoint")) {
    breakpoints[token.name] = token.values.default ?? Object.values(token.values)[0] ?? ""
  }
  const libraries = config?.libraries ?? []
  for (const library of libraries) {
    for (const breakpoint of library.breakpoints ?? [])
      breakpoints[`${library.id}/${breakpoint.id}`] = `${breakpoint.width}px`
  }

  const components = Object.entries(config?.components ?? {})
  // The app ends any error with the note naming untested versions, which may be the cause.
  const error = problems.length > 0 ? [...problems, detection.notice].filter(Boolean).join("\n\n") : undefined
  const snapshot: ProjectSnapshot = {
    opens: error ?? true,
    renderer: renderer?.id ?? null,
    builder,
    packageManager: detection.packageManager,
    tools: detection.tools,
    ...(detection.notice ? { notice: detection.notice } : {}),
    styles,
    tokens: {
      count: tokens.length,
      categories: sorted(categories),
      semantic: Object.fromEntries(
        tokens.filter((token) => token.source === "semantic").map((token) => [token.name, token.values])
      )
    },
    themes: [...themes].sort(defaultFirst),
    breakpoints,
    components: sorted(Object.fromEntries(components.filter(([, source]) => !source.library))),
    libraries: libraries
      .filter((library) => library.kind !== "icons")
      .map((library) => ({
        id: library.id,
        package: library.package,
        version: library.version,
        stylesImported: library.stylesImported,
        components: components.filter(([, source]) => source.library === library.id).length
      })),
    icons: libraries
      .filter((library) => library.kind === "icons")
      .map((library) => ({ id: library.id, package: library.package, version: library.version })),
    storybook: config?.storybook ?? null,
    notes: config?.notes ?? []
  }
  return withoutRoot(snapshot, root)
}

/** Compares theme names alphabetically, with the default theme first. */
function defaultFirst(a: string, b: string): number {
  if (a === "default") return -1
  if (b === "default") return 1
  return a.localeCompare(b, "en")
}

function sorted<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b, "en")))
}

/** The snapshot with the project's folder, a temporary copy, written as `<project>` wherever it appears. */
function withoutRoot<T>(value: T, root: string): T {
  const forms = [root, root.replaceAll("\\", "/")]
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
    typeof item === "string" ? forms.reduce((text, form) => text.replaceAll(form, "<project>"), item) : item
  ) as T
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
