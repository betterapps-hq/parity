import { createRequire } from "node:module"
import { guestModuleSource } from "@parity-app/builder-vite"
import { componentLibrary, type ContainerSpec, type ProjectConfig, resolveDesign } from "@parity-app/core"
import { build } from "esbuild"
import { chromium } from "playwright-core"
import { expect, it } from "vite-plus/test"

it("renders a library design whose factory modules appear in no sample or decorator", async () => {
  const design: ContainerSpec = {
    id: "kit/label",
    name: "Label",
    kind: "component",
    position: { x: 0, y: 0 },
    states: [],
    root: {
      type: "component",
      id: "label",
      component: "kit/Label",
      props: {
        value: {
          $call: { import: "design-values", export: "create" },
          args: [{ $call: { import: "nested-values", export: "create" } }]
        }
      }
    }
  }
  const config: ProjectConfig = {
    styles: [],
    documents: [],
    components: { "kit/Label": { path: "kit", export: "Label", library: "kit" } },
    libraries: [{ id: "kit", name: "Kit", package: "kit", importName: "kit", stylesImported: true, designs: [design] }]
  }
  const tree = resolveDesign(
    { type: "instance", id: "placed", design: design.id },
    undefined,
    "desktop",
    componentLibrary([design])
  )
  const modules: Record<string, string> = {
    fixture: guestModuleSource(config),
    kit: 'import {createElement} from "react"; export function Label({value}) { return createElement("span", {"data-design-value": ""}, value) }',
    "design-values": 'export function create(value) { return "Design-only " + value }',
    "nested-values": 'export function create() { return "factory loaded" }'
  }
  const require = createRequire(import.meta.url)
  const bundle = await build({
    stdin: {
      contents: `import guest from "fixture"; guest.mount(document.getElementById("frame"), ${JSON.stringify(tree)})`,
      resolveDir: import.meta.dirname
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    plugins: [
      {
        name: "library-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^virtual:canvas\/renderer$/ }, () => ({
            path: require.resolve("@parity-app/renderer-react/guest")
          }))
          builder.onResolve({ filter: /^(fixture|kit|design-values|nested-values)$/ }, ({ path }) => ({
            path,
            namespace: "fixture"
          }))
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
            contents: modules[path],
            resolveDir: import.meta.dirname
          }))
        }
      }
    ]
  })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const page = await browser.newPage()
    await page.route("http://library.test/app.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0]!.text })
    )
    await page.route("http://library.test/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<div id="frame"></div><script type="module" src="/app.js"></script>'
      })
    )
    await page.goto("http://library.test/")
    await page.locator("[data-design-value]").waitFor()
    expect(await page.locator("[data-design-value]").textContent()).toBe("Design-only factory loaded")
  } finally {
    await browser.close()
  }
}, 30_000)
