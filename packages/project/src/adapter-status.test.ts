import type { AdapterIcon, ImportedScreen, ProjectRoute, StatusFacts } from "@parity-app/core"
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

const screen = (adapter: string, ref: string): ImportedScreen => ({
  adapter,
  ref,
  group: "UI/Button",
  screen: { id: ref, name: ref, position: { x: 0, y: 0 }, root: { type: "layout", id: "story", children: [] } }
})

const route: ProjectRoute = {
  id: "/",
  path: "/",
  file: "src/routes/index.tsx",
  params: [],
  index: true,
  loads: false,
  guards: false
}

describe("adapterStatus", () => {
  it("tells each adapter its version, the package manager, its own screens and the routes", () => {
    const told: StatusFacts[] = []

    const listening = (id: string) => ({
      id,
      status: (facts: StatusFacts) => {
        told.push(facts)

        return []
      }
    })

    adapterStatus(
      [{ adapter: listening("tool") }, { adapter: listening("other"), version: "9.1.0" }],
      detection,
      { screens: [screen("tool", "a"), screen("other", "b")] },
      [route]
    )

    expect(told.map((facts) => [facts.version, facts.packageManager])).toEqual([
      ["2.0.0", "pnpm"],
      ["9.1.0", "pnpm"]
    ])
    expect(told.map((facts) => facts.entities?.screens?.map((each) => each.ref))).toEqual([["a"], ["b"]])
    expect(told[0]?.routes).toEqual([route])
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
      detection,
      {}
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
      detection,
      {}
    )

    expect(item?.detail).toBe("Builds the project. Parity doesn't test this version")
  })
})
