import { globSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { defineConfig } from "vite-plus"
import { separateSourceMaps } from "../../scripts/sourcemaps.ts"

const dist = join(import.meta.dirname, "dist")

/**
 * `vp pack` builds the CLI that npm publishes as @parity-app/cli: the `parity` command and the client agents import,
 * with Parity's private packages bundled in, since they're never published. The packages npm installs beside it are its
 * `dependencies`; any other package that would be bundled fails the build, so it gets declared instead. The registry's
 * files ship beside the bundle, where @parity-app/registry looks for them, with the floors `parity check` reads.
 *
 * The bundles get debug IDs and hidden source maps, which move to `sourcemaps/` for cd-npm.yml to upload to Sentry's
 * parity-cli project, so npm's package ships none (PAR-719). `dist/build.json` tells the CLI which release it reports
 * as: the version only for `npm publish`, which runs `prepack`; a pkg.pr.new preview or a local pack is named by its
 * commit.
 */
export default defineConfig({
  pack: {
    entry: { bin: "src/bin.ts", index: "src/client.ts", send: "src/send.ts" },
    format: "esm",
    platform: "node",
    target: "node24",
    sourcemap: "hidden",
    dts: { entry: "src/client.ts" },
    deps: {
      alwaysBundle: [/^@parity\//],
      onlyBundle: [],
      dts: { alwaysBundle: [/^@parity\//] }
    },
    copy: [
      { from: "../registry/libraries/*", to: "dist/libraries" },
      { from: "../registry/in-app.json", to: "dist" }
    ],
    hooks: {
      "build:done": () => {
        const { commit } = separateSourceMaps({
          packageFolder: import.meta.dirname,
          out: dist,
          // Chunks that only re-export get no map, and have nothing to resolve.
          bundles: globSync("*.mjs.map", { cwd: dist }).map((map) => map.slice(0, -".map".length)),
          maps: ["*.mjs.map"]
        })
        const published = process.env.npm_command === "publish"
        writeFileSync(join(dist, "build.json"), JSON.stringify({ published, commit }, null, 2))
      }
    }
  }
})
