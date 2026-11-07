# Change Log - @parity-app/cli

<!-- This log was last generated on Fri, 06 Nov 2026 18:38:16 GMT and should not be manually modified. -->

<!-- Start content -->

## 0.13.1

Fri, 06 Nov 2026 18:38:16 GMT

### Patches

- Read Buildkit's styles' tokens from their DTCG tokens.json, with a description on every token (ajcraswell@gmail.com)

## 0.13.0

Fri, 06 Nov 2026 10:43:10 GMT

### Minor changes

- Keep a size or inset off the spacing scale, flagged with the nearest step one click away, and nudge layers by 1px
  (ajcraswell@gmail.com)
- Copy the selected layers or designs to the clipboard as a PNG at 2x with Ctrl+Shift+C, drawn as exporting draws them
  (ajcraswell@gmail.com)

### Patches

- Boards take their size once the zoom settles, so they no longer measure themselves on almost every frame of a zoom
  when frames run slow (ajcraswell@gmail.com)

## 0.12.0

Fri, 06 Nov 2026 07:14:05 GMT

### Minor changes

- Layers draws only the rows in view, closes rows opened for an earlier selection, and adds search, Collapse all, an eye
  on each layer and dragging designs to reorder them (ajcraswell@gmail.com)

## 0.11.0

Fri, 06 Nov 2026 05:34:58 GMT

### Minor changes

- Read prefers-color-scheme blocks as a theme: a project's dark block is its dark theme, the light values stay the
  defaults, and each frame draws the block for its own mode (ajcraswell@gmail.com)

## 0.10.0

Fri, 06 Nov 2026 05:21:34 GMT

### Minor changes

- Frames on the canvas: the frame tool draws them, text and anything landing on the empty canvas make them, and Convert
  to switches between frames, components and screens (ajcraswell@gmail.com)
- Show component previews in the Components panel, in Names, List and Grid views, with each component's card, and in the
  insert picker (ajcraswell@gmail.com)

### Patches

- Spacing handles no longer cover a layout's children, so a click on a child still selects it (ajcraswell@gmail.com)
- Keep hover and selection outlines on their layers in every frame of a zoom, and stop the overlays laying the page out
  partway through each frame (ajcraswell@gmail.com)

## 0.9.0

Fri, 06 Nov 2026 04:25:16 GMT

### Minor changes

- In development, each element a project's JSX writes carries its file, line and column: the inspector's Code tab shows
  and opens it, parity components gives each component's file, and Measure each node's source (ajcraswell@gmail.com)
- Drag a layout's padding and gaps on the canvas, type or pick a value, resize several layers together or from the
  middle, and double-click an edge to hug or fill (ajcraswell@gmail.com)
- Errors and warnings from the designs show with a count in the status bar, on each board and by design in a Console
  panel (ajcraswell@gmail.com)

## 0.8.0

Fri, 06 Nov 2026 03:55:41 GMT

### Minor changes

- Export layers and designs as PNG or JPG at 1x to 3x from the Design tab's Export section, the canvas and Layers menus,
  and Ctrl+Shift+E (ajcraswell@gmail.com)

## 0.7.7

Fri, 06 Nov 2026 02:49:12 GMT

### Patches

- Snippet API functions check their arguments with zod and refuse a wrong one as invalid_input naming its field
  (ajcraswell@gmail.com)
- Open projects through a factory that takes its adapters, and keep .par saves inside the project folder
  (ajcraswell@gmail.com)
- Check npm's registry documents, upstream.json, shipped token files, the library file being replaced and MUI, Chakra
  and Fluent theme objects with zod (ajcraswell@gmail.com)
- Read package manifests, shadcn's components.json and tool configs through zod schemas, naming the file and field at
  fault (ajcraswell@gmail.com)
- Check and evaluate decorator and sample values in one core module, with one copy of icon alias grouping
  (ajcraswell@gmail.com)
- Check agents' requests to the app with the CLI's schemas, so a malformed body, an unknown method or bad params get
  invalid_input with their path (ajcraswell@gmail.com)

## 0.7.6

Fri, 06 Nov 2026 01:41:42 GMT

### Patches

- The text editor writes an edit to the state whose text it showed, even when the state it was picked in is gone
  (ajcraswell@gmail.com)
- Library files, their edits and decorator values are checked with zod schemas, and a decorator value's form is checked
  when the file loads. (ajcraswell@gmail.com)
- Split lint, board geometry and frame reading out of the agent workspace, and type its api() (ajcraswell@gmail.com)
- Keep each project's TypeScript program in @parity-app/code's program cache, which the type checker worker calls
  (ajcraswell@gmail.com)
- Checks the clipboard, drag payloads and saved preferences with zod: a copy or drop that doesn't parse is refused, and
  a saved value that doesn't read falls back to its default without resetting the rest (ajcraswell@gmail.com)

## 0.7.5

Fri, 06 Nov 2026 01:01:59 GMT

### Patches

- Work out which design, state and viewport an edit lands on in one place, and place the text tool's text where a drop
  would land (ajcraswell@gmail.com)

## 0.7.4

Fri, 06 Nov 2026 00:40:25 GMT

### Patches

- Style rows reset everything their edits write, and read a layer's parent inside instances as the copy shows it
  (PAR-567) (ajcraswell@gmail.com)
- Answer each agent method from @parity-app/agent's dispatch, typed by one method map the CLI client shares
  (ajcraswell@gmail.com)

## 0.7.3

Fri, 06 Nov 2026 00:18:54 GMT

### Patches

- Requests between the window, the project service, main and the type checker go through one channel, and the service
  checks each request the window sends it (ajcraswell@gmail.com)
- Absolutely placed layers preview while dragged and save once on drop; dropping from the panel and layer snapping
  measure less per move; a field scrub commits without a gesture of its own. (ajcraswell@gmail.com)
- Refuse SetTokens values the token detail refuses: brackets, missing tokens, loops, and values not of the token's kind
  (ajcraswell@gmail.com)

## 0.7.2

Thu, 05 Nov 2026 23:43:34 GMT

### Patches

- The CLI and MCP server check Parity's answers before reading them, and say what they can't read; MCP execute refuses
  fields it doesn't take (ajcraswell@gmail.com)

## 0.7.1

Thu, 05 Nov 2026 23:00:05 GMT

### Patches

- Component previews draw dialogs, popovers, menus and closed content open, and say when a component draws nothing of
  its own (ajcraswell@gmail.com)

## 0.7.0

Thu, 05 Nov 2026 22:43:16 GMT

### Minor changes

- Check what a token edit may write (valueProblem, loopProblem, builtOn, checkTokenEdit), with CSS.supports passed in
  (ajcraswell@gmail.com)

### Patches

- State labels shrink as board titles do when zoomed out, and hide only when their row is too short on screen to hold
  them (ajcraswell@gmail.com)
- Make component is refused when any variant option, shown on the board or not, would change the part
  (ajcraswell@gmail.com)
- A board's gutter, caption band and space between previews keep their screen size up close, and shrink with the canvas
  past 40% (ajcraswell@gmail.com)
- An export taken back off the component list now stays listed only if detection lists it, and keeps its mark while it's
  still listed by hand. (ajcraswell@gmail.com)
- Point to problems in a project file more exactly: a length that is neither a number nor a string, padding of the wrong
  form, and mistakes in its modes (ajcraswell@gmail.com)
- Zoomed far out, board titles clip to their board and hide once it's under 24 pixels wide on screen, and state labels
  and mode captions hide before titles do (ajcraswell@gmail.com)
- Resetting a text layer's Resizing in a state now clears the grow its switch set, as well as width and height
  (ajcraswell@gmail.com)
- get_app_state marks the project's first mode primary; it marked none before. (ajcraswell@gmail.com)
- Component previews are drawn in the project's mode that matches Parity's light or dark theme, and each theme's
  pictures are kept (ajcraswell@gmail.com)
- rem in frames follows the project's html font size, as in Chrome, so a project with html { font-size: 62.5% } gets
  10px to the rem (ajcraswell@gmail.com)

## 0.6.3

Thu, 05 Nov 2026 20:31:29 GMT

### Patches

- Find installed packages and their entries one way, so a library's types under exports, named re-exports and the
  registry's newest file read the same in the app, libgen and parity lib check (ajcraswell@gmail.com)
- Frames no longer pick up Parity's own CSS variables: a variable the project uses but never defines takes its fallback,
  as in Chrome (ajcraswell@gmail.com)
- Components that set their own size, and library parts whose examples give them no text, are inserted without their
  name cut off inside them (ajcraswell@gmail.com)

## 0.6.2

Thu, 05 Nov 2026 12:23:39 GMT

### Patches

- Leave out malformed tokens in a library's DTCG files, and note why, instead of reading them as broken CSS
  (ajcraswell@gmail.com)

## 0.6.1

Thu, 05 Nov 2026 11:44:07 GMT

### Patches

- Layers' Hide in and Show in name the variant option the change goes to, not the state (ajcraswell@gmail.com)

## 0.6.0

Thu, 05 Nov 2026 11:30:13 GMT

### Minor changes

- Agent overlap warnings tell board collisions (overlap) from a title too close (title_clearance), say whether sizes are
  measured or estimated, and count crowded boards a call didn't touch (canvas_overlaps) (ajcraswell@gmail.com)

## 0.5.1

Thu, 05 Nov 2026 11:11:43 GMT

### Patches

- List an export you put on the component list straight away, and keep a new component that takes a removed one's id
  when files change (ajcraswell@gmail.com)
- Measure explains that it lays out one frame when given a list, "all" or "shown", and lists the state or mode ids it
  takes (ajcraswell@gmail.com)
- Check registry entries, caller names and the app's error details with zod (ajcraswell@gmail.com)

## 0.5.0

Thu, 05 Nov 2026 10:01:58 GMT

### Minor changes

- Execute results group warnings by category and message, with a severity, a count and every place, and the text lists
  them under render failures, warnings and suggestions (ajcraswell@gmail.com)
- Suggest the project's color token that fixes each contrast failure, and apply it in one click (ajcraswell@gmail.com)
- Props reports a component's composition: the parents or provider it goes inside, the parts it holds, its slots and an
  example to insert (PAR-454) (ajcraswell@gmail.com)
- Problems names the node that overflows, what it overflows (the frame or the ancestor that clips it), both boxes and
  the pixels past each edge; Measure gives each node's parent and the state and mode it drew (ajcraswell@gmail.com)
- Execute results list the responsive, state and variant patches each Replace discarded, in discarded and under
  Discarded by Replace (PAR-455) (ajcraswell@gmail.com)
- New screen and New component in the File and Object menus, the canvas menu, Search actions and Layers, and what lands
  on the empty canvas makes a screen named after it (PAR-546) (ajcraswell@gmail.com)
- A project file keeps tables, operations and routes placed on the canvas, typed links drawn by hand, and the source
  each lens reads (PAR-16) (ajcraswell@gmail.com)

### Patches

- An unknown state now says calls take a state's id, lists each id beside its name, and points a state's name to its id
  (ajcraswell@gmail.com)
- List the props a library's component declares beside its element's attributes, such as Nova's isActive, as its own,
  with their defaults (ajcraswell@gmail.com)
- Take radius-full, Tailwind's rounded-full, in the radius field, and list it with GetTokens as a keyword
  (ajcraswell@gmail.com)
- A tsconfig change while a project is open sorts the app's sources again, so components it now leaves out drop off the
  list (PAR-492) (ajcraswell@gmail.com)
- Frames in a theme's mode get the attribute the stylesheet switches it on with, so [data-theme=dark] themes show in
  Dark frames (ajcraswell@gmail.com)

## 0.4.0

Thu, 05 Nov 2026 03:41:17 GMT

### Minor changes

- Add frames, a light kind of design drawn once at its own size, to the project file, the editor and the agent API
  (ajcraswell@gmail.com)

## 0.3.1

Thu, 05 Nov 2026 02:45:34 GMT

### Patches

- Turn a prop off in one state when the base design has it on, and reset it from the inspector (ajcraswell@gmail.com)
- Preview number props on the canvas while typing or scrubbing, round Opacity to whole percentages, and name Mixed+8 in
  the note on what differs across selected layers (ajcraswell@gmail.com)
- Keep frame bitmaps and component previews as lossless WebP, about 40% smaller than the PNGs they replace, with the
  same pixels (ajcraswell@gmail.com)

## 0.3.0

Thu, 05 Nov 2026 02:15:39 GMT

### Minor changes

- A state can take away a prop or style the design sets, and Paste style in a state leaves only the copied style
  (ajcraswell@gmail.com)

### Patches

- Saving after undoing a token value a theme didn't have takes it back out of the stylesheet, with any rule it leaves
  empty (ajcraswell@gmail.com)
- Box a component that draws only text by its text, so it can be hovered, picked and sized on the canvas
  (ajcraswell@gmail.com)

## 0.2.0

Thu, 05 Nov 2026 01:01:24 GMT

### Minor changes

- Agent calls merge per design with edits made while they run, and are refused naming the designs when both changed the
  same one (noreply@anthropic.com)
- Make a picture of every component offscreen, after the canvas's bitmaps, and keep it on disk so a reopened project
  draws none again (ajcraswell@gmail.com)
- parity modes and the MCP get_modes tool list the project's viewports (the ids Responsive takes) with their window
  heights, its modes (the ids renders take) resolved, and what each design shows; naming a design adds its frames'
  sizes. Mistyped ids now suggest the nearest ones first. (ajcraswell@gmail.com)
- Frame bitmaps are kept on disk in app data, so a project opened again shows them without capturing each frame again;
  View > Clear bitmap cache removes them. (ajcraswell@gmail.com)
- Components show their preview in a card beside the row, and right-clicking one offers View in Storybook and View code,
  which opens it in your editor (chosen in Settings). Tooltips are raised in the theme's own colors. Taking a component
  off the list by hand is gone. (ajcraswell@gmail.com)
- Agents get every result as data, in --json and MCP structuredContent with published output schemas, and failures as
  stable error codes with the input at fault, whether to retry, and the valid ids to use instead. Token and console
  reads are bounded by --limit. (ajcraswell@gmail.com)
- Add MCP token, component and prop reads, validate options consistently, and report screenshot and audit failures in
  both interfaces (ajcraswell@gmail.com)
- parity status and the MCP get_status tool say where a tab's edits stand: its revision, what's applied but not saved
  (files and token values), the last save and failed writes, and undo and redo, with an optional bounded summary.
  get_app_state carries the revision too. (ajcraswell@gmail.com)
- Agents' calls go to the running copy of Parity that has their project open; --tab active names what the person is
  looking at, and a call without --tab goes to the project its folder is in (ajcraswell@gmail.com)

### Patches

- Load aliased library providers, icons and sample values consistently and reject obsolete manifests
  (ajcraswell@gmail.com)
- Align, Wrap, resizing, nudging, dragging and the clipboard read layers as the frame shows them, with variants,
  viewport patches and bound values; a copied binding is kept only where the design pasted into has that param
  (noreply@anthropic.com)
- Zoomed-out frames and agents' renders no longer draw a component from a file that's gone (noreply@anthropic.com)
- Agents' frames, exports and accessibility checks draw library designs' instances and unsaved token values as the
  canvas does, and no offscreen frame inherits another's token values (noreply@anthropic.com)
- MCP's tools/list no longer publishes output schemas, cutting it from 33 KB to under 12 KB; structuredContent and CLI
  --json are unchanged (ajcraswell@gmail.com)
- Keep text given to a new library part rather than labelling over it (ajcraswell@gmail.com)
- A call without --tab finds the project its folder is in through links, such as macOS's /var (ajcraswell@gmail.com)
- The canvas menu says Show for a layer the variant shown hides, and Make component checks the result against the
  variant and param defaults the board shows (noreply@anthropic.com)
- Fingerprint every lockfile package-manager detection recognizes, such as npm-shrinkwrap.json, and the tsconfigs a
  project's configs extend, so cached props refresh when they change (noreply@anthropic.com)
- Estimate the size of a board the canvas hasn't drawn from its frames, laid out as the canvas lays them out, so
  Overlaps() catches wide and tall boards (noreply@anthropic.com)
- Inserting a component that passes its props to an input no longer gives it children, and library samples' text ends at
  a sentence or a whole word (ajcraswell@gmail.com)
- Props refresh after you change tsconfig paths or dependencies (noreply@anthropic.com)
- Default execute labels to "Edit designs", report failed MCP executions as tool errors, and reject ambiguous requests,
  blank labels and malformed patches before they reach the app (ajcraswell@gmail.com)
- Draw zoomed-out bitmaps, agent screenshots and measurements, exports and accessibility checks in the same window
  height as the live frame, keeping a mode's screen height when the frame grows with its content (noreply@anthropic.com)
- Capture frames' bitmaps in four offscreen windows at once, so a project opened for the first time has them in less
  than half the time (ajcraswell@gmail.com)
- Generate an app's library from the same sources and global stylesheets project detection finds, following tsconfig
  references, the HTML entry's stylesheet imports and relative @imports (noreply@anthropic.com)
- Read token themes and categories the same way in parity lib and the app: [data-theme] attributes are themes, names
  like fontSizeBase300 are font sizes, and a library's .dark beats its prefers-color-scheme block
  (noreply@anthropic.com)
- Keep values under media queries, such as a prefers-color-scheme: dark block, out of the default theme's tokens
  (noreply@anthropic.com)
- Use declared caller names instead of guessing agent identity (ajcraswell@gmail.com)

## 0.1.0

Sat, 31 Oct 2026 05:16:05 GMT

### Minor changes

- parity lib lists icons whose names end in a number, and records the name each icon set's types prefer
  (ajcraswell@gmail.com)
- parity lib gives examples the values the package's own functions make, such as a Chakra tree view's collection
  (ajcraswell@gmail.com)
- parity lib installs a library on its own at a version, so describing it needs no project that has it
  (ajcraswell@gmail.com)
- Frames run the production builds of the project's dependencies, React's among them, so the window no longer keeps a
  stack for every element (PAR-198) (ajcraswell@gmail.com)
- Charts, axes, series and grids from Recharts, so a ChartContainer can hold a bar, line or area chart
  (ajcraswell@gmail.com)
- Size a hugging text layer to its text, wrapping only at its maximum width, as Figma's auto width does, and tell agents
  how text layers size: auto width, auto height or fixed, from their width and height (ajcraswell@gmail.com)
- Show Fluent slots such as icon, contentBefore and header the way children shows: text, or layers in their slot
  (ajcraswell@gmail.com)
- parity lib check --record keeps why parts failed in the app, and parity lib --registry places them from it; parts that
  hand their children to an input are inserted without a text label (ajcraswell@gmail.com)
- Name a library's own components by its id, list its canvas's component designs in apps that install it, and place them
  linked or as detached copies (ajcraswell@gmail.com)
- Give empty layouts a size on the canvas, keep resize handles off small layers, let Escape cancel resizes and title
  drags, and show the grabbing, resize and text cursors over the canvas (ajcraswell@gmail.com)
- Publish to npm as @parity-app/cli, with the registry's library files inside (ajcraswell@gmail.com)
- Infer each token's kind from its value, then its name, else none, and preview gradients and type styles
  (ajcraswell@gmail.com)

### Patches

- Reopen a project without loading its code again when it hasn't changed, show the new code when it has, and free a
  closed project's styles (ajcraswell@gmail.com)
- A token's code forms are its CSS variable and its name, with no framework's classes. (ajcraswell@gmail.com)
- List providers so the parts inside them insert, and place more library parts from the app's errors
  (ajcraswell@gmail.com)
- Frames and their bitmaps draw again when a component the type checker finds, or finds moved, comes from a new file
  (ajcraswell@gmail.com)
- Name Buildkit's shadcn libraries Shadcn and their style (Shadcn Nova, Shadcn Luma and the rest) instead of Buildkit
  nova (ajcraswell@gmail.com)
- Every list of tokens, in the Tokens panel and the inspector's pickers, shares one order, smallest first.
  (ajcraswell@gmail.com)
