import { type AgentHooks, type AgentSnapshot, execute } from "@parity-app/agent"
import {
  type ComponentSource,
  type ContainerSpec,
  defaultModeSettings,
  type DesignNode,
  type ReferenceSpec
} from "@parity-app/core"
import { effectiveFixture } from "@parity-app/core/fixtures"
import { describe, expect, it } from "vite-plus/test"
import { readSkill, skillFiles } from "./skills.ts"

/** Each ```js block in a skill file, in order, with the line it starts on. */
function snippets(markdown: string): { line: number; code: string }[] {
  const found: { line: number; code: string }[] = []
  const lines = markdown.split(/\r?\n/)

  for (let index = 0; index < lines.length; index++) {
    if (lines[index] !== "```js") {
      continue
    }

    const end = lines.indexOf("```", index + 1)
    found.push({ line: index + 1, code: lines.slice(index + 1, end).join("\n") })
    index = end
  }

  return found
}

const text = (id: string, words: string): DesignNode => ({ type: "text", id, name: id, text: words })

const layout = (name: string, children: DesignNode[] = [], hidden?: boolean): DesignNode => {
  const node: DesignNode = { type: "layout", id: name.toLowerCase().replaceAll(" ", "-"), name, children }

  if (hidden) {
    node.hidden = hidden
  }

  return node
}

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
  ),
  // Replace's example puts back a title's patches in its loading state.
  {
    ...screen("signup", "Signup", 4800, layout("Page", [{ ...text("title", "Sign up"), name: "Title" }])),
    states: [
      { id: "default", name: "Default" },
      { id: "loading", name: "Loading" }
    ]
  },
  // How a design fits together: a header whose desktop menu opens.
  screen("header", "Header", 6400, layout("Header", [layout("Menu")]))
]

const nova = (name: string, fields: Partial<ComponentSource> = {}): [string, ComponentSource] => [
  `nova/${name}`,
  { path: "@buildkitgg/shadcn-baseui-nova", export: name, library: "nova", ...fields }
]

const novaSidebar: Record<string, ComponentSource> = Object.fromEntries([
  nova("SidebarProvider", { visual: false, sample: { children: [{ component: "nova/Sidebar" }] } }),
  nova("Sidebar", { parents: ["nova/SidebarProvider"], sample: { children: [{ component: "nova/SidebarContent" }] } }),
  nova("SidebarContent", { parents: ["nova/SidebarProvider", "nova/Sidebar"] }),
  nova("SidebarMenu", { parents: ["nova/SidebarProvider", "nova/Sidebar"] }),
  nova("SidebarMenuItem", { parents: ["nova/SidebarProvider", "nova/Sidebar", "nova/SidebarMenu"] }),
  nova("SidebarMenuButton", {
    parents: ["nova/SidebarProvider", "nova/Sidebar", "nova/SidebarMenu", "nova/SidebarMenuItem"]
  })
])

function project(tab: string): AgentSnapshot {
  return {
    tab,
    components: [
      "Badge",
      "Button",
      "Card",
      "CardDescription",
      "CardHeader",
      "CardTitle",
      "Input",
      "Label",
      "Skeleton",
      ...Object.keys(novaSidebar)
    ],
    // Nova's sidebar parts as discovery lists them, with the parents and samples `Props().composition` reads.
    sources: novaSidebar,
    iconSets: [{ id: "lucide", name: "Lucide", package: "lucide-react", version: "0.500.0" }],
    // Written as shadcn's theme writes them, so GetTokens({ nearest }) can measure them.
    tokens: [
      {
        name: "background",
        category: "color",
        source: "semantic",
        values: { default: "oklch(1 0 0)", dark: "oklch(0.145 0 0)" }
      },
      {
        name: "foreground",
        category: "color",
        source: "semantic",
        values: { default: "oklch(0.145 0 0)", dark: "oklch(0.985 0 0)" }
      },
      { name: "primary", category: "color", source: "semantic", values: { default: "oklch(0.546 0.245 262.881)" } },
      { name: "accent", category: "color", source: "semantic", values: { default: "oklch(0.97 0 0)" } },
      { name: "text-sm", category: "font-size", source: "theme", values: { default: "0.875rem" } },
      { name: "text-2xl", category: "font-size", source: "theme", values: { default: "1.5rem" } },
      { name: "radius-full", category: "radius", source: "theme", values: { default: "9999px" } }
    ],
    theme: [],
    modes: defaultModeSettings,
    documents: [{ path: "app.par", document: { version: 3, containers: structuredClone(designs), references } }],
    libraryDesigns: [],
    tokenOverrides: [],
    mainDocument: "app.par",
    props: {},
    selection: {},
    bounds: {}
  }
}

/** A screen placed beside Dashboard as a reference, with a note, for `References` to read. */
const references: ReferenceSpec[] = [
  {
    id: "stats-reference",
    connector: "mobbin",
    sourceId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    app: "Ledgerly",
    platform: "web",
    link: "https://mobbin.com/screens/1b9d6bcd",
    image: { url: "https://images.example/ledgerly.png", width: 768, height: 480 },
    position: { x: 1500, y: 2000 },
    note: "Revenue and users sit first, each with the change since last week.",
    by: "Claude",
    design: "dashboard"
  }
]

const hooks: AgentHooks = {
  presence: () => undefined,
  render: async ({ mode, capture }) => {
    const rendered = { width: mode.width, height: 600, nodes: [], overflowsX: false, unknownComponents: [] }

    return capture ? { ...rendered, png: "iVBOR" } : rendered
  },
  iconNames: async () => ({ names: ["Bell", "Heart", "Settings"], aliases: { Settings: ["Cog"] } }),
  // Any screen the examples name, as main would give one it found lately.
  screen: async (id) => ({
    connector: "mobbin",
    id,
    title: "Ledgerly",
    platform: "web",
    link: `https://mobbin.com/screens/${id}`,
    image: { url: `https://images.example/${id}.png`, width: 768, height: 480 }
  })
}

const files = await skillFiles()

const examples = (
  await Promise.all(files.map(async (file) => snippets(await readSkill(file)).map((snippet) => ({ file, ...snippet }))))
).flat()

const boardCategories = new Set(["overlap", "title_clearance", "canvas_overlaps"])

describe("the skill's examples", () => {
  it("finds the examples to run", () => {
    expect(examples.length).toBeGreaterThan(10)
  })

  // A file's snippets share one tab, so a value one assigns without `const` carries into the next, as the skill says.
  // Warnings about boards being too close are left out: they depend on where the example project's boards sit, and the
  // canvas example makes them on purpose. Any other warning means the example uses the API wrongly.
  it.each(files.filter((file) => examples.some((example) => example.file === file)))(
    "runs every example in %s against the example project",
    async (file) => {
      const tab = `skill-${file}`

      for (const { line, code } of examples.filter((example) => example.file === file)) {
        const result = await execute({ label: "Example", code }, project(tab), hooks)

        const warnings = result.warnings.filter(
          (_, index) => !boardCategories.has(result.warningGroups?.[index]?.category ?? "")
        )

        expect({ at: `${file}:${line}`, error: result.error, warnings }).toEqual({
          at: `${file}:${line}`,
          error: undefined,
          warnings: []
        })
      }
    }
  )
})
