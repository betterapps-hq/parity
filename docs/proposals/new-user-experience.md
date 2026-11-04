# Proposal: starting a project and designing from scratch

Status: an audit and plan from the New design experience session, 2026-11-04 (PAR-529). You asked how someone is meant
to build a new app from scratch, whether it matches what a person coming from Figma expects, and said the words Design,
Screen, View and Layer don't say what they are. You also said the start page was designed but never built, because its
templates waited on the Buildkit scaffolder, which is ready now. You took all six recommendations below on 2026-11-04;
they're in [decisions.md](../decisions.md), "Starting from scratch, and what things are called (PAR-537)", and the tasks
are in Linear. Each change people see is designed in Storybook for your approval before it's built in the app.

## In one line

Parity is built for opening an app that already has designs. A person starting fresh gets an empty canvas with no
visible way to make anything, a screen that's heavier than what they meant to draw, and words that each mean two or
three things.

## How we looked

- **Hands-on.** A separate copy of Parity, with its own ports and profile, on a copy of the example app with its `.par`
  taken out: a React app that's new to Parity, as a person's own app would be. It ran on origin/main at `583b9fd`,
  driven over the DevTools protocol with the real pointer and keys, as the end-to-end tests drive it. What's below was
  seen there, unless it says it was read in the code.
- **Code.** Every way a design, a layer or a note gets made, and every user-facing string naming one.
- **The start page explorations** (`apps/desktop/src/renderer/explorations/start`) and Linear: PAR-188 (first run),
  PAR-284 (New project from the scaffolder), PAR-133 (pick a library and icon set), PAR-283 (the scaffolder itself).

## What a new person meets

### Before the canvas

- **The start screen only opens things.** "Open a folder" and "Open a project file", then recent projects
  (`chrome/StartScreen.tsx`). The File menu is the same. There's no New project, no example to try and no template.
- **The start page is designed.** The Storybook explorations have Home, a first run, a new tab, search, and New project
  with templates for each stack, a blank app, or a start from one of your projects, a repository or a folder. Templates
  come from the scaffolder's catalog, so each starts from a stack and asks only what's left.
- **A blank app still opens on nothing.** The explorations' Blank app template has no designs (`blankOn` in
  `new-project.tsx`), so it lands on the same empty canvas as below.
- **Linear is behind.** PAR-283, Build the Buildkit scaffolder, is still Todo, and it blocks PAR-284, which blocks
  PAR-133.

### The empty canvas

What a person from Figma tries first, and what each does:

| They try                                   | What happens                                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| F or A (frame), R (rectangle), Shift+A     | Nothing, and nothing says why                                                                       |
| Dragging on the canvas, double-clicking    | An empty selection box; nothing                                                                     |
| Right-click                                | Paste here, Select all, Zoom to fit                                                                 |
| Ctrl+K for "new", "frame" or "screen"      | No command makes a screen or a component                                                            |
| File, Object                               | No New screen or New component                                                                      |
| The toolbar                                | Move, Hand, Text, Interact; its code says "New designs are added from the Layers panel"             |
| Layers                                     | "Components 0, No components yet" and "Screens 0, No screens yet"; the + to make one shows on hover |
| The Text tool, clicked on the canvas       | A note ("Text on the canvas"), not a text layer: no styles, and it can't go into a screen           |
| `/`, then Vertical layout                  | A new screen, made without saying so, named "Pasted"                                                |
| `/`, then Button                           | "Select a design or a layout to insert into"                                                        |
| Clicking Button in Components              | "Select a design or layer first, or drag it onto a design"                                          |
| Dragging a component onto the empty canvas | "Drop it inside a design, onto one of its layouts" (`canvas/CanvasDrop.tsx`, read in the code)      |
| Dropping an image, or pasting layers       | A new screen there (`canvas/drop-files.ts`, `canvas/clipboard.ts`)                                  |

Around it, the status bar says the app has 587 components while Layers says Components 0, and the inspector says "Select
a design on the canvas or in Layers" when there are none to select.

So the only deliberate way to start is a button that's invisible until the pointer is over the Screens heading
(`chrome/LayerTree.tsx`, the `sr-only` New screen button). The accidental ways don't agree: a layout, an image or a
paste makes a screen, while a component or text is refused or becomes a note.

### The first screen

New screen makes a board titled "Untitled screen", 240px right of everything, and zooms to it at 55%.

- **Four things deep, three names.** The board, its frame captioned "Desktop Light 1280" with a crown, the root layout
  named "Page", and a heading reading "Untitled screen". Layers shows Untitled screen › Page › Untitled screen.
- **The screen isn't the container.** Selecting the screen shows Screen or Component, its file (`shadcn-vite.par`),
  States, Components (Find repeated parts) and four Modes. Its size, fill, padding and auto layout are on Page, which a
  click can't reach: a click on the page's padding selects the screen. In Figma the top-level frame is the container,
  and selecting it gives its size, fill and auto layout first.
- **States before there are any.** Every layer's inspector starts "Editing Default, changes the design", with one state.
- **What's inserted fills the width.** A Button put after the heading is 1184 by 32, since Page is a column that
  stretches its children. Figma inserts at its own size.
- **Resizing the frame changes the design.** Dragging its edge 150px narrower is "Undo resize frame", and the caption
  reads 1009 while its mode still says Desktop, 1280px. There's no way to drag a frame narrower just to watch it reflow,
  as you'd resize a browser window; PAR-170 plans one.
- **Show all works as you described.** It lays Desktop Light, Desktop Dark, Tablet and Mobile out side by side, the live
  view of the app in each mode.

## What a Figma user expects

| Figma                                                                    | Parity today                                                                |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| File > New, or a template                                                | Open a folder                                                               |
| The frame tool (F or A): drag one out, or pick Phone, Tablet or Desktop  | No frame tool; a + in Layers that shows on hover                            |
| Anything can sit on the canvas: frames, text, shapes, images, components | Only screens, components and notes                                          |
| A top-level frame is the screen: select it for size, fill, auto layout   | A screen and its root layout are two things, and the root can't be clicked  |
| T, then a click, makes text anywhere                                     | T on the empty canvas makes a note                                          |
| Any frame or layer becomes a component (Ctrl+Alt+K)                      | The same, with the same keys                                                |
| Shift+A adds auto layout                                                 | Shift+A wraps in a layout: the same idea under another name                 |
| Variable modes switch a frame's theme                                    | Modes are a viewport, theme and locale together, chosen per design: broader |
| Pages and sections group work                                            | One canvas; sections are PAR-183, and lenses will add canvas pages          |
| Prototype and Present                                                    | Interact (I), which runs the real app                                       |

Most of the handling now matches Figma (PAR-161 to PAR-189). What doesn't is the part a new person hits first: making
something, and what the something is.

## The words

What each word names today, in the code and on screen:

| Word      | In the code                                                      | On screen                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design    | A `ContainerSpec`, a screen or a component                       | The generic name ("Select a design", "Next design"), the inspector's Design tab, and "changes the design", which means the base state                                                                     |
| Screen    | A container of kind `screen`, "a whole page or view"             | The Screens group in Layers, New screen, Make it a screen                                                                                                                                                 |
| Component | A container of kind `component`, a code export, and a layer type | "Components 0" in Layers (designs), "587 components" in the status bar (code), "Button component in Untitled screen" (a layer), and the screen inspector's Components section, which finds repeated parts |
| Board     | tldraw's shape for a design (`ContainerShapeUtil`)               | "Frames on this board" (the modes menu), "Defaults show on this board"; never introduced. A screen's icon is lucide's Frame (`#`)                                                                         |
| Frame     | One mode and state of a design, drawn live                       | "Drag to resize this frame", "Show beside the main frame", "Resize frame"; also an iframe in the accessibility rules, and "frames a second"                                                               |
| View      | `ContainerViewSettings`: which modes and state a design shows    | The undo label "Change view", on every switch of state, mode or variant                                                                                                                                   |
| Main      | The mode a board shows first, and a component's design           | "Main", "Make main", "Main only" for a board's first frame; "Go to the main component" and "Push to main" for components                                                                                  |
| Primary   | The project's first mode                                         | A "Primary" badge and a crown on its captions, beside "Main" on the same mode                                                                                                                             |
| Base      | A design with no state applied                                   | "Base", "Base state", "Reset to the base design", while the first state is named "Default"                                                                                                                |
| Layer     | A `DesignNode`                                                   | Anything inside a design: layout, text, image, component, instance                                                                                                                                        |
| Layout    | A `LayoutNode`, flex or grid                                     | "Vertical layout", "Wrap in layout": Figma's frame with auto layout                                                                                                                                       |
| Page      | The root layout's default name                                   | The root layer, a page of the app in the Components panel, and, with lenses, a page of the canvas                                                                                                         |
| Mode      | A viewport, theme and locale together                            | Modes tab and captions ("Desktop Light"); Figma's switch variables, most often a theme                                                                                                                    |
| State     | Patches over a design's content                                  | "Editing Default", the state menu on the board                                                                                                                                                            |
| Note      | A `NoteSpec`                                                     | "Text on the canvas", with the same undo labels as a text layer ("Add text", "Edit text")                                                                                                                 |

The worst are frame, which is a whole screen in Figma and one mode's tile in Parity, while a screen's own icon is
Figma's frame; component, which names four things; design, which names the object, a tab and the base state; and main,
primary, base and default, four words for the one you start from. The inspector also shows the design's file path and a
"Params" heading, which are the code's words.

## What it should be

### Three weights, so not everything is a screen

You're right that a screen is heavy, and that it should be. It's the live view of a page of the app: every mode side by
side, its states, a frame you can drag narrower, and code written from it. A component is lighter, but its board is
built the same way, and a sketch has nowhere to go but a screen.

1. **Frames, the light weight.** Drawn anywhere with F, dragged out or picked from the modes' viewports. A frame is a
   layout on the canvas: drawn once, at its own size, in the primary mode, with no states, no modes beside it, no route
   and no code written. It holds anything a screen holds: text, images, layouts, component instances, other frames. This
   is the scratch space and the Figma habit. In the file it's a container of a third kind, so it moves, copies, undoes
   and saves as the others do. Only a top-level one is a frame: drawn inside another, it's a layout, as today.
2. **Components, the middle weight.** Reusable, with params and variants, linked to code. Their board hugs what they
   draw, with one preview until you turn modes on, rather than a 480px frame.
3. **Screens, the heavy one.** A page of the app, as today, with what PAR-170 adds: an edit kept to one viewport, and a
   preview dragged narrower without saving.

Any frame becomes a component (Make component, as today) or a screen (Make it a screen, which today turns a component
back into one). A screen made a frame again keeps its layers and drops its states and modes, after saying so.

**Selecting any of them selects the container.** The root layout's size, fill, padding and auto layout come first in the
inspector, then a screen's states and modes in sections below. Layers lists the root's children straight under the
design, as Figma lists a frame's, so "Page" no longer sits between a screen and its content.

### Making something is always one visible step

- **An empty canvas says how to start.** In its middle: New screen, New component and Draw a frame (F), with Insert
  (`/`) and dropping an image beneath, each with its keys. It goes once anything is on the canvas.
- **New screen and New component are everywhere a command is:** File, Object, the canvas's right-click menu, Ctrl+K, and
  the toolbar's frame tool, whose menu lists the modes' viewports as sizes.
- **Layers' + always shows,** and its empty rows are buttons: "No screens yet. New screen".
- **Whatever goes onto the empty canvas makes a frame there, by one rule:** a layout, text, a component, an image or a
  paste. It's named after what's in it, never "Pasted", and Text makes a text layer in a frame that hugs it. Notes stay,
  as annotations, under a tool of their own.
- **A component inserted into a new screen keeps its own width,** rather than stretching across the page.

### The first run and New project

- **Build the start page from the explorations,** now that the scaffolder is ready: New project from the scaffolder's
  templates for each stack, a blank app, an existing folder, and the example.
- **The first run starts on something,** a template or the example, never an empty canvas (PAR-188 says the example).
- **A blank app opens with a Home screen** for its `/` route, in its desktop and mobile modes, not an empty canvas.
- **An app new to Parity is offered its pages.** Component detection already finds pages (decisions.md, "Pages get their
  own section in the Components panel"). Opening an app with no `.par` offers to put each on the canvas as a screen, so
  a person sees their own app first and edits from there. This wasn't tried on the example.

### One set of words

One word for each thing, Figma's where it means the same. Once decided, it goes in decisions.md, and the strings follow.

| Word           | Means                                                                            | Instead of                                |
| -------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| Project        | An app's folder, and its `.par`                                                  |                                           |
| Canvas         | The space everything sits on                                                     |                                           |
| Screen         | A page of your app, drawn live in its modes and states, and written to code      |                                           |
| Component      | A reusable piece: the main component on its board, an instance where it's placed | "component design"                        |
| Code component | A component the app's code already has, from its UI kit or a library             | "component" in the status bar and inserts |
| Frame          | Anything drawn on the canvas that isn't a screen or a component yet (decision 1) | a screen made to sketch in                |
| Preview        | One mode and state of a screen or component, drawn live (decision 2)             | "frame"                                   |
| Layer          | Anything inside: a layout, text, an image, a component                           |                                           |
| Layout         | A layer that arranges others in a row, column or grid, Figma's auto layout       |                                           |
| Mode           | A viewport, theme and locale together                                            |                                           |
| State          | A version of a screen's or component's content, such as Empty or Error           |                                           |
| Note           | Text on the canvas that explains, never drawn in the app                         |                                           |

Design stays the name of the inspector's tab, as in Figma, and stops being the name of a thing: "Select a design"
becomes "Select a screen or component", and "changes the design" becomes "changes every state". Board and view stay in
the code, and "Change view" says what changed ("Show Dark", "Show Empty"). Page means only a page of the app, and a
screen's icon stops being Figma's frame. Main means only a main component: a board's first preview is the one it shows
first ("Show first" rather than "Make main"), the project's first mode stays Primary, and the first state is Default
everywhere, with Base gone. The inspector's "Find repeated parts" stays, under a heading that says what it does rather
than "Components".

## The tasks, ordered by impact

Sizes are S, M and L, as [work.md](../work.md) describes them. Each change people see is a design issue in Storybook,
which ends with your approval, and a build issue it blocks.

1. **New project and the start page** (PAR-283's status first, then PAR-284, PAR-133 and PAR-188; L). The first thing
   anyone sees, designed already, and unblocked. PAR-284 makes a blank app's Home screen (decision 5).
2. **Make creating visible** (M): the empty canvas's start, New screen and New component in File, Object, the
   right-click menu and Ctrl+K, Layers' + always shown, one rule for what lands on the empty canvas, and no "Pasted".
   Designed in PAR-541, built in PAR-546.
3. **The screen is its container** (M): selecting a screen edits its root layout, and Layers drops the root's row
   (decision 3). Designed in PAR-542, built in PAR-547.
4. **Frames and the frame tool** (L): a third, light kind of container, F to draw one, presets from the modes'
   viewports, Make it a screen from a frame, and text on the empty canvas as a text layer (decisions 1, 4 and 6). The
   model is PAR-539, the design PAR-540, and the app PAR-545, after PAR-538.
5. **One set of words** (M): the glossary, then the strings, toasts, hints and docs that use the old ones (decisions 1
   and 2). PAR-538, checked in its pull request's Storybook preview.
6. **Lighter first steps** (S): hide "Editing Default" until a design has a second state, inserts that keep their own
   width in a new screen, the inspector's file chip out of the way, and the status bar's count saying it's components in
   code. PAR-543.
7. **Offer an app new to Parity its pages** (M). Designed in PAR-544, built in PAR-548.
8. **Drag a preview narrower without saving** (PAR-170, already planned).

## Decisions

You took each recommendation on 2026-11-04; decisions.md has them as decided.

1. **A light third kind on the canvas, and its name.** My recommendation: yes, called a frame, the word Figma users
   reach for and F's key. The alternatives are a sketch or a draft.
2. **A new name for the per-mode tiles inside a board,** which the UI calls frames today. My recommendation: previews
   ("Desktop Light preview"), so frame means one thing.
3. **Whether a screen and its root layout become one selection.** My recommendation: yes, as Figma's top-level frames
   are.
4. **What T on the empty canvas makes.** My recommendation: a text layer in a frame that hugs it, with notes kept as
   annotations under their own tool.
5. **What a blank app opens with.** My recommendation: a Home screen for `/`, with the empty canvas's start beside it.
6. **Whether a frame can be written to code.** My recommendation: no. It becomes a component or a screen first, which
   keeps "what gets written" to the two kinds that have a place in the app.
