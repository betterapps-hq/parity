import { posix } from "node:path"
import { appPageModeScript } from "@parity-app/project"
import {
  elementSourcesConfigFile,
  elementSourcesConfigSource,
  elementSourcesLoaderFile,
  elementSourcesLoaderSource
} from "./element-sources.ts"
import { nextRouterFile, nextRouterSource } from "./next-router.ts"

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

/**
 * The guest app's routes: the guest, the project's global stylesheets, and packages' stylesheets, each a page of its own,
 * under a path of their own, since the project's own routes are served beside them (PAR-1164).
 */
export const guestRoutes = {
  guest: "/parity-guest",
  styles: "/parity-guest/styles",
  packageStyles: "/parity-guest/package-styles"
} as const

/** The route group the guest's own pages and their bare root layout go in, apart from the project's root layout. */
const guestRouteGroup = "app/(parity)"

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
  /**
   * Build plugins that look for the project's files from where they run, by package, each with the option naming the
   * folder to look from, as the styling extensions' manifests give them (`StylesContribution.rootOptions`): Next runs
   * them from the guest app's folder, so it gives them the project's root.
   */
  rootOptions?: Readonly<Record<string, string>>
  /** The project's PostCSS config file, from the root, when it has one. */
  postcss?: string
  /** The project's `tsconfig.json` or `jsconfig.json`, when it has one. */
  tsconfig?: string
  /**
   * The folder, relative to the root, the project's `paths` resolve from when its tsconfig gives no `baseUrl`: that of
   * the config that declares them. Absent when the project's tsconfig gives a `baseUrl` of its own or inherits one.
   */
  tsconfigPathsBase?: string
}

/** How a module in the guest app's `app/` folder imports a project file, from the file's path from the root. */
export function projectImport(path: string): string {
  return posix.join("../../..", path.replaceAll("\\", "/").replace(/^\.?\//, ""))
}

/** The guest app's files. */
export function guestAppFiles(options: GuestAppOptions): GuestAppFile[] {
  const files: GuestAppFile[] = [
    { path: "next.config.mjs", text: nextConfigSource(options) },
    { path: elementSourcesConfigFile, text: elementSourcesConfigSource(options.origin) },
    { path: elementSourcesLoaderFile, text: elementSourcesLoaderSource },
    { path: nextRouterFile, text: nextRouterSource },
    { path: `${guestRouteGroup}/layout.tsx`, text: layoutSource },
    {
      path: `${guestRouteGroup}/parity-guest/page.tsx`,
      text: 'import Guest from "../../guest"\n\nexport default function Page() {\n  return <Guest />\n}\n'
    },
    // A client module, so the browser gets it; `guestParts` imports the guest's modules when the canvas asks for them.
    {
      path: guestModuleFile,
      text: `"use client"\n\n${options.guestSource}\nexport default function Guest() {\n  return null\n}\n`
    },
    // The stylesheets compile on pages of their own, so each page's CSS is theirs alone.
    {
      path: `${guestRouteGroup}/parity-guest/styles/page.tsx`,
      text: stylesPage(options.styles.map((path) => `../../../${projectImport(path)}`))
    },
    { path: `${guestRouteGroup}/parity-guest/package-styles/page.tsx`, text: stylesPage(options.packageStyles) },
    // The project's pages draw in their frame's mode, and say how tall they are and where they landed, as Vite's do.
    // Next runs this in the browser before a page's own code, in place of the project's own client instrumentation,
    // which reports errors and analytics the canvas has no business sending.
    { path: "instrumentation-client.js", text: instrumentationSource }
  ]

  if (options.tsconfig) {
    // Extending the project's, so its path aliases resolve as the project's own modules expect. Without a `baseUrl` of
    // its own, TypeScript and Turbopack resolve the project's `paths` from its tsconfig's folder, but Next.js 15's
    // webpack resolves them from the guest app's, so the guest's says where they resolve from.
    const tsconfig =
      options.tsconfigPathsBase === undefined
        ? { extends: `../../${options.tsconfig}` }
        : {
            extends: `../../${options.tsconfig}`,
            compilerOptions: { baseUrl: posix.join("../..", options.tsconfigPathsBase) }
          }

    files.push({ path: options.tsconfig, text: `${JSON.stringify(tsconfig, null, 2)}\n` })
  }

  if (options.postcss) {
    files.push({ path: "postcss.config.mjs", text: postcssConfigSource(options.postcss) })
  }

  files.push({ path: projectRootFile, text: projectRootSource(options.root, options.rootOptions ?? {}) })

  return files
}

/** The guest app's module that points build plugins at the project, which both its configs import. */
const projectRootFile = "project-root.mjs"

/**
 * Some build plugins look for the project's files from where they run unless an option names the folder, as Tailwind's
 * PostCSS and Turbopack plugins look for class names unless they're given a `base`. Next runs them from the guest app's
 * folder, so the guest app gives each the project's root, where `next dev` runs.
 */
function projectRootSource(root: string, rootOptions: Readonly<Record<string, string>>): string {
  return `// Written by Parity's Next.js builder each time it starts.
const rootOptions = ${JSON.stringify(rootOptions)}

/** A plugin's options with the project's root as the folder it looks from, unless they name one; another's as they are. */
export function withProjectRoot(name, options) {
  const option = Object.hasOwn(rootOptions, name) ? rootOptions[name] : undefined

  if (option === undefined || options === false) {
    return options
  }

  const given = options !== null && typeof options === "object" ? options : {}

  return given[option] === undefined ? { ...given, [option]: ${JSON.stringify(root)} } : given
}

/** Turbopack's rules, with each loader that looks from where it runs given the project's root. */
export function rulesWithProjectRoot(rules) {
  const loader = (entry) => {
    const name = typeof entry === "string" ? entry : entry?.loader

    return Object.hasOwn(rootOptions, name ?? "") ? { ...(typeof entry === "object" ? entry : { loader: name }), options: withProjectRoot(name, entry.options) } : entry
  }

  const rule = (value) =>
    Array.isArray(value) ? value.map(rule) : Array.isArray(value?.loaders) ? { ...value, loaders: value.loaders.map(loader) } : value

  return Object.fromEntries(Object.entries(rules ?? {}).map(([glob, value]) => [glob, rule(value)]))
}
`
}

/** The guest app's PostCSS config: the project's, with each plugin that looks from where it runs given the project's root. */
function postcssConfigSource(postcss: string): string {
  return `import config from ${JSON.stringify(`../../${postcss}`)}
import { withProjectRoot } from "./${projectRootFile}"

const plugin = (entry) =>
  typeof entry === "string" ? [entry, withProjectRoot(entry, {})] : [entry[0], withProjectRoot(entry[0], entry[1])]

export default {
  ...config,
  plugins: Array.isArray(config?.plugins)
    ? config.plugins.map(plugin)
    : Object.fromEntries(Object.entries(config?.plugins ?? {}).map(([name, options]) => [name, withProjectRoot(name, options)]))
}
`
}

/**
 * The guest app's `instrumentation-client`: the page script, and in a canvas frame, Next's development overlay hidden,
 * since a frame draws the page and nothing over it. The mode the script puts on `<html>` before the page hydrates is one
 * of the issues Next would show there.
 */
const instrumentationSource = `// Written by Parity's Next.js builder each time it starts.
${appPageModeScript}
if (window.name.startsWith("parity:")) {
  const hidden = document.createElement("style")
  hidden.textContent = "nextjs-portal { display: none !important }"
  document.head.append(hidden)
}
`

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
 * Next runs CSS loaders from the guest app's folder, so its Turbopack rules give those that look for the project's files
 * from where they run the project's root, and it builds to a folder beside the guest app's, where nothing that looks from there reads it.
 */
export function nextConfigSource(options: Pick<GuestAppOptions, "root" | "next" | "origin" | "config">): string {
  const configFile = options.config ? posix.join(options.root, options.config) : undefined

  const load = configLoader(configFile, options.root)

  return `// Written by Parity's Next.js builder each time it starts. The project's own config is ${options.config ?? "absent"}.
import { createRequire } from "node:module"
import { rulesWithElementSources, webpackWithElementSources } from "./${elementSourcesConfigFile}"
import { rulesWithProjectRoot } from "./${projectRootFile}"

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
    turbopack: { ...project.turbopack, rules: rulesWithElementSources(rulesWithProjectRoot(project.turbopack?.rules)) },
    webpack: webpackWithElementSources(project.webpack),
    // The project's modules are outside the guest app's folder, which webpack compiles nothing from without this.
    experimental: { ...project.experimental, externalDir: true },
    devIndicators: false,
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
      // Next.js 16 takes the project's folder as `dir`; 15 as `cwd`, with the config's file name.
      `  return transpileConfig(${JSON.stringify({ nextConfigPath: configFile, configFileName: posix.basename(configFile), cwd: root, dir: root })})`
    ].join("\n")
  }

  return `return import(${JSON.stringify(`file:///${configFile.replace(/^\//, "")}`)})`
}
