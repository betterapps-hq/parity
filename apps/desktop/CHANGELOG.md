# Change Log - @parity-app/desktop

<!-- This log was last generated on Sat, 07 Nov 2026 09:04:55 GMT and should not be manually modified. -->

<!-- Start content -->

## 0.30.0

Sat, 07 Nov 2026 09:04:55 GMT

### Minor changes

- Failing components draw a hatched box and show in the console with why and how to fix them, the console filters levels
  from a menu, and saved component code reaches the canvas live (ajcraswell@gmail.com)

## 0.29.0

Sat, 07 Nov 2026 04:57:51 GMT

### Minor changes

- Lock layers and designs with Ctrl+Shift+L, a lock on each Layers row, and Lock in the canvas and row menus: a locked
  one can't be selected or moved on the canvas, only from Layers, and stays locked in the .par (ajcraswell@gmail.com)

## 0.28.1

Sat, 07 Nov 2026 04:09:47 GMT

### Patches

- Share diagnostics keeps one short description, on or off, so Settings doesn't shift when it's turned
  (ajcraswell@gmail.com)

## 0.28.0

Sat, 07 Nov 2026 03:48:15 GMT

### Minor changes

- Add Help > Report a problem, which sends what happened with a screenshot, logs, versions and projects, and offers
  itself after a crash; add parity diagnostics, which writes the same as a zip (PAR-635) (ajcraswell@gmail.com)

## 0.27.0

Sat, 07 Nov 2026 03:33:55 GMT

### Minor changes

- Record failed data checks as data.invalid and refused projects as project.unsupported (PAR-633) (ajcraswell@gmail.com)
- parity logs and get_logs read Parity's own events from the local log, by level, process, trace, test run or time
  (PAR-636) (ajcraswell@gmail.com)
- Record every error notification as error.caught, failed service requests, and saves, exports, project edits and
  libraries (ajcraswell@gmail.com)

## 0.26.0

Sat, 07 Nov 2026 02:36:08 GMT

### Minor changes

- Record tabs, panels, dialogs, modes, settings and start page actions as telemetry events (ajcraswell@gmail.com)

## 0.25.0

Sat, 07 Nov 2026 02:04:08 GMT

### Minor changes

- Carry trace context across the window, the service, main, render jobs, builders and the CLI (PAR-629)
  (ajcraswell@gmail.com)
- Record startup, quitting, updates, memory, service lag and long tasks as telemetry events (PAR-631)
  (ajcraswell@gmail.com)
- Tag every event with its test run, who's driving (a person or an agent, with its caller and client) and the tester or
  agent as Sentry's user (ajcraswell@gmail.com)
- Mark a component design's layouts as slots: children or named, listed with its params in Props, with Make slot beside
  Make component and the slots outlined on the canvas (ajcraswell@gmail.com)

### Patches

- Scrub the open projects' .env values from telemetry in every process (ajcraswell@gmail.com)

## 0.24.0

Sat, 07 Nov 2026 00:54:36 GMT

### Minor changes

- Record the editor window with Session Replay, and send the frames on the canvas with errors and a frame's last bitmap
  with a failed render (PAR-624) (ajcraswell@gmail.com)

## 0.23.0

Sat, 07 Nov 2026 00:05:43 GMT

### Minor changes

- Settings > Privacy > Share diagnostics turns Parity's diagnostics on or off without a restart, and About shows whether
  they're on and the install ID. (ajcraswell@gmail.com)

## 0.22.0

Fri, 06 Nov 2026 18:37:59 GMT

### Minor changes

- Stay signed in to several accounts and switch between them: your accounts are in a panel from your picture in the
  title bar, each with its own Sign out, and Home's top left is a workspace menu for the account you're in
  (ajcraswell@gmail.com)
- Name every build as a Sentry release and upload its source maps, so stack traces resolve to source
  (ajcraswell@gmail.com)
- Home's account menu becomes a workspace menu, and your accounts move to a panel in the title bar where each has its
  own Sign out (exploration); on a phone, Home's search spans its row and Show more follows the cards
  (ajcraswell@gmail.com)
- Send events as Sentry logs, breadcrumbs and spans through main, and keep a local copy in rotating log files
  (ajcraswell@gmail.com)

### Patches

- Read Buildkit's styles' tokens from their DTCG tokens.json, with a description on every token (ajcraswell@gmail.com)

## 0.21.0

Fri, 06 Nov 2026 10:42:47 GMT

### Minor changes

- Copy the selected layers or designs to the clipboard as a PNG at 2x with Ctrl+Shift+C, drawn as exporting draws them
  (ajcraswell@gmail.com)
- Choose your organization when WorkOS asks at sign-in, switch organizations from Home's account menu, and give project
  pictures' phone frame a shadow of its own. (ajcraswell@gmail.com)
- Send errors, crashes and hangs from every process to Sentry, on by default (ajcraswell@gmail.com)

### Patches

- Boards take their size once the zoom settles, so they no longer measure themselves on almost every frame of a zoom
  when frames run slow (ajcraswell@gmail.com)
- Scrub keys, tokens and passwords from the errors and breadcrumbs sent to Sentry (ajcraswell@gmail.com)

## 0.20.0

Fri, 06 Nov 2026 10:01:34 GMT

### Minor changes

- Keep a size or inset off the spacing scale, flagged with the nearest step one click away, and nudge layers by 1px
  (ajcraswell@gmail.com)

## 0.19.0

Fri, 06 Nov 2026 08:51:09 GMT

### Minor changes

- Home's first time offers the example where Parity has it, empty lists and For you say what will show up, and projects
  whose folders are gone are flagged (PAR-188) (ajcraswell@gmail.com)

## 0.18.0

Fri, 06 Nov 2026 07:13:55 GMT

### Minor changes

- Layers draws only the rows in view, closes rows opened for an earlier selection, and adds search, Collapse all, an eye
  on each layer and dragging designs to reorder them (ajcraswell@gmail.com)

## 0.17.0

Fri, 06 Nov 2026 05:34:50 GMT

### Minor changes

- Read prefers-color-scheme blocks as a theme: a project's dark block is its dark theme, the light values stay the
  defaults, and each frame draws the block for its own mode (ajcraswell@gmail.com)

## 0.16.0

Fri, 06 Nov 2026 05:21:25 GMT

### Minor changes

- Frames on the canvas: the frame tool draws them, text and anything landing on the empty canvas make them, and Convert
  to switches between frames, components and screens (ajcraswell@gmail.com)
- Show component previews in the Components panel, in Names, List and Grid views, with each component's card, and in the
  insert picker (ajcraswell@gmail.com)

### Patches

- A design's console messages from a click or a key on the canvas are kept, at the line that wrote them
  (ajcraswell@gmail.com)
- Spacing handles no longer cover a layout's children, so a click on a child still selects it (ajcraswell@gmail.com)
- Keep hover and selection outlines on their layers in every frame of a zoom, and stop the overlays laying the page out
  partway through each frame (ajcraswell@gmail.com)

## 0.15.0

Fri, 06 Nov 2026 04:24:59 GMT

### Minor changes

- Errors and warnings from the designs show with a count in the status bar, on each board and by design in a Console
  panel (ajcraswell@gmail.com)
- In development, each element a project's JSX writes carries its file, line and column: the inspector's Code tab shows
  and opens it, parity components gives each component's file, and Measure each node's source (ajcraswell@gmail.com)
- Drag a layout's padding and gaps on the canvas, type or pick a value, resize several layers together or from the
  middle, and double-click an edge to hug or fill (ajcraswell@gmail.com)

## 0.14.0

Fri, 06 Nov 2026 03:55:31 GMT

### Minor changes

- Export layers and designs as PNG or JPG at 1x to 3x from the Design tab's Export section, the canvas and Layers menus,
  and Ctrl+Shift+E (ajcraswell@gmail.com)

## 0.13.0

Fri, 06 Nov 2026 03:23:07 GMT

### Minor changes

- Sign in to Parity with Google, GitHub, Microsoft or a work email, in your browser through WorkOS
  (ajcraswell@gmail.com)

### Patches

- Read the project service's caches, Portless's files, Storybook's index and its environment through zod schemas, so a
  corrupt cache reads as empty (ajcraswell@gmail.com)

## 0.12.7

Fri, 06 Nov 2026 02:49:03 GMT

### Patches

- Check agents' requests to the app with the CLI's schemas, so a malformed body, an unknown method or bad params get
  invalid_input with their path (ajcraswell@gmail.com)
- Check and evaluate decorator and sample values in one core module, with one copy of icon alias grouping
  (ajcraswell@gmail.com)
- Read package manifests, shadcn's components.json and tool configs through zod schemas, naming the file and field at
  fault (ajcraswell@gmail.com)
- Render jobs are built, named and scaled in one module, and component previews draw their portals in place again
  (ajcraswell@gmail.com)
- Snippet API functions check their arguments with zod and refuse a wrong one as invalid_input naming its field
  (ajcraswell@gmail.com)
- Open projects through a factory that takes its adapters, and keep .par saves inside the project folder
  (ajcraswell@gmail.com)

## 0.12.6

Fri, 06 Nov 2026 01:41:30 GMT

### Patches

- Split lint, board geometry and frame reading out of the agent workspace, and type its api() (ajcraswell@gmail.com)
- Check the main process's IPC arguments, files, environment and render page answers with zod (ajcraswell@gmail.com)
- Library files, their edits and decorator values are checked with zod schemas, and a decorator value's form is checked
  when the file loads. (ajcraswell@gmail.com)
- Checks the clipboard, drag payloads and saved preferences with zod: a copy or drop that doesn't parse is refused, and
  a saved value that doesn't read falls back to its default without resetting the rest (ajcraswell@gmail.com)
- Keep each project's TypeScript program in @parity-app/code's program cache, which the type checker worker calls
  (ajcraswell@gmail.com)
- The text editor writes an edit to the state whose text it showed, even when the state it was picked in is gone
  (ajcraswell@gmail.com)

## 0.12.5

Fri, 06 Nov 2026 01:01:44 GMT

### Patches

- Work out which design, state and viewport an edit lands on in one place, and place the text tool's text where a drop
  would land (ajcraswell@gmail.com)

## 0.12.4

Fri, 06 Nov 2026 00:40:08 GMT

### Patches

- The agent server answers through @parity-app/agent's dispatch; the app keeps only the HTTP server and its host
  (ajcraswell@gmail.com)
- Style rows reset everything their edits write, and read a layer's parent inside instances as the copy shows it
  (PAR-567) (ajcraswell@gmail.com)

## 0.12.3

Fri, 06 Nov 2026 00:18:31 GMT

### Patches

- A coded error from the project service reaches the window with its code, field and alternatives (ajcraswell@gmail.com)
- The window answers the project service's agent.supports requests again (ajcraswell@gmail.com)
- Absolutely placed layers preview while dragged and save once on drop; dropping from the panel and layer snapping
  measure less per move; a field scrub commits without a gesture of its own. (ajcraswell@gmail.com)
- Requests between the window, the project service, main and the type checker go through one channel, and the service
  checks each request the window sends it (ajcraswell@gmail.com)
- Refuse SetTokens values the token detail refuses: brackets, missing tokens, loops, and values not of the token's kind
  (ajcraswell@gmail.com)

## 0.12.2

Thu, 05 Nov 2026 23:43:49 GMT

### Patches

- The CLI and MCP server check Parity's answers before reading them, and say what they can't read; MCP execute refuses
  fields it doesn't take (ajcraswell@gmail.com)

## 0.12.1

Thu, 05 Nov 2026 22:59:52 GMT

### Patches

- Component previews draw dialogs, popovers, menus and closed content open, and say when a component draws nothing of
  its own (ajcraswell@gmail.com)

## 0.12.0

Thu, 05 Nov 2026 22:43:02 GMT

### Minor changes

- Home and new tabs show each project's picture: its first screens as last saved, taken from the canvas when it opens
  and after each save, flipping through them on hover (ajcraswell@gmail.com)
- Check what a token edit may write (valueProblem, loopProblem, builtOn, checkTokenEdit), with CSS.supports passed in
  (ajcraswell@gmail.com)

### Patches

- get_app_state marks the project's first mode primary; it marked none before. (ajcraswell@gmail.com)
- Make component is refused when any variant option, shown on the board or not, would change the part
  (ajcraswell@gmail.com)
- Build the Layers row menu from the command registry, so its Hide acts in the state the selection was picked in, and
  take the toolbar's and Wrap in layout's labels and keys from the keymap (ajcraswell@gmail.com)
- Resetting a text layer's Resizing in a state now clears the grow its switch set, as well as width and height
  (ajcraswell@gmail.com)
- Point to problems in a project file more exactly: a length that is neither a number nor a string, padding of the wrong
  form, and mistakes in its modes (ajcraswell@gmail.com)
- State labels shrink as board titles do when zoomed out, and hide only when their row is too short on screen to hold
  them (ajcraswell@gmail.com)
- An export taken back off the component list now stays listed only if detection lists it, and keeps its mark while it's
  still listed by hand. (ajcraswell@gmail.com)
- Zoomed far out, board titles clip to their board and hide once it's under 24 pixels wide on screen, and state labels
  and mode captions hide before titles do (ajcraswell@gmail.com)
- rem in frames follows the project's html font size, as in Chrome, so a project with html { font-size: 62.5% } gets
  10px to the rem (ajcraswell@gmail.com)
- Show the whole value in the inspector's Width and Height fields, at every panel width (ajcraswell@gmail.com)
- Waking a project's frames after a code change no longer makes React report "Maximum update depth exceeded"
  (ajcraswell@gmail.com)
- Component previews are drawn in the project's mode that matches Parity's light or dark theme, and each theme's
  pictures are kept (ajcraswell@gmail.com)
- Component previews no longer show a stray scrollbar when part of a component reaches past its box
  (ajcraswell@gmail.com)
- A board's gutter, caption band and space between previews keep their screen size up close, and shrink with the canvas
  past 40% (ajcraswell@gmail.com)

## 0.11.1

Thu, 05 Nov 2026 20:31:21 GMT

### Patches

- Components that set their own size, and library parts whose examples give them no text, are inserted without their
  name cut off inside them (ajcraswell@gmail.com)
- Frames no longer pick up Parity's own CSS variables: a variable the project uses but never defines takes its fallback,
  as in Chrome (ajcraswell@gmail.com)
- Find installed packages and their entries one way, so a library's types under exports, named re-exports and the
  registry's newest file read the same in the app, libgen and parity lib check (ajcraswell@gmail.com)

## 0.11.0

Thu, 05 Nov 2026 12:23:23 GMT

### Minor changes

- Open Home and new tabs on the start page, with your recent and starred projects, search, Open and New project
  (ajcraswell@gmail.com)

### Patches

- Leave out malformed tokens in a library's DTCG files, and note why, instead of reading them as broken CSS
  (ajcraswell@gmail.com)

## 0.10.1

Thu, 05 Nov 2026 11:43:57 GMT

### Patches

- Layers' Hide in and Show in name the variant option the change goes to, not the state (ajcraswell@gmail.com)

## 0.10.0

Thu, 05 Nov 2026 11:30:08 GMT

### Minor changes

- Agent overlap warnings tell board collisions (overlap) from a title too close (title_clearance), say whether sizes are
  measured or estimated, and count crowded boards a call didn't touch (canvas_overlaps) (ajcraswell@gmail.com)

## 0.9.1

Thu, 05 Nov 2026 11:11:28 GMT

### Patches

- Check registry entries, caller names and the app's error details with zod (ajcraswell@gmail.com)
- List an export you put on the component list straight away, and keep a new component that takes a removed one's id
  when files change (ajcraswell@gmail.com)
- Every canvas drag now ends the same way: a title drag and a box select end when the window loses focus, and a title
  drag or a frame's resize waits for the pointer to move 4 pixels (ajcraswell@gmail.com)
- Measure explains that it lays out one frame when given a list, "all" or "shown", and lists the state or mode ids it
  takes (ajcraswell@gmail.com)

## 0.9.0

Thu, 05 Nov 2026 10:01:48 GMT

### Minor changes

- Execute results group warnings by category and message, with a severity, a count and every place, and the text lists
  them under render failures, warnings and suggestions (ajcraswell@gmail.com)
- Problems names the node that overflows, what it overflows (the frame or the ancestor that clips it), both boxes and
  the pixels past each edge; Measure gives each node's parent and the state and mode it drew (ajcraswell@gmail.com)
- Suggest the project's color token that fixes each contrast failure, and apply it in one click (ajcraswell@gmail.com)
- Open a project with no Parity file on a Home screen that draws the app's / page on desktop and mobile
  (ajcraswell@gmail.com)
- Execute results list the responsive, state and variant patches each Replace discarded, in discarded and under
  Discarded by Replace (PAR-455) (ajcraswell@gmail.com)
- Props reports a component's composition: the parents or provider it goes inside, the parts it holds, its slots and an
  example to insert (PAR-454) (ajcraswell@gmail.com)
- New screen and New component in the File and Object menus, the canvas menu, Search actions and Layers, and what lands
  on the empty canvas makes a screen named after it (PAR-546) (ajcraswell@gmail.com)
- A project file keeps tables, operations and routes placed on the canvas, typed links drawn by hand, and the source
  each lens reads (PAR-16) (ajcraswell@gmail.com)

### Patches

- Frames in a theme's mode get the attribute the stylesheet switches it on with, so [data-theme=dark] themes show in
  Dark frames (ajcraswell@gmail.com)
- List the props a library's component declares beside its element's attributes, such as Nova's isActive, as its own,
  with their defaults (ajcraswell@gmail.com)
- A tsconfig change while a project is open sorts the app's sources again, so components it now leaves out drop off the
  list (PAR-492) (ajcraswell@gmail.com)
- Storybook now starts and stops through a shared process manager, which keeps each server's port and output and stops
  what it started when the project closes (PAR-20) (ajcraswell@gmail.com)
- Take radius-full, Tailwind's rounded-full, in the radius field, and list it with GetTokens as a keyword
  (ajcraswell@gmail.com)
- An unknown state now says calls take a state's id, lists each id beside its name, and points a state's name to its id
  (ajcraswell@gmail.com)

## 0.8.1

Thu, 05 Nov 2026 07:14:25 GMT

### Patches

- Size the View menu's checkbox icons like its other icons. (ajcraswell@gmail.com)

## 0.8.0

Thu, 05 Nov 2026 06:17:53 GMT

### Minor changes

- Draw a component that puts its style on an element inside it in a div that takes the style, so a size applies to the
  whole component (ajcraswell@gmail.com)

### Patches

- Distance labels on the canvas sit beside the measuring line, in black, so the line shows even between layers a few
  pixels apart (ajcraswell@gmail.com)
- Draw the canvas sharp once the zoom settles, rather than leaving it blurry after zooming in from far out
  (ajcraswell@gmail.com)
- The inspector's rows end at one right edge, with a field's reset arrow beside it (ajcraswell@gmail.com)

## 0.7.1

Thu, 05 Nov 2026 05:14:33 GMT

### Patches

- The insert picker takes the keys as soon as it opens, and is gone as soon as it closes, so Escape straight after /
  closes it and the next click reaches the canvas. (ajcraswell@gmail.com)

## 0.7.0

Thu, 05 Nov 2026 03:41:00 GMT

### Minor changes

- Add frames, a light kind of design drawn once at its own size, to the project file, the editor and the agent API
  (ajcraswell@gmail.com)

### Patches

- Menus say Convert to component and Convert to screen for changing a design's kind, and undo names the change the same
  way (ajcraswell@gmail.com)

## 0.6.1

Thu, 05 Nov 2026 02:45:21 GMT

### Patches

- Paste here goes into a component's slots, keeps a stretched copy's right and bottom, and a right-click while the
  canvas menu is open opens it again there; the menubar greys what can't act on a layer inside an instance
  (ajcraswell@gmail.com)
- Preview number props on the canvas while typing or scrubbing, round Opacity to whole percentages, and name Mixed+8 in
  the note on what differs across selected layers (ajcraswell@gmail.com)
- Keep frame bitmaps and component previews as lossless WebP, about 40% smaller than the PNGs they replace, with the
  same pixels (ajcraswell@gmail.com)
- Turn a prop off in one state when the base design has it on, and reset it from the inspector (ajcraswell@gmail.com)

## 0.6.0

Thu, 05 Nov 2026 02:13:33 GMT

### Minor changes

- Labels use one word for each thing: screens and components rather than designs, previews for a board's per-mode tiles,
  Show first rather than Main, and the first state's own name rather than Base (ajcraswell@gmail.com)
- A state can take away a prop or style the design sets, and Paste style in a state leaves only the copied style
  (ajcraswell@gmail.com)

### Patches

- Box a component that draws only text by its text, so it can be hovered, picked and sized on the canvas
  (ajcraswell@gmail.com)
- Zoomed far out, frames show a placeholder until their bitmap comes instead of drawing first, so a project opens
  sooner, and boards keep their size when their frames later draw (ajcraswell@gmail.com)
- Give a component layer in an asChild slot the class, attributes, handlers and ref its parent hands it
  (ajcraswell@gmail.com)
- Saving after undoing a token value a theme didn't have takes it back out of the stylesheet, with any rule it leaves
  empty (ajcraswell@gmail.com)
- Draw the app's menus, dialogs and controls with Buildkit's Base UI Nova kit instead of copied Radix components
  (ajcraswell@gmail.com)

## 0.5.0

Thu, 05 Nov 2026 00:49:09 GMT

### Minor changes

- A tab that isn't showing lets its frames sleep after 3 seconds, freeing their DOM and React roots; switching back
  shows bitmaps at once and wakes only the frames near the view. (ajcraswell@gmail.com)
- parity status and the MCP get_status tool say where a tab's edits stand: its revision, what's applied but not saved
  (files and token values), the last save and failed writes, and undo and redo, with an optional bounded summary.
  get_app_state carries the revision too. (ajcraswell@gmail.com)
- Reopen a project in about 3 seconds: frames show the bitmaps kept from last time without drawing first, the project
  opens as Parity starts, and kept bitmaps carry their frame's height (ajcraswell@gmail.com)
- Frame bitmaps are kept on disk in app data, so a project opened again shows them without capturing each frame again;
  View > Clear bitmap cache removes them. (ajcraswell@gmail.com)
- Components show their preview in a card beside the row, and right-clicking one offers View in Storybook and View code,
  which opens it in your editor (chosen in Settings). Tooltips are raised in the theme's own colors. Taking a component
  off the list by hand is gone. (ajcraswell@gmail.com)
- Agents get every result as data, in --json and MCP structuredContent with published output schemas, and failures as
  stable error codes with the input at fault, whether to retry, and the valid ids to use instead. Token and console
  reads are bounded by --limit. (ajcraswell@gmail.com)
- Snap absolutely placed layers to their siblings and parent while moving and resizing, with guides, distances and even
  spacing (ajcraswell@gmail.com)
- Make a picture of every component offscreen, after the canvas's bitmaps, and keep it on disk so a reopened project
  draws none again (ajcraswell@gmail.com)
- Drop components from the panel into the slot under the pointer in grids and wrapping rows, and bring a duplicated or
  pasted design that lands off screen into view (ajcraswell@gmail.com)
- parity modes and the MCP get_modes tool list the project's viewports (the ids Responsive takes) with their window
  heights, its modes (the ids renders take) resolved, and what each design shows; naming a design adds its frames'
  sizes. Mistyped ids now suggest the nearest ones first. (ajcraswell@gmail.com)
- Agents' calls go to the running copy of Parity that has their project open; --tab active names what the person is
  looking at, and a call without --tab goes to the project its folder is in (ajcraswell@gmail.com)
- Undo takes back a whole drag, resize, scrub or run of arrow presses in one step, however slowly it was made
  (ajcraswell@gmail.com)

### Patches

- Keep text given to a new library part rather than labelling over it (ajcraswell@gmail.com)
- Add pnpm dev:prod, which runs Parity's window on React's production build, while pnpm dev stays on the development
  build (ajcraswell@gmail.com)
- pnpm dev on a port other than 5310 no longer stops before its window opens, since the updater is only made for
  installed builds. (noreply@anthropic.com)
- Keep the canvas idle while a selection is held: the overlay measures only after something changes or while a frame
  animates (ajcraswell@gmail.com)
- A call without --tab finds the project its folder is in through links, such as macOS's /var (ajcraswell@gmail.com)
- Opening a project no longer pre-bundles its build tools, such as ESLint and Vite, which failed on Tailwind's native
  module. (noreply@anthropic.com)
- Capture frames' bitmaps in four offscreen windows at once, so a project opened for the first time has them in less
  than half the time (ajcraswell@gmail.com)
- Drop into right-to-left and reversed layouts where the pointer is, snap and undo gestures correctly, and bring pasted
  designs into view at their real size (ajcraswell@gmail.com)
- A second copy of Parity leaves agents with the copy already running unless started with PARITY_AGENT_TAKE_OVER=1, and
  a copy that quits gives the agent file back instead of removing another copy's (ajcraswell@gmail.com)
- Name the missing script when the project service can't start, and let pnpm dev run Electron as installed for
  comparison (ajcraswell@gmail.com)
- The running status light breathes by opacity, so an idle window no longer repaints every frame (ajcraswell@gmail.com)
- Inserting a component that passes its props to an input no longer gives it children, and library samples' text ends at
  a sentence or a whole word (ajcraswell@gmail.com)

## 0.4.2

Sun, 01 Nov 2026 03:52:41 GMT

### Patches

- Include the tldraw trial license in desktop beta builds (ajcraswell@gmail.com)

## 0.4.1

Sun, 01 Nov 2026 02:14:37 GMT

### Patches

- Keep automatic update downloads silent until restart is ready and use the quick brown fox typography sample
  (ajcraswell@gmail.com)
- Zoomed-out frames and agents' renders no longer draw a component from a file that's gone (noreply@anthropic.com)

## 0.4.0

Sat, 31 Oct 2026 23:36:31 GMT

### Minor changes

- Agent calls merge per design with edits made while they run, and are refused naming the designs when both changed the
  same one (noreply@anthropic.com)

### Patches

- pnpm dev starts the project service again on Linux, and no longer treats Parity's copy of Electron as an installed
  build. (noreply@anthropic.com)
- Load aliased library providers, icons and sample values consistently and reject obsolete manifests
  (ajcraswell@gmail.com)
- The agent's Get with a state or mode reads nodes as the board draws them: bound values, variant options, responsive
  patches and layers inside instances (noreply@anthropic.com)
- Agents' frames, exports and accessibility checks draw library designs' instances and unsaved token values as the
  canvas does, and no offscreen frame inherits another's token values (noreply@anthropic.com)
- The canvas menu says Show for a layer the variant shown hides, and Make component checks the result against the
  variant and param defaults the board shows (noreply@anthropic.com)
- Props refresh after you change tsconfig paths or dependencies (noreply@anthropic.com)
- Estimate the size of a board the canvas hasn't drawn from its frames, laid out as the canvas lays them out, so
  Overlaps() catches wide and tall boards (noreply@anthropic.com)
- Read token themes and categories the same way in parity lib and the app: [data-theme] attributes are themes, names
  like fontSizeBase300 are font sizes, and a library's .dark beats its prefers-color-scheme block
  (noreply@anthropic.com)
- Show update checks in toasts and label installed beta builds independently of the update channel
  (ajcraswell@gmail.com)
- Fingerprint every lockfile package-manager detection recognizes, such as npm-shrinkwrap.json, and the tsconfigs a
  project's configs extend, so cached props refresh when they change (noreply@anthropic.com)
- Keep values under media queries, such as a prefers-color-scheme: dark block, out of the default theme's tokens
  (noreply@anthropic.com)
- Generate an app's library from the same sources and global stylesheets project detection finds, following tsconfig
  references, the HTML entry's stylesheet imports and relative @imports (noreply@anthropic.com)
- Editing the modes GetModes returns, then setting them, no longer fails as a conflict or loses the edit
  (noreply@anthropic.com)
- Draw zoomed-out bitmaps, agent screenshots and measurements, exports and accessibility checks in the same window
  height as the live frame, keeping a mode's screen height when the frame grows with its content (noreply@anthropic.com)
- Align, Wrap, resizing, nudging, dragging and the clipboard read layers as the frame shows them, with variants,
  viewport patches and bound values; a copied binding is kept only where the design pasted into has that param
  (noreply@anthropic.com)

## 0.3.0

Sat, 31 Oct 2026 21:19:58 GMT

### Minor changes

- Download Parity updates in the background on Windows and Linux, with a manual download option on Mac
  (ajcraswell@gmail.com)

### Patches

- Preserve full declared agent names and keep long names readable on the canvas (ajcraswell@gmail.com)

## 0.2.0

Sat, 31 Oct 2026 11:30:08 GMT

### Minor changes

- Install Parity on Windows, macOS and Linux (ajcraswell@gmail.com)
- Run Parity from built files without a development server and open projects reliably on first launch
  (ajcraswell@gmail.com)

## 0.1.0

Sat, 31 Oct 2026 05:16:05 GMT

### Minor changes

- Show Fluent slots such as icon, contentBefore and header the way children shows: text, or layers in their slot
  (ajcraswell@gmail.com)
- The Tokens panel opens a token's detail, orders tokens by value and stays whole when narrow. (ajcraswell@gmail.com)
- Agents list the project's icon sets with Icons() and find icons in one with Icons(set, { search })
  (ajcraswell@gmail.com)
- Give empty layouts a size on the canvas, keep resize handles off small layers, let Escape cancel resizes and title
  drags, and show the grabbing, resize and text cursors over the canvas (ajcraswell@gmail.com)
- List icons whose names end in a number, and insert the name each icon set's types prefer (ajcraswell@gmail.com)
- Drop PNG, JPEG, GIF, WebP and SVG files from Explorer or Finder onto the canvas: they land in the layout under the
  pointer, or as a new design on the empty canvas (ajcraswell@gmail.com)
- Edit text in place as a design tool does: the double-clicked word opens selected, the editor follows the text as you
  pan and zoom and wraps at its width, Escape keeps the edit, and Enter waits for an input method; text layers size as
  auto width, auto height or fixed (ajcraswell@gmail.com)
- Name a library's own components by its id, list its canvas's component designs in apps that install it, and place them
  linked or as detached copies (ajcraswell@gmail.com)
- Charts, axes, series and grids from Recharts, so a ChartContainer can hold a bar, line or area chart
  (ajcraswell@gmail.com)
- Frames zoomed far out let go of their designs while their bitmaps show, and draw them again as they come into view
  (ajcraswell@gmail.com)
- Infer each token's kind from its value, then its name, else none, and preview gradients and type styles
  (ajcraswell@gmail.com)
- Open the insert picker in a tenth of the time, the project's own components first, internal parts, providers and app
  plumbing left out until searched for by name, and a component found in two places listed once. The Components panel
  searches the same way, and lists hidden components last in each source under a heading of their own
  (ajcraswell@gmail.com)
- The Tokens panel's sections fold from their titles, a token's detail opens on hover, and a click on its row copies its
  name (ajcraswell@gmail.com)
- Insert library components with the values their package makes, such as a tree view's collection (ajcraswell@gmail.com)
- Frames run the production builds of the project's dependencies, React's among them, so the window no longer keeps a
  stack for every element (PAR-198) (ajcraswell@gmail.com)

### Patches

- Close a project whose tab closes while it's still opening (ajcraswell@gmail.com)
- Name Buildkit's shadcn libraries Shadcn and their style (Shadcn Nova, Shadcn Luma and the rest) instead of Buildkit
  nova (ajcraswell@gmail.com)
- Tell open windows when a restarted builder moves to a new port, which no guest has used (ajcraswell@gmail.com)
- Stop the window scrolling and throwing off canvas clicks (ajcraswell@gmail.com)
- Frames and their bitmaps draw again when a component the type checker finds, or finds moved, comes from a new file
  (ajcraswell@gmail.com)
- Find a Storybook that Portless routes to by asking its port, whatever set up its name, instead of calling dev-domains
  (ajcraswell@gmail.com)
- Every list of tokens, in the Tokens panel and the inspector's pickers, shares one order, smallest first.
  (ajcraswell@gmail.com)
- Insert parts that hand their children to an input without a text label (ajcraswell@gmail.com)
- Draw the Icons tab's icons larger, in square cells that fill each row (ajcraswell@gmail.com)
- Pasting text that starts like a Parity copy but can't be read shows a message instead of pasting its JSON, and pasted
  designs keep their ids when those ids are free. (ajcraswell@gmail.com)
- Parity's UI loads only the lucide icons it uses, and its prebundled dependencies minified, so its window holds less
  (ajcraswell@gmail.com)
- Give tldraw's overlay canvas a bitmap only while an overlay shows, saving about 36 MB (ajcraswell@gmail.com)
- Retry a frame's bitmap capture that failed, rather than leaving the frame without one (noreply@anthropic.com)
- Read a project's Tailwind theme only with the Tailwind it installs, never Parity's own (ajcraswell@gmail.com)
- Give a reopened project a new port, so closing frees its canvas (ajcraswell@gmail.com)
- Give every color swatch in the Tokens panel one clean edge: no white corners on dark swatches, and a faint hairline so
  black and white ones stand off the panel (ajcraswell@gmail.com)
- List providers so the parts inside them insert, and place more library parts from the app's errors
  (ajcraswell@gmail.com)
