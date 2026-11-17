import { describe, expect, it } from "vite-plus/test"
import { type ClassPrinter, writeClasses } from "./classes.ts"

describe("writeClasses", () => {
  /** A framework with a class for padding and for gap, and none for anything else. */
  const printer: ClassPrinter = {
    print: (declarations) => {
      const known = declarations.filter(({ property }) => property === "padding" || property === "gap")

      return {
        output: known.map(({ property, value }) => `${property}-${value}`),
        unwritten: declarations.filter((declaration) => !known.includes(declaration))
      }
    },
    read: (classes) => ({ declarations: [], unread: classes }),
    css: (classes) => classes.map((name) => `.${name}{}`).join("")
  }

  it("writes each declaration's classes by itself, and none for one the framework can't write", () => {
    const written = writeClasses(
      printer,
      [],
      [
        { property: "padding", value: "1px" },
        { property: "color", value: "red" },
        { property: "gap", value: "2px" }
      ]
    )

    expect(written.classes).toEqual([["padding-1px"], null, ["gap-2px"]])
  })

  it("compiles the classes the frames already have with the new ones, so their stylesheet stays whole", () => {
    const gap = [{ property: "gap", value: "2px" }]

    expect(writeClasses(printer, [], gap).css).toBe(".gap-2px{}")
    expect(writeClasses(printer, ["padding-1px"], gap).css).toBe(".padding-1px{}.gap-2px{}")
    // A class the frames have and a declaration writes again is compiled once.
    expect(writeClasses(printer, ["gap-2px", "padding-1px"], gap).css).toBe(".gap-2px{}.padding-1px{}")
  })
})
