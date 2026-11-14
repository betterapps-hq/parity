import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { beforeAll, describe, expect, it } from "vite-plus/test"
import { type CssNode, type DesignSystem, loadDesignSystem } from "./design-system.ts"

// Tailwind marks its design system unstable, so this pins each part Parity uses against the Tailwind the example
// project installs. Supporting another version means running this against it; a release that changes one of these
// fails here instead of in someone's project.

const example = fileURLToPath(new URL("../../../examples/shadcn-vite", import.meta.url))
const load = () => loadDesignSystem(example, "src/index.css")

/** One copy that only compiles and one that only spells, as the printer keeps them. */
let system: DesignSystem
let spelling: DesignSystem

beforeAll(async () => {
  ;[system, spelling] = await Promise.all([load(), load()])
  spelling.canonicalizeCandidates(["p-4"])
}, 60_000)

/** The declarations of a class's one rule, as `property: value`. */
function declared(nodes: CssNode[] | undefined): string[] {
  const [rule] = nodes ?? []

  return rule?.kind === "rule"
    ? rule.nodes.flatMap((node) => (node.kind === "declaration" ? [`${node.property}: ${node.value}`] : []))
    : []
}

describe("the design system Tailwind 4.3 gives", () => {
  it("is the version these were pinned against", async () => {
    const manifest = await readFile(`${example}/node_modules/tailwindcss/package.json`, "utf8")

    expect(manifest).toMatch(/"version": "4\.3\.\d+"/)
  })

  it("lists the theme's variables, breakpoints among them", () => {
    const theme = new Map([...system.theme.entries()].map(([name, { value }]) => [name, value]))

    expect(theme.get("--breakpoint-md")).toBe("48rem")
    expect(theme.get("--color-primary")).toBe("var(--primary)")
  })

  it("parses a class into its utility and variants, and gives nothing for what isn't one", () => {
    expect(system.parseCandidate("md:hover:bg-primary")).toMatchObject([
      { kind: "functional", root: "bg", variants: [{ root: "hover" }, { root: "md" }] }
    ])
    expect(system.parseCandidate("[interpolate-size:allow-keywords]")).toMatchObject([{ kind: "arbitrary" }])
    expect(system.parseCandidate("not-a-class")).toEqual([])
  })

  it("knows which variants the project has", () => {
    expect(system.parseVariant("dark")).not.toBeNull()
    expect(system.parseVariant("sepia")).toBeNull()
  })

  it("compiles a class to rules, with its variants as a selector's end and as @media around it", () => {
    const [plain, hover, wide, missing] = system.candidatesToAst(["p-4", "hover:p-4", "md:p-4", "not-a-class"])

    expect(plain).toEqual([
      {
        kind: "rule",
        selector: ".p-4",
        nodes: [
          expect.objectContaining({ kind: "declaration", property: "padding", value: "calc(var(--spacing) * 4)" })
        ]
      }
    ])
    expect(hover).toMatchObject([
      {
        kind: "at-rule",
        name: "@media",
        params: "(hover: hover)",
        nodes: [{ selector: String.raw`.hover\:p-4:hover` }]
      }
    ])
    expect(wide).toMatchObject([{ kind: "at-rule", name: "@media", params: "(width >= 48rem)" }])
    expect(missing).toEqual([])
  })

  it("compiles a class to CSS text, with null for one that compiles to nothing", () => {
    expect(system.candidatesToCss(["p-4", "not-a-class"])).toEqual([
      ".p-4 {\n  padding: calc(var(--spacing) * 4);\n}\n",
      null
    ])
  })

  it("orders classes as Prettier's plugin does, with null for what it doesn't know", () => {
    const order = new Map(system.getClassOrder(["md:p-6", "flex", "not-a-class", "p-4"]))

    const known = [...order].flatMap(([name, rank]) => (rank === null ? [] : [{ name, rank }]))

    expect(order.get("not-a-class")).toBeNull()
    expect(known.toSorted((a, b) => Number(a.rank - b.rank)).map(({ name }) => name)).toEqual(["flex", "p-4", "md:p-6"])
  })

  it("spells an arbitrary class as its own tools would", () => {
    expect(
      spelling.canonicalizeCandidates([
        "[padding:calc(var(--spacing)*4)]",
        "[display:flex]",
        "min-[48rem]:[display:grid]",
        "[&:focus-visible]:[color:red]"
      ])
    ).toEqual(["p-4", "flex", "md:grid", "focus-visible:text-[red]"])
  })

  it("spells two ways of writing one value as the same class, which is how the printer knows they're one value", () => {
    expect(spelling.canonicalizeCandidates(["[margin:0]"])).toEqual(["m-0"])
    expect(spelling.canonicalizeCandidates(["[margin:0px]"])).toEqual(["m-0"])
    expect(spelling.canonicalizeCandidates(["[gap:calc(var(--spacing)_*_1)]"])).toEqual(["gap-1"])
    expect(spelling.canonicalizeCandidates(["[gap:var(--spacing)]"])).toEqual(["gap-1"])
    expect(spelling.canonicalizeCandidates(["[font-weight:500]"])).toEqual(["font-medium"])
    expect(spelling.canonicalizeCandidates(["[font-weight:var(--font-weight-medium)]"])).toEqual(["font-medium"])
    // A length isn't converted between units, so a pixel value keeps its brackets.
    expect(spelling.canonicalizeCandidates(["[gap:4px]"])).toEqual(["gap-[4px]"])
  })

  it("compiles differently once it has spelled something, which is why the printer keeps two", async () => {
    const [fresh, spelled] = await Promise.all([load(), load()])
    spelled.canonicalizeCandidates(["p-4"])

    expect(declared(fresh.candidatesToAst(["bg-primary"])[0])).toEqual(["background-color: var(--primary)"])
    expect(declared(spelled.candidatesToAst(["bg-primary"])[0])).toEqual(["background-color: var(--color-primary)"])
  }, 60_000)
})
