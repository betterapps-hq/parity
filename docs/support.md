# What Parity supports

What works today, what needs an adapter, and what Parity asks of every project. Keep this current: when an adapter,
connector or lens lands, update its row here. The visual version is the
[Parity support matrix](https://claude.ai/artifact/KdDtEs9y2Thiz5u9LW8Wgu); republish it when this changes.

| Status | Meaning                        |
| ------ | ------------------------------ |
| ✅     | Works, and tested              |
| ◐      | Works, with limits             |
| ❔     | Should work, untested          |
| 🔜     | Planned, in a written proposal |
| ⏳     | Later, not scheduled           |
| ❌     | Not supported                  |

Everything here was read from the code on 2026-10-28. Only one stack is tested end to end: the example project
(`examples/shadcn-vite`), which is React 19, Vite 8, Tailwind CSS v4, shadcn and TypeScript 6. The validation projects
at the end of this page are the plan for testing more. Four of them exist in `fixtures/` (`vite7-js`, `react-aria`,
`mantine` and `too-old`), so far checked by their detection snapshot only.

## Four kinds of requirement

| Kind         | What it means                                                                                                 | Today                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fixed**    | Parity's design depends on it. No adapter will remove it.                                                     | A Node package, a web UI drawn to the DOM, ES modules from a dev server, styles as stylesheets, tokens as CSS custom properties, `.par` files  |
| **Expected** | Assumed for speed. Nothing else is built for now. A project without it gets less, and an adapter can lift it. | TypeScript, React 19, Vite 7 or later, Tailwind CSS v4, named exports                                                                          |
| **Standard** | Read from an open format, so any tool that writes it works.                                                   | CSS custom properties, WCAG 2.2 through axe-core; planned: OpenAPI, JSON Schema, SQL, DTCG; later: JUnit XML, LCOV, OpenTelemetry, OpenFeature |
| **Adapter**  | One piece of code or data per tool. The first ones are built, others follow by demand.                        | React, Vite, Tailwind v4, `.lib.par` libraries, Lucide, Storybook                                                                              |

### Fixed

1. **A Node package.** A `package.json` is how Parity finds the framework, the libraries and the package manager.
2. **A web UI drawn to the DOM.** Frames are real DOM in shadow roots. Native and terminal UIs need their own frames,
   which the web-and-backend plan puts after the web.
3. **ES modules from a dev server.** Whatever the build tool, it has to serve the canvas an ES module it can import.
4. **Styles as stylesheets.** Frames adopt the project's CSS into each shadow root. Styles injected into the page at run
   time (CSS-in-JS, CSS modules through Vite's client) reach frames only when a decorator sends them there, as the
   Emotion and Griffel libraries' decorators do.
5. **Tokens as CSS custom properties.** Modes switch themes and breakpoints on each frame, and token edits are CSS
   variables. Tokens can be written in any format, as long as they compile to custom properties.
6. **Designs in `.par` files** in the repo, as JSON.

### Expected

| Expectation         | Why it pays                                                                                               | Without it                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| TypeScript          | One engine, the type checker, gives props today and component discovery, API clients and code links next. | Designs render, but props aren't inferred.                                                 |
| React 19            | One renderer adapter to build and test. React 18 and earlier are dropped.                                 | It opens as usual, but React 18 and earlier aren't tested and may not render.              |
| Vite                | One builder adapter; it loads the project's own config.                                                   | The project doesn't open (no builder adapter).                                             |
| Tailwind CSS v4     | The theme is read and written as `@theme`; spacing and type scales come with it.                          | Plain CSS variables still give tokens; the spacing scale and `@theme` editing are missing. |
| Exported components | Parity places what code can import. Named and default exports both work.                                  | A component used only inside its own file isn't listed.                                    |

## Will my project open?

| Project                                                                 | Status | What you get                                                                                                       |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| React 19, Vite, Tailwind v4, shadcn, TypeScript                         | ✅     | Everything. This is the example project and the Buildkit scaffolder's stack.                                       |
| React 18 and earlier                                                    | ❌     | Dropped: React 18 came out in March 2022. Nothing blocks it and it may still render, but it isn't tested or fixed. |
| React, Vite, plain CSS with custom properties                           | ❔     | Should render, with tokens from the CSS. Spacing values assume Tailwind's `--spacing` variable.                    |
| React, Vite, JavaScript                                                 | ◐      | Renders `.jsx` and `.js` components without inferred props.                                                        |
| React, Vite, Tailwind v3 and earlier                                    | ❌     | Dropped: v3 came out in December 2021. Untested; the theme reader uses a v4 API, so the theme doesn't load.        |
| React, Vite, CSS modules or CSS-in-JS (MUI, Emotion, styled-components) | ❔     | Components render, but their styles most likely don't reach the frames.                                            |
| React, Vite, Fluent UI v9                                               | 🔜     | Planned; see Fluent UI and Fluent icons. Today its styles most likely don't reach the frames.                      |
| Next.js, Remix, Astro, or webpack                                       | ❌     | No builder adapter yet. Next.js is the likely second builder.                                                      |
| Vue, Svelte or Solid                                                    | ❌     | No renderer adapter yet. The interface exists; nothing is planned until there's demand.                            |
| Angular, React Native, Flutter                                          | ❌     | Not planned.                                                                                                       |

## By kind of tool

### UI framework (renderer adapter)

| Tool                 | Status | Notes                                                                                                                                                                            |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React 19             | ✅     | `packages/renderer-react`. Finds layers in React's tree, as React DevTools does, tested on 19.3; a release that changes the tree falls back to the `data-canvas-node` attribute. |
| React 18 and earlier | ❌     | Dropped: React 18 came out in March 2022. Untested, but not blocked.                                                                                                             |
| Vue, Svelte          | ⏳     | `RendererAdapter` is ready for them.                                                                                                                                             |
| Solid, Preact        | ⏳     |                                                                                                                                                                                  |
| Angular              | ❌     | Not planned.                                                                                                                                                                     |
| React Native         | ❌     | Needs native frames, after the web.                                                                                                                                              |

### Build tool (builder adapter)

| Tool                     | Status | Notes                                                                                         |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------- |
| Vite 8                   | ✅     | `packages/builder-vite`, with the project's own Vite and config.                              |
| Vite 7                   | ❔     | Same adapter; untested. Drops in June 2027.                                                   |
| Vite 6                   | ❔     | Same adapter; untested. Drops in November 2026.                                               |
| Vite 5 and earlier       | ❌     | Dropped: Vite 5 came out in November 2023. Untested, but not blocked.                         |
| `vite.config.cjs`/`.cts` | ✅     | Found by the project's own Vite (`loadConfigFromFile`), like `.js`, `.mjs`, `.ts` and `.mts`. |
| Next.js                  | ⏳     | Likely the second builder; server components need thought.                                    |
| webpack, Rspack          | ⏳     |                                                                                               |

### Styling (styles adapter)

| Tool                                | Status | Notes                                                                                     |
| ----------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Tailwind CSS v4                     | ✅     | `packages/styles-tailwind` reads the whole theme.                                         |
| Plain CSS custom properties         | ❔     | Read from the compiled CSS; edits go into `:root` blocks.                                 |
| Tailwind CSS v3 and earlier         | ❌     | Dropped: released December 2021. Untested; the theme reader needs v4.                     |
| CSS modules                         | ❔     | Most likely unstyled in frames; only the global stylesheet is adopted.                    |
| Emotion (MUI, Chakra UI)            | ✅     | The library's decorator gives Emotion a cache whose container is the frame's shadow root. |
| Griffel (Fluent UI)                 | ✅     | Fluent's decorator uses Griffel's shadow DOM renderer.                                    |
| Other CSS-in-JS (styled-components) | ❔     | Most likely unstyled in frames until a decorator targets the frame's shadow root.         |

### Tokens

| Format                                     | Status | Notes                                                                                                      |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| CSS custom properties on `:root`           | ✅     | Read and written.                                                                                          |
| Tailwind `@theme`                          | ✅     | Read and written, including `@theme inline` and `@theme static`.                                           |
| Themes as one class (`.dark`)              | ✅     |                                                                                                            |
| Themes as attributes (`[data-theme]`)      | ❌     | Not treated as themes yet; a gap to fix.                                                                   |
| `prefers-color-scheme` blocks              | ◐      | Overwrite the defaults: in `mantine`, the dark values are read as the light ones. A gap to fix.            |
| Breakpoints (`--breakpoint-*`, `.lib.par`) | ✅     | Plus device presets.                                                                                       |
| DTCG token files and resolvers             | ✅     | Read from a `.lib.par`'s `tokens`, filed by the category `$extensions.parity` gives, each theme as a mode. |
| JavaScript themes (MUI, Chakra, Fluent)    | ✅     | Read by `parity lib` into the registry's DTCG.                                                             |

### Finding components

| Source                                                             | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn `components.json` `aliases.ui` folder                       | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Every file the app's tsconfig includes                             | ✅     | Read with TypeScript's own config parser, so `extends` and project references are followed. Without a tsconfig, every file under the root. Stories, tests, generated files, `tmp` folders, and the entry file that mounts the app are left out.                                                                                                                                                                 |
| The UI kit: `src/components/ui`, `components/ui`, `src/components` | ✅     | When `components.json` doesn't name a folder, the first of these found. Its components load with the canvas and keep their bare names on a clash. The rest of the app loads as it's drawn.                                                                                                                                                                                                                      |
| `.tsx`, `.jsx`                                                     | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.js`                                                              | ✅     |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.ts`                                                              | ✅     | A component made with `createElement`, or an alias such as `const Select = Primitive.Root`, is found by the type checker. Declaration files and config files such as `vite.config.ts` aren't read.                                                                                                                                                                                                              |
| Named and default exports                                          | ✅     | Found by parsing each file: copacker's 360 component files in about a quarter of a second, with no route objects or API handlers counted. A default export takes its declaration's name, else its file's.                                                                                                                                                                                                       |
| Aliases, and components without JSX                                | ✅     | The type checker in the props worker adds what parsing can't see, such as `const Select = SelectPrimitive.Root` and components that return only `children`. On copacker it took about 13 seconds after opening, and the list matched the earlier measurement: 593 components.                                                                                                                                   |
| Re-exports and import paths                                        | ✅     | A component an index file re-exports is listed once, where it's declared. Each one's props say what code imports it from: a library's package name, or the file through the app's tsconfig alias, as `@/components/ui/button`; `parity props` shows it.                                                                                                                                                         |
| Why each export counts or doesn't                                  | ✅     | A component's tooltip says what it was recognised as, such as "made with forwardRef". Searching for an export the type checker left out shows it under Not listed with the reason, such as "a context, which passes a value down rather than drawing anything", and `parity components` lists them for agents.                                                                                                  |
| Correcting what detection got wrong                                | ✅     | Right-click one of the project's components for Not a component, or search for an export and List it. The main `.par` keeps each correction under `detection` once saved, and holds nothing there while detection is right. Undo takes a correction back, and the list follows straight away. `parity components` lists the corrections for agents, saved or not.                                               |
| Whether each component draws                                       | ✅     | Known once a component is on the canvas. One that fails in any frame shows a warning in the Components panel, and its tooltip says why: it needs a provider, which a decorator can add; it imports code that only runs on a server; it's an async server component; or the error it threw. `parity components` lists the failing ones for agents, with why.                                                     |
| Two components with one name                                       | ✅     | The second gains its folder, as in `components/FieldError`.                                                                                                                                                                                                                                                                                                                                                     |
| Memory                                                             | ✅     | One TypeScript program per open project serves the checker and props, let go when its tab closes and five minutes after the checker last ran: the next change builds it again, about a second more on the example. On copacker: 1.26 GB, props in 9 s and the check 2 s after. With under 1 GB free, or past half the computer's memory, the components stay as the parse found them, and the reason is logged. |
| Reopening an unchanged project                                     | ✅     | What the checker and props found is saved in `~/.parity/cache/detection`, under a fingerprint of the files they read, the tsconfigs, the lockfile and Parity's own checker. Reopening with the same fingerprint uses it and runs no checker.                                                                                                                                                                    |
| Files added, changed, renamed or deleted while open                | ✅     | Read again a moment after the last change, without reopening: the list and props update, and the type checker then settles the changed files and the files that import them. A component moved to another file keeps its id while its name is unique, so designs still draw it.                                                                                                                                 |
| Grouping in the Components panel                                   | ✅     | The UI kit under its files, the rest of the app under its folders, and pages under their routes, each a section. On copacker: 206 in the UI kit under 36 files, 346 under 15 folders, and 39 pages under 36 routes.                                                                                                                                                                                             |
| Pages                                                              | ◐      | Told by the router's file names until the routes lens names them: Next.js's `page`, `layout`, `error`, `not-found` and the like under `app/`, and files in a `pages` or `routes` folder (React Router, Remix, TanStack Router, Next's pages router).                                                                                                                                                            |
| Workspace packages                                                 | ✅     | Each package the app depends on that exports components is its own section, imported by its package name and read from its source, even when its package.json points at `dist`. A package of hooks and helpers adds none. On Buildkit's site app: `shadcn-modals-manager`.                                                                                                                                      |

### Component libraries

| Library                                             | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Any package with a `.lib.par`                       | ✅     | Describes itself (components, icons, decorators, stylesheet, breakpoints, DTCG tokens) with no change to Parity.                                                                                                                                                                                                                                                                                                                                                                                                               |
| Any React package, with `parity lib`                | ✅     | Writes its `.lib.par`: components by type, tokens, decorators for the libraries Parity knows, and each part's parents and samples, tried with React's server renderer. Regenerating reports new, changed and removed components.                                                                                                                                                                                                                                                                                               |
| Parts placed inside their parents                   | ✅     | Inserting `AccordionTrigger` brings its Accordion and AccordionItem. In the app, these render inside their parents: Radix 118 of 118, Base UI 164 of 174 (the rest are Toasts, which need a toast manager), Mantine 117 of 119, Chakra 437 of 477, MUI 10 of 11 placed, Fluent 3 of 3, each Buildkit style 145 of 146. React Aria isn't measured in the app yet.                                                                                                                                                               |
| Hand edits to a library file                        | ✅     | Kept in the file's `edits` or a shared file, merged over what's generated, and kept when it's regenerated.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Parts learned from a library's own examples         | ✅     | `parity lib` reads the stories, demos and examples in the library's repository at the installed version's commit: whole parent paths with optional levels, samples with the values, elements and render functions the file declares, and the package's own source for parts no example shows. Rendering on the server, inside their parents: Radix 116 of 116, Base UI 171 of 174, Mantine 112 of 116, Chakra 433 of 473, React Aria 47 of 57, MUI 11 of 14, Fluent 3 of 6, each Buildkit style 146 of 146 with no hand edits. |
| Parent chains checked against the docs' anatomy     | ◐      | Base UI, Chakra and shadcn: of the parts their docs' Anatomy or Usage blocks nest, placed as shown: Base UI 174 of 196, Chakra 295 of 328, each Buildkit style 160 of 170. Radix's and Mantine's docs aren't in their repositories.                                                                                                                                                                                                                                                                                            |
| Internal parts                                      | ✅     | Parts a library renders inside its own components and nothing places (a kit's Overlay and Portal, ChartStyle) are listed under Internal parts at the end of the library, with the props their owner passes.                                                                                                                                                                                                                                                                                                                    |
| A library newer than its file                       | ◐      | Uses the newest older file, leaves out what's gone and lists new components by name, with a note to update the file.                                                                                                                                                                                                                                                                                                                                                                                                           |
| A library's own repo, with a `.lib.par` at its root | ✅     | Its designs open on the canvas, and saving writes them into the `.lib.par`'s `canvas`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Buildkit shadcn styles (Base UI)                    | ✅     | All eight (luma, lyra, maia, mira, nova, rhea, sera, vega) in the registry, sharing one set of hand edits, with the tooltip provider and toaster. The Radix styles aren't published.                                                                                                                                                                                                                                                                                                                                           |
| shadcn components copied into the project           | ✅     | Found as the project's own components.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Radix, Base UI, React Aria (unstyled)               | ✅     | In the registry with their providers; styles come from the project's CSS.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| MUI, Chakra, Mantine                                | ✅     | In the registry, styled in frames, with each library's dark theme as a mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
<<<<<<< HEAD
| Fluent UI React v9 (`@fluentui/react-components`)   | ✅     | In the registry: Griffel renders into each frame, and Fluent's five themes are modes.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Recharts                                            | ✅     | In the registry: its charts, axes, series and grids, found when a project depends on `recharts`, as shadcn's charts need, and in the catalog to add. Bar, line and area charts insert with sample data and draw whole, not mid-animation. In a ChartContainer they take its size; alone, the frame's width and 240px. Recharts 3 only.                                                                                                                                                                                         |
=======
| Fluent UI React v9 (`@fluentui/react-components`)   | ✅     | In the registry: Griffel renders into each frame, and Fluent's five themes are modes. Slots that take content (`icon`, `contentBefore`, `header`) are listed with the component's props and set as `children` is, as text or layers in their slot; ones that take only props (`input`) as objects.                                                                                                                                                                                                                             |
>>>>>>> 59aa982 (feat(code): show Fluent slot props the way children shows (PAR-127))
| Installing a library not in the catalog             | ◐      | The catalog is the registry. Other packages work once they ship a `.lib.par` or one is written with `parity lib`.                                                                                                                                                                                                                                                                                                                                                                                                              |

### Icons and images

| Source                                 | Status | Notes                                                                                                                                                                                                                              |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lucide (`lucide-react`)                | ✅     | Names come from the project's own copy. Inserts each icon's current name (TriangleAlert, not AlertTriangle). Searched by tags from lucide-static, and by its older names.                                                          |
| Hugeicons                              | ✅     | Icons are data, drawn by `HugeiconsIcon`. Searched by name and the synonyms it exports (Gear, Cog): its tags are only on its web API, with no version.                                                                             |
| Fluent icons (`@fluentui/react-icons`) | ✅     | Regular, Filled, Color and Light as styles; sized copies left out of the panel, but numbered icons (Battery10) and ones only shipped at fixed sizes listed. Searched by the metaphors in its repository, for 2,631 of 2,992 icons. |
| Phosphor, Tabler                       | ✅     | Phosphor's weights and Tabler's Filled icons as styles; Phosphor's current names inserted (GearIcon, shown as Gear). Searched by tags and categories from @phosphor-icons/core and @tabler/icons.                                  |
| Heroicons                              | ✅     | 24 Outline, 24 Solid, 20 Solid and 16 Solid as styles, each from its own module. Searched by name only: its keywords are only on its website, with no version.                                                                     |
| Searching icons                        | ✅     | Words in any order, by name, every alias and the set's tags, ranked, with small typos forgiven. Agents search the same way with `Icons(set, { search })`.                                                                          |
| Pexels                                 | ⏳     | Removed for now: Pexels isn't taking new customers. The Images tab says it's coming soon.                                                                                                                                          |
| Unsplash                               | 🔜     | The first stock source, through a service of Parity's that holds the key.                                                                                                                                                          |
| Pasted or imported images              | ✅     | PNG, JPEG, GIF, WebP and SVG up to 20 MB, saved to `public/images/`.                                                                                                                                                               |

### Package managers and repos

| Tool                     | Status | Notes                                                                                                                                                                                                                                                                    |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm, npm, yarn, bun     | ✅     | Found by `package-manager-detector`: lockfiles, then the `packageManager` and `devEngines.packageManager` fields, from the project's folder up; npm when nothing says. Yarn Berry is told from Yarn classic by `packageManager`. Library installs use its command table. |
| Monorepos and workspaces | ✅     | The workspace is found from `pnpm-workspace.yaml` or package.json `workspaces` (npm, Yarn, bun), with `!` exclusions. Packages are found the way Node finds them, and Vite's workspace root is used.                                                                     |

### Storybook

| Version                 | Status | Notes                                                                   |
| ----------------------- | ------ | ----------------------------------------------------------------------- |
| Storybook 10            | ✅     | Detected, mapped to components, opened in your browser.                 |
| Storybook 9             | ❔     | Same `index.json`; untested. Drops in May 2027.                         |
| Storybook 8 and earlier | ❌     | Dropped: Storybook 8 came out in March 2024. Untested, but not blocked. |
| Ladle, Histoire         | ❌     | Not planned.                                                            |

### Language

| Language   | Status | Notes                                                                                   |
| ---------- | ------ | --------------------------------------------------------------------------------------- |
| TypeScript | ✅     | Read with Parity's own TypeScript 6; aliases from `tsconfig`.                           |
| JavaScript | ◐      | Renders; no inferred props. Aliases from `jsconfig.json`; `@/` means `src/` by default. |

### Tests and coverage

| Tool                                | Status | Notes                                                     |
| ----------------------------------- | ------ | --------------------------------------------------------- |
| Any runner writing JUnit XML        | ⏳     | After the core: Vitest, Jest and Playwright all write it. |
| Istanbul or LCOV coverage           | ⏳     | After the core.                                           |
| Vitest, Playwright, Storybook tests | ⏳     | After the core: running them from Parity.                 |

### Routes, data, API and the rest

Nothing here is built. **The priority is yours: databases, the API, routes and mock data, then telemetry.** The rest
follow, and tests, coverage, the gaps report and performance come after the core, by your decision. Detail is in
`proposals/web-and-backend.md`, `proposals/app-lenses.md` and `proposals/extensions.md`.

| Layer           | Standard (first)                                 | Adapters (after)                           | Status |
| --------------- | ------------------------------------------------ | ------------------------------------------ | ------ |
| Data            | SQL: the database catalog and migration files    | Drizzle, then Prisma                       | 🔜     |
| API             | OpenAPI 3.1 and 3.2, JSON Schema                 | Hono, oRPC, server functions               | 🔜     |
| Routes          | Parity's route model, paths as URL patterns      | TanStack Router, React Router, Next.js     | 🔜     |
| Mocks and seeds | OpenAPI and JSON Schema through MSW; SQL inserts | drizzle-seed                               | 🔜     |
| Telemetry       | OpenTelemetry over OTLP: traces, errors, timings | Each monitoring service's query API        | 🔜     |
| Links           | Drawn by hand on the canvas                      | The TypeScript compiler, following calls   | 🔜     |
| Performance     | Core Web Vitals                                  | Bundle size per route from Vite's manifest | ⏳     |
| Flags           | OpenFeature                                      | Each service's provider package            | ⏳     |
| Sign-in, roles  | OpenID Connect, OAuth 2.0                        | Better Auth access control, Clerk, WorkOS  | ⏳     |
| Languages       | ICU messages                                     |                                            | ⏳     |
| Deploy          | Better Apps' capability manifest                 | Cloudflare first, through Better Apps      | ⏳     |

A backend in any language works with the lenses that read standards: OpenAPI, SQL and OpenTelemetry don't care what
wrote them.

## What each feature leans on

In each column, ● means the feature needs it, and ◐ means the feature is better with it.

| Feature                         | TypeScript | React | Vite | Tailwind v4 | CSS variables | Other                                      |
| ------------------------------- | ---------- | ----- | ---- | ----------- | ------------- | ------------------------------------------ |
| Render designs                  |            | ●     | ●    |             | ◐             | A global stylesheet Parity can find        |
| Insert the project's components |            | ●     |      |             |               | Exported from a file the tsconfig includes |
| Props panel                     | ●          | ●     |      |             |               | cva for variants                           |
| Tokens panel and editing        |            |       |      | ◐           | ●             |                                            |
| Modes: themes                   |            |       |      |             | ●             | A theme class such as `.dark`              |
| Modes: breakpoints              |            |       |      | ◐           | ●             | Width-only media queries                   |
| Spacing and type controls       |            |       |      | ●           | ●             | `--spacing` and the type scale             |
| Library components              |            | ●     |      |             |               | A `.lib.par` or a catalog entry            |
| Icons                           |            | ●     |      |             |               | `lucide-react`                             |
| Pasted images                   |            |       |      |             |               | The project's `public` folder              |
| Storybook links                 |            |       |      |             |               | Storybook 9 or later with CSF `component`  |
| Accessibility and tab order     |            | ●     | ●    |             |               | Whatever renders the frame                 |
| Export PNG and SVG              |            | ●     | ●    |             |               |                                            |
| Agent API                       |            | ●     | ●    | ◐           |               | Spacing values assume `--spacing`          |

## Gaps to fix

Not requirements, just work not done yet:

- Themes set by attribute (`[data-theme="dark"]`) and `prefers-color-scheme` blocks aren't read as themes.
- Per-component styles (CSS modules, CSS-in-JS) don't reach frames.
- Library installs are limited to the built-in catalog.

## Decided

You agreed to the four tiers as recommended on 2026-10-28. The choices inside them:

- **TypeScript expected, not required.** JavaScript projects keep rendering, and no JavaScript-only fallbacks get built.
- **React and Vite only, until a second adapter is asked for.** Next.js is the likely second builder; Vue and Svelte the
  likely next renderers.
- **No test runner required.** When tests come in, after the core, results come from JUnit XML and coverage from LCOV,
  whatever wrote them.
- **Tokens must compile to CSS custom properties.** Any source format is fine.
- **A two-year version cutoff,** in your words: "Things older than 2 years should just be dropped." You chose to count
  from each version's own release: "drop anything released more than two years ago, even React 18." You kept one
  exception: "a tool's newest major version is never dropped." See Version cutoff.
- **Fluent UI v9 and Fluent icons will be supported,** for corporate customers. In your words: "These will be great for
  onboarding some corporate customers." See Fluent UI and Fluent icons.

## Fluent UI and Fluent icons

You want Microsoft's Fluent UI React v9 and its icons supported, to bring on corporate customers. Fluent v9 came out in
2022, but it's still Fluent's newest major, so the version cutoff keeps it. What it takes:

| Piece              | What Fluent does                                                                                                                                             | Plan                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Styles             | Fluent styles components with Griffel, a CSS-in-JS engine that writes styles into the page at run time, so today they don't reach the frames.                | Griffel's renderer can write into a target other than the page, and its docs say that works for shadow DOM, so each frame gets its own. Projects that use Griffel's build-time CSS extraction get plain stylesheets instead. |
| Themes and tokens  | Themes are JavaScript objects (`webLightTheme`, `webDarkTheme`, the Teams themes) that `FluentProvider` turns into CSS custom properties in the page's head. | Parity writes each theme's variables into the frame with Fluent's `createCSSRuleFromTheme`, lists them in the Tokens panel, and offers each theme as a mode.                                                                 |
| Provider           | Every Fluent component expects a `FluentProvider` above it.                                                                                                  | Each frame wraps the design in one, the way a component design's context works.                                                                                                                                              |
| The component list | `@fluentui/react-components` also exports hooks, style functions and helpers.                                                                                | A library manifest for Fluent, kept in Parity's registry because Fluent doesn't ship one: which exports are components, the provider, and the themes.                                                                        |
| Props              | Many props are slots, which take content or an object for one part of a component.                                                                           | Done (PAR-127): the type checker reads them as slots, and those that take content show the way `children` does, as text or layers in their slot.                                                                             |
| Icons              | `@fluentui/react-icons` exports each icon as a component, in Regular and Filled styles, some with a size in the name (`Add24Regular`).                       | Lucide's shape, so the icons manifest covers it, naming the styles and sizes so the picker groups them.                                                                                                                      |

The `fluent` validation project below checks all of it.

## Version cutoff

**Anything released more than two years ago is dropped.** Each major version counts from its own first stable release
(x.0). Dropped means not tested: no fixes and no validation project. It doesn't mean blocked. In your words: "By drop
support, I didn't mean prevent others from using those versions, just that we don't actively test and support them." A
project on a dropped version opens and works as far as it can. Parity reads the installed versions of React, Vite,
Tailwind CSS and Storybook, and notes an untested one quietly, in the status bar's tooltips and the agent API.

- **A tool's newest major is never dropped,** however old it is, as you confirmed. Otherwise React 19 would drop in
  December 2026 with nothing to replace it, and Fluent UI v9, from 2022, would already be gone.
- **It covers every tool Parity runs, renders or reads,** including ones it doesn't support yet: UI frameworks, build
  tools, styling, component and icon libraries, Storybook, test runners, routers, ORMs and API frameworks. Package
  managers follow what the detector below supports.
- **A 0.x line counts as one version, dated by its last 0.x release,** since every 0.x release can break. lucide-react's
  0.x line ended in March 2026, so it stays supported until March 2028.
- **A version with less than six months left gets no new work.** It's kept working as it is, but nothing is built or
  tested only for it. Vite 6, React Router 7, Prisma 6, Astro 5, Vitest 3 and MUI 7 are in that window now.
- **Each tool is tested at its newest major, and at its oldest major with more than six months left,** in the validation
  projects below. Today that's React 19, Vite 8 and 7, Tailwind v4, Storybook 10 and 9, and Next.js 16.

What it means in October 2026, for every tool on this page, supported or not, so an adapter starts from the right
versions. Dates are each major's first stable release on npm. The Parity column is today's status.

### UI frameworks

| Tool   | Parity | Supported | Drops next                | Dropped                        |
| ------ | ------ | --------- | ------------------------- | ------------------------------ |
| React  | ✅     | 19        | Nothing; 19 is the newest | 18 (March 2022) and earlier    |
| Vue    | ⏳     | 3         | Nothing; 3 is the newest  | 2 (September 2016) and earlier |
| Svelte | ⏳     | 5         | Nothing; 5 is the newest  | 4 (June 2023) and earlier      |
| Solid  | ⏳     | 1         | Nothing; 1 is the newest  | 0.x (April 2021)               |
| Preact | ⏳     | 11        | Nothing; 11 is the newest | 10 (October 2019) and earlier  |

### Build tools

| Tool    | Parity | Supported | Drops next                            | Dropped                       |
| ------- | ------ | --------- | ------------------------------------- | ----------------------------- |
| Vite    | ✅     | 8, 7, 6   | 6, in November 2026; 7, in June 2027  | 5 (November 2023) and earlier |
| Next.js | ⏳     | 16        | Nothing; 16 is the newest             | 15 (October 2024) and earlier |
| webpack | ⏳     | 5         | Nothing; 5 is the newest              | 4 (February 2018) and earlier |
| Rspack  | ⏳     | 2         | Nothing; 2 is the newest              | 1 (August 2024) and earlier   |
| Astro   | ❌     | 7, 6, 5   | 5, in December 2026; 6, in March 2028 | 4 (December 2023) and earlier |

### Styling

| Tool              | Parity | Supported | Drops next                | Dropped                       |
| ----------------- | ------ | --------- | ------------------------- | ----------------------------- |
| Tailwind CSS      | ✅     | 4         | Nothing; 4 is the newest  | 3 (December 2021) and earlier |
| Emotion           | ✅     | 11        | Nothing; 11 is the newest | Nothing                       |
| styled-components | ❔     | 6         | Nothing; 6 is the newest  | 5 (January 2020) and earlier  |
| Griffel (Fluent)  | ✅     | 1         | Nothing; 1 is the newest  | Nothing                       |

### Component libraries

| Tool                    | Parity | Supported | Drops next                 | Dropped                        |
| ----------------------- | ------ | --------- | -------------------------- | ------------------------------ |
| Buildkit Base UI styles | ✅     | 0.x       | Nothing; 0.x is the newest | Nothing                        |
| Radix                   | ✅     | 1         | Nothing; 1 is the newest   | 0.x (August 2022)              |
| Base UI                 | ✅     | 1         | Nothing; 1 is the newest   | Nothing                        |
| React Aria Components   | ✅     | 1         | Nothing; 1 is the newest   | 0.x (June 2018)                |
| MUI                     | ◐      | 9, 7      | 7, in March 2027           | 6 (August 2024) and earlier    |
| Chakra UI               | ✅     | 3         | Nothing; 3 is the newest   | 2 (May 2022) and earlier       |
| Mantine                 | ◐      | 9, 8      | 8, in May 2027             | 7 (September 2023) and earlier |
| Fluent UI               | ✅     | 9         | Nothing; 9 is the newest   | 0.x (June 2022)                |

### Icons

| Tool         | Parity | Supported | Drops next               | Dropped                       |
| ------------ | ------ | --------- | ------------------------ | ----------------------------- |
| Lucide       | ✅     | 1, 0.x    | 0.x, in March 2028       | Nothing                       |
| Hugeicons    | ✅     | 1         | Nothing; 1 is the newest | 0.x (July 2024)               |
| Fluent icons | ✅     | 2         | Nothing; 2 is the newest | 1 (February 2021) and earlier |
| Heroicons    | ✅     | 2         | Nothing; 2 is the newest | 1 (March 2021) and earlier    |
| Phosphor     | ✅     | 2         | Nothing; 2 is the newest | Nothing                       |
| Tabler       | ✅     | 3         | Nothing; 3 is the newest | 2 (January 2023)              |

### Docs, tests and language

| Tool       | Parity | Supported | Drops next                             | Dropped                      |
| ---------- | ------ | --------- | -------------------------------------- | ---------------------------- |
| Storybook  | ✅     | 10, 9     | 9, in May 2027                         | 8 (March 2024) and earlier   |
| TypeScript | ✅     | 7, 6      | 6, in March 2028                       | 5 (March 2023) and earlier   |
| Vitest     | ⏳     | 5, 4, 3   | 3, in January 2027; 4, in October 2027 | 2 (July 2024) and earlier    |
| Jest       | ⏳     | 30        | Nothing; 30 is the newest              | 29 (August 2022) and earlier |
| Playwright | ⏳     | 1         | Nothing; 1 is the newest               | 0.x (May 2021)               |

### Routes, data and API

| Tool            | Parity | Supported | Drops next                 | Dropped                       |
| --------------- | ------ | --------- | -------------------------- | ----------------------------- |
| TanStack Router | 🔜     | 1         | Nothing; 1 is the newest   | Nothing                       |
| TanStack Start  | 🔜     | 1         | Nothing; 1 is the newest   | Nothing                       |
| React Router    | 🔜     | 8, 7      | 7, in November 2026        | 6 (November 2021) and earlier |
| Drizzle         | 🔜     | 0.x       | Nothing; 0.x is the newest | Nothing                       |
| Prisma          | 🔜     | 7, 6      | 6, in November 2026        | 5 (July 2023) and earlier     |
| Hono            | 🔜     | 4         | Nothing; 4 is the newest   | 3 (February 2023) and earlier |
| oRPC            | 🔜     | 1, 0.x    | 0.x, in April 2027         | Nothing                       |
| MSW             | 🔜     | 3         | Nothing; 3 is the newest   | 2 (October 2023) and earlier  |

## Detecting projects reliably

Detection was mostly hard-coded file names and the nearest lockfile, which is how `vite.config.cjs` and `.cts` were
missed. The package manager, the build tool's config, the other configs and installed versions now follow the plan
below; the other rows still do it the old way. The plan:

1. **Ask the tool itself first.** The project's own Vite, TypeScript and Tailwind know their own rules, including names
   and extensions Parity would miss. Parity already reads Tailwind's theme this way.
2. **Otherwise use a maintained loader, not a list of file names.** The libraries below are what other tools rely on for
   the same job.
3. **Show the evidence.** Each detection records what it found and where, such as "Vite 8.3.5 from `node_modules/vite`,
   config `vite.config.cts`". The status bar's tooltips and the agent API's `state` (`detection`) show it, and a failed
   detection lists what it looked for.
4. **Every variant a detector claims has a validation project** (see below).

| What                                                 | Today                                                                                                                                                                                                                      | Plan                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package manager                                      | Done: `package-manager-detector`, with the file it was found in.                                                                                                                                                           | `package-manager-detector`: lockfiles, then the `packageManager` and `devEngines.packageManager` fields in `package.json`, folder by folder up to the root. It tells Yarn classic from Yarn Berry, and knows bun and deno. Its command table builds the right install command. |
| Workspace root and packages                          | Done: `findWorkspace` in `@parity-app/project` reads `pnpm-workspace.yaml`, or `workspaces` in `package.json` for npm, Yarn and bun in either form, with `!` exclusions: the root above the app and every package by name. | The same, so `@manypkg/get-packages` isn't needed. Rush's `rush.json` isn't read.                                                                                                                                                                                              |
| Build tool config                                    | Done: the project's own Vite finds and loads it, or the one the dev script names with `--config`.                                                                                                                          | The project's own Vite: `loadConfigFromFile` looks for `vite.config` with `.js`, `.mjs`, `.ts`, `.cjs`, `.mts` and `.cts`, and loads it the way `vite` does. Next.js, when it comes, through its own config loader.                                                            |
| Other configs: Storybook's `main`, `components.json` | Done: `unconfig`, with Storybook's folder from its script's `-c`. It reads rc files too, so `lilconfig` isn't needed.                                                                                                      | `unconfig`: one name searched across every extension and folder, with TypeScript, ESM and CommonJS configs loaded, and keys in `package.json` and plain rc files read too.                                                                                                     |
| TypeScript settings                                  | `paths` from `tsconfig.json` or `jsconfig.json`.                                                                                                                                                                           | TypeScript's own config parser, from the TypeScript 6 Parity already ships: `extends` chains, project references and every `paths` entry.                                                                                                                                      |
| Installed versions                                   | Done for React, Vite, Tailwind CSS and Storybook, with the cutoff.                                                                                                                                                         | The installed package's own `package.json`, found the way Node finds it, as libraries already are, and compared with `semver` against the version cutoff.                                                                                                                      |
| Module resolution                                    | `tsconfig` aliases, read by hand.                                                                                                                                                                                          | `oxc-resolver`: Node's algorithm with `exports` conditions, `tsconfig` paths and aliases. It's from the same project as the oxlint and oxfmt this repo uses.                                                                                                                   |

## Validation projects

Real projects, one per combination worth testing, that every change is checked against. Together they cover every value
of every axis at least once. The more of each project that's tested end to end, the better.

### The projects

| Project                | Stack                                                                                                                       | Mainly tests                                                                    | Today |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- |
| `shadcn-vite` (exists) | React 19, Vite 8, Tailwind v4, Shadcn Nova, TypeScript, pnpm, Storybook 10, Lucide, `vite.config.ts`                        | The main path: everything that works today                                      | ✅    |
| `scaffolder`           | The Buildkit scaffolder's output: TanStack Router, Hono on Workers, Drizzle on D1, nova, Tailwind v4, pnpm workspace        | Monorepo detection, routes, data and API lenses, mock data                      | 🔜    |
| `vite7-js` (exists)    | React 19, Vite 7, JavaScript (`.jsx`), npm, plain CSS variables with `[data-theme]` themes, `vite.config.cjs`, no Storybook | The oldest Vite tested, JavaScript, CommonJS config, attribute themes, no icons | ❔    |
| `react-aria` (exists)  | React 19, Vite 7, React Aria Components with Tailwind v4, Yarn Berry, Storybook 9, Hugeicons, `vite.config.mts`             | Another component library, Yarn Berry, a second icon set                        | ❔    |
| `mantine` (exists)     | React 19, Vite 8, Mantine 9, CSS modules, bun, `vite.config.cts`, `prefers-color-scheme` themes                             | Per-component CSS, CSS modules, bun                                             | ❔    |
| `mui`                  | React 19, Vite 8, MUI 9 on Emotion, npm, Storybook 10                                                                       | CSS-in-JS, styled in frames by MUI's decorator                                  | ❔    |
| `fluent`               | React 19, Vite 8, Fluent UI v9 with Griffel, Fluent icons, TypeScript, npm, Storybook 10                                    | Styles written at run time, themes from a provider as modes, a third icon set   | 🔜    |
| `react-router`         | React Router 8 in framework mode, loaders and actions, shadcn on Radix, Tailwind v4, pnpm                                   | The routes lens and server functions                                            | 🔜    |
| `tanstack-start`       | TanStack Start, server functions, oRPC, Drizzle on Postgres, pnpm                                                           | The API lens from oRPC, a server database                                       | 🔜    |
| `standards-only`       | A React 19 and Vite 8 front end, with `openapi.yaml` and SQL migrations from a backend in another language                  | The standards pass: lenses with no adapter                                      | 🔜    |
| `next`                 | Next.js 16, App Router, shadcn, Tailwind v4, npm                                                                            | Clear "not supported yet"; later the Next.js builder                            | ❌    |
| `too-old` (exists)     | React 18, Vite 5, Tailwind v3, Storybook 8, npm                                                                             | Untested versions open as far as they can, with a quiet note; nothing written   | ❌    |

`react-aria` runs on Vite 7, not 8 as first planned: Storybook 9 accepts Vite 5 to 7 only, so a Storybook 9 project on
Vite 8 can't be installed cleanly. Its Yarn Berry uses the `node-modules` linker; Plug'n'Play, Yarn's default, has no
project yet. By the version cutoff, Mantine 8 should be tested too, since it drops in May 2027; no project covers it
yet.

What the detection snapshots record on 2026-10-29, gaps included:

- **`vite7-js`:** Vite 7.3.7 with `vite.config.cjs`, npm, and six components, `App` and the default exports `Avatar` and
  `Badge` among them. The `[data-theme="dark"]` values are dropped, so there's one theme.
- **`react-aria`:** Vite 7.3.7 with `vite.config.mts`, Yarn Berry, Tailwind 4.3.3's theme with the `.dark` theme and six
  breakpoints, four components with `App`, and Storybook 9 stories for two of them. React Aria Components is listed as a
  library, and Hugeicons as an icon set.
- **`mantine`:** Vite 8.3.5 with `vite.config.cts` and bun. Mantine is listed as a library, and its stylesheet, imported
  from `main.tsx`, is read from the package. The `prefers-color-scheme` block still overwrites the light values, so the
  dark ones become the defaults.
- **`too-old`:** the project opens, with one quiet notice that React 18, Vite 5, Tailwind 3 and Storybook 8 are
  untested. The Tailwind v3 theme doesn't load: Tailwind v4's reader stops at the project's first v3 `@apply`.
- **`chakra`:** Chakra UI is listed as a library with its five breakpoints, and Phosphor and Tabler as icon sets.
- **`headless`:** Base UI and Radix are listed as libraries, Heroicons and Lucide as icon sets, and the `.dark` theme is
  read.
- **`mui` and `fluent`:** MUI and Fluent UI are listed as libraries, Fluent's icons as an icon set, and MUI's four
  breakpoints are read. Neither has tokens yet, since both keep their themes in JavaScript objects.
- **`buildkit`:** the eight Buildkit styles are listed as libraries, with only `luma`'s stylesheet imported, and Lucide
  as an icon set. Tailwind's theme gives 513 tokens, the `.dark` theme and five breakpoints.

Every axis, and where it's covered:

| Axis            | Values                                                                                   | Covered by                                                              |
| --------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| React           | 19, 18 (dropped)                                                                         | Most; `too-old`                                                         |
| Build tool      | Vite 8, 7, 5 (dropped); Next.js 16                                                       | Most; `vite7-js`, `react-aria`; `too-old`; `next`                       |
| Vite config     | `.ts`, `.mts`, `.cjs`, `.cts`                                                            | `shadcn-vite`; `react-aria`; `vite7-js`; `mantine`                      |
| Router          | None, TanStack Router, React Router 8, TanStack Start, Next.js                           | `shadcn-vite`; `scaffolder`; `react-router`; `tanstack-start`; `next`   |
| Components      | shadcn on Base UI and Radix, React Aria, Mantine, MUI, Fluent UI v9                      | `shadcn-vite`, `react-router`; `react-aria`; `mantine`; `mui`; `fluent` |
| Styling         | Tailwind v4, plain CSS, CSS modules, CSS-in-JS (Emotion, Griffel), Tailwind v3 (dropped) | Most; `vite7-js`; `mantine`; `mui`, `fluent`; `too-old`                 |
| Themes          | `.dark` class, `[data-theme]`, `prefers-color-scheme`, theme objects through a provider  | `shadcn-vite`; `vite7-js`; `mantine`; `fluent`                          |
| Icons           | Lucide, Hugeicons, Fluent icons, none                                                    | `shadcn-vite`; `react-aria`; `fluent`; `vite7-js`                       |
| Language        | TypeScript, JavaScript                                                                   | Most; `vite7-js`                                                        |
| Package manager | pnpm, npm, Yarn Berry, bun                                                               | `shadcn-vite`; `vite7-js`; `react-aria`; `mantine`                      |
| Repo            | One package, a workspace monorepo                                                        | Most; `scaffolder`                                                      |
| Storybook       | 10, 9, 8 (dropped), none                                                                 | `shadcn-vite`, `mui`; `react-aria`; `too-old`; `vite7-js`               |
| Backend         | Hono with Drizzle on D1, React Router loaders, oRPC with Postgres, standards only        | `scaffolder`; `react-router`; `tanstack-start`; `standards-only`        |

### What runs against each project

The same checks run on every project, from fastest to slowest:

1. **Detection snapshot.** Parity's detection runs on its own, with no window, and its result is compared with the
   project's committed `expected.json`: build tool and version, config file, styles, tokens, themes, breakpoints,
   components, libraries, icons, package manager, Storybook, and the lenses' sources. It runs in `vp run test`, from
   `packages/fixtures/src/detection.test.ts`. Tokens come from the stylesheets' sources there, where the app reads the
   CSS Vite compiles from them.
2. **Render sweep.** Every component with its default props, and every design in every state and mode, is drawn as a
   page of its own on the project's dev server, isolated as a browser tab is. Any render error fails it, and screenshots
   are compared with the project's baseline. Each canvas frame's layout is then checked against its page's.
3. **Editor flows,** driven through the app as `scripts/drive.ts` does now:
   - insert a component, edit a prop, change a token, switch theme and breakpoint;
   - copy and paste, drag to reorder, undo and redo;
   - save, reopen, and check the `.par` round trip;
   - paste an image, export PNG and SVG, run the accessibility check, try the design in Interact mode;
   - open a component in Storybook, and add a library in a copy of the project.
4. **Lens checks,** for projects with a backend: tables, operations and routes match the expected models, and mock data
   is served.
5. **Unsupported and untested projects** (`next`, `too-old`): `next` gets the expected "not supported yet" message, and
   `too-old` opens and works as far as it can, with a quiet note that its versions are untested. Neither crashes, and
   nothing is written to either project.

### How they're kept

- **Generated, then committed.** A script creates each project with the tools' own scaffolders at pinned versions, such
  as `create-vite`, `create-next-app`, `shadcn` and the Buildkit scaffolder. The projects are committed with their
  lockfiles and installed with their own package manager, and the script regenerates them when versions move. The script
  is `packages/fixtures/src/generate.ts`, and each project's own files are laid over the scaffold from
  `packages/fixtures/overlays`. `pnpm --filter @parity-app/fixtures generate [name]` regenerates a project, keeping its
  `expected.json`, and `pnpm --filter @parity-app/fixtures install-projects` installs all of them from their lockfiles,
  one at a time. Storybook's own init runs as it would in CI, so it leaves out its Vitest addon.
- **Never changed by a test.** Each run copies the project to a temporary folder first, so saves and installs don't
  touch the original. The copy links the project's installed packages rather than copying them.
- **Snapshots change on purpose.** When detection gets better, `pnpm vitest run packages/fixtures -u` rewrites the
  `expected.json` files, and the diff shows what changed. They're taken as of a fixed date, so the version cutoff
  doesn't change them by itself.
- **Run on every change, and on every system.** Detection and the render sweep run on each change. The editor flows run
  nightly and before releases, on Windows, macOS and Linux.
- **They set the statuses on this page.** ✅ means a validation project covers it and passes. ❔ means no project does
  yet.
