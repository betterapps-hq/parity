import type { CssDeclaration } from "@parity-app/style"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { askingFrameClasses } from "./frame-classes.ts"

/** What the frames' stylesheet was last given: outside a browser, a stylesheet only needs to keep that. */
let adopted = ""

class Sheet {
  replaceSync(text: string) {
    adopted = text
  }
}

beforeEach(() => {
  adopted = ""
  vi.stubGlobal("CSSStyleSheet", Sheet)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const top: CssDeclaration = { property: "top", value: "calc(var(--spacing) * 40)" }
const left: CssDeclaration = { property: "left", value: "0" }
const classOf = ({ property }: CssDeclaration) => `${property}-class`
const prepare = (css: string) => ({ scoped: css, global: "" })

type Write = Parameters<typeof askingFrameClasses>[1]

const tasks = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("frame classes", () => {
  it("asks for more classes only once the last ask is answered, so the stylesheet keeps the classes it had", async () => {
    // A service that answers once it's told to, as one still loading the project's framework does.
    const answers: (() => void)[] = []
    const asked: string[][] = []

    const write = vi.fn<Write>((declarations, written) => {
      asked.push(written)
      const classes = declarations.map((declaration) => [classOf(declaration)])
      const css = [...written, ...classes.flat()].map((name) => `.${name}{}`).join("")

      return new Promise((resolve) => {
        answers.push(() => resolve({ supported: true, classes, css }))
      })
    })

    const classes = askingFrameClasses({ prepare }, write)
    expect(classes.classesFor([top])).toBeUndefined()
    await tasks()
    expect(classes.classesFor([left])).toBeUndefined()
    await tasks()
    expect(write).toHaveBeenCalledTimes(1)
    answers.shift()!()
    await tasks()
    expect(write).toHaveBeenCalledTimes(2)
    expect(asked[1]).toEqual(["top-class"])
    answers.shift()!()
    await tasks()
    expect(classes.classesFor([top, left])).toEqual(["top-class", "left-class"])
    expect(adopted).toBe(".top-class{}.left-class{}")
  })
})
