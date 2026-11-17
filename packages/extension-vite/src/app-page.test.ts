import type { PageModules } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { pageFolders, wrappedImport } from "./app-page.ts"

const wrapper = "/parity/page/react-router--react-router.mjs"

const modules: PageModules = {
  runtime: "/parity/page-runtime.mjs",
  routers: [{ extension: "react-router", file: "/parity/page/react-router.mjs", export: "reactRouterPage" }],
  hydration: [],
  wraps: [{ extension: "react-router", package: "react-router", file: wrapper }]
}

const wraps = modules.wraps ?? []
const asIs = (path: string) => path

describe("wrappedImport", () => {
  it("serves a wrapped package to the app's own modules through Parity's module (PAR-1265)", () => {
    expect(wrappedImport("react-router", "/app/src/main.tsx", wraps, asIs)).toBe(wrapper)
    expect(wrappedImport("react-router", "/app/src/routes.tsx?v=3", wraps, asIs)).toBe(wrapper)
    expect(wrappedImport("react-router-dom", "/app/src/main.tsx", wraps, asIs)).toBeUndefined()
  })

  it("leaves packages' own imports of a wrapped package alone", () => {
    expect(wrappedImport("react-router", "/app/node_modules/some-library/index.js", wraps, asIs)).toBeUndefined()
  })

  it("sends the wrapping module's own import to the app's copy", () => {
    expect(wrappedImport("react-router", wrapper, wraps, asIs)).toBe("app")
  })

  it("wraps nothing without wrapped packages, as before the builder has the project's config", () => {
    expect(wrappedImport("react-router", "/app/src/main.tsx", [], asIs)).toBeUndefined()
  })
})

describe("pageFolders", () => {
  it("lets the server serve the wrapping modules' folders too", () => {
    expect(pageFolders(modules)).toEqual(["/parity", "/parity/page"])
  })
})
