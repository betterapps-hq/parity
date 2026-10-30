import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { applyProjectEdit, type EditedProject, undoProjectEdit } from "./edits.ts"

let project: EditedProject

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "parity-edits-"))
  project = { info: { id: root, root }, known: new Map() }
  await writeFile(join(root, "index.css"), '@import "tailwindcss";\n')
})

afterEach(async () => {
  await rm(project.info.root, { recursive: true, force: true })
})

const read = (path: string) => readFile(join(project.info.root, path), "utf8")

describe("applyProjectEdit", () => {
  it("writes every file, records what it wrote, and gives each file's diff", async () => {
    const edit = await applyProjectEdit(project, {
      label: "Import Nova's styles",
      files: [
        {
          kind: "replace",
          path: "index.css",
          expected: '@import "tailwindcss";\n',
          content: '@import "tailwindcss";\n@import "nova/styles.css";\n'
        },
        { kind: "create", path: "public/images/a.png", content: new Uint8Array([137, 80, 78, 71]) }
      ]
    })
    expect(await read("index.css")).toBe('@import "tailwindcss";\n@import "nova/styles.css";\n')
    expect([...(await readFile(join(project.info.root, "public/images/a.png")))]).toEqual([137, 80, 78, 71])
    expect(project.known.get("index.css")).toBe('@import "tailwindcss";\n@import "nova/styles.css";\n')
    expect(edit.label).toBe("Import Nova's styles")
    expect(edit.files.map((file) => file.path)).toEqual(["index.css", "public/images/a.png"])
    expect(edit.files[0]!.diff).toContain('+@import "nova/styles.css";')
    expect(edit.files[1]!.diff).toBe("Binary file public/images/a.png: added, 4 bytes")
  })

  it("writes nothing when a file changed since the edit was built", async () => {
    await expect(
      applyProjectEdit(project, {
        label: "Edit a token",
        files: [
          { kind: "create", path: "new.css", content: "x" },
          { kind: "replace", path: "index.css", expected: "something else", content: "y" }
        ]
      })
    ).rejects.toThrow("index.css changed since this was made, so nothing was written")
    expect(existsSync(join(project.info.root, "new.css"))).toBe(false)
    expect(await read("index.css")).toBe('@import "tailwindcss";\n')
  })

  it("puts back what it wrote when a later write fails", async () => {
    await expect(
      applyProjectEdit(project, {
        label: "Edit",
        files: [
          { kind: "replace", path: "index.css", expected: '@import "tailwindcss";\n', content: "changed" },
          // index.css is a file, so nothing can go inside it.
          { kind: "create", path: "index.css/inner.css", content: "x" }
        ]
      })
    ).rejects.toThrow(/EEXIST|ENOTDIR/)
    expect(await read("index.css")).toBe('@import "tailwindcss";\n')
    expect(project.known.has("index.css")).toBe(false)
    expect(project.known.has("index.css/inner.css")).toBe(false)
  })

  it("applies edits made at once one after another", async () => {
    const add = (line: string) =>
      applyProjectEdit(project, {
        label: "Add a line",
        files: [{ kind: "patch", path: "index.css", find: '"tailwindcss";\n', replace: `"tailwindcss";\n${line}\n` }]
      })
    await Promise.all([add("a"), add("b")])
    expect(await read("index.css")).toBe('@import "tailwindcss";\nb\na\n')
  })

  it("refuses a path outside the project", async () => {
    await expect(
      applyProjectEdit(project, { label: "Escape", files: [{ kind: "create", path: "../outside.css", content: "x" }] })
    ).rejects.toThrow("../outside.css is outside the project")
  })
})

describe("undoProjectEdit", () => {
  it("takes an edit back once, unless its files changed since", async () => {
    const first = await applyProjectEdit(project, {
      label: "Import Nova's styles",
      files: [{ kind: "patch", path: "index.css", find: "\n", replace: '\n@import "nova/styles.css";\n' }]
    })
    const image = await applyProjectEdit(project, {
      label: "Paste image",
      files: [{ kind: "create", path: "public/a.png", content: new Uint8Array([1]) }]
    })

    const undone = await undoProjectEdit(project, image.id)
    expect(undone.label).toBe("Undo paste image")
    expect(existsSync(join(project.info.root, "public/a.png"))).toBe(false)
    await expect(undoProjectEdit(project, image.id)).rejects.toThrow("too old to undo, or was undone already")

    await writeFile(join(project.info.root, "index.css"), "edited by hand")
    await expect(undoProjectEdit(project, first.id)).rejects.toThrow("index.css changed since")
    expect(await read("index.css")).toBe("edited by hand")
  })
})
