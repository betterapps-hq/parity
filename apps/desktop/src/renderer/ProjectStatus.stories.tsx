import type { Meta, StoryObj } from "@storybook/react-vite"
import { TooltipProvider } from "@/components/ui/tooltip"
import { OpeningProject, ProjectFailed } from "./ProjectStatus.tsx"
import { roots } from "./stories/host.ts"
import type { Tab } from "./workspace.ts"

/**
 * What a project's tab shows before the project is ready: the steps of opening it over the editor's outline, or why it
 * couldn't open and what to do next. Parity / App shows them in the whole window.
 */
const meta = {
  title: "Parity/Chrome/Opening a project",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <Story />
        </div>
      </TooltipProvider>
    )
  ]
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const opening = (tab: Partial<Tab>): Story => ({
  render: () => <OpeningProject tab={{ id: roots.example, title: "shadcn-vite", status: "loading", ...tab }} />
})

const failed = (tab: Partial<Tab>): Story => ({
  render: () => <ProjectFailed tab={{ id: roots.broken, title: "broken-app", status: "error", ...tab }} />
})

/** Before the service has said which project it is, as when the app starts with nothing to restore. */
export const StartingUp: Story = opening({
  id: "opening-1",
  title: "Opening…",
  progress: { steps: ["Starting the project's builder", "Loading its components"], current: 0 }
})

/** The builder has started, and the project's components are loading from it. */
export const LoadingComponents: Story = opening({
  progress: { steps: ["Starting Vite", "Loading components from Vite"], current: 1 }
})

/** Opening again after a library was added, so the builder picks it up. */
export const AddingALibrary: Story = opening({
  progress: { steps: ["Loading shadcn/ui Nova", "Loading its components"], current: 0 }
})

/** The service couldn't open the project, and said why. */
export const Failed: Story = failed({
  message: "No renderer supports broken-app: its package.json depends on neither react nor react-dom"
})

/** A long error, such as a builder's output when it crashes: it scrolls, and copies whole. */
export const FailedWithALongError: Story = failed({
  message: [
    "The builder exited with code 1 before it was ready:",
    "",
    '✘ [ERROR] Could not resolve "@/components/ui/chart"',
    "",
    "    src/pages/Dashboard.tsx:4:22:",
    '      4 │ import { ChartContainer } from "@/components/ui/chart"',
    "        ╵                                 ~~~~~~~~~~~~~~~~~~~~~~~",
    "",
    '  You can mark the path "@/components/ui/chart" as external to exclude it from the bundle, which will remove',
    "  this error and leave the unresolved path in the bundle.",
    "",
    "error during build:",
    "Error: Build failed with 1 error:",
    'src/pages/Dashboard.tsx:4:22: ERROR: Could not resolve "@/components/ui/chart"',
    "    at failureErrorWithLog (node_modules/esbuild/lib/main.js:1477:15)",
    "    at node_modules/esbuild/lib/main.js:946:25"
  ].join("\n")
})

/** The default project failed before the service said which it was: there's no folder to try again with. */
export const FailedBeforeItsFolderWasKnown: Story = failed({
  id: "opening-1",
  title: "Opening…",
  message: "The project service stopped before it answered. It may have run out of memory."
})
