import { SonnerToaster, TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { Decorator } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { fireEvent, within } from "storybook/test"
import type { ProjectInfo } from "../../shared/protocol.ts"
import { AppWindow } from "../App.tsx"
import type { DesignStore } from "../design-store.ts"
import {
  blankProjectAt,
  clearNotifications,
  design,
  example,
  frameDesigns,
  openProjects,
  ProjectStage
} from "../stories/fixtures.tsx"
import { useResolvedTheme } from "../theme.ts"
import { type AppDialog, openDialog } from "./app-dialogs.ts"
import { UnsavedPrompt } from "./UnsavedPrompt.tsx"

/** Helpers for the window chrome's stories: older projects, edits that leave a project unsaved, and where it sits. */

/**
 * A project in another folder on React 18 and Vite 5, versions Parity doesn't test but doesn't block, as detection
 * would report them.
 */
export function olderProjectAt(folder: string): ProjectInfo {
  const info = blankProjectAt(folder)

  const dropped = new Map([
    ["react", { version: "18.3.1", summary: "React 18.3.1 from node_modules/react; untested, Parity tests React 19" }],
    [
      "vite",
      { version: "5.4.11", summary: "Vite 5.4.11 from node_modules/vite; untested, Parity tests Vite 6 or later" }
    ]
  ])

  return {
    ...info,
    builder: { ...info.builder, toolVersion: "5" },
    detection: {
      ...info.detection,
      tools: info.detection.tools.map((tool) => {
        const old = dropped.get(tool.id)

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
export function addNote(store: DesignStore, text: string): void {
  store.addNote(store.mainPath, { id: "story-note", text, position: { x: 0, y: -240 } })
}

/** The window's chrome without a canvas: tooltips, notifications and the unsaved changes prompt, full height. */
export const Chrome: Decorator = (Story) => <ChromeAround story={<Story />} />

function ChromeAround({ story }: { story: ReactNode }) {
  const theme = useResolvedTheme()

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">{story}</div>
      <SonnerToaster
        theme={theme}
        position="bottom-right"
        offset={{ bottom: 40, right: 16 }}
        mobileOffset={{ bottom: 40, left: 16, right: 16 }}
      />
      <UnsavedPrompt />
    </TooltipProvider>
  )
}

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

/** For a dialog's stories: the whole window, which the dialog opens over. Each story opens the project it needs. */
export const dialogStories = {
  render: () => <AppWindow />,
  decorators: [Window],
  loaders: [clearNotifications]
}

/** The example, for a story that needs nothing else set up first. */
export const exampleOpen = () => openProjects("example")

/**
 * Opens `dialog` over the example, as its menu item or keys do, once the canvas has framed Pricing and Dashboard, and
 * finds it by its `name`.
 */
export async function openOverExample(dialog: AppDialog, name: string): Promise<HTMLElement> {
  await frameDesigns("Pricing", "Dashboard")
  openDialog(dialog)

  return within(document.body).findByRole("dialog", { name })
}

/** Enters text in a field, as typing it would. `userEvent.type` changes the field without React's change handler. */
export async function enter(field: HTMLElement, text: string): Promise<void> {
  await fireEvent.input(field, { target: { value: text } })
}
