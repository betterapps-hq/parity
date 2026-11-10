import type { ComponentInfo, ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { type LintContext, lintDocument, propWarnings } from "./lint.ts"

const button: ComponentInfo = {
  name: "Button",
  path: "src/components/ui/button.tsx",
  props: [
    { name: "variant", kind: "enum", options: ["default", "outline"], group: "variant" },
    { name: "disabled", kind: "boolean", group: "own" }
  ]
}

const context: LintContext = {
  components: ["Button"],
  tokens: [{ name: "primary" }, { name: "gutter" }],
  iconSets: [{ id: "lucide" }],
  library: new Map(),
  props: { Button: button },
  inserted: new Set()
}

function design(root: ContainerSpec["root"], states: ContainerSpec["states"] = [{ id: "default", name: "Default" }]) {
  return { version: 3 as const, containers: [{ id: "home", name: "Home", position: { x: 0, y: 0 }, root, states }] }
}

describe("lintDocument", () => {
  it("passes a design that uses only the project's components, icons and tokens", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: { background: "primary", radius: "radius-full", gap: "gutter", padding: 4 },
      children: [
        { type: "component" as const, id: "save", component: "Button" },
        { type: "component" as const, id: "heart", component: "lucide/Heart" }
      ]
    }

    expect(lintDocument(design(root), context)).toEqual([])
  })

  it("names components, component designs, tokens and length tokens the project doesn't have, where they are", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      name: "Page",
      style: { background: "pink", width: "wide" },
      responsive: { mobile: { style: { foreground: "teal" } } },
      children: [
        { type: "component" as const, id: "card", component: "Card" },
        { type: "instance" as const, id: "nav", design: "navbar" }
      ]
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "dark", name: "Dark", overrides: { page: { style: { border: "ink" } } } }
    ]

    expect(lintDocument(design(root, states), context)).toEqual([
      {
        category: "not_a_token",
        message: `background "pink" isn't a token. Use a name from GetTokens().`,
        at: "home/page"
      },
      {
        category: "not_a_length_token",
        message: `width "wide" isn't a length token. Use a spacing step (a number) instead.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `foreground "teal" isn't a token. Use a name from GetTokens().`,
        at: "home/page"
      },
      {
        category: "unknown_component",
        message: `"Card" isn't one of the project's components; it renders as a placeholder. Check Components().`,
        at: "home/card"
      },
      { category: "unknown_component_design", message: `no component design "navbar"`, at: "home/nav" },
      { category: "not_a_token", message: `border "ink" isn't a token`, at: "home state dark/page" }
    ])
  })

  it("names the call that lists the tokens nearest a raw color or length (PAR-833)", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      // A color where a length goes, and a length where a color goes, can't be compared, so they get the plain hint.
      style: { background: "#2f6fed", radius: "6px", size: "#ffffff", foreground: "13px" },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "dark", name: "Dark", overrides: { page: { style: { border: "oklch(0.3 0 0)" } } } }
    ]

    expect(lintDocument(design(root, states), context).map((warning) => warning.message)).toEqual([
      `background "#2f6fed" isn't a token. Use a name from GetTokens({ nearest: "#2f6fed", category: "color" }), which lists the nearest first.`,
      `foreground "13px" isn't a token. Use a name from GetTokens().`,
      `radius "6px" isn't a token. Use a name from GetTokens({ nearest: "6px", category: "radius" }), which lists the nearest first.`,
      `size "#ffffff" isn't a token. Use a name from GetTokens().`,
      `border "oklch(0.3 0 0)" isn't a token. Use a name from GetTokens({ nearest: "oklch(0.3 0 0)", category: "color" }), which lists the nearest first.`
    ])
  })

  it("checks the props and names of only what the call inserted", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      children: [
        { type: "component" as const, id: "save", component: "Button", props: { variant: "ghost" } },
        { type: "component" as const, id: "old", component: "Button", props: { variant: "ghost" } }
      ]
    }

    const found = lintDocument(design(root), { ...context, inserted: new Set(["page", "save"]) })
    expect(found.map((warning) => [warning.category, warning.at])).toEqual([
      ["unnamed_layout", "home/page"],
      ["invalid_option", "home/save"]
    ])
  })
})

describe("propWarnings", () => {
  it("names props the component doesn't declare and values outside a prop's options, but not data attributes", () => {
    expect(propWarnings(button, "Button", { size: "lg", "data-test": "x", variant: "ghost" }, "home/save")).toEqual([
      { category: "unknown_prop", message: `Button has no prop "size". Check Props("Button").`, at: "home/save" },
      {
        category: "invalid_option",
        message: `Button variant is one of "default", "outline", not "ghost"`,
        at: "home/save"
      }
    ])
  })

  it("says nothing about a component whose props aren't inferred yet", () => {
    expect(propWarnings(undefined, "Card", { anything: 1 }, "home/card")).toEqual([])
  })
})
