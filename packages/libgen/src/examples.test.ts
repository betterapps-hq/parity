import { describe, expect, it } from "vitest"
import {
  exampleItem,
  exampleLevels,
  familyOf,
  familySample,
  nearestParent,
  normalizeRepo,
  readExamples
} from "./examples.ts"

describe("whole paths", () => {
  const menu = (inner: string) =>
    `<Card><DropdownMenu><DropdownMenuContent>${inner}</DropdownMenuContent></DropdownMenu></Card>`
  const names = ["Card", "DropdownMenu", "DropdownMenuContent", "DropdownMenuGroup", "DropdownMenuItem"]

  it("finds every level most uses are inside, at any depth, with levels some leave out", () => {
    const files = [
      { path: "a.tsx", text: menu(`<DropdownMenuGroup><DropdownMenuItem>Copy</DropdownMenuItem></DropdownMenuGroup>`) },
      {
        path: "b.tsx",
        text: menu(`<DropdownMenuGroup><DropdownMenuItem>Paste</DropdownMenuItem></DropdownMenuGroup>`)
      },
      { path: "c.tsx", text: menu(`<DropdownMenuItem>Cut</DropdownMenuItem>`) }
    ]
    const uses = readExamples(files, names)
    expect(exampleLevels(uses, "DropdownMenuItem", false)).toEqual([
      { parent: "Card", share: 1 },
      { parent: "DropdownMenu", share: 1 },
      { parent: "DropdownMenuContent", share: 1 },
      { parent: "DropdownMenuGroup", share: 2 / 3 }
    ])
    // Its own family only, for a part that draws alone.
    expect(exampleLevels(uses, "DropdownMenuItem", true)?.map((level) => level.parent)).toEqual([
      "DropdownMenu",
      "DropdownMenuContent",
      "DropdownMenuGroup"
    ])
  })

  it("leaves out a level fewer than half have", () => {
    const files = [
      { path: "a.tsx", text: menu(`<DropdownMenuGroup><DropdownMenuItem>Copy</DropdownMenuItem></DropdownMenuGroup>`) },
      { path: "b.tsx", text: menu(`<DropdownMenuItem>Paste</DropdownMenuItem>`) },
      { path: "c.tsx", text: menu(`<DropdownMenuItem>Cut</DropdownMenuItem>`) }
    ]
    const levels = exampleLevels(readExamples(files, names), "DropdownMenuItem", true)
    expect(levels?.map((level) => level.parent)).toEqual(["DropdownMenu", "DropdownMenuContent"])
  })
})

describe("counting and render functions", () => {
  it("counts each way a file places a component once", () => {
    const long = `<Card>${"<Menu><MenuItem /></Menu>".repeat(10)}</Card>`
    const uses = readExamples(
      [
        { path: "long.tsx", text: long },
        { path: "a.tsx", text: "<Toolbar><MenuItem /></Toolbar>" },
        { path: "b.tsx", text: "<Toolbar><MenuItem /></Toolbar>" }
      ],
      ["Card", "Menu", "MenuItem", "Toolbar"]
    )
    expect(uses.get("MenuItem")?.parents).toEqual(
      new Map([
        ["Menu", 1],
        ["Toolbar", 2]
      ])
    )
  })

  it("keeps elements given as a prop's value", () => {
    const text = `<FormControlLabel control={<Checkbox defaultChecked />} label="Remember me" />`
    const uses = readExamples([{ path: "demo.tsx", text }], ["FormControlLabel", "Checkbox"])
    expect(uses.get("FormControlLabel")?.sample?.props).toEqual({
      control: { $element: [{ component: "Checkbox", props: { defaultChecked: true } }] },
      label: "Remember me"
    })
    // A prop's element isn't placed in the component whose prop it is.
    expect(uses.get("Checkbox")).toMatchObject({ topLevel: 1 })
  })

  it("keeps render props and function children, with what they're called with", () => {
    const text = `
      <Autocomplete renderInput={(params) => <TextField {...params} label="Fruit" />} getOptionLabel={(o) => o.label} />
      <DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>`
    const uses = readExamples([{ path: "demo.tsx", text }], ["Autocomplete", "TextField", "DateInput", "DateSegment"])
    expect(uses.get("Autocomplete")?.sample?.props).toEqual({
      renderInput: { $render: [{ component: "TextField", props: { label: "Fruit" } }], spread: true }
    })
    expect(uses.get("DateInput")?.sample?.children).toEqual([
      { $render: [{ component: "DateSegment" }], pass: ["segment"] }
    ])
  })
})

describe("lists a hook returns", () => {
  const names = ["Toast.Viewport", "Toast.Root", "Toast.Title", "Select.Item"]

  it("marks parts every example draws from a hook's list, and not their container", () => {
    const text = `function List() {
      const { toasts } = Toast.useToastManager()
      const [items] = useState(["a"])
      return (
        <Toast.Viewport>
          {toasts.map((toast) => <Toast.Root key={toast.id} toast={toast}><Toast.Title /></Toast.Root>)}
          {items.map((item) => <Select.Item key={item}>{item}</Select.Item>)}
        </Toast.Viewport>
      )
    }`
    const uses = readExamples([{ path: "a.tsx", text }], names)
    expect(uses.get("Toast.Root")?.fromHook).toBe(true)
    expect(uses.get("Toast.Title")?.fromHook).toBe(true)
    expect(uses.get("Toast.Viewport")?.fromHook).toBe(false)
    // useState holds the example's own values.
    expect(uses.get("Select.Item")?.fromHook).toBe(false)
  })

  it("follows the example's own component a hook's list is mapped into", () => {
    const text = `function List() {
      const { toasts } = Toast.useToastManager()
      return toasts.map((toast) => <MyToast key={toast.id} toast={toast} />)
    }
    function MyToast({ toast }) {
      return <Toast.Root toast={toast}><Toast.Title /></Toast.Root>
    }`
    const uses = readExamples([{ path: "a.tsx", text }], names)
    expect(uses.get("Toast.Root")?.fromHook).toBe(true)
    expect(uses.get("Toast.Title")?.fromHook).toBe(true)
  })

  it("samples the item the example hands the hook's manager, with an id when it's keyed by one", () => {
    const text = `function Button() {
      const manager = Toast.useToastManager()
      const kind = "Draft"
      return <button onClick={() => manager.add({ title: \`\${kind} saved\`, description: "Saved", count: \`\${n}\` })} />
    }
    function List() {
      const { toasts } = Toast.useToastManager()
      return <Toast.Viewport>{toasts.map((toast) => <MyToast key={toast.id} toast={toast} />)}</Toast.Viewport>
    }
    function MyToast({ toast }) {
      return <Toast.Root toast={toast}><Toast.Title /></Toast.Root>
    }`
    const uses = readExamples([{ path: "a.tsx", text }], names)
    // A template is kept when the file spells out every part of it.
    const toast = { id: "1", title: "Draft saved", description: "Saved" }
    expect(uses.get("Toast.Root")?.sample).toEqual({ props: { toast }, children: [{ component: "Toast.Title" }] })
  })

  it("finds the item examples hand a value the package makes", () => {
    const files = [
      { path: "a.tsx", text: `toast.add({ description: "Saved" })` },
      { path: "b.tsx", text: `toast.add({ title: "Event created", description: "Sunday" }); table.set({ id: "x" })` }
    ]
    expect(exampleItem(files, new Set(["toast"]))).toEqual({ title: "Event created", description: "Sunday" })
    expect(exampleItem(files, new Set())).toBeUndefined()
  })

  it("doesn't mark a part some example places itself", () => {
    const files = [
      { path: "a.tsx", text: `const { toasts } = useToasts(); toasts.map((t) => <Toast.Root />)` },
      { path: "b.tsx", text: `<Toast.Root />` }
    ]
    expect(readExamples(files, names).get("Toast.Root")?.fromHook).toBe(false)
  })
})

describe("values in samples", () => {
  it("binds each part to the first item of a list a factory or hook was given", () => {
    const text = `
      const frameworks = createListCollection({ items: [{ label: "React", value: "react" }] })
      const Basic = () => <Select.Root collection={frameworks}>{frameworks.items.map((item) => <Select.Item item={item} key={item.value}>{item.label}</Select.Item>)}</Select.Root>
      function Filtered() {
        const { collection } = useListCollection({ initialItems: [{ label: "Vue", value: "vue" }] })
        return collection.items.map((item) => <Combobox.Item item={item}>{item.label}</Combobox.Item>)
      }`
    const uses = readExamples([{ path: "a.tsx", text }], ["Select.Root", "Select.Item", "Combobox.Item"])
    expect(uses.get("Select.Item")?.sample).toEqual({
      props: { item: { label: "React", value: "react" } },
      children: ["React"]
    })
    expect(uses.get("Combobox.Item")?.sample).toEqual({
      props: { item: { label: "Vue", value: "vue" } },
      children: ["Vue"]
    })
    // The collection itself isn't its options, so the prop given it is left out.
    expect(uses.get("Select.Root")?.sample?.props).toBeUndefined()
  })

  it("reads spreads the file spells out", () => {
    const text = `
      const base = { size: "sm", tone: "muted" }
      const sizes = ["sm", "md"]
      const x = <Badge {...base} tone="loud" items={[...sizes, "lg"]} extra={{ ...base, size: "lg" }} />`
    const uses = readExamples([{ path: "a.tsx", text }], ["Badge"])
    expect(uses.get("Badge")?.sample?.props).toEqual({
      size: "sm",
      tone: "loud",
      items: ["sm", "md", "lg"],
      extra: { size: "lg", tone: "muted" }
    })
  })

  it("resolves names the file declares, useState's value and mapped lists", () => {
    const text = `
      const chartConfig = { desktop: { label: "Desktop", color: "var(--chart-1)", icon: Monitor } } satisfies ChartConfig
      const fruits = [{ value: "apple", label: "Apple" }, { value: "pear", label: "Pear" }] as const
      export function Demo() {
        const [open, setOpen] = React.useState(true)
        return (
          <ChartContainer config={chartConfig} onClick={() => setOpen(false)}>
            <Select open={open} items={fruits}>
              {fruits.map(({ value, label }) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </Select>
          </ChartContainer>
        )
      }`
    const uses = readExamples([{ path: "demo.tsx", text }], ["ChartContainer", "Select", "SelectItem"])
    expect(uses.get("ChartContainer")?.sample?.props).toEqual({
      config: { desktop: { label: "Desktop", color: "var(--chart-1)" } }
    })
    expect(uses.get("Select")?.sample).toEqual({
      props: {
        open: true,
        items: [
          { value: "apple", label: "Apple" },
          { value: "pear", label: "Pear" }
        ]
      },
      children: [
        { component: "SelectItem", props: { value: "apple" }, children: ["Apple"] },
        { component: "SelectItem", props: { value: "pear" }, children: ["Pear"] }
      ]
    })
    expect(uses.get("SelectItem")?.parents).toEqual(new Map([["Select", 1]]))
  })

  it("shows a list it can't read once, and an element a condition renders", () => {
    const text = `<Menu>{items.map((item) => <MenuItem>{item.label}</MenuItem>)}{open && <MenuSeparator />}</Menu>`
    const uses = readExamples([{ path: "menu.tsx", text }], ["Menu", "MenuItem", "MenuSeparator"])
    expect(uses.get("Menu")?.sample?.children).toEqual([{ component: "MenuItem" }, { component: "MenuSeparator" }])
  })
})

const dialog = `
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"

export function DialogDemo() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
        <Field><DialogTitle size="sm">Inside a field</DialogTitle></Field>
        <DialogFooter>
          <button>Save changes</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
`

describe("reading examples", () => {
  it("counts each component's nearest library parent", () => {
    const uses = readExamples(
      [{ path: "dialog-demo.tsx", text: dialog }],
      ["Dialog", "DialogContent", "DialogFooter", "DialogTitle", "Field"]
    )
    expect(uses.get("Dialog")).toMatchObject({ count: 1, topLevel: 1 })
    expect(uses.get("DialogContent")?.parents).toEqual(new Map([["Dialog", 1]]))
    expect(uses.get("DialogTitle")?.parents).toEqual(
      new Map([
        ["DialogContent", 1],
        ["Field", 1]
      ])
    )
  })

  it("keeps the fullest use as a sample, with literal props, text and its own family's parts", () => {
    const uses = readExamples(
      [{ path: "dialog-demo.tsx", text: dialog }],
      ["Dialog", "DialogContent", "DialogFooter", "DialogTitle", "Field"]
    )
    expect(uses.get("Dialog")?.sample).toEqual({
      props: { open: true },
      children: [
        {
          component: "DialogContent",
          children: [
            { component: "DialogTitle", children: ["Edit profile"] },
            { component: "DialogFooter", children: ["Save changes"] }
          ]
        }
      ]
    })
  })

  it("matches namespaced tags to flat names and leaves JSX passed in props unplaced", () => {
    const text = `<Menu.Root><Menu.Item>Copy</Menu.Item><Chart.Tooltip content={<Chart.TooltipContent />} /></Menu.Root>`
    const uses = readExamples(
      [{ path: "menu.stories.tsx", text }],
      ["MenuRoot", "MenuItem", "Chart.Tooltip", "Chart.TooltipContent"]
    )
    expect(uses.get("MenuItem")?.parents).toEqual(new Map([["MenuRoot", 1]]))
    expect(uses.get("Chart.TooltipContent")).toMatchObject({ count: 1, topLevel: 1 })
  })
})

describe("nearest parents", () => {
  const use = (parents: [string, number][], topLevel = 0) => ({
    count: parents.reduce((sum, [, count]) => sum + count, topLevel),
    topLevel,
    parents: new Map(parents),
    paths: [] as string[][],
    usePaths: [] as string[][],
    sampleSize: 0,
    fromHook: false
  })

  it("takes the parent at least half the uses agree on", () => {
    const uses = new Map([
      [
        "SelectItem",
        use([
          ["SelectGroup", 6],
          ["SelectContent", 3]
        ])
      ]
    ])
    expect(nearestParent(uses, "SelectItem", false)).toMatchObject({ parent: "SelectGroup", uses: 9 })
  })

  it("decides nothing when most uses have no parent or none agree", () => {
    const top = new Map([["Button", use([["CardFooter", 2]], 5)]])
    expect(nearestParent(top, "Button", false)).toBeUndefined()
    const split = new Map([
      [
        "Input",
        use([
          ["Field", 2],
          ["InputGroup", 2],
          ["CardContent", 2]
        ])
      ]
    ])
    expect(nearestParent(split, "Input", false)).toBeUndefined()
  })

  it("keeps to the part's own family when asked", () => {
    const uses = new Map([
      [
        "Dialog.Title",
        use([
          ["Field.Root", 6],
          ["Dialog.Popup", 6]
        ])
      ]
    ])
    expect(nearestParent(uses, "Dialog.Title", false)?.parent).toBe("Field.Root")
    expect(nearestParent(uses, "Dialog.Title", true)?.parent).toBe("Dialog.Popup")
  })
})

describe("families", () => {
  it("names a family by namespace, else the first word", () => {
    expect(familyOf("Dialog.Title")).toBe("Dialog")
    expect(familyOf("DropdownMenuSubTrigger")).toBe("Dropdown")
    expect(familyOf("Select")).toBe("Select")
    // A plural is its singular's family; a word that ends in "ss" isn't a plural.
    expect(familyOf("Tabs")).toBe(familyOf("TabList"))
    expect(familyOf("ProgressBar")).toBe("Progress")
  })

  it("takes in the parts the examples only place inside a family, so its sample keeps them", () => {
    const table = `<Table><TableHeader><Column>Name</Column></TableHeader><TableBody><Row><Cell>Ada</Cell></Row></TableBody></Table>`
    const files = ["a", "b"].map((path) => ({ path: `${path}.tsx`, text: table }))
    const uses = readExamples(files, ["Table", "TableHeader", "TableBody", "Column", "Row", "Cell"])
    expect(uses.get("Table")?.sample).toEqual({
      children: [
        { component: "TableHeader", children: [{ component: "Column", children: ["Name"] }] },
        {
          component: "TableBody",
          children: [{ component: "Row", children: [{ component: "Cell", children: ["Ada"] }] }]
        }
      ]
    })
  })

  it("leaves out a sample prop only one of a part's many uses sets", () => {
    const cells = [
      `<Cell colSpan={2}>Wide cell text</Cell>`,
      ...[1, 2, 3, 4].map((n) => `<Cell id="c${n}">Cell</Cell>`)
    ]
    const files = cells.map((text, index) => ({ path: `${index}.tsx`, text: `<Row>${text}</Row>` }))
    const uses = readExamples(files, ["Row", "Cell"])
    expect(uses.get("Cell")?.sample).toEqual({ children: ["Wide cell text"] })
  })

  it("places the library's part where the example places its own wrapper of it", () => {
    const text = `
      const CustomTab = (props) => <Tab {...props} />
      function Item({ title }) { return <TreeItem textValue={title}><TreeItemContent>Leaf</TreeItemContent></TreeItem> }
      export const Example = () => (
        <Tabs><TabList><CustomTab id="a">Alpha</CustomTab></TabList><Tree><Item title="Docs" /></Tree></Tabs>
      )`
    const uses = readExamples(
      [{ path: "a.tsx", text }],
      ["Tabs", "TabList", "Tab", "Tree", "TreeItem", "TreeItemContent"]
    )
    expect(uses.get("Tab")?.paths).toEqual([["TabList", "Tabs"]])
    expect(uses.get("Tab")?.topLevel).toBe(0)
    expect(uses.get("TabList")?.sample).toEqual({
      children: [{ component: "Tab", props: { id: "a" }, children: ["Alpha"] }]
    })
    // One that doesn't hand its props on is sampled from its own element.
    expect(uses.get("TreeItem")?.paths).toEqual([["Tree", "Tabs"]])
    expect(uses.get("Tree")?.sample).toEqual({
      children: [{ component: "TreeItem", children: [{ component: "TreeItemContent", children: ["Leaf"] }] }]
    })
  })

  it("turns other families' components in a sample into nothing, keeping text", () => {
    const sample = familySample(
      {
        children: [
          "Pick one",
          { component: "SelectTrigger", children: [{ component: "Badge", children: ["New"] }, "Fruit"] },
          { component: "Field" }
        ]
      },
      "Select"
    )
    expect(sample).toEqual({ children: ["Pick one", { component: "SelectTrigger", children: ["Fruit"] }] })
  })
})

describe("repository urls", () => {
  it("reads the forms package.json uses", () => {
    expect(normalizeRepo("git+https://github.com/radix-ui/primitives.git")).toBe(
      "https://github.com/radix-ui/primitives"
    )
    expect(normalizeRepo("github:mui/material-ui")).toBe("https://github.com/mui/material-ui")
    expect(normalizeRepo("mantinedev/mantine")).toBe("https://github.com/mantinedev/mantine")
    expect(normalizeRepo("git+ssh://git@github.com/adobe/react-spectrum.git")).toBe(
      "https://github.com/adobe/react-spectrum"
    )
    expect(normalizeRepo(undefined)).toBeUndefined()
  })
})
