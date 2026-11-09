import { type ContainerSpec, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { accessibilityFindings, addContrastFixes, frameProblems, nodeNames } from "./frames.ts"
import type { FrameContrast, FrameResult } from "./types.ts"

const design: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: {
    type: "layout",
    id: "page",
    name: "Page",
    children: [
      { type: "text", id: "title", text: "Welcome" },
      { type: "component", id: "pay", name: "Pay", component: "Button" },
      { type: "instance", id: "nav", design: "navbar" }
    ]
  },
  states: [{ id: "default", name: "Default" }]
}

const state = design.states[0]!
const mode = resolveModes(defaultModeSettings)[0]!

function frame(result: Partial<FrameResult>): FrameResult {
  return { width: mode.width, height: 600, nodes: [], overflowsX: false, unknownComponents: [], ...result }
}

describe("nodeNames", () => {
  it("names each node as the layers show it, its instances by their design's name", () => {
    const names = nodeNames(design, (id) => (id === "navbar" ? "Navbar" : undefined))
    expect(names.get("page")).toBe("Page")
    expect(names.get("pay")).toBe("Pay")
    expect(names.get("nav")).toContain("Navbar")
  })
})

describe("frameProblems", () => {
  it("says a frame drew nothing wrong", () => {
    expect(frameProblems(design, state, mode, frame({}))).toEqual([])
  })

  it("reports a render error, unknown components and a node past the frame's edge, by layer name", () => {
    const problems = frameProblems(
      design,
      state,
      mode,
      frame({
        error: "boom",
        unknownComponents: ["Card"],
        nodes: [
          { id: "page", x: 0, y: 0, width: mode.width, height: 400 },
          { id: "pay", parent: "page", x: 1245, y: 20, width: 60, height: 32 }
        ]
      })
    )

    expect(problems.map(({ kind, problem }) => [kind, problem])).toEqual([
      ["render-error", "render error: boom"],
      ["unknown-component", `"Card" isn't one of the project's components`],
      ["frame-overflow", "at x 1245, y 20 and 60 × 32px, it sticks out of the 1280px frame by 25px on the right"]
    ])
    expect(problems[2]).toMatchObject({
      state: "default",
      mode: mode.id,
      node: "pay",
      name: "Pay",
      overflow: { right: 25 }
    })
  })

  it("says content is wider than the frame when no node accounts for it", () => {
    expect(frameProblems(design, state, mode, frame({ overflowsX: true }))).toEqual([
      {
        state: "default",
        mode: mode.id,
        kind: "content-wider",
        problem: `content is wider than the ${mode.width}px frame`
      }
    ])
  })
})

const contrast = { foreground: "#999999", background: "#ffffff", ratio: 2.8, required: 4.5, fontSize: 16, bold: false }

const measured: FrameContrast = {
  tokens: { muted: "#999999", ink: "#111111", body: "#333333" },
  texts: [
    { id: "title", foreground: "#999999", background: "#ffffff", ratio: 2.8, required: 4.5, follows: true },
    { id: "nav", foreground: "#999999", background: "#ffffff", ratio: 2.8, required: 4.5, follows: true }
  ]
}

describe("accessibilityFindings", () => {
  it("gives one finding per rule and layer, naming the instance for what's inside it", () => {
    const { found, contrast: inFrame } = accessibilityFindings(
      nodeNames(design),
      state,
      mode,
      frame({
        contrast: measured,
        issues: [
          {
            rule: "color-contrast",
            impact: "serious",
            help: "Elements must meet minimum color contrast ratio thresholds",
            helpUrl: "https://dequeuniversity.com/rules/axe/color-contrast",
            nodes: [
              { id: "title", detail: "low contrast", contrast },
              { id: "nav/link", detail: "low contrast", contrast },
              { id: "nav/other", detail: "low contrast", contrast }
            ]
          }
        ]
      })
    )

    expect(found.map((finding) => [finding.node, finding.name])).toEqual([
      ["title", "Welcome"],
      ["nav", expect.any(String)]
    ])
    // Only a failure on the layer itself can take a fix; one inside an instance can't.
    expect([...inFrame.keys()]).toEqual([found[0]])
  })
})

describe("addContrastFixes", () => {
  it("gives a failing layer the closest passing token, and none to a layer inside an instance", () => {
    const own = {
      state: "default",
      mode: mode.id,
      rule: "color-contrast",
      impact: "serious" as const,
      help: "",
      helpUrl: "",
      node: "title",
      name: "Welcome",
      detail: "",
      contrast: { ...contrast }
    }

    const instance = { ...own, node: "nav", name: "Navbar", contrast: { ...contrast } }
    addContrastFixes(
      design,
      new Map([
        [own, measured],
        [instance, measured]
      ]),
      [measured],
      new Set()
    )
    expect(own.contrast).toMatchObject({ fix: { token: "body", color: "#333333" } })
    expect(instance.contrast).not.toHaveProperty("fix")
  })
})
