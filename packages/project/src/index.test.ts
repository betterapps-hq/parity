import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { discoverProject } from "./index.ts"

const renderer: RendererAdapter = {
  id: "test",
  name: "Test",
  detect: () => Promise.resolve({ found: true, summary: "" }),
  guestModule: "",
  runtimePackages: [],
  runtimeImports: [],
  componentExtensions: [".tsx"],
  findComponents: (source: string) =>
    [...source.matchAll(/export function ([A-Z]\w*)/g)].map((match) => ({
      name: match[1]!,
      export: match[1]!,
      as: "function"
    }))
}

let root: string

async function write(path: string, content: string) {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), content)
}

beforeEach(async () => {
  // Libraries are found by their real paths, and the temporary folder isn't one on macOS (/var is a link to
  // /private/var) or on Windows runners (whose TEMP is a short 8.3 name).
  root = await realpath(await mkdtemp(join(tmpdir(), "canvas-project-")))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("discoverProject", () => {
  it("reads every component file and .par design, and leaves components.json to shadcn", async () => {
    await write("components.json", JSON.stringify({ tailwind: { css: "app/global.css" }, aliases: { ui: "~/ui" } }))
    await write("tsconfig.json", '{ "compilerOptions": { /* paths */ "paths": { "~/*": ["./lib/*"] } } }')
    await write("lib/ui/card.tsx", "export function Card() {}\nexport function CardTitle() {}")
    await write("designs/team.par", "{}")
    await write("node_modules/pkg/ignored.par", "{}")

    const project = await discoverProject(root, renderer)
    expect(project.styles).toEqual([])
    expect(project.components).toEqual({
      Card: { path: "lib/ui/card.tsx", export: "Card", as: "function", lazy: true },
      CardTitle: { path: "lib/ui/card.tsx", export: "CardTitle", as: "function", lazy: true }
    })
    expect(project.documents).toEqual(["designs/team.par"])
  })

  it("takes the stylesheets the builder says the app loads, and reads no entry itself", async () => {
    await write("index.html", '<script type="module" src="/src/main.tsx"></script>')
    await write("src/main.tsx", "import '@mantine/core/styles.css'\nimport './index.css'")
    await write("src/index.css", ":root { --a: red; }")

    const styles = { styles: ["src/index.css"], packageStyles: ["@mantine/core/styles.css"], from: ["src/main.tsx"] }
    const project = await discoverProject(root, renderer, {}, { styles: Promise.resolve(styles) })
    expect(project.styles).toEqual(["src/index.css"])
    expect(project.packageStyles).toEqual(["@mantine/core/styles.css"])
    expect(project.notes[0]).toBe("styles the builder found: @mantine/core/styles.css, src/index.css")

    const unasked = await discoverProject(root, renderer)
    expect(unasked.styles).toEqual([])
    expect(unasked.notes[0]).toBe("the builder didn't say which stylesheets the app loads")
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
        version: 4,
        id: "acme",
        name: "Acme UI",
        styles: "styles.css",
        breakpoints: [{ id: "md", name: "Medium", width: 768 }]
      })
    )
    await write("packages/other/other.lib.par", JSON.stringify({ version: 4, name: "Another package" }))

    const project = await discoverProject(root, renderer, pkg)
    expect(project.libraries).toEqual([
      {
        id: "acme",
        name: "Acme UI",
        description: "",
        package: "@acme/ui",
        importName: "@acme/ui",
        version: "1.2.0",
        styles: "styles.css",
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
      JSON.stringify({ version: 4, id: "acme", name: "Acme UI", tokens: "tokens/acme.tokens.json" })
    )
    await write(
      "node_modules/@acme/ui/tokens/acme.tokens.json",
      JSON.stringify({ radius: { $type: "dimension", $value: { value: 8, unit: "px" } } })
    )
    await write(
      "kit.lib.par",
      JSON.stringify({ version: 4, name: "Kit", tokens: { brand: { $type: "color", $value: "#ff0000" } } })
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

  it("leaves out a library's malformed token, and notes why", async () => {
    const pkg = { dependencies: { "@acme/ui": "1.0.0" } }
    const tokens = { radius: { $type: "dimension", $value: 8 }, gap: { $value: "4px" } }
    await write("package.json", JSON.stringify(pkg))
    await write("node_modules/@acme/ui/package.json", '{ "name": "@acme/ui", "types": "index.d.ts" }')
    await write("node_modules/@acme/ui/index.d.ts", "")
    await write(
      "node_modules/@acme/ui/acme.lib.par",
      JSON.stringify({ version: 4, id: "acme", name: "Acme UI", tokens })
    )

    const project = await discoverProject(root, renderer, pkg)
    expect(project.describedTokens?.[0]?.tokens.map((token) => token.path)).toEqual(["gap"])
    expect(project.notes).toContain(
      "node_modules/@acme/ui/acme.lib.par: skipped radius (/$value: expected a string or an object)"
    )
  })

  it("names a library's own components by its id, so its canvas's designs refer to them as apps do", async () => {
    await write("src/components/ui/button.tsx", "export function Button() {}")
    await write("nova.lib.par", JSON.stringify({ version: 4, id: "nova", name: "Shadcn Nova" }))
    const project = await discoverProject(root, renderer, { name: "@buildkitgg/shadcn-baseui-nova" })
    expect(project.namespace).toBe("nova")
    expect(project.components).toEqual({
      "nova/Button": { path: "src/components/ui/button.tsx", export: "Button", as: "function", lazy: true }
    })

    // Without an id, the package's name names them, as it does in the apps that install the library.
    await write("nova.lib.par", JSON.stringify({ version: 4, name: "Shadcn Nova" }))
    const unnamed = await discoverProject(root, renderer, { name: "@acme/charts" })
    expect(Object.keys(unnamed.components)).toEqual(["charts/Button"])
  })

  it("lists the component designs a dependency's .lib.par canvas holds, named by the library", async () => {
    const pkg = { dependencies: { "@acme/ui": "1.0.0" } }
    await write("node_modules/@acme/ui/package.json", '{ "name": "@acme/ui", "types": "index.d.ts" }')
    await write("node_modules/@acme/ui/index.d.ts", "export function Switch(): unknown")

    const row = {
      id: "settings-row",
      name: "Settings row",
      kind: "component",
      position: { x: 0, y: 0 },
      root: { type: "component", id: "switch", component: "acme/Switch" }
    }

    const screen = { ...row, id: "showcase", name: "Showcase", kind: "screen" }
    await write(
      "node_modules/@acme/ui/acme.lib.par",
      JSON.stringify({ version: 4, id: "acme", name: "Acme UI", canvas: { version: 4, containers: [row, screen] } })
    )
    const project = await discoverProject(root, renderer, pkg)
    expect(project.libraries[0]?.designs).toEqual([{ ...row, id: "acme/settings-row" }])
    expect(project.components["acme/Switch"]).toMatchObject({ library: "acme" })
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
    // Its decorators are imported by the alias too, never the real name, which the project doesn't have installed.
    expect(
      project.libraries[0]?.decorators?.map((decorator) => decorator.wrap?.import ?? decorator.add?.import)
    ).toEqual(["@acme/kit", "@acme/kit"])
  })

  it("writes every specifier in an aliased library's own manifest with the alias", async () => {
    const pkg = { dependencies: { "@acme/kit": "npm:@acme/real@2.0.0" } }
    await write("app/package.json", JSON.stringify(pkg))
    await write(
      "node_modules/@acme/kit/package.json",
      JSON.stringify({ name: "@acme/real", version: "2.0.0", types: "index.d.ts" })
    )
    await write("node_modules/@acme/kit/index.d.ts", "")
    await write(
      "node_modules/@acme/kit/real.lib.par",
      JSON.stringify({
        version: 4,
        id: "real",
        name: "Real",
        components: {
          import: "@acme/real",
          list: {
            Tree: {
              as: "function",
              sample: {
                props: {
                  collection: {
                    $call: { import: "@acme/real", export: "makeCollection" },
                    args: [{ $call: { import: "@acme/real/nodes", export: "makeNode" } }]
                  }
                }
              }
            }
          }
        },
        decorators: [
          {
            wrap: {
              import: "@acme/real",
              component: "Provider",
              props: { theme: { $import: "@acme/real", export: "theme" } }
            }
          }
        ]
      })
    )

    const project = await discoverProject(join(root, "app"), renderer, pkg)
    // The components' entry module, the decorators and their nested values, and a sample's made values — a nested
    // `$call` in an argument included — all import by the alias, the only name the project has installed.
    expect(project.components["real/Tree"]).toMatchObject({ path: "@acme/kit", export: "Tree", library: "real" })
    expect(project.components["real/Tree"]?.sample?.props?.collection).toEqual({
      $call: { import: "@acme/kit", export: "makeCollection" },
      args: [{ $call: { import: "@acme/kit/nodes", export: "makeNode" } }]
    })
    expect(project.libraries[0]?.decorators).toEqual([
      {
        wrap: {
          import: "@acme/kit",
          component: "Provider",
          props: { theme: { $import: "@acme/kit", export: "theme" } }
        }
      }
    ])
  })
  it("resolves aliased icon subpaths without rewriting other packages or ordinary props", async () => {
    const pkg = { dependencies: { "@acme/icons": "npm:@real/icons@1.0.0" } }
    await write("app/package.json", JSON.stringify(pkg))
    await write("node_modules/@acme/icons/package.json", JSON.stringify({ name: "@real/icons", version: "1.0.0" }))
    await write(
      "node_modules/@acme/icons/icons.lib.par",
      JSON.stringify({
        version: 4,
        name: "Icons",
        id: "icons",
        icons: {
          import: "@real/icons/outline",
          render: { import: "@real/icons/renderer", component: "Icon", prop: "icon" },
          variants: {
            modules: { Outline: "@real/icons/outline", Solid: "@real/icons/solid" },
            default: { style: "Outline" }
          }
        },
        decorators: [
          {
            wrap: {
              import: "@real/icons-extra",
              component: "Provider",
              props: {
                import: "@real/icons",
                modules: { data: "@real/icons/solid" },
                nested: { $call: { import: "@real/icons/setup", export: "setup" } }
              }
            }
          }
        ]
      })
    )
    const project = await discoverProject(join(root, "app"), renderer, pkg)
    expect(project.libraries[0]?.icons).toMatchObject({
      import: "@acme/icons/outline",
      render: { import: "@acme/icons/renderer" },
      variants: { modules: { Outline: "@acme/icons/outline", Solid: "@acme/icons/solid" } }
    })
    expect(project.libraries[0]?.decorators?.[0]?.wrap).toEqual({
      import: "@real/icons-extra",
      component: "Provider",
      props: {
        import: "@real/icons",
        modules: { data: "@real/icons/solid" },
        nested: { $call: { import: "@acme/icons/setup", export: "setup" } }
      }
    })
  })
})

describe("component files", () => {
  it("leave out story files beside components, which aren't components themselves", async () => {
    await write("src/components/ui/button.tsx", "export function Button() {}")
    await write("src/components/ui/button.stories.tsx", "export const Stray = {}")

    expect(Object.keys((await discoverProject(root, renderer)).components)).toEqual(["Button"])
  })
})
