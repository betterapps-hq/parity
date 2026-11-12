import { type ContainerSpec, defaultModeSettings } from "@parity-app/core"
import { newDesign } from "@parity-app/editor"
import { createTelemetry, createTestSink, registeredEvents } from "@parity-app/telemetry"
import { describe, expect, it, vi } from "vite-plus/test"
import { ComponentStore } from "../components-store.ts"
import { DesignStore } from "../design-store.ts"
import { keepRecovery } from "../recovery.ts"
import { SelectionStore } from "../selection.ts"
import { traceWith } from "../tracing.ts"
import { ProjectSession, type SessionParts } from "../workspace.ts"
import * as registry from "./actions.ts"
import { keymap } from "./keymap.ts"
import { type Recording, recordActions } from "./record-actions.ts"

vi.mock("../canvas/CanvasEditor.tsx", () => ({ canvasIdFor: (key: string) => key }))

// The insert picker draws previews, which need a window; nothing here opens it.
vi.mock("./QuickInsert.tsx", () => ({ openQuickInsert: () => undefined }))

const sink = createTestSink()

traceWith(
  createTelemetry({
    events: registeredEvents,
    context: { process: "renderer", installId: "install", sessionId: "session" },
    sinks: [sink],
    check: true
  })
)

const recorded = () => sink.spans.map(({ name, outcome, attributes }) => ({ name, outcome, attributes }))

/** A tab holding `containers`, saved nowhere, with no canvas drawn. */
function tab(containers: ContainerSpec[] = []): ProjectSession {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 4, containers } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )

  return new ProjectSession(
    {
      id: "project",
      store,
      selection: new SelectionStore(),
      components: new ComponentStore(),
      recovery: keepRecovery(store, async () => undefined)
    },
    // SAFETY: the commands run here, and whether they apply, read the stores, not the project's info, guest or tokens.
    {} as SessionParts
  )
}

/** Recording with every action applying in no tab, and the counts given. */
function recordingOf<Id extends string>(
  selected: { layers: number; designs: number },
  overrides: Partial<Recording<Id>> = {}
): Recording<Id> {
  return { session: () => undefined, enabled: () => true, selected: () => selected, ...overrides }
}

describe("recordActions", () => {
  it("records each run with where it came from and what was selected, handing on the key that ran it", () => {
    sink.clear()
    const pressed: (string | undefined)[] = []

    const actions = recordActions(
      {
        nudge: {
          run: (_session, event) => {
            pressed.push(event?.key)
          },
          byKey: true
        }
      },
      recordingOf({ layers: 2, designs: 0 })
    )

    expect(actions.nudge.byKey).toBe(true)
    // SAFETY: `recordActions` hands the event on untouched, and this action reads only its `key`; Node has no
    // KeyboardEvent to construct a real one.
    const press = { key: "ArrowLeft" } as KeyboardEvent
    void actions.nudge.run("key", { event: press })
    expect(pressed).toEqual(["ArrowLeft"])
    expect(recorded()).toEqual([
      {
        name: "command.ran",
        outcome: "ok",
        attributes: { action: "nudge", from: "key", enabled: true, layers: 2, designs: 0 }
      }
    ])
  })

  it("records one tried while it doesn't apply as cancelled, without running it", () => {
    sink.clear()
    let ran = false

    const actions = recordActions(
      {
        paste: {
          run: () => {
            ran = true
          }
        }
      },
      recordingOf({ layers: 0, designs: 0 }, { enabled: () => false })
    )

    expect(actions.paste.run("key")).toBeUndefined()
    expect(ran).toBe(false)
    expect(recorded()).toEqual([
      {
        name: "command.ran",
        outcome: "cancelled",
        attributes: { action: "paste", from: "key", enabled: false, layers: 0, designs: 0 }
      }
    ])
  })

  it("runs what the caller binds in the action's place, passes on what it returns, tells of each run that applies, and records a failure's code", async () => {
    sink.clear()
    let made = ""
    const failed = Object.assign(new Error("Locked"), { details: { code: "locked" } })
    const heard: string[] = []

    const actions = recordActions(
      {
        newScreen: {
          run: () => {
            made = "in the active tab"
          }
        },
        save: { run: () => Promise.reject(failed) },
        undo: { run: () => undefined }
      },
      recordingOf({ layers: 0, designs: 1 }, { enabled: (id) => id !== "undo", ran: (id) => heard.push(id) })
    )

    void actions.newScreen.run("canvasMenu", {
      instead: () => {
        made = "where the menu opened"
      }
    })
    expect(made).toBe("where the menu opened")
    await expect(actions.save.run("menu")).rejects.toBe(failed)
    void actions.undo.run("key")
    expect(heard).toEqual(["newScreen", "save"])
    await Promise.resolve()
    expect(recorded().map(({ outcome, attributes }) => ({ outcome, ...attributes }))).toEqual([
      { outcome: "ok", action: "newScreen", from: "canvasMenu", enabled: true, layers: 0, designs: 1 },
      { outcome: "error", action: "save", from: "menu", enabled: true, layers: 0, designs: 1, code: "locked" },
      { outcome: "cancelled", action: "undo", from: "key", enabled: false, layers: 0, designs: 1 }
    ])
  })

  it("acts on the tab it's given, else the one `session` names", () => {
    const given = tab()
    const active = tab()
    const ranOn: (ProjectSession | undefined)[] = []
    const asked: (ProjectSession | undefined)[] = []

    const actions = recordActions(
      { save: { run: (session) => void ranOn.push(session) } },
      recordingOf(
        { layers: 0, designs: 0 },
        {
          session: () => active,
          enabled: (_id, session) => {
            asked.push(session)

            return true
          }
        }
      )
    )

    void actions.save.run("panel", { session: given })
    void actions.save.run("menu")
    expect(ranOn).toEqual([given, active])
    expect(asked).toEqual([given, active])
  })
})

const pricing: ContainerSpec = { ...newDesign("screen", [], { x: 0, y: 0 }), id: "pricing", name: "Pricing" }

describe("the action list", () => {
  it("runs every command in the keymap, and leaves what each runs out of reach", () => {
    expect(Object.keys(registry.actions).toSorted()).toEqual(Object.keys(keymap).toSorted())
    // Only the recorded actions and their states leave the module, so nothing runs a command around them.
    expect(Object.keys(registry).toSorted()).toEqual(["actions", "commandsFor"])
  })

  it("runs a command only when its state says it applies, on the tab it's given, and records it either way", () => {
    sink.clear()
    const session = tab([pricing])
    const { store, selection } = session

    expect(registry.commandsFor(session).duplicate.enabled).toBe(false)
    void registry.actions.duplicate.run("menu", { session })
    expect(store.getEntries()).toHaveLength(1)

    selection.set({ design: "app.par#pricing" })
    expect(registry.commandsFor(session).duplicate.enabled).toBe(true)
    void registry.actions.duplicate.run("menu", { session })
    expect(store.getEntries()).toHaveLength(2)

    expect(recorded().map(({ outcome, attributes }) => ({ outcome, ...attributes }))).toEqual([
      { outcome: "cancelled", action: "duplicate", from: "menu", enabled: false, layers: 0, designs: 0 },
      { outcome: "ok", action: "duplicate", from: "menu", enabled: true, layers: 0, designs: 1 }
    ])
  })
})
