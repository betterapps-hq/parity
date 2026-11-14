import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { hasTriedSize, withoutTriedSize } from "@parity-app/editor"
import { RotateCcw } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { drawnStory } from "../canvas/story-screens.ts"
import type { ContainerEntry } from "../design-store.ts"
import { PanelSection } from "./PanelSection.tsx"

/**
 * Puts a story's layers back at the sizes its file draws them, once one's been dragged on the canvas to see how the
 * story responds. Those sizes are never written to the story's file, so this shows only while there's one to put back.
 */
export function TriedSize({ entry }: { entry: ContainerEntry }) {
  const session = useProject()
  const drawn = drawnStory(session.info, entry.container.id)

  if (!drawn || !hasTriedSize(entry.container, drawn)) {
    return null
  }

  return (
    <PanelSection title="Size">
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() =>
          session.store.updateContainer(entry.key, "Reset size", (design) => withoutTriedSize(design, drawn))
        }
      >
        <RotateCcw aria-hidden />
        Reset size
      </Button>
    </PanelSection>
  )
}
