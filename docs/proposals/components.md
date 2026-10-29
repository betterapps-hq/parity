# Proposal: components and instances

Status: phase 1 (variants, instance overrides and the main-component workflow) is built; see Phase 1, as built. You
chose the code model on 2026-10-28: the design in `.par` is the source, linked to a real component file, and design and
code stay in step through a review of each change, in either direction. You settled how the link works the same day (see
[How the link works](#how-the-link-works)). Slots and linking to code aren't started.

## In one line

A component design is linked to a real React component in your codebase. Parity writes its file when you approve the
change, its variants become typed props, its states become Storybook stories, and instances can override anything inside
them, Figma style, while staying linked to the main component.

## What exists today

Parity already has two kinds of component.

- **Code components.** React components from the project or from a library such as Buildkit nova. Parity reads their
  props from TypeScript (variants, defaults, groups) and renders the real thing.
- **Component designs.** Designs of kind `component` in a `.par` file, built from code components and layouts.
  - A component design has **params** (text, boolean, number, value). Nodes inside bind to them through `bind`.
  - It has **states**: patches on its nodes, such as Loading or Empty.
  - It can have **context**: components it renders inside, like a Storybook decorator.
  - An **instance** is placed by id. It passes `args` for the params and picks a state, and its inner ids render as
    `instance/inner`.
  - "Make component" and "Find repeated parts" extract them, turning texts into params.

What's missing:

- **Variants.** A component design can't say "size: small, medium or large" the way a code component can.
- **Overrides.** An instance can set params and a state, and nothing else. It can't change one inner text, swap an icon
  or hide a layer.
- **Slots.** A component design can't leave a hole for the instance to fill, the way `children` works.
- **The main-component workflow.** Edit the main in place, go to it, swap an instance, detach, reset, push changes back.
- **A way into code.** Component designs live only in `.par`, so a developer has to rebuild every one by hand.

## The decision that shapes everything: what is a component design in code?

### Option A: design only (today)

Component designs stay in `.par`. Instances expand at render time, and code never sees them.

- Good: simple, with nothing to keep in sync.
- Bad: designs drift from code. Developers re-implement every component, which is exactly the handoff gap Parity exists
  to close.

### Option B: code first

"Make component" writes a `.tsx` file right away. From then on the code is the truth, and the design is a view of it,
read back through the props inference Parity already has.

- Good: one source of truth, which developers own.
- Bad: editing structure on the canvas means editing arbitrary hand-written code. Round-tripping JSX reliably is a
  large, open-ended problem, and one unusual edit by a developer breaks the canvas.

### Option C: the design is the source, linked to code both ways (chosen)

The component design stays the source of truth, in `.par`, and is linked to a real component file in the project's own
components folder, for example `src/components/member-row.tsx`. Developers import it like any other component.

- **Params become props.** Variants become union-typed props, and slots become `ReactNode` props (`children` for the
  default slot). Styles become Tailwind classes, from tokens only.
- **The file is marked as linked.** A header says so, along with a hash of what Parity last wrote.
- **Developers wire behaviour from outside.** Events and data come in as props, for example
  `<MemberRow onRemove={...} />` inside a feature component. Editing the file works too, as below.

Why C:

- It closes the handoff gap, and the design stays editable on the canvas.
- Behaviour such as data and events stays in code that developers write around the component.
- It reads code back where the code is the kind Parity understands. The `decompose` machinery that turns designs into
  components grows into import from code, which is how changes made in the code come back and how existing components
  get linked.

### How the link works

You settled these on 2026-10-28.

- **Parity shows drift and doesn't write on save.** Each linked design shows an indicator when it differs from its code.
  A review menu lists each change, in either direction, to approve and write back or to reject. In your words: "show an
  indicator on each design that is drifted from the code, then you would enter a menu where you could approve each
  change and write it back." It's the same approve-or-reject flow that PR reviews will use, as you said earlier: "we
  should use the hash and show a diff to be approved or rejected."
- **Hand edits come back where they fit.** When someone edits the file, the hash no longer matches, and Parity reads
  back what it can express as changes to approve: text, token classes, props and known components. For anything it can't
  read back, it asks:
  - **Keep code:** freeze the component, which then becomes a plain code component on the canvas.
  - **Overwrite:** write the file again from the design.
- **Existing components can be linked too,** not only ones Parity made. In your words: "our app should detect the
  components in the app. Whether that's via a scanner, ast, or storybook." Parity reads a detected component's code into
  a linked design, and code it can't read shows as locked.
- **States become Storybook stories** when the project has Storybook: a plain CSF `member-row.stories.tsx` next to the
  component, one story per state, going through the same review. See [storybook.md](../storybook.md) for the rules on
  what Parity writes there.

You first leaned towards code first, then chose this once you saw component designs already live in `.par`: "Code first
doesn't make much sense. We do then need to link these to real components, and generate from the design, and intake
changes from the code."

## Variants and states

Keep both, because they answer different questions.

- **A variant is a choice the parent makes:** size, tone, with icon. Add an `enum` param type with options. Each option
  carries patches the same way a state does, and an instance picks one value per variant.
- **A state is a situation the component is in:** loading, empty, error, hover. It stays as it is today, and the
  instance picks one, mostly for review.

On the canvas, the main component shows a **variant grid**: each variant on its own, with the others at their defaults,
plus any combinations someone pins, and states as rows, with modes beside them as now. Every combination would be
Figma's variant set, but three variants of four options each is 64 frames. In code, each variant is a typed prop,
written with `cva` like the project's own components.

## Instance overrides

An instance should be able to change anything inside it and stay linked.

- Store overrides on the instance, keyed by inner node id: `overrides: { [innerId]: NodePatch }`. This is the same patch
  type states use, so text, props, style and hidden all work, and so does swapping a nested instance's component.
- The canvas already selects inside instances by `instance/inner` ids. Editing an inner layer while inside an instance
  writes an override instead of touching the main component.
- Each overridden property is marked, can be reset one at a time or all together, and can be **pushed to the main**
  component, which makes it the default for every instance.
- In generated code, an override becomes a prop when a param exists for it. Otherwise Parity adds the param to the main
  component straight away, as an undoable design edit, and the file gets the prop when you approve the change. You asked
  why it would only offer: "This is part of the design process isn't it?"

## Slots

Mark a layout inside a component design as a **slot**: `children` by default, or a name such as `actions`.

- On the main component, the slot shows placeholder content.
- In an instance, the slot takes any layers, dropped in or pasted.
- In code, the slot becomes `children` or a `ReactNode` prop.

## The main-component workflow

- **Create:** "Make component" (exists), from a selection of one or more layers. Repeated parts become instances
  automatically (exists for texts; extend it to structure).
- **Go to main:** from any instance, select the main component on the canvas.
- **Edit in place:** double-click into an instance and press a key, or use the menu, to edit the main right there, with
  the rest of the screen dimmed. Every instance updates live.
- **Swap:** replace an instance with another component, keeping overrides that still apply (same inner names, or
  matching params).
- **Detach:** inline the expanded tree with fresh ids. It's no longer linked.
- **Reset and push:** as described above.
- **Usage:** the main component lists where it's used, across screens and other components.

## Libraries

A library's `.lib.par` already describes the library, and its canvas can hold **component designs**: ready-made
compositions such as "Settings row" or "Empty state" built from the library's own components. You decided on 2026-10-28
that they show in apps that install the library, in the library's section of the Components panel, placed as linked
instances or detached copies.

## Suggested order

1. **Variants, plus overrides, plus the main-component workflow.** These are pure design-side features with no code
   generation, and they're the biggest gap against Figma.
2. **Slots.**
3. **Linking to code (Option C).** The drift indicator and the review menu, writing component files and stories, reading
   edits back by hash, and linking existing components.
4. **Library component designs** in the apps that use the library.

## Phase 1, as built

- **Variants are params of type `variant`.** Each has options, and each option has an id, a name and patches, the same
  patch type states use. The default is the param's `default`, else its first option. An instance picks one through its
  `args`, like any param, so a variant bound to a code component's prop passes the option's id on.
- **The order patches apply in:** the viewport's responsive patch, then the variants' options, then the state, then what
  the instance overrides, then whatever reaches in from outside (the screen's own states).
- **Instances store overrides** as `overrides: { [innerId]: NodePatch }`, with `nested/inner` keys for nodes inside a
  nested instance. A screen's states can also reach inside an instance with `instance/inner` keys, so a state like Empty
  can change one copy's text.
- **Editing on the canvas.** Double-click drills into an instance, a level at a time, and clicks then pick among the
  layers inside it. An edit there changes only that copy, and the inspector says so, with Reset and Push to main. In a
  state other than the base, the edit belongs to that state instead. Layers inside an instance can't be moved, resized
  on the canvas or deleted, the way Figma behaves.
- **A bound text, prop or visibility** is changed by giving the instance a value for its param, so the copy keeps
  following the param, rather than by an override that hides it.
- **The main component's board shows one combination of variants,** picked in its title bar. With an option other than
  the default showing, edits in the base state go to that option, and the inspector says "changes only the Large
  variant". The variant grid isn't built yet (decision 5).
- **The Instance section** has the variants and params, the state, the override count with Reset all and Push to main,
  Swap component and Detach. "Edit in" a component selects the same layer on the main component's board.
- **Swap** keeps the args the new component has params for, the state if it has one with the same id, and overrides for
  nodes that match by id or by layer name. **Detach** bakes everything the copy shows into plain layers with fresh ids;
  the root keeps the instance's id, and the screen's state patches follow the nodes to their new ids.

Not in phase 1: a Layers tree view of an instance's contents, agents editing overrides and variants through the edit
API, and the variant grid.

## Decisions needed from you

1. **Code model: decided, Option C with changes coming back from code.** The design in `.par` is the source, linked to a
   real component file, and edits to the file come back into the design. The details are decided too; see
   [How the link works](#how-the-link-works): a drift indicator and a review of each change instead of writing on save,
   hand edits read back where they fit, existing components linkable, and stories when the project has Storybook.
2. **File location: decided, the project's own components folder.** That's the folder `components.json` names, else the
   one most of the project's components are in, with a plain name such as `member-row.tsx` and no suffix. The header and
   its hash mark the file as linked, not its folder.
3. **Edits made outside Parity: decided, a change to approve or reject.** The hash shows the file changed, and what
   Parity can read back comes into the design's review for you to accept or turn down, the same flow PR reviews will
   use. Freezing or overwriting is the choice for what can't be read back.
4. **Overrides in code: decided, add the param straight away,** as an undoable design edit, because "this is part of the
   design process".
5. **Variant grid: decided, each variant on its own plus pinned combinations,** rather than every combination.
6. **Library designs in the apps that use them: decided, yes,** under the library in the Components panel, as linked
   instances or detached copies.
