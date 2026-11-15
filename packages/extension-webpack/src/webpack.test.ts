import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import {
  cssExtractPlugin,
  type RuleUse,
  webpackApi,
  webpackBundler,
  webpackCssRule,
  withWebpackCss
} from "./webpack.ts"

/** A plugin as webpack's are: something it applies to its compiler. */
class Plugin {
  applied = false

  apply(): void {
    this.applied = true
  }
}

/** webpack's plugin that changes a module's request, keeping what it was given so a test can call it. */
class ReplacementPlugin extends Plugin {
  readonly replace: (resource: { request: string }) => void

  constructor(_test: RegExp, replace: (resource: { request: string }) => void) {
    super()
    this.replace = replace
  }
}

/** Enough of webpack's API for the bundler: a compiler function and its plugins' classes. */
const fakeWebpack = Object.assign(() => ({ compiler: true }), {
  version: "5.112.2",
  HotModuleReplacementPlugin: class extends Plugin {},
  DefinePlugin: class extends Plugin {},
  NormalModuleReplacementPlugin: ReplacementPlugin
})

/** The fake as the bundler takes it, read the way the builder reads the project's webpack. */
const api = webpackApi({ default: fakeWebpack }, "webpack")

describe("webpackApi", () => {
  it("takes webpack's API from a CommonJS package's default export", () => {
    expect(webpackApi({ default: fakeWebpack }, "webpack")).toBe(fakeWebpack)
  })

  it("refuses a module that isn't webpack", () => {
    expect(() => webpackApi({ default: {} }, "webpack")).toThrow("webpack doesn't export webpack's API")
  })
})

describe("cssExtractPlugin", () => {
  it("takes the plugin's class with its loader, and nothing else", () => {
    const plugin = Object.assign(class extends Plugin {}, { loader: "/node_modules/mini-css-extract-plugin/loader.js" })

    expect(cssExtractPlugin({ default: plugin })).toBe(plugin)
    expect(cssExtractPlugin({ default: class {} })).toBeUndefined()
  })
})

describe("webpackBundler", () => {
  it("makes webpack's compiler and plugins, named webpack, with no CSS extraction unless given", () => {
    const bundler = webpackBundler(api, "5.112.2")

    expect(bundler).toMatchObject({ name: "webpack", version: "5.112.2" })
    expect(bundler.extractCss).toBeUndefined()
    expect(bundler.compiler({})).toEqual({ compiler: true })
    expect(bundler.define({ a: "1" })).toBeInstanceOf(fakeWebpack.DefinePlugin)
  })

  it("extracts CSS with the project's plugin", () => {
    const plugin = Object.assign(class extends Plugin {}, { loader: "/extract-loader.js" })
    const bundler = webpackBundler(api, "5.112.2", plugin)

    expect(bundler.extractCss?.loader).toBe("/extract-loader.js")
    expect(bundler.extractCss?.plugin()).toBeInstanceOf(plugin)
  })

  it("replaces a module's request with what the replacement gives, and leaves it otherwise", () => {
    const bundler = webpackBundler(api, "5.112.2")
    const plugin = bundler.replaceModules(/runtime$/, (request) => (request === "react/runtime" ? "data:x" : undefined))

    if (!(plugin instanceof ReplacementPlugin)) {
      throw new TypeError("not webpack's NormalModuleReplacementPlugin")
    }

    const { replace } = plugin
    const replaced = { request: "react/runtime" }
    const kept = { request: "other/runtime" }

    replace(replaced)
    replace(kept)

    expect([replaced.request, kept.request]).toEqual(["data:x", "other/runtime"])
  })
})

describe("withWebpackCss", () => {
  it("turns on webpack's own CSS, keeping the project's other experiments", () => {
    expect(
      withWebpackCss(
        { experiments: { topLevelAwait: true } },
        { globalCustomProperties: false, cssLoaderNamedExports: false, exportsConvention: false }
      )
    ).toEqual({
      experiments: { topLevelAwait: true, css: true },
      module: { parser: { "css/auto": { namedExports: false } } }
    })
  })

  it("keeps custom properties global where the project's webpack can", () => {
    expect(
      withWebpackCss({}, { globalCustomProperties: true, cssLoaderNamedExports: false, exportsConvention: false })
        .module?.parser
    ).toEqual({
      "css/auto": { namedExports: false, dashedIdents: false }
    })
  })

  it("swaps style-loader and css-loader for webpack's own CSS, keeping the loaders before them", () => {
    const namedExports = { loader: "css-loader", options: { modules: { auto: true, namedExport: true } } }

    const config = withWebpackCss(
      {
        module: {
          rules: [
            { test: /\.jsx?$/, use: "babel-loader" },
            { test: /\.css$/, use: ["style-loader", namedExports] },
            { test: /\.scss$/, use: ["style-loader", "css-loader", "sass-loader"] }
          ]
        }
      },
      { globalCustomProperties: true, cssLoaderNamedExports: false, exportsConvention: false }
    )

    expect(config.module?.rules).toEqual([
      { test: /\.jsx?$/, use: "babel-loader" },
      { test: /\.css$/, type: "css/auto", parser: { namedExports: true, dashedIdents: false } },
      { test: /\.scss$/, use: ["sass-loader"], type: "css/auto", parser: { namedExports: false, dashedIdents: false } }
    ])
  })
})

/** A rule with a `use` function, read back from what the CSS change returns. */
const functionRule = z.looseObject({ use: z.custom<RuleUse>((value) => value instanceof Function) })

describe("webpackCssRule", () => {
  const older = { globalCustomProperties: false, cssLoaderNamedExports: false, exportsConvention: false }

  it("changes nested rules, a lone loader and loaders given by their files", () => {
    expect(
      webpackCssRule(
        {
          oneOf: [
            { test: /\.css$/, loader: "style-loader" },
            { test: /\.less$/, use: ["/repo/node_modules/style-loader/dist/cjs.js", "less-loader"] }
          ]
        },
        older
      )
    ).toEqual({
      oneOf: [
        { test: /\.css$/, type: "css/auto", parser: { namedExports: false } },
        { test: /\.less$/, use: ["less-loader"], type: "css/auto", parser: { namedExports: false } }
      ]
    })
  })

  it("swaps the loaders a stylesheet rule's use function gives, and leaves other rules and ones it can't read", () => {
    const use = () => ["style-loader", "css-loader", "sass-loader"]
    const swapped = functionRule.parse(webpackCssRule({ test: /\.s?css$/, use }, older))

    expect(swapped).toMatchObject({ type: "css/auto", parser: { namedExports: false } })
    expect(swapped.use({})).toEqual(["sass-loader"])

    const scripts = () => ["babel-loader"]

    expect(webpackCssRule({ test: /\.jsx?$/, use: scripts }, older)).toEqual({ test: /\.jsx?$/, use: scripts })
    expect(webpackCssRule("...", older)).toBe("...")
  })

  it("scopes the files css-loader's modules option made CSS modules, and drops a lone css-loader's options", () => {
    const rule = (modules?: boolean | { auto?: boolean; mode?: string }) =>
      webpackCssRule({ test: /\.css$/, use: ["style-loader", { loader: "css-loader", options: { modules } }] }, older)

    expect(rule(true)).toMatchObject({ type: "css/module" })
    expect(rule(false)).toMatchObject({ type: "css/global" })
    expect(rule({ auto: true })).toMatchObject({ type: "css/auto" })
    expect(rule({ mode: "local" })).toMatchObject({ type: "css/module" })
    expect(rule(undefined)).toMatchObject({ type: "css/auto" })

    expect(webpackCssRule({ test: /\.css$/, loader: "css-loader", options: { importLoaders: 1 } }, older)).toEqual({
      test: /\.css$/,
      type: "css/auto",
      parser: { namedExports: false }
    })
  })

  it("gives classes as named exports when css-loader 7 does by default, unless its options say otherwise", () => {
    const seven = { globalCustomProperties: false, cssLoaderNamedExports: true, exportsConvention: false }

    const rule = (options?: { modules: { namedExport: boolean } }) =>
      webpackCssRule({ test: /\.css$/, use: ["style-loader", { loader: "css-loader", options }] }, seven)

    expect(rule()).toMatchObject({ parser: { namedExports: true } })
    expect(rule({ modules: { namedExport: false } })).toMatchObject({ parser: { namedExports: false } })
  })

  it("carries css-loader's export-name convention to webpack's generator where it takes one", () => {
    const options = { modules: { auto: true, exportLocalsConvention: "camelCaseOnly" } }
    const rule = { test: /\.css$/, use: ["style-loader", { loader: "css-loader", options }] }
    const newer = { globalCustomProperties: false, cssLoaderNamedExports: false, exportsConvention: true }

    expect(webpackCssRule(rule, newer)).toMatchObject({ generator: { exportsConvention: "camel-case-only" } })
    expect(webpackCssRule(rule, older)).not.toHaveProperty("generator")
  })

  it("makes CSS modules of the files css-loader's own auto test picks, and the rest global", () => {
    const scoped = /\.scoped\.css$/
    const options = { modules: { auto: scoped } }

    expect(
      webpackCssRule({ test: /\.css$/, use: ["style-loader", { loader: "css-loader", options }] }, older)
    ).toMatchObject({ oneOf: [{ resource: scoped, type: "css/module" }, { type: "css/global" }] })
  })
})
