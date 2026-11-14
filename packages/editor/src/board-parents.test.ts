import { describe, expect, it } from "vite-plus/test"
import { type BoardParents, nextBoardParents, noBoardParents } from "./board-parents.ts"

const tabs = ["ui/tabs/Tabs", "ui/tabs/TabsContent", "ui/tabs/TabsList", "ui/tabs/TabsTrigger"]
const trigger = "ui/tabs/TabsTrigger"

/** Runs a board's search against what each chain fails with, as the canvas would draw it, to where it stops. */
function search(
  part: string,
  group: string[],
  fails: (chain: string[]) => { component: string; error: string } | "nothing" | undefined
) {
  let state: BoardParents = nextBoardParents(part, group, noBoardParents, fails([]))

  while (!state.done) {
    state = nextBoardParents(part, group, state, fails(state.chain))
  }

  return state
}

describe("nextBoardParents", () => {
  it("draws a part inside the parent its error names", () => {
    const state = search("ui/avatar/AvatarImage", ["ui/avatar/Avatar", "ui/avatar/AvatarImage"], (chain) =>
      chain.includes("ui/avatar/Avatar")
        ? undefined
        : { component: "ui/avatar/AvatarImage", error: "`AvatarImage` must be used within `Avatar`" }
    )

    expect(state).toMatchObject({ chain: ["ui/avatar/Avatar"], done: true })
  })

  it("keeps a parent that gets it further, and tries the rest of its file for what's still missing", () => {
    const state = search(trigger, tabs, (chain) => {
      if (!chain.includes("ui/tabs/Tabs")) {
        return { component: trigger, error: "`TabsTrigger` must be used within `Tabs`" }
      }

      if (!chain.includes("ui/tabs/TabsList")) {
        return { component: trigger, error: "`RovingFocusGroupItem` must be used within `RovingFocusGroup`" }
      }

      return undefined
    })

    expect(state).toMatchObject({ chain: ["ui/tabs/Tabs", "ui/tabs/TabsList"], done: true })
  })

  it("drops a parent that fails itself", () => {
    const state = search(trigger, tabs, (chain) => {
      if (chain.at(-1) === "ui/tabs/TabsContent" && !chain.includes("ui/tabs/Tabs")) {
        return { component: "ui/tabs/TabsContent", error: "`TabsContent` must be used within `Tabs`" }
      }

      return chain.includes("ui/tabs/TabsList")
        ? undefined
        : { component: trigger, error: "`TabsTrigger` must be used within `Tabs` and a list" }
    })

    expect(state.chain).toEqual(["ui/tabs/TabsList"])
  })

  it("doesn't search for a part that fails for another reason, or one that draws", () => {
    expect(
      nextBoardParents(trigger, tabs, noBoardParents, { component: trigger, error: "x is not a function" })
    ).toMatchObject({
      chain: [],
      done: true
    })
    expect(nextBoardParents(trigger, tabs, noBoardParents, undefined)).toMatchObject({ chain: [], done: true })
  })

  it("stops with no parents left to try", () => {
    const state = search(trigger, tabs, () => ({
      component: trigger,
      error: "`TabsTrigger` must be used within `Tabs`"
    }))

    expect(state).toMatchObject({ chain: [], done: true })
    expect(state.trials).toBeLessThanOrEqual(3)
  })

  it("goes on past a parent that hides the part, and back to it when no parent shows it", () => {
    const hidden = search(trigger, tabs, (chain) => {
      if (!chain.includes("ui/tabs/Tabs")) {
        return { component: trigger, error: "`TabsTrigger` must be used within `Tabs`" }
      }

      if (chain.includes("ui/tabs/TabsContent")) {
        return "nothing"
      }

      return chain.includes("ui/tabs/TabsList")
        ? undefined
        : { component: trigger, error: "`RovingFocusGroupItem` must be used within `RovingFocusGroup`" }
    })

    expect(hidden.chain).toEqual(["ui/tabs/Tabs", "ui/tabs/TabsList"])

    const avatar = ["ui/avatar/Avatar", "ui/avatar/AvatarBadge", "ui/avatar/AvatarImage"]

    const image = search("ui/avatar/AvatarImage", avatar, (chain) =>
      chain.at(-1) === "ui/avatar/Avatar"
        ? "nothing"
        : { component: "ui/avatar/AvatarImage", error: "`AvatarImage` must be used within `Avatar`" }
    )

    expect(image).toMatchObject({ chain: ["ui/avatar/Avatar"], done: true })
  })
})
