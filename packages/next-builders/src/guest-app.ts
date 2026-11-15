import { posix } from "node:path"

/*
 * The guest app: a small Next.js app of Parity's own, which the builder runs the project's own Next on, so Next compiles
 * the project's components with the project's config, as the app's own `next dev` would (docs/proposals/nextjs-builders.md).
 * It lives inside the project, since Next's bundlers compile nothing outside the project's root, in `.next/`, which every
 * Next.js project ignores in git.
 */

/** The guest app's folder, from the project root. */
export const guestAppFolder = ".next/parity"

/** Where Next builds the guest app to, from the guest app's folder: `.next/parity-build` in the project. */
export const guestBuildFolder = "../parity-build"

/** The guest app's routes: the guest, the project's global stylesheets, and packages' stylesheets, each a page of its own. */
export const guestRoutes = { guest: "/", styles: "/styles", packageStyles: "/package-styles" } as const

/** Where the guest module is in the guest app, from its folder. */
export const guestModuleFile = "app/guest.tsx"

/** A file to write, by its path from the guest app's folder, with its whole text. */
export interface GuestAppFile {
  path: string
  text: string
}

export interface GuestAppOptions {
  /** The project root, absolute, with forward slashes. */
  root: string
  /** The folder of the project's own Next, absolute, with forward slashes, whose config loader the guest app uses. */
  next: string
  /** Where the builder serves the guest app: its chunks, fonts and images load from here, wherever the page is. */
  origin: string
  /** The guest module's source, written `bundled`: it exports `guestParts()` (`@parity-app/project`'s `guestModule`). */
  guestSource: string
  /** The project's global stylesheets, by path from the root. */
  styles: readonly string[]
  /** Packages' global stylesheets, by the specifier the app imports them by. */
  packageStyles: readonly string[]
  /** The project's Next config file, from the root, when it has one. */
  config?: string
  /** The project's PostCSS config file, from the root, when it has one. */
  postcss?: string
  /** The project's `tsconfig.json` or `jsconfig.json`, when it has one. */
  tsconfig?: string
}

/** How a module in the guest app's `app/` folder imports a project file, from the file's path from the root. */
export function projectImport(path: string): string {
  return posix.join("../../..", path.replaceAll("\\", "/").replace(/^\.?\//, ""))
}

/** The guest app's files. */
export function guestAppFiles(options: GuestAppOptions): GuestAppFile[] {
  const files: GuestAppFile[] = [
    { path: "next.config.mjs", text: nextConfigSource(options) },
    { path: "app/layout.tsx", text: layoutSource },
    {
      path: "app/page.tsx",
      text: 'import Guest from "./guest"\n\nexport default function Page() {\n  return <Guest />\n}\n'
    },
    // A client module, so the browser gets it; `guestParts` imports the guest's modules when the canvas asks for them.
    {
      path: guestModuleFile,
      text: `"use client"\n\n${options.guestSource}\nexport default function Guest() {\n  return null\n}\n`
    },
    // The stylesheets compile on pages of their own, so each page's CSS is theirs alone.
    { path: "app/styles/page.tsx", text: stylesPage(options.styles.map((path) => `../${projectImport(path)}`)) },
    { path: "app/package-styles/page.tsx", text: stylesPage(options.packageStyles) }
  ]

  if (options.tsconfig) {
    // Extending the project's, so its path aliases resolve as the project's own modules expect.
    files.push({
      path: options.tsconfig,
      text: `${JSON.stringify({ extends: `../../${options.tsconfig}` }, null, 2)}\n`
    })
  }

  if (options.postcss) {
    files.push({ path: "postcss.config.mjs", text: postcssConfigSource(options.postcss) })
  }

  files.push({ path: tailwindBaseFile, text: tailwindBaseSource(options.root) })

  return files
}

/** The guest app's module that points Tailwind's plugins at the project, which both its configs import. */
const tailwindBaseFile = "tailwind-base.mjs"

/**
 * Tailwind's PostCSS and Turbopack plugins look for class names from where they run unless they're given a `base`, and
 * Next runs them from the guest app's folder, so the guest app gives them the project's root, where `next dev` runs.
 */
function tailwindBaseSource(root: string): string {
  return `// Written by Parity's Next.js builder each time it starts.
const plugins = new Set(["@tailwindcss/postcss", "@tailwindcss/turbopack"])

/** A Tailwind plugin's options with the project's root as its base, unless it has one; another plugin's as they are. */
export function withTailwindBase(name, options) {
  if (!plugins.has(name) || options === false) {
    return options
  }

  const given = options !== null && typeof options === "object" ? options : {}

  return given.base === undefined ? { ...given, base: ${JSON.stringify(root)} } : given
}

/** Turbopack's rules, with Tailwind's loaders given the project's root. */
export function rulesWithTailwindBase(rules) {
  const loader = (entry) => {
    const name = typeof entry === "string" ? entry : entry?.loader

    return plugins.has(name) ? { ...(typeof entry === "object" ? entry : { loader: name }), options: withTailwindBase(name, entry.options) } : entry
  }

  const rule = (value) =>
    Array.isArray(value) ? value.map(rule) : Array.isArray(value?.loaders) ? { ...value, loaders: value.loaders.map(loader) } : value

  return Object.fromEntries(Object.entries(rules ?? {}).map(([glob, value]) => [glob, rule(value)]))
}
`
}

/** The guest app's PostCSS config: the project's, with Tailwind's plugin given the project's root. */
function postcssConfigSource(postcss: string): string {
  return `import config from ${JSON.stringify(`../../${postcss}`)}
import { withTailwindBase } from "./${tailwindBaseFile}"

const plugin = (entry) =>
  typeof entry === "string" ? [entry, withTailwindBase(entry, {})] : [entry[0], withTailwindBase(entry[0], entry[1])]

export default {
  ...config,
  plugins: Array.isArray(config?.plugins)
    ? config.plugins.map(plugin)
    : Object.fromEntries(Object.entries(config?.plugins ?? {}).map(([name, options]) => [name, withTailwindBase(name, options)]))
}
`
}

const layoutSource = `import type { ReactNode } from "react"

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

function stylesPage(specifiers: readonly string[]): string {
  return [
    ...specifiers.map((specifier) => `import ${JSON.stringify(specifier)}`),
    "",
    "export default function Page() {",
    "  return null",
    "}",
    ""
  ].join("\n")
}

/**
 * The guest app's Next config: the project's own, loaded the way Next loads it, against the project's folder so that a
 * path the config works out from `import.meta.url` comes out the same, with only what serving the canvas needs changed.
 * Its assets and images load from the builder's server, wherever the page that loads them is; its routes are the guest
 * app's, so the project's base path, locales, rewrites and redirects are left out, and so are its output and folder.
 * Next runs CSS loaders from the guest app's folder, so its Turbopack rules give Tailwind's the project's root to look
 * for class names from, and it builds to a folder beside the guest app's, where nothing that looks from there reads it.
 */
export function nextConfigSource(options: Pick<GuestAppOptions, "root" | "next" | "origin" | "config">): string {
  const configFile = options.config ? posix.join(options.root, options.config) : undefined

  const load = configLoader(configFile, options.root)

  return `// Written by Parity's Next.js builder each time it starts. The project's own config is ${options.config ?? "absent"}.
import { createRequire } from "node:module"
import { rulesWithTailwindBase } from "./${tailwindBaseFile}"

const require = createRequire(${JSON.stringify(posix.join(options.next, "package.json"))})
const { normalizeConfig } = require("./dist/server/config-shared.js")
const origin = ${JSON.stringify(options.origin)}

async function projectConfig() {
  ${load}
}

export default async function config(phase) {
  const loaded = await projectConfig()
  const project = await normalizeConfig(phase, loaded?.default ?? loaded ?? {})
  const { output, distDir, basePath, i18n, rewrites, redirects, ...kept } = project

  return {
    ...kept,
    turbopack: { ...project.turbopack, rules: rulesWithTailwindBase(project.turbopack?.rules) },
    distDir: ${JSON.stringify(guestBuildFolder)},
    assetPrefix: origin,
    images: { ...project.images, path: \`\${origin}/_next/image\` }
  }
}
`
}

/** How the guest app's config loads the project's: as Next does, transpiling TypeScript, or importing it. */
function configLoader(configFile: string | undefined, root: string): string {
  if (!configFile) {
    return "return {}"
  }

  if (/\.m?ts$/.test(configFile)) {
    return [
      'const { transpileConfig } = require("./dist/build/next-config-ts/transpile-config.js")',
      `  return transpileConfig({ nextConfigPath: ${JSON.stringify(configFile)}, dir: ${JSON.stringify(root)} })`
    ].join("\n")
  }

  return `return import(${JSON.stringify(`file:///${configFile.replace(/^\//, "")}`)})`
}
