import { locateNode } from "@parity-app/core"
import { selectionRefs } from "@parity-app/editor"
import type { CommandTarget, JsonValue, NodeRef } from "@parity-app/extension"
import {
  type WindowEditor,
  windowExtensions,
  type WindowModules,
  windowModules,
  type WindowSurface
} from "@parity-app/extension-host/window"
import { windowAgents } from "@parity-app/extension-host/window-agents"
import { windowCanvas } from "@parity-app/extension-host/window-canvas"
import { windowPresence } from "@parity-app/extension-host/window-presence"
import { type Opening, type SyncDocument, type SyncPort, windowSync } from "@parity-app/extension-host/window-sync"
import { registeredEvents } from "@parity-app/telemetry"
import type { ExtensionStatus, LogLine } from "../shared/protocol.ts"
import type { ServiceParams } from "../shared/service-params.ts"
import { type EditorRequest, extensionsOf, type ProjectExtensions } from "./extensions.ts"
import { clearProjectExtensionSetting, setProjectExtensionSetting } from "./project-settings.ts"
import { track } from "./report-error.ts"
import { request } from "./service.ts"
import type { Store } from "./store.ts"
import { TabSlot } from "./tab-slot.ts"
import { notify } from "./toasts.tsx"
import { windowCanvasPort } from "./window-canvas.tsx"
import { windowModules as windowModuleList } from "./window-module-list.ts"
import { windowAgentsPort, windowPresencePort } from "./window-seams.ts"
import type { ProjectSession } from "./workspace.ts"

/*
 * Internal extensions' window modules in each project tab (docs/proposals/extensions-in-the-window.md). They start
 * before the project's document opens (PAR-1267), from what the service lists of the project's extensions, so the one
 * that brings the room can say how the document opens through `parity.sync`; then they follow the extensions as the
 * service sends them. Once one has a window module whose activation holds, its code loads into the window, sharing
 * Parity's React and kit, and runs until the tab closes or it stops holding. Its log lines go to the extension's log
 * tab, its errors to Sentry tagged with the extension, and its calls to its Node half through the service.
 */

/** What the tab needs of the project's extensions, as `extensionsOf` keeps them. */
interface TabExtensions {
  store: Pick<Store<{ extensions: ExtensionStatus[] }>, "get" | "subscribe">
  logged(extension: string, line: LogLine): void
}

/** Each open tab's window modules, by project, once one of its extensions has a window module. */
const running = new Map<string, WindowModules>()

/** What `extension.capabilityMissing` has been sent for in this window, so each is sent once a session. */
const reported = new Set<string>()

/** The window modules running in a project's tab, if any are. */
export function windowModulesFor(session: Pick<ProjectSession, "id">): WindowModules | undefined {
  return running.get(session.id)
}

/** Runs a command a window module in the tab registered. `handled` is false when none did. */
export async function runWindowCommand(
  session: Pick<ProjectSession, "id">,
  command: string,
  target?: CommandTarget,
  call?: number
): Promise<{ handled: boolean; result?: JsonValue }> {
  return (await running.get(session.id)?.run(command, target, call)) ?? { handled: false }
}

/** What the tab does for `parity.sync` that needs the workspace. */
export interface TabSyncPort {
  /** Closes the project and opens it again, asking the extension that brings the room how. */
  reopen(): Promise<void>
}

/** A project tab's window modules, started before its document opens (PAR-1267). */
export interface TabModules {
  readonly slot: TabSlot
  /**
   * Asks the extension that brings the room how the project opens. Nothing when none does, or when it failed: the
   * project then opens from files, alone.
   */
  opening(): Promise<Opening | undefined>
  /** The tab's session opened, on `document` when it opened as `opening` said. */
  opened(session: ProjectSession, document?: { sync: SyncDocument; lineage: string }): void
  /** The tab closed or reopens. The room doesn't count that as going away, so nothing is detached or saved for it. */
  stop(): void
}

const none: ProjectExtensions = { extensions: [], logs: {} }

/** How long the tab waits for the project's extensions before opening without them. */
const listWaitMs = 5000

/** How often an opening tab asks for its extensions again, as a Node half its window module waits for gets ready. */
const listPollMs = 500

/**
 * Starts a project tab's window modules before its document opens, from the project's extensions as the service lists
 * them, waiting for their activations, and follows the extensions once the session opens. Nothing loads, and the list
 * isn't asked for, when the build has no window modules.
 */
export async function startTabModules(
  project: { id: string; root: string; name: string },
  port: TabSyncPort
): Promise<TabModules> {
  const slot = new TabSlot(project.id)
  const tab = project.id

  // A service that doesn't answer in time leaves the modules to start once the session's list arrives.
  let early: ProjectExtensions =
    Object.keys(windowModuleList).length > 0
      ? await Promise.race([
          request("extensions.list", { projectId: project.id }).catch(() => none),
          new Promise<ProjectExtensions>((resolve) => setTimeout(() => resolve(none), listWaitMs))
        ])
      : none

  /** Lines logged before the session opened, for its log tabs once it has. */
  const logs: { extension: string; line: LogLine }[] = []

  // The service tells a project's changes to its session, so until that opens the tab asks again, and a Node half's
  // state reaches its window module while the document waits on it.
  const earlyListeners = new Set<() => void>()
  let polling: ReturnType<typeof setInterval> | undefined

  const stopPolling = () => {
    clearInterval(polling)
    polling = undefined
    earlyListeners.clear()
  }

  if (Object.keys(windowModuleList).length > 0) {
    polling = setInterval(() => {
      void request("extensions.list", { projectId: project.id })
        .then((listed) => {
          if (polling === undefined || JSON.stringify(listed.extensions) === JSON.stringify(early.extensions)) {
            return
          }

          early = { ...early, extensions: listed.extensions }

          for (const listener of earlyListeners) {
            listener()
          }
        })
        .catch(() => undefined)
    }, listPollMs)
  }

  const extensions: TabExtensions = {
    store: {
      get: () => (slot.session ? extensionsOf(slot.session).store.get() : early),
      subscribe(listener) {
        earlyListeners.add(listener)

        const stop = slot.when((session) => {
          earlyListeners.delete(listener)
          listener()

          return extensionsOf(session).store.subscribe(listener)
        })

        return () => {
          earlyListeners.delete(listener)
          stop()
        }
      }
    },
    logged(extension, line) {
      if (slot.session) {
        extensionsOf(slot.session).logged(extension, line)
      } else {
        logs.push({ extension, line })
      }
    }
  }

  /**
   * Whether the document is open through the seam, or reopening to, so a room that starts later reopens it once. Leaving
   * the room clears it, so a room started again reopens the document in it too.
   */
  let throughSync = false

  const seam = windowSync(
    syncPort(slot, port, () => {
      throughSync = false
    })
  )

  let modules: WindowModules | undefined
  let stopAgents: (() => void) | undefined
  let stopped = false

  const follow = () => {
    const found = windowExtensions(extensions.store.get().extensions)

    // Nothing loads until an extension has a window module.
    if (found.length === 0 && !modules) {
      return
    }

    if (!modules) {
      const agents = windowAgents(windowAgentsPort(slot, tab))
      stopAgents = () => agents.dispose()
      modules = start(slot, project, extensions, agents, seam)
    }

    running.set(project.id, modules)
    modules.update(found)

    // A room turned on after the project opened, as the Live room setting is: the project opens again in it.
    if (slot.session) {
      void modules.activating().then(() => {
        if (!stopped && !throughSync && seam.handled) {
          throughSync = true
          void port.reopen()
        }
      })
    }
  }

  follow()
  const unsubscribe = extensions.store.subscribe(follow)
  await modules?.activating()

  return {
    slot,
    opening: () => seam.open(),
    opened(session, document) {
      if (stopped) {
        return
      }

      stopPolling()
      extensionsOf(session).seed(early)

      for (const { extension, line } of logs.splice(0)) {
        extensionsOf(session).logged(extension, line)
      }

      if (document) {
        throughSync = true
        seam.attach(document.sync, document.lineage)
      }

      slot.open(session)
    },
    stop() {
      if (stopped) {
        return
      }

      stopped = true
      stopPolling()

      unsubscribe()
      seam.close()
      slot.close()

      if (running.get(project.id) === modules) {
        running.delete(project.id)
      }

      void (modules?.dispose() ?? Promise.resolve()).finally(() => {
        stopAgents?.()
        seam.dispose()
      })
    }
  }
}

/** The tab's side of `parity.sync`: its saver, reopening, and telling the person the room went away. */
function syncPort(slot: TabSlot, port: TabSyncPort, detached: () => void): SyncPort {
  return {
    format: "loro/1",
    setWritesFiles(writes) {
      const saver = slot.session?.saver

      if (!saver) {
        return Promise.reject(new Error("The project hasn't opened yet"))
      }

      return saver.setWritesFiles(writes)
    },
    writesFiles: () => slot.session?.saver.writesFiles() ?? true,
    reopen: () => port.reopen(),
    left(saved) {
      detached()

      if (saved) {
        notify.info("Left the live room", { description: "Your copy has every change and is saved." })
      } else {
        notify.warning("Left the live room", { description: "Your copy has every change. Save to keep them." })
      }
    },
    record: track
  }
}

function start(
  slot: TabSlot,
  project: { id: string; root: string; name: string },
  extensions: TabExtensions,
  agents: WindowSurface,
  sync: WindowSurface
): WindowModules {
  const projectId = project.id
  const name = (id: string) => extensions.store.get().extensions.find((each) => each.id === id)?.displayName ?? id

  return windowModules({
    tab: project.id,
    project: { root: project.root, name: project.name },
    // Each module is a chunk of its own, listed from the built-in list (shared/built-in-extensions.ts).
    load: async (id) => {
      const load = windowModuleList[id]

      if (!load) {
        throw new Error(`${id} has no window module in this build`)
      }

      return load()
    },
    editor: editorOf(slot, extensions),
    // The canvas, the camera and colors, this person, agents, and the document.
    surfaces: {
      ...windowCanvas(windowCanvasPort(slot, project.id)),
      presence: windowPresence(windowPresencePort(slot)),
      agents,
      sync
    },
    halves: {
      start: (extension, trigger) =>
        void request("extensions.startHalf", { projectId, extension, trigger }).catch(() => undefined),
      call: async (extension, method, args) =>
        (await request("extensions.callHalf", { projectId, extension, method, args })).result,
      state: (extension, state) =>
        void request("extensions.windowState", { projectId, extension, state }).catch(() => undefined)
    },
    // Kept as the Node half's are, under the extension's prefix (`hosts.ts`, `settings.update`).
    updateSetting: async (prefix, key, value) => {
      const doc = slot.session?.doc

      if (!doc) {
        throw new Error("A project setting needs the project open")
      }

      if (value === undefined) {
        clearProjectExtensionSetting(prefix, key, doc)
      } else {
        setProjectExtensionSetting(prefix, key, value, doc)
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
    // An extension's own events, as the multiplayer extension's `room.*`, checked against their schemas as they're sent.
    recordOwn(extension, event, attributes) {
      if (!registeredEvents.some((each) => each.name === event)) {
        console.warn(`[telemetry] ${extension} recorded ${event}, which isn't defined`)

        return
      }

      // SAFETY: the event is registered, and `track` checks the attributes against its schema.
      track(event as never, attributes as never)
    },
    // Sentry loads with the first error, so nothing here pulls it into the tab's code.
    report: (error, tags) =>
      void import("@sentry/electron/renderer").then((Sentry) => Sentry.captureException(error, { tags })),
    stopped: (extension) =>
      notify.warning(`${name(extension.id)} stopped working in this project`, {
        description: "Reopen the project to start it again."
      }),
    reported
  })
}

/** The tab's selection, navigation and commands, as a window module reaches them, answered as an extension's asks are. */
function editorOf(slot: TabSlot, extensions: TabExtensions): WindowEditor {
  const ask = async (asked: EditorRequest) => {
    const { session } = slot

    if (!session) {
      throw new Error("The editor needs the project open")
    }

    // It reaches into the canvas and the panels, so it loads with the first such request.
    const { answerEditor } = await import("./extension-editor.ts")

    return answerEditor(session, asked)
  }

  const asking = { projectId: slot.id, extension: "" } as const

  const go = async (params: Extract<EditorRequest, { method: "navigate" }>["params"]) => {
    const answer = await ask({ ...asking, method: "navigate", params })

    return answer instanceof Object && "url" in answer ? answer.url : undefined
  }

  return {
    selection: {
      get: () => (slot.session ? refsOf(slot.session) : []),
      set: async (refs) => void (await ask({ ...asking, method: "selection.set", params: { refs } })),
      highlight: async (refs) => void (await ask({ ...asking, method: "selection.highlight", params: { refs } })),
      onChange: (listener) =>
        slot.when((session) => {
          let sent = JSON.stringify(refsOf(session))

          return session.selection.subscribe(() => {
            const refs = refsOf(session)
            const key = JSON.stringify(refs)

            if (key !== sent) {
              sent = key
              listener(refs)
            }
          })
        })
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
    execute: async (command, target, call) => {
      const declared = extensions.store
        .get()
        .extensions.some((extension) => extension.contributes.commands?.some((each) => each.id === command))

      // An extension's command goes to the service, which runs it in its window module or its Node half.
      if (declared) {
        const params: ServiceParams["extensions.run"] = { projectId: slot.id, command }

        if (target) {
          params.target = target
        }

        if (call !== undefined) {
          params.call = call
        }

        await request("extensions.run", params)

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
