import { Fragment, jsx } from "react/jsx-runtime"
import { describe, expect, it } from "vite-plus/test"
import { Fragment as StandInFragment, jsxDEV } from "./jsx-dev-runtime.ts"
import { jsxDevRuntimeStandIn, reactBuild, reactBuildConfig } from "./react-build.ts"

describe("reactBuild", () => {
  it("reads PARITY_REACT, where unset is the development build", () => {
    expect(reactBuild("production")).toBe("production")
    expect(reactBuild("development")).toBe("development")
    expect(reactBuild(undefined)).toBe("development")
    expect(reactBuild("")).toBe("development")
  })

  it("rejects a build it doesn't know", () => {
    expect(() => reactBuild("prod")).toThrow(/PARITY_REACT is "prod"/)
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
