import { fileURLToPath } from "node:url"
import { type CssDeclaration, declarations, type NodeStyle } from "@parity-app/style-schema"
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

  // Each of these compiles to other text than the value: `m-0` to `0px`, `gap-1` to `var(--spacing)`, `font-medium` to
  // `var(--font-weight-medium)`, `leading-normal` to `var(--leading-normal)`.
  it.each([
    ["margin", "0", "m-0"],
    ["min-width", "0", "min-w-0"],
    ["inset", "0", "inset-0"],
    ["gap", "calc(var(--spacing) * 1)", "gap-1"],
    ["gap", "calc(var(--spacing)*1)", "gap-1"],
    ["row-gap", "calc(var(--spacing) * 1)", "gap-y-1"],
    ["padding", "calc(var(--spacing) * 1)", "p-1"],
    ["gap", "1rem", "gap-4"],
    ["font-weight", "500", "font-medium"],
    ["font-weight", "600", "font-semibold"],
    ["line-height", "1.5", "leading-normal"],
    ["color", "#fff", "text-white"]
  ])("writes %s: %s as %s, which Tailwind says is the same value written another way", (property, value, expected) => {
    expect(classes({ property, value })).toEqual([expected])
    expect(printer().read([expected]).declarations).toMatchObject([{ property }])
  })

  it("keeps a font size's variable, since the size's own utility sets a line height too", () => {
    expect(printer().css(["text-sm"])).toContain("line-height: var(--tw-leading, var(--text-sm--line-height))")
    expect(classes({ property: "font-size", value: "var(--text-sm)" })).toEqual(["text-(length:--text-sm)"])
  })

  it("keeps the value as written where Tailwind's spelling would draw something else here", () => {
    // Tailwind spells both of these from its theme, where `--radius` is 0.25rem. The example sets it to 0.625rem
    // outside the theme, so `rounded-lg` isn't 0.25rem here, and `rounded-md` doesn't read `--radius-md`.
    expect(systems.spells.canonicalizeCandidates(["[border-radius:0.25rem]"])).toEqual(["rounded-lg"])
    expect(classes({ property: "border-radius", value: "0.25rem" })).toEqual(["rounded-[0.25rem]"])
    expect(classes({ property: "border-radius", value: "var(--radius-md)" })).toEqual(["rounded-(--radius-md)"])
    // A length Tailwind's scale has no step for.
    expect(classes({ property: "gap", value: "4px" })).toEqual(["gap-[4px]"])
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
    {
      flexDirection: "row",
      gap: { step: 4 },
      padding: [{ step: 2 }, { step: 4 }],
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap"
    },
    {
      display: "grid",
      gridTemplateColumns: [{ fr: 1 }, { fr: 1 }, { fr: 1 }],
      gridTemplateRows: [{ fr: 1 }, { fr: 1 }],
      rowGap: { step: 2 },
      justifyContent: "center"
    },
    {
      width: { size: "fill" },
      height: { step: 20 },
      minWidth: { step: 10 },
      maxWidth: { token: "container-md" },
      alignSelf: "end",
      grow: true
    },
    {
      position: "absolute",
      top: { step: 0 },
      right: { step: 4 },
      zIndex: { step: 10 },
      opacity: { step: 50 },
      overflow: "auto"
    },
    {
      fills: [{ type: "solid", color: { token: "primary" } }],
      color: { token: "primary-foreground" },
      borderColor: { token: "border" },
      borderWidth: { step: 2 },
      borderRadius: { token: "radius-lg" }
    },
    {
      borderRadius: { token: "radius-full" },
      boxShadow: [{ type: "drop", token: "shadow-md" }],
      borderStyle: "dashed",
      borderColor: { token: "input" }
    },
    {
      fontFamily: { token: "font-sans" },
      fontSize: { token: "text-lg" },
      fontWeight: { value: 600 },
      lineHeight: { token: "leading-tight" },
      letterSpacing: { token: "tracking-wide" }
    },
    {
      textAlign: "center",
      textTransform: "uppercase",
      textDecorationLine: "underline",
      fontStyle: "italic",
      lineClamp: 2
    },
    {
      translate: { x: { step: 2 }, y: { value: "-50%" } },
      rotate: 45,
      scale: { x: 110 },
      transformOrigin: { x: 50, y: 0 }
    },
    {
      filter: [{ type: "blur", value: { token: "blur-sm" } }],
      backdropFilter: [{ type: "adjust", values: { brightness: 25 } }]
    },
    {
      fills: [
        {
          type: "linear",
          stops: [
            { color: { token: "primary" }, position: 0 },
            { color: { token: "card", alpha: { step: 50 } }, position: 100 }
          ]
        },
        { type: "solid", color: { token: "muted" } }
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
