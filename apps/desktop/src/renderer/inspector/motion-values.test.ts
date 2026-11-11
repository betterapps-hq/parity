import type { Transition } from "@parity-app/core"
import type { Token } from "@parity-app/tokens"
import { describe, expect, it } from "vite-plus/test"
import { entriesOf, motionTokens, transitionsOf } from "./motion-values.ts"

const keyed = (transitions: Transition[]) =>
  entriesOf(transitions).map((entry, index) => ({ ...entry, id: `entry-${index}` }))

describe("Motion's transitions", () => {
  it("round-trip every form the document holds through the Transition list's entries", () => {
    const transitions: Transition[] = [
      { property: "colors", duration: 200, easing: "ease-out", delay: 75 },
      { property: "width", duration: "duration-fast", easing: "ease-snappy", delay: 12.5 },
      { property: "opacity", easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", off: true },
      { property: "transform", easing: { spring: { duration: 500, bounce: 0.3 } } }
    ]

    expect(entriesOf(transitions)).toEqual([
      { property: "colors", duration: { step: 200 }, easing: { keyword: "ease-out" }, delay: { step: 75 } },
      {
        property: { property: "width" },
        duration: { token: "duration-fast" },
        easing: { token: "ease-snappy" },
        delay: { value: "12.5ms" }
      },
      { property: "opacity", easing: { value: "cubic-bezier(0.2, 0.8, 0.2, 1)" }, off: true },
      { property: "transform", easing: { spring: { duration: 500, bounce: 0.3 } } }
    ])
    expect(transitionsOf(keyed(transitions))).toEqual(transitions)
  })

  it("stores a time typed or read in seconds as milliseconds, and clears the list once it's empty", () => {
    expect(transitionsOf([{ id: "a", property: "all", duration: { value: "0.2s" } }])).toEqual([
      { property: "all", duration: 200 }
    ])
    expect(transitionsOf([])).toBeUndefined()
  })

  it("offers the project's durations and easings, leaving out Tailwind's presets and defaults", () => {
    const token = (name: string, value: string): Token => ({
      name,
      category: "motion",
      source: "theme",
      values: { default: value }
    })

    const { duration, easing } = motionTokens([
      token("duration-fast", "150ms"),
      token("duration-slow", "0.4s"),
      token("ease-snappy", "cubic-bezier(0.2, 0.8, 0.2, 1)"),
      token("ease-out", "cubic-bezier(0, 0, 0.2, 1)"),
      token("default-transition-duration", "150ms")
    ])

    expect(duration.map((each) => [each.name, each.ms])).toEqual([
      ["duration-fast", 150],
      ["duration-slow", 400]
    ])
    expect(easing.map((each) => [each.name, each.curve])).toEqual([["ease-snappy", [0.2, 0.8, 0.2, 1]]])
  })
})
