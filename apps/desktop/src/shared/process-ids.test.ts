import { describe, expect, it } from "vite-plus/test"
import { listedId } from "./process-ids.ts"
import type { ProjectProcess } from "./protocol.ts"

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

describe("listedId", () => {
  const storybook = process("extension:storybook:/example:storybook", { kind: "extension", extension: "storybook" })
  const builder = process("builder:/example", { kind: "parity", role: "builder" })
  const second = process("builder:/example:2", { kind: "parity", role: "builder" })

  it("names an extension's process by its own id, after the extension's", () => {
    expect(listedId(storybook, [storybook, builder])).toBe("storybook:storybook")
  })

  it("names Parity's own by its role, numbering a second with the same role", () => {
    expect(listedId(builder, [builder])).toBe("parity:builder")
    expect(listedId(second, [builder, second])).toBe("parity:builder-2")
  })
})
