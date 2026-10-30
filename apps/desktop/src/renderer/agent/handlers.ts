import type { IconNames, IconSet } from "@parity-app/agent"
import type { LibraryInfo } from "@parity-app/core"
import { toast } from "sonner"
import type { AgentChanges, TabSnapshot, TabSummary, WindowMethod, WindowMethods } from "../../shared/protocol.ts"
import { shapeIdFor } from "../canvas/CanvasEditor.tsx"
import { type ProjectSession, type Tab, workspace } from "../workspace.ts"
import { presence } from "./presence.ts"

/**
 * Answers the project service when an agent (the CLI or MCP) works on a tab. Agents read a snapshot, compute their
 * changes in the service, and apply them here as one undoable step, so people see them land and can undo them.
 */
export function serveAgents(): void {
  window.canvasHost.serve(async (method: WindowMethod, params: unknown) => {
    switch (method) {
      case "agent.tabs":
        return workspace.summaries()
      case "agent.open": {
        const { root } = params as WindowMethods["agent.open"]["params"]
        const tab = await workspace.open(root)
        return summary(tab)
      }
      case "agent.snapshot":
        return snapshot((params as WindowMethods["agent.snapshot"]["params"]).tab)
      case "agent.iconNames":
        return iconNames(params as WindowMethods["agent.iconNames"]["params"])
      case "agent.apply":
        return apply(params as AgentChanges)
      case "agent.presence":
        presence.push(params as WindowMethods["agent.presence"]["params"])
        return undefined
      case "project.componentsChanged": {
        const { projectId, components, sources, leftOut } =
          params as WindowMethods["project.componentsChanged"]["params"]
        const tab = workspace.getTabs().find((candidate) => candidate.session?.id === projectId)
        if (sources && tab) workspace.setSources(tab.id, sources, leftOut)
        tab?.session?.components.set(components)
        return undefined
      }
      case "project.guestMoved": {
        const { projectId, guestUrl } = params as WindowMethods["project.guestMoved"]["params"]
        // A tab that couldn't load it says so, and the service tries again when the builder is started again.
        if (!(await workspace.moveGuest(projectId, guestUrl))) throw new Error(`The guest at ${guestUrl} didn't load`)
        return undefined
      }
      case "project.fileChanged": {
        const { projectId, path, document } = params as WindowMethods["project.fileChanged"]["params"]
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
  })
}

/** A tab by id, root or name; the active tab when none is given. */
function findTab(reference: string | undefined): Tab {
  const tabs = workspace.getTabs()
  const tab = reference
    ? (tabs.find((candidate) => candidate.id === reference) ??
      tabs.find((candidate) => candidate.session?.info.root === reference) ??
      tabs.find((candidate) => candidate.title === reference))
    : workspace.getActive()
  if (!tab) throw new Error(reference ? `No open tab matches "${reference}"` : "No project is open")
  return tab
}

function ready(tab: Tab): ProjectSession {
  if (!tab.session)
    throw new Error(`${tab.title} is ${tab.status === "error" ? `broken: ${tab.message}` : "still opening"}`)
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
    projectId: session.id,
    guestUrl: session.info.guestUrl,
    // The guest keeps components whose files were deleted since it loaded; they aren't the project's any more.
    components: session.loaded.guest.components.filter((name) => name in session.info.sources),
    ...(session.added ? { addedComponents: session.added } : {}),
    ...(session.info.leftOut ? { leftOut: session.info.leftOut } : {}),
    ...(session.loaded.guest.renderStatus ? { renderStatus: session.loaded.guest.renderStatus.get() } : {}),
    iconSets: session.info.libraries.filter((library) => library.kind === "icons").map(iconSet),
    tokens: session.tokens.get(),
    theme: session.info.theme,
    modes: session.store.getModes(),
    documents: session.store.getDocuments(),
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

/** An agent's call is one undoable step, its designs and tokens together, saved when the project is. */
async function apply(changes: AgentChanges): Promise<undefined> {
  const session = ready(findTab(changes.tab))
  const tokens = session.tokens.edits(changes.tokens ?? [])
  if (changes.documents.length > 0 || changes.modes || tokens.length > 0) {
    session.store.applyDocuments(changes.label, changes.documents, changes.modes, tokens)
  }
  return undefined
}
