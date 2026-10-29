import type { Meta, StoryObj } from "@storybook/react-vite"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Field, SwitchInput, TextInput } from "./fields.tsx"
import { PanelColumn } from "./inspector-stories.tsx"
import { PanelSection } from "./PanelSection.tsx"

/** One section of a side panel: an uppercase title with an optional count and action, a description, then content. */
const meta = {
  title: "Parity/Inspector/Panel section",
  component: PanelSection,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div className="flex h-screen justify-end bg-background text-foreground">
          <PanelColumn>
            <Story />
          </PanelColumn>
        </div>
      </TooltipProvider>
    )
  ],
  args: {
    title: "Visibility",
    children: (
      <Field label="Visible">
        <SwitchInput value onChange={() => undefined} />
      </Field>
    )
  }
} satisfies Meta<typeof PanelSection>

export default meta
type Story = StoryObj<typeof meta>

const addButton = (
  <Button variant="ghost" size="icon-xs" aria-label="Add state">
    <Plus />
  </Button>
)

/** Just a title and its content. */
export const TitleOnly: Story = {}

/** With how many things it holds beside the title. */
export const WithCount: Story = {
  args: {
    title: "Params",
    count: 11,
    children: (
      <Field label="plan">
        <TextInput value="Starter" onCommit={() => undefined} />
      </Field>
    )
  }
}

/** With a description under the title. */
export const WithDescription: Story = {
  args: {
    title: "Modes",
    description: "Pick the mode this design is shown in. Turn others on to see them beside it.",
    children: <p className="px-1 text-xs text-muted-foreground">Desktop Light</p>
  }
}

/** With an action at the end of the title row. */
export const WithAction: Story = {
  args: {
    title: "States",
    action: addButton,
    children: <p className="px-1 text-xs text-muted-foreground">Default</p>
  }
}

/** Everything at once: a count, an action and a description. */
export const Everything: Story = {
  args: {
    title: "Params",
    count: 3,
    action: addButton,
    description: "What each instance sets. Defaults show on this board.",
    children: <p className="px-1 text-xs text-muted-foreground">plan, price, billing</p>
  }
}

/** A title too long for the panel, beside a count and an action. */
export const LongTitle: Story = {
  args: {
    title: "nova/NavigationMenuIndicator props",
    count: 128,
    action: addButton,
    children: <p className="px-1 text-xs text-muted-foreground">No props to set.</p>
  }
}

/** Sections stacked as the inspector stacks them: a rule between each, none after the last. */
export const Stacked: Story = {
  render: () => (
    <>
      <PanelSection title="Content">
        <Field label="Text">
          <TextInput multiline value="Plans that grow with your team" onCommit={() => undefined} />
        </Field>
      </PanelSection>
      <PanelSection title="Visibility">
        <Field label="Visible">
          <SwitchInput value onChange={() => undefined} />
        </Field>
      </PanelSection>
      <PanelSection title="States" count={2} action={addButton}>
        <p className="px-1 text-xs text-muted-foreground">Monthly, Yearly</p>
      </PanelSection>
    </>
  )
}
