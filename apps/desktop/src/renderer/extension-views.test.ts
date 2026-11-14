import type { ViewData, ViewItem } from "@parity-app/extension-api"
import storybookPackage from "@parity-app/extension-storybook/package.json" with { type: "json" }
import { readExtension } from "@parity-app/extensions"
import { describe, expect, it } from "vite-plus/test"
import type { ExtensionStatus } from "../shared/protocol.ts"
import { actionsFor, isField, pageOf, sectionsFor, shownItems, tabsAt, treeRows } from "./extension-views.ts"

const { id, manifest } = readExtension(storybookPackage)

const stories: ViewData = {
  kind: "tree",
  options: {},
  items: [
    { key: "Button", label: "Button", target: { type: "component", key: "Button" } },
    { key: "Button#Primary", label: "Primary", parent: "Button" },
    { key: "Card", label: "Card", target: { type: "component", key: "Card" } },
    { key: "Card#Plain", label: "Plain", parent: "Card" },
    { key: "Loose", label: "Loose" }
  ]
}

/** Storybook's extension as the window has it, with what its code sent. */
function storybook(change: Partial<ExtensionStatus> = {}): ExtensionStatus {
  return {
    id,
    displayName: manifest.displayName,
    icon: manifest.icon,
    contributes: manifest.contributes,
    state: "running",
    status: {},
    context: { "storybook.hasStories": ["Button"] },
    facts: {},
    views: { "storybook.stories": stories },
    ...change
  }
}

const button = { type: "component", key: "Button" } as const

describe("extensions' views in the window", () => {
  it("places each tab in its panel, with what the code sent for it", () => {
    expect(tabsAt([storybook()], "left").map((view) => [view.id, view.title, view.data?.kind])).toEqual([
      ["storybook.stories", "Stories", "tree"]
    ])
    expect(tabsAt([storybook()], "right")).toEqual([])
    expect(tabsAt([storybook({ views: {} })], "left")[0]?.data).toBeUndefined()
    expect(tabsAt([storybook({ state: "crashed" })], "left")).toEqual([])
  })

  it("leaves out data of another kind than the manifest declares", () => {
    const wrong: ViewData = { kind: "list", options: {}, items: [] }

    expect(tabsAt([storybook({ views: { "storybook.stories": wrong } })], "left")[0]?.data).toBeUndefined()
  })

  it("shows a Design tab section for its node type, where its when holds for what's selected", () => {
    const sections = (key: string, nodeType = "component") =>
      sectionsFor([storybook()], { nodeType, target: { type: "component", key } }).map((view) => view.id)

    expect(sections("Button")).toEqual(["storybook.componentStories"])
    expect(sections("Card")).toEqual([])
    expect(sections("Button", "route")).toEqual([])
  })

  it("finds a page by its extension and id", () => {
    expect(pageOf([storybook()], id, "storybook.setupGuide")?.title).toBe("Storybook setup")
    expect(pageOf([storybook()], "other", "storybook.setupGuide")).toBeUndefined()
  })

  it("shows a section only the items about what's selected, those about nothing, and what's under them", () => {
    expect(shownItems(stories, button).map((item) => item.key)).toEqual(["Button", "Button#Primary", "Loose"])
    expect(shownItems(stories)).toHaveLength(5)
  })

  it("draws a tree's rows, each open row's items under it", () => {
    const rows = (open: string[]) =>
      treeRows(
        stories.items.filter((item): item is ViewItem => !isField(item)),
        new Set(open)
      ).map((row) => [row.item.key, row.depth, row.parent])

    expect(rows([])).toEqual([
      ["Button", 0, true],
      ["Card", 0, true],
      ["Loose", 0, false]
    ])
    expect(rows(["Card"])).toEqual([
      ["Button", 0, true],
      ["Card", 0, true],
      ["Card#Plain", 1, false],
      ["Loose", 0, false]
    ])
  })

  it("puts an item whose parent isn't there at the top, and leaves out items that name each other as parents", () => {
    const rows = treeRows(
      [
        { key: "a", label: "A", parent: "b" },
        { key: "b", label: "B", parent: "a" },
        { key: "orphan", label: "Orphan", parent: "gone" }
      ],
      new Set(["a", "b"])
    )

    expect(rows.map((row) => row.item.key)).toEqual(["orphan"])
  })

  it("offers the actions whose when holds for an item, with their manifest's titles", () => {
    const offered = [{ command: "storybook.open", when: "storybook.hasStories" }, { command: "storybook.gone" }]

    expect(actionsFor(storybook(), offered, button).map((command) => command.title)).toEqual(["Open in Storybook"])
    expect(actionsFor(storybook(), offered, { type: "component", key: "Card" })).toEqual([])
  })
})
