import { createHash } from "node:crypto"
import { posix } from "node:path"
import { importSpecifiers } from "@parity-app/code"
import type { CodeSnapshot } from "./code-fingerprint.ts"

/** Extensions an import may leave out, in the order bundlers try them. */
const moduleExtensions = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs", ".cts", ".cjs"]

/** Lockfiles, by name, wherever they are. */
const lockfileNames = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"])

/**
 * The project file an import names, among the files a snapshot holds: a relative path, a path from the root, or a
 * tsconfig alias (`alias` gives its path, as `resolvePathAlias` does), with or without its extension or `/index`. A
 * TypeScript file imported as `.js` is found too. Nothing for a package, whose version the lockfile stands for.
 */
export function resolveModule(
  from: string,
  specifier: string,
  files: ReadonlyMap<string, unknown>,
  alias: (specifier: string) => string | undefined
): string | undefined {
  const bare = specifier.replace(/[?#].*$/, "")
  let base: string | undefined

  if (bare.startsWith(".")) {
    base = posix.join(posix.dirname(from), bare)
  } else if (bare.startsWith("/")) {
    base = bare.slice(1)
  } else {
    base = alias(bare)
  }

  if (!base) {
    return undefined
  }

  const stems = [base, ...(/\.[cm]?jsx?$/.test(base) ? [base.replace(/\.[cm]?jsx?$/, "")] : [])]

  for (const stem of stems) {
    for (const candidate of [stem, ...moduleExtensions.map((extension) => `${stem}${extension}`)]) {
      if (files.has(candidate)) {
        return candidate
      }
    }
  }

  return moduleExtensions.map((extension) => `${base}/index${extension}`).find((candidate) => files.has(candidate))
}

/** The project files a file's source imports (see `resolveModule`); a stylesheet's are its `@import`s. */
export function importedFiles(
  path: string,
  source: string,
  files: ReadonlyMap<string, unknown>,
  alias: (specifier: string) => string | undefined
): string[] {
  const specifiers = importSpecifiers(source, path.endsWith(".css"))

  return [...new Set(specifiers.flatMap((specifier) => resolveModule(path, specifier, files, alias) ?? []))]
}

/**
 * Every project file `entries` reach through their imports, themselves included, sorted. `importsOf` gives the files a
 * file imports, resolved; one that can't be read imports nothing.
 */
export async function moduleClosure(
  entries: Iterable<string>,
  importsOf: (path: string) => Promise<readonly string[]>
): Promise<string[]> {
  const reached = new Set<string>()
  let next = [...new Set(entries)]

  while (next.length > 0) {
    for (const path of next) {
      reached.add(path)
    }

    const imported = await Promise.all(next.map((path) => importsOf(path).catch(() => [])))
    next = [...new Set(imported.flat())].filter((path) => !reached.has(path))
  }

  return [...reached].sort((a, b) => a.localeCompare(b, "en"))
}

/**
 * Files every preview depends on whatever it imports: the root's package.json, tsconfigs and tool configs (Vite,
 * Tailwind, PostCSS), and every lockfile, which stands for the versions of the packages components import.
 */
export function sharedPreviewFiles(snapshot: CodeSnapshot): string[] {
  return [...snapshot.files.keys()].filter((path) => {
    const name = path.slice(path.lastIndexOf("/") + 1)

    if (lockfileNames.has(name)) {
      return true
    }

    if (path.includes("/")) {
      return false
    }

    return name === "package.json" || /^tsconfig.*\.json$/.test(name) || /\.config\.[cm]?[jt]s$/.test(name)
  })
}

/** What a component preview's key is made of (PAR-207). */
export interface PreviewKeyInput {
  /** What's drawn and how: the tree, the mode and its size, the theme, the scale. Not where it's drawn from. */
  drawn: unknown
  /**
   * The project files the picture depends on: its components' files and everything they import, the stylesheets and
   * what they import, and `sharedPreviewFiles`. Their sizes and times come from the snapshot.
   */
  files: Iterable<string>
  snapshot: CodeSnapshot
  /** Parity's renderer and the previews' format, so a new Parity doesn't show the last one's pictures. */
  salt: string
}

/**
 * A component preview's name on disk: a hash of what's drawn and of each file it depends on, as the snapshot found it.
 * A file the picture doesn't depend on changing leaves it alone, so an edit re-makes only the previews of components
 * that import what changed; a stylesheet changing re-makes every one.
 */
export function previewKey({ drawn, files, snapshot, salt }: PreviewKeyInput): string {
  const hash = createHash("sha256").update(salt).update("\0").update(JSON.stringify(drawn)).update("\0")

  for (const path of [...new Set(files)].sort((a, b) => a.localeCompare(b, "en"))) {
    hash.update(`${path}\0${snapshot.files.get(path) ?? "-"}\0`)
  }

  return hash.digest("hex").slice(0, 40)
}
