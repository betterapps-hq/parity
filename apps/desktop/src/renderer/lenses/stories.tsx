import { TabsContent } from "@buildkitgg/shadcn"
import { Bookmark, Layers } from "lucide-react"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { StoryLayerTree } from "../chrome/LayerTree.tsx"
import { SidePanel } from "../chrome/SidePanel.tsx"
import { ProjectCanvas, useOpenProject } from "./project-canvas.tsx"
import type { LensView } from "./registry.ts"
import { useLensWorkspace } from "./shell.ts"

/**
 * The project's story files, on a canvas of their own (lens-layout.md): a board for each, with a row for each of its
 * stories, drawn the first time the lens shows and kept where they were after. Its Layers lists them by file; the inspector shows the
 * selected story, with the args it's drawn with.
 */
export const storiesLens: LensView<"stories"> = {
  id: "stories",
  name: "Stories",
  icon: "bookmark",
  Icon: Bookmark,
  order: 4,
  shortcut: "Ctrl+4",
  // A story is drawn from its file, so there's nothing to draw on it with.
  Canvas: ({ lens, visible }) => <ProjectCanvas lens={lens} draws="stories" visible={visible} tools={false} />,
  Panel: StoriesPanel,
  Inspector: StoriesInspector
}

function StoriesPanel() {
  const { reopen } = useOpenProject()
  const lenses = useLensWorkspace()

  return (
    <ErrorBoundary name="left-panel" label="Left panel" onReopen={reopen} className="w-64 flex-none border-r">
      <SidePanel
        side="left"
        label="Stories"
        defaultTab="layers"
        tabs={[{ value: "layers", label: "Layers", icon: Layers }]}
        // Components, assets, tokens and extensions' tabs are in Screens' panel, so asking for one shows Screens.
        onOtherTab={() => lenses.followLink("screens", false)}
      >
        <TabsContent value="layers" className="flex min-h-0 flex-col">
          <ErrorBoundary name="left.layers" label="Layers">
            <StoryLayerTree />
          </ErrorBoundary>
        </TabsContent>
      </SidePanel>
    </ErrorBoundary>
  )
}

function StoriesInspector() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="inspector" label="Inspector" onReopen={reopen} className="w-72 flex-none border-l">
      <Inspector />
    </ErrorBoundary>
  )
}
