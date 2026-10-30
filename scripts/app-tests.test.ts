import { describe, expect, it } from "vite-plus/test"
import { runsInApp } from "./app-tests.ts"

describe("runsInApp", () => {
  it("counts the app, its packages, the example and the workspace's build files", () => {
    const paths = [
      "apps/desktop/src/renderer/canvas/CanvasEditor.tsx",
      "apps/desktop/e2e/selecting.e2e.ts",
      "packages/builder-vite/src/index.ts",
      "examples/shadcn-vite/src/App.tsx",
      "pnpm-lock.yaml",
      "vite.config.ts"
    ]
    expect(paths.filter((path) => runsInApp(path) !== true)).toEqual([])
  })

  it("leaves out docs, unit tests, CI and the change files", () => {
    const paths = [
      "docs/editor.md",
      "apps/desktop/README.md",
      "packages/core/src/served.test.ts",
      ".github/workflows/ci.yml",
      "change/@parity-app-desktop-1.json",
      "scripts/commits.ts",
      "infra/main.tf"
    ]
    expect(paths.filter((path) => runsInApp(path) !== false)).toEqual([])
  })
})
