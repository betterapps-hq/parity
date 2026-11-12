import { type ComponentLibrary, type ContainerSpec, findNode, type NodeStyle } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  editableText,
  openingSelection,
  textSizing,
  textSizingKeys,
  textToEdit,
  withEditedText,
  withTextSizing,
  wordAt
} from "./text-editing.ts"

/**
 * A sign-in screen whose board shows its Error state, which changes the title, with a Loading state that changes it
 * too. Its button is an instance of a component whose label is a component with a string child.
 */
function signIn(): ContainerSpec {
  return {
    id: "sign-in",
    name: "Sign in",
    position: { x: 0, y: 0 },
    root: {
      type: "layout",
      id: "root",
      children: [
        { type: "text", id: "title", text: "Sign in" },
        { type: "instance", id: "submit", design: "button" }
      ]
    },
    states: [
      { id: "default", name: "Default" },
      { id: "error", name: "Error", overrides: { title: { text: "Try again" } } },
      { id: "loading", name: "Loading", overrides: { title: { text: "Signing in" } } }
    ],
    view: { state: "error" }
  }
}

const library: ComponentLibrary = new Map([
  [
    "button",
    {
      id: "button",
      name: "Button",
      kind: "component",
      position: { x: 0, y: 0 },
      root: { type: "component", id: "label", component: "Button", props: { children: "Continue" } }
    }
  ]
])

const shownText = (design: ContainerSpec, picked: string | undefined, id = "title") =>
  textToEdit(design, picked, id, library)?.text

const baseTitle = (design: ContainerSpec) => {
  const title = findNode(design.root, "title")

  return title && editableText(title)
}

describe("the text editor's state", () => {
  it("reads and writes the text in the state the layer was picked in", () => {
    expect(shownText(signIn(), "loading")).toBe("Signing in")
    const edited = withEditedText(signIn(), "loading", "title", "Hold on", library)
    expect(shownText(edited, "loading")).toBe("Hold on")
    expect(shownText(edited, "error")).toBe("Try again")
    expect(baseTitle(edited)).toBe("Sign in")
  })

  it("reads and writes the state the board shows when the one picked is gone", () => {
    // The text it opens on is the Error state's, so that's where the edit goes, not the design or a missing state.
    expect(shownText(signIn(), "deleted")).toBe("Try again")
    const edited = withEditedText(signIn(), "deleted", "title", "Check your email", library)
    expect(shownText(edited, "error")).toBe("Check your email")
    expect(baseTitle(edited)).toBe("Sign in")
  })

  it("reads and writes the base state when the board shows a state that's gone", () => {
    const stale = { ...signIn(), view: { state: "deleted" } }
    expect(shownText(stale, undefined)).toBe("Sign in")
    const edited = withEditedText(stale, undefined, "title", "Log in", library)
    expect(baseTitle(edited)).toBe("Log in")
    expect(shownText(edited, "error")).toBe("Try again")
  })

  it("edits a component's string child inside an instance, in that copy only", () => {
    expect(shownText(signIn(), "default", "submit/label")).toBe("Continue")
    const edited = withEditedText(signIn(), "default", "submit/label", "Sign in", library)
    expect(shownText(edited, "default", "submit/label")).toBe("Sign in")
    expect(library.get("button")?.root).toMatchObject({ props: { children: "Continue" } })
  })

  it("has nothing to edit, and changes nothing, for a layer that isn't text or is gone", () => {
    expect(textToEdit(signIn(), undefined, "root", library)).toBeUndefined()
    expect(textToEdit(signIn(), undefined, "gone", library)).toBeUndefined()
    const design = signIn()
    expect(withEditedText(design, undefined, "gone", "Hello", library)).toBe(design)
  })
})

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
    expect(textSizing({ width: { size: "fill" } })).toBe("auto-height")
    expect(textSizing({ width: { step: 40 } })).toBe("auto-height")
    expect(textSizing({ width: { size: "hug" } })).toBe("auto-width")
    expect(textSizing({ width: { size: "hug" }, height: { size: "hug" } })).toBe("auto-width")
    expect(textSizing({ width: { step: 40 }, height: { step: 10 } })).toBe("fixed")
    expect(textSizing({ width: { size: "hug" }, height: { token: "size-12" } })).toBe("fixed")
    expect(textSizing({ height: { size: "fill" } })).toBe("fixed")
  })
})

describe("withTextSizing", () => {
  const measured = { width: 52.5, height: 14 }

  it("makes auto width hug the text, dropping a fixed height and the older grow", () => {
    expect(withTextSizing({ width: { step: 40 }, height: { step: 10 } }, "auto-width", measured)).toEqual({
      width: { size: "hug" },
      height: undefined
    })
    expect(withTextSizing({ grow: true }, "auto-width", measured)).toEqual({
      width: { size: "hug" },
      height: undefined,
      grow: undefined
    })
  })

  it("makes auto height fix a hugging width where it's drawn, and keep any other width", () => {
    expect(withTextSizing({ width: { size: "hug" } }, "auto-height", measured)).toEqual({
      width: { step: 52.5 },
      height: undefined
    })
    expect(withTextSizing({ width: { size: "fill" }, height: { step: 10 } }, "auto-height", measured)).toEqual({
      width: { size: "fill" },
      height: undefined
    })
    expect(withTextSizing({}, "auto-height", measured)).toEqual({ width: undefined, height: undefined })
  })

  it("makes fixed keep the height it's drawn at, or the one it has", () => {
    expect(withTextSizing({ width: { size: "hug" } }, "fixed", measured)).toEqual({
      width: { step: 52.5 },
      height: { step: 14 }
    })
    expect(withTextSizing({ width: { step: 40 } }, "fixed", measured)).toEqual({
      width: { step: 40 },
      height: { step: 14 }
    })
    expect(withTextSizing({ width: { step: 40 }, height: { token: "size-12" } }, "fixed", measured)).toEqual({
      width: { step: 40 },
      height: { token: "size-12" }
    })
  })

  it("sets values over the design's in a state or variant, where dropping them would show the design's again", () => {
    const explicit = { explicit: true }
    expect(
      withTextSizing({ width: { step: 40 }, height: { step: 10 }, grow: true }, "auto-width", measured, explicit)
    ).toEqual({
      width: { size: "hug" },
      height: { size: "hug" },
      grow: false
    })
    expect(withTextSizing({ width: { step: 40 }, height: { step: 10 } }, "auto-height", measured, explicit)).toEqual({
      width: { step: 40 },
      height: { size: "hug" }
    })
    // Nothing to set over: no height shows, so none is written.
    expect(withTextSizing({ width: { size: "hug" } }, "auto-height", measured, explicit)).toEqual({
      width: { step: 52.5 },
      height: undefined
    })
    expect(textSizing({ width: { step: 40 }, height: { size: "hug" } })).toBe("auto-height")
  })

  it("drops the older grow for auto height and fixed in a column, where it fills the height, and keeps it in a row", () => {
    const column = { column: true }
    expect(withTextSizing({ width: { step: 40 }, grow: true }, "auto-height", measured, column)).toEqual({
      width: { step: 40 },
      height: undefined,
      grow: undefined
    })
    expect(withTextSizing({ width: { step: 40 }, grow: true }, "fixed", measured, column)).toEqual({
      width: { step: 40 },
      height: { step: 14 },
      grow: undefined
    })
    expect(withTextSizing({ grow: true }, "auto-height", measured, { ...column, explicit: true })).toEqual({
      width: undefined,
      height: undefined,
      grow: false
    })
    expect(withTextSizing({ grow: true }, "auto-height", measured)).toEqual({ width: undefined, height: undefined })
  })

  it("writes only the keys Resizing resets, so a reset in a state leaves nothing behind", () => {
    // A state's style before the switch, with a value Resizing doesn't own.
    const state = { color: { token: "red" } }
    const design: NodeStyle = { width: { step: 40 }, height: { step: 10 }, grow: true }

    for (const sizing of ["auto-width", "auto-height", "fixed"] as const) {
      for (const column of [false, true]) {
        const edited = { ...state, ...withTextSizing(design, sizing, measured, { explicit: true, column }) }

        const reset = Object.fromEntries(
          Object.entries(edited).filter(([key]) => !textSizingKeys.some((sizingKey) => sizingKey === key))
        )

        expect(reset).toEqual(state)
      }
    }

    expect(withTextSizing(design, "auto-width", measured, { explicit: true })).toHaveProperty("grow", false)
  })

  it("lands each mode where textSizing reads it back", () => {
    for (const style of [
      {},
      { width: { size: "hug" } },
      { width: { step: 40 }, height: { step: 10 } },
      { width: { size: "fill" } }
    ] satisfies NodeStyle[]) {
      for (const sizing of ["auto-width", "auto-height", "fixed"] as const) {
        const next = { ...style, ...withTextSizing(style, sizing, measured) }
        expect(textSizing(next)).toBe(sizing)
      }
    }
  })
})
