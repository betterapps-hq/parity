import type { ComponentRef, ComponentSource, LeftOutExport } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import {
  type ComponentList,
  type ComponentListEvent,
  type ComponentListStep,
  nextComponentList
} from "./component-list.ts"

/** The UI kit's components load with the canvas; the rest of the app's load as they're drawn. */
const button: ComponentSource = { path: "src/ui/button.tsx", export: "Button", as: "function" }
/** An export of the UI kit the parse can't decide, such as `const Select = SelectPrimitive.Root`. */
const select: ComponentSource = { path: "src/ui/select.tsx", export: "Select" }
const toast: ComponentSource = { path: "src/ui/toast.tsx", export: "Toast" }
const card: ComponentSource = { path: "src/card.tsx", export: "Card", as: "function", lazy: true }
const dialog: ComponentSource = { path: "src/dialog.tsx", export: "Dialog", as: "exotic", lazy: true }
const badge: ComponentSource = { path: "@acme/nova", export: "Badge", library: "nova" }

/** An export the person put on the list, which detection leaves out. */
const menuRef: ComponentRef = { path: "src/menu.tsx", export: "Menu" }
const menu: ComponentSource = { ...menuRef, lazy: true, included: true }

const leftOut = (path: string, name: string): LeftOutExport => ({
  name,
  path,
  export: name,
  reason: "Its type isn't a component"
})
const selectLeftOut = leftOut(select.path, "Select")
const utilsLeftOut = leftOut("src/lib/utils.ts", "cn")
const cardHookLeftOut = leftOut(card.path, "useCard")

interface Case {
  name: string
  list: ComponentList
  event: ComponentListEvent
  expected: ComponentListStep
}

describe("nextComponentList", () => {
  it.each<Case>([
    {
      name: "a project opening lists what discovery found, with the person's corrections, and reads every prop",
      list: { sources: {}, leftOut: [] },
      event: { kind: "discovered", sources: { Button: button, Select: select }, corrections: { include: [menuRef] } },
      expected: {
        list: {
          sources: { Button: button, Select: select, Menu: menu },
          leftOut: [],
          corrections: { include: [menuRef] }
        },
        guest: { add: { Button: button, Select: select, Menu: menu }, drop: [] },
        props: "all",
        reread: [],
        changed: true
      }
    },
    {
      name: "a saved detection replaces the list and what was left out, and brings its own props",
      list: {
        sources: { Button: button, Select: select, Menu: menu },
        leftOut: [],
        corrections: { include: [menuRef] }
      },
      event: { kind: "restored", sources: { Button: button, Menu: menu, Dialog: dialog }, leftOut: [selectLeftOut] },
      expected: {
        list: {
          sources: { Button: button, Menu: menu, Dialog: dialog },
          leftOut: [selectLeftOut],
          corrections: { include: [menuRef] }
        },
        guest: { add: { Dialog: dialog }, drop: ["Select"] },
        props: [],
        reread: [],
        changed: true
      }
    },
    {
      name: "the checker reading the whole app adds what only it found, confirms or drops undecided ones, and keeps the person's",
      list: {
        sources: { Button: button, Select: select, Toast: toast, Menu: menu, Badge: badge },
        leftOut: [],
        corrections: { include: [menuRef] }
      },
      event: {
        kind: "checked",
        result: {
          components: [
            { name: "Button", path: button.path, export: "Button", as: "function" },
            { name: "Toast", path: toast.path, export: "Toast", as: "forwardRef" },
            { name: "Dialog", path: dialog.path, export: "Dialog", as: "exotic" }
          ],
          leftOut: [selectLeftOut]
        }
      },
      expected: {
        list: {
          sources: { Button: button, Toast: { ...toast, as: "forwardRef" }, Menu: menu, Badge: badge, Dialog: dialog },
          leftOut: [selectLeftOut],
          corrections: { include: [menuRef] }
        },
        guest: { add: { Dialog: dialog }, drop: ["Select"] },
        props: ["Dialog"],
        reread: [],
        changed: true
      }
    },
    {
      name: "the checker reading some files settles only theirs, and replaces only their left-out exports",
      list: { sources: { Button: button, Select: select, Card: card }, leftOut: [utilsLeftOut, cardHookLeftOut] },
      event: {
        kind: "checked",
        result: {
          components: [
            { name: "Card", path: card.path, export: "Card", as: "function" },
            { name: "CardHeader", path: card.path, export: "CardHeader", as: "function" }
          ],
          leftOut: []
        },
        files: new Set([card.path])
      },
      expected: {
        list: {
          sources: {
            Button: button,
            Select: select,
            Card: card,
            CardHeader: { path: card.path, export: "CardHeader", as: "function", lazy: true }
          },
          leftOut: [utilsLeftOut]
        },
        guest: { add: { CardHeader: { path: card.path, export: "CardHeader", as: "function", lazy: true } }, drop: [] },
        props: ["CardHeader"],
        reread: [],
        changed: true
      }
    },
    {
      name: "the checker agreeing with the list changes nothing",
      list: { sources: { Button: button }, leftOut: [selectLeftOut] },
      event: {
        kind: "checked",
        result: {
          components: [{ name: "Button", path: button.path, export: "Button", as: "function" }],
          leftOut: [selectLeftOut]
        }
      },
      expected: {
        list: { sources: { Button: button }, leftOut: [selectLeftOut] },
        guest: { add: {}, drop: [] },
        props: [],
        reread: [],
        changed: false
      }
    },
    {
      name: "in a library's own project, what the checker adds is named by the library",
      list: { sources: { "nova/Button": button }, leftOut: [], namespace: "nova" },
      event: {
        kind: "checked",
        result: {
          components: [
            { name: "Button", path: button.path, export: "Button", as: "function" },
            { name: "Dialog", path: dialog.path, export: "Dialog", as: "exotic" }
          ],
          leftOut: []
        }
      },
      expected: {
        list: { sources: { "nova/Button": button, "nova/Dialog": dialog }, leftOut: [], namespace: "nova" },
        guest: { add: { "nova/Dialog": dialog }, drop: [] },
        props: ["nova/Dialog"],
        reread: [],
        changed: true
      }
    },
    {
      name: "files read again add, move and drop components, keep the person's, and read every prop",
      list: {
        sources: { Button: button, Toast: { ...toast, as: "function" }, Card: card, Menu: menu, Badge: badge },
        leftOut: [utilsLeftOut],
        corrections: { include: [menuRef] }
      },
      event: {
        kind: "filesRead",
        read: new Map([
          [toast.path, undefined],
          [card.path, undefined],
          [
            "src/cards/card.tsx",
            [{ name: "Card", path: "src/cards/card.tsx", export: "Card", as: "function", uiKit: false }]
          ],
          [
            button.path,
            [
              { name: "Button", path: button.path, export: "Button", as: "function", uiKit: true },
              { name: "IconButton", path: button.path, export: "IconButton", as: "forwardRef", uiKit: true }
            ]
          ],
          [menuRef.path, []]
        ])
      },
      expected: {
        list: {
          sources: {
            Button: button,
            Badge: badge,
            Card: { ...card, path: "src/cards/card.tsx" },
            IconButton: { path: button.path, export: "IconButton", as: "forwardRef" },
            Menu: menu
          },
          leftOut: [utilsLeftOut],
          corrections: { include: [menuRef] }
        },
        guest: {
          add: {
            Card: { ...card, path: "src/cards/card.tsx" },
            IconButton: { path: button.path, export: "IconButton", as: "forwardRef" }
          },
          drop: ["Toast"]
        },
        props: "all",
        reread: [],
        changed: true
      }
    },
    {
      name: "an export the person puts on the list is listed at once, and its file is read again",
      list: { sources: { Button: button }, leftOut: [leftOut(menuRef.path, "Menu")] },
      event: { kind: "corrected", corrections: { include: [menuRef] } },
      expected: {
        list: {
          sources: { Button: button, Menu: menu },
          leftOut: [leftOut(menuRef.path, "Menu")],
          corrections: { include: [menuRef] }
        },
        guest: { add: { Menu: menu }, drop: [] },
        props: ["Menu"],
        reread: [menuRef.path],
        changed: true
      }
    },
    {
      name: "an export the person takes back off stays listed until its file is read again",
      list: { sources: { Button: button, Menu: menu }, leftOut: [], corrections: { include: [menuRef] } },
      event: { kind: "corrected", corrections: { include: [] } },
      expected: {
        list: { sources: { Button: button, Menu: menu }, leftOut: [], corrections: { include: [] } },
        guest: { add: {}, drop: [] },
        props: [],
        reread: [menuRef.path],
        changed: false
      }
    }
  ])("$name", ({ list, event, expected }) => {
    expect(nextComponentList(list, event)).toEqual(expected)
  })
})
