import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"
import { Keyframes, ReducedMotion } from "../../chrome/token-previews.tsx"
import { CanvasBeside, LeftPanelFrame, Stage } from "./frame.tsx"
import { sampleKeyframes, token } from "./preview-data.ts"
import { InspectorPickers, TokenDetail, TokensPanel } from "./token-panels.tsx"

/**
 * Token previews in the inspector's pickers, which the app doesn't have yet, and the panel's and detail's resting
 * pictures with reduced motion. The Tokens panel and a token's detail are built (PAR-141, PAR-143): see Parity / Left
 * panel / Tokens. docs/proposals/previews.md says how the app would build the rest.
 */
const meta = {
  title: "Parity/Explorations/Previews/Tokens",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <Keyframes.Provider value={(name) => sampleKeyframes.get(name)}>
        <Story />
      </Keyframes.Provider>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/**
 * With reduced motion on, nothing plays by itself: rows and details hold their resting picture (a duration's length
 * against half a second, an easing's curve), and Play runs it once asked.
 */
export const ReducedMotionOn: Story = {
  render: () => (
    <ReducedMotion value>
      <Stage className="flex gap-6 p-6">
        <LeftPanelFrame tab="tokens" height={620}>
          <TokensPanel view="list" only={["Motion"]} playing="ease-spring" />
        </LeftPanelFrame>
        <div className="flex flex-col gap-4">
          {["durationNormal", "ease-spring"].map((name) => (
            <div key={name} className="w-80 rounded-lg border bg-popover">
              <TokenDetail token={token(name)} editor={false} />
            </div>
          ))}
        </div>
      </Stage>
    </ReducedMotion>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole("button", { name: /Play/ })).toHaveLength(2)
  }
}

function Inspector({ open }: { open?: string }) {
  return (
    <Stage className="flex justify-end gap-4 p-6">
      <CanvasBeside />
      <InspectorPickers open={open} />
    </Stage>
  )
}

/**
 * The inspector's token fields with a preview in each button. Opacity, blur and border tokens join fills, radii and
 * shadows; Motion shows how transitions would pick tokens if Parity edits them.
 */
export const InspectorFields: Story = {
  render: () => <Inspector />
}

/**
 * The shadow picker: every option with its preview, and under the list a larger one of the option under the pointer or
 * the arrow keys, since a 40px box can't show a 50px shadow.
 */
export const ShadowPicker: Story = {
  render: () => <Inspector open="Shadow" />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog")
    await userEvent.keyboard("{ArrowDown}{ArrowDown}")
    await expect(within(dialog).getAllByText(/^shadow-/).length).toBeGreaterThan(3)
  }
}

/** The easing picker: the highlighted option plays, in its row and in the larger preview under the list. */
export const EasingPicker: Story = {
  render: () => <Inspector open="Easing" />
}

/** Font sizes, each its own size up to what the row can hold, with the size in pixels beside it. */
export const FontSizePicker: Story = {
  render: () => <Inspector open="Size" />
}

/** Proposed specimen copy across sizes, keeping every card at the owner's 320px width. */
export const SpecimenCopy: Story = {
  render: () => (
    <Stage>
      <div className="grid grid-cols-3 items-start gap-4" data-specimen-review>
        {["text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-4xl", "text-6xl"].map((name) => (
          <div key={name} className="w-80 rounded-lg border bg-popover">
            <TokenDetail token={token(name)} />
          </div>
        ))}
        <div className="w-80 rounded-lg border bg-popover">
          <TokenDetail token={{ ...token("text-6xl"), name: "text-7xl", values: { default: "4.5rem" } }} />
        </div>
      </div>
    </Stage>
  )
}
