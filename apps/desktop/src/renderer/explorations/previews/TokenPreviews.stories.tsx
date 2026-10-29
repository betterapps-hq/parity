import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, fireEvent, spyOn, userEvent, within } from "storybook/test"
import { CanvasBeside, Labeled, LeftPanelFrame, Stage } from "./frame.tsx"
import { token } from "./preview-data.ts"
import { ReducedMotion } from "./token-art.tsx"
import { InspectorPickers, KindGallery, TokenDetail, TokensPanel } from "./token-panels.tsx"

/**
 * Previews for every kind of token Parity reads, where tokens show: the Tokens panel's rows and tiles, a token's
 * detail, and the inspector's pickers. Everything is drawn with CSS from the token's own value, so no frame renders for
 * it; motion moves only while a token is hovered, highlighted or open, and holds still with reduced motion.
 * docs/proposals/previews.md says how the app would build them.
 */
const meta = {
  title: "Parity/Explorations/Previews/Tokens",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Each kind once: its tile above and its row below. Hover a card to play a motion token. Border widths, opacities,
 * z-indexes and cursors are under Other today, and blur, aspect ratios and perspective under Effects; each gets a
 * section of its own.
 */
export const EveryKind: Story = {
  render: () => (
    <Stage>
      <KindGallery />
    </Stage>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of ["radius-xl", "shadow-lg", "durationNormal", "chakra-z-index-modal", "opacity-scrim"]) {
      await expect(canvas.getByText(name)).toBeInTheDocument()
    }
  }
}

function Panel({ view, query, playing, open, only }: Parameters<typeof TokensPanel>[0]) {
  return (
    <Stage className="flex gap-4 p-6">
      <LeftPanelFrame tab="tokens">
        <TokensPanel view={view} query={query} playing={playing} open={open} only={only} />
      </LeftPanelFrame>
      <CanvasBeside />
    </Stage>
  )
}

/**
 * The Tokens tab with a preview on every row, in one fixed box so names line up whatever the kind. Values are in the
 * units people think in: pixels, milliseconds, percent.
 */
export const PanelRows: Story = {
  render: () => <Panel view="list" />
}

/** Tiles: larger previews two to a row, for comparing shadows, radii or blurs side by side. The list button goes back. */
export const PanelTiles: Story = {
  render: () => <Panel view="tiles" />
}

/**
 * A search for `shadow`: box, inset, drop and text shadows under one heading each, each drawn on the project's light
 * sheet at full size and scaled, so the shadow is the real one.
 */
export const PanelShadows: Story = {
  render: () => <Panel view="tiles" query="shadow" />
}

/**
 * Motion in the panel: durations, easings and animations hold still until hovered. Here `ease-spring` is hovered, so
 * its dot rides its curve, overshoot and all.
 */
export const PanelMotion: Story = {
  render: () => <Panel view="list" only={["Motion"]} playing="ease-spring" />
}

/**
 * Spacing at its true size: each bar is as long as its length, in the rows and in the detail, which lists the scale
 * with this step marked. A length longer than a row can hold, past 128px, is drawn cut, with a break in its bar, and
 * its value says how long it is.
 */
export const PanelSpacing: Story = {
  render: () => <Panel view="list" only={["Spacing"]} open="spacing-24" />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog")
    await expect(within(dialog).getByText("--spacing-24")).toBeInTheDocument()
  }
}

/**
 * Copying, likely what most people open the tab for. Each row has a copy button, shown while it's hovered or has the
 * keyboard, and Ctrl+C on a row does the same; both copy the name as CSS writes it, `--radius-md`, which Parity's fields
 * and the agent take. The button's icon turns into a green check either way. A palette shade copies when clicked, with
 * a bubble saying so. The detail's menu beside the name has the ways to write it in code.
 */
export const Copying: Story = {
  render: () => <Panel view="list" query="radius" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Stands in for the clipboard while the checks run, then puts it back so the story copies for real.
    const writes = spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    try {
      await userEvent.click(canvas.getByRole("button", { name: "Copy --radius-md" }))
      await expect(writes).toHaveBeenLastCalledWith("--radius-md")
      canvas.getByRole("button", { name: /^radius-lg/ }).focus()
      await userEvent.keyboard("{Control>}c{/Control}")
      await expect(writes).toHaveBeenLastCalledWith("--radius-lg")
      await expect(canvas.getByRole("button", { name: "Copy --radius-lg" })).toHaveAttribute("data-copied", "copied")
    } finally {
      writes.mockRestore()
    }
  }
}

/**
 * A token's detail, opened by clicking its row: a large preview, its name with a copy button and a menu of the ways to
 * write it in code, the tokens its value goes through and how many layers use it, then its value, which can't be
 * changed until Edit. Clicking away or Escape closes it.
 */
export const DetailFromRow: Story = {
  render: () => <Panel view="list" query="radius" open="radius-md" />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog")
    await expect(within(dialog).getByText("--radius-md")).toBeInTheDocument()
    await expect(within(dialog).getByRole("button", { name: "Copy --radius-md" })).toBeInTheDocument()
    await expect(within(dialog).getByRole("button", { name: "Copy for code" })).toBeInTheDocument()
    await expect(within(dialog).getByText(/Comes to/)).toBeInTheDocument()
    await expect(within(dialog).getByRole("button", { name: "Edit" })).toBeInTheDocument()
  }
}

/**
 * Editing checks each value as it's typed. Here the closing bracket of `calc(var(--radius) * 2.6)` is gone: the
 * browser would close it without a word, so the check says so, Save stays off and the preview keeps the last value it
 * could draw. Nothing is written until Save; Cancel or Escape leaves editing and writes nothing.
 */
export const DetailEditing: Story = {
  render: () => <Panel view="list" query="radius" open="radius-4xl" />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Edit" }))
    const field = within(dialog).getByDisplayValue("calc(var(--radius) * 2.6)")
    await fireEvent.input(field, { target: { value: "calc(var(--radius) * 2.6" } })
    await expect(within(dialog).getByText(/A bracket isn't closed/)).toBeInTheDocument()
    await expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled()
  }
}

/**
 * After Save the detail shows the value again and says where it was written, with Undo to write the old value back.
 * The row shows the new value too.
 */
export const DetailSaved: Story = {
  render: () => <Panel view="list" query="radius" open="radius" />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Edit" }))
    const field = within(dialog).getByDisplayValue("0.625rem")
    await fireEvent.input(field, { target: { value: "0.75rem" } })
    await expect(within(dialog).getByText(/Not saved yet/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(within(dialog).getByText(/Saved to src\/index.css/)).toBeInTheDocument()
    await expect(within(dialog).getByRole("button", { name: "Undo" })).toBeInTheDocument()
  }
}

/**
 * The detail for a range of kinds, without the editor. Colors show both themes; a font size and a font show the
 * project's type; a z-index shows the whole stack; a breakpoint sits on a ruler with phone, tablet and laptop widths.
 */
export const Details: Story = {
  render: () => (
    <Stage>
      <div className="grid grid-cols-[repeat(auto-fill,320px)] items-start gap-4">
        {[
          "primary",
          "border",
          "radius-md",
          "shadow-lg",
          "text-2xl",
          "font-heading",
          "chakra-z-index-modal",
          "breakpoint-lg",
          "opacity-scrim",
          "blur-md",
          "backdrop-blur-sm",
          "aspect-video"
        ].map((name) => (
          <div key={name} className="rounded-lg border bg-popover">
            <TokenDetail token={token(name)} editor={false} />
          </div>
        ))}
      </div>
    </Stage>
  )
}

/**
 * Motion's details, which play while open. A duration races the rest of its scale, so 200ms reads against 50 and 500;
 * an easing draws its curve over the others in the project; an animation runs its keyframes. Each has Pause.
 */
export const MotionDetails: Story = {
  render: () => (
    <Stage>
      <div className="flex flex-wrap items-start gap-4">
        {["durationNormal", "ease-out", "ease-spring", "animate-bounce", "animate-fade-in"].map((name) => (
          <Labeled key={name} label={name}>
            <div className="w-80 rounded-lg border bg-popover">
              <TokenDetail token={token(name)} editor={false} />
            </div>
          </Labeled>
        ))}
      </div>
    </Stage>
  )
}

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
