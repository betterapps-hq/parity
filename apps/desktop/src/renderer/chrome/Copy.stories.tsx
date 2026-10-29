import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, spyOn, userEvent, within } from "storybook/test"
import { CopyButton, CopyOnClick } from "./Copy.tsx"

/**
 * Parity's two ways to copy, for anything that copies: a copy button, whose icon turns into a green check and back (with
 * a word, the word reads "Copied" at the same width), and click-to-copy, for things with no room for a button, which
 * raises a bubble from what was clicked. Both say "Couldn't copy" when the clipboard refuses, so a copy never goes
 * without a word.
 */
const meta = {
  title: "Parity/Chrome/Copy",
  parameters: { layout: "centered" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const swatches = ["oklch(0.637 0.237 25.331)", "oklch(0.705 0.213 47.604)", "oklch(0.723 0.219 149.579)"]

function Sheet() {
  return (
    <div className="flex flex-col gap-6 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-28 text-muted-foreground">Copy button</span>
        <code className="font-mono">--radius-md</code>
        <CopyButton text="--radius-md" />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-28 text-muted-foreground">With a word</span>
        <CopyButton text="--shadow-lg" variant="outline">
          Copy
        </CopyButton>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-28 text-muted-foreground">Click to copy</span>
        <div className="flex gap-1">
          {swatches.map((color, index) => (
            <CopyOnClick key={color} text={color} hint={`Shade ${index + 1}`} detail="Click to copy">
              <button
                type="button"
                aria-label={`Copy ${color}`}
                className="size-8 rounded-md"
                style={{ background: color }}
              />
            </CopyOnClick>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Both at rest. Hover the button for its tooltip, a swatch for its hint. */
export const AtRest: Story = {
  render: () => <Sheet />
}

/** Just after the button copied: its check springs in, green, its tooltip says so, then both go back. */
export const ButtonCopied: Story = {
  render: () => <Sheet />,
  play: async ({ canvasElement }) => {
    // Stands in for the clipboard while the checks run, then puts it back so the story copies for real.
    const writes = spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    try {
      const button = within(canvasElement).getByRole("button", { name: "Copy --radius-md" })
      await userEvent.click(button)
      await expect(writes).toHaveBeenLastCalledWith("--radius-md")
      await expect(button).toHaveAttribute("data-copied", "copied")
    } finally {
      writes.mockRestore()
    }
  }
}

/** Just after a swatch was clicked: the bubble rising from it is the only thing that changes. */
export const ClickCopied: Story = {
  render: () => <Sheet />,
  play: async ({ canvasElement }) => {
    const writes = spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    try {
      await userEvent.click(within(canvasElement).getByRole("button", { name: `Copy ${swatches[1]}` }))
      await expect(writes).toHaveBeenLastCalledWith(swatches[1])
      await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Copied")
    } finally {
      writes.mockRestore()
    }
  }
}

/** When the clipboard refuses, as it does when the window isn't focused, both say so with a red cross. */
export const Refused: Story = {
  render: () => <Sheet />,
  play: async ({ canvasElement }) => {
    const writes = spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Document is not focused."))
    // The fallback, copying from a hidden field, refuses too.
    const fallback = spyOn(document, "execCommand").mockReturnValue(false)
    try {
      const button = within(canvasElement).getByRole("button", { name: "Copy --radius-md" })
      await userEvent.click(button)
      await expect(button).toHaveAttribute("data-copied", "failed")
      await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("Couldn't copy")
    } finally {
      writes.mockRestore()
      fallback.mockRestore()
    }
  }
}
