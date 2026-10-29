# Proposal: decorators and modes

Status: you decided the contract, Storybook's, and on 2026-10-28 the questions below. Nothing here is built yet beyond
`.lib.par` decorators.

## In one line

Every frame renders inside decorators: the project's providers, plus whatever each mode needs, such as a theme class, a
locale's messages or a library's theme wrapper. Decorators follow Storybook's contract, so a project's Storybook setup
works in Parity as it is, and a project without Storybook writes the same thing in a file of its own.

## Why

Today a mode option can only add a class or attributes to a frame's stand-in `<body>`. That covers shadcn's `.dark`, and
`lang` and `dir`, but not:

- **a library whose theme is a wrapper component,** such as Radix Themes' `<Theme appearance="dark">` or MUI's
  `ThemeProvider`, or whose direction needs a `DirectionProvider`;
- **translations,** which need a provider holding the locale's messages, loaded first;
- **the app's own providers,** which many components need just to render: a router, a query client, sign-in,
  permissions.

Copacker's Storybook preview already does all of this. It has theme and locale toolbar options, a loader that fetches
the locale's messages and sets up a router, and one decorator that wraps every story in `IntlProvider`, the app's
`Providers`, permissions, the URL's query and the router.

## The contract

Storybook's, so code moves both ways:

- **A decorator** is `(Story, context) => element`. `Story` renders the design, and the decorator returns what goes
  around it.
- **The context** has `globals`, the mode's value for each variable (`{ theme: "dark", locale: "ar" }`); `parameters`,
  settings for a design or state; `args`; `loaded`, what loaders returned; and `id`.
- **Loaders** are async functions that run before a frame renders. What they return is in `context.loaded`.
- **Global types** declare the variables and their options, and `initialGlobals` their defaults.
- **Levels:** libraries' decorators wrap outermost, so a project's own provider overrides a library's default. Then come
  the project's, a component's and a design's, as Storybook's global, component and story levels do. In a list, as in
  Storybook, the last decorator wraps the ones before it.

## Where decorators come from

None is required. The project's preview comes from one file, Storybook's or Parity's, and libraries and what Parity
reads from the project add to it.

1. **The project's Storybook preview,** `.storybook/preview.*`, used as it is when there's no Parity preview file.
   Parity composes it with Storybook's own portable stories API from the project (`setProjectAnnotations` and
   `composeStory`), the API that lets stories run outside Storybook, as in Vitest. Its decorators, loaders, parameters
   and global types apply as Storybook applies them. A component's stories file can add decorators for that component's
   designs.
2. **A preview file for Parity,** `.parity/preview.tsx`, for a project without Storybook, or to change what Storybook's
   preview gives the canvas. It has the same exports as Storybook's preview (`decorators`, `loaders`, `parameters`,
   `globalTypes`). Parity runs it with a small runtime of its own, so Storybook isn't needed, and moving to Storybook
   later means moving the file to `.storybook/preview.tsx`.
   - **When both exist, Parity's file wins** and replaces Storybook's preview on the canvas. It can import
     `.storybook/preview` and spread its decorators to build on them, so adding to Storybook's and replacing it are each
     a line:

     ```tsx
     import storybook from "../.storybook/preview"

     export const decorators = [...(storybook.decorators ?? []), withCanvasOnlyProviders]
     ```

   - **It's separate from `parity.config.ts`.** The config, at the project root, holds adapters, plugins and settings,
     and runs in Node in the project service. Decorators render in the frames, so they stay in the preview file, as
     Storybook keeps `main.ts` and `preview.tsx` apart for the same reason.
3. **Libraries, as data.** A `.lib.par` lists decorators that need no code, outermost first, as they nest in JSX. That's
   the reverse of a Storybook list, so Parity reverses it before a project's decorators join (see
   [storybook.md](../storybook.md)). Each is one of:
   - `class`: a class on the frame, such as shadcn's `dark`;
   - `attributes`: attributes on the frame, such as `data-theme`;
   - `style`: such as `color-scheme: dark`, so form controls and scrollbars follow the theme;
   - `wrap`: a component from an import that wraps the design, such as Radix Themes' `Theme`;
   - `add`: a component rendered beside the design, such as a toast library's `Toaster`.

   Any entry can take `when`, the mode values it applies to, such as `{ "theme": "dark" }`. Several keys must all match,
   and a list matches any of its values. A prop can take its value from the mode (`$global`, with a value per option),
   so one wrapper covers every option. It can call an imported function with fixed arguments (`$call`), such as MUI's
   `createTheme`, and can point at the frame's root or body (`$frame`), which Emotion's and Griffel's style containers
   need. Parity turns each entry into a Storybook decorator that reads `context.globals`.

4. **What Parity can read from the project:**
   - Tailwind's dark variant in the stylesheet, so dark mode adds the right class or attribute. Copacker's is
     `@custom-variant dark (&:is(.dark *):not(:is(.light, .light *)))`.
   - Locales from the message catalogs (copacker's `messages/`), and each locale's direction from the browser's
     `Intl.Locale`.
   - The app's providers, from what its entry renders around the app, such as `<Providers><App /></Providers>`. Parity
     offers to write a preview file with them, and never adds one on its own.

Today's mode options, a class and attributes, become `class` and `attributes` entries, so existing `.par` files keep
working.

## Modes are globals

- **Each mode variable is a global, and each option a value.** Theme options are `light` and `dark`; locales are
  language tags, such as `en` and `ar`.
- **Global types become variables.** A project whose Storybook declares a theme and a locale gets them as mode
  variables, with the same options, without setting anything up. Copacker would get every language its toolbar lists.
- **A variable can exist on one side only.** Viewport is Parity's own; a project's Storybook may declare one Parity has
  never heard of. Either way, an option is a value passed to decorators, plus its built-in effects if it has any.

## Parameters per design and state

Copacker's decorator also reads parameters: the signed-in person's permissions, the URL and its query, and the database
rows a story starts with. So each design, and each of its states, can set parameters, saved in `.par`. A design's
"Viewer" state, for instance, sets `permissions` to a viewer's, and its frame shows what a viewer sees.

## One page, many frames

Storybook renders each story in its own iframe, so a decorator can change the whole page. Parity draws every frame in
one page, each in its own shadow root with a stand-in `<body>`. A decorator that changes the page changes every frame,
and Parity's own interface too. Copacker's sets `lang` and `dir` on `<html>`, and its theme store puts `dark` on
`<html>`, the same class Parity's own dark theme uses. So:

- **Changes to `<html>` and `<body>` made while a frame renders move onto that frame's stand-in body,** and are undone
  on the page: classes, `lang`, `dir`, `data-` attributes and `color-scheme`.
- **Portals,** such as dialogs, menus and toasts, need to render into the frame rather than the page's `<body>`, so they
  pick up its theme and locale.
- **A store shared by the whole app holds one value per page.** Copacker's theme store can't be dark for one frame and
  light for the next, because every frame runs the same copy of the app's code.
- **A frame whose decorators need more than this renders in an iframe,** which is slower but behaves as Storybook does.

## Requirements

For a project's decorators to work in Parity:

- They're exported the way Storybook's preview exports them, written in the project's framework.
- What they import comes from the project's dependencies and is built by the project's own Vite, as components are.
- They don't depend on Storybook's interface. Add-ons that only add panels are ignored. Add-ons that contribute
  decorators or loaders, such as MSW's, run when they work outside Storybook, as they do in Vitest.
- Their changes to the page stay within the list above, or the frame falls back to an iframe.
- Copacker's preview uses Storybook's newer `definePreview` format. Composing that outside Storybook still needs
  checking against Storybook's API.

## Decisions needed from you

You answered all five on 2026-10-28, with the file in the `.parity` folder:

1. **The file for projects without Storybook: decided, `.parity/preview.tsx`,** with Storybook's exports, as
   `.storybook/preview.tsx` has them.
2. **When there's both: decided, Parity's file wins.** You first chose Storybook's preview with Parity's file adding to
   it, then said Parity should "reuse Storybook preview or it can be overridden with a .parity preview.tsx". So with no
   Parity file, Storybook's preview is used as it is, and when the file exists it replaces Storybook's, importing it to
   build on it where wanted.
3. **Changes to the page: decided, moved onto the frame,** falling back to an iframe when that isn't enough.
4. **Parameters: decided, per design and per state,** saved in `.par`.
5. **The app's providers: decided, Parity offers to write the preview file** from what the app's entry renders, and
   never writes it unasked.

How this fits with the rest of Parity's use of Storybook is in [storybook.md](../storybook.md).
