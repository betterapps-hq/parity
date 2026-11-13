import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useRef, useState } from "react"
import { userEvent, within } from "storybook/test"
import { type CssModel, cssModel, CssSection, cssWrites } from "./css-rows.tsx"
import { fillTokens } from "./expression.tsx"
import { Playground } from "./playground.tsx"

/**
 * Raw CSS value (PAR-186, design-options-values.md's Raw CSS value and design-options-panel.md's CSS), the CSS section on
 * its own: a row per declaration, `property: value` in the code font, with completion of property names (marked † where
 * other browsers lack them) and of values (the property's keywords, then tokens as `var()`). Each is checked with
 * `CSS.supports` after filling in tokens; a checkbox turns a row off without deleting it; a value has its inline
 * preview, a swatch, curve or shadow card, which opens that type's editor. Classes, at the top, shows the layer's classes
 * as Copy as Tailwind writes them: typing classes, or pasting classes or declarations into a row, gives each to the
 * control that owns it and keeps the rest as rows. A class Parity can't read stays as From the code; what can't be read
 * is listed, not dropped. Nothing is cut off: a long value wraps onto more lines, as DevTools' Styles pane does, and
 * Classes grows with its classes, with a handle to drag it taller.
 */
const meta = {
  title: "Parity/Inspector/Fields/Raw CSS value",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** A card with the section's declarations applied, as the canvas draws them. */
function Applied({ css }: { css: string[] }) {
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (card.current) {
      card.current.style.cssText = css
        .filter((line) => !line.startsWith("&"))
        .map(fillTokens)
        .join("; ")
    }
  }, [css])

  return (
    <div className="grid size-64 place-items-center">
      <div className="w-48 rounded-xl border bg-white p-4 text-sm text-neutral-900">
        <div ref={card}>
          Plans
          <input aria-label="A checkbox the accent color draws" type="checkbox" defaultChecked className="ml-2" />
        </div>
      </div>
    </div>
  )
}

function Css({ start }: { start: CssModel }) {
  const [model, setModel] = useState(start)
  const writes = cssWrites(model)

  return (
    <Playground writes={writes} preview={<Applied css={writes.css} />}>
      <CssSection model={model} onChange={setModel} />
    </Playground>
  )
}

/**
 * Rows with their previews: `interpolate-size` marked † (Chromium only), `accent-color` with a swatch that opens the
 * color editor, a timing function with its curve, and a length.
 */
export const Rows: Story = {
  render: () => (
    <Css
      start={cssModel([
        { property: "interpolate-size", value: "allow-keywords" },
        { property: "accent-color", value: "var(--color-chart-2)" },
        { property: "transition-timing-function", value: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        { property: "scroll-margin-top", value: "4rem" }
      ])}
    />
  )
}

/** A row turned off: dimmed, kept in the file, and not written. */
export const OffWithoutDeleting: Story = {
  render: () => (
    <Css
      start={cssModel([
        { property: "accent-color", value: "#f54900", off: true },
        { property: "scroll-margin-top", value: "4rem" }
      ])}
    />
  )
}

/** Values other browsers lack: `field-sizing: content` and `text-wrap: pretty`, each marked †. */
export const NotBaseline: Story = {
  render: () => (
    <Css
      start={cssModel([
        { property: "field-sizing", value: "content" },
        { property: "text-wrap", value: "pretty" }
      ])}
    />
  )
}

/** A value the property doesn't take, and a property this browser doesn't know: each outlined, with why, and not written. */
export const InvalidAsTyped: Story = {
  render: () => (
    <Css
      start={cssModel([
        { property: "accent-color", value: "blurple" },
        { property: "colour", value: "red" }
      ])}
    />
  )
}

/** `padding` typed as a row: Spacing's Padding sets it, so the row offers to move it there, and the shadow row to Effects. */
export const OwnedByAControl: Story = {
  render: () => (
    <Css
      start={cssModel([
        { property: "padding", value: "16px" },
        { property: "box-shadow", value: "0 4px 12px rgb(0 0 0 / 0.15)" }
      ])}
    />
  )
}

/**
 * Classes, a view of the same keys: `p-4`, `rounded-md` and `hover:bg-primary/90` went to their controls, the
 * arbitrary property is a row, and `data-[state=open]:animate-in`, which Parity can't read, stays From the code. Edit
 * the classes and leave the field to read them back.
 */
export const Classes: Story = {
  render: () => (
    <Css
      start={cssModel(
        [{ property: "interpolate-size", value: "allow-keywords" }],
        ["data-[state=open]:animate-in"],
        [
          { property: "padding", value: "16px", control: "Spacing's Padding", tailwind: "p-4" },
          {
            property: "border-radius",
            value: "var(--radius-md)",
            control: "Appearance's Radius",
            tailwind: "rounded-md"
          },
          {
            property: "background-color",
            value: "color-mix(in oklab, var(--color-primary) 90%, transparent)",
            control: "Fill",
            tailwind: "hover:bg-primary/90"
          }
        ]
      )}
    />
  )
}

/** Nothing set: the section's title with +, and Classes empty. + adds a row with its property focused. */
export const Empty: Story = { render: () => <Css start={cssModel([])} /> }

/** + pressed and `inter` typed: completion offers interpolate-size, marked †. */
export const AddingARow: Story = {
  render: () => <Css start={cssModel([])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Add a declaration" }))
    await userEvent.type(await canvas.findByRole("combobox", { name: "Property" }), "inter")
  }
}

/**
 * Declarations pasted into a row: padding goes to Spacing's Padding, interpolate-size becomes a row, and `colour: red`,
 * which isn't CSS, is listed as unread.
 */
export const PastingDeclarations: Story = {
  render: () => <Css start={cssModel([{ property: "scroll-margin-top", value: "4rem" }])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("combobox", { name: "scroll-margin-top value" }))
    await userEvent.paste("padding: 16px; interpolate-size: allow-keywords; colour: red;")
  }
}
