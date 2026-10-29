import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { discoverProject, parseJsonc } from "./index.ts"

const renderer = {
  componentExtensions: [".tsx"],
  findComponents: (source: string) =>
    [...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    }))
} as unknown as RendererAdapter

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "canvas-project-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("discoverProject", () => {
  it("follows components.json and tsconfig paths", async () => {
    await write("components.json", JSON.stringify({ tailwind: { css: "app/global.css" }, aliases: { ui: "~/ui" } }))
    await write("tsconfig.json", '{ "compilerOptions": { /* paths */ "paths": { "~/*": ["./lib/*"] } } }')
    await write("lib/ui/card.tsx", "export function Card() {}\nexport function CardTitle() {}")
    await write("designs/team.par", "{}")
    await write("node_modules/pkg/ignored.par", "{}")

    const project = await discoverProject(root, renderer)
    expect(project.styles).toEqual(["app/global.css"])
    expect(project.components).toEqual({
      Card: { path: "lib/ui/card.tsx", export: "Card", as: "function" },
      CardTitle: { path: "lib/ui/card.tsx", export: "CardTitle", as: "function" }
    })
    expect(project.documents).toEqual(["designs/team.par"])
  })

  it("falls back to the app entry's CSS imports and conventional folders", async () => {
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write("src/main.tsx", 'import "./styles/app.css"\nimport App from "./App"')
    await write("src/components/ui/button.tsx", "export function Button() {}")

    const project = await discoverProject(root, renderer)
    expect(project.styles).toEqual(["src/styles/app.css"])
    expect(Object.keys(project.components)).toEqual(["Button"])
  })

  it("keeps a package's stylesheet the entry imports by its specifier, apart from the project's own", async () => {
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write("src/main.tsx", "import '@mantine/core/styles.css'\nimport './index.css'")

    const project = await discoverProject(root, renderer)
    expect(project.styles).toEqual(["src/index.css"])
    expect(project.packageStyles).toEqual(["@mantine/core/styles.css"])
  })
})

describe("libraries", () => {
  it("loads any dependency that ships a .lib.par, with its components and breakpoints", async () => {
    const pkg = { dependencies: { "@acme/ui": "1.0.0" } }
    await write("package.json", JSON.stringify(pkg))
    await write(
      "node_modules/@acme/ui/package.json",
      '{ "name": "@acme/ui", "version": "1.2.0", "types": "index.d.ts" }'
    )
    await write("node_modules/@acme/ui/index.d.ts", "export function Button(): unknown")
    await write(
      "node_modules/@acme/ui/acme.lib.par",
      JSON.stringify({
        version: 1,
        id: "acme",
        name: "Acme UI",
        styles: "styles.css",
        breakpoints: [{ id: "md", name: "Medium", width: 768 }]
      })
    )
    await write("packages/other/other.lib.par", JSON.stringify({ version: 1, name: "Another package" }))

    const project = await discoverProject(root, renderer, pkg)
    expect(project.libraries).toEqual([
      {
        id: "acme",
        name: "Acme UI",
        description: "",
        package: "@acme/ui",
        importName: "@acme/ui",
        version: "1.2.0",
        tailwindEntry: "styles.css",
        stylesImported: false,
        breakpoints: [{ id: "md", name: "Medium", width: 768 }],
        manifest: "node_modules/@acme/ui/acme.lib.par"
      }
    ])
    expect(project.components["acme/Button"]).toMatchObject({ path: "@acme/ui", export: "Button", library: "acme" })
    expect(project.documents).toEqual([])
  })

  it("opens a library's own .lib.par as designs, and reads the DTCG tokens libraries describe", async () => {
    const pkg = { dependencies: { "@acme/ui": "1.0.0" } }
    await write("package.json", JSON.stringify(pkg))
    await write("node_modules/@acme/ui/package.json", '{ "name": "@acme/ui", "types": "index.d.ts" }')
    await write("node_modules/@acme/ui/index.d.ts", "")
    await write(
      "node_modules/@acme/ui/acme.lib.par",
      JSON.stringify({ version: 2, id: "acme", name: "Acme UI", tokens: "tokens/acme.tokens.json" })
    )
    await write(
      "node_modules/@acme/ui/tokens/acme.tokens.json",
      JSON.stringify({ radius: { $type: "dimension", $value: { value: 8, unit: "px" } } })
    )
    await write(
      "kit.lib.par",
      JSON.stringify({ version: 2, name: "Kit", tokens: { brand: { $type: "color", $value: "#ff0000" } } })
    )

    const project = await discoverProject(root, renderer, pkg)
    expect(project.documents).toEqual(["kit.lib.par"])
    expect(project.describedTokens).toEqual([
      {
        name: "Kit",
        manifest: "kit.lib.par",
        tokens: [{ path: "brand", type: "color", values: { default: "#ff0000" } }]
      },
      {
        name: "Acme UI",
        manifest: "node_modules/@acme/ui/acme.lib.par",
        tokens: [{ path: "radius", type: "dimension", values: { default: "8px" } }]
      }
    ])
  })

  it("finds a library installed in a folder above, under an alias, whose exports leave out package.json", async () => {
    const pkg = { dependencies: { "@acme/kit": "npm:@buildkitgg/shadcn-baseui-nova@0.4.1" } }
    await write("app/package.json", JSON.stringify(pkg))
    await write(
      "node_modules/@acme/kit/package.json",
      JSON.stringify({
        name: "@buildkitgg/shadcn-baseui-nova",
        version: "0.4.1",
        types: "./dist/index.d.ts",
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }
      })
    )
    await write("node_modules/@acme/kit/dist/index.d.ts", "export function Button(): unknown")

    const project = await discoverProject(join(root, "app"), renderer, pkg)
    expect(project.libraries).toMatchObject([{ id: "nova", importName: "@acme/kit", version: "0.4.1" }])
    expect(project.components["nova/Button"]).toMatchObject({ path: "@acme/kit", export: "Button", library: "nova" })
  })
})

describe("storybook", () => {
  it("maps story files to components through relative and aliased imports", async () => {
    const pkg = { scripts: { storybook: "storybook dev -p 6107 -c config/sb" } }
    await write("config/sb/main.ts", "export default {}")
    await write("src/components/ui/button.tsx", "export function Button() {}")
    await write("src/components/ui/badge.tsx", "export function Badge() {}")
    await write("src/components/ui/button.stories.tsx", "export const Stray = {}")
    await write(
      "src/stories/button.stories.tsx",
      'import type { Meta } from "@storybook/react-vite"\nimport { Button } from "@/components/ui/button"\nconst meta = { title: "UI/Button", component: Button } satisfies Meta<typeof Button>\nexport default meta\nexport const Default = {}\nexport const Outline = {}'
    )
    await write(
      "src/stories/badge.stories.tsx",
      'import { Badge as Pill } from "../components/ui/badge"\nexport default { component: Pill }\nexport const Default = {}'
    )
    await write("src/stories/notes.stories.tsx", "export default { title: 'Notes' }")

    const project = await discoverProject(root, renderer, pkg)
    // Stories beside components aren't components themselves.
    expect(Object.keys(project.components).sort()).toEqual(["Badge", "Button"])
    expect(project.storybook).toEqual({
      configDir: "config/sb",
      main: "config/sb/main.ts",
      script: "storybook",
      port: 6107,
      stories: {
        Button: [{ path: "src/stories/button.stories.tsx", title: "UI/Button", exports: ["Default", "Outline"] }],
        Badge: [{ path: "src/stories/badge.stories.tsx", exports: ["Default"] }]
      }
    })
  })

  it("is missing when there's no Storybook config", async () => {
    await write("src/components/ui/button.tsx", "export function Button() {}")
    expect((await discoverProject(root, renderer)).storybook).toBeUndefined()
  })
})

describe("parseJsonc", () => {
  it("keeps comment markers inside strings", () => {
    expect(parseJsonc('{ "paths": { "@/*": ["./src/*"], }, // done\n }')).toEqual({ paths: { "@/*": ["./src/*"] } })
  })
})
