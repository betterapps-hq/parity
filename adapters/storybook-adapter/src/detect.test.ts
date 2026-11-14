import type { DetectContext, PackageManifest } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { detectStorybook } from "./detect.ts"

/** A project with this package.json and these files, by their path from the root. */
const project = (pkg: PackageManifest, files: string[] = []): DetectContext => ({
  root: "/app",
  pkg,
  read: (path) => Promise.resolve(files.includes(path) ? "" : undefined)
})

describe("detectStorybook", () => {
  it("finds Storybook's main config, in the folder its script names", async () => {
    const pkg = { devDependencies: { storybook: "^10.0.0" } }

    expect(await detectStorybook(project(pkg, [".storybook/main.mts"]))).toEqual({
      found: true,
      config: ".storybook/main.mts",
      summary: "storybook in package.json, config .storybook/main.mts"
    })

    const scripted = { ...pkg, scripts: { storybook: "storybook dev -p 6006 -c ./config/sb/" } }
    expect(await detectStorybook(project(scripted, ["config/sb/main.cjs"]))).toMatchObject({
      config: "config/sb/main.cjs"
    })
  })

  it("finds Storybook 6 by its framework package, without a config", async () => {
    expect(await detectStorybook(project({ devDependencies: { "@storybook/react": "^6.5.0" } }))).toEqual({
      found: true,
      summary: "@storybook/react in package.json, without a .storybook/main config"
    })
  })

  it("isn't found without a Storybook package", async () => {
    expect(
      await detectStorybook(project({ devDependencies: { vite: "^8.0.0" } }, [".storybook/main.ts"]))
    ).toMatchObject({
      found: false
    })
  })
})
