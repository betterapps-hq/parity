import { isAbsolute, relative } from "node:path"
import { hasElementSources, tagElementSources } from "@parity-app/code"

/*
 * Tags each element the project's own JSX writes with its file, line and column (PAR-167, PAR-1161), before Next
 * compiles it, as Vite's `elementSources` plugin does. Turbopack runs loaders in workers of its own, outside the builder's
 * process, so the guest app's loader posts each module to the builder's server, which tags it with Parity's tagger and
 * answers with the code and its source map, or with nothing to change.
 */

/** Where the builder tags a module's elements: a POST of its code, with its file in the query. */
export const elementSourcesRoute = "/__parity/element-sources"

/** The loader's file in the guest app, from its folder. */
export const elementSourcesLoaderFile = "element-sources-loader.cjs"

/**
 * The loader the guest app's Next runs on the project's JSX: it asks the builder's server for the module's tagged code.
 * A module the server couldn't tag compiles as it is, with a warning, since its elements' sources aren't worth a page
 * that doesn't build.
 */
export const elementSourcesLoaderSource = `// Written by Parity's Next.js builder each time it starts.
module.exports = function (source, map) {
  const done = this.async()
  const { endpoint } = this.getOptions()
  const untagged = (reason) => {
    this.emitWarning?.(new Error("Parity couldn't tag " + this.resourcePath + "'s elements: " + reason))
    done(null, source, map)
  }
  fetch(endpoint + "?file=" + encodeURIComponent(this.resourcePath), { method: "POST", body: source })
    .then((response) => {
      if (response.status === 204) return done(null, source, map)
      if (!response.ok) return untagged("the builder answered " + response.status)
      return response.json().then((tagged) => done(null, tagged.code, tagged.map))
    })
    .catch((error) => untagged(error?.message ?? String(error)))
}
`

/** The guest app's module that adds the loader to the config, from its folder, which its Next config imports. */
export const elementSourcesConfigFile = "element-sources.mjs"

/**
 * The module that adds the loader to the guest app's config: running first on the project's JSX in Turbopack's rules,
 * before any loader of the project's own for it, under each of a rule's conditions, and as a \`pre\` rule in webpack's,
 * after the project's own \`webpack\` hook.
 */
export function elementSourcesConfigSource(origin: string): string {
  const endpoint = JSON.stringify(`${origin}${elementSourcesRoute}`)

  return `// Written by Parity's Next.js builder each time it starts.
import { fileURLToPath } from "node:url"

const elementSources = {
  loader: fileURLToPath(new URL("./${elementSourcesLoaderFile}", import.meta.url)),
  options: { endpoint: ${endpoint} }
}

/**
 * A rule with the element-sources loader last, so it runs first: loaders run from the last to the first, as webpack's
 * do, and the tagger has to see the project's JSX before any other loader compiles it.
 */
const withTagger = (rule) => (Array.isArray(rule?.loaders) ? { ...rule, loaders: [...rule.loaders, elementSources] } : rule)

/** Turbopack's rules, with the element-sources loader running first on JSX, under each of a rule's conditions. */
export function rulesWithElementSources(rules) {
  const tagged = { ...rules }

  for (const glob of ["*.tsx", "*.jsx"]) {
    const rule = tagged[glob]

    if (rule === undefined) {
      tagged[glob] = { loaders: [elementSources] }
    } else {
      tagged[glob] = Array.isArray(rule) ? rule.map(withTagger) : withTagger(rule)
    }
  }

  return tagged
}

/** The project's \`webpack\` hook, then the element-sources loader before any other on the project's JSX. */
export function webpackWithElementSources(projectWebpack) {
  return (config, context) => {
    const own = typeof projectWebpack === "function" ? projectWebpack(config, context) : config
    own.module.rules.unshift({ test: /\\.[jt]sx$/, exclude: /node_modules/, enforce: "pre", use: [elementSources] })

    return own
  }
}
`
}

/**
 * A module's code with its elements tagged, when it's the project's own JSX, by its path from `root`: not a package's,
 * a file outside the project, or the guest app's own.
 */
export function taggedNextSource(root: string, file: string, source: string): ReturnType<typeof tagElementSources> {
  const from = relative(root, file)
  const path = from.replaceAll("\\", "/")

  if (
    path.startsWith("../") ||
    isAbsolute(from) ||
    path.split("/").includes("node_modules") ||
    // Next's own output, where the guest app is.
    path.startsWith(".next/")
  ) {
    return undefined
  }

  return hasElementSources(file) ? tagElementSources(source, path) : undefined
}
