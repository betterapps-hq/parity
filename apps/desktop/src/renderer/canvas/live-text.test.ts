import { type ContainerSpec, findNode } from "@parity-app/core"
import { textToEdit, withEditedText } from "@parity-app/editor"
import { type TransactResult, updateContainer } from "@parity-app/multiplayer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { openTestSession } from "../doc-fixtures.ts"
import { LiveText, typingBatch, typingPause } from "./live-text.ts"

const key = "app.par#home"

/** A design holding the text "Sign in", and an editor's `LiveText` writing to it as `TextEditor` does. */
function setup() {
  const home: ContainerSpec = {
    id: "home",
    name: "home",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [{ type: "text", id: "title", text: "Sign in" }] }
  }

  const { doc } = openTestSession([{ path: "app.par", document: { version: 4, containers: [home] } }])
  const read = () => textToEdit(doc.design(key)!, undefined, "title", new Map())?.text

  const write = vi.fn<(text: string, gesture: string) => TransactResult>((text, gesture) =>
    updateContainer(
      doc,
      key,
      "Edit text",
      (container) => withEditedText(container, undefined, "title", text, new Map()),
      {
        gesture
      }
    )
  )

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
  it("writes a few times a second while typing, not on every key", () => {
    const { live, read, write, type } = setup()
    type("Sign i", "Sign ", "Sign u", "Sign up")
    vi.advanceTimersByTime(typingBatch)
    expect(read()).toBe("Sign up")
    // Four keys 50 ms apart are two writes.
    expect(write.mock.calls.map(([text]) => text)).toEqual(["Sign u", "Sign up"])
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
    // Typed and not yet written, with the caret at the end, when someone writes "Please " before it and lowercases the S.
    type("Sign in ", "Sign in n")
    remote("Please sign in")
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

  it("doesn't take in its own writes", () => {
    const { live, type } = setup()
    type("Sign up")
    vi.advanceTimersByTime(typingBatch)
    expect(live.received("Sign up", { start: 7, end: 7 })).toBeUndefined()
    live.close()
  })
})
