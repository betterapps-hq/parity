import { describe, expect, it } from "vite-plus/test"
import { iconAliases } from "../icon-names.ts"
import { parseData } from "../schema.ts"
import { evaluateValue, exportOf, readRenderSlotKey, renderSlotKey, type ValueHost, valueImports } from "./evaluate.ts"
import { decoratorValue, sampleValue } from "./grammar.ts"

/** A module whose `make` returns a list that `add` pushes to, so a test sees what was called on it. */
const theme = { dark: true }

/** What the tests' calls pass to `make` and `add`. */
type Item = number | typeof theme | undefined

const modules = new Map([
  [
    "pkg",
    {
      default: "the default export",
      theme,
      Tooltip: { Provider: "provider" },
      make: (...items: Item[]) => ({
        items,
        add(item: Item) {
          this.items.push(item)
        },
        fail() {
          throw new Error("needs the app")
        }
      })
    }
  ]
])

function host(globals: Record<string, string> = {}): ValueHost {
  return {
    exported(specifier, path) {
      const module = modules.get(specifier)

      if (!module) {
        throw new Error(`${specifier} isn't loaded`)
      }

      return exportOf(module, path)
    },
    global: (name) => globals[name],
    frame: (part) => `frame ${part}`,
    made: new Map()
  }
}

const make = { $call: { import: "pkg", export: "make" }, args: [1] }

describe("decorator and sample values", () => {
  it.each([
    ["plain JSON as written", { a: [1, "two", null, false] }, {}, { a: [1, "two", null, false] }],
    ["a named export", { $import: "pkg", export: "theme" }, {}, theme],
    ["the default export when no export is named", { $import: "pkg" }, {}, "the default export"],
    ["an export inside a namespace", { $import: "pkg", export: "Tooltip.Provider" }, {}, "provider"],
    ["a call with its arguments", make, {}, { items: [1] }],
    [
      "a call's methods in order, with their arguments worked out",
      { ...make, methods: [{ method: "add", args: [{ $import: "pkg", export: "theme" }] }, { method: "add" }] },
      {},
      { items: [1, theme, undefined] }
    ],
    [
      "a call whose method is missing or throws, as it's still usable",
      { ...make, methods: [{ method: "missing" }, { method: "fail" }, { method: "add", args: [2] }] },
      {},
      { items: [1, 2] }
    ],
    [
      "a global's value for the frame",
      { $global: "theme", values: { dark: "D" }, default: "L" },
      { theme: "dark" },
      "D"
    ],
    ["a global's default otherwise", { $global: "theme", values: { dark: "D" }, default: "L" }, { theme: "x" }, "L"],
    ["part of the frame", { $frame: "dir" }, {}, "frame dir"],
    ["forms inside plain JSON and lists", { props: [{ $frame: "lang" }] }, {}, { props: ["frame lang"] }]
  ])("evaluates %s", (_, value, globals, expected) => {
    expect(() => parseData(decoratorValue, value)).not.toThrow()
    // Wrapped, so text is compared whole and an object by the keys the case names.
    expect({ evaluated: evaluateValue(value, host(globals)) }).toMatchObject({ evaluated: expected })
  })

  it("makes a function of a `$function` value, worked out when it's called", () => {
    const made = evaluateValue({ $function: { $import: "pkg", export: "theme" } }, host())
    expect(made).toBeInstanceOf(Function)
    expect(made instanceof Function && made()).toBe(theme)
  })

  it("makes each call once for as long as the host keeps it", () => {
    const shared = host()
    expect(evaluateValue([make, make], shared)).toSatisfy(([a, b]: unknown[]) => a === b)
  })

  it("keeps plain JSON's identity, so a prop doesn't change between draws", () => {
    const plain = { list: [1, { a: "b" }] }
    expect(evaluateValue(plain, host())).toBe(plain)
  })

  it("throws when a call's module isn't loaded or its export isn't a function", () => {
    expect(() => evaluateValue({ $call: { import: "other", export: "x" } }, host())).toThrow("other isn't loaded")
    expect(() => evaluateValue({ $call: { import: "pkg", export: "theme" } }, host())).toThrow(
      "pkg has no function theme"
    )
  })

  it.each([
    [{ $call: { export: "make" } }, "/$call/import: expected a string"],
    [{ $call: { import: "pkg" } }, "/$call/export: expected a string"],
    [{ ...make, methods: [{ args: [] }] }, "/methods/0/method: expected a string"],
    [{ $global: "theme" }, "/values: expected an object"],
    [{ $frame: "window" }, "/$frame:"],
    [{ $import: "pkg", extra: 1 }, "extra"]
  ])("refuses a broken form, saying what's wrong with it: %j", (value, message) => {
    expect(() => parseData(decoratorValue, value)).toThrow(message)
  })

  it("works out only made values in a sample, where the other forms are data as written", () => {
    const value = { theme: { $import: "pkg", export: "theme" }, list: [{ ...make, args: [{ $frame: "dir" }] }] }
    expect(parseData(sampleValue, value)).toEqual(value)
    expect(evaluateValue(value, host(), "sample")).toMatchObject({
      theme: { $import: "pkg", export: "theme" },
      list: [{ items: [{ $frame: "dir" }] }]
    })
    expect(valueImports(value, "sample")).toEqual(["pkg"])
  })

  it("refuses a broken made value in a sample", () => {
    expect(() => parseData(sampleValue, { list: [{ $call: { import: "pkg" } }] })).toThrow(
      "/list/0/$call/export: expected a string"
    )
  })

  it("makes a date as `new Date(...)` makes it in the project's code, in a sample and a decorator (PAR-912)", () => {
    const value = { selected: { $date: "2026-11-19T00:00:00" }, disabled: { before: { $date: 1_763_510_400_000 } } }
    expect(parseData(sampleValue, value)).toEqual(value)
    expect(evaluateValue(value, host(), "sample")).toEqual({
      selected: new Date("2026-11-19T00:00:00"),
      disabled: { before: new Date(1_763_510_400_000) }
    })
    expect(evaluateValue({ $date: "2026-11-19" }, host())).toEqual(new Date("2026-11-19"))
    expect(valueImports(value, "sample")).toEqual([])
  })

  it("makes each date once for as long as the host keeps it, so a prop doesn't change between draws", () => {
    const shared = host()
    const date = { $date: "2026-11-19T00:00:00" }
    expect(evaluateValue([date, { ...date }], shared, "sample")).toSatisfy(([a, b]: unknown[]) => a === b)
  })

  it.each([
    [{ $date: "next Thursday" }, "/$date: expected a date, such as 2026-11-19T00:00:00"],
    [{ $date: true }, "/$date:"],
    [{ $date: "2026-11-19", zone: "UTC" }, "zone"]
  ])("refuses a date `new Date` can't read: %j", (value, message) => {
    expect(() => parseData(sampleValue, value)).toThrow(message)
    expect(() => parseData(decoratorValue, value)).toThrow(message)
  })

  it("lists the modules a value imports, from every form and argument, each once", () => {
    const value = {
      a: { $import: "one" },
      b: {
        $call: { import: "two", export: "x" },
        args: [{ $import: "three" }],
        methods: [{ method: "m", args: [{ $import: "four" }] }]
      },
      c: { $global: "theme", values: { dark: { $import: "five" } }, default: { $import: "one" } },
      d: { $function: { $import: "six" } },
      e: { import: "not a module" }
    }

    expect(valueImports(value)).toEqual(["one", "two", "three", "four", "five", "six"])
  })
})

describe("render slot keys", () => {
  it.each<[string, { spread?: true; pass?: string[] }, string]>([
    ["children", {}, "$render:children"],
    ["renderInput", { spread: true }, "$renderWith:renderInput"],
    ["children", { pass: ["segment", "item"] }, "$render:children?pass=segment,item"]
  ])("keys %s's render slot and reads the key back", (prop, render, key) => {
    expect(renderSlotKey(prop, render)).toBe(key)
    expect(readRenderSlotKey(key)).toEqual({ prop, spread: render.spread === true, ...render })
  })

  it("reads a slot of plain nodes as none", () => {
    expect(readRenderSlotKey("children")).toBeUndefined()
  })
})

describe("iconAliases", () => {
  const heart = () => null
  const gear = () => null
  const module = { Heart: heart, HeartIcon: heart, Gear: gear, Settings01Icon: gear, Cog: gear, icons: {}, Icon: heart }

  it("lists each icon once, by the shortest name the pattern matches, with every name it's exported under", () => {
    expect(iconAliases(module, { match: "Icon$", exclude: ["Icon"] }, (value) => value instanceof Function)).toEqual([
      { name: "HeartIcon", names: ["Heart", "HeartIcon"] },
      { name: "Settings01Icon", names: ["Gear", "Settings01Icon", "Cog"] }
    ])
  })

  it("matches every capitalised export without a pattern", () => {
    expect(iconAliases(module, undefined, (value) => value instanceof Function).map(({ name }) => name)).toEqual([
      "Icon",
      "Cog"
    ])
  })
})
