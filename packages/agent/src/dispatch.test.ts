import { CodedError, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { type AgentMethod, replies } from "./contracts.ts"
import { type AgentHost, answerRequest, dispatch, exportPictures } from "./dispatch.ts"
import type { AgentChangeSet, FrameRequest, PresenceEvent, TabSnapshot } from "./types.ts"

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

/** The tests' host: the fixture tab, frames drawn as data, and everything asked of it kept to look at. */
function fixtureHost() {
  const tab = snapshot()
  const asked = {
    snapshots: [] as (string | undefined)[],
    presence: [] as PresenceEvent[],
    frames: [] as FrameRequest[],
    applied: [] as { tab: string; label: string; changes: AgentChangeSet }[],
    saved: 0,
    console: [] as boolean[]
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
      undo: { count: 0, ...(summary ? { labels: [] } : {}) },
      redo: { count: 0, ...(summary ? { labels: [] } : {}) }
    }),
    presence: (events) => asked.presence.push(...events),
    render: async (_snapshot, request) => {
      asked.frames.push(request)
      return {
        width: request.mode.width,
        height: 600,
        nodes: [{ id: "title", x: 0, y: 0, width: request.mode.width + 10, height: 40 }],
        overflowsX: false,
        unknownComponents: [],
        ...(request.capture ? { png: "iVBOR" } : {}),
        ...(request.audit ? { issues: [] } : {})
      }
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
    saveScreenshots: async (shots) => shots.map((_shot, index) => `D:/shots/${++asked.saved}-${index}.png`)
  }
  return { host, asked, tab }
}

const caller = { name: "Claude Code", id: "session-1" }

/** Calls `method` through the fixture host, and checks the answer against the schema the CLI reads it with. */
async function ask(method: AgentMethod, params: Record<string, unknown> = {}) {
  const fixture = fixtureHost()
  const answer = await dispatch(method, params, fixture.host, caller)
  const checked = replies[method].safeParse(answer)
  expect(checked.error?.issues ?? []).toEqual([])
  return { ...fixture, answer: answer as Record<string, never> }
}

describe("dispatch", () => {
  it("answers each method in the shape its schema in contracts.ts reads", async () => {
    const methods: [AgentMethod, Record<string, unknown>][] = [
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
      ["exec", { label: "Read", code: "Print(Designs().length)" }]
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
    const modes = answer.modes as { id: string; primary: boolean }[]
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
    const answer = (await dispatch(
      "exec",
      { label: "Recolor", code: 'SetTokens({ background: "bluish" })' },
      host
    )) as {
      ok: boolean
    }
    expect(queries.map((query) => query.value)).toContain("bluish")
    expect(answer.ok).toBe(false)
    expect(asked.applied).toEqual([])
  })

  it("keeps a screenshot's PNG as a file, without an editId to retry", async () => {
    const { answer, asked } = await ask("screenshot", { design: "signup", scale: 1 })
    const shots = answer.screenshots as { path: string; design: string }[]
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
    expect((answer.undo as { labels?: string[] }).labels).toBeUndefined()
  })

  it("reports the components failing to draw and the exports left out", async () => {
    const { answer } = await ask("components")
    expect(answer.failing).toEqual([
      { id: "Button", problem: "provider", reason: expect.stringContaining("SidebarProvider") as string }
    ])
    expect(answer.leftOut).toEqual([
      { name: "Toaster", path: "src/toaster.tsx", export: "Toaster", reason: "It returns no element" }
    ])
  })

  it("refuses a method the app doesn't have, naming the ones it does", async () => {
    const { host } = fixtureHost()
    const refused = dispatch("delete", {}, host)
    await expect(refused).rejects.toBeInstanceOf(CodedError)
    await expect(refused).rejects.toMatchObject({ details: { code: "invalid_input", field: "method" } })
    await expect(refused).rejects.toThrow(/Methods: tabs, copy, open, state/)
  })
})

describe("answerRequest", () => {
  /** Answers a `/rpc` body, or gives back the coded error it failed with and what the host was asked. */
  async function refused(body: string) {
    const { host, asked } = fixtureHost()
    const error: unknown = await answerRequest(body, host).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(CodedError)
    return { error: error as CodedError, asked }
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
      expect(error.details).toEqual({ code: "invalid_input", retryable: false, ...(field ? { field } : {}) })
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
