import type { ContainerSpec } from "@parity-app/core"
import type { RecoveryCopy } from "@parity-app/editor"
import { updateContainer } from "@parity-app/multiplayer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { openTestSession } from "./doc-fixtures.ts"
import { keepRecovery } from "./recovery.ts"

const home: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [] }
}

beforeEach(() => vi.useFakeTimers())

afterEach(() => vi.useRealTimers())

/** A project open with nothing unsaved, a keeper for it, and what the keeper was asked to keep, `undefined` for removed. */
function setup() {
  const designs = openTestSession([{ path: "app.par", document: { version: 4, containers: [home] } }])

  const kept: (RecoveryCopy | undefined)[] = []

  const keeper = keepRecovery(designs, async (copy) => {
    kept.push(copy)
  })

  const rename = (name: string) =>
    updateContainer(designs.doc, "app.par#home", "Rename design", (container) => ({ ...container, name }))

  return { designs, keeper, kept, rename }
}

describe("keepRecovery", () => {
  it("writes nothing before it starts, so the copy from last time stays until it's answered", async () => {
    const { keeper, kept, rename } = setup()
    rename("Home page")
    await vi.runAllTimersAsync()
    await keeper.settle()
    await keeper.drop()

    expect(kept).toEqual([])
  })

  it("keeps a copy a moment after a run of changes, once", async () => {
    const { keeper, kept, rename } = setup()
    keeper.start()
    rename("Home page")
    rename("Home page 2")

    expect(kept).toEqual([])
    await vi.runAllTimersAsync()

    expect(kept).toHaveLength(1)
    expect(kept[0]?.documents[0]?.document?.containers[0]?.name).toBe("Home page 2")
  })

  it("removes the copy once the changes are saved", async () => {
    const { designs, keeper, kept, rename } = setup()
    keeper.start()
    rename("Home page")
    await vi.runAllTimersAsync()
    await designs.saver.flush()
    await vi.runAllTimersAsync()

    expect(kept.at(-1)).toBeUndefined()
    expect(kept).toHaveLength(2)
  })

  it("brings the copy up to date at once as the app quits", async () => {
    const { keeper, kept, rename } = setup()
    keeper.start()
    rename("Home page")
    await keeper.settle()

    expect(kept).toHaveLength(1)
  })

  it("removes the copy when the changes are discarded, and keeps nothing after", async () => {
    const { keeper, kept, rename } = setup()
    keeper.start()
    rename("Home page")
    await keeper.drop()
    rename("Home page 2")
    await vi.runAllTimersAsync()

    expect(kept).toEqual([undefined])
  })

  it("keeps nothing in a copy that joined another's room, and leaves the copy from last time (PAR-1289)", async () => {
    const { designs, keeper, kept, rename } = setup()
    await designs.saver.setWritesFiles(false)
    keeper.start()
    rename("Home page")
    await vi.runAllTimersAsync()
    await keeper.settle()
    await keeper.drop()

    expect(kept).toEqual([])
  })
})
