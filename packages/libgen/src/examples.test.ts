import { describe, expect, it } from "vitest"
import { familyOf, familySample, nearestParent, normalizeRepo, readExamples } from "./examples.ts"

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
    sampleSize: 0
  })

  it("takes the parent at least half the uses agree on", () => {
    const uses = new Map([["SelectItem", use([["SelectGroup", 6], ["SelectContent", 3]])]])
    expect(nearestParent(uses, "SelectItem", false)).toMatchObject({ parent: "SelectGroup", uses: 9 })
  })

  it("decides nothing when most uses have no parent or none agree", () => {
    const top = new Map([["Button", use([["CardFooter", 2]], 5)]])
    expect(nearestParent(top, "Button", false)).toBeUndefined()
    const split = new Map([["Input", use([["Field", 2], ["InputGroup", 2], ["CardContent", 2]])]])
    expect(nearestParent(split, "Input", false)).toBeUndefined()
  })

  it("keeps to the part's own family when asked", () => {
    const uses = new Map([["Dialog.Title", use([["Field.Root", 6], ["Dialog.Popup", 6]])]])
    expect(nearestParent(uses, "Dialog.Title", false)?.parent).toBe("Field.Root")
    expect(nearestParent(uses, "Dialog.Title", true)?.parent).toBe("Dialog.Popup")
  })
})

describe("families", () => {
  it("names a family by namespace, else the first word", () => {
    expect(familyOf("Dialog.Title")).toBe("Dialog")
    expect(familyOf("DropdownMenuSubTrigger")).toBe("Dropdown")
    expect(familyOf("Select")).toBe("Select")
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
    expect(normalizeRepo("git+https://github.com/radix-ui/primitives.git")).toBe("https://github.com/radix-ui/primitives")
    expect(normalizeRepo("github:mui/material-ui")).toBe("https://github.com/mui/material-ui")
    expect(normalizeRepo("mantinedev/mantine")).toBe("https://github.com/mantinedev/mantine")
    expect(normalizeRepo("git+ssh://git@github.com/adobe/react-spectrum.git")).toBe(
      "https://github.com/adobe/react-spectrum"
    )
    expect(normalizeRepo(undefined)).toBeUndefined()
  })
})
