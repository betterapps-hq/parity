import { defaultModeSettings } from "@parity-app/core"
import { newDesign } from "@parity-app/editor"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { ProjectInfo, ServiceMethod, ServiceMethods } from "../shared/protocol.ts"
import { ComponentStore } from "./components-store.ts"
import { DesignStore } from "./design-store.ts"
import { keepRecovery } from "./recovery.ts"
import { SelectionStore } from "./selection.ts"
import { preloadAnswers } from "./service.ts"
import type { SessionParts } from "./workspace.ts"

// docs/editor.md: each open project's panel state hangs off its session, and goes, stopped, when its tab closes or
// reopens (PAR-1005).

/** A request the window made of the service, waiting for the test to answer it. */
interface Asked {
  method: ServiceMethod
  answer: (result: ServiceMethods[ServiceMethod]["result"]) => void
}

let asked: Asked[] = []

/** How many listeners the window has for each event. */
let windowListeners = new Map<string, number>()

function stubWindow(): void {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined })
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
    addEventListener: (event: string) => windowListeners.set(event, (windowListeners.get(event) ?? 0) + 1),
    removeEventListener: (event: string) => windowListeners.set(event, (windowListeners.get(event) ?? 0) - 1),
    canvasHost: {
      ask: preloadAnswers((method) => new Promise((answer) => asked.push({ method, answer })))
    }
  })
}

// Previews wait for the canvas's bitmaps, whose cache loads tldraw, which needs a browser; none is waiting here.
vi.mock("./canvas/frame-bitmaps.ts", () => ({ bitmapsWaiting: () => 0 }))

// The modules read the window as they load: the theme follows the system's.
stubWindow()

const { ProjectSession } = await import("./workspace.ts")
const { projectPart } = await import("./project-part.ts")
const { mediaFilesOf } = await import("./media/project-media.ts")
const { checksOf } = await import("./chrome/accessibility-checks.ts")
const { consoleFilterOf } = await import("./chrome/console-filter.ts")
const { previewsOf, startPreviews } = await import("./component-previews.ts")
const { newPropOf, startNewProp } = await import("./chrome/new-prop.ts")
const { focusSlot, slotFocusOf } = await import("./chrome/slot-focus.ts")

beforeEach(() => {
  asked = []
  windowListeners = new Map()
  stubWindow()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Lets the window's awaits run on. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const pricing = { ...newDesign("screen", [], { x: 0, y: 0 }), id: "pricing", name: "Pricing" }

const info: ProjectInfo = {
  id: "/projects/app",
  root: "/projects/app",
  name: "app",
  renderer: { id: "react", name: "React" },
  guestUrl: "http://127.0.0.1:5000/guest",
  builder: { id: "vite", name: "Vite", toolVersion: "8" },
  theme: [],
  routes: [],
  entities: {},
  componentCount: 1,
  notes: [],
  detection: { packageManager: { id: "pnpm", name: "pnpm", agent: "pnpm", summary: "" }, tools: [] },
  documents: [],
  mainDocument: "app.par",
  modes: { settings: defaultModeSettings, custom: false },
  sources: { Button: { path: "src/Button.tsx", export: "Button" } },
  libraries: []
}

/** An open project holding Pricing, with a Button component, saved nowhere and with no canvas drawn. */
function openSession(): InstanceType<typeof ProjectSession> {
  const store = new DesignStore(
    [{ path: "app.par", document: { version: 4, containers: [pricing] } }],
    defaultModeSettings,
    "app.par",
    { saveDocument: async () => undefined, autosave: () => false }
  )

  return new ProjectSession(
    {
      id: info.id,
      store,
      selection: new SelectionStore(),
      components: new ComponentStore(),
      recovery: keepRecovery(store, async () => undefined)
    },
    // SAFETY: what's kept here reads the project's info and stores, not its guest or tokens, which need a browser.
    { info } as SessionParts
  )
}

describe("projectPart", () => {
  it("makes a session's part the first time it's asked for, and gives the same one after", () => {
    const make = vi.fn<() => object>(() => ({}))
    const partOf = projectPart(make)
    const session = openSession()
    expect(partOf(session)).toBe(partOf(session))
    expect(make).toHaveBeenCalledOnce()
    expect(partOf(openSession())).not.toBe(partOf(session))
  })

  it("disposes of the part when its session closes", () => {
    const dispose = vi.fn<() => void>()
    const partOf = projectPart(() => ({ dispose }))
    const session = openSession()
    partOf(session)
    expect(dispose).not.toHaveBeenCalled()
    session.close()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it("disposes of a part asked for after its session closed straight away, and keeps that one", () => {
    const dispose = vi.fn<() => void>()
    const partOf = projectPart(() => ({ dispose }))
    const session = openSession()
    session.close()
    const part = partOf(session)
    expect(dispose).toHaveBeenCalledOnce()
    expect(partOf(session)).toBe(part)
    expect(dispose).toHaveBeenCalledOnce()
  })
})

describe("when its tab closes", () => {
  it("forgets the project's media files and lets a scan under way go", async () => {
    const session = openSession()
    const files = mediaFilesOf(session)
    const told = vi.fn<() => void>()
    files.subscribe(told)
    void files.scan()
    expect(asked.map(({ method }) => method)).toEqual(["images.scan"])
    session.close()
    asked[0]!.answer({ files: [], references: [] })
    await settle()
    expect(files.get()).toEqual({ fresh: [] })
    expect(told).not.toHaveBeenCalled()
    await files.scan()
    expect(asked).toHaveLength(1)
  })

  it("forgets the accessibility checks and keeps none that's under way", async () => {
    const session = openSession()
    const checks = checksOf(session)
    const entry = session.store.getEntry("app.par#pricing")!
    void checks.run(entry)
    expect(checks.get(entry.key)?.status).toBe("checking")
    const told = vi.fn<() => void>()
    checks.subscribe(told)
    session.close()
    expect(checks.get(entry.key)).toBeUndefined()
    asked[0]!.answer({ findings: [], frames: 1, warnings: [] })
    await settle()
    expect(checks.get(entry.key)).toBeUndefined()
    expect(told).not.toHaveBeenCalled()
    await checks.run(entry)
    expect(asked).toHaveLength(1)
  })

  it("keeps each tab's console filter apart, and a reopened project starts with its own", () => {
    const first = openSession()
    const second = openSession()
    consoleFilterOf(first).set({ query: "fetch" })
    expect(consoleFilterOf(second).get().query).toBe("")
    const told = vi.fn<() => void>()
    consoleFilterOf(first).subscribe(told)
    first.close()
    expect(consoleFilterOf(first).get().query).toBe("")
    consoleFilterOf(first).set({ query: "after" })
    expect(told).not.toHaveBeenCalled()
    expect(consoleFilterOf(openSession()).get().query).toBe("")
  })

  it("stops making the project's previews and forgets them", async () => {
    vi.useFakeTimers()
    const session = openSession()
    const stop = startPreviews(session)
    expect(windowListeners.get("pointerdown")).toBe(1)
    await vi.advanceTimersByTimeAsync(300)
    const lookup = asked.find(({ method }) => method === "previews.lookup")!
    session.close()
    expect(windowListeners.get("pointerdown")).toBe(0)
    const image = { thumb: "button-thumb.png", large: "button-large.png", width: 120, height: 40 }
    lookup.answer({ previews: [{ component: "Button", key: "button", image }] })
    await vi.advanceTimersByTimeAsync(1000)
    expect(previewsOf(session).get("Button")).toBeUndefined()
    expect(asked).toEqual([lookup])
    // The canvas let go of its previews after the tab closed: starting them again starts nothing.
    stop()
    startPreviews(session)
    expect(windowListeners.get("pointerdown")).toBe(0)
  })

  it("forgets the prop being added", () => {
    const session = openSession()
    startNewProp(session, "app.par#pricing", "text")
    const told = vi.fn<() => void>()
    newPropOf(session).subscribe(told)
    session.close()
    expect(newPropOf(session).get()).toBeUndefined()
    startNewProp(session, "app.par#pricing", "number")
    expect(told).not.toHaveBeenCalled()
  })

  it("forgets the slot Props was to focus", () => {
    const session = openSession()
    focusSlot(session, "app.par#pricing", "layout")
    const told = vi.fn<() => void>()
    slotFocusOf(session).subscribe(told)
    session.close()
    expect(slotFocusOf(session).get()).toBeUndefined()
    focusSlot(session, "app.par#pricing", "layout")
    expect(told).not.toHaveBeenCalled()
  })
})
