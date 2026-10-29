import type { Decorator } from "@storybook/react-vite"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { blankProjectAt, design, example, ProjectStage } from "../stories/fixtures.tsx"
import type { ProjectSession } from "../workspace.ts"
import { UnsavedPrompt } from "./UnsavedPrompt.tsx"

/** Helpers for the window chrome's stories: older projects, edits that leave a project unsaved, and where it sits. */

/**
 * A project in another folder on React 18 and Vite 5, versions Parity doesn't test but doesn't block, as detection
 * would report them.
 */
export function olderProjectAt(folder: string): ProjectInfo {
  const info = blankProjectAt(folder)
  const dropped: Record<string, { version: string; summary: string }> = {
    react: { version: "18.3.1", summary: "React 18.3.1 from node_modules/react; untested, Parity tests React 19" },
    vite: { version: "5.4.11", summary: "Vite 5.4.11 from node_modules/vite; untested, Parity tests Vite 6 or later" }
  }
  return {
    ...info,
    builder: { ...info.builder, toolVersion: "5" },
    detection: {
      ...info.detection,
      tools: info.detection.tools.map((tool) => {
        const old = dropped[tool.id]
        return old ? { ...tool, ...old, status: "dropped" as const } : tool
      }),
      notice:
        "Not tested with Parity: React 18.3.1 and Vite 5.4.11. Nothing is blocked; Parity tests versions from the last two years, and each tool's newest."
    }
  }
}

/** Renames one of the example's designs as the Layers panel would: one undoable step that leaves it unsaved. */
export function renameDesign(name: string, to: string): void {
  example().store.updateContainer(design(name), "Rename design", (container) => ({ ...container, name: to }))
}

/** Adds a text note to a project's canvas, leaving it unsaved. */
export function addNote(session: ProjectSession, text: string): void {
  session.store.addNote(session.store.mainPath, { id: "story-note", text, position: { x: 0, y: -240 } })
}

/** The window's chrome without a canvas: tooltips, notifications and the unsaved changes prompt, full height. */
export const Chrome: Decorator = (Story) => (
  <TooltipProvider>
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Story />
    </div>
    <Toaster position="bottom-right" offset={{ bottom: 40, right: 16 }} />
    <UnsavedPrompt />
  </TooltipProvider>
)

/** The active tab's project around a story, at the bottom of the window as the app places the status bar. */
export const AtBottom: Decorator = (Story) => (
  <ProjectStage className="flex h-screen flex-col justify-end bg-background text-foreground">
    <Story />
  </ProjectStage>
)

/** The whole window, full height, for chrome that sits on the canvas or reads it. */
export const Window: Decorator = (Story) => (
  <div className="h-screen">
    <Story />
  </div>
)
