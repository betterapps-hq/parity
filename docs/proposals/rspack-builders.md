# Proposal: Rspack and Rsbuild builders

Status: proposed on 2026-11-15 for PAR-1147 (Rspack) and PAR-1148 (Rsbuild). Once it's approved, Rspack gets built
first, then Rsbuild. Both share their code with the webpack builder.

## In one line

Rspack and Rsbuild projects build and draw their components with the project's own compiler and config, the way Vite
projects do. Two thin extensions sit on one webpack-compatible core, shared with the webpack builder, and the canvas's
builder contract doesn't change.

## What Vite does today, and what's Vite-specific

A builder's entry module (`BuilderAdapter.start`) gives the canvas a `guestUrl`: an ES module whose default export is
the renderer's `Guest`. Four things in that contract lean on how Vite serves code:

1. **The guest is one URL the page imports.** Its source (`guestModule` in `extension-vite/src/builder.ts`) imports the
   renderer's guest runtime, the project's components, icon sets and decorator modules, and each stylesheet as `?inline`
   text.
2. **A changed component loads from `/<path>?t=<stamp>`.** The React guest imports that address itself
   (`component-registry.ts`). Vite compiles that module fresh, along with everything it imports that changed, and leaves
   the rest alone, so React and shared contexts keep their identity.
3. **Restyled guests come from `restyledGuestUrl(stamp)`:** the same guest at a new address, which imports the
   stylesheets as they are now.
4. **`codeChanges` and `loadedFiles`** read Vite's module graph.

A webpack-shaped bundler serves bundles, not modules by path, so it needs its own answer to each of these. The answers
below keep the contract as it is, so the canvas and the renderer don't change.

## Detection

Each extension's `detect` asks the project's own copy of its tool, as Vite's does. The manifest's `watches` names the
config files whose coming or going detects the project again.

| Extension | Found when                                                                                                                             | Config files                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Rsbuild   | `@rsbuild/core` resolves from the project's folder (or one above it) and its `loadConfig` finds a config                               | `rsbuild.config.{ts,mts,cts,js,mjs,cjs}`, or the one the dev script names (`-c`) |
| Rspack    | `@rspack/core` resolves from the project's folder, a `rspack.config.*` is there (or the dev script names one), and Rsbuild isn't found | `rspack.config.{ts,mts,cts,js,mjs,cjs}`, or the one `rspack dev -c` names        |

An Rsbuild project always has `@rspack/core` installed, as Rsbuild's own dependency, but no `rspack.config.*`, so the
two don't both claim a project. Where a project has both config files, Rsbuild wins, since `rsbuild dev` is what its
scripts run. The version is the tool's own: `@rsbuild/core`'s `version`, or `rspack.rspackVersion`. Peer dependencies in
each manifest give the supported versions: Rspack `^1.4.0 || ^2.0.0`, Rsbuild `^1.4.0 || ^2.0.0`.

## Driving the project's own compiler

Neither extension depends on its tool at runtime. Each loads the project's copy the way `loadProjectVite` does: from
`node_modules` in the project's folder or one above, never through `NODE_PATH`.

- **Rspack:** the config is loaded the way `@rspack/cli` loads it. A `.ts` config goes through the project's own loader
  if `rspack.config.ts` needs one; Rspack 2's CLI uses Node's type stripping, and so does this. A config that exports a
  function is called with `(env, argv)` for `serve` in development, and an array takes its first `web` target. Then
  `rspack(config)` makes the compiler.
- **Rsbuild:** `loadConfig({ cwd })` and `createRsbuild({ cwd, rsbuildConfig })`, then a plugin of Parity's own uses
  `modifyRspackConfig` to make the same changes as for Rspack (below). `rsbuild.createCompiler()` gives a compiler from
  the Rspack that Rsbuild bundles. So everything after the config is the Rspack path, and the plugins the project
  configured (React, Sass, its own) all run as they do for `rsbuild dev`.

Then the shared core changes the config, the same way for webpack, Rspack and Rsbuild:

- **The guest entry, in place of the app's.** It's a virtual module (Rspack's `VirtualModulesPlugin`, or a loader on a
  file in the cache folder for webpack). It imports the same things Vite's guest module does, and the code that writes
  it moves out of `extension-vite` so both builders share it. The only difference is how a stylesheet is imported:
  plainly, so the project's own CSS rules compile it.
- **Development mode, no dev server, no HMR client, no HTML plugins.** `process.env.NODE_ENV` is defined as
  `production`, so React runs its production build, as Vite's production dependencies do. Unlike Vite, the define
  reaches the project's own modules too, which then take their production branches. That's acceptable for drawing
  components, and it's what keeps React from recording a stack for every element.
- **Classic script output with one runtime chunk,** written to `node_modules/.cache/parity-<tool>/`. That's a folder of
  its own, so the project's own dev server, often running alongside, keeps its cache. Dynamic imports become chunks the
  runtime loads by JSONP, which webpack and Rspack support in every version, along with their hot-update runtime.
- **CSS extracted into two files,** `package-styles.css` and `styles.css`, in the order the guest imports them. Rspack
  uses its built-in `CssExtractRspackPlugin`, and webpack uses the project's `mini-css-extract-plugin`. Where the
  project's CSS rule uses `style-loader`, the core swaps in the extract loader. Rspack's native CSS (`type: "css"`)
  emits files itself.
- **An element-sources loader** that tags the project's JSX with file, line and column (PAR-167), as Vite's
  `elementSources` plugin does, using the same `tagElementSources` from `@parity-app/code`.
- **`resolve.alias`** for the renderer's runtime packages, to dedupe them as Vite's `resolve.dedupe` does, and the
  renderer's development stand-ins as a resolver plugin.

The compiler runs in watch mode. A small `node:http` server on 127.0.0.1 serves the output folder, with CORS for the
canvas's origins. It needs no dependency of its own: no webpack-dev-server, no memory file system.

## The guest module

`guestUrl` is a small ES module that the server writes, not part of the bundle:

```js
// /guest.js: loads the bundle once per page, then makes the guest.
const { init, createGuest } = await globalThis.__parityLoad("/main.js")
const css = await fetch(new URL("/styles.css", import.meta.url)).then((r) => r.text())
const packageCss = await fetch(new URL("/package-styles.css", import.meta.url)).then((r) => r.text())
export default createGuest({ ...init, css, packageCss })
```

`__parityLoad` adds the runtime chunk and the entry as script tags, then waits for the entry to hand over what it
exports. The guest entry exports `init` (components, lazy components, icon sets, decorators and token categories, as
Vite's guest gives `createGuest`) and the renderer's `createGuest`. The bundle runs once per page, so there's one module
instance of everything.

- **`restyledGuestUrl(stamp)`** is `/guest.js?styles=<stamp>`. It's a new address, so the page imports it afresh,
  fetches the CSS as the build for that stamp wrote it, and makes a new `Guest` over the same bundle.
- **A changed component, `/<path>?t=<stamp>`,** gets a shim from the server:

  ```js
  const exports = await globalThis.__parityUpdate(3, "./src/components/ui/button.tsx")
  export const Button = exports.Button
  export const buttonVariants = exports.buttonVariants
  ```

  The guest entry accepts hot updates for every module it imports (`import.meta.webpackHot.accept([...])`). So when a
  file changes, the hot-update runtime throws away every module between that file and the component, the component
  included, and keeps the rest. `__parityUpdate` applies the update for that stamp (`module.hot.check(true)`), then
  requires the component's module afresh. That's the semantics of Vite's `?t=`: what changed is new, React and shared
  contexts aren't. The shim's export names come from the compilation's `providedExports` for that module.

- **A component added since the guest loaded** lives in a file the entry didn't import, so the guest entry is written
  again with it. The update that brings it is applied like any other, and the shim requires it the same way.

## `styles()`, `codeChanges` and `loadedFiles`

- **`styles()`** compiles the app's own entries, as the config gives them, with the project's config. It runs once, not
  in watch mode, with output thrown away. Then it walks the compilation's module graph from each entry, the way Vite's
  walks its client graph. The choice of which stylesheets are global moves out of `extension-vite/src/app-styles.ts`
  into a module that takes a list of imports and returns `AppStyles`, so Vite and the webpack family share it: the
  shallowest of the app's own modules that import stylesheets, the ones holding the theme where a page ties with the
  root, and packages' stylesheets by their specifier. `from` lists the modules read on the way, plus the config file.
  Tailwind 4 needs nothing more: its `@import "tailwindcss"` stylesheet is one the app imports, compiled by the
  project's PostCSS rule.
- **`codeChanges`** come from each rebuild: the compiler's `modifiedFiles` and `removedFiles`, and the component files
  that import them, however deep, through the module graph's incoming connections. `styles` is set when a stylesheet is
  among them, so the canvas asks for `restyledGuestUrl`.
- **`loadedFiles(files)`** walks the same graph down from each file's module, leaving packages out. Nothing comes back
  for a file the build hasn't reached yet.

## What's shared with webpack

One package, `@parity-app/builder-webpack-compatible`, takes data and returns data. It's tested without Electron and
with no bundler installed, through a fake compiler shaped like webpack's.

| Shared (the core package)                                                                    | Per tool (each extension)                                                         |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Writing the guest entry and the guest and shim modules                                       | Finding and loading the project's own tool                                        |
| The config changes: entry, output, runtime chunk, CSS extraction, aliases, stand-ins, loader | Loading its config: `rspack.config.*`, `webpack.config.*`, Rsbuild's `loadConfig` |
| The watch loop, the static server, `__parityLoad` and `__parityUpdate`                       | The CSS-extract plugin it ships, or the project's                                 |
| `codeChanges`, `loadedFiles` and the walk for `styles()` from a webpack-shaped module graph  | `detect`, the manifest, the status item                                           |
| Choosing the global stylesheets (moved from `extension-vite`, shared with Vite too)          |                                                                                   |

The webpack builder, under PAR-1087 too, builds on the same package. Next.js on webpack can use it too where Next's own
config gives a webpack config, but Next's server components and its own dev server are its proposal's to settle.

## One extension or two

There are two extensions, `extension-rspack` and `extension-rsbuild`, each a few files over the shared core, because:

- Each names its own tool in Settings, the status bar and `docs/support.md`, with its own version and config file.
- Their detection differs, and a project uses one or the other. A shared extension would have to say which it found
  anyway.
- Rsbuild's part is only `loadConfig`, `createRsbuild` and a `modifyRspackConfig` plugin. After that it hands Rspack's
  compiler to the same code as the Rspack extension.

## Example apps

Andrew pre-approved these, with their dependencies:

- **`examples/rsbuild-tanstack`:** Rsbuild 2, React 19, TanStack Router with code-based routes (`createRootRoute`,
  `createRoute`, no generated route tree), Tailwind 4 through `@tailwindcss/postcss`, and a handful of components in
  `src/components`.
- **`examples/rspack-react`:** plain Rspack 2 with `builtin:swc-loader`, React 19 and plain CSS with custom properties,
  plus a few components.

Each goes through the validation snapshots, which check that components are found, drawn and styled, and gets a row in
`docs/support.md`.

## Questions

1. **Is the classic-script bundle behind a small ES module shim the right shape?** The alternative, ES module output
   (`output.module`), is cleaner on paper. But hot updates with module output are newer in webpack and Rspack, and the
   shim keeps every chunk-loading path one that both tools have shipped for years. Recommended: the shim.
2. **Should the shared core live in a package of its own, or in `extension-rspack` for the webpack extension to
   import?** Recommended: its own package. The webpack extension shouldn't depend on Rspack's, and the guest-entry code
   moving out of `extension-vite` needs a neutral home anyway.
