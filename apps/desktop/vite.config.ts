import { resolve } from "node:path"
import { dependencySourceMaps } from "@parity-app/extension-vite/dependency-maps"
import tailwindcss from "@tailwindcss/vite"
import reactPlugin from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"
import { iconImportsPlugin } from "./scripts/icon-imports.ts"
import { reactBuildConfig, reactProductionMode } from "./scripts/react-build.ts"

/**
 * A second copy of the app, such as the one `pnpm perf` starts, runs on its own port, with its own dependency cache so
 * the two servers never rewrite each other's.
 */
const port = Number(process.env.PARITY_UI_PORT ?? 5310)

/** Serves the code as it was when the server started, so edits made meanwhile can't reload a page being measured. */
const frozen = process.env.PARITY_UI_FROZEN === "1"

/** The canvas UI itself. Customer projects are served by their own builder, not by this config. */
export default defineConfig(({ mode }) => {
  // React's production build when the dev script starts the server in its mode, for `pnpm dev:prod` and `pnpm perf`,
  // and the development build otherwise; see scripts/react-build.ts. Vite keys its prebundled dependencies by the alias
  // and the optimizer's options among the rest, so switching builds bundles them again rather than serving the other's.
  const react = reactBuildConfig(mode === reactProductionMode ? "production" : "development")

  return {
    root: "src/renderer",
    // Settings such as the tldraw license key come from `.env.local` beside this file, for the app and Storybook alike.
    envDir: import.meta.dirname,
    base: "./",
    // Dependencies come without their source maps inlined, which cost the window more memory than their code, and each
    // lucide icon loads on its own rather than every one with the first.
    plugins: lazyPlugins(() => [reactPlugin(react.react), tailwindcss(), dependencySourceMaps(), iconImportsPlugin()]),
    // Loro, for the live room in development (src/renderer/live-room.ts), as the build that carries its WebAssembly
    // inline: the one Vite would pick imports the `.wasm` file as a module, which needs a plugin.
    resolve: {
      alias: [
        ...Object.entries(react.alias).map(([find, replacement]) => ({ find, replacement })),
        { find: /^loro-crdt$/, replacement: "loro-crdt/base64" }
      ]
    },
    // Prebundled dependencies are minified, which halves what the window holds of tldraw and React DOM. Their source
    // maps still lead DevTools to the code as published; only the app's own code is served as written.
    optimizeDeps: { rolldownOptions: { output: { minify: true }, ...react.dependencies } },
    // Unset on the usual port, where Vite keeps its default cache.
    cacheDir: port === 5310 ? undefined : resolve(import.meta.dirname, `node_modules/.vite-${port}`),
    server: {
      port,
      strictPort: true,
      // Unset unless frozen, which leaves Vite's defaults: reloading on edits, and watching for them.
      hmr: frozen ? false : undefined,
      watch: frozen ? null : undefined,
      // Forwarding wraps console.error and warn, so every message would seem to come from Vite's client. Parity tells a
      // project's messages from its own by the script that wrote them.
      forwardConsole: false
    },
    build: {
      outDir: "../../out/renderer",
      emptyOutDir: true,
      // Code and CSS as written, as the dev server serves them, with nothing rewritten for older browsers: the window only
      // ever runs in Electron's Chromium. Storybook builds the same way, as it keeps this one of the build's settings.
      // For Vite's default, older browsers, the CSS minifier rewrote `light-dark()` into variables settled where a color
      // is declared rather than where it's used, so anything with its own color scheme inside the page, such as a light
      // story pane in a dark Storybook, took the page's colors instead.
      target: "esnext",
      // Written for Sentry, without the bundles pointing at them; scripts/build.ts moves them out of what's packaged.
      sourcemap: "hidden",
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/renderer/index.html"),
          render: resolve(import.meta.dirname, "src/renderer/render.html"),
          // Settings' own page, which main shows over the window and which loads no project code (PAR-1090).
          settings: resolve(import.meta.dirname, "src/renderer/settings.html")
        }
      }
    }
  }
})
