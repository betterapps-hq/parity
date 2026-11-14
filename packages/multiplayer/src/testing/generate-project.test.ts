import { canvasDocument, type DesignNode } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { firstChild, firstText, generateProject, projectSizes } from "./generate-project.ts"

function countLayers(node: DesignNode): number {
  const children = "children" in node ? node.children : []
  const slots = "slots" in node ? Object.values(node.slots ?? {}).flat() : []
  const inside = [...children, ...slots]

  return 1 + inside.reduce((sum, child) => sum + countLayers(child), 0)
}

describe("generateProject", () => {
  it("makes valid files, the main one first", () => {
    const files = generateProject(projectSizes.small)

    expect(files[0]!.path).toBe("app.par")

    for (const file of files) {
      expect(canvasDocument.safeParse(file.document).error).toBeUndefined()
    }
  })

  it("makes the designs and about the layers asked for", () => {
    const files = generateProject(projectSizes.large)
    const designs = files.flatMap((file) => file.document.containers)
    const screen = designs.find((design) => design.kind === "screen")!

    expect(designs).toHaveLength(projectSizes.large.designs)
    expect(countLayers(screen.root)).toBeGreaterThanOrEqual(projectSizes.large.layers)
    expect(countLayers(screen.root)).toBeLessThan(projectSizes.large.layers * 1.5)
    expect(firstText(screen)).toBeTruthy()
    expect(firstChild(screen)).toBeTruthy()
  })

  it("makes the same project from the same seed", () => {
    expect(generateProject(projectSizes.small)).toEqual(generateProject(projectSizes.small))
  })
})
