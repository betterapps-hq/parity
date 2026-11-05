import { describe, expect, it } from "vite-plus/test"
import { keymap } from "./keymap.ts"
import { matchWords } from "./word-match.ts"

/** What Search actions matches its items on: an action's name, its group and its id. */
const valueOf = (command: keyof typeof keymap) => `${keymap[command].label} ${keymap[command].group} ${command}`

/** The actions a search finds, best first, as Search actions lists them. */
function found(search: string): string[] {
  return (Object.keys(keymap) as (keyof typeof keymap)[])
    .map((command) => ({ command, rank: matchWords(valueOf(command), search) }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map(({ command }) => keymap[command].label)
}

describe("matching actions by the start of words", () => {
  it("finds New screen, New component and New tab for new, and not names with n, e and w scattered through them", () => {
    expect(found("new")).toEqual(["New screen", "New component", "New tab"])
  })

  it("finds a word inside a name, after names that start with what's typed", () => {
    expect(found("screen")).toEqual(expect.arrayContaining(["New screen", "Next screen or component"]))
    expect(found("screen")).not.toContain("Select inverse")
    expect(matchWords(valueOf("newScreen"), "new")).toBe(1)
    expect(matchWords(valueOf("newScreen"), "screen")).toBe(0.5)
  })

  it("matches each typed word, in any order, and ignores case and spaces around", () => {
    expect(matchWords("Zoom to fit View zoomToFit", "fit zoom")).toBe(0.5)
    expect(matchWords("Zoom to fit View zoomToFit", "  ZOOM to ")).toBe(1)
    expect(matchWords("Zoom to fit View zoomToFit", "zoom out")).toBe(0)
  })

  it("lists everything before anything's typed", () => {
    expect(matchWords("Undo Edit undo", "")).toBe(1)
  })
})
