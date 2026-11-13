import { insertNode } from "@parity-app/core"
import { layersSelection } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useMemo } from "react"
import { ProjectContext, useProject } from "../canvas/context.ts"
import { useContainerEntry } from "../design-store.ts"
import { SelectionStore } from "../selection.ts"
import { design, example, node, ProjectStage } from "../stories/fixtures.tsx"
import { DesignTabFields } from "./DesignPanel.tsx"
import { inspecting } from "./inspector-stories.tsx"
import { LayerPanel } from "./LayerPanel.tsx"

/**
 * Every kind of layer's Design panel side by side, to compare them while each kind's panel is built (PAR-1056). Each
 * column is the app's own `LayerPanel` with that layer selected; a kind's own panel replaces its column's as it lands.
 */
const meta = {
  title: "Parity/Inspector/Layers/All kinds",
  render: () => <KindColumns />,
  decorators: [
    // The app's page doesn't scroll, so the stage does, both ways, as the columns run past the window.
    (Story) => (
      <ProjectStage className="h-screen overflow-auto bg-background text-foreground">
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The layers each column selects, by design and layer name, and the media the loader adds to Pricing's hero. */
const columns = [
  { design: "Pricing", layer: "Nav" },
  { design: "Pricing", layer: "Page" },
  { design: "Pricing", layer: "Headline" },
  { design: "Plan card", layer: "Call to action" },
  { design: "Plan card", layer: "lucide/Check" },
  { design: "Pricing", id: "hero-image" },
  { design: "Pricing", id: "hero-video" }
] as const

function KindColumns() {
  return (
    <div className="flex w-max items-start gap-1.5 divide-x">
      {columns.map((column) => {
        const id = "id" in column ? column.id : node(column.design, column.layer)

        return (
          <Selected key={id} design={design(column.design)} node={id}>
            <section className="w-80 shrink-0">
              <DesignTabFields>
                <Column />
              </DesignTabFields>
            </section>
          </Selected>
        )
      })}
    </div>
  )
}

/** The project with its own selection, of one layer, so each column's panel reads its own. */
function Selected({ design: key, node: id, children }: { design: string; node: string; children: ReactNode }) {
  const session = useProject()

  const scoped = useMemo(() => {
    const selection = new SelectionStore()
    selection.set(layersSelection(key, [id]))
    // SAFETY: an object made from the session inherits every one of its parts, and only the selection is its own.
    const copy = Object.create(session) as typeof session

    return Object.assign(copy, { selection })
  }, [session, key, id])

  return <ProjectContext value={scoped}>{children}</ProjectContext>
}

function Column() {
  const { store, selection } = useProject()
  const selected = selection.get()
  const entry = useContainerEntry(store, selected.design)

  return entry && selected.node ? <LayerPanel entry={entry} nodeId={selected.node} /> : null
}

/** Pricing's hero gets a picture and a clip, so the image's and the video's columns have a layer to show. */
const withMedia = inspecting("design", () => {
  const key = design("Pricing")

  const media = {
    name: "Team photo",
    alt: "Four people around a laptop, planning a launch",
    fit: "contain",
    style: { width: { size: "fill" }, height: { step: 60 } }
  } as const

  example().store.updateContainer(key, "Add media", (container) => ({
    ...container,
    root: insertNode(
      insertNode(
        container.root,
        node("Pricing", "Hero"),
        { ...media, id: "hero-image", type: "image", src: "/images/team-at-work.jpg" },
        { index: 3 }
      ),
      node("Pricing", "Hero"),
      { ...media, id: "hero-video", name: "Launch clip", type: "video", src: "/videos/launch.mp4", controls: true },
      { index: 4 }
    )
  }))
})

/** Layout, root layout, text, component instance, icon, image and video, left to right. */
export const AllKinds: Story = { name: "All kinds", loaders: [withMedia] }
