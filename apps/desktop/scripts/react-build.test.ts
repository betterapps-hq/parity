import { Fragment, jsx } from "react/jsx-runtime"
import { describe, expect, it } from "vite-plus/test"
import { Fragment as StandInFragment, jsxDEV } from "./jsx-dev-runtime.ts"
import { jsxDevRuntimeStandIn, reactBuild, reactBuildConfig, reactFlag } from "./react-build.ts"

describe("reactBuild", () => {
  it("reads a --react value, where none is the development build", () => {
    expect(reactBuild("production")).toBe("production")
    expect(reactBuild("development")).toBe("development")
    expect(reactBuild(undefined)).toBe("development")
  })

  it("rejects a build it doesn't know", () => {
    expect(() => reactBuild("prod")).toThrow(/--react is "prod"/)
  })
})

describe("reactFlag", () => {
  it("is the development build without the flag, leaving the arguments as they were", () => {
    expect(reactFlag(["examples/shop"])).toEqual({ build: "development", rest: ["examples/shop"] })
    expect(reactFlag([])).toEqual({ build: "development", rest: [] })
  })

  it("takes the flag and its value out wherever they are", () => {
    expect(reactFlag(["--react", "production", "examples/shop"])).toEqual({
      build: "production",
      rest: ["examples/shop"]
    })
    expect(reactFlag(["examples/shop", "--react", "development"])).toEqual({
      build: "development",
      rest: ["examples/shop"]
    })
  })

  it("rejects the flag without a value", () => {
    expect(() => reactFlag(["--react"])).toThrow(/--react needs/)
    expect(() => reactFlag(["--react", "--other"])).toThrow(/--react needs/)
  })
})

describe("reactBuildConfig", () => {
  it("adds nothing for the development build", () => {
    expect(reactBuildConfig("development")).toEqual({ react: {}, alias: {}, dependencies: {} })
  })

  it("prebundles dependencies as production, sends jsxDEV to the stand-in and turns Fast Refresh off", () => {
    const config = reactBuildConfig("production")
    expect(config.dependencies).toEqual({ transform: { define: { "process.env.NODE_ENV": '"production"' } } })
    expect(config.alias).toEqual({ "react/jsx-dev-runtime": jsxDevRuntimeStandIn })
    // plugin-react's include is the modules Fast Refresh wraps; this one matches none, not even an empty id.
    const { include } = config.react
    expect(include).toBeInstanceOf(RegExp)
    for (const id of ["", "/src/renderer/App.tsx", "D:/canvas/apps/desktop/src/renderer/main.tsx?v=1"]) {
      expect(include?.test(id)).toBe(false)
    }
  })
})

describe("the jsx-dev-runtime stand-in", () => {
  it("is React's production jsx and Fragment", () => {
    expect(jsxDEV).toBe(jsx)
    expect(StandInFragment).toBe(Fragment)
  })
})
