import { describe, expect, it } from "vite-plus/test"
import type { DesignNode } from "./document.ts"
import { calcPixels, iconComponent, importLine, layerCode, layerTokens } from "./layer-code.ts"
import type { LibraryInfo } from "./project.ts"

const known: Record<string, { export: string; import: string }> = {
  Button: { export: "Button", import: "@/components/ui/button" },
  Badge: { export: "Badge", import: "@/components/ui/badge" },
  "ui/Card": { export: "Card", import: "@/components/ui/card" },
  Logo: { export: "default", import: "@/components/logo" }
}
const component = (id: string) => known[id]

describe("layerCode", () => {
  it("writes a layout as a div with its classes, and what's inside it", () => {
    const card: DesignNode = {
      id: "card",
      type: "layout",
      style: { gap: 4, padding: [4, 6], background: "card", radius: "radius-lg", border: "border", width: 80 },
      children: [
        { id: "title", type: "text", tag: "h2", text: "Sign in", style: { size: "text-lg", weight: 600 } },
        { id: "gone", type: "text", text: "Hidden", hidden: true },
        { id: "go", type: "component", component: "Button", props: { variant: "outline" }, slots: {} }
      ]
    }
    const code = layerCode(card, { component, parent: "row" })
    expect(code.classes).toBe("flex flex-col gap-4 bg-card border border-border rounded-lg px-6 py-4 w-80 shrink-0")
    expect(code.jsx).toBe(
      [
        "<div",
        '  className="flex flex-col gap-4 bg-card border border-border rounded-lg px-6 py-4 w-80 shrink-0"',
        ">",
        '  <h2 className="text-lg font-semibold">Sign in</h2>',
        '  <Button variant="outline" />',
        "</div>"
      ].join("\n")
    )
    expect(code.imports).toEqual(['import { Button } from "@/components/ui/button"'])
  })

  it("writes a component instance with its props, children and named slots, and its import", () => {
    const button: DesignNode = {
      id: "go",
      type: "component",
      component: "Button",
      props: { size: "sm", disabled: true, count: 2, label: 'Say "hi"' },
      style: { grow: true },
      slots: {
        children: [{ id: "label", type: "text", tag: "span", text: "Continue" }],
        icon: [{ id: "badge", type: "component", component: "Badge" }]
      }
    }
    const code = layerCode(button, { component, parent: "row" })
    expect(code.jsx).toBe(
      [
        "<Button",
        '  size="sm"',
        "  disabled",
        "  count={2}",
        '  label={"Say \\"hi\\""}',
        "  icon={<Badge />}",
        '  className="flex-1 min-w-0"',
        ">",
        "  <span>Continue</span>",
        "</Button>"
      ].join("\n")
    )
    expect(code.imports).toEqual([
      'import { Button } from "@/components/ui/button"',
      'import { Badge } from "@/components/ui/badge"'
    ])
  })

  it("names a component by its export, a default one by its id, and imports it once per module", () => {
    const row: DesignNode = {
      id: "row",
      type: "layout",
      style: { direction: "row", align: "center", justify: "between" },
      children: [
        { id: "a", type: "component", component: "Logo" },
        { id: "b", type: "component", component: "ui/Card" },
        { id: "c", type: "component", component: "ui/Card" },
        { id: "d", type: "component", component: "nova/Unknown" }
      ]
    }
    const code = layerCode(row, { component })
    expect(code.jsx.split("\n").slice(1, -1)).toEqual(["  <Logo />", "  <Card />", "  <Card />", "  <Unknown />"])
    expect(code.classes).toBe("flex items-center justify-between")
    expect(code.imports).toEqual([
      'import Logo from "@/components/logo"',
      'import { Card } from "@/components/ui/card"'
    ])
  })

  it("writes text given as children between the tags, and ends a long self-closing tag on its own line", () => {
    const title: DesignNode = { id: "t", type: "component", component: "Badge", props: { children: "New" } }
    expect(layerCode(title, { component }).jsx).toBe("<Badge>New</Badge>")
    const long: DesignNode = {
      id: "l",
      type: "component",
      component: "Badge",
      props: { title: "A long title that takes the opening tag well past the eighty columns" }
    }
    expect(layerCode(long, { component }).jsx).toBe(
      '<Badge\n  title="A long title that takes the opening tag well past the eighty columns"\n/>'
    )
  })

  it("writes a hidden layer that was asked for, leaving out the hidden ones inside it", () => {
    const alert: DesignNode = {
      id: "a",
      type: "layout",
      hidden: true,
      style: { background: "destructive" },
      children: [{ id: "b", type: "text", text: "Gone", hidden: true }]
    }
    expect(layerCode(alert).jsx).toBe('<div className="flex flex-col bg-destructive" />')
    expect(layerTokens(alert)).toEqual([{ name: "destructive", keys: ["background"] }])
  })

  it("writes a component design's copy by the design's name, with its values", () => {
    const copy: DesignNode = { id: "x", type: "instance", design: "d1", args: { name: "Ada" } }
    expect(layerCode(copy, { designName: () => "profile card" }).jsx).toBe('<ProfileCard name="Ada" />')
  })

  it("writes images, text that JSX would read and long text", () => {
    const image: DesignNode = { id: "i", type: "image", src: "/a.jpg", alt: "A", fit: "contain" }
    expect(layerCode(image).jsx).toBe('<img src="/a.jpg" alt="A" className="block object-contain" />')
    const braces: DesignNode = { id: "t", type: "text", text: "Use {name}" }
    expect(layerCode(braces).jsx).toBe('<p>{"Use {name}"}</p>')
    const long: DesignNode = { id: "t", type: "text", text: "Two\nlines", style: { lines: 2 } }
    expect(layerCode(long).jsx).toBe('<p className="line-clamp-2">\n  Two\n  lines\n</p>')
  })

  it.each<[string, DesignNode["style"], string]>([
    ["sizes filling the main axis", { width: "fill", height: "fill" }, "flex-1 min-w-0 self-stretch"],
    ["growing and filling, once", { grow: true, width: "fill" }, "flex-1 min-w-0"],
    ["hugging text", { width: "hug" }, "w-max"],
    ["one line of text", { lines: 1 }, "truncate"],
    [
      "spacing and length tokens",
      { padding: "spacing-gutter", maxWidth: "container-md", minWidth: "sidebar" },
      "p-gutter min-w-(--sidebar) max-w-md"
    ],
    ["sides each their own", { margin: [1, 2, 3, -4] }, "mt-1 mr-2 mb-3 -ml-4"],
    ["a placed layer", { position: "absolute", top: 0, right: 2 }, "absolute top-0 right-2"],
    [
      "tokens outside a namespace",
      { radius: "pill", font: "brand", size: "huge", shadow: "lift" },
      "rounded-(--pill) shadow-(--lift) font-(family-name:--brand) text-(length:--huge)"
    ],
    ["colors in the color namespace", { foreground: "color-red-500", background: "muted" }, "bg-muted text-red-500"],
    [
      "type",
      {
        weight: 450,
        tracking: "tracking-wide",
        textAlign: "center",
        transform: "uppercase",
        italic: true,
        decoration: "underline"
      },
      "font-[450] tracking-wide text-center uppercase underline italic"
    ],
    [
      "a dashed thick border",
      { borderWidth: 2, borderStyle: "dashed", opacity: 50 },
      "border-2 border-dashed opacity-50"
    ]
  ])("writes %s", (_case, style, classes) => {
    expect(layerCode({ id: "t", type: "text", text: "x", style }, { parent: "row" }).classes).toBe(classes)
  })

  it("writes grids, and marks a layout relative when a layer inside it is placed", () => {
    const grid: DesignNode = {
      id: "g",
      type: "layout",
      style: { display: "grid", columns: 3, gap: 2, rowGap: 4, justify: "center" },
      children: [{ id: "a", type: "layout", style: { position: "absolute", colSpan: 2 }, children: [] }]
    }
    const code = layerCode(grid)
    expect(code.classes).toBe("grid grid-cols-3 gap-2 gap-y-4 justify-items-center relative")
    expect(code.jsx).toContain('<div className="flex flex-col col-span-2 absolute" />')
  })
})

describe("layerTokens", () => {
  it("lists each token the layer and what's shown in it use, with the keys using it", () => {
    const node: DesignNode = {
      id: "card",
      type: "layout",
      style: { background: "card", padding: ["spacing-gutter", 4], width: "fill", foreground: "card-foreground" },
      children: [
        { id: "a", type: "text", text: "x", style: { foreground: "card-foreground", size: "text-sm" } },
        { id: "b", type: "text", text: "x", hidden: true, style: { background: "secret" } },
        {
          id: "c",
          type: "component",
          component: "Button",
          slots: { children: [{ id: "d", type: "text", text: "x", style: { border: "card" } }] }
        }
      ]
    }
    expect(layerTokens(node)).toEqual([
      { name: "card", keys: ["background", "border"] },
      { name: "spacing-gutter", keys: ["padding"] },
      { name: "card-foreground", keys: ["foreground"] },
      { name: "text-sm", keys: ["size"] }
    ])
  })
})

describe("importLine", () => {
  it("imports a named export, a namespace's part by its namespace, and a default export by the id", () => {
    expect(importLine("Button", { export: "Button", import: "@/components/ui/button" })).toBe(
      'import { Button } from "@/components/ui/button"'
    )
    expect(importLine("Dialog.Root", { export: "Dialog.Root", import: "@base-ui/react" })).toBe(
      'import { Dialog } from "@base-ui/react"'
    )
    expect(importLine("marketing/hero-banner", { export: "default", import: "@/hero" })).toBe(
      'import HeroBanner from "@/hero"'
    )
    expect(importLine("Button", { export: "Button" })).toBeUndefined()
  })
})
describe("iconComponent", () => {
  const library = (entry: Partial<LibraryInfo>): LibraryInfo => ({
    id: "x",
    name: "X",
    package: "x",
    importName: "x",
    stylesImported: true,
    kind: "icons",
    ...entry
  })
  const libraries = [
    library({ id: "lucide", importName: "lucide-react" }),
    library({
      id: "heroicons",
      package: "@heroicons/react",
      importName: "@heroicons/react",
      icons: {
        import: "@heroicons/react/24/outline",
        component: "",
        variants: { modules: { outline: "@heroicons/react/24/outline", solid: "@heroicons/react/16/solid" } }
      } as LibraryInfo["icons"]
    }),
    library({ id: "nova", kind: "components" })
  ]

  it("imports an icon from its set's module, or the module its style is kept in", () => {
    expect(iconComponent("lucide/Hexagon", libraries)).toEqual({ export: "Hexagon", import: "lucide-react" })
    expect(iconComponent("heroicons/CogIcon", libraries)).toEqual({
      export: "CogIcon",
      import: "@heroicons/react/24/outline"
    })
    expect(iconComponent("heroicons/16/solid/CogIcon", libraries)).toEqual({
      export: "CogIcon",
      import: "@heroicons/react/16/solid"
    })
    expect(iconComponent("nova/Button", libraries)).toBeUndefined()
    expect(iconComponent("Button", libraries)).toBeUndefined()
  })
})

describe("calcPixels", () => {
  it.each([
    ["calc(calc(0.625 * 16px) * 0.8)", "8px"],
    ["calc(10px - 2px)", "8px"],
    ["calc((4px + 2px) / 3)", "2px"],
    ["calc(-1 * 4px)", "-4px"]
  ])("works out %s", (value, pixels) => {
    expect(calcPixels(value)).toBe(pixels)
  })

  it.each(["8px", "calc(1rem + 2px)", "calc(2 * 3)", "calc(4px * 2px)", "calc(100% - 4px)", "min(calc(2px), 4px)"])(
    "leaves %s",
    (value) => {
      expect(calcPixels(value)).toBeUndefined()
    }
  )
})
