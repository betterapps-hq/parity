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
  trigger; `Table` holds `TableHeader` and `TableBody`, each with `TableRow`s of cells.
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

- Give params names that say what they are (`name`, `email`, `role`), not where they are.
- An instance's values are its `args`. Change them with `Update(instance, { args: { role: "Admin" } })`.
- A component design can have states too, such as a row that's loading. An instance's `state` picks which one it shows.
- A component design can have variants: choices each instance makes, like a size or a tone. Each option patches the
  design the way a state does, and an instance picks one in its `args`: `Update(row, { args: { density: "compact" } })`.
- An instance can override what's inside it, such as one copy's title or a hidden badge. `Get` shows these as the
  instance's `overrides`. People make them on the canvas; `execute` can't edit overrides or add variants yet, so to
  change one copy, give the component design a param for it.
- A component design that needs a parent to render properly, such as a table row, is drawn inside that parent on its own
  board. Rows extracted from a table get this automatically.
- Place a new instance with `Insert(parent, { type: "instance", design: "member-row", args: { … } })`.

Keep component designs in their own area of the canvas, away from screens, as `ExtractComponent` does.
