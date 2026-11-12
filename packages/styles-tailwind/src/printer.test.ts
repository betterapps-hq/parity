import { fileURLToPath } from "node:url"
import { type CssDeclaration, declarations, type NodeStyle } from "@parity-app/style"
import { beforeAll, describe, expect, it } from "vite-plus/test"
import { loadDesignSystem } from "./design-system.ts"
import { type DesignSystems, tailwindPrinter } from "./printer.ts"

// Every test runs against the example project's own Tailwind, with its theme: shadcn's tokens over Tailwind's defaults.

const example = fileURLToPath(new URL("../../../examples/shadcn-vite", import.meta.url))

let systems: DesignSystems

beforeAll(async () => {
  const [compiles, spells] = await Promise.all([
    loadDesignSystem(example, "src/index.css"),
    loadDesignSystem(example, "src/index.css")
  ])

  // The first spelling builds Tailwind's tables, which takes seconds; it's done here, not inside a test's five.
  spells.canonicalizeCandidates(["p-4"])
  systems = { compiles, spells }
}, 30_000)

const printer = () => tailwindPrinter(systems)

function classes(...written: CssDeclaration[]): string[] {
  const { output, unwritten } = printer().print(written)

  expect(unwritten).toEqual([])

  return output
}

describe("printing declarations as classes", () => {
  it.each([
    ["padding", "calc(var(--spacing) * 4)", "p-4"],
    ["display", "flex", "flex"],
    ["flex-direction", "column", "flex-col"],
    ["gap", "calc(var(--spacing) * 2)", "gap-2"],
    ["width", "fit-content", "w-fit"],
    ["align-self", "stretch", "self-stretch"],
    ["justify-content", "space-between", "justify-between"],
    ["grid-template-columns", "repeat(3, minmax(0, 1fr))", "grid-cols-3"],
    ["grid-column", "span 2 / span 2", "col-span-2"],
    ["z-index", "10", "z-10"],
    ["text-transform", "uppercase", "uppercase"],
    ["rotate", "45deg", "rotate-45"]
  ])("writes %s: %s as Tailwind's own utility, %s", (property, value, expected) => {
    expect(classes({ property, value })).toEqual([expected])
  })

  it.each([
    ["background-color", "var(--primary)", "bg-primary"],
    ["color", "var(--muted-foreground)", "text-muted-foreground"],
    ["border-color", "var(--border)", "border-border"],
    ["letter-spacing", "var(--tracking-wide)", "tracking-wide"],
    ["line-height", "var(--leading-tight)", "leading-tight"]
  ])("writes the token in %s: %s as the utility that reads it, %s", (property, value, expected) => {
    expect(classes({ property, value })).toEqual([expected])
  })

  it("names the type where a utility takes more than one, so a font size isn't read as a color", () => {
    expect(classes({ property: "font-size", value: "var(--text-lg)" })).toEqual(["text-(length:--text-lg)"])
  })

  it("writes a token no utility reads with the variable shorthand, never as var() in brackets", () => {
    expect(classes({ property: "color", value: "var(--mantine-color-blue)" })).toEqual(["text-(--mantine-color-blue)"])
  })

  it("writes a value as an arbitrary value, with its spaces as underscores", () => {
    expect(classes({ property: "border-radius", value: "6px" })).toEqual(["rounded-[6px]"])
    expect(classes({ property: "transform-origin", value: "50% 0%" })).toEqual(["origin-[50%_0%]"])
  })

  it("keeps the value as written where Tailwind's own utility says it another way", () => {
    // `min-w-0` is `calc(var(--spacing) * 0)` and `font-semibold` is `var(--font-weight-semibold)`.
    expect(classes({ property: "min-width", value: "0" })).toEqual(["min-w-[0]"])
    expect(classes({ property: "font-weight", value: "600" })).toEqual(["font-[600]"])
    // The example's theme is inline, so `rounded-md` holds the radius itself and never reads `--radius-md`.
    expect(classes({ property: "border-radius", value: "var(--radius-md)" })).toEqual(["rounded-(--radius-md)"])
  })

  it("writes a property Tailwind has no utility for as an arbitrary property", () => {
    expect(classes({ property: "interpolate-size", value: "allow-keywords" })).toEqual([
      "[interpolate-size:allow-keywords]"
    ])
  })

  it("writes states, viewports and themes as variants", () => {
    const padding = { property: "padding", value: "calc(var(--spacing) * 6)" }

    expect(classes({ ...padding, when: { state: ":hover" } })).toEqual(["hover:p-6"])
    expect(classes({ ...padding, when: { state: ":focus-visible" } })).toEqual(["focus-visible:p-6"])
    expect(classes({ ...padding, when: { state: '[data-state="open"]' } })).toEqual(['data-[state="open"]:p-6'])
    expect(classes({ ...padding, when: { viewport: "48rem" } })).toEqual(["md:p-6"])
    expect(classes({ ...padding, when: { viewport: "900px" } })).toEqual(["min-[900px]:p-6"])
    expect(classes({ ...padding, when: { theme: "dark" } })).toEqual(["dark:p-6"])
    expect(classes({ ...padding, when: { viewport: "48rem", theme: "dark", state: ":hover" } })).toEqual([
      "md:dark:hover:p-6"
    ])
  })

  it("leaves out a declaration for a theme the project has no variant for", () => {
    const sepia = { property: "color", value: "var(--primary)", when: { theme: "sepia" } }

    expect(printer().print([sepia])).toEqual({ output: [], unwritten: [sepia] })
  })

  it("sorts classes as Prettier's Tailwind plugin does", () => {
    const written = classes(
      { property: "padding", value: "calc(var(--spacing) * 6)", when: { viewport: "48rem" } },
      { property: "background-color", value: "var(--primary)", when: { state: ":hover" } },
      { property: "padding", value: "calc(var(--spacing) * 4)" },
      { property: "display", value: "flex" }
    )

    expect(written).toEqual(["flex", "p-4", "hover:bg-primary", "md:p-6"])
  })
})

describe("reading classes back", () => {
  it("reads a class as the declarations it compiles to in this project", () => {
    expect(printer().read(["p-4", "bg-primary", "rounded-full"])).toEqual({
      declarations: [
        { property: "padding", value: "calc(var(--spacing) * 4)" },
        { property: "background-color", value: "var(--primary)" },
        { property: "border-radius", value: "calc(infinity * 1px)" }
      ],
      unread: []
    })
  })

  it("reads variants as where the declaration applies", () => {
    expect(printer().read(["md:dark:hover:p-6", "nth-3:flex"]).declarations).toEqual([
      {
        property: "padding",
        value: "calc(var(--spacing) * 6)",
        when: { viewport: "48rem", theme: "dark", state: ":hover" }
      },
      { property: "display", value: "flex", when: { state: ":nth-child(3)" } }
    ])
  })

  it("keeps what it can't read as it was", () => {
    // Not a class, a utility built on Tailwind's own variables, a range of widths, and an important one.
    const kept = ["not-a-class", "shadow-md", "md:max-lg:p-6", "p-4!"]

    expect(printer().read(["p-4", ...kept])).toEqual({
      declarations: [{ property: "padding", value: "calc(var(--spacing) * 4)" }],
      unread: kept
    })
  })
})

describe("round trips", () => {
  /** Styles in each form the panel writes today, drawn as each kind of layer. */
  const styles: NodeStyle[] = [
    { direction: "row", gap: 4, padding: [2, 4], align: "center", justify: "between", wrap: true },
    { display: "grid", columns: 3, rows: 2, rowGap: 2, justify: "center" },
    { width: "fill", height: 20, minWidth: 10, maxWidth: "container-md", self: "end", grow: true },
    { position: "absolute", top: 0, right: 4, zIndex: 10, opacity: 50, overflow: "scroll" },
    { background: "primary", foreground: "primary-foreground", border: "border", borderWidth: 2, radius: "radius-lg" },
    { radius: "radius-full", shadow: "shadow-md", borderStyle: "dashed", border: "input" },
    { font: "font-sans", size: "text-lg", weight: 600, leading: "leading-tight", tracking: "tracking-wide" },
    { textAlign: "center", textTransform: "uppercase", decoration: "underline", italic: true, lines: 2 },
    { transform: { x: 2, y: { percent: -50 }, rotate: 45, scaleX: 110, origin: { x: 50, y: 0 } } },
    { filter: [{ kind: "blur", value: "blur-sm" }], backdropFilter: [{ kind: "adjust", values: { brightness: 25 } }] },
    {
      background: [
        {
          kind: "linear",
          stops: [
            { color: "primary", position: 0 },
            { color: "card", alpha: 50, position: 100 }
          ]
        },
        { kind: "solid", color: "muted" }
      ]
    }
  ]

  it.each(styles)("writes every declaration of %j and reads the same ones back", (style) => {
    for (const kind of ["layout", "text"] as const) {
      const written: CssDeclaration[] = declarations(style, { kind, parent: "row" }).map(({ property, value }) => ({
        property,
        value
      }))

      const { output, unwritten } = printer().print(written)
      const read = printer().read(output)

      expect(unwritten).toEqual([])
      expect(read.unread).toEqual([])
      expect(printer().print(read.declarations).output).toEqual(output)
      expect(read.declarations.map(({ property }) => property).toSorted()).toEqual(
        written.map(({ property }) => property).toSorted()
      )
    }
  })

  it("reads a patch's declarations back where they apply", () => {
    const patch: CssDeclaration[] = [
      { property: "background-color", value: "var(--accent)", when: { state: ":hover" } },
      { property: "padding", value: "calc(var(--spacing) * 8)", when: { viewport: "64rem" } },
      { property: "color", value: "var(--foreground)", when: { theme: "dark", state: ":focus-visible" } }
    ]

    const { output } = printer().print(patch)

    expect(output).toEqual(["hover:bg-accent", "lg:p-8", "dark:focus-visible:text-foreground"])
    expect(printer().read(output).declarations).toEqual(
      expect.arrayContaining(patch.map((declaration) => expect.objectContaining(declaration)))
    )
  })
})

describe("compiling classes for a frame", () => {
  it("gives the classes' rules in Tailwind's order, in its utilities layer", () => {
    // `px-2` comes after `p-4` in a build whatever order they're asked in, so the narrower one wins.
    expect(printer().css(["px-2", "p-4", "p-4"])).toBe(
      "@layer utilities {\n" +
        ".p-4 {\n  padding: calc(var(--spacing) * 4);\n}\n" +
        ".px-2 {\n  padding-inline: calc(var(--spacing) * 2);\n}\n" +
        "}\n"
    )
  })

  it("compiles a variant as the build does, inside its own conditions", () => {
    expect(printer().css(["hover:bg-primary"])).toContain("@media (hover: hover)")
  })

  it("compiles nothing for a class Tailwind doesn't know", () => {
    expect(printer().css(["not-a-class"])).toBe("")
    expect(printer().css([])).toBe("")
  })
})
