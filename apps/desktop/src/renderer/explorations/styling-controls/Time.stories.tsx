import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Field } from "../../chrome/fields.tsx"
import { HoverCard } from "./easing.tsx"
import {
  defaultCurve,
  defaultDuration,
  type DurationToken,
  durationTokens,
  type Spring,
  springSettle,
  type Time,
  timeMs
} from "./motion-data.ts"
import { easingWrites, timeWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { TimeField } from "./time.tsx"
import { mixedWrites, type Writes } from "./writes.ts"

/**
 * A time (PAR-652's Time), as a transition's Duration and Delay take it: milliseconds. `0.2s` typed becomes 200ms; one
 * read from code keeps `s` until it's edited. Any whole millisecond is a step (`duration-200`), unmarked while the
 * project has no duration tokens, and marked once it has some, with the nearest token in the mark's menu. Up and Down
 * step 10ms, Shift 100ms; the label scrubs; a token steps to the next. Duration tokens show as a track against half a
 * second. With a spring, Duration shows the spring's settle time, set by Easing.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Time",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const curve = `cubic-bezier(${defaultCurve.join(", ")})`

function Timing({
  which = "duration",
  start,
  tokens = [],
  spring: startSpring,
  mixed = false
}: {
  which?: "duration" | "delay"
  start?: Time
  tokens?: readonly DurationToken[]
  spring?: Spring
  mixed?: boolean
}) {
  const [time, setTime] = useState(start)
  const [spring, setSpring] = useState(startSpring)
  const label = which === "duration" ? "Duration" : "Delay"
  let writes: Writes = timeWrites(which, time)
  if (mixed && time === undefined) writes = mixedWrites
  if (spring) {
    const settle = springSettle(spring)
    const easing = easingWrites({ spring })
    writes = {
      stored: { duration: { setBy: "Easing" }, easing: easing.stored },
      css: [`transition-duration: ${settle}ms`, ...easing.css],
      tailwind: [`duration-${settle}`, ...easing.tailwind]
    }
  }
  const ms = spring ? springSettle(spring) : (timeMs(time, tokens) ?? (which === "duration" ? defaultDuration : 0))
  const transition =
    which === "duration" ? `translate ${ms}ms ${curve}` : `translate ${defaultDuration}ms ${curve} ${ms}ms`
  return (
    <Playground writes={writes} preview={<HoverCard transition={transition} />}>
      <Field label={label}>
        <TimeField
          label={label}
          which={which}
          value={time}
          defaultMs={which === "duration" ? defaultDuration : 0}
          tokens={tokens}
          mixed={mixed && time === undefined}
          setBy={
            spring && "duration" in spring
              ? {
                  control: "Easing",
                  ms: springSettle(spring),
                  onChange: (duration) => setSpring({ ...spring, duration })
                }
              : undefined
          }
          onChange={setTime}
        />
      </Field>
    </Playground>
  )
}

/** Unset: Tailwind's default, 150ms, shown faintly, and nothing written. */
export const Unset: Story = { render: () => <Timing /> }

/** 200ms, a step: `duration-200`, unmarked in a project with no duration tokens. */
export const Step: Story = { render: () => <Timing start={{ step: 200 }} /> }

/** `0.2s` typed and Enter pressed: it becomes 200ms. */
export const TypedInSeconds: Story = {
  render: () => <Timing />,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("textbox", { name: "Duration" }), "0.2s{Enter}")
  }
}

/** `0.2s` read from code: shown as 200ms with "as 0.2s" after it, and written back as `duration-[0.2s]`. */
export const ReadFromCode: Story = { render: () => <Timing start={{ value: "0.2s" }} /> }

/** A duration token, `duration-fast`, as a chip with its track against half a second. Up steps to normal. */
export const Token: Story = { render: () => <Timing start={{ token: "duration-fast" }} tokens={durationTokens} /> }

/**
 * 200ms in a project with duration tokens: marked as off the system, with Use nearest (fast, 150ms, as near as normal), Create token
 * and Allow here in the mark's menu.
 */
export const OffTheSystem: Story = { render: () => <Timing start={{ step: 200 }} tokens={durationTokens} /> }

/** 200ms allowed here, with its reason in the filled mark's hint. */
export const AllowedHere: Story = {
  render: () => <Timing start={{ step: 200, allow: "Matches the video's fade" }} tokens={durationTokens} />
}

/** Delay, 75ms: `delay-75`. Unset, it's 0. A delay can be negative, starting partway through. */
export const Delay: Story = { render: () => <Timing which="delay" start={{ step: 75 }} /> }

/**
 * With a spring for its easing, Duration shows the spring's settle time, 400ms, set by Easing. Typing a time changes
 * the spring's.
 */
export const SetByEasing: Story = { render: () => <Timing spring={{ duration: 400, bounce: 0.2 }} /> }

/** Layers with different durations: Mixed, until a time is typed for them all. */
export const Mixed: Story = { render: () => <Timing mixed /> }

/** `soon` typed and Enter pressed: it isn't a time, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Timing start={{ step: 200 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Duration" })
    await userEvent.clear(field)
    await userEvent.type(field, "soon{Enter}")
  }
}
