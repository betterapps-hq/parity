import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { ComponentSource, RendererAdapter, SampleChild } from "@parity-app/core"
import { discoverProject, findPackage, packageEntry } from "@parity-app/project"
import { beforeAll, describe, expect, it } from "vite-plus/test"

// PAR-453: Nova's Sidebar parts throw outside SidebarProvider, which draws nothing of its own. The provider has to stay
// one of the project's components for designs and agents to put the parts in it.

const example = resolve(import.meta.dirname, "../../../examples/shadcn-vite")
/** The example's app components aren't what this is about; only its libraries are read. */
const renderer = { componentExtensions: [".tsx"], findComponents: () => [] } as unknown as RendererAdapter

/** As much of React as the test uses. */
interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
}

let components: Record<string, ComponentSource>
let nova: Record<string, unknown>
let React: ReactLike
let renderToStaticMarkup: (element: unknown) => string

beforeAll(async () => {
  const pkg = JSON.parse(await readFile(join(example, "package.json"), "utf8")) as Record<string, never>
  components = (await discoverProject(example, renderer, pkg)).components
  // The example's own React, which Nova renders with, as Parity loads a project's.
  const fromExample = createRequire(join(example, "package.json"))
  const load = async (specifier: string) =>
    (await import(pathToFileURL(fromExample.resolve(specifier)).href)) as Record<string, unknown>
  React = (await load("react")) as unknown as ReactLike
  renderToStaticMarkup = (await load("react-dom/server")).renderToStaticMarkup as typeof renderToStaticMarkup
  // Nova's exports only name an entry to import, which `require.resolve` doesn't follow.
  const novaPackage = (await findPackage(example, "@buildkitgg/shadcn-baseui-nova"))!
  nova = (await import(pathToFileURL(packageEntry(novaPackage, "runtime")!).href)) as Record<string, unknown>
}, 60_000)

/** A sample as React elements, each part from Nova by its export name: `nova/Sidebar` is `Sidebar`. */
function build(child: SampleChild): unknown {
  if (typeof child === "string") return child
  if (!("component" in child)) throw new Error(`A sample this test can't build: ${JSON.stringify(child)}`)
  return React.createElement(
    nova[child.component.split("/").at(-1)!],
    child.props ?? null,
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
    expect(() => renderToStaticMarkup(sidebar)).toThrow(/within a SidebarProvider/)
  })

  it("draws the sidebar Parity puts in the provider", () => {
    const sample = components["nova/SidebarProvider"]?.sample
    expect(sample?.children?.[0]).toMatchObject({ component: "nova/Sidebar" })
    const markup = renderToStaticMarkup(
      React.createElement(nova.SidebarProvider, sample?.props ?? null, ...(sample?.children ?? []).map(build))
    )
    expect(markup).toContain('data-slot="sidebar-wrapper"')
    expect(markup).toContain('data-slot="sidebar-menu"')
  })

  it("draws a menu item with isActive in Nova's own active style (PAR-457)", () => {
    const button = (isActive: boolean) =>
      renderToStaticMarkup(
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
