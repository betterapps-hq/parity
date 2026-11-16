import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { type EditedProject, undoProjectEdit } from "./edits.ts"
import { removeImage, saveImageFrom, scanImages } from "./images.ts"

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
  await write("public/videos/waves.mp4", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]))
  await write("public/favicon.png", png)
  await write("src/App.tsx", 'export const App = () => <img src="/images/hero.png" />\n')
  await write("node_modules/kit/index.js", 'const star = "/images/icons/star.svg"\n')
  await write("dist/assets/index.js", 'const star = "/images/icons/star.svg"\n')
})

afterEach(async () => {
  await rm(project.info.root, { recursive: true, force: true })
})

describe("scanImages", () => {
  it("lists the images and videos under public/images and public/videos, and the code that names them", async () => {
    const { files, references } = await scanImages(project)

    const sorted = files.toSorted((a, b) => a.path.localeCompare(b.path))

    expect(sorted.map(({ path, bytes }) => [path, bytes])).toEqual([
      ["public/images/hero.png", 4],
      ["public/images/icons/star.svg", 6],
      ["public/videos/waves.mp4", 8]
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

  it("removes a video from public/videos", async () => {
    const { path, edit } = await removeImage(project, "public/videos/waves.mp4")

    expect(edit.label).toBe("Remove video")
    expect(existsSync(join(project.info.root, path))).toBe(false)
  })

  it("refuses an image the code names, a path outside the media folders, and what isn't an image or video", async () => {
    await expect(removeImage(project, "public/images/hero.png")).rejects.toThrow(
      "public/images/hero.png is still used in src/App.tsx (line 1). Remove or replace it there first."
    )
    await expect(removeImage(project, "public/favicon.png")).rejects.toThrow(
      /Only files in public\/images\/ and public\/videos\//
    )
    await expect(removeImage(project, "public/images/../../src/App.tsx")).rejects.toThrow(/Only files in/)
    await expect(removeImage(project, "public/images/notes.txt")).rejects.toThrow(
      "public/images/notes.txt isn't an image or a video."
    )
    await expect(removeImage(project, "public/images/gone.png")).rejects.toThrow(
      "There's no file at public/images/gone.png."
    )
    expect(existsSync(join(project.info.root, "public/images/hero.png"))).toBe(true)
  })
})

describe("saveImageFrom", () => {
  const picture =
    (type: string, status = 200) =>
    async () =>
      new Response(new Uint8Array([255, 216, 255]), { status, headers: { "content-type": type } })

  it("saves a picture from its link under public/images, named after it, and reuses the file the next time", async () => {
    const image = { url: "https://cdn.example/desk.jpg", name: "White desk" }
    const first = await saveImageFrom(project, image, picture("image/jpeg"))
    const again = await saveImageFrom(project, image, picture("image/jpeg"))

    expect(first.src).toMatch(/^\/images\/white-desk-[0-9a-f]{8}\.jpg$/)
    expect(again).toEqual(first)
    expect(existsSync(join(project.info.root, first.path))).toBe(true)
  })

  it("saves a video from its link under public/videos", async () => {
    const saved = await saveImageFrom(
      project,
      { url: "https://cdn.example/waves.mp4", name: "Waves" },
      picture("video/mp4")
    )

    expect(saved.src).toMatch(/^\/videos\/waves-[0-9a-f]{8}\.mp4$/)
    expect(saved.path).toBe(`public${saved.src}`)
    expect(existsSync(join(project.info.root, saved.path))).toBe(true)
  })

  it("refuses a link that fails or gives something other than a picture or a video", async () => {
    const image = { url: "https://cdn.example/desk.jpg", name: "desk" }

    await expect(saveImageFrom(project, image, picture("image/jpeg", 403))).rejects.toThrow("the source answered 403")
    await expect(saveImageFrom(project, image, picture("text/html"))).rejects.toThrow(
      "the link gave text/html rather than a picture or a video"
    )
  })
})
