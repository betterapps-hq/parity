import type { Meta, StoryObj } from "@storybook/react-vite"
import { useAppShortcuts, useShortcuts } from "../../canvas/shortcuts.ts"
import { appLenses } from "../../lenses/app-lenses.ts"
import { LensWorkspace } from "../../lenses/LensWorkspace.tsx"
import { OpenProjectContext } from "../../lenses/project-canvas.tsx"
import { openProject, ProjectStage } from "../../stories/fixtures.tsx"
import { roots } from "../../stories/host.ts"
import { useProject } from "../../workspace.ts"

/** The page a lens's own window opens on, before Dockview moves the lens into it. Storybook serves it. */
const popoutUrl = "/lens-popout/popout.html"

/**
 * The app's lenses, today's canvas on Screens, in the shell with lens windows on, which the app doesn't allow yet. Move
 * Screens to a window of its own with the button at the end of its tabs, then try the canvas there. What works and what
 * breaks is in lens-layout.md, "On Dockview" (PAR-1242).
 */
function CanvasWindow() {
  const session = useProject()?.session
  // The window's shortcuts, as the app's window and project view have them.
  useAppShortcuts()
  useShortcuts(session?.selection, true, session)

  return (
    <div className="flex h-screen flex-col">
      <OpenProjectContext value={{ projectId: roots.example, shown: true, reopen: () => undefined }}>
        <LensWorkspace
          lenses={appLenses}
          layout={{ groups: [{ where: "main", tabs: ["screens", "pages"] }] }}
          popoutUrl={popoutUrl}
          title="Example"
        />
      </OpenProjectContext>
    </div>
  )
}

const meta = {
  title: "Parity/Explorations/Lenses/Canvas window",
  component: CanvasWindow,
  parameters: { layout: "fullscreen" },
  loaders: [() => openProject("example")],
  decorators: [
    (Story) => (
      <ProjectStage project="example" className="block">
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta<typeof CanvasWindow>

export default meta

type Story = StoryObj<typeof meta>

/** Screens and Pages as tabs in the main window, ready for Screens to move to a window of its own. */
export const ScreensInAWindow: Story = {}
