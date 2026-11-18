import type { ProjectRoute, RouteSegment } from "@parity-app/core"
import { refsSelection, routeScreenId } from "@parity-app/editor"
import { updateView } from "@parity-app/multiplayer"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Box } from "tldraw"
import { AppWindow } from "../App.tsx"
import { example, openProject, showLens } from "../stories/fixtures.tsx"
import { answerNext } from "../stories/host.ts"
import { canvasIdFor } from "./CanvasEditor.tsx"
import { routePagesFile, routeRef } from "./route-pages.ts"

/**
 * The lines of the app's page tree (PAR-1076), on Pages' canvas, on the example opened with its own routes, as the TanStack Router
 * adapter reads them: App holds Pricing, Projects, Project detail and Settings. Settings' index only redirects to
 * Profile, so Settings has no page of its own: it's a group around Billing and Profile, with where it redirects in its
 * header. At rest the lines are faint, their dashes flowing down the tree; selecting or hovering a page brings forward
 * its way up to App and the lines to the pages under it. A line leads to its page: hovering it brings that page's lines
 * forward, and clicking it selects the page.
 */
const meta = {
  title: "Parity/Canvas/Page tree",
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

function route(id: string, path: string, parent: string | undefined, component?: string, index = false): ProjectRoute {
  const file = `src/routes/${id === "__root__" ? "__root" : id.slice(1).replace(/\/$/, "/index").replaceAll("/", ".") || "index"}.tsx`

  // The example's router writes a param as `$name`; Parity reads it as a param segment.
  const segments = path
    .split("/")
    .filter((part) => part !== "")
    .map((part): RouteSegment =>
      part.startsWith("$") ? { type: "param", name: part.slice(1) } : { type: "static", value: part }
    )

  const kind = parent === undefined ? "root" : "page"
  const named: ProjectRoute = { id, kind, segments, path, parent, file, index, loads: false, guards: false }

  return component ? { ...named, component } : named
}

const routes = [
  route("__root__", "/", undefined, "RootLayout"),
  route("/", "/", "__root__", "App", true),
  route("/pricing", "/pricing", "__root__", "Pricing"),
  route("/settings", "/settings", "__root__", "SettingsLayout"),
  { ...route("/settings/", "/settings", "/settings", undefined, true), redirect: "/settings/profile" },
  route("/settings/billing", "/settings/billing", "/settings", "Billing"),
  route("/settings/profile", "/settings/profile", "/settings", "Profile"),
  route("/projects/", "/projects", "__root__", "Projects", true),
  route("/projects/$projectId", "/projects/$projectId", "__root__", "ProjectDetail")
]

/** A page's key among the example's designs, by its route. */
const page = (id: string) => `${routePagesFile}#${routeScreenId({ id })}`

const pages = ["/", "/pricing", "/settings/billing", "/settings/profile", "/projects/", "/projects/$projectId"]

/**
 * The example with its routes, framed on its page tree at `zoom`, or fitted, with the page `selected` selected, or the
 * layout group `group`, and the page `wide` showing more modes. The pages are real boards, so they can be clicked and
 * hovered to bring their lines forward.
 */
function pageTree({
  zoom,
  selected,
  group,
  wide
}: { zoom?: number; selected?: string; group?: string; wide?: string } = {}): Story {
  return {
    loaders: [
      async () => {
        answerNext("project.open", async (_, real) => ({ ...(await real()), routes }))
        await openProject("example")
      }
    ],
    play: async () => {
      await showLens("Pages")
      const session = example()

      for (let tries = 0; tries < 100 && !session.editor?.getShapePageBounds(canvasIdFor(page("/"))); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Its modes are turned on as its Modes menu turns them on, and the pages lay out again to make room.
      if (wide) {
        updateView(session.doc, page(wide), "Show modes", (view) => ({
          ...view,
          modes: ["desktop-dark", "tablet-light", "mobile-light"]
        }))
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      const editor = session.editor
      // A page showing more modes is framed with the page beside it, so its frames and the room made read.
      const framed = wide ? [wide, "/projects/"] : pages
      const bounds = framed.flatMap((id) => editor?.getShapePageBounds(canvasIdFor(page(id))) ?? [])

      if (!editor || bounds.length === 0) {
        return
      }

      editor.zoomToBounds(Box.Common(bounds), zoom ? { targetZoom: zoom } : { inset: 64 })

      if (selected) {
        session.selection.set({ design: page(selected) })
      }

      // A layout group is selected by its route.
      if (group) {
        session.selection.set(refsSelection([routeRef(session.info, group)]))
      }
    }
  }
}

/** At rest: every line faint, its dashes flowing down the tree, so the pages stand out. */
export const AtRest: Story = pageTree()

/** Pricing selected: its line up to App comes forward in the page color, flowing. */
export const PageSelected: Story = pageTree({ selected: "/pricing" })

/** Settings' group selected: its outline turns solid, and its line up to App comes forward. */
export const GroupSelected: Story = pageTree({ group: "/settings" })

/** Billing selected: its way up through Settings' group to App comes forward, and nothing else. */
export const DeepPageSelected: Story = pageTree({ selected: "/settings/billing" })

/** Zoomed out to 5% with Settings' group selected: the lines still flow, faint or brought forward. */
export const ZoomedOut: Story = pageTree({ zoom: 0.05, group: "/settings" })

/**
 * Pricing showing Desktop Dark, Tablet Light and Mobile Light beside Desktop Light (PAR-1317), framed with Projects:
 * its frames side by side on its board, and Projects, Project detail and Settings' group moved aside to make room.
 */
export const MoreModes: Story = pageTree({ wide: "/pricing" })
