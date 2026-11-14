import type { ComponentInfo, ComponentSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  boardComponentNode,
  boardGroups,
  boardsHeight,
  boardWithInternals,
  componentBoards,
  redrawnBoards
} from "./component-boards.ts"

const sources = {
  Button: { path: "src/components/ui/button.tsx", export: "Button" },
  Card: { path: "src/components/ui/card.tsx", export: "Card" },
  CardTitle: { path: "src/components/ui/card.tsx", export: "CardTitle" },
  ThemeProvider: { path: "src/components/theme-provider.tsx", export: "ThemeProvider", visual: false },
  Pricing: { path: "src/routes/pricing.tsx", export: "Pricing", lazy: true },
  Header: { path: "src/features/shell/header.tsx", export: "Header", lazy: true },
  "nova/Badge": { path: "@kit/nova", export: "Badge", library: "nova" },
  Toaster: { path: "node_modules/sonner/dist/index.mjs", export: "Toaster" }
} satisfies Record<string, ComponentSource>

const layout = { x: 0, y: -1000, column: 400, row: 300 }

describe("boardGroups", () => {
  it("groups the project's own components as the Components panel does, leaving out pages, libraries, dependencies and providers", () => {
    expect(boardGroups(sources)).toEqual([
      { name: "button", ids: ["Button"] },
      { name: "card", ids: ["Card", "CardTitle"] },
      { name: "shell", ids: ["Header"] }
    ])
  })
})

describe("componentBoards", () => {
  it("puts each group on a row of its own, from the layout's top left", () => {
    const boards = componentBoards(sources, {}, layout)

    expect(boards.map(({ board }) => [board.id, board.position])).toEqual([
      ["component:Button", { x: 0, y: -1000 }],
      ["component:Card", { x: 0, y: -700 }],
      ["component:CardTitle", { x: 400, y: -700 }],
      ["component:Header", { x: 0, y: -400 }]
    ])
    expect(boardsHeight(sources, layout)).toBe(900)
  })

  it("holds the component 2px in, on no fill, with a sample for each required prop, and its name as the children it takes", () => {
    const button: ComponentInfo = {
      name: "Button",
      path: "src/components/ui/button.tsx",
      props: [
        { name: "children", kind: "node", group: "own" },
        { name: "size", kind: "enum", options: ["sm", "lg"], required: true, group: "variant" }
      ]
    }

    const [first] = componentBoards(sources, { Button: button }, layout)

    expect(first?.file).toBe("src/components/ui/button.tsx")
    expect(first?.board.root).toMatchObject({
      type: "layout",
      style: { padding: { step: 0.5 } },
      children: [{ type: "component", component: "Button" }]
    })
    expect(first?.board.root.style?.fills).toBeUndefined()
    expect(first?.board.root).toMatchObject({
      children: [{ type: "component", component: "Button", props: { size: "sm", children: "Button" } }]
    })
  })

  it("draws a component with the props its samples give, as a story's args, before its own samples", () => {
    const plan: ComponentInfo = {
      name: "Button",
      path: "src/components/plan-card.tsx",
      props: [
        { name: "name", kind: "string", required: true, group: "own" },
        { name: "features", kind: "unknown", required: true, group: "own" }
      ]
    }

    const board = componentBoards(sources, { Button: plan }, layout, {}, { Button: { features: ["Email support"] } })[0]

    expect(board?.board.root).toMatchObject({
      children: [{ type: "component", component: "Button", props: { features: ["Email support"], name: "name" } }]
    })
  })

  it("draws a part inside the parents it needs, and reads what it draws inside it, not them", () => {
    const board = componentBoards(sources, {}, layout, { CardTitle: ["Card"] }).find(
      (each) => each.component === "CardTitle"
    )!.board

    expect(board.root).toMatchObject({
      children: [{ component: "Card", slots: { children: [{ component: "CardTitle" }] } }]
    })
    expect(boardComponentNode(board)?.component).toBe("CardTitle")

    const read = boardWithInternals(board, [{ type: "text", id: "in-0", text: "CardTitle" }])

    expect(boardComponentNode(read)?.internals).toEqual([{ type: "text", id: "in-0", text: "CardTitle" }])
    expect(read.root).toMatchObject({ children: [{ component: "Card" }] })
  })
})

describe("drawing the boards again", () => {
  it("gives each board's layers the same ids each time, and others inside other parents", () => {
    const alone = componentBoards(sources, {}, layout)
    const again = componentBoards(sources, {}, layout)
    const inside = componentBoards(sources, {}, layout, { CardTitle: ["Card"] })

    expect(again).toEqual(alone)

    const title = (boards: typeof alone) =>
      boardComponentNode(boards.find((each) => each.component === "CardTitle")!.board)?.id

    expect(title(inside)).not.toBe(title(alone))
  })

  it("keeps a board drawn as before as it is now, and gives one drawn differently the size it had", () => {
    const before = componentBoards(sources, {}, layout).map(({ board }) => board)
    const drawn = componentBoards(sources, {}, layout, { CardTitle: ["Card"] }).map(({ board }) => board)
    const fitted = before.map((board) => ({ ...board, size: { width: 120 } }))
    const button = fitted.find((board) => board.id === "component:Button")!
    const read = boardWithInternals(button, [{ type: "text", id: "in-0", text: "Button" }])
    const current = new Map(fitted.map((board) => [board.id, board.id === read.id ? read : board]))

    const boards = redrawnBoards(drawn, new Map(before.map((board) => [board.id, board])), current)

    expect(boards.find((board) => board.id === "component:Button")).toBe(read)
    const title = boards.find((board) => board.id === "component:CardTitle")!

    expect(title).toEqual({ ...drawn.find((board) => board.id === "component:CardTitle"), size: { width: 120 } })
  })

  it("adds a board the canvas doesn't have yet as it's drawn", () => {
    const drawn = componentBoards(sources, {}, layout).map(({ board }) => board)

    expect(redrawnBoards(drawn, new Map(), new Map())).toEqual(drawn)
  })
})
