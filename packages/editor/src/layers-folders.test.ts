import type { ComponentLibrary, ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { folderId, folderIds, folderTree, type FolderTreeRow } from "./layers-folders.ts"
import { searchRows, type TreeDesign, treeRows } from "./layers-tree.ts"

const none: ComponentLibrary = new Map()

function story(key: string, title: string): TreeDesign & { title: string } {
  const container: ContainerSpec = {
    id: key,
    name: key,
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", name: "Story", children: [] }
  }

  return { key, container, title }
}

// Two of Button's stories and one of Badge's under UI, and Plan card's under App.
const stories = [
  story("Button / Default", "UI/Button"),
  story("Badge / Default", "UI/Badge"),
  story("Button / Outline", "UI/Button"),
  story("Plan card / Popular", "App/Plan card")
]

const folderOf = (design: (typeof stories)[number]) => design.title.split("/")

/** Each line as text: a folder's kind and label, or a design's key, indented by how many folders it's inside. */
function outline(lines: FolderTreeRow[]): string[] {
  return lines.map((line) =>
    line.type === "folder"
      ? `${"  ".repeat(line.level)}${line.kind} ${line.label}${line.expanded ? " (open)" : ""}`
      : `${"  ".repeat(line.level)}${line.row.design.key}`
  )
}

describe("folderTree", () => {
  it("lists only the top folders while they're closed", () => {
    const lines = folderTree(stories, {
      scope: "stories",
      folderOf,
      rowsOf: (designs) => treeRows(designs, new Set(), none),
      expanded: new Set()
    })

    expect(outline(lines)).toEqual(["group UI", "group App"])
    expect(lines[1]).toMatchObject({ position: 2, siblings: 2 })
  })

  it("lists an open folder's folders, and a component's designs, in the order the designs come", () => {
    const expanded = new Set([...folderIds("stories", ["UI", "Button"]), folderId("stories", ["UI", "Badge"])])

    const lines = folderTree(stories, {
      scope: "stories",
      folderOf,
      rowsOf: (designs) => treeRows(designs, new Set(), none),
      expanded
    })

    expect(outline(lines)).toEqual([
      "group UI (open)",
      "  component Button (open)",
      "    Button / Default",
      "    Button / Outline",
      "  component Badge (open)",
      "    Badge / Default",
      "group App"
    ])

    const outlineRow = lines.find((line) => line.type === "row" && line.row.design.key === "Button / Outline")
    expect(outlineRow).toMatchObject({
      parent: folderId("stories", ["UI", "Button"]),
      row: { position: 2, siblings: 2 }
    })
  })

  it("lists a design without folders at the top, beside the folders", () => {
    const loose = story("Loose", "")

    const lines = folderTree([loose, ...stories], {
      scope: "stories",
      folderOf: (design) => (design.title ? design.title.split("/") : []),
      rowsOf: (designs) => treeRows(designs, new Set(), none),
      expanded: new Set()
    })

    expect(outline(lines)).toEqual(["Loose", "group UI", "group App"])
    expect(lines[0]).toMatchObject({ row: { position: 1, siblings: 3 } })
  })

  it("opens every folder with something a search found, and leaves out the rest", () => {
    const lines = folderTree(stories, {
      scope: "stories",
      folderOf,
      rowsOf: (designs) => searchRows(designs, "outline", (design, node) => (node ? "" : design.container.name), none),
      expanded: new Set(),
      searching: true
    })

    expect(outline(lines)).toEqual(["group UI (open)", "  component Button (open)", "    Button / Outline"])
  })
})
