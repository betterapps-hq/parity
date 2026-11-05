import { addVariant } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { createDesign } from "../../chrome/create.ts"
import { inspecting, slowly } from "../../chrome/inspector-stories.tsx"
import { Inspector } from "../../chrome/Inspector.tsx"
import { LeftPanel } from "../../chrome/LeftPanel.tsx"
import { design, example, node, ProjectStage } from "../../stories/fixtures.tsx"
import { Workspace } from "./workspace.tsx"

/**
 * A screen and its root layout as one thing, decision 3 of docs/proposals/new-user-experience.md. Selecting a screen
 * or component selects its container: the inspector starts with its root's layout, padding, size and fill, as Figma
 * starts with a top-level frame's, and puts what only a screen or component has below: variants and params, states,
 * modes and repeated parts. Layers lists the root's layers straight under the screen, with no Page row between.
 *
 * The canvas here is a sketch of the board. A click on the root's padding selects the screen, a click on a box selects
 * that layer, and Enter, Shift+Enter and Esc run the app's own commands. Layers and the inspector's Design tab are the
 * explorations; every other tab is the shipped one.
 */
const meta = {
  title: "Parity/Explorations/A screen is its container",
  parameters: { layout: "fullscreen" },
  render: () => <Workspace />
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const signIn = () => ({ design: design("Sign in") })

/** Points at the preview's padding, so the sketch hatches it as the place a click selects the screen. */
async function pointAtPadding(canvasElement: HTMLElement, name: string): Promise<void> {
  const preview = await within(canvasElement).findByRole(
    "group",
    { name: new RegExp(`^${name}'s .* preview$`) },
    slowly
  )
  await userEvent.hover(preview)
}

/** Focuses the canvas, as a click on it would, and presses keys there. */
async function pressOnCanvas(canvasElement: HTMLElement, keys: string): Promise<void> {
  within(canvasElement).getByRole("application", { name: "Canvas" }).focus()
  await userEvent.keyboard(keys)
}

/**
 * Sign in selected. Its inspector starts with what used to be Page's: a vertical auto layout with its items centered,
 * its padding, its size and its fill. Then what only a screen has: its three states, its modes and Find repeated parts.
 * The editing bar shows because Sign in has more than one state, and says the root's edits change every state.
 *
 * Layers lists Brand, Sign in card and Terms straight under Sign in. A click on Sign in's padding, hatched here with
 * the pointer over it, selects Sign in. Enter from there selects Brand, Sign in card and Terms, the layers inside.
 */
export const Screen: Story = {
  loaders: [inspecting("design", signIn)],
  play: ({ canvasElement }) => pointAtPadding(canvasElement, "Sign in")
}

/** Sign in selected, as in Screen, in the light theme. A click on its padding selects Sign in; Enter selects the layers inside. */
export const ScreenInLight: Story = { ...Screen, globals: { theme: "light" } }

/** Plan card with an emphasis variant, Standard or Highlighted, added for this story, selected. */
const planCard = () => {
  const key = design("Plan card")
  example().store.updateContainer(key, "Add emphasis variant", (current) =>
    addVariant(current, "emphasis", ["Standard", "Highlighted"])
  )
  return { design: key }
}

/**
 * Plan card selected. Its root is a Card, so the inspector starts with Card's props, then the root's spacing, size and
 * fill. Then what only a component has: its variants (an emphasis variant is added for this story), its params with
 * their defaults and the three places it's used, its states and its modes.
 *
 * Layers lists CardHeader and CardContent straight under Plan card. A click on the card's padding, standing in here
 * for the padding Card draws, selects Plan card. Enter from there selects CardHeader and CardContent.
 */
export const ComponentSelected: Story = {
  loaders: [inspecting("design", planCard)],
  play: ({ canvasElement }) => pointAtPadding(canvasElement, "Plan card")
}

/** Plan card selected, as in Component selected, in the light theme. A click on its padding selects it; Enter selects CardHeader and CardContent. */
export const ComponentInLight: Story = { ...ComponentSelected, globals: { theme: "light" } }

/**
 * What New screen makes, as a person new to Parity gets it: Untitled screen, with the padding, gap and fill that were
 * Page's now its own, and one state, so no editing bar. Layers shows its heading straight under it, where today it
 * shows Untitled screen, then Page, then Untitled screen again.
 *
 * A click on its padding selects Untitled screen. Enter selects the heading, and Enter again edits its text.
 */
export const NewScreen: Story = {
  loaders: [inspecting("design", () => ({ design: createDesign(example(), "screen") }))],
  play: ({ canvasElement }) => pointAtPadding(canvasElement, "Untitled screen")
}

/**
 * Sign in selected, then Enter on the canvas: Brand, Sign in card and Terms are selected, the layers inside, as Figma's
 * Enter selects a frame's children. Layers highlights the three rows, and the inspector shows the shipped panel for
 * several layers. Before Enter, a click on Sign in's padding is what selected Sign in.
 */
export const EnterSelectsTheLayersInside: Story = {
  loaders: [inspecting("design", signIn)],
  play: async ({ canvasElement }) => {
    await pressOnCanvas(canvasElement, "{Enter}")
    await waitFor(() => expect(example().selection.get().nodes).toHaveLength(3))
  }
}

/**
 * Sign in card selected, then Shift+Enter on the canvas: Sign in is selected again, as its container, rather than a
 * Page layer between them. Esc does the same. A click on Sign in's padding selects it too, and Enter from there selects
 * Brand, Sign in card and Terms again.
 */
export const ShiftEnterSelectsTheScreen: Story = {
  loaders: [inspecting("design", () => ({ design: design("Sign in"), node: node("Sign in", "Sign in card") }))],
  play: async ({ canvasElement }) => {
    await pressOnCanvas(canvasElement, "{Shift>}{Enter}{/Shift}")
    await waitFor(() => expect(example().selection.get()).toEqual({ design: design("Sign in") }))
  }
}

/**
 * Sign in selected while it shows Wrong password. The root's edits go to the state being edited, as a layer's do: the
 * editing bar says they change only this state, and a fill or padding changed here is marked and can be reset. A click
 * on Sign in's padding selects Sign in, and Enter selects Brand, Sign in card and Terms, in Wrong password.
 */
export const EditingAnotherState: Story = {
  loaders: [
    inspecting("design", () => {
      const key = design("Sign in")
      example().store.updateView(key, (view) => ({ ...view, state: "wrong-password", allStates: false }))
      return { design: key }
    })
  ]
}

/**
 * For comparison, the shipped Layers and inspector with Sign in selected. The inspector has its name, kind, file,
 * states, Components and modes, but no layout, padding, size or fill: those are Page's. Layers shows Sign in, then
 * Page, then Brand, Sign in card and Terms. On the canvas, a click on Sign in's padding already selects Sign in and
 * Enter already selects Brand, Sign in card and Terms; only Page's row in Layers reaches Page.
 */
export const Today: Story = {
  loaders: [inspecting("design", signIn)],
  render: () => (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <LeftPanel />
      <div className="min-w-0 flex-1 bg-muted/40 dark:bg-muted/20" />
      <Inspector />
    </ProjectStage>
  )
}
