# Change Log - @parity-app/desktop

<!-- This log was last generated on Thu, 05 Nov 2026 07:14:25 GMT and should not be manually modified. -->

<!-- Start content -->

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
