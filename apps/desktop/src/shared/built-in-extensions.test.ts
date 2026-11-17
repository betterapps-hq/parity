import { describe, expect, it } from "vite-plus/test"
import {
  type BuiltInExtension,
  builtInExtensions,
  nodeHalfEntries,
  pageEntries,
  readBuiltIns,
  windowModuleEntries,
  windowModulesSource
} from "./built-in-extensions.ts"

/** An internal extension's `package.json`, with a window module and, unless `main` is left out, a Node half. */
function internal(name: string, change: { main?: string; sync?: boolean } = {}): BuiltInExtension {
  const packageJson = {
    name,
    version: "0.0.0",
    main: change.main,
    parity: {
      displayName: name,
      prefix: name,
      icon: { viewBox: "0 0 24 24", path: "M4 4h16v16H4z" },
      internal: true,
      window: "./window",
      detect: { always: true },
      activates: ["onStartup"],
      contributes: change.sync ? { sync: true } : {}
    }
  }

  return { packageJson, bundle: name }
}

describe("the built-in list", () => {
  it("reads every built-in extension without refusing one", () => {
    const { read, refused } = readBuiltIns()

    expect(refused).toEqual([])
    expect(read.map(({ found }) => found.id)).toEqual(builtInExtensions.map(({ packageJson }) => packageJson.name))
  })

  it("gives the service's hosts, the Node halves' bundles and the window modules from the one list", () => {
    const list = [...builtInExtensions, internal("presence"), internal("room", { main: "./src/extension.ts" })]
    const { read } = readBuiltIns(list)
    const nodeHalves = nodeHalfEntries(read)
    const windows = windowModuleEntries(read)

    // Each host the service starts has a bundle, and each window module a chunk in the window's build.
    expect(Object.keys(nodeHalves)).toEqual(
      read.filter(({ found }) => found.main !== undefined).map(({ bundle }) => `extensions/${bundle}`)
    )
    expect(nodeHalves["extensions/room"]).toBe("room")
    expect(nodeHalves["extensions/presence"]).toBeUndefined()
    expect(windows).toEqual({ ...windowModuleEntries(), presence: "presence/window", room: "room/window" })
    expect(windowModulesSource(windows)).toContain(
      '  ["presence", () => import("presence/window")],\n  ["room", () => import("room/window")]\n])'
    )
  })

  it("lists the window modules for the window's build, as renderer/window-module-list.ts", async () => {
    expect(windowModuleEntries()).toEqual({
      "@parity-app/extension-agent-presence": "@parity-app/extension-agent-presence/window"
    })
    await expect(windowModulesSource()).toMatchFileSnapshot("../renderer/window-module-list.ts")
  })

  it("bundles the page runtime and the built-in page modules for the app's page (PAR-1260)", () => {
    expect(pageEntries()).toEqual({
      "page-runtime": "@parity-app/page-runtime",
      "page/react": "@parity-app/extension-react/page",
      "page/tanstack-router": "@parity-app/extension-tanstack-router/page"
    })
  })

  it("refuses both of two built-in extensions that bring the room", () => {
    const { read, refused } = readBuiltIns([internal("one", { sync: true }), internal("two", { sync: true })])

    expect(read).toEqual([])
    expect(refused.map((each) => [each.extension, each.rule])).toEqual([
      ["one", "secondSync"],
      ["two", "secondSync"]
    ])
  })
})
