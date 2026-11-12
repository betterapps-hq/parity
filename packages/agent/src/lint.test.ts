import type { ComponentInfo, ContainerSpec, NodeStyle } from "@parity-app/core"
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
  tokens: [
    { name: "primary", category: "color" },
    { name: "gutter", category: "spacing" }
  ],
  iconSets: [{ id: "lucide" }],
  library: new Map(),
  props: { Button: button },
  inserted: new Set()
}

function design(root: ContainerSpec["root"], states: ContainerSpec["states"] = [{ id: "default", name: "Default" }]) {
  return { version: 4 as const, containers: [{ id: "home", name: "Home", position: { x: 0, y: 0 }, root, states }] }
}

describe("lintDocument", () => {
  it("passes a design that uses only the project's components, icons and tokens", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        fills: [{ type: "solid" as const, color: { token: "primary" } }],
        borderRadius: { token: "radius-full" },
        gap: { token: "gutter" },
        padding: { step: 4 }
      },
      children: [
        { type: "component" as const, id: "save", component: "Button" },
        { type: "component" as const, id: "heart", component: "lucide/Heart" }
      ]
    }

    expect(lintDocument(design(root), context)).toEqual([])
  })

  it("checks every color and gradient token in a stack of paints, in the design and its states", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        fills: [
          { type: "gradient" as const, token: "gradient-sunset" },
          {
            type: "linear" as const,
            stops: [
              { color: { token: "primary" }, position: 0 },
              { color: { value: "#ff00aa" }, position: 100 }
            ]
          },
          { type: "image" as const, src: "/images/hero.jpg", fit: "fill" as const },
          { type: "solid" as const, color: { token: "primary" } }
        ]
      },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      {
        id: "dark",
        name: "Dark",
        overrides: { page: { style: { fills: [{ type: "solid" as const, color: { token: "ink" } }] } } }
      }
    ]

    expect(lintDocument(design(root, states), context).map((warning) => warning.message)).toEqual([
      `fills "#ff00aa" isn't a token. Use a name from GetTokens({ nearest: "#ff00aa", category: "color" }), which lists the nearest first.`,
      `fills "gradient-sunset" isn't a token. Use a name from GetTokens().`,
      `fills "ink" isn't a token. The project's only color token is primary. Use it, or add ink with SetTokens.`
    ])
  })

  it("names components, component designs, tokens and length tokens the project doesn't have, where they are", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      name: "Page",
      style: {
        fills: [{ type: "solid" as const, color: { token: "pink" } }],
        width: { token: "wide" },
        zIndex: { token: "front" }
      },
      responsive: { mobile: { style: { color: { token: "teal" } } } },
      children: [
        { type: "component" as const, id: "card", component: "Card" },
        { type: "instance" as const, id: "nav", design: "navbar" }
      ]
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "dark", name: "Dark", overrides: { page: { style: { borderColor: { token: "ink" } } } } }
    ]

    expect(lintDocument(design(root, states), context)).toEqual([
      {
        category: "not_a_token",
        message: `fills "pink" isn't a token. The project's only color token is primary. Use it, or add pink with SetTokens.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `zIndex "front" isn't a token. Use a whole number ({ step: 10 }) instead.`,
        at: "home/page"
      },
      {
        category: "not_a_length_token",
        message: `width "wide" isn't a length token. Use spacing steps ({ step: 4 }) instead.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `color "teal" isn't a token. The project's only color token is primary. Use it, or add teal with SetTokens.`,
        at: "home/page"
      },
      {
        category: "unknown_component",
        message: `"Card" isn't one of the project's components; it renders as a placeholder. Check Components().`,
        at: "home/card"
      },
      { category: "unknown_component_design", message: `no component design "navbar"`, at: "home/nav" },
      {
        category: "not_a_token",
        message: `borderColor "ink" isn't a token. The project's only color token is primary. Use it, or add ink with SetTokens.`,
        at: "home state dark/page"
      }
    ])
  })

  it("names the duration and easing tokens a transition uses that the project doesn't have (PAR-934)", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        transition: [
          {
            property: "colors",
            duration: { step: 200 },
            easing: { keyword: "ease-out" as const },
            delay: { token: "duration-fast" }
          },
          { property: "transform", easing: { token: "ease-snappy" } },
          { property: "width", easing: { value: "cubic-bezier(0.2, 0.8, 0.2, 1)" } },
          { property: "opacity", easing: { spring: { duration: 400, bounce: 0.2 } } }
        ]
      },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      {
        id: "hover",
        name: "Hover",
        overrides: { page: { style: { transition: [{ property: "all", duration: { token: "slow" } }] } } }
      }
    ]

    expect(lintDocument(design(root, states), { ...context, tokens: [{ name: "ease-snappy" }] })).toEqual([
      {
        category: "not_a_token",
        message: `transition[0].delay "duration-fast" isn't a token. Use a name from GetTokens().`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `transition[0].duration "slow" isn't a token. Use a name from GetTokens().`,
        at: "home state hover/page"
      }
    ])
  })

  it("names tokens inside shadows, filters and the translate that the project doesn't have (PAR-933)", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        boxShadow: [
          { type: "drop" as const, token: "shadow-huge", color: { token: "primary" } },
          { type: "ring" as const, width: 1, color: { value: "#ff0000" } }
        ],
        filter: [{ type: "dropShadow" as const, shadow: { type: "drop" as const, token: "drop-shadow-xl" } }],
        backdropFilter: [{ type: "blur" as const, value: { token: "blur-max" } }],
        translate: { x: { token: "gutter" }, y: { token: "far" } }
      },
      children: []
    }

    expect(lintDocument(design(root), context).map(({ message }) => message)).toEqual([
      `boxShadow[0].token "shadow-huge" isn't a token, and the project has no shadow tokens. Add shadow-huge with SetTokens.`,
      `boxShadow[1].color "#ff0000" isn't a token. Use a name from GetTokens({ nearest: "#ff0000", category: "color" }), which lists the nearest first.`,
      `filter[0].shadow.token "drop-shadow-xl" isn't a token, and the project has no shadow tokens. Add drop-shadow-xl with SetTokens.`,
      `backdropFilter[0].value "blur-max" isn't a token. Use a name from GetTokens().`,
      `translate.y "far" isn't a length token. Use spacing steps ({ step: 4 }) instead.`
    ])
  })

  it("names the call that lists the tokens nearest a raw color or length (PAR-833)", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      // A color named where a length goes, and a length where a color goes, can't be compared, so they get the plain hint.
      style: {
        fills: [{ type: "solid" as const, color: { value: "#2f6fed" } }],
        borderRadius: { value: "6px" },
        fontSize: { token: "#ffffff" },
        color: { token: "13px" }
      },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "dark", name: "Dark", overrides: { page: { style: { borderColor: { value: "oklch(0.3 0 0)" } } } } }
    ]

    const tokens = [...context.tokens, { name: "radius-md", category: "radius" }]

    expect(lintDocument(design(root, states), { ...context, tokens }).map((warning) => warning.message)).toEqual([
      `fills "#2f6fed" isn't a token. Use a name from GetTokens({ nearest: "#2f6fed", category: "color" }), which lists the nearest first.`,
      `color "13px" isn't a token. The project's only color token is primary. Use it.`,
      `borderRadius "6px" isn't a token. Use a name from GetTokens({ nearest: "6px", category: "radius" }), which lists the nearest first.`,
      `fontSize "#ffffff" isn't a token, and the project has no font-size tokens. Add one with SetTokens.`,
      `borderColor "oklch(0.3 0 0)" isn't a token. Use a name from GetTokens({ nearest: "oklch(0.3 0 0)", category: "color" }), which lists the nearest first.`
    ])
  })

  it("lists the project's tokens of the kind a style takes, or says it has none, and that SetTokens adds one (PAR-911)", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        fontSize: { token: "text-2xl" },
        boxShadow: [{ type: "drop" as const, token: "shadow-md" }],
        fills: [{ type: "solid" as const, color: { token: "pink" } }],
        borderRadius: { value: "6px" },
        lineHeight: { token: "1.2 !important" }
      },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "big", name: "Big", overrides: { page: { style: { fontSize: { token: "text-3xl" } } } } }
    ]

    // A compiled kit's stylesheet: three sizes, no shadows or radii, and more colors than a warning lists.
    const tokens = [
      ...["text-base", "text-sm", "text-xs"].map((name) => ({ name, category: "font-size" })),
      ...Array.from({ length: 9 }, (_, index) => ({ name: `chart-${index + 1}`, category: "color" })),
      { name: "leading-tight", category: "leading" }
    ]

    expect(lintDocument(design(root, states), { ...context, tokens })).toEqual([
      {
        category: "not_a_token",
        message: `fills "pink" isn't a token. Use a name from GetTokens({ category: "color" }), or add pink with SetTokens.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `borderRadius "6px" isn't a token, and the project has no radius tokens. Add one with SetTokens.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `boxShadow[0].token "shadow-md" isn't a token, and the project has no shadow tokens. Add shadow-md with SetTokens.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `fontSize "text-2xl" isn't a token. The project's font-size tokens are text-xs, text-sm and text-base. Use one, or add text-2xl with SetTokens.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `lineHeight "1.2 !important" isn't a token. The project's only leading token is leading-tight. Use it.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `fontSize "text-3xl" isn't a token. The project's font-size tokens are text-xs, text-sm and text-base. Use one, or add text-3xl with SetTokens.`,
        at: "home state big/page"
      }
    ])
  })

  it("warns about a color, radius or type value written out where a token goes, as it does a name that isn't one", () => {
    const root = {
      type: "layout" as const,
      id: "page",
      style: {
        color: { value: "#111827", alpha: { token: "opacity-muted" } },
        borderRadius: { value: "6px" },
        fontFamily: { value: "Inter, sans-serif" },
        fontSize: { value: "13px" },
        lineHeight: { value: "1.4" },
        letterSpacing: { value: "0.02em" }
      },
      children: [
        {
          type: "text" as const,
          id: "title",
          text: "Plans",
          // Steps of the spacing scale, a keyword and an expression aren't tokens' to give.
          style: {
            lineHeight: { step: 6 },
            color: { keyword: "currentColor" },
            fontSize: { expr: "clamp(1rem, 2vw, 2rem)" }
          }
        }
      ]
    }

    const tokens = [
      ...context.tokens,
      { name: "radius-md", category: "radius" },
      { name: "font-sans", category: "font" },
      { name: "text-sm", category: "font-size" },
      { name: "leading-tight", category: "leading" }
    ]

    expect(lintDocument(design(root), { ...context, tokens })).toEqual([
      {
        category: "not_a_token",
        message: `color "#111827" isn't a token. Use a name from GetTokens({ nearest: "#111827", category: "color" }), which lists the nearest first.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `color.alpha "opacity-muted" isn't a token. Use a name from GetTokens().`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `borderRadius "6px" isn't a token. Use a name from GetTokens({ nearest: "6px", category: "radius" }), which lists the nearest first.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `fontFamily "Inter, sans-serif" isn't a token. The project's only font token is font-sans. Use it.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `fontSize "13px" isn't a token. Use a name from GetTokens({ nearest: "13px", category: "font-size" }), which lists the nearest first.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `lineHeight "1.4" isn't a token. The project's only leading token is leading-tight. Use it.`,
        at: "home/page"
      },
      {
        category: "not_a_token",
        message: `letterSpacing "0.02em" isn't a token, and the project has no tracking tokens. Add one with SetTokens.`,
        at: "home/page"
      }
    ])
  })

  it("names a value its CSS property doesn't take, in a key and in the CSS map, and a property that isn't one", () => {
    const root: ContainerSpec["root"] = {
      type: "layout",
      id: "page",
      style: {
        display: "grid",
        gridTemplateColumns: [{ fr: 1 }, { value: "240px" }, { value: "wide" }],
        gap: { expr: "rgb(0 0 0)" },
        width: { value: "50%" },
        maxWidth: { keyword: "none" },
        padding: [{ step: 4 }, { value: "red" }],
        color: { value: "13px" },
        backdropFilter: [{ type: "blur", value: { value: "4px" } }],
        transition: [{ property: "opacity", easing: { value: "cubic-bezier(0.2, 0.8)" } }],
        css: {
          "scroll-snap-type": { value: "x mandatory" },
          "scroll-behavior": { value: "gliding", off: true },
          "scrol-margin": { value: "4px" },
          "--card-accent": { value: "anything at all" }
        }
      },
      children: []
    }

    const states = [
      { id: "default", name: "Default" },
      { id: "wide", name: "Wide", overrides: { page: { style: { minWidth: { value: "bold" } } } } }
    ]

    expect(lintDocument(design(root, states), context)).toEqual([
      { category: "invalid_value", message: `color "13px" isn't a value color takes.`, at: "home/page" },
      {
        category: "invalid_value",
        message: `transition[0].easing "cubic-bezier(0.2, 0.8)" isn't a value transition-timing-function takes.`,
        at: "home/page"
      },
      { category: "invalid_value", message: `gap "rgb(0 0 0)" isn't a value gap takes.`, at: "home/page" },
      { category: "invalid_value", message: `padding "red" isn't a value padding takes.`, at: "home/page" },
      {
        category: "invalid_value",
        message: `gridTemplateColumns "wide" isn't a value grid-template-columns takes.`,
        at: "home/page"
      },
      {
        category: "invalid_value",
        message: `css.scroll-behavior "gliding" isn't a value scroll-behavior takes.`,
        at: "home/page"
      },
      { category: "invalid_value", message: `css "scrol-margin" isn't a CSS property.`, at: "home/page" },
      {
        category: "invalid_value",
        message: `minWidth "bold" isn't a value min-width takes.`,
        at: "home state wide/page"
      }
    ])
  })

  it("names an opacity, border width or font weight token the project doesn't have, and passes their numbers", () => {
    const layout = (style: NodeStyle) => ({ type: "layout" as const, id: "page", style, children: [] })

    expect(
      lintDocument(
        design(layout({ opacity: { step: 50 }, borderWidth: { step: 2 }, fontWeight: { value: 600 } })),
        context
      )
    ).toEqual([])

    const named = lintDocument(
      design(
        layout({
          opacity: { token: "faint" },
          borderWidth: { token: "hairline" },
          fontWeight: { token: "heavy" }
        })
      ),
      context
    )

    expect(named.map((warning) => warning.category)).toEqual(["not_a_token", "not_a_token", "not_a_token"])
    expect(named.map((warning) => warning.message.split(" isn't")[0])).toEqual([
      'opacity "faint"',
      'borderWidth "hairline"',
      'fontWeight "heavy"'
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

  it("says nothing about a prop set to null, which takes it away (PAR-885)", () => {
    expect(propWarnings(button, "Button", { variant: null, size: null }, "home/save")).toEqual([])
  })

  it("says nothing about a component whose props aren't inferred yet", () => {
    expect(propWarnings(undefined, "Card", { anything: 1 }, "home/card")).toEqual([])
  })
})
