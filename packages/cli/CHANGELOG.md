# Change Log - @parity-app/cli

<!-- This log was last generated on Fri, 13 Nov 2026 02:33:44 GMT and should not be manually modified. -->

<!-- Start content -->

## 0.60.5

Fri, 13 Nov 2026 02:33:44 GMT

### Patches

- Core and editor name what other packages may use in src/index.ts (ajcraswell@gmail.com)

## 0.60.4

Fri, 13 Nov 2026 02:04:23 GMT

### Patches

- The desktop app's process logic moves out of core into @parity-app/processes (ajcraswell@gmail.com)

## 0.60.3

Fri, 13 Nov 2026 01:34:43 GMT

### Patches

- Field reasons in units of their own say what the field takes after a maths failure, and the Design panel's CSS readers
  move into the style package (ajcraswell@gmail.com)
- Decide what each paste does with each kind of clipboard content in one function, decidePaste, and name a paste's undo
  step with pasteStepName in place of pasteLabel (PAR-985) (ajcraswell@gmail.com)
- The Design tab picks every section a selection shows from one table (ajcraswell@gmail.com)

## 0.60.2

Fri, 13 Nov 2026 00:22:24 GMT

### Patches

- Open code in an editor on Windows from folders with % or & in their names, name screenshot files safely, and put a
  list entry back if it goes while it's dragged (PAR-982) (ajcraswell@gmail.com)

## 0.60.1

Thu, 12 Nov 2026 23:05:06 GMT

### Patches

- The Design panel lists only the project's own tokens, converted once, and new shadows name only tokens the project has
  (ajcraswell@gmail.com)

## 0.60.0

Thu, 12 Nov 2026 22:46:32 GMT

### Minor changes

- Design tab: regrouped sections, the approved Component instance and props rows, measured sizes, and field errors that
  stay as typed (ajcraswell@gmail.com)

### Patches

- Paste over and Paste to replace read the selection again once a pasted image is saved: Paste over goes over what's
  selected by then, and Paste to replace replaces nothing when the selection changed meanwhile (ajcraswell@gmail.com)

## 0.59.0

Thu, 12 Nov 2026 22:11:04 GMT

### Minor changes

- Remove binding a layer's visibility to a component prop: bind.visible is gone from the file format, the agent API and
  the inspector. Text and props still bind. (ajcraswell@gmail.com)

## 0.58.0

Thu, 12 Nov 2026 12:53:23 GMT

### Minor changes

- A design file that isn't JSON or doesn't match its format stops the project opening, and the Couldn't open page says
  which file and why, with one Close button (ajcraswell@gmail.com)

### Patches

- Write project files whole, so a save cut off partway leaves the file as it was, and decide what's inside a project
  with one check (PAR-973) (ajcraswell@gmail.com)

## 0.57.0

Thu, 12 Nov 2026 12:29:28 GMT

### Minor changes

- Frames in view are drawn and captured first, and swap their bitmaps for designs while zooming in (PAR-955)
  (ajcraswell@gmail.com)

## 0.56.1

Thu, 12 Nov 2026 12:10:47 GMT

### Patches

- Show frames' bitmaps from 10% zoom on every screen, rather than from 25% of the screen's own pixels
  (ajcraswell@gmail.com)

## 0.56.0

Thu, 12 Nov 2026 11:51:18 GMT

### Minor changes

- Design files are version 4: style keys are named after their CSS properties (flexDirection, alignItems, fontSize,
  fills, boxShadow), and lengths, sizes and colors are stored with their form ({ step: 4 }, { token: "primary" }, {
  size: "fill" }). A version 3 file no longer opens (ajcraswell@gmail.com)

### Patches

- A search that needs someone signed in to Parity is no longer a failure: agents carry on without the source
  (ajcraswell@gmail.com)

## 0.55.0

Thu, 12 Nov 2026 10:56:22 GMT

### Minor changes

- States belong to component designs only: screens, frames and instances no longer have them, and the agent's Designs()
  lists states for components alone (ajcraswell@gmail.com)

## 0.54.0

Thu, 12 Nov 2026 09:40:43 GMT

### Minor changes

- Kept frame pictures are reused while the files each frame reads are unchanged, so a branch switch, a new worktree or
  an edit to one component no longer recaptures every frame (ajcraswell@gmail.com)

### Patches

- Repeated parts pair a component's props by name, so two parts writing the same props in another order get the right
  values and extract cleanly (PAR-998) (ajcraswell@gmail.com)

## 0.53.2

Thu, 12 Nov 2026 08:08:28 GMT

### Patches

- An instance's filled slots are copied as shown, keep only the bindings a paste has params for, follow a library's
  design names, bake in on Detach, count as structure in repeated parts, and read as drawn in agents' Get
  (ajcraswell@gmail.com)

## 0.53.1

Thu, 12 Nov 2026 07:22:39 GMT

### Patches

- Help > Install the parity command is now Install the Parity CLI…, and its toasts and docs say Parity CLI
  (ajcraswell@gmail.com)

## 0.53.0

Thu, 12 Nov 2026 05:54:47 GMT

### Minor changes

- Give each subagent its own cursor on the canvas: MCP tools take an optional subagent name (ajcraswell@gmail.com)

## 0.52.0

Thu, 12 Nov 2026 05:19:24 GMT

### Minor changes

- SetTokens adds a token the project doesn't have, and a style naming a missing token is told what the project has
  (ajcraswell@gmail.com)

### Patches

- Report a crashed project service with what it printed, and name the pre-promotion environment beta
  (ajcraswell@gmail.com)
- Checks draw every state and mode they ask for at once, and startup isn't timed through a locked screen, sleep or a
  minimized window (ajcraswell@gmail.com)
- Main hangs outside JavaScript say where main resumed instead of naming that frame as where it was stuck, and main's
  own blocked reports group as one Sentry issue. (ajcraswell@gmail.com)
- parity lib check answers a missing or unknown library as invalid input instead of reporting it as a crash, and a
  builder stopped by a signal isn't sent to Sentry as an error (ajcraswell@gmail.com)
- `open_project` and `parity open` now say that opening an open project detects it again, and ask agents not to kill
  Parity to pick up changes (PAR-817, PAR-818). (ajcraswell@gmail.com)

## 0.51.0

Thu, 12 Nov 2026 04:25:08 GMT

### Minor changes

- Frames draw layers from CSS rules, and from the project's own compiled Tailwind classes, instead of inline styles; a
  layout is relative only when a child is placed in it (ajcraswell@gmail.com)
- Agents get reference.md, a snippet API reference generated from the code: every function's signature, arguments and
  result, and every type they name, with their doc comments (ajcraswell@gmail.com)
- Keep a recovery copy of unsaved changes and offer to restore it after a crash or forced quit (ajcraswell@gmail.com)

## 0.50.0

Thu, 12 Nov 2026 04:02:39 GMT

### Minor changes

- Measure gives each node's box under `box` and what clips it as `{ node, name, box }`, the shapes Problems uses; the
  agent docs say what Get's visit `parent` holds, that an absolute node's parent needs nothing, and how instances take
  overrides (ajcraswell@gmail.com)
- Component props take dates as { $date } values, made as new Date(...) makes them, and layout and text layers take
  role, id and aria-* props on their elements. (ajcraswell@gmail.com)

### Patches

- Say which package Vite came in when a project installs Vite+ as vite, in the detection summary: Vite 8.3.5, shipped by
  Vite+ 1.4.0 (ajcraswell@gmail.com)

## 0.49.0

Thu, 12 Nov 2026 03:17:52 GMT

### Minor changes

- Inline text (span, strong) given a width, maximum, alignment or one line draws as a block; a new overflowWrap style
  breaks long words; an absolutely placed component with left and right stretches between them (ajcraswell@gmail.com)
- parity exec --quiet, and execute's quiet, leave out the named nodes a snippet created and list just the designs it
  created (PAR-909) (ajcraswell@gmail.com)

### Patches

- Problems no longer reports what a container that scrolls scrolls to as clipped, past the frame or spilling out
  (PAR-904) (ajcraswell@gmail.com)
- A viewport's responsive style and hiding now win over states, variant options and instance overrides, as a media query
  wins over app state; its text and props stay under them (PAR-902). (ajcraswell@gmail.com)
- Offer a crash report only after a real crash, not after an agent or a force-quit stopped Parity (ajcraswell@gmail.com)
- Phone and tablet frames take Parity's thin 6px scrollbars instead of the desktop browser's 15px ones, on the canvas
  and offscreen (ajcraswell@gmail.com)

## 0.48.0

Thu, 12 Nov 2026 02:22:25 GMT

### Minor changes

- Help > Install the parity command puts a parity command on PATH that runs the CLI shipped with the app, about 1.5 s
  faster per call than npx (ajcraswell@gmail.com)
- Agents declare a component design's params directly: CreateDesign takes params, AddParam, UpdateParam and DeleteParam
  change them, and Update binds a node (PAR-901) (ajcraswell@gmail.com)
- Layers take transitions: what changes, duration, easing or spring, and delay, drawn on the canvas, edited in Motion
  and by agents (PAR-934) (ajcraswell@gmail.com)

### Patches

- Check a token value against its kind's CSS grammar as SetTokens runs, without waiting for the app's window
  (ajcraswell@gmail.com)
- Setting a prop to null removes it without warning, and a node path with too many or empty parts says what's wrong and
  shows design/node (ajcraswell@gmail.com)
- Each builder adapter names the config files detection follows, so adding or removing one detects an open project again
  (ajcraswell@gmail.com)
- A layer that fills across its parent with a maximum width or its own alignment now takes the parent's width up to that
  maximum and then sits where it's aligned, instead of hugging its content (PAR-897). (ajcraswell@gmail.com)
- Record what frames show once the canvas rests zoomed far out, and how long until they all show their bitmaps
  (ajcraswell@gmail.com)

## 0.47.1

Thu, 12 Nov 2026 00:46:36 GMT

### Patches

- A frame in the Dark mode shows a theme switched on by an attribute on the root, such as :root[data-theme=dark]
  (ajcraswell@gmail.com)

## 0.47.0

Thu, 12 Nov 2026 00:27:08 GMT

### Minor changes

- Fill a layer with a stack of colors, gradients and images: `background` takes a list of paints as well as one color
  token (ajcraswell@gmail.com)

## 0.46.0

Thu, 12 Nov 2026 00:08:16 GMT

### Minor changes

- Effects: a stack of shadows, layer and background filters, and a transform, edited in the Design tab's Effects section
  and by the agent. Text case is now textTransform. (ajcraswell@gmail.com)
- Set a layer's order (z-index): a whole number or a z-index token, in the document, the render, the agent's tools and
  the Design panel's Layer order section (ajcraswell@gmail.com)

## 0.45.0

Wed, 11 Nov 2026 11:07:57 GMT

### Minor changes

- Pick a layer's style sections from what it can do, move the approved styling controls into the inspector, and have
  each field's label name its control (ajcraswell@gmail.com)

## 0.44.0

Wed, 11 Nov 2026 09:32:38 GMT

### Minor changes

- Agents can ask for the tokens nearest a raw color or length: GetTokens({ nearest }), parity tokens --nearest and MCP
  get_tokens list them nearest first, with how far each is (ajcraswell@gmail.com)

## 0.43.0

Wed, 11 Nov 2026 09:09:45 GMT

### Minor changes

- Problems reports a node squeezed narrower than its width, and a node in the layout's flow spilling out of a parent
  that doesn't clip (ajcraswell@gmail.com)

## 0.42.1

Wed, 11 Nov 2026 08:42:05 GMT

### Patches

- Agents' state changes keep values equal to the base, Responsive merges style and props key by key, and instance
  overrides can name layers (ajcraswell@gmail.com)
- Draw popups that components portal to the page's body inside their frame, with the project's styles, and report
  content left outside the frame in problems (PAR-881) (ajcraswell@gmail.com)
- Draw empty layouts as the code does in screenshots, exports and measurements; only the canvas gives them a size and
  dashes (ajcraswell@gmail.com)

## 0.42.0

Wed, 11 Nov 2026 08:07:32 GMT

### Minor changes

- screenshot --sheet (MCP sheet: true) returns one labeled contact sheet per design, every state and mode, instead of
  one image per frame (ajcraswell@gmail.com)

### Patches

- Agents' states and Update can change a layer inside an instance by its instance/inner path, as the editor can
  (ajcraswell@gmail.com)

## 0.41.0

Tue, 10 Nov 2026 23:55:56 GMT

### Minor changes

- Add a video layer: MP4 and WebM files are imported by drop, paste and the Media tab into public/videos, found and
  played in the Media tab, added from Pixabay, and placed by agents with place_result (ajcraswell@gmail.com)

## 0.40.0

Tue, 10 Nov 2026 22:21:48 GMT

### Minor changes

- Agents read the references placed beside a design: References() in execute, get_references with the pictures, and a
  count per design in get_app_state. A reference records the design it was found for. (ajcraswell@gmail.com)

## 0.39.1

Tue, 10 Nov 2026 21:21:43 GMT

### Patches

- Group every main hang, and every UnknownVizError, as one Sentry issue each, so Sentry's alert files one Linear bug
  instead of one per stack (ajcraswell@gmail.com)

## 0.39.0

Tue, 10 Nov 2026 21:00:09 GMT

### Minor changes

- Place references from Mobbin on the canvas, from Find references and by agents' PlaceReference, kept in the project's
  file beside notes (ajcraswell@gmail.com)

## 0.38.1

Tue, 10 Nov 2026 14:26:38 GMT

### Patches

- Media card: stays open while you search where a picture is used, Escape steps back, small pictures keep their size,
  and files of the same name are told apart (ajcraswell@gmail.com)

## 0.38.0

Tue, 10 Nov 2026 13:40:55 GMT

### Minor changes

- Redesign the Media card: facts in labelled rows, where it's used that scales to hundreds of layers, and transparency
  on a grid (ajcraswell@gmail.com)

## 0.37.0

Tue, 10 Nov 2026 13:05:50 GMT

### Minor changes

- Find stock pictures on Pixabay in a library browser and add them to the project from the Media tab, credited
  (ajcraswell@gmail.com)

## 0.36.0

Tue, 10 Nov 2026 12:19:22 GMT

### Minor changes

- The Media tab replaces the Images tab: the project's pictures as a wall, each with a card, to insert, drag onto the
  canvas, add or remove. (ajcraswell@gmail.com)

## 0.35.0

Tue, 10 Nov 2026 11:20:50 GMT

### Minor changes

- Search Mobbin's screens from main with an API key, kept encrypted, through a connector the window and agents share
  (ajcraswell@gmail.com)

## 0.34.0

Tue, 10 Nov 2026 10:26:05 GMT

### Minor changes

- Agents list a project's images with get_images and parity images, with what uses each, and remove an unused one with
  remove_image and parity images remove (ajcraswell@gmail.com)

## 0.33.1

Tue, 10 Nov 2026 05:43:33 GMT

### Patches

- Redraw frames, bitmaps and screenshots with a project stylesheet's new CSS as soon as it's saved
  (ajcraswell@gmail.com)
- Count warnings in export.done, and record a design file that changed on disk while it had unsaved changes
  (ajcraswell@gmail.com)

## 0.33.0

Tue, 10 Nov 2026 05:22:06 GMT

### Minor changes

- Attach the last 5 minutes of events to crashes and fatal errors, and say where main was stuck in a hang
  (ajcraswell@gmail.com)

## 0.32.0

Tue, 10 Nov 2026 05:10:09 GMT

### Minor changes

- Record the project service's degraded modes, such as a project it can't watch or bitmaps it can't keep, as
  service.degraded events (ajcraswell@gmail.com)
- Record signing in, refreshing, signing out and failures of the kept accounts as account.* events
  (ajcraswell@gmail.com)
- Record window and main hangs as they start, and report a hang the app exited during on the next run
  (ajcraswell@gmail.com)

### Patches

- The CLI's sender scrubs the .env values of the app's open projects and of the project each command ran in
  (ajcraswell@gmail.com)
- Frames draw a root with a class or attribute on it, such as :root.dark, which matched nothing before
  (ajcraswell@gmail.com)
- Read the Vite version Vite+ ships when a project aliases vite to @voidzero-dev/vite-plus-core, instead of reporting
  Vite+'s own version as an untested Vite (ajcraswell@gmail.com)
- Detect an open project again when components.json, its stylesheets, dependencies or Vite config change, and when
  parity open names it (ajcraswell@gmail.com)

## 0.31.1

Tue, 10 Nov 2026 03:58:48 GMT

### Patches

- Record why a new install ID couldn't be saved, as telemetry.saveFailed (ajcraswell@gmail.com)
- parity mcp writes its telemetry when its client stops it or closes stdin, rather than losing the last 10 seconds
  (ajcraswell@gmail.com)

## 0.31.0

Mon, 09 Nov 2026 13:05:07 GMT

### Minor changes

- The canvas draws padding and gaps in modes' green and hatches them as Figma does, only while a handle is hovered,
  focused or dragged, with value chips in dark text (ajcraswell@gmail.com)
- Publish to npm's next tag first, and report production once a version has been promoted to latest
  (ajcraswell@gmail.com)

### Patches

- Duplicate lint disables are gone: one guard tells a named length from steps, the renderer keeps one set of bit
  helpers, and module exports are checked with instanceof Function (ajcraswell@gmail.com)

## 0.30.0

Mon, 09 Nov 2026 12:29:45 GMT

### Minor changes

- Rebuild the canvas toolbar: tools with menus, a review button whose Comment and annotation tools warp the toolbar into
  their own bars, and Zoom in its own corner (ajcraswell@gmail.com)

## 0.29.1

Mon, 09 Nov 2026 12:11:43 GMT

### Patches

- Start the project service again when it crashes, backing off when it keeps crashing, and reconnect open windows
  (PAR-788) (ajcraswell@gmail.com)

## 0.29.0

Mon, 09 Nov 2026 10:50:18 GMT

### Minor changes

- Installed builds report to Sentry as preview or release instead of tester, so a pull request's preview installer no
  longer reads as the published app (ajcraswell@gmail.com)
- process.memory sends each role's memory and bitmapCache.used each hit rate as numbers Sentry can chart
  (ajcraswell@gmail.com)
- Record the project service exiting, windows hanging and main's loop blocked as events with how long they lasted
  (PAR-771) (ajcraswell@gmail.com)

### Patches

- Reads its files, the app's answers and MCP arguments through schemas, with no change to what it prints or exits with
  (ajcraswell@gmail.com)
- CI sends only errors and reports to Sentry; its spans, logs and replays stay in the local copy (PAR-777)
  (ajcraswell@gmail.com)
- Bring the tokens package up to Buildkit's lint rules, with no change in behavior (ajcraswell@gmail.com)
- Exports record how long they took, as durationMs on export.done and export.failed (PAR-773) (ajcraswell@gmail.com)
- Zoomed out, a narrow board's title runs into the free canvas beside it instead of truncating at the board's edge
  (ajcraswell@gmail.com)

## 0.28.3

Mon, 09 Nov 2026 06:57:43 GMT

### Patches

- Stop a call failing because the CLI was too busy to read a copy's answer in time (ajcraswell@gmail.com)

## 0.28.2

Mon, 09 Nov 2026 04:18:08 GMT

### Patches

- Open an offscreen render window again after its renderer crashes, so frame captures recover, and record the
  interrupted frame as crashed (ajcraswell@gmail.com)
- Sentry's own spans pass the secret scrubber, sent inside their transaction (PAR-756) (ajcraswell@gmail.com)

## 0.28.1

Mon, 09 Nov 2026 03:07:25 GMT

### Patches

- Upload the published CLI's source maps to Sentry, and name a pkg.pr.new preview's release by its commit (PAR-719)
  (ajcraswell@gmail.com)
- A call that finds a quit copy's entry no longer fails when another call is removing it at the same moment, as on
  Windows. (ajcraswell@gmail.com)

## 0.28.0

Mon, 09 Nov 2026 02:25:19 GMT

### Minor changes

- Record renames made in Layers and on a board's title as inspector.changed, and Detach, Push to main and Make component
  as component.changed (ajcraswell@gmail.com)

### Patches

- project.openFailed carries the project's React, Vite, Tailwind, Storybook and TypeScript versions, including when the
  builder can't load the project's config (ajcraswell@gmail.com)

## 0.27.0

Mon, 09 Nov 2026 00:29:58 GMT

### Minor changes

- Agents report problems in Parity with parity report and MCP's report_problem: a Sentry feedback with the window's
  screenshot and replay, the call's trace and the design's frames, returning its link (ajcraswell@gmail.com)

## 0.26.0

Sun, 08 Nov 2026 23:45:46 GMT

### Minor changes

- Record the first frame a newly opened project's canvas draws, and put the whole open in one trace (PAR-711)
  (ajcraswell@gmail.com)
- Record app.first_project, the time from the app starting to the first project's tab being ready to draw, and whether
  the window restored it (ajcraswell@gmail.com)
- Record the rest of the inspector's changes as inspector.changed: names, images, an instance's state and component,
  prop bindings, slots, states, a component's props and variants, resets, and token edits (ajcraswell@gmail.com)

## 0.25.0

Sun, 08 Nov 2026 22:43:39 GMT

### Minor changes

- Record gestures, undo and redo, inspector changes, inserts, pastes and text edits as telemetry events (PAR-640)
  (ajcraswell@gmail.com)

## 0.24.0

Sun, 08 Nov 2026 21:40:54 GMT

### Minor changes

- The CLI sends its errors, traces and events to Sentry's parity-cli project, without slowing a command
  (ajcraswell@gmail.com)

## 0.23.0

Sun, 08 Nov 2026 21:21:05 GMT

### Minor changes

- Record project opening, detection, builders and servers (PAR-637) (ajcraswell@gmail.com)

## 0.22.0

Sun, 08 Nov 2026 12:58:30 GMT

### Minor changes

- Record each agent call in the app with its inputs, outcome and warnings, and the CLI's own runs, connection failures,
  version mismatches and MCP sessions in ~/.parity/logs (ajcraswell@gmail.com)

## 0.21.0

Sun, 08 Nov 2026 11:33:58 GMT

### Minor changes

- Record every action in the action list as command.ran, with where it came from, whether it applied, and the selection
  (PAR-639) (ajcraswell@gmail.com)

## 0.20.0

Sun, 08 Nov 2026 11:14:21 GMT

### Minor changes

- Record frame renders, frame failures, component previews and the bitmap cache's hit rate in telemetry
  (ajcraswell@gmail.com)
- Search actions (Ctrl+K) finds designs, layers, components, tokens and panel actions, with recent picks first, and
  Repeat last action (Ctrl+Alt+P) runs the last change again on the selection (ajcraswell@gmail.com)

## 0.19.0

Sat, 07 Nov 2026 09:34:30 GMT

### Minor changes

- Layers opens an instance's row to the layers inside it, read-only apart from each layer's eye (ajcraswell@gmail.com)

## 0.18.0

Sat, 07 Nov 2026 09:05:12 GMT

### Minor changes

- Failing components draw a hatched box and show in the console with why and how to fix them, the console filters levels
  from a menu, and saved component code reaches the canvas live (ajcraswell@gmail.com)

## 0.17.0

Sat, 07 Nov 2026 04:58:13 GMT

### Minor changes

- Lock layers and designs with Ctrl+Shift+L, a lock on each Layers row, and Lock in the canvas and row menus: a locked
  one can't be selected or moved on the canvas, only from Layers, and stays locked in the .par (ajcraswell@gmail.com)

## 0.16.0

Sat, 07 Nov 2026 03:48:34 GMT

### Minor changes

- Add Help > Report a problem, which sends what happened with a screenshot, logs, versions and projects, and offers
  itself after a crash; add parity diagnostics, which writes the same as a zip (PAR-635) (ajcraswell@gmail.com)

## 0.15.0

Sat, 07 Nov 2026 03:34:11 GMT

### Minor changes

- parity logs and get_logs read Parity's own events from the local log, by level, process, trace, test run or time
  (PAR-636) (ajcraswell@gmail.com)
- Record failed data checks as data.invalid and refused projects as project.unsupported (PAR-633) (ajcraswell@gmail.com)

### Patches

- Telemetry event names may be camelCase, and the app's error, save and export events are registered
  (ajcraswell@gmail.com)

## 0.14.0

Sat, 07 Nov 2026 02:04:23 GMT

### Minor changes

- Tag every event with its test run, who's driving (a person or an agent, with its caller and client) and the tester or
  agent as Sentry's user (ajcraswell@gmail.com)
- Carry trace context across the window, the service, main, render jobs, builders and the CLI (PAR-629)
  (ajcraswell@gmail.com)
- Mark a component design's layouts as slots: children or named, listed with its params in Props, with Make slot beside
  Make component and the slots outlined on the canvas (ajcraswell@gmail.com)

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
