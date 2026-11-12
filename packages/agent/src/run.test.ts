import {
  type ContainerSpec,
  defaultModeSettings,
  type DesignNode,
  designStates,
  findNode,
  frameGeometry,
  resolveModes
} from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"
import { replies } from "./contracts.ts"
import { execute } from "./run.ts"
import type {
  AgentChangeSet,
  AgentEvent,
  AgentHooks,
  AgentSnapshot,
  FrameRequest,
  FrameResult,
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
          version: 4,
          containers: [
            {
              id: "signup",
              name: "Sign up",
              // A component, since only a component has states, which most of these calls exercise.
              kind: "component",
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
              }
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
    render: async ({ mode, capture, audit }) => {
      const frame: FrameResult = {
        width: mode.width,
        height: 600,
        nodes: [{ id: "title", x: 0, y: 0, width: mode.width + 10, height: 40 }],
        overflowsX: mode.width < 500,
        unknownComponents: []
      }

      if (capture) {
        frame.png = "iVBOR"
      }

      if (audit) {
        frame.issues = [
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

      return frame
    }
  }
}

/** What a snippet printed as JSON, read as `schema` says. */
function printed<T extends z.ZodType>(text: string | undefined, schema: T): z.output<T> {
  return schema.parse(JSON.parse(text ?? "null"))
}

/** Accessibility findings, as the app answers them. */
const findingList = replies.accessibility.shape.findings

/** A design's root, which the fixture's designs make a layout. */
function layoutRoot(design: ContainerSpec | undefined): Extract<DesignNode, { type: "layout" }> {
  const root = design?.root

  if (root?.type !== "layout") {
    throw new Error("The fixture's design has no layout root")
  }

  return root
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
    expect(container.states![1]).toEqual({
      id: "loading",
      name: "Loading",
      overrides: { submit: { props: { disabled: true } } }
    })
    expect(events[0]).toMatchObject({ kind: "start", label: "Add a hint" })
    expect(events.some((event) => event.kind === "write" && event.node === "submit")).toBe(true)
    expect(events.at(-1)).toMatchObject({ kind: "end" })
  })

  it("sets a layer's transitions, a state's own, reads them back, and clears them with null (PAR-934)", async () => {
    const result = await execute(
      {
        label: "Animate the button",
        code: `Update("submit", {style: {transition: [{property: "colors", duration: {step: 200}, easing: {keyword: "ease-out"}}]}})
AddState("signup", {name: "Pressed", changes: {Submit: {style: {transition: [{property: "transform", easing: {spring: {duration: 400, bounce: 0.3}}}]}}}})
Print(JSON.stringify(Get("submit").style.transition))
Print(Get("submit", {state: "pressed"}).style.transition[0].easing.spring.duration)
Update("submit", {style: {transition: null}}, {state: "pressed"})`
      },
      snapshot(),
      hooks()
    )

    expect(result.error).toBeUndefined()
    expect(result.output).toEqual([
      '[{"property":"colors","duration":{"step":200},"easing":{"keyword":"ease-out"}}]',
      "400"
    ])
    const container = result.changes.designs[0]!.after!
    expect(findNode(container.root, "submit")?.style?.transition).toEqual([
      { property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" } }
    ])
    expect(container.states[1]?.overrides?.submit?.style?.transition).toBeUndefined()
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
        code: `id = CreateDesign({name: "Pricing", root: {type: "layout", name: "Page", style: {fills: [{type: "solid", color: {token: "background"}}]}, children: [{type: "text", text: "Plans", style: {fontSize: {token: "text-2xl"}}}]}})
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
      documents: [{ path: "app.par", document: { version: 4 as const, containers: [signup, other] } }]
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
    expect(events.flatMap((event) => (event.design === "app.par#pricing" ? [event.kind] : []))).toEqual([
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
    expect(result.warningGroups).toContainEqual(
      expect.objectContaining({
        category: "overlap",
        message: expect.stringContaining(
          "Sign up (signup) and Pricing (pricing) overlap by 800x760 (estimated, as Pricing isn't drawn yet)"
        )
      })
    )
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
    expect(result.warningGroups).toContainEqual(
      expect.objectContaining({
        category: "title_clearance",
        message: expect.stringContaining(
          "The title of Below (below) would cover Sign up (signup): the boards are clear, but Below starts less than 160 below it"
        )
      })
    )
  })

  it("says measured when both boards were drawn", async () => {
    const base = snapshot()
    const document = base.documents[0]!.document
    document.containers.push({ ...document.containers[0]!, id: "copy", name: "Copy", position: { x: 2000, y: 0 } })
    base.bounds["app.par#copy"] = { x: 2000, y: 0, width: 1400, height: 900 }
    const result = await execute({ label: "Nudge", code: `UpdateDesign("copy", { x: 1300, y: 0 })` }, base, hooks())
    expect(result.warningGroups).toEqual([
      expect.objectContaining({
        category: "overlap",
        severity: "warning",
        message: expect.stringContaining("Sign up (signup) and Copy (copy) overlap by 100x1060 (measured)")
      })
    ])
  })

  it("doesn't call a crowded canvas clear when the call moved nothing", async () => {
    const base = snapshot()
    const document = base.documents[0]!.document
    document.containers.push(
      { ...document.containers[0]!, id: "copy", name: "Copy", position: { x: 100, y: 100 } },
      { ...document.containers[0]!, id: "under", name: "Under", position: { x: 0, y: 1000 } }
    )
    const result = await execute({ label: "Look", code: `Print(Overlaps().length)` }, base, hooks())
    // Copy collides with Sign up, and Under's title crowds both.
    expect(result.output).toEqual(["3"])
    expect(result.warningGroups).toEqual([
      {
        category: "canvas_overlaps",
        severity: "suggestion",
        message:
          "3 other pairs of boards overlap or crowd a title on the canvas. This call didn't create, change or move them, so they aren't listed here; Overlaps() lists every one.",
        count: 1,
        at: []
      }
    ])
  })

  it("warns only about the boards the call moved, and counts the rest", async () => {
    const base = snapshot()
    const document = base.documents[0]!.document
    document.containers.push({ ...document.containers[0]!, id: "copy", name: "Copy", position: { x: 100, y: 100 } })

    const result = await execute(
      { label: "Add", code: `CreateDesign({ name: "Pricing", x: 0, y: 1000 })` },
      base,
      hooks()
    )

    // Pricing's title crowds Sign up, and its estimated board reaches Copy. Copy on Sign up was there already.
    const boards = result.warningGroups.filter((group) => group.category !== "not_a_token")
    expect(boards.map((group) => group.category)).toEqual(["title_clearance", "overlap", "canvas_overlaps"])
    expect(boards[2]!.message).toMatch(/^1 other pair of boards overlaps or crowds a title/)
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

    // The 3000 frame and the board's gutter, 30 each side as it's drawn at 40%, reach to 3060, past the new design's left
    // edge at 1800.
    expect(JSON.parse(result.output[0]!)).toMatchObject([
      { designs: ["signup", "pricing"], width: 3060 - 1800, estimated: true }
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

    // 3000 tall, under a 90 caption band and above 30 of gutter, as it's drawn at 40%: 3120 reaches past 3200 less a 160
    // title band. The dark companion is drawn at half size after a divider of 30, 2.5 and 30, so the board is
    // 1280 + 640 + 62.5 + 60, rounded up to 2043 wide, past 2000.
    expect(JSON.parse(result.output[0]!)).toMatchObject([
      { designs: ["signup", "below"], titleOnly: true, estimated: true },
      { designs: ["signup", "beside"], width: 43, estimated: true }
    ])
    expect(result.warnings).toContainEqual(expect.stringContaining("estimated, as Sign up and Below aren't drawn yet"))
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
        code: `Insert("page", {type: "component", component: "Carousel"})\nUpdate("page", {style: {fills: [{type: "solid", color: {token: "hotpink"}}]}})`
      },
      snapshot(),
      hooks()
    )

    expect(result.warnings.join("\n")).toContain(`"Carousel" isn't one of the project's components`)
    expect(result.warnings.join("\n")).toContain(`fills "hotpink" isn't a token`)
  })

  it("fills a layer with a stack of paints, reads it back, and checks each paint's tokens (PAR-931)", async () => {
    const stack = [
      {
        type: "linear",
        angle: 90,
        stops: [
          { color: { token: "primary" }, position: 0 },
          { color: { token: "nope" }, position: 100 }
        ]
      },
      { type: "image", src: "/images/hero.jpg", fit: "fill" },
      { type: "solid", color: { token: "background", alpha: { step: 80 } } }
    ]

    const result = await execute(
      {
        label: "Hero fill",
        code: `Update("page", {style: {fills: ${JSON.stringify(stack)}}})
Print(JSON.stringify(Get("page").style.fills))`
      },
      snapshot(),
      hooks()
    )

    expect(JSON.parse(result.output[0]!)).toEqual(stack)
    expect(findNode(result.changes.designs[0]!.after!.root, "page")?.style?.fills).toEqual(stack)
    expect(result.warnings.join("\n")).toContain(`fills "nope" isn't a token`)
    expect(result.warnings.join("\n")).not.toContain(`fills "primary"`)
  })

  it("lists radius-full with the radius tokens and takes it without a warning (PAR-458)", async () => {
    const result = await execute(
      {
        label: "Pill",
        code: [
          `Print(JSON.stringify(GetTokens({ category: "radius" })))`,
          `Update("submit", {style: {borderRadius: {token: "radius-full"}}})`,
          `Update("title", {style: {fills: [{type: "solid", color: {token: "radius-full"}}]}})`
        ].join("\n")
      },
      snapshot(),
      hooks()
    )

    expect(JSON.parse(result.output[0]!)).toEqual([
      { name: "radius-full", category: "radius", source: "keyword", values: { default: "calc(infinity * 1px)" } }
    ])
    expect(result.warnings.join("\n")).not.toContain(`borderRadius "radius-full"`)
    // A keyword is a radius only: as a color it's still not a token.
    expect(result.warnings.join("\n")).toContain(`fills "radius-full" isn't a token`)
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

  it("lists the tokens nearest a color or a length, nearest first, with how far each is (PAR-833)", async () => {
    const shadcn = snapshot()
    shadcn.tokens = [
      { name: "color-blue-500", category: "color", source: "theme", values: { default: "oklch(62.3% 0.214 259.815)" } },
      { name: "color-blue-600", category: "color", source: "theme", values: { default: "oklch(54.6% 0.245 262.881)" } },
      { name: "primary", category: "color", source: "semantic", values: { default: "var(--color-blue-600)" } },
      { name: "accent", category: "color", source: "semantic", values: { default: "blue" } },
      { name: "radius", category: "radius", source: "semantic", values: { default: "0.625rem" } },
      { name: "radius-sm", category: "radius", source: "semantic", values: { default: "calc(var(--radius) - 4px)" } },
      { name: "text-sm", category: "font-size", source: "theme", values: { default: "0.875rem" } }
    ]

    const code = [
      `Print(JSON.stringify(GetTokens({ nearest: "#2f6fed" }).map(({ name, distance }) => [name, distance])))`,
      `Print(JSON.stringify(GetTokens({ nearest: "#2f6fed", source: "semantic" })[0]))`,
      `Print(JSON.stringify(GetTokens({ nearest: "7px", category: "radius" }).map(({ name, distance }) => [name, distance])))`
    ].join("\n")

    const result = await execute({ label: "Nearest", code }, shadcn, hooks())
    const [colors, semantic, radii] = result.output.map((line) => JSON.parse(line))

    // accent's "blue" can't be read, so it isn't listed; primary comes to blue-600 through its reference.
    expect(colors).toEqual([
      ["color-blue-500", 0.046],
      ["primary", 0.052],
      ["color-blue-600", 0.052]
    ])
    expect(semantic).toEqual({
      name: "primary",
      category: "color",
      source: "semantic",
      values: { default: "var(--color-blue-600)" },
      distance: 0.052
    })
    // radius-full, the keyword, is as round as the box allows, which no length is near.
    expect(radii).toEqual([
      ["radius-sm", 1],
      ["radius", 3]
    ])
  })

  it("rejects nodes that don't fit the format", async () => {
    const result = await execute(
      { label: "Bad", code: `Insert("page", {type: "text", text: "x", fontSize: 12})` },
      snapshot(),
      hooks()
    )

    expect(result.ok).toBe(false)
    expect(result.error).toContain("node/fontSize: unknown property")
    expect(result.details).toEqual({ code: "invalid_input", retryable: false, field: "node/fontSize" })
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
    const looks = new Set(events.flatMap((event) => (event.design ? [event.kind] : [])))
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
    const problems = printed(result.output[1], z.array(z.looseObject({ kind: z.string(), mode: z.string() })))
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

  it("gives a node's box and what clips it in the same shapes from Measure and Problems (PAR-915)", async () => {
    const result = await execute(
      {
        label: "Check",
        code: `const m = await Measure("signup", {mode: "mobile-light"})
const title = m.nodes.find((node) => node.id === "title")
const problem = (await Problems("signup", {mode: "mobile-light"})).find((each) => each.kind === "clipped")
Print(JSON.stringify({ measured: { box: title.box, clip: title.clip }, problem: { box: problem.box, container: problem.container } }))`
      },
      snapshot(),
      {
        ...hooks(),
        render: async ({ mode }) => ({
          width: mode.width,
          height: 600,
          overflowsX: false,
          unknownComponents: [],
          nodes: [
            { id: "page", x: 0, y: 0, width: mode.width, height: 600 },
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
    const box = { x: 0, y: 0, width: 200, height: 40 }
    const clip = { node: "page", name: "Page", box: { x: 0, y: 10, width: 390, height: 590 } }
    expect(JSON.parse(result.output[0] ?? "")).toEqual({
      measured: { box, clip },
      problem: { box, container: clip }
    })
  })

  it("says where the project's code writes each node's element (PAR-167)", async () => {
    const source = "src/components/ui/button.tsx:44:5"

    const result = await execute(
      { label: "Check", code: `Print(JSON.stringify((await Measure("signup")).nodes.map((node) => node.source)))` },
      snapshot(),
      {
        ...hooks(),
        render: async ({ mode }) => ({
          width: mode.width,
          height: 600,
          overflowsX: false,
          unknownComponents: [],
          nodes: [
            // Parity draws the page layout itself, so the project's code writes no element for it.
            { id: "page", x: 0, y: 0, width: mode.width, height: 600 },
            { id: "submit", parent: "page", x: 16, y: 100, width: 80, height: 36, source }
          ]
        })
      }
    )

    expect(result.output[0]).toBe(JSON.stringify([null, source]))
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

  it("draws every frame a check asks for at once, and answers in the order asked", async () => {
    const modes = ["desktop-light", "tablet-light", "mobile-light"]
    const waiting: (() => void)[] = []
    let drawing = 0
    let mostAtOnce = 0

    // Each frame is held until none starts for a moment, then they finish last first.
    const render: AgentHooks["render"] = async (request) => {
      drawing++
      mostAtOnce = Math.max(mostAtOnce, drawing)
      await new Promise<void>((resolve) => {
        waiting.push(resolve)
        setTimeout(() => {
          for (const finish of waiting.splice(0).reverse()) {
            finish()
          }
        }, 20)
      })
      drawing--

      return hooks().render(request)
    }

    const result = await execute(
      {
        label: "Check",
        code: `const found = await Accessibility("signup", {mode: ${JSON.stringify(modes)}})
Print(JSON.stringify(found.map((finding) => finding.mode)))
Print(await Screenshot("signup", {mode: ${JSON.stringify(modes)}}))`
      },
      snapshot(),
      { ...hooks(), render }
    )

    expect(result.ok).toBe(true)
    expect(mostAtOnce).toBe(modes.length)
    expect([...new Set(printed(result.output[0], z.array(z.string())))]).toEqual(modes)
    expect(result.screenshots.map((shot) => shot.mode)).toEqual(modes)
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
    expect(events.flatMap((event) => (event.design ? [event.kind] : []))).toEqual(["accessibility", "accessibility"])
    const findings = printed(result.output[0], findingList)
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
    const findings = printed(result.output[0], findingList)
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

    const findings = printed(result.output[0], findingList)
    expect(findings[0]?.contrast).not.toHaveProperty("fix")
  })

  it("names an instance after its design", async () => {
    const project = snapshot()
    const [signup] = project.documents[0]!.document.containers
    project.documents[0]!.document.containers = [
      {
        ...signup!,
        root: { ...layoutRoot(signup), children: [{ type: "instance", id: "submit", design: "member-row" }] }
      },
      {
        id: "member-row",
        name: "Member row",
        kind: "component",
        position: { x: 0, y: 1000 },
        root: { type: "layout", id: "row", children: [] }
      }
    ]

    const result = await execute(
      { label: "Check", code: `Print(JSON.stringify(await Accessibility("signup")))` },
      project,
      hooks()
    )

    expect(result.ok).toBe(true)
    const findings = printed(result.output[0], findingList)
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

  it("says which design and state each frame draws, so what it writes to the console is that design's (PAR-147)", async () => {
    const requests: FrameRequest[] = []
    await execute({ label: "Look", code: `await Measure("signup")` }, snapshot(), recording(requests))
    expect(requests.map(({ design, state }) => ({ design, state }))).toEqual([
      { design: "app.par#signup", state: "default" }
    ])
  })

  it("draws an instance of a library's component design, as the canvas does", async () => {
    const project = snapshot()
    const [signup] = project.documents[0]!.document.containers
    project.documents[0]!.document.containers = [
      {
        ...signup!,
        root: { ...layoutRoot(signup), children: [{ type: "instance", id: "row", design: "kit/label" }] }
      }
    ]
    project.libraryDesigns = [
      {
        id: "kit/label",
        name: "Label",
        kind: "component",
        position: { x: 0, y: 0 },
        root: { type: "text", id: "text", text: "From the kit" }
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
        root: { type: "text", id: "text", text: "From the kit" }
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
        root: { ...layoutRoot(signup), children: [{ type: "instance", id: "row", design: "kit/label" }] }
      },
      {
        id: "kit/label",
        name: "Label",
        kind: "component",
        position: { x: 0, y: 1000 },
        root: { type: "text", id: "text", text: "The project's own" }
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

describe("SetTokens adds a token the project doesn't have (PAR-911)", () => {
  it("lists the new token and takes it in a style without a warning, in the same call", async () => {
    let applied: unknown

    const result = await execute(
      {
        label: "Page titles",
        code: [
          `Update("title", {style: {fontSize: {token: "text-display"}}})`,
          `SetTokens({ "text-display": "4rem", "shadow-popup": { default: "0 8px 24px black", dark: "none" } })`,
          `Update("page", {style: {boxShadow: [{type: "drop", token: "shadow-popup"}]}})`,
          `Print(JSON.stringify(GetTokens({ search: "text-display" })))`,
          `Print(JSON.stringify(GetTokens({ category: "shadow" })))`
        ].join("\n")
      },
      snapshot(),
      {
        ...hooks(),
        apply: async (changes) => {
          applied = changes.tokens

          return []
        }
      }
    )

    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([])
    expect(JSON.parse(result.output[0]!)).toEqual([
      { name: "text-display", category: "font-size", source: "semantic", values: { default: "4rem" } }
    ])
    expect(JSON.parse(result.output[1]!)).toEqual([
      {
        name: "shadow-popup",
        category: "shadow",
        source: "semantic",
        values: { default: "0 8px 24px black", dark: "none" }
      }
    ])
    expect(applied).toEqual([
      { name: "text-display", theme: "default", value: "4rem" },
      { name: "shadow-popup", theme: "default", value: "0 8px 24px black" },
      { name: "shadow-popup", theme: "dark", value: "none" }
    ])
  })

  it("warns about the name until a call adds it, saying how", async () => {
    const before = await execute(
      { label: "Page titles", code: `Update("title", {style: {fontSize: {token: "text-display"}}})` },
      snapshot(),
      hooks()
    )

    expect(before.warnings.join("\n")).toContain(`fontSize "text-display" isn't a token`)
    expect(before.warnings.join("\n")).toContain(`add text-display with SetTokens`)
  })

  it("shows a changed token's new value in GetTokens", async () => {
    const result = await execute(
      {
        label: "Tokens",
        code: `SetTokens({ primary: "blue" })\nPrint(GetTokens({ search: "primary" })[0].values.default)`
      },
      snapshot(),
      hooks()
    )

    expect(result.output).toEqual(["blue"])
  })
})

describe("SetTokens refuses what the token detail refuses (PAR-584)", () => {
  /** The browser's `CSS.supports`, as the app answers it: a color is a named one, a hex or `oklch()`. */
  function checking(asked: { property: string; value: string }[] = []): AgentHooks {
    return {
      ...hooks(),
      supports: async (queries) => {
        asked.push(...queries)

        return queries.map(({ property, value }) =>
          property === "color" ? /^(white|black|blue|green|#[\da-f]{3,8}|oklch\(.+\))$/i.test(value) : true
        )
      }
    }
  }

  async function refusal(code: string, ask = checking()) {
    let applied = false

    const result = await execute({ label: "Tokens", code }, snapshot(), {
      ...ask,
      apply: async () => {
        applied = true

        return []
      }
    })

    expect(result.ok).toBe(false)
    expect(applied).toBe(false)

    return { error: result.error, details: result.details }
  }

  it("refuses a bracket left open, naming the token, and saves nothing", async () => {
    // Refused as SetTokens runs, so the error says where in the snippet.
    expect(await refusal(`SetTokens({ primary: "oklch(0.6 0.2 250" })`)).toEqual({
      error: "SetTokens/primary/default: A bracket isn't closed. Add ) at the end. (line 1, column 1)",
      details: { code: "invalid_input", field: "SetTokens/primary/default", retryable: false }
    })
  })

  it("refuses a reference to no token, and a loop through another token", async () => {
    expect((await refusal(`SetTokens({ primary: "var(--brand)" })`)).error).toMatch(
      /^SetTokens\/primary\/default: There's no token named brand\. /
    )
    expect(
      (await refusal(`SetTokens({ background: "var(--primary)" }); SetTokens({ primary: "var(--background)" })`)).error
    ).toMatch(/^SetTokens\/primary\/default: background is built on primary, so this would loop\. /)
  })

  it("refuses a value that isn't its token's kind by CSS's grammar, without a browser", async () => {
    const asked: { property: string; value: string }[] = []

    for (const ask of [hooks(), checking(asked)]) {
      expect((await refusal(`SetTokens({ primary: { dark: "bluish" } })`, ask)).error).toBe(
        "SetTokens/primary/dark: That isn't a color. Try oklch(0.6 0.2 250) or #2563eb. (line 1, column 1)"
      )
    }

    expect(asked).toEqual([])
  })

  it("refuses a value the grammar allows and the browser doesn't, asking the browser once", async () => {
    const asked: { property: string; value: string }[] = []
    expect((await refusal(`SetTokens({ primary: { dark: "rebeccapurple" } })`, checking(asked))).error).toBe(
      "SetTokens/primary/dark: That isn't a color. Try oklch(0.6 0.2 250) or #2563eb."
    )
    expect(asked).toEqual([{ property: "color", value: "rebeccapurple" }])
  })

  it("accepts good values, references filled in, and applies them", async () => {
    const asked: { property: string; value: string }[] = []
    let applied: unknown

    const result = await execute(
      { label: "Tokens", code: `SetTokens({ primary: "oklch(0.6 0.2 250)", background: { dark: "var(--primary)" } })` },
      snapshot(),
      {
        ...checking(asked),
        apply: async (changes) => {
          applied = changes.tokens

          return []
        }
      }
    )

    expect(result.ok).toBe(true)
    // Dark has no primary of its own, so the reference comes to the root's new value.
    expect(asked).toEqual([
      { property: "color", value: "oklch(0.6 0.2 250)" },
      { property: "color", value: "oklch(0.6 0.2 250)" }
    ])
    expect(applied).toEqual([
      { name: "primary", theme: "default", value: "oklch(0.6 0.2 250)" },
      { name: "background", theme: "dark", value: "var(--primary)" }
    ])
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

  const names = new Map<string, IconNames>([
    [
      "lucide",
      {
        names: ["Heart", "HeartCrack", "Settings", "Bell", "Star"],
        aliases: { Settings: ["Cog"] },
        tags: { Heart: ["love"] }
      }
    ],
    ["heroicons/", { names: ["BellIcon", "CogIcon"] }],
    ["heroicons/24/solid", { names: ["CogIcon"] }]
  ])

  const withIcons = (): AgentHooks => ({
    ...hooks(),
    iconNames: async (set, module) => names.get(set === "lucide" ? set : `${set}/${module ?? ""}`)!
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
        documents: [{ path: "app.par", document: { version: 4, containers: [signup, dashboard] } }]
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

    if (page.type !== "layout") {
      throw new Error("Expected a layout")
    }

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
Update("submit", { style: { fills: [{ type: "solid", color: { token: "hotpink" } }] } })
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
      root: { type: "layout", children: [{ type: "text", text: "Idea" }] }
    })
    expect(result.changes.designs[0]!.after).not.toHaveProperty("view")
    expect(result.output).toEqual([
      '{"mode":"desktop-light","beside":[]} 1',
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

  it("turns a component into a frame, saying what it dropped, and into a screen", async () => {
    const base = snapshot()
    const signup = base.documents[0]!.document.containers[0]!
    signup.states = [
      ...designStates(signup),
      { id: "error", name: "Error", overrides: { title: { text: "Try again" } } }
    ]
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
    expect(result.changes.designs[0]!.after).toMatchObject({ kind: "screen" })
    expect(result.changes.designs[0]!.after).not.toHaveProperty("states")
  })

  it("refuses what a frame doesn't have: other states, modes and sizes per viewport", async () => {
    const base = snapshot()
    const frame = { ...base.documents[0]!.document.containers[0]!, kind: "frame" as const, size: { width: 400 } }
    base.documents[0]!.document.containers = [frame]

    const calls: [string, string, string][] = [
      [`AddState("signup", { name: "Error" })`, "design", "Sign up is a frame, and only a component has states"],
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

describe("states, only a component's (PAR-1002)", () => {
  /** Sign up, a component, beside Home, a screen with the same layers. */
  function withScreen(): AgentSnapshot {
    const base = snapshot()
    const [signup] = base.documents[0]!.document.containers
    const { states: _states, ...layers } = structuredClone(signup!)
    base.documents[0]!.document.containers.push({
      ...layers,
      id: "home",
      name: "Home",
      kind: "screen",
      position: { x: 3000, y: 0 }
    })

    return base
  }

  it("lists a component's states and showing state, and a screen's modes alone", async () => {
    const result = await execute({ label: "Read", code: `Print(JSON.stringify(Designs()))` }, withScreen(), hooks())
    const [component, screen] = JSON.parse(result.output[0]!)

    expect(component).toMatchObject({ id: "signup", kind: "component", states: [{ id: "default", name: "Default" }] })
    expect(component.showing).toEqual({ state: "default", mode: "desktop-light", beside: [] })
    expect(screen).toMatchObject({ id: "home", kind: "screen", showing: { mode: "desktop-light", beside: [] } })
    expect(screen).not.toHaveProperty("states")
    expect(screen.showing).not.toHaveProperty("state")
  })

  it.each([
    `AddState("home", { name: "Loading" })`,
    `UpdateState("home", "loading", { name: "Waiting" })`,
    `DeleteState("home", "loading")`,
    `Update("home/title", { text: "Hi" }, { state: "loading" })`,
    `Get("home/title", { state: "loading" })`,
    `UpdateDesign("home", { allStates: true })`,
    `CreateDesign({ name: "About", baseState: "Signed out" })`,
    `await Screenshot("home", { state: "loading" })`
  ])("refuses %s on a screen, saying only a component has states", async (code) => {
    const result = await execute({ label: "Try", code }, withScreen(), hooks())

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/is a screen, and only a component has states/)
    expect(result.details).toMatchObject({ code: "invalid_input", field: "design" })
  })

  it("draws and edits a screen in its base state", async () => {
    const result = await execute(
      { label: "Edit", code: `Update("home/title", { text: "Welcome" })\nawait Screenshot("home", { state: "all" })` },
      withScreen(),
      hooks()
    )

    expect(result.error).toBeUndefined()
    expect(result.screenshots).toMatchObject([{ design: "home", state: "default" }])
    expect(result.changes.designs[0]!.after).not.toHaveProperty("states")
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
    expect(byId.changes.designs[0]!.after!.states![1]).toEqual({ id: "loading", name: "Waiting" })
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

  // One bad argument to each function, refused before the function reads it (PAR-596).
  it.each([
    { code: `GetDesign(1)`, field: "design", message: "expected a string" },
    { code: `Get(1)`, field: "path", message: "expected a path, or a function to call for every node" },
    { code: `Get("signup", { depth: -1 })`, field: "depth", message: "expected at least 0" },
    { code: `Get("signup", (node) => node.id, { deep: true })`, field: "deep", message: "unknown property" },
    { code: `Props("Button", { every: true })`, field: "every", message: "unknown property" },
    { code: `await Icons("lucide", { limit: 0 })`, field: "limit", message: "expected more than 0" },
    { code: `GetTokens({ category: 1 })`, field: "category", message: "expected a string" },
    { code: `GetTokens({ nearest: "blue" })`, field: "nearest", message: 'or a length in px or rem, not "blue"' },
    { code: `GetModes(1)`, field: "design", message: "expected a string" },
    { code: `CreateDesign("Home")`, field: "spec", message: "expected an object" },
    { code: `CreateDesign({ name: "Home", file: "home.json" })`, field: "file", message: "expected a .par file" },
    { code: `CreateDesign({ name: "Home", root: { type: "card" } })`, field: "root/type", message: "expected one of" },
    { code: `UpdateDesign("signup", { x: "10" })`, field: "x", message: "expected a number" },
    { code: `DeleteDesign()`, field: "design", message: "expected a string" },
    { code: `Insert("page", { type: "text", text: 1 })`, field: "node/text", message: "expected a string" },
    { code: `Insert("page", { type: "text", text: "Hi" }, { index: -1 })`, field: "index", message: "at least 0" },
    { code: `Insert(document, { type: "layout" }, { kind: "page" })`, field: "kind", message: "expected one of" },
    { code: `Update("title", { style: { gap: true } })`, field: "style/gap", message: "expected { step }, { token }" },
    { code: `Update("title", { width: 3 })`, field: "width", message: "use Replace, Move or Responsive" },
    { code: `Update("title", { text: "Hi" }, { state: 1 })`, field: "state", message: "expected a string" },
    { code: `Replace("title", "text")`, field: "node", message: "expected an object" },
    { code: `Move("title", "page", { slot: 1 })`, field: "slot", message: "expected a string" },
    { code: `Copy("title", "page", { name: 1 })`, field: "name", message: "expected a string" },
    { code: `Delete(["title"])`, field: "path", message: "expected a string" },
    { code: `Responsive("title", "mobile", { hidden: "no" })`, field: "patch/hidden", message: "true or false" },
    {
      code: `AddState("signup", { name: "Error", changes: { title: { text: 1 } } })`,
      field: "changes/title/text",
      message: "expected a string"
    },
    { code: `UpdateState("signup", "default", { name: 1 })`, field: "name", message: "expected a string" },
    { code: `DeleteState("signup", 1)`, field: "state", message: "expected a string" },
    { code: `SetModes({ ...GetModes().settings, version: 2 })`, field: "version", message: "expected 1" },
    { code: `SetTokens({ primary: 1 })`, field: "SetTokens/primary", message: "a string or an object" },
    { code: `await Measure("signup", { scale: 2 })`, field: "scale", message: "unknown property" },
    { code: `await Problems("signup", { state: 1 })`, field: "state", message: "a string or an array" },
    { code: `await Screenshot("signup", { scale: "big" })`, field: "scale", message: "expected a number" },
    { code: `await Accessibility("signup", { mode: [1] })`, field: "mode/0", message: "expected a string" },
    { code: `FindEmptySpace({ width: 100 })`, field: "height", message: "expected a number" },
    { code: `Overlaps(1)`, field: "design", message: "expected a string" },
    { code: `FindRepeats({})`, field: "design", message: "expected a string" },
    { code: `ExtractComponent("signup", [], { name: "Title" })`, field: "nodes", message: "at least 1 item" },
    { code: `ExtractComponent("signup", "title", {})`, field: "name", message: "expected a string" }
  ])("refuses $code with invalid_input at $field", async ({ code, field, message }) => {
    const result = await execute({ label: "Try", code }, snapshot(), hooks())
    expect(result.ok).toBe(false)
    expect(result.error?.startsWith(`${field}: `)).toBe(true)
    expect(result.error).toContain(message)
    expect(result.details).toEqual({ code: "invalid_input", retryable: false, field })
    expect(result.changes).toEqual({ designs: [], tokens: [] })
  })

  it("sets and reads a layer's order, and refuses one that isn't whole", async () => {
    const result = await execute(
      {
        label: "Order",
        code: `Update("title", { style: { zIndex: { step: 10 } } })
Print(Get("title").style.zIndex.step)`
      },
      snapshot(),
      hooks()
    )

    expect(result.output).toEqual(["10"])
    expect(findNode(result.changes.designs[0]!.after!.root, "title")).toMatchObject({ style: { zIndex: { step: 10 } } })

    const refused = await execute(
      { label: "Order", code: `Update("title", { style: { zIndex: { step: 1.5 } } })` },
      snapshot(),
      hooks()
    )

    expect(refused.ok).toBe(false)
    expect(refused.error).toContain("expected a whole number")
  })

  it("still reads null as taking a value away", async () => {
    const base = snapshot()
    const signup = base.documents[0]!.document.containers[0]!
    signup.root = { ...layoutRoot(signup), responsive: { mobile: { style: { gap: { step: 2 } } } } }

    const result = await execute(
      {
        label: "Clear",
        code: `Update("title", { name: null, style: { fontSize: { token: "text-2xl" } } })
Update("title", { style: { fontSize: null } })
Responsive("page", "mobile", null)
AddState("signup", { name: "Error", changes: { title: { text: "Try again" } } })
UpdateState("signup", "error", { changes: { title: null } })`
      },
      base,
      hooks()
    )

    expect(result.error).toBeUndefined()
    const after = result.changes.designs[0]!.after!
    expect(findNode(after.root, "title")).toEqual({ type: "text", id: "title", text: "Create an account" })
    expect(after.root.responsive).toBeUndefined()
    expect(after.states![1]).toEqual({ id: "error", name: "Error" })
  })
})

describe("Replace", () => {
  /** The sign-up screen with a mobile patch on the title, a loading state on the button and a size variant. */
  function patched(): AgentSnapshot {
    const read = snapshot()
    const [design] = read.documents[0]!.document.containers
    const page = layoutRoot(design)
    page.responsive = { mobile: { style: { gap: { step: 2 } } } }
    page.children[0]!.responsive = { mobile: { hidden: true }, tablet: { text: "Sign up" } }
    design!.states = [
      ...designStates(design!),
      { id: "loading", name: "Loading", overrides: { submit: { props: { disabled: true } } } }
    ]
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
    expect(after.root.responsive).toEqual({ mobile: { style: { gap: { step: 2 } } } })
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
    expect(change.base!.states![1]!.overrides).toEqual({ submit: { props: { disabled: true } } })
    expect(change.after!.states![1]!.overrides).toBeUndefined()
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
    expect(after.states![1]!.overrides?.[title]).toEqual({ text: "Signing you up…" })
  })
})
