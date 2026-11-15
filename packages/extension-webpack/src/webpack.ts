import type { Bundler, BundlerCompiler, BundlerConfig, BundlerPlugin } from "@parity-app/builder-webpack-compatible"
import { z } from "zod"

/*
 * webpack as the shared builder code uses it, from the project's own `webpack`, and the change a project's stylesheet
 * rules need when it has no CSS-extract plugin.
 */

/** The parts of webpack's API the builder uses, as its package exports them. */
export interface WebpackApi {
  (config: BundlerConfig): BundlerCompiler
  version?: string
  HotModuleReplacementPlugin: new () => BundlerPlugin
  DefinePlugin: new (definitions: Record<string, string>) => BundlerPlugin
  NormalModuleReplacementPlugin: new (test: RegExp, replace: (resource: { request: string }) => void) => BundlerPlugin
}

/** `mini-css-extract-plugin`'s class, with the loader its rules use. */
export type CssExtractPlugin = (new () => BundlerPlugin) & { loader: string }

/** webpack's API from its package's module, a CommonJS one whose exports an ES module import gives as its default. */
export function webpackApi(module: { default?: unknown }, from: string): WebpackApi {
  const api = webpackExports.safeParse(module.default ?? module)

  if (!api.success) {
    throw new TypeError(`${from} doesn't export webpack's API`)
  }

  return api.data
}

/** webpack's API, known by the function it is and the plugin it always has. */
const webpackExports = z.custom<WebpackApi>(
  (value) => value instanceof Function && "HotModuleReplacementPlugin" in value
)

/** `mini-css-extract-plugin`'s class, known by its static loader's path. */
const cssExtractClass = z.custom<CssExtractPlugin>(
  (value) => value instanceof Function && "loader" in value && z.string().safeParse(value.loader).success
)

/** `mini-css-extract-plugin`'s class from its package's module, or nothing when it isn't that. */
export function cssExtractPlugin(module: { default?: unknown }): CssExtractPlugin | undefined {
  const plugin = cssExtractClass.safeParse(module.default ?? module)

  return plugin.success ? plugin.data : undefined
}

/** webpack as the shared builder code uses it, extracting CSS with the project's `mini-css-extract-plugin` if given. */
export function webpackBundler(webpack: WebpackApi, version: string, extract?: CssExtractPlugin): Bundler {
  const bundler: Bundler = {
    name: "webpack",
    version: version || webpack.version || "",
    compiler: (config) => webpack(config),
    hotModuleReplacement: () => new webpack.HotModuleReplacementPlugin(),
    define: (definitions) => new webpack.DefinePlugin(definitions),
    replaceModules: (test, replace) =>
      new webpack.NormalModuleReplacementPlugin(test, (resource) => {
        const replaced = replace(resource.request)

        if (replaced !== undefined) {
          resource.request = replaced
        }
      })
  }

  if (extract) {
    bundler.extractCss = { plugin: () => new extract(), loader: extract.loader }
  }

  return bundler
}

/** A loader in a rule's `use`: by name, or as an object with its options. */
const loaderEntry = z.union([z.string(), z.looseObject({ loader: z.string().optional() })])

/** A module rule, as far as the CSS change reads one. */
const cssRule = z.looseObject({
  loader: z.string().optional(),
  use: z.union([loaderEntry, z.array(loaderEntry)]).optional(),
  type: z.string().optional(),
  parser: z.looseObject({}).optional(),
  oneOf: z.array(z.unknown()).optional(),
  rules: z.array(z.unknown()).optional()
})

type CssRule = z.output<typeof cssRule>

/** Options webpack's CSS parser takes, for a rule or for every `.css` file. */
type CssParserOptions = {
  namedExports: boolean
  dashedIdents?: false
}

/** What the project's webpack can do with its own CSS. */
export interface WebpackCss {
  /**
   * Whether it can leave custom properties global in a CSS module (`dashedIdents: false`), as `css-loader` does, so a
   * module's `var(--brand)` reads the theme's. Releases before the option refuse a config that names it.
   */
  globalCustomProperties: boolean
}

/** A `css-loader` whose options ask for a CSS module's classes as named exports. */
const cssLoaderNamedExport = z.looseObject({
  loader: z.string().regex(/(?:^|[\\/])css-loader(?:[\\/]|$)/),
  options: z.looseObject({ modules: z.looseObject({ namedExport: z.literal(true) }) })
})

/** `style-loader` and `css-loader`, by name or by their files, which webpack's own CSS does the work of. */
const cssLoaders = /(?:^|[\\/])(?:style|css)-loader(?:[\\/]|$)/

/** Any object a config holds, read as one with its keys as they are, or an empty one when it isn't there. */
const anyObject = z.looseObject({}).catch({})

/**
 * The project's config for a project with no CSS-extract plugin: its stylesheet rules build with webpack's own CSS
 * (`experiments.css`), which writes CSS files with no plugin, in place of `style-loader`, which injects CSS into the page
 * as the app runs. Each rule that ran `style-loader` or `css-loader` drops them and takes `type: "css/auto"`, so a
 * `.module.css` file is a CSS module; loaders before them, such as `sass-loader` and `postcss-loader`, stay.
 */
export function withWebpackCss(config: BundlerConfig, css: WebpackCss): BundlerConfig {
  const parser = anyObject.parse(config.module?.parser)

  const module = {
    ...config.module,
    // A stylesheet no rule names, built by webpack's own rule for `.css`, gives a CSS module's classes as its default
    // export, as `css-loader` did before version 7: `import classes from "./card.module.css"`.
    parser: { ...parser, "css/auto": { ...parserOptions(false, css), ...anyObject.parse(parser["css/auto"]) } }
  }

  if (config.module?.rules) {
    module.rules = config.module.rules.map((rule) => webpackCssRule(rule, css))
  }

  return { ...config, experiments: { ...anyObject.parse(config.experiments), css: true }, module }
}

/** The CSS parser's options: classes as named exports or the default one, and custom properties global if it can. */
function parserOptions(namedExports: boolean, css: WebpackCss): CssParserOptions {
  const options: CssParserOptions = { namedExports }

  if (css.globalCustomProperties) {
    options.dashedIdents = false
  }

  return options
}

/** A loader's name, however a rule's `use` writes it. */
function loaderName(entry: z.output<typeof loaderEntry>): string {
  return (entry instanceof Object ? entry.loader : entry) ?? ""
}

/** A rule with `style-loader` and `css-loader` swapped for webpack's own CSS, and its nested rules too. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- a project's rule, whatever webpack accepts, read here by `cssRule` and passed on
export function webpackCssRule(entry: unknown, css: WebpackCss): unknown {
  const parsed = cssRule.safeParse(entry)

  if (!parsed.success) {
    return entry
  }

  const { loader, use, ...rest } = parsed.data
  const changed: CssRule = rest
  const uses = use === undefined ? [] : [use].flat()
  const kept = uses.filter((one) => !cssLoaders.test(loaderName(one)))
  const styles = (loader !== undefined && cssLoaders.test(loader)) || kept.length < uses.length

  if (loader !== undefined && !cssLoaders.test(loader)) {
    changed.loader = loader
  }

  if (use !== undefined && !styles) {
    changed.use = use
  } else if (kept.length > 0) {
    changed.use = kept
  }

  if (styles) {
    changed.type = "css/auto"
    // A CSS module's classes come as `css-loader`'s options said: named exports where they asked for them, else the
    // default export.
    changed.parser = parserOptions(
      uses.some((one) => cssLoaderNamedExport.safeParse(one).success),
      css
    )
  }

  if (rest.oneOf) {
    changed.oneOf = rest.oneOf.map((inner) => webpackCssRule(inner, css))
  }

  if (rest.rules) {
    changed.rules = rest.rules.map((inner) => webpackCssRule(inner, css))
  }

  return changed
}
