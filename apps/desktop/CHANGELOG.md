# Change Log - @parity-app/desktop

<!-- This log was last generated on Sat, 31 Oct 2026 23:29:26 GMT and should not be manually modified. -->

<!-- Start content -->

## 0.4.0

Sat, 31 Oct 2026 23:29:26 GMT

### Minor changes

- Agent calls merge per design with edits made while they run, and are refused naming the designs when both changed the
  same one (noreply@anthropic.com)

### Patches

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
- pnpm dev starts the project service again on Linux, and no longer treats Parity's copy of Electron as an installed
  build. (noreply@anthropic.com)

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
