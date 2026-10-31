import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { addCommand, cutoff, detectPackageManager, detectProject } from "./detect.ts"
import { findLockfiles } from "./lockfile.ts"

let root: string

/** Writes a fixture folder: each key a path under the root, each value its JSON or text. */
async function fixture(files: Record<string, unknown>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), typeof content === "string" ? content : JSON.stringify(content))
  }
}

/** An installed package, as its own package.json describes it. */
const installed = (name: string, version: string) => ({ [`node_modules/${name}/package.json`]: { name, version } })

const today = new Date("2026-10-28T12:00:00Z")

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "parity-detect-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("detectPackageManager", () => {
  it("reads pnpm from its lockfile", async () => {
    await fixture({ "package.json": {}, "pnpm-lock.yaml": "lockfileVersion: '9.0'" })
    expect(await detectPackageManager(root)).toEqual({
      id: "pnpm",
      name: "pnpm",
      agent: "pnpm",
      from: "pnpm-lock.yaml",
      lockfile: "pnpm-lock.yaml",
      summary: "pnpm from pnpm-lock.yaml"
    })
  })

  it("tells Yarn Berry from Yarn classic by the packageManager field", async () => {
    await fixture({ "package.json": { packageManager: "yarn@4.5.0" }, "yarn.lock": "" })
    expect(await detectPackageManager(root)).toMatchObject({ agent: "yarn@berry", name: "Yarn Berry" })

    await fixture({ "package.json": {} })
    expect(await detectPackageManager(root)).toMatchObject({ agent: "yarn", name: "Yarn", from: "yarn.lock" })
  })

  it("reads bun and npm lockfiles", async () => {
    await fixture({ "package.json": {}, "bun.lock": "{}" })
    expect(await detectPackageManager(root)).toMatchObject({ agent: "bun", from: "bun.lock" })

    await rm(join(root, "bun.lock"))
    await fixture({ "package-lock.json": {} })
    expect(await detectPackageManager(root)).toMatchObject({ agent: "npm", from: "package-lock.json" })
  })

  it("reads the packageManager field when there's no lockfile", async () => {
    await fixture({ "package.json": { packageManager: "pnpm@9.1.0+sha512.abc" } })
    expect(await detectPackageManager(root)).toMatchObject({
      agent: "pnpm",
      version: "9.1.0",
      from: "package.json",
      summary: "pnpm 9.1.0 from packageManager in package.json"
    })
  })

  it("reads devEngines.packageManager", async () => {
    await fixture({ "package.json": { devEngines: { packageManager: { name: "bun", version: "^1.2.0" } } } })
    expect(await detectPackageManager(root)).toMatchObject({
      agent: "bun",
      summary: "Bun 1.2.0 from devEngines.packageManager in package.json"
    })
  })

  it("reads npm-shrinkwrap.json, and names the first lockfile when a folder has several", async () => {
    await fixture({ "package.json": {}, "npm-shrinkwrap.json": {} })
    expect(await detectPackageManager(root)).toMatchObject({ agent: "npm", from: "npm-shrinkwrap.json" })

    await fixture({ "package-lock.json": {} })
    expect(await detectPackageManager(root)).toMatchObject({ from: "package-lock.json", lockfile: "package-lock.json" })
    expect(await findLockfiles(root)).toEqual(["package-lock.json", "npm-shrinkwrap.json"])
  })

  it("names the nearest lockfile even when a packageManager field says first", async () => {
    await fixture({ "pnpm-lock.yaml": "", "package.json": {}, "app/package.json": { packageManager: "pnpm@9.1.0" } })
    expect(await detectPackageManager(join(root, "app"))).toMatchObject({
      from: "package.json",
      lockfile: "../pnpm-lock.yaml"
    })
  })

  it("names the project's own lockfile over a workspace's above it", async () => {
    await fixture({ "pnpm-lock.yaml": "", "package.json": {}, "app/package.json": {}, "app/package-lock.json": {} })
    expect(await detectPackageManager(join(root, "app"))).toMatchObject({ agent: "npm", lockfile: "package-lock.json" })
    expect(await findLockfiles(join(root, "app"))).toEqual(["package-lock.json"])
  })

  it("walks up to a workspace's lockfile", async () => {
    await fixture({ "pnpm-lock.yaml": "", "package.json": {}, "packages/app/package.json": {} })
    expect(await detectPackageManager(join(root, "packages/app"))).toMatchObject({
      agent: "pnpm",
      from: "../../pnpm-lock.yaml",
      lockfile: "../../pnpm-lock.yaml"
    })
  })

  it("falls back to npm and says what it looked for", async () => {
    await fixture({ "package.json": {} })
    const found = await detectPackageManager(root)
    expect(found.agent).toBe("npm")
    expect(found.summary).toContain("no folder from here up has a lockfile")
  })
})

describe("addCommand", () => {
  it("builds each package manager's install command from its table", () => {
    expect(addCommand("pnpm", ["lucide-react"])).toEqual({ command: "pnpm", args: ["add", "lucide-react"] })
    expect(addCommand("yarn@berry", ["lucide-react"])).toEqual({ command: "yarn", args: ["add", "lucide-react"] })
    expect(addCommand("npm", ["lucide-react"])).toEqual({ command: "npm", args: ["i", "lucide-react"] })
    expect(addCommand("deno", ["lucide-react"])).toEqual({ command: "deno", args: ["add", "npm:lucide-react"] })
  })
})

describe("cutoff", () => {
  const vite = {
    majors: [
      [5, "2023-11-16"],
      [6, "2024-11-26"],
      [7, "2025-06-24"],
      [8, "2026-03-12"]
    ] as [number, string][]
  }

  it("drops a major two years after its own release", () => {
    expect(cutoff(vite, "5.4.0", today)).toEqual({ status: "dropped" })
    expect(cutoff(vite, "6.4.1", today)).toEqual({ status: "supported", drops: "2026-11-26" })
    expect(cutoff(vite, "6.4.1", new Date("2026-11-26T00:00:00Z"))).toEqual({ status: "dropped" })
    expect(cutoff(vite, "4.5.0", today)).toEqual({ status: "dropped" })
  })

  it("never drops a tool's newest major, and marks a major it hasn't seen as newer", () => {
    expect(cutoff(vite, "8.3.5", new Date("2031-01-01T00:00:00Z"))).toEqual({ status: "supported" })
    expect(cutoff(vite, "9.0.0-beta.1", today)).toEqual({ status: "newer" })
  })
})

describe("detectProject", () => {
  it("reads installed versions from each package's own package.json, with the builder's config", async () => {
    const pkg = { dependencies: { react: "^19.1.0" }, devDependencies: { vite: "^8.0.0", tailwindcss: "^4.0.0" } }
    await fixture({
      "package.json": pkg,
      "pnpm-lock.yaml": "",
      ...installed("react", "19.2.0"),
      ...installed("vite", "8.3.5"),
      ...installed("tailwindcss", "4.3.3")
    })
    const detection = await detectProject(
      root,
      pkg,
      { id: "vite", detection: { found: true, version: "8.3.5", config: "vite.config.cts", summary: "" } },
      today
    )
    expect(detection.packageManager.agent).toBe("pnpm")
    expect(detection.tools.map((tool) => tool.summary)).toEqual([
      "React 19.2.0 from node_modules/react",
      "Vite 8.3.5 from node_modules/vite, config vite.config.cts",
      "Tailwind CSS 4.3.3 from node_modules/tailwindcss"
    ])
    expect(detection.tools.every((tool) => tool.status === "supported")).toBe(true)
    expect(detection.notice).toBeUndefined()
  })

  it("notes untested versions quietly, in one sentence", async () => {
    const pkg = {
      dependencies: { react: "^18.2.0" },
      devDependencies: { vite: "^5.0.0", tailwindcss: "^3.4.0", storybook: "^8.0.0" }
    }
    await fixture({
      "package.json": pkg,
      ...installed("react", "18.3.1"),
      ...installed("vite", "5.4.11"),
      ...installed("tailwindcss", "3.4.17"),
      ...installed("storybook", "8.6.14")
    })
    const detection = await detectProject(root, pkg, undefined, today)
    expect(detection.tools.map((tool) => [tool.id, tool.status])).toEqual([
      ["react", "dropped"],
      ["vite", "dropped"],
      ["tailwind", "dropped"],
      ["storybook", "dropped"]
    ])
    expect(detection.tools.map((tool) => tool.summary)).toEqual([
      "React 18.3.1 from node_modules/react; untested, Parity tests React 19",
      "Vite 5.4.11 from node_modules/vite; untested, Parity tests Vite 6 or later",
      "Tailwind CSS 3.4.17 from node_modules/tailwindcss; untested, Parity tests Tailwind CSS v4",
      "Storybook 8.6.14 from node_modules/storybook; untested, Parity tests Storybook 9 or later"
    ])
    expect(detection.notice).toBe(
      "Not tested with Parity: React 18.3.1, Vite 5.4.11, Tailwind CSS 3.4.17 and Storybook 8.6.14. Nothing is blocked; Parity tests versions from the last two years, and each tool's newest."
    )
  })

  it("says until when a tested version stays tested", async () => {
    const pkg = { devDependencies: { vite: "^6.0.0", storybook: "^9.0.0" } }
    await fixture({ "package.json": pkg, ...installed("vite", "6.4.1"), ...installed("storybook", "9.1.2") })
    const detection = await detectProject(root, pkg, undefined, today)
    expect(detection.tools).toMatchObject([
      {
        id: "vite",
        status: "supported",
        drops: "2026-11-26",
        summary: expect.stringContaining("tested until November 2026")
      },
      { id: "storybook", status: "supported", drops: "2027-05-28" }
    ])
  })

  it("finds Storybook's main config, in the folder its script names", async () => {
    const pkg = { devDependencies: { storybook: "^10.0.0" } }
    await fixture({ "package.json": pkg, ...installed("storybook", "10.6.5"), ".storybook/main.mts": "" })
    expect((await detectProject(root, pkg, undefined, today)).tools[0]).toMatchObject({
      config: ".storybook/main.mts",
      summary: "Storybook 10.6.5 from node_modules/storybook, config .storybook/main.mts"
    })

    const scripted = { ...pkg, scripts: { storybook: "storybook dev -p 6006 -c config/sb" } }
    await fixture({ "config/sb/main.cjs": "" })
    expect((await detectProject(root, scripted, undefined, today)).tools[0]).toMatchObject({
      config: "config/sb/main.cjs"
    })
  })

  it("reads Storybook 6 from its framework package", async () => {
    const pkg = { devDependencies: { "@storybook/react": "^6.5.0" } }
    await fixture({ "package.json": pkg, ...installed("@storybook/react", "6.5.16") })
    const [storybook] = (await detectProject(root, pkg, undefined, today)).tools
    expect(storybook).toMatchObject({ id: "storybook", version: "6.5.16", status: "dropped" })
  })

  it("finds packages hoisted to a workspace root", async () => {
    const pkg = { dependencies: { react: "^19.0.0" } }
    await fixture({ "packages/app/package.json": pkg, ...installed("react", "19.2.0") })
    const [react] = (await detectProject(join(root, "packages/app"), pkg, undefined, today)).tools
    expect(react).toMatchObject({ version: "19.2.0", from: "../../node_modules/react" })
  })

  it("reports declared packages that aren't installed, and leaves out tools the project doesn't use", async () => {
    const pkg = { dependencies: { react: "^19.1.0" } }
    await fixture({ "package.json": pkg })
    const detection = await detectProject(root, pkg, undefined, today)
    expect(detection.tools).toEqual([
      {
        id: "react",
        name: "React",
        declared: "^19.1.0",
        status: "missing",
        summary: "React ^19.1.0 is in package.json but isn't installed: install the project's packages first"
      }
    ])
  })

  it("marks a major newer than any Parity knows", async () => {
    const pkg = { dependencies: { react: "^20.0.0" } }
    await fixture({ "package.json": pkg, ...installed("react", "20.0.0") })
    const [react] = (await detectProject(root, pkg, undefined, today)).tools
    expect(react).toMatchObject({ status: "newer" })
  })
})
