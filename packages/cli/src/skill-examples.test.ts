import { type AgentHooks, type AgentSnapshot, execute } from "@parity-app/agent"
import { type ContainerSpec, defaultModeSettings, type DesignNode } from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { readSkill, skillFiles } from "./skills.ts"

/** Each ```js block in a skill file, in order, with the line it starts on. */
function snippets(markdown: string): { line: number; code: string }[] {
  const found: { line: number; code: string }[] = []
  const lines = markdown.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    if (lines[index] !== "```js") continue
    const end = lines.indexOf("```", index + 1)
    found.push({ line: index + 1, code: lines.slice(index + 1, end).join("\n") })
    index = end
  }
  return found
}

const text = (id: string, words: string): DesignNode => ({ type: "text", id, name: id, text: words })
const layout = (name: string, children: DesignNode[] = [], hidden?: boolean): DesignNode => ({
  type: "layout",
  id: name.toLowerCase().replaceAll(" ", "-"),
  name,
  ...(hidden ? { hidden } : {}),
  children
})
const row = (id: string, name: string, email: string): DesignNode => ({
  type: "layout",
  id,
  style: { direction: "row", gap: 4 },
  children: [text(`${id}-name`, name), text(`${id}-email`, email)]
})
const screen = (id: string, name: string, x: number, root: DesignNode): ContainerSpec => ({
  id,
  name,
  position: { x, y: 2000 },
  root,
  states: [{ id: "default", name: "Default" }]
})

/** The example project the skill's snippets are written against: every design and node they name. */
const designs: ContainerSpec[] = [
  ...effectiveFixture.designs,
  screen(
    "dashboard",
    "Dashboard",
    0,
    layout("Page", [
      layout("Sidebar"),
      layout("Content", [
        layout("Toolbar"),
        layout("Stats", [text("revenue", "Revenue"), text("users", "Users")]),
        layout("Stats loading", [{ type: "component", id: "skeleton", component: "Skeleton" }], true)
      ])
    ])
  ),
  screen("settings", "Settings", 1600, layout("Page", [layout("Content")])),
  screen(
    "team-members",
    "Team members",
    3200,
    layout("Page", [
      {
        type: "component",
        id: "seats",
        name: "seats",
        component: "Badge",
        props: { children: "3 of 10 seats used" }
      },
      layout("Members table", [
        row("ada", "Ada Lovelace", "ada@example.com"),
        row("grace", "Grace Hopper", "grace@example.com"),
        row("alan", "Alan Turing", "alan@example.com")
      ]),
      layout("Empty state", [text("empty", "No members yet")], true)
    ])
  )
]

function project(tab: string): AgentSnapshot {
  return {
    tab,
    components: ["Badge", "Button", "Card", "CardDescription", "CardHeader", "CardTitle", "Input", "Label", "Skeleton"],
    iconSets: [{ id: "lucide", name: "Lucide", package: "lucide-react", version: "0.500.0" }],
    tokens: [
      { name: "background", category: "color", source: "semantic", values: { default: "white", dark: "black" } },
      { name: "foreground", category: "color", source: "semantic", values: { default: "black", dark: "white" } },
      { name: "primary", category: "color", source: "semantic", values: { default: "blue" } },
      { name: "accent", category: "color", source: "semantic", values: { default: "lightblue" } },
      { name: "text-2xl", category: "font-size", source: "theme", values: { default: "1.5rem" } },
      { name: "radius-full", category: "radius", source: "theme", values: { default: "9999px" } }
    ],
    theme: [],
    modes: defaultModeSettings,
    documents: [{ path: "app.par", document: { version: 3, containers: structuredClone(designs) } }],
    libraryDesigns: [],
    tokenOverrides: [],
    mainDocument: "app.par",
    props: {},
    selection: {},
    bounds: {}
  }
}

const hooks: AgentHooks = {
  presence: () => undefined,
  render: async ({ mode, capture }) => ({
    width: mode.width,
    height: 600,
    nodes: [],
    overflowsX: false,
    unknownComponents: [],
    ...(capture ? { png: "iVBOR" } : {})
  }),
  iconNames: async () => ({ names: ["Bell", "Heart", "Settings"], aliases: { Settings: ["Cog"] } })
}

const files = await skillFiles()
const examples = (
  await Promise.all(files.map(async (file) => snippets(await readSkill(file)).map((snippet) => ({ file, ...snippet }))))
).flat()

describe("the skill's examples", () => {
  it("finds the examples to run", () => {
    expect(examples.length).toBeGreaterThan(10)
  })

  // A file's snippets share one tab, so a value one assigns without `const` carries into the next, as the skill says.
  // Overlap warnings are left out: they depend on where the example project's boards sit, and the canvas example
  // makes one on purpose. Any other warning means the example uses the API wrongly.
  it.each(files.filter((file) => examples.some((example) => example.file === file)))(
    "runs every example in %s against the example project",
    async (file) => {
      const tab = `skill-${file}`
      for (const { line, code } of examples.filter((example) => example.file === file)) {
        const result = await execute({ label: "Example", code }, project(tab), hooks)
        const warnings = result.warnings.filter((warning) => !/\) overlaps .+ by \d+x\d+/.test(warning))
        expect({ at: `${file}:${line}`, error: result.error, warnings }).toEqual({
          at: `${file}:${line}`,
          error: undefined,
          warnings: []
        })
      }
    }
  )
})
