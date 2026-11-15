import { designOwner, designStates, type NodeRef, resolveModes, shownModes } from "@parity-app/core"
import { selectedNodes, selectionForRefs } from "@parity-app/editor"
import { containerEntry } from "@parity-app/multiplayer"
import type { ExtensionUiAnswer } from "../shared/protocol.ts"
import { routePageDesign, routePageTarget } from "./canvas/route-pages.ts"
import { actions, commandsFor } from "./chrome/actions.ts"
import { type Command, keymap } from "./chrome/keymap.ts"
import { setLayout } from "./chrome/layout.ts"
import { revealRef, revealSelection, zoomToRef } from "./chrome/reveal.ts"
import { openSettings } from "./chrome/SettingsDialog.tsx"
import {
  type EditorRequest,
  extensionKeyFor,
  extensionsOf,
  runCommand,
  selectedRefs,
  whenFactsOf
} from "./extensions.ts"
import { request } from "./service.ts"
import type { ProjectSession } from "./workspace.ts"

/*
 * What extensions do with Parity's own UX rather than beside it (PAR-1092): read and change what's selected, by
 * `NodeRef`, move around the window, run Parity's commands, and press their own keys. The project's tab answers for its
 * extensions, and tells them what's selected each time it changes.
 */

/** The left and right panels' own tabs, by id. */
const panelTabs = new Map<string, "left" | "right">([
  ["layers", "left"],
  ["components", "left"],
  ["icons", "left"],
  ["media", "left"],
  ["tokens", "left"],
  ["design", "right"],
  ["modes", "right"],
  ["accessibility", "right"]
])

/**
 * Tells the project's extensions what's selected now and each time it changes, until the tab closes. Only a change to
 * the nodes selected is sent, not a change of the frame they were picked in.
 */
export function followSelection(session: ProjectSession): () => void {
  let sent = ""

  const send = () => {
    const refs = selectedRefs(session)
    const key = JSON.stringify(refs)

    if (key === sent) {
      return
    }

    sent = key
    void request("extensions.selectionChanged", { projectId: session.id, refs }).catch(() => undefined)
  }

  send()

  return session.selection.subscribe(send)
}

/** Selects nodes, as an extension asks, and brings them into view. */
function selectRefs(session: ProjectSession, refs: NodeRef[]): void {
  session.selection.set(
    selectionForRefs(refs, {
      isDesign: (key) => !!session.doc.design(key),
      pageOf: (route) => routePageDesign(session.id, route.key)
    })
  )
  revealSelection(session)
}

/** Points at a node as pointing at its row in Layers does: a design, or a layer in one. Nothing takes it away. */
function highlightRefs(session: ProjectSession, refs: NodeRef[]): void {
  const [first] = refs

  if (!first) {
    session.selection.setHover(undefined)

    return
  }

  const page = first.type === "route" ? routePageDesign(session.id, first.key) : undefined

  const selection = selectionForRefs([first], {
    isDesign: (key) => !!session.doc.design(key),
    pageOf: () => page
  })

  if (selection.design) {
    session.selection.setHover({ design: selection.design, node: selectedNodes(selection).at(-1) })
  }
}

/** The design an extension names, or a failure saying there's none. */
function designOf(session: ProjectSession, key: string) {
  const entry = containerEntry(session.doc, key)

  if (!entry) {
    throw new Error(`There's no design ${key}`)
  }

  return entry
}

/** Answers what an extension asks of the project's tab. */
export async function answerEditor(session: ProjectSession, asked: EditorRequest): Promise<ExtensionUiAnswer> {
  switch (asked.method) {
    case "selection.set":
      selectRefs(session, asked.params.refs)

      return undefined
    case "selection.highlight":
      highlightRefs(session, asked.params.refs)

      return undefined
    case "commands.execute":
      return executeCommand(session, asked.params.command)
    case "navigate":
      return navigate(session, asked.params)
  }
}

/** Runs one of Parity's own commands on what's selected, as Search actions does. */
async function executeCommand(session: ProjectSession, command: string): Promise<undefined> {
  if (!Object.hasOwn(keymap, command)) {
    throw new Error(`There's no command ${command}`)
  }

  // SAFETY: checked just above that `keymap` has it.
  const id = command as Command

  if (!commandsFor(session)[id].enabled) {
    throw new Error(`${keymap[id].label} doesn't apply to what's selected`)
  }

  await actions[id].run("extension", { session })

  return undefined
}

/** Goes where an extension asks. */
async function navigate(
  session: ProjectSession,
  to: Extract<EditorRequest, { method: "navigate" }>["params"]
): Promise<{ url?: string }> {
  switch (to.kind) {
    case "reveal":
      revealRef(session, to.ref)
      break
    case "zoomTo":
      if (!zoomToRef(session, to.ref)) {
        throw new Error("The canvas doesn't draw that node")
      }

      break
    case "openDesign":
      designOf(session, to.key)
      selectRefs(session, [{ owner: designOwner, type: "design", key: to.key }])
      break
    case "setMode": {
      const design = session.selection.get().design

      if (!design) {
        throw new Error("Select a design to show it in a mode")
      }

      const mode = resolveModes(session.info.modes.settings).find(
        (each) => each.id === to.mode || each.name === to.mode
      )

      if (!mode) {
        throw new Error(`There's no mode ${to.mode}`)
      }

      session.selection.set({ design, mode: mode.id, state: session.selection.get().state ?? "" })
      revealSelection(session)
      break
    }

    case "setState": {
      const entry = designOf(session, to.design)
      const state = designStates(entry.container).find((each) => each.id === to.state || each.name === to.state)

      if (!state) {
        throw new Error(`${entry.container.name} has no state ${to.state}`)
      }

      // The mode it's shown in now, or the main one.
      const now = session.selection.get()

      const mode =
        (now.design === to.design ? now.mode : undefined) ??
        shownModes(session.info.modes.settings, entry.container).main.id

      session.selection.set({ design: to.design, state: state.id, mode })
      revealSelection(session)
      break
    }

    case "showTab":
      showTab(session, to.id)
      break
    case "openSettings": {
      const found = extensionsOf(session)
        .store.get()
        .extensions.find((each) => each.id === to.id)

      openSettings(found ? `ext:${found.prefix}` : "extensions")
      break
    }

    case "pageUrl": {
      // The page's screen, by its design key, whose view gives the values its route's path params draw with.
      const page = to.ref.type === "route" ? routePageDesign(session.id, to.ref.key) : undefined
      const entry = page === undefined ? undefined : containerEntry(session.doc, page)
      const url = entry && routePageTarget(session.id, entry.container)?.url

      return url === undefined ? {} : { url }
    }
  }

  return {}
}

/** Opens a panel's tab: Parity's own, the console, an extension's log, or a tab an extension declares. */
function showTab(session: ProjectSession, id: string): void {
  const side = panelTabs.get(id)

  if (side === "left") {
    setLayout({ left: true, leftTab: id })

    return
  }

  if (side === "right") {
    setLayout({ right: true, rightTab: id })

    return
  }

  const { extensions } = extensionsOf(session).store.get()

  if (id === "console" || extensions.some((each) => each.id === id)) {
    setLayout({ console: true, bottomTab: id })

    return
  }

  const declared = extensions.flatMap((each) => each.contributes.tabs ?? []).find((tab) => tab.id === id)

  if (!declared) {
    throw new Error(`There's no tab ${id}`)
  }

  if (declared.area === "bottom") {
    setLayout({ console: true, bottomTab: id })
  } else {
    setLayout(declared.area === "left" ? { left: true, leftTab: id } : { right: true, rightTab: id })
  }
}

/**
 * Runs the extension command whose key a key event is, when its `when` holds and no command of Parity's has the key.
 * Gives whether it ran one.
 */
export function runExtensionKey(session: ProjectSession, event: KeyboardEvent): boolean {
  const found = extensionKeyFor(event, extensionsOf(session).store.get().extensions, whenFactsOf(session))

  if (!found) {
    return false
  }

  void runCommand(session, found)

  return true
}
