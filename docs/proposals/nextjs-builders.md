# Proposal: Next.js builders (PAR-1149)

Status: draft for discussion, 2026-11-15. A spike on agency's `apps/legislation-web` (Next.js 16.3.1, Turbopack,
Tailwind v4, vanilla-extract, Sentry, the React Compiler) proved the approach below: its `Button` drew from Turbopack's
output with the app's compiled CSS. Nothing is built yet.

## In one line

A Turbopack builder extension runs the project's own Next.js on a small app of Parity's own, kept inside the project's
`.next` folder, and serves the canvas a guest module from Turbopack's browser output. A webpack builder reuses
everything except the last step.

## Why Next's own compiler

Next.js's config isn't something another bundler can read. Plugins such as `withSentryConfig` and vanilla-extract's wrap
the config in code, `turbopack.rules` adds loaders, `next/font` and `next/image` are compiled by Next's SWC transforms,
and `"use client"`, server-only imports and Next's own copy of React are decided by its bundler. Rebuilding that in Vite
would always trail Next. Running Next itself costs nothing to keep in step: whatever the app's `next dev` compiles, the
canvas compiles.

## How the builder drives Next

1. **The project's own Next.** The builder loads `next` from the project's `node_modules`, the way the Vite builder
   loads Vite, and starts it in the builder process with Next's programmatic server:
   `next({ dev: true, turbopack: true, dir })` behind a small HTTP server on 127.0.0.1.
2. **A guest app of Parity's own.** `dir` isn't the project. Next only compiles routes from an app folder, so the
   builder writes a guest app into `.next/parity/` in the project, rewritten on each start:
   - `next.config.mjs`, which loads the project's own config through Next's own loader, run against the project's folder
     so that paths the config works out from `import.meta.url` are right, then changes only what serving the canvas
     needs: `assetPrefix` and `images.path` point at the builder's server, and `output` is unset.
   - `tsconfig.json`, which extends the project's, so its path aliases resolve; and a PostCSS config that re-exports the
     project's.
   - `app/layout.tsx`, a bare root layout, and `app/page.tsx`, which renders `app/guest.tsx`.
   - `app/guest.tsx`, a `"use client"` module with the same contents as the Vite builder's guest module: the renderer's
     guest runtime, the project's components, stylesheets, icon sets and decorators' modules.

   It has to be inside the project: Turbopack compiles nothing outside its root, and panics on an app folder under
   `node_modules` (tried in the spike). `.next/` is in every Next.js project's `.gitignore`, and the guest app's own
   build goes in `.next/parity/.next/`, so it never meets the project's own `next dev`, whose lock and output are in
   `.next/dev/`.

3. **A guest module from Turbopack's output.** Parity imports the guest as an ES module, and Turbopack writes none: its
   browser output is chunks that register with its runtime, and its page starts Next's router, which takes over the
   document. So the builder serves its own `/__parity/guest.mjs`, which:
   - reads the page Next renders for the guest app: the guest module's id and chunks, from the page's React Server
     Components payload, and the runtime chunk and stylesheets from its tags;
   - loads Turbopack's runtime with its start-up entries taken out, so Next's router never starts, then the page's
     chunks as scripts;
   - asks the runtime for the guest module by its id, and exports its guest as the default;
   - fetches the page's CSS through the builder's server, which adds the CORS header Next's doesn't, and passes it as
     the guest's `css`.

   The spike did this from another origin into a shadow root. The first page took 1.6 seconds to compile on
   `legislation-web` with one component; Next's server started in 1 to 3 seconds.

The extension uses only the public extension API, as Vite's does. Its builder provider's `detect()` and `styles()` run
in the extension host, and its builder entry module runs in the builder process.

## What the canvas can draw

| Feature            | First version | How                                                                                            |
| ------------------ | ------------- | ---------------------------------------------------------------------------------------------- |
| Client components  | Yes           | Compiled by Turbopack as in the app                                                            |
| Server components  | Some          | Compiled as client code under the guest: one that's synchronous and uses no server API draws   |
| `next/image`       | Yes           | Served by the builder's Next, at its own address through `images.path`, with the app's config  |
| `next/font`        | Yes           | Next compiles each font's class and `@font-face` into the CSS; font files load from the server |
| CSS modules        | Yes           | Next compiles them; the classes and their CSS come together                                    |
| Tailwind           | Yes           | Next runs the project's PostCSS config, v3 or v4                                               |
| vanilla-extract    | Yes           | The project's `turbopack.rules` apply, since its config is loaded as Next loads it             |
| `next/link`, hooks | No            | `useRouter` and `usePathname` need Next's router context, which only the router's page sets    |

A server component that's `async`, or that reads `next/headers`, a database or `server-only` code, shows its error in
its frame, as a component whose module doesn't load does today.

`styles()` answers with the global stylesheets the root layout (`app/layout`, or `src/app/layout`) imports, or for the
Pages Router `pages/_app`, following the project's own imports from there until it reaches stylesheets, as the Vite
builder's `styles()` follows the app's entry. A font that the root layout puts on `<html>` as a CSS variable isn't
drawn, since the guest doesn't render the layout.

## Out of scope at first

- **Redrawing after a code change.** The Vite builder re-imports the modules a change touches. Turbopack's updates
  arrive through its own HMR stream instead, which the runtime the guest loads already knows how to apply, so that comes
  second, as its own issue. Until then the builder has no `codeChanges`, and reopening the project redraws.
- **Server components rendered on the server**, server actions, route handlers and middleware. Drawing an async server
  component would mean rendering it through Next and reading its payload in the guest: a follow-up once the client side
  works.
- **Next's router context**, for `next/link` and `next/navigation`'s hooks: a decorator that provides a still router,
  later.
- **Routes**, which the router-neutral work (PAR-1132) and the Next.js routes extension cover.
- **webpack**, which the webpack builder covers.
- **Next.js 15 and older.** Next.js 16 is the version tested; 15 opens with the "untested version" note.

## Detecting a Turbopack project

`detect()` asks the project's own Next:

- **Found** when `next` is installed in the project's `node_modules` (or a folder above it) and the dev script runs
  Turbopack. Next.js 16 runs Turbopack unless the script passes `--webpack`; 15 runs it only with `--turbopack` or
  `--turbo`. A project with no dev script that runs `next dev` counts as the default. The script is read with the same
  helpers the Vite builder uses for `vite --config`.
- **The version** is the installed `next`'s; **the config** is the first of Next's own config file names (`CONFIG_FILES`
  in `next/constants`) that's there, or none, since Next needs no config file.
- **Not found** says why: no `next` installed, or the dev script runs webpack, which the webpack builder then claims.

The manifest watches `next.config.js`, `.mjs`, `.ts` and `.mts`, and `package.json`, whose dev script decides between
the two builders.

## What a webpack builder reuses

The Next.js plumbing goes in a package of its own, `packages/next-builders`, which both extensions depend on. It loads
the project's `next`, writes files and runs a server, so it joins the extensions in `vite.config.ts`'s list of edge
packages, where Node belongs. Inside it, the logic is kept apart from the effects, so most of it is tested on plain
data:

- **Data in, data out:** which bundler a dev script runs; the guest app's files, as paths and text, including the config
  wrapper, for a bundler; the guest module's id, chunks and stylesheets, read from a page's HTML; the global
  stylesheets, from the imports a walk from the root layout or `_app` found, through the module the Rspack builder
  (PAR-1147) is extracting from the Vite builder's `styles()`.
- **Effects, kept thin:** loading the project's `next`, with its version and config file name; writing the guest app's
  files; starting Next's server with the bundler chosen, with the builder's own routes in front of it (`/__parity/*`,
  CORS); and reading the files the import walk follows.

What differs is the guest module loader: Turbopack's runtime here, and webpack's (`webpackChunk_N_E` and its require)
there. Both drive their bundler's runtime the same way: load its chunks without starting Next's router, then require the
guest module by id.

The guest module's writer, now in the Vite extension's `builder.ts`, moves to a shared module, with how a stylesheet is
imported as its one difference: `?inline` for Vite, a plain import for Next, whose CSS the page collects.

## Testing

- Unit tests for each part of `packages/next-builders` on files in a temporary folder: the dev script's bundler, the
  guest app's files, reading a recorded guest page, `styles()` on App Router and Pages Router layouts.
- An end-to-end test of the Turbopack builder that starts it on an example app and imports its guest. The app is the
  example matrix's app D: Next.js 16's App Router on Turbopack, React 19, Tailwind v4, Headless UI, Heroicons, a
  Recharts chart, Storybook, TypeScript and pnpm, isolated like the repository's other example projects. It also gets a
  CSS module, a `next/font` font and a `next/image`, and nested layouts, a `(group)`, `[id]` and `[...slug]` routes, and
  `loading` and `not-found` files for the Next.js routes extension. `next` is the example app's dependency, not the
  extension's.
- `legislation-web` by hand, with what it draws reported on PAR-1149.

## Open questions

- Turbopack's runtime format isn't a public API. The loader relies on its chunk registration and its entry-only
  registration, and on the client reference in the page's payload. A test on each Next.js version Parity supports
  catches a change.
- The guest app is rewritten whenever the components change, which Turbopack compiles again on its next request. Lazy
  components could instead be dynamic imports in a fixed guest app, as Vite's guest has them.
