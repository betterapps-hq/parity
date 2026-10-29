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
      case "agent.apply":
        return apply(params as AgentChanges)
      case "agent.presence":
        presence.push(params as WindowMethods["agent.presence"]["params"])
        return undefined
      case "project.componentsChanged": {
        const { projectId, components } = params as WindowMethods["project.componentsChanged"]["params"]
        workspace
          .getTabs()
          .find((tab) => tab.session?.id === projectId)
          ?.session?.components.set(components)
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
    components: session.loaded.guest.components,
    iconLibraries: session.info.libraries.filter((library) => library.kind === "icons").map((library) => library.id),
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

async function apply(changes: AgentChanges): Promise<undefined> {
  const session = ready(findTab(changes.tab))
  if (changes.documents.length > 0 || changes.modes) {
    session.store.applyDocuments(changes.label, changes.documents, changes.modes)
  }
  if (changes.tokens?.length) await session.tokens.set(changes.tokens)
  return undefined
}
