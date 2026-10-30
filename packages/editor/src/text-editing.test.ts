import { describe, expect, it } from "vite-plus/test"
import { openingSelection, textSizing, withTextSizing, wordAt } from "./text-editing.ts"

const text = "Start free, then upgrade when you need more seats."
const word = (range: { start: number; end: number }) => text.slice(range.start, range.end)

describe("wordAt", () => {
  it("selects the word holding the character, from its first letter to its last", () => {
    const upgrade = text.indexOf("upgrade")
    expect(word(wordAt(text, upgrade))).toBe("upgrade")
    expect(word(wordAt(text, upgrade + 3))).toBe("upgrade")
    expect(word(wordAt(text, upgrade + 6))).toBe("upgrade")
  })

  it("selects a space or punctuation on its own, as a browser's double-click does", () => {
    expect(word(wordAt(text, text.indexOf(",")))).toBe(",")
    expect(word(wordAt(text, text.indexOf(" then")))).toBe(" ")
  })

  it("selects the last word from the end, and nothing in an empty text", () => {
    expect(word(wordAt(text, text.length))).toBe(".")
    expect(wordAt("Pro", 3)).toEqual({ start: 0, end: 3 })
    expect(wordAt("", 0)).toEqual({ start: 0, end: 0 })
  })

  it("keeps words with apostrophes and digits whole", () => {
    const terms = "Acme's terms from 2026"
    expect(wordAt(terms, 2)).toEqual({ start: 0, end: "Acme's".length })
    expect(wordAt(terms, terms.length - 2)).toEqual({ start: terms.length - 4, end: terms.length })
  })
})

describe("openingSelection", () => {
  it("selects the clicked word, or the whole text without a point on it", () => {
    expect(word(openingSelection(text, text.indexOf("seats")))).toBe("seats")
    expect(openingSelection(text, undefined)).toEqual({ start: 0, end: text.length })
    expect(openingSelection(text, -1)).toEqual({ start: 0, end: text.length })
    expect(openingSelection(text, text.length)).toEqual({ start: 0, end: text.length })
  })
})

describe("textSizing", () => {
  it("reads Figma's mode from a text layer's width and height", () => {
    expect(textSizing({})).toBe("auto-height")
    expect(textSizing({ width: "fill" })).toBe("auto-height")
    expect(textSizing({ width: 40 })).toBe("auto-height")
    expect(textSizing({ width: "hug" })).toBe("auto-width")
    expect(textSizing({ width: "hug", height: "hug" })).toBe("auto-width")
    expect(textSizing({ width: 40, height: 10 })).toBe("fixed")
    expect(textSizing({ width: "hug", height: "size-12" })).toBe("fixed")
    expect(textSizing({ height: "fill" })).toBe("fixed")
  })
})

describe("withTextSizing", () => {
  const measured = { width: 52.5, height: 14 }

  it("makes auto width hug the text, dropping a fixed height and the older grow", () => {
    expect(withTextSizing({ width: 40, height: 10 }, "auto-width", measured)).toEqual({
      width: "hug",
      height: undefined
    })
    expect(withTextSizing({ grow: true }, "auto-width", measured)).toEqual({
      width: "hug",
      height: undefined,
      grow: undefined
    })
  })

  it("makes auto height fix a hugging width where it's drawn, and keep any other width", () => {
    expect(withTextSizing({ width: "hug" }, "auto-height", measured)).toEqual({ width: 52.5, height: undefined })
    expect(withTextSizing({ width: "fill", height: 10 }, "auto-height", measured)).toEqual({
      width: "fill",
      height: undefined
    })
    expect(withTextSizing({}, "auto-height", measured)).toEqual({ width: undefined, height: undefined })
  })

  it("makes fixed keep the height it's drawn at, or the one it has", () => {
    expect(withTextSizing({ width: "hug" }, "fixed", measured)).toEqual({ width: 52.5, height: 14 })
    expect(withTextSizing({ width: 40 }, "fixed", measured)).toEqual({ width: 40, height: 14 })
    expect(withTextSizing({ width: 40, height: "size-12" }, "fixed", measured)).toEqual({
      width: 40,
      height: "size-12"
    })
  })

  it("sets values over the design's in a state or variant, where dropping them would show the design's again", () => {
    const explicit = { explicit: true }
    expect(withTextSizing({ width: 40, height: 10, grow: true }, "auto-width", measured, explicit)).toEqual({
      width: "hug",
      height: "hug",
      grow: false
    })
    expect(withTextSizing({ width: 40, height: 10 }, "auto-height", measured, explicit)).toEqual({
      width: 40,
      height: "hug"
    })
    // Nothing to set over: no height shows, so none is written.
    expect(withTextSizing({ width: "hug" }, "auto-height", measured, explicit)).toEqual({
      width: 52.5,
      height: undefined
    })
    expect(textSizing({ width: 40, height: "hug" })).toBe("auto-height")
  })

  it("drops the older grow for auto height and fixed in a column, where it fills the height, and keeps it in a row", () => {
    const column = { column: true }
    expect(withTextSizing({ width: 40, grow: true }, "auto-height", measured, column)).toEqual({
      width: 40,
      height: undefined,
      grow: undefined
    })
    expect(withTextSizing({ width: 40, grow: true }, "fixed", measured, column)).toEqual({
      width: 40,
      height: 14,
      grow: undefined
    })
    expect(withTextSizing({ grow: true }, "auto-height", measured, { ...column, explicit: true })).toEqual({
      width: undefined,
      height: undefined,
      grow: false
    })
    expect(withTextSizing({ grow: true }, "auto-height", measured)).toEqual({ width: undefined, height: undefined })
  })

  it("lands each mode where textSizing reads it back", () => {
    for (const style of [{}, { width: "hug" }, { width: 40, height: 10 }, { width: "fill" }]) {
      for (const sizing of ["auto-width", "auto-height", "fixed"] as const) {
        const next = { ...style, ...withTextSizing(style, sizing, measured) }
        expect(textSizing(next)).toBe(sizing)
      }
    }
  })
})
