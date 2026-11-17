import { defineExtension, type ExtensionApi, type Parity } from "@parity-app/extension"
import { defineWindowModule, type InternalParity } from "@parity-app/extension/internal"

/*
 * A minimal internal extension for tests, never shipped in the app: a window module that starts while its app setting
 * is on, and a Node half, which call each other. Its command fails on purpose, to count failures.
 */

/** Its `package.json`, as `readExtension` takes it with `{ builtIn: true }`. */
export const windowTestPackage = {
  name: "@parity-app/extension-window-test",
  version: "0.0.0",
  main: "./src/extension.ts",
  parity: {
    displayName: "Window test",
    prefix: "wtest",
    icon: { viewBox: "0 0 24 24", path: "M4 4h16v16H4z" },
    internal: true,
    window: "./window",
    detect: { always: true },
    activates: ["onSetting:wtest.on"],
    contributes: {
      commands: [
        { id: "wtest.fail", title: "Fail on purpose" },
        { id: "wtest.confirm", title: "Ask through the Node half" }
      ],
      settings: { "wtest.on": { type: "boolean", default: false, scope: "app", title: "Turned on" } }
    }
  }
}

/** What its window module offers its Node half. */
export interface WindowTestForNode extends ExtensionApi {
  status(): { tab: string; selections: number }
}

/** What its Node half offers its window module. */
export interface WindowTestNodeApi extends ExtensionApi {
  ping(): string
  windowStatus(): Promise<{ tab: string; selections: number }>
  /** Asks the person, which fails during an agent's call. */
  confirm(): Promise<boolean>
}

/** What its window module offers other window modules in the tab. */
export interface WindowTestWindowApi {
  greet(name: string): string
  /** Asks its Node half, as the window module would. */
  pingNode(): Promise<string>
}

export const windowTestModule = defineWindowModule<WindowTestWindowApi, WindowTestForNode>({
  activateWindow(parity) {
    let selections = 0

    parity.subscriptions.push(
      parity.selection.onChange(() => {
        selections += 1
      }),
      parity.commands.register("wtest.fail", () => {
        throw new Error("Failing on purpose")
      }),
      parity.commands.register("wtest.confirm", () => parity.host.api<WindowTestNodeApi>().confirm())
    )

    return {
      window: {
        greet: (name) => `Hello, ${name}`,
        pingNode: () => parity.host.api<WindowTestNodeApi>().ping()
      },
      node: { status: () => ({ tab: parity.tab, selections }) }
    }
  }
})

function isInternal(parity: Parity): parity is InternalParity {
  return "window" in parity
}

export const windowTestNode = defineExtension<WindowTestNodeApi>({
  activate(parity) {
    if (!isInternal(parity)) {
      throw new Error("The window test extension needs its window module")
    }

    return {
      ping: () => "pong",
      confirm: () => parity.ui.confirm("Go on?"),
      windowStatus: () => parity.window.api<WindowTestForNode>().status()
    }
  }
})
