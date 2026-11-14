import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import {
  type ComponentSource,
  packageManifest,
  parseData,
  type RendererAdapter,
  type SampleChild
} from "@parity-app/core"
import { discoverProject, findPackage, packageEntry } from "@parity-app/project"
import { beforeAll, describe, expect, it } from "vite-plus/test"
import { isText, type Live, live, type LiveObject } from "./live.ts"
import { loadFrom, type TestReact, testReact } from "./react-for-tests.ts"

// PAR-453: Nova's Sidebar parts throw outside SidebarProvider, which draws nothing of its own. The provider has to stay
// one of the project's components for designs and agents to put the parts in it.

const example = resolve(import.meta.dirname, "../../../examples/shadcn-vite")

/** The example's app components aren't what this is about; only its libraries are read. */
const renderer: RendererAdapter = {
  id: "test",
  name: "Test",
  detect: () => Promise.resolve({ found: true, summary: "" }),
  guestModule: "",
  runtimePackages: [],
  runtimeImports: [],
  componentExtensions: [".tsx"],
  findComponents: () => []
}

let components: Record<string, ComponentSource>
let nova: LiveObject
let React: TestReact

beforeAll(async () => {
  const pkg = parseData(packageManifest, JSON.parse(await readFile(join(example, "package.json"), "utf8")))
  components = (await discoverProject(example, renderer, pkg)).components
  // The example's own React, which Nova renders with, as Parity loads a project's.
  React = await testReact(loadFrom(join(example, "package.json")))
  // Nova's exports only name an entry to import, which `require.resolve` doesn't follow.
  const novaPackage = (await findPackage(example, "@buildkitgg/shadcn-baseui-nova"))!
  nova = await import(pathToFileURL(packageEntry(novaPackage, "runtime")!).href)
}, 60_000)

/** A sample as React elements, each part from Nova by its export name: `nova/Sidebar` is `Sidebar`. */
function build(child: SampleChild): Live {
  if (isText(child)) {
    return child
  }

  if (!("component" in child)) {
    throw new Error(`A sample this test can't build: ${JSON.stringify(child)}`)
  }

  return React.createElement(
    nova[child.component.split("/").at(-1)!],
    live.parse(child.props ?? null),
    ...(child.children ?? []).map(build)
  )
}

describe("Nova's sidebar and its provider", () => {
  it("keeps SidebarProvider among the project's components, as a part that draws nothing", () => {
    expect(components["nova/SidebarProvider"]).toMatchObject({ export: "SidebarProvider", visual: false })
    expect(components["nova/Sidebar"]?.parents).toEqual(["nova/SidebarProvider"])
  })

  it("throws for a Sidebar alone, naming the provider", () => {
    const sidebar = React.createElement(nova.Sidebar, { collapsible: "none" })
    expect(() => React.renderToStaticMarkup(sidebar)).toThrow(/within a SidebarProvider/)
  })

  it("draws the sidebar Parity puts in the provider", () => {
    const sample = components["nova/SidebarProvider"]?.sample
    expect(sample?.children?.[0]).toMatchObject({ component: "nova/Sidebar" })

    const markup = React.renderToStaticMarkup(
      React.createElement(
        nova.SidebarProvider,
        live.parse(sample?.props ?? null),
        ...(sample?.children ?? []).map(build)
      )
    )

    expect(markup).toContain('data-slot="sidebar-wrapper"')
    expect(markup).toContain('data-slot="sidebar-menu"')
  })

  it("draws a menu item with isActive in Nova's own active style (PAR-457)", () => {
    const button = (isActive: boolean) =>
      React.renderToStaticMarkup(
        React.createElement(
          nova.SidebarProvider,
          null,
          React.createElement(nova.SidebarMenuButton, { isActive }, "Dashboard")
        )
      )

    // Nova styles `data-active` (`data-active:bg-sidebar-accent`); Parity only passes the prop.
    expect(button(true)).toMatch(/data-slot="sidebar-menu-button"[^>]*data-active=""/)
    expect(button(false)).not.toContain('data-active=""')
  })
}, 60_000)
