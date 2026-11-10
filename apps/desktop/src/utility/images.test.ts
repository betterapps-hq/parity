import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { type EditedProject, undoProjectEdit } from "./edits.ts"
import { removeImage, scanImages } from "./images.ts"

let project: EditedProject

const write = async (path: string, content: string | Uint8Array) => {
  const full = join(project.info.root, path)
  await mkdir(join(full, ".."), { recursive: true })
  await writeFile(full, content)
}

const png = new Uint8Array([137, 80, 78, 71])

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-images-"))
  project = { info: { id: root, root }, known: new Map() }
  await write("public/images/hero.png", png)
  await write("public/images/icons/star.svg", "<svg/>")
  await write("public/images/notes.txt", "not an image")
  await write("public/favicon.png", png)
  await write("src/App.tsx", 'export const App = () => <img src="/images/hero.png" />\n')
  await write("node_modules/kit/index.js", 'const star = "/images/icons/star.svg"\n')
  await write("dist/assets/index.js", 'const star = "/images/icons/star.svg"\n')
})

afterEach(async () => {
  await rm(project.info.root, { recursive: true, force: true })
})

describe("scanImages", () => {
  it("lists the images under public/images, and the lines of the project's own code that name them", async () => {
    const { files, references } = await scanImages(project)

    expect(files.map(({ path, bytes }) => [path, bytes]).sort()).toEqual([
      ["public/images/hero.png", 4],
      ["public/images/icons/star.svg", 6]
    ])
    expect(references).toEqual([{ image: "public/images/hero.png", path: "src/App.tsx", line: 1 }])
  })
})

describe("removeImage", () => {
  it("removes an image nothing in the code names, as an edit that undoing puts back", async () => {
    const { path, edit } = await removeImage(project, "public/images/icons/star.svg")

    expect(path).toBe("public/images/icons/star.svg")
    expect(existsSync(join(project.info.root, path))).toBe(false)

    await undoProjectEdit(project, edit.id)

    expect(existsSync(join(project.info.root, path))).toBe(true)
  })

  it("refuses an image the code names, a path outside public/images, and what isn't an image", async () => {
    await expect(removeImage(project, "public/images/hero.png")).rejects.toThrow(
      "public/images/hero.png is still used in src/App.tsx (line 1). Remove or replace it there first."
    )
    await expect(removeImage(project, "public/favicon.png")).rejects.toThrow(/Only images in public\/images\//)
    await expect(removeImage(project, "public/images/../../src/App.tsx")).rejects.toThrow(/Only images in/)
    await expect(removeImage(project, "public/images/notes.txt")).rejects.toThrow(
      "public/images/notes.txt isn't an image."
    )
    await expect(removeImage(project, "public/images/gone.png")).rejects.toThrow(
      "There's no image at public/images/gone.png."
    )
    expect(existsSync(join(project.info.root, "public/images/hero.png"))).toBe(true)
  })
})
