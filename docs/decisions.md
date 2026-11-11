# Decisions

- **`@parity-app/style` holds the stored style and its CSS, and core reads both from it (PAR-939).** Step 1 of
  [style-package.md](proposals/style-package.md) moved `nodeStyle` out of `core/document.ts` and the style-to-CSS out of
  `core/render.ts`, with nothing drawn differently: render's tests pass as they were. Three calls made along the way:
  - **`declarations(style, { kind, parent })` gives one declaration for each property.** Where two keys write one
    property the later key's value stands, and `from` names that key. What a kind of layer draws before any key is set
    (a layout's `display: flex`, `position: relative` and `min-width: 0`, text's `margin: 0`) is from the key that would
    change it, so every declaration has a row to name.
  - **Render still writes inline styles,** by camel-casing each declaration's property. An image's and a video's
    `display: block` and `object-fit` stay in render, since they come from the node's `fit`, not its style. PAR-942
    replaces the inline styles with rules.
  - **Core re-exports the style names the rest of Parity already imports** (`NodeStyle`, `StyleKey`, `Length`,
    `isNamedLength`, `spacing`, `token` and the rest), so the editor, the agent and the app didn't change while PAR-931,
    PAR-933 and PAR-934 were adding keys in the same files. Code that needs `declarations` imports `@parity-app/style`
    itself.

- **A style package owns what a layer's style means, with CSS as the spec in the middle (PAR-938).** You agreed on
  2026-11-11 to [style-package.md](proposals/style-package.md), after asking whether `NodeStyle` is a real spec (it
  isn't: it mixes CSS, Tailwind and Figma names) and saying the translation layer should be a package of its own. A pure
  package, `@parity-app/style`, holds the stored style, moved out of core, and turns it into CSS declarations and back;
  each framework's adapter prints declarations as its own code and reads that code back, Tailwind's by compiling each
  class with the project's own Tailwind and comparing. A ledger of every CSS property, generated from spec data, gives
  each property one owning key and its grammar, which values are checked against. You accepted the four calls: the
  package, with the schema leaving core; one format change that renames the keys after their CSS properties, after
  PAR-925, PAR-931, PAR-933 and PAR-934 land; a Tailwind project's canvas draws its compiled classes, with Parity's own
  rules as the fallback; and the new dependencies `@webref/css` or `css-tree`, and `web-features`. The steps are PAR-939
  to PAR-944.

- **One table picks a layer's sections and controls, and the controls move into the app in steps (PAR-892).** You agreed
  on 2026-11-11 to [design-panel-sections.md](proposals/design-panel-sections.md): the panel works out what a layer can
  do (`box`, `root`, `frame`, `text`, `textInside`, `media`, `inFlex`, `inGrid`, `styled`), and each section and
  conditional control states what it needs, as one line of a table in `@parity-app/editor` with a test per layer kind.
  PAR-186's controls move from `explorations/styling-controls/` to `inspector/controls/` in one go, their stories under
  `Parity/Inspector/Controls`, so there's one copy from the start; Field names its control. Then the sections the
  document already holds are rebuilt on the shared parts, and each property `NodeStyle` can't hold yet (z-index, aspect
  ratio, blend mode, paint and effect stacks, transitions, raw CSS and the rest of the proposal's list) is its own
  issue: the schema, what it writes and reads back, the agent's tools and its controls.

- **The CLI goes to npm's `next` tag, and to `latest` when you approve it (PAR-799).** You chose on 2026-11-09 to
  promote the CLI the way the desktop app is promoted, with its own approval. Every merge publishes the CLI to `next`,
  and `cd-npm.yml`'s Production job then waits in the `production` environment; approving it runs
  `npm dist-tag add @parity-app/cli@<version> latest`, so nothing is rebuilt or republished. Running `cd-npm.yml` by
  hand with a version promotes one already on npm. My calls:
  - **The steps are in this repository, not the shared template.** `cd-npm-release` already takes a `tag` and reports
    the versions it published, so publishing to `next` is one input, and the promotion is one job that has to sit in
    `cd-npm.yml` anyway, since npm's trusted publishers name that file. Pipelines and its other users are unchanged.
  - **The promotion uses trusted publishing, with no npm token.** Since 2026-09-30 a trusted publisher can be allowed
    `npm dist-tag`. @parity-app/cli gets a second trusted publisher for `cd-npm.yml` in the `production` environment,
    allowed only dist-tags, so the job that changes `latest` can't publish, and the one that publishes can't change
    `latest`.
  - **The CLI reports `production` once its version has been `latest`.** The CLI's detached sender asks npm's registry
    for the dist-tags after it sends, and keeps the answer in `~/.parity/installed-cli.json`, so a command never waits
    on npm and offline keeps the last answer. The next command reports from it. A version newer than `latest` is a beta;
    an older one keeps what was saved, so a version that was `latest` stays `production` after a newer one is promoted,
    as a promoted desktop release does. Moving `latest` back to an older version makes the newer one a beta again, since
    a rollback pulls it.
  - **The desktop's cache is shared, not copied.** `Promotion` in `@parity-app/telemetry` keeps a version's answer, asks
    again after five minutes, shares one request between callers and survives files it can't read or write. The desktop
    app's `InstalledBuild` asks GitHub through it, and the CLI asks npm.

- **CI installs Electron up front, caches its downloads, and tries them up to 3 times (PAR-789).** GitHub's releases
  answered Electron's downloads with 504s often enough to fail CI, the app tests and the preview installers, where a
  re-run passed. Electron 45 downloads its binary the first time something loads it, so `pnpm build` and the app tests
  did, with one try. Now each workflow runs `install-electron` first, and electron-builder's packaging, which downloads
  the zips it builds from, through `scripts/retry.ts`: up to 3 tries, 15 and then 30 seconds apart. CI and the app tests
  keep the downloads in `~/.cache/parity-ci/` (`electron_config_cache`, `ELECTRON_BUILDER_CACHE`) between runs, outside
  the checkout, since its `package.json` makes the scripts electron-builder unpacks into its cache ES modules, which
  broke the macOS icon tool. The shared `ci-verify` template keeps one cache per call, so in `ci.yml` they share the
  fixtures' key: after Electron's version changes, it downloads again on each run, with retries, until a fixture's
  lockfile changes. The preview and release templates have no cache input, so their builds retry without one; adding one
  would change Pipelines for every repository.

- **Agents read a component's composition from `Props`, built from its library file (PAR-454).** `Props`, and through it
  `parity props` and `get_props`, returns a `composition` beside the props, rather than a new operation, so agents that
  already check `Props` before inserting learn what a part goes inside. It comes from `componentComposition` in
  `@parity-app/editor`, which reads the parents, optional parents, provider flag and sample the library file gives, not
  recipes of its own. Its example is `componentExample`, the tree the Components panel draws, so the two can't drift. A
  part's parents say where they came from (`parentsFrom`, now kept on the component's source). Whether the example draws
  comes from the canvas's render status, so it says `untried` rather than claiming an example works before it has drawn.

- **A production promotion waiting for approval doesn't hold up the next beta (PAR-504).** v0.4.2's beta publish waited
  until v0.4.1's pending production promotion was cancelled. The promote job held the `cd-desktop-publish` concurrency
  group it shares with publishing while it waited for its environment's reviewers. The shared `cd-desktop-promote`
  template now asks for `production`'s approval in an `approve` job that takes no lock. Only the approved `promote` job
  takes `cd-desktop-publish`, so publishing and promotion still run one at a time, and production still needs Andrew's
  approval. Pipelines' tests check that no job in the group waits on an environment. The fix is in Pipelines v1.12.1,
  and `cd-desktop.yml` calls the templates at `main` (PAR-508), so it has no pin to move. A run that started under the
  old template keeps the lock until its approval is given or it's cancelled.

- **Desktop beta builds use the tldraw trial key (PAR-503).** Andrew supplied a trial key expiring on November 15, 2026,
  and asked for a new beta. It is stored in the repository's `VITE_TLDRAW_LICENSE_KEY` Actions secret and passed through
  the existing build-secret input; the key is not committed. Desktop 0.4.2 rebuilds with that key.

- **A desktop fix can include its own release bump (PAR-490).** Andrew asked to consume the pending desktop changefiles
  and bump the version in the fix PR, with no separate release PR. The check accepts a newer numeric version with its
  matching generated changelog as release coverage, while unchanged or older versions still require changefiles.
  Publishing records a beta deployment, then automatically queues protected production promotion for Andrew's approval.
  Production still verifies and promotes identical beta files; it never rebuilds them.

- **Update checks stay in toasts; build identity is separate from the update preference (PAR-490).** Andrew approved the
  rendered dark and light Storybook checking, no-update and retry designs and the About Beta build / Update channel
  labels on 2026-10-31. Help > Check for updates leaves the workspace open, reusing the download/restart notification.
  About remains a separate menu action. Startup checks stay quiet for no-update and failures; downloads still use the
  approved background progress and explicit restart controls. E2E runs only in CI.

- **Desktop delivery uses the shared release and promotion templates (PAR-11, PAR-12).** A successful push CI on main
  publishes a changed desktop version as a beta. Manual retries also require passing CI on main. Promotion approves the
  existing beta in the main-only `production` environment, with Andrew as reviewer and no administrator bypass; it
  checks the commit and file hashes without rebuilding. The tldraw build key is optional and passed by name. Signing and
  automatic app updates remain separate issues.

- **Desktop installers use electron-builder (PAR-9).** Windows gets a per-user NSIS installer with a selectable
  directory, macOS gets DMG and ZIP artifacts for both architectures, and Linux gets an x64 AppImage. Initial builds are
  unsigned by a publisher; signing remains PAR-399. macOS uses ad-hoc integrity signing without hardened runtime so
  Apple Silicon can launch before developer certificates are configured. The renderer stays in ASAR, while Node entry
  points, guest, registry and complete TypeScript 6 package live as real files in `app.asar.unpacked` for the project's
  Vite and plain Node child processes. CI installs, opens and uninstalls the Windows installer; local hooks run no
  end-to-end tests.

- **Project-service children inherit Node mode (PAR-9).** Rollup probes `process.execPath` to identify Windows builds.
  For installed Parity that executable is Parity itself. The service sets `ELECTRON_RUN_AS_NODE=1` after its own
  bootstrap so these probes run as Node instead of opening another app and overwriting the agent discovery file.
  Package-manager installs drop this flag so the project's own Electron install scripts still launch normally.

Calls made while building Parity without stopping to ask. Each says what was decided and why. The ones marked **Open**
still need your call.

## Project files

- **One `.par` project file per project.** Designs, notes and modes live in it. The main document is the `.par` at the
  project root, else the first `.par` found, else a new `<package-name>.par`. Other `.par` files anywhere in the project
  still load, and new designs go to the main one.
- **Modes live inside the main `.par`.** They're written only once they differ from the defaults, so a fresh project's
  file stays small.
- **`.lib.par` describes a component library: its name, id, stylesheet, breakpoints, tokens and its own canvas.** You
  asked for the tokens and the canvas. It uses one current format, as `.par` does; obsolete formats are rejected,
  without migration paths. It sits at a package's root, and any dependency with one loads as a library, with or without
  Parity's catalog.
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
- **A library's own project names its components by the library (PAR-124),** as `nova/Button`, so the designs on its
  canvas refer to them as the apps that install it do and work there unchanged. The id is the file's `id`, else the
  package's name without its scope, the rule apps already used. My call: every one of the project's components gets it,
  the UI kit's and the rest of its code's, rather than only those the package exports, as which those are isn't known
  until it's built. Designs saved before with plain names aren't renamed, since no library has shipped a canvas yet.
- **Only component designs travel (PAR-125).** My call: an app lists the component designs on a library's canvas, named
  `nova/settings-row` so they never clash with its own, and leaves out its screens, which are the author's showcase.
  They aren't the app's: they're never written to its files and change only when the library does. A design of the app's
  with the same id wins.
- **A click or a drag places a library's design linked; its right-click menu also places a detached copy (PAR-126).** My
  call: linked is the default because it's what keeps an app following the library, and a copy is Detach done at once,
  with the same rules. A linked copy can't go to its main component or push overrides to it, as the main is the
  library's. The agent's edit API doesn't see library designs yet.
- **Buildkit's styles ship their tokens as DTCG (PAR-139).** Each style's `tokens.json` is a 2025.10 resolver: one set
  with the light values and a `theme` modifier whose `dark` context holds what changes. Every token has a type and a
  description, written once in Buildkit's generator for all eight styles, and `parity lib` copies the file into each
  registry `.lib.par`. A token's path is its CSS variable's name split at each hyphen (`card.foreground`), with a
  group's own token in `$root`, so it matches its custom property by its whole path. You chose on 2026-11-06 to replace
  the old format in place rather than ship two files, as only Buildkit's own release check read it. My call: the eight
  registry files were regenerated from 0.5.0 with `--only new`, which changed only their tokens and version, and cover
  `^0.4.0 || ^0.5.0`, since 0.4's components are the same and its projects would otherwise lose their file. They list
  the 39 tokens Buildkit describes instead of the 119 libgen read from the stylesheet, which the Tokens panel still
  shows from the project's own CSS.
- **Parity's own reader is the one DTCG parser and validator.** You asked for one, not two, on 2026-11-06. Terrazzo
  (`@terrazzo/parser` 2.10) was tried as the replacement and rejected: it treats the CSS strings libgen writes for
  values DTCG has no form for as errors, keeps a malformed token with a broken value instead of leaving it out, throws
  on a broken alias when told to carry on, and drops a plain token file's descriptions. Buildkit checks its file's shape
  when it releases, and Parity's tests read each registry copy with this reader.
- **Saving is explicit, as in a document editor.** Edits stay unsaved until Save (Ctrl+S). The tab shows a dot (it turns
  into the close button on hover). The status bar only says when a save failed, and clicking that tries again: you asked
  to remove its "Saved" and "Unsaved changes", as the tab's dot already shows them. A file that's the same as what was
  saved is clean, however it got there: undoing back, or turning Show every state on and off again (PAR-164), since
  views are tidied as they're written, leaving out every-state off, no modes or variants beside, and the base state.
  Edit > Settings > Save automatically turns on saving each edit about 300ms after it's made, and is off by default.
- **Token edits are ordinary edits** (PAR-164): they undo and redo with the designs, and reach the project's stylesheet
  only on Save (or autosave), an agent's `SetTokens` included, in the same undo step as its designs. The token editor's
  button is Apply, with a line saying Save writes it to the stylesheet. Don't save writes nothing. A failed write names
  the token and the file in the save notice, the status bar and the Tokens panel, where its row is marked and a banner
  offers Try again; a stylesheet changed since it was read fails the same way.
- **Save takes out a token value that's been undone back to nothing** (PAR-420): a value given to a theme that had none
  (a dark `--radius`), saved and then undone, is written as a `TokenWrite` without a value, rather than as an empty
  value, so a value that's empty on purpose can't be mistaken for one taken out. `writeTokenChanges` takes the
  declaration out of every block that would hold it (the theme's `.dark` and `[data-theme="dark"]` alike, but no `:root`
  under `@media`), with its line, and a rule left with nothing in it goes too, with one of the blank lines around it, so
  a value Save added in a new block leaves the file as it was. A rule that keeps only a comment stays, and so do the
  at-rules around one taken out, which Save never adds. The frames' overrides are unchanged: compared with the CSS the
  canvas loaded, so the render window is assumed to have loaded the same CSS.
- **Closing a tab or quitting with unsaved changes asks** Save, Don't save or Cancel, with Save focused so Enter does
  it. Quitting with several projects unsaved asks once, with Save all.
- **Changes from outside reload as one undoable step.** That covers agents, git and text editors. A file with unsaved
  changes here isn't overwritten: a notice offers "Load from disk" instead. The app ignores its own writes by
  remembering what it last wrote.
- **Save a copy** writes every design, note and the modes into one `.par` wherever you choose. It suggests the folder
  above the project, because a `.par` inside the project would load as more designs.
- **Open project file** opens the project a `.par` belongs to: the nearest folder above it with a `package.json`.

## Menus and preferences

- **The menus are drawn by the app, in the title bar.** That's the same on every system. On macOS the system menu keeps
  only the app, clipboard, window and developer commands for now. **On macOS, the menus will also be mirrored into the
  system menu bar,** which you chose on 2026-10-28, because Mac users look for commands there (PAR-150).
- **File, Edit, View, Object, Arrange and Help, named and filled as Figma's are** (your request, 2026-10-29, from the
  menu audit). My calls:
  - **Object** holds what acts on the selection: Insert, wrapping in a layout, making a component, going to the main
    component, detaching an instance, ordering and hiding. **Arrange** keeps aligning and distributing.
  - **Settings live in a dialog, Edit > Settings (Ctrl+,),** the design-app convention on Windows (Adobe, Affinity,
    Inkscape), replacing the Preferences submenu in File. It holds every preference; View keeps the toggles flipped
    while working (layout grid, snapping, performance stats).
  - **Export is two items in File,** the selected design or every design. The scale moved to Settings.
  - **Help** has Search actions (Ctrl+K or Ctrl+/, Figma's actions menu), Keyboard shortcuts (Ctrl+Shift+?, as in
    Figma), developer tools and About Parity.
  - **No Check for updates yet.** Parity has no releases, so there's nothing to check; About says so and shows the
    version, Electron and Chromium, with a button to copy them. Updating comes with packaging (PAR-9, PAR-160).
  - **Search actions finds anything in the project, and Ctrl+Alt+P repeats the last action** (PAR-180). My calls: a
    picked component is inserted at the selection, as the insert picker and the Components panel do, rather than shown
    in its panel; a token opens Tokens searched for it. Ctrl+Alt+P is Figma's key for running the last plugin again, the
    nearest Figma has; Ctrl+D (Illustrator's Transform again) and Ctrl+Y (Word's Repeat) were already Duplicate and
    Redo. Repeat covers the commands that change or add layers and designs, not undoing, copying, selecting or moving
    around, which do nothing new a second time. Recent picks are kept per computer, six at most, as the search's job is
    getting back to things quickly.
  - **Exit is in File on Windows and Linux only;** on a Mac, Quit is in the Parity menu, as every app's is.
- **Every shortcut is in one keymap,** `chrome/keymap.ts`. The menus, tooltips, the Keyboard shortcuts dialog and the
  key handlers all read it, so what's shown is what works, and a test fails if two commands share keys. Keys are written
  as on Windows, with spaces, and shown joined by `+` on Windows and Linux (`Ctrl+Shift+Z`, and `Ctrl+Plus` for zoom)
  and with the Mac's symbols on a Mac (`⇧⌘Z`). You found the spaced form unclear about whether a `+` was needed
  (2026-10-29). **Keys show as keycaps (`Kbd`) wherever they can,** your call on 2026-11-08: tooltips, the toolbar,
  Search actions, buttons, hints and the Keyboard shortcuts dialog. Only a menu keeps the kit's own shortcut part (the
  menubar's, context menus' and dropdowns'), which shows them as plain text, as Figma's and the system's menus do.
- **tldraw's own shortcuts are off.** Its tool keys (E, D, R, A, L, F, N, K) switched to drawing tools behind Parity's
  toolbar, Ctrl+/ flipped the canvas to light mode, and Ctrl+. and Ctrl+' turned on modes Parity doesn't use. Space to
  pan stays, as it isn't a shortcut, and the arrows nudge through the keymap (CAN-39).
- **The keys are Figma's** (checked against Figma's help and several cheat sheets on 2026-10-29), with these
  differences, my calls:
  - **I is Interact,** where Figma's is the eyedropper, which Parity doesn't have.
  - **/ inserts,** where Figma's starts cursor chat. Shift+I inserts too, as Figma's does.
  - **F2 renames as well as Ctrl+R,** as Windows apps do. Ctrl+Y redoes as well as Ctrl+Shift+Z.
  - **Ctrl+G, Ctrl+Alt+G and Shift+A all wrap in a layout,** Parity's one way to group, frame and add auto layout.
    Ctrl+Shift+G, Alt+Shift+A and Ctrl+Backspace unwrap.
  - **Bring forward moves a layer later in its layout,** which paints it in front, as CSS does, so it moves down the
    Layers list, which lists layers in their layout's order.
  - **Alt+1 and Alt+2 open Layers and Components,** Figma's Layers and Assets.
  - **Ctrl+Alt+K makes a component of a design or a layer:** a design selected on its own becomes a component (or a
    screen again), and a selected layer is extracted into a new component named after it, as Figma's is.
  - **N and Shift+N zoom to the next and previous design,** as Figma's do with frames, in the Layers panel's order
    (components, then screens), wrapping round (CAN-39).
  - **Paste over selection (Ctrl+Shift+V) and Paste to replace (Ctrl+Shift+R) are Figma's two,** after Paste in the Edit
    menu (CAN-39). Paste over keeps the selection: the copies go once, just after the last selected layer, beside a
    selected layout or component rather than inside it, at an absolutely placed layer's insets, and copied designs go at
    the selected designs' top-left, drawn on top. Paste to replace swaps each selected layer for its own copy. A paste
    that doesn't fit (layers over designs, designs over layers) says what to copy instead.
  - **Select inverse (Ctrl+Shift+A) selects what Select all would, minus the selection;** Select matching layers
    (Ctrl+Alt+A) selects, within the design, layers that are the same component, the same main component, or text with
    the same tag, and styled the same apart from place and size. Content doesn't count. With designs selected, it
    selects designs of the same kind (CAN-39).
  - Figma keys for things Parity doesn't do yet are Copy as PNG and find (PAR-190, PAR-191). Lock (Ctrl+Shift+L) came
    with PAR-192.
- **Enter, Tab and the arrows on a focused control are the control's** (found by the editor audit, 2026-10-29): a
  button, tab, Layers row or toggle presses, moves focus or moves within itself, so Tab moves through the inspector's
  fields instead of selecting the next layer. They act on the canvas when it, or nothing, has focus. A key the canvas
  handles is also kept from tldraw when it's released, as tldraw's select tool picks the next board on Tab's release.
- **Escape while the pointer is held cancels the drag,** of a layer or a design, rather than selecting the parent.
- **Electron's default menu is replaced.** It closed the window on Ctrl+W and reloaded it on Ctrl+R. Its developer menu
  registers no keys, so Ctrl+R is free for Rename; Ctrl+Shift+I opens developer tools through the keymap. Its keys never
  worked on Windows anyway, where the menu isn't shown.
- **The canvas area is its own stacking context,** so its floating toolbars and overlays stay below menus and dialogs
  instead of covering their close buttons. It sits above the panels beside it (PAR-893), so a floating bar wider than a
  narrow canvas lies over them rather than being cut off under one; its overlays clip to it, and the panels' resize
  edges stay above it.
- **The theme defaults to dark** (what the app looked like before), with light and system in Settings. It covers the
  app's chrome and canvas only; designs keep whatever theme their mode picks. The main process remembers it too, so the
  window opens in the right theme without a flash.
- **Export renders every state, in the design's main mode and the modes shown beside it,** at 2x by default (1x and 3x
  in Settings). Files are named after the design, plus the state and mode when there's more than one. It exports the
  designs as they are on the canvas, saved or not, and doesn't save them.
- **Recent projects:** the last 10 that opened successfully.
- **The canvas's right-click menu follows Figma's order** (PAR-168): Select layer, then copying and pasting, ordering,
  Wrap, Make component and Go to the main component, then Hide. Items that don't apply to what's selected are left out;
  items that apply but can't act right now are greyed. Lock joined it, under Hide, with PAR-192, and Open in editor and
  Copy as JSX with PAR-166. The empty canvas gets Paste here, Select all and Zoom to fit, a text note over a board gets
  the empty canvas's menu, and Interact gets none.
- **A right-click selects what a click would** (PAR-168), unless it lands inside the selection or on a selected layer's
  resize handle. The menu reads the selection and its target when the right button goes down, because tldraw selects the
  board on release.
- **Paste here ignores the selection** (PAR-168): designs and notes go at the pointer, and layers go into the deepest
  layout of the design under the pointer, in the slot there, or at the pointer in an absolutely placed one, in half
  steps of the spacing scale. It never pastes into a layout inside an instance. Select layer lists the design first,
  then every layer under the pointer, those inside instances included.
- **A component's slot is a Paste here target like a layout** (PAR-419), and so for dropped files and components from
  the panel, which share `measureHere`. My calls: a slot is under the pointer when the element its layers are drawn in
  is, since only the component knows where it draws a slot, so a slot with no layers yet isn't a target and the copy
  goes to the layout around the component; the slot of the layer under the pointer is tried first; and a slot is never
  absolutely placed, whatever the component's own position, so copies go in its flow. A dragged layer still doesn't drop
  into a slot.
- **A stretched copy pasted at the pointer keeps its far insets** (PAR-419). My call: a copy with a left and a right and
  no width keeps its right, and one with a top and a bottom and no height its bottom, so it still reaches that edge; its
  left and top go to the pointer as before. A copy with a width drops its right, as CSS ignores it then.
- **A right-click on the canvas while its menu is open opens it again there** (PAR-419), as Figma does; off the canvas
  it only closes it. My call: Base UI's menu lays a backdrop over the page while it's open, so the menu cancels the
  close for that press and, on release, sends the canvas under the backdrop the `contextmenu` tldraw would have, rather
  than being made non-modal, which would let a left click outside the menu act on the canvas as well as close it.
- **The menubar greys what the canvas menu greys for layers inside an instance** (PAR-419): Copy, Duplicate, the order,
  Wrap in layout and Hide or show, through one rule (`layerCommands`), and their keys do nothing then. Cut and Delete,
  which the canvas menu doesn't have, are unchanged.
- **A Layers row's menu runs the menubar's commands on the selection** (PAR-571), as the canvas menu does, so a
  right-click on a row selects it first unless it's in the selection. My calls: Rename still renames the row in place
  rather than going through Edit > Rename, which renames a design on its title on the canvas, out of sight from Layers;
  a design's row gains Duplicate, since the command duplicates designs; the root's row keeps only Rename, as the
  commands can't duplicate, hide or delete a design's root, where the old menu could hide it; and Hide is read from the
  state the selection was picked in. It named where the change lands (Hide in Default, PAR-497) until you asked on
  2026-11-06 for the menu to say just Hide and Lock (PAR-192).

## Canvas

- **tldraw's licence key comes from the environment.** You said on 2026-10-29 that you mean to pay for a licence, and
  until then the notice shouldn't get in the way. `VITE_TLDRAW_LICENSE_KEY` in `apps/desktop/.env.local` is passed to
  tldraw (a free trial key works), and without it the "Get a license for production" notice shows as before. My call:
  the canvas is a layer of its own, so the notice stays on the canvas and the app's menus, popovers and dialogs open
  over it.
- **Hints are shadcn tooltips, never the system's.** My call, from your note that they didn't look like shadcn: every
  hint goes through `Hint` (`chrome/Hint.tsx`). A control's shows at once, as shadcn's do; a row's or a truncated name's
  waits half a second, so moving down a list doesn't flash one per row. Menu items get none, since a tooltip opens on
  focus and the arrow keys would open one per item. File > Open recent shows each project's folder under its name
  instead.
- **The status bar shows what Parity runs.** You chose on 2026-10-29 to list only the processes Parity runs or uses, and
  each task's latest run. A button lists each open project's build server and Storybook and the tasks running, with
  their state, time, address and Portless name, and stops, restarts or dismisses each. My calls: stopping asks first,
  and each kind has an icon and a hue at least 25° from the others, using the canvas's own colours for the build server
  and formatting.
- **Locking is Figma's** (PAR-192). Ctrl+Shift+L locks the selection, which can't then be selected or moved on the
  canvas, with everything inside it, and is still selected from Layers. It's saved as `locked` on the layer or design,
  the same in every state and screen size, since it's about editing rather than what the design shows. My calls:
  - **A click on a locked layer goes to the layer around it,** and a locked design is left to tldraw, as a locked shape,
    so a press on it draws a box rather than selecting its board.
  - **Selected from Layers, a locked layer still changes from the inspector and the keys,** nudging included, but takes
    no resize or spacing handles on the canvas. You approved the controls on 2026-11-06 with nudging left in.
  - **The page has no lock,** since locking it is locking the design, and layers inside an instance have none, as they
    have no eye. A layer locked by one around it shows a faded lock while hovered, saying what locks it, rather than a
    lock of its own to press.
- **Snapping is on by default.** Designs lock to each other's edges and centres within 8 screen pixels, and absolutely
  placed layers to their siblings' and their parent's, and to even spacing among their siblings (PAR-174). Hold Ctrl to
  move or resize freely, or turn it off under View.
- **Layers snap through the same code as designs** (PAR-174): `snapLayer` beside `snapBox` in `@parity-app/editor`, with
  the same distance, tldraw's red snap indicators for the guides and spacing marks, and one `snaps` deciding Ctrl and
  the preference for both. My calls:
  - **An absolutely placed layer moves live,** writing as the pointer moves in one gesture, as resizing already did,
    with Escape going back to the checkpoint. It used to show an outline and move on release.
  - **Where it locks, it's written exactly,** to the half pixel, in fractions of a step when the line isn't on the
    spacing scale. Rounding to half steps would leave a centre or an odd-sized sibling's edge a pixel off while the
    guide said it lined up. An axis that doesn't lock moves in half steps as before, and a resize in whole steps.
  - **Only absolutely placed layers snap.** Layers in a layout are placed by it, and their sizes stay whole steps or
    fill.
  - **Even spacing counts the siblings beside it across the axis,** as a row or column, and takes the middle between two
    or the same gap beside an evenly spaced run. When a line is just as near, the line wins; when both land on the same
    place, both show.
  - **The distances shown are to what it locked to:** the gap to a sibling, or its four insets when it locked to its
    parent, drawn as Alt's redlines, whose geometry (`distancesBetween`) moved into the package for both.
  - **Resizing snaps only the dragged edges,** without even spacing, and Shift on a corner keeps the proportions instead
    of snapping.
- **A click inside a board selects what's under the pointer, as in Figma's top-level frames** (PAR-163, which replaced
  double-click drilling in first). A click selects the top-level layer, or, with a layer of that design selected, its
  sibling there. The board is selected by its title or background, and a click on a frame's background selects it too.
  Each double-click goes one level deeper than the selection, and edits text only on a selected text layer that's the
  deepest thing under the pointer. Ctrl-click selects the deepest layer, Enter selects the layers inside or edits a text
  layer, and hovering outlines what a click would select, in the frame under the pointer. A press drags what a click
  would select, so a board never moves by a frame's background, where Figma moves a selected frame dragged from inside
  it. Free text notes keep tldraw's click and double-click.
- **A box drawn from a frame's background selects the top-level layers it touches** (PAR-163), as Figma's and tldraw's
  do, live, drawn with tldraw's own box; Shift adds to the selection and Escape restores it. Ctrl doesn't make it go
  deeper yet. With several designs selected, Enter works in the one picked last.
- **The window's page never scrolls; only panels do** (PAR-424). My call: the guard is `overflow: clip` on the app's
  positioned root, not `overflow: hidden` on the document, which the page already had through the body and which the
  browser still scrolls to show what's focused. `clip` can't be scrolled at all, and holding the root positioned keeps
  even an absolutely placed element with no positioned ancestor inside it. Menus, dialogs and toasts are portaled to the
  body and fixed, so they're unaffected.
- **Tab on the canvas reaches only the selected design's own controls** (PAR-424). My call, from the issue's "Tab should
  leave the canvas": its title, menus, mode captions and state labels are in the tab order, and every other design's are
  out of it, reached by N, Layers or a click. Captions stay reachable because nothing else selects a mode column, as the
  code review pointed out. Enter on a menu, caption or label is the control's, and on the title it still selects the
  layers inside. A hovered design's menus are in the tab order while they show.
- **A closing menu's keys are the canvas's** (PAR-424). My call: a menu, list or dialog playing its closing animation
  counts as closed for shortcuts, a field in it included, so Ctrl+Z straight after a menu item undoes it.
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
  the stats show. Memory is what each process uses on its own, as the system's own monitor counts it: the working set
  Electron reports also counts the pages the processes share, once for each, and read about 25% high. Electron doesn't
  give the private part, so each system is asked its own way (`main/private-memory.ts`): on Windows, the private working
  set of Task Manager's Memory column, from a PowerShell that calls `GetProcessMemoryInfo` (a fraction of a millisecond
  a process, where the performance counters take over a second) while the stats show and stops 15 seconds after; on
  Linux, anonymous resident memory from each process's `/proc/<pid>/status`, which stays readable for Chromium's
  sandboxed processes where `smaps` doesn't; on macOS, the footprint of Activity Monitor's Memory column, from `top` at
  most every two seconds. A process the system won't say about keeps its working set. `pnpm perf` reads memory the same
  way. The Linux and macOS readings are tested against those systems' output, but haven't run on them yet.
- **`pnpm perf` measures the canvas** in its own copy of the app on the example project, in a window that opens at
  1439×901 in the middle of the main screen, so every run draws the same area at the same pixel ratio (the page is held
  at that size only if the window can't open within a few pixels of it, so a maximized copy still lays out like a
  window). The copy keeps drawing while other windows cover it, and a run made while it was minimized is marked as not
  counting. Sizes are read from the DevTools protocol, since evaluated code reads a frame's viewport. It measures frames
  per second zooming, panning and hovering, where each frame's time goes, selecting and editing a design, memory, and
  what a hidden tab holds. Results go to `.inspect/perf`, and `--compare` sets a run beside an earlier one. The copy is
  kept apart from the person's app and other sessions: its own ports, profile, bundle folder (`out/<port>`) and agent
  file, so agents keep talking to the person's app; and it serves the code as it was when it started, so edits made
  meanwhile can't reload what's measured. Its window says it's the measuring copy.
- **Zoomed far out, frames show bitmaps.** Once a frame has stayed the same for a second, the offscreen renderer
  captures it at a quarter of its size, one frame at a time so agents' renders still get their turn. Wherever the canvas
  draws frames no larger than that (25% zoom on a 1x screen), each shows its bitmap, and its live frame skips drawing;
  once the zoom settles, its design is unmounted too, keeping its host (see the next decision). The selected design
  stays live, as does everything while interacting. Until its bitmap is taken, a frame shows its skeleton: measured from
  the live frame once it has stayed the same for a second, its text as faded bars in the text's colour and its cards,
  fields, buttons and images as flat shapes, drawn as a few SVG paths per frame, and keeping the frame's measured
  height. A frame not measured yet stays live. Bitmaps and skeletons are kept in memory only, so a code change never
  shows a stale one. Below about 5%, boards and frames also drop their shadows.
- **Frames showing bitmaps sleep (PAR-197).** Once the zoom settles past that line, a frame showing its bitmap unmounts
  its design's React root and its elements, keeping its host, its height and its bitmap; it wakes as its board comes
  near the view, one frame each animation frame. On the example project (119 frames, 1440×900 window, 1x screen),
  measured with the DevTools protocol after collecting garbage: zoomed out, the window's DOM nodes went from 32,458 to
  6,503 and its JavaScript heap from 146 MB to 101 MB, about 0.38 MB a frame; zoomed in on one design, the same, since
  only the frames near the view wake. Zooming in from fit to 100% drew the frames in view in 250 ms, its longest frame
  50 ms, and to 40% in 300 ms, longest 33 ms, with no board changing size. Those times are from before sleeping hosts
  skipped drawing and changed frames woke; a later run's window was throttled to a frame a second, so its times don't
  count, though its memory matched. The issue's 0.85 MB a frame wasn't all heap: the elements' own memory is the
  renderer's, outside the heap, so the heap gives back less than half of it.
  - **Sleep waits for the zoom to settle,** rather than the zoom at each frame as `data-far` does, so zooming through
    the line doesn't unmount and remount a project's frames on the way.
  - **Only frames near the view wake, one each animation frame.** Remounting all 119 at once, as PAR-153 tried for a
    hidden tab, kept the page busy for 4 s; a frame costs tens of milliseconds to mount in development.
  - **Where a board is reaches its frames as tldraw signals,** not props: passing whether a board was near the view as a
    prop drew all 119 boards again each time the camera crossed one, 350 ms in one frame on zooming in.
  - **A frame keeps its host element,** empty, so selection, hit testing and agents' cursors still find the frame and
    its design. A sleeping frame's host skips drawing, as a board out of view does, so the browser keeps the size it
    last had when drawn; noting an empty frame's size instead shrank a board to its padding the next time it skipped.
  - **A frame whose design changes while it sleeps wakes wherever it is,** so its board lays out the new size that
    agents' snapshots read, and sleeps again once its new bitmap is taken. A token edit wakes every frame, one a frame.
- **What a frame shows is keyed once, with the guest's code revision (PAR-439).** `useFrameShows` works out each frame's
  keys and offscreen job together, so the live frame, its bitmap, its skeleton and its sleep can't disagree about when
  it changed. Before, `ModeView` and the bitmap each keyed the frame their own way, and neither knew the guest's code: a
  component the type checker found, or found moved, left frames and bitmaps as drawn.
  - **One revision for the project's code, not one per component.** It goes up only when a component comes from a new
    file, which is rare, and then every frame draws again and every bitmap is retaken in the background. Keying each
    frame by the components it uses would redraw fewer, but needs the components inside instances too; it can go behind
    the same key if redrawing everything proves costly.
  - **The live frame draws again on what its design renders,** not on its size or previewed tokens, which it follows by
    itself, so a token preview doesn't draw every frame's React tree again. Bitmaps go by both.
  - **Redrawn in place, not rebuilt.** The guest looks each component up as it draws, and dropping the old loader's
    component makes the next draw use the new one, so the frame keeps its other components' state.
- **The canvas doesn't restyle its elements while the camera moves.** tldraw's `--tl-zoom` changes only once zooming
  stops, titles and labels size themselves from the zoom directly, selection colours go through tldraw's theme rather
  than custom properties, and the layer the camera moves is composited, so panning and zooming move what's already drawn
  until the camera stops. Chrome never draws a composited layer again at a new scale, so once the zoom settles the layer
  goes without the hint for two frames and is drawn sharp at that zoom (`redrawLayer`, PAR-556); keeping the hint off
  whenever the camera is still would also do, but would repaint the whole layer when panning starts. Boards well out of
  view skip drawing their frames but keep their layout.
- **The app is named Parity, with Parity's icon, to every system.** The main process names itself Parity and keeps its
  settings where the package's name put them (`%APPDATA%\@parity\desktop` on Windows). Each system names and draws an
  app from its program rather than its windows, so `pnpm dev` runs a copy of Electron carrying Parity's name and icon
  (`scripts/parity-electron.ts`), made once for each Electron version and icon under `apps/desktop/node_modules/.cache`;
  if it can't be made, the app runs as Electron, with a warning. On Windows the copy is `Parity.exe`, its version
  information saying Parity and its icon resources replaced with `icon.ico`, its other files linked to Electron's; the
  edit voids the signature, so Windows would refuse it with Smart App Control on (it's off here). On macOS it's
  `Parity.app`, cloned from Electron's bundle, with its program renamed, its Info.plist naming Parity, its icon file
  drawn from `dock.png` and the bundle signed again ad hoc; Electron finds its helpers by its own name first, so they
  keep theirs. On Linux it's Electron's folder linked, with the program as `parity`, since Linux names a process by its
  file; the window's icon comes from the app. The macOS and Linux copies haven't run on those systems yet.
  - **The copy runs as development, not as an installed app** (PAR-489). Electron's `app.isPackaged` is true for any
    program not named `electron`, so the copy looks packaged to Electron. The dev runner sets `PARITY_DEV_RUNNER`, and
    `main/packaged.ts` counts the app as packaged only without it: the project service starts from `out/utility.mjs`
    beside the bundles, not from `resources/app.asar.unpacked` beside the program, and update checks stay off. Before
    that check (it landed with PAR-490), the copy on Windows forked a service script that didn't exist, and the utility
    process exited with code 1 for every window load, printing nothing. The main process now names the missing path when
    the service exits that way. The copy is kept, rather than running Electron under its own name in development, since
    it's what gives the app its name and icon; `PARITY_STANDARD_ELECTRON=1 pnpm dev` runs Electron as installed, to tell
    a fault in the copy from one in the app. The smoke check is in editor.md, "Opening and closing projects".
- **A selected design shows only its own rounded outline.** tldraw's square selection box is drawn only around several
  designs at once.
- **tldraw's overlay canvas holds a bitmap only while an overlay shows** (PAR-196). tldraw draws the selection box,
  hover outlines, the brush and snap lines on one canvas the window's size in device pixels. It kept that bitmap all the
  time, empty or not: 5 MB in the window and 31 MB of GPU images at a 1289 × 1012 canvas, measured with a memory-infra
  dump on 2026-10-30. My call: Parity holds the canvas at no size while nothing shows, and lets tldraw size it again as
  soon as something does. tldraw doesn't let an app replace that canvas, and it sizes it on every draw, so Parity sets
  the canvas's own `width` and `height` to accessors that pass tldraw's size through only while an overlay shows
  (`overlay-canvas.ts`). Patching tldraw would do the same but need carrying on every upgrade. Hovering a board, or
  having several selected, still allocates the whole canvas while it shows.
- **Copy and paste go through the system clipboard,** in a JSON envelope Parity recognises, so copies paste across
  projects and windows. Copied layers bring the state they were copied in with them, and pasting gives them new ids.
  They bring what the frame shows, bound values included (see "Editor operations read what the board shows (PAR-464)").
  Plain text pastes as a text layer, or as a note on the canvas when nothing is selected. Copy style and paste style
  stay inside the app. Pasted PNG, JPEG, GIF, WebP and SVG images up to 20 MB are saved to `public/images/`.
- **Several layers of one design, or several designs, can be selected together.** The inspector shows what they share
  and lists what differs, with a "Mixed" placeholder in each field that differs.
- **Dragging a layer** shows an outline under the pointer, and the layouts around it reflow live around a copy of it
  where it would land, with a line only where they can't. Moving within a design keeps ids and state overrides. Moving
  to another design takes the shown state with it and gives new ids. Absolutely placed layers move by their insets,
  rounded to half a spacing step.
- **Wrap in layout** is Ctrl+G, Ctrl+Alt+G or Shift+A and copies the parent's direction and gap; Ctrl+Shift+G unwraps.
- **Align and distribute use Figma's keys,** Alt with A, H or D across and W, V or S down, plus Alt+Shift+H or V to
  distribute. Inside auto layout, aligning across sets each layer's own alignment and aligning along sets the parent's
  justification. Designs on the canvas align by their bounds.
- **The layout grid** (Shift+G) has 4, 8 or 12 columns for frames under 600px, under 1024px and wider, with 16, 24 and
  32px margins and 16, 24 and 24px gutters. These are fixed until breakpoints or library metadata provide them.
- **The insert picker** (`/` or Shift+I) offers text, rows and columns, component designs, the project's and libraries'
  components, and icons once two letters are typed. It inserts where a paste would.
- **The picker ranks by where things come from, and a search by how its name matches** (PAR-178). My calls, from the
  audit: browsing lists basic layers, component designs, the UI kit, the rest of the app, pages, then libraries' designs
  and components. A search ranks an exact name, its start, a word's start, anywhere in it, then a name and description
  together, then a description alone, the project's own first within each. The old fuzzy match is gone: letters
  scattered through a name found AlertDialogTrigger for "badge".
- **Internal parts, portals, providers and the app's plumbing are left out until a word of the search is in their name**
  (PAR-178). My call on what counts: a `.lib.par`'s `internal` parts, names ending in Portal, Provider or Providers (the
  last piece of a namespaced one, as Radix's `Tooltip.Provider`), and App, Router, Routes and names ending in Boundary.
  A search only starting the name (`dialog` for DialogOverlay) lists it after every other match; one naming it in full
  ranks it with them. The Components panel lists them last in each source, under a heading saying what they are, rather
  than hiding them, since it's where people browse everything.
- **A component found in two places is one row in the picker, with both sources** (PAR-178). My call: components with
  the same name from different sources merge, never designs or basic layers, and never two from one source. Enter
  inserts the project's own; clicking a source inserts that one, and a search naming a source puts it first. The
  Components panel keeps them in their sections, which already tell them apart.
- **The picker isn't a modal dialog, and draws only the rows in view** (PAR-178). My call: a modal Radix dialog's scroll
  lock and pointer block restyle the whole window to open, about 100ms, and cmdk drew all 610 rows, about 350ms. The
  picker keeps the look with a backdrop of its own, which takes clicks outside and closes it, and keeps Tab in its
  search field. Its list is built once per project while the window is idle, with its icon sets.
- **Radix Primitives isn't hidden from the picker** (PAR-178). Nothing in a `.lib.par` says a library is unstyled
  primitives that the project's own components wrap, so it ranks last as a library. A flag in the `.lib.par` would let
  the picker leave it out; that's for when a project shows it's needed.
- **Interact (I) hands the pointer and keys to the designs,** so their real components work as in a browser: tabs
  switch, fields take typing, menus open. Clicks and keys stop at the design, so the canvas doesn't select, drag or run
  a shortcut too; scrolling still pans. Outlines and handles hide while interacting. An Escape the design doesn't use
  steps out of it, and the next one goes back to Move and select. When interacting stops, every frame starts again from
  the design, so nothing you tried is left on the canvas, and the project isn't changed by it.
- **Keys reach a design only in Interact** (CAN-54). Outside it, frames are inert: Tab, clicks and a component's own
  focus calls never reach a design's inputs or buttons, so the canvas's shortcuts keep working. Selecting, hovering and
  measuring use layout boxes, never hit testing, so inert frames don't affect them. In Interact, keys typed into a
  design are the design's, found through the event's composed path, because shadow DOM hands the canvas's listeners the
  frame instead of the field inside it.
- **The arrows nudge** (CAN-39). A layer in a layout moves one place along the direction its frame draws, stepping over
  absolutely placed siblings and ones the state hides; in a grid, Up and Down move a whole row when there's one to move
  to, and Shift still moves one place. An absolutely placed layer moves one spacing step, or ten with Shift, from where
  it's drawn, since 1px would leave the scale until PAR-194. Designs and notes move 1px, or 10. Each run of presses on
  one selection is one undo step, however slow (see "Undo is one step per gesture").
- **Layers are found from React's tree, as React DevTools does** (CAN-45), so a component that renders none of its props
  can be hovered, selected, outlined and dragged. Component layers are marked by the guest's error boundary and the
  others by their element. It reads React 19's internals and falls back to the `data-canvas-node` attribute, which the
  guest still passes, when they're missing. The walk runs once after React commits a frame or its DOM changes, so
  hovering only measures boxes.
- **A layer's box is what it draws at its top level** (CAN-45): one element for most layers, each root of a fragment,
  and for a provider, the top-level elements of the layers inside it. A point belongs to the innermost layer. Undrawn
  (0×0) elements and elements clipped to nothing, such as a checkbox's hidden input, are left out unless every element
  is undrawn (PAR-163), content portaled out of the frame doesn't count, a slot drawn twice is one layer covering every
  copy, and a component that draws nothing has no box and is selected from Layers.
- **When a component's props have no `style`, the inspector says sizes and styles won't change it** and offers Wrap in
  layout (CAN-45). It's read from the props type, so it doesn't show for `any`, `object`, index signatures or type
  parameters.
- **Length fields are typed and shown in pixels and stored as spacing steps** (CAN-48), at the project's step size, so
  320 in Width is 320px (80 steps at 4px, 40 at MUI's 8px). Fields take px, rem (16px) and %, maths with `+ - * /` and
  brackets, and token names. A leading `+`, `*` or `/` works from the current value, while a leading `-` is a negative
  number, since insets can be negative. `%` is a share of the current value, as in Figma, except in Opacity, where it's
  the unit. When maths needs a value that isn't set, padding, gaps and insets count as 0, opacity as 100, and Width and
  Height as their measured size; limits, rows and max lines say there's no value to work from.
- **Until PAR-194, a typed length lands on the nearest half step** (2px on a 4px scale), which is what dragging writes
  and what Tailwind's scale lists below 4, and the field says so under its row. Values already off it show as they are
  until edited.
- **Up and Down move a length one spacing step, and Shift ten;** other numbers move by 1 and 10, and a run of presses is
  one undo step (PAR-441). Dragging a label scrubs one step per 2px, or ten with Shift, and Escape cancels; the row's
  label scrubs when the row has one field, otherwise each field's letter does.
- **A field keeps input it can't read,** marked, with the reason under its row, even after it loses focus. Enter keeps
  focus with the text selected, and Escape reverts and leaves. A value changing underneath doesn't touch what's being
  typed.
- **The canvas previews a field's edit as inline styles on the frames already drawn,** not through the store, so typing
  shows in about 25 ms and commits as one undo step.
- **A number prop previews by being made in the design and taken back,** since the component has to draw again for it
  (PAR-203). My call: the preview is a change in a gesture of its own, reverted to its checkpoint before the next
  keystroke and on Escape, as a resize writes as the pointer moves, rather than a second source of designs for the
  frames to draw beside the store. So while it shows, the panels, agents and, with automatic saving on, the file see it,
  as they see a resize in progress; taking it back leaves nothing to undo, and making it is one undo step. Edits work
  from the value as it was before the preview.
- **Opacity takes whole percentages** (PAR-203). My call, of the two the issue offered: a typed fraction is rounded to
  the nearest whole percentage and the field says so ("Rounded to 33%: it takes whole percentages"), as a count's is,
  rather than keeping the fraction and naming what it shows. It's the same code path counts already had, and the field
  shows two decimals, so `100/3` would have kept 33.333… behind a 33.33. An opacity already off a whole percentage stays
  as it is until it's edited.
- **The example's code field takes `value`, not `defaultValue`** (PAR-203). input-otp, under nova's InputOTP, reads
  `defaultValue` for itself but also passes it to its input beside its own `value`, which React warned about in
  development. Verify email's code is now fixed at 482913 (482931 in Wrong code), so in Interact it can't be typed over.
- **The field parser is in `@parity-app/core`** until `@parity-app/editor` exists (PAR-7).
- **A dragged layer stays in its own layout while the pointer is over that layout** (CAN-47): it changes places with its
  neighbours and never drops into one of them, so cards and bars that are layouts themselves don't swallow the neighbour
  they pass. Putting a layer inside a neighbour is done in Layers for now (PAR-206). Targets are measured before the
  dragged layer is hidden. In a grid or wrapping row, the line under the pointer decides first, then the children's
  middles, and below the last line the layer goes last.
- **A resize starts only after 4px along the handle's own axes,** and an edge fills only once it has left the parent's
  inside and come back, so pressing a handle never changes the other axis (CAN-47). Absolutely placed layers resize by
  their insets and never fill: a token inset on the side that moves becomes a number of steps, since a token can't be
  offset, and the other sides keep theirs. The resize hint closes when a handle is pressed.
- **An empty layout takes 24px on the canvas along each axis its content would size** (PAR-193), outlined in dashes, so
  it can be seen, selected and dropped into. My calls: it's the canvas's alone, as Webflow and Framer show an empty
  container, not a change to the design or its code; an axis the design gives a fixed length or a least length, on the
  layout or on an instance of it, keeps that, so an empty spacer stays as thin as it was made, while filling and
  growing, which can leave it at nothing, get the 24px; and core marks an empty layout's element with which axes those
  are (`data-canvas-empty-layout`), since CSS can't tell an empty layout from a component's empty divider, and `:empty`
  in the sheet every frame shares kept closed projects' frames in memory. The size label shows the 24px. Only the canvas
  and the bitmaps standing in for its frames draw it (PAR-888): agents' screenshots and measurements, exports, copied
  PNGs and component previews draw an empty layout as the code does, so they match the app.
- **Resize handles sit outside a layer along an axis where it's under 24 screen pixels** (PAR-193), so a press on a
  small layer drags it. My call: per axis, so a wide, short button keeps its side strips on its ends, as every wide
  layer does, and only its corners, top and bottom move out. Where handles go is `handleBoxes` in `@parity-app/editor`.
- **A selected layout's padding and gaps are handles on the canvas** (PAR-169), approved in Storybook (Parity/Canvas/
  Spacing handles) on 2026-11-05. My calls, several of them Andrew's in that review:
  - The bars show whenever a single layout is selected, rather than only on hover as in Figma, so padding of 0 can be
    dragged out of nothing. Since PAR-797 nothing is hatched until a bar is used, as in Figma. A side's press target
    starts 4px inside its edge, clear of the resize strip there.
  - No press target covers a child, so a click inside a selected layout still selects what's under it, as before. A
    target is cut back to the free space and dropped under 4px, so padding of 0 drags out only where no child is against
    that edge. This narrows the No padding story Andrew approved, whose children fill their row: clicks on children
    opening the box broke selecting layers by clicking, in the end-to-end tests on #266.
  - Dragging a padding bar away from the content makes that padding bigger on every side, as an edge dragged out makes a
    layer bigger. A gap grows as its bar goes right or down. Both go in whole steps of the spacing scale.
  - Alt gives the opposite side the dragged side's value, and Alt+Shift every side, re-read at each move, so letting go
    mid-drag puts the other sides back. A layout has one gap, so dragging any gap's bar changes every gap, and all of
    them are shaded.
  - Unlike Figma, a value bound to a length token stays bound while the drag lands on a length token's value: its own
    token first, then the first listed with that value. Between tokens it's steps. A number stays a number, even on a
    token's value. The label names the token, or the value's step of the scale (`20 spacing-5`).
  - A click opens a box that reads what the inspector's fields read, through `readFieldInput`, with a switch between px
    and rem (16 to the rem) and the inspector's list of tokens and the spacing scale, its bars drawn as the token
    previews draw them. Figma's number fields take pixels only. No other unit: `%` is a share of the value there, not a
    length to switch to.
  - The modifiers are gestures in the keymap (`gestures` in `chrome/keymap.ts`), which the Keyboard shortcuts dialog
    lists, the hints show with `Kbd`, and the handles read through `holds`, so what's shown is what works. The rules in
    `@parity-app/editor` take what they mean (`{ opposite, every }`, `centre`, `fill`), not keys.
  - A bar's hint lets the pointer through it (PAR-801), my call: on a bar 12px thick, the hint's arrow slid in over a
    still pointer and took the hover, and the hatching with it. So the hint can't be hovered, and it closes as the
    pointer leaves the bar, onto the hint too. It holds nothing to point at, and it no longer covers the canvas under
    it. Other hints can still be hovered.
- **Padding and gaps are modes' green, hatched as Figma hatches them, and margin is pink** (PAR-797), Andrew's calls:
  - Padding takes modes' green and margin the pink the canvas drew padding in, as the Design panel's box model draws
    them (PAR-186). Gaps go green with padding rather than staying pink, so pink means margin only.
  - Margin keeps our pink, `oklch(0.66 0.22 350)`, rather than Figma's, about `oklch(0.66 0.265 347)`, compared side by
    side in Storybook on 2026-11-09. Figma has no margin; its pink marks padding. Ours stays within the chroma of the
    canvas's other colors (0.16 to 0.23), where Figma's would outshout the selection, and the two look nearly alike
    hatched.
  - The hatching follows Figma's, in these colors. Nothing is hatched while a layout is only selected; a bar hatches the
    space it changes while it's hovered, focused, typed in or dragged, in place of the flat tint it had: one padding
    side, or every gap at once. The lines are 1px, rising to the right for padding and gaps alike, 8px apart along an
    edge, over a faint tint, in screen pixels. Measured on Figma's canvas on 2026-11-09. The always-on hatching over a
    selected layout, with gaps hatched the other way, is gone.
  - A padding side's area runs its whole edge, corners included, as Figma hatches a side. Sides hatched together, as Alt
    and Alt+Shift change, are one shape, so a corner is hatched once.
  - A value's chip is the bar's color with near-black text, 7.9:1, as modes' chips are, in place of a darker pink step
    under white.
  - The colors and the hatching are defined once, in `canvas/spacing-colors.ts`, so a change reaches the bars, hatching,
    chips and the token list's bars together. A chip takes its text from `chipFor`, and a test in Chrome fails any
    canvas chip whose text is under 4.5:1.
- **A double-click on a layer's resize handle hugs, and Alt+double-click fills** (PAR-169), as in Figma. It used to take
  the size away, which drew as hug for most layers but left the layout to decide. A size along the layout's direction
  takes `grow` away, as a drag does. A frame's handles still go back to the viewport's width or the content's height.
- **Several selected layers resize together, in proportion** (PAR-169): handles on the box around them, each layer
  taking its share of the movement by its size across that box, so the box's edge follows the pointer. My call: each
  keeps where its layout puts it, and they don't snap, as a single layer in a layout doesn't. Alt resizes a layer, or
  several, from the middle: the opposite edge moves as far, an absolutely placed layer's inset moves back by half of
  what it grows, and it neither fills nor snaps.
- **Escape cancels a resize and a title drag** (PAR-193), as it already did a layer drag and a box. My call: a resize
  writes as it goes, one undo step since PAR-441, so Escape goes back to a checkpoint the store takes when the drag
  begins, restoring the design's file and taking the drag's own steps out of undo, rather than undoing however many
  steps the drag made. Another file changed meanwhile, as by an agent, keeps its change and its step, as the code review
  asked. `DesignStore.checkpoint` and `revert` move with the history when PAR-34 takes it into `@parity-app/editor`.
- **A gesture's cursor is held by a transparent layer over the window** (PAR-193): grabbing for a drag, the handle's
  arrows for a resize. My calls: a layer rather than a rule on every element, which would restyle the whole page twice
  per gesture; and the browser's own grabbing, resize and text cursors, as the handles already showed, rather than
  tldraw's drawn ones.
- **A duplicated design goes to the first free space to the right along its row,** 160px clear of every design and note,
  as do designs pasted into their own project (CAN-47).
- **A duplicate or pasted design that lands off screen is brought into view, at the zoom it's at** (PAR-204). My calls:
  - The view moves the least it can along each axis, rather than centring the copy, so what was in view stays as near as
    it can and a run of duplicates walks the view along the row.
  - The copy keeps 64px clear of the canvas's edges, room for its title above it. A copy wider or taller than the view
    only needs its start in view, where the title is, since all of it can't fit at that zoom and the zoom isn't changed.
  - Ctrl+D, Duplicate in the Layers menu and Ctrl+V of designs pan; Paste over selection and Paste here don't, since
    their copies go where the person is already looking.
  - The rule, `panToShow`, is in `@parity-app/editor` beside `freeSpotBeside`, taking the view and the copy's box; the
    app's `bringIntoView` reads tldraw's view and camera and animates the pan over 250ms.
- **The text editor opens on the double-clicked word, or the whole text** (PAR-175). A double-click selects what a
  browser's would: the word holding the character under the pointer, or the space or punctuation there. Enter, the text
  tool and the insert picker select the whole text, so typing replaces it.
- **Escape keeps a text edit, as notes do, and so does Enter** (PAR-175). My call: Enter still keeps it and Shift+Enter
  types a new line, as before, where Figma's Enter types a new line; text layers here are mostly one line of a
  component, and a new line is drawn as a space until text layers keep white space. While an input method is composing,
  Enter and Escape are left to it.
- **The text editor is measured against the text every frame,** not once (PAR-175), so it follows the camera and the
  layout. Text that wraps is edited in its content box at its own width; text that stays on one line grows from where
  its characters are, up to its maximum width.
- **Text layers size as Figma's do: auto width, auto height or fixed** (PAR-175). The mode is read from the width and
  height, not stored beside them, so the resize handles change it as Figma's do and nothing can disagree. Each maps to
  the Tailwind classes Parity writes for those sizes:

  | Mode        | Width and height                                                      | Tailwind                                            |
  | ----------- | --------------------------------------------------------------------- | --------------------------------------------------- |
  | Auto width  | `width: "hug"`, no height                                             | `w-max`, and `max-w-*` when it has a maximum        |
  | Auto height | a length (`w-80`), fill (`w-full` or `flex-1`) or no width, no height | the width's class only; the height follows the text |
  | Fixed       | a width as for auto height, and a height (`h-12`, a token, or fill)   | the width's class and `h-*`, `h-full` or `flex-1`   |

  My calls: hug on a text layer is drawn `max-content` (`w-max`) rather than the `fit-content` (`w-fit`) hug is on other
  layers, since auto width text never wraps for its parent, only at a maximum width, as Figma's doesn't. No text layer
  in the example hugged before this. A text layer with no width wraps at the width its layout gives it, so it reads as
  auto height, which is what new text in a layout starts as. Switching to auto height or fixed keeps the layer the size
  it's drawn at, rounded up to whole spacing steps so the text doesn't wrap again (past a thousandth of a step of
  measuring noise), and in a state or variant auto width and auto height write `height: "hug"` over a height the design
  sets, since dropping the state's change would leave the design's showing; fixed text that runs past its height
  overflows, as in Figma.

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
- **A component's board shows each param's default,** as an instance with no args does (PAR-164, my call; it changes
  what main boards show, which showed the design's own values). So the Stat card's board shows only the trend icon its
  params select. Editing a bound text, prop or visibility on the board in the base state changes that default, which
  matches the Params section's "Defaults show on this board".
- **Edits that can't be per state or variant say so before they're made** (PAR-164): an image's file, alt text and fit,
  and an instance's state, Reset all, Swap and Detach. A tinted note styled like the "Editing Monthly changes the
  design" control reads, for example, "File, alt text and fit change the design in every state, not only Yearly", and
  shows only while edits would otherwise go to a state or variant.
- **Prop and param fields follow the declared type** (PAR-164), not the value's: a number param with no value takes a
  number, JSON that doesn't parse is refused with the reason rather than saved as text, and an empty field clears the
  value.
- **A state can take a value away (PAR-426):** a patch's `unset` lists prop names and style keys to drop from what's
  under it, `{ "unset": { "style": ["gap"], "props": ["disabled"] } }`, so a state, a variant option, an instance's
  overrides or a viewport can show a layer without what the design sets. Patches layer as before: an upper patch's
  `unset` drops the lower ones' values, and a value it sets wins over a key a lower one took away. Taking an instance's
  param value away gives the param its default. In the base design, taking a key away removes it. A key is only kept in
  `unset` when what's under the patch has it, and never both set and taken away by one patch. My call over `null` in a
  patch's values: agents' `Update` already reads `null` as "take back this change", and a prop can be `null` on purpose,
  so a list says it apart from both. Paste style in a state takes away what the copy doesn't set, so it replaces the
  look there as it does in the base, and the inspector marks a value taken away as changed, with Reset.
- **Clearing a prop in a state takes it away there (PAR-421):** a switch back to its default, emptied text or a removed
  attribute is the prop taken away in the state being edited, not the state's change taken back, so a prop the design
  turns on can be off in one state. Reset is how to take the change back. My call over writing the default's value
  (`false`) into the state: a prop's declared default isn't always known, and taking the prop away shows what the
  component does without it, as clearing does in the base. An attribute taken away stays listed in the props, so it can
  be set again or reset.
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
- **Layers lists an instance's layers below it, read-only apart from the eye** (PAR-92). The eye hides or shows the
  layer in that copy. Rename joins Duplicate, Hide, Lock and Delete as unavailable in the row's menu, since the name is
  the component's. The menu's Hide stays unavailable, as the menubar's is (PAR-419), so the eye is the tree's one way to
  hide them (my call: making Hide work inside instances would change the canvas and the menubar too). What the copy
  changes isn't marked in the tree: you chose that on 2026-11-07 ("Remove the purple pen"), leaving it to the inspector.
  Search goes inside instances (my call), unlike Select same. A slot the instance fills shows its fills in place of the
  placeholder, as the canvas draws them (my call, replacing PAR-83's rule that nothing shows under an instance, which
  came before instances had rows under them).
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
- **A component's id is its export name, gaining folders only on a clash,** as few as it takes to tell it apart, as in
  `(portal)/ErrorPage` and `app/ErrorPage`. A component in the UI kit folder, the one `components.json` names or else
  `src/components/ui`, keeps the bare name even then, because that folder was all Parity read before, so existing
  designs keep working: copacker's other `FieldError` becomes `components/FieldError`. A default export takes its
  declaration's name, else its file's.
- **Libraries are listed when they have a `.lib.par` or are in Parity's registry, plus workspace packages the app
  depends on.** Other dependencies, such as Radix or Base UI, show through the project's own wrappers.
- **Pages get their own section in the Components panel** until the routes lens can name them.
- **The UI kit loads with the canvas, and the rest of the app loads as it's drawn.** My call, made while building it:
  loading copacker's 275 other modules at once took 14 seconds before anything drew. On demand, its canvas is ready in
  about a second, and a page arrives in under half a second the first time it's placed.
- **Exports only the type checker can decide wait for it,** such as an alias or a component that only returns
  `children`. In the UI kit, every capitalised export is still listed from the start, as before, until the checker drops
  the ones that aren't components. My call, so nothing the UI kit showed before goes missing while it runs.
- **Some folders are never read for components:** installed packages, build output, `__tests__`, `__mocks__`, `e2e`,
  `tmp` and `temp`, and also stories, tests, generated files and the entry file that mounts the app. My call: copacker's
  tsconfig includes a `tmp` folder of experiments that would have added 2,500 components.
- **A workspace package is read from source, and only for exports the parse confirms.** My call: when its package.json
  points at built output, as published packages do (`dist/index.js`), Parity reads `src/index` beside it, since the
  app's dev server compiles the package's source too. Exports only the type checker could decide are left out, so a
  package of hooks and helpers adds no section. Its section's id is its name without the scope (`@acme/ui` is `ui`).
- **The Components panel lists the project's own components in three sections:** the UI kit under its files, the rest of
  the app under its folders (less the folders they all share, such as `src`), and pages under their routes. The UI kit
  opens with the panel and the other two start closed beside other sections. My call: the UI kit is what loads with the
  canvas, so the three follow how the app's components are found and loaded.
- **A page is told by its router's file names until the routes lens can name it.** My call: Next.js's route files under
  `app/` (`page`, `layout`, `template`, `error`, `not-found`, `loading`, `default`), and any component in a file in a
  `pages` or `routes` folder, other than files starting with `_` or `-` and `api` routes. Route modules' other exports,
  such as React Router's `ErrorBoundary`, are parts of the page too.
- **A re-exported component is listed where it's declared, and imported through the app's alias.** My call: the file
  that declares it is what the canvas loads, so an index re-exporting it adds nothing, even under another name. The
  import shown to people and agents is the file through the tsconfig alias reaching furthest into it
  (`@/components/ui/button`), not an index, since shadcn-style apps import each file.
- **The type checker keeps one program per open project, within a memory budget.** My call on the numbers: props and the
  checker share the program, which is kept for the two projects used last and let go when a tab closes; the worker stops
  when no project is open. It isn't built with under 1 GB of memory free, and the worker may use half the computer's
  memory at most. Either way the components stay as the parse found them.
- **The type checker stops five minutes after its last answer,** and the next request starts it again (CAN-84). My call
  on the delay, from the memory audit: after an open's props and check, only a change to the app's files asks the worker
  anything, yet it held its programs for as long as the project was open, 118 MB of heap on the example project (the
  service fell from 279 to 134 MB when it stopped) and 1.26 GB on Copacker. Starting again costs the next rescan about a
  second on the example (props in 2.6 to 3.7 s against 1.5 to 2 s warm), and likely the 9 s an open's props take on
  Copacker, so the delay is long enough that someone editing the app's code, saving every minute or two, keeps a warm
  program, and short enough that one who has gone back to the canvas gets the memory back soon after. A project's first
  request to a new worker carries the files the last one's program had read, so it builds the same program and finds the
  same components; a request made while the old one is stopping goes to the new one, and the worker never stops with a
  request waiting (`utility/worker-client.ts`).
- **What the checker and props found is saved outside the project, by contents.** My call: in
  `~/.parity/cache/detection`, one file per project, under a fingerprint of every file they read, the tsconfigs,
  package.json, the lockfile, the list as discovered and Parity's own checker code. Results aren't saved when files
  changed while the checker read them.
- **The fingerprint's inputs come from the code that reads them, not from lists of its own.** My call (PAR-469): the
  lockfiles are those package-manager detection recognizes (`findLockfiles`, from `package-manager-detector`'s list, so
  `npm-shrinkwrap.json`, `deno.lock` and `pnpm-workspace.yaml` count), in the same nearest folder detection settles on,
  and the tsconfigs are every file the config reader read (`ProjectTsconfig.read`): the configs, their references and
  each `extends` chain, a base from an installed package included. When a folder has several lockfiles, detection names
  the first in that list as `lockfile` and the fingerprint hashes all of them, since a package manager may read another
  (npm prefers `npm-shrinkwrap.json`). `fingerprintInputs` lists the files, for a watcher to follow (PAR-470).
- **A warm type checker is made again when the project's config inputs change, the same inputs the fingerprint reads.**
  My call (PAR-470): `configInputs` in `@parity-app/code` names them (every tsconfig `ProjectTsconfig.read` lists, a
  referenced one that's missing included, the root `tsconfig.json` and `jsconfig.json` even when missing, so one added
  or restored counts, package.json, and the lockfiles `findLockfiles` finds), the detection fingerprint hashes them, and
  the props worker stamps each one's size, modification time and, under a megabyte, a hash of its contents, so a rewrite
  within one tick of a coarse clock still shows. Before each request it compares them (`configChange`): a changed
  tsconfig or package.json makes the project's checker again with its compiler options read afresh, keeping the
  installed packages' declarations it parsed; a lockfile that changed, appeared or went drops those too (TypeScript's
  own lib files stay), since the lockfile is the signal that dependencies changed (installed declarations aren't checked
  one by one, and `node_modules` isn't watched). The project's watcher follows the same inputs, folders outside the root
  included, and any lockfile name appearing in the folders `findLockfiles` searches (`lockfileFolders`,
  `changesLockfiles`), and reads props and the type check again a moment after one changes, so the answers match a
  project opened afresh. The saved detection needs nothing more: its fingerprint already changes with them.
- **A config change sorts the app's sources again, as opening does.** My call (PAR-492): `rediscoveredFiles` reads every
  file the config includes now, and the files the list came from, through `filesChanged`, so components in files it
  leaves out are removed, those in files it newly includes are added, and the rest keep their ids. Exports only the type
  checker decided lose `as` and wait for it again, which the full type check that follows gives back, so the list
  matches a fresh open. Libraries' and workspace packages' components aren't touched, and the person's corrections are
  applied after, so an export they included stays even when its file is left out. The UI kit folder isn't looked for
  again; that still takes reopening.
- **Changed files are read again on their own, without reopening the project.** My call: the parse reads the changed
  files about half a second after the last change, so added, renamed and deleted components show at once, and the type
  checker then reads only those files and the files that import them, since an export's type can come from an import. A
  component that moves keeps its id while its name is unique, and the canvas draws it from its new file.
- **A workspace package is imported by its name and isn't pre-bundled.** My call: the app imports it that way, so the
  canvas gets what the app gets, and Vite compiles it as the app's own code. A package that doesn't build costs only its
  own components, as a project module does.
- **Why something is or isn't a component is shown where people look for it.** My call: each component's tooltip in the
  Components panel said what it was recognised as ("made with forwardRef"); since PAR-527 its card names its file
  instead, as you found that said nothing a person needs. A search that matches exports the type checker left out lists
  them under Not listed with its reason ("takes 2 arguments, not one props object"). Agents get the same list from
  `parity components`. Only capitalised exports are listed, as lowercase helpers and types aren't candidates.
- **Corrections name an export by its file and export name, and live in the main project file.** My call: `detection`
  holds an `include` list of `{ path, export }`, so a correction outlasts ids changing on a clash. A correction is an
  ordinary, undoable change to the file, saved when the file is, and the list follows it straight away. Only the
  project's own components can be corrected; a library's list is its `.lib.par`'s. It also held an `exclude` list, for
  taking a component off by hand, which PAR-531 removed.
- **A component's render status is how it fares on the canvas now.** My call: it fails while any frame shows its error,
  and otherwise draws once it has drawn somewhere, so fixing it or removing the design clears the warning. The status
  comes from each component's error boundary in the guest, and a component loaded on demand only counts as drawn once
  its module has loaded. The panel shows failures only, as a warning beside the name; the reason is read from the error:
  a missing provider, server code, an async server component, or else the error itself.
- **`.ts` files are read for components too, and config files aren't.** My call: a `.ts` file can't hold JSX, so the
  parse leaves its capitalised functions and aliases to the type checker, which reads them with the rest. Files named
  `*.config.*`, such as `vite.config.ts` and `eslint.config.js`, are skipped with stories and tests, as they only export
  settings.
- **A framework's component finding is a `ComponentFinder` in `@parity-app/code`.** My call: the renderer adapter keeps
  the quick parse it already has, and the finder adds the thorough pass and props, each taking the project's one
  program, since every framework Parity expects (React, Vue through vue-component-meta, Svelte) reads types with
  TypeScript. The props worker's program cache calls React's through the contract (PAR-603). `findAll` runs all three
  passes in one call and returns each component's id, file, export, import, role, evidence and props, for callers
  without the app's service.

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
- **Agents find icons with `Icons()`,** which lists the project's icon sets with their styles, and
  `Icons(set, { search })`, which searches one the way the Icons panel does and returns each icon as the component (and
  style props) to insert. My call: each call's snapshot carries the sets without their tags, and the names and tags are
  read from the tab only when `Icons(set)` asks, since Fluent's run to thousands. It returns 50 icons unless `limit`
  says otherwise.
- **A manifest names an icon set's shape,** because sets differ: one export per icon (Lucide, Heroicons, Phosphor,
  Tabler, Fluent), or data drawn by one component (Hugeicons, through `HugeiconsIcon`'s `icon` prop). Styles and sizes
  are either a prop (Phosphor's `weight`) or part of the name (`AddFilled`, `Add24Regular`), described by a pattern with
  `name`, `style` and `size` groups, so the panel shows one icon per name with a style picker and leaves sized copies
  out.
- **Icon sets are added from the Icons tab,** with the same picker the Components tab has, listing the registry's icon
  sets whatever the project already has. The tab opens on a set just added, and its set picker switches between them.
- **An icon set's tags are read from what the set publishes, never typed in.** My call: `parity lib` reads them into the
  set's `.lib.par` (`icons.tags`, by the icon's label, with `icons.tagSource` saying where from) from the set's own npm
  package or the companion one released with it, at the same version or else the newest before it, matching keys to
  every name each icon is exported under. Each icon's tags go on one line, so a set of thousands stays readable.
  Regenerating a set's file is all it takes to update them.
- **Tags come only from metadata published with a version, read by one reader for every set.** The user's call
  (2026-10-29): updating a library must take no manual work and give the same file each time, and Parity has to scale to
  hundreds of libraries without code for any one. A set's preset only says where its metadata is (a file in an npm
  package, or files in the repository and commit npm records for the version), and `iconWords` works out the shape: the
  table that names the most icons, wherever it sits, and from each icon its lists of words and the fields that sort
  icons into groups, leaving out fields that barely vary, constants, words most icons share and markers such as `*new*`.
  A set that publishes no versioned metadata is searched by its names and the other names it exports. So Heroicons,
  whose keywords are only in heroicons.com's scripts, and Hugeicons, whose tags are only on its web API, are searched by
  name: neither source has a version, so the same release could read differently from one day to the next.
- **Digits before an icon's style are a size only where the icon also comes without one (LIB-46).** My call, in
  `iconVariants` in `@parity-app/core`, which the Icons panel and `parity lib` share: a number is a size when it's one
  of the set's sizes and the name before it is an icon the set exports unsized, in any style (`CalendarDay32Color` is
  CalendarDay at 32). Otherwise it's part of the name, so Fluent's Battery0 to Battery10, TextHeader1 and Wifi1 list. An
  icon a set ships only at fixed sizes (`CodeCs16Regular`) is listed once per style, at the size nearest the set's
  default. Fluent lists 2,992 icons, up from 2,902.
- **An icon exported under several names inserts the one its types prefer (LIB-47).** My call: `parity lib` reads the
  set's declaration files and records in `icons.prefer` the names to insert where it isn't the shortest, which is used
  otherwise. A name not marked `@deprecated` comes first (Phosphor's `GearIcon`, not `Gear`), then the name an icon is
  declared under rather than an alias (Lucide's `TriangleAlert`, not `AlertTriangle`; Tabler's `IconBrandKakaoTalk`, not
  the misspelled `IconBrandKakoTalk`). The panel shows the inserted name without an `Icon` its other names don't have,
  so Phosphor's icons still read as Gear.
- **A style kept in a module of its own is found from the package's entry points (LIB-32).** My call: `parity lib` loads
  each path the package's `exports` lists, and one that exports at least half the set's icons and draws them differently
  from its default module is a style, named by its path (`16/solid` is 16 Solid) and recorded in
  `icons.variants.modules`. Entry points that draw the same icons the same way (Phosphor's `ssr`, Lucide's `icons`) are
  other ways in, and ones that don't load as a module (Fluent's `fonts`) or export few icons are left out, so of the six
  sets only Heroicons has such styles: 24 Outline, its default, 24 Solid, 20 Solid and 16 Solid. An icon in the default
  style stays `heroicons/CogIcon`; in another it names the module between the set and the icon, as its import does
  (`heroicons/16/solid/CogIcon`), and the guest imports each style's module.
- **Icon search is Parity's own ranking, not Fuse.js or MiniSearch.** My call, from a benchmark of 50 queries people
  type ("gear", "close", "down arrow", "calender") over Lucide with its tags, checked against 50 more it wasn't tuned
  on. Parity's search put the icon meant first for 39 of the held-out 50 and in the first row for all 50, in about 5 ms;
  Fuse.js managed 35 and 42 in about 30 ms, which grows with the 5,000 and more icons Tabler and Hugeicons have;
  MiniSearch was quick but managed 23 and 42; matching the name's letters, as before, managed 19 and 29. Each word of a
  query finds an icon in any order, by a word of its name, its other names (Lucide's older `AlertTriangle`) or its tags,
  whole or by its start. A name's first word counts most, as it says what the icon is; a set's first tags count a little
  more than its last; plainer names come first among equals. Small typos are forgiven, and icons only some words find
  are added, only when the search finds less than a row. It lives in `@parity-app/icons`, which the Icons panel and the
  insert picker both use.
- **`.lib.par` describes a library whole,** so Parity needs no code per library: the package and version it was
  generated from with the range it covers (`package`), its components and what each was found as (`components`), its
  icons (`icons`) and its decorators (`decorators`), beside styles, breakpoints, tokens and canvas. There is one current
  format, identified by `version: 3`; versions 1 and 2 are rejected, with no compatibility readers or save-time
  upgrades. The current `.par` also accepts only its current format; modes and the clipboard each have one format as
  well.
- **Discovery resolves library module aliases once** (PAR-483): components, decorators, nested `$import` and `$call`
  values, icon style modules and canvas values use the name the project installed. The builder and icon picker consume
  those resolved imports. Core's `remapLibraryImports` also collects imports, so collecting and rewriting recognize the
  same schema positions; ordinary component props named `import` or `modules` remain data.
- **Parity keeps a registry of `.lib.par` files** (`@parity-app/registry`) for libraries that don't ship one: nova,
  Radix, Base UI, React Aria Components, MUI, Chakra, Mantine and Fluent UI, and Lucide, Hugeicons, Heroicons, Phosphor,
  Tabler and Fluent icons. A package's own `.lib.par` comes first; otherwise the registry file whose range covers the
  installed version, the newest generated first. The catalog the app installs from is the registry. Each file covers the
  newest major only, so MUI 7 and Mantine 8, inside the cutoff, have none yet; Lucide's covers 0.400 and later too,
  since its icons are listed from the project's copy.
- **`parity lib` writes `.lib.par` files** for a package, an icon set or an app. Components are what the TypeScript
  checker says renders, as `proposals/component-detection.md` describes, with anything it can't decide reported rather
  than guessed. Tokens come from wherever the library keeps them: CSS custom properties, Tailwind `@theme`, DTCG files,
  or a JavaScript theme (MUI, Chakra, Fluent). Decorators come from a preset per known library, since no package says
  which providers it needs. An app's file is written at its root, keeping its designs.
- **`parity lib` installs a library on its own to describe it, so no project has to have it.** The user's call
  (2026-10-29), so updating hundreds of libraries takes no projects set up by hand. Naming a version or tag
  (`lucide-react@1.63.0`, `@latest`), or writing into the registry without `--root`, installs that version with npm
  under `~/.parity/cache/packages`, once per version, with its peers and without install scripts. A React package also
  gets React DOM at its React's version and React's types, as an app that uses it would have them. Regenerating a
  registry file reads the version it covers, and a file keeps its range while that covers the version, so a range
  widened by hand survives. Every icon set's file and Radix's came out the same as from the fixture projects.
- **Every Buildkit Base UI style gets a registry file,** at your request: luma, lyra, maia, mira, nova, rhea, sera and
  vega. They share one set of hand edits (`buildkit-baseui.edits.json` in the registry), since only their styles differ,
  and the Radix styles still aren't published. Parity names each one Shadcn and its style, capitalized (Shadcn Nova,
  Shadcn Luma), as you asked on 2026-10-29; their packages keep their names (`@buildkitgg/shadcn-baseui-nova`).
- **Charts come from Recharts' own registry file (PAR-130),** so Nova's ChartContainer has something to hold. My call:
  Recharts is a library when the project depends on `recharts`, as shadcn's chart docs have it install, not when it only
  comes in under a Buildkit style, since the project's code can't import it then. Its hand edits group its parts as
  Charts, Series, Axes and Grids, and give BarChart, LineChart and AreaChart six months of sample data with a grid, an x
  axis and their series. Charts are sized with `responsive`, `width: "100%"` and `height: 240`, which a ChartContainer's
  size overrides, and series draw with `isAnimationActive: false`, since a frame is a still picture and Recharts would
  otherwise be caught mid-animation. Colours are `var(--chart-1)`, with a fallback for projects without it.
- **`parity lib` loads a package through `main` when its `module` entry won't run in Node,** as Recharts' `es6` build
  imports its files without extensions, so its parts are tried and placed like any other library's.
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
  folders (MUI's demos have no telling names, so its preset names a folder where every JSX file counts). The TypeScript
  compiler reads their JSX: every library ancestor of each use, and its fullest use as a sample. Most uses must be
  inside something; the chain is every ancestor at least half of those have, at any depth, in the order they're usually
  nested, rather than one level at a time (LIB-35). A part that draws alone takes only its own family's (examples put
  everything in forms and cards), and while a part still fails, the top level's own examples are added, for examples
  split across a demo's components. JSX passed in a prop isn't placed in that element. Every chain and sample is still
  tried: one that doesn't render is grown from the errors, the errors alone are tried if that fails, and other families'
  parents a part renders without are dropped. `--no-examples` skips it, and the registry's presets name each library's
  repository and folders.
- **A level some examples leave out is optional (LIB-35):** one fewer than nine in ten uses have (`DropdownMenuGroup`)
  that the part still renders without is in `optionalParents`. Inserting a part brings an optional level only when a
  parent outside it is missing too, so a `DropdownMenuItem` dropped into a `DropdownMenuContent` comes alone, and one
  dropped on an empty frame comes in the whole structure the examples show. A level every example has stays required
  even if the server render passes without it, which is how a popup's Content got left out before.
- **Samples take the values an example's file gives (LIB-35):** names it declares (`config={chartConfig}`), the first
  value of `useState`, and the items of a list it maps into elements, with each item's fields filled in; anything
  computed is left out. Values stay small (eight items, 2,000 characters). Example props a part needed are used when
  trying the parts inside it, as inserting gives parents their sample's props; props it renders without are taken away
  from its sample if a part inside it then fails.
- **Parts only a decorator's host renders aren't for placing (LIB-35):** `parity lib` follows the package's own built
  files from each function to what it renders (`jsx()`, `createElement()` and JSX), and a part drawn only inside a host
  a decorator adds (`Toaster` mapping its toasts into `Toast` and `ToastTitle`), and in no example, is marked
  `visual: false`. Buildkit's shared hand edits went from 30 (LIB-28) to 13 (LIB-34) to 3 (LIB-35) to 1 (LIB-36):
  ChartStyle's sample, which ChartContainer passes itself and no example shows.
- **A part no example places takes its parents from the package's source, last (LIB-36):** the same reading of its built
  files says which of its components render it, and that one's chain is tried after the errors' (`SelectContent` for
  `SelectScrollUpButton`). Not before them: a kit's Content often renders its own Portal and Overlay, which go in the
  Root.
- **Render functions are samples (LIB-36).** A sample's child or prop value can be `{ "$render": [...] }`, a function
  returning those children, with `spread` when what it's called with is spread onto the element
  (`renderInput={(params) => <TextField {...params} />}`) or `pass` naming the props that take it
  (`{(segment) => <DateSegment segment={segment} />}`). Examples' arrow functions that return JSX are read into them. In
  a design they're slots, `$render:<prop>` (or `$renderWith:` to spread, with `?pass=a,b`), whose nodes the canvas turns
  into the function the component calls, so they stay editable like any other nodes. A part inserted into a parent whose
  examples call their children goes into that render slot.
- **Example shares are counted per file and per use (LIB-36):** a level counts when either clears the bar, with the
  larger share, so one long demo can't outvote ten short ones and a level most uses show isn't lost. A chain that still
  fails is retried with levels a third, then a fifth, of the examples show, and a named parent's rarer levels are tried
  when growing from errors (`Slider.Control` above a `Slider.Thumb`).
- **The docs' anatomy checks every chain (LIB-36).** Presets name the folders of a library's docs pages; the code blocks
  under their Anatomy or Usage headings are read as JSX, and `parity lib` reports how many parts the docs nest are
  placed as they show (the nearest parent, and every parent the chain needs) and how many have every level, listing
  those that differ. It's a check, not a signal, so it stays an independent measure; it reads Base UI's, Chakra's and
  shadcn's docs (Radix's and Mantine's aren't in their repositories, MUI's and React Aria's have no anatomy blocks).
  Portals don't count either way, as chains leave them out (below).
- **Internal parts (LIB-37):** a part the package renders inside another of its components, that no example or docs page
  places, is `internal: true` (`ChartStyle`, a Select's scroll buttons, a kit's Overlay and Portal). It can still be
  placed, and the Components panel lists it under "Internal parts" at the end of its library. A part that still fails is
  tried with the props its owner passes when it renders it: the owner's own props (`config`) take the owner's sample,
  literals stay, and worked-out values use the part's own sample. Buildkit now needs no hand edits, though the shared
  file stays for the next one.
- **Portals are left out of chains when the part renders without them (LIB-37):** they only move content out of the
  frame, and Radix's throws in one ("getComputedStyle ... not of type Element") while passing on the server, where
  portals don't run. Examples put them in every menu, so before this Radix rendered 108 of 118 in the app; after, 117.
- **Elements as a prop's value are samples (LIB-37):** `{ "$element": [...] }`, read from examples' JSX in props
  (`control={<Checkbox />}`), and inserted as a slot of that prop's name, which the canvas already passes as the prop.
- **Fluent's slots are props, read by their shape (PAR-127).** A prop whose type is a union with a props object holding
  `as` is a slot (Fluent v9's `Slot<...>`), found by that shape rather than by the alias's name, which declarations
  don't always keep. One that also takes text, numbers or elements takes content, so it's a node prop, set as `children`
  is: text, or layers in a slot of its name. One that takes only its part's props (an `input`, an `img`) is an object.
  My call: a content slot is listed with the component's own props though its package declares it, since it's one of the
  component's parts and not an HTML attribute; `root` is the component itself, so it stays with the attributes. A
  library's other props sat with the attributes until PAR-457, below.
- **A library's own props are those its component's declaration file declares (PAR-457).** Nova's `SidebarMenuButton`
  adds `isActive` to a button's attributes, and hiding it behind `all` hid how an item shows as current. A prop declared
  in the file that declares the component is its own; one from React or another package stays with the attributes, as
  does a slot that isn't content. Defaults come from the compiled JavaScript beside the declarations, and a cva
  variant's options go to a prop only when its type has the same options, since one file can hold several components'
  variants. Upstream components and styles are unchanged; only Parity's reading of them is.
- **A node prop held in a slot says so (PAR-127):** once its slot has layers, the Props panel says "Set in layers" in
  place of a text field and doesn't offer the prop again, since the canvas passes the slot's layers over a value.
- **Components declared but missing when they run are left out (LIB-37):** MUI's types declare `BadgeRoot`, `ModalRoot`
  and others its build doesn't export; they're `visual: false`, and the report names them.
- **Parts every example draws from a hook's list are found, not hidden (LIB-38, changed by LIB-39):** when each use of a
  part sits inside `list.map(...)` over what a library hook returns (`const { toasts } = Toast.useToastManager()`),
  following an example's own component the list is mapped into, the part is flagged and the report names it. LIB-38
  first made those parts `visual: false`; your call reversed that, so the flag now only says which parts need sample
  data. Hooks that hold the example's own values (`useState`, `useMemo`, `useReducer`, `useRef`, `useControllable*`)
  don't count.
- **Toasts stay placeable, with a sample toast (LIB-39, your call, 2026-10-29).** Toasts are visible and people design
  them. Inside the mapping callback, and in the example's own component it maps into, the list item is bound to the
  fullest object the file hands the hook's or factory's result (`toastManager.add({ title, description })`, with
  `Toast.createToastManager()` counting as well), plus an `id` when the callback keys by one. So Base UI's Toast.Root,
  Positioner and the rest take `toast={{ id, title, description }}` as their sample, and Title and Description show its
  text through Root. All eight render on the server and in the app.
- **A decorator's hosted toast parts follow (LIB-39):** Buildkit's `Toaster` maps its list into `Toast` and the parts
  inside it, and no example places them. Reading the package's source now records when a render passes a list item
  (`toast: toastItem`), what it puts inside (`ToastContent` holding Title, Description, Action and Close, through the
  HTML in between), and the values the package makes with a factory and exports (`toast`). The item is the fullest
  object the examples hand one of those values (`toast.add({ title: "Event created", ... })`). A part drawn that way
  renders with it, adding the parent its error names once it has one (`ToastProvider`, since frames aren't inside the
  Toaster), and its sample is the item with the package's own nesting. So `Toast`, `ToastContent`, `ToastTitle`,
  `ToastDescription`, `ToastAction` and `ToastClose` are placeable again in all eight styles. `ToastProvider`,
  `ToastPortal` and `ToastViewport` stay hidden: they're the host's, not the toast's.
- **Templates are values when every part is known:** `` `${kind} saved` `` is read when the file says what `kind` is;
  one with an unknown part is left out rather than guessed.
- **Mapped lists bind their first item (LIB-43):** wherever an example maps a list it spells out, the parts drawn for
  each item get its first item, not only for hook lists. A list read from what a library factory or hook was given
  counts (`createListCollection({ items })`, `useListCollection({ initialItems })`, `initialItems` being what `items`
  starts as), including names destructured from the call. Only lists are read this way: a prop given the collection
  itself is still left out, as its options aren't the collection. Chakra's Select, Combobox and Listbox items now sample
  `item={{ label, value }}`, and Chakra renders 444 of 473 on the server, up from 433.
- **Spreads are read when the file spells them out (LIB-43):** `{...buttonProps}` on an element, `{ ...base, size }` and
  `[...sizes, "lg"]`, later fields overriding earlier ones.
- **A preset's example folder that holds nothing is reported (LIB-43):** it has usually moved upstream. Radix's
  `packages/react/` was one; it's gone from the preset.
- **Errors don't put a part inside a drawn part (LIB-43):** a toast renders with its sample item, so an error chain
  could place anything in it (ToastViewport landed inside Toast). A chain through a drawn part is kept only for what the
  package puts inside it; ToastViewport is back under Toaster, and the Toaster's sample holds it again.
- **An anchored toast's Positioner renders unanchored:** Base UI's anchored demo anchors to a button's ref, which a
  sample can't hold, so the Positioner sits at the frame's corner. Accepted rather than faked.
- **An example's own wrapper of a part is the part (LIB-48):** a demo component that returns one of the library's parts
  and nothing else (`const CustomTab = (props) => <Tab {...props} />`) places that part wherever the demo places the
  wrapper, so React Aria's `Tab` is found inside `TabList` in `Tabs`. One that hands its props on is sampled where it's
  used; one that doesn't (`<Item title="Docs">`) is sampled from its own element, with the children it's given when that
  element has none. The wrapper's own element isn't counted as a use of its own.
- **Families take in what the examples only place inside them (LIB-48):** a plural is its singular's family (`Tabs` with
  `Tab`), and a part the examples nearly always place, directly inside one family, joins it for samples (React Aria's
  `Row`, `Cell` and `Column` join `Table`), so a table's sample keeps its header and rows. Not when the part's own
  family is usually around it too (Chakra's `Toggle.Indicator` in a `Button` in `Toggle.Root`), and never into a layout
  box that holds more than eight families (`Group`, `Stack`, `Dialog`). Pruning a chain uses the same families, so a row
  keeps the `TableBody` it's in.
- **A collection's placeholder isn't drawing (LIB-48):** React Aria renders a collection's parts outside one as bare
  placeholders for the collection to read (`<item>`, `<tablebody>`), without throwing, so `Row` and `NavigationTreeItem`
  looked like they drew alone and got no parents. Markup that starts with one now counts as failing.
- **A prop only one use sets is left out of a sample (LIB-48):** a part's sample props are its defaults wherever it's
  drawn, including inside other parts' samples, so React Aria's one `Cell colSpan={2}` made every cell in a table's
  sample span two columns. For a part with five or more uses, a prop fewer than two, or under a quarter, of its uses set
  is kept aside and added back only when the part can't draw without it (MUI's `Slide` and its `in`).
- **A sample's spelled-out children are inserted as written (LIB-48):** a child a sample gives props or children (a
  table's cells, a tag group's tags) no longer takes its own part's sample props as defaults. Only a bare child does
  (`{ component: "Cell" }`), and the parts a family's root is given carry their samples' props themselves. Every Tag in
  React Aria's TagGroup took Tag's `id: "Annual"`, so the browser threw on duplicate keys, and each Cell took a
  `colSpan`. A child the example filled with something a sample can't show (the demo's own checkbox) is kept as written
  with empty children, so it isn't bare either. The generator builds samples the same way, so what it accepts is what
  the app inserts.
- **A part can need its parents' other parts (LIB-48):** a table's row renders only with the header beside the body it's
  in. When the examples' chain fails alone but renders inside the outermost parent's whole example, each level in place
  of the first like it there and the part in place of the first like it at the bottom, the part is marked `parentParts`.
  Inserting it alone does the same with that parent's sample, so a cell lands in the table's first row beside the row's
  other cells and under the table's header; React Aria checks in the browser that every row has as many cells as there
  are columns. The chain is accepted only where the part adds markup, since a closed menu or popover renders nothing on
  the server and would seem to hold anything. It's tried before the chain is grown upward, with and without the levels
  fewer than nine in ten examples show (a `Virtualizer` half of them wrap tables in).
- **A name's guess gives way to the examples and the collection (LIB-48):** a part the examples mostly use with nothing
  of the library's around it gets no parent from its name (Chakra's `InputGroup` isn't put inside `Input`), and a prefix
  that's a collection's item yields to the collection (React Aria's `TabPanels` goes in `Tabs`, not `Tab`).
- **Failing parts are tried again once every parent has its sample (LIB-48):** parts are tried in name order, so
  Chakra's `Combobox.Indicator` failed before `Combobox.Item` took its example `item`. Chakra now renders 446 of 473.
- **What's left needs values the app makes at runtime:** Chakra's TreeView parts render inside `TreeView.NodeProvider`
  given a plain `node` and `indexPath`, but the examples only pass the node a tree collection hands its render function.
  Its toasts need a `createToaster()` toaster, its FileUpload items `File`s, its date cells date objects; React Aria's
  toasts need a `ToastQueue`. Sample props are JSON, and only decorators can hold `$call` values, so these stay failing
  until samples can hold made values or a hand edit gives them.
- **Samples hold values the package makes (LIB-49, your call, 2026-10-29):** a prop an example gives the result of one
  of the package's own functions, imported by name from the package or a subpath of it, is
  `{ "$call": { "import", "export" }, "args": [...] }`, with the arguments the file spells out
  (`collection={createTreeCollection({ rootNode })}`). A function among the options is left out, so the package's
  default is used, and a hook isn't one, since it only runs inside a component. `parity lib` calls each once before
  trying parts and gives every part its examples' made values from the start, as the parts inside it, tried first in
  name order, can't draw without them. The project imports them by the name it depends on the package by, the builder
  loads their modules with the decorators', and the guest makes each once, in a list too (Fluent's
  `columns={[createTableColumn(...)]}`). The inspector shows one as "Made by createTreeCollection()", not editable.
  Chakra's TreeView parts now render: 456 of 473 on the server (from 446) and 460 in the app (from 450). Select,
  Combobox and Listbox roots now come with their real collections.
- **Code export must write made values as calls (LIB-49):** there's no design-to-code export yet; when there is, a
  `$call` prop becomes an import of the function and a call with its arguments, hoisted out of the JSX.
- **A render prop holds what it draws (LIB-49):** what an example's render function draws (`TreeView.Node`'s
  `render={({ node }) => ...}`) is placed inside the component it's given to, unlike an element passed in a prop. A
  render that picks between elements is sampled with the first. A parent whose sample has a render prop and no function
  children gets an inserted part in that prop's slot, keeping its other slots.
- **The in-app backtest runs its own instance:** `PARITY_UI_PORT`, `PARITY_DEBUG_PORT`, `PARITY_AGENT_FILE` and
  `PARITY_USER_DATA` give it its own ports, CLI channel and settings, so it runs beside another session's Parity instead
  of driving it.
- **`parity lib check <library>` is the in-app check (PAR-408):** it inserts every component of a registry library file
  into a design in the tab's project, once bare and once the way the Assets panel inserts it, and counts the parts that
  fail bare but render inside their parents. It builds nodes with core's `componentNode` and `withLibraryContext`, the
  same code the canvas inserts with, so the check can't drift from the app. Each library's floor, the least share of
  placed parts that must render, is in `packages/registry/in-app.json`; below it the command exits with 1.
- **A render function's arguments go to the node it returns (PAR-409):** a `$render` slot's `pass` and `$renderWith`
  props are given to the node itself, not cloned onto the error boundary around it, which dropped them (React Aria's
  `CalendarCell` lost its `date`, `DateSegment` its `segment`).
- **Generated parents and samples (PAR-409):**
  - A wrapper an example imports from a file beside it (`MyMenuItem` from `./utils`) counts as the part it passes its
    props to, as a wrapper in the same file does.
  - React Aria's `<submenutrigger>` markup is a placeholder, like `<item>`, so the part fails alone and gets parents.
  - A part named for a family (`SubmenuTrigger`, `Menu`) joins it even when examples also draw it alone and the family
    holds many others.
  - A chain whose outermost parent has parents of its own starts outside them, unless they're circular.
  - A part with no children of its own takes those its parent's sample spells out for it (a table's `Row` its `Cell`s),
    going into the outermost parent's whole sample when only that renders.
  - A function the library re-exports (Chakra's `parseDate`) is called from the library when an example imports it from
    elsewhere.
- **A part that hands its children to an input gets no text label (PAR-418):** the canvas gives a part with a `children`
  prop its own name as text, which an `<input>` can't hold (Mantine's `Cascader`, Nova's `ComboboxChipsInput`). The
  generator tries each part with text inside; one that then fails as a void or self-closing element, but renders without
  it, gets a sample of `children: []`. Inserting reads a sample's children, empty ones included, in place of the label.
- **Errors from the app name parents the server can't see (PAR-409):** a part inside a closed menu or a portal renders
  nothing on the server, so nothing there says it's misplaced. `parity lib check --record` keeps each failing part's
  error from the app in `packages/registry/app-errors/<library>.json`, adding to what's kept, and
  `parity lib --registry` reads it back: the parent the error names goes in the part's chain (parents from `app`),
  inside that parent's own when it's of the part's family, or inside the chain it has when it's another's (Base UI's
  `Menu.Portal` for a `ContextMenu.Positioner`). An error that names nothing adds nothing, and one about a void element
  takes the part's text label off.
- **More generator rules (PAR-409):**
  - Example checkout also fetches the repository's files the examples import, relatively or by a mapped path (Chakra's
    `compositions/ui/toaster`).
  - A part imported under another name (`Toaster as ChakraToaster`) is that part.
  - A made value carries the methods other examples call on it with arguments (`toaster.create({ title })`), as
    `methods`, which the canvas and the generator call once after making it; calls with none (`dismiss()`) are left out.
    Chakra's toaster is drawn with its toasts.
  - A value the package makes is kept from any use of a part, however few set it.
  - A part whose children must be a function (Base UI's `Field.Validity`) gets a render function that draws text.
  - Nothing goes inside a part whose sample takes no children.
  - A value an owner part works out for a part it draws is tried with each value the examples make.
- **A render function's arguments go over the node's own (PAR-418):** its props over the node's props and slots, its
  style merged over the node's, its key on the returned node, and a slot that both spreads and names props gives both.
- **A component layer takes what a parent clones onto it (PAR-200):** the guest draws each component layer through a
  function component that holds its error boundary, so a parent that clones the layer, as Radix's Slot does for
  `asChild`, hands its props to the component rather than to the boundary. They're merged under the layer's own as
  Radix's `mergeProps` merges onto an element: class names joined, styles merged, both handlers called with the layer's
  first, and the layer's other props over the parent's. A ref goes to the component, since React 19 passes `ref` to a
  function component as a prop. A parent that clones with plain `cloneElement` would replace a class rather than join
  it; layers set from the canvas rarely have one, so the one rule covers both.
- **A component that puts its style inside is drawn in a div that takes it (PAR-201, the user's call):** when a layer
  draws a component with a size or other style, and the component puts its `style` on an element inside another it drew,
  as a field passes its props to its input, the guest draws a plain div around the component and gives the div the
  style, so W 320 makes the whole field 320 wide. The design and the layers panel don't change, and nothing tells the
  person, since all they need to see is the style working. The guest finds where the style went in React's tree once a
  component first draws with one and keeps that for every frame, and draws the div before the frame is painted. The user
  chose this over a note in the inspector, with or without a Wrap in layout button. Code generated from a design, when
  there is some, has to draw the same div. A component that takes no `style` keeps its note.
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
- **A part that draws nothing is still one of the project's components (PAR-428),** marked `visual: false`, so the parts
  whose chains need it (Chakra's `CodeBlock.AdapterProvider`, Base UI's `Tooltip.Provider`) insert inside it with its
  sample. Only the Components panel leaves it out. Leaving it off the project's list made every part inside one fail.
- **Agents put a part in its provider themselves (PAR-453).** `Components()` lists providers such as
  `nova/SidebarProvider`, and an agent's `Insert` places what it's given as written, without wrapping a part in the
  parents the panel would add, so a design never gains layers the agent didn't write. A part placed without its provider
  shows a render error that names it. `Props()`'s `composition` (PAR-454) says which parents a part needs, with an
  example that inserts it inside them.
- **More generator rules (PAR-428):**
  - A failing part's error from the app that names no parent puts the examples' own chain in place of the one it has,
    when that's another.
  - Clearing a parent's generated props keeps the values the package makes.
  - A part whose children must be a string (Chakra's `Highlight`) gets its text as the `children` prop.
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
- **Pixabay finds photos in place of Unsplash** (your call, 2026-11-10, PAR-837). Unsplash's terms ask for more, it
  allows 50 searches an hour until it approves the app, and it has no videos. Pixabay has photos, illustrations, vectors
  and videos, and allows 100 requests a minute for a key, which it raises for an app that uses its API well. Unsplash's
  connector stays in `connectors`, so a result or image that came from it is still named, but only `offered` ones are
  searched; going back is one line in `packages/connectors/src/index.ts`. Parity owns the key, as with Unsplash's.
  Pixabay's terms (pixabay.com/api/docs) ask three things:
  - show where results are from wherever they're shown, which each result's `credit` and the browser's credit do;
  - use its image links only to show search results, and they work for 24 hours, so a picture placed in a design is
    saved into the project rather than linked. Its videos may be played from its own links, though it suggests keeping a
    copy;
  - keep each search's answer for 24 hours rather than ask again, and send only searches people make, never mass
    downloads. Parity's service will keep them, shared by every user (PAR-131), so the app keeps no cache of its own
    (your call, 2026-11-10).
- **Agents' calls name no source, and don't say photos** (your call, 2026-11-10, PAR-837). A source can change, as
  Unsplash did, and one finds more than photos. `find_photos` (`parity photos`) became `find_media` (`parity media`),
  with a `type` filter (photos, illustrations, vectors or videos) and filter examples that name no source. Placing a
  result says picture, and its credit names the author. Videos and screens are found but not placed.
- **Placing a picture whose link expires saves it first** (PAR-837). `place_result` downloads it into `public/images/`
  as a pasted image is saved, named after it with a hash of its content, and the node shows the file, so a saved design
  never holds a link that stops working. Saving is its own undoable edit, before the placing one. Placing what Unsplash
  linked still sets its link, as Unsplash's terms ask.
- **Image files dropped from Explorer or Finder land as pasted layers do (PAR-24).** My calls, all in editor.md's
  "Dropping image files":
  - Over a layout they go where Paste here would put them: the slot under the pointer by `slotAt`, or at the pointer in
    an absolutely placed layout. On the empty canvas they make a new screen at the pointer, as a paste with nothing to
    paste into does, rather than a note.
  - That screen is named after the file, or Images for several, rather than Pasted, since a dropped file has a name. It
    lays them out in a padded row that wraps, so several sit side by side.
  - Over a design's frame with no layout under the pointer, or its board's background around the frames, nothing is
    added and a message says so. Paste here makes a new screen there instead, overlapping the board; a drop shows where
    it would land before it happens, so it says it can't rather than surprise.
  - Several files dropped into an absolutely placed layout go side by side from the pointer, each 4 steps right of the
    one before when it has a width, and so do several copies from Paste here, which used to stack them at one point.
  - The types and the 20 MB limit are one list in `@parity-app/editor` that `images.import` uses too, so a drop takes
    exactly what saving accepts, and files are checked before they're read. A file the system gives no type is taken by
    its extension. Skipped and failed files are named in a message, and the rest are still added.
  - Placing them is one design step; the files are written first and stay when it's undone, as a paste's do.
  - tldraw never gets the drop, so it can't add pictures of its own. A file dropped anywhere else in the window is
    refused, since Electron would otherwise open it in Parity's place. In Interact the design gets the drop.
  - The service's project edit for a saved image is labelled "Add image", since it's no longer only for a paste.

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
  hasn't drawn (PAR-279).
- **Each screen has states worth showing:** Dashboard's Loading and Empty workspace, Sign in's Signing in and Wrong
  password, Settings' Saving, Saved and Invalid email, and Pricing's Monthly and Yearly.
- **Repeated parts became component designs by extraction** (Stat card, Activity item, Plan card, Project card, Task
  card, Notification item, Integration card and two dozen more), with params inferred from what differed. Stat card has
  a Loading state. Pricing's Yearly state changes each plan's price through its instance.
- **They were built through the agent API** (`parity exec`), one undoable step per screen, and saved after each, because
  the dev runner restarting Electron drops unsaved changes. Four agents built screens at once, taking turns through a
  lock, since each run then applied whole project files. Runs now merge per design, so agents changing different designs
  no longer need one (PAR-278, "Agent calls merge per design").
- **The example imports Nova's styles** (`@buildkitgg/shadcn-baseui-nova/tailwind.css`, right after Tailwind), as the
  Components panel's Import styles does. Without it, Nova's switches and progress bars render invisible.
- **The accessibility checks find real issues in it,** mostly one token pair: `muted-foreground` on `muted` is 4.34:1,
  short of 4.5:1, which shows on avatar initials, the keyboard hint and small print. They're left in, since changing
  that token and checking again is a good demo.
- **Parity's own Storybook opens a small copy of the example's designs** (your call, 2026-10-29), since opening all 61
  made Storybook grind to a halt. `apps/desktop/.storybook/example.par` holds the 14 that stories use (Pricing,
  Dashboard, Projects, Sign in, Settings, the component designs they're built from, Button, Member row and Order line),
  laid out close together, on the example's own components and styles. Stories that showed other screens now show these.
  The example keeps growing as the stress test that `pnpm dev` and `pnpm perf` open. The copy doesn't follow the
  example: a story that needs another design adds it to the copy.

## The portal

- **The portal is Parity on the web, for a whole org,** and has to exist before orgs pay per seat. It's where people
  find what they've been tagged in, see what their teammates, their org and their agents are doing, and open designs to
  see what changed (your call, 2026-10-29).
- **Opening a project opens its canvas,** in the browser or the desktop app, as Figma does. There's no project page in
  between (your call).
- **It's designed as Storybook explorations, built from the start page's parts,** under Parity/Explorations/Portal
  (`explorations/portal`), so it looks like the rest of Parity: the dark canvas previews, project cards, activity rows
  and For you. A first pass drawn on the canvas from plain layouts and the UI kit read as a generic dashboard and was
  dropped (your call).
- **Its sample org is Kestrel, a made-up customer,** with the explorations' cast and the start page's projects renamed
  for it (`portal/data.ts`). Buildkit isn't shown: it has nothing to do with the app (your call). The start page's
  renders name the org a look belongs to (`Look.org`), so Kestrel's apps say Kestrel, and the rest still say Buildkit.
- **Every screen draws from one list of events** (my call, after the design review): For you, the Inbox, Activity and
  the team page all show the same things at the same times, so a count or a time never disagrees between screens.
- **Its screens:** For you (what needs you, then what changed, with who's working where at the side), Recents (the
  projects as a file browser), a team page that opens on who's working where now, each on the canvas they're in, with
  Join for people and Watch for agents; the Inbox (the open item beside its board, pins and all, with its thread); the
  org's Activity (changes shown as the designs, merges, published components, new people, and the week in versions,
  threads, approvals and boards built); Handoff and Inspect; the canvas opened on what changed, or on how the code
  differs from the design; All projects, by team; a library's page; sharing and asking for access; search results; and
  the admin pages Members (with removing someone), Billing, Add seats, Plans and Security.
- **For you is a digest, as the start page's is** (my call, after the fourth review): each thing waiting on you is one
  line with what they said and its one or two actions (Reply, Approve, Let Ivy comment, See what changed), so most of it
  can be answered from there, and what happened since you were last here follows close under it, with what was said. The
  inbox has the full thread beside its board. Requests to let someone in or give them a seat are admin chores, so For
  you sums them up in one line, and the inbox lists them all (my call, after the eighth review).
- **Every page shares one left edge, and tabs and filters look different** (my calls, after the third review): tabs move
  between the parts of one place (a team, settings, a library), and quiet pills filter a list.
- **Handoff is for developers: every board by where it stands between design and code, from Parity's own versions** (my
  calls, after the design reviews), so it works without git, as history does. A board is In review, Ready to build,
  Building, Changed since approval, Built, or Code differs. An approval is of one version, so a newer version marked
  ready while the approved one is still to build or being built turns the board to Changed since approval wherever its
  status shows, and the developer can build the approved version or look at what changed; once the approved version is
  built, a newer one is just In review (my call, after the seventh review). Handoff is a list, one row per board grouped
  by status, with the board you pick open at the side: its version, its page and components and their files (new ones
  and new props marked), its tokens and their values, its states and sizes, and its code; branches, pull requests and
  tracker issues show too where a project has them. Each row has the same two columns (my call, after the fourth
  review): Approval, who approved the version, or while it's in review, whom it waits on and who asked when, and Code,
  who's building it, built it, or made it with the design. An agent that changes a design and its code together, as
  Claude Code did for the Cloud console, leaves the code already in a pull request, so approving that design leaves only
  the merge, and its boards are Built once it merges. A board on an older version of a library says a newer one is out,
  and code that moved away from its design names the pull request that moved it. The nav counts every row that you, or
  anyone, can act on now (my calls, after the eighth review). Rows carry no buttons (your call, 2026-10-29, that a
  filled button in a row is out of place; my call on what replaces it): picking a row opens its board at the side, whose
  footer has the board's next step as its one filled button, beside Inspect. Actions in other lists stay quiet, outlined
  and never filled, with the yes before the no. Handoff, Inspect and What changed read what a board delivers from one
  list (`portal/boards.ts`), so they always name the same components and tokens.
- **Every change makes a version, but only one its designer marks ready moves a board** (your call, 2026-10-29, after
  the fifth review). Marking a version ready asks one of the team's reviewers; the versions in between are drafts, and
  someone working on a board shows in Handoff as just that, without its status moving or anyone being told. So builders
  never hear about unfinished work.
- **Each board has its own versions and is approved on its own, against its last approved version** (your call,
  2026-10-29, after the sixth review). A comparison of several boards labels each with the version last approved and the
  newer one, and the reviewer ticks which to approve, so one board can go ahead while another waits for changes.
  Kestrel's example is Claude Code's token change to Billing v19, Overview v12 and Sign in v7.
- **A comparison shows every size a change shows on** (my call, after the sixth review): Pricing compares desktop and
  phone, marked on both, since Jonas's open question is about the toggle on phones.
- **A library's components say which library and version they come from** (my call, after the sixth review): Handoff
  tags them with it, and the library's Used in list is read from the same boards, so it names the boards on each version
  and a project still on an older one.
- **Whoever's building a board hears when a newer version is marked ready, as something that needs them** (my call,
  after the fourth review): For you and the inbox say which version they're building, what changed since in a sentence,
  and link the comparison and their pull request. Kestrel's example is you building Pricing v12 in #150 while Maya made
  v13, a draft, and v14, which she asked Priya to review.
- **Each team picks its reviewers, and only they approve its designs, once the designer asks** (my call, after the fifth
  review), never their own or their own agent's. Kestrel's: Andrew, Lena and Jonas for Apps; Andrew and Priya for Web;
  Maya and Lena for the design system.
- **What you can do with a comparison depends on who you are to it** (my call, after the fifth review): a reviewer who
  was asked approves it or asks for changes, with each open thread shown on the change it's about, and a board with open
  threads starts unticked, so approving past a question takes a choice (my call, after the eighth review); whoever's
  building the older version keeps building it or asks the designer, and moves to the newer one only once it's approved;
  free viewers, such as developers without a seat, see the same comparison.
- **Code that's moved away from its design gets the same comparison** (my call, after the fifth review): Code differs
  opens the approved version beside what main draws now, each difference marked with the code change behind it, and
  either the design is updated to match, making a new version, or the builder is asked to match the design.
- **All projects is a list grouped by team** (my call, after the fifth review): each project's owner, last edit and
  boards by status, and each team's boards by status and what it approved this week, so a large org can find work and
  see where each team stands. Recents stays the file browser of what you've been in.
- **Removing someone says what happens first** (my call, after the fifth review): their seat opens and is paid for until
  the renewal, the projects they own go to someone you pick, the agents they connected lose access (anyone else's
  connection of the same agent keeps working), their work stays under their name, their teams are told who's left to
  review, and without SCIM they're to be removed from the identity provider too.
- **Seat requests wait in one place** (my call, after the seventh review): Members lists every editor seat waiting on an
  admin, invites and requests alike, with how long each has waited, and each is in the admins' Needs you.
- **Libraries take Drafts' place in the nav** (my call): Parity's projects live in repositories, so there are no drafts.
  A library's page shows its components as the code renders them, which version each project uses and on which boards,
  and its releases; a project behind the latest version can be updated from there, or the update given to an agent.
- **Sharing shows where everyone's access comes from** (my call): owning the project, a team, being an admin, or an
  invite. Requests waiting for an answer come first, and go to the inbox of the project's owner and the org's admins.
  Asking to view or comment is free; asking to edit needs an editor seat, which an admin approves. The dialog keeps to
  Security: no public links, and guests for 90 days.
- **Search is one page of everything you can open** (my call): designs, components with their files, comments and
  settings, the match marked, filtered by project, team, when and who. Projects you can't see stay out of it.
- **Inspect is Parity's Dev Mode** (my call): a board at its approved version, read-only, opened from Handoff and
  leading back to it. Picking anything shows its component and file, its props as code, its states, its text and size as
  the code writes them (classes, with pixels beside), its tokens, and hovering something else measures to it. New and
  changed are against main, and a value that isn't one of the project's tokens says so (my call, after the seventh
  review). What the version asks for and the designer's notes come first (my call, after the sixth review); the board's
  page file and what there is to export show too, files open on GitHub, and Give to your agent hands the board to the
  developer's own coding agent. There's usually nothing to export: icons come from the project's icon package and the
  rest is drawn in code.
- **What changed compares two of the project's versions** (my calls, after the design reviews). Parity records versions
  itself, and only a change makes one: a comment doesn't. Every place a change shows is marked, found from what the
  render draws with the changed token rather than placed by hand, so a token change marks every board that uses it. A
  moved element is outlined where it was on the before side and where it is on the after side, and a removed one where
  it was on both (my call, after the fourth review). The side says who made the changes and why (the version notes, or
  the task someone gave their agent), the token's values before and after, and each change's components and files with
  their props before and after, as a diff; each change can be commented on. Approve approves the design at the newer
  version, and Ask for changes takes a note. Its link names each board's two versions, and main by its commit, so it
  means the same thing when it's opened from a pull request later (my call, after the eighth review). Each component
  names the file it lives in, and the file where it's used when the change was made there. Kestrel's examples are Claude
  Code's token change to three Cloud console boards and Maya's v13 and v14 of Pricing.
- **What changed stays quiet so the changes are the focus** (your call, 2026-10-29). No glow, pills or rings on the
  boards; the branch, pull request and links, opening the canvas among them, sit in a menu; hovering a change brings it
  forward on both boards and in the list. There's no timeline: the version labels above the boards pick what's compared.
- **Only editors pay; viewing and commenting are free** (your calls, 2026-10-29). Inspecting is viewing, so developers
  who build from designs don't need a seat. A seat request uses the open seats first, and buying more is offered only
  past them.
- **Four roles, each shown with what it can do** (my calls): admins can do everything; billing admins look after the
  plan, invoices and seats; members, and billing admins beyond billing, work on their teams' projects and what's shared
  with them (my call, after the seventh review); guests only on what they're invited to. Members can invite, and an
  admin or billing admin approves each editor seat. Nobody approves their own design, or their own agent's.
- **An agent can never do more than the person who runs it** (my call): a viewer's agent only comments. Security lists
  which agents can connect, with sign-in, sharing, guests and an audit log of who changed what.
- **Agents aren't part of billing at all** (your call, 2026-10-29). Parity has no agents of its own: the ones people
  use, such as Claude Code and Cursor, are theirs, connected through Parity's MCP server. So the billing, plans and
  members pages don't mention agents; which ones can connect is in Security.
- **The plans are Figma's at half the price per editor seat, rounded up to the next .95** (your call, 2026-10-29,
  against Figma's Full seat prices that day): Starter free, Professional $8.95 a month billed yearly or $10.95 monthly,
  Organization $27.95 and Enterprise $45.95, both billed yearly. As on Figma, seats added mid-year on Organization and
  Enterprise are prorated to the renewal and invoiced quarterly. Kestrel is on Organization. Each plan builds on the one
  before it, with features that follow Figma's tiers for now (the Plans story) and are still to be settled: single
  sign-on and an audit log kept a year come with Organization, and Enterprise adds SCIM and keeps the log longer. Moving
  to a smaller plan says what the org would lose first (my call).

## Collaboration

- **It's designed as small parts, each with its own stories,** under Parity/Explorations/Collaboration
  (`explorations/collaboration`): comments, comment pins, accessibility annotations, notes and sections, emoji, presence
  and sharing. Comment pins / On a board is a board you can use, with its animations.
- **Proposes changes is an approval, not a review tool** (your call, 2026-10-29). An agent or person with that role says
  what they'll change, and someone approves it with a click instead of replying "go ahead". There's no branch comparison
  or merge screen.
- **A proposal sits in the proposer's comment, and only editors decide it** (my calls). Each change is a line, with its
  layers linked. Approving sets the proposer to work on it, shown under the thread; declining can say why, and the
  proposer sees that. Someone who can only comment sees it waiting for an editor. While it waits, its pin has an amber
  ring and the inbox lists it under For you with Approve.
- **History doesn't depend on git** (your call, 2026-10-29). Many people using Parity won't use git, so Parity records
  who did what and when itself, and the web app (the portal) shows it. A project's git history, where it has one, is
  extra.
- **Better Apps comes first** (your call, 2026-10-29). Parity's comments, approvals, history and activity aren't built
  until Better Apps' packages have the audit log, approval flows and activity features. Better Apps' plans (Buildkit's
  `docs/platform-planning`) list comments, reactions, attachments, live presence, approval flows and the audit log;
  activity isn't in them yet.
- **There's no live service for comments or presence yet** (your call, 2026-10-29). It waits on Better Apps' packages to
  scaffold it, and Parity adds it then. Threads, approvals and presence will live in that service, not in the `.par`
  file: a comment isn't a change to the project, so it never touches the project's files or their history.
- **Editing the same app at the same time is needed, but not now** (your call, 2026-10-29). People should be able to
  edit different details of the same app at once, with their changes syncing back to one shared state.
- **Comments take attachments and can be edited** (your call, 2026-10-29). An attached file shows as a chip; an image
  shows a preview.
- **A thread can become an issue in GitHub, Linear or Azure DevOps** (your call, 2026-10-29). The list offers only the
  trackers the org has added.
- **Attachments are capped at 25 MB each, and deleting a thread's first comment deletes the thread** (my calls).
  Pictures preview in the comment and open larger; anything too large stays out of what's sent and says why.
- **A thread that lost its place says why under its header** (my call): a deleted layer leaves the pin where it was, a
  layer moved to another design takes its threads along, a thread left on another frame is faded until you switch, and a
  thread on a component shows on every use.
- **Notifications default to threads you're in, desktop notifications on, and a daily email summary** (my call). The
  inbox's For you holds mentions, replies, reviews, access requests and issue changes; agents' work has its own view. A
  project can override the defaults. A toast comes only for mentions and replies, and you can reply from it.

## Storybook

- **Storybook is detected, not configured:** its `main` file must exist, in `.storybook` or the folder a script that
  runs `storybook dev` names with `-c`. Storybook can't run without it. Stories map to components through the
  `component` their default export imports, following relative and aliased paths.
- **Opening a story uses a Storybook that's already running** for the project when its index matches; otherwise Parity
  starts the project's own Storybook (with Electron's Node, so nothing else needs installing) and stops it when the tab
  closes. It uses the script's port, or 6006, so links people already use keep working, and a free port only when that
  one's taken. A component's docs page opens when it has one, else its first story, in your browser.
- **Storybook opens at its Portless name when it has one, whatever named it.** You asked on 2026-10-29 that a project
  using Portless gets the right address, without Parity knowing which package set the name up. Parity reads Portless's
  routes, which Portless's own command line, Buildkit's dev-domains and anything else built on Portless all write, and
  asks each route's port for its story index: a Storybook with the project's stories is reused, and stories open at its
  name (`https://parity-shadcn-vite-stories.localhost`). My calls:
  - **Parity doesn't name what it starts.** With no Storybook running, it starts its own at `localhost` as before; one
    started under a name, from a terminal or a script, is found by it.
  - **A checkout's Storybook is told from a worktree's** by asking each for the project's `package.json` through Vite,
    which serves only the folders it allows and refuses the rest. When it can't tell, as with another builder, Parity
    uses neither and starts its own.
  - The service checks a server at `localhost`, since Node doesn't trust Portless's certificate; only the browser gets
    the name.
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
- **Contrast failures suggest a fix from the project's tokens (PAR-21).** My call: the closest token, in OKLab, that
  passes in every frame the text was measured in, passing frames too; semantic tokens before the palette; and no fix
  where coloring the layer wouldn't reach the text, such as inside an instance or a component's own classes. Apply
  checks the design again at once. You approved the design in Storybook on 2026-11-05, with the impact tally in four
  columns, the note pinned to the panel's foot, and an out-of-date check shown in amber with its findings faded.
- **Show tab order** numbers the selected design's tab stops on the canvas, in every frame, joined in the order Tab
  visits them. Positive `tabindex` comes first, then document order; hidden, disabled and inert elements are skipped, as
  is every radio button in a group but one.
- **Team members' selected tab is flagged correctly.** The design has tab triggers but no tab panels, so the selected
  tab's `aria-controls` points at nothing. axe skips inactive tabs, so it isn't the Radix false positive first noted
  here, and adding the panel to the design clears it. No library false positives are hidden.

## Rendering and agents

- **A project's Vite server listens on a port of its own, on 127.0.0.1 only.** My call: Parity asks the system for a
  free port, then has Vite take exactly that one, rather than passing port 0, which Vite reads as unset and turns
  into 5173. With two Parity instances open (two sessions, or an isolated backtest beside the person's app), both
  servers took 5173, one on IPv4 and one on IPv6, and a frame asking `localhost:5173` could reach the other instance's
  server and fail to load its guest. Portless doesn't replace this: it names servers by proxying to a port, so it would
  still need a free one behind it, and the guest server is internal to Parity, loaded only by its own frames.
- **Each open project's builder runs in a process of its own, which closing the project ends** (CAN-81). My call, from
  the memory audit: a closed Vite server isn't freed in the process that ran it, because Rolldown's native handles keep
  closures from it, and through them its whole module graph, so each reopen of the example project kept 60 to 160 MB in
  the project service. With the builder in its own process, five reopens leave the service where one open had it. The
  service starts the builder with Parity's own Node
  ([builder-process.ts](../apps/desktop/src/utility/builder-process.ts), started by
  [builders.ts](../apps/desktop/src/utility/builders.ts)), and they talk in the messages in `@parity-app/core`'s
  [builder-process.ts](../packages/core/src/builder-process.ts): the start options as data, with the builder by id and
  only the renderer's package lists (its code loads TypeScript, which a builder doesn't need), the components as the
  type checker and changed files find them, usage readings, and close. Closing waits for the process to end, and ends it
  outright after 5 seconds. A builder whose service ends, even killed outright, ends itself when its link to the service
  closes, so none is left behind, on Windows too. Detecting the builder still happens in the service.
- **A builder that stops by itself shows as crashed** in the status bar's processes, with the end of what it printed,
  and can be started again from there. One that stops before its server answers fails the project's opening with that
  error, as a builder that throws does.
- **A reopened project's builder takes a new port** (PAR-422), so its guest URL changes and the pages load the project's
  modules again. PAR-195 had it take its last port back when the code hadn't changed, so the pages drew with the modules
  they held, but drawing with the same copy of the project's React kept every closed canvas in the window: about 34,000
  DOM nodes and 125 MB of heap per reopen on the example project, measured on 2026-10-29. Heap snapshots pointed at the
  guest's React DOM module state, its scheduler's queue and SVG animation timelines, without pinning which held it; a
  new address never kept one. It costs a fresh copy of the modules instead, about 15 MB of heap and 40 MB of the
  window's memory per reopen, which a page can't give back. Picking up code edits live (PAR-165) or a separate realm per
  project would avoid that too.
  - **A builder started again** from the processes list takes its last port when it's free, since the canvas it serves
    is still open, and waits for a closing one of the same project to end first, so a project never has two. When the
    port is taken it takes one no guest has had, and the open windows are told (`project.guestMoved`, PAR-433) and load
    the guest from there.
  - **Builders no longer log what they served** (PAR-431). PAR-195 compared that log to tell a changed project from an
    unchanged one, and with every reopen on a new port nothing read it.
- **Closing a project lets go of its guest in the window:** its `loadGuest` entry and the stylesheet the document
  adopted for it (PAR-195), so the next open makes its stylesheets anew, without the last session's token previews. The
  offscreen renderer lets go of a project's last guest when its jobs come with a new address, since it doesn't hear of
  closes, and closes when idle anyway. The tab bar and each tab's view are given a tab's id rather than the tab
  (PAR-422), since React keeps the props a list's parent drew last, which for a closed tab would be its session and
  canvas.
- **Frames run the production builds of the project's dependencies, React's among them** (PAR-198). My call, from the
  memory audit: React's development build keeps a stack for every element it makes, and the window held 722,868 stack
  frames on the example project. The builder prebundles dependencies with `process.env.NODE_ENV` set to `production`
  (Rolldown's `transform.define` from Vite 8, esbuild's `define` before), while the project's own modules are served as
  in development, so `import.meta.env.DEV` and `process.env.NODE_ENV` in its code read as on its dev server. The
  project's own dev server is untouched: the builder has its own dependency cache. Measured on 2026-10-29 the same way
  before and after, on the e2e suite's copy of the example project once its frames settled, after
  `HeapProfiler.collectGarbage`:
  - the window's JS heap went from 150.1 MB to 117.0 MB (`Runtime.getHeapUsage`), 22% less;
  - its DOM nodes stayed at about 32,600 (`Memory.getDOMCounters`);
  - a heap snapshot's `StackFrameInfo` objects went from 722,868 to 211,260, and its errors holding stacks from 38,342
    to 12,852, with React's `_debugStack` from 155,183 to 74,172. What's left is Parity's own window, whose React is the
    development build of Parity's dev server.

  What frames lose, and what's kept:
  - **React's development warnings,** such as keys, invalid nesting, or the input with both `value` and `defaultValue`
    the example's frames had, no longer reach the window's console, so agents' `console` doesn't read them either.
    They're for the project's own dev server to show. Errors still reach the frame and agents.
  - **React's own error messages are minified** to a code and a react.dev link, such as `Minified React error #130` for
    a component that's `undefined`. A component's own errors keep their messages.
  - **Which component React is working on,** which `getOwner` gives only in development, told each frame's code which
    frame's window it's in. That's kept another way: see "A project's code that asks the window its size" below.
  - **Kept as they were:** finding a layer's DOM from React's tree (`child`, `sibling`, `stateNode`, `memoizedProps`, in
    both builds), component error boundaries, `onCaughtError` naming the failed component, and agent snapshots, none of
    which read `_debugSource`, owner stacks or component stacks.
  - **The project's JSX is still compiled for development,** calling `jsxDEV`, which React's production build leaves
    out. The renderer names stand-ins for what it leaves out (`developmentStandIns`), and the builder serves
    `react/jsx-dev-runtime`, or any `…/jsx-dev-runtime`, as that package's `jsx`. The dependency optimizer gets the same
    stand-in as a plugin of its own (Rolldown's or esbuild's), since it doesn't run the server's, so a package shipped
    with its JSX compiled for development renders too. That stand-in is placed beside the module importing it, so the
    runtime it imports is the copy that module would find, even one installed only below it.

- **The performance stats count each project's builder,** as "Vite for shop", since its memory used to count in the
  service's: the service asks each builder for its CPU time, and the system reads its memory as it does Electron's own
  processes'. Storybook and the other servers Parity starts still aren't counted.

- **At 100% a frame is the size Chrome draws the same page,** checked element by element on all 36 frames of the
  example's screens, within 0.01px. A frame's root starts from what a browser gives a page's root (`all: initial` on
  `:host`, in a layer below the project's own CSS), not from the canvas around it. Before this, text without a size of
  its own took the canvas's 12px and 18px line height instead of 16px. The frames beside the first column are drawn
  smaller on purpose, and so aren't actual size at 100%. `frame.test.ts` lays a frame out in Chrome and checks its root
  against a fresh page's, and the render sweep (PAR-211) is to compare whole frames with Chrome. On screen at 100%, a
  phone and a desktop frame were also captured and compared with Chrome pixel by pixel: same size and place, with only
  text antialiasing differing (the canvas draws text in grayscale, and Chrome with ClearType's colored edges).
- **Parity's own custom properties stay out of frames** (PAR-157). Custom properties inherit into a shadow root, and
  `all: initial` leaves them alone, so a frame inherited every variable Parity's page defines. shadcn's names are
  Parity's too: a project using `var(--border, 1px)` without defining `--border` got Parity's border instead of its
  fallback, which Chrome gives it. A frame's root now sets each custom property that reaches its host to `initial`, as
  if nothing defined it, in the same lowest layer as `all: initial`, so the project's own definitions, in any layer or
  none, still win, as do the viewport properties set on the host. My calls:
  - **The names are read from the computed style of the element around the host** as each frame is prepared, which lists
    every custom property reaching it: Parity's stylesheets, tldraw's, and inline ones such as tldraw's zoom. Collecting
    them from Parity's stylesheets instead would miss the inline ones. The list sits in the sheet every frame shares and
    only grows, since setting a property nothing passes down changes nothing; the sheet is written again only when a
    name is new, normally for the first frame alone.
  - **A variable Parity's page first defines after a frame is prepared** reaches that frame until it's prepared again,
    as it is when its environment changes or it wakes. Parity's page defines its variables before the canvas draws.
  - **Registered properties can't be kept out.** `@property` is the document's, shared by Parity and every project, so a
    name Parity registers with an initial value has that value in frames, where on the project's own page it would be
    undefined. Shadow roots ignore `@property`, so there's no per-frame registration to put in its place.
- **Frames have square corners and cut nothing off,** at your request, since a browser's viewport doesn't round its
  corners. Only a frame with a device height clips, below that height, where a browser would scroll; a frame that grows
  with its content shows all of it, shadows and popups included.
- **A frame stands for a browser window of its own size,** so a project's styles and code see the screen it's designed
  for, not Parity's window, while frames stay shadow roots in one page. Iframes would isolate them fully, but at a
  document, a copy of the project's code and a React per frame. The window is the frame's width by its fixed height,
  else its viewport's screen height, else the height of the device nearest its width (844 for 390, 800 for 1280). **The
  window's height and the frame's are kept apart** (PAR-466): a frame's own height is fixed, and clips it, or absent,
  and the frame grows with its content, while its window always has a height. Core's `frameGeometry` resolves both once,
  and the live frame, its bitmap and every offscreen frame (agents' measures, screenshots and checks, Export, the
  Accessibility panel) draw from it, so none works out a window of its own.
- **Viewport units measure the frame's window** (CAN-23): `vw`, `vh`, their `s`, `l` and `d` forms, `vi`, `vb`, `vmin`
  and `vmax` in the project's stylesheets become `calc()`s of two custom properties each frame sets. A frame has no
  browser bars, so `svh`, `lvh` and `dvh` are all its height.
- **So do the viewport units the project's code writes while it runs** (CAN-33).
  - **Inline styles, and text in a frame's `<style>` elements:** each frame's MutationObserver rewrites inline styles,
    however they're set, and text written into its `<style>` elements, as CSS-in-JS writes in development. This happens
    before the frame is next drawn. Code that measures straight after, as a layout effect can, still sees Parity's
    window at that moment. Chrome doesn't let JavaScript catch inline style properties as they're set. Doing it anyway
    would take a proxy on every element's `style`, which would slow every style Parity sets.
  - **Rules added to a stylesheet:** `insertRule`, `replace` and `replaceSync`, as CSS-in-JS uses in production, are
    rewritten as rules are added, in any stylesheet. Outside a frame the custom properties aren't set, so the units
    still measure Parity's window there.
  - Only declarations are rewritten, so a selector such as `.h-[100vh]` still matches. Rewriting twice changes nothing.
- **`rem` measures the project's root font** (PAR-156). In a shadow root `rem` reads the document's root, Parity's, so a
  project with `html { font-size: 62.5% }` got 16px to the rem in frames where Chrome gives it 10px. Two things were
  wrong: `rem` measured Parity's root, and the root's own `62.5%` was of the canvas's 12px text, since a frame's root
  sits in Parity's page rather than at the top of one. My calls:
  - **`rem` in the project's CSS is rewritten,** as viewport units are and in the same places (its stylesheets, inline
    styles, `<style>` text and rules added while it runs): `1.6rem` becomes `calc(1.6 * var(--canvas-rem, 1rem))`.
    Custom properties are rewritten too, since Tailwind's `--spacing: 0.25rem` is used everywhere. Queries are left
    alone: `rem` in a media query counts a browser's default 16px, not the root's font.
  - **The frame's root sets `--canvas-rem` to its font size,** whatever the project's rules make it, read through a
    length Parity registers (`--canvas-root-font-size: 1em`), since `1em` in an ordinary custom property would measure
    each element that uses it. A size worked out once, when the frame is prepared, would miss a theme or mode that
    changes the root's font; through the cascade it follows them.
  - **A relative root font size counts from a browser's 16px,** as on a page: `62.5%` and `em` in a `:root` or `html`
    rule's `font-size` become `calc()`s of 16px, and so does `rem`, which in the root's own font size means the default.
    A rule for the root and other elements at once, as `html, body`, is split when it sets a font size, so only the
    root's changes.
  - **Tokens keep the values the project wrote.** They used to be read from the CSS prepared for frames, so a token in
    `vh` already read as a `calc()`, and with `rem` rewritten, Tailwind's and shadcn's spacing, text and radius would
    have too. They're now read from the CSS with selectors mapped and lengths as written (`units: false`). What frames
    draw is rewritten instead: a token's previewed value, and the values of the styling framework's theme that the
    compiled CSS left out.
  - **Not covered:** a root font size in a width media query, since those become container queries the root asks rather
    than answers (a container can't query itself), so it applies in no frame; `larger`, `smaller` or the `font`
    shorthand on the root; a root font size from a variable holding a percentage, or holding `rem`, which makes a cycle
    with `--canvas-rem` and leaves the root at the canvas's font size; and a root font set by CSS-in-JS, whose added
    rules aren't mapped onto the root. The editor's own rem (Fields count 16px to the rem, and a spacing step is
    `--spacing` at 16px to the rem) is unchanged.
  - **Rejected:** setting Parity's own root to the project's font size, which would resize Parity's interface and can't
    serve two projects at once; converting `rem` to pixels when the CSS is prepared, which misses themes, modes and
    token previews that change the root's font; and iframes, as for viewport units.
- **A frame's body has a browser's 8px margin,** in the lowest layer, so a reset such as Tailwind's preflight still
  removes it (CAN-25). The size container that the project's rewritten media queries ask is the frame's root rather than
  its body. A container lays out on its own, as a page's root does, so on the body it kept a first heading's margin from
  joining the body's, as it does in Chrome. On the root, `position: fixed` places itself against the frame, as against a
  browser's viewport.
- **A project's code that asks the window its size gets the frame's answer** (CAN-27). This covers `matchMedia` with a
  width, height, aspect ratio or orientation, `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, the root's
  `clientWidth` and `clientHeight`, and `resize` listeners. The frame asking is:
  - the one React is rendering or running effects for, at any time. React's development build, which dev servers run,
    names the component it's working on, and that component's root says which frame. Its production build, which frames
    run (PAR-198), names none, so while it renders, the frame is the one whose provider is above the component, and each
    frame it renders or starts committing becomes the one last drawn, which its layout and passive effects and class
    components' lifecycle methods then ask about. A commit shows itself when React DOM reads the root's `ownerDocument`;
  - the one the canvas is drawing or resizing, which it does synchronously, so the first effects run inside too;
  - for a media query list or resize listener, the frame that made it. These hear the frame resize without a rebuild;
  - otherwise, in an event handler, a timer or a render the project starts itself, the frame last drawn or used, but
    only for the project's code. Code counts as the project's when every caller on the stack came from the project's
    server. Parity's code, tldraw included, always gets Parity's window, and so does code evaluated without a source,
    from DevTools or a script driving Parity. In Parity's Storybook, where the two share a server, this last case is
    off.

  `screen` and `visualViewport` still describe Parity's window. `frame.test.ts` mounts shadcn's `useIsMobile` and a
  MUI-style `useMediaQuery` in a phone and a laptop frame at once, on React's production build, clicks and resizes them,
  checks an effect of a render a timer started and a class's `componentDidUpdate`, and checks Parity's own answers.
  After these changes, the 93 full-size frames in the example's Boards story still match Chrome element by element,
  within 0.03px.

- **Visual regression tests draw each frame as a page of its own, not as a canvas frame** (PAR-226). Canvas frames share
  one window, one document, one origin and one copy of the project's code, so the canvas can draw dozens at once. The
  rewrites and window answers above make them look right, and that's enough to design with. A baseline needs a
  guarantee, and these frames still share more than a test should:
  - the project's module state, such as a store two frames both read;
  - the document's portals, focus, scroll lock and listeners;
  - Parity's origin for storage, cookies and relative requests;
  - Parity's root font size for `rem` (PAR-156) and its CSS variables (PAR-157);
  - media queries other than width, the pixel ratio, the user agent and touch;
  - the canvas's drawing: fractional positions, zoom and grayscale text.

  So each design, state and mode is loaded as its own page on the project's dev server, in its own browser context. The
  project's CSS is unchanged there, and its window, `html`, `body`, `rem`, media queries and modules are its own. The
  mode's viewport, pixel ratio, color scheme, reduced motion and touch are emulated. Time is frozen, animations
  finished, and fonts, images and components that load on demand awaited. The canvas is then held to those pages: the
  sweep compares each canvas frame's layout with its page's, element by element (PAR-211), as was done by hand for
  CAN-23 to CAN-33. A gap in the canvas's isolation then shows up as a failure, not as a wrong baseline.

- **Visual tests come after the core** (your call, 2026-10-29). PAR-226 and the VIS stream, which
  [visual-tests.md](proposals/visual-tests.md) proposes, stay at Later until the core is done, including PAR-227 and
  PAR-228, which need nothing else.

- **Agents render offscreen,** in a hidden window, so their work never moves your camera. Export uses the same renderer.
- **A frame drawn offscreen gets the canvas's render inputs from the tab, whole** (PAR-465). My call, from the DRY audit
  of 2026-10-31: the tab's snapshot carries what the canvas draws with, not a copy rebuilt elsewhere. Its library is the
  design store's (`getLibraryDesigns`, put together with the project's designs by `projectComponentLibrary` in
  `@parity-app/core`, as the canvas does, the project's own winning an id they share), so an instance of a `.lib.par`
  design draws in agents' frames, exports and the Accessibility panel as on the canvas. Its token values are the token
  store's `previews()`: kept by `withTokenOverrides` in `@parity-app/editor`, every value the canvas shows that differs
  from the compiled CSS its guest loaded (compared with that CSS, not the edits' originals, so it holds after a guest
  loads again with saved values), a complete set rather than changes; an agent's call lays its own `SetTokens` over them
  for each frame. The render window starts each job's stylesheet from the compiled CSS and lays the set over it
  (`showTokenOverrides` in `renderer/guest.ts`), going back only when the set changed, so no frame inherits another's
  values, and an undone edit leaves nothing behind. The canvas's own stylesheet is still edited in place, as before.
- **Problems reports where a node overflows, not only that it does** (PAR-456). Each measured node carries the node it's
  drawn inside (`parent`), and Measure says which state and mode it drew. A layout finding names the node, what it
  overflows and both boxes, and how far past each edge, in CSS pixels. Three cases are kept apart:
  - **Clipped:** the nearest ancestor that hides overflow cuts part of it off. That ancestor is named, or given by its
    box alone when it's an element outside the design's layers.
  - **Frame overflow:** it reaches past the frame's left or right edge, or the bottom of a frame with a fixed height, by
    its position as much as its width, so a 60px button at x 340 overflows a 375px frame.
  - **Visible overflow** of a parent that doesn't clip, inside the frame, is drawn, so it's taken as intended (a badge
    over a card's corner) and isn't reported. PAR-886 reports it when the node is in the layout's flow; see "Problems
    reports a squeezed node and content spilling out of its parent".

  Half a CSS pixel of overflow is allowed for subpixel layout, as before. A node that goes no further past the same
  edges of the same container than an ancestor already reported is left out, so the finding is on the node to fix.
  "Content is wider than the frame" now shows only when no node accounts for it. The old "wider than the frame" finding
  on each node is replaced by frame overflow, which also catches a node pushed out by its position.

- **The offscreen renderer closes when it's idle,** a minute after its last job, and the next job opens it again
  (CAN-83). Its page holds every module graph the project's guest imported, which a page can't unload, so it held 115 to
  215 MB for the whole session and grew each time a project reopened (452 MB after five). A job counts from when it's
  queued until it ends (`main/idle-close.ts`), so it never closes during a job or with one waiting. The first job after
  it opens again waits for the page and the project's modules to load, 0.4 to 0.9 s more than a capture's usual 133 ms
  on the example project; bitmaps are kept in the canvas, so a canvas that's settled rarely asks again.
- **An offscreen window whose renderer crashed is opened again for its next job** (PAR-681). Crashing the windows with
  `Page.crash` in the running app showed that a capture in flight doesn't wait: Electron rejects the call into the page
  at once, and the canvas tries the frame again and reports the failure. But Electron keeps the crashed window, and
  every later call into it failed in a few milliseconds. The canvas's retries kept the renderer from going idle, so it
  never closed, and captures were still failing four minutes later. Now the job that gets a crashed window's slot
  destroys it and opens a fresh one, and the job the crash interrupted records `frame.failed` as `crashed`. No timer
  watches for crashes: the queue already gives the slot to the next job, and the canvas already retries.
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
  words. Slides, shaders, SVG drawing and image generation are future features (the Future features stream in Linear),
  so the skill leaves them out. Keep it current: a new agent function or tool needs its line in `execute.md` or
  `SKILL.md`, and its examples must run.
- **Every `js` example in the skill runs in a test** (PAR-23): `packages/cli/src/skill-examples.test.ts` runs each one
  through `execute` against an example project with every design and node the examples name, a file's examples in one
  tab so globals carry over. It fails on an error or a warning, except warnings that boards overlap, which depend on
  where the project's boards sit. A new example that names a design the project lacks needs it added there.
- **Parity is design-system first, so it has no style archetypes.** A project's look comes from its own components and
  tokens, or from a design system library it adds. Pen's ready-made styles aren't copied, and the skill never suggests
  one. PAR-140, which proposed them, was dropped; its ID isn't reused.
- **Agent passes write stories; they don't set up Storybook** (your call, 2026-10-28). Adding Storybook to a project is
  setup work for the scaffolder, whose catalog already has a Storybook add-on, or for a recipe (PAR-285). The pass that
  set up Storybook was dropped before anyone built it; PAR-278 is now a different item.
- **The CLI and MCP find layout problems:** `parity problems <design>` and the `find_problems` tool report render
  errors, overflow, clipping and unknown components, in every state and the modes shown unless narrowed.
  `parity problems` exits with 1 when it finds any.
- **Reads for a terminal are CLI only:** `parity tokens`, `parity components` and `parity props <Component>`. Agents do
  these in a snippet (`GetTokens`, `Components`, `Props`), so the MCP tool list stays short.
- **Agents find the token nearest a raw value through `GetTokens({ nearest })`** (PAR-833, my call, as the issue asked).
  A design handed over often has a color or length that isn't a token, such as `#2f6fed` or `13px`, and the skill
  forbids writing one raw. `nearest` lists the tokens that can be compared with it, nearest first, with how far each is:
  OKLab for a color, as contrast fixes and PAR-186's styling controls measure it, and pixels for a length. It's a filter
  on the read agents already make, so `parity tokens` gains `--nearest`, MCP's `get_tokens` gains `nearest`, and the
  tool list stays as it is. The other way, a note on each call that writes a raw value, comes after the value is
  written, so the "isn't a token" warning only names the `GetTokens({ nearest })` call to make. Colors are compared in
  the default theme, and ties go to semantic tokens, which the skill prefers. Colors are read with `parseColor` from
  `color.ts`, hex and `oklch()` only, so `rgb()`, `hsl()` and named colors aren't compared yet. It lands with PAR-186's
  branch, as you asked (2026-11-10).
- **Agents see what the Components panel shows** (your call, 2026-10-29): `parity components` lists the components that
  fail to draw on the canvas and why, and the person's corrections, saved or not, as well as the exports that aren't
  components (`0004a01`). `Components()` in a snippet still returns names, which closes PAR-254: snippets use them to
  build designs, an agent looks before it writes one, and whether a component draws changes as frames draw, so a status
  read at the start of a snippet would be stale by the time its designs render. My call; change it if snippets need the
  status too.
- **The CLI will be public on npm** (your call, 2026-10-29), so a CI pipeline gets Parity with `npx` and nothing else to
  download. Visual tests in CI rely on it (PAR-239). It can't be published as `@parity/cli`, because the `@parity` scope
  on npm belongs to Parity Technologies, so it's `@parity-app/cli`, under the `parity-app` npm organization you created
  on 2026-10-29 (PAR-26). Its command stays `parity`. It has that name inside the repository too, since pnpm's
  `publishConfig` can't rename a package when it's packed (PAR-13).
- **A project's Vite server keeps its own dependency cache,** `node_modules/.vite-parity`. With Vite's default, the
  project's own dev server, often running alongside, re-optimized into the same folder, and each server then served
  stale dependencies ("Outdated Optimize Dep"). Opening Parity's own app as a project broke every offscreen render this
  way (PROJ-11).
- **Dependencies are served without their source maps inlined,** by Parity's UI and each project's builder (CAN-85).
  Vite inlines a map into every script it sends, prebundled dependencies included, and those maps cost the pages more
  memory than the code: tldraw's 3.5 MB bundle arrived as 12.4 M characters. My call: a prebundled dependency ends with
  a link to the map Vite wrote beside it, which Vite serves when DevTools asks, so DevTools still shows its source; any
  other script from node_modules, such as Vite's client, comes without a map; and Parity's own code, workspace packages
  and a project's own files keep their inline maps, so their stack traces point at their source. It's one plugin,
  `@parity-app/builder-vite/dependency-maps`, which imports only Vite's types, since the builder runs it in the
  project's own Vite. Vite counts plugin names in its dependency cache's key, so adding it re-optimizes dependencies
  once, and pages can't reuse copies with maps from the HTTP cache.
- **An agent's `Replace` reports the patches it throws away and keeps none** (PAR-455). My call, within the issue's
  bounds: the replacement's ids are fresh, so the old node's responsive, state and variant patches go, and the result
  lists them in `discarded` by node, viewport, state and variant for the agent to reapply. No option keeps compatible
  root patches, since that needs a mapping contract nobody has agreed, and descendants are never remapped by name or
  position. Replacing a root now also drops its variant options' patches, as a nested replacement always did, rather
  than leaving them keyed to nodes that are gone.

## Previews

You asked on 2026-10-29 for previews of every kind of token and of components, designed in Storybook first. These calls
are from that design; [proposals/previews.md](proposals/previews.md) has the detail, and PAR-141 to PAR-143 and PAR-207
to PAR-209 build it.

- **Token previews are drawn, not rendered.** My call: a token's preview is a few of Parity's own elements styled from
  its resolved value, never a frame or a bitmap, so a panel of 459 tokens costs only elements. The project's custom
  properties are never set on Parity's elements, since shadcn's names are Parity's too; values resolve through
  `resolveTokenValue`. Project fonts already draw in Parity's document, since `@font-face` moves there.
- **Previews go by kind, finer than the category,** and the Tokens panel's sections follow the kinds. Shadows split into
  box, inset, drop and text, motion into durations, easings and animations, and what's under Effects and Other today
  gets sections of its own: blur, aspect ratios, perspective, border widths, opacity, layers (z-index) and cursors.
  Opacity, blur and border width also become categories, since the inspector picks by category; the rest stay kinds.
- **A token's kind comes from its value, then its name, else none (PAR-442).** You approved this method ("method E") on
  2026-10-30, in the Design Token Previews session:
  1. The value is resolved through the tokens it refers to, with simple `calc()` worked out.
  2. Its shape gives the kinds it allows.
  3. When only one fits, that's the kind.
  4. Otherwise the name's words choose among those, and then the group it's filed under. The name never overrides the
     value: Mantine's `color-text` is `#000`, so it's a color.
  5. When nothing settles it, it's a setting (Other, a plain value with no preview), never a guess.

  A DTCG `$type` the author states decides first. It reads CSS values and generic English words only, never a
  framework's names. `tokens/fixtures/token-categories.json` holds every token of Chakra, Fluent, Mantine, MUI and Nova,
  which the rules were made from, and of Primer, which they weren't. Primer is labelled from its own `$type` and Figma
  scopes, and came to 99.7% before it was added. A test reports each library's accuracy, all at 100%. Gradients and type
  styles have sections of their own, and Containers is now Sizes.

- **What a design shows sits on the design's sheet.** Shadows, blur, opacity and type are previewed on the project's
  background in its default theme, not Parity's dark chrome; measurements (spacing, radius, z-index, motion) are
  diagrams in Parity's ink.
- **Motion moves only while it's looked at:** while hovered, focused, highlighted in a picker or open in its detail, and
  never otherwise, so an idle panel runs no animations. With reduced motion, nothing plays by itself and Play runs it
  once. Animation tokens play the project's own keyframes.
- **Component previews are bitmaps of what inserting would place,** made by the offscreen renderer behind canvas bitmaps
  and agent renders, in the project's default mode, and kept on disk keyed by content, in PAR-158's store. No panel or
  picker mounts a component. Dark previews are made only on request.
- **A preview whose code changed shows its last picture, dimmed and marked as updating,** until the new one is made.
  That's fine in a list, unlike on the canvas, and a content key means a picture is never taken for current when it
  isn't.
- **The Components tab gets three views:** Names (today's list), List with a picture on each row (the default) and Grid.
  Resting the pointer on a component for half a second opens its card, with a large picture, its variants and its
  source; the `/` picker shows the highlighted component's card beside its list.
- **PAR-178 keeps the picker's speed and ranking; its previews moved to PAR-208,** so the two aren't built twice.
- **A token's detail shows its value read-only, and Edit changes it.** You found on 2026-10-29 that Cancel seemed to do
  nothing, that an erased value had no way back, and that you couldn't tell what would save. So editing is a mode:
  nothing is written until Save, Cancel or Escape leaves without writing, and after a save the detail says where the
  value went, with Undo.
- **A value is checked before it can be saved:** brackets and quotes must close, each `var()` must name a token, and the
  value with its references replaced must be the kind's value. You found `calc(var(--radius) * 2.6` saved without its
  `)`; the browser closes it silently, and `CSS.supports` passes anything holding `var()`. `validTokenValue` had both
  holes; the Tokens panel's editor has checked values this way since PAR-141.
- **Spacing draws at its true size in the detail, and within the usual box in rows.** You asked on 2026-10-29 for true
  sizes, and rows widened to the section's longest length, up to 128 pixels; in the app's 256-pixel panel that cut the
  spacing names to a letter, so you asked the same day to go back. Rows keep the box every kind has, the pixels are
  beside the name, and the detail draws the true size among its neighbours. A longer bar was drawn cut with a break,
  which you found didn't say it was cut; of the ways we drew up, you chose the compressed tail the same day: true size
  up to 16 pixels short of the box, then the rest squeezed, hatched, into those pixels, on a log scale up to 384.
- **Tokens are Semantic or Primitive, as Figma names them.** You asked on 2026-10-29 why shadcn's variables were
  "Project colors": the label said where they were declared, not what they are. The filters, section headings and
  pickers now say Semantic (named for what they're for, as `primary`) and Primitive (the raw scale, as `color-red-500`),
  the pair Figma's variable collections use; Fluent's alias and global, Material's system and reference are the same
  split. Which tier a token is still follows where it's declared until a library says (PAR-143's audit).
- **One token order, kept in the tokens package, for every list.** You found on 2026-10-29 that the spacing picker
  listed containers as 2xl, 2xs, 3xl, 3xs, out of step with the Tokens panel, and asked for a DRY approach. The order
  moved into `@parity-app/tokens` (`orderTokens`, beside the kinds it reads), and the token store hands every panel and
  picker its tokens in it, the Tokens panel included, so none sorts on its own (PAR-440).
- **A measured kind lists smallest first.** You found the font weights out of order on 2026-10-29: they were by name, so
  black came before bold and thin last. Weights, sizes, lengths, durations, opacities, layers and ratios now list by
  value; colors, fonts, easings, animations and cursors stay by name, having no one order. Shadows stayed by name too,
  until you found them out of order the same day: they list by how far they reach past their box, the furthest layer's
  offset plus its blur and spread, measured from the value so any library's shadows order alike, not by size names. You
  then asked that every group with a size or a number list smallest to largest: animations go by duration, a value that
  is a duration makes a duration whatever its name (`animation-delay-75` had sat among the animations), and ties and the
  kinds with no measure go by name with numbers by value and size words smallest first, in the forms most libraries
  write them, rather than by the order the stylesheet had them.
- **An animation is drawn the same way whichever library it's from:** one plain block runs its keyframes, over a dashed
  outline of where it rests. You found on 2026-10-29 that some vanished when hovered (Radix's accordion keyframes
  collapse to a height only its page knows) and that the drawings were a ring, a ball or a square by Tailwind's names,
  which wouldn't carry to other libraries.
- **Copy as offers `var()` under CSS and the token's name under Token, and no classes,** as you asked on 2026-10-29.
  Parity supports any number of frameworks and token sets, and a variable says only that it can be used as a variable,
  not which classes or props use it; the name is what Parity's own fields take. Classes, under Class in a Tailwind
  project, went the same day.
- **The panels hold up when narrow.** You found on 2026-10-29 that the Tokens panel's header ran out of its boxes and
  the open tab's name ran over the next tab. My call: the left panel's least width goes from 200 to 232 pixels, the open
  tab names itself only when there's room, filters drop their counts first, and a row's copy button takes the value's
  place while it shows rather than keeping room for itself. (The button went with PAR-444, below.)
- **Copying a token takes one step, and copies its name,** since you judged it's why most people open the tab: a click
  on a row, tile or palette shade, or Ctrl+C on a row, copies `radius-md`. The row says Copied where its value was, for
  a moment. You chose the name over `var()` on 2026-10-29, since Parity is for designers and vibe coders, who rarely
  open the code, and the name is what Parity's fields take (they refuse `var()`; PAR-401 makes them take it). You chose
  the bare name over `--radius-md` the same day, so the panel, the detail's heading, its messages and every copy name a
  token one way, the way a field expects it. The detail's Copy is a split button: its arrow opens Copy as, with `var()`
  under CSS and the name under Token.
- **A token's detail opens on hover, and a click on its row copies** (PAR-444). You asked on 2026-10-30 for the Tokens
  panel to work like the component previews: the copy button that showed on hover hid the value, the most important
  thing in the row. Resting the pointer on a row or tile for half a second opens its detail, which stays while the
  pointer is on it and, once something in it has focus (as when editing), until a click elsewhere or Escape. The right
  arrow opens it from the keyboard. The hover card's timing is one hook, `chrome/hover-card.ts`, shared with the
  component previews.
- **Each section of the Tokens panel folds** from its title (PAR-443), which you asked for on 2026-10-30. Starting or
  clearing a search unfolds them all, so matches always show, as the Components panel does.
- **Every copy says how it went, through two shared parts** in `chrome/Copy.tsx`, which you asked for on 2026-10-29
  after a copy showed nothing: `CopyButton`, whose icon springs into a green check and back, or a red cross with
  "Couldn't copy", and `CopyOnClick`, for things with no room for a button, which raises a "Copied" bubble from what was
  clicked. Both share `useCopy`, so another way of copying the same thing (Ctrl+C, a menu) shows its result on the same
  button. My call: where the Clipboard API refuses, as in a frame without focus, they copy from a hidden field beside
  what has focus, so an open popover stays open. PAR-402 moves Parity's other copies onto them.
- **In the app, a palette shade copies on a click, and a search makes it editable.** My call, moving the previews into
  the Tokens panel: a shade in the grid opened the editor before; now a click copies it, as the exploration has it, and
  while searching the palette's matches list as rows, which open the editor. Its tooltip is just its name, as you asked
  on 2026-10-29, since that's what a click copies. The list draws only the rows in view, with the search and filters
  fixed above it.
- **Themes are named as the modes name them, never by their class.** You asked on 2026-10-29 why the token editor said
  "Theme .dark": the class is how a theme reaches a frame (shadcn's `.dark`, or the class Parity writes for each of a
  library's DTCG contexts, such as Fluent's `teams-high-contrast`), not what anyone calls it. My call: a token's values
  are still keyed by the class, as the stylesheet keys them, and the detail names each by the theme option that adds
  that class in the Modes panel (Dark), the root's by the option that adds none (Light), and any other from its key.
- **In the app, Apply replaces the exploration's Save.** The detail's design came before PAR-164 put every change
  through Save and Undo, so its Save wrote the stylesheet at once. In the app Apply changes the canvas as one undoable
  step and the project's Save writes it; the line under the value says so, with Undo while it's the last step.
- **The detail says each thing once, in a fixed order:** the preview; the name, with what it comes to on the right as
  its row shows it; one labeled list of facts (the value in each theme, Built on, From, Used by); and a bar with Edit
  and Copy. You found the first pass disorganized on 2026-10-29: the value showed in three places, and its actions were
  scattered. Editing turns the values into fields in place and the bar into Cancel and Save; a motion token's Play sits
  on its preview, as on a video. There's no caption under the name: "Font sizes, theme scale" only repeated the section
  heading and the filter, so a library's name moved into the list as From.
- **Every color swatch has one edge: a faint hairline in Parity's own text color, over the color.** You found on
  2026-10-29 that dark swatches showed white corners and that black ones vanished into the dark panel. The corners came
  from the checkerboard (for see-through colors) and the color being two elements, each antialiased at the rounded
  corner, so the checker's white showed through; the edge meant to fix it was painted under the color. Now one element
  paints the color over the checkerboard and draws the hairline over both, 14% of `--foreground`, so it's light in the
  dark UI and dark in the light one. You chose that over a black or white border picked by each color's lightness: black
  and white swatches stand off the panel, the colors between look unchanged, and the edge never jumps between two colors
  that are nearly alike. It's on rows, tiles, the detail's preview and values, the palette's shades and a library's
  described tokens (PAR-435).
- **A color shows a swatch for each theme, even where two themes share a value.** PAR-143 drew equal themes as one
  swatch named for both ("Light and Dark"), since equal halves with no gap between them ran together. You found on
  2026-10-29 that a single block named for two themes looked broken, and that in a row it looked like a token with one
  theme. With each swatch edged and split by a gap, equal halves no longer run together, so every color in a two-theme
  project shows two swatches, Light then Dark, in rows, tiles and the detail, and matching halves say the value is the
  same (PAR-435).
- **A framework's styling keyword is a name the style field takes, listed with the tokens as `source: "keyword"`**
  (PAR-458). My call, as the issue asked: Tailwind's `rounded-full` is `calc(infinity * 1px)` in its utilities, with no
  `--radius-full` in its theme, so there was no name for a circle or a pill. The radius field takes `radius-full`, named
  as Tailwind's radius steps are, and a frame draws `var(--radius-full, calc(infinity * 1px))`: a project that declares
  `--radius-full` keeps its own value, and Parity adds no variable and changes no scale. `GetTokens` lists it after the
  tokens, so discovery and validation agree, and the agent's lint takes it for `radius` only. The alternative, a token
  added to the project's list, would have put it in the Tokens panel as something to edit and write to the stylesheet.
  `radius-full` is the only keyword for now; others can join `radiusKeywords` the same way when a design needs them.

## The app icon

- **Parity's icon is the brackets: code's `<` and `>` closing around a component's diamond,** which you chose on
  2026-10-29. The drawings are in `brand/`: `parity-icon.svg` for 48 pixels and up, `parity-icon-small.svg` with heavier
  lines and no glow for smaller sizes, and `parity-mark.svg`, the glyph alone in one color.
- **The app's icons are drawn from those files** by `apps/desktop/scripts/icons.ts` into `apps/desktop/resources`:
  `icon.ico` for the Windows taskbar, `icon.png` for Linux, and `dock.png` for the macOS dock, with the margin Apple's
  icons keep around the tile. The dev runner copies them beside the bundles, so a second copy of the app finds them too.
  The taskbar shrinks the 32 and 40 pixel sizes to 24 and 30, so those use the small drawing.
- **The program the app runs from carries the icon too,** for where a system reads the program rather than the window:
  File Explorer, Task Manager and a taskbar button pinned before the app runs, or Finder and Activity Monitor: see "The
  app is named Parity, with Parity's icon, to every system". Packaging the app will set it the same way.

## Developing Parity

- **Only a change to the main process or the preload script restarts Electron.** A change to the project service
  (`src/utility` and every workspace package it bundles) restarts just the service: Electron watches its bundle and
  reconnects each window, which reopens its projects and keeps its designs, unsaved changes and canvas. A change that
  leaves the bundle as it was, such as a comment, restarts nothing. The UI reloads in place through Vite, as before.
- **A dev runner left behind stops itself.** Stopping `pnpm dev` on Windows could leave `scripts/dev.ts` running, with
  an Electron that kept the debug port and old code. The runner now quits, closing Electron, once whatever started it is
  gone, and Electron quits once the runner is gone.
- **The repository has its first commit,** `3dbc7fb`, everything as it stood, which you asked for on 2026-10-28 before
  the package work starts.
- **Sessions commit their own work when they judge it's ready.** You said: "I want it to commit when it thinks it
  should, not just when I ask." That's when a piece of work is done and `pnpm verify` passes. Each session stages its
  own files, so other sessions' unfinished work stays out unless you ask for a wholesale commit. AGENTS.md says how.
- **Editor work lands with tests and a section in [editor.md](editor.md).** You asked on 2026-10-29 for "tests for each
  piece of functionality, and documentation so we know it exists and don't lose it or regress". A feature's section says
  what it does, where its code is and which tests cover it, and changes in the same commit as the feature. Features
  built before then are PAR-392.
- **The editor audit's tasks start with the ones that need no design,** as you asked on 2026-10-29. So the parts of
  CAN-39, CAN-47 and CAN-48 that need design first moved to new items: Copy as PNG (PAR-190), find (PAR-191), lock
  (PAR-192), the finer gesture work (PAR-193) and lengths off the spacing scale (PAR-194). Until PAR-194, nudging moves
  an absolutely placed layer by one spacing step, or ten with Shift, since 1px would leave the scale.
- **The editor's end-to-end tests are `pnpm test:app`** (PAR-202), kept out of `vp run test`. Files are `*.e2e.ts` with
  their own Vitest config, run one at a time against one copy of Parity on a temp copy of the example, its
  `node_modules` linked rather than copied, and a component that ignores its props added only in the copy. It uses ports
  5385 and 9385, or ports the system picks. Tests read results from the page's state, drive real pointer and keyboard
  input with presses tldraw sees kept 500 ms apart, use a stand-in clipboard, and undo everything after each test. A
  full run takes about five minutes.
- **End-to-end tests run only in CI,** as you requested while preparing the first CLI release (PAR-14). The pre-push
  invocation and its local runner and lock are removed. Sessions do not run full or focused E2E suites locally.
  `app.yml` runs them for every pull request and push to main on Windows, whose runners have a desktop for the window.
  It doesn't block merging yet: on its first run the example never opened on the runner within 180 s, so it stays out of
  CI until it runs reliably there (PAR-438). It's a workflow of its own, not a job `CI passes` leaves out, since a
  failed job still fails CI's run, and `cd-npm.yml` and `cd-desktop.yml` run only after CI's run on `main` succeeds.
- **Packages and scripts use only TypeScript that Node can strip,** because the CLI and scripts run them with plain
  `node`: no parameter properties, namespaces or enums. oxlint rejects the first two in `packages/**` and
  `apps/*/scripts/**`; the app's bundled code may use them. The Library files session found CAN-48's parser had broken
  the CLI this way, fixed in `f743864`.

- **Parity's UI imports each lucide icon from its own file** (PAR-199). Vite prebundles a dependency whole, and
  lucide-react's index imports every icon, so the window held all of them, 1.73 M characters in one script, for the 139
  the chrome uses. A plugin in the UI's Vite config (`apps/desktop/scripts/icon-imports.ts`) rewrites
  `import { Plus } from "lucide-react"` to the icon's own module and keeps the package out of prebundling, so the window
  loads 149 small files, 0.28 M characters. The Icons panel doesn't need the full set: it lists the project's own icon
  library, served by the project's builder. My call: a plugin over per-icon imports in the code, so the code imports
  icons as shadcn's components do, and over an alias, which can't pick the file per name.
- **The UI's prebundled dependencies are minified** (PAR-199). tldraw went from 3.53 M characters to 1.68 M and React
  DOM's client from 0.91 M to 0.39 M; their source maps still take DevTools to the code as published, and Parity's own
  code is served as written. With the icons, the window's scripts went from 19.3 M characters to 14.9 M and its heap
  after a collection from 151 MB to about 141 MB, on the example project; the window's process memory moves by more than
  that between runs, so it isn't the measure. My call: minifying in Vite's optimizer rather than a production build of
  the UI now. A production build would also drop React's development build and Vite's client, the larger saving, but
  costs reloading in place while Parity is worked on, so it waits for a packaged app, where it comes with the rest of
  the build.
- **The service keeps TypeScript in both its threads** (PAR-199). The two copies are the service's main thread, which
  parses component files and reads tsconfigs on every open and change (`@parity/renderer-react`, `@parity/code`), and
  the type checker's worker (`utility/props-worker.ts`). They're one version, 6.0.3; a thread can't share a module with
  another. The worker's copy costs about 12 MB, only while the worker runs, which is up to five minutes after its last
  answer, and not at all when an open finds what the checker found last time saved. One copy would mean either the
  checker on the main thread, which blocks the service for seconds on a large project, or the parse and every import
  that reaches TypeScript (`@parity/project` and `@parity/code` import it at their top) moving into the worker, a
  restructuring of both packages for those 12 MB. My call: neither; it's measured and left.

## Repository and releases

- **The desktop production build is `pnpm build`** (PAR-8). Both UI pages load from the built files through Electron's
  directory protocol source at `parity://app`, a standard secure origin with a fixed project CORS allowance. The main,
  service and worker bundles include their dependencies except Electron and TypeScript 6; TypeScript's full package,
  registry files, icons and the project's React guest ship beside them. Jiti's static entry bundles its config
  transformer. A new install opens the welcome page; development can still request its default project. The builder
  warms the guest graph and waits for dependency optimization before exposing its URL, avoiding cold-start outdated
  dependency imports cached by the browser. CI alone starts isolated production copies against Vite 7 and Vite 8.
- **Every build is a Sentry release, and its source maps stay out of the installer** (PAR-625). The build writes hidden
  maps and moves them to `apps/desktop/sourcemaps/`; CI and the release workflow upload them. The calls are in
  [Every build is a Sentry release](#every-build-is-a-sentry-release-with-its-source-maps-par-625).

How Parity goes public and ships. The proposal is [proposals/repository.md](proposals/repository.md), and the work is
the Repository, CI and releases stream in Linear.

- **Parity will be a public repository under the Better Apps organization on GitHub,** as you decided on 2026-10-29.
  Actions runners are free for public repositories, so CI tests on Windows, macOS and Linux.
- **The organization was Fencing Club, renamed Better Apps on 2026-10-29 at your request.** Its login is
  `betterapps-hq`, because `better-apps` and `BetterApps` belong to other people, and its picture is Parity's icon.
  GitHub redirects `Fencing-Club` only until someone claims that name, so nothing here should still use it.
- **Parity is MIT-licensed** (your call, 2026-10-29, Q6), like the agency monorepo. PAR-397 adds the LICENSE and names
  it in every package.json.
- **The README says how to get past an unsigned release's warnings before there are releases** (PAR-397), so it's right
  when the first one ships. My calls: the steps are each system's own (More info and Run anyway on Windows, Open Anyway
  in Privacy & Security on macOS, `chmod +x` for the AppImage); the CLI's README names it `@parity-app/cli` and says
  it's coming to npm; and the README's layout table and contributing section summarise AGENTS.md and conventions.md
  rather than repeat them.
- **Interface text isn't checked against Fluent's guidance.** You said on 2026-10-29 that this was a Microsoft practice
  you no longer follow, so conventions.md keeps only the rule against dot separators.
- **DOC-3, splitting the backlog, was dropped.** The backlog is moving to Linear, which solves its size. Its ID isn't
  reused.
- **Releases ship unsigned until signing is set up,** as you chose on 2026-10-29. Signing is PAR-399. Until then,
  Windows SmartScreen warns on first run, macOS blocks the app until it's allowed in System Settings, and macOS can't
  update in place, so PAR-160 waits for signing there.
- **The toolchain moves to Vite+ in place, with `vp migrate`.** You asked for the monorepo template on 2026-10-29. My
  calls: workspace packages stay source-only, the example project, fixtures and builder-vite stay on stock Vite because
  they stand in for or drive customers' projects, and `pnpm verify` keeps its name.
- **Parity runs on Vite+ since `5020d8f`** (REPO-1, PAR-1). My calls as it landed:
  - **One root `vite.config.ts`** holds the format, lint, type-check, test and task settings. `pnpm verify` runs the
    `check` and `test` tasks (PAR-405), and `pnpm format` runs `vp fmt`.
  - **Shared versions are in a catalog.** pnpm sets Vite (Vite+'s core), Vite+ and Vitest once, and a script stops when
    the dependencies changed but weren't installed: run `pnpm install`.
  - **The desktop app runs on Vite+'s core.** A pnpm override keeps stock Vite 8 for the example project and
    builder-vite, as the call above says.
  - **Types are checked by `pnpm check:types`,** which runs `vp lint --type-aware --type-check` on TypeScript 7, on push
    and in CI rather than in `vp check` (see the hooks below). Its type-aware rules are all on since PAR-396 fixed the
    places they flagged. A disable comment can't silence one, since `vp check` lints without types and reports the
    comment unused, so a deliberate exception is a `lint.overrides` entry for its file, with a comment saying why.
  - **Tests import from `vite-plus/test`** since PAR-393, and `prefer-vite-plus-imports` is an error everywhere but
    builder-vite, whose tests run a stock Vite and keep `vitest`.
  - **`.storybook` is type-checked now.** Outside any tsconfig, the checker had given it a program without the `@`
    alias.
  - **No two files in a folder may differ only by case and extension.** Beside `Processes.tsx`, `processes.ts` made the
    checker on Windows mistake one for the other, so it's now `process-store.ts`.
- **Lint extends Buildkit's base config, `@buildkitgg/oxlint-config/base`** (PAR-730), which you asked for on
  2026-11-08. It brings every anti-slop rule, and `curly`, `no-console` and `no-bitwise` are now on, as you decided
  then: no rule is relaxed. A line can still turn one off, with a comment saying why, where there's a very good reason,
  such as a bitwise hash or a CLI that prints. My calls:
  - **Code that doesn't pass yet is listed in `notYetClean` in `vite.config.ts`,** one entry per PAR-730 sub-issue,
    naming only the rules that part still breaks. New code and every path outside the list get every rule. The list only
    shrinks, and goes when it's empty. It went with PAR-751, the last entry, on 2026-11-09, so all the code gets every
    rule.
  - **`vite.config.ts` lists only Parity's rules beyond base:** `consistent-type-imports`, Vite+'s imports rule and the
    `toast.error` restriction. `react/exhaustive-deps` stays an error rather than base's warning.
  - **Storybook uses `@buildkitgg/storybook-config`'s `defineMain` and `definePreview`,** which add the accessibility
    and Vitest addons by path, so the app doesn't list them (PAR-753). Chromatic is app-specific and Parity doesn't use
    it. Story tests, once the Vitest addon's runs are wired up, run in CI only, as you decided on 2026-11-08: they're
    too slow for local test passes.
- **The agency monorepo's stricter lint rules were on before Buildkit's** (PAR-396), from its `@repo/oxlint-config`,
  without `curly`, `no-console` and `no-bitwise` as you chose then, and without the React Compiler rule, since Parity
  doesn't run the compiler. The calls below still stand, apart from those three rules. My calls:
  - **Only the rules beyond oxlint's correctness category were listed** in `vite.config.ts`, since that category is on
    already. `react/exhaustive-deps` stays an error there rather than the agency's warning.
  - **Unused names starting with `_` are allowed,** as the agency allows them.
  - **A nested ternary becomes an `if` chain or a small named function,** not a disable comment. A callback that does
    nothing, as stories pass, returns `undefined` rather than having an empty body.
  - **Disable comments, each with its reason,** are left only where the flagged code is the point: `new RegExp` checking
    a pattern, a test running generated source with `new Function`, tests that round-trip through JSON on purpose, and
    the modes panel's render callback, which the rule takes for a component.
- **Versions come from Beachball change files,** as Buildkit and the agency monorepo do it, which you asked for on
  2026-10-29. This replaces my earlier call for release-please. My calls on how:
  - **Only the desktop app and the CLI are versioned.** The workspace packages they bundle are `private` again, as you
    agreed on 2026-10-29, and sit in their `devDependencies`, so electron-builder doesn't package them and Beachball
    accepts a released package depending on them.
  - **A change to a private package asks for a change file on what bundles it.** Beachball doesn't look inside private
    packages, so `scripts/changes.ts` does, following them through each other to the app and the CLI.
  - **`pnpm changefile --type patch --message "…"`** writes the missing change files without prompting, so sessions can.
    pnpm 12 has its own `pnpm change`, hence the name.
  - **Change files are checked from what's staged or committed, never the working tree.** `beachball check` counts the
    working tree, so in the folder sessions share it blocked commits on other sessions' unfinished edits. The commit
    hook runs `scripts/changes.ts check` on what's staged, the push hook `--committed` on the branch's commits, and CI
    both that and `beachball check` on its clean checkout.
  - **A change file added where a release consumed another counts, and a renamed one doesn't (PAR-671).** Git paired a
    consumed change file with a new one for the same package as a rename, so a branch that merged `main` was told its
    package needed one. The check reads change files with `--no-renames`, and skips an added file whose content matches
    one the diff deletes.
  - **npm gets the packages whose package.json has a `publishConfig`,** which the CLI gets with its npm name,
    `@parity-app/cli` (PAR-13).
- **The CLI is packed for npm with `vp pack` (PAR-13).** My calls:
  - **The private packages it uses are bundled in, and npm installs only semver and TypeScript,** its dependencies. The
    build fails on any other package it would bundle, so a new one gets declared.
  - **The registry's files and `in-app.json` ship in `dist`,** where @parity-app/registry looks before resolving its own
    package, which the published CLI doesn't have.
  - **pnpm's `publishConfig` points `bin` and `exports` at `dist` when it packs,** so the workspace still runs the CLI
    from source.
  - **It needs Node 24,** as the repository does.
  - **Provenance comes from trusted publishing in CI, not `publishConfig`,** since npm only makes it in CI and the first
    version is published by hand, which npm needs before it can trust the workflow. 0.0.0 went up by hand on 2026-10-30,
    and `npm trust` then named `cd-npm.yml` and the `npm` environment as its publisher, which releases it still. A
    second publisher, for the `production` environment and allowed only dist-tags, promotes it (PAR-799).
  - **`pnpm --filter @parity-app/cli try-packed` installs the packed tarball in an empty folder and runs it.** CI runs
    it on each system. The packed tarball is 2.6 MB.
- **Hooks keep what doesn't belong out of pull requests (PAR-3),** as you asked on 2026-10-29. My calls:
  - **A commit lints and formats its staged files, fixing what it can, and its subject must be conventional,** at most
    100 characters (4 of the last 400 were longer) and not work in progress. A fixup commit can be made but not pushed.
  - **Types are checked on push and in CI, not on commit or in `pnpm verify`,** as you said, since type checking grows
    slow. On 2026-10-29 it took lint from 1.6 to 3.2 seconds.
  - **A push also checks formatting, lint, the pushed commits' messages and change files,** which catches a commit that
    skipped its hooks. It took 9 seconds.
  - **Focused tests and `debugger` were lint errors already.**
  - **Tests run on twelve workers locally and four in CI,** as Copacker's do, which you said suits your machine.
- **knip finds unused files, dependencies and exports (PAR-395),** as in the agency monorepo. My calls:
  - **`pnpm check:unused` runs it, in CI's checks job on Ubuntu, beside the type check.** `pnpm verify` leaves it out,
    as it does types, since one system is enough for both.
  - **The Storybook explorations stay, as you asked on 2026-10-30,** with their unused exports ignored. shadcn's
    `scroll-area.tsx`, which nothing imports, stays undecided; knip ignores it with the rest of `components/ui`.
  - **Its config is `knip.jsonc`,** so each entry and ignore says why, and its version is in the catalog.
  - **The example project and `fixtures/` are left out,** since they stand in for customers' projects.
  - **Kept on purpose:** the app's runtime dependencies that the bundled project service loads from its folder, the
    CLI's `semver`, which npm installs beside the packed CLI for the packages it bundles, shadcn's components whole, the
    Storybook explorations' shared parts, libgen's demo declarations and macOS's own commands.
  - **Removed:** `clsx` and `tailwind-merge`, which `cn` replaced, the app's `@parity-app/libgen` and libgen's
    `@parity-app/registry`, which nothing imports, and three functions nothing calls.
- **Pull requests are required on `main`, with OpenAI code reviews,** as updated on 2026-10-31 after you disabled the
  previous review service. The ruleset comes with the repository (PAR-398). My calls:
  - **A pull request merges once CI and the title check pass and the OpenAI review is addressed and every thread is
    resolved,** with no approval required, since GitHub doesn't let you approve your own. OpenAI review findings are
    fixed or answered before merging. A missing or failed review is not treated as a completed review.
  - **Merges squash,** so the title becomes the commit's subject, and CI checks it with `scripts/commits.ts title`.
  - **Nobody force-pushes to or deletes `main`,** and nobody bypasses the ruleset.
  - **Terraform writes the ruleset,** as it writes the GitHub settings the pipelines read, from the pipelines'
    `github-repository-rules` module (v1.2.0) so Buildkit, Better Apps and Copacker can take the same rules. Parity's
    `infra/github` uses it. Its two rulesets were made by hand on 2026-10-29 to match the module, so `main` was
    protected before Terraform could run here, and import blocks adopt them when `terraform-apply` first runs. The
    required check is `CI passes`, the gate over CI's jobs. OpenAI findings are handled through review threads; no
    unverified status-check name is configured for that service.
  - **OpenAI reviews use AGENTS.md and conventions.md as guidance.** The disabled review service's configuration is
    removed, and lint, format, types, tests and change files stay with CI.
  - **GitHub's secret scanning and push protection stay on,** as they are by default for public repositories.
- **Releases go straight to `main`, with the CLI and the desktop app released apart.** After CI passes on `main`,
  pending change files are released straight to `main`, with no release pull request, as you asked on 2026-11-04:
  Beachball bumps the versions and changelogs, commits them and pushes the commit to `main`. The CLI goes to npm through
  trusted publishing with provenance, and the desktop app to GitHub Releases, each in a pipeline of its own named for
  what it ships, as you asked the same day. Buildkit releases from its `ci.yml` since it only publishes packages; Parity
  ships a desktop app too. My calls: installers come from electron-builder, since one tool makes installers, signs them
  and serves updates, and only the desktop app makes GitHub Releases, so the updater never mistakes a CLI release for an
  app update.
  - **Each calls a shared template made for this** (PAR-10, PAR-14): `cd-npm-release` and `cd-desktop-version`, which
    `betterapps-hq/pipelines`' README shows, both running `beachball-publish-npm`. Like every workflow here, they call
    them at `main`, not a pinned commit, so Parity gets each change as it merges, as you asked on 2026-11-03. My calls:
    - **`cd-npm.yml` releases the CLI** once CI passes on `main`. Beachball runs scoped to leave out `apps/desktop`, so
      it bumps the CLI, publishes it to npm, then commits, tags and pushes, in one job. It runs in the `npm`
      environment, which the CLI's trusted publisher names with `cd-npm.yml`.
    - **`cd-desktop.yml`'s `version` job versions the desktop app** once CI passes on `main`. Beachball publishes every
      package it versions and has no setting to version one without publishing it, so this run is scoped to
      `apps/desktop` with publishing off: it bumps, commits, tags and pushes. CI's run on that commit starts
      `cd-desktop.yml` again, whose `release` job publishes the new version as a beta.
    - **The templates check that CI passed on a push to `main`,** so the workflows here carry no condition of their own.
    - **Each scoped run leaves the other's change files alone,** so a failed npm release doesn't hold up the app, or the
      other way round. A commit with change files for both is released in turn, a commit for each.
    - **A deploy key pushes the release commits,** as Buildkit's does: the one actor `main`'s ruleset lets skip a pull
      request, through `infra/github`. Its private key is the `RELEASE_DEPLOY_KEY` secret of the `npm` and `desktop`
      environments, passed by name. A deploy key's push starts CI and delivery, which the job's own token's wouldn't. It
      replaces the release GitHub App and its release pull request, which `release.yml` opened until 2026-11-04.
    - **A release runs only while the commit CI passed on is `main`'s head,** since a newer commit's own CI run releases
      it.
    - **The `npm` and `desktop` environments come from Terraform,** in `infra/github`, kept to `main` with
      administrators unable to bypass them, and with no approval, since every release ships.
    - **Four change files written under the old name `@parity/desktop` were renamed** to `@parity-app/desktop`, since
      `beachball bump` skips a change file for a package that doesn't exist, leaving it and dropping its changelog line.
- **Desktop releases reach the beta first, and everyone when promoted,** as you asked on 2026-10-29: beta builds and
  production releases, promoted the way the web apps go from staging to production. My calls: a release is a GitHub
  pre-release until it's promoted, and promoting marks that same release a full one, so nothing is rebuilt; the beta is
  a Get beta updates setting rather than a second app; and electron-builder stays over Electron Forge, whose free update
  service ignores pre-releases and doesn't serve Linux. The work is PAR-11, PAR-12 and PAR-160.
- **Pull requests get a web preview of Parity's UI: its Storybook, deployed to Cloudflare,** as you asked on 2026-10-29,
  beside the unsigned installers. My call: not the whole app as a web app, since the project service needs Node for
  files, each project's Vite and the agent, and Storybook already runs the real UI against a stand-in service. The work
  is PAR-111 and PAR-113.
- **One shared template, `publish-storybook`, publishes Storybook to whichever environment the caller names,** as you
  asked on 2026-10-29: you publish pull-request previews, staging and production Storybooks often, from many
  repositories, each to a place of its own. A template any stage calls is named for what it does, not for a stage. My
  calls:
  - Where each goes is that GitHub environment's settings, which Terraform's `cloudflare-storybook` module writes: a
    static-assets Worker per environment, its URL, the account and a token. A new destination is a new environment, and
    production can wait for an approval.
  - A pull request's Storybook is a Worker preview named for it, as the HOA app's previews are, and
    `unpublish-storybook` deletes it when the pull request closes.
  - It publishes what it builds or an artifact an earlier job built, so staging and production can get the same build.
- **Pull requests' previews share one comment (PAR-400, PAR-113).** The work is in pipelines v1.13.0's `preview-npm` and
  `preview-desktop`, beside `publish-storybook`. My calls:
  - Each template can comment on its own, and gives its part of a comment as Markdown, so `preview.yml` turns their
    comments off and writes one with `pr-comment`. The Storybook's line is Parity's, since its template gives only a
    URL, and `preview-cleanup.yml` replaces it when the pull request closes.
  - The installers are built again in the preview run rather than kept from CI's, which already packages them, so they
    come from the steps a release uses. Public repositories' runners are free.
  - Only the installers are kept, for 14 days: the update metadata and blockmaps matter to a release, not to someone
    trying a build. Forks get them too, since they need no secret; Dependabot's pull requests get no previews.
  - pkg-pr-new is pinned at 0.0.92 and packs with pnpm, so `workspace:` versions are written out and `prepack` runs as
    in a release. Without its GitHub App it skips with a notice rather than failing.
  - `publish-storybook` gained an optional build secret, as `cd-desktop-release` has, for the tldraw key. A Storybook is
    public, so only a key meant for the browser goes there.
  - `infra/cloudflare` is a project of its own beside `infra/github`, with its own state key, and only a `preview`
    environment, since Parity has no staging or production Storybook. Terraform's templates now take `credentials`, the
    provider secrets a project needs, and skip with a notice without them, so the project could land before its
    Cloudflare tokens exist.
- **Cloud services come from Terraform, and the pipelines expect what it makes,** as you said on 2026-10-29. My calls:
  - Each repository that needs one has a Terraform project in `infra/`, with its state in R2 and Terraform and the
    Cloudflare provider at Copacker's versions.
  - Shared modules live in `betterapps-hq/pipelines/terraform/`.
  - Terraform credentials use the shared names from the pipelines' Terraform guide (PAR-14). The apply explicitly
    forwards organization or repository secrets; matching `infrastructure` environment secrets override them. Plans
    receive only the separate read-only credentials. State bucket and endpoint come from `TF_STATE_BUCKET` and
    `TF_STATE_ENDPOINT`, with each project keeping its own backend key. Organization secrets are shared only with
    selected trusted repositories, since their workflows can access those credentials outside the environment too.
    Manual Terraform runs apply only from `main`, so provisioning can be retried after credentials are configured.
    Configure the `infrastructure` environment to allow only `main`, then set its `TF_APPLY_ENABLED` variable to `true`;
    the shared apply skips an environment that has not been enabled, even when organization keys exist.
  - Terraform also writes the GitHub variables and secrets the templates read, so a template only deploys, and skips
    with a notice until they exist.
- **The `cloudflare-storybook` module (pipelines v1.1.0) has three limits Cloudflare and GitHub set.** My calls on each:
  - Its deploy token has Workers Scripts Write across the account. Cloudflare can't hold a token that uploads assets and
    manages previews to particular Workers; the module's README says so.
  - The account's workers.dev subdomain is chosen once in the dashboard, the one step by hand: the provider has no
    resource for it, and the apply stops with a message when it's missing.
  - It writes into an existing GitHub environment, such as a web deploy's `production` with its protection rules, and
    only creates `preview` itself. Owning an existing one would reset its rules, and destroying it would delete the web
    deploy's secrets.
- **Parity's CI (PAR-2) runs `pnpm verify` through ci-verify on Ubuntu, Windows and macOS.** My calls:
  - Its `prepare` installs the fixture projects when any is missing, with Bun 1.4.3 and Corepack 0.35.0 pinned from npm
    on every system. `install-projects` installs every project in `fixtures/`: those `generate.ts` makes with their own
    package manager, and the rest (buildkit, chakra, fluent, headless, mui) with `npm ci` from their committed
    `package-lock.json` (PAR-404). Their `node_modules`, about 2 GB per system, are cached on their lockfiles.
  - Runners get 45 minutes, since a run that installs the fixtures can outlast 30 on Windows.
  - After `pnpm verify`, each system also installs and runs the CLI's packed tarball (`try-packed`, PAR-13).
  - A second ci-verify call, `checks`, runs once on Ubuntu with full history: `pnpm check:types`, and on pull requests
    `beachball check`, `scripts/changes.ts check --committed` and `scripts/commits.ts title`. The title comes from the
    event's file, never through an expression. It has a concurrency key of its own, so it never cancels verify's run.
  - A `CI passes` job over both is the one status check main's ruleset requires, so the ruleset needn't change when jobs
    or systems do.
  - Vite Task's cache isn't kept between runs yet. `pnpm verify` runs through `vp run` since PAR-405, and ci-verify's
    `vite-task-cache` input turns the rest on.
- **Parity's checks are Vite+ tasks, so Vite Task replays one whose inputs haven't changed (PAR-405).** My calls:
  - The root `vite.config.ts` defines `check` (`vp check`), `test` (`vp test run`) and `types`
    (`vp lint --type-aware --type-check`). `pnpm verify` is `vp run check && vp run test`, `pnpm check:types` is
    `vp run types`, and the pre-push hook runs `vp run types`. The `check` and `test` scripts are gone, since a task
    can't share a script's name; that's also why the type task is `types`, so `pnpm check:types` keeps working.
  - Each task's inputs leave out the listings of `node_modules` and `node_modules/.vite`. On Windows Vite Task records
    them, and Vite and Vitest add folders there as they run, so every task missed on a fresh checkout and `check` missed
    after `test`. Files read inside `node_modules` still count.
  - `test` tracks what it reads, including the fixtures' installs, and stays cached: on this machine a miss took about
    1.5 seconds longer than `vp test run` alone (15.6 against 14.1), and a hit takes 1.3 to 2.1 seconds instead of 14. A
    change to a package's source or to a fixture reruns it.
  - Vite Task keeps one entry per task, so undoing a change reruns the task once more.
  - `types` isn't cached. On macOS Vite Task doesn't see the files TypeScript's Go compiler reads (vite-task#587, fixed
    with TypeScript 7.1), so it could replay a pass after a change broke the types. A run takes about 5 seconds, so
    little is lost; cache it once the TypeScript under `oxlint-tsgolint` is 7.1 or later.
- **Dependabot keeps dependencies current (PAR-394),** from `.github/dependabot.yml`, as the agency monorepo, Buildkit
  and the pipelines repository do. My calls:
  - **Each week, one pull request for npm's minor and patch updates and one for GitHub Actions.** The shared pipelines
    are called at `main`, so it has nothing of theirs to move. npm's major updates come one pull request each, at most
    ten open, since each may need code to change.
  - **It waits 3 days before offering a direct dependency's new version,** longer than the day pnpm's
    `minimumReleaseAge` asks. That doesn't cover the transitive versions its lockfile refresh resolves, which pnpm also
    checks, so one published within the day can still fail CI's frozen install: re-run it once the version is a day old.
    Security updates don't wait, and Better Apps' own actions come straight away.
  - **Titles are conventional:** `build(deps)` and `build(deps-dev)` for npm, `ci(deps)` for Actions, which
    `scripts/commits.ts title` accepts and squash merging makes the subject.
  - **It leaves the Vite+ toolchain alone.** Vite+ pins its own Vitest and its core, which the catalog names `vite`, so
    the three move together by hand. Every other `vite` is stock Vite on purpose, held by pnpm-workspace.yaml's
    overrides.
  - **It never updates the fixtures,** not even for security, since each stands in for a customer's project at the
    versions its tests expect. An `ignore` rule naming only the dependency holds back security updates as well. The
    example project and builder-vite are updated, apart from their stock Vite.
  - **TypeScript and `@types/node` take no majors:** the packages using the compiler API stay on TypeScript 6, and the
    Node types follow `.nvmrc`.
  - **Its pull requests need no change file.** On Dependabot's own pull requests, beachball.config.cjs ignores
    `package.json`, which `scripts/changes.ts` reads too, so a dependency's new version ships with the next release
    rather than making one. Code changed there still needs a change file. Dependabot can't write one, and a workflow
    that pushed one would need a token other than `GITHUB_TOKEN` to start CI again, and would stop Dependabot rebasing.
  - **In CI the bypass needs Dependabot on both ends:** a pull request it opened from a `dependabot/` branch of this
    repository, checked on a push it made, all read from what GitHub sets. A person's branch with that name, a fork, or
    a person's commit pushed onto Dependabot's pull request still needs change files; to bring one up to date or check
    it again after reopening it, comment `@dependabot rebase` rather than updating the branch. Locally the branch name
    is enough, since CI is the gate.
  - **Alerts and security updates are on** for the repository, but they don't see the pnpm workspace's resolved versions
    yet. pnpm 12 writes `pnpm-lock.yaml` as two YAML documents, and GitHub's dependency graph read it with no
    dependencies on 2026-10-30, so it knows only the manifests' ranges and the fixtures' lockfiles. Version updates read
    the workspace themselves, so their first run shows whether they read that lockfile. Submitting the workspace's
    dependencies is PAR-432.
- **`betterapps-hq/pipelines` started with the setup action and ci-verify (PAR-110).** My calls:
  - The setup action checks out without keeping credentials, and on Windows turns off `core.autocrlf` first, since the
    runners' CRLF made Vite+'s formatter fail every file.
  - It picks Vite+ when the workspace names `vite-plus`, and plain pnpm otherwise.
  - Templates name the repository's own actions by full path at `main`, as callers name the templates, so a change to an
    action reaches every template as it merges. A path under the old `Fencing-Club` name would have resolved to whoever
    claimed that name.
  - A caller's extra steps before verifying, such as Parity's fixture installs, go in ci-verify's `prepare` input, with
    their own cache.
  - It's MIT licensed, as Parity is.
- **ci-verify grew what onboarding the other repositories needed (v1.2.0).** My calls:
  - `env` takes `NAME=value` lines set before the install, since a caller's own workflow-level env doesn't reach a
    reusable workflow. Agency needs its registry overridden before `pnpm install`.
  - `NODE_OPTIONS` has an input of its own, because GitHub won't set it through `GITHUB_ENV`. It reaches only the
    caller's `prepare` and `command`, so an option like `--require` can't break the checkout.
  - Turborepo's `TURBO_TOKEN` and signature key are optional secrets passed by name. They reach only `prepare` and
    `command`, never the install and its scripts.
  - `concurrency-key` replaces the branch in the run's group, so Copacker's runs on main stop cancelling each other, and
    Parity's two calls stay apart.
  - Where a branch rule needs a check's older name, as Buildkit's needs `verify`, a small gate job keeps it, since a
    called workflow's checks are named `<calling job> / Verify (<runner>)`.
- **Pipelines are shared across Parity, Buildkit, Better Apps and Copacker,** from one repository of templates, as you
  asked on 2026-10-29. Each repository has thin top-level pipelines, one per stage (CI, previews, and CD split by what's
  delivered: npm packages, the desktop app, web apps), calling reusable workflows and composite actions from it. My
  calls: the repository is public, because callers span `AndrewCraswell` and `betterapps-hq`; callers call the templates
  at `main` (since 2026-11-03; they first pinned a commit Dependabot moved); and CI is shared as far as `pnpm verify`,
  with each repository's extra jobs beside the call.
- **The shared pipelines live in `betterapps-hq/pipelines`, with a folder per CI system** (your call, 2026-10-29, Q8):
  `github/` holds the composite actions and their docs. Reusable workflows can't go there, because GitHub only calls
  them from a repository's own `.github/workflows/`, so they live there, named by stage.
- **Conventions from the agency monorepo are in [conventions.md](conventions.md),** as you asked on 2026-10-29. My call
  on which: finish a change before checking it, fix forward, ask before adding a dependency, no dot glyph as a
  separator, and try changes people see in the running app. Its Turborepo, shared config packages, "prefer `type` over
  `interface`", React Compiler rules and library catalogs aren't taken; the proposal says why.
- **Once releases ship, a change to `.par` or `.lib.par` still reads the old format.** My call, and the one exception to
  fixing forward: people's saved files outlive the version that wrote them.

## Packages

How Parity's code is split, so the parts that change most are easy to find, replace and test. You asked for this on
2026-10-28, expecting design-to-code and code-to-design to need a lot of iteration. The proposal is
[proposals/packages.md](proposals/packages.md). These are my calls; change any of them.

- **Every package is in the `@parity-app` scope** (your call, 2026-10-29, PAR-425), the CLI's, since Parity Technologies
  owns `@parity` on npm. Private packages are never published, but one scope means a name never says whether a package
  ships. The desktop app is `@parity-app/desktop`. My calls in moving them:
  - The app keeps its data where the old name put it, `@parity/desktop` under the system's app data folder, so tabs,
    storage and the theme survive the rename. Electron names that folder after the package, so `main/index.ts` sets it.
  - Change files waiting for a release were renamed with it, so Beachball still finds their package.
  - Docs that name `@parity/cli`, `@parity/api` and `@parity/abi` keep them, as they're about npm's scope, and
    `@parity/props` keeps its old name, as it merged into `@parity-app/code` before the move.

- **Logic lives in packages that take data and return data,** with tests that run without Electron. The app's main and
  service processes do the files, IPC and processes, and the renderer keeps the views. You chose how far the lint guard
  reaches on 2026-10-29 (PAR-5), and the root `vite.config.ts` holds it:
  - A package is pure unless that file names it: nothing from Node, React, tldraw or Electron, and only other pure
    packages. A new package starts pure, so nobody has to remember to guard it.
  - `@parity-app/code`, `@parity-app/project` and `@parity-app/registry` are readers. They read a project's files, since
    TypeScript's program and the project's discovery read as they go, but never write them or start processes; a reader
    that needs a file changed returns a project edit. They use no React and depend only on pure packages and other
    readers.
  - The CLI, libgen, the agent runtime, the adapters and the fixtures are the edge, where Node belongs, and
    renderer-react uses React.
  - No package imports Electron, tldraw or the app. Tests may use Node to set up files.
- **Design and code sync gets one package, `@parity-app/code`,** which also takes over the three component readers
  (`project/components.ts`, `libgen/components.ts` and `@parity/props`), so one TypeScript program per project serves
  them all. Generating component files, reading them back and the drift review are built there, with golden-file tests.
- **Every write into a project goes through project edits** (PAR-6): edits built as data, shown as a diff, applied and
  undone together. They come before the components work, so PAR-85 waits on them. Writing back from the lenses keeps its
  place at the end of the lens order. They were called changesets until you asked on 2026-10-29, since the word read as
  the versioning tool and Parity versions with Beachball. My calls in building them:
  - An edit expects what it finds: a file that changed since the edit was built is left alone, and the whole edit with
    it, rather than overwritten. Undo is the edit reversed, so it refuses the same way once a file has changed again.
  - The service keeps a project's latest 50 edits to undo, and no more than 64 MB of the files they wrote, since a
    pasted image can be 20 MB. They outlast the project closing, because the window reopens a project to pick up what an
    edit changed.
  - Only importing a library's styles says what it wrote, with the diff and Undo, as it's a one-off change to the
    project's own stylesheet. Token edits take their undo from the design's history (PAR-164), and saving them goes
    through a project edit underneath. A pasted image stays a design step: its file is named by its content, so pasting
    it again reuses it, and undoing the paste leaves the file, as before. A dropped image file is the same (PAR-24).
  - Installing a library imports its styles through a project edit too, but doesn't offer Undo, since undoing the import
    would leave the package installed.
- **Editor behaviour moves into `@parity-app/editor`,** one file at a time with tests: arranging and the clipboard first
  (PAR-7), then drop rules and snapping (PAR-33). It was the first package after the CLI in the `@parity-app` scope,
  which every package uses since PAR-425. My calls in starting it:
  - Each rule takes a design, or the documents designs are in, and returns it changed, with what the app needs next: the
    copies' ids, the new layout's id, the layout to select. The same object back means nothing changed, so the store
    records no step. The app keeps the undo labels, the messages, the selection, the system clipboard, saving images and
    the designs' boxes on the canvas, which it measures with tldraw and passes in.
  - The state being edited is passed in as a `StateSpec`. `editingState`, which picks it, stays in the app's
    `LayerPanel.tsx` until a package needs to choose it. PAR-570 moved it into the package (below).
  - The rules have names of their own (`removeLayers`, `copyLayersInPlace`, `wrapInLayout`, `styleOf`, `applyStyle` and
    so on), so the app's commands keep theirs and nothing is imported under another name.
  - `paste-over.ts` moved with the clipboard, with its tests, since it was already pure and is where pasted layers go.
    `paste-here.ts` waited for drop rules (PAR-33), as it uses `drop-slot.ts`'s `slotAt`, and `free-space.ts`'s
    `freeSpotBeside` waits for placement (PAR-32).
  - Reading the clipboard's envelope checks more than it did, since it's data from outside the app: the project must be
    text, and the payload one of the three kinds, its layers, designs or notes checked by core's `.par` parsers
    (`parseDesignNode`, `parseCanvasDocument`). A copy that fails pastes nothing, with a message, instead of throwing
    partway or pasting its JSON as text: `isParityCopy` tells the app the text was a Parity copy all the same.
  - A pasted design keeps its id when it's free, as the clipboard's comment always said. Before, every pasted design
    took an id made from its name, so one whose id wasn't its name's lost it.
- **Inserting, Make component and where new designs go are in `@parity-app/editor` too** (PAR-32), in `insert.ts`,
  `components.ts`, `create.ts` and `placement.ts`. My calls in moving them:
  - A drop's place is decided from boxes the app measures: `dropLayout` picks the deepest layout under the pointer and
    `dropAt` the place among its children and the line, from the layout's direction and its children's boxes. Reading
    the DOM (`hitTest`, `getComputedStyle`, `getBoundingClientRect`) stays in the app's `dropTarget`.
  - Inserting takes the item's component info, the project's component sources and the component library as an
    `InsertContext`, and builds the layer from the design the store hands it, not the one read before the step, as
    arranging does. Its undo label comes from the package too (`insertLabel`).
  - Make component (`makeComponent`) takes the documents and returns them changed, with the component's id, so the app
    applies it with one `store.change`. Where it goes on the canvas is passed in, worked out by `aboveEverything` from
    the designs' boxes, which the app measures. The app's `extractIntoComponent` keeps its name.
  - `instancesOf` takes any list of designs with a `container`, so the Params section passes the store's entries
    straight in, and the app's wrapper is gone.
  - Placement is one file: `freeSpotBeside` (duplicates and pasted designs) moved from `free-space.ts`, which keeps only
    `takenBounds` as it reads tldraw; `rightOfEverything` is the old `emptySpaceRight`; and `aboveEverything` is Make
    component's. A new design's layers (`newDesign`) moved with it, from `chrome/create.ts`.
  - The tests of `withLibraryContext` that sat in the app's `insert.test.ts` moved to core's `library-insert.test.ts`,
    beside it, since that's where it's been since `parity lib check` needed it. The app no longer re-exports it.
- **Reading, editing and matching tokens moved into `@parity-app/tokens`** (PAR-35), a pure package. My calls in
  starting it:
  - It holds reading compiled CSS for tokens and the categories (`tokens.ts`), reading DTCG files and resolvers
    (`dtcg.ts`), preview kinds and Copy as forms (`kinds.ts`), editing custom properties in a stylesheet's source with
    the rules for where a token's value goes (`stylesheet.ts`: `setCustomProperty`, and `writeTokenChanges`, which was
    `applyTokenChange` in the project service), and matching described tokens to custom properties (`matching.ts`, which
    was in the Tokens panel). Their tests moved with them, with the `extractTokens` and library-token tests that were in
    core's `render.test.ts` and `library-v3.test.ts`.
  - Tokens depends on core, and core still imports nothing. The types core's own contracts name stay in core, in
    `token-types.ts`: `TokenCategory`, which a guest's `tokenCategories` and libgen use, and `DescribedToken` with
    `TokenExtension`, which `ProjectConfig.describedTokens` holds. Everything else, `Token` included, is the package's.
    Moving those types out instead would have had core import tokens and tokens import core's CSS parser and
    `ThemeVariable`, a cycle.
  - `collectCustomProperties` stays in core's `css.ts`, as it walks the same parse as `prepareCanvasCss`; tokens calls
    it.
  - Core doesn't re-export the moved names, since it can't import the package; every importer imports from
    `@parity-app/tokens`. `TokenChange` moved from the app's protocol into the package with `writeTokenChanges`.
  - The Tailwind adapter (`@parity-app/styles-tailwind`) stays an adapter at the edge, as it loads Tailwind with Node.
    Libgen's token collecting (`libgen/src/tokens.ts`), which writes DTCG, and the editor's token edit history
    (`renderer/token-edits.ts`) stay where they are for now; the second moved with the history (PAR-34, below).
- **Drop rules and snapping are in `@parity-app/editor`** (PAR-33): `slotAt` and `flowOf`, where a dragged layer lands
  (`dropTargetAt`), moving it there (`moveLayersWithin`, `moveLayersAcross`), Paste here's `pasteHere`, and snapping a
  dragged design (`snapBox`). My calls in moving them:
  - The canvas passes measures in and applies what comes back. It keeps measuring frames (`DragLayouts`), finding the
    frame under the pointer, the pointer handling and the drop preview, `measureHere`, and moving an absolutely placed
    layer by its insets, whose rule (`shiftInsets`) stays with nudging in the app. For snapping it keeps reading
    tldraw's boxes, the View menu's preference, Ctrl to move freely and drawing the guides. You reopened the
    `shiftInsets` call on 2026-11-04: it's in `@parity-app/editor` now, with the rest of moving, resizing and nudging
    (PAR-577, below).
  - A frame's layouts' flows are read when the frame is measured, with the boxes, so `dropTargetAt` takes only data.
    Before, the flow of the layout found was read from its computed style at each pointer move. Showing a copy doesn't
    change a layout's display or direction, so drops land where they did.
  - The package's names are its own (`dropTargetAt`, `moveLayersWithin`, `moveLayersAcross`, `snapBox`), and the app
    keeps `moveTarget`, `moveLayers` and `snapPosition`. The app's `dropInFrame` measures and asks `dropTargetAt`.
  - The 8-pixel snapping distance moved with the maths, and the zoom is passed in.
  - **One `flowOf` for dropping, dragging and nudging** (PAR-205). My call: nudging's reading, which knew reversed rows,
    right to left and a grid's columns, and dropping's, which knew wrapping, became one in `drop-slot.ts` that reads all
    four (`direction`, `wraps`, `reversed`, `stride`). Nudging's own copy in the app is gone.
  - **A component dropped from the panel lands by `slotHere`, as Paste here and dropped files do** (PAR-205). The old
    one-line rule (`dropAt`, before the first child whose middle is past the pointer along the layout's direction) is
    gone, with its tests, since it put a drop on a grid's second row into the first. My call: in a layout that's
    absolutely placed as the board shows it, the component goes last, placed at the pointer, as a pasted layer and a
    dropped image do, rather than in a slot that layout doesn't draw by. `InsertAt` takes the place (`at`), and the drag
    shows the layout's outline with the slot's line, or a corner at the pointer, as a file drag does. A design's box is
    tldraw's `x`, `y`, `w` and `h`, so the canvas passes tldraw's boxes as they are and the lines are the same numbers
    as before.
  - Moving layers to another design copies them with the clipboard's `asShown`, which did the same as the drag's own
    copy of it, and goes through the store's `updateContainers`. When none of the layers is in their design any more it
    changes nothing, where before it added an empty undo step and selected nothing.
  - `pasteHere` and `slotHere` moved with `slotAt`, their tests with them. The Chrome tests of measuring
    (`drop-target.test.ts` and `paste-here-frame.test.ts`) stay in the app and call the package, and the rules gained
    tests from boxes.
- **The design store's history is `@parity-app/editor`'s too** (PAR-34, 2026-10-30): undo, what's unsaved and the save
  state. My calls in moving it:
  - The model is one value, `DesignHistory`: the documents, modes and token values, the steps to undo and redo, what the
    files hold, which writes are under way and why the last ones failed. Each function takes it and returns the next
    (`recordChange`, `undoChange`, `redoChange`, `reloadFile`, `writeStarted`, `writeSucceeded`, `writeFailed`), with
    the files a step changed for saving automatically. It's given the time rather than reading the clock, so tests can
    say when changes happen.
  - The app's `DesignStore` keeps its methods, so nothing that calls it changed. It holds the history, sends the writes
    the history describes (`fileWrite`) to the files and the stylesheet, runs the timers for saving automatically, logs
    a failed write, and indexes the designs and their libraries for the canvas.
  - The changes the store makes to designs and notes moved with it, as `design-changes.ts`, and so did `token-edits.ts`
    and `document-equality.ts`, which the history needs. `token-edits.ts` takes `TokenChange` and `Token` from
    `@parity-app/tokens` (PAR-35), so the editor package depends on it, and re-exports `TokenChange` for the history's
    callers.
  - A finished write updates what the files hold and the save state together, where the store did the second a microtask
    later. Listeners hear of it once, as before, and what it says is the same.
  - Cancelling a resize (`checkpoint` and `revertTo`, PAR-193) moved too. The steps are plain values now, so a
    checkpoint keeps the arrays of steps it saw and `revertTo` builds new ones: a step from before it is found by its
    `before` snapshot, which a change merging into it keeps, and goes back to the step as it was, time included. The
    store's `checkpoint(key, group)` and `revert(checkpoint)` are the same as before, and their tests stay in
    `design-store.test.ts`, against the store.
- **Lenses and adapters never go in core.** Lens models are schemas in `@parity-app/models`, each lens is a package, and
  so is each adapter, such as Drizzle or TanStack Router.

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
- **The editor and code viewing come before every other lens** (PAR-609). You decided this on 2026-11-05: "We need to
  improve the new user experience and editor experience before we begin taking in lens work. The editor and code viewing
  is the first and most important lens. Until that experience is great, it doesn't matter to add other lenses." So the
  lenses below wait, in their order, at Low priority in Linear, and PAR-17 to PAR-19, which read schemas and keep
  database keys, stay in Backlog.
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
- **`.par` keeps canvas objects, hand-drawn links and lens sources, and none of the models** (PAR-16). You approved this
  shape on 2026-11-05. All three keys are optional, so the format stays at version 3, and core's `document.ts` parses
  them with the rest of `.par`.
  - **`objects`** places a table, operation or route on the canvas: its `kind`, its `ref` and its `position`. The ref is
    the model's own key: `schema.table` for a table, the operation's id, or the route's URL pattern. Each is placed
    once. One whose model is gone stays in the file, shown as missing, until the person removes it.
  - **`links`** are typed, and each type joins set kinds: `shows` goes from a screen to a route, `calls` from a screen,
    route or component to an operation, and `reads` and `writes` from an operation to a table. A screen or component end
    is the design's id. Any other pairing is rejected when the file opens. Only links drawn by hand are saved; links
    from code or traces are read each time.
  - **`sources`** names the adapter or standard the `data`, `api` or `routes` lens reads, and is written only when the
    person switches from the one Parity picked.
  - **Save a copy** keeps every file's objects and links, each once, and the main file's sources.

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

- **Windows and Linux updates ship before publisher signing (PAR-160).** You asked for working updates without waiting
  for PAR-399, approved electron-updater, and signed off on the real download/restart toast stories in dark and light.
  Keep the update manifests, Mac ZIPs and blockmaps. The installed app uses its packaged release feed and verifies
  download checksums; unsigned builds do not authenticate a Windows publisher signature. Macs keep a manual download
  fallback until signing. Downloads run in the background, restart is explicit and handles unsaved work, and ordinary
  quit never installs an update. Get beta updates remains off by default. Update E2E runs only in CI.

- **Automatic update downloads are silent (PAR-498).** Show the restart-ready toast when finished; progress is reserved
  for explicit update checks.

- **Typography specimens use the quick brown fox sentence (PAR-499).** Approved after comparing real Storybook cards
  across sizes: The quick brown fox jumps over the lazy dog.

## Not done yet

Planned work, and what's waiting on you, is in Linear, as [work.md](work.md) says.

## Caller names are declared (PAR-450)

CLI attribution uses only `PARITY_AGENT_NAME`, falling back to Terminal. MCP attribution uses the initialize handshake's
title, then name, falling back to Agent. Both use the same whitespace and empty-name handling in
`packages/cli/src/caller.ts`. No environment fingerprinting or known-client name table: inherited configuration cannot
establish who's driving, and new harnesses should not require a Parity release. Display names are attribution, not
authenticated identity. Session ids continue to distinguish concurrent MCP callers.

## CLI and MCP share execute operations (PAR-451)

The two adapters call `executeOperation` in `packages/cli/src/execute.ts`. This module has no platform imports and owns
the canonical request, defaults, validation, result types and invocation of desktop RPC. It also supplies the MCP
discovery schema with the adapter's field names. Both adapters are in the CLI package, so no new package or dependency
is needed. Later operations can follow this boundary as they move; this is not a general command framework.

The CLI reads files/stdin and parses flags; MCP maps `input` to `code` and `description` to `label`. They keep their
output formats and signal failures in their own way (exit status or `isError`). Caller identity stays in the RPC
connection context, outside the operation payload. Both default the task label to "Edit designs". Requests with both a
snippet and retry id are rejected instead of silently ignoring one. The desktop retains snippet execution, atomic
application and failed-snippet storage; the operation layer does not duplicate those responsibilities.

Contract tests spawn both real entry points against a local HTTP RPC fixture, comparing outgoing operation requests and
checking discovery, defaults, retries, malformed inputs, successful results, failed execution and RPC errors.

## The remaining agent operations share contracts (PAR-452)

`packages/cli/src/operations.ts` extends PAR-451 to tabs, state, opening projects, screenshots, problems, accessibility,
console, tokens, components, props and local skill reading. Field definitions pair a discovery schema with their
validator and default, so both transports use the same rules. Shared operations own RPC method selection and failure
classification; adapters own CLI syntax, MCP field names and presentation. The module has no platform imports and adds
no dependency. The MCP adapter exposes token/component/prop reads that previously required CLI commands or snippets.

A screenshot failure or audit finding is a CLI failure and an MCP tool error with report details retained. Screenshot
scale defaults to 1, audits default to all states and shown modes, console clear and prop all default to false, and
one-item selector lists normalize to strings. Screenshot state and mode stay omitted to let the app choose the current
state and primary mode. CLI open resolves relative paths before the contract; MCP requires an absolute path. Skill
reading remains local, without RPC. Library generation/checking remain CLI-only workflows, with checking's snippet calls
routed through the shared execute operation.

Tests share one local RPC fixture and launch real CLI and MCP processes. Execute's contract tests remain alongside the
new operation tests. No Electron is needed; a read-only check in the running app covers real wiring too.

## Operations return structured results and coded errors (PAR-472)

Agents read what a call returned without parsing the prose written for people. Each shared operation in
`packages/cli/src/operations.ts` (and execute in `execute.ts`) now has an output schema, a canonical result built from
the app's reply, and the structured form of that result. CLI `--json`, on every command, prints the structured form; MCP
returns it as `structuredContent`, beside the same text and image blocks as before, and published each tool's
`outputSchema` in `tools/list` until PAR-510 took them out. My calls:

- **One error shape everywhere:** `{ code, message, retryable, path?, alternatives?, editId? }`. A call that fails
  before producing a result returns `{ error }`; an execute or screenshot that fails returns its whole report with
  `error` in it. The MCP output schema was the result or `{ error }` (`anyOf`), since clients validate structured
  content against it on errors too. CLI failures still exit with 1 and print the message on stderr; with `--json` the
  `{ error }` goes to stdout.
- **The codes are a closed list in core** (`packages/core/src/errors.ts`, exported alone as `@parity-app/core/errors` so
  the CLI doesn't load the rest of core): `invalid_input`, `not_running`, `not_answering`, `unknown_tab`,
  `tab_not_ready`, `unknown_design`, `unknown_node`, `ambiguous_reference`, `unknown_state`, `unknown_mode`,
  `unknown_viewport`, `unknown_component`, `unknown_icon_set`, `unknown_edit_id`, `conflict`, `execution_failed` and
  `app_error`. The app throws `CodedError` where it knows the cause (core's `findState`, the agent workspace's lookups,
  `execute`'s retry and conflict paths, the renderer's tab lookup); anything else is `app_error`, and a snippet that
  throws something uncoded is `execution_failed`.
- **`retryable` means the same request, unchanged, can succeed:** the app wasn't running or answering, a tab was still
  opening, or edits collided (`conflict`). A failed snippet isn't retryable as sent; its `editId` says how to retry it.
- **`path` points at the request,** as a JSON pointer in the transport's own field names (MCP execute's `/input` and
  `/description`, the CLI's `/code` and `/label`). An app error names its field, and it becomes a path only when the
  operation has that input: an unknown design inside a snippet has alternatives but no path.
- **Alternatives are bounded to 20,** those sharing text with the reference first, then the rest by edit distance (since
  PAR-473, so a typo such as `dashbord` names `dashboard`), ties in their own order. The messages are unchanged, so
  people and clients that read only text lose nothing.
- **Details cross processes as checked data.** The RPC reply keeps `error` as the message and adds `details`, so an
  older CLI still reads it; the CLI and the service check details with `readErrorDetails` and treat an unknown code as
  `app_error`. The window's channel carries them the same way, and the canvas page answers the preload script as data
  (`ServeAnswer`), because a thrown error crossing Electron's context bridge keeps only its message.
- **Large lists are bounded where agents filter them:** tokens default to the first 100 (`limit` up to 1000) and the
  console to the newest 50 (up to 1000), each with `total` and `truncated`, and the text says how to see the rest.
  Audits stay whole, since a gate needs every finding; the app state stays whole too, and its size is left to the
  bounded batch reads of PAR-479. `tabs` returns `{ tabs }`, since structured content is an object.
- **Text stays for people.** Readable reports keep their wording; data results (tabs, state, open) are compact JSON in
  MCP text, as the spec suggests for clients that don't read `structuredContent`, and pretty in the terminal. The skill
  read has no structured result: it's prose to read.
- **Screenshots don't offer an `editId`,** since the snippet behind them is Parity's own and an agent can't patch it.

Measured on `examples/shadcn-vite` (61 designs, 532 tokens) through MCP, bytes on the wire: a near-miss design id used
to need the failed screenshot (1,914), then `get_app_state` (60,707) to learn the ids without parsing prose, then the
retry: 3 calls, about 66 KB. Now the failure carries `alternatives`: 2 calls, about 8 KB. All tokens went from 28,574 to
18,469 (the first 100, with `truncated`), and the console from 15,524 to 23,121 with 50 of 91 entries kept (structured
data and text both). Small reads grew by their structured copy (props 449 to 1,149), and `tools/list` from 8,565 to
25,616 with the output schemas, once per session.

## Agents read where edits stand (PAR-481)

`parity status` and MCP `get_status` read, without changing anything, where a tab's edits stand: its revision, whether
anything applied isn't on disk (`dirty`), the unsaved files, the token values waiting for the stylesheet, how the last
save went and the writes that failed, how many steps undo and redo hold, and whether saving is automatic. `summary` adds
each unsaved file's designs added, changed and removed, changed modes and token values, and the undo and redo labels, up
to `limit` each (10 by default, at most 100). An agent couldn't tell before whether its changes, or the person's, were
saved at all. My calls:

- **The revision is the editor history's,** not a second history: `DesignHistory.revision` counts each change, undo,
  redo, revert or file reload that changes the documents, modes or token edits, in `restore`, the one place they all go
  through. Saving, view-only state such as the canvas's camera, zoom and drawn sizes, and presence leave it alone, so it
  doesn't depend on volatile canvas layout. A board moved or a state shown is a change to the file, so it counts.
- **Agents see it as an opaque string,** `<epoch>:<n>`, where the epoch is random per opened project, so a revision from
  before a tab was reopened never matches one after. It's equal only while nothing has changed; ordering and deltas
  since a revision are PAR-267's, which can read the counter after the colon. `get_app_state` now carries the same
  `revision`, so a later read can tell whether the board moved on since.
- **Applied, undoable and saved are kept apart.** `undo.count` is what's applied and can be taken back; `unsaved` and
  `dirty` are what isn't on disk; `save` is the history's save state; `errors` are the history's write failures. Each
  comes from `@parity-app/editor`'s `editStatus`, over the same history the canvas uses, so it can't disagree with the
  title bar or the tab's unsaved dot.
- **Save, undo and redo stay the person's.** The text says unsaved changes wait for the person to save, unless automatic
  saving is on. Exposing those as agent operations needs its own reviewed contract.
- **The status crosses as its own window request** (`agent.status`), so a snapshot doesn't carry the summary's diff, and
  the summary is computed only when asked for, comparing designs with `sameDesign`.

Measured on `examples/shadcn-vite` through MCP: telling whether anything changed meant reading `get_app_state` again
(73,398 bytes) and comparing, and whether it was saved couldn't be read at all. `get_status` is 558 bytes, or 747 with a
summary, and its revision says whether to read anything else. `tools/list` grows from 29,296 to 32,964 bytes.

## Agents discover modes in one read (PAR-473)

`parity modes [design]` and MCP `get_modes` are a shared operation over the snippet API's `GetModes(design?)`, which now
returns, beside `settings` (still what `SetModes` takes back), the project's `variables`, its `viewports`, each mode
resolved, and what each design's board shows. Discovering every viewport, theme and frame used to take `get_app_state`
and a snippet, and gave no window heights at all. My calls:

- **Two kinds of id, named apart.** `viewports` are viewport option ids, which `Responsive(node, viewport, patch)` and a
  node's `responsive` keys take; `modes` are combined mode ids, which screenshots, `find_problems`,
  `check_accessibility`, `Get(..., { mode })` and a design's main and beside modes take. The text and the schema
  descriptions say which is which.
- **Heights are the window a frame stands for,** from core's `frameViewport`: the option's own screen height, else the
  preset screen nearest its width (`screenHeightForWidth`). A frame still grows with its content; a design's fixed
  height for a viewport (`frames`) is reported as the frame's `height` beside its `window`, from `frameGeometry`, the
  same geometry every renderer uses (PAR-466).
- **Each mode is resolved,** with `values` naming every variable's option (including the ones a mode leaves to their
  first option), and the classes and attributes its theme and locale set, from `resolveModes`.
- **Every design's state, main mode and beside modes by default; frames only for a named design.** A board that shows
  every state lists them all in `states`. Unscoped, it's every design without frames (15.7 KB on a 61-design project);
  scoped, one design with its frames (3.3 KB). An unknown design is `unknown_design` with alternatives.
- **The logic is core's** (`packages/core/src/mode-report.ts`: `modesReport`, `designModes`), over `shownModes`,
  `resolveModes`, `frameViewport` and `frameGeometry`; the agent workspace finds the design; the desktop only reads its
  snapshot. Nothing is written and no presence event is sent, so the board doesn't change.
- **Alternatives rank by edit distance after shared text,** so `dashbord` names `dashboard` first in a 61-design
  project.

Measured on `examples/shadcn-vite` through MCP: discovering the modes and one design's frames took `get_app_state`
(73,346 bytes), a `GetModes` snippet (3,896) and a snippet reading the design (1,076), 3 calls and about 78 KB, still
without window heights or frame sizes. Now it's one `get_modes { design }` call of 3,255 bytes, and a mistyped design
comes back with it as the first alternative. `tools/list` grows from 25,616 to 29,296 bytes for the new tool.

## Core owns effective evaluation (PAR-484)

What a node shows, once every patch over it applies, is worked out in one place: `@parity-app/core`'s
`packages/core/src/effective.ts`, over the per-node step in `render.ts`. `resolveDesign` draws each node through that
step, and the board helpers (`nodeOnBoard`, `layerOnBoard`, `locateInner`) are thin wrappers over it, so the canvas, the
inspector, the agent's Get and the editor's rules can't disagree about a node. The audit at fa59f48 found each consumer
layering patches its own way, and none applying a viewport's responsive patch outside rendering. My calls:

- **The API takes an `EvalContext`:** `{ state?, variants?, viewport?, library? }`. A state left out is the base,
  variants left out are the ones the design's board shows (`view.variants`), a viewport left out applies no responsive
  patches, and a library left out expands no instances.
  - `scopeOf(container, context)` gives `{ layers, args }` for the design's own nodes.
  - `drawnNode(node, scope, viewport?)` is the per-node step:
    `applyPatch(node, nodePatch(layers, node, viewport), args)`, where `nodePatch` is the node's responsive patch under
    every layer's.
  - `effectiveNode(container, id, context)` is one layer as drawn, by its id or its path inside instances
    (`card/avatar/initials`); `locateEffective` gives it with where it was found.
  - `effectiveTree(container, id, context)` is a layer and everything inside it as drawn, down through instances, as
    `{ path, node, slot?, children }`. Hidden layers stay in, marked hidden. An instance's child is its component's
    root, at `instance/rootId`, which the canvas draws under the instance's id.
- **The order, later winning:** the node's own values, then the params it binds (args), then its responsive patch, then
  the variant options in param order, then the state. A patch's text, props and visibility win over a bound value.
  Inside an instance: the component's variant options, then its state, then the instance's overrides, then the outer
  layers' `instance/inner` patches. Args on a board are each param's default, then the variant options shown; inside an
  instance, the component's defaults, then the instance's args, then props patched over the instance (a responsive patch
  included), then the variant options they pick.
- **`editNode` keeps its own subset of layers,** since a state's or variant's patch is kept against the node as it shows
  without that patch.
- **A design that places itself is expanded as `resolveDesign` draws it:** an instance stops only when its component is
  already being expanded by an instance around it, and the evaluated design isn't counted. So a design placing itself
  shows one copy, whose own copy stops, directly or through another design. `locateInner` refused the evaluated design
  outright before, and compared instance node ids with design ids, so it found less than the canvas draws.
- **The shared fixture is `@parity-app/core/fixtures`** (`effectiveFixture`): a bound text with a param default, a
  variant that turns its parent into a row, a state over a value that variant sets, responsive patches, and a nested
  instance with args and overrides, in two viewports. `effective.test.ts` checks `effectiveTree` against `resolveDesign`
  for each case and viewport; later work on the agent's Get and the editor's rules reuses it.

## Editor operations read what the board shows (PAR-464)

Align, Wrap, resizing, nudging, dragging, Copy, Copy style, Paste style, the pastes and Select matching used to read a
layer through `nodeInState`, with the state and at most the variants, so a variant that turned a layout into a row was
still a column to Align, which wrote `self: end` into the variant where the board needed `justify: end` on the layout,
and Copy took a bound text's raw value. They now read through core's evaluation (PAR-484), by `@parity-app/editor`'s
`shownNode` and `boardReader`, which build the `EvalContext` from what the editor knows: the state being edited, the
variant options the board shows, the params' values, and the viewport of the frame the layer was picked in. My calls:

- **Only reads change.** Each operation writes where it did, through `editNode`'s target, which keeps its own subset of
  layers.
- **The viewport is the frame's, when one is known.** The canvas commands pass the viewport of the mode the selection
  was picked in (`frameViewport`); with no frame, as from Layers, none applies. The inspector, the text editor and Hide
  stay on the board without a viewport, since their edits change the design or a state, not a viewport's patch.
- **A copied binding goes only where its param is.** Copy materialises what a layer shows: a bound text, prop or
  visibility takes the value the board shows, and the binding stays on the copy. The destination isn't known at copy
  time, since a copy can paste anywhere, into another project included, so the paste decides (`fitBindings`): in a
  design with a param of the same name, the binding is kept and the layer follows that param there; elsewhere it's
  dropped, leaving the value shown. A new screen from pasted layers has no params, so it keeps none. Dragging layers to
  another design does the same. A param of the same name with a different type still keeps the binding; the name is the
  contract.

## Conditional values stay out of the default theme (PAR-485)

`collectCustomProperties` in core's `css.ts` now gives each declaration the at-rules it sits under, outermost first, as
`atRules: { name, prelude }[]` (`{ name: "media", prelude: "(prefers-color-scheme: dark)" }`), beside its innermost
selector. It used to keep only the selector, so a `:root` inside `@media (prefers-color-scheme: dark)` read as the root,
and its dark values replaced the light defaults, as `mantine` showed.

My calls in the run-time reading (`extractTokens`):

- Only `@layer` and `@supports` leave a value in the theme its selector names: a layer orders rules and a feature check
  holds whatever the theme, so neither picks one. Any other at-rule (`@media`, `@container`, `@scope`…) makes a value
  conditional, and it belongs to no theme.
- A `prefers-color-scheme: dark` block isn't read as the dark theme. A theme reaches a frame by a class the Modes panel
  adds, and `previewToken` and `writeTokenChanges` write a theme's values to that class's block, so a "dark" read from a
  media query couldn't be shown in a frame or edited where it lives. Reading it as a theme is the gap `docs/support.md`
  already lists; the facts it needs are now in the collected declarations. PAR-138, at the end, closed it.
- `themeFallbackCss` still counts a property declared anywhere as defined, conditional or not, as before.
- Libgen's own token collecting (`libgen/src/tokens.ts`), which reads `prefers-color-scheme: dark` blocks as dark, is
  unchanged. Sharing one policy between the two is PAR-468.

## Token policies live in `@parity-app/tokens` (PAR-468)

Libgen, reading a library's source CSS, and the app, reading a project's compiled CSS, had their own rules for which
theme a custom property's value belongs to and which category a token goes in, and they'd drifted: `--fontSizeBase300`
was a font size to libgen and Other to the app, and `[data-theme="dark"]` was dark to libgen and dropped by the app.
Both now use `policy.ts` in `@parity-app/tokens`, which libgen depends on (tokens depends only on core, so there's no
cycle), and libgen reads CSS with core's `collectCustomProperties` instead of its own parser:

- `themeOfSelector(selector, atRules, options)` names a rule's theme. The root (`:root`, `:host`, `html`,
  `:where(:root)`) is `default`; a class or attribute value, alone or on the root, names a theme (`.dark`,
  `[data-theme="dark"]`, `html.dark`, `:host([data-theme='dark'])` are all `dark`); `light` is the default, as Parity's
  Light mode is the frame with no theme; `:not(…)` is ignored. A selector with a combinator, two names, another
  attribute operator or pseudo-class, or any at-rule but `@layer` and `@supports` names none. These are documented as
  unsupported rather than guessed at.
- `themedProperties(declarations, options)` gathers values by theme, keeping a class or attribute as a theme only when
  it overrides something the root defines, which keeps a component's `.card { --card-pad }` out.
- `categorize(name, value)` is the union of the two: libgen's word-based reading (`fontSizeBase300`,
  `spacingHorizontalM`, `--app-gap`), the app's `effect` category (blur, perspective, aspect) and `currentcolor`, and
  neither's mistakes: a bare `--text` or `--text-color` isn't a font size. `isTokenName` hides `tw-`, `default-` and
  per-token modifiers for both.
- `writeTokenChanges` and `previewToken` find a theme's blocks with `themeOfSelector` too, so a theme read from
  `[data-theme="dark"]` is previewed and written there, a value it lacks is added to its block, and a `:root` inside a
  media query is never edited as the default. A frame showing an attribute theme came later, in PAR-22 below.

The differences that stay are explicit options, both for libgen: `tailwindTheme` reads `@theme` as the default, which
only source CSS has (the app takes Tailwind's resolved theme from its styles adapter), and `colorScheme` reads a
`prefers-color-scheme` block as its theme, because a library's themes reach frames as the class blocks
`describedTokenCss` writes, where the app's would never show (PAR-485; PAR-138, at the end, made it the app's too). With
it, a theme's own selector beats the media query wherever it sits, so a library with both `.dark` and a dark media query
no longer has whichever comes last. The app's derived spacing steps (`spacing-4`) stay the app's, as libgen writes only
what the CSS declares.

The detection snapshots changed with it: `chakra`'s `--app-gap` is spacing, `mantine`'s `--app-radius` a radius, and
`vite7-js` has its `[data-theme="dark"]` theme.

## Token value checks live in `@parity-app/tokens` (PAR-569)

My calls: what a token edit may write is decided in `packages/tokens/src/checks.ts`, not in the token detail, so the
agent's `SetTokens` can refuse what the detail refuses (PAR-584).

- `checkTokenEdit` takes the token, its values, the drafts and how to read other tokens in a theme, and gives each
  theme's problem, whether all pass, and the smallest changes: the themes whose trimmed value differs. A loop is checked
  before the value's kind, as before.
- The browser's `CSS.supports` is passed in as `supports`, so the package runs without a DOM and its tests use a
  stand-in. What a reference comes to is passed in too, since the app's `comesTo` measures a spacing step's pixels in
  the browser.
- `builtOn` gives the tokens a token is built on in a theme, a scale step's base first, which the panel had written
  inline.

## A mode's theme class also sets the theme's attribute (PAR-22)

My call: a frame whose mode adds a theme's class also gets the attribute the project's stylesheet switches that theme on
with. vite7-js's `[data-theme="dark"]` was read as `dark`, but the default Dark option adds only the `dark` class, so
its frames stayed light unless someone edited the option in Modes. The alternatives were to write `data-theme` into each
project's mode settings when it opens, which changes a file the person didn't touch and goes stale when the stylesheet
does, or to rewrite the stylesheet's attribute selectors as classes, which the preview and the save would then have to
undo. Reading the stylesheet each time a guest loads keeps both as they are.

- `themeAttributes` in `packages/tokens/src/policy.ts` lists, by theme, the attributes whose value names it, from the
  rules `themedProperties` reads as themes and no condition holds: `[data-theme='dark']` gives
  `dark: { "data-theme": "dark" }`. `light` is the default and needs none.
- `frameAttributes` adds them for each class the mode has, then the mode's own attributes, which win, so an option that
  sets `data-theme` itself keeps its value.
- An attribute on the root (`:root[data-theme="dark"]`, `:host([data-theme="dark"])`) isn't listed. Frames get it on
  their body, and the root is the frame's shadow host, which the mode's attributes don't reach; that's still in
  `docs/support.md`.

## Agent calls merge per design (PAR-278)

My call: an agent's call applies the designs it changed, not the files they're in. It reads a snapshot, runs for as long
as its renders take, and in that time the person can edit, or another agent can apply its own call. Replacing whole
files reverted their edits to other designs in the same file, brought back designs they had deleted and dropped ones
they had added, with nothing said; undo could restore it, but only if someone noticed.

- **A call sends one change per design** it changed, created or deleted: its file, its id, the design as the snapshot
  had it (`base`, null for a new one) and as the call left it (`after`, null for a deleted one). Modes it set go as
  `base` and `after` too; token values were already per token. The types are `DesignChange`, `ModesChange` and
  `ChangeConflict` in `@parity-app/core`.
- **The editor applies them only over what the call saw.** Each design it changes must still equal its `base`, compared
  as files compare them (`sameDesign`, views tidied), or already equal its `after`. Designs the call didn't touch stay
  as they are now. Any mismatch, including a design deleted or one added under a new design's id, refuses the whole
  call: nothing changes, and the call fails naming each design and its file, with an `editId` to run it again from the
  new state. Partial applies were ruled out, since a snippet's changes often depend on each other.
- **An accepted call is still one undo step,** its designs, modes and tokens together. Undo restores the state just
  before it, keeping edits made during the call.
- **No lock is needed** for agents working on different designs. Two changing the same design conflict, and the second
  reruns.

Code: the workspace's `designChanges` in `packages/agent/src/workspace.ts` makes the changes, and `execute` applies them
through the `apply` hook, failing with `describeConflicts` when refused. `mergeAgentChanges` in
`packages/editor/src/design-changes.ts` merges them. The renderer's `agent.apply` (`renderer/agent/handlers.ts`, through
`DesignStore.applyAgentChanges`) answers with the conflicts. Window IPC isn't schema-checked; the agent checks each file
it changed with `parseCanvasDocument` before sending, as before.

## Project discovery decides where an app's sources and styles are (PAR-467)

Detection and `parity lib`'s app mode read one set of rules, so an app's `.lib.par` describes what the canvas loads.
Which files hold the app's components is `readTsconfig` and `appFiles` in `@parity-app/code`: the root config and every
config it references, of any name, with tests, stories and build output left out, and every file under the root when no
config includes any. Which stylesheets are global is `findStyles` in `@parity-app/project`: `components.json`, else what
the HTML entry's module imports (side-effect or default imports, CSS or Sass, not CSS modules), else the conventional
places, Next's `globals.css` among them. `readStylesheet` there inlines relative `@import`s, for libgen's tokens and for
telling whether a library's stylesheet is imported. Libgen reads only `.tsx` and `.jsx` of those files, since its type
checker looks for JSX components. A package library keeps its own inputs: the package's type entry and the stylesheet
its `style` field or `exports` name, read with the same `readStylesheet`.

## Board layout lives in core (PAR-488)

How the canvas lays a board out is `boardLayout` in `packages/core/src/board.ts`: the board's border and padding, the
gap between frames, the divider before the first companion, the mode caption and the divider between state rows, with
`companionScale` (companions at most 640 wide) beside it. `ContainerView` draws with those numbers as inline styles
rather than Tailwind spacing classes, and the agent's estimate for a board the canvas hasn't drawn, `boardSize`, adds
them up from each shown mode's `frameSize`, so the two can't drift. A drawn board's measured bounds still win, and an
estimate stays flagged `estimated`. A frame that grows with its content is estimated as tall as its window
(`frameViewport`), since its content isn't known until it's drawn; the fixed 1000 it replaced knew nothing of the frame
either. The title above the board isn't part of its size, as `Overlaps()` already adds its band.

## The agent's Get reads a state as the board draws it (PAR-463)

`Get(path, { state })` and `Get(path, visit, { state })` used a private `applyState` in the agent's workspace, which
applied only the state's own patches, so a bound text read as its stored value while the board drew the param's default,
and variant options, responsive patches and patches reaching inside instances were missing. Those reads now go through
core's evaluation (see PAR-484): `locateEffective` finds the layer and its scope, and `drawnNode` draws what's inside
it, so the agent can't disagree with the canvas about a node. My calls:

- **`state` or `mode` asks for the board's view; neither reads the stored nodes,** unchanged, since edits are made
  against those. Get takes `mode` as Screenshot and Measure do: a state alone is read in the design's main mode, and a
  mode alone in the state the design shows. The context is the design's board: the variant options `view.variants`
  shows, its params' defaults, and every component design in the project.
- **Bound values are filled in and `bind` stays.** The result is what's shown, so a bound text has the param's value;
  the binding stays so the agent can tell the text comes from a param and edit the param rather than the text.
- **An instance reads as its own node, its args patched,** as the stored read has it; what's inside it is read by its
  path, `design/instance/inner` (`profile/person/title`), which a stored read doesn't take. A visit in a state walks the
  same layers, not into instances; started inside one, it passes each layer's `instance/inner` path. Not using
  `effectiveTree` keeps a read's cost to the layers it returns: that expands every instance under the layer, which a
  deeply nested component made slower than a snippet's 5 seconds, only for Get to drop it.

`packages/agent/src/workspace.test.ts` runs each case and viewport of `effectiveFixture` through Get, reading every
layer by its path, and compares what the canvas would draw of them with `resolveDesign`'s tree.

## Frame bitmaps are kept in app data, named by code and job (PAR-158)

Frame bitmaps were kept only in the window's memory, so every session captured each frame again, one at a time, before
zoomed-out frames could sleep. They're now kept on disk too (see editor.md, Bitmaps kept between sessions). My calls:

- **App data, not the project.** Parity ships as an installer, so `node_modules/.cache` isn't ours to fill, and a
  project's folder is the person's. They go in `<userData>/bitmaps`, which main gives the service as
  `PARITY_BITMAP_DIR`; without it, as in tests, nothing is kept.
- **Named by what's shown, not by when.** The window's in-memory keys hold a guest id and address that are new each
  session, so the disk name is a hash of the code's fingerprint and the render job less its address. The fingerprint is
  file paths, sizes and modification times rather than contents, which is fast (35 ms on the example) and errs toward a
  miss: a file only touched costs a capture, never a stale bitmap. It's taken per guest address when first served, as
  the guest has no HMR and draws the code its address first served. The guest module's hash and a format number are in
  it, so a new Parity doesn't show an old one's bitmaps.
- **The service holds the store,** since it already runs the captures and knows each project's fingerprint: the window
  passes the job and gets a PNG or none, as with a capture.
- **Limits: 200 MB, trimmed to 180, and 30 days unused for a whole project.** At about 10 KB a bitmap that's some 20,000
  frames, more than anyone's recent projects. Use is recorded by touching the file's modification time when it's shown,
  so no index has to be kept in step. A Clear bitmap cache item covers the rest.

## Agents' calls go to the copy that has their project open (PAR-514)

Several copies of Parity can run at once: the person's app, a session's `pnpm dev`, `pnpm perf`. One file named one
copy, so whichever copy held it, agents couldn't reach the projects open in the others. PAR-280 kept the file with the
first copy, which fixed a dev copy taking the person's agents but left the second copy's projects out of reach. Agents
care about the project, not the copy, so the copy is now chosen per call. My calls:

- **Every copy registers itself.** Each writes an entry to `~/.parity/agents/<main process id>.json`: its address,
  token, main process and when it started. A service the dev runner restarts writes the same entry, since main gives it
  `PARITY_APP_PID`. Main removes the entry as the copy quits, because quitting ends the service before it could. The CLI
  removes an entry whose copy doesn't answer and whose process is gone. There's no owner to hand over, so PAR-280's
  take-over rules and `PARITY_AGENT_TAKE_OVER` are gone.
- **The registry says how to reach a copy, not what it has open.** The CLI asks each copy (`copy`) for its tabs and when
  its window last had focus, every call. A list kept in the file would go stale as tabs open and close; the question is
  one local request per running copy.
- **One module decides.** `@parity-app/agent`'s [routing.ts](../packages/agent/src/routing.ts) holds every rule, as data
  in and out, with no files or network: how folders compare, how a reference matches a tab (which the app's own
  `findTab` uses too), which project holds a folder, and where a call goes.
  [registry.ts](../packages/agent/src/registry.ts) holds where entries live and their format, for both the app and the
  CLI.
- **The CLI decides once, and sends the tab it chose.** The app gets an exact tab id, never "the active tab" or a name
  to look up again, so it can't reach a different answer than the CLI did.
- **A call names its project, or the folder does.** `--tab` takes an id, folder or name, as before. Without it, a call
  goes to the open project the agent's working folder is in, so an agent working in a repository edits that project even
  while the person looks at another; outside any open project, it goes to `active`.
- **`active` is what the person is looking at:** the active tab of the copy whose window had focus last. "Last" rather
  than "now", because while the person types to an agent in a terminal no Parity window has focus. It's for when the
  person says "this" or "what I've selected"; `get_app_state` gives the selection.
- **A project open in two copies goes to the one running longest.** Either would do, but a copy a session starts while
  the person works is usually the newer one, and it may be running unfinished code. A newly launched window takes focus,
  so focus would favour it instead.
- **Opening a project goes to a copy that has it, else to the one used last.**
- **Each operation's routing follows from its fields.** One with a `tab` field goes to the copy that has the tab, one
  with a `root` opens, and one with neither (`tabs`) asks every copy, listing each project once with `active` marked
  only where `--tab active` points. A test lists each operation's routing, so a new one is a deliberate choice.
- **A copy kept apart is still kept apart.** `PARITY_AGENT_FILE` names one file instead of the registry, as `pnpm perf`,
  the end-to-end tests and the backtest set: that copy writes only that file, and a CLI given the same file reaches only
  it.
- **Older apps and CLIs.** The CLI also reads `~/.parity/agent.json`, which apps from before the registry write, and
  asks such an app for its tabs when it doesn't know `copy`. An entry with a newer format than the CLI knows stops the
  call with a message to update the CLI, rather than being guessed at. A CLI from before the registry doesn't find a new
  app; the CLI is before 1.0, and `npx @parity-app/cli` fetches the current one.

## A hidden tab's frames sleep, rather than unmount (PAR-153)

A tab that isn't showing stays mounted, so switching back is instant and agents can read it. It now lets go of its
frames' designs through PAR-197's sleep, rather than unmounting them, which was tried and backed out on 2026-10-29: all
119 frames remounting on the way back kept the page busy for 4 s, and boards changed size. My calls:

- **Sleep, not a second mechanism.** A hidden tab makes every drawn board dormant (`boardDormant`), the selected one
  too, so its frames show their bitmaps and drop their React roots and elements. Shown again, only frames near the view
  wake, one each animation frame, and the rest keep their bitmaps until they come near, as after zooming out.
- **3 seconds hidden first.** Flipping through tabs would otherwise take every frame apart and draw it again each time.
- **Heights from the browser.** A frame put to sleep while nothing is laid out doesn't record a height of 0; it keeps
  the size it last had when drawn (`contain-intrinsic-size: auto`). A board never drawn, in a tab restored behind
  another, has no size to keep, so it doesn't sleep until it's been shown.
- **Measured with every board woken.** `pnpm perf` visits each board at 100% before hiding the tab: zoomed out, frames
  already sleep, and hiding would show no difference. On the example, the hidden tab's DOM nodes fell 76% (33,283 to
  7,898) and its heap 14% (139 to 120 MB).

## Undo is one step per gesture (PAR-441)

The history used to merge a group's changes that came less than a second apart, so a slow drag, or a resize in a
development build, took several undos, and two quick edits of one field took one. Now a gesture says where it begins and
ends, and time plays no part (see editor.md, One undo step per gesture). My calls:

- **A gesture is an id, and its changes carry it.** The source begins one (`DesignStore.beginGesture`), passes it with
  each change (the `gesture` option), and ends it (`endGesture`). Its changes join one step while that step is the
  latest; there's no open transaction that other changes fall into, so an agent's call or a reloaded file made
  mid-gesture is a step of its own, and the gesture's changes after it make a second step. That's rare, and keeping the
  agent's work out of the gesture's undo matters more.
- **A run of arrow presses ends at anything else,** not at key release: another edit, an undo or a redo, or selecting
  something else, also when the selection comes back to what it was. So tapping an arrow five times is one step, as
  holding it is, and a pause in between doesn't split it. A field's run of Up and Down ends when something is typed,
  Enter or Escape is pressed, the field is left or its label is scrubbed. Nudges are the run people repeat most, and
  undoing them one press at a time was what the one-second window was there to avoid.
- **A gesture that changes nothing leaves no step,** also one that ends where it began, such as a drag back to its start
  or a nudge there and back. The file is clean again and Undo goes to the step before.
- **Every gesture source uses it,** even those that write once: a layer drag in a layout writes on release, and a scrub
  on release, both in their gesture. An absolutely placed layer's drag writes as it moves (PAR-174), so its gesture is
  what makes it one step. A design or note dragged by its board is tldraw's translate, which is one gesture from its
  first move until tldraw leaves translating; dragged by its title it writes once on release, as before.
- **Other edits are a step each.** Typing in a field commits on Enter or on leaving it, so it was already one commit.
  Two quick edits of one field, such as clicking two of Text's Resizing modes, are two steps, where the window made them
  one.

## Component previews are made offscreen and kept with the frame bitmaps (PAR-207)

Each component now has a picture of what inserting it would place, made in the offscreen window and kept on disk (see
editor.md, Component previews, made offscreen and kept on disk). The design is the Previews section above and
[proposals/previews.md](proposals/previews.md). My calls in building it:

- **Keyed by the code as its address first served it, not by what's on disk now.** The guest has no HMR, so the
  offscreen window draws a project's code as its address first served it; a key from today's files would name a picture
  of older code as new. PAR-158's fingerprint is now `codeSnapshot`, which also keeps each file's size and time, and a
  preview's key hashes those of the files it depends on. An edit is pictured once the guest loads again at a new
  address, as the canvas shows it, and then only the components importing what changed are drawn again. The imports
  themselves are read from the files as they are when first asked, which errs toward reading a file more.
- **"The compiled CSS" is the stylesheets and what they import, not Tailwind's output.** Tailwind compiles a rule for
  every class anywhere in the project, so hashing its output would make each new class anywhere re-make every picture,
  against "a file change re-makes only what imports it". A component's own classes are in its own files, which are in
  its key, and a stylesheet or a saved token changes every key, as the proposal asks. The theme in the job is in the key
  too.
- **Packages are their lockfiles.** A library's components, and the packages a project's components import, are covered
  by the lockfiles and the root's package.json, tsconfigs and tool configs, which every key includes, rather than by
  following imports into `node_modules`.
- **In the bitmap store, under its limits, not a cache of its own.** Previews go in a `previews` folder inside the
  project's folder in `<userData>/bitmaps`, so PAR-158's 200 MB and 30 days, its sweep and Clear bitmap cache cover
  them. The proposal's 50 MB a project isn't added: 555 previews came to 3.1 MB on the example.
- **The pictures say whether they're made; the index only says what came before.** A preview is made when both its files
  are there for its key, so code changed back finds its old pictures. `index.json` keeps each component's latest key,
  for the dimmed picture while it's made again, and a draw's error, so a component that fails isn't drawn again on every
  open. A draw that didn't finish isn't kept.
- **One queue in main, ordered by who it's for.** Canvas bitmaps and agents' renders go before previews of rows on
  screen, and those before the idle pass; a job running is never stopped. The window adds its own gate on top: none
  until its tab is shown, its canvas is up and no frame waits for a bitmap, and the idle pass only after 2 seconds of
  nothing.
- **Shown in the Components panel's hints until PAR-208.** The List and Grid views, the card and the picker are PAR-208;
  until then a component row's hint shows its large picture, which is enough to see them and lets a row on screen ask
  for its picture first. PAR-515 replaced the hint with the card.

## MCP's tool list leaves out output schemas (PAR-510)

`tools/list` grew from 8.6 KB to 33 KB once every tool published an `outputSchema` (PAR-472) and `get_modes` and
`get_status` arrived. Output schemas were 22 KB of it, the same 618-byte failure branch repeated in 13 of them. My
calls, which you agreed on 2026-11-04:

- **Tools publish no `outputSchema`; `structuredContent` stays.** The MCP spec allows structured content without a
  schema. The schemas stay in the contracts (`@parity-app/agent/contracts` since PAR-590), where the CLI checks the
  app's answers with them. The list is 11.7 KB.
- **Why it was safe to drop.** Claude Code never shows an output schema to the model: Anthropic's tool definitions have
  no field for one, and Claude Code defers MCP tools, so a session starts with their names and the server's instructions
  and loads a tool's description and input schema when it's needed. Codex renders output schemas into the model's
  context as TypeScript in its code mode, so there they cost context on every session. No client needed them to call the
  tools.
- **The input schemas come from zod since PAR-590, and nothing a client relies on changed.** A snapshot of the list
  before and after has the same fields, types, defaults, bounds and `pattern: "\\S"`. A selector (`state`, `mode`) is
  `anyOf` its two branches rather than `oneOf`, which more clients take. Execute's text fields gain `pattern: "\\S"`, as
  the other tools' have, and it refuses unknown fields with `additionalProperties: false`. The list went from 12,089
  bytes to 12,083.
- **A test holds the list to 12 KiB** (`operations.test.ts`, "keeps the MCP tool list within its budget"). Raise it when
  a tool earns it, not to make room for longer schemas or descriptions.
- **Codex shows the model only `structuredContent` when a result has it,** dropping the text and images beside it, so
  Codex users see no screenshots. That is PAR-528.

## Opening a project in seconds (PAR-179)

Reopening the example project took 5.7 seconds to a usable canvas and 6.6 to its previews when started again, and 19
seconds to its previews reopened in the same window (see editor.md, Opening in seconds, for where the time went). My
calls:

- **Opening is timed by `pnpm perf`, three ways:** a first launch on a fresh profile, a reopen in the same window, and a
  start on the same profile. Usable means every frame shows its design or its bitmap, and previews every frame has its
  bitmap. Launches count from the page starting to load, so they leave out Electron's own start, about 0.1 seconds, and
  are development builds, so they include loading the UI from Vite's server and React's development build. The type
  checker's results are kept with the profile (`PARITY_CACHE_DIR`), so a first launch finds none and the person's own
  cache is left alone.
- **A frame that would only show its bitmap waits for it rather than drawing first.** Zoomed far out, a frame not drawn
  yet holds off until its kept bitmap is read, and sleeps on it if there is one. Drawing first and sleeping later was
  correct but cost every open about 2 seconds of drawing that nobody saw, and held up the replies the kept bitmaps came
  in. A frame with none still draws at once, so the first launch behaves as before.
- **A kept bitmap carries its frame's height, as the canvas drew it, inside the PNG.** A frame that never drew has no
  height of its own, and its board's size is read by agents and laid out around. A text chunk keeps one file per bitmap,
  which the cache's sweeping and partial-file handling already assume, where a file beside it would need both kept in
  step. Working the height out from the image's size was a few pixels out, from rounding at a quarter of the size, and
  the offscreen window's own measure was too, by up to 66 pixels on a tall board, since text lays out differently at
  that zoom. So the window measures its drawn frame when it asks for the capture, and the offscreen measure is kept only
  for a frame it hasn't drawn. Bitmaps kept before this have no height and aren't shown; they age out with the cache.
- **Kept bitmaps are named by where the components a frame draws come from,** not by the components the job gave the
  guest. The first session after a change to the code runs the type checker, which gives the guest the components it
  finds, and the next session's guest is served them from the start, so naming by the job made every frame miss once
  more after each change. Only the components the frame's tree draws count, so one the checker dropped doesn't change
  the name of frames that don't use it. The format number went up to 2.
- **The service opens the projects it last had open as it starts,** from a list it keeps in app data, rather than main
  reading the window's saved tabs or the window telling main its tabs. The service already knows which projects are
  open, and the window's tabs are those projects in practice; one the window doesn't ask for within a minute is closed,
  so a list that disagrees costs a builder for a minute at most. It takes the project's open off the window's critical
  path, about half a second here.
- **tldraw's pattern fill is left out of its arrow, drawing and geo shapes,** by giving tldraw subclasses whose canvas
  defs are empty. Its textures go up to the farthest zoom in over the farthest out, which Parity's 1% to 800% makes
  1,024 times, and painting them took about a second of the window's thread each time a canvas mounted. Parity draws
  none of those shapes; if one ever came onto the canvas, as by pasting from tldraw, its pattern fill would show as no
  fill. Narrowing the zoom range or replacing tldraw's canvas would have changed what people see.
- **The canvas fits the project as its boards are placed,** before they've sized themselves, then again once they have,
  so frames start at the zoom they're shown at. A fit that would start nearer than before is undone, since unsized
  boards are small and a small project would flash zoomed in.
- **Started again, the 3-second target isn't met in a development build** (3.2 to 3.3 seconds), and wasn't measured in
  an installed one, which loads its UI from files and runs React's production build, the two largest parts left. What's
  left on the service's side is Vite starting in the builder's process, which needs discovery's results; running
  discovery while the tools are found was tried and gained nothing, as both work on the service's one thread. Caching
  discovery, or starting the canvas before the guest loads, would go further, and each is a change of its own.

## The selection overlay measures when what it shows can change (PAR-522)

While anything was selected, the overlay measured every animation frame, each time searching the canvas for the design's
frames several times over, which the 2026-11-04 speed audit found the most expensive work in every interaction's profile
(see editor.md, The overlay measures only when what it shows can change). My calls:

- **Frames are indexed where `ModeView` mounts them,** in a layout effect around the host element, rather than by a
  MutationObserver over the canvas or in `FrameTile`. The host is `ModeView`'s, every frame on the canvas is one, and a
  MutationObserver would wake on every change anywhere in the canvas to find the few that matter. `findFrames` reads the
  index, so agents' presence, Reveal, the style preview and the tab order overlay use it too. Something that draws its
  own `data-frame` host, as a story or a test does, registers it (`registerFrame`).
- **Measuring wakes on changes, then settles for half a second.** The selection, hover, tool and preferences; the design
  store; tldraw's store, which holds the camera and the boards; pointer, wheel and key input, which drive drags,
  snapping, resizing and Alt's redlines; the canvas area or a frame changing size; DOM, attribute or text changes and
  images loading inside a frame drawn over; and fonts loading. After each, it measures every animation frame for 500 ms
  (`settleMs`), which covers what follows a change by a frame or two, as a design drawing after an edit does, and a
  transition a change starts.
- **Animations are followed while they run, found by the browser rather than by a timer.** Once settled, the overlay
  asks the frames it draws over for their running animations and transitions (`getAnimations` on each frame's shadow
  root) and keeps measuring every frame while there are any, and only then. A component animated by script writes styles
  or DOM as it goes, which the frame's MutationObserver catches. So a spinner anywhere in a selected design keeps the
  overlay measuring, as before this change; a design that doesn't animate costs nothing while it's still. Measuring for
  a short while after each change, without asking, would have dropped an outline behind a long animation.
- **Only frames drawn over wake it:** the selected and hovered designs', or every frame's while the layout grid shows. A
  design animating elsewhere on the canvas doesn't keep the overlay measuring.
- **What it doesn't see** is layout that moves with no input, DOM change, resize, image or font load or animation it
  hears of, such as a video in a frame taking its size once its data arrives. The outline catches up at the next change,
  such as the pointer moving.

## The selection overlay follows the camera in the frame it moves (PAR-653)

With a layer hovered or selected, zooming dropped the window to a few frames a second, and outlines and redlines trailed
the zoom until it stopped (see editor.md, Outlines follow the camera in the frame it moves). The camera and the wheel no
longer wake the measuring PAR-522 set up; the overlay follows the camera on its own. My calls:

- **Measured once in each frame the camera moves, once that frame is laid out.** A reaction to tldraw's camera changes
  the width of a hidden element in the overlay, and a ResizeObserver on it measures and commits with `flushSync`.
  ResizeObserver callbacks run after every animation frame callback and the frame's layout, and before it's painted, so
  the boxes read are the ones about to be painted, and reading them lays nothing out. Before, the overlay measured in an
  animation frame of its own. Whether that ran before or after tldraw's decided whether outlines were drawn from the old
  camera or the new one, its reads laid the page out mid-frame, and React drew the result after the frame was painted.
- **Not in a microtask after tldraw's frame.** Tried second: outlines landed, but frames came 25 to 33% slower while
  hovering, since animation frame callbacks after tldraw's wrote to the page again after the overlay had laid it out.
- **Not kept in page units.** Measuring once and placing boxes from the camera would avoid measuring during a zoom, and
  was tried first: outlines were still off by up to 18 px, since a board's gutter is in screen pixels (PAR-602), so a
  frame's place in the page changes with the zoom.
- **A change to tldraw's store that only moves the view doesn't wake per-frame measuring:** the camera, the pointer, or
  the instance's `cameraState` alone (`movesOnlyTheView`). Nor does the wheel. Anything else in the store, such as a
  board moving or resizing once the camera stops, still does.
- **The element inspector's overlay (PAR-167) reads the canvas area's box only when it has a mark to place.** It
  measures every animation frame, and read that box each frame even with nothing to mark, laying the page out mid-frame
  through every zoom.

## Parity's window runs React's production build on request (PAR-519, PAR-550)

The speed audit of 2026-11-04 found most of what still felt slow under `pnpm dev` was React's development build in
Parity's own window: on the example project, selecting a design took 240 to 360 ms to the next paint, undo about 210,
and opening the Components panel 1.4 s, against 48 to 88 ms, about 64 and 0.14 s on the production build.

- **`pnpm dev` stays on the development build, as the daily driver; `pnpm dev:prod` runs the production build**
  (PAR-550). PAR-519 first made the production build `pnpm dev`'s default. You reversed that the same day: "I want
  development to all happen in dev build, so we can use StrictMode, Fast Refresh, etc. It's okay to have a script that
  runs from a production build, but our daily driver is going to be the dev mode."
- **The build is a flag, not an environment variable,** as you asked: "I don't want multiple environment variables
  floating around." The dev script takes `--react production`, which `pnpm dev:prod` passes, and starts the UI's Vite
  server in a mode of its own (`react-production`), which the config reads. Storybook and the end-to-end suite pass
  nothing and get the development build. PAR-519's `PARITY_REACT` is gone.
- **`pnpm perf`'s copy runs the production build,** passing the flag itself, so its timings compare with PAR-519's runs;
  `pnpm perf --react development` measures the build `pnpm dev` runs. Each result records which it ran. My call, as
  measuring isn't developing; it's one option to flip if you'd rather it timed the daily driver.
- **The production build is made the way frames run a project's dependencies** (PAR-198): the UI's dependencies are
  prebundled with `process.env.NODE_ENV` set to `production`, and `react/jsx-dev-runtime` is aliased to React's `jsx`,
  since the app's own modules are still compiled and served as in development. A local `pnpm build` couldn't stand in,
  as a page off localhost shows no canvas without the tldraw key.
- **Fast Refresh is off on the production build,** so a change to a component reloads the window rather than updating in
  place. Fast Refresh reaches React only through the development build's renderer; left on, an edited component was
  taken in and never drawn again.
- **The end-to-end suite runs the development build,** as it always has, so StrictMode's double effects and React's
  warnings run on every test. The packaged app's production build is covered by trying the installed app, as before.
- **Switching builds bundles the dependencies again,** in the same cache folder: Vite's key for the prebundle covers the
  aliases and the optimizer's options, and it changed between the two on the example project (`cdc88e51` and
  `3d73713f`), with Vite reporting that the config changed. Each switch costs one prebundle, a few seconds, which is why
  the builds don't keep caches of their own.

## Frame bitmaps are captured in four offscreen windows at once (PAR-523)

A first launch of the example project took 21 to 29 seconds to have every frame's bitmap, captured one at a time in one
offscreen window at about 150 ms each (see editor.md, Bitmaps kept between sessions and Opening in seconds). My calls:

- **A pool of windows rather than several frames on one page.** Each frame is still drawn alone, in a page of its own,
  at its own size, so its bitmap is the one a single window takes: 117 of 119 came out the same file byte for byte, and
  the other 2 differed by rasterizing noise in a shadow. Laying several frames out on one page and cropping one capture
  would save the per-frame waits but let frames share a window's height, its fixed-position layer and its lazy loading,
  which a frame alone doesn't.
- **Four windows, opened as jobs need them.** Each is a renderer process holding the project's modules while it's open,
  so a lone agent render still opens only one, and all close a minute after the last job, as the one window did. Four
  already leaves the windows waiting on the canvas (see below), so more would cost memory for nothing yet;
  `offscreenWindows` in `packages/core/src/preview-order.ts` is the one number to change.
- **Previews take one window at a time.** Component previews (PAR-207) stay behind canvas bitmaps and agents' renders in
  `renderQueue`, and making only one at once keeps the other windows free for those, so a preview never delays them.
  Agents' renders and the canvas's bitmaps keep one priority, in the order they're asked for; the canvas asks for at
  most four at a time, so an agent's render waits for at most the four under way.
- **The waits inside a capture stay.** Raising the windows' frame rate to 240 made each capture about 35 ms shorter, but
  moved it to another point in CSS transitions, so two frames' bitmaps came out different from one taken alone; it was
  dropped. Capturing a frame's first bitmap without the 1-second settle, and asking for two captures per window, gained
  nothing measurable, since the window's own thread decides when captures are asked for. The 30 ms wait lets components
  that load on demand start before `loaded()` looks for them, so it stays.
- **The 8-second target isn't met alone** (12.0 to 12.6 seconds on a busy machine, from 29.1). Captures start only when
  every frame has drawn its design, and the window then takes each drawn design apart as its bitmap comes, which paces
  how fast it asks for the next. Showing a skeleton instead of drawing far frames first (PAR-525) removes both.

## A running process's light breathes by opacity (PAR-524)

A running server's light in the status bar breathed by animating its `box-shadow`, which the browser has to paint again
every frame, so an idle window with its build server running painted 60 times a second. My calls:

- **It keeps breathing, by opacity alone,** rather than holding steady after a few breaths. The glow is a shadow drawn
  once on a layer behind the dot, faded in and out, and the dot fades between 85% and full as before. Both run on the
  compositor, so the light still looks alive and costs the window's thread nothing; the idle perf run shows no paint.
- **With reduced motion it doesn't animate,** as every process light, ring and shimmer already didn't, and shows no
  glow: a steady dot.
- **The status bar leaves the lights' words out and, when narrow, the items' too.** In a small window the footer ran off
  screen. The lights' words ("Starting Storybook", "Lint failed") moved to their tooltip, since a click on the lights
  lists it all anyway. Below 56rem each project item is its icon and count, with the words kept for screen readers,
  rather than wrapping or scrolling the footer.
- **Status bar tooltips are a title and one line, never details that can run long.** They had shown detection's
  summaries with paths, every discovery note, and raw error messages, which ran to several lines. Those details are
  still there for anyone who needs them: agents' tools report detection, and a failed save's notification gives its
  reason.

## Starting from scratch, and what things are called (PAR-537)

You chose these on 2026-11-04 from the new-user audit
([proposals/new-user-experience.md](proposals/new-user-experience.md), PAR-529), taking each of its recommendations:
"Yes, record them." The work is PAR-538 to PAR-548.

- **Frames are a third, light kind of design, beside screens and components.** A frame is a top-level layout drawn on
  the canvas, once, at its own size, in the primary mode, with no states, no modes beside it, no route and no code
  written. It holds anything a screen holds, and only a top-level one is a frame: drawn inside another design, it's a
  layout. Any frame becomes a component or a screen, and a screen or component made a frame again keeps its layers and
  drops its states, modes, params and variants, after saying so. It's the word Figma users reach for, and F's key
  (PAR-539, PAR-540, PAR-545).
- **The per-mode tiles inside a board are previews,** so frame means one thing. The rest of the words follow the
  proposal's glossary ("One set of words"): screen or component rather than design for the thing, main only for a main
  component, Default rather than Base for the first state, and board and view kept to the code (PAR-538).
- **A screen and its root layout are one selection,** as Figma's top-level frames are. Selecting a screen or component
  edits its root layout's size, fill, padding and auto layout first, with its states and modes below, and Layers lists
  the root's children straight under it (PAR-542, PAR-547).
- **T on the empty canvas makes a text layer in a frame that hugs it.** Notes stay, as annotations, under a tool of
  their own (PAR-540, PAR-545).
- **A blank app opens on a Home screen** for its `/` route, in its desktop and mobile modes, rather than on an empty
  canvas (PAR-284).
- **Frames are never written to code or checked for drift.** One becomes a component or a screen first, which keeps what
  gets written to the two kinds that have a place in the app (PAR-539).
- **Design changes are built in Storybook first, approved, then built in the app.** You said the same day: "any changes
  to the design we should build in storybook first so it can be approved, then move into the app." So each change people
  see is a design issue, which ends with your approval of its stories, and a build issue it blocks. Work in packages
  with no UI, such as PAR-539, doesn't need the first step.

## The app's UI kit moves to Buildkit's Base UI Nova (PAR-530)

- **The app's shadcn components move to Buildkit's `@buildkitgg/shadcn-baseui-nova`,** as you asked on 2026-11-04, so
  the 23 copies in `apps/desktop/src/renderer/components/ui` and their config leave the repository and nobody edits them
  in place. The copies are radix-nova, and Buildkit publishes only Base UI styles; you said the app should use Base UI
  only, so the move swaps Radix for Base UI too. The kit is a dependency under the alias its README suggests,
  `@buildkitgg/shadcn-baseui-kit`, so code names no style. Only Storybook uses it until the migration.
- **Each component is compared side by side in Storybook before its copy goes,** under Parity/Kit comparison/Side by
  side: the app's copy and the kit's, with the same content and their popups open, each in its own frame, in the
  toolbar's theme. Six copies were changed by hand: `kbd`, `command`, `context-menu`, `dropdown-menu` and `menubar` show
  keys through `formatKeys`, `menubar` has the title bar's own look (and its menus size to what they hold, where the
  kit's are its dropdown menus, as wide as their trigger and at least 9rem), and `sonner` follows the app's theme rather
  than `next-themes`. Those show a third side, the kit with the change made from outside it, which is where it has to
  live once the kit can't be edited. The rest are as `shadcn add` wrote them.
- **Radix's menus and selects close when their window loses focus; Base UI's don't.** In the comparison, the app's side
  doesn't hear its window lose focus, so its popups stay open beside the kit's, which take focus as they open. Whether
  the app wants Radix's behaviour back is the migration's call.
- **Prebundled dependencies import each lucide icon from its own file too.** The kit imports its icons from
  lucide-react's index, which isn't prebundled (see Developing Parity), so a window drawing the kit fetched every icon
  file, about 3,000 requests, and three such frames at once failed to load. `iconImportsPlugin` now rewrites a
  dependency's icon imports as Vite prebundles it, as it does the app's own as they're served.

## Tooltips are raised, and a component's preview is a card (PAR-515)

- **Tooltips read raised colors through the variables shadcn's tooltip already uses.** The tooltip is drawn in the
  theme's foreground with its text in the background, so it was white on the dark theme. You found that as wrong as the
  old dark tooltip, which blended into the panel. A rule in `styles.css` sets `--foreground` and `--background` inside
  `[data-slot="tooltip-content"]` to `--tooltip` and `--tooltip-foreground`. Those are a step lighter than a popover in
  the dark theme and white in the light. shadcn's components stay as shadcn ships them, as you asked, so the tooltip,
  its pointer and shortcut keys follow without an edit to each. The edge and shadow are one `drop-shadow` round the box
  and its pointer together, since a border on each showed a seam where they met.
- **A component's preview goes in a card beside its row, not in a tooltip,** the way a token's card opens: same width,
  side and gap, opened by resting the pointer on the row. The picture sits on the project's own page in a framed box
  that fits it, so a small part isn't lost in white. Placeholders sit on the card's muted fill, so they never pass for a
  picture. It replaces the hint on component rows; a library's component design keeps its hint. Its stories are in
  Parity / Left panel / Component card. Pictures are drawn in the project's first mode, which is light in the example.
  Drawing them in the mode matching Parity's theme is PAR-521.

## A component's code opens in the person's editor (PAR-527)

- **The editor is a setting, Automatic by default:** VS Code, Cursor, Windsurf, Zed or the system's default app.
  Automatic opens the first one installed, in that order, and the system's app when none is. Reading the editor from
  `$VISUAL` or `$EDITOR` would usually find a terminal editor for an app started from the Dock or Start, so it's chosen
  in Parity's settings instead.
- **Editors are found by their command on PATH,** since that's what each installs to open a file at a line. The usual
  folders are searched too on macOS and Linux, since an app the Dock started has only the system's PATH. No dependency
  was added for it: the four commands and their arguments are a small table in core.
- **The line is the export's declaration,** found by reading the file when it's opened, not from the type checker, which
  would mean a round trip to the service for a line that a pattern finds in shadcn's and most projects' files.
- **A library component's code is its type declarations,** the only code of it in the project. One without them has View
  code greyed, saying it's not in the project.
- **The menu's items are greyed with why rather than left out,** so it's the same for every component: View in Storybook
  says "No stories" for one without. With stories, it stays enabled while Storybook isn't running and says "Starts
  Storybook", since choosing it starts the project's Storybook and opens the story once it's up, as the row's book
  button always has. Disabling it until Storybook runs would leave no way to start it from there.

## Taking a component off the list by hand is gone (PAR-531)

- **A component detected wrongly is a bug in detection, not something to correct by hand.** You asked for "Not a
  component" to go, which took one off the list, recorded as `detection.exclude` in the main project file, with "List it
  again" under Not listed. Detection's mistakes go to Linear as bugs instead. Listing an export the type checker left
  out (`detection.include`, "List it") stays, as you didn't ask for that to go.
- **A project file with an `exclude` list still opens.** It's read and dropped, so the next save leaves it out, rather
  than the file failing to open over a list no version reads now.

## The labels that follow the glossary (PAR-538)

Calls made on 2026-11-04 while renaming the editor's labels to the glossary above, for you to approve in the pull
request's Storybook preview:

- **The modes menu offers "Only Desktop Light", by the mode's name,** rather than the issue's "Only this one", which
  says nothing beside Show all. The inspector's Modes section already said "Only Desktop Light". The preview a board
  shows first is marked "Shown first", and the others offer Show first.
- **The first state shows its name alone.** With Base gone, the state menu, the every-state grid's labels and the States
  section show no tag beside the first state rather than a count of changes, and a field's reset says "Reset to
  Default", or whatever the first state is called.
- **A label names the kind when it knows it,** counted for several ("Delete 2 components", "Move 3 screens and
  components", screens first), and says "screen or component" when it can't. Export stays short in the File menu (Export
  selected…, Export all…), and Interact is "Interact with previews".
- **A screen's icon is lucide's AppWindow,** which reads as a window of the app.
- **The Components panel calls the project's own components Local components,** as Figma's assets do, and a library's
  ready-made ones Ready-made components, so neither is "Component designs".
- **Left as they were:** the explorations under `apps/desktop/src/renderer/explorations/`, which are design sketches;
  the agent tools' and `packages/core`'s messages ("No component design"), which agents read; and "Pasted" (PAR-546).

## Starting on an empty canvas is one visible step (PAR-541)

You approved the explorations on 2026-11-04 ("Looks pretty good! Let's ship it"). They're in Storybook under Parity /
Explorations / Starting on the canvas, from the audit's "Making something is always one visible step"
([proposals/new-user-experience.md](proposals/new-user-experience.md)). PAR-546 builds them in the app.

- **Dropped on 2026-11-05 (PAR-560): an empty canvas says how to start in its middle:** a tile each for New screen and
  New component, saying what each is, with its keys, and below them Insert (`/`) and "Drop or paste an image here"
  (Ctrl+V). It goes once anything is on the canvas, and the canvas around it still pans, zooms and takes drops. Once
  frames exist, Draw a frame (F) is a third tile in the same row, and the heading names all three; PAR-540 designs the
  frame itself.
- **New screen is Ctrl+Alt+N and New component Ctrl+Alt+Shift+N.** Ctrl+N stays free for New project, which the start
  page explorations give it. They join the keymap, in the Object group, so the menus, Search actions and the shortcuts
  dialog show them.
- **New screen and New component lead File and Object,** above opening a project and above Insert. Object's hint for the
  rest says "Select layers, a screen or a component to act on them".
- **The canvas's right-click menu** offers New screen, New component and Insert… above Paste here, Select all and Zoom
  to fit. What it makes goes where you right-clicked, as Paste here does. On an empty canvas, Select all and Zoom to fit
  are unavailable. Over a screen or component, the menu stays as it is.
- **Search actions matches the start of a word,** not letters scattered through a name, so "new" finds New screen and
  New component rather than Interact with designs.
- **Layers' + always shows** beside Components and Screens, with its keys in the tooltip. An empty group's row is a
  button, "No screens yet. New screen", with the action in the kind's color. The count is left out at none, since the
  row says so.
- **Dropped on 2026-11-05 (PAR-560): the inspector on an empty canvas** says "Nothing to inspect yet", that a screen or
  component makes a start and that its size, layout and styles show there once one is selected, with New screen and New
  component buttons and their keys. With something on the canvas and nothing selected, it asks for "a screen or
  component on the canvas or in Layers".

## Far frames wait on a placeholder rather than drawing (PAR-525)

On a first launch every frame of the example project drew its design live while it had no bitmap, only to be taken apart
once its bitmap came, which held the canvas up and paced the captures (see editor.md, Opening in seconds). You decided
frames show a skeleton loader until their image loads. My calls:

- **Zoomed far out, a frame that hasn't drawn waits for any bitmap, kept or captured,** where PAR-179 waited only for a
  kept one. It draws at once where it wouldn't sleep (the selected board, zoomed in, interacting), and once its capture
  fails or its design doesn't render, so a broken frame shows its error rather than a placeholder for good.
- **The placeholder is a plain block, not a skeleton of the frame's boxes.** The skeletons frames already show are
  measured from the drawn frame (`frameSkeleton`), and a frame that never drew has nothing to measure. A block in the
  muted color at the frame's size reads as loading at the zooms it shows at. It doesn't pulse: an animation on 119
  frames would repaint the canvas the whole time they wait.
- **Its height is the frame's own, the height kept with an earlier bitmap, or the mode's window height,** as the issue
  set out. A short component's placeholder is then much taller than the component, and its board takes the right height
  when the bitmap comes. Boards keep their places on the canvas, so this changes their outlines, not where anything is.
- **The height kept with a captured bitmap is measured at full size, after the capture.** No frame draws live on a first
  launch now, so the offscreen window's own measure, up to 66 pixels out at the bitmap's quarter zoom, would have become
  every kept height, and boards would have jumped when their frames first drew. Laying the frame out again at full size
  gives the canvas's height (in the example, 4 of 61 boards still change by 12 to 24 pixels when they draw, against 28
  boards by up to 66). It's measured after `capturePage` because measuring first made the capture fail on tall app
  screens, and so the bitmap is the one the window took before, pixel for pixel.
- **A frame holding off drawing is captured without the 1-second settle,** on what it first shows. The wait is there so
  edits aren't captured at every step, and nothing is being edited in a frame that hasn't drawn.
- **`pnpm perf` counts a frame as shown once it's asleep,** which is when it shows its bitmap or its placeholder, and
  still times every bitmap separately.

## Frame bitmaps and component previews are kept as lossless WebP (PAR-535)

Kept bitmaps were PNGs as Electron's `capturePage` writes them, about 7.6 KB each on the example project. You asked to
keep these files small, so Parity doesn't fill people's disks with images, and to keep them lossless. My calls, and
yours:

- **Lossless WebP, encoded with sharp (your call), in the project service.** On the example's 119 bitmaps, libwebp's
  lossless mode made 562 KB of 908 KB, the same pixels. Re-compressing the PNGs with zlib at its best gained nothing
  (929 KB), and Chromium's own WebP encoder, lossless at full quality, wrote 957 KB. Lossy WebP would be smaller still
  but isn't what you asked for. Encoding runs in the service, off main's thread, where a capture's PNG already passes.
- **The canvas is given the WebP, not the PNG,** so the window reads, holds and decodes the smaller file, and what it
  shows is what's kept.
- **The frame's height stays inside the file,** in a chunk of its own after the image (`withWebpText`), as it was in the
  PNG's text chunk, so each bitmap is still one file for the cache's sweeping and partial-file handling. A plain WebP
  has only its image, so the extended header goes in front first, which the format requires.
- **The PNGs kept before aren't read.** Bitmaps are named `.webp` now, so the old files are never found and go with the
  cache's 30-day and 200 MB sweeps, as earlier format changes did; the PNG text helper is gone.
- **sharp ships beside the service, unpacked,** since it loads its prebuilt libvips at runtime. The build copies it and
  the packages installed with it, its binaries for the system building, and on macOS also fetches the other
  architecture's from npm, since one Mac build packages both. The build then loads the shipped sharp in Parity's
  Electron and encodes a WebP, and fails if it can't, so each platform's installer is checked as it's made; the other
  Mac architecture's binaries are checked to be there. A system where it can't load keeps nothing rather than failing,
  and captures each session.

## A screen is its own container (PAR-542)

You approved the explorations on 2026-11-04 ("Yeah, let's ship it"). They're in Storybook under Parity / Explorations /
A screen is its container, from the audit's "Selecting any of them selects the container"
([proposals/new-user-experience.md](proposals/new-user-experience.md)). PAR-547 builds them in the app.

- **Selecting a screen or component shows its root's sections first,** the ones a layer's inspector has today: Layout
  (auto layout), Spacing (padding), Size, Appearance (fill), Stroke and Text inside. A component whose root is a code
  component, as Plan card's is a Card, starts with that component's props. There's no Visibility or Position section,
  since a root has no parent.
- **What only a screen or component has comes below:** a component's Variants and Params, with where it's used, then
  States, Modes, and for a screen Repeated parts, the heading Find repeated parts now sits under rather than
  "Components". The header keeps the name, the Screen or Component toggle and the file.
- **The editing bar shows only once there's somewhere else for edits to go:** a second state or a variant. It says
  "changes every state" or "changes only this state", and the root's edits go to the state being edited, as a layer's
  do.
- **Layers lists the root's children straight under the screen or component,** with no Page row. A change the root has
  in the shown state, or on a viewport, marks the screen's own row. The headings and empty rows are the start design's
  (above).
- **A click on a screen's padding selects the screen,** and Enter from there selects the layers inside, as Figma's Enter
  selects a frame's children. Shift+Enter or Esc from one of them selects the screen again, never a root layer between.
- **With nothing selected, the inspector asks for "a screen or component on the canvas or in Layers"** and says its
  size, layout and styles show there, matching the empty canvas's wording.

Seen in review, for PAR-547 to weigh: a screen's own sections now start below six style sections, about 1,300px down
Plan card's panel; and at the inspector's default 320px the shipped padding and minimum height fields cut off values
such as 64 and 800, which are now among the first fields a person sees.

## The inspector's rows run to its edge, with reset arrows by the label (PAR-552)

Called on 2026-11-04 after you noticed the inspector's inputs stopped short of the right edge while bars, buttons and
headers ran to it, and then asked for everything to reach further rather than stop where the inputs did: every row in
the Design tab now runs to the panel's padding, and a field's reset arrow sits right after its label instead of in a
slot beside the input. An input keeps its width whether or not it can be reset, and the arrow never covers what's typed;
a long label truncates a little sooner while the arrow shows. For your approval in the pull request's Storybook preview.

## The app runs on Buildkit's Base UI Nova (PAR-549)

The 23 copies in `components/ui` are gone, with `components.json`, Radix, `shadcn`, `tw-animate-css`, `cmdk` and the
`cn` package; the app imports every component from `@buildkitgg/shadcn-baseui-kit`, and its stylesheet is the kit's
`tailwind.css`. The comparison stories went with them. Your calls:

- **The kit's components are used bare,** as you asked on 2026-11-04: no app-owned wrappers around them. What the app
  needs beyond the kit is said where a component is used. Keys pass through `formatKeys` inside the kit's `Kbd` and
  `*Shortcut` parts, and `SonnerToaster` gets the app's theme from `useResolvedTheme` where it's placed, since the kit's
  reads `next-themes`, which Parity doesn't use.
- **The title bar's menubar keeps two classes, in `AppMenu.tsx`:** no border around the bar, and menus as wide as what
  they hold (`w-auto`), since the kit's are as wide as their trigger and wrap their items. The rest of its old look,
  taller names, checks at the end of items, small dimmed labels and a fade as menus close, went.
- **Menus and selects stay open when the window loses focus,** Base UI's default. Radix's closed.
- **The side panel's tab strip is the kit's tabs,** a muted track with the open tab raised, rather than the app's own
  look on an unstyled primitive. Its panels are the kit's `TabsContent`, which need Base UI's tabs around them, and the
  kit's are those, so `@base-ui/react` isn't a dependency of its own.

My calls:

- **A token's row is its detail's trigger.** Base UI's popover has no anchor apart from its trigger, so the row, already
  a button saying it opens a dialog, is the `PopoverTrigger`, with its click kept from toggling the detail, since a
  click copies the token. Escape in a field being edited is kept from closing it through `onOpenChange`'s reason.
- **The canvas menu turns events away with `preventBaseUIHandler`.** Base UI opens a context menu for a `contextmenu`
  even when it's been cancelled, where Radix didn't, so the canvas's menu stops tldraw's held-back event and
  right-clicks in Interact mode that way.
- **Tooltips are visual labels only.** Base UI gives them no `tooltip` role and doesn't tie them to their trigger, so a
  control with one needs its own name (`aria-label`), as IconButton and the toolbar give theirs. Stories find the open
  one by the kit's `data-slot="tooltip-content"`.
- **Toggle groups are pressed buttons, not radios.** Base UI's is a `group` of buttons with `aria-pressed`, where
  Radix's single-choice one was `radio`s with `aria-checked`. The kit styles the pressed one, so the app's
  `aria-checked` classes, there because Radix's tooltip took over a toggle's `data-state`, went; the toolbar's tools key
  their look off `aria-pressed`.
- **Open triggers style by `aria-expanded`,** which Base UI sets on every menu, popover and select trigger, where Radix
  set `data-state="open"`; a closing popup is `[data-closed]` for the canvas's shortcuts.

## Frames are a third, light kind of design (PAR-539)

Decision 1 of PAR-537 adds frames beside screens and components, and decision 6 keeps them out of code. They're now in
the file and the packages, with no UI yet: PAR-540 designs their look and tools in Storybook, and PAR-545 builds them in
the app. My calls:

- **A frame is `kind: "frame"`, and its size is `size`.** `frames` stays a screen's and a component's sizes per
  viewport. A frame has one size, `{ width?, height? }` in pixels, whatever the project's viewports are, so it doesn't
  move when the modes change. Without a width it's as wide as the primary mode, and without a height as tall as its
  content, as a screen's main preview is. `frameSize` gives a frame that size in every mode. A frame that hugs its text
  (decision 4) is PAR-545's to add.
- **The file checks what a frame holds.** Its root is a layout and it has one state, with no patches of its own; it has
  no `params`, `view` or `frames`, and no other kind has a `size`. There's no route to refuse, since screens have none
  in the file yet; when routes land, a frame takes none.
- **One mode and one state, decided in core.** `shownModes` takes the design rather than its view and gives a frame the
  primary mode alone, so the canvas, the accessibility checks, `GetModes`, `Designs()` and agents' renders draw it once.
  With one state there's nothing else to show. The editor's `tidyView` keeps no view on a frame, so the state and mode
  controls a frame's board still has until PAR-545 change nothing. Core's `addState`, `duplicateState` and `addVariant`
  refuse a frame with `invalid_input`.
- **Becoming a frame keeps what the board showed.** `turnInto` in `@parity-app/editor` (`kinds.ts`) keeps a design's
  layers as its first state drew them, with the variant options shown and bound values filled in, since its params and
  their bindings go, as a paste into a design without the param does (PAR-464). Responsive patches stay on the layers.
  It takes the size it was drawn at in the primary mode, puts a root that isn't a layout inside one, and returns what it
  dropped (its other states, the modes it showed besides the primary one, its params and its variants), for the app to
  say before it does it. A frame becoming a screen or a component drops nothing, and its size becomes its preview's in
  the primary viewport, so it shows as it did. A screen and a component still become each other by their kind alone. The
  app's two kind switches go through `turnInto` already, so a frame in the file can't become a component with a `size`.
- **Inside another design, a frame is a layout.** `frameAsLayout` is its root layout, named after it, with its size as a
  width and height in spacing steps on the half step, as typed lengths land. `pasteFramesInto` and `moveFrameInto` paste
  and move it in with fresh ids; designs that aren't all frames don't paste inside, since a screen or a component
  doesn't go inside another design.
- **Never written to code.** Nothing writes designs to code or checks them for drift yet, so the rule lives on
  `ContainerKind` and here: whatever writes screens and components to code, and the drift review, leaves frames out.
- **Agents read and write frames.** `CreateDesign({ kind: "frame", width, height })` makes one, in empty space for its
  own size. `UpdateDesign` takes `width` and `height` for a frame and refuses them on the other kinds, and its `kind`
  goes through `turnInto`, saying what was dropped in the call's warnings. A frame refuses `mode`, `showModes`, `state`
  and `allStates`, and renders only in the primary mode: `mode: "all"` is that one, and another mode is `invalid_input`
  naming it. `@parity-app/agent` now depends on `@parity-app/editor`, which is pure, for `turnInto` and `newDesign`.

## "Convert to" changes what a design is (PAR-553)

Andrew decided on 2026-11-04, in PAR-540: "We should say "Convert to" and you're right, it should be changed
everywhere." So the item that turns a screen into a component, or a component back into a screen, reads "Convert to
component" or "Convert to screen" in the canvas menu, the Object menu and a board title's menu, rather than "Make it a
component" or "Make it a screen". Undo names the change the same way, whether it came from those menus or the Design
tab's Screen and Component toggle, where it said "Make component" and "Make screen". Make component keeps its name for
turning layers into a new component.

## The empty-canvas start is dropped (PAR-560)

You dropped it on 2026-11-05. A blank app already opens on a Home screen (PAR-284), so the start in the middle of an
empty canvas would only have shown the first time an existing app's folder was opened. Asked whether to drop it and open
every project on a screen instead, you said "Drop it."

- **Every project opens on a screen.** A folder or project with no `.par` file yet opens on a Home screen for its `/`
  route, in its desktop and mobile modes, as a blank app does (PAR-561).
- **The canvas has no start in its middle, and the inspector no empty-canvas state.** With nothing selected, the
  inspector asks for "a screen or component on the canvas or in Layers", whatever is on the canvas.
- **The rest of PAR-541 stays:** New screen and New component in File, Object, the canvas's right-click menu and Search
  actions, with their keys, and Layers' + always showing, with its empty rows as buttons. PAR-546 builds those. The
  exploration's stories open on a project with screens, and its empty-canvas stories are gone.

## One process manager starts and stops Parity's servers (PAR-20)

[process-manager.ts](../apps/desktop/src/utility/process-manager.ts) is where the project service starts, watches and
stops the servers a project needs. Storybook is the first to use it; dev servers, `wrangler dev` (PAR-29), test runners
(PAR-303, PAR-304) and the MSW handlers served to Storybook (PAR-70) are meant to start through it too. My calls:

- **A server is a command, a URL and a readiness check.** `startServer` runs the command, lists it in the status bar's
  processes as starting, and asks the check until the server answers at its URL, exits, or three minutes pass. A server
  that exits before it answers, or never answers, is listed as failed with the end of what it printed, and one that
  doesn't answer in time is stopped. What a server does at its URL stays the caller's business: Storybook's check asks
  for its story index.
- **It keeps each server's port and output.** `knownServers` gives the port, process id and who started each server, for
  one project or all, which is what PAR-117's reuse check and PAR-30's memory limit read. `serverLog` gives the last
  16,000 characters a server printed, and a started server's `exited` settles when its process ends, saying how.
- **A server that was already running is adopted, not owned.** `adoptServer` lists it and knows its port, and closing
  the project only takes it off the list. Only what Parity started is ever stopped.
- **Closing a project stops everything Parity started for it** (`stopProject`), and quitting stops everything. Starting
  a server again under the same id stops the last one first, so a project never has two of one server.
- **Builders and tasks stay as they are.** A project's builder has its own process and closing rules (CAN-81), and tasks
  such as installs and type checks run once and report a result; both still list themselves in the same processes, and
  either could move onto the manager when there's a reason to.
- **It stays in the app.** Starting and stopping processes is what the app keeps under
  [packages.md](proposals/packages.md), so the manager isn't a package. Its tests start small Node servers, without
  Electron.

## How frames look and work (PAR-540)

You approved the frames exploration (Parity/Explorations/Frames) by merging it on 2026-11-05. It's one canvas you can
use, with Layers and the inspector beside it, and every story starts it in a different place. PAR-545 builds it.

- **A frame has no board:** its name above it, smaller and quieter than a board's, and the design at its own size,
  filled with the primary mode's background. Its icon is lucide's Frame, neutral until selected, then in the layer
  color, since a frame is a layout. Screens use AppWindow in the stories until PAR-538's icon lands.
- **The toolbar is Move and Hand, then Frame (F or A) and Text (T), then Interact.** The frame tool's menu lists each
  viewport the modes use once, naming the modes that use it, with heights from `screenHeightForWidth` where a viewport
  gives only a width. A size resizes the selected frame, or adds a frame at that size. New screen and New component sit
  below the sizes.
- **A drag with the frame tool draws a frame, snapping to the edges of the designs around it,** named Frame 1, Frame 2
  and so on, selected, with the move tool back. A click without a drag makes a 100 × 100 frame, as Figma does.
- **T and a click in empty space makes a text layer in a frame that hugs it,** with 2 steps of padding so the fill
  doesn't clip the letters, named after its text until it's renamed.
- **Notes don't get a tool yet.** You said on 2026-11-05: "I think it's too early to add notes functionality. We should
  revert that." This replaces "Notes stay, as annotations, under a tool of their own" in PAR-537's list: the Note tool
  (S) is gone from the exploration, and PAR-545 doesn't build one.
- **The inspector's kind switch is Frame, Component, Screen,** and every design's title menu has Convert to for the
  other two kinds. A heavier kind applies at once, with a toast whose Undo brings it back. Converting a screen or
  component to a frame asks first when it drops anything, and lists it: states after the first, previews beside the main
  one, params, and instances, which become plain layers as Detach instance makes them. A frame made a screen keeps its
  size as its preview's.
- **A board's gutter is in screen pixels,** so it looks the same at every zoom up close: 12px at the sides and bottom, a
  36px band for the captions and 24px between previews. Past 40% it shrinks with the canvas, as labels do, so boards
  zoomed far out don't run into each other. You had found the canvas-unit gutter "super thick on one, and non-existent
  or text overflowing on others". Captions never truncate: short of room they drop the shrink, then the width, then the
  mode's name, and they stay until 10%. A board's title drops its menus before its name. PAR-602 sizes the app's gutter
  in screen pixels too, in `boardLayout` in core and `ContainerView`, and the agent's `boardSize` estimate with them
  (see "A board's gutter keeps its screen size up close").

## A project with no Parity file opens on a Home screen (PAR-561)

PAR-560 decided that every project opens on a screen. A folder or project with no `.par` file now opens on a Home screen
for its app's `/` route, in its desktop and mobile modes, drawing the real app. The rule is `openingDesigns` in
`@parity-app/editor`, which the app calls as a project opens, so a blank project from the scaffolder (PAR-284) gets the
same screen. My calls:

- **What draws `/` is the page detection found for it, else `App`.** The page is told by its router's file names, as the
  Components panel's pages are: Next's `app/page`, also inside route groups, which don't change the URL, or an `index`
  in a `pages` or `routes` folder. A router-less app's `/` is whatever its entry mounts, and Vite's and Create React
  App's templates mount `App`. The entry isn't read for components (it mounts the app, which the canvas must never run),
  so `App` is found by its name rather than by reading the entry. The nearest the root wins, and a route file's default
  export over its other parts, such as React Router's `ErrorBoundary`.
- **With neither, the Home screen is a padded page headed Home,** as New screen starts one, so the project still opens
  on a screen.
- **The page is drawn unpadded,** in the screen's root layout on the theme's background, since the page lays out its own
  content.
- **Mobile is the first phone mode, matching the primary mode's theme.** "Desktop and mobile" means the primary mode,
  usually Desktop Light, and beside it the first mode on a phone, preferring one whose theme and other options match.
  When the primary mode is a phone's, a laptop's or desktop's goes beside it.
- **Opening writes nothing.** The Home screen opens as if the project file held it, so opening a folder leaves it as it
  was, and the file is written with the first change. A Home screen made on open but never kept is no loss, since the
  next open makes the same one.
- **A file that couldn't be read gets no Home screen,** so saving can't write over it. A file whose designs were all
  deleted opens with none, as the person left it.

## Agents name states by id, and a name points to its id (PAR-459)

A state's name can repeat and change, and an id made from a name stops matching it after a rename, so every call keeps
taking a state's id and never resolves a name, even one that matches a single state. A miss still teaches the id: core's
`findState`, which every state lookup goes through, says ids are expected, lists each id beside its name, and names the
id of any state the reference names, ignoring case and spaces at the ends. A name several states share lists all their
ids and picks none. The ids a name points to lead `alternatives`, ahead of the rest, so an agent reading only the
details finds them. The code stays `unknown_state`, since the reference isn't a state id at all, rather than
`ambiguous_reference`, which is for references that match more than one valid thing.

## Measure stays one frame, and says so (PAR-461)

`Measure` returns one frame's layout, while `Screenshot`, `Problems` and `Accessibility` take a list of states or modes,
`"all"` or `"shown"`. Given one of those, Measure used to look the word up as a state and fail with `unknown_state` on
`"all"`. It now fails first, before anything renders, with `invalid_input` on `state` or `mode`. The message says it
lays out one frame, to call it once for each frame, that the checks take several, and lists the ids it takes: each
state's id beside its name, or the modes (only the primary mode for a frame), which also fill `alternatives`. Its result
keeps its shape and there's no Measure over many frames; each layout already names its state and mode, so a loop keeps
them apart. A Measure over many frames waits until agents need one.

## Data Parity didn't make is checked with zod (PAR-578)

Asked how PAR-565's channel module should check request params, by hand as core's `validate.ts` does or with zod, you
chose zod on 2026-11-04 and widened it: "We should definitely be using zod where we can. Handwritten parsers that can be
migrated to zod should absolutely be done. If there are some remaining, we need tasks to track it." A survey that day
found about 70 hand-written parsers, checks and unchecked casts. Each one that can move to zod has an issue, listed
below. My calls on how they move:

- **zod 4 comes from the pnpm catalog, at 4.6.7,** the version the MCP SDK already installs. PAR-15 put it in the
  catalog for the lens models, and PAR-588 adds it to `@parity-app/core` and the agent, with the helpers the other
  issues use. The CLI and the desktop app declare it too, since `vp pack` and `scripts/dev.ts` bundle Parity's packages
  but leave zod to load from their own `node_modules`.
- **Core's helpers are in `@parity-app/core/schema`,** which `@parity-app/core` exports too (PAR-588):
  - `parseData(schema, value, at?)` returns what the schema reads, or throws `TypeError` with the first problem as
    `/json/pointer: message`, in `validate.ts`'s words. `at` is where the value sits in a larger one.
  - `parseInput(schema, value, at?)` throws `CodedError` with `invalid_input` instead. Its `field` is the pointer
    without the leading slash, which the CLI and MCP report as the error's `path`.
  - `plainObject`, `nonBlankString` (trimmed) and `finiteNumber` are the shared pieces, and `jsonText(schema)` parses
    JSON text, then checks it with the schema.
  - `fileObject(shape)` is an object in a file Parity owns (PAR-589). It's strict, and it leaves out a key set to
    `undefined`, as `validate.ts`'s `compact` did, so what the window saves from memory reads as it would from the file.
  - `packageManifest`, in core's `adapters.ts`, is the package manifest schema, and `PackageManifest` its type. PAR-573
    added the fields its package reader needs.
  - A read that returns nothing when the data is malformed calls the schema's own `safeParse(value).data`, as
    `readErrorDetails`, `readCopyEntry`, the caller-name helpers and the agent registry's settings do.
- **A schema is the check and the type.** Types come from `z.infer`, not from an interface kept beside the check.
  - Files Parity owns (`.par`, `.lib.par`, edits) use strict objects, so an unknown key is still an error.
  - Third-party JSON (package manifests, tool configs, npm and GitHub responses) uses loose objects that read only the
    fields Parity needs.
  - Caches and saved preferences put `.catch` on each field, so one bad value falls back to its default without
    resetting the rest.
- **Errors read as they do now.** A failed check throws `TypeError` with `/json/pointer: message`, as `validate.ts`
  does, so people and tests see the same messages. Agent input throws `CodedError` with `invalid_input` and the pointer
  as its `path` (PAR-472).
- **`.par` files are zod schemas (PAR-589).** `parseCanvasDocument`, `parseDesignNode`, `parseNodePatch` and
  `parseModeSettings` check with them, and the types of `document.ts` and the mode settings come from `z.infer`.
  - The node tree is a discriminated union on `type`. Each type of node extends one base schema, since spreading the
    base's shape loses the recursive type.
  - Rules that span fields are refinements, each reported at the field at fault: node ids used twice, patch keys that
    name no node, what a frame may hold, a variant's options, links' ends and mode values. A refinement runs after the
    fields it reads pass their own checks, so a file with several problems can report a different one first.
  - Positions of designs and notes are strict too, as canvas objects' already were.
  - A few messages say more than before. A length that's neither a number nor a string says
    `expected a number or a string`, padding names its three forms, and a problem in a file's modes points inside
    `/modes`.
- **`.lib.par` files and edits are zod schemas (PAR-594).** `parseLibraryManifest` and `parseLibraryEdits` check with
  them, and the library types come from `z.infer`. Core's `validate.ts` is gone. My calls:
  - `canvas` is PAR-589's document schema, so a problem in it points inside `/canvas`.
  - A decorator's one effect and an icon pattern that compiles are refinements. Breakpoints are sorted by a transform.
  - Decorator values are checked when the file loads. An object with `$import`, `$call`, `$global`, `$frame` or
    `$function` must be that form, and any other object is plain JSON. Each form is checked only when its key is there,
    so a broken one reports its own mistake rather than the closest other form. The value types stay `unknown` until
    PAR-572 builds the one evaluator on this grammar.
  - Samples' props aren't checked against the value grammar yet; PAR-572 brings samples' made values under it.
  - Unions put a type check before a literal (`"export"` for an icon set's renderer, `false` for a dropped component),
    so a malformed renderer or edit reports its own mistake rather than `expected "export"`.
  - The registry's schema is the manifest's shape with `package` required. A file without one is skipped with
    `/package: a registry file names the package it describes`, as before.
  - Booleans in a component entry keep `expected a boolean`. A problem in a decorator of a manifest's own `edits` now
    points at `/edits/decorators/…`, not `/decorators/…`.
- **Everything that crosses into Parity is checked:**
  - project and library files
  - the clipboard, drag payloads and saved preferences
  - agent, CLI and MCP input, and the agent endpoint's HTTP body
  - `ipcMain` arguments, and the window's port to the project service, since project code shares that page
  - environment variables and command-line arguments
  - package manifests, tool configs and token files
  - caches and network responses
- **Some things stay unchecked or hand-parsed:**
  - Messages between Parity's own processes and threads, apart from the window's: worker threads, the builder process
    and the service's replies. Parity writes both ends, some messages are large (snapshots, frame captures), and every
    call would pay for the check.
  - Text formats. CSS values and stylesheets, JSONC, the fields expression lexer, pnpm's workspace file, tar entries and
    WebP text chunks stay hand-parsed, and zod checks what they produce where it has a shape.
  - Shapes that are found rather than checked. `libgen/src/icon-tags.ts` works out each icon set's metadata by
    heuristics, and a prop field takes whatever JSON a person types.
  - JSON the code itself wrote a moment earlier, such as keys it stringified, and tsconfig, which TypeScript's own API
    reads.
- **No zod in a project's page.** The project's own Vite bundles the guest (`renderer-react/src/guest.ts`), which
  evaluates decorator values on every frame. Values are checked once, when their library file loads (PAR-594). The
  guest's evaluator stays hand-written, typed from the schema (PAR-572). `guest.test.ts` follows what the guest imports,
  through Parity's packages, and fails if it reaches zod.
- **MCP's input schemas come from zod** through `z.toJSONSchema`, and `tools/list` keeps its 12 KiB budget (PAR-510).
- **The CLI and MCP contracts are in `@parity-app/agent/contracts`** (PAR-590), so the app can check its requests with
  the same schemas (PAR-598) and PAR-564's method map can pair them. My calls:
  - `requests` and `replies` are keyed by RPC method. The CLI's own results (every copy's tabs, the bounded console and
    tokens, execute's canonical result) are schemas in the CLI, built on those.
  - Request messages stay as the CLI worded them, naming their field ("design must be a nonblank string"), with the
    field as the path. `readRequest` throws them through core's new `checkData`, which returns the first problem rather
    than throwing it, so the message doesn't repeat the pointer as `parseInput`'s does. An operation's path stops at the
    field, so a bad item in a list of modes points at `/mode`, as before.
  - Execute's input is a union of a strict snippet object and a strict retry object. Which message a bad request gets
    follows from the union's closest option: `{}` is "Nothing to run", a snippet with an `editId` "not both", and edits
    without one "edits requires an editId". MCP execute now refuses unknown fields, as the other tools do.
  - Answers are loose objects: a field a newer app adds reaches agents, and a field older apps leave out is optional
    (state's `revision` before PAR-481, `warningGroups` before PAR-460, `composition` before PAR-454). Everything else
    is required, as the app sends it, and an answer that doesn't match fails as `app_error` saying where, with "Update
    Parity and @parity-app/cli". The tests' fake apps now send whole tabs and states.
  - Core exports `propKinds` and `propGroups`, so the props answer checks a prop's kind and group against the same lists
    its types come from, and `@parity-app/core/props` loads alone.
- **Token files stay lenient.** A malformed token is skipped and reported rather than failing its file, since a strict
  check would refuse files that load today (PAR-591). Each of the 12 registry libraries with tokens read the same before
  and after, with nothing skipped. My calls:
  - Each `$type`'s `$value` is a schema in `tokens/src/dtcg-values.ts`, checked once aliases are followed. Any value can
    be a string instead, CSS read as written, since libgen writes CSS where DTCG has no form for it.
  - The parts Parity filled in when they were missing stay optional: a shadow's offsets, blur, spread and inset, and a
    typography's weight, line height and letter spacing. A dimension takes any CSS unit, since libgen writes `em`.
  - A token malformed in one context is left out of that context only. A malformed set, modifier or step of a resolver's
    resolution order is left out too. A broken alias still fails the file.
  - Each skip is reported once. `readDesignTokens` passes it to its caller, and project discovery adds it to the
    project's notes, as `acme.lib.par: skipped radius (/$value: expected a string or an object)`. The Tokens panel
    doesn't show these yet.
  - A stroke style's dash pattern is written as `dashed`, since a CSS border can't draw one.
  - `parseData` passes over a union's options for another type of value, so a malformed shadow reports its bad part
    rather than `expected a string`.
- **The clipboard, drag payloads and saved values are zod schemas (PAR-595).** My calls:
  - The clipboard's envelope is a plain object, so a field a newer copy adds to the envelope is ignored, but what it
    holds isn't: the payload is a discriminated union on `kind` of core's `nodeTree`, `containerSpec` and `noteSpec`,
    which core now exports, each list at least one long. A copy that doesn't match pastes nothing, as before.
  - Drags read through `readInsertItem` and `readLayersDrag` in `@parity-app/editor`. A drop whose data doesn't read
    does nothing.
  - Preferences, the panel layout and the saved tabs put `.catch` on each field. Text that isn't JSON or isn't an object
    reads as the defaults. A panel width outside `panelLimits` falls back to its default, and a saved tab or recent
    project that isn't a root is left out.
  - axe-core's `check.data` for color contrast is a schema that turns into `ContrastDetail`. Data that doesn't match
    gives no contrast detail, and axe-core's own message shows instead.
- **The main process checks its inputs (PAR-592).** My calls:
  - Each `ipcMain.handle` argument has a schema in `shared/ipc-checks.ts`, and `checked(schema, handler)` refuses a bad
    one with `TypeError` and the pointer before the handler runs. Open in editor's request is a strict object whose
    `file` must be an absolute path, so it can't reach the editor's command as an option such as `--goto`. The window's
    types for these come from the schemas, through `import type`, so the window doesn't load zod for them.
  - Main's environment variables are one schema in `main/environment.ts`, read once as main starts. A bad value stops
    main there, naming the variable, since only scripts, tests and the AppImage runtime set them. An empty variable
    counts as unset. `PARITY_WINDOW_SIZE` is read as a width and height, the ports and process ids as numbers.
  - `theme.json` and `updates.json` are saved preferences, so a malformed one falls back to dark and the stable channel.
    `installed-build.json` is a cache, and the app's package.json and GitHub's releases are third-party JSON, read
    through loose objects.
  - The preload's `--parity-version=` and `--parity-initial-project=` stay hand-split. The preload is sandboxed and can
    only require Electron, and in development zod loads from `node_modules`, so it can't load zod. Main makes both
    values, the second from the checked `PARITY_PROJECT`.
  - The render page's `canvasRender()`, `canvasAudit()` and `canvasHeight()` are checked, since the page runs project
    code. Checking a frame of 1,000 nodes took 0.09 ms and one of 5,000 0.39 ms, where copying the same frame with
    `structuredClone` took 0.8 ms and 7.5 ms. An audit of 30 issues and 300 texts took 0.13 ms.
- **The app checks agents' requests (PAR-598)**, since any local process holding the token can post to `/rpc`. My calls:
  - `answerRequest` in `@parity-app/agent` reads the body with `rpcRequest`: JSON text holding an object with a string
    `method`. Text that isn't JSON gets "expected JSON", and anything else in the body is dropped. The caller's name and
    id stay lenient, as `callerIdentity` reads them, since they're only shown on the canvas.
  - `dispatch` reads each method's params with its schema in `requests` before the host is asked anything, so the app
    applies the same defaults the CLI does. `copy` takes no params, as `tabs` doesn't. A bad request gets
    `invalid_input` with the schema's message and its whole path under `params`, as `edits/0/find`, since only a process
    that skipped the CLI's own check reaches it.
  - The window's handlers take their agent params' types from the schemas' output, through `WindowMethods`, and answer
    from a map typed by it rather than a cast in each case. The service made those params, so they aren't checked again.
  - `PARITY_APP_PID` and `PARITY_APP_STARTED` are read once through `utility/environment.ts`. Unset, they fall back to
    the parent's process id and the service's start, as before. A value that isn't a whole number stops the service
    there, naming the variable, since only main sets them (PAR-593 made this the service's whole environment).
- **The project service checks its files, caches and environment (PAR-593).** My calls:
  - The service's environment is one schema in `utility/environment.ts`, read the first time `environment()` is asked
    for: the allowed origins (a list from commas), the project it started with, the dev runner, the checker's idle time,
    the cache, bitmap and picture folders, the reopen file, Portless's state folder and the copy's process id and start.
    A bad value stops the service, naming the variable, as main's does. An empty variable counts as unset. The open
    projects take the three they use as an option, so their tests give their own.
  - Read once means a test that changes a variable starts the module again (`vi.resetModules()`), as the bitmap store's
    tests already did. `readPortless` takes its folder, so its tests pass their own.
  - The caches fall back to empty when they don't match. The previews index needs its format and an object of
    components, and each record is checked on its own, so one bad record loses only itself. The local `isObject` and
    `isRecord` are gone. The detection cache checks its outer shape: the fingerprint, each component's file and export,
    each component's name, file and list of props, and the left-out exports. What's inside the props isn't checked,
    since the records are large and the checker wrote them under the same fingerprint.
  - `open-projects.json` is `{ roots: string[] }`. A list it can't read opens nothing, where a list with a non-string
    root used to open the rest; the service writes the file itself, so a bad one is a broken one.
  - Portless's files are someone else's, so they're read leniently: each route is checked on its own (a hostname and a
    whole-number port), `proxy.port` must be a port number, else 443, and `proxy.tls` is a yes or no, else no.
  - Storybook's `/index.json` must be an object whose `entries` is an object. Entries are checked one by one, and one of
    a kind Parity doesn't know, such as a `page`, is left out. An index that doesn't match rejects, so a server
    answering something else isn't taken for a Storybook serving the project.
- **Package manifests and tool configs are read through schemas (PAR-597).** My calls:
  - Core's `parseManifest(text, file)` is the one reader of package.json text. It throws `TypeError` naming the file and
    the field, as `/app/package.json: /bin: expected a string or an object`. Project's `readPackage` and `findPackage`
    use it, and so do the readers outside project: builder-vite, Storybook's command line, the app's build scripts, the
    fixtures and the Storybook example. Both `readJson` helpers are gone.
  - `packageManifest` gained `optionalDependencies`, `bin`, `repository` and `packageManager`, the fields those readers
    take. Opening a project whose package.json has one of its fields of the wrong type fails, naming it.
  - Two reads stay lenient, since the manifest only decides a detail there: package manager detection's evidence
    wording, and a tool's config under a package.json key, which reads as absent when the manifest doesn't match.
  - The fixtures' generator spreads the checked manifest over the file's own object, so keys keep their order.
  - shadcn's `components.json` is a loose schema of `tailwind.css` and `aliases.ui`. A file it refuses is skipped with a
    note, as one that isn't JSON was.
  - `loadConfig(root, folder, source, schema)` takes a schema and returns what it reads. A config it refuses throws with
    the config's path and the pointer.
- **The snippet API checks its arguments (PAR-596).** My calls:
  - Each function's arguments have a schema in `packages/agent/src/arguments.ts`, and `api()` reads every argument
    through it before the function runs. The argument types come from the schemas. A node is core's `nodeTree`, after it
    and everything in it get fresh ids, and a patch is core's node patch with each field also taking `null`.
  - `null` still takes a value away: in `Update`'s change, a state's changes and `Responsive`. Core exports `nodeStyle`,
    `patchUnset` and `textTags` for these.
  - A wrong argument fails as `invalid_input`, through core's `checkData`, with a field and a message that start with
    the same path. An options object's fields name themselves (`width`, `style/gap`). A node starts at `node` or `root`,
    and anything else at its parameter's name (`design`, `patch`). `SetTokens` keeps its `SetTokens/…` paths.
  - Options objects and nodes are strict, so a key a function doesn't take is an error. It used to be ignored, apart
    from nodes and `Update`, which said so in plain errors. `Update` keeps its hint to use Replace, Move or Responsive.
  - Errors that used to be plain `TypeError`s or `Error`s are now `invalid_input`: a file that doesn't end in `.par`,
    `Update` changing a name, tag or component in a state, and every "expected an object". The workspace's own
    `expectObject` is gone.
- **libgen checks what it reads from npm, packages and theme objects (PAR-599).** My calls:
  - npm's package and version documents are loose schemas in `libgen/src/npm.ts`, fetched by `packageDocument` and
    `versionDocument`. Published versions, a version's source and tarball, and the examples' commit all read through
    them. A document that doesn't match fails as
    `npm's document for lucide-react: /dist-tags/latest: expected a string`. A package's listed versions are read for
    `gitHead` only, so an old version's odd `repository` can't fail the whole document, and `time` allows npm's
    `unpublished` record beside the dates.
  - A package's `upstream.json` is checked. One that doesn't match reads no examples, with a note naming the field,
    rather than being ignored. React's package.json, read to match React DOM's version, goes through `parseManifest`.
  - A token file a package ships must be a JSON object, with a resolver's `resolutionOrder` a list, to count as tokens.
    What's in it is checked when the tokens are read (PAR-591).
  - The library file being regenerated is read through `parseLibraryManifest`. One that doesn't read stops generation,
    naming the field, where it was overwritten before, since writing over it would lose what a person wrote. Its
    authored fields and edits are kept as the file wrote them.
  - MUI's `createTheme`, the theme and stylesheets it makes, Chakra's `defaultSystem` and Fluent's themes have small
    schemas of the fields libgen reads. A field that moves fails the theme with its name, as
    `@chakra-ui/react: /defaultSystem/getTokenCss: expected a function`, and the library's notes say so. A typography
    entry that isn't an object, such as MUI's `pxToRem`, is passed over.
- **New code adds no hand-written parsers.**

The issues, in order. PAR-588 comes first, since it adds zod.

| Issue   | What moves to zod                                                               | After            |
| ------- | ------------------------------------------------------------------------------- | ---------------- |
| PAR-588 | zod and core's helpers, with error details, agent copy entries and caller names | –                |
| PAR-589 | `.par` documents and mode settings                                              | PAR-588          |
| PAR-594 | `.lib.par` files, edits and the decorator value language                        | PAR-589          |
| PAR-595 | The clipboard, drag payloads and saved preferences                              | PAR-589          |
| PAR-590 | The CLI and MCP contracts                                                       | PAR-588          |
| PAR-596 | The agent snippet API's arguments                                               | PAR-589, PAR-590 |
| PAR-598 | The desktop's agent requests                                                    | PAR-590, PAR-564 |
| PAR-597 | Package manifests and tool configs                                              | PAR-573          |
| PAR-599 | libgen's npm, upstream and theme data                                           | PAR-597, PAR-594 |
| PAR-591 | DTCG token files and resolvers                                                  | PAR-588          |
| PAR-592 | The main process's IPC arguments, files and environment                         | PAR-588          |
| PAR-593 | The project service's files, caches and environment                             | PAR-588          |

Four issues from the architecture review build on these:

- PAR-565's channel module checks the window's requests with zod.
- PAR-564 declares its method map with PAR-590's schemas.
- PAR-572 checks decorator values with PAR-594's grammar.
- PAR-573 reads manifests through PAR-588's schema.

## Agent warnings come grouped, with a category and severity (PAR-460)

A large insertion used to return a warning per unnamed layout, each a sentence with the place in front. Now each finding
comes once, with a count and every place:

- **Grouped by category and message.** Findings that say the same thing go together, whatever node they're on. A
  repeated finding at the same place counts once. Different props or tokens stay apart, since each needs its own fix.
- **Stable categories, three severities.** `error` is a render that failed, because a screenshot or check is missing for
  that frame. `suggestion` is a name for the layers tree. Everything else is a `warning`. Groups are sorted by severity,
  then kept in the order found.
- **`warnings` stays, beside `warningGroups`.** As with PAR-472's coded errors, an older CLI and text-only clients keep
  reading lines, now one per group in the same order. A CLI talking to an older app reads every line as a warning. The
  CLI's schema names the categories in prose, not as an enum, so it doesn't import the agent package for them.
- **The place is kept apart from the message,** a node's `design/node` path where there is one, so an agent can act on
  every place without parsing. Overlaps and kind changes name their boards in the message and have no place.
- **No automatic names.** As the issue said, Parity doesn't name layers or require unique names; it only reports.

## New screen, New component and the empty canvas are built (PAR-546)

PAR-546 builds what PAR-541 designed and PAR-560 kept (above), as editor.md's "New screen, New component and the empty
canvas" describes. The exploration's stories now sit beside the stories of the components that draw them, and the
exploration is gone. My calls:

- **One rule covers every way something lands with no design to go into,** not only a drop: a component or image clicked
  in the Components panel or picked in the insert picker with nothing selected makes a screen too, in the middle of the
  view, where pasted layers and the picker's layouts already went. Before, a layout made a screen there and a component
  was refused, which is the disagreement the audit found.
- **The name is what's in it:** one layer as Layers names it, a component without its library; several images Images, as
  dropped files already were; several other layers the first one's name and how many more ("Nav and 6 more"), so the
  name still says what's inside. With nothing in it, "Untitled screen", as New screen names one.
- **The screen is selected, not what's in it,** as a paste and a dropped image already did, so what happened is what's
  shown. Its undo step names what landed: "Paste layer" or "Paste 7 layers" (it was "Paste layers" for any number), and
  an item's own, "Add Badge".
- **One situation, one message.** An item dropped over a design where there's no layout says "There's no layout here to
  drop into", as files do, where it said "Drop it inside a screen or component, onto one of its layouts". The insert
  picker, with a design selected that has nowhere for an item, says what the Components panel says, "Select a layout, or
  a layer to add it after".
- **Search actions' word matching takes each typed word in any order,** so "fit zoom" finds Zoom to fit, which matching
  the whole text against the start of a word wouldn't. A name that starts with what's typed comes first.
- **New screen from the canvas menu doesn't move the view,** since it's made where the pointer was. The keys, the
  menubar, Search actions and Layers' + make it right of everything and zoom to it, as the + did.
- **Enter and Space on Layers' + or an empty row make one.** The tree's own keys skip buttons outside its rows, where
  Enter used to rename the selected row and the button never ran.
- **Storybook's stand-in project service answers `frames.stored`** with no bitmap, as the real one does on a first
  launch. It answered nothing, which failed the canvas menu's stories once a frame slept.

Left for later: a screen made with nothing selected can land over a design in the middle of the view, as pasted layers
always could, and a component in a new screen fills its width, where the proposal says it should keep its own.

## Lens models are zod schemas with versioned JSON Schemas (PAR-15)

The data, API, routes, scenarios and links lenses each have a model in `@parity-app/models`, before any lens reads into
it. You approved zod for it on 2026-11-05, which PAR-578 had already chosen for data Parity didn't make. My calls:

- **zod is the source, and the JSON Schema comes from it.** Each model is a zod schema that lens code checks with
  `parseTables`, `parseOperations`, `parseRoutes`, `parseScenarios` and `parseLinks`. `lensModelJsonSchema(name)` writes
  it out with `z.toJSONSchema` for adapters and agents to target, so there's one copy to keep, not a schema file and a
  parser beside it. This package adds zod to the catalog, ahead of PAR-588.
- **Each document says its version,** as `.lib.par` does: `"version": 1`. A change that would reject a document the
  version accepts gets a new version. Snapshots of each model's JSON Schema show any change to it in review.
- **The schemas stay private.** Their ids are `urn:parity:model:<name>:<version>`, which name them without publishing
  them anywhere, and the package is private.
- **Objects are strict,** since Parity owns these models: an unknown field is an error, reported as
  `/json/pointer: message` in a `TypeError`, as `.par` and `.lib.par` files report theirs.
- **The models are what each lens's design needs and no more:**
  - Tables hold the database family, and each table's columns (type as the database names it, whether it can be null,
    default as SQL), primary key, indexes and foreign keys, with Postgres's enums. A key or index naming a column the
    table lacks is an error.
  - Operations hold an id, an input and output schema kept as written, errors, a method and OpenAPI path when it's HTTP,
    and `x-` fields, which mark server functions. Ids are unique.
  - Routes are a tree, each with its full path as a URL pattern's pathname, the file that draws it and whether it's a
    layout. Ids are unique across the tree.
  - Scenarios hold a name, the design state they fill, and each operation's response by operation id, with an HTTP
    status for errors.
  - Links join a screen, route, operation or table to another, and say whether a person drew it, a trace showed it or
    the code calls it. Any kind may link to any other, since "screen → route → operation → table" is an example, not a
    rule.

## Canvas gestures share one lifecycle (PAR-568)

The architecture review of 2026-11-04 found each canvas drag rebuilding what surrounds the history's gesture and
checkpoint, so a fix reached one copy and missed the others: in a0d0e80 a field's run and a nudge run had the same bug,
fixed twice. Now `canvas/gesture.ts` follows every drag and every run (see editor.md, Cursors and Escape during a
gesture). My calls:

- **Each gesture's policy is one entry in one table** (`gestures`): what Escape does, and what the pointer cancelled or
  the window losing focus does, each keep, revert or cancel. The table is what the tests drive, so every gesture's
  Escape and blur are checked side by side.
- **The window losing focus is cut short, as a cancelled pointer is.** Each gesture keeps what its pointercancel already
  did: a resize keeps what it wrote, a title drag saves the designs where they are, and layer drags and a box call
  themselves off. Before, a title drag and a box didn't hear the window losing focus at all (PAR-583).
- **Every press waits the same 4 screen pixels before it's a drag.** A title drag used to start after 1 page pixel, and
  a frame's handle at once; both now wait as layer drags and boxes did. A layer's resize handle still checks the 4
  pixels along its own axes too, so a pointer moving across them changes nothing.
- **The undo gesture, the checkpoint and the cursor start with the drag,** not at the press, so a click on a handle
  begins nothing. A revert writes only when the design changed, since reverting writes its file again.
- **Runs are keyed by the selection's `selectionKey`,** one `GestureRun` for arrow presses on the canvas and for Up and
  Down in a field. A nudge run follows the selection while it lasts; a field's follows its `FieldTarget`.
- **tldraw's own drag of a board stays tldraw's,** ending when tldraw stops translating, since tldraw follows that
  pointer, not Parity.

## Agents tell board collisions from title clearance, and a call's warnings from an audit (PAR-462)

An agent read an execute call with no overlap warnings as a tidy canvas, and a title too close as boards on top of each
other. The two checks already differed, and `Overlaps()` already marked `titleOnly` and `estimated`; this makes what
they mean, and what each check covers, plain:

- **Two categories for a call's own boards.** `overlap` is two boards colliding; `title_clearance` is boards that are
  clear, but so close that the lower one's title covers the upper. Both are warnings, and both stay limited to boards
  the call created, changed or moved, as before.
- **The rest of the canvas is counted, not listed.** When boards the call didn't touch are too close, one
  `canvas_overlaps` suggestion says how many pairs and points to `Overlaps()`. A call that only reads therefore doesn't
  look like a clean canvas, without repeating every old overlap on every call.
- **Measured or estimated, in words.** A warning says "measured" when the canvas drew both boards, and otherwise names
  the board that isn't drawn yet. `Overlaps()` keeps `titleOnly` and `estimated` as they were, with no new fields, and
  `state`'s schema now describes them. Real sizes for undrawn boards remain PAR-279's, and the 1400 × 1000 room a new
  screen is placed with isn't treated as a placement bug: it's placed right of every board.

## One step works out the component list (PAR-566)

The order that keeps the component list current was written four times in the project service, and the copies disagreed.
PAR-492 then added a fifth, for a config change. `nextComponentList` in `@parity-app/code` now takes the list and an
event and returns the next list, and every path goes through it. My calls:

- **Five events, not four.** Opening takes two: `discovered` gives discovery's list with the person's corrections, whose
  fingerprint finds a saved detection, and `restored` takes that in. The rest are `checked`, `filesRead` and
  `corrected`.
- **A config change is a `filesRead` event.** `rediscoveredFiles`, which was `rediscoveredSources`, now returns the
  files it read, every one the config includes and those the list came from, and the step sorts them as it does any
  files read again (PAR-492).
- **Every event applies the person's corrections last,** so they outlast each pass of detection, as before.
- **Ids taken off the list are let go before new ones are given.** The whole-app check already did this. The check after
  files changed added first, so a new component that took a removed id was deleted. That settles PAR-581's order;
  PAR-581 still adds its test.
- **The service keeps one list per project.** The project's info, the builder's start options and the service no longer
  share one object changed in place. The info the windows get, and the options a restarted builder gets, are made from
  the list when they're needed. A project's info now always carries `leftOut`, empty until the type checker has read the
  app.
- **What a guest is given and takes back is `guestChanges`, in core.** The windows can't load `@parity-app/code`, which
  brings TypeScript and Node, and core already declares the `Guest` that does the giving. Each guest works it out from
  what it last had: the canvas's from the list it last heard, the offscreen renderer's from each guest's last job. The
  service doesn't send its own step's changes, since a window that reloads, or hears two changes out of order, would
  drift from its guest. The offscreen renderer now gives a guest only what changed since its last job, rather than
  everything every time, which the guest ignored anyway.
- **After a type check, only the components it added or moved have their props read.** The check after files changed
  used to read every component's props again, straight after the parse's pass had read them all.
- **An export the person puts on the list shows at once,** before its file is read again. One they take back off waits
  for the read, as before. PAR-604 is the case where it stays listed after that.
- **The program cache stays in the app's worker for now.** Moving it into `@parity-app/code` is its own issue, PAR-603.

## A component preview draws what opens, open and in place (PAR-517)

A dialog, popover or menu's preview showed its trigger alone, and its parts a blank or an empty trigger, since their
content renders only once opened, in a portal outside the frame (see editor.md, Component previews, made offscreen and
kept on disk). My calls in fixing it:

- **Opened through the props a library declares, not a list of components.** The preview's tree gives `defaultOpen` to
  what takes it and chooses an item for what takes `defaultValue`, reading the props each component's library file lists
  (`openProps`). That covers Base UI's and Radix's dialogs, popovers, menus, selects and accordions in every library
  without naming them. Only the first that opens, and the first within it, opens, so a menubar shows one menu rather
  than four over each other. A sample that already chooses an item, as tabs' and radio groups' do, is left as it is, so
  their pictures don't change. A value given to choose an item is a list when the sample's own choice is (an
  accordion's), else a single value: nothing else says which a component takes, since props aren't read from Base UI's
  types (the type checker gives library components no props here).
- **Portals are moved into the frame after drawing, not given a container.** Neither Base UI nor Radix lets a project
  say where every portal goes, and a component's own portal is inside it (`AlertDialogContent` wraps its portal), so the
  offscreen page moves what's been added to its body into the preview's element once the component has drawn, and back
  before the next job. React keeps rendering into a portal's node wherever it is.
- **Placed content is put in the flow by the page, not by each library's classes.** What's fixed or absolute in a moved
  portal is made relative, unmoved and shown, and what holds nothing is left out, by a stylesheet in the frame keyed by
  attributes the page sets. A positioner that hid its popup for want of a trigger to place it by (a part drawn without
  one) is shown, and positioning libraries that set inline styles again don't undo it. Only preview jobs do this: agents
  and bitmaps draw portals where the project puts them.
- **"Draws nothing of its own" is a picture with every pixel alike.** It's what the person would see, whatever the
  reason: a provider, a part whose sample holds nothing, or content that couldn't be opened. It follows the Previews
  exploration's States story (an eye-off icon and "Draws nothing of its own" on the muted fill), which designs it.
  Previews made before are made again once, as `previewFormat` went up to 3.

## The offscreen window never scrolls (PAR-520)

Five component previews on the example (Separator, AlertAction, Bubble, BubbleGroup, BubbleReactions) showed a
horizontal scrollbar along their bottom. Watching the offscreen window draw them showed why: for a capture it's made as
tall as the frame, and whatever reaches below the frame (a part's name under a 1px Separator, a bubble's reactions,
which hang three quarters below it) makes the page scroll. The vertical scrollbar takes room, so the frame, as wide as
the window, overflows sideways too, and the horizontal scrollbar is drawn at the window's bottom, which is the bottom of
the picture. My calls:

- **The render page's root hides its overflow,** so the window has no scrollbars, rather than growing the window to what
  overflows. A frame's picture is its frame: a bitmap is captured at the frame's size, and a component's preview is
  cropped to its box. This applies to frame bitmaps and agents' captures as well as previews; none of them should show
  scrollbars, and the window is never scrolled.
- **What reaches past a preview's box is still cut off.** Bubble's reactions hang past its 8 pixels of room and show cut
  through at the bottom, and BubbleReactions on its own, inside an otherwise empty Bubble, hangs wholly below it, so its
  picture is now empty where it was a scrollbar. Cropping to everything the component draws would be a separate change.
- **`previewFormat` went up to 2.** A preview's key covers its tree and code, not the renderer, so pictures kept with a
  scrollbar would otherwise stay until their code changed. Every project's previews are made again once, in the idle
  pass.

## Component previews follow Parity's light or dark theme (PAR-521)

Previews were all drawn in the project's first mode, light on the example, so in Parity's dark theme they were white
boxes (see editor.md, Component previews, made offscreen and kept on disk). My calls in fixing it:

- **One mode at a time, the one matching the theme, not both.** The issue allowed drawing both and showing the matching
  one. Drawing both would double the idle pass's work and the disk for a theme most people don't switch, so the window
  draws only the matching one, and a switch draws the rest then. The key covers the mode, so both are kept once made and
  a switch back draws nothing.
- **Dark is read from the mode's theme options, by the word.** Modes don't say light or dark, so a mode is dark when a
  theme option's id, name or class is the word "dark": shadcn's `dark` class, a "Dark" option, `theme-dark`. A project
  whose dark theme is called something else ("Night", "Midnight") is drawn in its first mode, as before.
- **The matching mode keeps the first mode's other options.** Desktop Dark is picked over a Mobile Dark listed before
  it, so a preview changes in theme only, not in viewport or locale.
- **The card's box takes the page's color from the picture.** It was white, the light page; a dark picture in it showed
  a white frame round its own dark page. Nothing in the window says what the page's color is in that mode, and the
  picture's corner is that page, so the box draws the picture's first pixel scaled past its size as its background,
  which needs no stored color and no decoding in script.
- **Switching themes shows the other theme's picture, dimmed, until its own is made.** The index keeps one latest key a
  component, so a switch to a theme not drawn yet shows the last picture as updating, as after an edit, rather than
  nothing; switching back shows the kept one at once.

## Zoomed far out, a board's labels hide once it's too narrow (PAR-151)

Called on 2026-11-04, for your approval in Storybook:

- **The frame the issue names is the board.** A title is clipped to its board's width on screen and hides when the board
  is under 24 screen pixels wide; a mode caption goes by its own frame's width, and a state label by its board's. One
  threshold for all three means detail never outlasts the title: a frame is never wider than its board.
- **Hidden at the line, not faded towards it.** The zoom moves in steps far out (1%, 2.5%, 5%, 10%), so a fade between
  them would rarely show. At 24 pixels or wider, a title shows, however little of its name fits.
- **The icon is clipped with the name,** by the title's button, rather than the title dropping to its icon alone. The
  rename field isn't clipped, so renaming a narrow board up close still shows the whole field.
- **The rule moved to `@parity-app/editor`** (`canvas-labels.ts`), taking the board's or frame's width with the zoom, as
  packages hold the editor's logic; the canvas keeps applying it to each label's style.

## Make component checks every variant option (PAR-493)

Called on 2026-11-05. Make component's before-and-after check now renders the design in each option of each variant
param, not only the option its board shows, as it already did for every state and viewport. Each option is checked with
the other params as the board shows them, rather than every combination of options: an option that changes nothing
inside the part on its own changes nothing there beside another that doesn't either, and the checks grow with the number
of options rather than their product. A refusal for an option the board doesn't show names it after the state and
viewport. A variant's change inside the part isn't caught earlier with its own advice, as a state's is; the render check
refuses it.

## Width and Height make room for their value (PAR-496)

Called on 2026-11-05, for your approval in Storybook. A 96 by 48 layer showed "9" and "4" in the Size section. Both
width and font played a part: the length field shared its row with a 92px Fixed, Fill or Hug list, a token button and
`px`, leaving it about 9px for the value before PAR-552 widened rows and 17px at 300 pixels after it, and nothing at the
narrowest 260. Its text was also 14px rather than the 12px it asks for, since the UI kit's input turns to 14px from the
`md` breakpoint and the field's `text-xs` didn't override that. Now every number field's value is 12px, and when the
Size row is narrower than 176px (an inspector under about 310 pixels) the list goes under the length rather than beside
it, so the row is taller there instead of the value being cut. Shrinking the list or dropping `px` wouldn't have made
room for four digits at 260 pixels. Padding, Margin, Min, Max and insets keep two lengths to a row and still clip at the
narrowest; they're left for another issue.

## A correction taken back leaves the list to detection (PAR-581, PAR-604)

An export the person took back off the component list stayed listed when the parse couldn't decide it, as
`export const Menu = MenuPrimitive.Root`: reading its file again kept its `included` mark, and the type checker skips
marked components. My calls:

- **The mark follows the person's list.** `correctedSources` takes the mark off any component whose export is no longer
  in `include`, every time it runs. Nothing else sets or clears it, so the mark always says whether the person listed
  it.
- **One taken back stays listed until the checker reads its file.** It's left as any export the parse can't decide is
  after files change, so the checker confirms or drops it in the check that follows the read. Dropping it at once would
  take it off the canvas and put it back when the checker does recognise it.
- **An export still on the person's list keeps its mark** through files being read again, so it doesn't drop off and
  come back.
- **PAR-581 needed only its test.** PAR-566's step already lets removed ids go before new components get theirs, so a
  component the checker finds keeps an id it took off the list in the same check.

## A component's name goes in only where it fits (PAR-518)

A component that takes children is inserted with its name as text, so it isn't an empty box. The preview survey found
parts whose box has a fixed size showing it cut off: "Avata", "C", "Marke", the end of "AttachmentAction". Nothing in a
component's props says how big its box is, so my calls:

- **A component's own classes say whether it sets its size.** The props reader looks at the classes on the outermost
  element a component returns, in a project's source or a library's compiled JavaScript, and marks it `fixedSize` for a
  width (`size-8`, `w-10`, `w-(--sidebar-width)`), a height under a line of text (`h-px`, under 16 pixels) or
  `@container`, whose width doesn't come from what's inside. Classes for the element's own states (`data-horizontal:`)
  count; ones it takes from a parent (`group-*:`) or gives what's inside (`[&_svg]:`) don't. It reads Tailwind's names
  only, which is what shadcn and the libraries Parity ships are written in; a component styled another way keeps its
  name. Measuring the drawn label instead would take a second draw for every preview and an edit after every insert.
- **A library's samples decide its parts' children.** A part with a sample gets what the sample gives, and no name when
  it gives none: its examples use a Separator, a Checkbox or an icon button without text. Before, only a sample that
  spelled out children replaced the name. A part without a sample of its own takes the children the first of its
  library's other samples to use it gives it, which for MarkerIcon and AttachmentMedia is none (elements the sample
  can't show, their icons). Only the label changes; a part's props still come from its own sample.
- **A part no sample shows keeps its name,** as do the project's own components that don't set their size, since the
  name is still the best sign of what was placed. ItemSeparator and SidebarSeparator wrap nova's Separator, whose
  classes are on the Separator, not theirs, so they still show a cut name; reading through to the component a part
  returns would cover them.
- **A narrow Card stays narrow.** nova's Card in its preview is a narrow column because its CardHeader is a
  `@container`, which takes no width from its text in a preview drawn at the width of its content. That's the preview's
  width, not a name, and isn't changed here.

## Hide in and Show in name where the change lands (PAR-497)

Called on 2026-11-05, for your approval in Storybook. The Layers row's menu said "Show in Default" for a layer that the
variant option shown on the board hides, though the change goes to that option. It now names whatever takes the change,
as `boardTarget` decides it: the option shown, in the base state, whether or not that option is what hides the layer;
any other state, since a state takes changes over the variant. Core's `editTargetName` gives the name, so the menu and
the inspector's note ("change every variant, not only Large") read it the same way.

## The start page is built: Home and new tabs (PAR-605)

You asked on 2026-11-05 to build the start page's Home and New tab from the explorations (Parity/Explorations/Start
page), with whatever Parity can't do yet stubbed. My calls:

- **Home is a tab pinned first in the strip,** an icon only, which can't be closed. It shows when it's chosen, and
  whenever no tab is, so closing the last tab lands there, and a fresh install starts there. The window remembers
  whether it was on Home and comes back to it, reopening the saved tabs behind it.
- **Home's shortcut is Alt+Home,** which browsers use for their home page; the exploration's Ctrl+Shift+H already runs
  Hide or show. Ctrl+Tab and Ctrl+Shift+Tab go round with Home first.
- **The strip's + and Ctrl+T open a new tab,** at the end of the strip, rather than the folder picker. A project opened
  from it, by its cards, Open, the File menu or search, opens in that tab. A project that's already open elsewhere is
  switched to, and the new tab it was picked from closes, since a project opens once. New tabs aren't saved, and agents
  don't see them: with Home or a new tab showing, a call that names no tab says no project tab is active.
- **A project is named by its folder,** as File > Open recent names it, and its card says when it was last opened. The
  window keeps that time and whether it's starred beside the recent list (`parity.projects` in local storage, checked
  with zod as it's read). Starred keeps a project after it leaves the recent list; All projects is the recent and
  starred ones together.
- **Ctrl+K finds your projects as well as actions,** so the start page's search does something real. Projects come first
  on Home and in a new tab, and last in a project.
- **What can't work yet is in place and says so.** Each project's picture is a placeholder, a board and a phone in a
  color of its own with its initial, until Parity keeps a render of each project. For you says nothing needs you, and
  Shared with you is empty. New project waits on the scaffolder (PAR-284) and offers to open a folder instead (a
  project's menu has no New project from this until then, PAR-188); cloning, Copy link, Invite people and New
  organization say they aren't ready yet. The organization switcher shows Personal alone. The exploration's inbox and
  account in the title bar, and people working in a project right now, are left out until they exist.
- **Home names the page and, in a project, its first screen.** A project with no `.par` file still opens on a Home
  screen (PAR-561). The two don't meet: the page is a tab in the window's strip, and the screen is on a project's
  canvas.

## Projects' pictures are taken from the canvas's bitmaps when saved (PAR-607)

You asked on 2026-11-05 for a picture of each project's interface on the start page, and suggested taking it again
whenever the project is saved. The start page now shows each project's first screens as last saved (see editor.md, The
start page). My calls:

- **Taken from the bitmaps the canvas already has,** not drawn again. Every frame on the canvas has one, kept on disk or
  captured a second after it settles (PAR-158), so a picture costs no offscreen render. The frames in each board's first
  row note what they show, so the picture reads the same bitmaps. They're a quarter of the frame's size, 320 pixels
  across for a 1280 desktop frame: sharp at a card's size on a 1x screen, a little soft in Home's Continue picture on a
  2x one.
- **Two seconds after the project opens and after each save,** once the canvas has drawn the frames and has every bitmap
  it's waiting for, so its own come first. A run of saves, as with Save automatically, takes one. A picture is never
  taken with edits unsaved; it waits for the next save. Opening covers projects not saved since this landed, as the
  issue asks.
- **Screens with a phone frame beside them first,** up to five, then the rest, each in Layers' order. The issue's
  picture is a desktop frame with the phone beside it, which a screen showing both gives; in the example the first
  screen in Layers is Button, a design without a kind, which is a single button in a desktop window. Components and
  frames aren't pictured. The phone is the first mode beside the main one whose viewport is a phone, by its device or
  else by being under 600 wide. A board that shows none is pictured by its main frame, and one whose main frame is a
  phone shows it alone in the middle.
- **One JSON file per project in app data, not in the bitmap cache.** It's `<userData>/pictures`, which main gives the
  service as `PARITY_PICTURE_DIR`. The cache's 30-day and 200 MB sweeps would drop the pictures of projects Home still
  lists, and Clear bitmap cache would blank Home. One file holds the whole picture, its frames as data URLs, so a reader
  never finds half of one; the example's five screens come to 72 KB. Each frame is cut to the top of its window before
  it's kept, as that's all a picture shows. A picture goes when the start page stops listing its project: the window
  tells the service which projects it lists whenever its notes change.
- **Drawn as the canvas draws a board,** each frame the shape of its window, or shorter where the frame is, on the
  placeholder's backdrop in the project's own colors. Cards flip through the screens as the exploration's do, the
  picture split into as many strips across as there are screens. Home's Continue picture names the frames instead, as
  the canvas's titles do, and doesn't flip.

## Moving, resizing and nudging are one editor module (PAR-577)

Resizing a layer ran through five places in two packages, and the overlay's `startResize` had to call them in the right
order. PAR-33 had left moving an absolutely placed layer by its insets with nudging in the app (see Packages, above).
You reopened that call on 2026-11-04, since resizing needs both halves in a fixed order. Now `move-resize.ts` in
`@parity-app/editor` holds the rules, and the canvas measures and writes (see editor.md, Resize handles). Nothing people
see changes. My calls:

- **One file, not one per gesture.** Insets, resizing a layer or a frame, dragging an absolutely placed layer and
  nudging share their rounding, which sizes a handle changes, and how a layer's insets move. Where handles go
  (`handles.ts`) and snapping (`snap.ts`) stay files of their own, which the module calls. `resizeStart`, which reads a
  layer as the board shows it, moved from `handles.ts` into the module.
- **The canvas measures, the module decides.** For a layer, the overlay measures its box, its parent's inside and, for
  one placed absolutely, where its sides are drawn and what it snaps to. For each pointer move, `layerResize` gives the
  style and where its edges snapped: snapped edges taken exactly, Shift on a corner not snapping, and `grow` taken away.
  `frameResize` takes the frame's box and gives its size, and double-clicks are `layerSizeReset` and `frameSizeReset`.
  The overlay still chooses what to measure from the style the board shows, since an absolutely placed layer's insets
  and siblings cost layout reads that a layer in a layout doesn't need.
- **`LayerSnapping` measures and shows; it no longer snaps.** `absoluteDrag` and `layerResize` call `snapLayer` with
  what it measured and give back where the layer locked, which its `show` draws, or clears when nothing locked. Its
  Chrome test calls `snapLayer` with what it measured.
- **One half-pixel rule.** A snapped resize and a snapped drag went to the half pixel in two ways, one counting pixels
  and one counting steps (PAR-551). Both use one rule now, in steps, and so do the half steps an inset moves in.
- **The 4-pixel drag threshold is the editor's.** `resizeGesture` needs it and the canvas's gesture lifecycle (PAR-568)
  imports it, so it's still written once.
- **A frame snaps back by the fill distance.** A frame's width and content height came back within 6 screen pixels, a
  number the overlay called `snapDistance`, though snapping a layer goes by 8. It's `fillDistance` now, the distance a
  layer's edge fills by.
- **The tests moved as they were.** The insets, resize and nudge tests, and `resizeStart`'s from `handles.test.ts`, are
  in `move-resize.test.ts`, with one fixture renamed so they can share a file. The app's `nudge.test.ts` keeps the
  presses on the real stores. Resizing a frame, the double-click resets, `grow`, a resize's snapped edges and the drag
  have tests from boxes now.

## Style editing for a selection is one editor module (PAR-567)

The inspector's style rows were wired three times, in the layer panel, the several-layers panel and the stories, each
working out where edits go, what differs and the parent's layout by hand, and each row named its keys three times apart
from what its edit wrote. Now `style-editing.ts` in `@parity-app/editor` holds the rules, and the app keeps the views,
measuring, previewing and the store (see editor.md, Typing, stepping and scrubbing). My calls:

- **A row's keys are what its edit writes.** `styleRows` lists each row's keys once, and a row's edit is typed to write
  only those. Where an edit wrote more than the row reset, the row took the extra keys: Placement resets the insets it
  sets, Width and Height reset the `grow` they replace (only along the parent's direction, where `grow` fills), Type
  resets the columns a new grid gets, and Resizing resets `grow` (PAR-582). So resetting one of these in a state takes
  back everything its edit wrote, and the row shows as changed or mixed by any of them.
- **One wiring for every panel.** `chrome/style-editor.ts`'s `useStyleEditor` is how the layer panel, the several-layers
  panel, the screen-container exploration and the stories edit style. The stories used to edit the state alone and read
  changes from it; now they edit the variant shown too.
- **Edits work from each layer's own style.** Switching to a grid, placing absolutely and changing a size used the
  shared style; now each layer keeps its own columns, insets and `grow`, as a field's edit already did.
- **The parent is read as the board shows it, inside instances too.** A layer inside an instance read its parent as the
  component has it, without the copy's or the variant's changes; it's read as that copy shows it now.
- **Several layers can include layers inside instances.** The several-layers panel skipped them; they're edited as each
  copy's changes now, as one such layer is.
- **It works out the state itself,** from the one the layers were picked in, with `editingState` from `editing-state.ts`
  (PAR-551), so a panel passes the picked state rather than a `StateSpec`.

## Installed packages are read one way (PAR-573)

The architecture review of 2026-11-04 found that finding an installed package and the file it points to was written
three to five ways, and the copies disagreed. One reader in `@parity-app/project`, `packages.ts`, now does it for the
project's discovery, libgen, the Tailwind adapter and `parity lib check`, and the old copies are gone. My calls:

- **The reader is a set of functions over a package's folder and manifest.** `findPackage` looks in `node_modules` from
  a folder up, as Node does, follows pnpm's links and never uses NODE_PATH. `readPackage` reads a folder's manifest.
  `packageEntry(pkg, use, subpath)` gives the file an entry point leads to for `types`, `runtime`, `source` or `style`,
  `packageStylesheet` the stylesheet a project imports, and `exportedComponents` what a module exports through both
  kinds of re-export. The Tailwind adapter now depends on `@parity-app/project` for them, as the edge may depend on
  readers.
- **Manifests are read through core's `packageManifest`,** which gains the fields the reader needs: `version`,
  `exports`, `types`, `typings`, `module`, `main`, `style` and `workspaces`. PAR-597 adds the rest. A manifest that
  isn't JSON, or has a field of the wrong type, throws with the file and the JSON pointer:
  - Discovery leaves that package out and says why in its notes.
  - Detection treats it as not installed.
  - A workspace skips it, as package managers do.
- **Conditions are tried in the order each use wants them,** as every copy did, rather than the order the package writes
  them:
  - Declarations: `types`, `import`, `default`, `require`.
  - The module Node imports: `node`, `import`, `default`.
  - Source: `source`, `types`, `import`, `default`.
  - A stylesheet: `style`, `import`, `default`.
- **The rest of `exports` is read as Node reads it:** patterns (`./icons/*`, the longest prefix first), `null` for a
  private path, fallback lists and conditions written for the one entry point. Without an entry in `exports`, the older
  fields are read, and declarations beside the module (`dist/index.d.ts` for `dist/index.js`), as TypeScript reads them.
- **A built file is traced to its source by its path.** The build folders at the start of the path (`dist`, `build`,
  `lib`, `out`, `esm` and `cjs`) become `src`, so `dist/esm/card.js` was built from `src/card.tsx`. Before, a build
  folder's name anywhere counted, so a workspace package whose `main` was `src/lib/index.ts` was read from
  `src/index.ts` when it had one, and not at all when it didn't.
- **Re-exports follow JavaScript's rules.** `export *` doesn't bring a module's default export, and
  `export { default as Dialog }` brings it under its new name. A library's declarations now follow `export { A } from`
  as well as `export *`, which only the workspace copy did.
- **The Tailwind adapter loads `@tailwindcss/node` through its `import` condition,** since it loads it with `import()`.
  It used the `require` one, which is what `createRequire` resolved to. The theme reads the same.
- **Hand edits are read one way, in `@parity-app/registry`:** `withEdits` and `readLibraryEdits`. A shared edits file
  may have comments, as discovery and libgen allowed; `parity lib check` read it as plain JSON. `parseJsonc` moved to
  core so the registry can use it.
- **The registry picks each package's newest file by semver,** with its hand edits applied (`newestEntries`). The
  library catalog compared versions as text, so 10.0.0 came before 9.5.0, and `parity lib check` took the first file
  with the library's id by file name.
- **Buildkit's presets no longer name `tailwind.css`.** It's the first of the usual stylesheet names in their `exports`,
  so it's found as any package's stylesheet is.
- **PAR-587's case now works.** A library's components come from its declarations found in `exports` too, so a package
  whose types are only there lists them. PAR-587 adds its test.

## Signing in goes through WorkOS in the browser (PAR-610)

You asked on 2026-11-05 for Google, GitHub and Microsoft sign-in through WorkOS, chosen for its organization support.
The design is in [proposals/sign-in.md](proposals/sign-in.md), and the work is PAR-611 to PAR-616. Your calls, each
taking my recommendation:

- **The sign-in screen is the Centered form story.** AuthKit, in the browser, sends a work email to its company's single
  sign-on or a code by email. The Email first stories have the code typed into Parity, which needs WorkOS's API key and
  so a server.
- **Parity talks to WorkOS itself, with no new library:** a public client with PKCE, on `fetch` and zod, in a new
  `@parity-app/account` package. `@workos/authkit-electron` was passed over: it's at 0.1.2, needs an older
  `@workos-inc/node` than Better Apps uses, and brings `electron-store` and its own React provider.
- **Signing in is optional.** Nothing that works on local folders asks for it.

My calls:

- **Installed apps hand back through `parity://auth/callback` on WorkOS's production environment, and `pnpm dev` copies
  through a loopback port on the sandbox,** since several copies run at once and only an installed app gets the scheme.
  A copy that gets a link it didn't start passes it, through the agent registry, to the copy whose `state` it is.
- **Only `safeStorage` keeps the refresh token,** and the window never sees a token.
- **The client IDs go in the code,** since they're public. The API key never ships in the app.
- **Better Apps checks the desktop's access token with the WorkOS SDK, not a new JWT library** (PAR-615). Its WorkOS
  identity takes the token as a bearer, checks the signature against WorkOS's JWKS, and checks the issuer against the
  one WorkOS publishes. A dev copy's real Staging token, decoded in main on 2026-11-06, has the published issuer,
  `https://api.workos.com/user_management/client_01M6Q2PGV0Z2R7CXZBFRJH150R`. It names Staging's own client, not
  Parity's (`client_01M6Q30XB58AF2CEHTE79ACMWS`), so the expected issuer comes from WorkOS's
  `/.well-known/openid-configuration`, never from Parity's client ID.

## Signing in is data in and data out in `@parity-app/account` (PAR-613)

The package holds sign-in's logic, with no Electron, files or network, as [proposals/sign-in.md](proposals/sign-in.md)
sets out. Main passes in `fetch` and keeps what it returns. My calls:

- **A refresh sends only the client ID,** as WorkOS's own browser client, `authkit-js`, does for its public clients. The
  AuthKit reference lists `client_secret` as required for a refresh, so PAR-612 checks it against the sandbox along with
  switching organization.
- **WorkOS's answers end in one of three ways:** a session, refused, or unavailable. 408, 429, a 5xx, a failed request
  or an answer without a user and tokens is unavailable, and a refresh tries again after 5 seconds, doubling to 5
  minutes. Any other refusal ends the session, and the person signs in again. `authkit-js` draws the same line.
- **Main refreshes a minute before the access token expires,** or halfway through its life when that's later. WorkOS's
  tokens last 5 minutes, so that's every 4.
- **Main reads the access token without checking its signature.** It comes straight from WorkOS over HTTPS, and main
  only reads who it names and when it expires. Parity's service checks signatures against WorkOS's keys (PAR-615).
- **The link the browser hands back is refused when it isn't the redirect URI or its `state` is missing or another
  sign-in's,** so a copy of Parity that didn't start the sign-in passes it on. `access_denied` reads as declined, and
  any other `error` as failed, with WorkOS's description.
- **The package returns codes, not text.** The screens word what happened (PAR-614).
- **PKCE and `state` use Web Crypto,** a global in Node and Electron, so the package stays pure. Each is 32 random
  bytes, base64url-encoded, and the challenge is S256, the only method WorkOS takes.

## Parity's own telemetry goes to Sentry, on by default

The plan is [proposals/product-telemetry.md](proposals/product-telemetry.md), and the work is the Product telemetry
stream in Linear. You set its direction on 2026-11-05, after a first draft that kept everything local unless people
opted in: "we actually need to log the telemetry to the Sentry service. The app is still in development and not
released, so all of our testers expect to have the telemetry collected. Mostly it's agents running test passes, so we
need to default on." The aim is that agents "capture traces and replays so the agents can file bugs, pick them up, and
address issues with actual context."

- **Sentry receives it:** errors, crashes, traces, structured events and replays, through `@sentry/electron` in the app
  and `@sentry/node` in the CLI. Adding both is approved with this direction.
- **On by default, at its fullest level, everywhere Parity runs,** development and CI included, each tagged with its
  environment. Settings and `PARITY_TELEMETRY` turn it down or off; unit tests leave it off.
- **Names, paths, values and messages are sent as written.** My call: secrets are still scrubbed (keys, tokens,
  passwords, `.env` values), since a leaked key is never what makes a bug findable.
- **Session Replay records the editor window unmasked,** every session while testers and agents are few.
- **The CLI sends too, at the same level, read from the same setting.** My call, since agents drive Parity through it
  and their calls are half of each trace.
- **All of this is revisited before the first public release,** in its own Backlog issue.

## Sentry is set up in better-apps, by hand (PAR-617)

What's there and how it was done is in [sentry.md](sentry.md). You chose on 2026-11-05 to have a project for every
surface now, "parity-web, and parity-dashboard" beside the app and CLI, and that it all belongs to
`admin@betterapps.io`: "I can't have it in my personal account." My calls:

- **Five projects, one team:** `parity-desktop`, `parity-cli`, `parity-web`, `parity-dashboard` and `parity-api`, all
  owned by the `parity` team. The proposal's two are the first two; the others wait for their surfaces.
- **The DSNs are in the repository,** in [sentry.md](sentry.md) for now. PAR-620 and PAR-642 put them in the app's and
  CLI's build config as they add the SDKs that read them.
- **Not in Terraform yet,** although cloud services come from Terraform. The pipelines' templates can't pass a Sentry
  token, so the module waits for that change; sentry.md lists what was done by hand so it can be imported.
- **The organisation is on a Business trial until 2026-11-19,** which you had started so the free plan's one-member
  limit didn't block the handover. Whether to pay for a plan is yours: the Team plan adds alerts that file Linear issues
  and a larger replay quota, which the agent loop relies on.

## Sentry files Linear bugs (PAR-622)

Two alerts turn what Sentry sees in the app and the CLI into bugs in PAR's Todo, as the plan's "Agents in the loop" sets
out. What they are and how they behave is in [sentry.md](sentry.md#alerts). My calls:

- **Two alerts, each covering both projects:** one for new issues and regressions, one for user feedback. Feedback gets
  its own so it can file every report with no interval, since each report is its own Sentry issue.
- **Every environment files,** `development` and `ci` included, as PAR-622 asked: agents' test passes are where most
  bugs are found now.
- **Filed bugs have no priority.** Sentry can't tell how much a bug matters, so whoever picks it up from Todo sets it.
- **Spikes don't file.** Every Sentry issue already has its bug from its first event, and a spike would only file a
  second one for it. Rate alerts, such as crash-free sessions and failing agent operations, are PAR-643's.
- **A regression keeps its bug.** Linear reopens the linked issue when Sentry marks a regression, and the alert's action
  doesn't file a second one, so the regression trigger only matters for an issue with no bug yet. It reopened in Backlog
  until PAR-668 made Todo the team's default.
- **At most once in 30 minutes for errors,** Sentry's default, so an issue going in and out of resolved doesn't churn.
- **Written down, not in Terraform,** like the rest of Sentry's setup until the pipelines can pass a Sentry token.
- **They depend on the plan.** If the trial ends on 2026-11-19 without an upgrade, these alerts may stop filing, as
  PAR-617 noted above.

Tried on 2026-11-06 by sending an error and two reports to `parity-desktop`'s DSN: each became a bug (PAR-663, PAR-664,
PAR-666). Closing PAR-663 resolved its Sentry issue, resolving that closed PAR-663 again, and the error from a later
release reopened it without a second bug. PAR-620's own check in a development build filed its errors too (PAR-659 to
PAR-661 and PAR-665), along with a real one it hit (PAR-662).

## Regressions reopen in Todo, and agents read the rest in Sentry (PAR-668)

PAR-668 asked for the release, environment and `test_run` on the Linear bugs Sentry files, and for regressions to reopen
in Todo. Neither has a setting: Sentry's "Create a Linear issue" action has no description field, and Linear's Sentry
integration has no settings, its reopen state included. Linear's Loops could do both, but they spend AI credits, which
the workspace on Linear's Basic plan doesn't have. You chose on 2026-11-09 to make Todo the default and nothing more. My
calls:

- **Todo is the Parity team's default status,** in place of Backlog. Linear reopens a linked issue in the team's
  default, so a regression lands in Todo. Issues created without a status land there too, which matches
  [work.md](work.md#statuses-priorities-and-labels): Todo is planned work, and Backlog is set on purpose.
- **The release, environment and `test_run` stay in Sentry.** Agents read them through Sentry's MCP server, as
  [work.md](work.md#bugs-from-sentry) already says. Putting them on the bug would need a Sentry internal integration
  whose webhook reaches a small worker that comments on the Linear issue, with a Linear API key: code and a service of
  its own, for what an agent reads in one call.
- **Written down, not in Terraform.** It's a Linear team setting, recorded in [sentry.md](sentry.md#done-by-hand).
  Nothing here depends on Sentry's Business trial.

Tried on 2026-11-09 by sending an error to `parity-desktop`'s DSN from release `parity-desktop@0.0.668-a`: it filed
PAR-762 in Todo. Resolving its Sentry issue closed PAR-762, and the same error from `parity-desktop@0.0.668-b` reopened
it in Todo. Sentry's MCP server showed that event's release, environment `development` and `test_run` `par-668-check`.
PAR-762 was then canceled as a test.

## Sessions read Sentry through its MCP server (PAR-628)

Agents picking up a bug Sentry filed read its events, trace and replay first, as the plan's "Agents in the loop" sets
out and [work.md](work.md#bugs-from-sentry) says how. My calls, which you approved on 2026-11-06:

- **Configured in the repository, for both tools,** so a fresh worktree has it: `.mcp.json` for Claude Code, with
  `.claude/settings.json` turning it on without a prompt, and `.codex/config.toml` for Codex.
- **Sentry's hosted server, scoped to `better-apps`** by its URL (`https://mcp.sentry.dev/mcp/better-apps`), so tools
  don't ask which organisation, and nothing runs locally.
- **Each session signs in with OAuth** as `admin@betterapps.io`, the organisation's only member. No token is kept in the
  repository.
- **`PARITY_TEST_RUN` and `parity report` are in the guidance before they exist,** since work.md is where a test pass
  looks. `parity report` is PAR-646's.

Tried on 2026-11-06 by picking up PAR-662 through Sentry's MCP server: its Sentry issue (PARITY-DESKTOP-3) gave the
stack, tags, release and environment, its breadcrumbs showed the clicks and the window loads before it, and its trace
held the event's two errors. The trace had no spans and there were no replays yet, since those are PAR-627's and
PAR-624's. Both Claude Code (`claude mcp get sentry`) and Codex (`codex mcp get sentry`) load the server from a fresh
worktree.

## The app records its own startup, quitting, updates, memory and slow work (PAR-631)

The events are in [telemetry.md](telemetry.md#events), from `app-events.ts` in `@parity-app/telemetry`, which also holds
the rules for when each is sent. My calls:

- **`app.started` waits for the first paint and the service,** and leaves out the first project shown, which has an
  event of its own (PAR-694): `app.first_project`, from the process starting to the first project's tab being ready to
  draw, as its `project.loaded` reaches main. It's apart because a window can stay on Home, and holding `app.started`
  for a project would lose it, and the run it starts, whenever none opens. `restored` says whether the window opened the
  project as it started, from last time's tabs, so a person's time choosing one can be told apart.
- **`app.quit` says `window closed`, `update` or `other`.** Parity doesn't restart itself after a crash, so the
  proposal's "crash restart" has nothing to report.
- **`update.installed` is recorded as the app quits to install,** since the new version can't tell it was just
  installed.
- **The long-task event is `renderer.long_task`,** not the proposal's `renderer.longTask`, since event names are
  lowercase. Its `action` is the input in the 100 ms before or during the task, from `PerformanceObserver`'s `longtask`
  entries.
- **Main's own hangs still come from the late-timer check** (PAR-620); `service.lag` uses the same check at 200 ms.

## Errors, crashes and hangs go to Sentry from every process (PAR-620)

`@sentry/electron` 8.3.0 starts in main, the editor window, the offscreen renderers and the service, and sends to
`parity-desktop`. My calls:

- **Main decides what leaves the computer.** Windows and the service always start Sentry and send through main, whose
  client is off when `PARITY_TELEMETRY=off` or `DO_NOT_TRACK=1` is set, or under Vitest. The decision is
  `telemetryLevel` and `telemetryEnvironment` in `@parity-app/telemetry`, so the CLI can share it (PAR-642). A
  `PARITY_TELEMETRY` value that isn't `all`, `errors` or `off` stops the app, rather than sending what someone meant to
  turn off. The Telemetry setting is PAR-626.
- **Environments:** `ci` wherever `CI` is set, `tester` for an installed build, and `development` otherwise.
- **The `process` tag uses the telemetry envelope's names** (`main`, `renderer`, `render`, `service`, `worker`,
  `builder`), set on each event. Sentry copies a window's scope into main's, so a scope tag would have labelled main's
  own errors as the window's.
- **Windows report only errors thrown from Parity's own pages** (`allowUrls` is the page's origin). A project's
  components run in the same page, and their errors are the project's to show, not Parity's bugs.
- **React errors go through the root's `onUncaughtError` and `onCaughtError`,** with their component stack. Boundaries
  around the canvas, panels and dialogs need a fallback UI designed first, so they're PAR-667.
- **Main's hangs are measured by a late timer, not Sentry's native hang detection,** which needs a module built for
  Electron's ABI that the build doesn't ship. It reports how long main was stuck, though not where; PAR-631 can bring in
  the native module. Windows' hangs come from their `unresponsive` and `responsive` events.
- **Exits:** a window or child process that exits abnormally, fails to launch or runs out of memory is reported, along
  with crashes' minidumps. The service's restarts are breadcrumbs. A builder that stops by itself is reported with its
  last 50 lines of output, and the props worker's failures from the service.

## Every build is a Sentry release, with its source maps (PAR-625)

How it runs is in [sentry.md](sentry.md#releases-and-source-maps). My calls:

- **Published builds are named by version, as `parity-desktop@0.21.0`, and every other build by its full commit hash,**
  as the plan says for installed, development and CI builds. My call: "published" means the release workflow built it,
  which marks it beta, so a pull request's preview installer, which also runs as `tester`, doesn't join a version's
  release with code that isn't in it. `telemetryRelease` in `@parity-app/telemetry` decides, so the CLI can share it. A
  build whose commit isn't known is `parity-desktop@<version>+unreleased`. `dist` is the platform and architecture, such
  as `win32-x64`, and an installed build tags its events with `update_channel`, stable or beta, the update preference,
  which changes as the person changes it.
- **Maps are matched by debug ID, not by file name and release.** `sentry-cli sourcemaps inject` gives each bundle an ID
  from its contents and its map, so the same code gets the same ID on every system and every run. One upload then covers
  all three installers, and a renamed or moved file still resolves.
- **Every system names pnpm's folders the same (PAR-685).** pnpm shortens `node_modules/.pnpm`'s folder names to 60
  characters on Windows and 120 elsewhere, so the window's map listed different paths on Windows and its debug ID
  differed: the Windows installer's stacks stayed minified while macOS's and Linux's resolved. `pnpm-workspace.yaml`
  sets `virtualStoreDirMaxLength: 60` everywhere, Windows' own length, so Windows installs don't change.
- **The release workflow builds the published version again to upload its maps.** The shared release template builds the
  installers with one secret, the tldraw key, and changing it was out of scope, so a job after it checks out the
  version's tag, builds it on Ubuntu with the same key and channel, and uploads. Its bundles match the installers'
  because the build is the same on every system. Events that arrive in the minutes before the upload stay unresolved.
- **CI uploads the Windows build's maps,** the build it installs and starts, as the commit's release. Only main's
  commits are tied to their release, since a pull request's merge commit isn't kept. A failed upload doesn't fail CI's
  run, which releases wait on.
- **Preview installers' maps come from the same rebuild (PAR-685).** `preview.yml` builds the pull request's commit
  again with the tldraw key, as the template does, and uploads as the commit's release, through the reusable
  `upload-sourcemaps.yml` that the release workflows use too. The tldraw key changes the window's bundles, so CI's
  upload of the same commit, built without it, doesn't cover them. Changing the shared preview template to keep the maps
  would touch every repository that uses it, for the same result.
- **Development builds resolve without an upload.** `pnpm dev` starts Electron with `--enable-source-maps`, so main's
  and the service's stacks name the source files and lines before Sentry sees them; the window's modules are already the
  source files Vite serves. A frozen copy, which `pnpm perf` measures, leaves it off.
- **Electron's own native symbols come from Sentry's built-in Electron symbol server,** a project setting, not an
  upload. Parity ships no native code of its own yet; sharp's prebuilt binaries come without debug files.
- **`@sentry/cli` 3.8.2 is a devDependency of the app** (your call, 2026-11-06), run from `scripts/build.ts` and
  `scripts/upload-sourcemaps.ts`, rather than Sentry's esbuild and Vite plugins, which wrap it. PAR-719 moved it, with
  those scripts' Sentry parts, to the workspace's root, where the CLI's build uses them too; see "The published CLI's
  source maps go to parity-cli" below.

## Sentry watches agent failures and crash-free sessions (PAR-643)

The plan's "Releases, dashboards and alerts" asks for two rate alerts and one set of dashboards. What exists and their
links are in [sentry.md](sentry.md#alerts). My calls:

- **Thresholds are the plan's:** a crash-free session rate under 99% in `tester`, and agent calls failing more than 5%
  of the time. Each is measured over the last hour, so one bad minute doesn't file a bug and a test pass's failures
  still count together. Both resolve once the rate is back past the line.
- **One monitor for every agent operation,** not one per `method`. Sentry's metric monitors watch one number each, and a
  monitor per method would need a new one for every method agents gain. The dashboard's "Agent error codes by operation"
  says which method is failing once the alert fires.
- **Agent failures count in every environment,** `development` and `ci` included, as PAR-622's alerts do: agents' test
  passes are where agent calls happen now. A cancelled call isn't a failure, as Sentry's `failure_rate()` counts it.
- **Crash-free counts only `tester`.** CI and development builds are stopped by their tests and by people restarting
  them, which would read as crashes.
- **Monitor breaches file Linear bugs through their own alert,** "File monitor breaches in Linear", with the same action
  as PAR-622's. PAR-622's alert watches issue streams, so a monitor's issue doesn't reach it. One monitor issue is one
  bug, reopened if the rate goes past the line again.
- **One dashboard,** "Parity", for both projects, filtered by environment and release, rather than a dashboard per view:
  every view is a few widgets, and one page with shared filters is quicker to read a test pass or a release from.
- **Still by hand, not in Terraform.** PAR-658 brings Sentry into Terraform once the pipelines pass a Sentry token. The
  dashboard waits for someone to make it in Sentry's UI (PAR-716), since Sentry's MCP server can't create dashboards and
  agents have no token that can. The crash-free monitor waits for the first `tester` event (PAR-714).
- **Nothing here needs Business on purpose,** but it was made during the Business trial and Sentry's docs don't say
  which plan limits custom dashboards and metric monitors. After the trial ends on 2026-11-19, check that the monitors
  are still on and the dashboard still opens.

## The rest of signing in is designed (PAR-614)

You asked on 2026-11-05 for every missing sign-in design before PAR-612 builds it. The stories were under
Parity/Explorations/Sign in until the app built them (Parity/Sign in, PAR-798), and the screens they settle are in
[proposals/sign-in.md](proposals/sign-in.md#the-screens). My calls:

- **The stories are one prototype,** each starting at a different point, as the start page's are. The browser can't be
  driven from a story, so while Parity waits, a panel marked Prototype plays it: sign in, cancel there, hit an error, or
  use an account WorkOS turns down. The sign-in screen and Waiting for browser now work too.
- **Signed out, the account spot is an outline of an avatar** that opens the same menu, with Sign in where your name
  goes. Agents, settings and help stay in it, since none of them needs an account; Sign out goes. There's no Sign in
  button in the title bar, so it doesn't nag, but Home offers it twice more: in For you, and in the organization
  switcher's menu. The inbox is left out until you sign in.
- **Sign in from the title bar opens the sign-in screen in a dialog over Home,** without the link to skip it. Waiting
  and what went wrong show in the same dialog, and only Cancel, Escape or its close button end it.
- **"Open a folder on this computer without signing in" opens the folder picker,** as it says, over Home, which stays if
  the picker is closed.
- **Signing out asks nothing.** Open tabs stay, and a toast says "You're signed out" and that projects on this computer
  stay open.
- **Signed out, Home is Personal, listing every project on this computer,** as the built start page does now, since
  Parity can't tell which organization a folder belongs to. It leaves out people's presence and what they did, which
  come through an organization, and keeps what agents on this computer did.
- **Someone in no organization yet** sees their email in the account menu where the organization and role go. Home's
  switcher has Personal alone, and its menu offers New organization (PAR-616) but not Invite people, which needs an
  organization. For you and the inbox only show what comes from organizations you're in.
- **Waiting for browser never gives up on its own,** since the person may still be signing in. After 30 seconds it says
  what to do if the page didn't open or opened in the wrong browser, and Open it again becomes the main button. Cancel
  goes back to the ways in, or closes the dialog.
- **Sign-in can end four ways without a session,** each saying what to do next. Nothing open changes in any of them.
  - Canceled in the browser (`access_denied`): Try again, or Choose another way.
  - An error, handed back or from trading the code: "Parity couldn't sign you in", with Try again and Details that hold
    what WorkOS said, to copy for help.
  - WorkOS turns the account down: it's named, with Choose another way and Details.
  - The organization requires single sign-on (`sso_required`, or `organization_authentication_methods_required`):
    Continue with single sign-on opens the browser at it. WorkOS's answer names neither the organization nor its
    identity provider, so the screen doesn't either.
- **A `pnpm dev` copy's loopback answers once the code is traded,** so its page can say whether that worked: "You're
  signed in to Parity" or "Parity couldn't sign you in", and that the tab can be closed. It's plain HTML with no
  scripts, light or dark as the system is, and says nothing about which copy it came from (your call). `handBackHtml` in
  `shared/hand-back-page.ts` is the page. Installed apps hand back through `parity://`, where the browser shows its own
  prompt.
- **Without a keyring, a toast says so once,** right after signing in: "You're signed in until you quit Parity", with
  What to do. The account menu keeps saying it under your name, and both open a dialog that explains and names GNOME
  Keyring and KWallet. The sign-in screen says nothing beforehand, since most people never meet it.
- **AuthKit's pages take the app's look through WorkOS's branding,** the same in the sandbox and production (PAR-611):
  - Global styles: display name Parity; the app icon as the logo icon and logo, since there's no wordmark; its small
    drawing as the favicon; a 10-pixel corner radius.
  - Colors, light then dark: page background `#FFFFFF` and `#0A0A0A`, buttons `#171717` and `#E5E5E5` with text
    `#FAFAFA` and `#171717`, the app's own, and links `#5432E6` and `#8A74FF`, from the mark.
  - AuthKit styles: the system's appearance, Geist, the logo icon only, a centered page titled "Sign in to Parity", the
    Last used badge, and legal links once Parity has them.
  - Custom CSS: the sign-in screen's glow on `.ak-Background`.
- **New wording uses "sign in" as a verb,** as the writing guide asks, so the new screens say "Parity couldn't sign you
  in" rather than calling it a sign-in.

## Requests over every port go through one channel module (PAR-565)

Matching replies to requests was written six times, in the preload script, the project service, its render and console
requests, the worker client and main, and the copies disagreed. Now `@parity-app/channel` owns it. My calls:

- **The channel is a package of its own, with no dependencies.** The sandboxed preload script bundles it and can load
  nothing but Electron, so it can't use zod or core. It reads a message's envelope with `typeof`. What it checks and how
  failures cross are given to it: `checks` read each request's params, and an `ErrorCodec` carries a failure's details.
  The app's `codedErrors` sends a `CodedError`'s details and checks them with `readErrorDetails` on arrival.
- **Its interface is the method maps.** `createChannel<Local, Remote>` answers `Local` and asks `Remote`:
  `ServiceMethods` and `WindowMethods` on the window's port, `MainMethods` and `ServiceProcessMethods` on the service's
  `parentPort`, and `CheckerMethods` on the type checker's worker thread. A method whose result is `undefined` may
  return nothing.
- **A channel holds requests until it has a port, and fails what a port was sent when the port closes or is replaced.**
  The preload's requests wait for main's port, and a second port, after the service restarted, fails what the old one
  was asked. The service fails what it asked a window when that window's port closes. Main fails what the service asked
  when it exits, and gives the performance stats its last builder readings when the service doesn't answer in a second.
- **Ports are adapters:** `domPort` for the preload's `MessagePort`, `nodePort` for Electron's `MessagePortMain`,
  `parentPort` and `UtilityProcess` and Node's `Worker`, and `memoryPorts` for tests.
- **Only the window's port to the service is checked.** Project code shares the window's page, so it can call the bridge
  with anything. `shared/service-checks.ts` has a zod schema for each method's params, typed against `ServiceMethods` so
  the two can't drift, and a refused request fails with `invalid_input` and the field at fault. A method the service
  doesn't have fails the same way, with `method` as the field. The other ports skip the check, as PAR-578 says.
- **What the checks cost.** On the example project's 1.8 MB `.par`, with 61 designs, checking `document.save` took 30 to
  75 ms in the service, against 9 to 15 ms to copy the document across the port. `frames.capture` with a whole design as
  its tree took 0.2 ms, and `previews.lookup` with 300 such previews 23 ms. A save waits on it, which the person doesn't
  see, so it stays.
- **The `canvas:*` IPC names are declared once,** in `shared/channels.ts`, for the preload script and main. Checking
  main's IPC arguments is PAR-592.
- **The window's answers keep their details on the way to the service,** since the preload passes them through. The
  service's answers keep them on the way to the page too (PAR-580, below).

## The page gets the service's coded errors whole (PAR-580)

PAR-565's channel already refused a request with bad params or an unknown method, and carried a coded error's details to
the preload script. The bridge from the preload script to the page then dropped them, since a failure thrown across it
keeps only its message. My calls:

- **The bridge's `canvasHost.ask` never fails.** It gives back an answer as data, `{ result }` or `{ error, details }`,
  as the page's own answers to the service already were.
- **The page asks through `request` in `renderer/service.ts`.** It throws a failure again, as a `CodedError` when its
  details check out with `readErrorDetails`, else as an `Error` with the message. `canvasHost.request` is gone, so a
  call can't skip it.
- **Stand-ins answer as the preload does,** through `preloadAnswers`, so stories and tests see the same failures.
- **A test goes the whole way:** `utility/window-channel.test.ts` sends requests from a channel set up as the preload's
  to the service's own window channel, and reads the page's errors through `settled`.

## State labels shrink as titles do, beside rows tall enough to hold them (PAR-155)

Called on 2026-11-04, for your approval in Storybook. Built on PAR-151's rule, which had state labels fade out by 25% as
captions do:

- **A state's label is a name now,** shrinking to 60% as a board's title does rather than fading, since it's how a row
  is found on a board showing every state. Captions stay detail and still fade.
- **It hides once it has under 24 screen pixels before the next row's label,** the line titles hide at, measured from
  its top to where the next row's label starts, past the dashed line between rows. A label is 36 pixels tall at screen
  size and about 22 at 60%, and that space is never under 98 page pixels, so a label that shows can't reach the next
  one. Measuring only the row beside it would hide a component's lower rows at 25% while its first row, which also holds
  the captions, kept its label. The last row is measured the same way. A row of component boards at 5% shows no state
  labels, since their rows have a few pixels each; a screen's rows keep theirs.
- **Rows are measured, not worked out.** A frame that grows with its content sets its row's height, which only the
  layout knows, so each label watches its row with a `ResizeObserver`, as the board does for its own size.
- **A label isn't clipped to the gap beside its board.** At 60% a screen's state label can reach over the board to its
  left when zoomed far out, since how far away that board is isn't known to the label. The example's boards are 400
  apart. Keeping labels to that gap would be its own change.

## A board's gutter keeps its screen size up close (PAR-602)

Called on 2026-11-05, for your approval in Storybook. PAR-540 decided the gutter (12 at the sides and bottom, a 36 band
for the captions, 24 between previews, in screen pixels, shrinking with the canvas past 40%), and its bullet said
PAR-545 would change the canvas, `boardLayout` and `boardSize`. PAR-602 has done that, so PAR-545 no longer carries the
gutter. My calls:

- **The rule is in core, beside the estimate.** `boardLayout` is now the gutter in screen pixels, and `boardLayoutAt`
  gives it in canvas pixels at a zoom: its screen size over the zoom, and past 40% what it is at 40%. The 40% line,
  `shrinkBelow`, moved to core too, and `labelLook` reads it there, so labels and gutters can't shrink from different
  zooms.
- **The divider before the companions is 12, the line and 12,** as the exploration draws it, one pixel more than the 24
  between later previews. **Rows of states are 36, the line and 36 apart:** three quarters of the 48 either side they
  had, as the gap between previews went from 32 to 24, which is the caption band's height, so a later row sits below its
  line as the first sits below its band.
- **Lines are a screen pixel wide.** The board's edge is a pixel at any zoom, as in the exploration, drawn over the
  board so it takes no room: a border a pixel wide on screen would have been 100 canvas pixels at 1%, outgrowing the
  agent's estimate. The dashed lines are a pixel up close and thin with the gutter past 40%, so they're inside the
  estimate. Both are drawn at screen size and scaled to fit, since browsers round a border up to a whole device pixel
  before the canvas's zoom, which made a quarter-pixel border four pixels wide at 400%.
- **Corners round 10 pixels, as the exploration's do, but shrink past 40%,** where the exploration's stay 10. A corner
  wider than the gutter would cut into the frames' corners. tldraw's outline of a board follows.
- **A board stays where its top left corner is,** so its frames shift on the canvas as the gutter changes with the zoom,
  as they do in the exploration: from 40% to 400% the first frame moves 81 canvas pixels up, nearer the corner.
  Anchoring the frames instead would have meant moving a design's position with the zoom.
- **The shape takes a board's new size once the camera stops** (once the zoom settles, since PAR-655). Taking it on
  every frame of a zoom would draw every board's title and menus again each frame. While the camera moves, the outline
  of a selected board is off by the change in its gutter. The gutter itself follows the zoom live, as labels do, through
  each part's own style, not a custom property that every frame's elements would inherit (PAR-556).
- **The agent's estimate takes the gutter at 40%,** where it's widest on the canvas, so it's never smaller than the
  board drawn at any zoom. A drawn board's bounds are still as the canvas has them at its zoom, so `Overlaps()` sees
  drawn boards as they are now: boards set close together up close grow towards each other as the canvas zooms out to
  40%, by 18 at each side and 54 in the band between 100% and 40%.
- **A state's label measures its row's frames, and the gutter at 40%.** A row's own height is now its frames' alone,
  whatever the zoom; the space to the next row's label adds the gutter at 40%, which is exact from there out, where a
  label can be short of space. Closer in, the line between rows alone is 73 pixels on screen.
- **Left for later:** captions still truncate and fade by 25% (PAR-151), where the exploration's drop their chips
  instead, never truncate, and stay until 10%; and a title doesn't yet drop its menus before its name.

## The app's half of an agent call is in `@parity-app/agent` (PAR-564)

The app's side of every agent call was `utility/agent.ts`, which only ran in Electron and had no tests, and each
method's shapes were declared four times. My calls:

- **`dispatch` answers by `AgentMethods`,** the map in `contracts.ts` that pairs each method's checked input with its
  answer, from PAR-590's schemas. The CLI client's `call` asks by the same map, so the request and answer types are one
  declaration. The answer schemas' objects stay open, so `dispatch` checks its answers against them with the index
  signatures taken out, which lets the agent's own interfaces stand in without a cast.
- **The seam is an `AgentHost`,** beside `AgentHooks`. `dispatch` builds each call's `AgentHooks` from it: presence,
  rendering, icon names and applying changes. It also reads tabs, snapshots, status and the console, and keeps
  screenshots. The desktop and the tests' fixture tab are its two hosts.
- **The window's snapshot is the agent's `TabSnapshot`,** declared in the agent package, as are `TabSummary`,
  `PresenceEvent` and `ConsoleEntry`, which `shared/protocol.ts` now re-exports. The workspace takes the snapshot as it
  is, with `tab` set to the tab's id, so `toAgentSnapshot`'s copy of 13 fields is gone.
- **An unknown method fails with `invalid_input` on `method`,** naming the methods there are, rather than a plain error
  the CLI reports as `app_error`.
- **Params still arrive unchecked.** `dispatch` takes them as the CLI sends them, after its own check. Checking them in
  the app with the same schemas is PAR-598.
- **Export and the window's accessibility check go through the package too:** `exportPictures` names each picture and
  `accessibility` checks a design, and the app writes the files.

## The edit target and placing at a point are `@parity-app/editor`'s (PAR-570)

You reopened PAR-7's call that `editingState` stays in `LayerPanel.tsx` "until a package needs to choose it" on
2026-11-04: there were four copies of the rule, the text editor read by one and wrote by another, and PAR-170 needs the
design and state together on the write side. My calls in moving it:

- **The selection model moved, the store stayed.** `Selection` and the functions that read and build one
  (`selectedNodes`, `layersSelection`, `toggleLayer`, `selectionKey` and the rest) are
  `packages/editor/src/selection.ts`. `SelectionStore`, hover, the tool and the React hooks stay in the app's
  `selection.ts`, since they hold state for a tab rather than rules.
- **The edit target is `editFrame`,** since core's `EditTarget` already names a state and variant. It takes what was
  picked (`Picked`: a design, and the frame's mode and state), so a selection, a hit, resize handles and the text being
  edited all go through it, and gives the design's key, its container, the state and the viewport. `editingState` and
  `activeState`, which PAR-551 had moved into `editing-state.ts`, joined it there with their tests, and the mode's
  viewport moved too. The viewport function is `modeViewport`, since core's `frameViewport` already means a frame's
  viewport from its width. `DesignStore.editFrame` looks the design up, so callers write `store.editFrame(selection)`.
- **Several designs edit the one picked last,** as the canvas menu and the inspector already read them, and a note or
  nothing has no edit target.
- **Placing at a point is one step in the app, `placeAtPoint`,** which hits, measures the layout in the frame and asks
  `slotHere`. Measuring needs the DOM, so it stays in the app; the rules (`slotHere`, `pasteHere`) were already the
  package's. Insert, image drops, Paste here and the text tool all use it. The text tool adds its layer through
  `pasteHere`, so it lands where a drop does, in the slot under the pointer, rather than after the layer under it.
- **The text editor reads and writes through `editFrame`.** That makes PAR-585's two rules one. PAR-585 stays open for
  its reproduction and test, as it asks.

## Lint, board geometry and frame reading are modules of the agent package (PAR-574)

The agent workspace had grown to 2,004 lines, and three of its parts only took data. PAR-574 split them out. My calls in
doing it:

- **Three modules, each tested on its own.** `lint.ts` takes a document and what it's checked against (components,
  tokens, icon sets, the component designs instances place, props, and the nodes the call inserted) and returns
  warnings. `boards.ts` takes boards and returns overlaps, overlap warnings and empty space. `frames.ts` takes a design,
  a state, a mode and a drawn frame and returns its problems, its accessibility findings and their contrast fixes.
- **Lint takes the inserted nodes too.** Props and unnamed layouts are only checked on what the call inserted, so that
  set is part of its input rather than state it reaches for.
- **`propWarnings` is shared.** `Update` checks a component's props as it changes them, and lint checks them on what was
  inserted, so both use the one function.
- **Accessibility's per-frame reading moved with Problems.** Both read one drawn frame, so both are frame reading; the
  workspace keeps the loop over states and modes, which draws the frames.
- **`api()` is typed by inference.** `AgentApi` is `ReturnType<AgentWorkspace["api"]>`, so it can't drift from the
  functions. PAR-564 had moved the casts from the app into `dispatch.ts`, so they're gone from there, with the
  hand-written `CheckApi` and `ReadApi`. `accessibility` now takes the workspace's `MatrixOptions` rather than `unknown`
  options.
- **The rest stays together.** The working copy, lookup, reads, edits and presence share the working copy, lookup and
  `emit`, so they stay in `workspace.ts`, now about 1,640 lines.

## Each project's TypeScript program is kept by `@parity-app/code` (PAR-603)

The program per project, its caching compiler host, when it's made again and how many are kept lived in the app's type
checker worker, which also used the React finder's internals to build it. My calls in moving it:

- **The cache is `programCache(finder)`,** in `packages/code/src/program-cache.ts`. It answers `check` and `props`
  requests as the worker's methods take them, with the root, the files to read, the files an earlier worker read
  (`known`) and the lockfiles, and `close` lets a project's program go. `program` and `roots` are there for callers and
  tests that need the program itself or which projects are kept.
- **A finder says how its programs are made,** with `programSetup(root, tsconfig)`: the compiler options, a host wrapper
  and the files every program holds besides the app's. React's gives the probe file and its host, so neither the cache
  nor the worker imports `reactProbe`, `withReactProbe` or `componentOptions`. They stay exported, since libgen uses
  them.
- **The limits are the cache's defaults:** two projects kept, and no program built below a gigabyte free. Free memory is
  an option, so the tests set it rather than mocking `node:os`. Which project was used last is a counter, not the clock,
  so two requests in one millisecond still order.
- **The worker's tests moved with the code,** as the cache's tests, and added the cases the issue asks for: a program
  reused while nothing changed, made again after a file, config or lockfile change or a new file asked for, and the
  least recently used project let go past the limit.

## Decorator and sample values are checked and evaluated in one core module (PAR-572)

The architecture review of 2026-11-04 found the value language carried out three times, by the guest's `resolve` for
decorators, its `madeValue` for samples, and libgen's `trialValue`, and the copies disagreed. `@parity-app/core`'s
`values/` module is now the one place: `grammar.ts` checks values with PAR-594's zod grammar, and `evaluate.ts` collects
a value's imports (`valueImports`), works it out against a host (`evaluateValue`), and writes and reads render slot keys
(`renderSlotKey`, `readRenderSlotKey`). My calls:

- **`$import` without `export` is the module's default export, and `$call` must name its export,** as PAR-594's grammar
  says. The guest's decorators let a `$call` fall back to `default`, which the grammar had already stopped allowing. A
  host decides what a module's default export is: libgen's trial host, which loads modules in Node, takes a module
  without a `default` as its own default export, as `trialValue` did.
- **A `$call`'s `methods` run wherever the call is,** in decorators too, which the guest's `resolve` ignored. They run
  in order, once, when the value is made. A method that's missing or throws is passed over, as libgen did, since a call
  the examples make may need what the app has around it; the guest's samples let a throw break the frame.
- **Samples hold made values only.** A sample's props, and the design node props that copy them, are checked with a
  sample grammar where `$call` is the one form, and any other object is plain JSON. The guest had made only `$call`s in
  node props, and the builder already left a design's literal `$import` unloaded. Samples are now checked when the file
  loads, which PAR-594 left to this issue. The guest now also makes a `$call` nested inside a plain object in a prop.
- **The evaluator is synchronous and imports nothing at runtime.** The guest bundles it into the project's code, without
  zod, from `@parity-app/core/values/evaluate`, and icon grouping from `@parity-app/core/icon-names`. In development the
  guest is served as source, so the builder also allows core's `src` folder. Libgen loads a value's imports first, then
  evaluates against its trial host: a mode's value is its default, the frame's nodes are undefined, and `dir` and `lang`
  are `ltr` and `en-US`. A `$function` is worked out when it's called, in libgen too, which worked it out at once.
- **Plain JSON keeps its identity.** An array or object with no form inside comes back as the same value, so a prop
  doesn't change between draws.
- **A render slot is keyed one way.** Inserting a part into a parent whose render function spreads what it's called with
  now keys the slot `$renderWith:`, as the parent's own sample does; it wrote `$render:`, so the part didn't get what it
  was called with.
- **Icon aliases are grouped once,** by `iconAliases` in `icon-names.ts`, so libgen's `icons.count` and the guest's icon
  list agree. `byCodeUnit` and `shorterName` live there too, in place of four copies.

## A render job is built, named and scaled in `shared/render-job.ts` (PAR-575)

The canvas's bitmaps, component previews and agents' frames each built their render job, three stores each named it, and
the arithmetic between CSS and device pixels was split between main and the offscreen page. Both disk names took the job
less a few fields, so a field added to the job joined them unasked. My calls:

- **One builder, `renderJob(guest, frame)`.** It takes where the job is drawn (the project, its guest, its components
  and theme) and what it draws (the tree, the mode with its frame geometry, the scale, the tokens previewed, the check,
  and inline portals), and leaves out what a frame doesn't have, so the three callers can't disagree about when a field
  is there.
- **Each name lists its fields.** `frameKeys`, `bitmapName` and `previewName` sit side by side, with a comment saying
  why they differ: memory goes by the guest and its address, which live as long as it does, and leaves out the theme;
  the disk names go by the code the guest was served instead, which the stores add; only a bitmap names the tokens
  previewed and the project, since previews never draw unsaved tokens and each project has its own folder of them; no
  name has the check (`audit`, `colorTokens`), which changes nothing drawn. The stores still do the hashing, since
  `node:crypto` isn't in the page.
- **Kept bitmaps keep their names.** `bitmapName` writes the fields in the order the service's check gives them, so a
  bitmap's name is what it was, and a test holds it to the old formula. Previews' keys change, once, because of the next
  call.
- **`inlinePortals` is in the service's check.** PAR-565's check dropped it from preview jobs, so previews made since
  were drawn with their portals outside the crop. A test now passes a job built with every field through the check and
  expects it back whole.
- **The scale arithmetic is four functions:** `devicePixels` and `deviceBox` for the window and the crop main makes,
  `frameBox` and `frameHeight` for what the page measures back. `host.style.zoom` stays in the page, as it isn't
  arithmetic.
- **Pure tests replace two disk-backed ones.** That a bitmap is found from a guest given a component, and that a light
  and a dark preview are kept apart, are now tests of the names; the stores' tests keep what needs the disk.

## The open projects are a factory that takes its adapters (PAR-576)

`utility/projects.ts` kept the open projects in module-level maps, with its adapters fixed at import and the environment
read then, so a test could only mock the whole module. PAR-576 made it `openProjects(adapters)`, as the type checker's
`typeChecker(client)` is. My calls in doing it:

- **What it's given is what reaches outside the service:** the renderer, builder and styles adapters, the builder link
  (`startBuilder`, which forks the builder's process), the type checker, the detection cache, the port finder, the
  windows' listeners, the watcher (`fs.watch` unless given) and the environment (`process.env` unless given, read once
  when it's made). `utility/index.ts` makes the one the service uses.
- **The project folder is the real disk.** Discovery, detection and the code snapshot in `@parity-app/project` and
  `@parity-app/code` read it directly, so a file adapter here would cover only part of what's read. The tests open a
  project in a temp folder instead, with the builder, type checker and watcher standing in.
- **The handlers that act on one project take it,** rather than looking it up: `importImage`, `catalogFor`,
  `addLibrary`, `importStyles` and `openStorybook` are given `projects.get(projectId)` by `utility/index.ts`, and
  component previews are `componentPreviews(projects)`. Only what they use is public: `OpenProject` is the info, the
  stylesheets and the known file contents; the list, the builder's session and the watchers stay inside the factory.
- **`ProjectInfo` moved into `@parity-app/project`,** beside `openedProjectInfo`, which assembles it, and
  `withComponentList`, which adds the list as it is now. `shared/protocol.ts` re-exports the type.
- **The watcher's path rules are one function,** `projectFileChange(path, { componentExtensions, configInput })`, which
  says whether a change is to the config, a component file or a project file. Whether a path is a config input depends
  on what the project's config lists now, so the factory works that out and passes it in.
- **A save goes inside the root by its relative path** (`documentTarget`), not by the absolute path's prefix, so a
  sibling folder such as `D:\shop-old` isn't taken for inside `D:\shop`.
- **Closing a project also clears its watcher's timers,** so a change caught just before the close isn't acted on after
  it.

## Signing in is built (PAR-612)

You asked on 2026-11-05 for the main process's side of signing in and the window's screens, from
[proposals/sign-in.md](proposals/sign-in.md) and the Sign in stories, with Staging's client ID until Production exists
(PAR-611). What was tried against WorkOS Staging that day:

- **A public client refreshes with the client ID alone.** The dev copy's own refresh, 4 minutes after signing in with
  Google, worked with no `client_secret`, as `authkit-js` does. The reference's "required" doesn't hold for public
  clients.
- **A public client's refresh can move the session to another organization.** With `organization_id` on the refresh,
  WorkOS answered 200 with that organization's `org_id` and the person's `role` in it (your Staging user, which I added
  to Staging's Test Organization as a member to try it). A later refresh without it stays in that organization. So
  PAR-616 can switch organizations from the app, once its service lists them.
- **The access token names the organization by ID only.** Until Parity's service can look one up (PAR-616), the app
  calls it Your organization.
- **Finishing with a pending token needs the client secret.** The organization-selection grant
  (`urn:workos:oauth:grant-type:organization-selection`) and the email-verification grant
  (`urn:workos:oauth:grant-type:email-verification:code`) both answered 400 `invalid_client`, "Invalid client secret.",
  with the client ID alone. So Parity can't finish either itself; whatever needs the secret stays in AuthKit's pages
  until Parity has a server.
- **Choosing an organization happens in Parity, and AuthKit finishes it.** WorkOS's 403
  `organization_selection_required` names the user and their organizations (ID and name), so the app lists them.
  Choosing one opens AuthKit with `organization_id`, whose page loads and keeps it, to sign in to that organization.
  `organization_id` with a provider such as `GoogleOAuth` fails instead, with `organization_invalid` "No Connection
  associated with Organization", since there it names the organization's single sign-on.
- **Email verification stays in AuthKit.** Its grant needs the secret, and AuthKit verifies on its own page, which
  Staging never asked for while signing in with Google.
- **The token's `iss` is the environment's client** (`client_01M6Q2PGV0Z2R7CXZBFRJH150R`), as its OpenID configuration
  says, which the PAR-615 adapter reads.

Your calls, from trying it in `pnpm dev`:

- **Signed out, Home has no organization switcher,** so nothing looks signed in; the account menu and For you offer Sign
  in. This changes PAR-614's call that signed-out Home is Personal.
- **The account menu keeps Settings and Sign in or Sign out,** and leaves Keyboard shortcuts and the keys to the app's
  menus. It has no agents yet, since connecting one isn't built.
- **Under the ways in, one short line,** "Parity never sees your password", with a shield.
- **Waiting for the browser shows one button at a time:** Cancel, then Open it again once it's slow, with the other ways
  round a page that didn't show as a line of links under it.
- **The browser's hand-back page badges the mark** with a green check or an amber warning, so a failure reads at a
  glance. Choosing an organization or single sign-on isn't a failure, so it says Continue in Parity, with a purple
  arrow.

My calls:

- **The first launch is a fresh install:** no choice made on the sign-in screen, no project Parity knows, and none it
  was started with. So people upgrading don't meet it, and neither do `pnpm dev`, `pnpm perf` or the end-to-end tests,
  which start with a project. Opening a project another way while it shows counts as going on without.
- **Main keeps the session in one encrypted file** in the app's data, with who it signs in and how, so Parity shows them
  before the first refresh answers and Session ended can name them. It uses `safeStorage`'s async calls, since Electron
  45 deprecates the others.
- **Copies of Parity that share the app's data share the session.** Each refresh reads the newest refresh token from the
  file first, since only the newest works; a refusal after another copy refreshed is tried again with its token; and a
  copy whose file was removed by Sign out elsewhere signs out too.
- **A copy answers a passed link at once and trades the code after,** so the copy passing it can quit. The route is
  `POST /auth/link` on each copy's agent service, behind the same token as agents' calls.
- **A failed exchange is one of three problems:** single sign-on for `sso_required` and
  `organization_authentication_methods_required`, with the email WorkOS names; an account turned down for any other 403;
  and an error otherwise. `@parity-app/account` now passes on the email WorkOS's refusal names.
- **Signing in is checked in an installed build later.** The scheme and passing links between copies only work in an
  installed app, which wasn't tried here.

## Several accounts are built (PAR-669)

You asked on 2026-11-06 to stay signed in to several accounts, such as your own and your company's, and switch between
them as Figma does. You approved the design in Parity/Explorations/Home: Home's workspace menu at the top left, and your
accounts in a panel from your picture at the end of the title bar, each with its own Sign out. Your calls:

- **Accounts and organizations are separate controls.** The title bar's panel is who you are; Home's workspace menu is
  where you're working in the account you're in.
- **People and Settings leave the menus.** Settings stays in the app's menu, and an organization's people wait for
  organization settings.
- **Any account can be signed out of**, not only the one you're in, from its own row, with no menu under Sign out.

My calls:

- **Main keeps a session for each account,** each with its own refresh token and refresh timer, in the one encrypted
  `account` file, with the account Parity was last in. Switching accounts doesn't ask WorkOS, so it's instant, and
  Parity starts in the same account next launch.
- **An account is its email.** Signing in again as an account that's listed takes its place rather than listing it
  twice.
- **Signing out of the account you're in moves you to the one you used last** whose session is still going; with none
  left, you're signed out. Signing out of another leaves you where you are.
- **An account whose session WorkOS ends stays listed,** dimmed, with who it was and how they signed in but no token, so
  one click signs in again as it and Remove forgets it. That's kept across launches. Session ended shows over what's
  open only for the account you're in, and you're moved to another meanwhile; another account's ending doesn't
  interrupt.
- **Adding an account asks the provider which one.** Google, GitHub and Microsoft get `prompt=select_account` through
  WorkOS's `provider_query_params`, written as WorkOS's own SDK writes it,
  `provider_query_params[prompt]=select_account`, so a browser signed in to one Google account still offers the others.
  Signing in again as an account names it with `login_hint` instead, and a work email goes to AuthKit with `login_hint`
  as before. Whether WorkOS passes the prompt on hasn't been tried yet: its reference documents `provider_query_params`
  without saying how it's written.
- **A file from a build that kept one account isn't read,** since it's prototype data: anyone signed in then signs in
  once more.
- **Copies of Parity still share accounts.** Each change reads the newest file and replaces only its own account, since
  every refresh replaces a token.

## Telemetry's event model is data in and data out in `@parity-app/telemetry` (PAR-618)

The package holds the envelope, the event registry, spans, sinks and the ring buffer, as
[proposals/product-telemetry.md](proposals/product-telemetry.md) sets out, with no Electron, React, Node-only APIs or
Sentry. Nothing records an event yet: Sentry's sink is PAR-627. My calls:

- **Each process makes one telemetry from the events it may record,**
  `createTelemetry({ events, context, sinks, check })`, rather than a registry every module adds to as it loads.
  `track()` and `startSpan()` then type-check only those names, with each event's attributes typed from its zod schema,
  and a name registered twice throws.
- **Checking is a switch the app sets,** on in development and tests, where a mismatch or an unknown name throws a
  `TelemetryError`. Off in installed builds, events go as given and an unknown name is dropped, so recording costs no
  parse.
- **A span's event carries its outcome and parent in the envelope,** as `outcome` (`ok`, `error` or `cancelled`) and
  `parentSpanId`, beside its `durationMs`, so its schema describes only its own attributes. Its `time` is when it
  started, and it keeps the window and project it started in.
- **A span sampled out still has IDs,** so spans under it keep their trace. Sampling is decided when an event is tracked
  or a span starts.
- **Trace and span IDs are W3C Trace Context's,** 16 and 8 random bytes from Web Crypto, never all zeros.
  `formatTraceparent` and `parseTraceparent` write and read the header for PAR-629; a header the standard holds invalid
  reads as none.
- **A sink's failure never reaches the code that recorded the event.** It goes to `onSinkError` when given, and the
  other sinks still get the event.
- **The ring buffer keeps events and ended spans together,** the last 500, oldest first, for breadcrumbs and Report a
  problem.

## Layers export as PNG or JPG from the Design tab (PAR-185)

Called on 2026-11-05, with your approval in Storybook. PAR-185 asked for PNG at 1x to 3x or SVG, several layers at once
and icons in bulk as SVG. You changed it: PNG or JPG, and SVG isn't necessary. You dropped the icon set export too: the
project already has its icon library's icons in code, so writing them out again gave nothing new. My calls:

- **An Export section at the foot of the Design tab,** as Figma has one, for a design, a layer, several layers or
  several designs, with Export… in the canvas and Layers menus and Ctrl+Shift+E doing the same. It's a section of the
  Design tab rather than a dialog, so the sizes and the files they make show beside what's selected.
- **The sizes are remembered for every export, not stored with each layer** as Figma's export settings are. Storing them
  per layer would put them in the design file, and nothing else needs them there yet.
- **Layers are cut from their design's frame,** drawn offscreen in the state the canvas shows and its main mode, by the
  box the frame measured, rather than drawn alone: a layer drawn alone would lose its parent's layout and what's
  inherited. So a layer's PNG has what's behind it within its box, and see-through parts only where the design has them.
- **A JPG's see-through parts are white,** and the section says so when one is asked for.
- **Files are named as iOS and Android name theirs,** `Headline@2x.png` with no suffix at 1x, and alike names get a
  number rather than overwriting each other.
- **The icon set dialog is kept as an exploration,** Parity/Explorations/Icon export, in case it comes back.
- **File > Export all stays as it was:** every design in every state and mode it shows, at Settings' export scale.

## A selection copies as one PNG at 2x (PAR-190)

Called on 2026-11-06. PAR-190 asked for Ctrl+Shift+C to copy the selected layers or designs as a PNG at 2x, drawn as
they show, with PAR-185's exports drawn the same way. My calls:

- **It draws through the export's own path,** the same offscreen frames and cuts, so one layer or design copies exactly
  the PNG exporting it at 2x writes. There's no second renderer.
- **The clipboard holds one picture, so a selection copies as one.** Several layers of one design are the box around
  them all, with what's between them, as Figma copies them; several designs sit where they are on the canvas, with
  see-through between them.
- **A picture over 16,384 pixels wide or tall isn't copied,** with a toast saying to select less or export it. Selecting
  every design spread over the canvas made one too big for sharp to make, and mostly see-through.
- **Always 2x PNG,** whatever the Export section's sizes or Settings' export scale, as the issue asked.
- **Through the keymap only for now,** with no menu item, since a menu item is a design change for Storybook first.

## Each element's source line, in a Code tab and for agents (PAR-167)

Called on 2026-11-05, with your approval in Storybook. PAR-167 asked for a development-only transform that tags each JSX
element with its file, line and column, shown and opened from the Code section, with agents getting the same in
`parity components` and snapshots, and nothing in production builds. You moved the code out of the Design tab into its
own Code tab, before Accessibility, and asked for real syntax highlighting. My calls:

- **Only lowercase elements are tagged,** `<button>`, `<div>`, as the page gets them. A component's own element,
  `<Button>`, passes props on, so tagging it would give the element it draws its caller's line in place of its own.
- **The tag is an attribute, `data-parity-source`,** with `path:line:column` from the project root, added before the
  framework plugin compiles the file, with a source map. An attribute is read from the DOM by the canvas, the offscreen
  page and the e2e tests alike, whatever the framework. Installed packages, virtual modules and the production build get
  none.
- **A Code tab of its own,** between Modes and Accessibility: the component and its file, the elements it draws with
  their lines, and the picked one's lines. Highlighting is Shiki, through the kit's `CodeBlock` and
  `useHighlightedCode`, not a highlighter of Parity's.
- **Inspect picks by boxes,** since frames don't take the pointer outside Interact: the innermost written element under
  the pointer, with a library's element inside it counted as the project's.
- **The source shown is the file on disk,** read by the service's `code.read`, which refuses paths outside the project
  and files over 1 MB, so unsaved editor changes don't show until saved.
- **Agents get files and node sources rather than every element.** `parity components` gives the file each project
  component is written in, and `Measure`, the layout snapshot, gives each node's `source`, the element it draws
  outermost. Listing every element inside every instance would make `Measure` much longer for little more: the node's
  line leads to its file, which has the rest.

## The designs' console reads main's log, by the design that wrote each message (PAR-147)

Called on 2026-11-05. PAR-147 asked for errors and warnings with a count in the status bar and by design in a panel,
during interaction and after offscreen renders, from the same log as `parity console`. You saw the design in Storybook
and didn't object. My calls:

- **Main's log is the one log.** Main already kept what every window's projects write, for agents. It now gives each
  message an id and sends what's new or counted again to the editor windows, batched 100 ms after the first, and Clear
  empties it there, so the panel and `parity console` never disagree.
- **Offscreen, the job names its design.** A render job carries the design, state and mode it draws, and a message the
  window writes while it draws is that design's. No stored name has the field, so bitmaps and previews keep theirs.
- **On the canvas, the window announces the frame.** Frames share one window, so main can't tell them apart. While a
  frame handles a person's event, and through the rest of that task, the window wraps the console so each call first
  sends main the frame's design, state and mode, then writes the message. Electron then reports the wrapper, in Parity's
  own code, as where the message was written, which main would drop as Parity's own, so the announcement also carries
  the frame code's call: the stack's first frame from another origin than the wrapper's. Main gives the announcement to
  the next message of that level from the window, within a second. The announcement is sent before the message is
  written, and `e2e/console.e2e.ts` checks it reaches main first. The console is wrapped only during those tasks, so the
  window's developer tools point at the real lines the rest of the time, and a wrapper something else adds meanwhile is
  left in place.
- **What isn't known stays unknown.** What a frame writes on its own, after a timer or a fetch, or as it first draws on
  the canvas, is the project's rather than a guess at a design. Its offscreen draw usually writes the same message as
  the design's.
- **A message is one row however many frames wrote it.** Main counts repeats per frame, and the panel merges a design's
  same message across frames, with each frame as a chip.
- **The place is the project's line.** A message's own line when it's in the project's files, else its stack's first
  call that is, since React's warnings come from react-dom and name the component in their stack.
- **Agents get the design too:** each console entry has its design's key, state and mode when known, and their frames
  name their state.

## The Layers panel draws only the rows in view (PAR-187)

Called on 2026-11-05. The editor audit's Layers panel drew a row for every open layer and kept every row it had opened,
so selecting around a large design made each later change slower. My calls:

- **Only the rows in view are drawn,** with `@tanstack/react-virtual`, which the insert picker, the icons and the tokens
  already use, and each drawn row is drawn again only when what it shows changes. Rows are a fixed 28 pixels, so the
  list needs no measuring.
- **Rows opened to show a selection close once a selection made elsewhere no longer needs them,** as in Figma. Rows
  opened by hand stay open. A selection made in the tree itself, by a click or the arrow keys, closes nothing, so no row
  moves under the pointer.
- **Search finds designs and layers by the name the panel shows,** ignoring case, and shows each match with the rows
  above it open and the match's own layers closed. A search opens what it finds itself, so its rows have no arrows.
- **A layer's eye hides it in the state its board shows, without selecting it.** It's the row's own control, so it acts
  on that row rather than the selection, as Figma's does; Ctrl+Shift+H still hides the selection. It shows while the
  layer is hovered, here or on the canvas, and always on a hidden layer. It stays out of the tab order, as the arrow
  does.
- **A design is dragged among the designs of its group, in its own file.** The panel lists designs in their file's
  order, so dragging one moves it in the file. A design isn't moved to another file, which would change its key, or
  between components, screens and frames, which the panel lists apart.
- **The lock toggle waits for PAR-192,** which adds locking, and highlighting a layer selected inside an instance waits
  for PAR-92, which lists an instance's layers.

## Frames are built in the app (PAR-545)

PAR-545 builds the frames exploration you approved in PAR-540, on PAR-539's model. My calls, where the build differs
from the stories or they left something open:

- **A frame that hugs what's in it keeps its size in the file as drawn.** Text from the text tool, and anything that
  lands on the empty canvas, goes in a frame whose root layout hugs its width. The file's `size` stays a number, since
  bitmaps, agents' renders and exports need one, so the canvas measures the root at its content's width and writes that
  width as the frame's size. Writing it isn't an undo step of its own: the size follows from the layers, undo puts back
  the size they had, and the root is measured again. A width of its own, from the handles, the frame tool's sizes or the
  inspector, stops it hugging.
- **Whatever lands on the empty canvas makes a frame, text too.** Pasted layers, images, a component or a layout from
  the insert picker or the Components panel, and now pasted text, which used to make a note. They're padded as before,
  filled with the project's background, as a new frame is, and named after what's in them.
- **The text tool makes a text frame, not a note.** T and a click in empty space makes "Text" in a frame with 2 steps of
  padding, edited at once, and the frame takes the text's name as it's typed until it's renamed. Notes in a file still
  show and edit as before; nothing makes a new one, since you dropped the Note tool in PAR-540.
- **The empty canvas's start doesn't gain Draw a frame,** as PAR-545's issue asked, because PAR-560 dropped the start.
  The frame tool's menu has New screen and New component instead, so every kind starts from one place.
- **A frame's size is its root layout's size in the inspector.** Selecting a frame shows its root's layout, spacing,
  size and fill straight after its name. The width and height rows show the frame's own size, and a fixed length there
  resizes the frame, as the exploration's inspector does.
- **Converting from a frame shows a toast with Undo; converting to one asks only when something would go.** A screen or
  component that drops nothing, such as a screen made from a frame a moment ago, becomes a frame at once. Converting a
  component also makes its instances in other designs plain layers, in the same step, as the dialog says.
- **Layers lists Frames after Components and Screens, once there are any,** and its + picks the frame tool, since a
  frame is drawn rather than made right of everything. The app's Layers keeps Components first, where the exploration
  had Screens first.
- **A frame's handles are its previews':** the right side, the bottom and the corner, resizing its own size. Its name
  runs past a narrow frame rather than being cut off, since there's no board to fit.

## Previews in the Components panel and the insert picker (PAR-208)

Built to the Previews exploration's Components stories (Parity/Explorations/Previews) and PAR-515's card. My calls:

- **The view is a preference, the same in every project.** Names, List or Grid is how a person likes to browse, not a
  property of a project, so it's kept with the app's other preferences, List until they pick another.
- **A row says what's wrong in words, not what's in progress.** Fails to draw, Needs props, Needs a provider, Server
  only and Draws nothing go under the name in List and Grid, colored as the exploration has them. Waiting, drawing and
  updating show in the picture only (an empty box, a shimmer, the last picture dimmed with a mark), and the card says
  them in words: on a first open a list of "Waiting" under every name would say nothing anyone can act on.
- **Why there's no picture comes from what's already known.** Needs a provider and Server only come from the preview's
  error, as the canvas reads its errors (`renderProblem`). Needs props is a preview that failed or drew nothing whose
  component requires a prop inserting can't fill: inserting gives a required text, number, yes-or-no or option prop a
  value of its own, so these are lists, objects and other nodes. A component that draws can still be missing one, and
  isn't marked.
- **The card's variants are one prop's options:** the component's first style variant (cva) with more than one option,
  else its first own prop with a few named options, as a size. Five show as small pictures and the rest are counted.
  They're made only when the card first opens, before anything off screen, and kept in the project's index beside the
  component's own, as `Button?variant=outline`, so a card opened again shows them at once. Pointing at one, or tabbing
  to it, shows it large.
- **The picker's card has no Insert,** since Enter inserts the highlighted row; it keeps Open file and Open in
  Storybook, which close the picker first. In a window too narrow for both, the picker is the list alone.
- **Component designs keep their icon for now.** The proposal pictures a design by its board's bitmap, which the canvas
  keys by its own frame jobs; reading those for the panel is work of its own, so a design shows its icon where a
  component shows its picture.

## `prefers-color-scheme` blocks are themes, drawn for each frame's mode (PAR-138)

My call: the app reads `@media (prefers-color-scheme: dark)` around the root as the `dark` theme, and a `light` one as
the default, as `parity lib` already did, and frames draw such a block for their own mode instead of Parity's window.
PAR-485 kept the block out because a frame gets its theme from a class the Modes panel adds, never a media query, so a
dark read from one couldn't be shown or edited. mantine's dark values were left out, and since frames are shadow roots
in Parity's window, a mantine frame in the Light mode turned dark whenever Parity's window did.

- **One policy.** `ThemeOptions.colorScheme` is gone: `themeOfSelector` always reads a whole
  `(prefers-color-scheme: dark)` query as `dark` and `light` as the default, with a theme's own selector still beating
  the block, so libgen and the app read the same CSS alike. The query is read by core's `colorSchemeQuery`, which
  `prepareCanvasCss` uses too. A query that asks for more (`screen and (prefers-color-scheme: dark)`, or a width as
  well) stays conditional and no theme's, as before.
- **Frames draw the block as an attribute theme on their body.** `prepareCanvasCss` rewrites the block's root rules to
  `:where([data-canvas-body][data-canvas-color-scheme="dark"])`, `body` rules to the body with that attribute, and any
  other rule to elements inside that body. A block nested in a rule, as Tailwind's `dark:` variant writes, becomes
  `:where(…) & { … }`, and one nested in the root's own rule is moved after it, where it can reach the body.
  `frameAttributes` gives every frame body `data-canvas-color-scheme`: `dark` when its mode's classes include `dark`, as
  the default Dark option's do, and `light` otherwise; an attribute the mode sets itself still wins. The alternatives
  were a container style query, which can't reach the frame's root, where the block's values live, or an iframe per
  frame, which the canvas doesn't use.
- **No specificity is added**, as a media query adds none. The root's values move to the body, so the body's own rules
  and a theme's class on it (`.dark`) win over them, matching the policy's "a theme's own selector beats the block".
- **Previews and saves find the block by its theme.** The drawn rule reads as an attribute theme, `dark` or (for
  `light`) the default, so `previewToken` edits it with no change of its own. `writeTokenChanges` now edits blocks under
  a colour-scheme query when the query picks the block's theme, adds a value the dark theme lacks to the block, and
  never adds a new default value to a colour-scheme block's `:root`.
- **Tokens are read from the blocks as written.** `prepareCanvasCss` takes `colorSchemes: false` where tokens are read
  (the guest, detection, libgen's comparison test), so the policy sees the media query, and `themeAttributes` reads the
  same CSS.

Gaps: a frame's root (its shadow host) never gets the colour scheme, so a custom property the root defines from another
(`--alias: var(--surface)`) keeps its light value in a dark frame, as with a `.dark` class theme. A custom property a
`body` rule declares inside the block reads as a dark value in the preview but not in the Tokens tab.

## A layout of a component design can be a slot (PAR-83)

Called on 2026-11-06, with your approval in Storybook. [proposals/components.md](proposals/components.md) set out slots;
PAR-83 marks them in a component design, and PAR-84 fills them from instances. My calls, with yours:

- **A slot is `slot` on a layout node,** a prop's name, and the layout's own layers are its placeholder, as Vue's and
  Web Components' fallback content is. The outermost layout can be one.
- **No Children or Named to choose.** A slot is only a name; the difference between a slot and `children` is how code
  writes it, so code decides. It nests the slot holding the most layers between the tags, as React's `children` and
  Vue's default slot, the first in layer order on a tie, and passes the others as props that take layers. The biggest
  part going between the tags keeps code from drilling whole layouts through props. The panel doesn't mark which one it
  is; In code shows it. `children` is reserved as a name, so the rule's choice never clashes with a slot's.
- **A slot is a kind of prop.** It's listed in the component's Props after the params, with the layout it fills where a
  param has its default, and Props' Add offers a slot from a layout. A separate Slots section was tried and dropped, as
  was editing slots in the code itself. In code sits below Modes. Make slot sits beside Make component on the layer.
- **Props doesn't list where the component is used.** The Components panel's card already counts its uses, and a list of
  every instance doesn't scale.
- **An empty section says nothing,** past its description: Variants and Props drop "None yet". Variants' hint about the
  title bar shows once there's a variant to pick.
- **The file is strict about names, the editor about the rest.** The file refuses a name that couldn't be a prop (`key`,
  `ref`, `style`, `className`, `children`, or not an identifier) and two layouts with one name. A slot named like a
  param, or inside another slot, is refused by `setSlot` but tolerated in a file, and `designSlots` skips a nested one.
- **Copies drop the mark.** Duplicate, paste, moving to another design, Make component and Detach make a plain layout,
  keeping its layers, since a component has one slot by each name. A component turned into a screen keeps its marks,
  which do nothing until it's a component again.
- **Names are camelCased,** so `Side actions` is `sideActions`, and a new slot takes its layout's name.
- **Filling a slot is the instance's (PAR-84).** It keeps what fills each slot as layers of the design it sits in, so
  they're picked, selected and edited as the design's own, drawn in place of the placeholder and baked in by Detach.
  Layers doesn't list them under the instance: an instance's insides are never shown inline. Its panel has each slot
  after the params, filled with its layer count or Empty, with a picture of what shows there on hover, drawn by itself;
  a selected slot has a panel of its own, and a click in Components adds into it.
- **Props' Add makes value props too.** Text, Number and Toggle, each named in a row as it's added, beside slots from a
  layout. A prop no layer uses still does nothing on the canvas, so a layer's text and visibility can use a prop, or
  make one from what they show, with the field showing the prop's name until it stops using it.

## The first run offers the example, and gone folders are flagged (PAR-188)

Called on 2026-11-06, with your approval in Storybook. PAR-188 asked for the first run to open the example with three
dismissible tasks to try, and for the start page to show thumbnails, remove a recent project and flag missing folders.
Thumbnails and removing came with PAR-607 and PAR-605. Your calls and mine:

- **The three tasks are kept as an exploration,** Parity/Explorations/First steps, not shipped: you didn't want them
  yet. A card over the example's canvas with Change a prop, Wrap in a layout and Check accessibility is there if they
  come back.
- **Home offers the example rather than opening it.** The first time, Acme sits where Continue will be, with Open Acme,
  and Bring your own app beside it, so nothing moves once there's a project. Without the example, that place says what
  Parity does with your app and offers Open a folder and Open a project file.
- **Only a copy run from the repository has the example for now.** The service looks for `examples/shadcn-vite` above
  where Parity runs, with its packages installed. Shipping it in the installer means copying it somewhere you can write
  and installing its packages on first run, which needs its own progress and error states: that's a follow-up. Its first
  two screens ship as its picture until its own is kept, about 26 KB.
- **For you shows only once you're signed in,** since what needs you comes through an organization; signed out there's
  no section and no Sign in in it. The account control at the top left (PAR-612) is where you sign in.
- **Empty lists say what will show up there,** in a dashed box a row of cards tall, with an icon, rather than a line of
  grey text.
- **A gone folder stays listed, greyed,** with Folder not found, until you remove it: a drive that isn't plugged in
  comes back. Opening it says where it was and offers Remove; Continue skips it. A folder Parity can't read for another
  reason, such as permissions, isn't counted as gone.
- **New project from this is out of a project's menu** until projects can be made (PAR-284), rather than a toast saying
  it isn't ready.
- **A frame's edge in a project's picture is mid-grey,** not the theme's text color, so a phone over a desktop frame
  shows against it whether the screens are light or dark.

## Sizes and insets can leave the spacing scale, flagged (PAR-194)

Lengths were kept on the spacing scale: a typed length landed on the nearest half step, and nudging moved a step. The
editor audit (CAN-48) asked for lengths off the scale to be kept and flagged, since a sidebar 280px wide is a fact of
real apps and engineers already write `w-[280px]`. This loosens the tokens-only model for lengths. My calls:

- **Only sizes and insets leave it.** Width, Height, Min, Max and an absolutely placed layer's insets keep what's typed.
  Padding, Margin and Gap still land on the nearest half step with a note, since spacing inside a layout is what the
  scale is for. Colours, type, radius and shadows stay tokens.
- **A length off the scale is kept in steps,** 281px as 70.25 with a 4px unit, not as pixels. The file format doesn't
  change, every place that reads a length keeps working, and a value off the scale already opened as it was. If a
  project's spacing unit changes, such a length scales with it, as lengths on the scale do. Writing it as code is
  PAR-265's to decide: `w-[281px]`, or `w-70.25` where Tailwind's scale takes it.
- **It's kept to the hundredth of a pixel,** so 281 stays 281px rather than 280.99999, and a run of 1px nudges with a
  unit 1px doesn't divide doesn't drift.
- **The scale is whole and half steps,** as before and as the canvas's distance labels already say "off scale". A
  quarter step with a 4px unit, 1px, is off it.
- **The flag is under the row, in amber, with the nearest step as a button:** "281px is off the scale" and "Use 280px".
  It shows for any length off the scale, whether typed, nudged or already in the file, padding from an older file
  included. Amber, not the destructive colour, since the value is allowed. Halfway between a whole step and a half step
  the button offers the whole step, so 281px offers 280px rather than 282px. The wording was checked against the writing
  style guide, which allows px in design content where space is short.
- **Nudging moves 1px, or 10px with Shift,** as Figma's does, which CAN-39 waited on. The field's Up and Down still move
  a step, so they're the way back onto the scale; a length off it goes to the step beside it.

## Boards take their size once the zoom settles, not when tldraw's camera stops (PAR-655)

Called on 2026-11-06. Profiling PAR-653 on a busy machine, frames took 150 to 300 ms, longer than tldraw's camera
timeout, so tldraw counted the camera as stopped between the wheel's moves. Every board then measured itself and updated
its shape on almost every frame of a zoom: 190 to 280 ms of `getClientRects` in a 4-second zoom. My calls:

- **Boards wait for the zoom to settle, the same settling `--tl-zoom` already waited for.** The zoom settles once it has
  held for 3 animation frames and 150 ms, both: frames alone would settle between a mouse wheel's notches when frames
  are quick, and time alone would settle between slow frames. The rule moved to `zoomSettle` in
  `packages/editor/src/zoom-settle.ts`, with tests, and `settleZoom` and the boards both use it, so the styles and the
  boards' sizes change at the same moment rather than by two timers that could disagree.
- **Panning no longer holds a board's size back.** A board's size changes with the zoom, not with the camera's place, so
  a board that resizes while the canvas pans, such as one whose frames wake as it comes into view, takes its size then
  rather than once the pan ends.
- **The zoom passing back through where it settled counts as settled for that frame.** A board might measure itself once
  mid-zoom then; checking it apart from the zoom wasn't worth a second clock.

## docs/telemetry.md lists the events from their schemas (PAR-623)

[telemetry.md](telemetry.md) says what Parity sends Sentry and lists every event, as principle 9 of
[proposals/product-telemetry.md](proposals/product-telemetry.md) asks. My calls:

- **An event says which processes send it and when,** as `sentBy` and `when` in `defineEvent`, and each attribute says
  what it means with zod's `.describe()`. All three are required: the catalog throws when one is missing, so an event
  can't reach the page half described.
- **`registeredEvents` in `packages/telemetry/src/registry.ts` is the one list,** the page's source. Each process still
  passes `createTelemetry` only the events it sends.
- **Only the Events section is generated,** between two comments; the prose around it is written by hand. Types are
  written as TypeScript writes them, from zod's JSON Schema of what `track()` takes, and a nested object's fields are
  listed by their dotted path.
- **Regenerating is `pnpm exec vp test run packages/telemetry -u`,** through Vitest's file snapshots, as the fixtures'
  `expected.json` files are, so no script was added. The test that fails says so.
- **The tables are padded as `vp fmt` writes them,** so formatting the page on commit leaves the generated part alone.

## Secrets are scrubbed before any event leaves a process (PAR-621)

`@parity-app/telemetry`'s `createScrubber({ secrets })` replaces secrets with `[redacted]` and leaves everything else as
written, as "Parity's own telemetry goes to Sentry, on by default" decided. `createTelemetry` runs it on every event's
attributes before its sinks and the kept events. Main, the windows and the service run one in their Sentry `beforeSend`,
`beforeSendTransaction`, `beforeSendLog` and `beforeBreadcrumb` hooks, and the CLI will once it sends (PAR-642).
Sentry's server-side scrubbing stays on as a second net. PAR-756 has since put those hooks, with `beforeSendSpan`, in
one shared `sentryScrubbing`; see "Spans are sent in their transaction, so the scrubber sees them" below. My calls:

- **Keys and tokens with a known shape are replaced whole:** OpenAI and Anthropic `sk-…`, Stripe `sk_live_`/`rk_live_`,
  GitHub `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` and `github_pat_`, Slack `xox…-`, AWS access key IDs, Google `AIza…`,
  npm `npm_`, Sentry `sntrys_`, JWTs and private key blocks. After `Bearer` and in a URL's `user:password@`, only the
  secret goes: the word, scheme, user and host stay.
- **A field whose name says it's secret loses its whole value,** in objects and in text (`.env` lines, query strings,
  JSON, `password: …` in a message): names with password, passphrase, secret, API key, access key, private key,
  credential, authorization or cookie in them, `auth`, environment names ending in `_TOKEN`, `_KEY`, `_SECRET` or
  `_PASSWORD`, and tokens with a credential's prefix, as `accessToken` or `refresh_token`. **A bare `token` isn't
  secret,** nor `designToken` or `key`: in Parity those are design tokens and design keys, which make a bug findable.
  Their values are still read for keys and random strings.
- **Long random strings are replaced even with no known shape:** 32 characters or more of base64 or hex characters, with
  upper and lower case letters and digits, under 40% of it in lowercase words of 4 letters or more, and at least 3.5
  bits per character. Paths and identifiers are half words or more, so they stay. Hex alone stays (hashes, commit SHAs,
  UUIDs, trace IDs), as does a run in a file name before its extension or in a `data:` URL's base64. About 1 in 100
  random 32-character keys slips past this, which the known shapes and Sentry's own scrubbing cover.
- **`.env` values are scrubbed when the caller passes them.** `envSecrets(file)` reads a `.env` file's values, and the
  ones 8 characters or longer that aren't a number or `true`/`false` are replaced wherever they appear. `setSecrets`
  swaps them when another project opens. Shorter values would hide words and port numbers everywhere they appear. No
  process passes a project's values yet: that's PAR-672.
- **Only attributes are scrubbed in `createTelemetry`.** The envelope's own fields are Parity's IDs, names and paths. An
  `Error` is copied as its own class with its message, stack, fields and cause scrubbed; dates, byte arrays and other
  objects that aren't plain go as they are.

## Events go to Sentry through main, and to a local copy at every level (PAR-627)

Every process records its events with `createTelemetry` and the app's Sentry sink, `shared/sentry-sink.ts`, which maps
envelopes to Sentry's shapes and never lives in `@parity-app/telemetry`. PAR-642 has since moved it there, for the CLI;
see "The CLI sends to Sentry from a process of its own" below. My calls:

- **Each process keeps its own breadcrumbs and errors; main sends logs and spans.** In a window, a render window and the
  service, each event and span becomes a breadcrumb in that process's Sentry scope, and a failure becomes a Sentry error
  there, so an error carries the events before it in the process it happened in. Every event then goes to main, which
  writes the local copy and sends it as a structured log, and each span as a Sentry span. Main needs every event for the
  local copy anyway, and this leaves it the one place that decides what leaves, as PAR-620 has it.
- **A failure is any `error.*` event, or any event at the `error` or `fatal` level** (`isErrorEvent`). The issue named
  the first and docs/telemetry.md the second, so both count.
- **The last 100 events are Sentry's breadcrumbs,** which it keeps 100 of by default, not a copy of the ring buffer laid
  on each error. That way an uncaught exception or a native crash carries them too, not only an `error.*` event.
  Sentry's own breadcrumbs (console, clicks, requests) share those 100.
- **A span is sent as a transaction of its own, with Parity's trace, span and parent IDs,** built by hand and sent with
  `captureEvent`. Sentry's span API makes its own IDs, which would break the trace the CLI and other processes continue.
  Sentry joins the transactions into one trace by their parents. A log in a trace is captured in a scope that continues
  it, so Sentry links the two.
- **A log's message is the event's name, and its attributes are the event's own, as they are,** so they're searchable by
  the names in docs/telemetry.md. The envelope's fields go beside them under `parity.` (`parity.process`,
  `parity.session_id`, `parity.duration_ms`).
- **The level gate is in main's `beforeSend`, `beforeSendTransaction` and `beforeSendLog`,** through `sendsToSentry` in
  the package: All sends everything, Errors only errors (with their breadcrumbs), Off nothing. Reading the level there,
  rather than only at `Sentry.init`, lets PAR-626 change it without a restart. PAR-626 has since dropped the Errors
  level and `sendsToSentry` with it; see "Diagnostics are on or off" below.
- **The local copy is `<userData>/logs/parity-<date>.jsonl`,** one envelope per line, written at every level. A file
  that would pass 5 MB continues in `parity-<date>.2.jsonl` and on, a new day starts a new file, and only the newest 10
  are kept. Lines are written together once a second, synchronously; a `fatal` event writes at once, with what's
  waiting, and so does quitting. A write that fails loses the local copy, never the app.
- **Other processes reach main by the routes they already have.** A window sends over IPC (`canvas:telemetry`) from its
  preload. Render windows got a preload of their own that gives the page only that, since a project's components run in
  them. The service asks main's channel (`record`), and the props worker posts to the service beside its channel's
  messages; the service adds its events to its own Sentry scope, since the worker has none. Main checks each envelope
  with `envelopeSchema`, and names a window's events by the window that sent them.
- **Main makes the install ID and the session ID, and passes them on** with whether to check events against their
  schemas (outside installed builds): to windows as a command-line argument, to the service and its worker in an
  environment variable. The install ID was kept in `<userData>/install-id`; PAR-626 moved it into `telemetry.json`.
- **No process exports its telemetry yet.** `startTelemetry` and `startEvents` return it; the issues that record the
  first events (PAR-629 onwards) decide how code reaches it.

## Diagnostics are on or off (PAR-626)

Settings has one switch for Parity's own telemetry, and About shows whether it's on and the install ID. You chose its
shape on 2026-11-06. After a first design with an All, Errors and Off choice, an install ID row and a Reset button, you
said it "smacks of leaking internal implementation details. Users don't need to see some of this. Users don't need to
know we're using Sentry," then "Either send or don't, that's all." My calls within that:

- **No Errors level anywhere,** not only in Settings: `TelemetryLevel` is `all` or `off`, `PARITY_TELEMETRY` takes only
  those, and `sendsToSentry` is gone. Main turns Sentry's client on or off (`applyTelemetry` in `main/telemetry.ts`),
  which every send checks, so the switch works without a restart. Sentry starts enabled and is turned off at once when
  it should be, since a client started disabled never sets up its integrations.
- **Settings > Privacy > Share diagnostics,** a switch. Its line says what's shared and who it's for, not which service
  takes it, and reads the same on and off, so turning the switch doesn't move the dialog. It leaves out the window
  recording, which won't ship (PAR-703).
- **A variable decides the run and disables the switch:** `PARITY_TELEMETRY` over the setting, `DO_NOT_TRACK` and Vitest
  over both. The switch shows what's sent, and its line names the variable.
- **The setting and the install ID are one file, `<userData>/telemetry.json`,** which the CLI can read through
  `desktopDataFolder` (PAR-642). It replaces PAR-627's `install-id` file; an ID there isn't carried over, as stale
  prototype data.
- **Turning it off is the reset:** it makes a new install ID, so what's sent after turning it back on isn't linked to
  what came before. There's no Reset button. Windows and the service keep the ID they started with until Parity
  restarts, so their events' envelopes carry the old one until then; Sentry's user is the new one at once.
- **About lists Diagnostics (On or Off, with the variable if one decided it) and the Install ID** with the versions, so
  Copy details includes them.
- **Settings scrolls** when it's taller than the window. The new section pushed it past the bottom of a short one.

## Session Replay records the editor window (PAR-624)

`@sentry/electron`'s renderer SDK brings Session Replay and its canvas recording, so no package was added. The editor
window records with `maskAllText`, `maskAllInputs` and `blockAllMedia` off and `replayCanvasIntegration` on, as
"Parity's own telemetry goes to Sentry, on by default" decided. My calls:

- **Every session is recorded while diagnostics are on** (`replaySessionRate` is 1, in `renderer/replay.ts`). **While
  they're off the recorder isn't added,** so it costs no memory, as well as main sending nothing.
- **The window asks main whether they're on** (`canvasHost.telemetry.get()`, PAR-626) as it starts, and adds the
  recorder once they are. Turning them off in Settings stops it, and on again starts it, through `receiveTelemetry`.
- **Only the editor window records.** `followTelemetry` is called from the editor window alone, so the offscreen
  renderers, which share `startTelemetry`, neither record nor load the recorder.
- **Frames are left out of replays,** as boxes their size (`block: ["[data-frame]"]`). The proposal took them for
  cross-origin iframes, but a frame on the canvas is an open shadow root in the editor page, which Sentry's recorder can
  record. Recording them, a closed project's canvas stayed in memory: about 26,000 DOM nodes against 6,000 with
  telemetry off, and `reopening.e2e` failed in CI on 49,000 nodes where it allows 27,600.
- **The recorder never sees frames' and project icons' shadow roots.** Blocking alone left about 13,800 nodes in some
  runs: rrweb patches `attachShadow` and keeps every shadow root attached while it records, blocked host or not, until
  it starts over, and a frame's host kept the closed canvas. `renderer/shadow.ts` takes the browser's own `attachShadow`
  before recording starts, and frames and icons attach theirs with it (icons are blocked too). A closed tab's session
  also lets go of its editor, which React kept with the tabs a component last read. Closing the example project now
  leaves about 510 nodes with replay on and 170 with it off, steady over three reopens.
- **Failures carry the frames instead,** since replays leave them out, the offscreen windows that draw bitmaps aren't
  recorded, and a buffer keeps only a minute: every error from the editor window attaches `frames.json`, the frames on
  the canvas without their bitmaps or render keys, which hold the whole design and made it 3 MB. A frame's failed
  offscreen capture is reported once for what it shows, tagged `render: failed`, with the bitmap the frame last showed
  as `frame.webp`.
- **What it costs:** the editor window's bundle grows by 153 kB (49 kB gzipped); `render.js` doesn't change. On the
  example project, a minute of selecting after opening left the JS heap within 0 to 6 MB of the 110 MB it holds with
  telemetry off, after garbage collection, over two runs each. With the project open, the page held about 27,600 DOM
  nodes against 6,700, which closing it gives back. PAR-683 found that level over an hour and the gap to be attributes,
  not removed nodes; see "Session Replay's memory stays level over an hour" below. `pnpm perf` couldn't give its
  numbers: it stops at "zoom hovering a layer" with telemetry off too (PAR-684).
- **Replay recordings aren't scrubbed for secrets yet,** unlike every other event; that's PAR-679. PAR-679 has since
  scrubbed them; see "Replays are scrubbed as they're recorded" below.

## sharp isn't loaded in the app on Linux (PAR-688)

On Linux, the project service segfaulted the first time sharp encoded a picture, in a libuv worker with libvips's
threads running (Sentry's PARITY-DESKTOP-G, in CI's installed update check). Electron's Linux binaries link the system's
glib and leak its symbols into the process, which clashes with the glib sharp's libvips brings: sharp's docs list it as
a known conflict, and electron/electron#46323 is still open. My calls:

- **Under Electron on Linux, sharp is treated as unable to load** (`sharpRefusal` in `utility/webp.ts`), so frame
  bitmaps and component previews show the PNG and aren't kept, as on any system sharp can't load on. Exports and copying
  as PNG fail there with that message, where they crashed the service before.
- **The build's check didn't catch it,** since it runs Electron as plain Node (`ELECTRON_RUN_AS_NODE`), where Chromium
  and its glib never load.
- **It went unseen because installed renders were failing:** the offscreen `render.html` ran the editor's `index`
  bundle, which stopped at `setTheme` (PAR-662) before `canvasRender` was defined (PAR-670), so nothing reached sharp.
  PAR-624 moved shared code into a chunk of its own, so `render.html` stopped loading `index`, renders worked, and the
  update check crashed.
- **Bringing WebP back on Linux** means sharp's WebAssembly build there, or encoding outside Electron. Either is a new
  dependency or process, so it's PAR-691, along with a build check that loads sharp in a real utility process.

## Every error notification is recorded, with saves, exports and project edits (PAR-632)

The editor window records what the proposal's "Errors" and "Files and saving" list, as [telemetry.md](telemetry.md)
catalogs. My calls:

- **One helper shows an error and records it.** `reportError(error, { operation, title, ...toast })` in
  `renderer/report-error.ts` shows the notification as before and records `error.caught` with the `CodedError` code, the
  operation and what it acted on. No window code calls `toast.error` itself. The field is `operation`, not `action`,
  since a notification's `action` is its button; the event still calls it `action`.
- **`ipc.failed` is recorded in `request`,** the one way the window asks the service, by method and code. It's a
  warning, not an error, so a failure the window also shows isn't two Sentry issues.
- **Events are recorded where the window asks for the work:** saves in `saveDocument`, token writes in `saveTokens`,
  edits as `announceEdit` shows them and as Undo puts them back, exports in `commands.ts`, libraries in the Assets
  panel. `document.saved`'s size is the document as JSON. `library.added` names the catalog ID, since the window doesn't
  know the version installed; `styles.imported` has the package and version.
- **A recording mistake never stops the work.** `track` logs what the development build's checks throw rather than
  throwing it, and nothing is recorded where no telemetry was started, as in stories and tests.
- **Event names can be camelCase,** as the proposal names them (`document.saveFailed`, `projectEdit.applied`).

## Lint refuses `toast.error` outside `reportError` (PAR-644)

So no new error notification skips the record PAR-632 added, `eslint/no-restricted-properties` in `vite.config.ts`
refuses `toast.error` anywhere, with a message saying to use `reportError`. My calls:

- **`report-error.ts` is the one exception,** a `lint.overrides` entry with a comment, as exceptions are made here.
- **Only `toast.error` is refused.** Other notifications (`toast.success`, `toast(...)`) aren't failures, so they don't
  go through `reportError`.
- **`scripts/lint.test.ts` lints a probe file** to show the rule refuses `toast.error` and names `reportError`, and that
  `report-error.ts` still passes.

## Failed data checks and unsupported projects are recorded (PAR-633)

The product telemetry plan called for `data.invalid` and `project.unsupported`. My calls:

- **Core's checks tell one listener.** `checkData`, `parseData` and `parseInput` call `onInvalidData`'s listener with
  each failure: the schema's name, every zod issue and the data. Core doesn't import telemetry; each process's telemetry
  (main, the windows, the service and the props worker) sets the listener as it starts, through `recordInvalidData` in
  `shared/invalid-data.ts`. A listener that throws doesn't change what the check returns.
- **A schema is named by its `.meta({ id })`, its description, or the function that ran the check,** read from the stack
  only when a check fails. Most schemas have neither, so the function names most failures; a bundle that renames it
  gives "unnamed".
- **Only those three helpers are watched.** Direct `safeParse(value).data` reads, as caches and saved preferences do,
  fall back to a default by design, so they aren't recorded.
- **The event carries the first 20 issues and up to 2,000 characters of the data as JSON,** scrubbed like every event's
  attributes (PAR-621). It's at the `warn` level, so it's a Sentry log and breadcrumb, not an error.
- **`project.unsupported` is the service refusing to open a project**: no package.json (`no_package`), no renderer for
  its framework (`no_renderer`), or no builder for its bundler (`no_builder`), with the message the person sees.
  `openProjects` takes an `unsupported` callback rather than the telemetry, so its tests record through a test sink
  without Sentry.

## Every event says who was driving, and in which test pass (PAR-630)

Events are tagged with `environment`, `release`, `test_run`, `driver`, `agent` and `agent_client`, and Sentry's user is
the install. docs/telemetry.md, "Who's driving", lists them. My calls:

- **Main tracks who's driving, since every agent call and every event reaches it.** The service tells main about each
  agent call (`agentCalled`); a key pressed in the editor window (`before-input-event`) hands back to the person. Main
  puts the tags on its scope and on each error as it's sent.
- **An agent drives for 10 seconds after its last call** unless the person acts first. Main doesn't see a person's
  pointer, and listening to every input event would count the clicks `drive.ts` sends over the DevTools protocol as a
  person's.
- **The client is MCP's `clientInfo.name`,** which the CLI now sends with each call as `client`. The CLI on its own
  names none, since nothing declares it.
- **CI's run is read from GitHub's own variables in the suite's launcher** (`e2e/launch.ts`), since the workflow calls a
  shared pipeline that takes no environment.
- **The agent's session names Sentry's user** only when no `PARITY_TESTER` is set; the install ID stays its id.

## One action is one trace across processes (PAR-629)

The window starts a trace for each action and gesture, and the requests it causes carry it through the service, main,
the offscreen renderers and builders. An agent's call starts its trace in the CLI. My calls:

- **`ChannelMessage` requests gained an optional `trace` field,** `sentry-trace` and `baggage` as `traceHeaders` in
  `@parity-app/telemetry` writes them. The channel passes it on without reading it: `trace` reads what to send, and
  `around` runs each handler with what came. A request without one, from an older sender, is answered as before and
  starts a trace of its own. The window's `ask` through its preload takes it as a third argument.
- **Handlers are wrapped by the channel, not edited.** The service's window channel and both ends of the service-main
  channel run each handler in a `request.handled` span (`shared/tracing.ts`), timed, with the error code on failure.
  Main's `record` isn't a span, since every span would record another.
- **Node follows the span across `await`s with `AsyncLocalStorage`;** a page has no async context, so the window's trace
  is the latest action or gesture that hasn't ended (`renderer/tracing.ts`). An async action stays the window's trace
  until it settles, so a save's requests after its first `await` still carry it. Two at once give the later one.
- **Queued work keeps the trace it was queued under.** An offscreen job takes the trace when it's queued and draws in a
  `frame.drawn` span with how long it waited (`queuedMs`), and a builder's start is a `builder.started` span until its
  session is up. A file write the design store schedules after an edit is sent in that edit's trace (`keepTrace`).
- **The CLI makes the trace's IDs with `node:crypto`,** not `@parity-app/telemetry`, which it doesn't depend on yet, and
  sends them as headers; the agent server's `agent.called` span continues them. Until the CLI records spans of its own,
  the trace's root span isn't in Sentry, but every span in the app shares its trace ID.
- **Code reaches its process's telemetry through `traceWith`,** which each entry calls with what `startTelemetry` or
  `startEvents` returns. Until then, as in unit tests and stories, nothing is traced.

## A layer can use its own values, not only tokens, if they're valid (PAR-652)

Call 1 of the Design panel proposal ([design-options.md](proposals/design-options.md)) asked whether a layer can use a
value that isn't a token. PAR-194 let lengths leave the spacing scale but kept colours, type, radius and shadows as
tokens, and PAR-186's colour picker edited tokens rather than layers. Andrew's answer: you should be able to add custom
values, not just be locked to the design tokens, and the value should be checked against its type and verified to be
valid.

- **Every field takes a value of its own** as well as a token: a colour, a gradient, a shadow, a font size or a radius,
  not just a length. It's marked as off the system, with the nearest token one click away.
- **A value is checked before it's stored.** A typed value must parse as the field's value type (a length, a colour, an
  angle and so on) and be one `CSS.supports` accepts for the property. One that isn't stays in the field, outlined in
  the error colour with the reason under it, and nothing is stored (Invalid as typed in
  [design-options-fields.md](proposals/design-options-fields.md)). Values read from code or a file are checked the same
  way and marked if invalid.
- **How strict a project is stays its own setting,** per kind, in its `.lib.par`: Any value, Marked (the default),
  Tokens only, and Semantic only for colours, with Allow here for an exception
  ([design-options-tokens.md](proposals/design-options-tokens.md), Levels).
- This widens PAR-194's "colours, type, radius and shadows stay tokens"; its flag for lengths off the scale becomes this
  mark.

## Every action is recorded by the action list's one wrapper (PAR-639)

`command.ran` records each action in `chrome/actions.ts`, whatever asked for it. My calls:

- **It's the action's trace, not a second event.** PAR-629's `action.ran` span is now `command.ran`, with what ran it
  (`from`), whether it applied (`enabled`), and how many layers and designs were selected. The span gives the outcome
  and duration, and the work the action causes joins its trace.
- **The wrapper is `run(from)`.** `recordActions` (`chrome/record-actions.ts`) wraps every entry, and the window runs an
  action only through it: keys, the menubar, the canvas and Layers menus, Search actions, the toolbar and panel buttons.
  An action bound to where it was asked for passes `instead`. New screen where the canvas menu opened, or Save for the
  Tokens panel's project, runs that in the action's place, still recorded under the action's ID.
- **One tried while it doesn't apply is recorded as cancelled and doesn't run.** That's a Ctrl shortcut on the canvas or
  any app shortcut. A plain key that doesn't apply still does what it would anyway, such as Tab moving focus, so it
  isn't recorded. The wrapper asks `available` itself, so every caller gets the same answer.
- **Selection is counts, not IDs or names.** That's enough to tell an empty selection from many layers. It stays cheap
  for PAR-647's budget: one `available` call and one count per command.
- **A test fails if window code calls an action's command directly** (`record-actions.test.ts`). It reads the source and
  flags any file that imports a function the actions run from `commands.ts`, `layout.ts`, `create.ts` or
  `QuickInsert.tsx` and calls it anywhere except through `instead`. Search actions' extras with no shortcut (Export all,
  Snap, Performance stats, Clear bitmap cache, About) aren't in the action list, so they aren't recorded.

## Interface events are recorded by the stores that own them (PAR-634)

`tab.*`, `panel.shown`, `dialog.opened`, `mode.switched`, `setting.changed` and `start.action` are recorded where the
state changes, not at each control: the workspace's tab list is watched and compared (`tabEvents`), and the layout,
preferences, dialog and selection stores and the start page's actions record their own changes through
`recordInterface`. A tab is sent as what it shows (Home, a project or a new tab), never by its folder, and a tab that
takes a new id as its project opens isn't an open, a close or a switch. Mode means designing or Interact, the canvas's
one switch between editing and using the designs.

## Editing is recorded once per thing done (PAR-640)

`gesture.ended`, `edit.undone`, `edit.redone`, `inspector.changed`, `insert.done`, `clipboard.pasted`,
`clipboard.failed` and `text.edited` are in [telemetry.md](telemetry.md#editing), from `editing-events.ts` in
`@parity-app/telemetry`. My calls:

- **Nothing is recorded per pointer move or per frame, so nothing is sampled.** Each event is one gesture, step, field
  change, insert, paste or edit. A frame rate is a count kept while the gesture lasts and sent with its end. PAR-647 can
  sample them if their volume needs it.
- **Gesture kinds are the names `canvas/gesture.ts` already gives them** (`resize`, `layerDrag`, `absoluteDrag`,
  `titleDrag`, `boxSelect`, `frameDraw`), with `move` for boards and notes tldraw moves, `nudge` and `fieldNudge` for
  runs of presses, `insertDrag`, `pan` and `zoom`, rather than the proposal's coarser list, so a kind matches the code
  and its `gesture.ran` trace.
- **A pan or zoom is one gesture until the camera has been still for 300 ms,** as the camera has no press and release of
  its own. It includes the camera's own moves, such as zooming to fit.
- **`undoStep` comes from the design store:** `endGesture` now says whether the gesture made a step, so a drag taken
  back, or one that changed nothing, says no.
- **Undo and redo are recorded in the design store,** so the toolbar, the keys, the menus and the toasts' Undo all
  count, with the designs whose entries changed and the files the step writes.
- **Inspector values go as JSON,** with `mixed` for a row whose layers differed, and a change that leaves the value as
  it was isn't recorded. The style rows and a layer's text, visibility and props are covered; the rest of the inspector
  (names, images, tokens, states) isn't yet.
- **A paste is an insert too,** so `insert.done` covers everything that puts something on the canvas, and
  `clipboard.pasted` says which paste and what was on the clipboard.
- **A text edit closed by Escape is committed,** as Escape keeps the edit. It's `unchanged` when the text is as it was
  and `cancelled` when the editor closes before it could write, as when the layer goes.

## `parity logs` reads the local copy (PAR-636)

`parity logs` and the MCP tool `get_logs` read Parity's own events from the local copy main writes at every level
(PAR-627), so an agent debugging Parity reads them as it reads a project's console. My calls:

- **It reads the files, not the app,** so it works when the app has quit or crashed, and with diagnostics off. The
  folder is `desktopDataFolder`'s `logs`, so `PARITY_USER_DATA` points it at another copy.
- **Without a session, it shows the last run,** the newest event's `sessionId`. A trace or test run can span runs, so
  `--trace` and `--test-run` search them all, as `--session all` does.
- **`--level` is the lowest shown,** since asking for warnings means wanting errors too. `--trace` takes the start of an
  ID, as the text form prints its first 8 digits. `--since` takes an ISO time or `30s`, `10m`, `2h` or `1d`.
- **The newest 100, oldest first,** with `total`, `truncated` and `limit` (up to 1000), as `console` and `tokens` say
  them. Lines a crash cut short are skipped.
- **Main writes the test run on each line as `testRun`,** from `PARITY_TEST_RUN`, since PAR-630's `test_run` tag goes to
  Sentry's scope and not into the envelope.

## Report a problem sends from main, built from the local copy (PAR-635)

Help > Report a problem and `parity diagnostics` share `@parity-app/telemetry`'s `diagnosticFiles`, so the report and
the zip hold the same things. My calls:

- **Main sends the feedback,** with the screenshot it took and the files it reads from the local copy, scrubbed. The
  window flushes its replay first and passes the replay and trace IDs, so Sentry shows the replay beside it.
- **It's sent even with Share diagnostics off.** The person asked, and the dialog lists what goes. Sentry is switched on
  only while it's sent.
- **The person never sees Sentry:** no link, no Sentry wording, and a failure says to check the connection. The
  feedback's ID goes into the local log as `report.sent`, for the team.
- **A crash is a run that didn't quit:** main records `app.quit` as it quits, so a run of main's with none crashed or
  was killed. It's offered only in installed builds, since agents and CI stop development copies all the time.
- **`parity diagnostics` takes the latest run that didn't quit,** which is the one open now if Parity is running, and
  says so. It writes the zip with Node's own zlib, with no dependency.

## Frame renders, previews and the bitmap cache are recorded (PAR-638)

Main records each offscreen frame and its failures, and the service records previews and the cache's hit rate, as
docs/telemetry.md lists. My calls:

- **`frame.drawn` became `frame.rendered`,** one span for every offscreen draw, frames and previews alike, with the
  timings and size PAR-638 asked for added to the queue wait it had. The design is the job's `design.key`, which a
  component preview has none of; its priority (`visible` or `idle`) says it's one.
- **`frame.failed` is a warning, not a Sentry error.** Sentry's alert files a Linear bug for every new issue, and most
  guest failures are a project's own component throwing, as the first run showed (`TabsList` must be used within
  `Tabs`). It goes as a log and a breadcrumb, with the guest's message and stack.
- **The failed frame's picture goes with the errors after it.** A log can't carry an attachment, so main captures what
  the offscreen window shows when a frame fails and adds it to the Sentry errors in the next 10 minutes as
  `failed-frame.png`, in `beforeSend`, until another frame fails. Not on Sentry's scope, which would attach it to every
  span's transaction too.
- **Why it failed is read from the message:** a module that didn't load, in Chromium's, Vite's and Node's words, or else
  `render threw` (`frameFailure`). **`timed out` is recorded without stopping the frame:** a draw still going 30 seconds
  after its turn came is recorded once and left to finish, since giving up on it would leave the window drawing under
  the next job.
- **The guest's stack reaches main as the frame's `errorStack`,** the first error's, and main takes it off before the
  frame goes on, so agents' results are as they were.
- **The hit rate counts lookups, in the service.** A frame bitmap is a hit when `frames.stored` finds one. A preview is
  a hit when `previews.lookup` finds anything kept for its code, a picture or that it failed or drew nothing, since none
  of those is drawn again; `previews.make` checking again isn't counted. The session's totals go each minute there was a
  lookup, so a short drive still sends them.
- **Nothing is sampled.** Opening `examples/shadcn-vite` with an empty cache drew 642 frames and made 372 previews, with
  151 failed or empty and 16 frames failing, in two minutes; `request.handled` sent 1,471 in that time. Opening it again
  drew no frames and made no previews. Spans go to Sentry as transactions, not logs, so `frame.rendered` doesn't reach
  Sentry's logs at all. If a busy project's frames prove too many, they'd need a Sentry-only share, since `sample` drops
  an event from the local copy too.

## Failing components show in the console, and saved code reaches the canvas live (PAR-165)

Called on 2026-11-07. PAR-165 asked for a failing component's error box and a badge on its frame without covering what
drew, failing layers marked in Layers and the inspector with the reason and the fix, and the canvas updating within a
second of a component file being edited or broken, without reopening the project. You approved the design in Storybook
(`Parity/Canvas/Boards` FailingLayer, `Parity/Chrome/Console`) after reworking it. Your calls:

- **The reason goes in the console, not the inspector.** A failing layer is an error in the console for as long as it
  fails, with why, the fix and a button selecting the layer, so the board's console badge and the status bar count it,
  rather than a badge of its own and a notice above the layer's fields. The Layers mark opens the console on the design.
- **The box reads as broken, without text.** A thin dashed red outline over fine red hatching with an icon, as light as
  a missing component's, since the text inside was unreadable at the zooms people work at.
- **The console filters levels as DevTools do:** a menu whose button says what shows, with a checkbox and count for each
  level, in place of a segmented All and three levels, with the errors and warnings counted on the header's right. The
  design filter, the group's Select button, each message's time and the empty console's line about agents are gone; a
  badge opens its design's group, in view, with the others closed.

My calls:

- **The frame keeps what it drew.** A component's boundary already drew its error in its place. The sheet laid over the
  whole frame for any error now shows only for an error that stopped the frame drawing, and across its top, so whatever
  drew stays in view.
- **Failures are counted per frame, by its boundaries.** Each frame's root gives its boundaries a context they report
  failing and drawing again to, so the canvas knows which layer fails in which frame, beside the guest-wide status the
  Components panel reads. The console lists a layer once, however many of its frames it fails in, with each frame.
- **Failures stay through Clear.** They're how the canvas is now, not a record, so Clear empties what was logged and
  leaves them, and they go when the component draws again. Agents read failing components from `parity components` and
  Problems, so they aren't added to `parity console`.
- **The fix is read from the error.** A missing provider names the provider a decorator should add, taken from the error
  when it names one, or from what routers, query clients, Redux, React Intl and Apollo are known to say. An error naming
  a parent it must be used within, as Radix's parts do, asks for a parent layer, not a decorator. Nothing is guessed for
  the rest; the error shows as thrown.
- **Live edits go through the builder, not an HMR client.** The guest has no HMR client and React Fast Refresh needs
  React's development build, which frames don't run (PAR-198). Instead the builder stamps the changed modules and their
  importers as Vite's HMR would, and the window imports the affected components again at `?t=` addresses, which Vite
  rewrites the imports beneath them for. The page never reloads, components that didn't change keep their state, and a
  component that failed starts over. Reopening still takes a new port (PAR-422).
- **Frames are keyed by the components they draw.** One revision for the guest's code redrew every frame and retook
  every bitmap whenever any component moved, which PAR-439 accepted as rare; with a save doing it, a widely used
  component's edit would retake most of a project's bitmaps. A frame's key now names the source and version of each
  component its tree draws that the guest was given since it loaded.
- **A board keeps its last picture while the new one comes.** Before, a frame whose key changed showed nothing until its
  new bitmap was taken, which after a save blanked every board drawing the component for seconds. It now shows its last
  bitmap, drawing live behind it, and only sleeps on a bitmap of what it shows now.
- **Left for later:** a board drawn only from a bitmap kept from an earlier session has no console error until its
  frames draw, since offscreen captures don't report failures; and a class new to the project has no CSS until the
  project opens again, since the guest's stylesheet isn't reloaded.

## Support can sign in as someone's account, through WorkOS (PAR-693)

The design is in [proposals/impersonation.md](proposals/impersonation.md), and the work is PAR-695 to PAR-697. Your
calls on 2026-11-06:

- **Only Better Apps' WorkOS team can impersonate,** from WorkOS's dashboard with a reason, since WorkOS has no API to
  start it. Organization admins can't.
- **Nothing is blocked while impersonating.** Changes are attributed to the support person as well as the user.
- **The user isn't told.** WorkOS's `session.created` event and Parity's own records keep it.

My calls:

- **Parity asks before switching,** naming the account, who started it and why, since a link from the browser shouldn't
  swap accounts by itself.
- **An amber band under the tabs, on every tab,** with no border around the window (your call), that can't be hidden,
  shows whose account it is and a small End session button. Above the menus isn't possible: the system draws its window
  buttons over that row. There's no countdown (your call), since WorkOS doesn't say when the session ends.
- **It ends signed out,** whether ended from the band, by Sign out, by WorkOS's 60 minutes or by quitting. The
  impersonated refresh token never goes to `safeStorage`, and the support person's own session isn't kept aside.
- **Telemetry tags every event in it** with `impersonated: true` and the support person's email.

## The Design panel's calls (PAR-652)

[design-options.md](proposals/design-options.md) asked ten calls about how the Design panel covers CSS. Call 1 is above,
under "A layer can use its own values". Andrew answered all but 6 on 2026-11-07, accepting the recommendations for 2, 4,
5, 8, 9 and 10 as written, and adding to 3 and 7:

- **Stroke's position (2):** Stroke owns `border` and `outline`, and Effects alone owns `box-shadow`. Include in layout,
  on for a new stroke, writes `border`. With it off, Inside, Center and Outside write `outline` with an offset of minus
  the width, minus half or 0. Per-side and gradient strokes need Include in layout.
- **Chromium-only properties (3):** offered, marked. Andrew added that the marks should come from Can I use against the
  project's own browserslist query (synced with the one it has, or added), which needs planning of its own: PAR-706.
- **One stored key per property (4):** each CSS property is stored in one place, so the CSS row can't hold a value that
  fights a control, and a list shown in two sections is still one declaration.
- **Section order (5):** Position, Size, Layout, Spacing, Appearance, then Text, Image or Icon, then Fill, Stroke,
  Effects, Selection colors, Transform, Text inside, Interaction, Motion, CSS.
- **What a state writes (7):** in Tailwind projects, pseudo-classes and attributes by default, a prop only when the
  component's code has one, written as variants, with `group-*`, `peer-*` and `has-*` for other layers' states. Andrew
  added that not every project uses Tailwind and the panel mustn't overfit to one framework: PAR-708 maps the overlaps
  between frameworks and picks which concepts become first-class panel features, with Tailwind's output as one
  adapter's.
- **Viewports (8):** code is written mobile-first, each wider viewport adding its prefix only where its value differs
  from the one below (`p-4 md:p-6 lg:p-8`), and the frame draws a viewport's values from its width up to the next, as
  the code does.
- **A typed % (10):** in a field whose CSS takes a percentage, `%` is CSS's percentage, written as a fraction where
  Tailwind has one (50% → `w-1/2`). Figma's share of the current value is typed as maths (`*0.5`), and the hint says so.
  This replaces CAN-48's reading; PAR-194 decides the stored form.
- **A class Parity can't read back (9):** when a component's class list holds a class no control covers, such as
  `[&_svg]:size-4`, an edit no longer has to freeze the component as code or drop the class. A third answer, offered
  first, keeps the class on the layer, written back unchanged on every later write (`flex gap-2 px-6 [&_svg]:size-4`
  after Padding changes `px-4` to `px-6`), and shows it in the CSS section as a read-only From the code row. Freezing
  and overwriting stay as the other two answers.

Andrew answered **6, what a typography preset is,** on 2026-11-08, after trying PAR-707's exploration in Storybook
(`Parity/Explorations/Typography preset`). A typography preset is a design language's bundle of type values, such as
Fluent's typography styles, each of which sets font, size, weight and line height. A layer syncs to it and is locked by
it, something other design tools don't offer. Whatever a framework calls them, Parity calls them **typography presets**
everywhere, in the panel, the Tokens panel, the CLI and the agent API, so the words don't change between projects. The
design language's name shows only where the picker says where a preset came from ("From Fluent"), never the code it's
read from. Andrew chose "preset" over "text style": in a panel where every value is a style, "style" could mean any of
them, while a preset says what it does, filling in the fields it covers and locking them while it's applied.

The exploration showed the rows a preset covers three ways: folded into a summary, shown locked in place, and both.
Andrew chose **folded and locked**, the combination he asked for after liking the other two. Folding hides rows that
someone sticking to presets doesn't need, and locking shows that the preset holds them.

- **Picking:** the Text section's first row picks a preset. The picker lists each on one line, drawn in its own font,
  size and weight with its size and line height, under where it comes from. Choosing one fills in the rows it covers.
- **The rows it covers** fold into a summary under the preset's row, "Segoe UI 20/28 Semibold" with a lock beside it.
  Opened, they're locked to the preset's values, each with an Unlock button. Rows it doesn't cover stay ordinary rows:
  color, alignment and decoration always, and font and weight for a preset such as Chakra's `lg`.
- **Overriding:** changing an unlocked row keeps the preset. The value shows in the override color with a reset arrow,
  the row stays shown while the summary is closed, and the preset's chip gets a dot. Picking the preset again takes back
  every override.
- **Detach** is an icon button beside the picker, not a menu, since each override already has its own reset. The layer
  keeps every value the preset gave it, per viewport.
- **A layer with no preset** whose type matches one says "Matches subtitle1" under the preset's row, or "Near subtitle1"
  when a preset's size is within 2px, with Use one click away, as a value off the system offers the nearest token.
- **Per viewport:** a preset that changes with the viewport, such as Material UI's responsive `h4`, has a dot on its
  row, and changing one of its rows writes that viewport's patch.
- **What it stores and writes:** the layer stores the preset's name and its own values, the same in every framework
  (`typePreset: { token: "subtitle1" }`). Tailwind's adapter writes the preset as one class, a `--text-*` size
  (`text-xl`) or, when the preset names a font or sets case, a project utility (`type-subtitle1`), with each override as
  a class after it (`leading-6`). PAR-708 maps the other frameworks, and PAR-135 reads the presets.

## The Design panel has no kind switch (PAR-721)

Andrew found the Frame, Component and Screen toggle under a design's name "very ugly" on 2026-11-08, and asked why
changing a design's kind should be so easy from there. It repeated the title menu's Convert to items, and the icon
beside the name already shows the kind, so he asked to remove it. This replaces "The inspector's kind switch is Frame,
Component, Screen" under PAR-545: converting is in each design's title menu, and as Make component's Convert to in the
canvas and Object menus, with the same toast, Undo and dialog as before. The panel keeps the design's path and, for a
frame, where it's drawn.

## Agent calls are recorded where they're answered, and the CLI keeps its own log (PAR-641)

The agent server records every call as its `agent.called` span, and the CLI records its own runs, connection failures,
version mismatches and MCP sessions. My calls:

- **One place for each.** A call is recorded in the service's agent handler, not by each CLI command or MCP tool, so
  both transports are covered by one span. The CLI now says which it is, as `transport` in the body it posts; a body
  from an older CLI counts as MCP when it names an MCP client.
- **The inputs go as JSON, cut short, with an `exec` snippet apart.** `input` is the params without the snippet, up to
  2,000 characters, and `snippet` the code, up to 10,000, both scrubbed like every attribute. Warnings are recorded by
  category with their counts (`overlap:2 unknown_prop:1`), not their messages, and alternatives by how many.
- **A snippet that fails without throwing ends its span as `error`.** `exec` and `screenshot` answer `ok: false` rather
  than throwing, so `endWhenSettled` takes an optional `settled` that says how a span ends, and `inSpan` passes it on.
- **The CLI's events go to `~/.parity/logs/parity-cli-<date>.jsonl` until PAR-642 sends them,** written as they happen,
  since a command is short, with the newest 10 days kept. The install ID is the app's, from `telemetry.json`. Nothing is
  recorded until `bin.ts` starts it, so code that imports the client records nothing, and under Vitest only a folder
  `PARITY_CLI_LOGS` names is written to.
- **A command's calls carry its `cli.ran` span,** so its trace has a root in the local log. `parity mcp` ends its span
  once it's listening, and each MCP call starts its own trace, as before.
- **`cli.ran` records flags by name only,** since their values can name files, projects and snippets.

## Opening projects, builders and servers are recorded (PAR-637)

The events are in [telemetry.md](telemetry.md#events), from `project-events.ts` in `@parity-app/telemetry`. My calls:

- **`project.opened` and `project.openFailed` are events, not spans,** since a span keeps the name it started with and
  the outcome decides the name. Each carries its total and per-step times as attributes (`detectionMs`, `builderMs`),
  and the steps are spans in the open's trace: `project.detected` for reading the package, tools, files and components,
  and `builder.started` (PAR-629) for the builder.
- **`project.openFailed` names the step that failed,** `detection` or `builder`, with the message the tab shows and the
  `CodedError` code when there is one. An unsupported project is still `project.unsupported` too.
- **The window's part is `project.loaded`,** recorded once the tab's guest and components have loaded, with the time
  from asking to open it. It names the project by `name` and `root`, as `project.opened` does, so the two can be paired
  when several projects open in one session. The first frame drawn is `project.drawn` (PAR-711), below.
- **TypeScript's version comes from its installed package,** since detection doesn't list it; React, Vite, Tailwind and
  Storybook come from detection.
- **A reopen is one the service makes as it starts** (PAR-179), and `cached` means the components and props came from
  detection's cache.
- **`builder.crashed` is a `warn` with the builder's exit code or signal and its last 50 lines,** next to the Sentry
  error the service already sends for a crash, so the crash shows in the trace's logs as well as in Issues.
- **`server.started` and `server.failed` come from the process manager,** with `exited` or `timeout`. Builders run in
  processes of their own, outside it, so they have their own events.
- **Node code records through `track` in `shared/tracing.ts`,** which puts the event under the span the process is
  working in, as `inSpan` does for spans.

## The first frame drawn when a project opens is recorded (PAR-711)

The events are in [telemetry.md](telemetry.md#events), from `project-events.ts`. My calls:

- **The window starts the open's trace, as `project.opening`.** It's a span from asking to open a project until its tab
  is ready, the open fails (with its code) or the tab is closed (cancelled). It continues the trace of the action that
  asked, such as Open project, and starts one of its own otherwise, as at startup or from the start page. The
  `project.open` request is asked in it, so the service's `project.detected`, `builder.started` and `project.opened` are
  in the same trace, and so is `project.loaded`. Before this, an open from the start page had no trace in the window.
- **The first frame is `project.drawn`, an event in that trace,** since it comes after the span ends, when the canvas
  has mounted. Its `durationMs` runs from asking to open, the same start as `project.loaded`, so the two compare. `from`
  says whether the frame drew its design (`live`) or showed a bitmap kept from an earlier session or captured offscreen
  (`bitmap`).
- **A frame counts once it's seen on screen, not once it's ready.** Frames offer a bitmap once it's decoded, and a live
  frame once the guest has put its design in it (a `MutationObserver` on the element it mounts in). Then, each animation
  frame, `canvas/first-frame.ts` checks whether what was offered is rendered (`checkVisibility`, which leaves out a live
  frame that `content-visibility` skips while its bitmap stands in) and in the window. Whether a bitmap shows depends on
  styles (the zoom, sleep, the selected board), so a decoded bitmap that stays hidden at the zoom a project opens at
  isn't counted. The check stops at the first frame seen, or when nothing is offered.
- **Only the first frame of a newly opened or reopened tab is recorded.** A tab opened in the background, as at startup,
  records it when it's first shown, so its time includes the wait. A project with no designs draws no frame, so it has
  no `project.drawn`.

## The CLI sends to Sentry from a process of its own (PAR-642)

The CLI's events, its `cli.ran` spans and the errors it hits go to Sentry's `parity-cli` project through `@sentry/node`
11.8.0, the version `@sentry/electron` 8.3.0 already brings, approved with "Parity's own telemetry goes to Sentry, on by
default". How it runs is in [telemetry.md](telemetry.md#agents-and-the-cli). My calls:

- **A command never loads `@sentry/node`.** Loading it took about 300 ms here, against about 150 ms for a whole
  `parity tabs`, which would break "It never slows a command". A command keeps what it would send, writes it to
  `~/.parity/outbox` as it exits, and starts a detached `node send.mjs`, which sends every batch waiting and exits.
  `parity tabs` took about 20 ms longer with diagnostics on. This replaces the issue's in-process flush with a short cap
  on exit, which would still have waited on the load or the network.
- **One sender at a time, and nothing left behind.** The sender holds `.sending` in the outbox while it sends, takes a
  lock two minutes old as a dead sender's, removes each batch before sending it, and reads the folder again after
  letting go. A batch a day old is dropped unsent, as from a computer that was offline.
- **The Sentry mapping is shared, in `@parity-app/telemetry`.** `createSentrySink`, `breadcrumbOf`, `errorOf`, `logOf`
  and `transactionOf` moved there from `apps/desktop/src/shared/sentry-sink.ts`, typed with the parts of Sentry's types
  they fill in, so the package still never imports Sentry. The CLI uses the same sink with `upload`, as main does:
  events as logs and breadcrumbs, spans as transactions with Parity's own IDs, so `cli.ran` is the root the app's
  `agent.called` continues.
- **Errors that are bugs, not answers.** A command's failure goes to Sentry only when it isn't one of Parity's coded
  errors: invalid input or an app that isn't running is the command's answer, on `cli.ran`. An error nothing caught is
  sent as unhandled. Both carry the command's trace.
- **The same setting, read each run.** `cliTelemetrySetting` reads the app's `telemetry.json` and the variables through
  `resolveTelemetry`, so `PARITY_TELEMETRY`, `DO_NOT_TRACK` and Vitest decide as they do for the app, and a
  `PARITY_TELEMETRY` that isn't a level fails the command. Before the app has run, the CLI sends, as install `none`.
- **Every CLI call counts as an agent's,** as the app counts them: `driver` is `agent`, `agent` the caller's name
  (`Terminal` unless `PARITY_AGENT_NAME` or MCP names it) and `agent_client` the MCP client.
- **Installed means installed from npm.** A CLI under `node_modules` reports as `tester` and names its release
  `parity-cli@<version>`; one run from a checkout, from source or its own `dist`, reports as `development`, named by the
  checkout's commit, which the sender reads with Git. A pkg.pr.new preview is installed too, so it reported as its
  version until PAR-719 named it by its commit; see "The published CLI's source maps go to parity-cli" below.
- **The notice is one line on stderr, once:** "Parity shares diagnostics to help fix bugs. To stop sharing them, turn
  off Settings > Privacy > Share diagnostics in the app, or set PARITY_TELEMETRY=off." It names the switch by its path
  in the app, not Sentry, as PAR-626 asked, reviewed with the writing-style-guide skill, and stays off stdout, which
  agents parse. `~/.parity/telemetry-notice` says it was shown.
- **The CLI scrubs keys, tokens and passwords, not `.env` values,** which only the service reads.

## The interface is set in Inter (PAR-709)

- **Parity's own interface is set in Inter, not Geist,** Andrew's call on 2026-11-08, after seeing the proposed type
  ([interface-type.md](proposals/interface-type.md)) set in both at the same sizes and weights. Inter was drawn for
  interfaces at small sizes. Its optical sizes run from 14px, so they tighten names and headings; the chrome's 11 to
  13px all use the 14px cut.
- **It's Inter's own release, bundled with the app,** 4.1 from github.com/rsms/inter, in
  `apps/desktop/src/renderer/fonts/inter` with its licence (SIL OFL 1.1). Andrew agreed on 2026-11-08: it's a desktop
  app, so shipping the font is no problem. The npm builds come from Google Fonts and leave out the alternates that tell
  I, l and 1 apart, which a design tool needs for layer names, token names and values. `styles.css` loads it with
  `font-display: block`, since the file is local.
- **The rest of the proposed type is approved,** Andrew's call on 2026-11-08: its sizes, roles, sentence-case section
  titles and monospace, as [interface-type.md](proposals/interface-type.md) sets them. Its weights, 450, 550 and 650,
  stay provisional until the check on a Mac and on Windows at 150% that the proposal sets out.

## The interface type is built into the app (PAR-710)

The approved type from [interface-type.md](proposals/interface-type.md) is the app's, and [typography.md](typography.md)
describes its roles and their classes. My calls, and Andrew's where named:

- **Four chrome sizes in the theme:** 11/14 (`text-2xs`, with 0.01em), 12/16, 13/18 and 15/20, with headings at 18/24
  and 24/32, set in a plain `@theme` in `styles.css` so the kit's components read them. Line heights are ratios. Wrapped
  text has its own utilities, `type-description`, `type-message`, `type-body`, `type-empty` and `type-code`.
- **Weights at 450, 550 and 650, still provisional,** through `font-normal`, `font-medium` and `font-semibold`, with
  Inter's medium and semibold held once as `--weight-sans-medium` and `--weight-sans-semibold`. Font smoothing isn't set
  yet: the proposal pairs it with the weights, so both wait for the check on a Mac.
- **Code is set in each system's monospace,** Cascadia Mono, Menlo or Consolas, at 400 with Cascadia's lowercase height
  through `font-size-adjust`, never medium.
- **The kit's overrides stay in the app,** Andrew's call on 2026-11-08: the type is Parity's, not something every app
  built on Buildkit should take. Each is a rule in `styles.css` keyed on the kit class it replaces, and
  `kit-type.test.ts` fails when a kit upgrade adds or changes one of the kit's own type classes.
- **The app depends on `cn` directly,** 0.5.1, the merger the kit's runtime already uses, Andrew's go-ahead on
  2026-11-08. `class-merger.ts` registers `text-2xs` as a size and the `type-*` roles as sizes with line heights, and
  installs it with the kit's `setCn`, so a caller's role replaces the kit's size rather than sitting beside it. Without
  it, `cn` read `text-2xs` as a color and dropped it beside one.
- **Names have their own letters:** `<Name>` and `NameInput` (`chrome/Name.tsx`) carry `name-text`, Inter's `ss04` with
  contextual alternates off, wherever a name stands on its own or is edited.
- **The 12px titles are components:** `PanelSectionTitle` with a `lead` or `quiet` tone, `GroupLabel` and
  `DialogGroupTitle`, so the three styles can't drift apart again.
- **Geist's package is gone,** and with it the Storybook Type control and the exploration's stylesheet. The Scale story
  stays as Parity/Type/Scale.
- **The lint rule lands on its own,** as PAR-729: it can only pass once every class is on a role, and it's a plugin with
  tests of its own, so it follows this build rather than holding it up.

  stay provisional until the check on a Mac and on Windows at 150% that the proposal sets out. PAR-710 builds it into
  the app.

## Agents report problems through the app, as user feedback (PAR-646)

`parity report` and MCP's `report_problem` send what an agent saw as a Sentry user feedback, the same kind as Help >
Report a problem. My calls:

- **The app sends it, not the CLI.** The report needs the window's screenshot and replay, which only the app has, and
  has to arrive before the command returns its link, which the CLI's outbox (PAR-642) doesn't. So `report` is an agent
  method like the others: the service draws the frames, the window flushes its replay, and main sends the feedback to
  `parity-desktop` with `report.sent` marking it `by: agent`.
- **It's tied to the call's trace,** the CLI's `cli.ran`, not the window's, so the trace shows the command, the call and
  the report's own request together. The window's replay goes beside it.
- **The tags are what the agent names, checked:** a design or state that isn't there fails as a screenshot of it would
  (`unknown_design`, `unknown_state`), so a tag always names a real one. A node is passed through, since an agent
  reporting a wrong node may name one that's gone. Without a design it needs no ready tab, so a project that failed to
  open can be reported, and with no tab named it works with no project open: the CLI routes it as `tab-or-any`, to the
  copy the person used last when no copy has a project open.
- **It isn't sent while Telemetry is off.** The person's own report goes regardless, since they chose to send it and see
  what goes; an agent's would override their setting. It fails with `app_error`, saying to tell the person instead or
  run `parity diagnostics`.
- **The link is the feedback's, by event ID,** in the `sentry.io/organizations/...` form, which Sentry redirects to the
  issue; the subdomain form of the same path doesn't. The Linear issue isn't known when the command returns, since
  Sentry's alert files it afterwards; the feedback links it.
- **The MCP tool list grew to 13.6 KB,** and its budget to 14 KB, for a tool agents are meant to reach for unprompted.

## The end-to-end suite checks the main workflows' events through the local copy (PAR-648)

`telemetry.e2e.ts` checks the events and traces of opening a project, a drag, a command from the keyboard, Save and an
agent's call, in CI only, as the rest of the suite runs. My calls:

- **It reads the local copy, not a test sink or Sentry.** The copy runs as `pnpm dev` does, and the local copy already
  holds every event and span from every process, so the app needs no test mode, and the events checked are the ones that
  leave. Asking Sentry would make a test wait on ingestion and need a token in CI.
- **CI's runs keep sending to Sentry,** under `environment: ci` and the run's `test_run`, so a failing test still links
  to its events and replay. The suite checks that every line of the local copy carries the run.
- **The agent's call goes through the real `parity` command,** from this checkout, against the copy's own agent file, so
  the test covers the CLI's trace reaching the app: `agent.called` must continue `cli.ran`. It runs in the checkout, not
  the project's temporary folder, so the sender it leaves behind can't stop the suite removing that folder.
- **Save's test is the one that writes,** since autosave is off by default and an edit alone writes nothing. It
  duplicates, saves, then undoes and saves again, so the file is back as it was and the reset after it finds nothing
  unsaved.
- **`gesture.ended` and the window's `document.saved` are checked by trace,** under the drag's `gesture.ran` and Save's
  `command.ran` spans. Both are recorded after that span has ended, so at first they carried no trace; PAR-752 passes
  each the span it belongs to through `track`'s `span`: the drag's trace's `context`, and for a write the trace it was
  asked in, the edit's that `keepTrace` kept or Save's, read before it waits on the service.

## Boards measure together as the canvas opens (PAR-726)

Called on 2026-11-08. `project.drawn` (PAR-711) showed a project's first frame coming 1 to 3 seconds after its tab was
ready. A profile of reopening the example project (61 designs, 119 frames) in the same window, on React's production
build, found no single cause. Everything between the tab being ready and the first frame was the window's own thread,
mostly one task of about a second that mounted tldraw, every board and every frame. In it: Session Replay recording the
new elements (0.2 to 0.3 s), asking the service for each frame's kept bitmap (0.16 s, each render job copied across the
preload bridge and then the port), the Base UI parts each board's title mounts (0.12 s), drawing the boards and frames
(about 0.4 s), and boards measuring themselves (0.15 s). My calls:

- **Boards measure together.** Each board read its size and wrote it to its shape at once, and the write moved the page,
  so the next board's read laid it out again: 68 to 70 layouts before the first frame. Now `measureTogether` in
  `canvas/measure-together.ts` runs the measures asked for in a task once it's done, every read and then every write,
  the writes as one change to the canvas: 8 layouts. They still run before the page is painted, as a microtask, so no
  board shows at a size it's about to leave.
- **The rest are issues of their own:** PAR-758 for Session Replay, PAR-759 for the kept bitmaps' requests and PAR-760
  for the boards' title controls. Drawing the boards and frames themselves is left as it is.

## Kept bitmaps are asked for together, as JSON text (PAR-759)

Called on 2026-11-08. Reopening the example project (119 frames) sent 119 `frames.stored` requests as its canvas
mounted, each with its frame's render job, and copying them across the preload bridge and onto the port took 196 to 250
ms of the window's thread before the first frame. My calls:

- **The frames a canvas mounts ask in one request.** `askStored` in `canvas/frame-bitmaps.ts` gathers the jobs asked for
  in a task and sends them once it's done, and the service answers each job's bitmap in order. Alone, this cut the cost
  to 159 to 184 ms: the bridge and the port copy the theme the jobs share once, but the trees, 94 different ones
  totalling 2.5 MB as JSON, were still copied object by object.
- **The jobs go as JSON text.** Text crosses the bridge and the port as one copy: stringifying the batch and sending it
  takes 37 to 59 ms in all. The service reads it with `storedJobs`, the render job's own check under `jsonText`, so a
  page sending anything else is refused as before. Sending only what the disk name needs wasn't simpler, since the name
  takes nearly all of the job, the theme and tree included.
- **Other requests keep their objects.** `frames.capture` sends one job at a time, and `previews.lookup` waits until the
  canvas's bitmaps are in, so neither was in the profile.

## Replays are scrubbed as they're recorded (PAR-679)

Session Replay recordings lose the same secrets as every other event, `.env` values included, through the editor
window's own scrubber (`replayPrivacy` in `renderer/replay.ts`), as "Secrets are scrubbed before any event leaves a
process" has it, and nothing else is hidden that wasn't before. My calls:

- **Text is scrubbed through Replay's `maskFn`, not `beforeAddRecordingEvent`.** The issue expected the second, but
  Replay calls it only for its own custom events (clicks, requests, spans), never for the page's snapshots and changes.
  `maskAllText` with a `maskFn` is the one hook that sees each text node, as the recorder reads it and each time it
  changes; the scrubber leaves everything but secrets as it was. Styles and scripts don't pass through it.
- **`beforeAddRecordingEvent` scrubs the custom events too,** since Replay adds them without `beforeBreadcrumb`: a
  click's breadcrumb carries the clicked element's text.
- **Fields are masked by name, not scrubbed.** Replay shows a masked field's value as stars whatever `maskFn` returns,
  and an unmasked one as written, so what's typed can't be scrubbed. `Field` marks a row whose name `isSecretName` calls
  secret, such as an `apiKey` prop, with `data-sentry-mask`, so its value shows as stars; password fields already do.
  Other fields keep their values, which is what makes a bug in the inspector findable. Parity has no integration
  settings or `.env` editor yet; when it does, they mask the same way.
- **What it costs:** scrubbing every text node in a full snapshot of the example project, open at the start (574 text
  nodes among 5,544 elements, and the 2,410-mutation change as it opens), takes about 2 ms in the window.
  `pnpm perf --open-only` against main, with replay recording in both, measured no slower opening: launch, reopen and
  restart were within run-to-run noise (main's 12.1 s against 10.6 s with scrubbing to a usable launch, 4.9 s against
  4.2 s to reopen, 6.7 s against 6.8 s to restart). So the scrubber runs on everything, rather than only on the fields
  that can hold secrets, which was the issue's fallback.
- **Checked in the app:** keys put on screen, clicked and changed came back as `[redacted]` in Sentry's stored recording
  segments, with the rest of the window's text as written (replay `c3060db5…`).
- **`.env` values reach the window a moment after it starts,** so text recorded before main passes them isn't scrubbed
  of them, though known shapes and long random strings are. They come as a project opens, before its panels show it.

## Session Replay waits for a project's first frame (PAR-758)

Called on 2026-11-08. PAR-726 found Session Replay recording every board, title and tldraw layer in the task that mounts
a project's canvas, before its first frame showed. Replay now holds off recording the page from the tab being ready
(`project.loaded`) until the first frame shows (`project.drawn`), and goes on with the same replay after. My calls:

- **Pause and resume the recorder, rather than block more of the canvas or lower the limits.** Blocking the boards would
  leave them out of every replay, and an element unblocked later shows as an empty box until the next full snapshot.
  Lower mutation limits stop the replay outright. Replay's page recorder pauses and resumes within one replay, and
  resuming takes a full snapshot, so the replay jumps from the page before the open to the drawn canvas. Clicks,
  requests and breadcrumbs go on being recorded meanwhile, and Replay resumes on its own if someone clicks.
- **Replay keeps `pause` and `resume` to itself.** The integration's `_replay` is reached from `holdRecording` in
  `renderer/replay.ts`, the module that sets Replay up. It only pauses a recorder that's enabled and recording, and only
  resumes the one it paused, if it's still Replay's and still paused, so a Sentry upgrade that renames it costs the
  saving, not the recording. PAR-679's scrubbing is unchanged, since the resumed recorder takes the same options.
- **The hold lasts until the first frame, or 5 seconds.** A project with no designs has no first frame, and a background
  tab records its first frame only when it's shown. `pageHolds` counts holds, so tabs opening together keep it paused
  until the last one draws.
- **It resumes in a task of its own,** after the frame that let go of it is painted. Resuming in the same animation
  frame put the snapshot, about 0.2 s, between the frame being seen and being painted.

Measured on `examples/shadcn-vite` (61 designs, 119 frames), React's production build, five reopens in the same window
each, before and after in fresh `pnpm perf --open-only --keep` copies, with the page's JavaScript sampled every 0.1 ms
and the profile cut at `project.loaded` and `project.drawn`:

| Tab ready to first frame | Before         | After          |
| ------------------------ | -------------- | -------------- |
| Time                     | 2.71 to 3.01 s | 2.29 to 2.53 s |
| Window thread busy       | 2.17 to 2.42 s | 1.79 to 2.00 s |
| Sentry's own code        | 406 to 508 ms  | 21 to 28 ms    |
| In the 2 s after         | 20 to 33 ms    | 206 to 232 ms  |

The snapshot taken on resuming moves after the first frame, 15 to 45 ms after it. The replay recorded over those reopens
(`f507a317…`) stayed one replay, with a full snapshot after each reopen of about 6,130 nodes, boards and canvas
included. Tests: `apps/desktop/src/renderer/replay.test.ts` (4: paused until the last hold is let go of and resumed
after that task, staying paused for a hold taken before it resumes, the 5-second limit, and leaving alone a recorder
that isn't recording or that Replay resumed or replaced). Gaps: that the hold starts at `firstFrameOf` in `workspace.ts`
and ends at the first frame was checked by profiling, not by a test.

## A render page's failure keeps its own message (PAR-680)

When the render page threw inside main's `executeJavaScript`, as `canvasHeight()` or `canvasAudit()` can, Electron
rejected with only "Script failed to execute", so the Sentry error for the failed capture and the error the service gave
an agent never said what went wrong. My calls:

- **Main's calls into the page answer with data.** `pageCall` wraps each one in the page in a `try`, and answers with
  `{ value }` or with `{ error, errorStack }`, the fields a frame's own failure already takes. `pageAnswer` checks the
  answer, as every other render answer is checked, and throws a `PageError` with the page's message and stack. Wrapping
  the call in main's script, not in `render.ts`, holds for project code that replaces `window.canvasHeight` too.
- **The error goes on as it did, with a better message.** The thrown `PageError` crosses to the service and the editor
  window through `codedErrors`, which carries its message, so the window's `render: failed` Sentry error and the
  service's answer to an agent say what the page said. No error route was added.
- **The page's stack goes with `frame.failed`,** recorded under the frame's span as `render threw`, as a guest's own
  error is. The stack doesn't cross processes, since `codedErrors` sends messages, and an agent never gets the guest's
  stack.

## A report from an error's fallback is linked to the error (PAR-704)

Report a problem in a fallback (PAR-667) opens the same dialog as Help > Report a problem (PAR-635), and the feedback it
sends names the error that fallback caught as its associated event, so Sentry shows the report on that error's issue. My
calls:

- **One report path.** The event ID rides along the existing one: `openReport({ eventId })`, the `problemReport` check
  (32 lowercase hex digits, like the replay and trace IDs) and `sendFeedback`'s `associatedEventId`. No second dialog or
  channel.
- **The window keeps the ID by the error it caught,** in a `WeakMap` beside `reactErrorHandlers`, since the boundary's
  reporter is handed the error, and the fallback's Report a problem is clicked after `onCaughtError` ran. An error
  thrown as a string or another primitive can't be a key, so its report goes unlinked, as before.
- **Its tag says where it came from:** `report: error fallback`, beside `help menu` and `after crash`.
- **The dialog doesn't name the error yet.** The issue's optional "The error from Layers" line in Also sent waits for
  Andrew's approval of the copy in Storybook.

## The published CLI's source maps go to parity-cli (PAR-719)

A stack from the published CLI named its bundled chunks (`dist/client-<hash>.mjs`), since `vp pack` wrote no maps. It
now resolves to `packages/cli/src`, as the app's does to its source (PAR-625). How it runs is in
[sentry.md](sentry.md#releases-and-source-maps). My calls:

- **One way to separate and upload maps, for both.** The app's build steps moved to the workspace's root:
  `separateSourceMaps` in `scripts/sourcemaps.ts` gives the bundles debug IDs and moves their maps out of what ships,
  and `scripts/upload-sourcemaps.ts` takes the package and the Sentry project (`apps/desktop --project parity-desktop`,
  `packages/cli --project parity-cli`). The app's `build.ts` and the CLI's `vite.config.ts` both call the first, from
  `vp pack`'s `build:done` hook for the CLI, so the `prepack` that `npm publish` and pkg.pr.new run does it too. That
  moved `@sentry/cli` from the app's devDependencies to the root's, which also takes `@parity-app/telemetry` for
  `telemetryRelease`, so the release names stay in one place.
- **Only the build `npm publish` makes is the published version's release.** `vp pack` writes `dist/build.json`, with
  `published` true only when `npm_command` is `publish`, which npm sets for the `prepack` it runs, and the commit it
  built from. The CLI reads it: published is `parity-cli@<version>`; a pkg.pr.new preview, which `pnpm pack` builds, and
  a checkout's own `dist` are named by their commit; from source, by the checkout's commit, as before. Being under
  `node_modules` still makes it `tester`. The file is outside the bundles, so their debug IDs don't depend on it.
- **`cd-npm.yml` builds the published version again from its tag to upload,** as `cd-desktop.yml` does for the app,
  since the shared release template runs without Sentry's token. Two builds of the same commit gave the same debug IDs.
  The release is tied to the tag's commit on main. Previews' maps aren't uploaded; their stacks name the bundled files.
- **Each batch carries the command's debug IDs to the sender.** Sentry's SDK attaches a frame's debug ID from what the
  capturing process's bundles registered (`_sentryDebugIds`), and the detached sender never loads the command's bundles.
  So the command writes its registry into the batch, and the sender adds it to its own before capturing. Without that,
  an error from `bin.mjs` carried no debug ID and couldn't resolve, as the OpenAI review found.
- **Chunks that only re-export get no map,** so only the bundles with one get a debug ID. They hold no code to resolve.
- **Checked before release:** the packed CLI ships `dist/build.json` and no maps; `bin.mjs`'s call to `reportCliFailure`
  resolves through its map to `packages/cli/src/bin.ts` line 159; and `sentry-cli sourcemaps upload`, pointed at a
  stand-in server, paired each of the 9 bundles with its map and debug ID. A sender-like process that adopted a
  command's debug IDs gave a frame in `client-<hash>.mjs` that chunk's debug ID in `debug_meta`; without them, none.
  Whether an event from the installed CLI resolves in Sentry can only be seen once a version is published.

## Spans are sent in their transaction, so the scrubber sees them (PAR-756)

Sentry 11.8 streams spans by default (`traceLifecycle: 'stream'`), one by one, and warns at every start that
`beforeSendTransaction` is then ignored. Every process now starts Sentry with `sentryScrubbing(scrubber, Sentry)` from
`@parity-app/telemetry`, which sets `traceLifecycle: 'static'` and scrubs in `beforeSend`, `beforeSendTransaction`,
`beforeSendSpan`, `beforeSendLog` and `beforeBreadcrumb`. A process puts its own `beforeSend` or `beforeSendTransaction`
after it to add tags or attachments. My calls:

- **What got through, checked in Sentry with a fake `sk-…` key** in each span's name and attributes, sent through the
  Node SDK that main, the service and the CLI run and the browser SDK the windows run, set up with their hooks. Parity's
  own spans arrived as `[redacted]` either way: they're transactions built by hand and sent with `captureEvent`, which
  passes `beforeSendTransaction` whatever the lifecycle. Sentry's own spans, from `startSpan` as its integrations make
  them, arrived with the key as written once tracing was on, since a streamed span skips `beforeSendTransaction`. Parity
  sets no `tracesSampleRate`, so Sentry makes none today, and nothing had leaked. It would have the day tracing is
  turned on.
- **Static, not `beforeSendSpan` on streamed spans.** Streaming needs `beforeSendTransaction` gone for the warning to
  stop, and Parity's spans need it, as they're transactions. Static sends Sentry's spans in their transaction, through
  the same hook as Parity's, so one hook covers both. Spans Parity sends are its own, with its own IDs, so streaming
  gains it nothing.
- **`beforeSendSpan` is set too, wrapped in `withStaticSpan`,** for the spans Sentry sends on their own, outside a
  transaction, such as Web Vitals'. Parity turns none of those on, but they'd leave unscrubbed if it did.
- **One hook, in the package, with the SDK passed in.** `@parity-app/telemetry` still never imports Sentry, so each
  process passes its own module, whose `withStaticSpan` marks the span hook. The CLI's tests check it against the real
  SDK: a span holding a key leaves scrubbed, and Sentry starts without the warning.

## Session Replay's memory stays level over an hour (PAR-683)

The editor window held about 28,000 DOM nodes with Replay recording against 6,700 with diagnostics off, which looked
like the recorder keeping nodes the canvas had removed. It isn't: over an hour the count doesn't grow, and the gap is
the attributes of elements still on the page. Nothing in `renderer/replay.ts` changed. My calls:

- **Measured with `pnpm perf --soak 60`,** a mode added for this: on the example project, round after round of zooming
  the whole project in and out, waking every board at 100% so its frames mount and the rest go to sleep, then selecting
  and editing 20 designs, reading the window after each round once garbage is collected. `PARITY_TELEMETRY` chose the
  level; both copies ran side by side on 2026-11-09, 92 and 93 rounds.

  | Replay | DOM nodes, rounds 5 to the end | JS heap, round 5 → the end | Window's private memory, rounds 5 to the end |
  | ------ | ------------------------------ | -------------------------- | -------------------------------------------- |
  | All    | 27,398 to 27,605               | 121 → 126 MB               | 451 to 531 MB                                |
  | Off    | 6,763 to 6,779                 | 116 → 118 MB               | 415 to 504 MB                                |

  Both settle after the first round and stay there. The heap creeps by a few megabytes an hour either way, and private
  memory wanders within about the same band for both.

- **Replay was recording all the while.** It pauses after five minutes without a click or a key, and the soak works
  through the editor, so each round presses Shift and each reading asks Replay's recorder whether it's paused: all 93
  were recording. A first run without the key press, as the OpenAI review pointed out, may have measured a recorder
  paused for most of the hour; its numbers matched these.
- **The extra 21,000 nodes are `Attr` objects.** Chromium makes one for an element's attribute the first time a script
  reads `element.attributes`, keeps it while the element lives, and counts it as a node. The recorder reads every
  attribute as it snapshots the page. With Replay on, the window had 6,136 nodes in its tree and 93 detached ones, and
  its 20,195 attributes made up the rest; reading every attribute again added 119. With Replay off, reading them took
  the count from 6,167 to 26,362. So the count follows the page that's showing, not the session's length.
- **No `block` or `ignore` selectors for sleeping frames.** Frames are already blocked and their shadow roots hidden
  from the recorder (PAR-624), and there's no growth left for more selectors to stop.
- **Sentry's own limits bound the rest.** A replay ends after an hour, or 15 minutes idle, and the next one starts from
  a fresh snapshot, so nothing the recorder keeps outlives that.

## On-call watches four dashboards, and only production alerts (PAR-716)

You approved [proposals/on-call-health.md](proposals/on-call-health.md) on 2026-11-09, which sets out what on-call
watches across every process and surface. The dashboards are linked in [sentry.md](sentry.md#dashboards). Your calls and
mine:

- **Four dashboards, one question each,** rather than PAR-643's one: Parity (is anything wrong now?), Parity performance
  (is anything slow?), Parity workflows (which step is failing?) and Parity releases and telemetry (is the latest build
  healthy, and is the data coming in?). The first stays on one screen, and each of the others is where its numbers lead.
  PAR-727's time to first frame is on Parity performance, so it closes with this.
- **Only `production` alerts.** Development is agents' and your own drives, CI fails on purpose, and installed builds
  are testers', so none of them should file a monitor bug. No monitor is on until a public build sends `production`
  (PAR-779), and "Agent calls failing over 5%" is off until then. The issue alerts for new issues, regressions and
  feedback still file from every environment.
- **CI sends errors and reports only (PAR-777).** It sent 90% of last week's spans, which no plan's quota covers. The
  end-to-end suite reads the local copy, so its checks don't need Sentry.
- **`tester` splits into `preview` and `release` (PAR-778),** so a preview installer's bugs don't read as the published
  app's.
- **Every dashboard covers all projects.** `admin@betterapps.io` isn't a member of the `parity` team, and Sentry refuses
  a dashboard that names projects its maker can't open. Only Parity's projects are in `better-apps`, so all of them is
  the same set, and the web, dashboard and API projects join when they send.
- **Made through Sentry's API from a signed-in browser,** not by hand in the UI: the same calls the UI makes, so the
  widgets match the spec exactly and were checked against live data as they were made. Two planned widgets were left
  out, since Sentry can't read what they need: the bitmap cache's hit rate (PAR-772) and a count of scrubbed secrets.
- **Signals not sent yet are their own issues,** PAR-771 to PAR-776: service restarts and hang lengths, memory and the
  cache as numbers, export times, a check that releases have their maps and commits, and the CLI's dropped batches. A
  scrubbing canary in CI (PAR-775) was proposed too, and you dropped it.

## CI sends only its errors and reports (PAR-777)

CI sent 718,000 of `parity-desktop`'s 794,000 spans in the week to 2026-11-09, which runs past every Sentry plan's 5
million spans a month. You decided on 2026-11-09 that CI sends only its errors and reports. This narrows "on by default,
at its fullest level, everywhere Parity runs" above for CI alone.

- **Wherever `CI` is set, errors and reports go, with their breadcrumbs; spans, logs and Session Replay don't.** The
  local copy is still written in full, so the end-to-end suite's checks of it don't change.
- **`resolveTelemetry` decides it, with the level,** as `errorsOnly`, so the app and the CLI read it from the same place
  as on or off. My call: `PARITY_TELEMETRY=all` doesn't override it, so a run in CI can't send its spans by accident.
- **Main's Sentry hooks drop transactions and logs,** through `sentryScrubbing`'s `errorsOnly`, which covers every
  process, since windows and the service send through main. The editor window doesn't start Replay. The CLI's sink keeps
  logs and spans out of its outbox.

## Installed builds report as `preview` or `release` (PAR-778)

A pull request's preview installer and the published app both reported as `tester`, so a preview's bugs read as the
release's. You decided on 2026-11-09 to split them. This replaces `tester` in "Environments" under PAR-624 above.

- **`release` is a build the release workflow published; `preview` is any other installed build.**
  `telemetryEnvironment` reads the same `published` that names the release by version (PAR-625), so an environment and
  its release never disagree: the app's installer from `cd-desktop.yml` and the CLI `npm publish` made are `release`,
  and a pull request's installer or a pkg.pr.new CLI is `preview`. `ci` and `development` don't change.
- **My call: `release`, not `published`.** The spec left it open since `environment:release` sits oddly beside Sentry's
  own `release` field. `release` is the name the spec, its widgets and PAR-779 already use.
- **Both still offer the last run's crash,** since testers run both.
- **Nothing in Sentry needed changing.** No dashboard widget, monitor or alert filtered on `tester`. Events sent before
  this keep `tester`.

## Icon layers show Smile (PAR-793)

You picked on 2026-11-09, from five in the Icon layers exploration (Smile, Sticker, Heart, Asterisk and Feather), that
every icon layer shows Lucide's Smile, the Icons tab's icon, whatever the icon draws. PAR-794 built it.

- **One fixed icon, not each icon's own glyph.** Lucide draws the kind icons Layers already uses (AppWindow, Type,
  Image, Frame, Rows3), so an icon of one would read as that kind, and glyphs such as X, Plus and Trash2 look like a
  row's buttons. The layer's name says which icon it is.
- **The component purple, not a color of its own.** An icon comes from a library and is changed through its props, as a
  component is, and a seventh kind color would make the six harder to learn.
- **Wherever a layer's kind shows:** Layers, the inspector's heading, the Code, Accessibility and States panels, Search
  actions and Select layer in the canvas menu. A library's other components keep the Box.
- My calls: Star and Shapes weren't among the five, since Star marks a favorite project on the start page and Shapes is
  Insert. The exploration was removed when the pick was built, since choosing among the five was all it was for.

## A crashed project service starts again by itself (PAR-788)

Until 2026-11-09 a project service that crashed stayed stopped until a window loaded, so every request failed until the
person reloaded. My calls:

- **Main starts a fresh service through `restartService`,** the path the dev runner's code changes take, so open windows
  get a new port and reopen their projects without reloading, and keep their designs and unsaved changes.
- **It backs off on repeated crashes.** `serviceRestarts` in `@parity-app/core` decides: at once, then after 1, 5, 15
  and 30 seconds, and after five crashes that each came within a minute of starting, it stops until a window loads. One
  that ran a minute or more starts the count again. A clean exit (code 0), a service a fresh one replaced and the app
  quitting don't restart it.
- **`service.exited`'s `restarted` is true when a fresh service takes its place,** whether it replaced the old one or
  started after it crashed.

## The toolbar and review tools (PAR-780, PAR-795)

You settled the toolbar in its exploration (Parity/Explorations/Toolbar) and asked on 2026-11-09 for it to be built into
the app, with the exploration's bars removed. PAR-795 builds it;
[editor.md](editor.md#the-toolbar-review-tools-and-zoom-par-780-par-795) says how it works.

- **The toolbar is what the pointer does, Frame, Text and Insert, then the review button, then Search actions.** Move
  and select, Hand and Interact share one button with a menu, as Figma's Move holds Hand. Frame's icon is in the layer
  blue and Text's in text's green (PAR-792); Insert's stays plain. In Frame's menu New screen is screen blue and New
  component component purple.
- **Zoom has its own corner, at the top right:** Zoom out, the level, Zoom in and Zoom to fit. Undo and Redo leave the
  canvas, as designed, for the Edit menu and their keys.
- **Every review tool, Comment included, warps the toolbar into its own bar,** with the same warp for each. A kind of
  annotation's bar has its options as stamps, Suggest and Done.
- **The review tools are in the app before annotations and comments can be placed.** You chose on 2026-11-09 to wire
  them in now: picking one warps the toolbar and puts the canvas on Move and select, so a click only selects until
  PAR-184 places annotations.
- **The icons:** Content is a pilcrow, so it doesn't read as the Text tool, and Behaviour keeps MousePointerClick.
  Changes state is ToggleRight, Data is Braces, Analytics is ChartColumn, Landmark is PanelsTopLeft and Motion is Film.
- **The bar beside the toolbar stays in the stories** (Parity/Collaboration/Annotations/Toolbar, WhileReviewing), as you
  may use it later. The PAR-184 bars from the exploration are gone.

## Hangs are recorded as they start (PAR-804)

Until 2026-11-09 a window or main hang was sent only once it ended, so one that ended in a force-quit sent nothing. My
calls:

- **A window's hang is sent as it starts,** when Electron reports `unresponsive`: a Sentry message tagged `hang` and
  `window.hang_started`. `window.hung` follows with how long it lasted and `ended`: the window answered, was closed, or
  the app quit.
- **A watchdog thread in main sends main's own hang,** since main can't while it's stuck. Main's half-second timer is
  the heartbeat; after 2 seconds without one, the thread sends one Sentry message, "Main stopped answering", straight to
  Sentry's envelope endpoint, with the release, tags and user main last gave it. It doesn't load Sentry's SDK, so it
  sends nothing else. It sends only while main's level isn't Off.
- **An open hang is kept in `<userData>/hangs` while it lasts,** with how long so far, and removed when it ends. The
  next run reports what's left as `main.blocked` or `window.hung` with `ended: "exited"` and a Sentry message, so a
  force-quit's hang arrives with its length when the app next starts. Each process keeps its own files, named by its
  process ID, and a run reports only those whose process has exited, since two copies of the app can share the folder.
- **The local copy gets main's hang when it ends,** as before: the watchdog writes only Sentry and the open-hang file.

## Crashes carry the last minutes, and main's hangs say where (PAR-805)

The plan attached the last log file to a crash, and main's hangs said how long but not where. My calls:

- **A crash carries 5 minutes of the local copy, at most 2,000 events,** as `logs.jsonl`, scrubbed as reports are.
  "Crash" is any `fatal` event or any error nothing caught, from any process, since every error passes main's
  `beforeSend`. Main keeps the minutes in memory, so it doesn't read files on each one or miss lines not yet written. A
  native crash found as the app starts has no `exit.reason`, which tells it apart from one in this run, and carries the
  crashed run's last minutes from the files instead.
- **The watchdog finds where main is stuck through the inspector,** not Sentry's native hang detection, which still
  needs a module built for Electron's ABI. `connectToMainThread` opens no port. It pauses main once per hang, takes the
  stack and resumes, and gives up after 2 seconds, since main stuck in native code can't pause.
- **Frames are named `app:///` from the app's folder,** as Sentry's Electron SDK names them, with the bundles' debug IDs
  from main, so Sentry maps them to the uploaded source maps and no one's home folder is sent.
- **`where` is the innermost of Parity's own frames,** not the innermost frame, which is often Node's own code.

## Connectors search outside services from main (PAR-829)

You asked on 2026-11-09 to build the Mobbin integration with patterns that make Unsplash and later sources easier. My
calls:

- **A connector is one adapter in `@parity-app/connectors`,** which takes data and returns data, as
  [extensions.md](proposals/extensions.md) describes connectors. Each one says what it finds (screens, flows, sections
  or photos), the platforms and depths it takes, its limits and where to get a key, and turns a search into one result
  shape and one set of problems: no key, a key turned down, a plan without access, a rate limit with when to retry, a
  search it can't run, or a source that didn't answer. A failure is data in the answer, not a thrown error, so it
  reaches the window and agents whole across IPC and the service's channel. Unsplash (PAR-131) adds one adapter, and its
  download ping is the connector's `picked`.
- **Mobbin is its REST API, which searches screens only.** `POST /v1/screens/search` takes a query, the platform (`ios`
  or `web`, required), the mode (`standard` or `deep`), a limit up to 100 and ids to leave out, and that's the whole
  API. Flows and sections are only in Mobbin's MCP server, which signs each person in with their own account; a
  connector for that is a later choice, not part of this one. Standard is the default, since a deep search that finds
  something spends 5 of the person's AI credits. Tried live on 2026-11-10: a standard search took about 3 seconds and a
  deep one about 8, and the images are public WebP files of about 13 KB whose links last 30 days.
- **Main keeps the keys and runs every search.** The window asks over IPC and sees only whether it can search. (A key
  file and a setting for keys were built here, then dropped the same day: keys are the app owner's, below.) Agents ask
  through the service, which asks main. Main scrubs the keys from what it sends to Sentry, and never passes them to the
  service, whose builders run project code.
- **A development copy reads `PARITY_MOBBIN_API_KEY`,** from the shell or from `apps/desktop/.env.local`, which
  `pnpm dev` passes to main alone.
- **Agents get `find_references` and `parity references`,** for screens only, with up to 6 by default and 20 at most.
  The previews are saved under `~/.parity/references`; MCP shows them as images, and `--json` names their files. The
  skill says to look at real apps before designing a common screen, and to follow their patterns with the project's own
  components and tokens, never an app's layout, text or branding.
- **Each search is recorded** as `connectors.searched`, with its connector, filters, count or problem and time, never
  what was searched for.

## Connectors declare their filters, and agents search by kind (PAR-829)

You asked on 2026-11-10 for the pattern changes that adding Unsplash showed. My calls:

- **A connector lists its filters as data,** each with an id, a name, its values and an optional default. Mobbin's
  platform defaults to the web and its depth to standard. Unsplash's orientation and color have none, so leaving them
  out means any. A search sends `filters`, and `checkRequest` refuses any filter or value the connector doesn't list.
  This replaces `platform`, `depth`, `orientation` and `color` on the shared request. Mobbin no longer needs a platform
  named, since the web is its default.
- **Agents search by kind.** `find_references` finds screens and the new `find_photos` (`parity photos`) finds photos.
  Main runs each with the first connector that finds that kind and has a key. Both answer in one shape: each result's
  source, title, link, image and credit, with its preview saved under `~/.parity/references`. A result's `app` became
  `title`, since a photo has no app.
- **An answer carries `allowance`,** the searches left before the source turns them away, read from the standard
  rate-limit headers. Unsplash sends them; Mobbin doesn't, as a live check on 2026-11-10 showed, so its answers carry
  none.
- **The hub takes a `SearchService`** for connectors whose keys a service holds. It's used when there's no key here, for
  searches and placements alike, and the window sees the key's source as `service`. None is plugged in yet.
- **`connectors.searched` records `filters`** in place of `platform` and `depth`. They're each connector's own values,
  never typed text.
- **Not done:** no photo use is reported to Unsplash yet, since nothing places one. How it will be is below.

## Unsplash is the second connector (PAR-829)

You got an Unsplash key on 2026-11-10 and asked for it on the same branch as Mobbin. My calls:

- **It's an adapter like Mobbin's,** in `packages/connectors/src/unsplash.ts`: photos, 20 by default and 30 at most, by
  orientation (landscape, portrait or squarish) and Unsplash's colors, paged by page rather than by leaving out ids.
  Those three filters joined the shared request, and `checkRequest` refuses them for a connector that doesn't name them.
- **Its key is the app's Access Key with Public access only,** sent as `Client-ID`. The Secret Key and the other scopes
  are for acting on a person's own Unsplash account, which Parity doesn't do. For now main holds it, from
  `PARITY_UNSPLASH_ACCESS_KEY` in development; a service of Parity's still holds it for shipping, as decided on
  2026-10-28.
- **Its terms are kept:** photos load from Unsplash's own links, `picked` reports a use to its download endpoint
  (nothing calls it yet; see below), and every photo credits its photographer and Unsplash, linked with
  `utm_source=parity&utm_medium=referral`. Searches keep out photos Unsplash marks unsuitable for every audience
  (`content_filter=high`).
- **A photo is named by its alt text first,** then its description, then its photographer, since descriptions are often
  the photographer's own notes.
- **Unsplash says its limit is reached with a 403,** not a 429, so a 403 with no requests left reads as `rate-limited`.
  Tried live on 2026-11-10: a search took under half a second, the demo limit is 50 an hour, and images are JPEGs.
- **Each connector names its own key variable,** which main reads and keeps from the service, and `pnpm dev` passes on
  every `PARITY_*_KEY` in `.env.local`, so the next connector needs no changes there. What else would make the next one
  easier is in [connectors.md](connectors.md#pattern-changes-made).

## Keys are the app owner's, and Parity reports uses itself (PAR-829)

A review of the connectors on 2026-11-10 found twelve things to fix. You decided two of them, and the rest are my calls:

- **People never enter a key** (your call): connectors are a built-in feature, and the app's owner arranges the keys. So
  the key file, setting and clearing a key, the check before keeping one, `probe` and `connectors.storeFailed` are gone.
  A connector's `auth` is none or a key with its variable. A development copy sets keys in the environment; a shipped
  copy will search through Parity's service. Main reads the keys once and deletes them from its own environment, and the
  service's environment leaves out every `PARITY_*_KEY`, not only the ones named today.
- **No agent tool reports a use** (your call): an agent could skip it. Placing is the step instead, below.
- **A missing key isn't the agent's problem.** `no-key` says this copy can't search the source and to carry on without
  it, and the CLI and MCP don't treat it as an error. Messages about a refused key no longer tell the person to fix it.
- **Main checks a search before it routes or records it,** and records every filter as checked. Each connector runs up
  to 30 searches a minute, half of Mobbin's shared allowance, so one copy's runaway loop can't spend it.
- **Agents search one shape per kind.** Each call can name a `connector`. The contracts no longer fill in Mobbin's
  defaults, every other field is passed on as a filter, and main picks a connector that takes the filters named, so a
  second screens source doesn't get `invalid`. Each result names its connector. A search that asked for more and got
  none says "No more results for this search."
- **Recent searches are kept by main** (you asked on 2026-11-10 for them to move to the person's account once there's a
  service). The hub adds each search the person runs that works, never an agent's, through a `SearchHistory`. For now
  it's a file in the app's data, `recent-searches.json`, keeping each connector's latest five; an account's store will
  take its place without a change to the window. A search whose recent search can't be kept still answers.
- **Previews can't fail a search.** Each is fetched and saved on its own, read up to 4 MB, named with at most 40 letters
  of its title, and taken from the source's smaller picture when it has one (Unsplash's small, 400 pixels).

## Placing a result is a step of its own (PAR-829)

You asked on 2026-11-10 for a hook when a connector's result is placed, for telemetry and usage, with each connector
deciding what else to do, and for agents to get two tools: one to search and one to place. Your calls and mine:

- **Agents search, then place** (your call). `find_photos` and `find_references` give previews to look at and ids, but
  no image link, so an agent can't put a photo in a design by pasting one. `place_result` (`parity place`) names a
  result by connector and id and an image node by path; Parity sets the node's `src` (and `alt`, from the photo's title)
  from main's own copy, as one undoable edit, and only once that's applied tells main. You asked how an agent sees a
  photo without its link: through the preview each search saves, which MCP shows inline.
- **The hub's `placed` runs the same steps for every connector** (your call): it counts the placement as the source's
  usage, and only when it's new records `connectors.placed` and calls the connector's own `placed`, which for Unsplash
  reports the photo to its download endpoint. `picked` became `placed`. Telemetry carries the connector, kind and who
  placed it, never which result or where.
- **Usage counts once for each design.** A `PlacementLog` keeps them, a file in the app's data for now
  (`connector-placements.json`, the latest 2,000), so placing the same photo in the same design again isn't reported
  twice. A log that can't be read or written counts the placement as new, since a source's terms prefer being told twice
  to not at all. Once Parity's service counts usage on the person's account, main passes the hub its store.
- **Only photos go in designs.** Placing a Mobbin screen is refused: references are for looking at, as the proposal
  says.
- **The window places through `canvasHost.connectors.placed`,** with the result's connector and id and the design, and
  main uses its own copy. Nothing in the window calls it yet, since there's no Place for photos.

## A second review of placing and the hub (PAR-829)

You asked on 2026-11-10 for another LLM-as-judge review, and to fix what it confirmed. My calls:

- **Placing works in Parity's own image nodes.** `Update` couldn't change an image's picture, so placing set a prop the
  node didn't have. `Update` now takes `src`, `alt` and `credit` on an image node, in a design's base state only, since
  a state can't change which picture it shows. `place_result` checks its target before it edits: an image node, or a
  component that declares the prop named. It refuses one that already shows the photo, and says why with a code.
- **Placements are keyed without paths.** A design's key is a hash of its project, file and design, so two designs with
  the same id in different files count apart, and the log, and later the account's store, hold no path.
- **Each connector declares its source's rate limit,** and main runs half of it: Mobbin's 60 a minute and Unsplash's 50
  an hour. This replaces 30 searches a minute for every connector, which would have spent Unsplash's hour in two
  minutes.
- **A connector can need no key,** with `auth: { type: "none" }`, and searches. Key variables are any
  `PARITY_<NAME>_KEY`, in any letter case.
- **A report a source didn't take is tried again** as Parity next starts. The log keeps whether each was told.
- **The contracts take filters as plain text** by the connectors' ids, and both ways of asking for more, so main checks
  them against whichever connector runs the search. `place_result` can name the tab.
- **Main enforces which kinds go in designs,** from `placeableKinds`, for the window as well as agents, and refuses a
  photo whose link expires.
- **The hub never throws** to the window or an agent: an adapter or service that throws answers `unavailable`, and the
  service gets the hub's timeout. The stores re-read their file before each change and write through a temporary file of
  their own, so two copies of Parity don't lose each other's entries.
- **`agent.called` leaves out what was searched for and which result was placed where,** as `connectors.*` already did.
- **Old previews are deleted** after a week.

## A project's images are listed and removed in one shape (PAR-834)

You asked on 2026-11-10 for a way to query a project's images and remove them, for the image selector and for agents. My
calls:

- **A project's images are the files in `public/images/` and the photos layers link to.** Pasting, dropping and
  downloading already save there. Unsplash's photos can load from Unsplash, so a linked photo is listed with its credit,
  though it has no file. A path layers name with no file there is listed too, so a broken image shows up.
- **The logic is `projectImages` in `@parity-app/editor`,** data in and data out. The service reads the files and the
  code (`images.scan`); the window and agents bring their designs as they are, unsaved changes included. So the image
  selector and agents read one shape.
- **"Used" means a design or the project's code names it.** Code counts because `<img src="/images/hero.png">` in `src/`
  breaks the app as surely as a design using it. A prop counts when it's `src` or names a file in `/images/`, so a
  component's image prop counts.
- **Removing refuses an image in use, and says where.** It doesn't remove the layers or edit the code for you.
- **A removal is a project edit, not the system's trash.** The issue suggested the trash. A project edit is undone by
  Parity's own Undo, as token edits are, keeps the file's bytes for the latest 50 edits, and needs nothing from the
  system. The window's Undo for it comes with the removal design (PAR-836).
- **Agents get `get_images` and `remove_image`** (`parity images`, `parity images remove`), with the error codes
  `unknown_image` and `image_in_use`. `find_photos` (PAR-829) stays separate: it searches outside the project.

## The Media tab replaces the Images tab (PAR-838)

You approved the references design on 2026-11-10 and asked for it built. The Media tab is first, in its own pull
request; the library browser and stock media (PAR-839), references on the canvas (PAR-840) and videos (PAR-841) follow.
My calls:

- **The tab is called Media, and its tab value is `media`.** Pixabay brings illustrations, vectors and videos. A window
  that remembered the Images tab opens on Layers once.
- **The wall's layout and every rule the tab follows are in `@parity-app/editor`:** `packWall`, `designsUsing`,
  `removalOf`, `mediumOf` and `imageItem`, each tested without Electron. The app keeps the views, the scan per open
  project and the requests.
- **Removing what designs use removes the layers with it, after asking.** PAR-834 has agents refuse instead. In the
  window a person sees where it's used and chooses, so the dialog offers "Remove file and 3 layers"; agents still
  refuse. What the code names stays either way.
- **One Undo puts both back.** The layers are a step of the designs' history and the file a project edit, two histories.
  The file's Undo also undoes the layers' step, but only while it's still the latest, so nothing done since is lost;
  otherwise Edit > Undo takes the layers back on their own.
- **Pictures load from the project's builder,** at the address the canvas's guest uses, so the tab shows what the
  designs show. Stories serve pictures drawn for them at `/images/` the same way, through Storybook's static folders.
- **Inserting and dragging are shared with the Assets panel** (`chrome/insert-from-panel.ts`), and the credit line with
  the image layer's panel (`PhotoCredit`), rather than copied.
- **The exploration's Media tab stories are gone,** since the real ones replace them. Its prototype panel stays while
  the library browser's explorations still run on it, and goes with them.

## The library browser and stock pictures in the Media tab (PAR-839)

The second of the four pull requests that build the references design. My calls:

- **One browser for every library,** drawn from what its connector says about itself: its filters, what it finds, how it
  pages, its tips and its mark. The rules it follows (which filters show, the request for a page, what a result is
  called, its credit) are `browse.ts` in `@parity-app/connectors`, tested without Electron. The window keeps the dialog,
  its store and the search hook.
- **It opens from a store, with a pick action.** The Media tab opens it on Pixabay with "Add to project"; references on
  the canvas (PAR-840) will open it on Mobbin with their own action, with no change to the browser.
- **A picture added from Pixabay is saved into `public/images/`,** since Pixabay's links stop working. The service
  fetches it (`images.saveFrom`, https only), one at a time in the order picked; any that fail are named, and the rest
  are kept.
- **Its credit is kept in the project's main file,** in a new `images` map by path: the alt text and the credit, whose
  link is the picture's own page on Pixabay rather than its author's, so it names where it came from. The Media tab
  credits it before any layer uses it, and a layer's own credit still wins. Recording it is one undoable step.
- **Adding counts as placing.** Each picture is reported to the hub's `placed` with `media` as its design, so it counts
  once as the source's usage, as a picture an agent places does.
- **Videos show, with how long they run, but can't be picked** until the Media tab plays them (PAR-841). Pressing one
  shows it larger. `placeableKinds` decides, so PAR-841 changes one list.
- **The exploration's Pixabay and Unsplash stories are gone,** since the real browser's stories replace them. Its Mobbin
  stories and prototype stay until references on the canvas are built (PAR-840).

## References are kept in the project's file, beside notes (PAR-840)

The third of the four pull requests that build the references design. You decided on 2026-11-10 that references are kept
in the project's `.par` file beside notes, rather than for the person alone. My calls:

- **A reference is its own kind in the file,** a `references` list beside `notes`, in the file of the design it was
  found for, or the main file without one. It keeps the connector and the source's id, the app, its platform, its link,
  its picture's link, size and expiry, where it sits, the description that found it, a note and the agent that placed
  it. The changes to it are pure functions in `@parity-app/editor`, as notes' are.
- **Its picture stays Mobbin's link,** not a copy, until Mobbin says Parity may keep one (Questions for Mobbin in the
  proposal). Once the link has run out, the reference shows its app's name and Open in Mobbin.
- **It behaves as a note does:** one at a time in the selection, moved, nudged and deleted as one undo step each. Copy
  and Cut leave it out, since it can't be pasted into a design, and nothing that writes code or exports reads the list.
- **A batch lands in a row beside its design** and a later one under it, as the proposal says, and moves right past any
  other design in the way, the rule copies of designs follow, since the example's designs sit close together.
- **Find references opens the merged browser with its own pick action,** "Place N on canvas", and the browser now hands
  the action the description each pick was found under, so a reference says what found it.
- **Agents place references through `execute`,** with `PlaceReference(id, { near, note })`, taking main's own copy of a
  screen it found for them, so a reference shows what the source gave. A call's references are added with its designs as
  one undo step; they're only ever added, so they never conflict with edits made meanwhile. Each names the caller.
- **No new event.** Find references is recorded by `command.ran` like every command, and screens aren't counted as a
  source's usage, since the hub counts only what goes in designs.
- **The exploration is gone.** Its Mobbin stories and the workspace and Media tab prototype came out of Storybook; the
  stories under Parity/Canvas/References and Parity/Library browser/Mobbin replace them.

## A reference records the design it's for, and agents read them (PAR-889)

You asked on 2026-11-10 for agents to find the references placed beside a design, so they know what it's meant to be. My
calls:

- **A reference records the design it was found for,** by id, in the file it shares with that design. A row of
  references slides right past other designs in the way, so where one sits doesn't say which design it's for. One placed
  with nothing selected, before PAR-889, or whose design has gone, is read as for the design whose board edge is
  nearest, within 1,600 pixels: a web reference's width and the gap before it. One further from every design is for
  none, so a loose board of screens doesn't make an agent study them for some design. Moving a reference by hand keeps
  what it recorded. Designs are told apart by file and id, since two files can hold the same id.
- **`References(design?)` reads them in `execute`,** alongside `PlaceReference`, and `get_references`
  (`parity references placed`) gives the same list with each picture fetched and saved, as `find_references` previews
  are, so MCP shows them as images. Each picture is a whole screen, since Mobbin gives no smaller one, so only the first
  6 are fetched unless `limit` says, up to 20, as `find_references` caps its own; the answer says how many more have
  none. Only https links are fetched, since they come from the project's file rather than a source. It's a subcommand of
  `parity references`, as `parity images remove` is of images, so a search can't start with "placed".
- **`get_app_state` counts each design's references,** and leaves the count out when there are none, so an agent knows
  to look without the state growing for projects that don't use them.
- **The skill tells agents to look at a design's references before changing it,** in "Look before you change".

## The video player is Parity's own, in a package (PAR-891)

The player the video layer (PAR-841) uses, approved in Storybook under Parity/Media/Video player before the layer is
built. You decided on 2026-11-10 to build it on the UI kit rather than on media-chrome with Kibo UI's player, and to
keep it in a package of its own so other media can join it later. My calls:

- **`@parity-app/media-player` is at the edge,** beside `renderer-react`, since it's React. It has `VideoPlayer` for the
  larger view and the Media card, `VideoPreview` for a tile while it's pointed at, and `VideoLength` for a tile's
  length. What its keys do and how a time reads are plain functions beside them, with tests.
- **No player library.** The kit's Slider and Button and Lucide's icons sit over a plain `<video>`. media-chrome draws
  its controls inside their own shadow DOM, out of reach of the kit's styles, and Parity plays only MP4 and WebM files.
  Video.js 10, which took over Vidstack and media-chrome's work, is the one to move to if streaming or casting is
  wanted.
- **The controls sit under the video,** as the references design had them: play or pause, the time slider, the time,
  Mute and full screen. It opens playing without sound and goes round at the end.
- **The volume is a vertical slider over Mute,** so the time slider keeps the row, even on a card. It opens while Mute
  is pointed at or the keyboard brings focus into it, and closes when the pointer leaves, even after a click in it, and
  with Escape, which goes no further. It opens inside the player, not over the page, so it shows in full screen.
- **Keys work once anything in the player has focus,** clicking the video among them: Space or K, left and right for
  five seconds, Home and End, up and down for the volume, M and F. A key the player takes goes no further, so the arrows
  don't also step through the larger view's results.
- **A preview counts its length down** while it plays, from the length it showed, to 0:00, and shows the whole length
  again once the pointer leaves. The library browser's result tiles use `VideoPreview` and `VideoLength` now, and
  `clockOf` left `@parity-app/connectors` for the package's own.

## Videos are a layer of their own (PAR-841)

The last of the four pull requests that build the references design. My calls:

- **A video is its own node,** `video`, beside `image`, rather than an image that plays. It keeps `src`, `alt`, `fit`
  and `credit` as an image does, and adds `controls`. It's written to code as `<video>`: without controls it plays by
  itself, without sound, round and round (`autoplay muted loop playsinline`), the way a video in a design usually plays;
  with controls it waits to be played. `alt` is its `aria-label`, since `<video>` has no `alt`.
- **Video files are kept in `public/videos/`,** beside `public/images/`, named and listed the same way, and removed from
  either folder. MP4 and WebM files up to 100 MB are taken, where images stop at 20 MB.
- **The `images` service methods kept their names** (`images.import`, `images.saveFrom`, `images.list`, `images.remove`)
  and take videos, choosing the folder by the file's type, so the Media tab, dropping, pasting and placing share one
  path.
- **A video from a stock library is always saved into the project,** whether added from the Media tab or placed by an
  agent, since its link isn't one to show from a design.
- **Pasting a copied video file reads it in main.** The browser's clipboard gives a page only images, so main reads the
  file the system clipboard names (Windows' `FileNameW`, macOS's file URL), and pasting takes it as dropping it would.
  Images copied as pictures still paste as before.
- **`place_result` places videos into video nodes,** and a component's prop, and refuses an image node for a video or a
  video node for a picture, saying which to use. `Update` takes `src`, `alt` and `credit` on a video as on an image.
- **The player is `@parity-app/media-player`'s** (PAR-891): `VideoPlayer` in the larger view and on a Media card,
  `VideoPreview` and `VideoLength` on a tile.

## The floating bars' lines are etched, and the toolbar has two (PAR-893)

You found the toolbar's hairlines awkward on 2026-11-10: three of them split five tools, and two of the groups held one
tool each. You compared ways of grouping, ordering and coloring in a Storybook exploration, removed once this was built,
and picked these:

- **Every line between a floating bar's groups is etched:** a dark groove cut into the bar, with a highlight on its
  right. The toolbar's lines and the annotation bars' line before Suggest both change, since they share `BarDivider`.
- **The lines run the bar's full height,** through its 4px padding to its border, so they read as cuts rather than lines
  drawn on it, with 8px beside each.
- **Both sides are borders,** since a browser rounds a border's width to whole screen pixels. Drawn as a 1px background
  and shadow, two lines on one bar painted one and two pixels wide at 150% scaling.
- **The bars are off-white in light mode,** so the highlight shows against them, and hover and a picked stamp are a step
  darker inside them to keep their contrast.
- **The toolbar keeps two lines,** one after the pointer's button and one before the commands. The line between Insert
  and the review button goes.
- **The colored tools that add things sit in the middle,** Frame, Text and the review button, and the commands that open
  a dialog or a search sit on the right: Insert, Find references and Search actions. Insert and Find references leave
  the tools' group, since they run a command rather than pick a tool, so the arrow keys move through tools alone.
- **Comment is pink,** `oklch(0.72 0.2 355)` on the dark theme and `oklch(0.6 0.22 355)` on the light, so every tool in
  the middle has a color. It's tuned on its own rather than at the annotations' lightness, and takes a darker step on
  the light theme, as Frame and Text do. Sticky yellow was the other one considered.
- **The kinds of annotation keep PAR-184's colors.** Moving them all to hues the canvas doesn't use was tried and set
  aside: you found today's much better.
- **Picking and pressing move the same on every floating bar.** A picked tool's button or stamp's chip boings, and a
  pressed control dips and springs back on the pop spring, both from `toolbar-parts.tsx`.
- **Grouping by spacing alone, one line before Search only, and lines inset from the bar's edges were set aside.**

## A screenshot can come back as one contact sheet per design (PAR-895)

In the Better Booking run, 137 of an agent's 411 calls read screenshot files, one per frame, because `parity screenshot`
saves each frame and prints its path. MCP's `screenshot` already returned the images in its result. You chose on
2026-11-11 to make the sheet opt-in:

- **`sheet: true` (`--sheet`) puts each design's frames on one labeled PNG:** the design's name above, states in rows
  and modes in columns, in the order they were drawn, named as the canvas names them. The CLI saves it as one file and
  MCP returns it as one image block, in `sheets`, in place of `screenshots`. Each sheet lists every frame's box on it.
- **Separate frames stay the default,** so callers that read `screenshots` get what they did before. The skill's "check
  every frame" step asks for a sheet, then a single frame for a closer look.
- **A sheet is kept within 2,000 pixels on its longest side.** Claude scales images down to about 1,568 pixels before it
  sees them, and some clients refuse images over 2,000 pixels once a conversation holds many, so a bigger sheet only
  costs bytes. Frames shrink to fit and labels keep their size; the sheet's `scale` says how many sheet pixels a CSS
  pixel became.
- **The layout is data, in `@parity-app/agent`; the pixels are the host's.** `sheetLayout` in
  `packages/agent/src/sheet.ts` places the frames and draws the background, labels and borders as SVG. `composeSheet` in
  the desktop's `webp.ts` draws that SVG with sharp and puts the frames over it, as `composePicture` does for copying.
  No dependency was added.
- **`Screenshot` in a snippet doesn't take `sheet`.** A snippet's screenshots come back with its other results, and the
  `screenshot` tool covers the check.

## Popups draw inside their frame, taken from the page's body (PAR-881)

The Better Booking run found selects, menus and dialogs drawing unstyled outside their frames, with nothing in
`problems` to say so. My calls in fixing it:

- **The frame takes the element rather than giving each portal a container.** Base UI and Radix take a container per
  component and have no provider for all of them (see A component preview draws what opens), and a kit's own wrapper
  holds the portal, so a design can't pass one. The guest answers `document.body`'s `appendChild`, `insertBefore` and
  `removeChild` instead, and puts an element React adds there in the frame's body. React keeps a portal's node wherever
  it is. This reads React's internals, a fiber's `return` and its root's `containerInfo`, as the layer walk does.
- **The frame is found from React's tree, not from which frame drew last.** The canvas draws many frames in one commit,
  and Parity's own menus portal to the same body, so only the root an element's fiber is under says whose it is.
- **Into the frame's body, after what's drawn, not a separate popup root.** That's where it is on the project's page, so
  the project's rules for the body's children and a dialog's fixed backdrop work as there. The frame's host contains
  what's fixed, so the backdrop covers the frame, not Parity's window.
- **What the guest can't take is a problem, not a silent miss.** Content added to the body without React stays there,
  and an offscreen frame reports it as `outside-frame`. It isn't moved after drawing as a preview's is, since a design
  shows it where the project places it.
- **Popups still don't count in a layer's box,** so the earlier call on portaled content stands for selection.
- **Base UI's focus trap already looks through shadow roots,** so a modal in a frame marks the rest of Parity's page as
  it did before, no more and no less.

## Problems reports a squeezed node and content spilling out of its parent (PAR-886)

In the Better Booking run, a table too wide for its content area squeezed a nova `Sidebar` (`collapsible="none"`,
`w-(--sidebar-width)`) to well under its 256px, and `problems` found nothing. The table stayed inside the frame and
nothing clipped it, and PAR-456 left out overflow of a parent that doesn't clip. My calls:

- **`squeezed`: an element drawn narrower than its own width.** The renderer reads each element's computed `width`
  (`computedStyleMap`, so `16rem` is 256px and `auto` is a keyword), keeps it within its `min-width` and `max-width`,
  and compares it with `offsetWidth`, a pixel allowed for rounding. Only a width in pixels counts: a percentage, `auto`
  or a sum with one has no width to fall short of. Inline elements and a table's parts are left out, since a width
  doesn't hold them. In practice only a flex item that shrinks is drawn narrower than its width, which is the bug: a
  fixed-width sidebar or icon beside content that can't shrink.
- **An element a component draws counts for its node.** The squeezed element is often a kit's own, such as a sidebar's
  gap. The finding goes on the node that draws it, naming the element by its `data-slot` or tag, and a node gets its own
  element's squeeze before the most squeezed inside it, so a node is reported once.
- **`parent-overflow`: a node in the layout's flow reaching past its parent's box,** inside the frame, where nothing
  cuts it off. What says it's intended is how the node is placed, not whether it shows. A node positioned absolutely,
  fixed or sticky, nudged with an inset, moved by a transform or a negative margin, or inline is `outOfFlow`, and its
  overflow isn't reported: the badge over a card's corner, a bleed, a tooltip. A node in the flow has no reason to leave
  its parent, so when it does, it's drawn over or beside what's around it by accident. Inline nodes are left out because
  their box follows the font, not the line, and would spill a pixel or two out of a tight line height.
- **Covering a sibling isn't a check of its own.** A node in the flow can only cover a sibling by leaving its parent,
  which `parent-overflow` finds, and one out of the flow covers siblings on purpose.
- **The node to fix is reported, as before.** A node past the frame or cut off is reported as that, not also as
  spilling. Children inside a spilling node stay inside it, so only the outermost node that spills is reported.
- **The finding states the measure, not the fix.** `problem` says how wide the node is drawn against its width, or how
  far past which edges of which parent it reaches. The skill says what usually fixes each (`min-w-0` on the content that
  won't shrink, or `shrink-0` on the squeezed node; letting a spilling node wrap or shrink, or clipping its parent with
  a scroll).
