import { defineConfig } from "vite-plus"

/**
 * The end-to-end tests, which `pnpm test:app` runs against a copy of Parity that global-setup.ts starts. They're kept
 * out of `vp run test`, whose unit tests run without the app. How to run and add them is in docs/editor.md.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ["*.e2e.ts"],
    globalSetup: ["global-setup.ts"],
    // One copy of the app takes every file in turn, as one person at one window would.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    // The app answers in a frame or two, but a busy machine can hold one back a second or more.
    expect: { poll: { timeout: 5000 } },
    // The first file's connection waits for the example's designs to draw.
    hookTimeout: 180_000
  }
})
