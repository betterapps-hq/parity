import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { HoverCard } from "./easing.tsx"
import { useTokenSets } from "./field-parts.tsx"
import type { TransitionEntry } from "./motion-data.ts"
import { transitionsWrites } from "./motion-writes.ts"
import { Playground } from "./playground.tsx"
import { durationTokens } from "./stand-in-tokens.ts"
import { newEntryId, previewTransition, TransitionsSection } from "./transitions.tsx"

/**
 * Motion's Transitions (PAR-652's Transition list), on its own: Motion is a title with + until something's set, and +
 * adds Colors at Tailwind's defaults (150ms, its default curve), shown faintly. Each entry says what changes (All,
 * Colors, Opacity, Transform, Shadow, or a property), then its timing, with the eye, which turns it off without
 * deleting it, and −, as every list's rows do; with two entries or more, it's picked up by its handle or its body and
 * carried to another place, or moved with Up and Down on its handle. The entry opens its details: Changes, one field
 * that lists the sets, focused or from its chevron, and takes a property typed; Duration and Delay, each drawn as a track for its time; and Easing,
 * drawn as its curve. Tailwind takes one transition per element, so one entry is utilities, entries with one
 * timing merge into one property list, and entries with different timings are one arbitrary value, which a note under
 * the list says, offering Create token.
 */
const meta = {
  title: "Parity/Inspector/Lists/Transition list",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** What the card changes on hover, by the transition sets that cover it. */
const changing = ["colors", "opacity", "transform", "shadow"] as const

/** The card, moving as the written classes would, with the story's tokens, a token made here among them. */
function TransitionsPreview({ entries }: { entries: readonly TransitionEntry[] }) {
  const changes = new Set(
    entries
      .filter((entry) => !entry.off)
      .flatMap((entry) => {
        if (entry.property === "all") {
          return changing
        }

        const set = changing.find((option) => option === entry.property)

        return set === undefined ? [] : [set]
      })
  )

  const sets = useTokenSets()

  return <HoverCard transition={previewTransition(entries, sets)} changes={[...changes]} />
}

function Transitions({ start }: { start: Omit<TransitionEntry, "id">[] }) {
  const [entries, setEntries] = useState<TransitionEntry[]>(() =>
    start.map((entry) => ({ ...entry, id: newEntryId() }))
  )

  const [savedAs, setSavedAs] = useState<string>()

  return (
    <Playground
      writes={transitionsWrites(entries, durationTokens, savedAs)}
      preview={<TransitionsPreview entries={entries} />}
    >
      <TransitionsSection entries={entries} savedAs={savedAs} onSaveToken={setSavedAs} onChange={setEntries} />
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
 * Colors over 200ms and Transform over 300ms with the project's snappy easing: one arbitrary value, which a note
 * under the list says, offering Create token.
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

/** A property of its own, typed into Changes in its details: `transition-[filter]`. */
export const PropertyOfItsOwn: Story = {
  render: () => <Transitions start={[{ property: { property: "filter" }, duration: { step: 300 } }]} />
}
