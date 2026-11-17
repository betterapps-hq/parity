import { type ContainerSpec, defaultModeSettings, findNode } from "@parity-app/core"
import { type TextSplice, textToEdit, withEditedText } from "@parity-app/editor"
import {
  createProjectDoc,
  type ProjectDoc,
  type TransactResult,
  typeInContainer,
  updateContainer
} from "@parity-app/multiplayer"
import { loroReplicas } from "@parity-app/multiplayer-loro"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { openTestSession } from "../doc-fixtures.ts"
import { LiveText, typingPause } from "./live-text.ts"

const key = "app.par#home"

/** A design holding the text "Sign in". */
const home: ContainerSpec = {
  id: "home",
  name: "home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text: "Sign in" }] }
}

/** Writes typing to the title, as `TextEditor` does. */
function typer(doc: ProjectDoc) {
  return (text: string, splice: TextSplice, gesture: string) =>
    typeInContainer(
      doc,
      key,
      "Edit text",
      (container) => withEditedText(container, undefined, "title", text, new Map()),
      { node: "title", splice },
      { gesture }
    )
}

/** A document holding `home`, and an editor's `LiveText` writing to it as `TextEditor` does. */
function setup() {
  const { doc } = openTestSession([{ path: "app.par", document: { version: 4, containers: [home] } }])
  const read = () => textToEdit(doc.design(key)!, undefined, "title", new Map())?.text

  const write = vi.fn<(text: string, splice: TextSplice, gesture: string) => TransactResult>(typer(doc))

  const live = new LiveText("Sign in", { doc, read, write })

  /** Types each step in turn, a key every 50 ms. */
  const type = (...steps: string[]) => {
    for (const step of steps) {
      live.input(step)
      vi.advanceTimersByTime(50)
    }
  }

  /** Someone else's change, as a live room delivers it. */
  const remote = (text: string) =>
    updateContainer(
      doc,
      key,
      "Edit text",
      (container) => withEditedText(container, undefined, "title", text, new Map()),
      {
        origin: "remote"
      }
    )

  return { doc, live, read, write, type, remote }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("text written as it's typed", () => {
  it("writes each key as it's typed, as the change at the caret", () => {
    const { live, read, write, type } = setup()
    type("Sign i", "Sign ", "Sign u", "Sign up")
    expect(read()).toBe("Sign up")
    expect(write.mock.calls.map(([, splice]) => splice)).toEqual([
      { start: 6, end: 7, insert: "" },
      { start: 5, end: 6, insert: "" },
      { start: 5, end: 5, insert: "u" },
      { start: 6, end: 6, insert: "p" }
    ])
    live.close()
  })

  it("makes one undo step per pause", () => {
    const { doc, live, read, type } = setup()
    type("Sign in ", "Sign in n", "Sign in no", "Sign in now")
    vi.advanceTimersByTime(typingPause)
    type("Sign in now!")
    live.close()

    expect(doc.history().undo).toEqual(["Edit text", "Edit text"])
    doc.undo()
    expect(read()).toBe("Sign in now")
    doc.undo()
    expect(read()).toBe("Sign in")
    expect(doc.history().canUndo).toBe(false)
  })

  it("writes what's typed when it closes, and leaves no step when the text is back as it was", () => {
    const { doc, live, read, type } = setup()
    type("Sign i", "Sign in")
    expect(live.close("Sign in")).toMatchObject({ step: false })
    expect(read()).toBe("Sign in")
    expect(doc.history().canUndo).toBe(false)
  })

  it("writes nothing once closed", () => {
    const { live, write } = setup()
    live.close()
    live.input("Sign up")
    vi.advanceTimersByTime(typingPause)
    expect(write).not.toHaveBeenCalled()
  })

  it("takes in someone else's change, keeping the typing and the caret among its characters", () => {
    const { doc, live, read, type, remote } = setup()
    // With the caret at the end, someone writes "Please " before the typing and lowercases the S.
    type("Sign in ", "Sign in n")
    remote("Please sign in n")
    expect(live.received("Sign in n", { start: 9, end: 9 })).toEqual({
      text: "Please sign in n",
      selection: { start: 16, end: 16 }
    })
    type("Please sign in no", "Please sign in now")
    live.close()
    expect(read()).toBe("Please sign in now")
    // Their change isn't in this person's undo: Undo takes back only the typing.
    doc.undo()
    expect(read()).toBe("Please sign in")
    expect(findNode(doc.design(key)!.root, "title")).toMatchObject({ text: "Please sign in" })
  })

  it("writes typing an input method held back where the text is now", () => {
    const { live, read, remote } = setup()
    // Composed while someone wrote "Please " before it: the editor holds the text as it opened, plus what's composed.
    remote("Please sign in")
    expect(live.received("Sign in!", { start: 8, end: 8 })).toEqual({
      text: "Please sign in!",
      selection: { start: 15, end: 15 }
    })
    expect(read()).toBe("Please sign in!")
    live.close()
  })

  it("doesn't take in its own writes", () => {
    const { live, type } = setup()
    type("Sign up")
    expect(live.received("Sign up", { start: 7, end: 7 })).toBeUndefined()
    live.close()
  })

  it("keeps every letter two people type in one text at once, in a live room (PAR-1238)", () => {
    const pair = loroReplicas.open({
      files: [{ path: "app.par", document: { version: 4, containers: [home] } }],
      main: "app.par",
      modes: defaultModeSettings
    })

    // An editor as `TextEditor` runs it: each key goes in at the caret, and others' typing is taken in.
    const editor = (doc: ProjectDoc) => {
      const read = () => textToEdit(doc.design(key)!, undefined, "title", new Map())?.text
      let shown = { text: "Sign in", caret: 7 }
      const live = new LiveText(shown.text, { doc, read, write: typer(doc) })

      doc.subscribe(() => {
        const rebased = live.received(shown.text, { start: shown.caret, end: shown.caret })
        shown = rebased ? { text: rebased.text, caret: rebased.selection.end } : shown
      })

      return (letter: string) => {
        const text = shown.text.slice(0, shown.caret) + letter + shown.text.slice(shown.caret)
        shown = { text, caret: shown.caret + letter.length }
        live.input(text, shown.caret)
      }
    }

    const a = createProjectDoc(pair.a, { undoLimit: 200, main: "app.par" })
    const b = createProjectDoc(pair.b, { undoLimit: 200, main: "app.par" })
    const typeA = editor(a)
    const typeB = editor(b)

    // Both type at the end, a key each in turn, and the room passes the keys on every other turn.
    for (const [index, letter] of ": now ".split("").entries()) {
      typeA(letter)
      typeB(letter.toUpperCase())

      if (index % 2 === 1) {
        pair.exchange()
      }
    }

    pair.exchange()
    const text = textToEdit(a.design(key)!, undefined, "title", new Map())?.text ?? ""
    expect(textToEdit(b.design(key)!, undefined, "title", new Map())?.text).toBe(text)
    expect(text.split("").toSorted().join("")).toBe("Sign in: now : NOW ".split("").toSorted().join(""))
  })
})
