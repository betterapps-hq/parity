import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { babelFromRoot } from "./babel.ts"

describe("babelFromRoot", () => {
  it("tells babel-loader to work from the project's folder, however the rule names it", () => {
    expect(babelFromRoot({ test: /\.jsx?$/, use: "babel-loader" }, "/app")).toEqual({
      test: /\.jsx?$/,
      use: { loader: "babel-loader", options: { cwd: "/app" } }
    })

    expect(
      babelFromRoot({ test: /\.jsx?$/, loader: "babel-loader", options: { cacheDirectory: true } }, "/app")
    ).toEqual({ test: /\.jsx?$/, loader: "babel-loader", options: { cacheDirectory: true, cwd: "/app" } })

    expect(
      babelFromRoot(
        { oneOf: [{ use: ["thread-loader", { loader: "/repo/node_modules/babel-loader/lib/index.js" }] }] },
        "/app"
      )
    ).toEqual({
      oneOf: [
        { use: ["thread-loader", { loader: "/repo/node_modules/babel-loader/lib/index.js", options: { cwd: "/app" } }] }
      ]
    })
  })

  it("keeps a cwd the project set, a query string's options, and other loaders as they are", () => {
    const rule = { use: [{ loader: "babel-loader", options: { cwd: "/elsewhere" } }, "ts-loader"] }

    expect(babelFromRoot(rule, "/app")).toEqual(rule)
    expect(babelFromRoot({ loader: "babel-loader", options: "presets[]=x" }, "/app")).toEqual({
      loader: "babel-loader",
      options: "presets[]=x"
    })
    expect(babelFromRoot("...", "/app")).toBe("...")
  })

  it("changes what a function's use gives, when the tool calls it", () => {
    const changed = z
      .looseObject({ use: z.instanceof(Function) })
      .parse(babelFromRoot({ use: () => ["babel-loader"] }, "/app"))

    expect(changed.use({})).toEqual([{ loader: "babel-loader", options: { cwd: "/app" } }])
  })
})
