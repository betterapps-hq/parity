import { describe, expect, it } from "vite-plus/test"
import type { ProjectProcess } from "../shared/protocol.ts"
import { targetSeenByExtensions } from "./process-ids.ts"

/** A process in the example, with the id and owner a test gives. */
function process(id: string, owner: ProjectProcess["owner"]): ProjectProcess {
  return {
    id,
    owner,
    lifetime: "server",
    name: "Server",
    projectId: "/example",
    project: "example",
    state: "running",
    startedAt: 0,
    addresses: [],
    run: 1,
    canStop: true,
    canRestart: true
  }
}

describe("targetSeenByExtensions (PAR-1127)", () => {
  const storybook = process("extension:storybook:/example:storybook", { kind: "extension", extension: "storybook" })
  const builder = process("builder:/example", { kind: "parity", role: "builder" })
  const all = [storybook, builder]

  it("names a process by its id in the list extensions see", () => {
    expect(targetSeenByExtensions({ type: "process", id: storybook.id }, all)).toEqual({
      type: "process",
      id: "storybook:storybook"
    })
    expect(targetSeenByExtensions({ type: "process", id: builder.id }, all)).toEqual({
      type: "process",
      id: "parity:builder"
    })
  })

  it("leaves another target, and a process that has gone, as it is", () => {
    expect(targetSeenByExtensions({ type: "component", key: "Button" }, all)).toEqual({
      type: "component",
      key: "Button"
    })
    expect(targetSeenByExtensions({ type: "process", id: "gone" }, all)).toEqual({ type: "process", id: "gone" })
  })
})
