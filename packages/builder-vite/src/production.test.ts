import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { BuilderSession, BuilderStartOptions, RendererAdapter } from "@parity-app/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { developmentStandIn, productionDependencies, viteBuilder } from "./index.ts"

const viteFolder = dirname(createRequire(import.meta.url).resolve("vite/package.json"))
/** What renderer-react serves in place of `react/jsx-dev-runtime`. */
const standIns = { "/jsx-dev-runtime": 'export { Fragment, jsx as jsxDEV } from "$base/jsx-runtime"' }

let root: string
let options: BuilderStartOptions
let session: BuilderSession | undefined

beforeEach(async () => {
  // The real path: Windows runners' tmpdir can use a short (8.3) name, which crashes libuv's watcher.
  root = await realpath(await mkdtemp(join(tmpdir(), "parity-production-")))
  // A stand-in for React, which says which build it is, as React picks its build by `process.env.NODE_ENV`.
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", type: "module" }),
    "guest.js": "export function createGuest(init) { return init }\n",
    "src/button.js": [
      'import { jsxDEV } from "react/jsx-dev-runtime"',
      'export const Button = () => jsxDEV("button", { children: "Save" }, undefined, false, {}, undefined)',
      ""
    ].join("\n"),
    "src/mode.js": "export const mode = process.env.NODE_ENV\n",
    "src/badge.js": 'export { Badge } from "devlib"\n',
    // A package shipped with its JSX compiled for development, which the optimizer bundles.
    "node_modules/devlib/package.json": JSON.stringify({ name: "devlib", version: "1.0.0", main: "index.js" }),
    "node_modules/devlib/index.js": [
      'const { jsxDEV } = require("react/jsx-dev-runtime")',
      'const nested = require("nested/jsx-dev-runtime")',
      'exports.Badge = () => jsxDEV("span", { children: "New" }, undefined, false, {}, undefined)',
      "exports.nested = nested.jsxDEV",
      ""
    ].join("\n"),
    // A JSX runtime installed only below the package importing it, as a package can bring its own copy.
    "node_modules/devlib/node_modules/nested/package.json": JSON.stringify({ name: "nested", version: "1.0.0" }),
    "node_modules/devlib/node_modules/nested/jsx-runtime.js": [
      'exports.Fragment = "fragment"',
      'exports.jsx = () => "the nested runtime"',
      ""
    ].join("\n"),
    "node_modules/devlib/node_modules/nested/jsx-dev-runtime.js": "exports.jsxDEV = undefined\n",
    "node_modules/react/package.json": JSON.stringify({ name: "react", version: "19.0.0", main: "index.js" }),
    "node_modules/react/index.js": "exports.build = process.env.NODE_ENV\n",
    "node_modules/react/jsx-runtime.js": [
      'exports.Fragment = "fragment"',
      "exports.jsx = (type, props) => ({ type, props, build: process.env.NODE_ENV })",
      ""
    ].join("\n"),
    // As React's production build has it: no `jsxDEV`.
    "node_modules/react/jsx-dev-runtime.js": [
      'exports.Fragment = "fragment"',
      'exports.jsxDEV = process.env.NODE_ENV === "production" ? undefined : (type, props) => ({ type, props })',
      'exports.runtime = "the development runtime"',
      ""
    ].join("\n")
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  await symlink(viteFolder, join(root, "node_modules", "vite"), "junction")
  options = {
    root,
    config: {
      styles: [],
      components: {
        Button: { path: "src/button.js", export: "Button" },
        Mode: { path: "src/mode.js", export: "mode" },
        Badge: { path: "src/badge.js", export: "Badge" }
      },
      documents: [],
      libraries: []
    },
    renderer: {
      runtimePackages: ["react"],
      runtimeImports: ["react", "react/jsx-runtime", "devlib"],
      developmentStandIns: standIns
    } as unknown as RendererAdapter,
    rendererGuestPath: join(root, "guest.js"),
    allowedOrigins: []
  }
})

afterEach(async () => {
  await session?.close()
  session = undefined
  await rm(root, { recursive: true, force: true })
})

/** Fetches a module the builder serves, as the canvas would. */
async function served(url: string): Promise<string> {
  const response = await fetch(new URL(url, session!.guestUrl))
  expect(response.status).toBe(200)
  return response.text()
}

/** The URLs a served module imports from. */
function importsOf(code: string): string[] {
  return [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!)
}

describe("frames on dependencies' production builds", () => {
  it("prebundles dependencies as production, and serves the project's own modules as development", async () => {
    session = await viteBuilder.start(options)
    await served(session.guestUrl)
    // As the process's environment says: `development` in the app, `test` here.
    expect(await served("/src/mode.js")).toContain(`"${process.env.NODE_ENV ?? "development"}"`)
    const button = await served("/src/button.js")
    const standIn = importsOf(button).find((url) => url.includes("stand-in"))
    expect(standIn).toBe("/@id/__x00__virtual:canvas/stand-in/react/jsx-dev-runtime")
    const runtime = importsOf(await served(standIn!)).find((url) => url.includes("react_jsx-runtime"))
    expect(runtime).toBeDefined()
    // With what it imports, as the optimizer splits what dependencies share into chunks.
    const entry = await served(runtime!)
    const bundled = [entry, ...(await Promise.all(importsOf(entry).map(served)))].join("\n")
    expect(bundled).toContain('"production"')
    expect(bundled).not.toContain(`"${process.env.NODE_ENV ?? "development"}"`)
  }, 30_000)

  it("gives a prebundled dependency the stand-in too", async () => {
    session = await viteBuilder.start(options)
    await served(session.guestUrl)
    const devlib = importsOf(await served("/src/badge.js")).find((url) => url.includes("devlib"))
    expect(devlib).toBeDefined()
    const entry = await served(devlib!)
    const bundled = [entry, ...(await Promise.all(importsOf(entry).map(served)))].join("\n")
    expect(bundled).not.toContain("the development runtime")
    // What the stand-in imports is the copy below the package, not one from the project's root.
    expect(bundled).toContain("the nested runtime")
  }, 30_000)
})

describe("developmentStandIn", () => {
  it("serves a renderer's module in place of a bare specifier ending as it names, by that package", () => {
    expect(developmentStandIn("react/jsx-dev-runtime", standIns)).toBe(
      'export { Fragment, jsx as jsxDEV } from "react/jsx-runtime"'
    )
    expect(developmentStandIn("@emotion/react/jsx-dev-runtime", standIns)).toBe(
      'export { Fragment, jsx as jsxDEV } from "@emotion/react/jsx-runtime"'
    )
  })

  it("leaves other modules, files and virtual modules alone", () => {
    expect(developmentStandIn("react/jsx-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("./jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("/src/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("\0virtual:canvas/stand-in/react/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("/jsx-dev-runtime", standIns)).toBeUndefined()
    expect(developmentStandIn("react/jsx-dev-runtime")).toBeUndefined()
  })
})

describe("productionDependencies", () => {
  it("sets the optimizer's own define and stand-ins: Rolldown's from Vite 8, esbuild's before", () => {
    const define = { "process.env.NODE_ENV": '"production"' }
    const plugins = [{ name: "canvas:stand-ins" }]
    expect(productionDependencies({ version: "8.3.5", rolldownVersion: "1.0.0" }, root, standIns)).toMatchObject({
      rolldownOptions: { transform: { define }, plugins }
    })
    expect(productionDependencies({ version: "7.1.0" }, root, standIns)).toMatchObject({
      esbuildOptions: { define, plugins }
    })
  })

  it("serves the stand-in through esbuild's plugin before Vite 8", () => {
    const { esbuildOptions } = productionDependencies({ version: "7.1.0" }, root, standIns) as {
      esbuildOptions: { plugins: { setup(build: unknown): void }[] }
    }
    let resolve: { filter: RegExp; to(args: { path: string; importer: string }): unknown } | undefined
    let load: ((args: { path: string }) => unknown) | undefined
    esbuildOptions.plugins[0]!.setup({
      onResolve: (options: { filter: RegExp }, to: (args: { path: string; importer: string }) => unknown) =>
        (resolve = { ...options, to }),
      onLoad: (_options: unknown, made: (args: { path: string }) => unknown) => (load = made)
    })
    expect(resolve!.filter.test("react/jsx-dev-runtime")).toBe(true)
    expect(resolve!.filter.test("react/jsx-runtime")).toBe(false)
    // Beside the module importing it, so what it imports resolves from there.
    const importer = join(root, "node_modules", "devlib", "index.js")
    const beside = join(root, "node_modules", "devlib", "%40emotion%2Freact%2Fjsx-dev-runtime.canvas-stand-in.js")
    expect(resolve!.to({ path: "@emotion/react/jsx-dev-runtime", importer })).toEqual({
      path: beside,
      namespace: "canvas-stand-in"
    })
    expect(load!({ path: beside })).toEqual({
      contents: 'export { Fragment, jsx as jsxDEV } from "@emotion/react/jsx-runtime"',
      loader: "js",
      resolveDir: dirname(importer)
    })
  })
})
