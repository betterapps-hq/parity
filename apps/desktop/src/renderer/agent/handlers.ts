import type { IconNames, IconSet } from "@parity-app/agent"
import { activeTab, matchTab } from "@parity-app/agent/routing"
import { type ChangeConflict, CodedError, errorDetails, type LibraryInfo, unknownReference } from "@parity-app/core"
import { toast } from "sonner"
import type {
  AgentChanges,
  ServeAnswer,
  TabSnapshot,
  TabSummary,
  WindowMethod,
  WindowMethods
} from "../../shared/protocol.ts"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { reportIds } from "../telemetry.ts"
import { type ProjectSession, type Tab, workspace } from "../workspace.ts"
import { presence } from "./presence.ts"

/**
 * Answers the project service when an agent (the CLI or MCP) works on a tab. Agents read a snapshot, compute their
 * changes in the service, and apply them here as one undoable step, so people see them land and can undo them.
 */
export function serveAgents(): void {
  // When the person last used this copy, which `--tab active` and calls without a tab are routed by (PAR-514). A window
  // that opens with focus has been used since it opened.
  if (document.hasFocus()) focusedAt = Date.now()
  window.addEventListener("focus", () => {
    focusedAt = Date.now()
  })
  window.canvasHost.serve((method: WindowMethod, params: unknown) => settle(() => answer(method, params)))
}

let focusedAt: number | undefined

/** An answer as data, since only a failure's message would cross the bridge to the preload script. */
async function settle(run: () => Promise<unknown>): Promise<ServeAnswer> {
  try {
    return { result: await run() }
  } catch (error) {
    const details = errorDetails(error)
    return { error: error instanceof Error ? error.message : String(error), ...(details ? { details } : {}) }
  }
}

type Handlers = {
  [M in WindowMethod]: (
    params: WindowMethods[M]["params"]
  ) => WindowMethods[M]["result"] | Promise<WindowMethods[M]["result"]>
}

/**
 * Each request the project service sends, by method. An agent's params were checked against their schema in
 * `@parity-app/agent/contracts` before the service sent them (PAR-598), and the service makes the rest itself, so
 * they're read here as typed, with no second check.
 */
const handlers: Handlers = {
  "agent.tabs": () => workspace.summaries(),
  "agent.copy": () => ({ tabs: workspace.summaries(), ...(focusedAt === undefined ? {} : { focusedAt }) }),
  "agent.open": async ({ root }) => summary(await workspace.open(root)),
  "agent.snapshot": ({ tab }) => snapshot(tab),
  "agent.status": ({ tab: reference, ...options }) => {
    const tab = findTab(reference)
    return { tab: summary(tab), ...ready(tab).store.status(options) }
  },
  "agent.iconNames": (params) => iconNames(params),
  "agent.supports": (queries) => queries.map(({ property, value }) => CSS.supports(property, value)),
  "agent.reportIds": () => reportIds(),
  "agent.apply": (changes) => apply(changes),
  "agent.presence": (events) => {
    presence.push(events)
    return undefined
  },
  "project.componentsChanged": ({ projectId, components, sources, leftOut }) => {
    const tab = workspace.getTabs().find((candidate) => candidate.session?.id === projectId)
    if (sources && tab) workspace.setSources(tab.id, sources, leftOut)
    tab?.session?.components.set(components)
    return undefined
  },
  "project.codeChanged": ({ projectId, paths, stamp }) => {
    const tab = workspace.getTabs().find((candidate) => candidate.session?.id === projectId)
    if (tab) workspace.codeChanged(tab.id, paths, stamp)
    return undefined
  },
  "project.guestMoved": async ({ projectId, guestUrl }) => {
    // A tab that couldn't load it says so, and the service tries again when the builder is started again.
    if (!(await workspace.moveGuest(projectId, guestUrl))) throw new Error(`The guest at ${guestUrl} didn't load`)
    return undefined
  },
  "project.fileChanged": ({ projectId, path, document }) => {
    const store = workspace.getTabs().find((tab) => tab.session?.id === projectId)?.session?.store
    // Unsaved changes here win until the person says otherwise.
    if (store && !store.reloadDocument(path, document)) {
      toast.warning(`${path} changed on disk`, {
        description: "Your unsaved changes are kept. Saving writes them over it.",
        duration: 15000,
        action: { label: "Load from disk", onClick: () => store.reloadDocument(path, document, true) }
      })
    }
    return undefined
  }
}

async function answer(method: WindowMethod, params: unknown): Promise<unknown> {
  // The bridge carries each method with its own params, which the map can't see from `method` alone.
  return (handlers[method] as (params: unknown) => unknown)(params)
}

/** A tab by id, root or name, as the CLI matches one when it routes a call; the active tab when none is given. */
function findTab(reference: string | undefined): Tab {
  // New tabs have no project yet, and Home isn't a tab, so neither is a tab here.
  const tabs = workspace.getTabs().filter((candidate) => !candidate.blank)
  const named = reference && reference !== activeTab ? reference : undefined
  const ids = tabs.map((candidate) => candidate.id)
  if (named) {
    const found = matchTab(workspace.summaries(), named)
    const tab = found && tabs.find((candidate) => candidate.id === found.id)
    if (tab) return tab
    throw unknownReference("unknown_tab", `No open tab matches "${named}". Tabs: ${ids.join(", ")}`, named, ids, "tab")
  }
  const active = workspace.getActive()
  if (active && !active.blank) return active
  if (ids.length === 0) throw new CodedError("No project is open", { code: "unknown_tab", field: "tab" })
  throw new CodedError(`No project tab is active. Set tab to one of the open tabs: ${ids.join(", ")}`, {
    code: "unknown_tab",
    field: "tab"
  })
}

function ready(tab: Tab): ProjectSession {
  if (!tab.session) {
    const broken = tab.status === "error"
    throw new CodedError(`${tab.title} is ${broken ? `broken: ${tab.message}` : "still opening"}`, {
      code: "tab_not_ready",
      retryable: !broken
    })
  }
  return tab.session
}

function summary(tab: Tab): TabSummary {
  return workspace.summaries().find((candidate) => candidate.id === tab.id)!
}

function snapshot(reference: string | undefined): TabSnapshot {
  const tab = findTab(reference)
  const session = ready(tab)
  const current = session.selection.get()
  const editor = session.editor
  const bounds = editor?.getViewportPageBounds()
  const boards: TabSnapshot["bounds"] = {}
  for (const entry of session.store.getEntries()) {
    const box = editor?.getShapePageBounds(shapeIdFor(entry.key))
    if (box) boards[entry.key] = { x: box.x, y: box.y, width: box.width, height: box.height }
  }
  return {
    tab: summary(tab),
    revision: session.store.getRevision(),
    projectId: session.id,
    guestUrl: session.info.guestUrl,
    // The guest keeps components whose files were deleted since it loaded; they aren't the project's any more.
    components: session.loaded.guest.components.filter((name) => name in session.info.sources),
    sources: session.info.sources,
    ...(session.added ? { addedComponents: session.added } : {}),
    ...(session.info.leftOut ? { leftOut: session.info.leftOut } : {}),
    ...(session.loaded.guest.renderStatus ? { renderStatus: session.loaded.guest.renderStatus.get() } : {}),
    iconSets: session.info.libraries.filter((library) => library.kind === "icons").map(iconSet),
    tokens: session.tokens.get(),
    theme: session.info.theme,
    modes: session.store.getModes(),
    documents: session.store.getDocuments(),
    // The same library and token values the canvas draws with, so agents' frames match it.
    libraryDesigns: [...session.store.getLibraryDesigns()],
    tokenOverrides: [...session.tokens.previews()],
    mainDocument: session.store.mainPath,
    props: session.components.get(),
    selection: { design: current.design ?? current.note, node: current.node, mode: current.mode },
    viewport: {
      x: Math.round(bounds?.x ?? 0),
      y: Math.round(bounds?.y ?? 0),
      width: Math.round(bounds?.width ?? 0),
      height: Math.round(bounds?.height ?? 0),
      zoom: editor?.getZoomLevel() ?? 1
    },
    bounds: boards,
    detection: session.info.detection
  }
}

/** An icon set as agents read it, without its tags, which can run to thousands of lines and only `iconNames` needs. */
function iconSet({ id, name, package: packageName, version, icons }: LibraryInfo): IconSet {
  const set: IconSet = { id, name, package: packageName, ...(version ? { version } : {}) }
  if (!icons) return set
  const described = { ...icons }
  delete described.tags
  return { ...set, icons: described }
}

/** The names an icon set exports in one style's module, as the tab's guest loaded them, with the set's tags. */
function iconNames({ tab, set, module }: WindowMethods["agent.iconNames"]["params"]): IconNames {
  const session = ready(findTab(tab))
  const library = session.info.libraries.find((candidate) => candidate.kind === "icons" && candidate.id === set)
  if (!library) throw new Error(`"${set}" isn't one of the project's icon sets`)
  const { guest } = session.loaded
  return {
    names: guest.iconNames?.(set, module) ?? [],
    aliases: guest.iconAliases?.(set, module) ?? {},
    ...(library.icons?.tags ? { tags: library.icons.tags } : {})
  }
}

/**
 * An agent's call is one undoable step, its designs and tokens together, saved when the project is. It's merged with
 * what changed here since the agent's snapshot, or refused, changing nothing, when the two overlap.
 */
async function apply(changes: AgentChanges): Promise<ChangeConflict[]> {
  const session = ready(findTab(changes.tab))
  const tokens = session.tokens.edits(changes.tokens ?? [])
  return session.store.applyAgentChanges(changes.label, changes.designs, changes.modes, tokens)
}
