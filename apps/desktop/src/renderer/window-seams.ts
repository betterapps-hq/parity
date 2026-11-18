import { locateNode } from "@parity-app/core"
import type { NodeRef } from "@parity-app/extension"
import { agentStepOf, type AgentsPort } from "@parity-app/extension-host/window-agents"
import { targetOf } from "@parity-app/extension-host/window-canvas"
import type { Pointer, PresencePort } from "@parity-app/extension-host/window-presence"
import type { Self, Viewing } from "@parity-app/extension/internal"
import { firstName, signedInPerson } from "./account/account.ts"
import { lookOf } from "./account/look.ts"
import { presence } from "./agent/presence.ts"
import { onGestures } from "./canvas/presence-gestures.ts"
import { onEachWindow } from "./lens-windows.ts"
import { track } from "./report-error.ts"
import type { TabSlot } from "./tab-slot.ts"
import type { ProjectSession } from "./workspace.ts"

/*
 * What a project tab tells its window modules of this person and of agents (PAR-1257): the pointer over the canvas,
 * gestures, and what's selected to view, for `parity.presence`; and agents' steps, this copy's and those the development
 * room passes on, for `parity.agents`.
 */

/** This person's pointer, gestures and what they view in the tab, for `windowPresence`. */
export function windowPresencePort(slot: TabSlot): PresencePort {
  return {
    self,
    onPointer: (listener) => slot.when((session) => followPointer(session, listener)),
    onGesture: (listener) => slot.when((session) => onGestures(session, listener)),
    onViewing: (listener) => slot.when((session) => viewingOf(session, listener)),
    frame(callback) {
      const handle = requestAnimationFrame(callback)

      return () => cancelAnimationFrame(handle)
    }
  }
}

/**
 * Who's signed in: their first name for the room, and how their account avatar looks, for their face in their own
 * window. A development copy named for the room by `VITE_PARITY_ROOM_NAME` stands in for someone else, so it keeps the
 * room's look.
 */
function self(): Self {
  const stand = import.meta.env.VITE_PARITY_ROOM_NAME

  if (stand) {
    return { name: stand }
  }

  const person = signedInPerson()
  const name = firstName() ?? "Guest"

  return person ? { name, own: lookOf(person) } : { name }
}

/** What this person views in the tab, each time it changes. */
function viewingOf(session: ProjectSession, listener: (viewing: Viewing) => void): () => void {
  const viewing = (): Viewing => {
    const { design, state, mode } = session.selection.get()
    const seen: Viewing = {}

    if (design !== undefined) {
      seen.design = design
    }

    if (state !== undefined) {
      seen.state = state
    }

    if (mode !== undefined) {
      seen.mode = mode
    }

    return seen
  }

  return session.selection.subscribe(() => listener(viewing()))
}

/** The tab's agents' steps as the agent API reports them, for `windowAgents`. */
export function windowAgentsPort(slot: TabSlot, tab: string): AgentsPort {
  const layerType = (design: string, node: string) => {
    const root = slot.session?.doc.design(design)?.root

    return root && locateNode(root, node)?.node.type
  }

  return {
    onSteps: (listener) =>
      presence.onPush((events) => {
        const here = events.filter((event) => event.tab === tab)

        if (here.length > 0) {
          listener(here.map((event) => agentStepOf(event, layerType)))
        }
      }),
    // Other copies' steps come in through `parity.agents.receive`, from the extension that brings the room.
    exists: (ref) => (slot.session ? existsIn(slot.session, ref) : false),
    record: track
  }
}

/** Whether a design, or a design's layer, named by `NodeRef` is in the project. A design's key can hold a slash. */
function existsIn(session: Pick<ProjectSession, "doc">, ref: NodeRef): boolean {
  if (ref.owner !== "design") {
    return true
  }

  try {
    const target = targetOf(ref, isDesignIn(session))
    const root = session.doc.design(target.design)?.root

    return Boolean(root && (target.node === undefined || locateNode(root, target.node)))
  } catch {
    return false
  }
}

function isDesignIn(session: Pick<ProjectSession, "doc">): (key: string) => boolean {
  return (key) => session.doc.design(key) !== undefined
}

/** Every move of the pointer over the tab's canvas, on the page, and its leaving, across the canvas remounting. */
function followPointer(session: ProjectSession, listener: (pointer: Pointer) => void): () => void {
  let editor = session.editor
  let stopEditor: (() => void) | undefined

  const attach = () => {
    stopEditor?.()
    stopEditor = undefined
    const current = editor

    if (!current) {
      return
    }

    const container = current.getContainer()
    let at = { x: 0, y: 0 }
    let over = false

    // Followed on the window and placed by the canvas's bounds: a drag holds the cursor with an element over the whole
    // window (`holdCursor` in canvas/gesture.ts), which the canvas itself wouldn't hear moves through.
    const move = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect()

      const inside =
        event.clientX >= bounds.left &&
        event.clientX < bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY < bounds.bottom

      if (inside) {
        over = true
        at = current.screenToPage({ x: event.clientX, y: event.clientY })
        listener({ at, over })
      } else if (over) {
        away()
      }
    }

    const away = () => {
      over = false
      listener({ at, over })
    }

    // The canvas moves into a lens window and back without remounting (PAR-1247), so every window is heard and only
    // the one the canvas is in now places the pointer.
    const ours = (target: Window) => target === container.ownerDocument.defaultView

    stopEditor = onEachWindow((target) => {
      const moved = (event: PointerEvent) => {
        if (ours(target)) {
          move(event)
        }
      }

      const left = () => {
        if (ours(target)) {
          away()
        }
      }

      target.addEventListener("pointermove", moved)
      target.document.documentElement.addEventListener("pointerleave", left)

      return () => {
        target.removeEventListener("pointermove", moved)
        target.document.documentElement.removeEventListener("pointerleave", left)
      }
    })
  }

  attach()

  const unsubscribe = session.subscribe(() => {
    if (session.editor !== editor) {
      editor = session.editor
      attach()
    }
  })

  return () => {
    unsubscribe()
    stopEditor?.()
  }
}
