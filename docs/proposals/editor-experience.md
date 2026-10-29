# Proposal: an editor people choose over Figma

Status: an audit and plan from the Design Editor session, 2026-10-29. You asked for "an award winning editor experience"
that surpasses Figma, Canva and Pen.dev for people going from design to implementation, and to look at how designers and
engineers each work for gaps. The tasks are in Linear as PAR-161 to PAR-189, ranked here by impact. Nothing here is
decided until it's in [decisions.md](../decisions.md).

## In one line

Parity already renders what ships, real components in their real states and modes, which none of the others do. To win,
it has to answer as fast as Figma, handle like Figma, and make inspecting a design the same as reading its code.

## How we looked

- **Research.** Four passes: Figma's internals and interaction model; Canva and Pen.dev; the tools that design with real
  code (UXPin Merge, Framer, Paper, Onlook, Penpot, Webflow, Plasmic, Builder.io, Subframe, Figma Make and code layers,
  v0, Cursor's design mode, tldraw); and how designers and front-end engineers work, from surveys, studies and team
  write-ups. The main sources are at the end.
- **Code review.** The canvas and the panels, read file by file, with the line for each finding.
- **Hands-on.** A separate copy of Parity on the example project, driven with real mouse and keyboard input and timed
  from the input to the first frame drawn after it, plus a `pnpm perf` run. It ran in development mode on the working
  tree at 04:35, which held other sessions' uncommitted work, including a keyboard rewrite half done.

The Menus session fixed four of the keyboard findings while we looked (`e8ea705`): Enter, Tab and the arrows belong to a
focused panel control again, Tab no longer jumps to another board, Escape cancels a layer drag, and Ctrl+Alt+K makes a
layer a component.

## What Parity already does better than all of them

- **The canvas is the code.** Designs render the project's own components through its own Vite build, with its CSS,
  providers and tokens. Figma's answer, code layers and Make on local code, is in beta, React only, needs an engineer to
  write setup scripts, and changes code through an agent that searches for where a change belongs.
- **States and modes are first-class.** Every state in every viewport, theme and locale sits side by side. Figma draws
  states by hand and caps modes at 10 or 20 per collection.
- **Interact runs the real thing.** Fields take typing and menus open, and nothing sticks when you leave.
- **Accessibility checks run on the real DOM,** in every state and mode, in plain words. Figma's built-in check is a
  contrast readout.
- **Every style is a token or a spacing step,** read from the project's CSS, so a design can't drift off the system.
  Figma's linter exists because hard-coded values are routine.
- **Agents read and edit designs locally,** through the CLI and MCP. Figma's writable MCP accepts only listed clients.
- **The inspector speaks the code's language.** It names the real component ("CardTitle component in Users card"), shows
  real props with the right controls, Tailwind values and token names, and where a main component is used.

These are the reasons to switch. Everything below is about making them pleasant to use.

## How the best editors work

### Figma

- **Speed is engineered.** C++ compiled to WebAssembly draws on Figma's own GPU renderer, with no garbage-collection
  pauses. Your own edits apply at once and conflicting server echoes are dropped, so nothing snaps back. Average and
  worst frame times are tested on every pull request, on GPU machines and a lab of old laptops. UI3's floating panels
  were reverted because "they slowed people down".
- **One grammar for modifiers and colours.** Shift constrains or takes a bigger step. Alt is symmetric, from the centre,
  duplicate or measure. Ctrl (Cmd) goes deeper or bypasses: deep select, nested marquee, ignore constraints, don't nest.
  Blue is selection and insertion, pink is spacing you can drag, red is snapping and measuring. Learning one gesture
  teaches the next.
- **Selection is parent-first.** A click inside a top-level frame selects its child. Double-click or Enter goes down,
  Shift+Enter up, Tab across, and Ctrl-click goes straight to the leaf. Right-click > Select layer lists everything
  under the pointer. Hover outlines what the next click will select.
- **Abstract properties are handles.** Padding and gap are pink handles on the canvas: drag them, click to type, Alt for
  opposite sides, Shift+Alt for all. Double-click an edge for Hug, Alt+double-click for Fill. Equally spaced items get
  gap handles and rings to reorder them, and Tidy up arranges a messy selection by its most common gap.
- **Fields are instruments.** Drag a label to scrub at four speeds, type maths (`+ - * /` and parentheses), add to mixed
  values (`Mixed+100`), and press `=` to bind a variable.
- **Moving is quick.** Arrows nudge by 1 or 10 and reorder inside auto layout. Alt-drag duplicates and Ctrl+D repeats
  the offset. There's paste here, paste over the selection and paste to replace.
- **The long tail is findable.** Ctrl+K searches commands, assets and plugins. The shortcuts panel highlights the ones
  you've used. Right-click menus carry the rest.
- **Dev Mode** shows code or a list, real component code through Code Connect, Ready for dev and Completed statuses,
  Compare changes since your last view, annotations with live values, and saved measurements. Its MCP gives agents
  structure, variables and screenshots.

Where it fails people going to code:

- Every component exists twice, once in Figma and once in code, and they drift. Code Connect is a mapping written by
  hand for each one.
- Auto layout looks like flexbox but isn't. A new engine in July 2026 closed some gaps, but there are still no grow
  ratios, percentages, media queries, `minmax` or sticky, and old and new engines mix in files until January 2027.
- States and data are faked by hand. People ask for a "Reality Mode" with long names and empty and error states.
- Responsive design is one frame per viewport.
- Tokens don't round-trip: dragging a padding handle silently detaches its variable.
- Ready for dev is a flag, not a contract.

### Canva

- **Three tiers of disclosure.** A bar on the selection holds the few likely actions (crop and filters for an image,
  font and size for text). ">>" opens the full panel. `/` or Ctrl+E searches everything, for experts.
- **One place for spatial work.** The Position panel holds arrange, align and layers. Heavy jobs are one click: Resize,
  Apply to all pages, Tidy up, Copy style.
- **Safety rails.** "Lock" and "Lock position only", and brand template locks that freeze font and colour while leaving
  the words editable.
- **Small wins first.** New people start from a template. Early onboarding was a 23-second intro and challenges of
  rising difficulty.
- It falls short for code: free-form pages with no layout model, components with no props or nesting, no tokens or
  states, and hosted code with no export.

### Pen.dev

- Figma's handling and keys, and selection colours that tell a main component (magenta), an instance (violet) and a
  layer (blue) apart.
- **Agents you can watch.** The selection is the agent's context. Edits stream onto the canvas, frames under
  construction are marked, each agent has a cursor, and "Let it cook" lays out two to six alternatives side by side.
  Every call is a transaction that rolls back on error and returns warnings and a map of names to ids. Cost and
  permissions are visible as you go.
- It falls short for code: a second model of the UI (a flex subset with no wrap, grid, min or max sizes, states or
  breakpoints), no props or variants, and code an agent rewrites on each request with nothing tracking drift.

### Tools that design with real code

- **Where a value comes from is visible.** Webflow colours each style label by its source (set here, inherited, from a
  breakpoint), and Alt-click resets it. Framer highlights a breakpoint's overrides, with Reset Override.
- **Typed props become controls,** refined by small annotations: UXPin's JSDoc tags, Framer's `hidden(props)`, Plasmic's
  allowed components and default slot contents.
- **Static on the canvas, live on demand.** Framer gives components `useIsStaticRenderer()`. Parity's Design and
  Interact split is the same idea.
- **Edits land as reviewable diffs.** v0 stages changes with a before-and-after toggle, Chrome DevTools shows a diff
  before saving, Figma Make commits each prompt, and Builder.io opens pull requests.
- **Agents are grounded.** v0 won't use a component, prop or token it can't verify.
- **Source is mapped, not searched.** Onlook instruments the build so every element knows its file and line. Cursor's
  design mode searches instead, and writes raw values and inline-styled duplicates.
- **Traps:** one-way generation that overwrites hand edits (Subframe, Plasmic), generated code nobody wants to keep, a
  proprietary runtime or host (Framer), and isolation that breaks React (Webflow gives each code component its own
  shadow root and React root, so context doesn't reach slotted children).

## How designers and engineers work, and where Parity stands

Designers and engineers want different things from the same design. Designers explore, compose and get sign-off.
Engineers find what's ready, read what to build, build it and check it. The seams between them are where work is lost:
the design is rebuilt in code, missing states turn up during the build, approved screens change without notice, and
design QA arrives as late tickets. Teams that close the seams design with the production components, keep code as the
source of truth, and review designs where code is reviewed. The Tasks columns give numbers from
[the ranked list](#the-tasks-ordered-by-impact).

### Designers

| Stage                   | What they need                                                            | Parity today                                                                                                   | Tasks                    |
| ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Explore                 | Many alternatives side by side, versions, compare                         | Duplicate works but lands on the next design; no compare or versions                                           | 26                       |
| Compose with the system | Fast insert and swap, props that match the code, composition, token picks | Real components, props and token pickers; the insert picker is slow and noisy; slots aren't built              | 20, 22                   |
| Handle layers           | One click to select, nudge, handles, snapping, right-click                | Several double-clicks to reach a layer, no nudge or right-click, sizes mostly in the inspector, all 0.5 s late | 1 to 7, 11 to 13, 18, 19 |
| Real content and states | Data, long text, empty and error states, locales                          | States and modes are first-class (ahead of everyone); no data sets or stress tests                             | 15                       |
| Responsive              | Edits per breakpoint                                                      | Viewports render side by side (ahead); every edit changes every viewport                                       | 14                       |
| Prototype and present   | Flows between screens, a present mode                                     | Interact runs real behaviour (ahead); no flows or present mode                                                 | 27                       |
| Review and sign-off     | Comments on a layer in a state, approval that freezes what was approved   | Not built; PAR-372 and PAR-373 wait on Better Apps                                                             | 17                       |
| Hand off                | Ready status, annotations, what changed since                             | None                                                                                                           | 17, 28                   |
| Look after the system   | Usage, the impact of a change, token edits                                | "Used N times"; token edits skip undo                                                                          | 7                        |

### Engineers

| Stage                      | What they need                                                         | Parity today                                                                                                       | Tasks     |
| -------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| Pick up work               | Links to the exact design, state and mode; what's ready and what moved | None                                                                                                               | 16, 17    |
| Read what to build         | Component, file, props as code, token names, the code's own units      | Component names, props, token names and Tailwind values (ahead of Figma); no file, no open in editor, no code copy | 9, 10     |
| Get assets                 | Bulk export with consistent names                                      | PNG of whole designs only                                                                                          | 29        |
| Build, often with an agent | Exact, structured context                                              | The CLI and MCP are strong; JSX for agents is planned (PAR-265)                                                    | 9, 10, 21 |
| Check the result           | Compare with the design across states, modes and accessibility         | Accessibility checks are strong; visual tests are planned (VIS stream)                                             | VIS       |
| Keep in step after launch  | Drift found in both directions                                         | Planned (PAR-93)                                                                                                   | 17        |

## What the audit found

### Speed

Measured by hand in development mode on the example project (61 designs, 119 frames):

| Action                                 | Parity                                                   | Figma      |
| -------------------------------------- | -------------------------------------------------------- | ---------- |
| Select a design                        | 564 to 971 ms                                            | Next frame |
| Select a layer beside the selected one | 485 to 917 ms; 102 to 122 ms with the side panels hidden | Next frame |
| Hover outline                          | About 350 ms                                             | Next frame |
| Commit a prop or text edit             | 774 to 840 ms                                            |            |
| Undo                                   | 445 to 603 ms                                            |            |
| Open the `/` insert picker             | 1,281 ms                                                 |            |
| Duplicate a design                     | 1,207 ms                                                 |            |
| Zoom                                   | 20 to 27 fps                                             | 60 fps     |
| Reopen the project                     | 8.6 s to a usable canvas, 27 s until zoomed-out previews |            |

Most of a selection goes to the side panels: Radix's animation check forces a style recalculation (142 to 169 ms),
styles are recalculated over about 7,500 elements (250 to 300 ms), and development-mode React adds about 110 ms. The
`pnpm perf` run measured selecting, editing and zooming about three times slower than a run two hours earlier. Whether
that's a regression or the run's conditions (uncommitted work, another copy on the perf ports) is still to be confirmed.

### What's broken

- **Components that don't pass their props through can't be selected, outlined or sized.** The canvas finds a component
  by a `data-canvas-node` prop (`packages/renderer-react/src/guest.ts:286`), which a component like
  `function MemberRow({ member })` never renders.
- **Drag and drop.** Reordering in a grid lands in the wrong slot. A card can nest into its neighbour, because the
  target is measured after the dragged layer is hidden. The right-edge resize handle set Height to Fill instead of
  changing the width. Absolutely placed layers lose negative and token insets. Dragging two boards by their bodies adds
  about two undo steps per pointer event, pushing all earlier history out.
- **Fields.** Typing 320 into Width gives 1280px (the field reads spacing steps), "16px" is ignored, "50-10" in Opacity
  removes the opacity, and a field being typed in is wiped when its value changes underneath.
- **Save and undo.** Token edits skip both. Some edits change the base design while the panel says they change only this
  state, and the text editor opens on the base state's text.
- **Errors.** One failing component covers its whole frame with a red panel, and a broken component file doesn't show
  until the project is reopened.
- **Placement.** Duplicating a design puts the copy on top of the next design.

### What's missing

- One-click selection inside a board, nudging, right-click menus, snapping for layers, spacing handles on the canvas and
  per-viewport edits.
- Any way for an engineer to see a component's file, open it, or copy code.
- Scrubbing, maths and arrow steps in fields, a colour picker, per-corner radius and per-side borders.
- Search across designs, layers, components and tokens, and previews in the Components panel.

## The tasks, ordered by impact

Impact weighs how often people hit something, how much it hurts or helps when they do, and whether it's a reason to
choose Parity over Figma. Sizes are S, M and L, as [work.md](../work.md) describes them. Each task's "Done when" is in
its Linear issue.

### Make it fast and trustworthy

1. **Make selecting, hovering, editing and zooming instant** (PAR-159, PAR-161; L). Selection takes up to a second and
   edits longer, where Figma answers in the next frame; it's the first thing anyone notices. PAR-159 covers the side
   panels: render only the rows that changed, and keep Radix's Presence and tooltips off rows that aren't open. PAR-161
   covers the rest of the hot path: the overlay measures only when the camera, the selection or a frame changes and
   writes outline positions in the same frame; hover doesn't re-render the Layers tree; board drags and resizes preview
   without saving or rebuilding frames until release; zoom holds 60 fps. Budgets, in a production build: hover within a
   frame, a selection and its inspector within 50 ms, an edit within 100 ms, dragging at 55 fps or better.
2. **Fail a change that makes the canvas slower** (PAR-162; M). Selection measured three times slower than two hours
   earlier, and nothing noticed. Figma tests frame times on every pull request. `pnpm perf --check` compares a run with
   the budgets and the last accepted run and exits with an error when a measure is over budget or 20% worse; sessions
   that touch the canvas, the panels or the renderer run it before committing.
3. **Select, outline and size any component** (CAN-45; M). Today a component has to pass its props through to its DOM to
   be selectable at all, which many app components don't. Find a component's DOM from React's own tree, the fiber whose
   props carry the node's id, the way React DevTools highlights components. When a component doesn't take `style`, say
   so and offer a layout around it instead of letting sizes do nothing.
4. **Select what you point at in one click** (PAR-163; M). Reaching a stat card took four double-clicks and 2.3 s. Make
   boards behave like Figma's top-level frames: a click inside selects the top-level layer under the pointer and the
   board is picked by its title or background, Ctrl-click still goes to the leaf, Enter selects all children or starts
   editing text, a box drawn from a frame's background selects layers inside it, and right-click > Select layer lists
   everything under the pointer. This changes the decision that double-click drills in first, for boards only.
5. **Make drags and resizes land where you aim** (CAN-47; M). Fix the grid reorder, the nesting into a neighbour
   (measure targets from the layout as it was when the drag began), the resize handle that changed the wrong axis, lost
   insets, unreachable empty layouts, handles that cover small layers, the missing cursors and Escape for resizes, undo
   by gesture rather than by second or pointer event, and duplicates that land on other designs.
6. **Make every field take what people type** (CAN-48; M). Units (`px`, `rem`, `%`), maths, Up and Down by 1 and Shift
   by 10, scrubbing by dragging the label, a live preview while typing, focus kept on Enter, and nothing cleared or
   silently dropped. Lengths off the spacing scale are kept and flagged "off scale", with the nearest step one click
   away, for sizes and insets only; colours, type, radius and shadows stay tokens. A sidebar 280px wide is a fact of
   real apps, and engineers already write `w-[280px]`. This loosens the tokens-only model for lengths, so it goes in
   decisions.md when built.
7. **Put every change through Save and Undo, in the state being edited** (PAR-164; M). Token edits are undoable and
   saved with everything else; edits that can't be per state say so first; the text editor opens on the state's text;
   values keep their types; turning Show every state off again leaves the file clean.
8. **Show what fails without hiding the frame, and pick up code edits live** (PAR-165, with PAR-147; M). Real components
   fail often, for missing providers or data, and the fix needs to be in front of you: a badge on the frame, the failing
   layer marked in Layers and the inspector with its reason and fix, and the canvas updating within a second of a
   component file being edited or broken.

### Make inspecting a design the same as reading its code

9. **Show the code behind a selection** (PAR-166; M). The engineer's first question is "what do I build", and today the
   answer has no file and no code. A Code section in the Design tab: the component's file and line with Open in editor,
   its import, the instance as JSX with its props, the JSX and Tailwind classes Parity would write for a layout or text
   layer (PAR-265's output, in the UI), every token with its value in the mode showing, and Copy as JSX. The Components
   panel shows each component's file. No other tool can do this without a hand-written mapping.
10. **Know the source line of every element** (PAR-167; M). A development-only Vite transform in builder-vite tags each
    JSX element with its file, line and column, so anything inside a real component can show and open its source, and
    agents get the same in `parity components` and snapshots. This is Onlook's approach, and it keeps agents from
    searching for where a change belongs.

### Handle like Figma

11. **Add right-click menus on the canvas** (PAR-168; S). Every other editor has one, and Parity's canvas shows nothing.
    Select layer, Copy, Paste here, Paste over, Duplicate, Wrap in layout, Make component, Go to main component, Hide,
    Lock, ordering, Open in editor and Copy as JSX, each with its shortcut from the keymap.
12. **Finish the keyboard** (CAN-39, CAN-54; M). CAN-39 already lists nudging, select matching, lock, paste over and
    find. Nudge semantics to match Figma: arrows reorder a layer inside a layout and move an absolutely placed one, by 1
    or by 10 with Shift (1px needs CAN-48's off-scale lengths). CAN-54 makes frames inert outside Interact, so Tab can't
    land in a design's input and leave every shortcut dead.
13. **Drag padding, gap and size on the canvas** (PAR-169; M). The hatching for padding and gap becomes handles you drag
    by spacing steps, with the value shown, click to type, Alt for opposite sides and Alt+Shift for all. Double-click an
    edge for Hug, Alt+double-click for Fill, resize several layers together, Alt to resize from the centre. Unlike
    Figma, a drag that stays on the scale keeps the token.

### Show the real thing, in every case

14. **Keep an edit on the viewport it's made in** (PAR-170; L). Resizing in the Mobile frame changes every viewport
    today, though the model already stores per-viewport changes. A toggle beside the edit-state switch sends edits to
    this viewport only; the inspector marks values set for it, with Reset, as Framer does; a frame can be dragged wider
    or narrower to watch it reflow without saving. This is where Figma is weakest.
15. **Show real data and edge cases on any board** (PAR-171; L). Data sets for props (none, a few, many, long text)
    chosen beside the state; a stretch mode with long names, doubled text, a pseudo-locale and right-to-left; and a list
    of the states a screen's components suggest (empty, loading, error, disabled) with the ones it shows. Brings PAR-337
    forward. Figma can only fake this; Parity renders it.

### Close the loop with engineers

16. **Link to a design, state and mode** (PAR-172; S). A `parity://` link that opens the project at that design, layer,
    state and mode, built from ids so it survives moves and renames, for tickets and pull requests. The CLI takes it
    too.
17. **Mark designs ready and show what changed since** (PAR-173, with PAR-93; L). Draft, Ready and Built statuses;
    marking Ready keeps what the design was, so engineers see exactly what changed since in layers, props, tokens and
    text, with before and after; a view lists designs by status. With PAR-93 the same view shows drift from code.
    Figma's Ready for dev is a flag; this is a record.

### Handle like Figma, continued

18. **Snap layers while moving and resizing** (PAR-174; M). Absolutely placed layers move live and snap to siblings' and
    the parent's edges and centres with red guides and distances; equal spacing shows marks; Ctrl moves freely, as for
    boards.
19. **Make text editing feel native** (PAR-175; M). The editor selects the word or text you clicked, follows the text
    while panning and zooming, wraps at the text's own width, keeps the edit on Escape like notes, waits for an input
    method to finish before Enter saves, and text can be auto width, auto height or fixed.
20. **Edit every kind of prop** (PAR-176, with PAR-83 and PAR-84; M). Structured editors for objects and arrays from
    their types, events shown as wired in code with their signature, required props flagged, prop names as words ("Show
    rising") with the code name on hover, and ReactNode props opening as slots.

### Agents, speed for experts, ease for everyone

21. **Show agents' work as it happens** (PAR-177; L). Pen's lesson: the person's selection is the agent's context, edits
    stream onto the canvas, layers being built are marked, each agent shows where it's working, each edit is an undo
    step named after it, and a failed call changes nothing. Builds on PAR-262, PAR-267 and PAR-269.
22. **Make the insert picker and Components panel fast and clean** (PAR-178; M). The `/` picker opens in 1.3 s and lists
    DialogOverlay, ThemeProvider and Badge twice. Open within 100 ms, rank the project's own components first, leave
    internal parts and plumbing out unless searched by name, merge one component found in two places, and show small
    previews from the frame bitmaps.
23. **Open a project in seconds** (PAR-179, with PAR-158 and PAR-153; M). 8.6 s to a usable canvas and 27 s to previews.
    Write down where the time goes first, then aim for 3 s and 5 s.
24. **Find anything from one search, and repeat the last action** (PAR-180; M). Search actions finds commands only;
    extend it to designs, layers, components, tokens and panel actions, recent first. Repeat last action is the shortcut
    Figma users keep asking for.
25. **Put the likely actions on the selection** (PAR-181; M). Canva's first tier: a small bar above the selection with
    what its type and props suggest (variant, size and on/off props for a component; direction, gap and wrap for a
    layout), plus Wrap, Make component and a jump to the inspector. It hides while dragging and can be turned off.

### Explore, organise and hand off

26. **Try alternatives side by side** (PAR-182; M). Designers explore in parallel; parallel prototyping beats serial
    iteration. Duplicate as alternative puts the copy beside the design in free space, grouped under one label; one is
    marked chosen; Compare shows two side by side or overlaid; the rest go to an archive section rather than the bin.
27. **Organise boards into sections and flows, and present them** (PAR-183, with PAR-154 and PAR-27; L). Labelled
    sections, arrows from a layer to a board that stay attached as boards move, and a Present mode that shows designs
    full size in Interact and follows the arrows.
28. **Annotate layers with intent, behaviour and accessibility** (PAR-184; M). GitHub open-sourced an annotation kit
    because link versus button, labels, heading levels and error text get lost even with accessible components.
    Annotations attach to a layer, state or mode, can quote live values, show in the Code section, and agents read and
    write them.
29. **Export layers, icons and images** (PAR-185; S). PNG or SVG of any layer, several at once named after their layers,
    and icons in bulk as SVG; Copy as PNG is in CAN-39.

### Complete and polish

30. **Fill in the styling controls designers expect** (PAR-186; L). A colour picker for colour tokens with the nearest
    token suggested, radius per corner, borders per side, opacity on token colours (`bg-primary/50`), a text layer's tag
    (heading levels for the accessibility checks), blur and backdrop blur, grid track sizes, baseline, aspect ratio and
    a typed size for a design's frame.
31. **Make the Layers panel scale** (PAR-187, with PAR-92; M). Search, collapse all, eye and lock on each row,
    reordering designs, a design row that outlines its board on hover, highlighting inside instances, and rows that
    render only when visible.
32. **Start well: first run and a new project** (PAR-188, with PAR-284 and PAR-133; M). The first run opens the example
    project, not the working folder, with three short tasks to try; the start screen shows thumbnails, removes recent
    projects and flags missing ones; New project comes from the Buildkit scaffolder.
33. **Polish the panels** (PAR-189; M). Clipped values ("Autc"), the crowded left tab strip, unthemed scrollbars, the
    toolbar over board titles, tooltips during drags, "Column layout" on a grid, one icon and colour per kind
    everywhere, one pattern for headings, search fields, selects, rows and empty states, accessible names on every
    inspector control, and swatches that show in the light theme.

## What not to copy

- **Every combination of variants.** Figma's sets slow down past about a thousand. Parity's variant grid shows each
  variant once plus pinned combinations, and should stay that way.
- **Floating side panels and a toolbar over the canvas.** Figma reverted the panels because they slowed experts down.
- **A second model of layout.** Canva's absolute positioning and Pen's flex subset are why their designs need
  rebuilding. Parity's layout is CSS and should stay CSS.
- **Generated files nobody owns.** When Parity writes code, it writes small edits to files people own, through the drift
  review, never a regenerated file that overwrites hand edits.
- **A runtime or host of Parity's own in shipped apps.**
- **A React root per component.** One root per frame keeps context, providers and portals working for slotted children.
- **AI credits nobody can price.**

## Sources

As the research passes cited them.

- Figma: [WebGPU rendering](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/),
  [keeping Figma fast](https://www.figma.com/blog/keeping-figma-fast/),
  [multiplayer](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/),
  [designing UI3](https://www.figma.com/blog/our-approach-to-designing-ui3/),
  [selecting layers](https://help.figma.com/hc/en-us/articles/360040449873),
  [auto layout](https://help.figma.com/hc/en-us/articles/360040451373),
  [the 2026 layout engine](https://help.figma.com/hc/articles/42031586813719),
  [binding variables](https://help.figma.com/hc/en-us/articles/15343107263511),
  [Dev Mode](https://help.figma.com/hc/en-us/articles/15023124644247),
  [Make on local code](https://www.figma.com/blog/figma-make-now-on-your-local-code/),
  [the Reality Mode request](https://forum.figma.com/suggest-a-feature-11/proposal-for-a-new-core-feature-reality-mode-for-figma-52789).
- Canva: [Glow Up](https://www.canva.com/help/glow-up/),
  [the Design Editing API](https://www.canva.dev/docs/apps/design-editing/),
  [early onboarding](https://www.onstartups.com/canva-user-journey).
- Pen.dev: [AI agents](https://docs.pencil.dev/core-concepts/ai-agents),
  [the .pen format](https://docs.pencil.dev/for-developers/the-pen-format),
  [Thoughtworks Radar](https://www.thoughtworks.com/radar/tools/pencil).
- Code-native tools: [Webflow style labels](https://help.webflow.com/hc/en-us/articles/33961332425875-Style-labels),
  [Webflow code components](https://developers.webflow.com/code-components/component-architecture),
  [Framer components](https://www.framer.com/developers/components-reference),
  [v0 design systems](https://v0.app/docs/design-systems-2), [Onlook](https://github.com/onlook-dev/onlook),
  [Cursor's design mode](https://www.builder.io/blog/cursor-design-mode-visual-editing),
  [Subframe sync](https://docs.subframe.com/syncing-components),
  [UXPin Merge props](https://www.uxpin.com/docs/merge/configuring-the-properties-panel/).
- How people work: [UX Tools 2026](https://www.uxtools.co/survey/2026/state-of-prototyping),
  [Figma's designer and developer report](https://www.figma.com/reports/designer-developer-collaboration/),
  [GitLab's design checklist](https://docs.gitlab.com/development/contributing/design),
  [Salesforce on detached components](https://www.salesforce.com/blog/figma-component-health/),
  [design engineering at Vercel](https://vercel.com/blog/design-engineering-at-vercel),
  [Knak designing in Claude Code](https://knak.com/blog/claude-code-streamlining-at-knak/),
  [GitHub's annotation toolkit](https://github.blog/changelog/2025-09-22-open-sourcing-the-github-annotation-toolkit),
  [design breakdowns](https://www.lisn.upsaclay.fr/publications/design-breakdowns-designer-developer-gaps-in-representing-and-interpreting-interactive-systems/),
  [parallel prototyping](https://cs303.stanford.edu/papers/ParallelPrototyping2010-final.pdf).
