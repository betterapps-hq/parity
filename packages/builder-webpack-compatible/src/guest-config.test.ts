import { describe, expect, it } from "vite-plus/test"
import { type Bundler, type BundlerConfig, type BundlerPlugin, bundlerRule } from "./bundler.ts"
import { developmentStandIn, guestConfig, type GuestConfigOptions, withExtraction } from "./guest-config.ts"

/** A plugin standing in for one of the bundler's, named as its class would be. */
function plugin(name: string): BundlerPlugin {
  const made = { [name]: class {} }[name]!

  return Object.assign(new made(), { apply: () => undefined })
}

/** What the fake bundler's module replacement was given, as the test reads it back. */
const replacements: ((request: string) => string | undefined)[] = []

const bundler: Bundler = {
  name: "Fake",
  version: "1.0.0",
  compiler: () => {
    throw new Error("not built in these tests")
  },
  hotModuleReplacement: () => plugin("HotModuleReplacementPlugin"),
  define: () => plugin("DefinePlugin"),
  replaceModules: (_test, replace) => {
    replacements.push(replace)

    return plugin("NormalModuleReplacementPlugin")
  },
  extractCss: { plugin: () => plugin("CssExtractRspackPlugin"), loader: "/extract/loader.js" }
}

const options: GuestConfigOptions = {
  root: "/app",
  entry: "/app/node_modules/.cache/parity-fake/guest-entry.js",
  styles: ["/app/src/index.css"],
  packageStyles: ["fake-ui/styles.css"],
  output: "/app/node_modules/.cache/parity-fake/out",
  publicPath: "http://127.0.0.1:4000/",
  key: "parity_guest_4000",
  elementSources: "/app/node_modules/.cache/parity-fake/element-sources-loader.cjs",
  renderer: {
    file: "/parity/renderer/guest.js",
    loader: "/app/node_modules/.cache/parity-fake/guest-address-loader.cjs"
  },
  componentExtensions: [".tsx", ".jsx"],
  dedupe: { react: "/app/node_modules/react" },
  standIns: { "/jsx-dev-runtime": 'export { Fragment, jsx as jsxDEV } from "$base/jsx-runtime"' }
}

const names = (plugins: BundlerConfig["plugins"]) =>
  (plugins ?? []).map((one) => (one instanceof Object ? one.constructor.name : String(one)))

describe("guestConfig", () => {
  it("builds the guest's entry and the global stylesheets in place of the app, to the builder's own folder", () => {
    const config = guestConfig(
      { entry: "./src/main.tsx", output: { path: "/app/dist", filename: "app.js" } },
      bundler,
      options
    )

    expect(config.entry).toEqual({
      main: { import: [options.entry], library: { type: "window", name: "parity_guest_4000" } },
      styles: { import: ["/app/src/index.css"] },
      "package-styles": { import: ["fake-ui/styles.css"] }
    })
    expect(config.output).toMatchObject({
      path: options.output,
      publicPath: "http://127.0.0.1:4000/",
      filename: "[name].js",
      cssFilename: "[name].css",
      uniqueName: "parity_guest_4000",
      chunkLoading: "jsonp"
    })
    expect(config.optimization).toMatchObject({ runtimeChunk: { name: "runtime" }, splitChunks: false, nodeEnv: false })
  })

  it("keeps the project's rules and plugins, but its HTML pages and Fast Refresh, and adds hot updates", () => {
    const own = plugin("SvgrPlugin")

    const config = guestConfig(
      {
        plugins: [own, plugin("HtmlRspackPlugin"), plugin("ReactRefreshRspackPlugin"), undefined, false],
        module: { rules: [{ test: /\.svg$/, type: "asset" }] }
      },
      bundler,
      options
    )

    expect(names(config.plugins)).toEqual([
      "SvgrPlugin",
      "CssExtractRspackPlugin",
      "HotModuleReplacementPlugin",
      "DefinePlugin",
      "NormalModuleReplacementPlugin"
    ])
    expect(config.module?.rules).toEqual([
      expect.objectContaining({ enforce: "pre", loader: options.elementSources }),
      { test: /^\/parity\/renderer\/guest\.js$/, enforce: "pre", loader: options.renderer.loader },
      { test: /\.svg$/, type: "asset" }
    ])
  })

  it("puts its own CSS extractor in place of the project's, and leaves out Rsbuild's HTML plugin", () => {
    const own = plugin("CssExtractRspackPlugin")
    const config = guestConfig({ plugins: [own, plugin("RsbuildHtmlPlugin")] }, bundler, options)

    expect(names(config.plugins).filter((name) => name === "CssExtractRspackPlugin")).toHaveLength(1)
    expect(config.plugins).not.toContain(own)
    expect(names(config.plugins)).not.toContain("RsbuildHtmlPlugin")
  })

  it("has one copy of the renderer's runtime packages, beside the project's own aliases", () => {
    const config = guestConfig({ resolve: { alias: { "@": "/app/src" } } }, bundler, options)

    expect(config.resolve).toEqual({ alias: { "@": "/app/src", react: "/app/node_modules/react" } })
  })

  it("serves React's development runtime as the renderer's stand-in, as a data module", () => {
    replacements.length = 0
    guestConfig({}, bundler, options)
    const [replace] = replacements

    expect(replace?.("react/jsx-dev-runtime")).toBe(
      `data:text/javascript,${encodeURIComponent('export { Fragment, jsx as jsxDEV } from "react/jsx-runtime"')}`
    )
    expect(replace?.("./jsx-dev-runtime")).toBeUndefined()
  })
})

describe("withExtraction", () => {
  it("swaps style-loader for the extractor's loader, in nested rules too", () => {
    const rule = {
      oneOf: [
        { test: /\.css$/, use: ["style-loader", { loader: "css-loader" }] },
        { test: /\.scss$/, use: [{ loader: "/x/node_modules/style-loader/dist/cjs.js" }, "sass-loader"] }
      ]
    }

    expect(withExtraction(rule, "/extract/loader.js")).toEqual({
      oneOf: [
        { test: /\.css$/, use: ["/extract/loader.js", { loader: "css-loader" }] },
        { test: /\.scss$/, use: ["/extract/loader.js", "sass-loader"] }
      ]
    })
  })

  it("swaps style-loader however a rule's use is written: one loader, or a function that gives them", () => {
    expect(withExtraction({ test: /\.css$/, use: "style-loader" }, "/extract/loader.js")).toEqual({
      test: /\.css$/,
      use: "/extract/loader.js"
    })

    const rule = bundlerRule.parse(
      withExtraction({ test: /\.css$/, use: () => ["style-loader", "css-loader"] }, "/extract/loader.js")
    )

    const use = rule.use instanceof Function ? rule.use({}) : rule.use

    expect(use).toEqual(["/extract/loader.js", "css-loader"])
  })

  it("leaves rules without style-loader as they are", () => {
    const rule = { test: /\.css$/, type: "css" }

    expect(withExtraction(rule, "/extract/loader.js")).toEqual(rule)
  })
})

describe("developmentStandIn", () => {
  it("stands in for a package's development runtime, not a relative import or a URL", () => {
    const standIns = { "/jsx-dev-runtime": "from $base" }

    expect(developmentStandIn("@emotion/react/jsx-dev-runtime", standIns)).toBe("from @emotion/react")
    expect(developmentStandIn("./jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("data:text/javascript,/jsx-dev-runtime", standIns)).toBeUndefined()
  })
})
