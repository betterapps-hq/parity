import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { HoverCard } from "./easing.tsx"
import { defaultCurve, type TransitionEntry } from "./motion-data.ts"
import { easingCss, transitionsWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { durationTokens } from "./tokens.ts"
import { newEntryId, previewTransition, TransitionsSection } from "./transitions.tsx"

/**
 * Motion's Transitions (PAR-652's Transition list), on its own: Motion is a title with + until something's set, and +
 * adds Colors at Tailwind's defaults (150ms, its default curve), shown faintly. Each entry says what changes (All,
 * Colors, Opacity, Transform, Shadow, or a property), then its timing, with the eye, which turns it off without
 * deleting it, and −. Its curve opens its details: what changes, Duration, Easing and Delay. Tailwind takes one
 * transition per element, so one entry is utilities, entries with one timing merge into one property list, and entries
 * with different timings are one arbitrary value, which the entry that causes it says, offering Save as token.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Transition list",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const fallback = `cubic-bezier(${defaultCurve.join(", ")})`

function Transitions({ start }: { start: Omit<TransitionEntry, "id">[] }) {
  const [entries, setEntries] = useState<TransitionEntry[]>(() =>
    start.map((entry) => ({ ...entry, id: newEntryId() }))
  )
  const [savedAs, setSavedAs] = useState<string>()
  const changes = new Set(
    entries
      .filter((entry) => !entry.off)
      .flatMap((entry) => {
        if (entry.property === "all") return ["colors", "opacity", "transform", "shadow"] as const
        if (typeof entry.property === "string") return [entry.property]
        return []
      })
  )
  const transition = previewTransition(entries, (entry) => (entry.easing ? easingCss(entry.easing) : fallback))
  return (
    <Playground
      writes={transitionsWrites(entries, savedAs)}
      preview={<HoverCard transition={transition} changes={[...changes]} />}
    >
      <TransitionsSection
        entries={entries}
        durationTokens={durationTokens}
        savedAs={savedAs}
        onSaveToken={setSavedAs}
        onChange={setEntries}
      />
    </Playground>
  )
}

/** No transitions: Motion is a title with +, which adds Colors at Tailwind's defaults. */
export const Empty: Story = { render: () => <Transitions start={[]} /> }

/** Colors at Tailwind's defaults, shown faintly: `transition-colors`, and nothing else written. */
export const DefaultTiming: Story = { render: () => <Transitions start={[{ property: "colors" }]} /> }

/** One entry: Colors over 200ms, easing out, after 75ms: `transition-colors duration-200 ease-out delay-75`. */
export const OneEntry: Story = {
  render: () => (
    <Transitions
      start={[{ property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" }, delay: { step: 75 } }]}
    />
  )
}

/** Colors and Opacity with one timing, merged into one property list: `transition-[…,opacity] duration-200 ease-out`. */
export const SameTiming: Story = {
  render: () => (
    <Transitions
      start={[
        { property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" } },
        { property: "opacity", duration: { step: 200 }, easing: { keyword: "ease-out" } }
      ]}
    />
  )
}

/**
 * Colors over 200ms and Transform over 300ms with the project's snappy easing: one arbitrary value, which the
 * Transform entry says, offering Save as token.
 */
export const DifferentTimings: Story = {
  render: () => (
    <Transitions
      start={[
        { property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" } },
        { property: "transform", duration: { step: 300 }, easing: { token: "ease-snappy" } }
      ]}
    />
  )
}

/** Shadow turned off with the eye: kept in the list, dimmed, and not written. */
export const EntryOff: Story = {
  render: () => (
    <Transitions
      start={[
        { property: "colors", duration: { step: 200 } },
        { property: "shadow", duration: { step: 200 }, off: true }
      ]}
    />
  )
}

/** Transform on a spring: its duration is the spring's settle time, set by Easing in its details. */
export const Spring: Story = {
  render: () => <Transitions start={[{ property: "transform", easing: { spring: { duration: 500, bounce: 0.3 } } }]} />
}

/** A property of its own, typed in its details: `transition-[filter]`. */
export const PropertyOfItsOwn: Story = {
  render: () => <Transitions start={[{ property: { property: "filter" }, duration: { step: 300 } }]} />
}
