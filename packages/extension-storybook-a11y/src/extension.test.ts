import { memoryPorts } from "@parity-app/channel"
import type { ExtensionModule } from "@parity-app/extension-api"
import type { StorybookApi } from "@parity-app/extension-storybook"
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { type ExtensionWindow, extensionHosts, readExtension, serveExtensionHost } from "@parity-app/extensions"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { describe, expect, it } from "vite-plus/test"
import packageJson from "../package.json" with { type: "json" }
import { accessibilityPage, hasAddon } from "./accessibility.ts"
import * as accessibility from "./extension.ts"

const story = "http://localhost:6006/?path=/story/button--primary"

/** What happened as the extensions started, in order. */
const happened: string[] = []

/** The Storybook extension's API as the accessibility extension uses it, without a Storybook to start. */
const storybook: ExtensionModule = {
  activate: (): StorybookApi => (
    happened.push("storybook activated"),
    {
      componentsWithStories: () => ["Button"],
      storyFiles: () => ["src/button.stories.tsx"],
      storyPage: (component, kind) =>
        Promise.resolve(component === "Button" && kind === "story" ? story : "http://localhost:6006")
    }
  )
}

/** Both extensions, each in a host in memory, run by the real host code. */
function setUp() {
  const opened: string[] = []

  const modules = new Map([
    ["@parity-app/extension-storybook", storybook],
    ["@parity-app/extension-storybook-a11y", accessibility]
  ])

  const ui: ExtensionWindow["ui"] = async (_projectId, _extension, method, params) => {
    if (method === "ui.open" && "url" in params) {
      opened.push(params.url)
    }

    return undefined
  }

  const hosts = extensionHosts({
    extensions: [readExtension(storybookPackage), readExtension(packageJson)].map((found) => ({
      package: found,
      main: found.id,
      detect: () => ({})
    })),
    start() {
      const [service, host] = memoryPorts()
      let end: (ending: ChildEnd) => void = () => undefined

      const life = lifecycle({
        onOutput: () => undefined,
        onEnd: (listener) => (end = listener),
        kill: () => end({ signal: "SIGTERM" })
      })

      serveExtensionHost({
        port: host,
        load: (main) => Promise.resolve(Object.assign(Object.create(null), modules.get(main))),
        exit: () => end({ code: 0 })
      })

      return { port: service, life }
    },
    state: { read: () => ({ app: {}, project: {}, status: {} }), write: () => undefined },
    window: {
      updateSetting: () => Promise.resolve(),
      changed: () => undefined,
      logged: () => undefined,
      ui,
      reveal: () => undefined
    },
    processes: {
      start: () => Promise.reject(new Error("Not in this test")),
      adopt: () => {
        throw new Error("Not in this test")
      },
      find: () => Promise.resolve([]),
      stop: () => Promise.resolve(),
      restart: () => Promise.reject(new Error("Not in this test")),
      ready: () => Promise.reject(new Error("Not in this test")),
      ended: () => Promise.reject(new Error("Not in this test")),
      report: () => undefined,
      summarize: () => undefined,
      markReady: () => undefined,
      snapshot(caller) {
        happened.push(`processes for ${caller.extension}`)

        return { list: [], output: {}, ready: {} }
      },
      watch: () => () => undefined,
      reattached: () => undefined,
      stopAll: () => undefined
    },
    providers: {
      register: () => undefined,
      changed: () => undefined,
      dispose: () => undefined,
      disposeAll: () => undefined
    },
    files: {
      place: { home: "/home", variables: {}, platform: "linux" },
      read: () => Promise.reject(new Error("Not in this test")),
      watch: () => () => undefined
    },
    edits: { transact: () => Promise.resolve(), files: () => Promise.resolve([]) }
  })

  hosts.open({ id: "shop", root: "/shop", name: "Shop" })

  return { hosts, opened }
}

describe("the accessibility extension", () => {
  it("has a manifest Parity accepts, building on the Storybook extension", () => {
    const found = readExtension(packageJson)

    expect(found.manifest.extensionDependencies).toEqual(["@parity-app/extension-storybook"])
    expect(found.manifest.contributes.agentTools?.map((tool) => tool.name)).toEqual(["a11y.page"])
    // Every placement, Search's among them, is greyed where there's no component with stories to check.
    expect(
      Object.values(found.manifest.contributes.menus ?? {})
        .flat()
        .map((item) => item?.enablement)
    ).toEqual(["a11y.hasStories", "a11y.hasStories", "a11y.hasStories", "a11y.hasStories"])
  })

  it("opens a component's first story with the accessibility panel, through the Storybook extension's API", async () => {
    const { hosts, opened } = setUp()

    await hosts.run("shop", "a11y.open", { type: "component", key: "Button" })

    expect(opened).toEqual([`${story}&addonPanel=storybook/a11y/panel`])
  })

  it("hands the accessibility extension its processes once the Storybook extension has activated", async () => {
    happened.length = 0
    const { hosts } = setUp()

    await hosts.run("shop", "a11y.open", { type: "component", key: "Button" })

    expect(happened.indexOf("processes for @parity-app/extension-storybook-a11y")).toBeGreaterThan(
      happened.indexOf("storybook activated")
    )
  })

  it("gives an agent the page as a tool", async () => {
    const { hosts } = setUp()

    await expect(
      hosts.runForAgent("shop", { name: "a11y.page", input: { component: "Button" } }, "Claude Code")
    ).resolves.toEqual({ url: `${story}&addonPanel=storybook/a11y/panel` })
    await expect(
      hosts.runForAgent("shop", { name: "a11y.page", input: { component: "Card" } }, "Claude Code")
    ).rejects.toThrow("Only a story's page has the accessibility panel")
  })
})

describe("accessibilityPage", () => {
  it("opens the panel on a story's page only", () => {
    expect(accessibilityPage(story)).toBe(`${story}&addonPanel=storybook/a11y/panel`)
    expect(() => accessibilityPage("http://localhost:6006/?path=/docs/button--docs")).toThrow(
      "Only a story's page has the accessibility panel"
    )
  })
})

describe("hasAddon", () => {
  it("finds the addon in any kind of dependencies", () => {
    expect(hasAddon({ devDependencies: { "@storybook/addon-a11y": "^10.0.0" } })).toBe(true)
    expect(hasAddon({ dependencies: { storybook: "^10.0.0" } })).toBe(false)
    expect(hasAddon(null)).toBe(false)
  })
})
