import type { ComponentInfo, ComponentSource } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { boardGroups, boardsHeight, componentBoards } from "./component-boards.ts"

const sources = {
  Button: { path: "src/components/ui/button.tsx", export: "Button" },
  Card: { path: "src/components/ui/card.tsx", export: "Card" },
  CardTitle: { path: "src/components/ui/card.tsx", export: "CardTitle" },
  ThemeProvider: { path: "src/components/theme-provider.tsx", export: "ThemeProvider", visual: false },
  Pricing: { path: "src/routes/pricing.tsx", export: "Pricing", lazy: true },
  Header: { path: "src/features/shell/header.tsx", export: "Header", lazy: true },
  "nova/Badge": { path: "@kit/nova", export: "Badge", library: "nova" }
} satisfies Record<string, ComponentSource>

const layout = { x: 0, y: -1000, column: 400, row: 300 }

describe("boardGroups", () => {
  it("groups the project's own components as the Components panel does, leaving out pages, libraries and providers", () => {
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

  it("holds the component with a sample for each required prop, and its name as the children it takes", () => {
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
      children: [{ type: "component", component: "Button", props: { size: "sm", children: "Button" } }]
    })
  })
})
