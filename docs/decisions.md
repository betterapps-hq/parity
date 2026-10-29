# Decisions

Calls made while building Parity without stopping to ask. Each says what was decided and why. The ones marked **Open**
still need your call.

## Project files

- **One `.par` project file per project.** Designs, notes and modes live in it. The main document is the `.par` at the
  project root, else the first `.par` found, else a new `<package-name>.par`. Other `.par` files anywhere in the project
  still load, and new designs go to the main one.
- **Modes live inside the main `.par`.** They're written only once they differ from the defaults, so a fresh project's
  file stays small.
- **`.lib.par` describes a component library: its name, id, stylesheet, breakpoints, tokens and its own canvas.** You
  asked for the tokens and the canvas. Version 2 adds `tokens` and `canvas`, and version 1 files still load. It sits at
  a package's root, and any dependency with one loads as a library, with or without Parity's catalog.
- **A library's tokens are DTCG,** the Design Tokens Community Group's format and resolver (2025.10), so the tools that
  read DTCG read the same tokens. `tokens` is a path to a token file or a resolver, or either written inline. A
  resolver's themes become values per context, such as `default` and `dark`.
- **The Tokens panel shows what a `.lib.par` says about a token** under its name. A DTCG path matches a custom property
  by its whole path or without its first group: `color.primary` is `--color-primary` or `--primary`. Described tokens
  that match no custom property are listed as "Described only", because frames render from the stylesheet.
- **A library's own `.lib.par` opens on the canvas.** When the open project's root has one, its `canvas` holds designs
  as a `.par` does: the author arranges them, and Save writes them back into `canvas`, leaving the rest of the file as
  written. New designs go there when the project has no `.par` at its root. A `.lib.par` anywhere else describes another
  package and isn't opened.
- **A library's designs show in the projects that use it,** under the library's section in Components, placed as linked
  instances that follow the library or as detached copies. You chose this on 2026-10-28. Their components are named as
  the library's (`nova/Button`).
- **Open:** Buildkit's nova `tokens.json`, which isn't DTCG yet.
- **Saving is explicit, as in a document editor.** Edits stay unsaved until Save (Ctrl+S). The tab shows a dot (it turns
  into the close button on hover). The status bar only says when a save failed, and clicking that tries again: you asked
  to remove its "Saved" and "Unsaved changes", as the tab's dot already shows them. Undoing back to what was saved makes
  the file clean again. File > Preferences > Save automatically turns on saving each edit about 300ms after it's made,
  and is off by default.
- **Closing a tab or quitting with unsaved changes asks** Save, Don't save or Cancel, with Save focused so Enter does
  it. Quitting with several projects unsaved asks once, with Save all.
- **Changes from outside reload as one undoable step.** That covers agents, git and text editors. A file with unsaved
  changes here isn't overwritten: a notice offers "Load from disk" instead. The app ignores its own writes by
  remembering what it last wrote.
- **Save a copy** writes every design, note and the modes into one `.par` wherever you choose. It suggests the folder
  above the project, because a `.par` inside the project would load as more designs.
- **Open project file** opens the project a `.par` belongs to: the nearest folder above it with a `package.json`.

## Menus and preferences

- **File, Edit and View are drawn by the app, in the title bar.** That's the same on every system. On macOS the system
  menu keeps only the app, clipboard, window and developer commands for now. **On macOS, File, Edit and View will also
  be mirrored into the system menu bar,** which you chose on 2026-10-28, because Mac users look for commands there.
- **Electron's default menu is replaced.** It closed the window on Ctrl+W and reloaded it on Ctrl+R. Developer tools
  stay on Ctrl+Shift+I.
- **The theme defaults to dark** (what the app looked like before), with light and system under File > Preferences. It
  covers the app's chrome and canvas only; designs keep whatever theme their mode picks. The main process remembers it
  too, so the window opens in the right theme without a flash.
- **Export renders every state, in the design's main mode and the modes shown beside it,** at 2x by default (1x and 3x
  under File > Export). Files are named after the design, plus the state and mode when there's more than one. It exports
  the designs as they are on the canvas, saved or not, and doesn't save them.
- **Recent projects:** the last 10 that opened successfully.

## Canvas

- **No tldraw licence for now.** You decided we won't get one anytime soon, so the "Get a license for production"
  watermark stays and nothing waits on it.
- **Snapping is on by default.** Designs lock to each other's edges and centres within 8 screen pixels. Hold Ctrl to
  move freely, or turn it off under View.
- **Double-click drills in first, as in Figma.** It edits text only on a selected text layer that's the deepest thing
  under the pointer.
- **Side panels have one row of tabs, Pen style.** The open tab shows its name and the rest show only their icons. The
  left panel's tabs are Layers, Components, Icons, Images and Tokens; the right's are Design, Modes and Accessibility.
  Each panel remembers its open tab.
- **A collapsed panel becomes a rail** of its tab icons, under the button that expands it. Clicking an icon opens the
  panel on that tab.
- **The status bar's counts are links.** Components opens the Components tab and tokens opens Tokens. It doesn't show
  the project's path.
- **Zoom goes from 1% to 800%,** past tldraw's 5%, so a project with dozens of screens fits in view at once. The steps
  are 1, 2.5, 5, 10, 25, 50, 100, 200, 400 and 800%.
- **View > Performance stats** shows frames per second, memory and CPU in the status bar, off by default. CPU is a share
  of all cores, and memory and CPU cover every process of the app: the windows, the offscreen renderer, the project
  service (with the project's Vite), the GPU and Electron's helpers. Clicking it shows the last minute's frame rate, the
  longest recent frame and each process. Storybook runs outside the app, so it isn't counted. Measuring runs only while
  the stats show.
- **A selected design shows only its own rounded outline.** tldraw's square selection box is drawn only around several
  designs at once.
- **Copy and paste go through the system clipboard,** in a JSON envelope Parity recognises, so copies paste across
  projects and windows. Copied layers bring the state they were copied in with them, and pasting gives them new ids.
  Plain text pastes as a text layer, or as a note on the canvas when nothing is selected. Copy style and paste style
  stay inside the app. Pasted PNG, JPEG, GIF, WebP and SVG images up to 20 MB are saved to `public/images/`.
- **Several layers of one design, or several designs, can be selected together.** The inspector shows what they share
  and lists what differs, with a "Mixed" placeholder in each field that differs.
- **Dragging a layer** shows an outline under the pointer, and the layouts around it reflow live around a copy of it
  where it would land, with a line only where they can't. Moving within a design keeps ids and state overrides. Moving
  to another design takes the shown state with it and gives new ids. Absolutely placed layers move by their insets,
  rounded to half a spacing step.
- **Wrap in layout** is Ctrl+G or Shift+A and copies the parent's direction and gap; Ctrl+Shift+G unwraps.
- **Align and distribute use Figma's keys,** Alt with A, H or D across and W, V or S down, plus Alt+Shift+H or V to
  distribute. Inside auto layout, aligning across sets each layer's own alignment and aligning along sets the parent's
  justification. Designs on the canvas align by their bounds.
- **The layout grid** (Shift+G) has 4, 8 or 12 columns for frames under 600px, under 1024px and wider, with 16, 24 and
  32px margins and 16, 24 and 24px gutters. These are fixed until breakpoints or library metadata provide them.
- **The insert picker** (`/` or Shift+I) offers text, rows and columns, component designs, the project's and libraries'
  components, and icons once two letters are typed. It inserts where a paste would.
- **Interact (I) hands the pointer and keys to the designs,** so their real components work as in a browser: tabs
  switch, fields take typing, menus open. Clicks and keys stop at the design, so the canvas doesn't select, drag or run
  a shortcut too; scrolling still pans. Outlines and handles hide while interacting. An Escape the design doesn't use
  steps out of it, and the next one goes back to Move and select. When interacting stops, every frame starts again from
  the design, so nothing you tried is left on the canvas, and the project isn't changed by it.
- **Keys typed into a design are the design's in any tool,** found through the event's composed path, because shadow DOM
  hands the canvas's listeners the frame instead of the field inside it.

## Main components and instances

Phase 1 of [components](proposals/components.md), as the New Editor Features session built it; its "Phase 1, as built"
section has the details. The user asked for "variants, instance overrides and the main-component workflow" and said to
"leave code generation for later". The rest are that session's calls.

- **Variants are params of type `variant`,** not `enum` as the proposal had it. Each option has an id, a name and
  patches like a state's, and an instance picks one through its args.
- **Patches apply in a fixed order:** responsive, then variant options, then the state, then the instance's overrides,
  then patches reaching in from outside, such as a screen's states with `instance/inner` keys.
- **Instance overrides live on the instance** as `overrides: { innerId: NodePatch }`, with `nested/inner` keys for
  nested instances.
- **An edit inside an instance changes only that copy** in the base state, and belongs to the state in any other state.
- **Editing a text, prop or visibility the component binds to a param sets the instance's param value** instead of
  adding an override.
- **A component's board shows one combination of variants,** picked in its title bar. With a non-default option showing,
  base-state edits go to that option.
- **The variant grid shows each variant on its own, plus combinations someone pins.** You chose this on 2026-10-28 over
  every combination, which multiplies fast.
- **A component design in `.par` stays the source, linked to a real component file.** You set the direction on
  2026-10-28: "we need to link these to real components, and generate from the design, and intake changes from the
  code." You settled the details the same day:
  - **Drift shows on the design, and you approve each change.** In your words: "show an indicator on each design that is
    drifted from the code, then you would enter a menu where you could approve each change and write it back." That
    works both ways: design changes not yet in the file, and code changes not yet in the design, found by the hash of
    what Parity last wrote. Saving the `.par` doesn't write code. It's the same flow PR reviews will use.
  - **Hand edits come back where they fit.** Text, token classes, props and known components read back as changes to
    approve. Behaviour such as events and data comes in as props that developers wire from their own code. For an edit
    Parity can't read back, it asks whether to freeze the component as code or overwrite the edit.
  - **Existing components can be linked too.** You said: "our app should detect the components in the app. Whether
    that's via a scanner, ast, or storybook." Code Parity can't read shows as locked in the design.
  - **With Storybook in the project, each linked component gets a stories file,** plain CSF with one story per state,
    through the same review.
  - **The file goes in the project's own components folder,** `components.json`'s alias or wherever most components are,
    named like `member-row.tsx`, with no suffix.
  - **An instance override with no param behind it becomes one.** Parity adds the param to the main component, as an
    undoable design edit, so the override works in code. You asked: "Why not just do? This is part of the design
    process."
- **Layers inside an instance can't be moved, resized on the canvas or deleted.**
- **Swap keeps args, state and overrides that still match** by id or layer name. **Detach bakes everything into plain
  layers** with fresh ids, the root keeping the instance's id.

## Modes

- **Viewports carry a device**, used for its icon, **and a height** when they come from a device. Frames still grow with
  their content. **A device viewport can show its frames in a phone mockup,** which cuts them at the device's height, as
  you asked on 2026-10-28. It's an option on the viewport, off unless chosen, so designs show their full length by
  default.
- **Mode presets** come from three places: the project's breakpoint tokens, each library's `.lib.par` breakpoints, and a
  list of device sizes taken from Chrome DevTools' devices plus current flagships. A breakpoint starts at its width, so
  it's added as a viewport exactly that wide. Breakpoints in rem count 16px to the rem.

## Decorators

How frames get the providers, themes and locales a project's components need. The proposal is
[proposals/decorators.md](proposals/decorators.md).

- **Frames are wrapped in decorators that follow Storybook's decorator contract.** You decided this: existing apps
  should work as they are, and decorators must work without Storybook. A decorator takes the design to render and a
  context with `args`, `globals`, `parameters` and `loaded`, and returns what to render around it. A mode's values
  arrive as `globals`, so a decorator written for Storybook works in Parity unchanged, and the other way round.
- **A project without Storybook keeps its decorators in `.parity/preview.tsx`,** with the exports of Storybook's preview
  (`decorators`, `loaders`, `parameters` and `globalTypes`), so moving to Storybook later means moving the file. You
  chose this on 2026-10-28, with the proposal's other recommendations:
  - With both, Parity's file wins. You said to "reuse Storybook preview or it can be overridden with a .parity
    preview.tsx". With no Parity file, Storybook's preview is used as is. When the file exists it replaces Storybook's,
    and it can import `.storybook/preview` and spread its decorators to build on them.
  - What a decorator changes on `<html>` or `<body>` moves onto the frame's stand-in body. A frame that needs more
    renders in an iframe.
  - Parameters are set per design and per state, and saved in `.par`.
  - Parity offers to write the preview file from the providers the app's entry renders, and never writes it unasked.
- **How Parity and Storybook connect is written down in [storybook.md](storybook.md),** at your request, because you
  expect them to get too tightly coupled. It sets the boundary: Storybook stays optional, Parity reads only its public
  formats, and everything Storybook-specific sits in one adapter.

## Finding components

How Parity finds the components in a project. The proposal is
[proposals/component-detection.md](proposals/component-detection.md). You said to build it on 2026-10-28, with the
recommended answer to each of its questions.

- **A quick parse of every app file lists components first, and TypeScript's checker then confirms them** and adds what
  the parse can't see, such as `const Select = SelectPrimitive.Root`.
- **A component's id is its export name, gaining its folder only on a clash.** Two components named `FieldError` become
  `ui/FieldError` and `packing-fields/FieldError`, with as many parent folders as it takes to tell them apart. One
  exception keeps existing designs working: a component in the UI kit folder, the one `components.json` names or
  `src/components/ui`, keeps the bare name, because that folder was all Parity read before. A default export takes its
  declaration's name, else its file's.
- **Libraries are listed when they have a `.lib.par` or are in Parity's registry, plus workspace packages the app
  depends on.** Other dependencies, such as Radix or Base UI, show through the project's own wrappers.
- **Pages get their own section in the Components panel** until the routes lens can name them.

## Libraries, icons and images

- **Library components are namespaced by library,** as in `nova/Button`, so they never clash with the project's own.
  Their styles are imported right after Tailwind in the project's stylesheet, so the project's own tokens, declared
  later, still win.
- **Adding a library installs it with the project's package manager,** picked from the nearest lockfile, then reopens
  the tab.
- **Installed packages are found the way Node finds them,** in `node_modules` in the project or a folder above, not by
  resolving `<package>/package.json`. Packages whose `exports` leave that path out, such as Buildkit's nova, were
  otherwise never found.
- **The Components panel opens library sections** and collapses the project's own when there are several; any section
  collapses or expands on a click. Searching opens every section that matches.
- **Icons are components from the project's own icon package,** as in `lucide/Heart`, so generated code is the import a
  developer would write. The guest imports the whole package once. The Icons panel and the insert picker list the names
  from the project's own copy, as its manifest says to read them, and draw each icon with the project's own code. Agents
  are told the icon libraries too, so `lucide/Heart` isn't flagged as a component the project doesn't have.
- **A manifest names an icon set's shape,** because sets differ: one export per icon (Lucide, Heroicons, Phosphor,
  Tabler, Fluent), or data drawn by one component (Hugeicons, through `HugeiconsIcon`'s `icon` prop). Styles and sizes
  are either a prop (Phosphor's `weight`) or part of the name (`AddFilled`, `Add24Regular`), described by a pattern with
  `name`, `style` and `size` groups, so the panel shows one icon per name with a style picker and leaves sized copies
  out.
- **`.lib.par` version 3 describes a library whole,** so Parity needs no code per library: the package and version it
  was generated from with the range it covers (`package`), its components and what each was found as (`components`), its
  icons (`icons`) and its decorators (`decorators`), beside version 2's styles, breakpoints, tokens and canvas. Versions
  1 and 2 keep loading, and their fields stay as they were.
- **Parity keeps a registry of `.lib.par` files** (`@parity/registry`) for libraries that don't ship one: nova, Radix,
  Base UI, React Aria Components, MUI, Chakra, Mantine and Fluent UI, and Lucide, Hugeicons, Heroicons, Phosphor, Tabler
  and Fluent icons. A package's own `.lib.par` comes first; otherwise the registry file whose range covers the installed
  version, the newest generated first. The catalog the app installs from is the registry. Each file covers the newest
  major only, so MUI 7 and Mantine 8, inside the cutoff, have none yet; Lucide's covers 0.400 and later too, since its
  icons are listed from the project's copy.
- **`parity lib` writes `.lib.par` files** for a package, an icon set or an app. Components are what the TypeScript
  checker says renders, as `proposals/component-detection.md` describes, with anything it can't decide reported rather
  than guessed. Tokens come from wherever the library keeps them: CSS custom properties, Tailwind `@theme`, DTCG files,
  or a JavaScript theme (MUI, Chakra, Fluent). Decorators come from a preset per known library, since no package says
  which providers it needs. An app's file is written at its root, keeping its designs.
- **Every Buildkit Base UI style gets a registry file,** at your request: luma, lyra, maia, mira, nova, rhea, sera and
  vega. They share one set of hand edits (`buildkit-baseui.edits.json` in the registry), since only their styles differ,
  and the Radix styles still aren't published.
- **Parts are placed inside their parents,** from the library's own examples (below), then three signals: namespace
  exports (`Accordion.Item`), the "must be used within" error a part throws alone, and shared name prefixes
  (`AccordionItem` under `Accordion`), or a plural (`Tab` under `Tabs`). Each part records which signal placed it,
  `example`, or `edit` for a hand edit. A part's missing context is the nearest one, so a parent an error names goes
  innermost, with its own parents outside. Inserting a part from the panel wraps it in the parents that aren't around
  the drop target already, and a family's root comes with its sample parts in it.
- **A library's own examples are the strongest signal after a hand edit (LIB-34),** so a library that releases often
  needs few edits. `parity lib` fetches the library's repository at the commit the installed version was published from,
  found in this order: the revision a kit records upstream (`upstream.json`), npm's `gitHead`, a version tag, then the
  last commit before npm's publish date. It checks out only the stories, demos and examples (a shallow, blob-filtered
  fetch and a sparse checkout, about 7 seconds for shadcn), cached under `~/.parity/cache/examples` per commit and
  folders. The TypeScript compiler reads their JSX: each component's nearest library parent, counted, and its fullest
  use as a sample. A parent counts when at least half the uses are inside one and half of those agree; a part that draws
  alone takes only its own family's (examples put everything in forms and cards), and the chain climbs while the part
  still fails, then through its own family. JSX passed in a prop isn't placed in that element. Every chain and sample is
  still tried: one that doesn't render is grown from the errors, the errors alone are tried if that fails, and other
  families' parents a part renders without are dropped. `--no-examples` skips it, and the registry's presets name each
  library's repository and folders. Buildkit's hand edits went from 30 to 13, of which 8 only mark Toast parts
  non-visual.
- **`parity lib` tries parts with React's server renderer,** from the project's own React, rather than in the app: it
  needs no window, runs in seconds, and still throws the context errors that name a part's parents. The library's
  decorator providers wrap each try, with their imports and calls made, a mode's default value, and no frame, so
  `MantineProvider` is never a part's parent. What renders this way can still fail in a frame (portals and effects don't
  run on the server), so the in-app sweep is the backtest.
- **What a failing component needs is inferred from types and errors, and kept only if it then renders:** parents,
  required props with sample values from their types (the first of a set of strings, a word, a number, `true`, an empty
  list), a single element child for parts that clone theirs, and a family's parts as its root's sample. Contexts,
  consumers and `RootProvider`s are marked `visual: false` and left out of the Components panel. The rest are listed for
  a hand edit.
- **Hand edits to a library file survive regenerating it.** They're kept apart from what `parity lib` writes, keyed by
  export name, in the file's `edits` or a shared file it names, and merged over it: a field replaces the generated one,
  `false` leaves a component out, and decorators given there replace the generated ones. `--edits <file>` points a file
  at shared edits and tries them while generating, so the report counts what they fix. An edit whose export has gone is
  reported, in the CLI and in the project's notes, not dropped.
- **Regenerating compares fingerprints, not API Extractor,** to report new, changed and removed components. Each
  component keeps a fingerprint of what it was found as and its own props (those its package declares, not the HTML
  attributes it passes on), and each prop a hash of its type, so a change says which props were added, removed or
  retyped. API Extractor diffs a package's whole public API from a `.d.ts` rollup and needs setting up per package,
  which is more than component changes need. `--only new` and `--only A,B` write just those over the old file, and
  `--all` (the default) writes everything. Components the package no longer exports are dropped either way.
- **A library newer than its file keeps using it.** With no range covering the installed version, Parity uses the newest
  file made for an older version instead of none, keeping its decorators and tokens. Components it lists that the
  package no longer declares are left out, ones it has gained are found by name as for a package with no file, and the
  project's notes say so and give the `parity lib` command that updates the file.
- **The registry's libraries are offered when creating a project,** at your request, since they cover most React
  component libraries. The registry already ships inside the app.
- **Library tokens say where they belong** with `$extensions.parity`: `var` (the custom property), `category` and
  `lineHeight`. The frame declares them before the project's styles, so the project's own values win, and the Tokens
  panel files them by category: spacing, breakpoints, font sizes with their line heights, radius, shadows and colors,
  each theme as a mode. A library's spacing step becomes Parity's `--spacing` (MUI's 8px, Chakra's 0.25rem), so `p-2` in
  a design is the library's own `spacing(2)`.
- **Library decorators are data, not code,** so a `.lib.par` runs nothing of its own: wrap the design in a component,
  add one beside it (a toast host), or set a class, attributes or styles on the frame's body, optionally only `when` a
  mode's globals match. Values can be imports, calls, the mode's globals, or the frame itself (its shadow root, host,
  body, document, direction and language), which is how CSS-in-JS renders into each frame: Emotion's cache for MUI and
  Chakra, Griffel's shadow DOM renderer for Fluent, and Mantine's variables written to the frame's host. Manifests list
  decorators outermost first, as the JSX reads.
- **A package stylesheet the app imports** (`import "@mantine/core/styles.css"`) loads before the project's styles, by
  its specifier, and isn't read for tokens: the library's tokens come from its `.lib.par`, and the rest are its
  components' own variables.
- **Images are a node type of their own** (`image`, with `src`, `alt`, `fit` and `credit`). They render as `<img>` with
  paths resolved against the project's dev server.
- **Stock photos are removed for now,** at your request, because Pexels isn't taking new customers. The Images tab says
  they're coming soon. A key a person enters for a source, as with Pexels, is encrypted with the system keychain
  (Electron safeStorage) and used only in the main process.
- **Each stock source is used the way its terms ask** (your call, 2026-10-28): linked from the source's own address or
  downloaded into `public/images/`. Either is fine, and a photo keeps its `credit` both ways. Images the person pastes,
  drops or imports are saved under `public/images/`.
- **A Pexels key saved before stays where it was,** encrypted in the app's data (`connections.json`), unused and never
  deleted, so it works again if Pexels comes back. Photos already saved keep their `credit`, and pasting images is
  unchanged.
- **Unsplash is the first stock source** (your call, 2026-10-28), for its consistent quality. Its terms want photos
  linked from Unsplash, a request to its download endpoint when someone picks one, and credit to the photographer and
  Unsplash.
- **Parity owns the Unsplash key** (your call, 2026-10-28), so a service of Parity's holds it and the app calls the
  service; the key never ships in the app. Unsplash allows 50 requests an hour until it approves an app for production,
  then 5,000, and raises that further on request. Only searches and download pings count; loading the images themselves
  doesn't.

## The example project

- **The example is a small product, Acme, built to demo with:** 25 screens, read as a journey. The marketing site (Home,
  Pricing, Checkout), signing up and in (Sign up, Verify email, two onboarding steps, Sign in, Forgot password),
  everyday work (Dashboard, Projects, Project board, Task detail, Inbox, Messages, Calendar, Files, Search), then
  insights and admin (Reports, Team members, Member profile, Settings, Security, Billing, Integrations). Every screen
  shows light, dark and mobile, and uses the project's components, Nova's and Lucide icons.
- **Acme exists only as designs for now.** The example's React app stays the shadcn starter; writing the screens as code
  waits for the Writing back work.
- **App screens share an App sidebar and an App top bar,** both component designs. The sidebar has a state per section,
  so each screen's instance says which section is open; the top bar's breadcrumb is two params. Team members was moved
  into the shell rather than rebuilt, so its states still apply.
- **The canvas reads like the journey:** one row of boards per part of it, top-aligned, 400 apart, rows 600 apart.
  Components sit below, the shared ones first, then in the order of the screens that use them, 600 apart so the state
  names beside them have room. Board sizes were worked out from `Measure`, since the canvas reports 0 for boards it
  hasn't drawn (AGT-26).
- **Each screen has states worth showing:** Dashboard's Loading and Empty workspace, Sign in's Signing in and Wrong
  password, Settings' Saving, Saved and Invalid email, and Pricing's Monthly and Yearly.
- **Repeated parts became component designs by extraction** (Stat card, Activity item, Plan card, Project card, Task
  card, Notification item, Integration card and two dozen more), with params inferred from what differed. Stat card has
  a Loading state. Pricing's Yearly state changes each plan's price through its instance.
- **They were built through the agent API** (`parity exec`), one undoable step per screen, and saved after each, because
  the dev runner restarting Electron drops unsaved changes. Four agents built screens at once, taking turns through a
  lock: each run applies whole project files, so two at once would overwrite each other's work (AGT-25).
- **The example imports Nova's styles** (`@buildkitgg/shadcn-baseui-nova/tailwind.css`, right after Tailwind), as the
  Components panel's Import styles does. Without it, Nova's switches and progress bars render invisible.
- **The accessibility checks find real issues in it,** mostly one token pair: `muted-foreground` on `muted` is 4.34:1,
  short of 4.5:1, which shows on avatar initials, the keyboard hint and small print. They're left in, since changing
  that token and checking again is a good demo.

## Storybook

- **Storybook is detected, not configured:** its `main` file must exist, in `.storybook` or the folder a script that
  runs `storybook dev` names with `-c`. Storybook can't run without it. Stories map to components through the
  `component` their default export imports, following relative and aliased paths.
- **Opening a story uses a Storybook that's already running** for the project when its index matches; otherwise Parity
  starts the project's own Storybook (with Electron's Node, so nothing else needs installing) and stops it when the tab
  closes. It uses the script's port, or 6006, so links people already use keep working, and a free port only when that
  one's taken. A component's docs page opens when it has one, else its first story, in your browser.
- **How the two connect, and the rules that keep them apart, are in [storybook.md](storybook.md).**

## Accessibility

- **Checks run offscreen with axe-core,** in every state and the modes a design shows, at the frame's own size, so
  contrast is measured on everything. Rules about whole pages (title, language, landmarks, a top heading, skip links)
  are off, because a design is part of a page. WCAG 2.2 AA and axe's best practices are on.
- **Issues are reported on layers.** An element inside a component counts as that component, and anything inside an
  instance counts as the instance. Layers with the same name, problem and frames, such as the rows of a list, are one
  entry, and clicking it selects all of them. Instances are named after their component design, as in "Member row".
- **The issues list puts axe's findings in plain words.** Each rule has a short title and a sentence on who it affects
  and what to do; rules without one use axe's own summary. Impact is an icon and a colour, counted at the top. Contrast
  failures show the two colours as a text sample, with the ratio found and the one needed. An ARIA reference to a
  missing element says so instead of quoting the generated id. Clicking a frame under a layer selects the layer there
  and shows that state on the canvas, as picking it under States does; clicking the layer itself keeps the state shown
  when it's one of its frames.
- **The Accessibility tab checks a design the first time it's shown;** after that, Check again is up to you, and the tab
  says when the design has changed since. Only changes a check would see count: layers, states and the modes shown.
  Showing another state or moving the design doesn't. It says plainly that automated checks find only some issues.
- **Showing another state on the canvas is an unsaved change,** from States or from this list, because the shown state
  is saved in the `.par`. You confirmed this on 2026-10-28: "Otherwise if you close and reopen, all your states and
  settings might not be there."
- **Agents call `Accessibility(design, { state, mode })`,** which returns one finding per layer and frame, with the
  rule, its impact, axe's help link and what's wrong, plus the measured colours for contrast failures.
- **Show tab order** numbers the selected design's tab stops on the canvas, in every frame, joined in the order Tab
  visits them. Positive `tabindex` comes first, then document order; hidden, disabled and inert elements are skipped, as
  is every radio button in a group but one.
- **Team members' selected tab is flagged correctly.** The design has tab triggers but no tab panels, so the selected
  tab's `aria-controls` points at nothing. axe skips inactive tabs, so it isn't the Radix false positive first noted
  here, and adding the panel to the design clears it. No library false positives are hidden.

## Rendering and agents

- **At 100% a frame is the size Chrome draws the same page,** checked element by element on all 36 frames of the
  example's screens, within 0.01px. A frame's root starts from what a browser gives a page's root (`all: initial` on
  `:host`, in a layer below the project's own CSS), not from the canvas around it. Before this, text without a size of
  its own took the canvas's 12px and 18px line height instead of 16px. The frames beside the first column are drawn
  smaller on purpose, and so aren't actual size at 100%. `frame.test.ts` lays a frame out in Chrome and checks its root
  against a fresh page's, and the render sweep (VAL-1) is to compare whole frames with Chrome.
- **Agents render offscreen,** in a hidden window, so their work never moves your camera. Export uses the same renderer.
- **Prop inference uses the TypeScript 6 compiler in a worker thread,** from cva variants, destructured defaults and the
  component's own props type.
- **The CLI and MCP check accessibility:** `parity a11y <design>` and the `check_accessibility` tool, in every state and
  the modes shown unless narrowed with `--state` and `--mode`. They list each rule broken, worst first, with the layers,
  their ids and the frames. `parity a11y` exits with 1 when it finds issues, so it can gate a script.
- **The CLI and MCP read the console:** `parity console` and the `get_console` tool return what the project's own code
  wrote, on your canvas (including while interacting) and in offscreen renders, oldest first. The main process keeps the
  last 500 messages and counts repeats in a row; `--clear` empties a project's after reading. A message counts as the
  project's when the script that wrote it comes from the project's builder; Parity's own messages and Vite's and React's
  dev chatter are left out.
- **Parity's dev server doesn't forward the console to its terminal** (Vite's `forwardConsole`), because forwarding
  wraps `console.error` and `warn` and every message would seem to come from Vite. Electron reports a message's format
  string and its values together, so React's `%s` placeholders show as written, followed by the values.
- **Agents learn Parity from its skill,** through `read_skill` or `parity skill`: `SKILL.md`, `execute.md` (the API),
  `document.md` (the design format), and guides to components, states and modes, checking, the design system, web apps
  and phones. It follows the layout of Pen's skill (a quick reference, an API file, a format file and guides) in our own
  words. Slides, shaders, SVG drawing and image generation are future features (FUT in the backlog), so the skill leaves
  them out. Keep it current: a new agent function or tool needs its line in `execute.md` or `SKILL.md`, and its examples
  must run.
- **Parity is design-system first, so it has no style archetypes.** A project's look comes from its own components and
  tokens, or from a design system library it adds. Pen's ready-made styles aren't copied, and the skill never suggests
  one. TOK-5, which proposed them, was dropped; its ID isn't reused.
- **Agent passes write stories; they don't set up Storybook** (your call, 2026-10-28). Adding Storybook to a project is
  setup work for the scaffolder, whose catalog already has a Storybook add-on, or for a recipe (SCF-5, waiting on Q30).
  AGT-25, which made it a pass, was dropped; its ID isn't reused.
- **The CLI and MCP find layout problems:** `parity problems <design>` and the `find_problems` tool report render
  errors, overflow, clipping and unknown components, in every state and the modes shown unless narrowed.
  `parity problems` exits with 1 when it finds any.
- **Reads for a terminal are CLI only:** `parity tokens`, `parity components` and `parity props <Component>`. Agents do
  these in a snippet (`GetTokens`, `Components`, `Props`), so the MCP tool list stays short.

## Developing Parity

- **Only a change to the main process or the preload script restarts Electron.** A change to the project service
  (`src/utility` and every workspace package it bundles) restarts just the service: Electron watches its bundle and
  reconnects each window, which reopens its projects and keeps its designs, unsaved changes and canvas. A change that
  leaves the bundle as it was, such as a comment, restarts nothing. The UI reloads in place through Vite, as before.
- **A dev runner left behind stops itself.** Stopping `pnpm dev` on Windows could leave `scripts/dev.ts` running, with
  an Electron that kept the debug port and old code. The runner now quits, closing Electron, once whatever started it is
  gone, and Electron quits once the runner is gone.
- **The repository has its first commit,** `3dbc7fb`, everything as it stood, which you asked for on 2026-10-28 before
  the package work starts. Sessions still commit only when you ask.

## Packages

How Parity's code is split, so the parts that change most are easy to find, replace and test. You asked for this on
2026-10-28, expecting design-to-code and code-to-design to need a lot of iteration. The proposal is
[proposals/packages.md](proposals/packages.md). These are my calls; change any of them.

- **Logic lives in packages that take data and return data,** with no React, tldraw, Electron or `node:fs` in their
  dependencies, and tests that run without Electron. The app's main and service processes do the files, IPC and
  processes, and the renderer keeps the views. A lint rule per logic package keeps it that way (PKG-1).
- **Design and code sync gets one package, `@parity/code`,** which also takes over the three component readers
  (`project/components.ts`, `libgen/components.ts` and `@parity/props`), so one TypeScript program per project serves
  them all. Generating component files, reading them back and the drift review are built there, with golden-file tests.
- **Every write into a project goes through changesets** (PKG-2): edits built as data, shown as a diff, applied and
  undone together. They come before the components work, so CMP-17 waits on them. Writing back from the lenses keeps its
  place at the end of the lens order.
- **Editor behaviour moves into `@parity/editor`,** one file at a time with tests: arranging and the clipboard first.
- **Lenses and adapters never go in core.** Lens models are schemas in `@parity/models`, each lens is a package, and so
  is each adapter, such as Drizzle or TanStack Router.

## What Parity supports

[support.md](support.md) has what works today, what each feature depends on, and the requirement tiers.

- **Four kinds of requirement.** You agreed to these as recommended.
  - **Fixed:** a Node package, a web UI drawn to the DOM, ES modules from a dev server, styles as stylesheets, tokens as
    CSS custom properties, and `.par` files. No adapter removes these.
  - **Expected for now:** TypeScript, React 19, Vite 7 or later, Tailwind CSS v4 and named exports. Nothing else is
    built for now; a project without one gets less, and an adapter can lift it later.
  - **Standards** are read from whatever tool writes them, and **adapters** come one per tool.
- **TypeScript is expected, not required.** JavaScript projects keep rendering, and no JavaScript-only fallbacks get
  built.
- **React and Vite only, until a second adapter is asked for.**
- **No test runner is required.** When tests come in, results come from JUnit XML and coverage from LCOV.
- **Tokens must compile to CSS custom properties,** from any source format.
- **Anything released more than two years ago is dropped,** counted from each version's own release: "drop anything
  released more than two years ago, even React 18." The exception: "a tool's newest major version is never dropped," so
  React 19 and Fluent UI v9 stay.
- **Dropped means untested, never blocked.** In your words: "By drop support, I didn't mean prevent others from using
  those versions, just that we don't actively test and support them." A dropped version gets no fixes or validation
  project, but a project using it opens and runs as far as it can, with no popup. The only sign is a quiet line in the
  status bar's tooltips and `detection.notice` in the agent API.
- **Other tools' configs load through `unconfig`, not `c12`,** since it's built for reading other tools' configs and
  reads rc files too, so `lilconfig` isn't needed. A tool with its own loader keeps it, as Vite does with
  `loadConfigFromFile`. You agreed: "As long as we're already using unconfig then it's good."
- **Fluent UI v9 and Fluent icons are planned,** for corporate customers: "These will be great for onboarding some
  corporate customers." support.md has the plan.

## App lenses

A lens is a view of one layer of an app, such as its routes, data, API, permissions or flags. The proposal is
[proposals/app-lenses.md](proposals/app-lenses.md).

- **Each lens reads an open standard where one exists.** You agreed to this. The standards are OpenAPI, AsyncAPI, JSON
  Schema, OpenFeature, OpenTelemetry, ICU messages and DTCG tokens. Any tool that produces one works without Parity
  knowing about the tool.
- **Where there's no standard, an adapter per tool fills one shared model for the lens.** Routers, auth roles and ORM
  schemas have no standard.
- **Standards first, then adapters.** You decided this: "We focus on standards first, then adapters/plugins." Each lens
  works from its standard before any adapter for a particular tool is built. Web apps and their backends come first; the
  plan is [proposals/web-and-backend.md](proposals/web-and-backend.md).
- **Lens priority: databases, the API, routes and mock data, then telemetry.** You set this order: "1) Databases 2)
  API 3) Telemetry", then placed the rest: "Routes and mock data should come before telemetry, right after the API."
  Mock data includes the scenarios that fill designs. Telemetry means OpenTelemetry from the running app: traces linking
  a click to its handler and queries, with errors and timings. It moves up from later.
- **Each lens's first adapter comes right after its standards pass, before telemetry,** so the lenses work on TanStack
  and Drizzle projects first. Then telemetry, then links from code, then writing back. You chose this on 2026-10-28.
- **Tests, coverage, the gaps report and performance come later.** You decided this: "These feel like they are value-add
  after everything else. I would not prioritize them now." Tests recorded in interact mode wait too: you said they'd be
  recorded and, with Storybook in the project, also written back to Storybook, "but it's not a priority."
- **No source is ever required.** A lens with nothing to read stays out of the way.
- **Parity writes into a project only in the project's detected style, and only where an adapter knows how.** Reading
  can stay neutral, but what's written has to fit the project.
- **The first adapters are TanStack Router and Drizzle.** You said: "Let's start with Tanstack and Drizzle. These are
  what we're working with mostly today." The rest of the example's stack is the scaffolder's to choose.
- **Each lens is its own canvas page,** with links jumping between pages, and the design canvas stays the main view.
- **Designs bind to API data.** A layer's text, or a repeated layer, binds to fields of an operation's response, filled
  by the design state's scenario.
- **The API model is operations, always exportable as OpenAPI 3.2,** with server functions as marked operations.
- **Databases: local and development first.** Production is only an opt-in, read-only connection per database.
- **The schema in the code comes from replaying its migrations into an in-memory database** and reading the catalog.
- **The `.par` is the source, and a `.parity/` folder holds files written from it.** You called this a hard compromise:
  everything in the project file is best, but "for flexibility, we should put things in the .parity folder when we need
  to," at the cost that a `.par` can't be shared without its files. So scenarios, mock data and seed data live in the
  `.par`, and only files other tools must import, such as MSW handlers and seed scripts, are written to `.parity/` from
  it. A `.par` copied on its own then loses nothing, and the folder can be written again. Hand-written files that are
  Parity's, such as `.parity/preview.tsx`, live there too.
- **Traces come from local development first.** Production telemetry comes later and is opt-in, with keys stored in the
  system keychain.
- **The second example is a Buildkit scaffolder project,** once the scaffolder can make one. You said: "I don't know if
  scaffolder is ready, but yeah, that's the preferred route."

## Extensions

Everything Parity recognises, connects to or deploys to would be an extension: an adapter, a connector or a deploy
target. The proposal is [proposals/extensions.md](proposals/extensions.md).

- **Nothing is open source yet.** You decided this: "Don't open source anything now, we're too early in the building."
  That covers the app, the plugin interfaces, the models and the manifest formats.
- **`.lib.par` grows to describe icons, fonts and plugins,** rather than a `parity` section in `package.json`.
- **Most adapters and connectors ship with the app.** You see them as the way people help Parity support more tools. A
  project can also add its own.
- **Deploying goes through Better Apps' deploy only, for now.** You asked whether a Terraform target would cover
  everything. It would provision almost anywhere, but it doesn't build or upload the app, someone still writes modules
  for each cloud, and it needs remote state and credentials. It could be a later target, as OpenTofu, for teams that
  already manage infrastructure that way.
- **Every plugin is code.** `.lib.par` is the data a library, icon set or font uses to describe itself, and presets for
  file-based routers are a detail inside Parity's own route plugin, not something people add. You chose this on
  2026-10-28.
- **A project adds its own adapters, plugins, integrations and settings in `parity.config.ts` at its root.** You said a
  config file "is going to be necessary. This is where you might add adapters, plugins, configurations, integrations,
  decorators, etc." It's optional: what Parity can infer still needs no config. It runs in the project service, so
  decorators, which run in the frames, stay in the preview file, as Storybook keeps `main` and `preview` apart.
- **Adding tools such as Sentry, PostHog or LaunchDarkly comes later,** from a CLI, through recipes or the scaffolder.
  You said it "belongs in the backlog -- not a priority right now."

## Not done yet

Planned work, and what's waiting on you, is in [backlog.md](backlog.md).
