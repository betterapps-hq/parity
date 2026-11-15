import { posix } from "node:path"
import type { GuestAppFile } from "./guest-app.ts"

/*
 * The project's own pages in the guest app (PAR-1164): page frames load the builder's origin at each route's URL, so
 * the guest app serves the project's App Router and Pages Router routes beside its own. Each of the project's route files
 * gets a file of the same name in the guest app that re-exports it, so Next finds the same routes, with the project's own
 * page extensions, and each module still imports what's beside it from where it is.
 */

/** The folders Next reads routes from, by router, from the project root: at the root, or in `src/` when neither is there. */
export const projectRouteFolders = { app: ["app", "src/app"], pages: ["pages", "src/pages"] } as const

/** The route group the project's App Router files go in, so its root layout and the guest's are each a root of their own. */
export const projectRouteGroup = "(project)"

/** The App Router's file conventions that make a route, or wrap one. */
const appConventions = new Set([
  "page",
  "layout",
  "template",
  "loading",
  "error",
  "not-found",
  "global-error",
  "global-not-found",
  "forbidden",
  "unauthorized",
  "default",
  "route"
])

/** The extensions a route file can have: Next's defaults and MDX's, or a custom page extension that ends with one. */
const moduleExtension = /\.(?:tsx|ts|jsx|js|mdx)$/

/**
 * The App Router's segment config, which Next reads from the route's own file, never through a re-export: a value that's
 * a literal is copied instead.
 */
const segmentConfig = new Set([
  "dynamic",
  "dynamicParams",
  "revalidate",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
  "experimental_ppr"
])

/** The folders a project's routes are in, by router, from the project root, for the routers it has. */
export interface RouteFolders {
  app?: string
  pages?: string
}

/** The folders Next reads routes from, of those the project has: `src/` only when neither router's folder is at the root. */
export function routeFolders(present: readonly string[]): RouteFolders {
  const has = new Set(present)
  const atRoot = has.has("app") || has.has("pages")

  const pick = (folders: readonly string[]) =>
    folders.find((folder) => has.has(folder) && atRoot === !folder.startsWith("src/"))

  const folders: RouteFolders = {}
  const app = pick(projectRouteFolders.app)
  const pages = pick(projectRouteFolders.pages)

  if (app) {
    folders.app = app
  }

  if (pages) {
    folders.pages = pages
  }

  return folders
}

/** Whether a file in the App Router's folder is one of its conventions, whatever page extension it has. */
export function isAppRouteFile(path: string): boolean {
  const name = posix.basename(path)

  return moduleExtension.test(name) && !name.endsWith(".d.ts") && appConventions.has(name.split(".")[0] ?? "")
}

/** Whether a file in the Pages Router's folder is a module Next could make a route of. */
export function isPagesRouteFile(path: string): boolean {
  return moduleExtension.test(path) && !path.endsWith(".d.ts")
}

/** A route file of the project's, by its path from the project root, with its text. */
export interface ProjectRouteFile {
  path: string
  text: string
}

/**
 * The guest app's files that mirror the project's routes: its App Router files in the project's route group, its Pages
 * Router files in the guest's `pages/`, each re-exporting its default and named exports from the project's file.
 */
export function projectPageFiles(folders: RouteFolders, files: readonly ProjectRouteFile[]): GuestAppFile[] {
  return files.flatMap((file) => {
    const inApp = folders.app !== undefined && file.path.startsWith(`${folders.app}/`)
    const inPages = folders.pages !== undefined && file.path.startsWith(`${folders.pages}/`)

    if (inApp && isAppRouteFile(file.path)) {
      const path = posix.join("app", projectRouteGroup, file.path.slice(folders.app!.length + 1))

      return [{ path, text: reexport(path, file, "app") }]
    }

    if (inPages && isPagesRouteFile(file.path)) {
      const path = posix.join("pages", file.path.slice(folders.pages!.length + 1))

      return [{ path, text: reexport(path, file, "pages") }]
    }

    return []
  })
}

/** A mirror's text: the project's file's default and named exports, and its segment config's literal values. */
function reexport(path: string, file: ProjectRouteFile, router: "app" | "pages"): string {
  const from = JSON.stringify(projectSpecifier(path, file.path))

  // An MDX page's Markdown is its default export, which MDX's loader writes whether the file exports one or not.
  const names = file.path.endsWith(".mdx")
    ? [...new Set(["default", ...exportNames(file.text)])]
    : exportNames(file.text)

  const lines = [`// Written by Parity's Next.js builder: ${file.path}, as a route of the guest app.`]

  // Next checks the directive on the route's file itself, as an error boundary's, so the mirror says it too.
  if (/^\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*["']use client["']/.test(file.text)) {
    lines.push('"use client"')
  }

  // What the file passes on from another module by `export *`, whose names only that module knows.
  if (/\bexport\s*\*\s*from\b/.test(withoutComments(file.text))) {
    lines.push(`export * from ${from}`)
  }

  const copied = router === "app" ? segmentLiterals(file.text) : []
  const reexported = names.filter((name) => name !== "default" && !copied.some(([copy]) => copy === name))
  // The Pages Router reads a page's `config` from its own file alone, but an API route's when it answers, as its body
  // parser's settings, so an API route's is passed on.
  const api = router === "pages" && path.startsWith("pages/api/")
  const kept = router === "pages" && !api ? reexported.filter((name) => name !== "config") : reexported

  if (names.includes("default")) {
    lines.push(`export { default } from ${from}`)
  }

  if (kept.length > 0) {
    lines.push(`export { ${kept.join(", ")} } from ${from}`)
  }

  for (const [name, value] of copied) {
    lines.push(`export const ${name} = ${value}`)
  }

  return `${lines.join("\n")}\n`
}

/** How a mirror at `path` in the guest app imports the project's file, without its extension unless it's MDX. */
export function projectSpecifier(path: string, projectPath: string): string {
  const target = projectPath.endsWith(".mdx") ? projectPath : projectPath.replace(/\.(?:tsx|ts|jsx|js)$/, "")
  const relative = posix.relative(posix.dirname(posix.join(".next/parity", path)), target)

  return relative.startsWith(".") ? relative : `./${relative}`
}

/** The names a module exports, `default` among them, read from its text: declarations and export lists. */
export function exportNames(text: string): string[] {
  const names = new Set<string>()
  const code = withoutComments(text)

  if (/\bexport\s+default\b/.test(code)) {
    names.add("default")
  }

  for (const match of code.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g
  )) {
    names.add(match[1]!)
  }

  for (const match of code.matchAll(/\bexport\s+(?:declare\s+)?(?:const|let|var)\s+/g)) {
    for (const name of declaredNames(code, match.index + match[0].length)) {
      names.add(name)
    }
  }

  for (const match of code.matchAll(/\bexport\s*\*\s*as\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]!)
  }

  for (const match of code.matchAll(/\bexport\s+(type\s+)?\{([^}]*)\}/g)) {
    if (match[1]) {
      continue
    }

    for (const part of match[2]!.split(",")) {
      const spec = part.trim()

      if (spec === "" || spec.startsWith("type ")) {
        continue
      }

      const name = spec
        .split(/\s+as\s+/)
        .pop()!
        .trim()

      if (/^[A-Za-z_$][\w$]*$/.test(name)) {
        names.add(name)
      }
    }
  }

  return [...names]
}

/**
 * The names a variable statement declares, from just after its `const`, `let` or `var`: each declarator's, as in
 * `GET = handler, POST = handler`, and each a destructuring pattern binds, as in `{ GET, POST: post } = handlers`.
 */
function declaredNames(code: string, start: number): string[] {
  const declarators: string[] = []
  let depth = 0
  let quote = ""
  let current = ""

  for (let index = start; index < code.length; index++) {
    const char = code[index]!

    if (quote) {
      quote = char === quote && code[index - 1] !== "\\" ? "" : quote
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char
    } else if ("([{".includes(char)) {
      depth++
    } else if (")]}".includes(char)) {
      depth--
    } else if (depth === 0 && (char === ";" || (char === "\n" && !/^\s*,/.test(code.slice(index + 1))))) {
      // A declaration ends at a semicolon, or a line break that no comma follows and none of its brackets spans.
      if (char === ";" || (current.trim() !== "" && !/=\s*$/.test(current))) {
        break
      }
    } else if (depth === 0 && char === ",") {
      declarators.push(current)
      current = ""
      continue
    }

    current += char
  }

  declarators.push(current)

  return declarators
    .flatMap((raw) => {
      const declarator = raw.trim()

      return /^[{[]/.test(declarator)
        ? patternNames(declarator.slice(0, matchingBracket(declarator) + 1))
        : [/^[A-Za-z_$][\w$]*/.exec(declarator)?.[0] ?? ""]
    })
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
}

/** How a character changes the depth of brackets: an opening one goes in, a closing one comes out. */
function bracketStep(char: string): number {
  if ("([{".includes(char)) {
    return 1
  }

  return ")]}".includes(char) ? -1 : 0
}

/** Where the bracket a declarator starts with closes. */
function matchingBracket(text: string): number {
  let depth = 0

  for (let index = 0; index < text.length; index++) {
    depth += bracketStep(text[index]!)

    if (depth === 0) {
      return index
    }
  }

  return text.length - 1
}

/** The names a destructuring pattern binds: `{ a, b: c, ...d }` binds `a`, `c` and `d`; `[a, , b]` binds `a` and `b`. */
function patternNames(pattern: string): string[] {
  const inner = pattern.trim().slice(1, -1)
  const parts: string[] = []
  let depth = 0
  let part = ""

  for (const char of inner) {
    depth += bracketStep(char)

    if (depth === 0 && char === ",") {
      parts.push(part)
      part = ""
    } else {
      part += char
    }
  }

  parts.push(part)

  return parts.flatMap((raw) => {
    const spec = raw.trim().replace(/^\.\.\./, "")

    const bound = (pattern.trim().startsWith("{") && spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec)
      .split("=")[0]!
      .trim()

    return /^[{[]/.test(bound) ? patternNames(bound) : [bound]
  })
}

/** A module's text without its comments, which may mention exports it doesn't make. */
function withoutComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")
}

/**
 * The segment config a route's file gives as literals, by name, with each value's text: a string, number, boolean or
 * array, which may span lines, then the statement's or line's end, or a comment.
 */
export function segmentLiterals(text: string): [string, string][] {
  const declaration =
    /^export\s+const\s+([A-Za-z_]\w*)\s*(?::[^=\n]+)?=\s*("[^"\n]*"|'[^'\n]*'|-?\d+(?:\.\d+)?|true|false|\[[^\]]*\])(?:\s+as\s+const)?[ \t]*(?:;|\/\/|\/\*|$)/gm

  return [...text.matchAll(declaration)].flatMap((match): [string, string][] =>
    segmentConfig.has(match[1]!) ? [[match[1]!, match[2]!]] : []
  )
}
