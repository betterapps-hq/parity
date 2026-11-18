import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { openInspector, slowly } from "../../chrome/inspector-stories.tsx"
import { ProjectStage } from "../../stories/fixtures.tsx"
import {
  ComponentWorkspace,
  componentBaseOnly,
  componentManyStates,
  componentStates,
  InstanceWorkspace,
  pricingScreen
} from "./states-workspace.tsx"

/**
 * A component's states are saved setups of its props, and nothing else, as a Storybook story is a set of args
 * (PAR-1069). They lead the props wherever those are edited, on the component itself or on an instance of it.
 *
 * State shows the state the props are in, however many there are: a click or Alt+Down opens the list of them, with what
 * each sets, and typing searches it. Pick one to put its props in. Set props, then Save as new state, at the list's foot
 * or in State's ⋯, saves them as a new state, named at once; or type a name no state has and press Enter. State has no
 * + of its own, since the Props title's adds a prop. Changed props put a dot on their state and a bar under the props:
 * on the component, Save writes them to the state and Discard takes them back; on an instance, Update writes the
 * instance's props to the state and Reset puts the state's back on it. ⋯ renames, duplicates, makes the default or
 * deletes the state, and Undo brings back what was deleted. Base is the props' own values; a prop a state or an instance sets has the change mark, and one
 * it doesn't shows Base's value faintly.
 */
const meta = {
  title: "Parity/Explorations/States",
  parameters: { layout: "fullscreen" },
  loaders: [() => openInspector("design")],
  decorators: [
    (Story) => (
      <ProjectStage className="contents">
        <Story />
      </ProjectStage>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Plan card's own board, with Team picked: its props, and Base, Team and Enterprise above them. */
export const OnTheComponent: Story = { render: () => <ComponentWorkspace initial={componentStates} /> }

/** Before any state is saved: Base alone, ready to save the props set as a first state. */
export const BaseAlone: Story = { render: () => <ComponentWorkspace initial={componentBaseOnly} /> }

/** Switching off Popular in Team puts a dot on Team and the bar under the props, and Save writes it to Team. */
export const SavingAChange: Story = {
  render: () => <ComponentWorkspace initial={componentStates} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("switch", { name: "Popular" }, slowly))
    await userEvent.click(page.getByRole("button", { name: "Save" }))
    await expect(page.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    await expect(within(page.getByRole("button", { name: "Team state" })).queryByText("Popular")).toBeNull()
  }
}

/** Popular switched off in Team, saved as a new state instead: Annual takes the change, and Team stays as it was saved. */
export const SavingAsANewState: Story = {
  render: () => <ComponentWorkspace initial={componentStates} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("switch", { name: "Popular" }, slowly))
    await userEvent.click(page.getByRole("button", { name: "More options for Team" }))
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Save as new state" })
    )
    const name = page.getByRole("textbox", { name: "State name" })
    await userEvent.clear(name)
    await userEvent.type(name, "Annual{Enter}")
    await expect(within(page.getByRole("button", { name: "Annual state" })).queryByText("Popular")).toBeNull()
    await expect(within(page.getByRole("button", { name: "Team state" })).getByText("Popular")).toBeVisible()
  }
}

/** A pricing screen using Plan card three times, with the Team instance selected: Team is pressed in its props. */
export const OnAnInstance: Story = { render: () => <InstanceWorkspace initial={pricingScreen} /> }

/** Popular switched off on the Team instance: the bar offers to update Team with it, or reset the instance to Team. */
export const UpdatingAStateFromAnInstance: Story = {
  render: () => <InstanceWorkspace initial={pricingScreen} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("switch", { name: "Popular" }, slowly))
    // The bar fades in, so it's there before it's seen.
    await expect(page.getByRole("region", { name: "Changed" })).toBeInTheDocument()
    await userEvent.click(page.getByRole("button", { name: "Update" }))
    await expect(page.queryByRole("region", { name: "Changed" })).toBeNull()
  }
}

/** Ten states, their list open: each with what it sets, the one the props are in ticked. Typing narrows them. */
export const TenStates: Story = {
  render: () => <ComponentWorkspace initial={componentManyStates} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("combobox", { name: "State" }, slowly))
    await expect(page.getByRole("listbox", { name: "States" })).toBeInTheDocument()
  }
}

/** Typing a name no state has, then Enter: the props showing are saved as a state with that name. */
export const SavingByName: Story = {
  render: () => <ComponentWorkspace initial={componentStates} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("combobox", { name: "State" }, slowly))
    await userEvent.keyboard("{Control>}a{/Control}Annual{Enter}")
    await expect(page.getByRole("button", { name: "Annual state" })).toBeVisible()
  }
}

/** Deleting Enterprise from its menu, and bringing it back with Undo. */
export const DeletingAState: Story = {
  render: () => <ComponentWorkspace initial={{ ...componentStates, picked: "enterprise" }} />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(await page.findByRole("button", { name: "More options for Enterprise" }, slowly))
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Delete" }))
    await expect(page.queryByRole("button", { name: "Enterprise state" })).toBeNull()
    await userEvent.keyboard("{Control>}z{/Control}")
    await expect(await page.findByRole("button", { name: "Enterprise state" })).toBeVisible()
  }
}
