import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { TokenList } from "./field-parts.tsx"
import { Playground } from "./playground.tsx"
import { measured, type PresetLayer, presetWrites, type TypeField, typeOf } from "./preset-data.ts"
import { presetTokens, PresetTextSection } from "./preset-text.tsx"
import { TextSample } from "./text-preview.tsx"

/**
 * Typography preset (PAR-186, call 6): Text's first row picks a preset, and the rows it sets fold into a summary under
 * it ("Geist 20/28 Semibold"), with a lock. Opened, they're locked to the preset, each with Unlock at the end of its
 * name's row, and their values drawn faintly and read-only. Unlocked, a row is the ordinary field; changing it overrides
 * the preset there, in the override color with a reset arrow, and it stays shown while the summary is closed, with a
 * dot on the preset's pill. Picking the preset again takes back every override. The field holds the preset as any token
 * field does: Backspace takes it off, typing searches the presets, and its chevron lists them with Detach, which keeps
 * every value it gave. A layer with no preset says which it matches, or is near, with Use. A dot after a row's
 * name says it changes with the viewport. Rows a preset doesn't set stay ordinary rows.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Typography preset",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function PresetStory({ start, open, unlocked }: { start: PresetLayer; open?: boolean; unlocked?: TypeField[] }) {
  const [layer, setLayer] = useState(start)
  const type = measured(typeOf(layer))

  return (
    <Playground
      writes={presetWrites(layer)}
      preview={
        <TextSample
          style={{
            fontFamily: type.stack,
            fontSize: type.size,
            fontWeight: type.weight,
            fontStyle: layer.italic ? "italic" : undefined,
            lineHeight: `${type.lineHeight}px`,
            letterSpacing: `${type.letterSpacing}em`
          }}
        >
          Simple pricing for every team
        </TextSample>
      }
    >
      <PresetTextSection layer={layer} onChange={setLayer} initiallyOpen={open} initiallyUnlocked={unlocked} />
    </Playground>
  )
}

/** Heading applied, folded: one row, its summary with a lock under it, and nothing it sets shown. */
export const Folded: Story = { render: () => <PresetStory start={{ preset: "heading", own: {} }} /> }

/** The summary open: the five rows Heading sets, each locked to it with Unlock, their values faint and read-only. */
export const Opened: Story = { render: () => <PresetStory start={{ preset: "heading", own: {} }} open /> }

/** Size unlocked: the ordinary field, with a lock to put it back, still following Heading until it's changed. */
export const Unlocked: Story = {
  render: () => <PresetStory start={{ preset: "heading", own: {} }} open unlocked={["size"]} />
}

/**
 * Line height overridden at 24px, folded: the row stays shown, its name and value in the override color with a reset
 * arrow back to Heading's 28px, and the preset's pill has a dot. `type-heading leading-6`.
 */
export const Overriding: Story = {
  render: () => <PresetStory start={{ preset: "heading", own: { lineHeight: { px: 24 } } }} />
}

/** Label sets only size and line height, so Font and Weight stay ordinary rows while it's applied. */
export const RowsItDoesntSet: Story = {
  render: () => <PresetStory start={{ preset: "label", own: {} }} open />
}

/** Display grows from Desktop up: a dot after the preset's name, and after Size and Line height, says what each is. */
export const ChangesWithViewport: Story = {
  render: () => <PresetStory start={{ preset: "display", own: {} }} open />
}

/** No preset, with Heading's type set by hand: "Matches a preset." and Use heading applies it. */
export const MatchesAPreset: Story = {
  render: () => (
    <PresetStory
      start={{
        own: {
          font: { token: "sans" },
          size: { token: "xl" },
          weight: { token: "semibold" },
          lineHeight: { px: 28 },
          letterSpacing: { token: "tight" }
        }
      }}
    />
  )
}

/** No preset, at 21px: "Near a preset." and Use heading, with what it changes in its hint. */
export const NearAPreset: Story = {
  render: () => (
    <PresetStory
      start={{
        own: {
          font: { token: "sans" },
          size: { px: 21 },
          weight: { token: "semibold" },
          lineHeight: { px: 28 }
        }
      }}
    />
  )
}

/** Typing searches the presets: each with its Ag and its name in its own type, smallest first, and what it comes to. */
export const Picking: Story = {
  render: () => <PresetStory start={{ preset: "heading", own: {} }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("combobox", { name: "Typography preset" }), "bo")
    await expect(await canvas.findByRole("option", { name: /body/ })).toBeVisible()
  }
}

/**
 * Unlocking Size and typing 22 overrides Heading there; its reset arrow puts Heading's back and locks the row again.
 */
export const OverridingAndResetting: Story = {
  render: () => <PresetStory start={{ preset: "heading", own: {} }} open />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Lock Size to heading", pressed: true }))
    const size = canvas.getByRole("textbox", { name: "Size" })
    await expect(size).toHaveFocus()
    await userEvent.type(size, "22{Enter}")
    await userEvent.click(await canvas.findByRole("button", { name: "Reset Size to heading" }))
    await expect(await canvas.findByRole("button", { name: "Lock Size to heading", pressed: true })).toHaveFocus()
  }
}

/**
 * The presets' list in both densities. Comfortable, what the field's chevron and search show: one box that holds the
 * largest Ag, each style's at its own size, and its name in its own type over what it comes to. Compact, for a tight
 * place: the small mark, the name in its family and weight at the row's size, and what it comes to after it.
 */
function Densities() {
  const [current, setCurrent] = useState<string | undefined>("heading")

  return (
    <div className="flex items-start gap-6 p-6">
      {[false, true].map((compact) => (
        <section key={String(compact)} aria-label={compact ? "Compact" : "Comfortable"} className="flex flex-col gap-2">
          <h2 className="text-xs text-muted-foreground">{compact ? "Compact" : "Comfortable"}</h2>
          <div
            className={`${compact ? "w-72" : "w-80"} rounded-md border bg-popover p-1 text-popover-foreground shadow-md`}
          >
            <TokenList
              label="Typography preset"
              tokens={presetTokens}
              current={current}
              none="None"
              compact={compact}
              onPick={setCurrent}
            />
          </div>
        </section>
      ))}
    </div>
  )
}

export const ListDensities: Story = { render: () => <Densities /> }
