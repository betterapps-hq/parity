# Components

Two kinds of component show on the canvas, and they work differently.

**The project's components** are its code: `Button`, `Card`, `Tabs`, and library ones such as `nova/Accordion`. A
`component` node places one. You can't change what they look like from Parity, only choose their props and what goes in
their slots. `Components()` lists them.

**Component designs** are designs with `kind: "component"`: a stat card, a member row, a sidebar. They're made of the
project's components and layouts, and screens place them as `instance` nodes. Change the component design and every
instance follows.

## Choosing a component

- Look before you build. `Components()` usually has what a screen needs; shadcn-style projects split a card into `Card`,
  `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` and `CardAction`.
- Read its props with `Props("Badge")`. Variants and sizes come with their options; use those values exactly. A prop the
  component doesn't declare comes back as a warning.
- Compose the parts the way the library intends: `Tabs` holds a `TabsList` of `TabsTrigger`s and one `TabsContent` per
  trigger; `Table` holds `TableHeader` and `TableBody`, each with `TableRow`s of cells. `Props("nova/Sidebar")` says
  what a part goes inside in `composition.parents`, here the `SidebarProvider` it needs, and what goes inside it in
  `composition.holds`. Start from `composition.example.node`, which already has its parents, when they aren't there.
- Put children where they go. `slots.children` is what goes between the component's tags. Other slots, when a component
  takes nodes as props, are named after the prop.

## Icons

Icons are components named after their library, as in `lucide/Search` or `lucide/ChevronRight`. Size them with the
`size` prop (in pixels, 16 in most controls). Put an icon inside a button's `children` slot next to its text, or alone
with an `aria-label` prop when the button has no text.

## Component designs and instances

Make a component design when something repeats with the same structure: rows in a list, cards in a grid, items in a
feed. Let `FindRepeats` find the candidates and `ExtractComponent` do the work: it makes the component design, works out
its params from what differs, and replaces each occurrence with an instance carrying its own values.

- A part built once, such as an app's sidebar or header, doesn't need copies to extract. Make it with
  `CreateDesign({ kind: "component", params })`, bind its nodes to the params, and add, rename or delete params later
  with `AddParam`, `UpdateParam` and `DeleteParam`.
- Give params names that say what they are (`name`, `email`, `role`), not where they are.
- An instance's values are its `args`. Change them with `Update(instance, { args: { role: "Admin" } })`.
- Only a component design has states, such as a row that's loading. They test the component on its own board; an
  instance always shows the base state.
- A component design can have variants: choices each instance makes, like a size, a tone or whether a table has rows.
  Each option patches the design the way a state does, and an instance picks one in its `args`:
  `Update(row, { args: { density: "compact" } })`. Use a variant when a screen needs a copy to look another way.
- An instance can override what's inside it, such as one copy's title or a hidden badge. `Get` shows these as the
  instance's `overrides`. `Insert` and `Replace` take an instance with `overrides`; `Update` doesn't change them. When
  copies differ in the same field, give the component design a param for it instead.
- A component design that needs a parent to render properly, such as a table row, is drawn inside that parent on its own
  board. Rows extracted from a table get this automatically.
- Place a new instance with `Insert(parent, { type: "instance", design: "member-row", args: { … } })`.

Keep component designs in their own area of the canvas, away from screens, as `ExtractComponent` does.
