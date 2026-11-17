import { describe, expect, it } from "vite-plus/test"
import { pageEntrySource } from "./page-entry.ts"

describe("pageEntrySource", () => {
  it("imports the runtime and the page modules, and starts the runtime with them", () => {
    const source = pageEntrySource(
      {
        runtime: "/parity/page-runtime.mjs",
        routers: [
          { extension: "tanstack-router", file: "/parity/page/tanstack-router.mjs", export: "tanstackRouterPage" }
        ],
        hydration: [{ extension: "react", file: "/parity/page/react.mjs", export: "reactHydration" }]
      },
      (file) => `/@fs${file}`
    )

    expect(source.split("\n")).toEqual([
      'import { startPageRuntime } from "/@fs/parity/page-runtime.mjs"',
      'import { tanstackRouterPage as router0 } from "/@fs/parity/page/tanstack-router.mjs"',
      'import { reactHydration as hydration0 } from "/@fs/parity/page/react.mjs"',
      "startPageRuntime({ routers: [router0], hydration: [hydration0] })",
      ""
    ])
  })

  it("starts the runtime with nothing to drive for an app without page modules", () => {
    expect(pageEntrySource({ runtime: "C:/parity/page-runtime.mjs", routers: [], hydration: [] })).toContain(
      "startPageRuntime({ routers: [], hydration: [] })"
    )
  })
})
