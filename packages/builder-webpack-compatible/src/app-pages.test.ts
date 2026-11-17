import { describe, expect, it } from "vite-plus/test"
import { appEntries, appPagePlugin, builtAppFiles, plainAppPage } from "./app-pages.ts"
import type { BundlerPlugin } from "./bundler.ts"

/** What the test plugins are given, as a project or the builder makes them. */
interface HtmlOptions {
  template?: string
  templateContent?: string
  title?: string
  chunks?: string[]
  filename?: string
  publicPath?: string
}

/** An HTML plugin standing in for Rspack's, keeping its options as Rspack's does. */
class HtmlRspackPlugin {
  options: HtmlOptions

  constructor(options: HtmlOptions) {
    this.options = options
  }

  apply() {
    return undefined
  }
}

/** html-webpack-plugin keeps what it was given as `userOptions`. */
class HtmlWebpackPlugin {
  userOptions: HtmlOptions

  constructor(options: HtmlOptions) {
    this.userOptions = options
  }

  apply() {
    return undefined
  }
}

/** What a test plugin was made with, wherever its kind keeps it. */
function options(plugin: BundlerPlugin | undefined): HtmlOptions {
  if (plugin instanceof HtmlRspackPlugin) {
    return plugin.options
  }

  return plugin instanceof HtmlWebpackPlugin ? plugin.userOptions : {}
}

describe("appEntries", () => {
  it("names the app's entries apart from the guest's, keeping only the modules each imports", () => {
    expect(appEntries("./src/main.tsx")).toEqual({ "app-main": { import: ["./src/main.tsx"] } })
    expect(appEntries(["./src/polyfills.ts", "./src/main.tsx"])).toEqual({
      "app-main": { import: ["./src/polyfills.ts", "./src/main.tsx"] }
    })
    expect(
      appEntries({ index: ["/app/src/index.tsx"], admin: { import: "./src/admin.tsx", filename: "admin/[name].js" } })
    ).toEqual({ "app-index": { import: ["/app/src/index.tsx"] }, "app-admin": { import: ["./src/admin.tsx"] } })
  })

  it("gives no pages for an entry made by a function, or none", () => {
    expect(appEntries(() => "./src/main.tsx")).toEqual({})
    expect(appEntries(undefined)).toEqual({})
  })
})

describe("appPagePlugin", () => {
  it("makes the project's first HTML plugin again, for the app's renamed entries, loaded from the builder", () => {
    const rsbuild = new HtmlRspackPlugin({
      templateContent: '<div id="root"></div>',
      title: "Harbor",
      chunks: ["index"]
    })

    const page = appPagePlugin([rsbuild], ["app-index"], "http://127.0.0.1:4000/")

    expect(page).toBeInstanceOf(HtmlRspackPlugin)
    expect(options(page)).toEqual({
      templateContent: '<div id="root"></div>',
      title: "Harbor",
      chunks: ["app-index"],
      filename: "app-page.html",
      publicPath: "http://127.0.0.1:4000/"
    })
  })

  it("takes every app entry when the plugin names none, from html-webpack-plugin's options too", () => {
    const page = appPagePlugin([new HtmlWebpackPlugin({ template: "./index.html" })], ["app-main"], "/")

    expect(options(page)).toMatchObject({ template: "./index.html", chunks: ["app-main"], filename: "app-page.html" })
  })

  it("makes no page without an HTML plugin or an entry", () => {
    expect(appPagePlugin([], ["app-main"], "/")).toBeUndefined()
    expect(appPagePlugin([new HtmlRspackPlugin({})], [], "/")).toBeUndefined()
  })
})

describe("the app's page", () => {
  it("loads the runtime first, then the app's entries, for an app whose config makes no page", () => {
    const files = builtAppFiles([
      { name: "main", files: ["main.js"] },
      { name: "app-main", files: ["app-main.js", "app-main.css"] },
      { name: null, files: ["src_routes_Home_tsx.1a2b3c4d.js"] }
    ])

    expect(files).toEqual({ scripts: ["runtime.js", "app-main.js"], styles: ["app-main.css"] })
    expect(plainAppPage(files)).toContain(
      '<link rel="stylesheet" href="/app-main.css"></head><body><div id="root"></div><script src="/runtime.js"></script><script src="/app-main.js"></script>'
    )
    expect(builtAppFiles([{ name: "main", files: ["main.js"] }])).toEqual({ scripts: [], styles: [] })
  })
})
