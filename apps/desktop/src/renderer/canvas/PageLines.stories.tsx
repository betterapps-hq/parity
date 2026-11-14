import type { ProjectRoute } from "@parity-app/core"
import { routeScreenId } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Box } from "tldraw"
import { AppWindow } from "../App.tsx"
import { example, openProjects } from "../stories/fixtures.tsx"
import { answerNext } from "../stories/host.ts"
import { canvasIdFor } from "./CanvasEditor.tsx"
import { routePagesFile, selectedPageGroup } from "./route-pages.ts"

/**
 * The lines of the app's page tree (PAR-1076), on the example opened with its own routes, as the TanStack Router
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
  const params = path.match(/\$(\w+)/g)?.map((param) => param.slice(1)) ?? []
  const named: ProjectRoute = { id, path, parent, file, params, index, loads: false, guards: false }

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
 * layout group `group`. The pages are real boards, so they can be clicked and hovered to bring their lines forward.
 */
function pageTree({ zoom, selected, group }: { zoom?: number; selected?: string; group?: string } = {}): Story {
  return {
    loaders: [
      async () => {
        answerNext("project.open", async (_, real) => ({ ...(await real()), routes }))
        await openProjects("example")
      }
    ],
    play: async () => {
      const session = example()

      for (let tries = 0; tries < 100 && !session.editor?.getShapePageBounds(canvasIdFor(page("/"))); tries++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      const editor = session.editor
      const bounds = pages.flatMap((id) => editor?.getShapePageBounds(canvasIdFor(page(id))) ?? [])

      if (!editor || bounds.length === 0) {
        return
      }

      editor.zoomToBounds(Box.Common(bounds), zoom ? { targetZoom: zoom } : { inset: 64 })

      if (selected) {
        session.selection.set({ design: page(selected) })
      }

      selectedPageGroup.set(group && page(group))
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
