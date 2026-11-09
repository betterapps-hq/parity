import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { HoverCard } from "./easing.tsx"
import { useTokens } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import {
  bezierCss,
  defaultCurve,
  defaultDuration,
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
 * read from code keeps `s` until it's edited. Any whole millisecond is a step (`duration-200`), with no mark; once the
 * project has duration tokens, Tokens offers the nearest first. Up and Down step 10ms, Shift 100ms; a token steps to
 * the next. Duration tokens show as a track against half a second in the token list. With a spring, Duration shows the
 * spring's settle time, set by Easing.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Time",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const curve = bezierCss(defaultCurve)

/** The card, moving over the time set, with the story's duration tokens, a token made here among them. */
function TimePreview({ which, time, spring }: { which: "duration" | "delay"; time?: Time; spring?: Spring }) {
  const { tokens } = useTokens("duration")
  const ms = spring ? springSettle(spring) : (timeMs(time, tokens) ?? (which === "duration" ? defaultDuration : 0))

  const transition =
    which === "duration" ? `translate ${ms}ms ${curve}` : `translate ${defaultDuration}ms ${curve} ${ms}ms`

  return <HoverCard transition={transition} />
}

function Timing({
  which = "duration",
  start,
  withTokens = false,
  spring: startSpring,
  mixed = false
}: {
  which?: "duration" | "delay"
  start?: Time
  /** Whether the project has duration tokens; without them, every whole millisecond is unmarked. */
  withTokens?: boolean
  spring?: Spring
  mixed?: boolean
}) {
  const [time, setTime] = useState(start)
  const [spring, setSpring] = useState(startSpring)
  const label = which === "duration" ? "Duration" : "Delay"
  let writes: Writes = timeWrites(which, time)

  if (mixed && time === undefined) {
    writes = mixedWrites
  }

  if (spring) {
    const settle = springSettle(spring)
    const easing = easingWrites({ spring })
    writes = {
      stored: { duration: { setBy: "Easing" }, easing: easing.stored },
      css: [`transition-duration: ${settle}ms`, ...easing.css],
      tailwind: [`duration-${settle}`, ...easing.tailwind]
    }
  }

  return (
    <Playground
      writes={writes}
      tokens={withTokens ? undefined : { duration: [] }}
      preview={<TimePreview which={which} time={time} spring={spring} />}
    >
      <Field label={label}>
        <TimeField
          label={label}
          which={which}
          value={time}
          defaultMs={which === "duration" ? defaultDuration : 0}
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

/** A duration token, `duration-fast`, as a pill named fast, with 150ms in its hint. Up steps to normal. */
export const Token: Story = { render: () => <Timing start={{ token: "duration-fast" }} withTokens /> }

/**
 * 200ms in a project with duration tokens: no mark, and Tokens offers the nearest first (fast, 150ms, as near as
 * normal), then Create token.
 */
export const OffTheSystem: Story = { render: () => <Timing start={{ step: 200 }} withTokens /> }

/** 200ms allowed here, with its reason in Tokens, which can stop allowing it. */
export const AllowedHere: Story = {
  render: () => <Timing start={{ step: 200, allow: "Matches the video's fade" }} withTokens />
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
