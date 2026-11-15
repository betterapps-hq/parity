import type { AdapterIcon, StatusFacts } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import type { ProjectDetection } from "./detection.ts"
import { adapterStatus } from "./index.ts"

const logo: AdapterIcon = { viewBox: "0 0 24 24", path: "M0 0h24v24H0z" }

const detection: ProjectDetection = {
  packageManager: { id: "pnpm", name: "pnpm", agent: "pnpm", summary: "pnpm from pnpm-lock.yaml" },
  tools: [
    { id: "tool", name: "Tool", version: "2.0.0", status: "supported", summary: "Tool 2.0.0" },
    { id: "old", name: "Old", version: "1.0.0", status: "dropped", summary: "Old 1.0.0; untested" }
  ]
}

describe("adapterStatus", () => {
  it("tells each adapter its version and the package manager", () => {
    const told: StatusFacts[] = []

    const listening = (id: string) => ({
      id,
      status: (facts: StatusFacts) => {
        told.push(facts)

        return []
      }
    })

    adapterStatus([{ adapter: listening("tool") }, { adapter: listening("other"), version: "9.1.0" }], detection)

    expect(told.map((facts) => [facts.version, facts.packageManager])).toEqual([
      ["2.0.0", "pnpm"],
      ["9.1.0", "pnpm"]
    ])
  })

  it("gives an item that names no icon its adapter's logo, and leaves a named icon alone", () => {
    const items = adapterStatus(
      [
        {
          adapter: {
            id: "tool",
            icon: logo,
            status: () => [
              { value: "Tool", hint: "Tool" },
              { icon: "route", value: "3", hint: "3 routes" }
            ]
          }
        },
        { adapter: { id: "plain", status: () => [{ value: "Plain", hint: "Plain" }] } }
      ],
      detection
    )

    expect(items.map((item) => [item.adapter, item.icon, item.logo])).toEqual([
      ["tool", undefined, logo],
      ["tool", "route", undefined],
      ["plain", undefined, undefined]
    ])
  })

  it("says in the tooltip when Parity doesn't test the tool's version", () => {
    const [item] = adapterStatus(
      [{ adapter: { id: "old", status: () => [{ value: "Old", hint: "Old 1.0.0", detail: "Builds the project" }] } }],
      detection
    )

    expect(item?.detail).toBe("Builds the project. Parity doesn't test this version")
  })
})
