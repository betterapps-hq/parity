import { join } from "node:path"
import type { LibraryEdits } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { type ExampleUse, readExamples } from "./examples.ts"
import { isFunction, isText, type LiveObject } from "./live.ts"
import { partChains } from "./parts-chains.ts"
import { openTrial } from "./parts-trial.ts"
import {
  completeChains,
  dropChildlessParents,
  dropLooseProps,
  fillParents,
  fitChildren,
  followAppErrors,
  type PartRelation,
  placeParts,
  type Relating,
  retryFailing,
  spelledOut,
  takeSpelledOutChildren,
  textAsProp
} from "./parts.ts"
import { foundComponent, loadFrom, testReact } from "./react-for-tests.ts"

// React from a workspace package that depends on it; libgen loads the project's own copy in real use.
const load = loadFrom(join(import.meta.dirname, "../../../adapters/react-adapter/package.json"))
const React = await testReact(load)

interface TrialSetup {
  /** The components the types declare, which may include some the module doesn't export. */
  names?: string[]
  examples?: Map<string, ExampleUse>
  edits?: LibraryEdits["components"]
}

/** Opens a trial of a made-up library, exported as `demo`. */
async function trialOf(library: LiveObject, { names, examples = new Map(), edits = {} }: TrialSetup = {}) {
  const trial = await openTrial({
    load: async (specifier) => (specifier === "demo" ? library : load(specifier)),
    specifier: "demo",
    components: (names ?? Object.keys(library)).map(foundComponent),
    providers: [],
    edits,
    examples
  })

  if ("note" in trial) {
    throw new Error(trial.note)
  }

  return trial
}

/** What the passes know, starting from these relations. */
function relating(entries: [string, PartRelation][], drawn: Relating["drawn"] = new Map()): Relating {
  return { relations: new Map(entries), loose: new Map(), drawn, missing: [] }
}

/** A root that provides a context, and an item that throws outside it, naming the root. */
function rootAndItem() {
  const RootContext = React.createContext(false)

  return {
    Root: ({ children }: LiveObject) => React.createElement(RootContext.Provider, { value: true }, children),
    Item: ({ children }: LiveObject) => {
      if (!React.useContext(RootContext)) {
        throw new Error("`Item` must be used within `Root`")
      }

      return React.createElement("li", null, children)
    }
  }
}

describe("placeParts", () => {
  it("places each part where its error says, and marks what can't be placed", async () => {
    const library = { ...rootAndItem(), RootContext: React.createContext(false).Consumer }
    const trial = await trialOf(library, { names: ["Root", "Item", "RootContext", "Missing"] })
    const chains = partChains(trial, { edits: {}, renderedBy: new Map() })

    const { relations, missing } = placeParts(relating([]), trial, chains, {
      components: ["Root", "Item", "RootContext", "Missing"].map(foundComponent),
      edits: {},
      calls: new Map(),
      listItem: undefined
    })

    expect(relations.get("Item")).toEqual({
      parents: ["Root"],
      parentsFrom: "error",
      alone: "`Item` must be used within `Root`"
    })
    expect(relations.get("Root")).toEqual({})
    expect(relations.get("RootContext")?.visual).toBe(false)
    // Declared in the types but not exported when it runs.
    expect(relations.get("Missing")).toEqual({ visual: false })
    expect(missing).toEqual(["Missing"])
  })

  it("keeps the examples' own use as a sample when it renders there", async () => {
    const library = rootAndItem()
    const examples = readExamples([{ path: "list.tsx", text: `<Root><Item>Inbox</Item></Root>` }], Object.keys(library))
    const trial = await trialOf(library, { examples })
    const chains = partChains(trial, { edits: {}, renderedBy: new Map() })

    const { relations } = placeParts(relating([]), trial, chains, {
      components: ["Root", "Item"].map(foundComponent),
      edits: {},
      calls: new Map(),
      listItem: undefined
    })

    expect(relations.get("Item")).toMatchObject({
      parents: ["Root"],
      parentsFrom: "example",
      sample: { children: ["Inbox"] },
      sampleFrom: "example"
    })
  })
})

describe("retryFailing", () => {
  it("clears the failure of a part that now renders inside its parents, and keeps one that still fails", async () => {
    const trial = await trialOf(rootAndItem())

    const { relations } = retryFailing(
      relating([
        ["Item", { parents: ["Root"], inside: "Failed before its parent had its props." }],
        ["Root", { parents: ["Item"], inside: "`Item` must be used within `Root`" }]
      ]),
      trial
    )

    expect(relations.get("Item")?.inside).toBeUndefined()
    expect(relations.get("Root")?.inside).toBe("`Item` must be used within `Root`")
  })
})

describe("dropLooseProps", () => {
  it("takes a parent's example props off when its parts can't render with them", async () => {
    const CodeContext = React.createContext("plain")

    const library = {
      // With `code`, it draws that code itself, and its lines can't render inside.
      Code: ({ code, children }: LiveObject) =>
        React.createElement(CodeContext.Provider, { value: code ? "code" : "plain" }, children),
      CodeLine: () => {
        if (React.useContext(CodeContext) !== "plain") {
          throw new Error("A line can't render inside highlighted code.")
        }

        return React.createElement("span", null, "line")
      }
    }

    const trial = await trialOf(library)

    const state = relating([
      ["Code", { sample: { props: { code: "const a = 1" } }, sampleFrom: "example" }],
      ["CodeLine", { parents: ["Code"] }]
    ])

    state.loose.set("Code", {})

    const { relations, loose } = dropLooseProps(state, trial)

    expect(relations.get("Code")).toEqual({ sampleFrom: "example" })
    expect(loose.size).toBe(0)
  })
})

describe("followAppErrors", () => {
  it("puts the parent an app error names in the chain, and takes an input's label off", async () => {
    const library = { ...rootAndItem(), Content: () => null, Search: () => null, Edited: () => null }
    const trial = await trialOf(library)
    const chains = partChains(trial, { edits: {}, renderedBy: new Map() })

    const { relations } = followAppErrors(
      relating([
        ["Root", {}],
        ["Item", { parents: ["Root"], parentsFrom: "error" }],
        ["Content", {}],
        ["Search", {}],
        ["Edited", { parents: ["Root"], parentsFrom: "edit" }]
      ]),
      trial,
      chains,
      {
        Content: "`Content` must be used within `Item`",
        Search: "input is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.",
        Edited: "`Edited` must be used within `Item`"
      }
    )

    expect(relations.get("Content")).toEqual({ parents: ["Root", "Item"], parentsFrom: "app" })
    expect(relations.get("Search")).toEqual({ sample: { children: [] } })
    // A hand edit's parents are used as written.
    expect(relations.get("Edited")).toEqual({ parents: ["Root"], parentsFrom: "edit" })
  })
})

describe("completeChains", () => {
  it("starts a chain outside the parents its outermost parent needs, unless they're circular", () => {
    const { relations } = completeChains(
      relating([
        ["MenuTrigger", {}],
        ["Menu", { parents: ["MenuTrigger"], optionalParents: ["MenuTrigger"] }],
        ["MenuSection", { parents: ["Menu"] }],
        ["SubmenuTrigger", { parents: ["MenuSection"] }],
        ["Sheet", { parents: ["SheetTrigger"] }],
        ["SheetTrigger", { parents: ["Sheet"] }]
      ])
    )

    expect(relations.get("SubmenuTrigger")).toEqual({
      parents: ["MenuTrigger", "Menu", "MenuSection"],
      optionalParents: ["MenuTrigger"]
    })
    expect(relations.get("MenuSection")?.parents).toEqual(["MenuTrigger", "Menu"])
    expect(relations.get("Sheet")?.parents).toEqual(["SheetTrigger"])
  })
})

describe("takeSpelledOutChildren", () => {
  it("gives a part the children its parent's sample spells out for it", async () => {
    const library = {
      Table: ({ children }: LiveObject) => React.createElement("table", null, children),
      Row: ({ children }: LiveObject) => React.createElement("tr", null, children),
      Cell: ({ children }: LiveObject) => React.createElement("td", null, children)
    }

    const trial = await trialOf(library)
    const cells = [{ component: "Cell", children: ["Ada"] }]

    const { relations } = takeSpelledOutChildren(
      relating([
        ["Table", { sample: { children: [{ component: "Row", children: cells }] } }],
        ["Row", { parents: ["Table"], inside: "Its text label isn't a cell." }]
      ]),
      trial
    )

    expect(relations.get("Row")).toEqual({ parents: ["Table"], sample: { children: cells } })
  })

  it("finds the children a sample spells out for a part, at any depth", () => {
    const table = [
      { component: "TableHeader", children: [{ component: "Column", children: ["Name"] }] },
      {
        component: "TableBody",
        children: [{ component: "Row" }, { component: "Row", children: [{ component: "Cell", children: ["Ada"] }] }]
      }
    ]

    expect(spelledOut(table, "Row")).toEqual([{ component: "Cell", children: ["Ada"] }])
    expect(spelledOut(table, "Cell")).toEqual(["Ada"])
    expect(spelledOut(table, "Footer")).toBeUndefined()
  })
})

describe("fillParents", () => {
  it("places a family's root with its parts in it, deepest first, but not a part drawn from a list", async () => {
    const list = ({ children }: LiveObject) => React.createElement("div", null, children)
    const library = { Accordion: list, AccordionItem: list, AccordionTrigger: list, Toast: list, ToastTitle: list }
    const trial = await trialOf(library)

    const { relations } = fillParents(
      relating(
        [
          ["Accordion", {}],
          ["AccordionItem", { parents: ["Accordion"] }],
          ["AccordionTrigger", { parents: ["Accordion", "AccordionItem"], sample: { props: { value: "a" } } }],
          ["Toast", {}],
          ["ToastTitle", { parents: ["Toast"] }]
        ],
        new Map([["Toast", new Set<string>()]])
      ),
      trial
    )

    expect(relations.get("Accordion")?.sample).toEqual({
      children: [{ component: "AccordionItem", children: [{ component: "AccordionTrigger", props: { value: "a" } }] }]
    })
    expect(relations.get("Toast")?.sample).toBeUndefined()
  })
})

describe("fitChildren", () => {
  it("gives none to a part that hands its children to an input, and a function to one that calls them", async () => {
    const library = {
      Field: (props: LiveObject) => React.createElement("input", props),
      Validity: ({ children }: LiveObject) => {
        if (!isFunction(children)) {
          throw new TypeError("children is not a function")
        }

        return children("valid")
      }
    }

    const trial = await trialOf(library)

    const { relations } = fitChildren(
      relating([
        ["Field", {}],
        ["Validity", { alone: "children is not a function", inside: "children is not a function" }]
      ]),
      trial
    )

    expect(relations.get("Field")).toEqual({ sample: { children: [] } })
    expect(relations.get("Validity")).toEqual({
      alone: "children is not a function",
      sample: { children: [{ $render: ["Text"] }] }
    })
  })
})

describe("textAsProp", () => {
  it("moves the text of a part whose children must be a string into its prop, there and where it's placed", async () => {
    const library = {
      Card: ({ children }: LiveObject) => React.createElement("div", null, children),
      Highlight: ({ children }: LiveObject) => {
        if (!isText(children)) {
          throw new Error("The children prop of Highlight must be a string")
        }

        return React.createElement("mark", null, children)
      }
    }

    const trial = await trialOf(library)

    const { relations } = textAsProp(
      relating([
        ["Card", { sample: { children: [{ component: "Highlight", children: ["Bulb"] }] } }],
        ["Highlight", { sample: { children: ["Spotlight"] } }]
      ]),
      trial
    )

    expect(relations.get("Highlight")?.sample).toEqual({ props: { children: "Spotlight" } })
    expect(relations.get("Card")?.sample).toEqual({
      children: [{ component: "Highlight", props: { children: "Bulb" } }]
    })
  })
})

describe("dropChildlessParents", () => {
  it("takes parts out of a parent that takes no children, unless a hand edit put them there", () => {
    const { relations } = dropChildlessParents(
      relating([
        ["TreeSelect", { sample: { children: [] } }],
        ["TreeSelectOption", { parents: ["TreeSelect"], optionalParents: ["TreeSelect"], parentsFrom: "prefix" }],
        ["TreeSelectFooter", { parents: ["TreeSelect"], parentsFrom: "edit" }]
      ])
    )

    expect(relations.get("TreeSelectOption")).toEqual({})
    expect(relations.get("TreeSelectFooter")).toEqual({ parents: ["TreeSelect"], parentsFrom: "edit" })
  })
})
