import { appPageModeScript } from "@parity-app/project"
import { z } from "zod"
import { guestFiles } from "./browser-modules.ts"
import type { BundlerPlugin } from "./bundler.ts"

/*
 * The app's own pages, which the canvas draws a route's screen from (PAR-1076): the project's entry, built beside the
 * guest, in the page its HTML plugin makes, served at every route's path. A page reloads after each build that changes
 * something, as the app's own dev server would update it.
 */

/** What the app's entries are named in the guest's build, after their own names, so they don't meet the guest's. */
export const appEntryPrefix = "app-"

/** The page the project's HTML plugin writes for the app, in the build's output folder. */
export const appPageFile = "app-page.html"

/**
 * Where a page reads how many builds have changed something, to reload when that grows. A short request each time,
 * since an open stream from every route's frame would take all the browser's connections to the builder.
 */
export const pageVersionPath = "/@parity/page-version"

/** An entry as a config gives one, read as the modules it imports: a module, a list of them, or a description. */
const entryModules = z.union([
  z.string().transform((module) => [module]),
  z.array(z.string()),
  z.looseObject({ import: z.union([z.string(), z.array(z.string())]) }).transform((entry) => [entry.import].flat())
])

/**
 * The project's own entries, as the guest's build takes them, by their names with `appEntryPrefix`: only the modules
 * each imports, as an entry's other settings (its file name, library or runtime) are the app's. One entry with no name
 * is webpack's `main`. An entry given by a function, or none, gives no pages.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- a config's `entry`, written any way the tool takes it, read here by `entryModules`
export function appEntries(entry: unknown): Record<string, { import: string[] }> {
  const named = entryModules.safeParse(entry).success ? { main: entry } : entry

  if (!(named instanceof Object) || named instanceof Function || Array.isArray(named)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(named).flatMap(([name, value]) => {
      const modules = entryModules.safeParse(value)

      return modules.success ? [[`${appEntryPrefix}${name}`, { import: modules.data }]] : []
    })
  )
}

/** What the builder reads of an HTML plugin's options; the rest pass through as the project set them. */
const htmlOptions = z.looseObject({ chunks: z.array(z.string()).optional() })

/** The HTML plugins webpack, Rspack and Rsbuild make pages with, by their class's name. */
export const htmlPlugins = /^Html(?:Rspack|Webpack)?Plugin$/

/**
 * The project's first HTML plugin, made again with its own options to write the app's page beside the guest: from its
 * entries, renamed as the guest's build names them, loaded from the builder's server. Its template, title and the
 * rest are the project's, as Rsbuild gives them already filled in. Nothing when the project has none, or it can't be
 * made again.
 */
export function appPagePlugin(
  plugins: readonly BundlerPlugin[],
  entries: readonly string[],
  publicPath: string
): BundlerPlugin | undefined {
  const html = plugins.find((plugin) => htmlPlugins.test(plugin.constructor.name))
  // SAFETY: html-webpack-plugin keeps what it was given as `userOptions`, Rspack's as `options`; both are read by schema.
  const given = html as (BundlerPlugin & { userOptions?: unknown; options?: unknown }) | undefined
  const options = htmlOptions.safeParse(given?.userOptions ?? given?.options)

  if (!html || !options.success || entries.length === 0) {
    return undefined
  }

  const chunks = options.data.chunks
    ?.map((chunk) => `${appEntryPrefix}${chunk}`)
    .filter((chunk) => entries.includes(chunk))

  // SAFETY: a plugin's class is made with the options it was given, as the project made it.
  const Plugin = html.constructor as new (options: z.output<typeof htmlOptions>) => BundlerPlugin

  try {
    return new Plugin({
      ...options.data,
      filename: appPageFile,
      chunks: chunks && chunks.length > 0 ? chunks : [...entries],
      publicPath
    })
  } catch {
    return undefined
  }
}

/** The files a build wrote for the app's entries, in the order a page loads them: the runtime first. */
export interface AppFiles {
  scripts: string[]
  styles: string[]
}

/**
 * The files a build wrote for the app's entries, from its chunks: the shared runtime's script first, then each entry's
 * scripts and stylesheets. Nothing when the build has no app entries.
 */
export function builtAppFiles(
  chunks: readonly { name?: string | null; files: Iterable<string> }[],
  runtime = guestFiles.runtime
): AppFiles {
  const app = chunks.filter((chunk) => chunk.name?.startsWith(appEntryPrefix))
  const files = app.flatMap((chunk) => [...chunk.files])
  const scripts = files.filter((file) => file.endsWith(".js"))

  return {
    scripts: scripts.length > 0 ? [runtime, ...scripts] : [],
    styles: files.filter((file) => file.endsWith(".css"))
  }
}

/** A page for an app whose config makes none: a root to mount on, and its entries' files. */
export function plainAppPage(files: AppFiles): string {
  const links = files.styles.map((file) => `<link rel="stylesheet" href="/${file}">`).join("")
  const scripts = files.scripts.map((file) => `<script src="/${file}"></script>`).join("")

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body><div id="root"></div>${scripts}</body></html>`
}

/** What a page runs to reload after a build that changes something: it checks the builds' count each second. */
const reloadScript = `(() => {
  let seen
  const check = () =>
    fetch(${JSON.stringify(pageVersionPath)}, { cache: "no-store" })
      .then((response) => response.text())
      .then((version) => {
        if (seen === undefined) seen = version
        else if (version !== seen) window.location.reload()
      })
      .catch(() => {})
  check()
  setInterval(check, 1000)
})()`

/**
 * The app's page as the canvas gets it: with what tells it the frame's mode and how tall it is (`appPageModeScript`),
 * first in its head, and what reloads it after each build that changes something.
 */
export function servedAppPage(html: string): string {
  const scripts = `<script>${appPageModeScript}</script><script>${reloadScript}</script>`
  const head = /<head(?:\s[^>]*)?>/i.exec(html)

  return head
    ? `${html.slice(0, head.index + head[0].length)}${scripts}${html.slice(head.index + head[0].length)}`
    : `${scripts}${html}`
}
