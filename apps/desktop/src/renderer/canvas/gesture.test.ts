import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { dragThreshold } from "@parity-app/editor"
import { describe, expect, it, vi } from "vite-plus/test"
import { DesignStore } from "../design-store.ts"
import { followPress, GestureRun, gestures, onGestureEnd, type Press } from "./gesture.ts"

/** A key press as the window gets it. */
const press = (key: string) => Object.assign(new Event("keydown", { cancelable: true }), { key })

/** The pointer at a point, as the window hears it. */
const pointer = (type: string, clientX: number, clientY = 0) =>
  Object.assign(new Event(type, { cancelable: true }), { clientX, clientY })

/** Follows a gesture on a stand-in window, logging how it ends. */
function follow() {
  const target = new EventTarget()
  const ends: string[] = []
  const stop = onGestureEnd(target, (how) => ends.push(how))
  return { target, ends, stop }
}

describe("how a pointer gesture ends", () => {
  it("ends once, at the release, the pointer being cancelled, the window losing focus or Escape", () => {
    const cases: [Event, string][] = [
      [new Event("pointerup"), "release"],
      [new Event("pointercancel"), "interrupted"],
      [new Event("blur"), "interrupted"],
      [press("Escape"), "escape"]
    ]
    for (const [event, how] of cases) {
      const { target, ends } = follow()
      target.dispatchEvent(event)
      // Whatever comes after belongs to no gesture, so nothing is left listening for it.
      for (const after of [new Event("pointerup"), new Event("pointercancel"), new Event("blur"), press("Escape")]) {
        target.dispatchEvent(after)
      }
      expect(ends).toEqual([how])
    }
  })

  it("keeps Escape from going further, and lets other keys by", () => {
    const { target, ends } = follow()
    const other = press("a")
    target.dispatchEvent(other)
    expect(other.defaultPrevented).toBe(false)
    expect(ends).toEqual([])
    const escape = press("Escape")
    target.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
  })

  it("stops listening when the gesture is given up, without ending it", () => {
    const { target, ends, stop } = follow()
    stop()
    target.dispatchEvent(new Event("pointerup"))
    expect(ends).toEqual([])
  })

  it("leaves one gesture's end to that gesture, when another follows it", () => {
    const target = new EventTarget()
    const ends: string[] = []
    onGestureEnd(target, (how) => ends.push(`first ${how}`))
    target.dispatchEvent(new Event("blur"))
    onGestureEnd(target, (how) => ends.push(`second ${how}`))
    target.dispatchEvent(new Event("pointerup"))
    expect(ends).toEqual(["first interrupted", "second release"])
  })
})

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] },
  states: [{ id: "default", name: "Default" }]
}
const design = "app.par#home"

/** A project with one design, Home, and a stand-in window whose held cursors are listed. */
function setup() {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 3, containers: [home] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )
  const target = new EventTarget()
  const cursors: string[] = []
  const holdCursor = (cursor: string) => {
    cursors.push(cursor)
    return () => cursors.splice(cursors.indexOf(cursor), 1)
  }
  const name = () => store.getEntry(design)!.container.name
  const rename = (to: string, gesture?: string) =>
    store.updateContainer(design, "Rename", (container) => ({ ...container, name: to }), { gesture })
  return { store, target, cursors, at: { target, holdCursor }, name, rename }
}

describe("a press on the canvas", () => {
  it("becomes a drag once the pointer has gone the threshold, and is a click if it's released before", () => {
    const { store, target, cursors, at } = setup()
    const begin = vi.spyOn(store, "beginGesture")
    const log: string[] = []
    followPress(
      gestures.layerDrag,
      store,
      { clientX: 100, clientY: 100 },
      {
        cursor: "grabbing",
        start: () => log.push("start"),
        move: () => log.push("move"),
        end: (kept) => log.push(`end ${kept}`),
        click: () => log.push("click")
      },
      at
    )
    target.dispatchEvent(pointer("pointermove", 100 + dragThreshold - 1, 100))
    target.dispatchEvent(new Event("pointerup"))
    expect(log).toEqual(["click"])
    // Nothing to undo begun, and no cursor held, for a click.
    expect(begin).not.toHaveBeenCalled()
    expect(cursors).toEqual([])
  })

  it("begins the undo gesture, takes the checkpoint and holds the cursor as it becomes a drag, once", () => {
    const { store, target, cursors, at } = setup()
    const checkpoint = vi.spyOn(store, "checkpoint")
    const end = vi.spyOn(store, "endGesture")
    const log: string[] = []
    let gesture: string | undefined
    followPress(
      gestures.resize,
      store,
      { clientX: 0, clientY: 0 },
      {
        design,
        cursor: "ew-resize",
        start: (drag) => {
          gesture = drag.gesture
          log.push(`start, holding ${cursors.join()}`)
        },
        move: (event) => log.push(`move ${event.clientX}`),
        end: (kept) => log.push(`end ${kept}, holding ${cursors.join()}`)
      },
      at
    )
    target.dispatchEvent(pointer("pointermove", 1))
    expect(checkpoint).not.toHaveBeenCalled()
    target.dispatchEvent(pointer("pointermove", dragThreshold))
    target.dispatchEvent(pointer("pointermove", 10))
    expect(checkpoint).toHaveBeenCalledOnce()
    expect(checkpoint).toHaveBeenCalledWith(design, gesture)
    target.dispatchEvent(new Event("pointerup"))
    // Nothing is left listening once it's over.
    target.dispatchEvent(pointer("pointermove", 20))
    expect(log).toEqual(["start, holding ew-resize", "move 4", "move 10", "end true, holding "])
    expect(end).toHaveBeenCalledExactlyOnceWith(gesture)
  })

  it("does nothing at Escape before it's a drag but end", () => {
    const { store, target, at } = setup()
    const log: string[] = []
    followPress(
      gestures.layerDrag,
      store,
      { clientX: 0, clientY: 0 },
      { move: () => log.push("move"), end: () => log.push("end"), click: () => log.push("click") },
      at
    )
    target.dispatchEvent(press("Escape"))
    target.dispatchEvent(pointer("pointermove", 20))
    target.dispatchEvent(new Event("pointerup"))
    expect(log).toEqual([])
  })

  it("lets a drag take back what it wrote so far and go on in the same undo step", () => {
    const { store, target, at, name, rename } = setup()
    followPress(
      gestures.absoluteDrag,
      store,
      { clientX: 0, clientY: 0 },
      {
        design,
        move: (event, drag) => {
          if (event.clientX === 20) drag.revert()
          else rename(`Home ${event.clientX}`, drag.gesture)
        }
      },
      at
    )
    target.dispatchEvent(pointer("pointermove", 10))
    target.dispatchEvent(pointer("pointermove", 20))
    expect(name()).toBe("Home")
    expect(store.getHistory().canUndo).toBe(false)
    target.dispatchEvent(pointer("pointermove", 30))
    target.dispatchEvent(new Event("pointerup"))
    expect(name()).toBe("Home 30")
    store.undo()
    expect(name()).toBe("Home")
    expect(store.getHistory().canUndo).toBe(false)
  })

  it("leaves the file alone when a drag that wrote nothing is taken back", () => {
    const { store, target, at } = setup()
    const revert = vi.spyOn(store, "revert")
    followPress(gestures.resize, store, { clientX: 0, clientY: 0 }, { design, move: () => undefined }, at)
    target.dispatchEvent(pointer("pointermove", 10))
    target.dispatchEvent(press("Escape"))
    expect(revert).not.toHaveBeenCalled()
  })
})

/**
 * Each canvas gesture, writing as the app's does: a resize and an absolutely placed layer's drag write the design as
 * the pointer moves; layers dragged in a layout and designs dragged by a title write once, when the drag is kept; and a
 * box drawn on a frame's background changes only the selection, which it puts back itself when it isn't kept.
 */
const canvasGestures = [
  { gesture: "resize", writes: "moving", cutShort: "kept" },
  { gesture: "layerDrag", writes: "kept", cutShort: "called off" },
  { gesture: "absoluteDrag", writes: "moving", cutShort: "called off" },
  { gesture: "titleDrag", writes: "kept", cutShort: "kept" },
  { gesture: "boxSelect", writes: "nothing", cutShort: "called off" }
] as const satisfies readonly { gesture: keyof typeof gestures; writes: string; cutShort: string }[]

/** Drags 20px with one of the gestures, then ends it with `ending`, saying what it ended with. */
function drag(gesture: keyof typeof gestures, writes: (typeof canvasGestures)[number]["writes"], ending: Event) {
  const project = setup()
  const { store, target, cursors, at, rename } = project
  const kept: boolean[] = []
  const handlers: Press = {
    design: writes === "moving" ? design : undefined,
    cursor: "grabbing",
    move: (event, { gesture: undoStep }) => {
      if (writes === "moving") rename(`Home ${event.clientX}`, undoStep)
    },
    end: (isKept, { gesture: undoStep }) => {
      kept.push(isKept)
      if (isKept && writes === "kept") rename("Moved", undoStep)
    }
  }
  followPress(gestures[gesture], store, { clientX: 0, clientY: 0 }, handlers, at)
  for (const x of [10, 20]) target.dispatchEvent(pointer("pointermove", x))
  target.dispatchEvent(ending)
  expect(cursors).toEqual([])
  return { ...project, kept }
}

/** What Home is called once each kind of gesture has kept a 20px drag. */
const keptName = { moving: "Home 20", kept: "Moved", nothing: "Home" }

describe("each canvas gesture", () => {
  it("leaves no undo after Escape", () => {
    for (const { gesture, writes } of canvasGestures) {
      const { store, kept, name } = drag(gesture, writes, press("Escape"))
      expect({ gesture, kept, name: name(), canUndo: store.getHistory().canUndo, unsaved: store.hasUnsaved() }).toEqual(
        { gesture, kept: [false], name: "Home", canUndo: false, unsaved: false }
      )
    }
  })

  it("ends when the window loses focus, keeping what it did or calling it off as its policy says", () => {
    for (const { gesture, writes, cutShort } of canvasGestures) {
      const { store, kept, name } = drag(gesture, writes, new Event("blur"))
      const ended = cutShort === "kept" ? { kept: [true], name: keptName[writes] } : { kept: [false], name: "Home" }
      expect({ gesture, kept, name: name() }).toEqual({ gesture, ...ended })
      // What it kept is one undo step, and what it called off is none.
      store.undo()
      expect({ gesture, name: name(), canUndo: store.getHistory().canUndo }).toEqual({
        gesture,
        name: "Home",
        canUndo: false
      })
    }
  })

  it("ends at the release keeping what it did, as one undo step", () => {
    for (const { gesture, writes } of canvasGestures) {
      const { store, kept, name } = drag(gesture, writes, new Event("pointerup"))
      expect({ gesture, kept, name: name() }).toEqual({ gesture, kept: [true], name: keptName[writes] })
      store.undo()
      expect({ gesture, name: name(), canUndo: store.getHistory().canUndo }).toEqual({
        gesture,
        name: "Home",
        canUndo: false
      })
    }
  })
})

describe("a run of presses", () => {
  /** A run on a store that logs its gestures. */
  function running() {
    const log: string[] = []
    let count = 0
    const run = new GestureRun({
      beginGesture: () => {
        count += 1
        log.push(`begin g${count}`)
        return `g${count}`
      },
      endGesture: (gesture) => log.push(`end ${gesture}`)
    })
    return { run, log }
  }

  it("is one gesture for presses on one selection, and a press on another starts a run of its own", () => {
    const { run, log } = running()
    expect(run.gesture("badge")).toBe("g1")
    expect(run.gesture("badge")).toBe("g1")
    expect(run.gesture("title")).toBe("g2")
    expect(log).toEqual(["begin g1", "end g1", "begin g2"])
  })

  it("ends as the selection changes, and goes on while the same one is selected again", () => {
    const { run, log } = running()
    run.gesture("badge")
    run.select("badge")
    expect(log).toEqual(["begin g1"])
    run.select("title")
    // Back to what it was, the next press starts another run.
    run.select("badge")
    expect(run.gesture("badge")).toBe("g2")
    expect(log).toEqual(["begin g1", "end g1", "begin g2"])
  })

  it("follows the selection while a run lasts, and stops when it ends", () => {
    const { run } = running()
    const watching: string[] = []
    const watch = () => {
      watching.push("start")
      return () => watching.push("stop")
    }
    run.gesture("badge", watch)
    run.gesture("badge", watch)
    run.end()
    run.end()
    expect(watching).toEqual(["start", "stop"])
  })
})
