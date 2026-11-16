import { locateNode } from "@parity-app/core"
import { selectionRefs } from "@parity-app/editor"
import type { CommandTarget, JsonValue, NodeRef } from "@parity-app/extension"
import {
  type WindowEditor,
  windowExtensions,
  type WindowModules,
  windowModules
} from "@parity-app/extension-host/window"
import type { ExtensionStatus, LogLine } from "../shared/protocol.ts"
import type { EditorRequest } from "./extensions.ts"
import { clearProjectExtensionSetting, setProjectExtensionSetting } from "./project-settings.ts"
import { track } from "./report-error.ts"
import { request } from "./service.ts"
import type { Store } from "./store.ts"
import { notify } from "./toasts.tsx"
import type { ProjectSession } from "./workspace.ts"

/*
 * Internal extensions' window modules in each project tab (docs/proposals/extensions-in-the-window.md). The tab starts
 * them from what the service sends of the project's extensions: once one has a window module whose activation holds,
 * its code loads into the window, sharing Parity's React and kit, and runs until the tab closes or it stops holding.
 * Its log lines go to the extension's log tab, its errors to Sentry tagged with the extension, and its calls to its
 * Node half through the service.
 */

/** What the tab needs of the project's extensions, as `extensionsOf` keeps them. */
interface TabExtensions {
  store: Pick<Store<{ extensions: ExtensionStatus[] }>, "get" | "subscribe">
  logged(extension: string, line: LogLine): void
}

/** Each open tab's window modules, once one of its extensions has a window module. */
const running = new WeakMap<Pick<ProjectSession, "id">, WindowModules>()

/** What `extension.capabilityMissing` has been sent for in this window, so each is sent once a session. */
const reported = new Set<string>()

/** The window modules running in a project's tab, if any are. */
export function windowModulesFor(session: Pick<ProjectSession, "id">): WindowModules | undefined {
  return running.get(session)
}

/** Runs a command a window module in the tab registered. `handled` is false when none did. */
export async function runWindowCommand(
  session: Pick<ProjectSession, "id">,
  command: string,
  target?: CommandTarget
): Promise<{ handled: boolean; result?: JsonValue }> {
  return (await running.get(session)?.run(command, target)) ?? { handled: false }
}

/**
 * Starts the tab's window modules, following its extensions as the service sends them, until the function it gives
 * is called as the tab closes.
 */
export function startWindowModules(session: ProjectSession, tab: string, extensions: TabExtensions): () => void {
  let modules: WindowModules | undefined

  const follow = () => {
    const found = windowExtensions(extensions.store.get().extensions)

    // Nothing loads until an extension has a window module.
    if (found.length === 0 && !modules) {
      return
    }

    modules ??= start(session, tab, extensions)
    running.set(session, modules)
    modules.update(found)
  }

  follow()
  const unsubscribe = extensions.store.subscribe(follow)

  return () => {
    unsubscribe()
    running.delete(session)
    void modules?.dispose()
  }
}

function start(session: ProjectSession, tab: string, extensions: TabExtensions): WindowModules {
  const projectId = session.id
  const name = (id: string) => extensions.store.get().extensions.find((each) => each.id === id)?.displayName ?? id

  return windowModules({
    tab,
    project: { root: session.info.root, name: session.info.name },
    // Each module is a chunk of its own, listed from the built-in list (shared/built-in-extensions.ts).
    load: async (id) => {
      const { windowModules: list } = await import("./window-module-list.ts")
      const load = list[id]

      if (!load) {
        throw new Error(`${id} has no window module in this build`)
      }

      return load()
    },
    editor: editorOf(session, extensions),
    halves: {
      start: (extension, trigger) =>
        void request("extensions.startHalf", { projectId, extension, trigger }).catch(() => undefined),
      call: async (extension, method, args) =>
        (await request("extensions.callHalf", { projectId, extension, method, args })).result,
      state: (extension, state) =>
        void request("extensions.windowState", { projectId, extension, state }).catch(() => undefined)
    },
    updateSetting: async (extension, key, value) => {
      if (value === undefined) {
        clearProjectExtensionSetting(extension, key, session.doc)
      } else {
        setProjectExtensionSetting(extension, key, value, session.doc)
      }
    },
    // The log tab marks each line as the window module's, beside its Node half's.
    log: (extension, level, text, stack) => {
      const line: LogLine = { level, text: `[window] ${text}`, at: Date.now() }

      if (stack !== undefined) {
        line.stack = stack
      }

      extensions.logged(extension, line)
    },
    record: track,
    // Sentry loads with the first error, so nothing here pulls it into the tab's code.
    report: (error, tags) =>
      void import("@sentry/electron/renderer").then((Sentry) => Sentry.captureException(error, { tags })),
    stopped: (extension) =>
      notify.warning(`${name(extension.id)} stopped working in this tab`, {
        description: "Reopen the project to start it again."
      }),
    reported
  })
}

/** The tab's selection, navigation and commands, as a window module reaches them, answered as an extension's asks are. */
function editorOf(session: ProjectSession, extensions: TabExtensions): WindowEditor {
  const ask = async (asked: EditorRequest) => {
    // It reaches into the canvas and the panels, so it loads with the first such request.
    const { answerEditor } = await import("./extension-editor.ts")

    return answerEditor(session, asked)
  }

  const asking = { projectId: session.id, extension: "" } as const

  const go = async (params: Extract<EditorRequest, { method: "navigate" }>["params"]) => {
    const answer = await ask({ ...asking, method: "navigate", params })

    return answer instanceof Object && "url" in answer ? answer.url : undefined
  }

  return {
    selection: {
      get: () => refsOf(session),
      set: async (refs) => void (await ask({ ...asking, method: "selection.set", params: { refs } })),
      highlight: async (refs) => void (await ask({ ...asking, method: "selection.highlight", params: { refs } })),
      onChange(listener) {
        let sent = JSON.stringify(refsOf(session))

        return session.selection.subscribe(() => {
          const refs = refsOf(session)
          const key = JSON.stringify(refs)

          if (key !== sent) {
            sent = key
            listener(refs)
          }
        })
      }
    },
    navigate: {
      reveal: async (ref) => void (await go({ kind: "reveal", ref })),
      zoomTo: async (ref) => void (await go({ kind: "zoomTo", ref })),
      openDesign: async (key) => void (await go({ kind: "openDesign", key })),
      setMode: async (mode) => void (await go({ kind: "setMode", mode })),
      setState: async (design, state) => void (await go({ kind: "setState", design, state })),
      showTab: async (id) => void (await go({ kind: "showTab", id })),
      openSettings: async (id) => void (await go({ kind: "openSettings", id: id ?? "" })),
      pageUrl: (ref) => go({ kind: "pageUrl", ref })
    },
    execute: async (command, target) => {
      const declared = extensions.store
        .get()
        .extensions.some((extension) => extension.contributes.commands?.some((each) => each.id === command))

      // An extension's command goes to the service, which runs it in its window module or its Node half.
      if (declared) {
        await request(
          "extensions.run",
          target ? { projectId: session.id, command, target } : { projectId: session.id, command }
        )

        return
      }

      await ask({ ...asking, method: "commands.execute", params: target ? { command, target } : { command } })
    }
  }
}

/** What's selected in the tab, by `NodeRef`, as `parity.selection` gives it. */
function refsOf(session: Pick<ProjectSession, "selection" | "doc">): NodeRef[] {
  return selectionRefs(session.selection.get(), (design, node) => {
    const root = session.doc.design(design)?.root

    return root && locateNode(root, node)?.node.type
  })
}
