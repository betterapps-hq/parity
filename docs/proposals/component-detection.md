# Proposal: finding components

Status: decided on 2026-10-28, with the recommended answer to each question below. The parse, the type checker's pass,
ids and default exports landed on 2026-10-29; workspace packages, the memory budget, the cache, keeping the list in step
and grouping are still to do (backlog FIND-4 to FIND-16).

## In one line

Parity finds the components in an app, and in the packages it uses, by asking TypeScript what each export is, after a
quick parse that fills the Components panel first. This page spells out what that asks of a project, what Parity
promises in return, and the calls still to make.

## Why change it

Today Parity matches exported names that start with a capital letter, with a text pattern, in one folder
(`src/components/ui` or wherever `components.json` points). Measured on copacker (914 files) and Parity's example:

| Method                                          | Components | Wrongly counted | Missed | Time |
| ----------------------------------------------- | ---------- | --------------- | ------ | ---- |
| Today's text pattern, over the whole app        | 765        | 172             | 0      | ~0s  |
| Parsing each file (as Storybook's react-docgen) | 582        | 0               | 11     | 0.3s |
| TypeScript's type checker                       | 593        | 0               | 0      | ~8s  |

- **The pattern counts anything with a capital letter:** 144 TanStack Router `Route` objects, 12 API handlers (`GET`,
  `POST`) and 16 classes, mostly errors. Reading only one folder hides that, but it also hides 387 of copacker's 593
  components: everything outside `src/components/ui`, pages included.
- **The parse misses components without JSX in them:** ones that return `children` (`ForAdmins`), and ones assigned from
  a library (`const Select = SelectPrimitive.Root`) or built with Base UI's `useRender` (`Badge`, `Item`).
- **The checker reads what each export is, not how it's written,** so it sees through aliases, wrappers, re-exports and
  default exports. On Parity's example, all three agree on 39 components.

## What a project needs

A component is found when it meets these rules. Ordinary React code does.

1. **It's exported.** Parity can only place what code can import, so a component used only inside its own file isn't
   listed.
2. **Its name starts with a capital letter,** as JSX requires, or it's a file's default export. A default export takes
   its declaration's name, else the file's.
3. **It takes one props object, or nothing.**
4. **It returns something React can render:** an element, a `ReactNode`, text, a number or nothing. Or it's made with
   `forwardRef`, `memo` or `lazy`, or is a class extending `Component`.
5. **Its file is in a tsconfig or jsconfig** Parity can find for its package: `tsconfig.app.json`, else `tsconfig.json`,
   following references. Files outside every config are only parsed.
6. **Dependencies are installed,** React's types included. Without them, types turn into `any`, and Parity falls back to
   the parse for those files.
7. **It isn't a story, a test or a generated file,** and isn't in `node_modules`, a build folder or a dot folder.

Plain JavaScript works, because TypeScript infers types from the JSX in `.jsx` files. What can't be decided is code
typed `any`, such as an untyped wrapper function; it's found only if the parse sees JSX in it.

Parity reads code with its own TypeScript, so a project on a newer TypeScript works, as copacker on TypeScript 7 did.
Syntax newer than Parity's TypeScript would need Parity updated.

## Where Parity looks

- **The app:** every file its tsconfig includes, under the app's folder.
- **Workspace packages the app depends on:** what each package exports (its `exports`, else `types`), read from source
  through the workspace link. Each is its own section, imported by the package's name, as the app imports it.
- **Installed libraries:** those with a `.lib.par` or in Parity's catalog, read from their type declarations, as now.
  Other dependencies, such as Radix or Base UI, aren't listed; their components show up through the project's own
  wrappers.

## What Parity promises

- **First results in under a second.** The parse lists components for a thousand files in about 0.3s. The checker then
  adds what the parse missed and reads props in the same pass, in the background worker that reads props today.
- **A memory budget.** The checker held about 1.8 GB for copacker's 914 files, so:
  - one checker per open project, stopped when its tab closes;
  - only files that can hold components (`.tsx`, `.jsx`) and what they import, not the whole tsconfig;
  - results saved by file contents, outside the project, so reopening doesn't start over;
  - when memory is short, Parity keeps the parse's results and says so.
- **The list stays in step.** Adding, renaming or deleting a file updates it without reopening. An edit rechecks only
  that file and the files that import it.
- **Each component has one id, and it lasts.** Today a project component's id is its export name (`Button`), and a
  second component with the same name is silently dropped. A whole app makes that likely: copacker has two `ErrorPage`s
  and two `FieldError`s. The id stays the bare name while it's unique and gains its folder on a clash (`ui/FieldError`,
  `packing-fields/FieldError`). A component in the UI kit folder keeps the bare name even then, because that folder was
  all Parity read before, so designs keep the id they were made with. A moved file is followed by its export name.
- **The import a developer would write.** A component re-exported from an index file is listed once, at the path the app
  imports it by: the package name for a package, or the alias (`@/components/ui/button`) for the app.
- **It says why.** Each component carries what it was found as ("a function returning JSX", "made with `memo`"). Exports
  left out can be looked up with the reason ("`Route` returns a route object, not something React renders").
- **Corrections only when needed.** If detection gets one wrong, including or excluding it is saved in `.par`, like any
  other choice. Otherwise there's nothing to write.

## Found isn't the same as renders

Detection says a component exists and which props it takes. Drawing it on the canvas can still fail when:

- **it needs a provider,** such as a router, a query client, translations or sign-in. Decorators provide these (see
  [decorators.md](decorators.md));
- **it imports server code.** About 70 of copacker's component and page files reference server functions or the database
  (a rough search). Whether they render depends on the build plugin turning those into client calls;
- **it's an async server component,** which only renders on a server.

So each component gets a render status the first time it's drawn, shown in the Components panel, instead of being
hidden.

## Grouping

Six hundred components is too many for one list, so the panel groups them by role:

- **UI kit:** the folder `components.json` names, and library and workspace packages.
- **The app's components:** everything else under the app, by folder.
- **Pages:** route files and the default exports in route folders. The routes lens will label these properly once it
  exists; until then, they're the files that follow the router's page naming.

## Other frameworks

Finding components belongs to each framework's adapter, behind one contract: a list of components, each with its id,
import path, export name, role, evidence and props.

- **Vue:** `vue-component-meta` takes the same checker approach for props, events and slots.
- **Svelte:** every `.svelte` file is one component, so finding them is trivial. Svelte's language tools give the props.

## Decisions

You took the recommended answer to each of these on 2026-10-28. They're in [decisions.md](../decisions.md).

1. **Ids:** the bare name, with the folder added only on a clash.
2. **Libraries:** only libraries with a `.lib.par` or in the registry, plus workspace packages.
3. **Pages:** a section of their own in the Components panel.
4. **Providers:** decorators that follow Storybook's contract, taken from the project's Storybook when it has one, and
   working without Storybook too. The design is in [decorators.md](decorators.md).
