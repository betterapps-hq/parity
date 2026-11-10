import { CodedError, type ContainerSpec, defaultModeSettings, type DesignNode, resolveModes } from "@parity-app/core"
import type { FoundScreen } from "@parity-app/editor"
import { describe, expect, it } from "vite-plus/test"
import type { z } from "zod"
import type { requests } from "./contracts.ts"
import { type AgentMethod, replies } from "./contracts.ts"
import { type AgentHost, type Answer, answerRequest, dispatch, exportPictures } from "./dispatch.ts"
import type {
  AgentChangeSet,
  AgentReport,
  FrameRequest,
  FrameResult,
  PlaceableResult,
  PresenceEvent,
  TabSnapshot
} from "./types.ts"

/** A tab with one screen, Sign up, holding a title and a Button, in the default modes. */
function snapshot(): TabSnapshot {
  const tab: TabSnapshot = {
    tab: { id: "tab-1", name: "App", root: "D:/app", active: true, status: "ready", designs: 1 },
    revision: "r1",
    projectId: "D:/app",
    guestUrl: "http://127.0.0.1:5173/",
    components: ["Button"],
    iconSets: [],
    tokens: [
      { name: "background", category: "color", source: "semantic", values: { default: "white", dark: "black" } },
      { name: "text-2xl", category: "font-size", source: "theme", values: { default: "1.5rem" } }
    ],
    theme: [],
    modes: defaultModeSettings,
    documents: [
      {
        path: "app.par",
        document: {
          version: 3,
          containers: [
            {
              id: "signup",
              name: "Sign up",
              position: { x: 0, y: 0 },
              root: {
                type: "layout",
                id: "page",
                name: "Page",
                children: [
                  { type: "text", id: "title", name: "Title", text: "Create an account" },
                  { type: "component", id: "submit", name: "Submit", component: "Button", props: {} }
                ]
              },
              states: [{ id: "default", name: "Default" }]
            }
          ]
        }
      }
    ],
    libraryDesigns: [],
    tokenOverrides: [],
    mainDocument: "app.par",
    props: {
      Button: {
        name: "Button",
        path: "src/button.tsx",
        props: [{ name: "variant", kind: "enum", group: "variant", options: ["default", "outline"] }]
      }
    },
    sources: { Button: { path: "src/button.tsx", export: "Button" } },
    renderStatus: { Button: { error: "useSidebar must be used within a SidebarProvider." } },
    leftOut: [{ name: "Toaster", path: "src/toaster.tsx", export: "Toaster", reason: "It returns no element" }],
    selection: {},
    viewport: { x: 0, y: 0, width: 1440, height: 900, zoom: 1 },
    bounds: { "app.par#signup": { x: 0, y: 0, width: 1400, height: 900 } },
    detection: { packageManager: { id: "pnpm", name: "pnpm", agent: "pnpm", summary: "pnpm" }, tools: [] }
  }

  return tab
}

/** What the fixture host was asked, kept to look at. */
interface Asked {
  snapshots: (string | undefined)[]
  presence: PresenceEvent[]
  frames: FrameRequest[]
  applied: { tab: string; label: string; changes: AgentChangeSet }[]
  saved: number
  console: boolean[]
  reports: AgentReport[]
  references: Answer<"references">[]
  placed: { connector: string; id: string; design: string }[]
  removed: string[]
  savedImages: { url: string; name: string }[]
}

/** A photo main found lately, as placing takes it. */
const desk: PlaceableResult = {
  kind: "photos",
  placeable: true,
  title: "white desk",
  image: { url: "https://images.unsplash.com/photo-1" },
  credit: [
    { name: "Ada Park", url: "https://unsplash.com/@adapark" },
    { name: "Unsplash", url: "https://unsplash.com" }
  ]
}

/** A screen from a real app main found lately, as `PlaceReference` takes it. */
const calm: FoundScreen = {
  connector: "mobbin",
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  title: "Calm",
  platform: "web",
  link: "https://mobbin.com/screens/1b9d6bcd",
  image: { url: "https://images.mobbin.com/calm.png", width: 768, height: 480, expiresAt: 4_000_000_000_000 }
}

/** The tests' host: the fixture tab, frames drawn as data, and everything asked of it kept to look at. */
function fixtureHost() {
  const tab = snapshot()

  const asked: Asked = {
    snapshots: [],
    presence: [],
    frames: [],
    applied: [],
    saved: 0,
    console: [],
    reports: [],
    references: [],
    placed: [],
    removed: [],
    savedImages: []
  }

  const host: AgentHost = {
    tabs: async () => [tab.tab],
    copy: async () => ({ tabs: [tab.tab], focusedAt: 1 }),
    open: async () => tab.tab,
    snapshot: async (reference) => {
      asked.snapshots.push(reference)

      return tab
    },
    status: async ({ summary }) => ({
      tab: tab.tab,
      revision: tab.revision,
      dirty: false,
      autosave: true,
      unsaved: [],
      tokenEdits: 0,
      save: { status: "saved" },
      errors: [],
      undo: summary ? { count: 0, labels: [] } : { count: 0 },
      redo: summary ? { count: 0, labels: [] } : { count: 0 }
    }),
    presence: (events) => asked.presence.push(...events),
    render: async (_snapshot, request) => {
      asked.frames.push(request)

      const frame: FrameResult = {
        width: request.mode.width,
        height: 600,
        nodes: [{ id: "title", x: 0, y: 0, width: request.mode.width + 10, height: 40 }],
        overflowsX: false,
        unknownComponents: []
      }

      if (request.capture) {
        frame.png = "iVBOR"
      }

      if (request.audit) {
        frame.issues = []
      }

      return frame
    },
    iconNames: async () => ({ names: [] }),
    supports: async (queries) => queries.map(() => true),
    apply: async (tabId, label, changes) => {
      asked.applied.push({ tab: tabId, label, changes })

      return []
    },
    console: async (_snapshot, clear) => {
      asked.console.push(clear)

      return [
        { level: "error", text: "Boom", source: "app.tsx", line: 3, where: "canvas", count: 1, first: 1, last: 2 }
      ]
    },
    saveScreenshots: async (shots) => shots.map((_shot, index) => `D:/shots/${++asked.saved}-${index}.png`),
    scanImages: async () => ({
      files: [
        { path: "public/images/hero.png", bytes: 1200 },
        { path: "public/images/unused.webp", bytes: 300 }
      ],
      references: []
    }),
    removeImage: async (_projectId, path) => {
      asked.removed.push(path)

      return { path, label: "Remove image" }
    },
    report: async (report) => {
      asked.reports.push(report)

      return {
        feedbackId: "f1",
        link: "https://sentry.example/f1",
        traceId: "t1",
        attachments: ["screenshot.png", ...report.frames.map((frame) => frame.name)]
      }
    },
    references: async (request) => {
      const answer = {
        found: [
          {
            id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
            connector: "mobbin",
            source: "Mobbin",
            title: "Calm",
            platform: request.platform === "ios" ? ("ios" as const) : ("web" as const),
            link: "https://mobbin.com/screens/1b9d6bcd",
            credit: [{ name: "Calm" }, { name: "Mobbin" }],
            preview: { path: "D:/references/calm.webp", mimeType: "image/webp" as const, data: "UklG" }
          }
        ].slice(0, request.limit)
      }

      asked.references.push(answer)

      return answer
    },
    media: async () => ({ found: [] }),
    saveImage: async (_projectId, image) => {
      asked.savedImages.push(image)

      return { src: "/images/white-desk-1a2b3c4d.jpg" }
    },
    result: async (connector, id) => (connector === "unsplash" && id === "desk" ? desk : undefined),
    screen: async (id, connector) => (id === calm.id && (connector ?? "mobbin") === "mobbin" ? calm : undefined),
    placed: async (placed) => {
      asked.placed.push(placed)
    }
  }

  return { host, asked, tab }
}

const caller = { name: "Claude Code", id: "session-1" }

/** What an agent sends a method, before its schema fills in the defaults. `copy` takes nothing. */
type Request<M extends AgentMethod> = M extends keyof typeof requests
  ? z.input<(typeof requests)[M]>
  : Record<string, never>

/** Calls `method` through the fixture host, and checks the answer against the schema the CLI reads it with. */
async function ask<M extends AgentMethod>(method: M, params?: Request<M>) {
  const fixture = fixtureHost()
  const answer = await dispatch(method, params ?? {}, fixture.host, caller)
  const checked = replies[method].safeParse(answer)
  expect(checked.error?.issues ?? []).toEqual([])

  // SAFETY: `dispatch` answered `method`, and its schema just read the answer.
  return { ...fixture, answer: answer as Answer<M> }
}

describe("dispatch", () => {
  it("answers each method in the shape its schema in contracts.ts reads", async () => {
    const methods: [AgentMethod, Request<AgentMethod>][] = [
      ["tabs", {}],
      ["copy", {}],
      ["open", { root: "D:/app" }],
      ["state", {}],
      ["status", {}],
      ["modes", {}],
      ["tokens", {}],
      ["components", {}],
      ["props", { component: "Button" }],
      ["console", {}],
      ["problems", { design: "signup" }],
      ["accessibility", { design: "signup" }],
      ["screenshot", { design: "signup", scale: 1 }],
      ["exec", { label: "Read", code: "Print(Designs().length)" }],
      ["report", { message: "The title is cut off" }],
      ["references", { query: "paywall with a free trial" }],
      ["media", { query: "desk by a window" }],
      ["place", { connector: "unsplash", id: "desk", node: "signup/title" }],
      ["images", {}],
      ["removeImage", { image: "unused.webp" }]
    ]

    const answered: string[] = []

    for (const [method, params] of methods) {
      await ask(method, params)
      answered.push(method)
    }

    expect(new Set(answered)).toEqual(new Set(Object.keys(replies)))
  })

  it("marks the first resolved mode primary, and only that one (PAR-579)", async () => {
    const { answer } = await ask("state")
    const modes = answer.modes
    const resolved = resolveModes(defaultModeSettings)
    expect(resolved.length).toBeGreaterThan(1)
    expect(modes.map((mode) => [mode.id, mode.primary])).toEqual(resolved.map((mode, index) => [mode.id, index === 0]))
  })

  it("shows a read on the caller's own cursor, started and ended", async () => {
    const { asked } = await ask("state", { tab: "App" })
    expect(asked.snapshots).toEqual(["App"])
    expect(asked.presence).toEqual([
      { tab: "tab-1", agent: "Claude Code", agentId: "session-1", kind: "start", label: "Look over the board" },
      { tab: "tab-1", agent: "Claude Code", agentId: "session-1", kind: "board", label: "Look over the board" },
      { tab: "tab-1", agent: "Claude Code", agentId: "session-1", kind: "end", label: "Look over the board" }
    ])
  })

  it("ends the cursor's work with the error when a read fails", async () => {
    const { host, asked } = fixtureHost()
    host.console = () => Promise.reject(new Error("The window closed"))
    await expect(dispatch("console", {}, host)).rejects.toThrow("The window closed")
    expect(asked.presence.at(-1)).toEqual({
      tab: "tab-1",
      kind: "end",
      label: "Read the console",
      error: "The window closed"
    })
  })

  it("reads the console through the host, clearing only when asked", async () => {
    const { answer, asked } = await ask("console", { clear: true })
    expect(asked.console).toEqual([true])
    expect(answer.tab).toEqual({ id: "tab-1", name: "App" })
  })

  it("applies a snippet's changes in its tab as one step, under its label", async () => {
    const { answer, asked } = await ask("exec", {
      label: "Outline the button",
      code: 'Update("submit", {props: {variant: "outline"}})'
    })

    expect(answer.applied).toBe(true)
    expect(asked.applied).toHaveLength(1)
    expect(asked.applied[0]).toMatchObject({ tab: "tab-1", label: "Outline the button" })
    expect(asked.applied[0]!.changes.designs).toHaveLength(1)
  })

  it("asks the host whether a token value is its token's kind, and applies nothing it refuses", async () => {
    const { host, asked } = fixtureHost()
    const queries: { property: string; value: string }[] = []
    host.supports = async (asking) => {
      queries.push(...asking)

      return asking.map(() => false)
    }

    const answer = await dispatch("exec", { label: "Recolor", code: 'SetTokens({ background: "bluish" })' }, host)

    expect(queries.map((query) => query.value)).toContain("bluish")
    expect(answer).toMatchObject({ ok: false })
    expect(asked.applied).toEqual([])
  })

  it("keeps a screenshot's PNG as a file, without an editId to retry", async () => {
    const { answer, asked } = await ask("screenshot", { design: "signup", scale: 1 })
    const shots = answer.screenshots
    expect(shots.length).toBeGreaterThan(0)
    expect(shots.map((shot) => shot.path)).toEqual(shots.map((_shot, index) => `D:/shots/1-${index}.png`))
    expect(asked.saved).toBe(1)
    expect(answer).not.toHaveProperty("editId")
  })

  it("counts the frames a check draws, and checks every state in the modes shown by default", async () => {
    const { answer, asked } = await ask("problems", { design: "Sign up" })
    expect(answer.design).toEqual({ id: "signup", name: "Sign up" })
    expect(answer.frames).toBe(asked.frames.length)
    expect(asked.frames.length).toBeGreaterThan(0)
  })

  it("passes status's summary as false unless asked", async () => {
    const { answer } = await ask("status", { tab: "tab-1" })
    expect(answer.tab).toEqual({ id: "tab-1", name: "App" })
    expect(answer.undo.labels).toBeUndefined()
  })

  it("reports the components failing to draw and the exports left out", async () => {
    const { answer } = await ask("components")
    expect(answer.failing).toEqual([
      { id: "Button", problem: "provider", reason: expect.stringContaining("SidebarProvider") }
    ])
    expect(answer.leftOut).toEqual([
      { name: "Toaster", path: "src/toaster.tsx", export: "Toaster", reason: "It returns no element" }
    ])
  })

  it("says which file each of the project's own components is written in", async () => {
    const { answer } = await ask("components")
    expect(answer.files).toEqual({ Button: "src/button.tsx" })
  })

  it("refuses a method the app doesn't have, naming the ones it does", async () => {
    const { host } = fixtureHost()
    const refused = dispatch("delete", {}, host)
    await expect(refused).rejects.toBeInstanceOf(CodedError)
    await expect(refused).rejects.toMatchObject({ details: { code: "invalid_input", field: "method" } })
    await expect(refused).rejects.toThrow(/Methods: tabs, copy, open, state/)
  })
})

describe("images", () => {
  /** The fixture host, with a design showing hero.png. */
  function withHero() {
    const fixture = fixtureHost()

    const hero: ContainerSpec = {
      id: "hero-screen",
      name: "Landing",
      position: { x: 0, y: 0 },
      root: { type: "image", id: "hero", src: "/images/hero.png", alt: "A desk" },
      states: [{ id: "default", name: "Default" }]
    }

    const documents = [
      ...fixture.tab.documents,
      { path: "landing.par", document: { version: 3 as const, containers: [hero] } }
    ]

    const host: AgentHost = { ...fixture.host, snapshot: async () => ({ ...fixture.tab, documents }) }

    return { ...fixture, host }
  }

  it("lists the project's files with what uses them, and keeps to unused ones when asked", async () => {
    const { host } = withHero()

    const all = replies.images.parse(await dispatch("images", {}, host, caller))
    const unused = replies.images.parse(await dispatch("images", { unused: true }, host, caller))

    expect(all.images.map(({ name, usedBy }) => [name, usedBy.map((use) => use.designName)])).toEqual([
      ["hero.png", ["Landing"]],
      ["unused.webp", []]
    ])
    expect(unused).toMatchObject({ images: [{ name: "unused.webp" }], total: 1, truncated: false })
  })

  it("removes a file nothing uses, and refuses one a design shows or that isn't an image", async () => {
    const { host, asked } = withHero()

    await expect(dispatch("removeImage", { image: "unused.webp" }, host, caller)).resolves.toEqual({
      path: "public/images/unused.webp",
      label: "Remove image"
    })
    await expect(dispatch("removeImage", { image: "hero.png" }, host, caller)).rejects.toMatchObject({
      message: "hero.png is still used in Landing. Remove or replace it there first.",
      details: { code: "image_in_use" }
    })
    await expect(dispatch("removeImage", { image: "logo.svg" }, host, caller)).rejects.toMatchObject({
      details: { code: "unknown_image" }
    })
    expect(asked.removed).toEqual(["public/images/unused.webp"])
  })
})

describe("report", () => {
  it("sends the message tagged with the tab, without drawing or showing a cursor when it names no design", async () => {
    const { asked, answer } = await ask("report", { message: "The title is cut off", node: "title" })
    expect(asked.frames).toEqual([])
    expect(asked.presence).toEqual([])
    expect(asked.reports).toEqual([
      { message: "The title is cut off", tags: { tab: "App", node: "title" }, frames: [] }
    ])
    expect(answer).toEqual({
      feedbackId: "f1",
      link: "https://sentry.example/f1",
      traceId: "t1",
      attachments: ["screenshot.png"],
      tags: { tab: "App", node: "title" }
    })
  })

  it("sends the named design's frames in the state it shows, tagged with its id, the state and the test pass", async () => {
    const { asked } = await ask("report", { message: "Wrong button", design: "Sign up", testRun: "pass-7" })
    const [sent] = asked.reports
    expect(sent?.tags).toEqual({ tab: "App", design: "signup", state: "default", test_run: "pass-7" })
    expect(sent?.frames.length).toBeGreaterThan(0)
    expect(sent?.frames.length).toBe(asked.frames.length)
    expect(sent?.frames[0]).toEqual({ name: expect.stringMatching(/^signup default .+\.png$/), png: "iVBOR" })
    expect(asked.presence).toEqual([])
  })

  it("sends a report about a tab that isn't ready, naming it from the tab list, when it names no design", async () => {
    const { host, asked } = fixtureHost()
    host.snapshot = () => Promise.reject(new CodedError("App is still opening", { code: "tab_not_ready" }))
    await dispatch("report", { message: "It won't open", tab: "App" }, host)
    expect(asked.reports).toEqual([{ message: "It won't open", tags: { tab: "App" }, frames: [] }])
    const refused = dispatch("report", { message: "It won't open", tab: "Shop" }, host)
    await expect(refused).rejects.toMatchObject({ details: { code: "unknown_tab", field: "tab" } })
  })

  it("works with no project open, as long as it names no tab or design", async () => {
    const { host, asked } = fixtureHost()
    host.tabs = async () => []
    const answer = await dispatch("report", { message: "Nothing opens" }, host)
    expect(asked.snapshots).toEqual([])
    expect(asked.reports).toEqual([{ message: "Nothing opens", tags: {}, frames: [] }])
    expect(answer).toMatchObject({ feedbackId: "f1", tags: {} })
  })

  it("fails as a screenshot would for a design that isn't there, and sends nothing", async () => {
    const { host, asked } = fixtureHost()
    const refused = dispatch("report", { message: "Off", design: "Checkout" }, host)
    await expect(refused).rejects.toMatchObject({ details: { code: "unknown_design" } })
    expect(asked.reports).toEqual([])
  })

  it("needs a message", async () => {
    const { host } = fixtureHost()
    const refused = dispatch("report", { message: " " }, host)
    await expect(refused).rejects.toMatchObject({ details: { code: "invalid_input", field: "message" } })
  })
})

describe("answerRequest", () => {
  /** Answers a `/rpc` body, or gives back the coded error it failed with and what the host was asked. */
  async function refused(body: string) {
    const { host, asked } = fixtureHost()
    const error = await answerRequest(body, host).catch((cause: unknown) => cause)

    if (!(error instanceof CodedError)) {
      throw new Error(`Expected a CodedError, got ${String(error)}`)
    }

    return { error, asked }
  }

  it("dispatches a body's method and params, showing the caller it names", async () => {
    const { host, asked } = fixtureHost()
    const body = { method: "state", params: { tab: "App" }, agent: "Claude Code", agentId: "session-1" }
    const answer = await answerRequest(JSON.stringify(body), host)
    expect(replies.state.safeParse(answer).success).toBe(true)
    expect(asked.snapshots).toEqual(["App"])
    expect(asked.presence[0]).toMatchObject({ agent: "Claude Code", agentId: "session-1" })
  })

  it("refuses a body that isn't a JSON object naming a method", async () => {
    expect((await refused("{method: state}")).error).toMatchObject({
      message: "expected JSON",
      details: { code: "invalid_input" }
    })
    expect((await refused("[1]")).error).toMatchObject({
      message: "The request must be a JSON object",
      details: { code: "invalid_input" }
    })
    expect((await refused('{"params":{}}')).error).toMatchObject({
      message: "method must be a string",
      details: { code: "invalid_input", field: "method" }
    })
  })

  it("refuses a method the app doesn't have", async () => {
    const { error } = await refused('{"method":"delete"}')
    expect(error).toMatchObject({ details: { code: "invalid_input", field: "method" } })
  })

  it("refuses params their method's schema doesn't take, at their path, before asking the host anything", async () => {
    const cases: [unknown, string, string][] = [
      [
        { method: "screenshot", params: { design: "signup", scale: 9 } },
        "scale",
        "scale must be a finite number from 0.25 to 3"
      ],
      [{ method: "state", params: { tab: "App", design: "signup" } }, "design", "Unknown input field design"],
      [{ method: "props", params: {} }, "component", "component must be a nonblank string"],
      [{ method: "open", params: { root: "app" } }, "root", "root must be an absolute project folder path"],
      [
        { method: "exec", params: { editId: "e1", edits: [{ find: "", replace: "x" }] } },
        "edits/0/find",
        "Each edit needs a nonempty find string"
      ],
      [{ method: "status", params: "all" }, "", "Operation input must be an object"]
    ]

    for (const [body, field, message] of cases) {
      const { error, asked } = await refused(JSON.stringify(body))
      expect(error.message).toBe(message)
      expect(error.details).toEqual(
        field ? { code: "invalid_input", retryable: false, field } : { code: "invalid_input", retryable: false }
      )
      expect(asked.snapshots).toEqual([])
    }
  })

  it("reads params with their schema's defaults", async () => {
    const { host } = fixtureHost()
    const statuses: unknown[] = []
    host.status = async (request) => {
      statuses.push(request)

      return fixtureHost().host.status(request)
    }

    await answerRequest('{"method":"status"}', host)
    expect(statuses).toEqual([{ summary: false, limit: 10 }])
  })
})

describe("exportPictures", () => {
  it("names each picture by its design, with the scale when it isn't 1", async () => {
    const { host, tab } = fixtureHost()
    const { files } = await exportPictures(host, tab, ["signup"], 2)
    expect(files).toEqual([{ name: "Sign up@2x.png", png: "iVBOR" }])
  })
})

/** The fixture host, its sign-up design holding a photo, and Button taking a picture through `src`. */
function placingHost() {
  const fixture = fixtureHost()
  const signup = fixture.tab.documents[0]!.document.containers[0]!
  const photo: DesignNode = { type: "image", id: "photo", name: "Photo", src: "/images/old.jpg", style: { width: 40 } }

  if (signup.root.type === "layout") {
    signup.root.children.push(photo)
  }

  fixture.tab.props.Button!.props.push({ name: "src", kind: "string", group: "own" })

  return fixture
}

describe("PlaceReference", () => {
  it("puts a screen beside the design as a reference, naming the agent, with its note, in a row", async () => {
    const { host, asked } = fixtureHost()
    const place = `await PlaceReference(${JSON.stringify(calm.id)}, { near: "signup", note: "The form is one column" })`

    const answer = await dispatch(
      "exec",
      { label: "Look at sign up screens", code: `${place}; ${place}` },
      host,
      caller
    )

    expect(answer).toMatchObject({ ok: true, applied: true })
    const placed = asked.applied[0]?.changes.references ?? []

    expect(placed.map(({ path, reference }) => [path, reference.position])).toEqual([
      ["app.par", { x: 1560, y: 0 }],
      ["app.par", { x: 2888, y: 0 }]
    ])
    expect(placed[0]?.reference).toMatchObject({
      connector: "mobbin",
      sourceId: calm.id,
      app: "Calm",
      link: calm.link,
      note: "The form is one column",
      by: "Claude Code"
    })
  })

  it("places nothing for a screen Parity hasn't found, or without a design to put it beside", async () => {
    const { host, asked } = fixtureHost()

    const unknown = await dispatch(
      "exec",
      { label: "Place", code: 'await PlaceReference("made-up", { near: "signup" })' },
      host
    )

    const nowhere = await dispatch(
      "exec",
      { label: "Place", code: `await PlaceReference(${JSON.stringify(calm.id)})` },
      host
    )

    expect(unknown).toMatchObject({ ok: false, error: expect.stringContaining("find_references") })
    expect(nowhere).toMatchObject({ ok: false, error: expect.stringContaining("near") })
    expect(asked.applied).toEqual([])
  })
})

describe("place", () => {
  it("puts main's copy of a photo in an image as one edit, with its description and credit, then tells main", async () => {
    const { host, asked } = placingHost()

    const answer = await dispatch("place", { connector: "unsplash", id: "desk", node: "signup/photo" }, host, caller)

    expect(answer).toEqual({ placed: true, node: "signup/photo", credit: desk.credit })
    expect(asked.applied.map(({ label }) => label)).toEqual(["Place white desk"])
    expect(asked.applied[0]?.changes.designs[0]?.after?.root).toMatchObject({
      children: expect.arrayContaining([
        {
          type: "image",
          id: "photo",
          name: "Photo",
          src: desk.image.url,
          alt: "white desk",
          credit: { name: "Ada Park", url: "https://unsplash.com/@adapark", source: "Unsplash" },
          style: { width: 40 }
        }
      ])
    })
    expect(asked.placed).toEqual([
      { connector: "unsplash", id: "desk", project: "D:/app", file: "app.par", design: "signup" }
    ])
  })

  it("puts it in a component's declared prop, and only a prop the component declares", async () => {
    const { host, asked } = placingHost()

    const missing = await dispatch(
      "place",
      { connector: "unsplash", id: "desk", node: "signup/submit", prop: "image" },
      host,
      caller
    )

    await dispatch("place", { connector: "unsplash", id: "desk", node: "signup/submit" }, host, caller)

    expect(missing).toEqual({
      placed: false,
      problem: { code: "invalid", message: "Button has no image prop. Name the prop that takes the image with prop." }
    })
    expect(asked.applied[0]?.changes.designs[0]?.after?.root).toMatchObject({
      children: expect.arrayContaining([expect.objectContaining({ id: "submit", props: { src: desk.image.url } })])
    })
    expect(asked.placed).toHaveLength(1)
  })

  it("reports a photo the image already shows without changing anything, so main counts it once", async () => {
    const { host, asked } = placingHost()
    const signup = (await host.snapshot(undefined)).documents[0]!.document.containers[0]!

    if (signup.root.type === "layout") {
      signup.root.children[2] = { type: "image", id: "photo", src: desk.image.url }
    }

    expect(await dispatch("place", { connector: "unsplash", id: "desk", node: "signup/photo" }, host, caller)).toEqual({
      placed: true,
      node: "signup/photo",
      credit: desk.credit
    })
    expect([asked.applied, asked.placed.length]).toEqual([[], 1])
  })

  it("saves a picture whose link stops working into the project first, and shows the file", async () => {
    const { host, asked } = placingHost()
    const fleeting = { ...desk, image: { url: "https://cdn.pixabay.com/photo/desk.jpg", expiresAt: 1 } }
    const pixabay: AgentHost = { ...host, result: async () => fleeting }

    const answer = await dispatch("place", { connector: "pixabay", id: "1", node: "signup/photo" }, pixabay, caller)

    expect(answer).toMatchObject({ placed: true, node: "signup/photo" })
    expect(asked.savedImages).toEqual([{ url: "https://cdn.pixabay.com/photo/desk.jpg", name: "white desk" }])
    expect(asked.applied[0]?.changes.designs[0]?.after?.root).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ id: "photo", src: "/images/white-desk-1a2b3c4d.jpg", alt: "white desk" })
      ])
    })
  })

  it("says why, and places nothing, when the picture can't be saved", async () => {
    const { host, asked } = placingHost()
    const fleeting = { ...desk, image: { url: "https://cdn.pixabay.com/photo/desk.jpg", expiresAt: 1 } }

    const failing: AgentHost = {
      ...host,
      result: async () => fleeting,
      saveImage: () => Promise.reject(new Error("the source answered 403"))
    }

    const answer = await dispatch("place", { connector: "pixabay", id: "1", node: "signup/photo" }, failing, caller)

    expect(answer).toEqual({
      placed: false,
      problem: { code: "invalid", message: "Parity couldn't save white desk into the project: the source answered 403" }
    })
    expect([asked.applied, asked.placed]).toEqual([[], []])
  })

  it("places nothing, and tells main nothing, where a picture can't go", async () => {
    const { host, asked } = placingHost()

    const screens: AgentHost = {
      ...host,
      result: async () => ({ ...desk, kind: "screens", placeable: false, credit: [{ name: "Mobbin" }] })
    }

    const tries: [AgentHost, Request<"place">][] = [
      [host, { connector: "unsplash", id: "gone", node: "signup/photo" }],
      [screens, { connector: "mobbin", id: "s", node: "signup/photo" }],
      [host, { connector: "unsplash", id: "desk", node: "signup/nothing" }],
      [host, { connector: "unsplash", id: "desk", node: "signup/title" }],
      [host, { connector: "unsplash", id: "desk", node: "signup/photo", state: "default" }]
    ]

    const answers: Answer<"place">[] = []

    for (const [asking, request] of tries) {
      answers.push(replies.place.parse(await dispatch("place", request, asking, caller)))
    }

    expect(answers.map((answer) => answer.problem?.message)).toEqual([
      "Parity hasn't found unsplash gone lately. Search again, then place one of its results.",
      "Mobbin's screens are for looking at, not for designs.",
      "There's no node at signup/nothing. Read the design with Get to find the image's path.",
      "signup/title is a text, which can't show a picture. Place it in an image or a component.",
      "An image's picture belongs to the whole design, not one state. Place it without a state."
    ])
    expect([asked.applied, asked.placed]).toEqual([[], []])
  })
})

describe("references", () => {
  it("passes the search on with six screens and nothing excluded, leaving filters to the connector", async () => {
    const fixture = fixtureHost()
    const asked: unknown[] = []

    const host: AgentHost = {
      ...fixture.host,
      references: async (request) => {
        asked.push(request)

        return { found: [] }
      }
    }

    await dispatch("references", { query: "paywall with a free trial" }, host, caller)

    expect(asked).toEqual([{ query: "paywall with a free trial", limit: 6 }])
  })

  it("passes a stock search on with its defaults: six results, and only the filters named", async () => {
    const fixture = fixtureHost()
    const asked: unknown[] = []

    const host: AgentHost = {
      ...fixture.host,
      media: async (request) => {
        asked.push(request)

        return { found: [] }
      }
    }

    await dispatch("media", { query: "desk", type: "vectors", color: "blue" }, host, caller)

    expect(asked).toEqual([{ query: "desk", type: "vectors", color: "blue", limit: 6 }])
  })

  it("turns down a search with no query before asking the host, and leaves filter values to the connector", async () => {
    const fixture = fixtureHost()

    await expect(dispatch("references", {}, fixture.host, caller)).rejects.toThrow(/query/)
    expect(fixture.asked.references).toEqual([])
    await dispatch("references", { query: "paywall", platform: "android" }, fixture.host, caller)
    expect(fixture.asked.references).toHaveLength(1)
  })
})
