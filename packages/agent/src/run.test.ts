import { defaultModeSettings, type DesignNode, findNode, frameGeometry, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { execute } from "./run.ts"
import type {
  AccessibilityFinding,
  AgentChangeSet,
  AgentEvent,
  AgentHooks,
  AgentSnapshot,
  FrameRequest,
  IconNames,
  IconSet
} from "./types.ts"

function snapshot(): AgentSnapshot {
  return {
    tab: `tab-${Math.random()}`,
    components: ["Button", "Card"],
    tokens: [
      { name: "background", category: "color", source: "semantic", values: { default: "white", dark: "black" } },
      { name: "primary", category: "color", source: "semantic", values: { default: "blue" } },
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
                  {
                    type: "component",
                    id: "submit",
                    name: "Submit",
                    component: "Button",
                    props: { children: "Sign up" }
                  }
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
        path: "src/components/ui/button.tsx",
        props: [
          { name: "variant", kind: "enum", group: "variant", options: ["default", "outline"], default: "default" },
          { name: "children", kind: "node", group: "own" },
          { name: "disabled", kind: "boolean", group: "html" }
        ]
      }
    },
    selection: {},
    bounds: { "app.par#signup": { x: 0, y: 0, width: 1400, height: 900 } }
  }
}

function hooks(events: AgentEvent[] = []): AgentHooks {
  return {
    presence: (batch) => events.push(...batch),
    render: async ({ mode, capture, audit }) => ({
      width: mode.width,
      height: 600,
      nodes: [{ id: "title", x: 0, y: 0, width: mode.width + 10, height: 40 }],
      overflowsX: mode.width < 500,
      unknownComponents: [],
      ...(capture ? { png: "iVBOR" } : {}),
      ...(audit
        ? {
            issues: [
              {
                rule: "color-contrast",
                impact: "serious" as const,
                help: "Elements must meet minimum color contrast ratio thresholds",
                helpUrl: "https://dequeuniversity.com/rules/axe/4.14/color-contrast",
                nodes: [
                  {
                    id: "title",
                    detail: "#999999 on #ffffff is 2.84:1, and 24px text needs 4.5:1.",
                    contrast: {
                      foreground: "#999999",
                      background: "#ffffff",
                      ratio: 2.84,
                      required: 4.5,
                      fontSize: 24,
                      bold: false
                    }
                  },
                  { id: "frame-root", detail: "Outside any node" },
                  { id: "submit/label", detail: "Inside an instance" },
                  { id: "submit/icon", detail: "Inside the same instance" },
                  { id: "", detail: "Also outside any node" }
                ]
              }
            ]
          }
        : {})
    })
  }
}

describe("execute", () => {
  it("applies every change as one result and shows the work", async () => {
    const events: AgentEvent[] = []
    const result = await execute(
      {
        label: "Add a hint",
        code: `hint = Insert("page", {type: "text", name: "Hint", text: "Free forever"}, {index: 1})
Update("submit", {props: {variant: "outline"}})
AddState("signup", {name: "Loading", changes: {Submit: {props: {disabled: true}}}})
Print(Get("page", {depth: 1}).children.length)`
      },
      snapshot(),
      hooks(events)
    )
    expect(result.ok).toBe(true)
    expect(result.output).toEqual(["3"])
    expect(result.created.Hint).toMatch(/^[a-zA-Z0-9]{5}$/)
    const container = result.changes.designs[0]!.after!
    expect(findNode(container.root, "submit")).toMatchObject({ props: { children: "Sign up", variant: "outline" } })
    expect(container.states[1]).toEqual({
      id: "loading",
      name: "Loading",
      overrides: { submit: { props: { disabled: true } } }
    })
    expect(events[0]).toMatchObject({ kind: "start", label: "Add a hint" })
    expect(events.some((event) => event.kind === "write" && event.node === "submit")).toBe(true)
    expect(events.at(-1)).toMatchObject({ kind: "end" })
  })

  it("gives GetModes a copy, so editing it in place and setting it leaves the call's starting point as read", async () => {
    const read = snapshot()
    const before = structuredClone(read.modes)
    const option = await execute(
      {
        label: "Rename an option",
        code: `const s = GetModes().settings\ns.variables[0].options[0] = {...s.variables[0].options[0], name: "Wide"}\nSetModes(s)`
      },
      read,
      hooks()
    )
    expect(option.error).toBeUndefined()
    expect(read.modes).toEqual(before)
    expect(option.changes.modes?.base).toEqual(before)
    expect(option.changes.modes?.after.variables[0]!.options[0]!.name).toBe("Wide")

    const renamed = await execute(
      { label: "Rename a mode", code: `const s = GetModes().settings\ns.modes[0].name = "X"\nSetModes(s)` },
      read,
      hooks()
    )
    expect(renamed.error).toBeUndefined()
    expect(read.modes).toEqual(before)
    expect(renamed.changes.modes?.after.modes[0]!.name).toBe("X")
  })

  it("reads the modes and what each design shows with GetModes, changing nothing", async () => {
    const read = snapshot()
    read.documents[0]!.document.containers[0]!.view = { modes: ["mobile-light"] }
    const before = structuredClone(read)
    const events: AgentEvent[] = []
    const result = await execute(
      {
        label: "Read modes",
        code: `const all = GetModes()
const one = GetModes("Sign up")
Print(JSON.stringify({ viewports: all.viewports.map((v) => v.id), modes: all.modes.map((m) => m.id), designs: all.designs, one: one.designs }))`
      },
      read,
      hooks(events)
    )
    expect(result.ok).toBe(true)
    expect(JSON.parse(result.output[0]!)).toEqual({
      viewports: ["desktop", "tablet", "mobile"],
      modes: ["desktop-light", "desktop-dark", "tablet-light", "mobile-light"],
      designs: [
        {
          id: "signup",
          name: "Sign up",
          state: "default",
          states: ["default"],
          main: "desktop-light",
          beside: ["mobile-light"]
        }
      ],
      one: [
        {
          id: "signup",
          name: "Sign up",
          state: "default",
          states: ["default"],
          main: "desktop-light",
          beside: ["mobile-light"],
          frames: [
            { mode: "desktop-light", width: 1280, window: { width: 1280, height: 800 } },
            { mode: "mobile-light", width: 390, window: { width: 390, height: 844 } }
          ]
        }
      ]
    })
    expect(result.changes).toEqual({ designs: [], tokens: [] })
    expect(events.some((event) => event.kind === "write")).toBe(false)
    expect(read).toEqual(before)
  })

  it("names the designs GetModes knows when asked for one it doesn't", async () => {
    const result = await execute({ label: "Read modes", code: `GetModes("sign")` }, snapshot(), hooks())
    expect(result.details).toEqual({
      code: "unknown_design",
      retryable: false,
      field: "design",
      alternatives: ["signup"]
    })
  })

  it("changes nothing when the snippet fails, and retries with edits", async () => {
    const shared = snapshot()
    const failed = await execute(
      { label: "Broken", code: `Update("submit", {props: {variant: "ghost"}})\nUpdate("missing", {text: "x"})` },
      shared,
      hooks()
    )
    expect(failed.ok).toBe(false)
    expect(failed.error).toContain(`No node "missing"`)
    expect(failed.error).toContain("line 2")
    expect(failed.changes.designs).toEqual([])

    const retried = await execute(
      { label: "Fixed", editId: failed.editId, edits: [{ find: "missing", replace: "title" }] },
      shared,
      hooks()
    )
    expect(retried.ok).toBe(true)
    expect(findNode(retried.changes.designs[0]!.after!.root, "title")).toMatchObject({ text: "x" })
  })

  it("keeps globals between calls in the same tab", async () => {
    const shared = snapshot()
    await execute({ label: "One", code: "saved = 41" }, shared, hooks())
    const result = await execute({ label: "Two", code: "Print(saved + 1)" }, shared, hooks())
    expect(result.output).toEqual(["42"])
  })

  it("creates designs in the project file, placed in empty space", async () => {
    const result = await execute(
      {
        label: "New screen",
        code: `id = CreateDesign({name: "Pricing", root: {type: "layout", name: "Page", style: {background: "background"}, children: [{type: "text", text: "Plans", style: {size: "text-2xl"}}]}})
Print(id, FindEmptySpace({width: 100, height: 100}).x > 1400)`
      },
      snapshot(),
      hooks()
    )
    expect(result.ok).toBe(true)
    expect(result.output).toEqual(["pricing true"])
    expect(result.changes.designs).toHaveLength(1)
    expect(result.changes.designs[0]).toMatchObject({
      path: "app.par",
      id: "pricing",
      base: null,
      after: { id: "pricing", kind: "screen", position: { x: 1640, y: 0 } }
    })
  })

  it("gives each design it changed, created or deleted with the design as it read it, and no others", async () => {
    const base = snapshot()
    const signup = base.documents[0]!.document.containers[0]!
    const other = { ...signup, id: "about", name: "About", position: { x: 2000, y: 0 } }
    const read = {
      ...base,
      documents: [{ path: "app.par", document: { version: 3 as const, containers: [signup, other] } }]
    }
    const result = await execute(
      {
        label: "Rework",
        code: `UpdateDesign("Sign up", {name: "Register"})\nDeleteDesign("About")\nCreateDesign({name: "Pricing", root: {type: "layout", children: []}})\nUpdateDesign("Pricing", {name: "Plans"})`
      },
      read,
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.changes.designs.map(({ id, base, after }) => [id, base?.name ?? null, after?.name ?? null])).toEqual([
      ["signup", "Sign up", "Register"],
      ["pricing", null, "Plans"],
      ["about", "About", null]
    ])
    expect(result.changes.modes).toBeUndefined()
  })

  it("applies through the editor, and fails naming the designs the editor refused, keeping the snippet to retry", async () => {
    const shared = snapshot()
    const applied: AgentChangeSet[] = []
    const refuse: AgentHooks = {
      ...hooks(),
      apply: async () => [{ path: "app.par", id: "signup", name: "Sign up", reason: "changed" }]
    }
    const failed = await execute(
      { label: "Rename", code: `UpdateDesign("Sign up", {name: "Register"})` },
      shared,
      refuse
    )
    expect(failed.ok).toBe(false)
    expect(failed.error).toBe(
      'Not applied: since this call read the tab, "Sign up" (app.par) was changed in the editor, and this call ' +
        "changes it too. Run the call again to work from what's there now."
    )
    expect(failed.details).toEqual({ code: "conflict", retryable: true })
    expect(failed.changes.designs).toEqual([])
    const accept: AgentHooks = { ...hooks(), apply: async (changes) => (applied.push(changes), []) }
    const retried = await execute({ label: "Rename", editId: failed.editId }, shared, accept)
    expect(retried.ok).toBe(true)
    expect(applied.map((changes) => changes.designs.map((change) => change.after?.name))).toEqual([["Register"]])
    // A call that changes nothing has nothing to apply.
    await execute({ label: "Read", code: `Print(Designs().length)` }, shared, accept)
    expect(applied).toHaveLength(1)
  })

  it("shows a move as a drag, and warns when a moved board lands on another", async () => {
    const events: AgentEvent[] = []
    const result = await execute(
      {
        label: "Tidy up",
        code: `CreateDesign({name: "Pricing", x: 2000, y: 0})
UpdateDesign("pricing", {x: 600, y: 300})
Print(JSON.stringify(Overlaps("signup")))`
      },
      snapshot(),
      hooks(events)
    )
    expect(result.ok).toBe(true)
    expect(events.filter((event) => event.design === "app.par#pricing").map((event) => event.kind)).toEqual([
      "write",
      "move"
    ])
    expect(events.find((event) => event.kind === "move")).toMatchObject({
      from: { x: 2000, y: 0 },
      to: { x: 600, y: 300 }
    })
    expect(JSON.parse(result.output[0]!)).toEqual([
      { designs: ["signup", "pricing"], names: ["Sign up", "Pricing"], width: 800, height: 760, estimated: true }
    ])
    expect(result.warnings).toContainEqual(expect.stringContaining("Sign up (signup) overlaps Pricing (pricing)"))
  })

  it("counts a board's title as part of it", async () => {
    const result = await execute(
      {
        label: "Stack",
        code: `CreateDesign({name: "Below", x: 0, y: 1000})
Print(JSON.stringify(Overlaps("below")))`
      },
      snapshot(),
      hooks()
    )
    expect(JSON.parse(result.output[0]!)).toMatchObject([{ designs: ["signup", "below"], titleOnly: true }])
    expect(result.warnings).toContainEqual(expect.stringContaining("is too close to"))
  })

  it("doesn't warn about overlaps the call didn't touch", async () => {
    const base = snapshot()
    const document = base.documents[0]!.document
    document.containers.push({ ...document.containers[0]!, id: "copy", name: "Copy", position: { x: 100, y: 100 } })
    const result = await execute({ label: "Look", code: `Print(Overlaps().length)` }, base, hooks())
    expect(result.output).toEqual(["1"])
    expect(result.warnings.filter((warning) => warning.includes("overlaps"))).toEqual([])
  })

  it("estimates a board the canvas hasn't drawn from its frames' sizes", async () => {
    const base = snapshot()
    base.bounds = {}
    const signup = base.documents[0]!.document.containers[0]!
    signup.frames = { desktop: { width: 3000 } }
    const result = await execute(
      {
        label: "Wide",
        code: `CreateDesign({name: "Pricing", x: 1800, y: 0})
Print(JSON.stringify(Overlaps()))`
      },
      base,
      hooks()
    )
    // The 3000 frame and the board's 33 padding reach to 3066, past the new design's left edge at 1800.
    expect(JSON.parse(result.output[0]!)).toMatchObject([
      { designs: ["signup", "pricing"], width: 3066 - 1800, estimated: true }
    ])
  })

  it("estimates an undrawn board's height from a fixed-height frame, and its companions as the canvas shrinks them", async () => {
    const base = snapshot()
    base.bounds = {}
    const signup = base.documents[0]!.document.containers[0]!
    signup.frames = { desktop: { width: 1280, height: 3000 } }
    signup.view = { modes: ["desktop-dark"] }
    const result = await execute(
      {
        label: "Tall",
        code: `CreateDesign({name: "Below", x: 0, y: 3200})
CreateDesign({name: "Beside", x: 2000, y: 0})
Print(JSON.stringify(Overlaps()))`
      },
      base,
      hooks()
    )
    // 3000 tall, under a 36 caption, inside 33 of padding: 3102 reaches past 3200 less a 160 title band. The dark
    // companion is drawn at half size, so the board is 1280 + 640 + 32 + 65 + 66 = 2083 wide, past 2000.
    expect(JSON.parse(result.output[0]!)).toMatchObject([
      { designs: ["signup", "below"], titleOnly: true, estimated: true },
      { designs: ["signup", "beside"], width: 83, estimated: true }
    ])
  })

  it("prefers the size a board was drawn at to an estimate", async () => {
    const base = snapshot()
    base.documents[0]!.document.containers[0]!.frames = { desktop: { width: 3000 } }
    const result = await execute(
      {
        label: "Drawn",
        code: `CreateDesign({name: "Pricing", x: 1800, y: 0})
Print(JSON.stringify(Overlaps()))`
      },
      base,
      hooks()
    )
    // Drawn 1400 wide, the board ends before 1800, whatever its frames would suggest.
    expect(JSON.parse(result.output[0]!)).toEqual([])
  })

  it("warns about unknown components and values that aren't tokens", async () => {
    const result = await execute(
      {
        label: "Off system",
        code: `Insert("page", {type: "component", component: "Carousel"})\nUpdate("page", {style: {background: "hotpink"}})`
      },
      snapshot(),
      hooks()
    )
    expect(result.warnings.join("\n")).toContain(`"Carousel" isn't one of the project's components`)
    expect(result.warnings.join("\n")).toContain(`background "hotpink" isn't a token`)
  })

  it("lists radius-full with the radius tokens and takes it without a warning (PAR-458)", async () => {
    const result = await execute(
      {
        label: "Pill",
        code: [
          `Print(JSON.stringify(GetTokens({ category: "radius" })))`,
          `Update("submit", {style: {radius: "radius-full"}})`,
          `Update("title", {style: {background: "radius-full"}})`
        ].join("\n")
      },
      snapshot(),
      hooks()
    )
    expect(JSON.parse(result.output[0]!)).toEqual([
      { name: "radius-full", category: "radius", source: "keyword", values: { default: "calc(infinity * 1px)" } }
    ])
    expect(result.warnings.join("\n")).not.toContain(`radius "radius-full"`)
    // A keyword is a radius only: as a color it's still not a token.
    expect(result.warnings.join("\n")).toContain(`background "radius-full" isn't a token`)
  })

  it("lists a project's own --radius-full as its token, not the keyword", async () => {
    const own = snapshot()
    own.tokens.push({ name: "radius-full", category: "radius", source: "semantic", values: { default: "9999px" } })
    const code = `Print(JSON.stringify(GetTokens({ search: "radius-full" })))`
    const result = await execute({ label: "Read", code }, own, hooks())
    expect(JSON.parse(result.output[0]!)).toEqual([
      { name: "radius-full", category: "radius", source: "semantic", values: { default: "9999px" } }
    ])
  })

  it("rejects nodes that don't fit the format", async () => {
    const result = await execute(
      { label: "Bad", code: `Insert("page", {type: "text", text: "x", fontSize: 12})` },
      snapshot(),
      hooks()
    )
    expect(result.ok).toBe(false)
    expect(result.error).toContain("unknown properties fontSize")
  })

  it("measures, finds problems and screenshots any state in any mode", async () => {
    const events: AgentEvent[] = []
    const result = await execute(
      {
        label: "Check",
        code: `const m = await Measure("signup", {mode: "mobile-light"})
Print(m.width, m.nodes[0].name)
Print((await Problems("signup", {mode: "all"})).length)
Print(await Screenshot("signup", {mode: ["desktop-light", "tablet-light"]}))`
      },
      snapshot(),
      hooks(events)
    )
    expect(result.ok).toBe(true)
    expect(result.output[0]).toBe("390 Title")
    // Every mode's title is wider than its viewport; that accounts for the mobile frame's overflow.
    expect(result.output[1]).toBe("4")
    expect(result.output[2]).toBe("2")
    expect(result.screenshots.map((shot) => shot.mode)).toEqual(["desktop-light", "tablet-light"])
    // Each look shows as what it is, so the agent's cursor can say so.
    const looks = new Set(events.filter((event) => event.design).map((event) => event.kind))
    expect(looks).toEqual(new Set(["measure", "problems", "screenshot"]))
  })

  it("says which node overflows what, and by how much, in each mode", async () => {
    const result = await execute(
      {
        label: "Check",
        code: `const m = await Measure("signup", {mode: "mobile-light"})
Print(m.state, m.mode, m.nodes.find((node) => node.id === "submit").parent)
Print(JSON.stringify(await Problems("signup", {mode: "all"})))`
      },
      snapshot(),
      {
        ...hooks(),
        render: async ({ mode }) => ({
          width: mode.width,
          height: 600,
          overflowsX: mode.width < 400,
          unknownComponents: [],
          nodes: [
            { id: "page", x: 0, y: 0, width: mode.width, height: 600 },
            // Narrower than any viewport, but placed so its right edge passes the phone's.
            { id: "submit", parent: "page", x: 340, y: 100, width: 60, height: 36 },
            {
              id: "title",
              parent: "page",
              x: 0,
              y: 0,
              width: 200,
              height: 40,
              clipped: true,
              clip: { node: "page", x: 0, y: 10, width: mode.width, height: 590 }
            }
          ]
        })
      }
    )
    expect(result.ok).toBe(true)
    expect(result.output[0]).toBe("default mobile-light page")
    const problems = JSON.parse(result.output[1]!) as { kind: string; mode: string }[]
    expect(problems.filter((problem) => problem.kind === "frame-overflow")).toEqual([
      {
        state: "default",
        mode: "mobile-light",
        kind: "frame-overflow",
        problem: "at x 340, y 100 and 60 × 36px, it sticks out of the 390px frame by 10px on the right",
        node: "submit",
        name: "Submit",
        box: { x: 340, y: 100, width: 60, height: 36 },
        container: { box: { x: 0, y: 0, width: 390, height: 600 } },
        overflow: { right: 10 }
      }
    ])
    // The phone's overflow is the button's, so it isn't reported again as the frame's.
    expect(problems.some((problem) => problem.kind === "content-wider")).toBe(false)
    const clipped = problems.filter((problem) => problem.kind === "clipped")
    expect(clipped.length).toBe(new Set(problems.map((problem) => problem.mode)).size)
    expect(clipped[0]).toMatchObject({
      node: "title",
      name: "Title",
      container: { node: "page", name: "Page" },
      overflow: { top: 10 },
      problem: "10px at the top cut off by Page (page), which clips its overflow"
    })
  })

  it("draws each frame in the window the canvas gives it", async () => {
    const shared = snapshot()
    shared.modes = {
      version: 1,
      variables: [
        {
          id: "viewport",
          name: "Viewport",
          kind: "viewport",
          options: [{ id: "desktop", name: "Desktop", width: 1280, height: 1234 }]
        }
      ],
      modes: [{ id: "desktop", name: "Desktop", values: { viewport: "desktop" } }]
    }
    const requests: FrameRequest[] = []
    const base = hooks()
    const result = await execute(
      { label: "Check", code: `await Measure("signup")\nawait Screenshot("signup")\nawait Accessibility("signup")` },
      shared,
      {
        presence: () => undefined,
        render: (request) => {
          requests.push(request)
          return base.render(request)
        }
      }
    )
    expect(result.ok).toBe(true)
    // The frame grows with its content, and its window is the mode's 1234px screen, as on the canvas.
    const [mode] = resolveModes(shared.modes)
    const live = frameGeometry(shared.documents[0]!.document.containers[0]!, mode!)
    expect(live).toEqual({ width: 1280, viewport: { width: 1280, height: 1234 } })
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(request.height).toBeUndefined()
      expect(request.viewport).toEqual(live.viewport)
    }
  })

  it("checks accessibility in each mode, naming the layers", async () => {
    const events: AgentEvent[] = []
    const result = await execute(
      {
        label: "Check",
        code: `Print(JSON.stringify(await Accessibility("signup", {mode: ["desktop-light", "mobile-light"]})))`
      },
      snapshot(),
      hooks(events)
    )
    expect(result.ok).toBe(true)
    expect(events.filter((event) => event.design).map((event) => event.kind)).toEqual([
      "accessibility",
      "accessibility"
    ])
    const findings = JSON.parse(result.output[0]!) as Record<string, unknown>[]
    // Per mode: the title, the frame once, and the instance once for everything inside it.
    expect(findings).toHaveLength(6)
    expect(findings[2]).toMatchObject({ node: "submit", name: "Submit", detail: "Inside an instance" })
    expect(findings[0]).toMatchObject({
      state: "default",
      mode: "desktop-light",
      rule: "color-contrast",
      impact: "serious",
      node: "title",
      name: "Title",
      contrast: { foreground: "#999999", background: "#ffffff", ratio: 2.84, required: 4.5 }
    })
    // An element that isn't one of the design's nodes is reported on the frame.
    expect(findings[1]).not.toHaveProperty("node")
    expect(findings[1]).toMatchObject({ detail: "Outside any node" })
  })

  it("gives contrast failures the token that passes in every frame", async () => {
    const project = snapshot()
    project.tokens.push(
      { name: "muted", category: "color", source: "semantic", values: { default: "#999999" } },
      { name: "neutral-500", category: "color", source: "theme", values: { default: "#767676" } }
    )
    const requested: (string[] | undefined)[] = []
    const base = hooks()
    // The title fails on white in light, and passes on black in mobile, where primary would fail.
    const render: AgentHooks["render"] = async (request) => {
      requested.push(request.colorTokens)
      const frame = await base.render(request)
      const mobile = request.mode.id === "mobile-light"
      return {
        ...frame,
        contrast: {
          tokens: {
            background: mobile ? "#000000" : "#ffffff",
            primary: "#1d4ed8",
            muted: "#999999",
            "neutral-500": "#767676"
          },
          texts: [
            mobile
              ? { id: "title", foreground: "#999999", background: "#000000", ratio: 7.37, required: 4.5, follows: true }
              : { id: "title", foreground: "#999999", background: "#ffffff", ratio: 2.84, required: 4.5, follows: true }
          ]
        }
      }
    }
    const result = await execute(
      {
        label: "Check",
        code: `Print(JSON.stringify(await Accessibility("signup", {mode: ["desktop-light", "mobile-light"]})))`
      },
      project,
      { presence: () => undefined, render }
    )
    expect(result.ok).toBe(true)
    // Only color tokens are read, in every frame.
    expect(requested).toEqual([
      ["background", "primary", "muted", "neutral-500"],
      ["background", "primary", "muted", "neutral-500"]
    ])
    const findings = JSON.parse(result.output[0]!) as AccessibilityFinding[]
    const title = findings.find((finding) => finding.node === "title" && finding.mode === "desktop-light")
    // primary would pass on white, but not on black, where the title passes now. Only neutral-500 passes on both, so it's
    // suggested though it isn't semantic, at its lower ratio of the two.
    expect(title?.contrast?.fix).toEqual({ token: "neutral-500", color: "#767676", ratio: 4.54 })
  })

  it("gives no contrast fix when coloring the layer wouldn't reach its text", async () => {
    const base = hooks()
    const render: AgentHooks["render"] = async (request) => ({
      ...(await base.render(request)),
      contrast: {
        tokens: { primary: "#000000" },
        texts: [
          { id: "title", foreground: "#999999", background: "#ffffff", ratio: 2.84, required: 4.5, follows: false }
        ]
      }
    })
    const result = await execute(
      { label: "Check", code: `Print(JSON.stringify(await Accessibility("signup")))` },
      snapshot(),
      { presence: () => undefined, render }
    )
    const findings = JSON.parse(result.output[0]!) as AccessibilityFinding[]
    expect(findings[0]?.contrast).not.toHaveProperty("fix")
  })

  it("names an instance after its design", async () => {
    const project = snapshot()
    const [signup] = project.documents[0]!.document.containers
    project.documents[0]!.document.containers = [
      {
        ...signup!,
        root: {
          ...signup!.root,
          children: [{ type: "instance", id: "submit", design: "member-row" }]
        } as typeof signup.root
      },
      {
        id: "member-row",
        name: "Member row",
        kind: "component",
        position: { x: 0, y: 1000 },
        root: { type: "layout", id: "row", children: [] },
        states: [{ id: "default", name: "Default" }]
      }
    ]
    const result = await execute(
      { label: "Check", code: `Print(JSON.stringify(await Accessibility("signup")))` },
      project,
      hooks()
    )
    expect(result.ok).toBe(true)
    const findings = JSON.parse(result.output[0]!) as Record<string, unknown>[]
    expect(findings.find((finding) => finding.node === "submit")).toMatchObject({ name: "Member row" })
  })
})

describe("render inputs", () => {
  /** Hooks that keep each frame asked for. */
  function recording(requests: FrameRequest[]): AgentHooks {
    const base = hooks()
    return {
      ...base,
      render: (request) => {
        requests.push(request)
        return base.render(request)
      }
    }
  }

  it("draws an instance of a library's component design, as the canvas does", async () => {
    const project = snapshot()
    const [signup] = project.documents[0]!.document.containers
    project.documents[0]!.document.containers = [
      {
        ...signup!,
        root: {
          ...signup!.root,
          children: [{ type: "instance", id: "row", design: "kit/label" }]
        } as typeof signup.root
      }
    ]
    project.libraryDesigns = [
      {
        id: "kit/label",
        name: "Label",
        kind: "component",
        position: { x: 0, y: 0 },
        root: { type: "text", id: "text", text: "From the kit" },
        states: [{ id: "default", name: "Default" }]
      }
    ]
    const requests: FrameRequest[] = []
    const result = await execute(
      { label: "Look", code: `await Measure("signup"); await Problems("signup"); await Screenshot("signup")` },
      project,
      recording(requests)
    )
    expect(result.ok).toBe(true)
    expect(requests.length).toBeGreaterThan(2)
    for (const request of requests) {
      expect(JSON.stringify(request.tree)).toContain("From the kit")
      expect(JSON.stringify(request.tree)).not.toContain("No component design")
    }
  })

  it("doesn't warn about an instance of a library's design it places", async () => {
    const project = snapshot()
    project.libraryDesigns = [
      {
        id: "kit/label",
        name: "Label",
        kind: "component",
        position: { x: 0, y: 0 },
        root: { type: "text", id: "text", text: "From the kit" },
        states: [{ id: "default", name: "Default" }]
      }
    ]
    const result = await execute(
      {
        label: "Place",
        code: `Insert("page", {type: "instance", design: "kit/label"})
Insert("page", {type: "instance", design: "kit/missing"})`
      },
      project,
      hooks()
    )
    expect(result.ok).toBe(true)
    const missing = result.warnings.filter((warning) => warning.includes("no component design"))
    expect(missing).toEqual([expect.stringContaining('"kit/missing"')])
  })

  it("lets a project design win over a library design with its id", async () => {
    const project = snapshot()
    const [signup] = project.documents[0]!.document.containers
    project.documents[0]!.document.containers = [
      {
        ...signup!,
        root: {
          ...signup!.root,
          children: [{ type: "instance", id: "row", design: "kit/label" }]
        } as typeof signup.root
      },
      {
        id: "kit/label",
        name: "Label",
        kind: "component",
        position: { x: 0, y: 1000 },
        root: { type: "text", id: "text", text: "The project's own" },
        states: [{ id: "default", name: "Default" }]
      }
    ]
    project.libraryDesigns = [
      { ...project.documents[0]!.document.containers[1]!, root: { type: "text", id: "text", text: "From the kit" } }
    ]
    const requests: FrameRequest[] = []
    await execute({ label: "Look", code: `await Measure("signup")` }, project, recording(requests))
    expect(JSON.stringify(requests[0]!.tree)).toContain("The project's own")
  })

  it("draws with the canvas's unsaved token values and the call's own SetTokens, the latest winning", async () => {
    const project = {
      ...snapshot(),
      tokenOverrides: [
        { name: "primary", theme: "default", value: "red" },
        { name: "background", theme: "dark", value: "navy" }
      ]
    }
    const requests: FrameRequest[] = []
    const result = await execute(
      {
        label: "Tokens",
        code: `await Measure("signup")
SetTokens({ primary: "green", "--radius": { dark: "1rem" } })
await Measure("signup")`
      },
      project,
      recording(requests)
    )
    expect(result.ok).toBe(true)
    expect(requests[0]!.tokens).toEqual(project.tokenOverrides)
    expect(requests[1]!.tokens).toEqual([
      { name: "primary", theme: "default", value: "green" },
      { name: "background", theme: "dark", value: "navy" },
      { name: "radius", theme: "dark", value: "1rem" }
    ])
  })

  it("sends no token values when nothing differs from the compiled CSS", async () => {
    const requests: FrameRequest[] = []
    await execute({ label: "Look", code: `await Measure("signup")` }, snapshot(), recording(requests))
    expect(requests[0]!.tokens).toEqual([])
  })
})

describe("icons", () => {
  it("knows an icon library's icons are components, and still warns about unknown ones", async () => {
    const result = await execute(
      {
        label: "Icons",
        code: `Insert("page", {type: "component", component: "lucide/Heart"})
Insert("page", {type: "component", component: "Heart"})`
      },
      { ...snapshot(), iconSets: [lucide] },
      hooks()
    )
    expect(result.ok).toBe(true)
    const unknown = result.warnings.filter((warning) => warning.includes("isn't one of the project's components"))
    expect(unknown).toEqual([expect.stringContaining('"Heart"')])
  })

  const lucide: IconSet = { id: "lucide", name: "Lucide", package: "lucide-react", version: "0.500.0" }
  const heroicons: IconSet = {
    id: "heroicons",
    name: "Heroicons",
    package: "@heroicons/react",
    icons: {
      render: "export",
      import: "@heroicons/react/24/outline",
      count: 2,
      variants: {
        styles: ["outline", "solid"],
        modules: { outline: "@heroicons/react/24/outline", solid: "@heroicons/react/24/solid" },
        default: { style: "outline" }
      }
    }
  }
  const names: Record<string, IconNames> = {
    lucide: {
      names: ["Heart", "HeartCrack", "Settings", "Bell", "Star"],
      aliases: { Settings: ["Cog"] },
      tags: { Heart: ["love"] }
    },
    "heroicons/": { names: ["BellIcon", "CogIcon"] },
    "heroicons/24/solid": { names: ["CogIcon"] }
  }
  const withIcons = (): AgentHooks => ({
    ...hooks(),
    iconNames: async (set, module) => names[set === "lucide" ? set : `${set}/${module ?? ""}`]!
  })

  it("lists the project's icon sets with their styles and how designs name their icons", async () => {
    const result = await execute(
      { label: "Icon sets", code: "Print(Icons())" },
      { ...snapshot(), iconSets: [lucide, heroicons] },
      withIcons()
    )
    expect(JSON.parse(result.output[0]!)).toEqual([
      {
        id: "lucide",
        name: "Lucide",
        package: "lucide-react",
        version: "0.500.0",
        styles: [],
        component: "lucide/<Icon>"
      },
      {
        id: "heroicons",
        name: "Heroicons",
        package: "@heroicons/react",
        count: 2,
        styles: ["outline", "solid"],
        style: "outline",
        component: "heroicons/<Icon>"
      }
    ])
  })

  it("finds a set's icons by name, alias and tag, in the style asked for, ready to insert", async () => {
    const result = await execute(
      {
        label: "Find icons",
        code: `const [heart] = await Icons("lucide", { search: "love" })
Insert("page", { type: "component", component: heart.component })
Print(await Icons("lucide", { search: "cog" }), await Icons("lucide", { limit: 2 }))
Print(await Icons("heroicons", { style: "solid" }))`
      },
      { ...snapshot(), iconSets: [lucide, heroicons] },
      withIcons()
    )
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
    expect(result.output).toEqual([
      `${JSON.stringify([{ label: "Settings", component: "lucide/Settings" }])} ${JSON.stringify([
        { label: "Heart", component: "lucide/Heart" },
        { label: "HeartCrack", component: "lucide/HeartCrack" }
      ])}`,
      JSON.stringify([{ label: "CogIcon", component: "heroicons/24/solid/CogIcon" }])
    ])
    const inserted = result.changes.designs[0]!.after!.root
    expect(inserted.type === "layout" && inserted.children.at(-1)).toMatchObject({ component: "lucide/Heart" })
  })

  it("runs the skill's example", async () => {
    const base = snapshot()
    const signup = base.documents[0]!.document.containers[0]!
    const dashboard = {
      ...signup,
      id: "dashboard",
      name: "Dashboard",
      root: { type: "layout" as const, id: "toolbar", name: "Toolbar", children: [] }
    }
    const result = await execute(
      {
        label: "Settings button",
        code: `const [icon] = await Icons(Icons()[0].id, { search: "settings", limit: 1 })
Insert("dashboard/Toolbar", {
  type: "component",
  component: "Button",
  props: { variant: "ghost", "aria-label": "Settings" },
  slots: { children: [{ type: "component", component: icon.component, props: icon.props }] }
})`
      },
      {
        ...base,
        iconSets: [lucide],
        documents: [{ path: "app.par", document: { version: 3, containers: [signup, dashboard] } }]
      },
      withIcons()
    )
    expect(result.error).toBeUndefined()
    const toolbar = result.changes.designs[0]!.after!.root
    expect(toolbar.type === "layout" && toolbar.children[0]).toMatchObject({
      component: "Button",
      slots: { children: [{ component: "lucide/Settings" }] }
    })
  })

  it("says which sets and styles there are when asked for one the project doesn't have", async () => {
    const missing = await execute(
      { label: "Icons", code: `await Icons("phosphor")` },
      { ...snapshot(), iconSets: [lucide] },
      withIcons()
    )
    expect(missing.error).toContain(`"phosphor" isn't one of the project's icon sets: lucide`)
    const style = await execute(
      { label: "Icons", code: `await Icons("heroicons", { style: "mini" })` },
      { ...snapshot(), iconSets: [heroicons] },
      withIcons()
    )
    expect(style.error).toContain(`Heroicons comes in outline, solid, not "mini"`)
  })
})

describe("warning groups", () => {
  it("reports each finding once with its places, render failures first and naming tips last", async () => {
    const base = snapshot()
    const page = base.documents[0]!.document.containers[0]!.root
    if (page.type !== "layout") throw new Error("Expected a layout")
    // An unnamed layout that was there before the call isn't this call's to name.
    page.children.push({
      type: "layout",
      id: "old",
      children: [
        { type: "text", id: "old-a", text: "A" },
        { type: "text", id: "old-b", text: "B" }
      ]
    })
    const failing: AgentHooks = {
      ...hooks(),
      render: async (request) => ({ ...(await hooks().render(request)), error: "boom" })
    }
    const result = await execute(
      {
        label: "Rows",
        code: `for (let i = 0; i < 8; i++) {
  Insert("page", { type: "layout", children: [{ type: "text", text: "Name" }, { type: "text", text: "Role" }] })
}
Insert("page", { type: "component", component: "Button", props: { tone: "loud" } })
Insert("page", { type: "component", component: "Button", props: { tone: "loud" } })
Update("submit", { style: { background: "hotpink" } })
await Screenshot("signup")`
      },
      base,
      failing
    )
    expect(result.error).toBeUndefined()
    expect(result.warningGroups.map(({ severity, category, count }) => [severity, category, count])).toEqual([
      ["error", "render_failed", 1],
      ["warning", "not_a_token", 1],
      ["warning", "unknown_prop", 2],
      ["suggestion", "unnamed_layout", 8]
    ])
    const [failed, token, prop, unnamed] = result.warningGroups
    expect(failed).toMatchObject({ message: "failed to render: boom", at: ["Sign up (Default, Desktop Light)"] })
    expect(prop!.at).toHaveLength(2)
    expect(token).toMatchObject({ at: ["signup/submit"] })
    expect(unnamed!.at).toHaveLength(8)
    expect(unnamed!.at).not.toContain("signup/old")
    expect(result.warnings).toHaveLength(4)
    expect(result.warnings[3]).toMatch(/^8 places \(signup\/\w+, .* and 3 more\): name layouts that group things/)
  })
})

describe("component props", () => {
  it("lists a component's props and warns about values it doesn't take", async () => {
    const result = await execute(
      {
        label: "Props",
        code: `Print(Props("Button").props.map((prop) => prop.name).join(" "))
Update("submit", {props: {variant: "primary", tone: "loud"}})`
      },
      snapshot(),
      hooks()
    )
    expect(result.output).toEqual(["variant children"])
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Button variant is one of "default", "outline", not "primary"'),
        expect.stringContaining('Button has no prop "tone"')
      ])
    )
  })

  it("tells an agent the provider a sidebar needs, with an example it inserts as it is", async () => {
    const nova = { path: "@buildkit/nova", library: "nova" }
    const result = await execute(
      {
        label: "Sidebar",
        code: `const { composition } = Props("nova/Sidebar")
Print(composition.parents.chain.map((parent) => parent.component).join(" "))
Insert("page", composition.example.node)`
      },
      {
        ...snapshot(),
        components: ["Button", "Card", "nova/Sidebar", "nova/SidebarProvider"],
        sources: {
          "nova/SidebarProvider": { ...nova, export: "SidebarProvider", visual: false },
          "nova/Sidebar": { ...nova, export: "Sidebar", parents: ["nova/SidebarProvider"], parentsFrom: "example" }
        },
        renderStatus: { "nova/Sidebar": { drawn: true } }
      },
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.output).toEqual(["nova/SidebarProvider"])
    const page = result.changes.designs[0]?.after?.root
    expect(page?.type === "layout" && page.children.at(-1)).toMatchObject({
      component: "nova/SidebarProvider",
      slots: { children: [{ component: "nova/Sidebar" }] }
    })
  })
})

describe("frames", () => {
  it("makes a frame at its own size and draws it once, in the primary mode", async () => {
    const result = await execute(
      {
        label: "Sketch",
        code: `id = CreateDesign({ name: "Sketch", kind: "frame", width: 400, height: 300, x: 0, y: 2000 })
Insert(id, { type: "text", text: "Idea" })
Print(Designs().find((design) => design.id === id).showing, await Screenshot(id, { mode: "all" }))
Print(GetModes(id).designs[0].frames)`
      },
      snapshot(),
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.changes.designs[0]!.after).toMatchObject({
      kind: "frame",
      size: { width: 400, height: 300 },
      root: { type: "layout", children: [{ type: "text", text: "Idea" }] },
      states: [{ id: "default", name: "Default" }]
    })
    expect(result.changes.designs[0]!.after).not.toHaveProperty("view")
    expect(result.output).toEqual([
      '{"state":"default","mode":"desktop-light","beside":[]} 1',
      '[{"mode":"desktop-light","width":400,"height":300,"window":{"width":400,"height":300}}]'
    ])
    expect(result.screenshots).toMatchObject([{ mode: "desktop-light", width: 400 }])
  })

  it("places a frame without a place in empty space for its own size", async () => {
    const result = await execute(
      { label: "Sketch", code: `CreateDesign({ name: "Sketch", kind: "frame", width: 400, height: 300 })` },
      snapshot(),
      hooks()
    )
    // Right of Sign up's 1400 board, with the gap boards keep.
    expect(result.changes.designs[0]!.after).toMatchObject({ kind: "frame", position: { y: 0 } })
    expect(result.changes.designs[0]!.after!.position.x).toBeGreaterThan(1400)
  })

  it("turns a screen into a frame, saying what it dropped, and back", async () => {
    const base = snapshot()
    const signup = base.documents[0]!.document.containers[0]!
    signup.states.push({ id: "error", name: "Error", overrides: { title: { text: "Try again" } } })
    signup.view = { modes: ["mobile-light"], state: "error" }
    const result = await execute(
      {
        label: "Sketch it",
        code: `UpdateDesign("signup", { kind: "frame", width: 600 })
Print(GetDesign("signup").size)
UpdateDesign("signup", { kind: "screen" })
Print(GetDesign("signup").frames)`
      },
      base,
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.warnings).toContain("Sign up is a frame now. States dropped: Error. Modes dropped: mobile-light.")
    expect(result.output).toEqual(['{"width":600}', '{"desktop":{"width":600}}'])
    expect(result.changes.designs[0]!.after).toMatchObject({ kind: "screen", states: [{ id: "default" }] })
  })

  it("refuses what a frame doesn't have: other states, modes and sizes per viewport", async () => {
    const base = snapshot()
    const frame = { ...base.documents[0]!.document.containers[0]!, kind: "frame" as const, size: { width: 400 } }
    base.documents[0]!.document.containers = [frame]
    const calls: [string, string, string][] = [
      [`AddState("signup", { name: "Error" })`, "design", "Sign up is a frame, which has one state"],
      [`UpdateDesign("signup", { showModes: ["mobile-light"] })`, "showModes", "takes no showModes"],
      [`await Screenshot("signup", { mode: "mobile-light" })`, "mode", "drawn only in the primary mode, desktop-light"],
      [`UpdateDesign(CreateDesign({ name: "Home" }), { width: 400 })`, "width", "only a frame takes a width"]
    ]
    for (const [code, field, message] of calls) {
      const result = await execute({ label: "Try", code }, base, hooks())
      expect(result.ok).toBe(false)
      expect(result.error).toContain(message)
      expect(result.details).toMatchObject({ code: "invalid_input", field })
    }
  })

  it("runs the skill's frame example", async () => {
    const result = await execute(
      {
        label: "Sketch",
        code: `const sketch = CreateDesign({ name: "Sketch", kind: "frame", width: 480, height: 320 })
Insert(sketch, { type: "text", tag: "h2", text: "Pricing ideas" })
await Screenshot(sketch)
UpdateDesign(sketch, { kind: "screen" }) // keeps its layers, and its size in the primary viewport`
      },
      snapshot(),
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.screenshots).toMatchObject([{ design: "sketch", mode: "desktop-light", width: 480 }])
    expect(result.changes.designs[0]!.after).toMatchObject({
      kind: "screen",
      frames: { desktop: { width: 480, height: 320 } }
    })
  })
})

describe("coded failures", () => {
  it.each([
    {
      code: `GetDesign("sign")`,
      details: { code: "unknown_design", retryable: false, field: "design", alternatives: ["signup"] }
    },
    {
      code: `await Screenshot("signup", { state: "loading" })`,
      details: { code: "unknown_state", retryable: false, field: "state", alternatives: ["default"] }
    },
    {
      code: `await Screenshot("signup", { mode: "tablet" })`,
      details: expect.objectContaining({ code: "unknown_mode", field: "mode", alternatives: expect.any(Array) })
    },
    {
      code: `Props("Buton")`,
      details: { code: "unknown_component", retryable: false, field: "component", alternatives: ["Button", "Card"] }
    },
    {
      code: `Update("nothing", { text: "x" })`,
      details: { code: "unknown_node", retryable: false }
    },
    {
      code: `Get("signup/Nope")`,
      details: { code: "unknown_node", retryable: false }
    },
    {
      code: `missing()`,
      details: { code: "execution_failed", retryable: false }
    }
  ])("returns $details.code for $code, with the valid ids to use instead", async ({ code, details }) => {
    const result = await execute({ label: "Read", code }, snapshot(), hooks())
    expect(result.ok).toBe(false)
    expect(result.editId).toBeTruthy()
    expect(result.details).toEqual(details)
  })

  it("names how to write a node two designs share", async () => {
    const shared = snapshot()
    const copy = structuredClone(shared.documents[0]!.document.containers[0]!)
    shared.documents[0]!.document.containers.push({ ...copy, id: "register", name: "Register" })
    const result = await execute({ label: "Read", code: `Get("title")` }, shared, hooks())
    expect(result.details).toEqual({
      code: "ambiguous_reference",
      retryable: false,
      alternatives: ["signup/title", "register/title"]
    })
  })

  it("asks for a state's id in every call that takes one, pointing a name to its id", async () => {
    const base = snapshot()
    base.documents[0]!.document.containers[0]!.states = [
      { id: "default", name: "Default" },
      { id: "loading", name: "Busy" },
      { id: "error", name: "Failed" },
      { id: "error-2", name: "Failed" }
    ]
    const calls = [
      `UpdateState("signup", "Busy", { name: "Waiting" })`,
      `DeleteState("signup", "Busy")`,
      `Update("submit", { hidden: true }, { state: "Busy" })`,
      `Get("submit", { state: "Busy" })`,
      `UpdateDesign("signup", { state: "Busy" })`,
      `await Screenshot("signup", { state: "Busy" })`,
      `await Measure("signup", { state: "Busy" })`,
      `await Problems("signup", { state: ["default", "Busy"] })`,
      `await Accessibility("signup", { state: "Busy" })`
    ]
    for (const code of calls) {
      const result = await execute({ label: "Try", code }, base, hooks())
      // The call rides along, so a failure names which one went wrong.
      expect({ code, error: result.error, details: result.details }).toEqual({
        code,
        error: expect.stringMatching(
          /^No state with id "Busy" in Sign up\..*"Busy" is the name of state "loading"; use/
        ),
        details: {
          code: "unknown_state",
          retryable: false,
          field: "state",
          alternatives: ["loading", "default", "error", "error-2"]
        }
      })
    }
    const duplicate = await execute({ label: "Try", code: `DeleteState("signup", "Failed")` }, base, hooks())
    expect(duplicate.error).toContain('"Failed" names 2 states, "error" and "error-2"; use the id of the one you mean.')
    expect(duplicate.details?.alternatives?.slice(0, 2)).toEqual(["error", "error-2"])
    const byId = await execute(
      { label: "Try", code: `UpdateState("signup", "loading", { name: "Waiting" })` },
      base,
      hooks()
    )
    expect(byId.error).toBeUndefined()
    expect(byId.changes.designs[0]!.after!.states[1]).toEqual({ id: "loading", name: "Waiting" })
  })

  it("explains that Measure draws one frame when given a list, all or shown, before rendering (PAR-461)", async () => {
    const base = snapshot()
    base.documents[0]!.document.containers[0]!.states = [
      { id: "default", name: "Default" },
      { id: "loading", name: "Busy" }
    ]
    const modes = resolveModes(base.modes).map((mode) => mode.id)
    const calls = [
      { option: `{ state: "all" }`, field: "state", given: '"all"', ids: ["default", "loading"] },
      { option: `{ state: ["default", "loading"] }`, field: "state", given: "a list", ids: ["default", "loading"] },
      { option: `{ mode: "all" }`, field: "mode", given: '"all"', ids: modes },
      { option: `{ mode: "shown" }`, field: "mode", given: '"shown"', ids: modes },
      { option: `{ mode: [${JSON.stringify(modes[0])}] }`, field: "mode", given: "a list", ids: modes }
    ]
    for (const { option, field, given, ids } of calls) {
      const rendered: unknown[] = []
      const code = `await Measure("signup", ${option})`
      const result = await execute({ label: "Try", code }, base, {
        ...hooks(),
        render: async (job) => (rendered.push(job), hooks().render(job))
      })
      expect({ code, error: result.error, details: result.details, rendered }).toEqual({
        code,
        error:
          `Measure lays out one frame, so ${field} takes one ${field} id, not ${given}. To compare ${field}s, call ` +
          `Measure once for each; Problems, Screenshot and Accessibility take ` +
          (field === "state"
            ? 'a list or "all". States in Sign up: default (Default), loading (Busy).'
            : `a list, "shown" or "all". Modes: ${modes.join(", ")}.`) +
          " (line 1, column 7)",
        details: { code: "invalid_input", retryable: false, field, alternatives: ids },
        rendered: []
      })
    }
    // One state and one mode still measure, as do the checks that take a matrix.
    const single = await execute(
      {
        label: "Try",
        code: `const layout = await Measure("signup", { state: "loading", mode: ${JSON.stringify(modes[0])} })
Print(layout.state, layout.mode)
await Problems("signup", { state: "all", mode: "all" })`
      },
      base,
      hooks()
    )
    expect(single.error).toBeUndefined()
    // A frame takes only the primary mode, so that's all it lists.
    base.documents[0]!.document.containers[0]!.kind = "frame"
    const frame = await execute({ label: "Try", code: `await Measure("signup", { mode: "all" })` }, base, hooks())
    expect(frame.error).toContain(`Sign up is a frame, drawn only in the primary mode, ${modes[0]}.`)
    expect(frame.details?.alternatives).toEqual([modes[0]])
  })

  it("throws coded errors for a retry it can't patch, before running anything", async () => {
    await expect(execute({ label: "Retry", editId: "gone", edits: [] }, snapshot(), hooks())).rejects.toMatchObject({
      details: { code: "unknown_edit_id", retryable: false, field: "editId" }
    })
    const failed = await execute({ label: "Read", code: `missing()` }, snapshot(), hooks())
    await expect(
      execute({ label: "Retry", editId: failed.editId, edits: [{ find: "absent", replace: "x" }] }, snapshot(), hooks())
    ).rejects.toMatchObject({ details: { code: "invalid_input", field: "edits/0/find" } })
  })
})

describe("Replace", () => {
  /** The sign-up screen with a mobile patch on the title, a loading state on the button and a size variant. */
  function patched(): AgentSnapshot {
    const read = snapshot()
    const [design] = read.documents[0]!.document.containers
    const page = design!.root as Extract<DesignNode, { type: "layout" }>
    page.responsive = { mobile: { style: { gap: 2 } } }
    page.children[0]!.responsive = { mobile: { hidden: true }, tablet: { text: "Sign up" } }
    design!.states.push({ id: "loading", name: "Loading", overrides: { submit: { props: { disabled: true } } } })
    design!.params = {
      size: {
        type: "variant",
        options: [
          { id: "small", name: "Small", overrides: { title: { text: "Join" } } },
          { id: "large", name: "Large" }
        ]
      }
    }
    return read
  }

  it("reports the patches a nested Replace throws away, and only the replaced node's", async () => {
    const result = await execute(
      {
        label: "Rebuild the title",
        code: `Print(Replace("title", {type: "text", name: "Heading", text: "Welcome"}))`
      },
      patched(),
      hooks()
    )
    expect(result.ok).toBe(true)
    expect(result.discarded).toEqual([
      {
        design: "signup",
        replaced: "title",
        replacement: result.output[0],
        nodes: [{ id: "title", name: "Title", viewports: ["mobile", "tablet"], variants: ["size=small"] }]
      }
    ])
    const after = result.changes.designs[0]!.after!
    expect(after.states[1]!.overrides).toEqual({ submit: { props: { disabled: true } } })
    expect(after.root.responsive).toEqual({ mobile: { style: { gap: 2 } } })
  })

  it("reports every node's patches when it replaces the root, which clears the states", async () => {
    const result = await execute(
      { label: "Rebuild the page", code: `Replace("signup/page", {type: "layout", name: "Page", children: []})` },
      patched(),
      hooks()
    )
    expect(result.error).toBeUndefined()
    expect(result.discarded?.[0]).toMatchObject({ design: "signup", replaced: "page" })
    expect(result.discarded?.[0]!.nodes).toEqual([
      { id: "page", name: "Page", viewports: ["mobile"] },
      { id: "title", name: "Title", viewports: ["mobile", "tablet"], variants: ["size=small"] },
      { id: "submit", name: "Submit", states: ["loading"] }
    ])
    const after = result.changes.designs[0]!.after!
    expect(after.params?.size?.options?.[0]).toEqual({ id: "small", name: "Small" })
  })

  it("keeps the old patches in the design as it read it, so undoing the step brings them back", async () => {
    const result = await execute(
      { label: "Rebuild the button", code: `Replace("submit", {type: "component", component: "Button"})` },
      patched(),
      hooks()
    )
    expect(result.error).toBeUndefined()
    const change = result.changes.designs[0]!
    expect(change.base!.states[1]!.overrides).toEqual({ submit: { props: { disabled: true } } })
    expect(change.after!.states[1]!.overrides).toBeUndefined()
  })

  it("reports nothing when the call fails and changes nothing", async () => {
    const result = await execute(
      { label: "Rebuild the title", code: `Replace("title", {type: "text", text: "Welcome"})\nmissing()` },
      patched(),
      hooks()
    )
    expect(result.ok).toBe(false)
    expect(result.discarded).toBeUndefined()
    expect(result.changes.designs).toEqual([])
  })

  it("says nothing about a replacement that had no patches to lose", async () => {
    const result = await execute(
      {
        label: "Rebuild twice",
        code: `const id = Replace("submit", {type: "component", component: "Button"})
Replace(id, {type: "component", component: "Button", props: {children: "Go"}})`
      },
      snapshot(),
      hooks()
    )
    expect(result.ok).toBe(true)
    expect(result).not.toHaveProperty("discarded")
  })

  it("runs the skill's example of putting patches back", async () => {
    const result = await execute(
      {
        label: "Rebuild the title",
        code: `const title = Replace("signup/Title", { type: "text", name: "Title", text: "Welcome" })
Responsive(title, "mobile", { hidden: true })
UpdateState("signup", "loading", { changes: { [title]: { text: "Signing you up…" } } })`
      },
      patched(),
      hooks()
    )
    expect(result.ok).toBe(true)
    const after = result.changes.designs[0]!.after!
    const title = result.discarded![0]!.replacement
    expect(findNode(after.root, title)?.responsive).toEqual({ mobile: { hidden: true } })
    expect(after.states[1]!.overrides?.[title]).toEqual({ text: "Signing you up…" })
  })
})
