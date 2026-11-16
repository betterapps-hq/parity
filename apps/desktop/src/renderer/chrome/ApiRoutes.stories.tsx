import type { ProjectRoute, RouteSegment } from "@parity-app/core"
import { refsSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, userEvent, waitFor, within } from "storybook/test"
import { AppWindow } from "../App.tsx"
import { routePageDesign, routeRef } from "../canvas/route-pages.ts"
import { example, openProjects } from "../stories/fixtures.tsx"
import { answerNext } from "../stories/host.ts"

/**
 * The app's API routes (PAR-1174): routes that answer requests on the server and draw nothing, as TanStack Start's
 * server routes. Layers lists them under the app's pages, never on the canvas, and the status bar counts only pages. A
 * page can be marked as an API route, and an API route as a page, where Parity read it otherwise (PAR-1175, PAR-1176).
 * On the example, opened with its own routes and some API routes beside them.
 */
const meta = {
  title: "Parity/Left panel/API routes",
  component: AppWindow,
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    )
  ]
} satisfies Meta<typeof AppWindow>

export default meta

type Story = StoryObj<typeof meta>

function route(
  id: string,
  parent: string | undefined,
  { kind = "page", component, index = false }: { kind?: ProjectRoute["kind"]; component?: string; index?: boolean } = {}
): ProjectRoute {
  const path = id === "__root__" ? "/" : id.replace(/(.)\/$/, "$1")
  const file = `src/routes/${id === "__root__" ? "__root" : id.slice(1).replace(/\/$/, "/index").replaceAll("/", ".") || "index"}.${kind === "api" ? "ts" : "tsx"}`

  const segments = path
    .split("/")
    .filter((part) => part !== "")
    .map((part): RouteSegment =>
      part.startsWith("$") ? { type: "param", name: part.slice(1) } : { type: "static", value: part }
    )

  const named: ProjectRoute = {
    id,
    kind: parent === undefined ? "root" : kind,
    segments,
    path,
    parent,
    file,
    index,
    loads: false,
    guards: false
  }

  return component ? { ...named, component } : named
}

const routes = [
  route("__root__", undefined, { component: "RootLayout" }),
  route("/", "__root__", { component: "App", index: true }),
  route("/pricing", "__root__", { component: "Pricing" }),
  route("/projects/", "__root__", { component: "Projects", index: true }),
  route("/projects/$projectId", "__root__", { component: "ProjectDetail" }),
  route("/api/projects", "__root__", { kind: "api" }),
  route("/api/projects/$projectId", "__root__", { kind: "api" }),
  route("/api/auth/callback", "__root__", { kind: "api" }),
  route("/webhooks/stripe", "__root__", { kind: "api" }),
  route("/sitemap.xml", "__root__", { kind: "api" }),
  // A server route whose options a function makes, which Parity can't be sure draws nothing, so it's a page.
  route("/health", "__root__")
]

/** The row Layers lists an API route on. */
function apiRow(id: string): HTMLElement {
  const row = document.getElementById(`layer-api-${id}`)

  if (!row) {
    throw new Error(`Layers lists no API route ${id}`)
  }

  return row
}

/** Right-clicks a row where it is, so its menu opens beside it. */
function rightClick(row: HTMLElement): void {
  const { left, top, height } = row.getBoundingClientRect()
  void fireEvent.contextMenu(row, { clientX: left + 120, clientY: top + height / 2 })
}

/** The example with the routes above, open, and what `then` does once Layers lists them. */
function apiRoutes(then?: () => Promise<void> | void): Story {
  return {
    loaders: [
      async () => {
        answerNext("project.open", async (_, real) => ({ ...(await real()), routes }))
        await openProjects("example")
      }
    ],
    play: async () => {
      await waitFor(() => expect(apiRow("/api/projects")).toBeTruthy())
      await then?.()
    }
  }
}

/** Listed under the app's pages, by path, in their own section. The canvas draws only the pages. */
export const UnderThePages: Story = apiRoutes()

/** One selected: what the router says of it, read-only. It draws nothing, so it has no modes or Export. */
export const Selected: Story = apiRoutes(() => {
  const session = example()
  session.selection.set(refsSelection([routeRef(session.info, "/webhooks/stripe")]))
})

/** Right-clicked: it can be marked as a page, when the app gives it one while it runs (PAR-1176). */
export const MarkAsPage: Story = apiRoutes(() => {
  rightClick(apiRow("/webhooks/stripe"))
})

/**
 * A page right-clicked in Layers: it can be marked as an API route, when Parity couldn't tell it draws nothing
 * (PAR-1175).
 */
export const MarkAsApiRoute: Story = apiRoutes(async () => {
  const session = example()
  const key = routePageDesign(session.id, "/health")

  if (key) {
    rightClick(await waitFor(() => document.getElementById(`layer-${key}`)!))
  }

  await waitFor(() => within(document.body).getByRole("menuitem", { name: "Mark as API route" }))
})

/** Marked: Health leaves the canvas and joins the API routes, and the project file keeps the mark. */
export const Marked: Story = apiRoutes(async () => {
  const session = example()
  const key = routePageDesign(session.id, "/health")

  if (key) {
    rightClick(await waitFor(() => document.getElementById(`layer-${key}`)!))
    await userEvent.click(
      await waitFor(() => within(document.body).getByRole("menuitem", { name: "Mark as API route" }))
    )
  }

  await waitFor(() => expect(apiRow("/health")).toBeTruthy())
  await waitFor(() => expect(routePageDesign(session.id, "/health")).toBeUndefined())
  await expect(session.doc.file(session.doc.main)?.routeKinds).toEqual({ "/health": "api" })
})

/** An API route marked as a page: it leaves the API routes and draws on canvas, with the app's other pages. */
export const MarkedAsPage: Story = apiRoutes(async () => {
  const session = example()
  rightClick(apiRow("/webhooks/stripe"))
  await userEvent.click(await waitFor(() => within(document.body).getByRole("menuitem", { name: "Mark as page" })))
  await waitFor(() => expect(routePageDesign(session.id, "/webhooks/stripe")).toBeDefined())
  await expect(document.getElementById("layer-api-/webhooks/stripe")).toBeNull()
})

/** Marked, then undone: Health is a page again, back on canvas, and the project file keeps no mark. */
export const MarkUndone: Story = apiRoutes(async () => {
  const session = example()
  const key = routePageDesign(session.id, "/health")

  if (key) {
    rightClick(await waitFor(() => document.getElementById(`layer-${key}`)!))
    await userEvent.click(
      await waitFor(() => within(document.body).getByRole("menuitem", { name: "Mark as API route" }))
    )
  }

  await waitFor(() => expect(apiRow("/health")).toBeTruthy())
  session.doc.undo()
  await waitFor(() => expect(routePageDesign(session.id, "/health")).toBeDefined())
  await expect(document.getElementById("layer-api-/health")).toBeNull()
  await expect(session.doc.file(session.doc.main)?.routeKinds).toBeUndefined()
})
