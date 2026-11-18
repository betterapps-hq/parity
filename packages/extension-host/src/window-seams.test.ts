import {
  defineWindowModule,
  type Gesture,
  LineageError,
  type OpenFrom,
  type Sync,
  type WindowParity
} from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import { surfaceTestId } from "./fixtures/window-surface-test.ts"
import { driven, settle, tab } from "./fixtures/window-tab.ts"
import { agentEventOf, agentStepOf } from "./window-agents.ts"
import { framed, openWaitMs, type SyncDocument, unframed, windowSync } from "./window-sync.ts"

const move = (phase: "start" | "drop" | "end" | "cancel"): Gesture => ({
  kind: "move",
  phase,
  targets: [
    {
      ref: { owner: "design", type: "frame", key: "card/row" },
      offset: { x: -4, y: -2 },
      size: { width: 80, height: 20 }
    }
  ]
})

describe("parity.presence", () => {
  it("tells the pointer at most once a frame, the latest, and its leaving at once without dropping it", async () => {
    const test = driven()
    const { person } = await tab(test.module)

    person.point({ at: { x: 1, y: 1 }, over: true })
    person.point({ at: { x: 2, y: 2 }, over: true })
    person.frame()
    person.point({ at: { x: 3, y: 3 }, over: true })
    person.point({ at: { x: 9, y: 9 }, over: false })
    person.frame()
    person.point({ at: { x: 4, y: 4 }, over: true })
    person.frame()

    expect(test.api.heard).toEqual(["pointer 2,2", "pointer away", "pointer 4,4"])
  })

  it("tells every gesture in order, letting committed changes go first before a move's drop and end", async () => {
    const test = driven()
    const { person } = await tab(test.module)

    person.gesture(move("start"))
    person.gesture(move("drop"))
    person.gesture({ kind: "marquee", phase: "start", from: { x: 0, y: 0 } })
    person.gesture(move("end"))

    expect(test.api.heard).toEqual([
      "gesture move start",
      "gesture move drop",
      "gesture marquee start",
      "gesture move end"
    ])
    expect(person.flushed).toEqual(["flushed", "flushed"])
  })

  it("tells what's viewed only when it changes", async () => {
    const test = driven()
    const { person } = await tab(test.module)

    person.view({ design: "card", state: "Base" })
    person.view({ design: "card", state: "Base" })
    person.view({ design: "card", state: "Hover" })
    person.view({})

    expect(test.api.heard).toEqual(["viewing card", "viewing card", "viewing nothing"])
  })

  it("stops listening to the window once no module listens, and says who's signed in", async () => {
    const { person, parity, stop } = await tab()

    expect(person.listening()).toBe(true)
    expect(parity().presence.self).toEqual({ name: "Mia" })

    await stop()

    expect(person.listening()).toBe(false)
  })

  it("tells who's signed in only when that changes, keeping one object until it does", async () => {
    const { person, parity, stop } = await tab()
    const presence = parity().presence
    const heard: string[] = []
    const before = presence.self

    const listening = presence.onSelfChange((self) =>
      heard.push(self.own ? `${self.name} ${self.own.initials}` : self.name)
    )

    // The window says it may have changed, though nobody signed in or out.
    person.signIn({ name: "Mia" })
    expect(presence.self).toBe(before)

    person.signIn({ name: "Grace", own: { initials: "GH", color: "#3b82f6" } })
    person.signIn({ name: "Grace", own: { initials: "GH", color: "#3b82f6" } })
    person.signIn({ name: "Guest" })
    listening.dispose()
    person.signIn({ name: "Mia" })

    expect(heard).toEqual(["Grace GH", "Guest"])
    expect(presence.self).toEqual({ name: "Mia" })
    await stop()
  })

  it("counts a listener that throws as the module's failure", async () => {
    const { person, parity, named } = await tab()
    parity().presence.onGesture(() => {
      throw new Error("No gestures, please")
    })
    person.gesture({ kind: "marquee", phase: "cancel", from: { x: 0, y: 0 } })

    expect(named("extension.callFailed")).toMatchObject([{ api: "presence.onGesture", message: "No gestures, please" }])
  })
})

describe("parity.agents", () => {
  it("tells this copy's steps without a copy, and other copies' with theirs, however they reached the window", async () => {
    const test = driven()
    const { agentSteps, parity } = await tab(test.module)

    agentSteps.step([{ kind: "read", agentId: "claude#1" }])
    parity().agents.receive(
      [
        { kind: "move", agentId: "claude#2" },
        { kind: "end", agentId: "claude#2" }
      ],
      {
        from: "peer-2"
      }
    )

    agentSteps.passOn([{ kind: "read", agentId: "codex" }], "room")

    expect(test.api.heard).toEqual(["agents read", "agents move end from peer-2", "agents read from room"])
  })

  it("drops steps passed in that name what isn't here, recording that at most once a minute", async () => {
    const test = driven()
    const { agentSteps, parity } = await tab(test.module)
    const gone = { owner: "design", type: "design", key: "gone" }

    parity().agents.receive([{ kind: "write", agentId: "a", ref: gone }], { from: "peer-2" })
    parity().agents.receive([{ kind: "write", agentId: "a", ref: gone }], { from: "peer-2" })
    agentSteps.minute()
    parity().agents.receive([{ kind: "write", agentId: "a", ref: gone }], { from: "peer-3" })

    expect(test.api.heard).toEqual([])
    expect(agentSteps.recorded.filter((each) => each.name === "agents.stepDropped")).toEqual([
      { name: "agents.stepDropped", attributes: { kind: "write", from: "peer-2", dropped: 1 } },
      { name: "agents.stepDropped", attributes: { kind: "write", from: "peer-3", dropped: 2 } }
    ])
  })

  it("records the minute's activity while agents work, with how many extensions listen, then rests", async () => {
    const { agentSteps, parity } = await tab()

    agentSteps.step([
      { kind: "read", agentId: "a" },
      { kind: "end", agentId: "a" }
    ])
    parity().agents.receive([{ kind: "start", agentId: "b" }], { from: "peer-2" })
    agentSteps.minute()
    agentSteps.minute()

    expect(agentSteps.recorded).toEqual([
      { name: "agents.activity", attributes: { stepsHere: 2, stepsReceived: 1, copies: 1, listeners: 1 } }
    ])
  })

  it("maps today's agent events to steps and back, with refs for boards and layers", () => {
    const layer = agentStepOf(
      { kind: "measure", design: "card", node: "title", agent: "Claude Code", label: "Title", state: "Base" },
      () => "text"
    )

    expect(layer).toEqual({
      kind: "measure",
      agentId: "Claude Code",
      agent: "Claude Code",
      label: "Title",
      state: "Base",
      ref: { owner: "design", type: "text", key: "card/title" }
    })
    expect(
      agentStepOf({ kind: "move", design: "card", agentId: "a", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } })
    ).toEqual({
      kind: "move",
      agentId: "a",
      ref: { owner: "design", type: "design", key: "card" },
      from: { x: 0, y: 0 },
      to: { x: 5, y: 5 }
    })
    expect(agentEventOf(layer)).toEqual({
      kind: "measure",
      agentId: "Claude Code",
      agent: "Claude Code",
      label: "Title",
      state: "Base",
      design: "card",
      node: "title"
    })
    expect(
      agentEventOf(
        { kind: "read", agentId: "a", ref: { owner: "design", type: "text", key: "main/sign-in/title" } },
        (key) => key === "main/sign-in"
      )
    ).toMatchObject({ design: "main/sign-in", node: "title" })
  })
})

/** A document as Loro would be one: changes as strings of letters, a version as how many it has. */
function document() {
  const changes: string[] = []
  const local = new Set<(bytes: Uint8Array) => void>()
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const bytes = (value: string) => new TextEncoder().encode(value)

  const doc: SyncDocument = {
    receive(received) {
      const value = text(received)

      if (value.startsWith("later:")) {
        return { pending: true }
      }

      changes.push(value)

      return { pending: false }
    },
    version: () => bytes(String(changes.length)),
    changesSince: (version) => bytes(changes.slice(Number(text(version))).join(",")),
    snapshot: () => bytes(`snapshot of ${changes.join(",")}`),
    onLocalChanges(listener) {
      local.add(listener)

      return () => void local.delete(listener)
    }
  }

  return {
    doc,
    changes,
    text,
    bytes,
    commit: (value: string) => {
      changes.push(value)
      local.forEach((listener) => listener(bytes(value)))
    }
  }
}

/** A tab whose module brings the room, over a sync seam with stand-in saving, timers and telemetry. */
async function room(open?: () => Promise<OpenFrom>) {
  const recorded: { name: string; attributes: unknown }[] = []
  const timers = new Map<number, { callback: () => void; ms: number }>()
  const writes: boolean[] = []
  const left: boolean[] = []
  let next = 0
  let writing = true

  const seam = windowSync({
    format: "loro/1",
    setWritesFiles: (value) => {
      writes.push(value)
      writing = value

      return Promise.resolve({ filesWritten: value ? 2 : 0, stylesheetWritten: false })
    },
    writesFiles: () => writing,
    reopen: () => Promise.resolve(),
    left: (saved) => void left.push(saved),
    record: (name, attributes) => void recorded.push({ name, attributes }),
    lineage: () => "lineage-1",
    timers: {
      set(callback, ms) {
        next += 1
        timers.set(next, { callback, ms })

        return next
      },
      clear: (handle) => void timers.delete(handle)
    },
    now: () => 0
  })

  let sync: Sync | undefined

  const module = defineWindowModule({
    activateWindow(parity: WindowParity) {
      sync = parity.sync

      if (open) {
        parity.subscriptions.push(parity.sync.onOpen(open))
      }

      return {}
    }
  })

  const opened = await tab(module, { capabilities: ["sync"] }, { sync: seam })

  return {
    ...opened,
    seam,
    recorded,
    writes,
    left,
    /** Runs the timers set for `ms`. */
    elapse: (ms: number) => {
      // Only the timers set before now: one that fires may set another.
      for (const [handle, timer] of Array.from(timers)) {
        if (timer.ms === ms) {
          timers.delete(handle)
          timer.callback()
        }
      }
    },
    sync: () => {
      if (!sync) {
        throw new Error("It never activated")
      }

      return sync
    },
    named: (name: string) => recorded.flatMap((each) => (each.name === name ? [each.attributes] : []))
  }
}

describe("parity.sync", () => {
  it("opens from files with a new lineage, or on a snapshot keeping its lineage, recording how", async () => {
    const fromFiles = await room(() => Promise.resolve({ from: "files" }))

    expect(fromFiles.seam.handled).toBe(true)
    expect(await fromFiles.seam.open()).toEqual({ from: "files", lineage: "lineage-1" })

    const snapshot = new Uint8Array([1, 2, 3])
    const joining = await room(() => Promise.resolve({ from: "snapshot", snapshot, lineage: "theirs" }))

    expect(await joining.seam.open()).toEqual({ from: "snapshot", snapshot, lineage: "theirs" })
    expect(joining.named("sync.opened")).toEqual([
      { extension: surfaceTestId, from: "snapshot", waitMs: 0, snapshotBytes: 3, lineage: "theirs", format: "loro/1" }
    ])
  })

  it("opens alone when nothing says how, when onOpen rejects, or when it takes over 30 s", async () => {
    const none = await room()

    expect(none.seam.handled).toBe(false)
    expect(await none.seam.open()).toBeUndefined()

    const rejected = await room(() => Promise.reject(new Error("No room")))

    expect(await rejected.seam.open()).toBeUndefined()
    expect(rejected.named("sync.openFailed")).toMatchObject([{ reason: "rejected", message: "No room" }])
    expect(rejected.named("sync.detached")).toEqual([{ why: "openFailed", saved: true }])

    const slow = await room(() => new Promise(() => undefined))
    const opening = slow.seam.open()
    slow.elapse(openWaitMs)

    expect(await opening).toBeUndefined()
    expect(slow.named("sync.openFailed")).toMatchObject([{ reason: "timeout" }])
    await expect(slow.sync().snapshot()).rejects.toThrow("open alone")
  })

  it("opens alone when the module that says how stops before the document is attached, refusing a late opening", async () => {
    let answer: (from: OpenFrom) => void = () => undefined
    const { seam, sync, stop, named } = await room(() => new Promise((resolve) => (answer = resolve)))
    const opening = seam.open()

    await stop()

    expect(await opening).toBeUndefined()

    answer({ from: "files" })
    await settle()
    seam.attach(document().doc, "lineage-1")

    await expect(sync().snapshot()).rejects.toThrow("open alone")
    expect(named("sync.opened")).toEqual([])
    expect(named("sync.openFailed")).toEqual([])
    expect(named("sync.detached")).toEqual([{ why: "stopped", saved: true }])

    const late = await room(() => Promise.resolve({ from: "files" }))
    const opened = await late.seam.open()
    await late.stop()
    late.seam.attach(document().doc, opened!.lineage)

    await expect(late.sync().snapshot()).rejects.toThrow("open alone")
    expect(late.named("sync.detached")).toEqual([{ why: "stopped", saved: true }])
  })

  it("lets the module call before the document opens, applying what it passed in, in order, once it does", async () => {
    const { seam, sync } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, changes, bytes } = document()
    const opening = await seam.open()

    const first = sync().receive(framed("lineage-1", bytes("a")))
    const second = sync().receive(framed("lineage-1", bytes("b")))
    const snapshot = sync().snapshot()

    expect(() => sync().version()).toThrow("hasn't opened yet")

    seam.attach(doc, opening!.lineage)

    expect(await first).toEqual({ pending: false })
    expect(await second).toEqual({ pending: false })
    expect(new TextDecoder().decode(await snapshot)).toBe("snapshot of a,b")
    expect(changes).toEqual(["a", "b"])
    expect(sync().lineage).toBe("lineage-1")
    expect(sync().format).toBe("loro/1")
  })

  it("tells every change committed here with its lineage, and gives what another copy is missing", async () => {
    const { seam, sync, named } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, commit, text, bytes } = document()
    seam.attach(doc, "lineage-1")
    const told: string[] = []
    sync().onLocalChanges((frame) => told.push(`${unframed(frame).lineage} ${text(unframed(frame).bytes)}`))

    commit("x")
    commit("y")
    const missing = unframed(sync().changesSince(bytes("1")))

    expect(told).toEqual(["lineage-1 x", "lineage-1 y"])
    expect(text(sync().version())).toBe("2")
    expect(missing).toEqual({ lineage: "lineage-1", bytes: bytes("y") })
    expect(named("sync.caughtUp")).toMatchObject([{ role: "answered", trigger: "reconnect" }])
  })

  it("refuses changes from another lineage, and records changes left pending and their gap filled", async () => {
    const { seam, sync, named, elapse } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, bytes } = document()
    seam.attach(doc, "lineage-1")

    await expect(sync().receive(framed("other", bytes("a")))).rejects.toBeInstanceOf(LineageError)
    await expect(sync().receive(bytes("not framed"))).rejects.toThrow("aren't changes from parity.sync")

    expect(await sync().receive(framed("lineage-1", bytes("later:b")))).toEqual({ pending: true })
    elapse(5000)
    expect(await sync().receive(framed("lineage-1", bytes("a")))).toEqual({ pending: false })

    expect(named("sync.lineageRefused")).toEqual([{ lineage: "lineage-1", theirs: "other" }])
    expect(named("sync.receiveFailed")).toMatchObject([{ message: "These bytes aren't changes from parity.sync" }])
    expect(named("sync.pending")).toMatchObject([{ pendingBytes: framed("lineage-1", bytes("later:b")).length }])
    expect(named("sync.caughtUp")).toMatchObject([{ role: "asked", trigger: "pending" }])
  })

  it("describes the room for extensions.json, for the extension that brings it only", async () => {
    const { seam, sync, runtime } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, bytes } = document()

    expect(seam.describe?.(surfaceTestId)).toEqual({
      room: { state: "waiting", lineage: "", writesFiles: true, pending: false }
    })

    await seam.open()
    seam.attach(doc, "lineage-1")
    await sync().receive(framed("lineage-1", bytes("later:b")))

    expect(runtime.facts().extensions[0]?.room).toEqual({
      state: "attached",
      lineage: "lineage-1",
      writesFiles: true,
      pending: true,
      versionBytes: 1
    })
    expect(seam.describe?.("@parity-app/extension-other")).toEqual({})
  })

  it("starts and stops writing files as the room says, recording each", async () => {
    const { seam, sync, writes, named } = await room(() => Promise.resolve({ from: "files" }))
    seam.attach(document().doc, "lineage-1")

    await sync().setWritesFiles(false)

    expect(sync().writesFiles).toBe(false)

    await sync().setWritesFiles(true)

    expect(writes).toEqual([false, true])
    expect(named("sync.writesFiles")).toMatchObject([
      { writes: false, why: "host", filesWritten: 0 },
      { writes: true, why: "host", filesWritten: 2 }
    ])
  })

  it("keeps the document open alone and writes files when the module that brought the room stops", async () => {
    const { seam, sync, stop, writes, left, named } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, commit } = document()
    seam.attach(doc, "lineage-1")
    await sync().setWritesFiles(false)
    const told: number[] = []
    sync().onLocalChanges((frame) => told.push(frame.length))

    await stop()
    await settle()
    commit("after")

    expect(writes).toEqual([false, true])
    expect(left).toEqual([true])
    expect(told).toEqual([])
    expect(named("sync.detached")).toEqual([{ why: "stopped", saved: true }])
    expect(named("sync.writesFiles").at(-1)).toMatchObject({ writes: true, why: "roomGone" })
  })

  it("detaches nothing when the project closes, and refuses a second extension's onOpen", async () => {
    const { seam, sync, stop, writes, left } = await room(() => Promise.resolve({ from: "files" }))
    seam.attach(document().doc, "lineage-1")

    // SAFETY: the seam makes `parity.sync`.
    const other = seam.make(contextLike()) as Sync

    expect(() => other.onOpen(() => Promise.resolve({ from: "files" }))).toThrow("Another extension already says")

    seam.close()
    await stop()

    expect(writes).toEqual([])
    expect(left).toEqual([])
    await expect(sync().snapshot()).rejects.toThrow("needs the document shared")
  })

  it("records the minute's traffic while the document is shared", async () => {
    const { seam, sync, elapse, named } = await room(() => Promise.resolve({ from: "files" }))
    const { doc, commit, bytes } = document()
    seam.attach(doc, "lineage-1")
    sync().onLocalChanges(() => undefined)

    commit("x")
    await sync().receive(framed("lineage-1", bytes("y")))
    elapse(60_000)

    expect(named("sync.traffic")).toMatchObject([{ changesOut: 1, changesIn: 1, pendingReceives: 0 }])
  })
})

/** What a surface is made with, for a second extension's run in the tab. */
function contextLike() {
  return {
    extension: "someone-else",
    displayName: "Someone else",
    tab: "tab-1",
    need: () => undefined,
    listener:
      <Args extends unknown[]>(_api: string, listener: (...args: Args) => void) =>
      (...args: Args) =>
        listener(...args),
    failed: () => undefined,
    onEnd: () => undefined
  }
}
