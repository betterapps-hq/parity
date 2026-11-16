import { annotationKinds, type ReviewTool } from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { floatingBar } from "../../chrome/toolbar-parts.tsx"
import { openProjects, ProjectStage } from "../../stories/fixtures.tsx"
import { ReviewBar } from "./ReviewBar.tsx"
import { ReviewToolBar } from "./ReviewToolBar.tsx"

/**
 * The bars the toolbar warps into while a review tool is picked (PAR-795): each kind of annotation's, its options as
 * stamps with Suggest and Done, and Comment's. While reviewing shows the other way, a bar beside the toolbar, kept for
 * later.
 */
const meta = {
  title: "Parity/Collaboration/Annotations/Toolbar",
  component: ReviewToolBar,
  render: (args) => (
    <div className={floatingBar}>
      <div className="flex h-8 w-max items-stretch gap-0.5">
        <ReviewToolBar {...args} />
      </div>
    </div>
  ),
  decorators: [
    (Story) => (
      <ProjectStage className="grid h-screen place-items-center bg-background text-foreground">
        <Story />
      </ProjectStage>
    )
  ],
  loaders: [() => openProjects("example")]
} satisfies Meta<typeof ReviewToolBar>

export default meta

type Story = StoryObj<typeof meta>

/** Behaviour's options: what it does when someone uses it. */
export const Behaviour: Story = { args: { tool: "behaviour" } }

/** Content's options: what it says, and where that comes from. */
export const Content: Story = { args: { tool: "content" } }

/** Accessibility's options, from the Accessibility annotations exploration. */
export const Accessibility: Story = { args: { tool: "accessibility" } }

/** Development's options: what whoever builds it should know. */
export const Development: Story = { args: { tool: "development" } }

/** Comment's bar, which has no options, so it says what a click does. */
export const Comment: Story = { args: { tool: "comment" } }

/** Picking a stamp shows its name beside its chip, and only the picked one's. */
export const PickedStamp: Story = {
  args: { tool: "behaviour" },
  play: async ({ canvasElement }) => {
    const bar = within(canvasElement)
    await userEvent.click(bar.getByRole("button", { name: "Navigates to" }))

    await expect(bar.getByRole("button", { name: "Navigates to" })).toHaveTextContent("Navigates to")
    await expect(bar.getByRole("button", { name: "On click" })).not.toHaveTextContent("On click")
  }
}

const reviewTools: ReviewTool[] = ["comment", ...annotationKinds]

/** Each review tool's bar beside the toolbar, saying what a click does, with Done. */
export const WhileReviewing: Story = {
  args: { tool: "comment" },
  render: () => (
    <div className="grid gap-3">
      {reviewTools.map((tool) => (
        <ReviewBar key={tool} tool={tool} />
      ))}
    </div>
  )
}
