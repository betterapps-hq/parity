import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { EasingField, HoverCard } from "./easing.tsx"
import { useTokens } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { drawnEasing, type Easing, springSettle } from "./motion-data.ts"
import { easingWrites, timeWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { mixedWrites, type Writes } from "./writes.ts"

/**
 * Easing and spring (PAR-652), as a transition's Easing takes it: a small curve and its name at rest. It's typed as a
 * preset's name (Ease out), a token's (snappy), `cubic-bezier(…)` or `steps(…)`; Up and Down go through Tailwind's
 * easings, then the project's. The curve opens its editor: Curve, with the presets, the project's tokens, the curve's
 * two handles (dragged, or moved with the arrow keys) and Steps; and Spring, set by time and bounce or by stiffness,
 * damping and mass, as Framer's springs are. A spring writes `linear()` over its settle time, which is the transition's
 * duration, so its class runs long and it offers Save as token first.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Easing and spring",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** The card, moving with the easing as it's defined, a token made here among the project's. */
function EasingPreview({ easing, ms }: { easing: Easing | undefined; ms: number }) {
  const { tokens } = useTokens("easing")
  return <HoverCard transition={`translate ${ms}ms ${drawnEasing(easing, tokens)}`} />
}

function EasingStory({
  start,
  open = false,
  tab,
  mixed = false
}: {
  start?: Easing
  open?: boolean
  tab?: "curve" | "spring"
  mixed?: boolean
}) {
  const [easing, setEasing] = useState(start)
  const spring = easing !== undefined && "spring" in easing ? easing.spring : undefined
  // A spring sets the duration to its settle time; otherwise the preview runs slow enough to see the curve.
  const ms = spring ? springSettle(spring) : 600
  let writes: Writes = easingWrites(easing)
  if (mixed && easing === undefined) writes = mixedWrites
  if (spring) {
    const duration = timeWrites("duration", { step: ms })
    writes = {
      stored: { easing: writes.stored, duration: { setBy: "Easing" } },
      css: [...duration.css, ...writes.css],
      tailwind: [...duration.tailwind, ...writes.tailwind]
    }
  }
  return (
    <Playground writes={writes} preview={<EasingPreview easing={easing} ms={ms} />}>
      <Field label="Easing">
        <EasingField
          label="Easing"
          value={easing}
          mixed={mixed && easing === undefined}
          defaultOpen={open}
          defaultTab={tab}
          onChange={setEasing}
        />
      </Field>
    </Playground>
  )
}

/** Unset: Tailwind's default curve, faint, named Default, and nothing written. */
export const Unset: Story = { render: () => <EasingStory /> }

/** Ease out, one of Tailwind's: `ease-out`. */
export const Preset: Story = { render: () => <EasingStory start={{ keyword: "ease-out" }} /> }

/** The project's `ease-snappy`, as a chip with its curve: `ease-snappy`. */
export const Token: Story = { render: () => <EasingStory start={{ token: "ease-snappy" }} /> }

/** A curve of its own that overshoots, with its numbers after the name: `ease-[cubic-bezier(0.34,1.56,0.64,1)]`. */
export const CustomCurve: Story = {
  render: () => <EasingStory start={{ value: "cubic-bezier(0.34, 1.56, 0.64, 1)" }} />
}

/** The editor open on Ease out: drag either handle, or focus one and use the arrow keys; Shift moves 0.1. */
export const CurveEditor: Story = { render: () => <EasingStory start={{ keyword: "ease-out" }} open /> }

/** Steps 4, from the editor's Steps: the count, and whether each jump comes at the start or the end. */
export const Steps: Story = { render: () => <EasingStory start={{ value: "steps(4)" }} open /> }

/**
 * A spring set by time and bounce, 400ms and 0.2: Spring 400ms, written as `linear()` over 400ms, with Save as token
 * offered under it.
 */
export const SpringByTimeAndBounce: Story = {
  render: () => <EasingStory start={{ spring: { duration: 400, bounce: 0.2 } }} open tab="spring" />
}

/** A spring set by its physics, stiffness 170, damping 12, mass 1: it settles when its bounces die away. */
export const SpringByPhysics: Story = {
  render: () => <EasingStory start={{ spring: { stiffness: 170, damping: 12, mass: 1 } }} open tab="spring" />
}

/** Layers with different easings: Mixed, until one is chosen for them all. */
export const Mixed: Story = { render: () => <EasingStory mixed /> }

/** `bouncy` typed and Enter pressed: it's no preset, token or curve, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <EasingStory start={{ keyword: "ease-out" }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Easing" })
    await userEvent.clear(field)
    await userEvent.type(field, "bouncy{Enter}")
  }
}
