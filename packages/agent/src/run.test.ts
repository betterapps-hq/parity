import { defaultModeSettings, findNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { execute } from "./run.ts"
import type {
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
    // Every mode's title is wider than its viewport, and the mobile frame also overflows.
    expect(result.output[1]).toBe("5")
    expect(result.output[2]).toBe("2")
    expect(result.screenshots.map((shot) => shot.mode)).toEqual(["desktop-light", "tablet-light"])
    // Each look shows as what it is, so the agent's cursor can say so.
    const looks = new Set(events.filter((event) => event.design).map((event) => event.kind))
    expect(looks).toEqual(new Set(["measure", "problems", "screenshot"]))
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
})
