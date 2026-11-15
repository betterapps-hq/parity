import { memoryPorts } from "@parity-app/channel"
import type { ExtensionModule, FormView, View, ViewItem } from "@parity-app/extension-api"
import { type ChildEnd, lifecycle } from "@parity-app/processes"
import { describe, expect, it, vi } from "vite-plus/test"
import { serveExtensionHost } from "./host.ts"
import {
  type ExtensionProcesses,
  type ExtensionProviders,
  type ExtensionStatus,
  extensionHosts,
  type OpenedProject
} from "./hosts.ts"
import { readExtension } from "./manifest.ts"

const project: OpenedProject = { id: "shop", root: "/shop", name: "Shop" }

const storybook = readExtension({
  name: "@parity-app/extension-storybook",
  version: "1.0.0",
  main: "src/extension.ts",
  parity: {
    displayName: "Storybook",
    prefix: "storybook",
    icon: { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" },
    activates: ["onDetect"],
    contributes: {
      commands: [{ id: "storybook.open", title: "Open in Storybook" }],
      tabs: [{ id: "storybook.stories", area: "left", title: "Stories", view: "tree" }],
      sections: [{ id: "storybook.options", title: "Options", view: "form" }],
      pages: [{ id: "storybook.setup", title: "Storybook setup", view: "list" }]
    }
  }
})

/** One extension's host in memory, running `module` through the real host code, as views.test's whole world. */
function setUp(module: ExtensionModule) {
  const changes: ExtensionStatus[][] = []
  const revealed: string[] = []

  const hosts = extensionHosts<OpenedProject>({
    extensions: [{ package: storybook, main: storybook.id, detect: () => ({}) }],
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
        load: () => Promise.resolve(Object.assign(Object.create(null), module)),
        exit: () => end({ code: 0 })
      })

      return { port: service, life }
    },
    state: { read: () => ({ app: {}, project: {}, status: {} }), write: () => undefined },
    window: {
      changed: (_projectId, extensions) => changes.push(extensions),
      logged: () => undefined,
      ui: () => Promise.resolve(undefined),
      reveal: (_projectId, _extension, view) => revealed.push(view),
      updateSetting: () => Promise.resolve()
    },
    edits: { transact: () => Promise.resolve(), files: () => Promise.resolve([]) },
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
      report: vi.fn<ExtensionProcesses["report"]>(),
      summarize: vi.fn<ExtensionProcesses["summarize"]>(),
      markReady: vi.fn<ExtensionProcesses["markReady"]>(),
      snapshot: () => ({ list: [], output: {}, ready: {} }),
      watch: () => () => undefined,
      reattached: vi.fn<ExtensionProcesses["reattached"]>(),
      stopAll: vi.fn<ExtensionProcesses["stopAll"]>()
    },
    providers: {
      register: vi.fn<ExtensionProviders["register"]>(),
      changed: vi.fn<ExtensionProviders["changed"]>(),
      dispose: vi.fn<ExtensionProviders["dispose"]>(),
      disposeAll: vi.fn<ExtensionProviders["disposeAll"]>()
    },
    files: {
      place: { home: "/home/ada", variables: {}, platform: "linux" },
      read: () => Promise.reject(new Error("Not in this test")),
      list: () => Promise.reject(new Error("Not in this test")),
      watch: () => () => undefined
    }
  })

  const views = () => changes.at(-1)?.[0]?.views

  return { hosts, changes, revealed, views }
}

async function settle(rounds = 10): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const button: ViewItem = { key: "Button", label: "Button", target: { type: "component", key: "Button" } }
const story: ViewItem = { key: "Button.stories.tsx", label: "Button.stories.tsx", parent: "Button" }

describe("declarative views", () => {
  it("draws nothing for a view until the code fills it, then its items and options", async () => {
    let tree: View<ViewItem> | undefined

    const { hosts, views } = setUp({
      activate(parity) {
        tree = parity.views.tree("storybook.stories", {
          empty: { title: "No stories" },
          itemActions: [{ command: "storybook.open" }]
        })
      }
    })

    hosts.open(project)
    expect(views()).toEqual({})

    await settle()

    expect(views()?.["storybook.stories"]).toEqual({
      kind: "tree",
      options: { empty: { title: "No stories" }, itemActions: [{ command: "storybook.open" }] },
      items: []
    })

    tree?.set([button, story])
    tree?.update({ description: "Every component's stories" })
    await settle()

    expect(views()?.["storybook.stories"]?.items).toEqual([button, story])
    expect(views()?.["storybook.stories"]?.options.description).toBe("Every component's stories")
  })

  it("sends a run of changes as one, keeping each item where it was", async () => {
    let tree: View<ViewItem> | undefined

    const { hosts, changes, views } = setUp({
      activate(parity) {
        tree = parity.views.tree("storybook.stories")
      }
    })

    hosts.open(project)
    await settle()
    const before = changes.length

    tree?.upsert([button, story])
    tree?.upsert({ ...button, detail: "2 stories" })
    tree?.upsert({ key: "Card", label: "Card" })
    tree?.remove("Button.stories.tsx")
    await settle()

    expect(changes.length).toBe(before + 1)
    expect(views()?.["storybook.stories"]?.items).toEqual([
      { ...button, detail: "2 stories" },
      { key: "Card", label: "Card" }
    ])
  })

  it("empties a view the code disposes of, and every view when its host restarts", async () => {
    let tree: View<ViewItem> | undefined

    const { hosts, views } = setUp({
      activate(parity) {
        tree = parity.views.tree("storybook.stories")
        tree.set([button])
        parity.views.list("storybook.setup").set([{ key: "config", label: "Config found" }])
      }
    })

    hosts.open(project)
    await settle()
    tree?.dispose()
    await settle()

    expect(Object.keys(views() ?? {})).toEqual(["storybook.setup"])

    hosts.restart("shop", storybook.id)
    expect(views()).toEqual({})
  })

  it("refuses a view the manifest doesn't declare, one of another kind, one filled twice, and undeclared actions", async () => {
    const refused: string[] = []

    const { hosts } = setUp({
      activate(parity) {
        const attempts = [
          () => parity.views.list("storybook.timings"),
          () => parity.views.table("storybook.stories", { columns: ["Name"] }),
          () => parity.views.list("storybook.setup", { toolbar: [{ command: "storybook.build" }] }),
          () => parity.views.list("storybook.setup"),
          () => parity.views.list("storybook.setup")
        ]

        for (const attempt of attempts) {
          try {
            attempt()
          } catch (error) {
            refused.push(error instanceof Error ? error.message : String(error))
          }
        }
      }
    })

    hosts.open(project)
    await settle()

    expect(refused).toEqual([
      "storybook.timings isn't a tab, section or page the manifest declares",
      "storybook.stories holds a tree view, not a table",
      "storybook.build isn't a command the manifest declares",
      "storybook.setup is filled already. Dispose of its view first."
    ])
  })

  it("tells a form's handlers what the person changed, and keeps the new value", async () => {
    let form: FormView | undefined
    const changed = vi.fn<(key: string, value: string | number | boolean) => void>()

    const { hosts, views } = setUp({
      activate(parity) {
        form = parity.views.form("storybook.options")
        form.set([{ key: "port", label: "Port", type: "number", value: 6006 }])
        form.onChange(changed)
      }
    })

    hosts.open(project)
    await settle()
    await hosts.viewChanged("shop", storybook.id, { view: "storybook.options", key: "port", value: 6007 })
    form?.update({ description: "How Storybook starts" })
    await settle()

    expect(changed).toHaveBeenCalledWith("port", 6007)
    expect(views()?.["storybook.options"]?.items).toEqual([{ key: "port", label: "Port", type: "number", value: 6007 }])
  })

  it("opens a view's tab or page when the code reveals it", async () => {
    const { hosts, revealed } = setUp({
      async activate(parity) {
        await parity.views.list("storybook.setup").reveal()
      }
    })

    hosts.open(project)
    await settle()

    expect(revealed).toEqual(["storybook.setup"])
  })
})
