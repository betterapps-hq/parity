import { describe, expect, it } from "vitest"
import { diffFile, EditConflict, type FileContent, planEdit, reverseEdit } from "./edits.ts"
import { withStylesImport } from "./libraries.ts"

const files = (entries: Record<string, FileContent>) => new Map(Object.entries(entries))

describe("planEdit", () => {
  it("creates, replaces, patches and deletes files", () => {
    const changes = planEdit(
      {
        label: "Edit tokens",
        files: [
          { kind: "create", path: "public/a.png", content: new Uint8Array([1, 2]) },
          { kind: "replace", path: "src/index.css", expected: ":root {}\n", content: ":root { --x: 1; }\n" },
          { kind: "patch", path: "src/app.tsx", find: "old", replace: "new" },
          { kind: "delete", path: "notes.txt", expected: "bye" }
        ]
      },
      files({ "src/index.css": ":root {}\n", "src/app.tsx": "the old line", "notes.txt": "bye" })
    )
    expect(changes).toEqual([
      { path: "public/a.png", after: new Uint8Array([1, 2]) },
      { path: "src/index.css", before: ":root {}\n", after: ":root { --x: 1; }\n" },
      { path: "src/app.tsx", before: "the old line", after: "the new line" },
      { path: "notes.txt", before: "bye" }
    ])
  })

  it("applies edits to the same file in order, and leaves out files that end as they were", () => {
    const changes = planEdit(
      {
        label: "Rename",
        files: [
          { kind: "patch", path: "a.css", find: "red", replace: "blue" },
          { kind: "patch", path: "a.css", find: "blue", replace: "green" },
          { kind: "patch", path: "b.css", find: "x", replace: "y" },
          { kind: "patch", path: "b.css", find: "y", replace: "x" }
        ]
      },
      files({ "a.css": "color: red", "b.css": "x" })
    )
    expect(changes).toEqual([{ path: "a.css", before: "color: red", after: "color: green" }])
  })

  it("writes nothing when a file isn't what the edit expects, and names every such file", () => {
    const edit = {
      label: "Import styles",
      files: [
        { kind: "create" as const, path: "exists.css", content: "" },
        { kind: "replace" as const, path: "changed.css", expected: "before", content: "after" },
        { kind: "patch" as const, path: "twice.css", find: "a", replace: "b" },
        { kind: "patch" as const, path: "missing.css", find: "a", replace: "b" },
        { kind: "delete" as const, path: "gone.css", expected: "x" },
        { kind: "replace" as const, path: "fine.css", expected: "ok", content: "fine" }
      ]
    }
    const current = files({
      "exists.css": "",
      "changed.css": "edited by someone",
      "twice.css": "a a",
      "missing.css": "nothing here",
      "fine.css": "ok"
    })
    const thrown = (() => {
      try {
        planEdit(edit, current)
      } catch (error) {
        return error
      }
      return undefined
    })()
    expect(thrown).toBeInstanceOf(EditConflict)
    expect(thrown).toHaveProperty("paths", ["exists.css", "changed.css", "twice.css", "missing.css", "gone.css"])
  })

  it("compares binary files by their bytes", () => {
    const edit = {
      label: "Replace image",
      files: [
        { kind: "replace" as const, path: "a.png", expected: new Uint8Array([1, 2]), content: new Uint8Array([3]) }
      ]
    }
    expect(planEdit(edit, files({ "a.png": new Uint8Array([1, 2]) }))).toHaveLength(1)
    expect(() => planEdit(edit, files({ "a.png": new Uint8Array([1, 9]) }))).toThrow(EditConflict)
  })
})

describe("reverseEdit", () => {
  it("takes every change back, expecting what the edit wrote", () => {
    const before = files({ "a.css": "one", "b.css": "two" })
    const changes = planEdit(
      {
        label: "Edit",
        files: [
          { kind: "replace", path: "a.css", expected: "one", content: "uno" },
          { kind: "delete", path: "b.css", expected: "two" },
          { kind: "create", path: "c.css", content: "three" }
        ]
      },
      before
    )
    const after = files({ "a.css": "uno", "c.css": "three" })
    const undo = reverseEdit("Undo edit", changes)
    expect(undo.files).toEqual([
      { kind: "replace", path: "a.css", expected: "uno", content: "one" },
      { kind: "create", path: "b.css", content: "two" },
      { kind: "delete", path: "c.css", expected: "three" }
    ])
    expect(planEdit(undo, after)).toEqual([
      { path: "a.css", before: "uno", after: "one" },
      { path: "b.css", after: "two" },
      { path: "c.css", before: "three" }
    ])
    // Once a file has changed again, undoing would overwrite it.
    expect(() => planEdit(undo, files({ "a.css": "edited", "c.css": "three" }))).toThrow(EditConflict)
  })
})

describe("diffFile", () => {
  const numbered = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}\n`).join("")

  it("shows a changed line with three lines around it, as git does", () => {
    const before = "a\nb\nc\nd\ne\nf\ng\nh\n"
    const after = "a\nb\nc\nD\ne\nf\ng\nh\n"
    expect(diffFile({ path: "src/index.css", before, after }).split("\n")).toEqual([
      "--- a/src/index.css",
      "+++ b/src/index.css",
      "@@ -1,7 +1,7 @@",
      " a",
      " b",
      " c",
      "-d",
      "+D",
      " e",
      " f",
      " g"
    ])
  })

  it("puts changes far apart in hunks of their own, and near ones in one", () => {
    const before = numbered(20)
    const apart = before.replace("line 2\n", "two\n").replace("line 18\n", "eighteen\n")
    const hunks = diffFile({ path: "a.txt", before, after: apart })
      .split("\n")
      .filter((line) => line.startsWith("@@"))
    expect(hunks).toEqual(["@@ -1,5 +1,5 @@", "@@ -15,6 +15,6 @@"])
    const near = before.replace("line 2\n", "two\n").replace("line 8\n", "eight\n")
    expect(
      diffFile({ path: "a.txt", before, after: near })
        .split("\n")
        .filter((line) => line.startsWith("@@"))
    ).toEqual(["@@ -1,11 +1,11 @@"])
  })

  it("shows a new file and a deleted one against /dev/null", () => {
    expect(diffFile({ path: "new.css", after: "x\ny\n" }).split("\n")).toEqual([
      "--- /dev/null",
      "+++ b/new.css",
      "@@ -0,0 +1,2 @@",
      "+x",
      "+y"
    ])
    expect(diffFile({ path: "old.css", before: "x\n" }).split("\n")).toEqual([
      "--- a/old.css",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-x"
    ])
  })

  it("marks a last line without a line break", () => {
    expect(diffFile({ path: "a.css", before: "a\nb", after: "a\nc" }).split("\n")).toEqual([
      "--- a/a.css",
      "+++ b/a.css",
      "@@ -1,2 +1,2 @@",
      " a",
      "-b",
      "\\ No newline at end of file",
      "+c",
      "\\ No newline at end of file"
    ])
  })

  it("keeps the lines an insertion goes between", () => {
    const before = '@import "tailwindcss";\n\n:root {}\n'
    const after = withStylesImport(before, "@buildkitgg/nova/styles.css")!
    expect(diffFile({ path: "src/index.css", before, after }).split("\n")).toEqual([
      "--- a/src/index.css",
      "+++ b/src/index.css",
      "@@ -1,3 +1,4 @@",
      ' @import "tailwindcss";',
      '+@import "@buildkitgg/nova/styles.css";',
      " ",
      " :root {}"
    ])
  })

  it("describes a binary file by its size", () => {
    expect(diffFile({ path: "public/a.png", after: new Uint8Array(3000) })).toBe(
      "Binary file public/a.png: added, 3 KB"
    )
    expect(diffFile({ path: "a.png", before: new Uint8Array(10), after: new Uint8Array(2048) })).toBe(
      "Binary file a.png: 10 bytes before, 2 KB after"
    )
  })
})

describe("withStylesImport", () => {
  it("imports a library's styles right after Tailwind, once", () => {
    const source = '@import "tailwindcss";\n@import "./fonts.css";\n'
    const imported = withStylesImport(source, "lib/styles.css")
    expect(imported).toBe('@import "tailwindcss";\n@import "lib/styles.css";\n@import "./fonts.css";\n')
    expect(withStylesImport(imported!, "lib/styles.css")).toBeUndefined()
  })

  it("imports them first when the stylesheet doesn't import Tailwind", () => {
    expect(withStylesImport(":root {}\n", "lib/styles.css")).toBe('@import "lib/styles.css";\n:root {}\n')
  })
})
