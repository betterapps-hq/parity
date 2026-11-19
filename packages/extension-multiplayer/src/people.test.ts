import type { Palette } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import { assignColors, caretMark, dragItems, marqueeRect, People, selectionsByNode, yourMember } from "./people.ts"

const palette = (n: number): Palette => ({ n, name: `P${n}`, stops: ["a", "b", "c"], color: "c", ink: "i" })
const board = (key: string) => ({ owner: "design", type: "design", key })

describe("assignColors", () => {
  it("keeps everyone's number and gives newcomers the lowest free one, so colors never run out", () => {
    const first = assignColors(["a", "b", "c"], new Map())
    expect([...first]).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2]
    ])

    // b left and d joined: d gets b's number back, and the others keep theirs.
    const next = assignColors(["a", "c", "d", "e"], first)
    expect([...next]).toEqual([
      ["a", 0],
      ["c", 2],
      ["d", 1],
      ["e", 3]
    ])
  })
})

describe("yourMember", () => {
  it("draws you as your account avatar shows you while you're signed in, and keeps your room palette", () => {
    const you = yourMember(
      "me",
      { name: "Mia", own: { photo: "https://example.com/mia.png", initials: "MC", color: "oklch(0.6 0.13 18)" } },
      palette(2)
    )

    expect(you).toEqual({
      id: "me",
      name: "Mia",
      palette: palette(2),
      photo: "https://example.com/mia.png",
      own: { initials: "MC", color: "oklch(0.6 0.13 18)" }
    })
  })

  it("leaves the picture out when the account has none, so your initials show on your own color", () => {
    const you = yourMember("me", { name: "Mia", own: { initials: "MC", color: "oklch(0.6 0.13 18)" } }, palette(2))

    expect(you.photo).toBeUndefined()
    expect(you.own).toEqual({ initials: "MC", color: "oklch(0.6 0.13 18)" })
  })

  it("keeps the room's look while you're signed out", () => {
    expect(yourMember("me", { name: "Guest" }, palette(2))).toEqual({ id: "me", name: "Guest", palette: palette(2) })
  })
})

describe("People", () => {
  it("keeps each person's pointer positions in a trail, drawn a little behind, and forgets it when they leave", () => {
    let clock = 1000
    const people = new People(palette.bind(undefined, 0), () => clock)

    const moved = (x: number, t: number) =>
      people.presence("a", { name: "Ana", selection: [], viewing: {}, pointer: { at: { x, y: 0 }, over: true, t } })

    moved(0, 0)

    clock = 1033
    moved(10, 33)

    expect(people.person("a")?.pointer).toEqual({ over: true })
    expect(people.trail("a")?.latest).toEqual({ x: 10, y: 0 })
    expect(people.pointerAt("a", 1033)).toEqual({ x: 0, y: 0 })
    expect(people.pointerAt("a", 1150)?.x).toBeGreaterThan(0)

    people.remove("a")
    expect(people.trail("a")).toBeUndefined()
  })

  it("keeps each person's latest presence, their pointer off the canvas once it leaves, their color and their view", () => {
    const people = new People(palette.bind(undefined, 0))
    const camera = { x: 0, y: 0, width: 800, height: 600 }

    people.presence("a", { name: "Ana", selection: [], viewing: {}, pointer: { at: { x: 5, y: 6 }, over: true } })
    people.colors(new Map([["a", 4]]))
    people.presence("a", { name: "Ana", selection: [board("Card")], viewing: { design: "Card" }, camera })

    expect(people.everyone()).toEqual([
      {
        peer: "a",
        name: "Ana",
        color: 4,
        selection: [board("Card")],
        viewing: { design: "Card" },
        pointer: { over: false }
      }
    ])
    expect(people.roster()).toEqual([{ peer: "a", name: "Ana", color: 4 }])
    expect(people.cameraOf("a")).toEqual(camera)
  })

  it("tells only the person whose pointer moved, and nobody when only where it is changed", () => {
    let clock = 0
    const people = new People(palette.bind(undefined, 0), () => clock)
    const heard: string[] = []
    people.presence("a", { name: "Ana", selection: [board("Card")], viewing: {} })
    people.presence("b", { name: "Bo", selection: [], viewing: {} })
    people.onRoster(() => heard.push("roster"))
    people.onSelections(() => heard.push("selections"))
    people.onPerson("a", () => heard.push("a"))
    people.onPerson("b", () => heard.push("b"))

    const pointer = (x: number, over = true) => {
      clock += 33
      people.presence("a", {
        name: "Ana",
        selection: [board("Card")],
        viewing: {},
        pointer: { at: { x, y: 0 }, over, t: clock },
        camera: { x, y: 0, width: 800, height: 600 }
      })
    }

    // Their pointer arrives: drawn once. Moving, it's drawn from its trail.
    pointer(0)
    pointer(10)
    pointer(20)
    expect(heard).toEqual(["a"])

    // It leaves the canvas: drawn faded.
    pointer(20, false)
    expect(heard).toEqual(["a", "a"])
  })

  it("tells those drawing selections only when a selection, view or caret changes, and the roster only for names", () => {
    const people = new People(palette.bind(undefined, 0))
    const heard: string[] = []
    people.presence("a", { name: "Ana", selection: [], viewing: {} })
    people.onRoster(() => heard.push("roster"))
    people.onSelections(() => heard.push("selections"))

    people.gesture("a", { kind: "marquee", phase: "start", from: { x: 0, y: 0 } })
    expect(heard).toEqual([])

    people.presence("a", { name: "Ana", selection: [board("Card")], viewing: {} })
    expect(heard).toEqual(["selections"])

    people.presence("a", { name: "Ana Lu", selection: [board("Card")], viewing: {} })
    people.colors(new Map([["a", 2]]))
    expect(heard).toEqual(["selections", "roster", "selections", "roster", "selections"])
  })

  it("keeps a gesture from its start until it ends, and forgets those who left", () => {
    const people = new People(palette.bind(undefined, 0))
    people.presence("a", { name: "Ana", selection: [], viewing: {} })
    people.presence("b", { name: "Bo", selection: [], viewing: {} })
    people.gesture("a", { kind: "marquee", phase: "start", from: { x: 0, y: 0 } })
    expect(people.person("a")?.gesture?.kind).toBe("marquee")

    people.gesture("a", { kind: "marquee", phase: "end", from: { x: 0, y: 0 } })
    expect(people.person("a")?.gesture).toBeUndefined()

    let told = 0
    people.onPerson("b", () => {
      told += 1
    })
    people.keepOnly(["a"])
    expect(people.roster().map((person) => person.peer)).toEqual(["a"])
    expect(people.person("b")).toBeUndefined()
    expect(told).toBe(1)
  })
})

describe("what's drawn", () => {
  it("places dragged nodes from the pointer, and a marquee from where it started", () => {
    expect(
      dragItems(
        {
          kind: "move",
          phase: "start",
          targets: [{ ref: board("Card"), offset: { x: -10, y: -4 }, size: { width: 100, height: 50 }, state: "Hover" }]
        },
        { x: 50, y: 20 }
      )
    ).toEqual([{ ref: board("Card"), at: { x: 40, y: 16 }, state: "Hover" }])

    expect(marqueeRect({ x: 30, y: 40 }, { x: 10, y: 50 })).toEqual({ x: 10, y: 40, w: 20, h: 10 })
  })

  it("groups everyone's selections by node, so several people on one each get a ring", () => {
    const people = new People(palette.bind(undefined, 0))
    people.presence("a", { name: "Ana", selection: [board("Card")], viewing: {} })
    people.presence("b", { name: "Bo", selection: [board("Card"), board("Nav")], viewing: {} })

    expect(selectionsByNode(people.everyone()).map(({ ref, by }) => [ref.key, by.map((each) => each.peer)])).toEqual([
      ["Card", ["a", "b"]],
      ["Nav", ["b"]]
    ])
  })

  it("draws someone's caret a little shorter than the line, the same width on screen at any zoom", () => {
    const caret = { x: 100, top: 20, bottom: 40 }
    expect(caretMark(caret, 1)).toEqual({ left: 99, top: 22, width: 2, height: 16 })
    expect(caretMark(caret, 2)).toEqual({ left: 99.5, top: 22, width: 1, height: 16 })
  })
})
