import { type ContainerKind, resolveModes } from "@parity-app/core"
import { newDesign } from "@parity-app/editor"
import { createDesign } from "../../chrome/create.ts"
import type { Binding } from "../../chrome/keymap.ts"
import type { ProjectSession } from "../../workspace.ts"

/**
 * The commands this exploration adds, with the keys it proposes. They'd join the keymap in the build issue (PAR-546),
 * so the menus, Search actions, the Keyboard shortcuts dialog and the key handlers all read them from one place.
 */
export const startKeymap = {
  newScreen: { group: "Object", label: "New screen", keys: ["Ctrl Alt N"] },
  newComponent: { group: "Object", label: "New component", keys: ["Ctrl Alt Shift N"] }
} as const satisfies Record<string, Binding>

export type StartCommand = keyof typeof startKeymap

/** The keys a command shows: the first of its keys, as the menus show the keymap's. */
export function keysOf(command: StartCommand): string {
  return startKeymap[command].keys[0]
}

/**
 * Makes an empty screen or component, as Layers' + does today: right of everything, selected and zoomed to. Given a
 * point on the screen, as from the canvas's right-click menu, it goes there instead, as Paste here does.
 */
export function makeNew(session: ProjectSession, kind: ContainerKind, at?: { x: number; y: number }): void {
  const { editor, store } = session
  if (!at || !editor) {
    createDesign(session, kind)
    return
  }
  const page = editor.screenToPage(at)
  const viewport = resolveModes(store.getModes())[0]?.viewport
  const taken = store.getEntries().map((entry) => entry.container.id)
  const key = store.addContainer(
    store.mainPath,
    newDesign(kind, taken, { x: Math.round(page.x), y: Math.round(page.y) }, { viewport }),
    kind === "component" ? "New component" : "New screen"
  )
  session.selection.set({ design: key })
}
