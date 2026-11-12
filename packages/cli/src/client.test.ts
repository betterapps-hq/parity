import { describe, expect, it } from "vite-plus/test"
import {
  type AccessibilityFinding,
  describeAccessibility,
  describeComponents,
  describeConsole,
  describeExec,
  describeModes,
  describeProblems,
  describeStatus,
  describeTokens
} from "./client.ts"

const tab = { id: "D:/app", name: "app" }

describe("describeConsole", () => {
  it("says which design wrote a message, in which state and mode, when the app knows (PAR-147)", () => {
    const at = Date.UTC(2026, 10, 5, 18, 30)

    const entry = {
      level: "error" as const,
      text: "Cannot read properties of undefined (reading 'price')",
      source: "http://127.0.0.1:5173/src/plan-price.tsx?t=1730",
      line: 12,
      count: 1,
      first: at,
      last: at
    }

    const text = describeConsole({
      tab,
      total: 2,
      truncated: false,
      entries: [
        { ...entry, where: "canvas", design: "app.par#pricing", state: "yearly", mode: "desktop-light" },
        { ...entry, where: "offscreen" }
      ]
    })

    const places = text.split("\n").filter((line) => line.startsWith("  at "))
    expect(places).toEqual([
      "  at /src/plan-price.tsx:12, from design pricing (yearly, desktop-light)",
      "  at /src/plan-price.tsx:12, in an offscreen render"
    ])
  })
})

describe("describeProblems", () => {
  it("lists each problem once, with the frames it's in", () => {
    const text = describeProblems({
      tab,
      design: { id: "dashboard", name: "Dashboard" },
      frames: 4,
      warnings: [],
      problems: [
        { state: "default", mode: "mobile", problem: "content is wider than the 390px frame" },
        { state: "loading", mode: "mobile", problem: "content is wider than the 390px frame" },
        { state: "default", mode: "desktop", problem: "cut off by a parent that clips", node: "stats" },
        { state: "loading", mode: "desktop", problem: "cut off by a parent that clips", node: "stats" },
        { state: "default", mode: "mobile", problem: "cut off by a parent that clips", node: "stats" },
        { state: "loading", mode: "mobile", problem: "cut off by a parent that clips", node: "stats" }
      ]
    })

    expect(text).toBe(
      [
        "2 problems in Dashboard (dashboard), 4 frames:",
        "  content is wider than the 390px frame, in default, loading in mobile",
        "  stats: cut off by a parent that clips, in every frame"
      ].join("\n")
    )
  })

  it("names the layer a layout problem is on, and says what it overflows by how much", () => {
    const text = describeProblems({
      tab,
      design: { id: "checkout", name: "Checkout" },
      frames: 2,
      warnings: [],
      problems: [
        {
          state: "default",
          mode: "mobile",
          kind: "frame-overflow",
          problem: "at x 340, y 100 and 60 × 36px, it sticks out of the 390px frame by 10px on the right",
          node: "pay",
          name: "Pay",
          box: { x: 340, y: 100, width: 60, height: 36 },
          container: { box: { x: 0, y: 0, width: 390, height: 600 } },
          overflow: { right: 10 }
        }
      ]
    })

    expect(text).toBe(
      [
        "1 problem in Checkout (checkout), 2 frames:",
        "  Pay (pay): at x 340, y 100 and 60 × 36px, it sticks out of the 390px frame by 10px on the right, in default in mobile"
      ].join("\n")
    )
  })

  it("says when there's nothing to fix", () => {
    const text = describeProblems({ tab, design: { id: "home", name: "Home" }, frames: 1, warnings: [], problems: [] })
    expect(text).toBe("No problems found in Home (home), 1 frame.")
  })
})

describe("describeComponents", () => {
  it("lists the project's components, then the exports left out and why", () => {
    const text = describeComponents({
      components: ["PromoTag", "ui/Button"],
      leftOut: [
        { name: "PromoPrice", path: "src/promo.tsx", reason: "returns string only" },
        { name: "Loose", path: "src/promo.tsx", reason: "its type is any", undecided: true }
      ]
    })

    expect(text).toBe(
      [
        "The project's own:",
        "  PromoTag",
        "",
        "ui, as ui/Name:",
        "  Button",
        "",
        "Not components:",
        "  PromoPrice, in src/promo.tsx: returns string only",
        "  Loose, in src/promo.tsx: can't tell, its type is any"
      ].join("\n")
    )
  })

  it("lists the project's own by the file each is written in", () => {
    const text = describeComponents({
      components: ["Card", "Button", "CardTitle", "Promo", "ui/Badge"],
      files: { Button: "src/ui/button.tsx", Card: "src/ui/card.tsx", CardTitle: "src/ui/card.tsx" }
    })

    expect(text).toBe(
      [
        "The project's own, by file:",
        "  src/ui/button.tsx: Button",
        "  src/ui/card.tsx: Card, CardTitle",
        "  file not known yet: Promo",
        "",
        "ui, as ui/Name:",
        "  Badge"
      ].join("\n")
    )
  })

  it("says which components fail to draw and why, and what was corrected by hand", () => {
    const text = describeComponents({
      components: ["PromoGate", "PromoPrice"],
      drawn: 12,
      failing: [
        {
          id: "PromoGate",
          problem: "provider",
          reason: "Needs a provider, which a decorator can add: PromoGate must be used within a PromoProvider"
        }
      ],
      corrections: {
        include: [{ path: "src/promo.tsx", export: "PromoPrice" }]
      }
    })

    expect(text).toBe(
      [
        "The project's own:",
        "  PromoGate, PromoPrice",
        "",
        "Failing to draw on the canvas, 1 of 13 drawn so far:",
        "  PromoGate: Needs a provider, which a decorator can add: PromoGate must be used within a PromoProvider",
        "",
        "Corrected by hand in the project file:",
        "  listed: PromoPrice, in src/promo.tsx"
      ].join("\n")
    )
  })
})

describe("describeAccessibility", () => {
  const finding = (node: string, state: string): AccessibilityFinding => ({
    state,
    mode: "desktop",
    rule: "color-contrast",
    impact: "serious",
    help: "Elements must meet minimum color contrast ratio thresholds",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.14/color-contrast",
    node,
    name: "Member row",
    detail: "#737373 on #f5f5f5 is 4.34:1, and 14px text needs 4.5:1."
  })

  it("puts alike layers, such as list rows, on one line", () => {
    const text = describeAccessibility({
      tab,
      design: { id: "team", name: "Team" },
      frames: 3,
      warnings: [],
      findings: [
        finding("row-1", "default"),
        finding("row-2", "default"),
        finding("row-1", "error"),
        finding("row-2", "error")
      ]
    })

    expect(text).toContain(
      "  Member row (row-1, row-2), in default, error in desktop: #737373 on #f5f5f5 is 4.34:1, and 14px text needs 4.5:1."
    )
    expect(text.split("\n")[0]).toBe("1 rule broken in Team (team), 3 frames, with axe-core against WCAG 2.2 AA.")
  })

  it("gives a contrast failure's fix as the style to set, or says no token passes", () => {
    const fixed = { ...finding("row-1", "default"), contrast: { fix: { token: "foreground", ratio: 18.16 } } }
    const unfixable = { ...finding("row-2", "error"), name: "Badge", contrast: { fix: "none" as const } }

    const text = describeAccessibility({
      tab,
      design: { id: "team", name: "Team" },
      frames: 2,
      warnings: [],
      findings: [fixed, unfixable]
    })

    expect(text).toContain(
      '  Member row (row-1), in default in desktop: #737373 on #f5f5f5 is 4.34:1, and 14px text needs 4.5:1.\n    Fix: set style.color to { token: "foreground" }, which reaches 18.16:1 in every frame checked.'
    )
    expect(text).toContain(
      "\n    Fix: none of the project's color tokens pass on this background; change the background."
    )
  })
})

describe("describeModes", () => {
  it("tells viewport ids, which Responsive takes, from mode ids, which renders take, with each frame's window", () => {
    const text = describeModes({
      tab: { id: "shop", name: "Shop" },
      variables: [
        { id: "viewport", name: "Viewport", kind: "viewport", options: [{ id: "mobile", name: "Mobile", width: 390 }] },
        {
          id: "theme",
          name: "Theme",
          kind: "theme",
          options: [
            { id: "light", name: "Light" },
            { id: "dark", name: "Dark", className: "dark" }
          ]
        }
      ],
      viewports: [{ id: "mobile", name: "Mobile", width: 390, height: 844 }],
      modes: [
        {
          id: "mobile-dark",
          name: "Mobile Dark",
          primary: true,
          viewport: "mobile",
          width: 390,
          height: 844,
          values: { viewport: "mobile", theme: "dark" },
          classNames: ["dark"],
          attributes: {}
        }
      ],
      designs: [
        {
          id: "home",
          name: "Home",
          state: "empty",
          states: ["default", "empty"],
          main: "mobile-dark",
          beside: [],
          frames: [{ mode: "mobile-dark", width: 390, height: 600, window: { width: 390, height: 600 } }]
        }
      ]
    })

    expect(text).toBe(
      [
        "Viewports, the ids Responsive(node, viewport, patch) takes:",
        "  mobile: 390 wide, in a window 844 tall (Mobile)",
        "",
        "Other variables:",
        "  theme (theme): light, dark (class dark)",
        "",
        "Modes, the ids screenshots and checks take, primary first:",
        "  mobile-dark (primary): viewport mobile, theme dark; 390 by 844",
        "",
        "Design:",
        "  home (Home): every state (default, empty); main mode mobile-dark",
        "    mobile-dark: 390 by 600, in a 390 by 600 window"
      ].join("\n")
    )
  })
})

describe("describeStatus", () => {
  it("says what's applied but unsaved, that the person saves it, and what undo holds", () => {
    const text = describeStatus({
      tab: { id: "shop", name: "Shop" },
      revision: "a1b2c3d4:4",
      dirty: true,
      autosave: false,
      unsaved: [
        { path: "app.par", kind: "document", designs: { added: ["pricing"], changed: ["home"], removed: [] } },
        { path: "src/index.css", kind: "stylesheet", tokens: ["primary default"], more: 1 }
      ],
      tokenEdits: 2,
      save: { status: "failed", error: "The disk is full" },
      errors: [{ path: "app.par", error: "The disk is full" }],
      undo: { count: 4, labels: ["Edit --primary"] },
      redo: { count: 0, labels: [] }
    })

    expect(text).toBe(
      [
        "Shop is at revision a1b2c3d4:4.",
        "2 files aren't saved. They wait for the person to save; agents can't.",
        "  app.par: added pricing; changed home",
        "  src/index.css: token values primary default; and 1 more",
        "",
        "Failed to write:",
        "  app.par: The disk is full",
        "",
        "Undo has 4 steps: Edit --primary."
      ].join("\n")
    )
  })

  it("says when everything is saved", () => {
    const text = describeStatus({
      tab: { id: "shop", name: "Shop" },
      revision: "a1b2c3d4:0",
      dirty: false,
      autosave: true,
      unsaved: [],
      tokenEdits: 0,
      save: { status: "saved" },
      errors: [],
      undo: { count: 0 },
      redo: { count: 2 }
    })

    expect(text).toBe(
      [
        "Shop is at revision a1b2c3d4:0.",
        "Everything applied is saved.",
        "",
        "Undo has 0 steps.",
        "Redo has 2 steps."
      ].join("\n")
    )
  })
})

describe("describeTokens", () => {
  it("groups tokens by category and lists the default theme first", () => {
    const text = describeTokens({
      tokens: [
        {
          name: "muted-foreground",
          category: "color",
          source: "semantic",
          values: { dark: "#a1a1a1", default: "#737373" }
        }
      ],
      total: 1,
      truncated: false
    })

    expect(text).toContain("color, semantic:\n  muted-foreground: default #737373, dark #a1a1a1")
  })

  it("says how many matched when a limit left some out, and how to see the rest", () => {
    const token = { name: "primary", category: "color", source: "semantic", values: { default: "#000" } }
    const text = describeTokens({ tokens: [token], total: 532, truncated: true })
    expect(text.split("\n").slice(0, 2)).toEqual([
      '532 tokens, the first 1 shown. Name them in styles without "--".',
      "Narrow them with category, source or search, or raise limit, to see the rest."
    ])
  })

  it("keeps the tokens nearest a value in their order, each with how far it is (PAR-833)", () => {
    const text = describeTokens({
      tokens: [
        { name: "color-blue-500", category: "color", source: "theme", values: { default: "#2b7fff" }, distance: 0.046 },
        { name: "primary", category: "color", source: "semantic", values: { default: "#155dfc" }, distance: 0.052 }
      ],
      total: 2,
      truncated: false
    })

    expect(text).toBe(
      [
        '2 tokens, nearest first. Name them in styles without "--".',
        "",
        "  color-blue-500 (color, theme, distance 0.046): default #2b7fff",
        "  primary (color, semantic, distance 0.052): default #155dfc"
      ].join("\n")
    )
  })
})

describe("describeExec", () => {
  const done = { ok: true, applied: true, output: [], created: {}, screenshots: [] }

  it("puts render failures, warnings and suggestions under their own headings", () => {
    const text = describeExec({
      ...done,
      warnings: [
        "Home (Default, Mobile): failed to render: boom",
        'home/cta: Button has no prop "tone". Check Props("Button").',
        "12 places (home/a, home/b, home/c, home/d, home/e and 7 more): name layouts that group things"
      ],
      warningGroups: [
        { category: "render_failed", severity: "error", message: "failed to render: boom", count: 1, at: ["x"] },
        { category: "unknown_prop", severity: "warning", message: "no prop", count: 1, at: ["home/cta"] },
        { category: "unnamed_layout", severity: "suggestion", message: "name layouts", count: 12, at: [] }
      ]
    })

    expect(text).toBe(
      [
        "Done. The changes are on the canvas as one undoable step.",
        "",
        "Render failures (these frames weren't checked):",
        "  Home (Default, Mobile): failed to render: boom",
        "",
        "Warnings (fix these next):",
        '  home/cta: Button has no prop "tone". Check Props("Button").',
        "",
        "Suggestions:",
        "  12 places (home/a, home/b, home/c, home/d, home/e and 7 more): name layouts that group things"
      ].join("\n")
    )
  })

  it("reads every line as a warning from an app that sends no groups", () => {
    expect(describeExec({ ...done, warnings: ["home/a: something"] })).toContain(
      "Warnings (fix these next):\n  home/a: something"
    )
  })
})
