import { posix, win32 } from "node:path"
import type { ProjectConfig } from "@parity-app/core"
import { guestModule } from "@parity-app/project"

/*
 * The guest's entry, which the bundler builds: the guest module every builder writes (`guestModule`), in the form a
 * bundler builds, and what lets the canvas load a changed component the way Vite's `?t=` does. It accepts hot updates
 * for every module it imports, so the bundler's hot-update runtime throws away whatever lies between a changed file and
 * those modules, and keeps the rest: React and shared contexts stay the ones the guest loaded with. It accepts its own
 * changes too, so a component added since it loaded comes in when it's written again with it.
 */

/** Where the guest's entry finds the project, the renderer and the global it registers itself under. */
export interface GuestEntryOptions {
  /** The project's root, absolute. */
  root: string
  /** The renderer's guest module, absolute. */
  renderer: string
  /** The global the entry registers what it exports under, unique to this builder. */
  key: string
  /**
   * Project files, relative to the root, the canvas may ask for on their own beyond the components: a component found
   * since the guest loaded.
   */
  extra?: readonly string[]
}

/**
 * A project file as the entry imports it: its absolute path, written the way `root` is, since a bundler's watcher
 * takes `C:/app/a.ts` and `C:\app\a.ts` for two files.
 */
export function entryPath(root: string, path: string): string {
  const relative = componentPath(path)

  return root.includes("\\") ? win32.join(root, relative) : posix.join(root, relative)
}

/** A component's file as the canvas names it, and the entry's loaders are keyed: relative, without `./`. */
export function componentPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.?\//, "")
}

/** The project files the canvas can load a component from: each of the project's own components', and `extra`. */
export function loadablePaths(config: ProjectConfig, extra: readonly string[] = []): string[] {
  const own = Object.values(config.components)
    .filter((source) => !source.library)
    .map((source) => componentPath(source.path))

  return [...new Set([...own, ...extra.map(componentPath)])].sort()
}

/** The guest entry's source. */
export function guestEntrySource(config: ProjectConfig, options: GuestEntryOptions): string {
  const guest = guestModule(config, {
    renderer: options.renderer,
    projectPath: (path) => entryPath(options.root, path),
    styles: "bundled"
  })

  const loadable = loadablePaths(config, options.extra)

  const loaders = loadable.map(
    (path) => `  ${JSON.stringify(path)}: () => import(${JSON.stringify(entryPath(options.root, path))})`
  )

  const accepted = [...new Set([...guest.imports, ...loadable.map((path) => entryPath(options.root, path))])]
  const key = JSON.stringify(options.key)

  return [
    guest.source,
    "const loaders = {",
    loaders.join(",\n"),
    "}",
    "let checking",
    "// Applies the hot update the latest build wrote, if there's one the page hasn't applied, once at a time.",
    "async function update() {",
    "  const hot = import.meta.webpackHot",
    "  if (!hot) return",
    "  // A module nothing accepts, or one that throws as it runs again, is left as it was rather than stopping the rest.",
    "  const options = { ignoreUnaccepted: true, ignoreDeclined: true, ignoreErrored: true }",
    "  // Each build's update takes the page one build on, so it checks until there's none left.",
    '  checking ??= (async () => { try { while (hot.status() === "idle" && (await hot.check(options))?.length) {} } finally { checking = undefined } })()',
    "  await checking",
    "}",
    "// A component's module as the latest build wrote it.",
    "async function load(path) {",
    "  await update()",
    "  const current = globalThis.__parityGuests[" + key + "]",
    "  const loader = current.loaders[path]",
    "  if (!loader) throw new Error(`${path} isn't in the guest`)",
    "  return loader()",
    "}",
    "// What makes a guest, from the guest's modules as the latest build wrote them.",
    "async function parts() {",
    "  await update()",
    "  return guestParts()",
    "}",
    "globalThis.__parityGuests ??= {}",
    `globalThis.__parityGuests[${key}] = { parts, loaders, load }`,
    "if (import.meta.webpackHot) {",
    `  import.meta.webpackHot.accept([${accepted.map((id) => JSON.stringify(id)).join(", ")}], () => {})`,
    "  import.meta.webpackHot.accept()",
    "}",
    ""
  ].join("\n")
}
