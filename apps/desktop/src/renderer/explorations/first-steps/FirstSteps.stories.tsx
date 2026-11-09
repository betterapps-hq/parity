import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { expect, userEvent, within } from "storybook/test"
import { AppWindow } from "../../App.tsx"
import { openProjects } from "../../stories/fixtures.tsx"
import { type FirstStep, FirstSteps } from "./FirstSteps.tsx"

/**
 * The first run opens the example, Acme, with three short things to try at the bottom left of its canvas: change a
 * prop, wrap in a layout, check accessibility. Each ticks itself once done, and closing the card puts it away for good.
 * Here a step's row ticks it, standing in for doing it. Kept as an exploration for later: the first run doesn't show it
 * yet (PAR-188).
 */
const meta = {
  title: "Parity/Explorations/First steps",
  parameters: { layout: "fullscreen" },
  loaders: [() => openProjects("example")]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** The window on the example, with the card over its canvas once the canvas is there. */
function FirstRun({ initial = [] }: { initial?: FirstStep[] }) {
  const [done, setDone] = useState<ReadonlySet<FirstStep>>(new Set(initial))
  const [closed, setClosed] = useState(false)
  const [canvas, setCanvas] = useState<Element | null>(null)
  useEffect(() => {
    const find = () => setCanvas(document.querySelector(".canvas-area"))
    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="h-screen">
      <AppWindow />
      {canvas &&
        !closed &&
        createPortal(
          <FirstSteps
            done={done}
            onShow={(step) => setDone((current) => new Set(current).add(step))}
            onClose={() => setClosed(true)}
          />,
          canvas
        )}
    </div>
  )
}

/** The example as it first opens: nothing tried yet. */
export const FirstOpen: Story = { render: () => <FirstRun /> }

/** One step done: it's ticked and its how-to folds away. */
export const OneDone: Story = { render: () => <FirstRun initial={["prop"]} /> }

/** Every step done: the card says so and offers to close. */
export const AllDone: Story = { render: () => <FirstRun initial={["prop", "wrap", "accessibility"]} /> }

/** Closing the card puts it away. */
export const Closing: Story = {
  render: () => <FirstRun />,
  play: async ({ canvasElement }) => {
    const close = await within(canvasElement).findByRole("button", { name: "Close Try these" })
    await userEvent.click(close)
    await expect(within(canvasElement).queryByRole("region", { name: "Try these" })).not.toBeInTheDocument()
  }
}
