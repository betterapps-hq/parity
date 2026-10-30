import { defineConfig } from "vite-plus"

/**
 * `vp pack` builds the CLI that npm publishes as @parity-app/cli: the `parity` command and the client agents import,
 * with Parity's private packages bundled in, since they're never published. The packages npm installs beside it are its
 * `dependencies`; any other package that would be bundled fails the build, so it gets declared instead. The registry's
 * files ship beside the bundle, where @parity/registry looks for them, with the floors `parity check` reads.
 */
export default defineConfig({
  pack: {
    entry: { bin: "src/bin.ts", index: "src/client.ts" },
    format: "esm",
    platform: "node",
    target: "node24",
    dts: { entry: "src/client.ts" },
    deps: {
      alwaysBundle: [/^@parity\//],
      onlyBundle: [],
      dts: { alwaysBundle: [/^@parity\//] }
    },
    copy: [
      { from: "../registry/libraries/*", to: "dist/libraries" },
      { from: "../registry/in-app.json", to: "dist" }
    ]
  }
})
