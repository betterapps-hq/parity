import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { findComponents } from "@parity-app/code"
import { describedCategories, describedTokenCss, readDesignTokens } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { checkAnatomy, readAnatomy } from "./anatomy.ts"
import { readExamples } from "./examples.ts"
import { hostedParts, type RenderCall, readRenders, renderedIn } from "./hosts.ts"
import { compareComponents, selectComponents } from "./index.ts"
import { guessParent, relateParts } from "./parts.ts"
import { categorizeVar, cssTokens, pairLineHeights, toDtcg } from "./tokens.ts"

const demo = join(import.meta.dirname, "fixtures/demo").replaceAll("\\", "/")

describe("findComponents", () => {
  const report = findComponents({
    entries: [`${demo}/index.d.ts`],
    root: demo,
    compilerOptions: { baseUrl: demo, paths: { react: ["./react.d.ts"] } }
  })
  const byName = Object.fromEntries(report.components.map((component) => [component.name, component]))

  it("finds functions, forwardRef, memo and class components, and what each was found as", () => {
    expect(report.reactTypes).toBe(true)
    expect(byName.Badge?.as).toBe("function")
    expect(byName.Button?.as).toBe("forwardRef")
    expect(byName.Card?.as).toBe("memo")
    expect(byName.Spacer?.as).toBe("function")
    expect(byName.Legacy?.as).toBe("class")
  })

  it("reads namespace members as Namespace.Member, once per component", () => {
    expect(byName["Dialog.Root"]?.group).toBe("Dialog")
    expect(byName["Dialog.Trigger"]?.as).toBe("forwardRef")
    expect(byName["Dialog.Dialog"]).toBeUndefined()
    expect(byName["Dialog.createDialogScope"]).toBeUndefined()
  })

  it("lists a component exported under two names once, by the shorter name", () => {
    expect(byName.Card).toBeDefined()
    expect(byName.Panel).toBeUndefined()
  })

  it("leaves out hooks, helpers, constants, contexts and other classes, saying why", () => {
    const names = report.components.map((component) => component.name)
    expect(names).not.toContain("useTheme")
    expect(names).not.toContain("FormatDate")
    expect(names).not.toContain("ThemeContext")
    expect(names).not.toContain("ParseError")
    const rejected = Object.fromEntries(report.rejected.map((entry) => [entry.name, entry.reason]))
    expect(rejected.FormatDate).toMatch(/returns string only/)
    expect(rejected.THEME_ID).toMatch(/not a function/)
    expect(rejected.ThemeContext).toMatch(/context/)
    expect(rejected.ParseError).toMatch(/render/)
  })

  it("reports what the types can't decide instead of guessing", () => {
    expect(report.ambiguous).toEqual([{ name: "Loose", reason: expect.stringMatching(/any/) }])
  })

  it("knows which props a component can't render without", () => {
    expect(byName.Badge?.requiredProps).toEqual(["label"])
    expect(byName.Button?.requiredProps).toEqual([])
  })
})

describe("cssTokens", () => {
  const css = `
    :root, :host { --mantine-spacing-md: 1rem; --mantine-font-size-md: 1rem; --mantine-line-height-md: 1.55;
      --mantine-breakpoint-md: 62em; --mantine-color-blue-6: #228be6; --mantine-radius-sm: 4px }
    :root[data-mantine-color-scheme='dark'] { --mantine-color-blue-6: #1c7ed6 }
    @media (prefers-color-scheme: dark) { :root { --surface: #111 } }
    .dark { --primary: oklch(0.9 0 0) }
    :root { --primary: oklch(0.2 0 0); --surface: #fff }
    @theme inline { --color-primary: var(--primary); --text-sm: 0.875rem; --text-sm--line-height: 1.25rem }
    .mantine-Button-root { --button-height: 36px }
  `
  const tokens = new Map(cssTokens(css).map((token) => [token.var, token]))

  it("reads the root, dark themes however they're written, and Tailwind's @theme", () => {
    expect(tokens.get("mantine-color-blue-6")?.values).toEqual({ default: "#228be6", dark: "#1c7ed6" })
    expect(tokens.get("surface")?.values).toEqual({ default: "#fff", dark: "#111" })
    expect(tokens.get("primary")?.values).toEqual({ default: "oklch(0.2 0 0)", dark: "oklch(0.9 0 0)" })
    expect(tokens.get("color-primary")?.values).toEqual({ default: "var(--primary)" })
    expect(tokens.has("button-height")).toBe(false)
  })

  it("puts each token where Parity's controls look for it", () => {
    expect(tokens.get("mantine-spacing-md")?.category).toBe("spacing")
    expect(tokens.get("mantine-breakpoint-md")?.category).toBe("breakpoint")
    expect(tokens.get("mantine-font-size-md")?.category).toBe("font-size")
    expect(tokens.get("mantine-line-height-md")?.category).toBe("leading")
    expect(tokens.get("mantine-radius-sm")?.category).toBe("radius")
    expect(tokens.get("text-sm")?.lineHeight).toBe("1.25rem")
    expect(categorizeVar("spacingHorizontalM", "12px")).toBe("spacing")
    expect(categorizeVar("fontSizeBase300", "14px")).toBe("font-size")
    expect(categorizeVar("mantine-heading-text-wrap", "wrap")).toBe("other")
  })

  it("pairs a font size with the line height of the same step", () => {
    pairLineHeights(tokens)
    expect(tokens.get("mantine-font-size-md")?.lineHeight).toBe("mantine-line-height-md")
  })
})

describe("toDtcg", () => {
  it("writes DTCG that Parity reads back into its categories, with each theme as a context", async () => {
    const document = toDtcg(
      [
        { var: "mui-spacing", category: "spacing", values: { default: "8px" } },
        { var: "spacing", category: "spacing", values: { default: "8px" } },
        { var: "mui-palette-primary-main", category: "color", values: { default: "#1976d2", dark: "#90caf9" } },
        { var: "mui-breakpoint-md", category: "breakpoint", values: { default: "900px" } }
      ],
      "mui-"
    )
    const read = await readDesignTokens(document, async () => ({}))
    const primary = read.find((token) => token.parity?.var === "mui-palette-primary-main")
    expect(primary?.path).toBe("color.primary.main")
    expect(primary?.values).toEqual({ default: "#1976d2", dark: "#90caf9" })
    expect(describedCategories(read)).toEqual({
      "mui-spacing": "spacing",
      spacing: "spacing",
      "mui-palette-primary-main": "color",
      "mui-breakpoint-md": "breakpoint"
    })
    // An 8px step is Parity's `--spacing`, so `p-2` in a design is MUI's `spacing(2)`.
    expect(describedTokenCss(read)).toContain("--spacing: 8px;")
    expect(describedTokenCss(read)).toMatch(/\.dark \{\n {2}--mui-palette-primary-main: #90caf9;/)
  })
})

/** As much of React as the parts test uses; libgen doesn't depend on React's types. */
interface ReactLike {
  createContext(value: boolean): { Provider: unknown; Consumer: unknown }
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useContext(context: unknown): boolean
}

describe("parts", () => {
  // React from a workspace package that depends on it; libgen loads the project's own copy in real use.
  const fromRenderer = createRequire(join(import.meta.dirname, "../../renderer-react/package.json"))
  const load = async (specifier: string) =>
    (await import(pathToFileURL(fromRenderer.resolve(specifier)).href)) as Record<string, unknown>

  it("places each part inside what its error names, nearest last, and keeps samples that make it render", async () => {
    const React = (await load("react")) as unknown as ReactLike
    const AccordionContext = React.createContext(false)
    const ItemContext = React.createContext(false)
    const library = {
      Accordion: ({ children }: { children?: unknown }) =>
        React.createElement(AccordionContext.Provider, { value: true }, children),
      AccordionItem: ({ children }: { children?: unknown }) => {
        if (!React.useContext(AccordionContext)) throw new Error("`AccordionItem` must be used within `Accordion`")
        return React.createElement(ItemContext.Provider, { value: true }, children)
      },
      AccordionTrigger: () => {
        if (!React.useContext(ItemContext)) throw new Error("`AccordionTrigger` must be used within `AccordionItem`")
        return React.createElement("button", null, "Open")
      },
      Badge: () => React.createElement("span", null, "New"),
      BadgeContext: AccordionContext.Consumer
    }
    const loadLibrary = async (specifier: string) => (specifier === "demo" ? library : load(specifier))
    const found = (name: string) =>
      ({ name, export: name, samples: {} }) as unknown as Parameters<typeof relateParts>[2][number]
    const { relations, tried } = await relateParts(
      loadLibrary,
      "demo",
      ["Accordion", "AccordionItem", "AccordionTrigger", "Badge", "BadgeContext"].map(found)
    )
    expect(tried).toBe(true)
    expect(relations.get("AccordionTrigger")).toMatchObject({
      parents: ["Accordion", "AccordionItem"],
      parentsFrom: "error",
      alone: expect.stringMatching(/must be used within/)
    })
    expect(relations.get("AccordionTrigger")?.inside).toBeUndefined()
    expect(relations.get("Badge")?.parents).toBeUndefined()
    expect(relations.get("BadgeContext")?.visual).toBe(false)
    // A family's root is placed with its parts in it.
    expect(relations.get("Accordion")?.sample?.children).toEqual([
      { component: "AccordionItem", children: [{ component: "AccordionTrigger" }] }
    ])
  })

  it("takes the chain the examples show when the error names nothing, and leaves out where they happen to be", async () => {
    const React = (await load("react")) as unknown as ReactLike
    const MenuContext = React.createContext(false)
    const SubContext = React.createContext(false)
    const missing = () => {
      throw new Error("Context is missing.")
    }
    const library = {
      Menu: ({ children }: { children?: unknown }) =>
        React.createElement(MenuContext.Provider, { value: true }, children),
      MenuContent: ({ children }: { children?: unknown }) => (React.useContext(MenuContext) ? children : missing()),
      MenuSub: ({ children }: { children?: unknown }) =>
        React.useContext(MenuContext) ? React.createElement(SubContext.Provider, { value: true }, children) : missing(),
      MenuSubTrigger: () => (React.useContext(SubContext) ? React.createElement("button", null, "More") : missing()),
      Card: ({ children }: { children?: unknown }) => React.createElement("div", null, children),
      Badge: () => React.createElement("span", null, "New")
    }
    const names = Object.keys(library)
    const uses = readExamples(
      [
        {
          path: "menu-demo.tsx",
          text: `<Card><Badge /><Menu><MenuContent><MenuSub><MenuSubTrigger>More</MenuSubTrigger></MenuSub></MenuContent></Menu></Card>`
        },
        { path: "badge-demo.tsx", text: `<Card><Badge /></Card>` }
      ],
      names
    )
    const { relations } = await relateParts(
      async (specifier) => (specifier === "demo" ? library : load(specifier)),
      "demo",
      names.map(
        (name) => ({ name, export: name, samples: {} }) as unknown as Parameters<typeof relateParts>[2][number]
      ),
      [],
      {},
      uses
    )
    expect(relations.get("MenuSubTrigger")).toMatchObject({
      parents: ["Menu", "MenuContent", "MenuSub"],
      parentsFrom: "example"
    })
    expect(relations.get("MenuSubTrigger")?.inside).toBeUndefined()
    // Badge draws alone, so the cards the examples put it in aren't its parents.
    expect(relations.get("Badge")?.parents).toBeUndefined()
  })

  it("places a part that needs the parts around it, and a collection's item that only draws a placeholder alone", async () => {
    const React = (await load("react")) as unknown as ReactLike
    const TableContext = React.createContext(false)
    // Like React Aria: an item outside its collection draws a placeholder, and a body needs a header beside it.
    const library = {
      Table: ({ children }: { children?: unknown[] }) => {
        const header = ([] as unknown[])
          .concat(children)
          .some((child) => (child as { type?: unknown })?.type === library.TableHeader)
        return React.createElement(TableContext.Provider, { value: header }, children)
      },
      TableHeader: ({ children }: { children?: unknown }) => React.createElement("thead", null, children),
      TableBody: ({ children }: { children?: unknown }) => {
        if (!React.useContext(TableContext)) throw new Error("Cannot read properties of undefined (reading 'key')")
        return React.createElement("tbody", null, children)
      },
      Column: () => React.createElement("th", null, "Name"),
      Row: ({ children }: { children?: unknown }) =>
        React.useContext(TableContext) ? React.createElement("tr", null, children) : React.createElement("item", null)
    }
    const names = Object.keys(library)
    const table = `<Table><TableHeader><Column>Name</Column></TableHeader><TableBody><Row>Ada</Row></TableBody></Table>`
    const uses = readExamples(
      ["a", "b"].map((path) => ({ path: `${path}.tsx`, text: table })),
      names
    )
    const { relations } = await relateParts(
      async (specifier) => (specifier === "demo" ? library : load(specifier)),
      "demo",
      names.map(
        (name) => ({ name, export: name, samples: {} }) as unknown as Parameters<typeof relateParts>[2][number]
      ),
      [],
      {},
      uses
    )
    expect(relations.get("Row")).toMatchObject({
      parents: ["Table", "TableBody"],
      parentsFrom: "example",
      parentParts: true,
      alone: expect.stringMatching(/placeholder/)
    })
    expect(relations.get("Row")?.inside).toBeUndefined()
  })

  it("marks levels some examples leave out, and it renders without, as optional", async () => {
    const React = (await load("react")) as unknown as ReactLike
    const MenuContext = React.createContext(false)
    const ContentContext = React.createContext(false)
    const library = {
      Menu: ({ children }: { children?: unknown }) =>
        React.createElement(MenuContext.Provider, { value: true }, children),
      MenuContent: ({ children }: { children?: unknown }) => {
        if (!React.useContext(MenuContext)) throw new Error("Context is missing.")
        return React.createElement(ContentContext.Provider, { value: true }, children)
      },
      MenuGroup: ({ children }: { children?: unknown }) => React.createElement("div", null, children),
      MenuItem: () => {
        if (!React.useContext(ContentContext)) throw new Error("Context is missing.")
        return React.createElement("div", null, "Copy")
      }
    }
    const names = Object.keys(library)
    const menu = (inner: string) => `<Menu><MenuContent>${inner}</MenuContent></Menu>`
    const uses = readExamples(
      [
        { path: "a.tsx", text: menu(`<MenuGroup><MenuItem>Copy</MenuItem></MenuGroup>`) },
        { path: "b.tsx", text: menu(`<MenuGroup><MenuItem>Paste</MenuItem></MenuGroup>`) },
        { path: "c.tsx", text: menu(`<MenuItem>Cut</MenuItem>`) }
      ],
      names
    )
    const { relations } = await relateParts(
      async (specifier) => (specifier === "demo" ? library : load(specifier)),
      "demo",
      names.map(
        (name) => ({ name, export: name, samples: {} }) as unknown as Parameters<typeof relateParts>[2][number]
      ),
      [],
      {},
      uses
    )
    expect(relations.get("MenuItem")).toMatchObject({
      parents: ["Menu", "MenuContent", "MenuGroup"],
      optionalParents: ["MenuGroup"],
      parentsFrom: "example"
    })
  })

  it("places a part no example shows where the package renders it, and calls a parent's function children", async () => {
    const React = (await load("react")) as unknown as ReactLike & { createContext: ReactLike["createContext"] }
    const Positioner = React.createContext(false)
    const Segments = React.createContext(false)
    const library = {
      Select: ({ children }: { children?: unknown }) => React.createElement("div", null, children),
      SelectContent: ({ children }: { children?: unknown }) =>
        React.createElement(Positioner.Provider, { value: true }, children),
      SelectScrollUpButton: () => {
        if (!React.useContext(Positioner)) throw new Error("Context is missing.")
        return React.createElement("button", null, "Up")
      },
      DateInput: ({ children }: { children?: unknown }) => {
        if (typeof children !== "function") throw new Error("children is not a function")
        return React.createElement(
          Segments.Provider,
          { value: true },
          (children as (segment: string) => unknown)("day")
        )
      },
      DateSegment: ({ segment }: { segment?: string }) => {
        if (!React.useContext(Segments) || !segment) throw new Error("DateSegment needs a segment")
        return React.createElement("span", null, segment)
      }
    }
    const names = Object.keys(library)
    const uses = readExamples(
      [{ path: "date.tsx", text: `<DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>` }],
      names
    )
    const { relations } = await relateParts(
      async (specifier) => (specifier === "demo" ? library : load(specifier)),
      "demo",
      names.map(
        (name) => ({ name, export: name, samples: {} }) as unknown as Parameters<typeof relateParts>[2][number]
      ),
      [],
      {},
      uses,
      new Map([["SelectScrollUpButton", ["SelectContent"]]])
    )
    expect(relations.get("SelectScrollUpButton")).toMatchObject({ parents: ["SelectContent"], parentsFrom: "source" })
    expect(relations.get("SelectScrollUpButton")?.inside).toBeUndefined()
    expect(relations.get("DateInput")?.sample?.children).toEqual([
      { $render: [{ component: "DateSegment" }], pass: ["segment"] }
    ])
    expect(relations.get("DateSegment")).toMatchObject({ parents: ["DateInput"], parentsFrom: "example" })
    expect(relations.get("DateSegment")?.inside).toBeUndefined()
  })

  it("checks chains against the docs' anatomy", () => {
    const docs = [
      {
        path: "menu.mdx",
        text: [
          "# Menu",
          "## Anatomy",
          "```jsx",
          'import { Menu } from "lib"',
          "<Menu.Root><Menu.Portal><Menu.Popup><Menu.Item /><Menu.Group><Menu.GroupLabel /></Menu.Group></Menu.Popup></Menu.Portal></Menu.Root>",
          "```",
          "## Examples",
          "```jsx",
          "<Card><Menu.Item /></Card>",
          "```"
        ].join("\n")
      }
    ]
    const names = ["Card", "Menu.Root", "Menu.Portal", "Menu.Popup", "Menu.Item", "Menu.Group", "Menu.GroupLabel"]
    const anatomy = readAnatomy(docs, names)
    expect(anatomy.get("Menu.Item")).toEqual([["Menu.Popup", "Menu.Portal", "Menu.Root"]])
    const check = checkAnatomy(anatomy, {
      "Menu.Root": {},
      "Menu.Portal": { parents: ["Menu.Root"] },
      "Menu.Popup": { parents: ["Menu.Root", "Menu.Portal"] },
      "Menu.Item": { parents: ["Menu.Root", "Menu.Popup"] },
      "Menu.Group": { parents: ["Menu.Root", "Menu.Item"] },
      "Menu.GroupLabel": { parents: ["Menu.Root", "Menu.Portal", "Menu.Popup", "Menu.Group"] }
    })
    // Portals aren't counted either way: chains leave them out on purpose.
    expect(check).toMatchObject({ parts: 5, placed: 4, complete: 4 })
    expect(check.differ).toEqual([
      { name: "Menu.Group", docs: ["Menu.Root", "Menu.Popup"], file: ["Menu.Root", "Menu.Item"] }
    ])
  })

  it("finds the parts only a decorator's host renders", async () => {
    const dir = await mkdtemp(join(tmpdir(), "parity-hosts-"))
    await mkdir(join(dir, "dist"))
    await writeFile(
      join(dir, "dist", "toast.js"),
      `import { jsx as _jsx } from "react/jsx-runtime"
      function Toast(props) { return _jsx(Primitive.Root, props) }
      function ToastTitle(props) { return _jsx(Primitive.Title, props) }
      function Button(props) { return _jsx("button", props) }
      function ToastList() { return toasts.map((t) => _jsx(Toast, { children: [_jsx(ToastTitle, {}), _jsx(Button, {})] })) }
      function Toaster() { return _jsx(ToastList, {}) }
      function Card() { return _jsx(Button, {}) }
      export { Toast, ToastTitle, Button, ToastList, Toaster, Card }`
    )
    try {
      const names = ["Toast", "ToastTitle", "Button", "ToastList", "Toaster", "Card"]
      const renders = await readRenders(dir, names)
      // Button is rendered by a Card too, so people place it.
      expect(hostedParts(renders, ["Toaster"], names)).toEqual(["Toast", "ToastTitle", "ToastList"])
      expect(renderedIn(renders).get("Button")).toEqual(["ToastList", "Card"])
      // What each render passes: the owner's own props by name, values, and what's worked out.
      await writeFile(
        join(dir, "dist", "chart.js"),
        `function ChartContainer({ id, config, ...props }) { const chartId = id ?? "x"; return _jsx(ChartStyle, { id: chartId, config, size: 2, theme: props.theme }) }
        function ChartStyle({ id, config }) { return _jsx("style", {}) }
        export { ChartContainer, ChartStyle }`
      )
      const calls = new Map<string, RenderCall[]>()
      await readRenders(dir, ["ChartContainer", "ChartStyle"], calls)
      expect(calls.get("ChartStyle")).toEqual([
        {
          owner: "ChartContainer",
          props: {
            id: { computed: true },
            config: { forward: "config" },
            size: { value: 2 },
            theme: { forward: "theme" }
          }
        }
      ])
      // A list's items it passes, the parts it puts inside, and the values a factory makes that it exports.
      await writeFile(
        join(dir, "dist", "toast.js"),
        `const toast = Primitive.createToastManager()
        function ToastList() {
          const { toasts } = Primitive.useToastManager()
          return toasts.map((item) => _jsx(Toast, { toast: item, children: _jsxs(ToastContent, { children: [_jsxs("div", { children: [_jsx(ToastTitle, {})] }), item.action && _jsx(ToastClose, {})] }) }))
        }
        export { toast, Toast, ToastContent, ToastTitle, ToastClose }`
      )
      const toastCalls = new Map<string, RenderCall[]>()
      const made = new Set<string>()
      await readRenders(dir, ["Toast", "ToastContent"], toastCalls, made)
      expect(made).toEqual(new Set(["toast"]))
      expect(toastCalls.get("Toast")).toEqual([
        {
          owner: "ToastList",
          props: { toast: { item: true } },
          children: [
            { component: "ToastContent", children: [{ component: "ToastTitle" }, { component: "ToastClose" }] }
          ]
        }
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("guesses a parent from a namespace, a shared prefix or a plural", () => {
    const names = ["Dialog.Root", "Dialog.Title", "Card", "CardHeader", "Tabs", "Tab"]
    expect(guessParent("Dialog.Title", names)).toEqual(["Dialog.Root", "namespace"])
    expect(guessParent("CardHeader", names)).toEqual(["Card", "prefix"])
    expect(guessParent("TabPanels", ["Tab", "Tabs", "TabPanels"])).toEqual(["Tabs", "prefix"])
    expect(guessParent("Tab", names)).toEqual(["Tabs", "prefix"])
    expect(guessParent("Card", names)).toEqual([undefined, undefined])
  })
})

describe("regenerating", () => {
  const before = {
    Button: { as: "function", fingerprint: "a", props: { "size?": "111111", variant: "222222" } },
    Old: { as: "function", fingerprint: "b" },
    Card: { as: "function", fingerprint: "c" }
  } as const
  const after = {
    Button: { as: "forwardRef", fingerprint: "d", props: { "size?": "333333", "tone?": "444444" } },
    Card: { as: "function", fingerprint: "c" },
    Chip: { as: "function", fingerprint: "e" }
  } as const

  it("reports new, changed (props added, removed and retyped), removed and unchanged components", () => {
    expect(compareComponents(before, after)).toEqual({
      added: ["Chip"],
      changed: [
        { name: "Button", added: ["tone"], removed: ["variant"], retyped: ["size"], as: "function to forwardRef" }
      ],
      removed: ["Old"],
      unchanged: 1
    })
  })

  it("writes everything, only the new ones, or the named ones over the old file", () => {
    const changes = compareComponents(before, after)
    expect(Object.keys(selectComponents(before, after, changes, "all"))).toEqual(["Button", "Card", "Chip"])
    expect(selectComponents(before, after, changes, "new")).toEqual({
      Button: before.Button,
      Card: before.Card,
      Chip: after.Chip
    })
    expect(selectComponents(before, after, changes, ["Button"]).Button).toEqual(after.Button)
  })
})
