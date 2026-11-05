import { resolve } from "node:path"
import { dependencySourceMaps } from "@parity-app/builder-vite/dependency-maps"
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
    resolve: { alias: react.alias },
    // Prebundled dependencies are minified, which halves what the window holds of tldraw and React DOM. Their source
    // maps still lead DevTools to the code as published; only the app's own code is served as written.
    optimizeDeps: { rolldownOptions: { output: { minify: true }, ...react.dependencies } },
    ...(port === 5310 ? {} : { cacheDir: resolve(import.meta.dirname, `node_modules/.vite-${port}`) }),
    server: {
      port,
      strictPort: true,
      ...(frozen ? { hmr: false, watch: null } : {}),
      // Forwarding wraps console.error and warn, so every message would seem to come from Vite's client. Parity tells a
      // project's messages from its own by the script that wrote them.
      forwardConsole: false
    },
    build: {
      outDir: "../../out/renderer",
      emptyOutDir: true,
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "src/renderer/index.html"),
          render: resolve(import.meta.dirname, "src/renderer/render.html")
        }
      }
    }
  }
})
